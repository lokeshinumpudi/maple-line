#!/usr/bin/env node
/**
 * Renders a drama episode to an MP4 that plays on phones (H.264 High, yuv420p,
 * AAC, +faststart). Launches headless Chromium against a local Vite server with
 * `?render=1`, steps the game one fixed frame at a time through
 * window.__mapleRender, captures each composited page frame (WebGL canvas plus
 * the DOM captions) and pipes it to ffmpeg. See docs/VIDEO.md.
 *
 *   pnpm render:episode --episode the-1742-1 --aspect 9:16
 */
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, extname, isAbsolute, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { setTimeout as delay } from 'node:timers/promises';
import { chromium } from 'playwright';
import {
  audioFilterGraph,
  normalizeAudioManifest,
  resolveAudioClips,
} from '../apps/game/src/drama/render-timeline.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
/** Paths inside the repository print relative to it; others stay absolute. */
const shown = (path) => {
  const inside = relative(root, path);
  return inside.startsWith('..') || isAbsolute(inside) ? path : inside;
};
const { values: args } = parseArgs({
  options: {
    episode: { type: 'string', default: 'the-1742-1' },
    'episode-file': { type: 'string' },
    aspect: { type: 'string', default: '16:9' },
    fps: { type: 'string', default: '30' },
    out: { type: 'string', default: 'media/renders' },
    port: { type: 'string', default: '4373' },
    url: { type: 'string' },
    audio: { type: 'string' },
    subtitles: { type: 'string' },
    'poster-beat': { type: 'string' },
    'poster-at': { type: 'string' },
    'max-seconds': { type: 'string', default: '600' },
    crf: { type: 'string', default: '22' },
    gl: { type: 'string', default: process.platform === 'darwin' ? 'metal' : 'swiftshader' },
    ffmpeg: { type: 'string', default: process.env.FFMPEG ?? 'ffmpeg' },
    'timeline-only': { type: 'boolean', default: false },
    help: { type: 'boolean', short: 'h', default: false },
  },
});

if (args.help) {
  console.log(`Usage: pnpm render:episode [options]

  --episode <id|alias|n>   the-1742-1, the-1742-e1-two-minutes or 1 (default the-1742-1)
  --episode-file <json>    render a draft episode instead
  --aspect <list>          16:9, 9:16 or both as "16:9,9:16" (default 16:9)
  --fps <n>                24, 25, 30 or 60 (default 30)
  --out <dir>              output folder (default media/renders, gitignored)
  --port <n>               Vite port to start (default 4373)
  --url <base>             use an already running game server instead
  --audio <file>           a .wav/.mp3/.m4a from 0 s, or an audio manifest .json
  --subtitles source       keep the episode's own words on screen under a translated voice
  --poster-beat <id>       poster from a beat, e.g. momiji-platform/2 (default: first portrait)
  --poster-at <seconds>    poster from a video time instead
  --crf <n>                x264 quality, lower is larger (default 22, capped at 6 Mbit/s)
  --gl <backend>           metal, swiftshader, egl or default (default metal on macOS)
  --timeline-only          simulate and write the timeline JSON without video
  --max-seconds <n>        stop a runaway render (default 600)`);
  process.exit(0);
}

const fps = Number(args.fps);
if (![24, 25, 30, 60].includes(fps)) throw new Error('--fps must be 24, 25, 30 or 60.');
const aspects = args.aspect.split(',').map((value) => value.trim());
for (const aspect of aspects)
  if (!['16:9', '9:16'].includes(aspect)) throw new Error('--aspect must be 16:9 or 9:16.');
const SIZE = { '16:9': [1920, 1080], '9:16': [1080, 1920] };
const outDir = resolve(root, args.out);
const maxFrames = Math.round(Number(args['max-seconds']) * fps);
const crf = Number(args.crf);
if (!(crf >= 0 && crf <= 51)) throw new Error('--crf must be from 0 to 51.');
const posterAt = args['poster-at'] === undefined ? null : Number(args['poster-at']);
if (posterAt !== null && !(posterAt >= 0)) throw new Error('--poster-at must be seconds ≥ 0.');

const GL_FLAGS = {
  metal: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'],
  swiftshader: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  egl: ['--use-gl=egl', '--ignore-gpu-blocklist'],
  default: [],
};
if (!GL_FLAGS[args.gl]) throw new Error(`--gl must be one of ${Object.keys(GL_FLAGS).join(', ')}.`);

const draft = args['episode-file']
  ? JSON.parse(await readFile(resolve(args['episode-file']), 'utf8'))
  : null;

/** Audio: one file from 0 s, or a manifest whose paths are relative to itself. */
async function loadAudio(path) {
  if (!path) return { clips: [] };
  const file = resolve(path);
  if (extname(file).toLowerCase() !== '.json') return { clips: [{ file, t: 0 }] };
  const raw = JSON.parse(await readFile(file, 'utf8'));
  const manifest = normalizeAudioManifest(
    Array.isArray(raw) ? raw : { version: raw.version, clips: raw.clips },
  );
  return {
    // A `pnpm voice:episode` manifest also carries line lengths and translated text,
    // which the page uses to hold each line for its clip.
    voice: raw?.kind === 'maple-line-episode-voice' ? raw : null,
    clips: manifest.clips.map((clip) => ({
      ...clip,
      file: isAbsolute(clip.file) ? clip.file : resolve(dirname(file), clip.file),
    })),
  };
}
const audio = await loadAudio(args.audio);
for (const clip of audio.clips) await stat(clip.file);

function run(command, commandArgs, { input } = {}) {
  const child = spawn(command, commandArgs, {
    stdio: [input ? 'pipe' : 'ignore', 'ignore', 'pipe'],
  });
  let stderr = '';
  child.stderr.on('data', (chunk) => {
    stderr = (stderr + chunk).slice(-4000);
  });
  const done = new Promise((resolvePromise, reject) => {
    child.on('error', reject);
    child.on('close', (code) =>
      code === 0
        ? resolvePromise()
        : reject(new Error(`${command} exited with ${code}:\n${stderr}`)),
    );
  });
  return { child, done };
}

async function serverUp(url) {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(1500) });
    return response.ok;
  } catch {
    return false;
  }
}

async function startServer() {
  if (args.url) return { base: args.url.replace(/\/$/, ''), stop: async () => {} };
  const base = `http://127.0.0.1:${args.port}`;
  if (await serverUp(base))
    throw new Error(`Port ${args.port} is already serving; pass --url ${base} to use it.`);
  // Node runs Vite directly (not through pnpm) so stopping the render stops the server too.
  const vite = spawn(
    process.execPath,
    [
      join(root, 'apps/game/node_modules/vite/bin/vite.js'),
      '--port',
      args.port,
      '--strictPort',
      '--host',
      '127.0.0.1',
    ],
    {
      cwd: join(root, 'apps/game'),
      stdio: ['ignore', 'ignore', 'pipe'],
      env: { ...process.env, MAPLE_RENDER_SERVER: '1' },
    },
  );
  let log = '';
  vite.stderr.on('data', (chunk) => {
    log = (log + chunk).slice(-2000);
  });
  for (let i = 0; i < 120; i++) {
    if (await serverUp(base)) break;
    if (vite.exitCode !== null) throw new Error(`Vite exited early:\n${log}`);
    await delay(250);
  }
  if (!(await serverUp(base))) throw new Error(`Vite did not start on ${base}:\n${log}`);
  return {
    base,
    async stop() {
      vite.kill('SIGTERM');
      await Promise.race([once(vite, 'close'), delay(3000)]);
    },
  };
}

const posterBeatFor = (status) =>
  status.scene && status.beat ? `${status.scene}/${status.beat}` : null;

async function renderAspect(browser, base, aspect) {
  const [width, height] = SIZE[aspect];
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  let loaded = false;
  page.on('framenavigated', (frame) => {
    if (frame !== page.mainFrame()) return;
    if (loaded) errors.push('reload');
    loaded = true;
  });
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  await page.goto(`${base}/?render=1&fps=${fps}&aspect=${encodeURIComponent(aspect)}`, {
    waitUntil: 'load',
  });
  await page.waitForFunction(() => window.__mapleRender, null, { timeout: 90000 });
  const ready = await page.evaluate(() => window.__mapleRender.ready());
  const played = await page.evaluate(
    ([source, voiceManifest, subtitles]) =>
      window.__mapleRender.play(source, { voiceManifest, subtitles }),
    [draft ?? args.episode, audio.voice ?? null, args.subtitles === 'source' ? 'source' : 'voice'],
  );
  const episodeId = played.episode.id;
  const tag = aspect.replace(':', 'x');
  const base_ = join(outDir, `${episodeId}-${tag}`);
  const videoOnly = `${base_}.video.mp4`;
  const finalPath = `${base_}.mp4`;
  const posterPath = `${base_}-poster.jpg`;
  console.log(
    `${episodeId} ${aspect}: ${width}×${height} @ ${fps} fps on ${ready.gpu} (planned ≈${played.plannedSeconds}s + waits)`,
  );
  const cdp = await page.context().newCDPSession(page);
  const capture = async (quality) =>
    Buffer.from(
      (
        await cdp.send('Page.captureScreenshot', {
          format: 'jpeg',
          quality,
          optimizeForSpeed: true,
          fromSurface: true,
        })
      ).data,
      'base64',
    );
  const encoder = args['timeline-only']
    ? null
    : run(
        args.ffmpeg,
        [
          '-hide_banner',
          '-y',
          '-f',
          'image2pipe',
          '-c:v',
          'mjpeg',
          '-framerate',
          String(fps),
          '-i',
          'pipe:0',
          '-c:v',
          'libx264',
          '-preset',
          'medium',
          '-crf',
          String(crf),
          // Keeps a 90-second episode near 60 MB for messaging apps.
          '-maxrate',
          '6M',
          '-bufsize',
          '12M',
          '-profile:v',
          'high',
          '-level:v',
          '4.2',
          // Screenshots are full-range JPEG; phones expect limited-range yuv420p.
          '-vf',
          'scale=in_range=pc:out_range=tv,format=yuv420p',
          '-color_range',
          'tv',
          '-colorspace',
          'bt709',
          '-color_primaries',
          'bt709',
          '-color_trc',
          'bt709',
          '-r',
          String(fps),
          '-movflags',
          '+faststart',
          videoOnly,
        ],
        { input: true },
      );
  const started = performance.now();
  let status;
  let poster = null;
  let posterDueAt = posterAt;
  let posterBeatSeenAt = null;
  const wantedBeat = args['poster-beat'] ?? null;
  for (let frame = 0; frame < maxFrames; frame++) {
    if (errors.includes('reload'))
      throw new Error('The game page reloaded during the render (did a source file change?).');
    status = await page.evaluate(() => window.__mapleRender.step(1));
    const t = (status.frame - 1) / fps;
    // A poster from the named beat, or the first portrait, 2.5 s after it starts.
    if (posterDueAt === null && posterBeatSeenAt === null) {
      const beat = posterBeatFor(status);
      if (beat && (wantedBeat ? beat === wantedBeat : status.shot === 'portrait')) {
        posterBeatSeenAt = t;
        posterDueAt = t + 2.5;
      }
    }
    if (!poster && posterDueAt !== null && t >= posterDueAt && !args['timeline-only']) {
      await page.evaluate(() => window.__mapleRender.poster(true));
      await writeFile(posterPath, await capture(95));
      await page.evaluate(() => window.__mapleRender.poster(false));
      poster = {
        file: relative(outDir, posterPath),
        t: Number(t.toFixed(3)),
        beat: posterBeatFor(status),
      };
    }
    if (encoder) {
      const jpeg = await capture(92);
      if (!encoder.child.stdin.write(jpeg)) await once(encoder.child.stdin, 'drain');
    }
    if (frame % (fps * 10) === 0) {
      const rate = (frame + 1) / ((performance.now() - started) / 1000);
      console.log(
        `  ${t.toFixed(1)}s  scene ${status.scene ?? '-'} beat ${status.beat ?? '-'}${status.waitingFor ? ` (waiting for ${status.waitingFor})` : ''}  ${rate.toFixed(1)} frames/s`,
      );
    }
    if (status.done) break;
  }
  if (!status?.done) console.warn(`  stopped at --max-seconds before the end card finished.`);
  if (encoder) {
    encoder.child.stdin.end();
    await encoder.done;
  }
  const renderSeconds = (performance.now() - started) / 1000;
  const timeline = await page.evaluate(() => window.__mapleRender.timeline());
  const log = await page.evaluate(() => window.__mapleRender.log());
  await page.close();
  const duration = timeline.video.durationSeconds;
  const timelinePath = `${base_}.timeline.json`;
  const resolvedAudio = resolveAudioClips(audio, timeline);
  if (resolvedAudio.missing.length)
    console.warn(`  audio lines not in this render: ${resolvedAudio.missing.join(', ')}`);
  await writeFile(
    timelinePath,
    JSON.stringify(
      {
        ...timeline,
        poster,
        render: {
          aspect,
          gpu: ready.gpu,
          renderSeconds: Number(renderSeconds.toFixed(1)),
          audioClips: resolvedAudio.clips.map((clip) => ({
            ...clip,
            file: shown(clip.file),
          })),
          runnerLog: log,
          pageErrors: errors.slice(0, 20),
        },
      },
      null,
      2,
    ) + '\n',
  );
  if (args['timeline-only']) {
    console.log(`  timeline ${shown(timelinePath)} (${duration}s)`);
    return { episodeId, aspect, timelinePath, duration, renderSeconds };
  }
  // Second pass: mux the voice or music clips at their times (or silence) and keep the video.
  const inputs = resolvedAudio.clips.flatMap((clip) => ['-i', clip.file]);
  await run(args.ffmpeg, [
    '-hide_banner',
    '-y',
    '-i',
    videoOnly,
    ...inputs,
    '-filter_complex',
    audioFilterGraph(resolvedAudio.clips, { durationSeconds: duration }),
    '-map',
    '0:v',
    '-map',
    '[aout]',
    '-c:v',
    'copy',
    '-c:a',
    'aac',
    '-b:a',
    '160k',
    '-ar',
    '48000',
    '-t',
    String(duration),
    '-movflags',
    '+faststart',
    finalPath,
  ]).done;
  await rm(videoOnly);
  const { size } = await stat(finalPath);
  console.log(
    `  wrote ${shown(finalPath)}: ${duration}s, ${(size / 1048576).toFixed(1)} MB, rendered in ${renderSeconds.toFixed(0)}s` +
      (poster ? `; poster ${shown(posterPath)} at ${poster.t}s` : ''),
  );
  if (errors.length) console.warn(`  page errors: ${errors.slice(0, 3).join(' | ')}`);
  return { episodeId, aspect, finalPath, posterPath, duration, size, renderSeconds };
}

await mkdir(outDir, { recursive: true });
const server = await startServer();
for (const signal of ['SIGINT', 'SIGTERM'])
  process.once(signal, () => {
    void server.stop().finally(() => process.exit(130));
  });
const browser = await chromium.launch({ headless: true, args: GL_FLAGS[args.gl] });
try {
  for (const aspect of aspects) await renderAspect(browser, server.base, aspect);
} finally {
  await browser.close();
  await server.stop();
}
