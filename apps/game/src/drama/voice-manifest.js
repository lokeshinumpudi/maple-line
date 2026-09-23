import {
  beatSeconds,
  readingSeconds,
  voicedSeconds,
  voiceOf,
  LINE_LEAD,
  LINE_GAP,
  BEAT_TAIL,
} from './episode-schema.js';
import { lineId } from './render-timeline.js';

/** Must match the runner's title card lead before the first beat. */
export const TITLE_LEAD_MS = 4500;
export const VOICE_MANIFEST_VERSION = 1;

// Line ids (`momiji-platform/2/1`) are shared with the video renderer's timeline.
export { lineId };

/** Every line that has a voice part, in playing order, with its stable ids. */
export function voicedLines(episode) {
  const lines = [];
  episode.scenes.forEach((scene, sceneIndex) =>
    scene.beats.forEach((beat, beatIndex) =>
      beat.dialogue.forEach((line, lineIndex) => {
        const voice = voiceOf(episode, line);
        if (voice)
          lines.push({
            line: lineId(scene.id, beatIndex, lineIndex),
            sceneIndex,
            beatIndex,
            lineIndex,
            cast: line.cast,
            voice,
            emotion: line.emotion ?? 'natural',
            sourceText: line.text,
            authored: line.translations ?? null,
          });
      }),
    ),
  );
  return lines;
}

/** Clip file name for one line: <scene id>-<beat>-<line>-<cast>.wav, numbers from 1. */
export const clipFileName = ({ line, cast }) => `${line.replaceAll('/', '-')}-${cast}.wav`;

/**
 * The audio manifest for one language. `clips` is exactly what the video renderer reads
 * ({ line, file } with paths relative to the manifest). `lines` carries the details of
 * each clip (cast, speaker, translated text, length). `plan` estimates when each line
 * starts if the train never makes a beat wait: the first beat holds for the title card,
 * a beat's first line starts one second in, a voiced line holds for its clip plus 0.2 s,
 * lines are 0.35 s apart, and a beat ends 0.9 s after its last line or at its hold.
 * `generated` rows are { line, file, durationMs, text, textSource, speaker, ... }.
 */
export function buildVoiceManifest({
  episode,
  language,
  model,
  sampleRate = 24000,
  generated,
  captions = {},
}) {
  const byLine = new Map(generated.map((clip) => [clip.line, clip]));
  const beats = [];
  const starts = new Map();
  let startMs = 0;
  episode.scenes.forEach((scene, sceneIndex) =>
    scene.beats.forEach((beat, beatIndex) => {
      const lead = sceneIndex === 0 && beatIndex === 0 ? TITLE_LEAD_MS : 0;
      const found = beat.dialogue.map((_, lineIndex) =>
        byLine.get(lineId(scene.id, beatIndex, lineIndex)),
      );
      const seconds = found.map((clip) =>
        clip && Number.isFinite(clip.durationMs) ? voicedSeconds(clip.durationMs) : undefined,
      );
      const plannedMs = Math.round(beatSeconds(beat, seconds) * 1000) + lead;
      let offset = lead + LINE_LEAD * 1000;
      const lines = beat.dialogue.map((line, lineIndex) => {
        const id = lineId(scene.id, beatIndex, lineIndex);
        const holdMs = Math.round((seconds[lineIndex] ?? readingSeconds(line.text)) * 1000);
        const entry = { line: id, offsetMs: Math.round(offset), holdMs, voiced: byLine.has(id) };
        starts.set(id, Math.round(startMs + offset));
        offset += holdMs + LINE_GAP * 1000;
        return entry;
      });
      beats.push({
        beat: `${scene.id}/${beatIndex + 1}`,
        shot: beat.shot.type,
        startMs: Math.round(startMs),
        plannedMs,
        waitFor: beat.waitFor ?? null,
        lines,
      });
      startMs += plannedMs;
    }),
  );
  const ordered = [...generated].sort(
    (a, b) => a.sceneIndex - b.sceneIndex || a.beatIndex - b.beatIndex || a.lineIndex - b.lineIndex,
  );
  return {
    version: VOICE_MANIFEST_VERSION,
    kind: 'maple-line-episode-voice',
    episode: episode.id,
    title: episode.title,
    language,
    model,
    sampleRate,
    clips: ordered.map((clip) => ({ line: clip.line, file: clip.file })),
    lines: ordered.map((clip) => ({
      line: clip.line,
      file: clip.file,
      cast: clip.cast,
      voice: clip.voice,
      speaker: clip.speaker,
      emotion: clip.emotion,
      durationMs: clip.durationMs,
      text: clip.text,
      sourceText: clip.sourceText,
      textSource: clip.textSource,
      plannedStartMs: starts.get(clip.line),
    })),
    // Beat narration lines (`<scene id>/<beat number>`) and the end card line ('end')
    // in this language, so a render can show them translated too.
    captions: { ...captions },
    plan: {
      note: 'Estimate without train waits; a render timeline gives the real times.',
      titleLeadMs: TITLE_LEAD_MS,
      lineLeadMs: LINE_LEAD * 1000,
      lineGapMs: LINE_GAP * 1000,
      beatTailMs: BEAT_TAIL * 1000,
      voicedTailMs: 200,
      plannedMs: Math.round(startMs),
      beats,
    },
  };
}

/**
 * A runner voice host that plays nothing and knows every clip's length from a manifest.
 * A video render uses it so each line holds for its clip and shows the translated
 * subtitle; the renderer mixes the audio files afterwards at the recorded line times.
 */
export function createManifestVoice(manifest) {
  const details = new Map((manifest?.lines ?? []).map((entry) => [entry.line, entry]));
  const captions = manifest?.captions ?? {};
  const find = (item) => (item.line ? details.get(item.line) : undefined);
  return {
    active: () => true,
    prepare() {},
    ready: () => true,
    text: (item) =>
      find(item)?.text ??
      (item.caption && typeof captions[item.caption] === 'string'
        ? captions[item.caption]
        : null) ??
      item.text,
    durationMs: (item) => find(item)?.durationMs ?? null,
    play(item) {
      const entry = find(item);
      if (!entry?.durationMs) return null;
      // The runner holds the line for the clip; nothing plays in the page itself.
      return { durationMs: entry.durationMs, done: true, stop() {} };
    },
    stopAll() {},
    status: () => ({
      mode: 'voice',
      language: manifest?.language ?? 'en-IN',
      requested: true,
      availability: 'manifest',
      reason: null,
    }),
  };
}
