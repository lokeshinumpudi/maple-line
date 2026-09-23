// Generates every voice clip of one drama episode and a manifest for the video renderer.
//
//   pnpm voice:episode --episode the-1742-1 --lang te-IN
//   pnpm voice:episode --episode the-1742-e1-two-minutes --lang en-IN --list   (no requests)
//   pnpm render:episode --episode the-1742-1 --aspect 9:16 --audio <printed manifest path>
//
// --episode takes an id, a short alias (the-1742-1) or a number; --file takes a draft.
// Clips and manifest.json go to artifacts/voice/<episode>/<lang>/ (gitignored) unless
// --out is given. The manifest's `clips` are the renderer's { line, file } entries.
// Requests run in this process through the director's narration engine and share its
// disk cache (.cache/narration/), so clips the game already played cost nothing, and
// re-running only fills gaps. SARVAM_API_KEY comes from the root .env.
import { mkdir, writeFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createNarration, NARRATION_LANGUAGES } from '../apps/director/src/narration.js';
import { voiceFor } from '../packages/voice-score/index.js';
import { normalizeEpisode } from '../apps/game/src/drama/episode-schema.js';
import { THE_1742 } from '../apps/game/src/drama/series/the-1742.js';
import {
  buildVoiceManifest,
  clipFileName,
  voicedLines,
} from '../apps/game/src/drama/voice-manifest.js';
import { wavDurationMs } from '../apps/game/src/drama/episode-voice.js';
import { additionalStops } from '../apps/game/src/world/extended-route.js';
import { LEVEL_CROSSINGS } from '../apps/game/src/world/level-crossings.js';

const root = fileURLToPath(new URL('..', import.meta.url));
const args = process.argv.slice(2);
const option = (name) => {
  const index = args.findIndex((value) => value === `--${name}` || value.startsWith(`--${name}=`));
  if (index < 0) return undefined;
  const value = args[index];
  return value.includes('=') ? value.split('=').slice(1).join('=') : args[index + 1];
};
const episodeId = option('episode');
const language = option('lang') ?? option('language') ?? 'en-IN';
const file = option('file');
const listOnly = args.includes('--list');
if (!NARRATION_LANGUAGES.some((item) => item.code === language))
  throw new Error(
    `Unsupported language ${language}. Use one of: ${NARRATION_LANGUAGES.map((item) => item.code).join(', ')}.`,
  );
const alias = /^(?:the-1742-)?(\d{1,2})$/.exec(episodeId ?? '');
const source = file
  ? JSON.parse(readFileSync(resolve(file), 'utf8'))
  : THE_1742.episodes.find((item) =>
      alias ? item.number === Number(alias[1]) : item.id === episodeId,
    );
if (!source)
  throw new Error(
    `Unknown episode. Built-in ids: ${THE_1742.episodes.map((item) => item.id).join(', ')}; or pass --file episode.json.`,
  );
const episode = normalizeEpisode(source, {
  stops: ['momiji', ...additionalStops.map((stop) => stop.id)],
  crossings: LEVEL_CROSSINGS.map((site) => site.id),
});
const lines = voicedLines(episode);
const out = resolve(option('out') ?? join(root, 'artifacts', 'voice', episode.id, language));
console.log(
  `${episode.id} · ${language}: ${lines.length} voiced lines, ${lines.reduce((sum, line) => sum + line.sourceText.length, 0)} English characters.`,
);
if (listOnly) {
  for (const line of lines)
    console.log(
      `  ${clipFileName(line)}  ${line.voice}/${line.emotion}${line.authored?.[language] ? ' (authored)' : ''}  ${line.sourceText}`,
    );
  process.exit(0);
}
const narration = createNarration({
  cacheDirectory: join(root, '.cache', 'narration'),
  concurrency: 2,
});
if (!narration.status().configured)
  throw new Error('SARVAM_API_KEY is not set. Run with the root .env (pnpm voice:episode ...).');
const model = narration.status().model;
/** Sarvam's Starter plan allows 30 bulbul:v3 requests a minute; back off on 429. */
async function withRetry(label, run) {
  for (let attempt = 0; ; attempt++) {
    try {
      return await run();
    } catch (error) {
      if (error?.status !== 429 || attempt === 4) throw new Error(`${label}: ${error.message}`);
      const waitMs = 2000 * 2 ** attempt;
      console.log(`Rate limited at ${label}; retrying in ${waitMs / 1000}s.`);
      await new Promise((done) => setTimeout(done, waitMs));
    }
  }
}
await mkdir(out, { recursive: true });
const generated = [];
for (const line of lines) {
  const name = clipFileName(line);
  const authored = language === 'en-IN' ? null : (line.authored?.[language] ?? null);
  let text = line.sourceText,
    textSource = 'original';
  if (authored) {
    text = authored;
    textSource = 'authored';
  } else if (language !== 'en-IN') {
    const translated = await withRetry(name, () =>
      narration.translate({ text: line.sourceText, language, character: line.voice }),
    );
    text = translated.text;
    textSource = 'machine';
  }
  const clip = await withRetry(name, () =>
    narration.speak({
      text,
      language,
      character: line.voice,
      emotion: line.emotion,
      priority: 'prefetch',
      ...(language === 'en-IN' ? {} : { textLanguage: language }),
    }),
  );
  const durationMs = wavDurationMs(clip.audio);
  if (!durationMs) throw new Error(`${name}: the clip is not a readable WAV.`);
  await writeFile(join(out, name), clip.audio);
  generated.push({
    ...line,
    file: name,
    durationMs,
    text,
    textSource,
    speaker: voiceFor(line.voice, line.emotion, { model, language }).speaker,
  });
  console.log(`  ${name}  ${(durationMs / 1000).toFixed(2)} s  ${text}`);
}
// Beat narration lines and the end card, so a render can show them in this language too.
const captions = {};
if (language !== 'en-IN') {
  const texts = episode.scenes.flatMap((scene) =>
    scene.beats.flatMap((beat, beatIndex) =>
      beat.line ? [[`${scene.id}/${beatIndex + 1}`, beat.line, beat.lineTranslations]] : [],
    ),
  );
  if (episode.endCard?.line) texts.push(['end', episode.endCard.line, null]);
  for (const [id, text, authored] of texts)
    captions[id] =
      authored?.[language] ??
      (await withRetry(id, () => narration.translate({ text, language }))).text;
}
const manifest = buildVoiceManifest({ episode, language, model, generated, captions });
const manifestPath = join(out, 'manifest.json');
await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
const status = narration.status();
console.log(
  `Wrote ${generated.length} clips and ${manifestPath}. Generated ${status.cache.generated}, reused ${status.cache.hits}; translated ${status.translations.translated}, reused ${status.translations.hits}.`,
);
