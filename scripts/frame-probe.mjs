#!/usr/bin/env node
/**
 * Live frame-time probe. Opens the game normally (its own animation-frame loop, adaptive
 * resolution on) in headless Chromium on the real GPU at a Retina-like viewport, sets up a
 * scenario and records for --seconds:
 *
 * - frame intervals from the game's own frame budget (measure_game_performance);
 * - every pixel-ratio change the adaptive resolution makes, with its time;
 * - draw calls and triangles, film quality and graphics tier.
 *
 * Headless frames are not vsync-limited the same way as a visible window, so compare runs
 * with each other on the same machine rather than against a display's refresh rate.
 *
 *   node scripts/frame-probe.mjs --url http://127.0.0.1:5773 --scenarios arrival,passenger
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { chromium } from 'playwright';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const { values: args } = parseArgs({
  options: {
    url: { type: 'string', default: 'http://127.0.0.1:5773' },
    label: { type: 'string', default: 'live' },
    scenarios: { type: 'string', default: 'arrival,passenger,director,cab' },
    seconds: { type: 'string', default: '8' },
    settle: { type: 'string', default: '4' },
    query: { type: 'string', default: '' },
    graphics: { type: 'string', default: 'high' },
    width: { type: 'string', default: '1512' },
    height: { type: 'string', default: '945' },
    scale: { type: 'string', default: '2' },
    profile: { type: 'boolean', default: false },
    // Also count steady-camera flicker in the live loop (reads back a small copy per frame).
    flicker: { type: 'boolean', default: false },
  },
});
const SCENARIOS = {
  director: { place: 'station', view: 'director', weather: 'clear', stopped: true },
  cab: { place: 'station', view: 'cab', weather: 'clear', stopped: true },
  passenger: { place: 'station', view: 'passenger', weather: 'clear', stopped: true },
  follow: { place: 'village', view: 'follow', weather: 'clear', stopped: false },
  arrival: { place: 360, view: 'director', weather: 'clear', stopped: false },
  storm: { place: 'village', view: 'cab', weather: 'storm', stopped: true },
  'passenger-moving': { place: 'village', view: 'passenger', weather: 'clear', stopped: false },
};

function withTimeout(promise, ms, what) {
  let timer;
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(`${what} timed out after ${ms / 1000} s`)), ms);
    }),
  ]).finally(() => clearTimeout(timer));
}

const outDir = join(root, 'artifacts/screenshots/flicker', args.label);
await mkdir(outDir, { recursive: true });
const browser = await chromium.launch({
  headless: true,
  args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'],
});
const results = [];
try {
  for (const name of args.scenarios.split(',')) {
    const scenario = SCENARIOS[name];
    const page = await browser.newPage({
      viewport: { width: Number(args.width), height: Number(args.height) },
      deviceScaleFactor: Number(args.scale),
    });
    page.setDefaultTimeout(120000);
    await page.addInitScript(() => {
      const Native = window.WebSocket;
      window.WebSocket = function (url, protocols) {
        if (String(protocols).includes('vite')) {
          const idle = new EventTarget();
          Object.assign(idle, { readyState: 0, send() {}, close() {} });
          return idle;
        }
        return new Native(url, protocols);
      };
    });
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(message.text());
    });
    await page.goto(`${args.url}/${args.query ? `?${args.query}` : ''}`, {
      waitUntil: 'domcontentloaded',
    });
    await page.waitForFunction(() => window.mapleWorld && window.mapleWebMCP, null, {
      timeout: 90000,
    });
    const cdp = args.profile ? await page.context().newCDPSession(page) : null;
    if (cdp) {
      await cdp.send('Profiler.enable');
      await cdp.send('Profiler.setSamplingInterval', { interval: 1000 });
      // Start once the scene is set up and settled (settle seconds plus a margin).
      setTimeout(
        () => cdp.send('Profiler.start').catch(() => {}),
        (Number(args.settle) + 1) * 1000,
      );
    }
    const result = await withTimeout(
      page.evaluate(
        async ({ scenario, graphics, seconds, settle, flicker }) => {
          const world = window.mapleWorld;
          const wait = (ms) => new Promise((r) => setTimeout(r, ms));
          world.set('pause', false);
          world.set('weather', scenario.weather);
          world.set('location', scenario.place);
          world.set('camera', scenario.view);
          const select = document.getElementById('graphics-quality');
          select.value = graphics;
          select.dispatchEvent(new Event('change'));
          if (scenario.stopped) world.set('drive', { power: 0, brake: 1, speedKmh: 0 });
          else world.set('autopilot', true);
          await wait(settle * 1000);
          const canvas = document.getElementById('world');
          const changes = [];
          let lastWidth = canvas.width;
          const start = performance.now();
          let watching = true;
          const watch = () => {
            if (!watching) return;
            if (canvas.width !== lastWidth) {
              changes.push({
                t: Number(((performance.now() - start) / 1000).toFixed(2)),
                from: lastWidth,
                to: canvas.width,
              });
              lastWidth = canvas.width;
            }
            requestAnimationFrame(watch);
          };
          requestAnimationFrame(watch);
          // Live flicker: the same reversal test as flicker-probe.mjs on a 480×270 copy.
          const live = {
            frames: 0,
            events: 0,
            regions: new Array(12).fill(0),
            counts: null,
            base: null,
          };
          if (flicker) {
            const W = 480,
              H = 270,
              T = 10;
            const small = document.createElement('canvas');
            small.width = W;
            small.height = H;
            const ctx = small.getContext('2d', { willReadFrequently: true });
            const ring = [];
            live.counts = new Uint16Array(W * H);
            const grab = () => {
              if (!watching) return;
              ctx.drawImage(canvas, 0, 0, W, H);
              const data = ctx.getImageData(0, 0, W, H).data;
              const luma = new Int16Array(W * H);
              for (let p = 0, q = 0; p < luma.length; p++, q += 4)
                luma[p] = (data[q] * 54 + data[q + 1] * 183 + data[q + 2] * 19) >> 8;
              ring.push(luma);
              live.base ??= luma;
              if (ring.length > 5) ring.shift();
              if (ring.length === 5) {
                const [a, b, c, d, e] = ring;
                for (let p = 0; p < W * H; p++) {
                  const first = b[p] - a[p];
                  if (first <= T && first >= -T) continue;
                  for (const [x, y] of [
                    [b, c],
                    [c, d],
                    [d, e],
                  ]) {
                    const next = y[p] - x[p];
                    if ((first > 0 && next < -T) || (first < 0 && next > T)) {
                      live.events++;
                      live.counts[p]++;
                      live.regions[
                        Math.floor((((p / W) | 0) * 3) / H) * 4 + Math.floor(((p % W) * 4) / W)
                      ]++;
                      break;
                    }
                  }
                }
                live.frames++;
              }
              requestAnimationFrame(grab);
            };
            // Registered after the game's own callback, so it reads the frame just drawn.
            requestAnimationFrame(() => requestAnimationFrame(grab));
          }
          const measured = await window.mapleWebMCP.invoke('measure_game_performance', {
            durationSeconds: seconds,
          });
          watching = false;
          let heatmap = null;
          if (flicker && live.base) {
            const W = 480,
              H = 270;
            const out = document.createElement('canvas');
            out.width = W;
            out.height = H;
            const c2 = out.getContext('2d');
            const image = c2.createImageData(W, H);
            for (let p = 0; p < W * H; p++) {
              const g = live.base[p] * 0.5,
                heat = Math.min(255, live.counts[p] * 40);
              image.data[p * 4] = Math.min(255, g + heat);
              image.data[p * 4 + 1] = Math.max(0, g - heat / 2);
              image.data[p * 4 + 2] = Math.max(0, g - heat / 2);
              image.data[p * 4 + 3] = 255;
            }
            c2.putImageData(image, 0, 0);
            heatmap = out.toDataURL('image/png');
          }
          const snap = world.snapshot();
          return {
            measured,
            pixelRatioChanges: changes,
            heatmap,
            liveFlicker: flicker
              ? {
                  frames: live.frames,
                  eventsPerKiloPixelFrame: Number(
                    ((live.events / (480 * 270 * Math.max(1, live.frames))) * 1000).toFixed(3),
                  ),
                  regions: live.regions.map((n) =>
                    Number(((n / (120 * 90 * Math.max(1, live.frames))) * 1000).toFixed(2)),
                  ),
                }
              : null,
            canvas: [canvas.width, canvas.height],
            renderer: snap.renderer,
            film: snap.game.filmLook ?? null,
          };
        },
        {
          scenario,
          graphics: args.graphics,
          seconds: Number(args.seconds),
          settle: Number(args.settle),
          flicker: args.flicker,
        },
      ),
      120000,
      `${name} measurement`,
    );
    if (cdp) {
      const { profile } = await cdp.send('Profiler.stop');
      await writeFile(join(outDir, `${name}.cpuprofile`), JSON.stringify(profile));
      const self = new Map();
      const byId = new Map(profile.nodes.map((node) => [node.id, node]));
      const counts = new Map();
      for (const id of profile.samples) counts.set(id, (counts.get(id) ?? 0) + 1);
      const total = profile.samples.length;
      for (const [id, count] of counts) {
        const { callFrame } = byId.get(id);
        const key = `${callFrame.functionName || '(anon)'} ${callFrame.url.split('/').slice(-2).join('/')}:${callFrame.lineNumber + 1}`;
        self.set(key, (self.get(key) ?? 0) + count);
      }
      const top = [...self.entries()].sort((a, b) => b[1] - a[1]).slice(0, 30);
      console.log(`  CPU self time, ${total} samples:`);
      for (const [key, count] of top)
        console.log(`   ${((count / total) * 100).toFixed(1).padStart(5)}%  ${key}`);
    }
    const parsed = result.measured.content?.[0]?.text
      ? JSON.parse(result.measured.content[0].text)
      : result.measured;
    const body = parsed.result ?? parsed;
    result.measured = body;
    if (result.heatmap)
      await writeFile(
        join(outDir, `${name}-live-heatmap.png`),
        Buffer.from(result.heatmap.split(',')[1], 'base64'),
      );
    delete result.heatmap;
    results.push({ scenario: name, ...result, errors: errors.slice(0, 10) });
    console.log(
      `${name.padEnd(17)} median ${body.frameMs?.median?.toFixed?.(2)} ms  p95 ${body.frameMs?.p95?.toFixed?.(2)} ms  cpu ${body.cpuMs?.median?.toFixed?.(2)} ms  calls ${Math.round(body.averageDrawCalls ?? 0)}  tris ${Math.round(body.averageTriangles ?? 0)}  ratio ${body.rendering?.pixelRatio?.toFixed?.(3)}  ratio changes ${result.pixelRatioChanges.length}${result.liveFlicker ? `  live flicker ${result.liveFlicker.eventsPerKiloPixelFrame}‰ over ${result.liveFlicker.frames} frames` : ''}${errors.length ? `  errors ${errors.length}: ${errors[0].slice(0, 120)}` : ''}`,
    );
    await page.close();
  }
} finally {
  await browser.close();
}
await writeFile(join(outDir, 'frames.json'), JSON.stringify(results, null, 2) + '\n');
