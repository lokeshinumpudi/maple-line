/**
 * Timeline of a rendered episode, and the audio manifest that places voice lines
 * or other sounds on it. Pure data; the game records the timeline in render mode
 * and the render script (Node) turns an audio manifest into an ffmpeg mix.
 *
 * Every `t` is seconds from the first video frame.
 */
export const TIMELINE_VERSION = 1;
export const AUDIO_MANIFEST_VERSION = 1;
const MAX_CLIPS = 400;
const round = (value) => Math.round(value * 1000) / 1000;

/** Stable id for a dialogue line: scene id, 1-based beat number, 1-based line number. */
export function lineId(sceneId, beatIndex, lineIndex) {
  return `${sceneId}/${beatIndex + 1}/${lineIndex + 1}`;
}

/** Stable id for a beat: scene id and 1-based beat number (for posters). */
export function beatId(sceneId, beatIndex) {
  return `${sceneId}/${beatIndex + 1}`;
}

/** Collects runner events (see createEpisodeRunner's onEvent) with their video time. */
export function createRenderTimeline() {
  let events = [];
  return {
    reset() {
      events = [];
    },
    record(event, t) {
      if (!Number.isFinite(t) || t < 0) throw new TypeError('Timeline time must be ≥ 0.');
      events.push({ ...event, t: round(t) });
    },
    get events() {
      return events.map((event) => ({ ...event }));
    },
    /** The JSON written next to each video. */
    toManifest({ episode, fps, width, height, frames, poster = null } = {}) {
      const of = (type) => events.filter((event) => event.type === type);
      const end = of('end')[0];
      return {
        version: TIMELINE_VERSION,
        kind: 'maple-line-render-timeline',
        episode: episode
          ? {
              id: episode.id,
              series: episode.series ?? null,
              number: episode.number ?? null,
              title: episode.title,
            }
          : null,
        video: {
          fps,
          width,
          height,
          frames,
          durationSeconds: Number.isFinite(frames) && fps ? round(frames / fps) : null,
        },
        scenes: of('scene').map(({ t, id, heading, index }) => ({ t, id, heading, index })),
        beats: of('beat').map(({ t, id, scene, index, shot }) => ({ t, id, scene, index, shot })),
        lines: of('line').map(({ t, id, scene, beat, cast, speaker, text, seconds, phone }) => ({
          t,
          id,
          scene,
          beat,
          cast: cast ?? null,
          speaker,
          text,
          seconds: round(seconds),
          phone: Boolean(phone),
        })),
        endedAt: end ? end.t : null,
        poster,
      };
    },
  };
}

function fail(path, message) {
  throw new TypeError(`${path} ${message}`);
}

/**
 * Validates an audio manifest. Accepts `{ version, clips: [...] }` or a bare array of
 * clips. Each clip is `{ file, t }` or `{ file, line }` with optional `offset`
 * (seconds added to the resolved time) and `gain` (0–4, default 1). Returns a
 * normalized `{ clips }`.
 */
export function normalizeAudioManifest(input) {
  const raw = Array.isArray(input) ? { clips: input } : input;
  if (!raw || typeof raw !== 'object') fail('audio manifest', 'must be an object or an array.');
  if (raw.version !== undefined && raw.version !== AUDIO_MANIFEST_VERSION)
    fail('audio.version', `must be ${AUDIO_MANIFEST_VERSION}.`);
  if (!Array.isArray(raw.clips)) fail('audio.clips', 'must be an array.');
  if (raw.clips.length > MAX_CLIPS) fail('audio.clips', `may hold at most ${MAX_CLIPS} clips.`);
  const clips = raw.clips.map((clip, index) => {
    const path = `audio.clips[${index}]`;
    if (!clip || typeof clip !== 'object') fail(path, 'must be an object.');
    for (const key of Object.keys(clip))
      if (!['file', 't', 'line', 'offset', 'gain'].includes(key))
        fail(`${path}.${key}`, 'is not a clip field (file, t, line, offset, gain).');
    if (typeof clip.file !== 'string' || !clip.file.trim()) fail(`${path}.file`, 'needs a path.');
    const hasT = clip.t !== undefined;
    const hasLine = clip.line !== undefined;
    if (hasT === hasLine) fail(path, 'needs exactly one of t or line.');
    if (hasT && (!Number.isFinite(clip.t) || clip.t < 0)) fail(`${path}.t`, 'must be seconds ≥ 0.');
    if (hasLine && (typeof clip.line !== 'string' || !clip.line))
      fail(`${path}.line`, 'must be a line id such as momiji-platform/2/1.');
    if (clip.offset !== undefined && (!Number.isFinite(clip.offset) || Math.abs(clip.offset) > 60))
      fail(`${path}.offset`, 'must be seconds from -60 to 60.');
    if (clip.gain !== undefined && (!Number.isFinite(clip.gain) || clip.gain < 0 || clip.gain > 4))
      fail(`${path}.gain`, 'must be from 0 to 4.');
    return {
      file: clip.file,
      ...(hasT ? { t: clip.t } : { line: clip.line }),
      offset: clip.offset ?? 0,
      gain: clip.gain ?? 1,
    };
  });
  return { clips };
}

/**
 * Places each clip on the rendered timeline. Line clips take the line's start time.
 * Returns `{ clips: [{ file, start, gain, line? }], missing: [lineId] }`; clips whose
 * line was not played, or that start after the video ends, are left out.
 */
export function resolveAudioClips(manifest, timeline) {
  const { clips } = normalizeAudioManifest(manifest);
  const lines = new Map((timeline?.lines ?? []).map((line) => [line.id, line]));
  const duration = timeline?.video?.durationSeconds ?? Infinity;
  const resolved = [];
  const missing = [];
  for (const clip of clips) {
    let start;
    if (clip.line !== undefined) {
      const line = lines.get(clip.line);
      if (!line) {
        missing.push(clip.line);
        continue;
      }
      start = line.t + clip.offset;
    } else start = clip.t + clip.offset;
    start = round(Math.max(0, start));
    if (start >= duration) continue;
    resolved.push({
      file: clip.file,
      start,
      gain: clip.gain,
      ...(clip.line !== undefined ? { line: clip.line } : {}),
    });
  }
  resolved.sort((a, b) => a.start - b.start);
  return { clips: resolved, missing };
}

/**
 * ffmpeg filter graph that delays each clip to its start and mixes them into one
 * stereo 48 kHz track exactly `durationSeconds` long. Audio inputs start at
 * `firstInput` (the video is input 0). Output label: [aout].
 */
export function audioFilterGraph(clips, { durationSeconds, firstInput = 1 } = {}) {
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0)
    throw new TypeError('durationSeconds must be positive.');
  const duration = round(durationSeconds);
  if (!clips.length)
    return `anullsrc=channel_layout=stereo:sample_rate=48000,atrim=0:${duration}[aout]`;
  const parts = clips.map((clip, index) => {
    const ms = Math.round(clip.start * 1000);
    return (
      `[${firstInput + index}:a]aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo,` +
      `volume=${clip.gain},adelay=${ms}|${ms}[a${index}]`
    );
  });
  const labels = clips.map((_, index) => `[a${index}]`).join('');
  parts.push(
    `${labels}amix=inputs=${clips.length}:duration=longest:normalize=0,` +
      `apad=whole_dur=${duration},atrim=0:${duration}[aout]`,
  );
  return parts.join(';');
}
