#!/usr/bin/env node
/**
 * Flicker and frame-cost probe. Opens the game in headless Chromium on the real GPU in
 * render mode (`?render=1&fps=60`), so every frame is simulated at exactly 1/60 s, sets up
 * a scenario (camera view, place, weather), steps frames and reads each one back from the
 * WebGL canvas. It reports:
 *
 * - high-frequency flicker: pixels whose luminance jumps by more than --threshold levels
 *   and jumps back (opposite sign, same size class) within 1–3 frames. Smooth camera
 *   motion changes a pixel once; z-fighting, shadow swimming, alpha shimmer and
 *   resolution pumping flip it back and forth.
 * - the rate per region of a 4×3 grid, in events per 1000 pixel-frames, and the share of
 *   pixels that flicker at least three times in the clip;
 * - step time (CPU simulate + submit) and read-back time (waits for the GPU), draw calls,
 *   triangles and pixel ratio.
 *
 * Outputs go to artifacts/screenshots/flicker/<label>/ (gitignored): an mp4 per scenario,
 * a heatmap PNG of where the flicker is, and summary.json.
 *
 *   node scripts/flicker-probe.mjs --url http://127.0.0.1:5773 --label before
 *   node scripts/flicker-probe.mjs --url ... --scenarios cab,passenger --query train=procedural
 */
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { chromium } from 'playwright';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const { values: args } = parseArgs({
  options: {
    url: { type: 'string', default: 'http://127.0.0.1:5773' },
    label: { type: 'string', default: 'probe' },
    scenarios: { type: 'string', default: 'director,cab,passenger,follow,arrival,storm' },
    frames: { type: 'string', default: '300' },
    warmup: { type: 'string', default: '90' },
    threshold: { type: 'string', default: '10' },
    width: { type: 'string', default: '960' },
    query: { type: 'string', default: '' },
    graphics: { type: 'string', default: 'high' },
    video: { type: 'boolean', default: true },
    gl: { type: 'string', default: process.platform === 'darwin' ? 'metal' : 'swiftshader' },
  },
});
const GL_FLAGS = {
  metal: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'],
  swiftshader: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  default: [],
};
const frames = Number(args.frames);
const warmup = Number(args.warmup);
const threshold = Number(args.threshold);
const W = Number(args.width);
const H = Math.round((W * 9) / 16);
const outDir = join(root, 'artifacts/screenshots/flicker', args.label);

/**
 * Scenario setup runs in the page. `set` is mapleWorld.set; stopped scenes hold the train
 * still so the camera is steady apart from the director's own drift.
 */
const SCENARIOS = {
  director: { place: 'station', view: 'director', weather: 'clear', stopped: true },
  cab: { place: 'station', view: 'cab', weather: 'clear', stopped: true },
  passenger: { place: 'station', view: 'passenger', weather: 'clear', stopped: true },
  follow: { place: 'village', view: 'follow', weather: 'clear', stopped: false },
  arrival: { place: 360, view: 'director', weather: 'clear', stopped: false },
  storm: { place: 'village', view: 'cab', weather: 'storm', stopped: true },
  'passenger-moving': { place: 'village', view: 'passenger', weather: 'clear', stopped: false },
  'cab-moving': { place: 'village', view: 'cab', weather: 'clear', stopped: false },
};

function run(command, commandArgs) {
  const child = spawn(command, commandArgs, { stdio: ['pipe', 'ignore', 'pipe'] });
  let stderr = '';
  child.stderr.on('data', (chunk) => (stderr = (stderr + chunk).slice(-3000)));
  const done = new Promise((ok, fail) =>
    child.on('close', (code) => (code === 0 ? ok() : fail(new Error(stderr)))),
  );
  return { child, done };
}

/** Rejects when a browser or capture step takes longer than `ms`, so nothing hangs. */
function withTimeout(promise, ms, what) {
  let timer;
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(`${what} timed out after ${ms / 1000} s`)), ms);
    }),
  ]).finally(() => clearTimeout(timer));
}

/** Flicker events from a stack of luma frames. */
function analyse(lumas) {
  const n = lumas.length;
  const size = W * H;
  const counts = new Uint16Array(size);
  const cols = 4,
    rows = 3;
  const regionEvents = new Float64Array(cols * rows);
  const regionPixels = new Float64Array(cols * rows);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++)
      regionPixels[Math.floor((y * rows) / H) * cols + Math.floor((x * cols) / W)]++;
  const perFrame = [];
  let events = 0;
  for (let t = 1; t < n - 3; t++) {
    let frameEvents = 0;
    const a = lumas[t - 1],
      b = lumas[t];
    for (let p = 0; p < size; p++) {
      const d = b[p] - a[p];
      if (d > threshold || d < -threshold) {
        for (let k = 1; k <= 3; k++) {
          const e = lumas[t + k][p] - lumas[t + k - 1][p];
          if ((d > 0 && e < -threshold) || (d < 0 && e > threshold)) {
            counts[p]++;
            frameEvents++;
            const x = p % W,
              y = (p / W) | 0;
            regionEvents[Math.floor((y * rows) / H) * cols + Math.floor((x * cols) / W)]++;
            break;
          }
        }
      }
    }
    events += frameEvents;
    perFrame.push(frameEvents);
  }
  const span = Math.max(1, n - 4);
  let persistent = 0;
  for (let p = 0; p < size; p++) if (counts[p] >= 3) persistent++;
  // Mean absolute frame difference: how much the picture moves overall.
  let motion = 0;
  for (let t = 1; t < n; t++) {
    let sum = 0;
    for (let p = 0; p < size; p += 7) sum += Math.abs(lumas[t][p] - lumas[t - 1][p]);
    motion += sum / (size / 7);
  }
  const sortedFrames = [...perFrame].sort((x, y) => x - y);
  return {
    eventsPerKiloPixelFrame: Number(((events / (size * span)) * 1000).toFixed(3)),
    persistentPixelsPct: Number(((persistent / size) * 100).toFixed(3)),
    worstFramePct: Number(((sortedFrames.at(-1) / size) * 100).toFixed(3)),
    p95FramePct: Number(
      ((sortedFrames[Math.floor(sortedFrames.length * 0.95)] / size) * 100).toFixed(3),
    ),
    meanFrameDelta: Number((motion / (n - 1)).toFixed(2)),
    regions: Array.from({ length: rows }, (_, r) =>
      Array.from({ length: cols }, (_, c) =>
        Number(
          ((regionEvents[r * cols + c] / (regionPixels[r * cols + c] * span)) * 1000).toFixed(2),
        ),
      ),
    ),
    counts,
  };
}

/** Heatmap: the first frame in grey with flicker counts in red, as a PPM for ffmpeg. */
function heatmap(first, counts) {
  const header = Buffer.from(`P6\n${W} ${H}\n255\n`);
  const body = Buffer.alloc(W * H * 3);
  for (let p = 0; p < W * H; p++) {
    const g = first[p] * 0.5;
    const heat = Math.min(255, counts[p] * 40);
    body[p * 3] = Math.min(255, g + heat);
    body[p * 3 + 1] = Math.max(0, g - heat * 0.5);
    body[p * 3 + 2] = Math.max(0, g - heat * 0.5);
  }
  return Buffer.concat([header, body]);
}

async function probe(page, name) {
  const scenario = SCENARIOS[name];
  if (!scenario) throw new Error(`Unknown scenario ${name}`);
  await page.evaluate(
    ({ scenario, graphics }) => {
      const world = window.mapleWorld;
      const store = window.__mapleProbe;
      world.set('pause', false);
      world.set('weather', scenario.weather);
      world.set('location', scenario.place);
      world.set('camera', scenario.view);
      if (graphics) {
        const select = document.getElementById('graphics-quality');
        select.value = graphics;
        select.dispatchEvent(new Event('change'));
      }
      if (scenario.stopped) world.set('drive', { power: 0, brake: 1, speedKmh: 0 });
      else world.set('autopilot', true);
      store.reset();
    },
    { scenario, graphics: args.graphics },
  );
  await page.evaluate((count) => window.__mapleProbe.warm(count), warmup);
  const lumas = [];
  const timing = [];
  const encoder = args.video
    ? run('ffmpeg', [
        '-hide_banner',
        '-y',
        '-f',
        'image2pipe',
        '-c:v',
        'mjpeg',
        '-framerate',
        '60',
        '-i',
        'pipe:0',
        '-c:v',
        'libx264',
        '-crf',
        '18',
        '-pix_fmt',
        'yuv420p',
        '-movflags',
        '+faststart',
        join(outDir, `${name}.mp4`),
      ])
    : null;
  for (let i = 0; i < frames; i++) {
    const result = await page.evaluate(
      (video) => window.__mapleProbe.frame(video),
      Boolean(encoder),
    );
    lumas.push(Buffer.from(result.luma, 'base64'));
    timing.push(result.timing);
    if (encoder) {
      const jpeg = Buffer.from(result.jpeg.split(',')[1], 'base64');
      if (!encoder.child.stdin.write(jpeg)) await once(encoder.child.stdin, 'drain');
    }
  }
  if (encoder) {
    encoder.child.stdin.end();
    await encoder.done;
  }
  const stats = analyse(lumas);
  const ppm = join(outDir, `${name}-heatmap.ppm`);
  await writeFile(ppm, heatmap(lumas[0], stats.counts));
  await run('ffmpeg', ['-hide_banner', '-y', '-i', ppm, join(outDir, `${name}-heatmap.png`)]).done;
  const median = (key) => {
    const values = timing.map((item) => item[key]).sort((a, b) => a - b);
    return Number(values[Math.floor(values.length / 2)].toFixed(2));
  };
  const p95 = (key) => {
    const values = timing.map((item) => item[key]).sort((a, b) => a - b);
    return Number(values[Math.floor(values.length * 0.95)].toFixed(2));
  };
  const ratios = [...new Set(timing.map((item) => item.pixelRatio))];
  const end = await page.evaluate(() => window.__mapleProbe.state());
  delete stats.counts;
  return {
    scenario: name,
    ...scenario,
    frames,
    flicker: stats,
    stepMs: { median: median('stepMs'), p95: p95('stepMs') },
    gpuWaitMs: { median: median('readMs'), p95: p95('readMs') },
    totalMs: { median: median('totalMs'), p95: p95('totalMs') },
    drawCalls: median('calls'),
    triangles: median('triangles'),
    pixelRatios: ratios,
    end,
  };
}

const PROBE_INSTALL = ({ W, H }) => {
  const canvas = document.getElementById('world');
  const small = document.createElement('canvas');
  small.width = W;
  small.height = H;
  const ctx = small.getContext('2d', { willReadFrequently: true });
  const encode = (bytes) => {
    let text = '';
    for (let i = 0; i < bytes.length; i += 0x8000)
      text += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(text);
  };
  const gl = canvas.getContext('webgl2');
  window.__mapleProbe = {
    reset() {},
    warm(count) {
      window.__mapleRender.step(count);
    },
    frame(video) {
      const t0 = performance.now();
      window.__mapleRender.step(1);
      const t1 = performance.now();
      ctx.drawImage(canvas, 0, 0, W, H);
      const data = ctx.getImageData(0, 0, W, H).data;
      const t2 = performance.now();
      const luma = new Uint8Array(W * H);
      for (let p = 0, q = 0; p < luma.length; p++, q += 4)
        luma[p] = (data[q] * 54 + data[q + 1] * 183 + data[q + 2] * 19) >> 8;
      const info = window.mapleWorld ? null : null;
      return {
        luma: encode(luma),
        jpeg: video ? small.toDataURL('image/jpeg', 0.9) : null,
        timing: {
          stepMs: t1 - t0,
          readMs: t2 - t1,
          totalMs: t2 - t0,
          calls: window.__mapleProbeInfo?.calls ?? 0,
          triangles: window.__mapleProbeInfo?.triangles ?? 0,
          pixelRatio: window.devicePixelRatio && canvas.width / canvas.clientWidth,
        },
        info,
        gl: Boolean(gl),
      };
    },
    state() {
      const snap = window.mapleWorld.snapshot();
      return {
        camera: snap.camera,
        renderer: snap.renderer.render,
        pixelRatio: snap.renderer.pixelRatio,
        view: snap.game.view,
        performance: snap.game.performance,
        speedKmh: Math.round((snap.game.drive?.speed ?? 0) * 3.6),
      };
    },
  };
};

await mkdir(outDir, { recursive: true });
const browser = await chromium.launch({ headless: true, args: GL_FLAGS[args.gl] });
const summary = { label: args.label, query: args.query, graphics: args.graphics, results: [] };
try {
  for (const name of args.scenarios.split(',')) {
    // A fresh page per scenario so one scene's state cannot leak into the next.
    const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
    page.setDefaultTimeout(120000);
    // Other checkouts touching shared files must not reload the page mid-capture: the
    // Vite HMR socket never opens, so no reload message can arrive.
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
    const query = `render=1&fps=60${args.query ? `&${args.query}` : ''}`;
    await page.goto(`${args.url}/?${query}`, { waitUntil: 'load' });
    await page.waitForFunction(() => window.__mapleRender && window.mapleWorld, null, {
      timeout: 90000,
    });
    const ready = await withTimeout(
      page.evaluate(() => window.__mapleRender.ready()),
      120000,
      'model loading',
    );
    await page.evaluate(PROBE_INSTALL, { W, H });
    const result = await withTimeout(probe(page, name), 600000, `${name} capture`);
    result.gpu = ready.gpu;
    result.errors = errors.slice(0, 10);
    summary.results.push(result);
    const f = result.flicker;
    console.log(
      `${name.padEnd(17)} flicker ${String(f.eventsPerKiloPixelFrame).padStart(7)}‰  persistent ${String(f.persistentPixelsPct).padStart(6)}%  motion ${String(f.meanFrameDelta).padStart(5)}  step ${result.stepMs.median} ms  gpu ${result.gpuWaitMs.median} ms  calls ${result.end.renderer.calls}  tris ${result.end.renderer.triangles}${errors.length ? `  errors ${errors.length}` : ''}`,
    );
    await page.close();
  }
} finally {
  await browser.close();
}
await writeFile(join(outDir, 'summary.json'), JSON.stringify(summary, null, 2) + '\n');
console.log(`wrote ${join(outDir, 'summary.json')}`);
