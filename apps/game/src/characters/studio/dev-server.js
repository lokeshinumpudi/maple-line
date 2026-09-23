/**
 * Vite dev-server endpoints for the character studio (character-studio.html). Node only,
 * `apply: 'serve'`: none of this exists in a build. Every write goes to a fixed list of
 * JSON files in source (formatted with the repo's Prettier config, so `pnpm check` passes
 * and the change shows as a normal git diff) or to artifacts/screenshots/studio/, which is
 * gitignored. Binary assets are never written.
 *
 *   GET  /__studio/assets                 characters, clip files and concept images
 *   GET  /__studio/concept/<file>         a concept image ($MAPLE_CONCEPT_DIR)
 *   GET  /__studio/file?name=<file>       current text of a tuning file
 *   POST /__studio/preview?name=<file>    { before, after } for a JSON body, not written
 *   POST /__studio/save?name=<file>       write the formatted JSON body
 *   POST /__studio/capture?name=<still>   PNG body -> artifacts/screenshots/studio/<still>.png
 *   POST /__studio/video/frame?id=&index= JPEG body, one frame of a capture
 *   POST /__studio/video/finish?id=&fps=&name=  ffmpeg the frames into <name>.mp4
 */
import { spawn } from 'node:child_process';
import { createReadStream, existsSync } from 'node:fs';
import { mkdir, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { basename, dirname, extname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const gameRoot = resolve(here, '../../..');
const repoRoot = resolve(gameRoot, '../..');
const publicDir = join(gameRoot, 'public');
const captureDir = join(repoRoot, 'artifacts/screenshots/studio');

/** The only files the studio may write. */
export const STUDIO_FILES = Object.freeze({
  'cast-tuning': join(gameRoot, 'src/characters/cast-tuning.json'),
  'studio-tuning': join(here, 'studio-tuning.json'),
});

const IMAGE_TYPES = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
};
const SAFE_NAME = /^[a-z0-9][a-z0-9._-]{0,80}$/i;

async function walk(dir, found = []) {
  let entries = [];
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return found;
  }
  for (const entry of entries) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) await walk(path, found);
    else found.push(path);
  }
  return found;
}

function readBody(req, limit = 24 * 1024 * 1024) {
  return new Promise((resolveBody, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > limit) {
        reject(new Error('Request body too large'));
        req.destroy();
      } else chunks.push(chunk);
    });
    req.on('end', () => resolveBody(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

function send(res, status, body, type = 'application/json') {
  res.statusCode = status;
  res.setHeader('Content-Type', type);
  res.setHeader('Cache-Control', 'no-store');
  res.end(type === 'application/json' ? JSON.stringify(body) : body);
}

async function formatJson(data) {
  const prettier = await import('prettier');
  const config = (await prettier.resolveConfig(STUDIO_FILES['cast-tuning'])) ?? {};
  return prettier.format(JSON.stringify(data), { ...config, parser: 'json' });
}

/** Shape checks before anything is written. */
async function validateFile(name, data) {
  if (name === 'cast-tuning') {
    const { parseTuning } = await import('../cast-tuning.js');
    return parseTuning(data);
  }
  if (!data || typeof data !== 'object' || Array.isArray(data) || data.version !== 1)
    throw new TypeError('studio tuning must be an object with version 1');
  for (const key of Object.keys(data))
    if (!['version', 'about', 'overlays', 'trims', 'corrections'].includes(key))
      throw new TypeError(`studio tuning has an unknown section: ${key}`);
  return data;
}

async function currentText(name) {
  try {
    return await readFile(STUDIO_FILES[name], 'utf8');
  } catch {
    return '';
  }
}

function runFfmpeg(args) {
  return new Promise((resolveRun, reject) => {
    const child = spawn(process.env.FFMPEG ?? 'ffmpeg', args, {
      stdio: ['ignore', 'ignore', 'pipe'],
    });
    let log = '';
    child.stderr.on('data', (chunk) => (log = (log + chunk).slice(-4000)));
    child.on('error', reject);
    child.on('close', (code) => (code === 0 ? resolveRun() : reject(new Error(log))));
  });
}

export function characterStudioServer({
  conceptDir = process.env.MAPLE_CONCEPT_DIR ??
    join(homedir(), 'Downloads/maple-assets/concept/views'),
} = {}) {
  return {
    name: 'maple-character-studio',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (!req.url?.startsWith('/__studio/')) return next();
        const url = new URL(req.url, 'http://studio.local');
        const route = url.pathname.slice('/__studio/'.length);
        try {
          if (req.method === 'GET' && route === 'assets') {
            const files = await walk(join(publicDir, 'models'));
            const rel = (path) => relative(publicDir, path).split('\\').join('/');
            const characters = [];
            for (const path of files) {
              const ext = extname(path).toLowerCase();
              if (!['.vrm', '.glb'].includes(ext)) continue;
              const r = rel(path);
              if (!r.startsWith('models/characters/') || r.includes('/props/')) continue;
              characters.push({ path: r, kind: ext.slice(1), bytes: (await stat(path)).size });
            }
            const props = files.map(rel).filter((r) => r.startsWith('models/characters/props/'));
            const clips = files.map(rel).filter((r) => r.endsWith('.vrma'));
            const concept = existsSync(conceptDir)
              ? (await readdir(conceptDir))
                  .filter(
                    (file) => IMAGE_TYPES[extname(file).toLowerCase()] && !file.startsWith('_'),
                  )
                  .sort()
                  .map((file) => ({
                    name: file,
                    url: `/__studio/concept/${encodeURIComponent(file)}`,
                  }))
              : [];
            return send(res, 200, { characters, props, clips, concept, conceptDir });
          }
          if (req.method === 'GET' && route.startsWith('concept/')) {
            const file = basename(decodeURIComponent(route.slice('concept/'.length)));
            const type = IMAGE_TYPES[extname(file).toLowerCase()];
            const path = join(conceptDir, file);
            if (!type || !existsSync(path)) return send(res, 404, { error: 'No such image' });
            res.setHeader('Content-Type', type);
            return createReadStream(path).pipe(res);
          }
          const name = url.searchParams.get('name') ?? '';
          if (req.method === 'GET' && route === 'file') {
            if (!STUDIO_FILES[name]) return send(res, 400, { error: 'Unknown studio file' });
            return send(res, 200, { name, text: await currentText(name) });
          }
          if (req.method === 'POST' && (route === 'preview' || route === 'save')) {
            if (!STUDIO_FILES[name]) return send(res, 400, { error: 'Unknown studio file' });
            const data = await validateFile(name, JSON.parse(String(await readBody(req))));
            const before = await currentText(name);
            const after = await formatJson(data);
            if (route === 'preview') return send(res, 200, { name, before, after });
            await writeFile(STUDIO_FILES[name], after);
            return send(res, 200, {
              name,
              path: relative(repoRoot, STUDIO_FILES[name]),
              changed: before !== after,
            });
          }
          if (req.method === 'POST' && route === 'capture') {
            if (!SAFE_NAME.test(name)) return send(res, 400, { error: 'Bad capture name' });
            await mkdir(captureDir, { recursive: true });
            const path = join(captureDir, `${name.replace(/\.png$/i, '')}.png`);
            await writeFile(path, await readBody(req));
            return send(res, 200, { path: relative(repoRoot, path) });
          }
          if (req.method === 'POST' && route.startsWith('video/')) {
            const id = url.searchParams.get('id') ?? '';
            if (!/^[a-z0-9]{4,32}$/i.test(id)) return send(res, 400, { error: 'Bad capture id' });
            const frames = join(captureDir, `.frames-${id}`);
            if (route === 'video/frame') {
              const index = Number(url.searchParams.get('index'));
              if (!Number.isInteger(index) || index < 0 || index > 100000)
                return send(res, 400, { error: 'Bad frame index' });
              await mkdir(frames, { recursive: true });
              await writeFile(
                join(frames, `${String(index).padStart(5, '0')}.jpg`),
                await readBody(req),
              );
              return send(res, 200, { index });
            }
            if (route === 'video/finish') {
              if (!SAFE_NAME.test(name)) return send(res, 400, { error: 'Bad video name' });
              const fps = Math.min(60, Math.max(1, Number(url.searchParams.get('fps')) || 30));
              const out = join(captureDir, `${name.replace(/\.mp4$/i, '')}.mp4`);
              // H.264 High, yuv420p, +faststart: the same phone-friendly settings as
              // scripts/render-episode.mjs. Odd sizes are padded to even.
              await runFfmpeg([
                '-y',
                '-framerate',
                String(fps),
                '-i',
                join(frames, '%05d.jpg'),
                '-vf',
                'pad=ceil(iw/2)*2:ceil(ih/2)*2',
                '-c:v',
                'libx264',
                '-profile:v',
                'high',
                '-pix_fmt',
                'yuv420p',
                '-movflags',
                '+faststart',
                out,
              ]);
              // Only the temporary local frame folder is removed; the video stays.
              await rm(frames, { recursive: true, force: true });
              return send(res, 200, { path: relative(repoRoot, out) });
            }
          }
          return send(res, 404, { error: 'Unknown studio route' });
        } catch (error) {
          return send(res, 400, { error: error instanceof Error ? error.message : String(error) });
        }
      });
    },
  };
}
