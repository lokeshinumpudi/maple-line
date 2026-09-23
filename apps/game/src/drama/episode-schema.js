import { normalizeShot } from '../camera/director.js';
import { MOODS, INTENTS, MIND_EVENTS, ENTITY_ID_PATTERN } from '../simulation/npc-minds.js';
import { NARRATION_LANGUAGES, VOICE_CAST, VOICE_DELIVERY } from '@maple-line/voice-score';

/**
 * Episode format for short dramas staged in the running game. An episode is data:
 * a cast, scenes with scene settings, and beats. Each beat is one shot plus timed
 * dialogue and cues. Nothing here runs code or markup; text is shown with
 * textContent, and every enum matches the director and NPC minds whitelists.
 *
 * Episode:
 *   { id, series?, number?, title, logline?, cast: { [castId]: { name, note?, voice? } },
 *     scenes: [Scene], endCard?: { title?, line? } }
 * Scene:
 *   { id, heading, set?: { location, offset?, timeOfDay?, weather?, speedKmh? },
 *     stopAt?: stopId, actors?: { [castId]: entityId }, beats: [Beat] }
 * Beat:
 *   { shot: Shot, caption?, subtitle?, line?, lineTranslations?, dialogue?: [Line], hold?,
 *     waitFor?, cues?: [Cue] }
 *   Shot subjects may also be { cast: castId } or { crossing: crossingId }.
 * Line:  { cast?: castId, speaker?: text, text, phone?: boolean, emotion?, translations? }
 *
 * Voice (all optional, so older episodes stay valid): a cast member's `voice` names a
 * VOICE_CAST part; without it a cast id that is itself a VOICE_CAST part uses that voice.
 * `emotion` is a VOICE_DELIVERY name. `translations` / `lineTranslations` map a language
 * code (for example `te-IN`) to hand-written text that wins over machine translation.
 * Cue:   { after, doors? | event? | weather? | direct? | release? }
 */
export const EPISODE_LIMITS = Object.freeze({
  scenes: 12,
  beatsPerScene: 30,
  linesPerBeat: 12,
  cuesPerBeat: 12,
  cast: 16,
  text: 160,
});
const ID = /^[a-z0-9-]{1,40}$/;
/** Scene `set.location` places besides stop ids; shared with place deep links. */
export const SCENE_PLACES = Object.freeze([
  'gorge',
  'terraces',
  'village',
  'shrine',
  'station',
  'city',
  'tokyo',
  'bridge',
  'tunnel',
  'summit',
]);
export const SCENE_TIMES = Object.freeze(['daylight', 'sunrise', 'sunset', 'dusk']);
export const SCENE_WEATHER = Object.freeze(['clear', 'rain', 'snow', 'storm']);
/** `set.offset` range in metres. */
export const SCENE_OFFSET = Object.freeze({ min: -2000, max: 2000 });
const PLACES = SCENE_PLACES;
const TIMES = SCENE_TIMES;
const WEATHER = SCENE_WEATHER;
export const EPISODE_LANGUAGES = NARRATION_LANGUAGES.map((language) => language.code);
const TRANSLATED_TEXT = 320;
/** Seconds between the start of a beat and its first line, between lines, and after the last. */
export const LINE_LEAD = 1;
export const LINE_GAP = 0.35;
export const BEAT_TAIL = 0.9;

function fail(path, message) {
  throw new TypeError(`${path} ${message}`);
}
function record(value, path) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(path, 'must be an object.');
  return value;
}
function only(value, keys, path) {
  for (const key of Object.keys(value))
    if (!keys.includes(key)) fail(`${path}.${key}`, 'is not allowed.');
}
function text(value, path, max = EPISODE_LIMITS.text, { optional = false } = {}) {
  if (value === undefined && optional) return undefined;
  if (typeof value !== 'string' || !value.trim().length || value.length > max)
    fail(path, `must be text of 1–${max} characters.`);
  return value;
}
function number(value, path, min, max, { optional = false } = {}) {
  if (value === undefined && optional) return undefined;
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max)
    fail(path, `must be a number from ${min} to ${max}.`);
  return value;
}
function oneOf(value, allowed, path, { optional = false } = {}) {
  if (value === undefined && optional) return undefined;
  if (!allowed.includes(value)) fail(path, `must be one of: ${allowed.join(', ')}.`);
  return value;
}
function list(value, path, max, { allowEmpty = false } = {}) {
  const min = allowEmpty ? 0 : 1;
  if (!Array.isArray(value) || value.length < min || value.length > max)
    fail(path, `must be a list of ${min}–${max} items.`);
  return value;
}
const clean = (object) =>
  Object.fromEntries(Object.entries(object).filter(([, value]) => value !== undefined));
/** Hand-written per-language text. English is the authored text itself. */
function translations(value, path) {
  if (value === undefined) return undefined;
  const map = record(value, path);
  const result = {};
  for (const [code, entry] of Object.entries(map)) {
    if (code === 'en-IN' || !EPISODE_LANGUAGES.includes(code))
      fail(`${path}.${code}`, `must be one of: ${EPISODE_LANGUAGES.slice(1).join(', ')}.`);
    result[code] = text(entry, `${path}.${code}`, TRANSLATED_TEXT);
  }
  return Object.keys(result).length ? result : undefined;
}

/** Validates an episode and returns a detached, normalized copy. */
export function normalizeEpisode(input, { stops = [], crossings = [] } = {}) {
  const episode = record(input, 'episode');
  only(
    episode,
    ['id', 'series', 'number', 'title', 'logline', 'cast', 'scenes', 'endCard'],
    'episode',
  );
  if (typeof episode.id !== 'string' || !ID.test(episode.id))
    fail('episode.id', 'must be 1–40 lowercase letters, digits or hyphens.');
  const cast = record(episode.cast ?? {}, 'episode.cast');
  const castIds = Object.keys(cast);
  if (castIds.length > EPISODE_LIMITS.cast)
    fail('episode.cast', `may name at most ${EPISODE_LIMITS.cast} people.`);
  const normalizedCast = {};
  for (const id of castIds) {
    if (!ID.test(id)) fail(`episode.cast.${id}`, 'needs a lowercase id.');
    const member = record(cast[id], `episode.cast.${id}`);
    only(member, ['name', 'note', 'voice'], `episode.cast.${id}`);
    normalizedCast[id] = clean({
      name: text(member.name, `episode.cast.${id}.name`, 40),
      note: text(member.note, `episode.cast.${id}.note`, 200, { optional: true }),
      voice: oneOf(member.voice, Object.keys(VOICE_CAST), `episode.cast.${id}.voice`, {
        optional: true,
      }),
    });
  }
  const places = [...PLACES, ...stops];
  const castRef = (value, path) => {
    if (!castIds.includes(value)) fail(path, `must name a cast member (${castIds.join(', ')}).`);
    return value;
  };
  const scenes = list(episode.scenes, 'episode.scenes', EPISODE_LIMITS.scenes).map((raw, s) => {
    const path = `episode.scenes[${s}]`;
    const scene = record(raw, path);
    only(scene, ['id', 'heading', 'set', 'stopAt', 'actors', 'beats'], path);
    if (typeof scene.id !== 'string' || !ID.test(scene.id))
      fail(`${path}.id`, 'needs a lowercase id.');
    let set;
    if (scene.set !== undefined) {
      const raw = record(scene.set, `${path}.set`);
      only(raw, ['location', 'offset', 'timeOfDay', 'weather', 'speedKmh'], `${path}.set`);
      set = clean({
        location: oneOf(raw.location, places, `${path}.set.location`, { optional: true }),
        offset: number(raw.offset, `${path}.set.offset`, SCENE_OFFSET.min, SCENE_OFFSET.max, {
          optional: true,
        }),
        timeOfDay: oneOf(raw.timeOfDay, TIMES, `${path}.set.timeOfDay`, { optional: true }),
        weather: oneOf(raw.weather, WEATHER, `${path}.set.weather`, { optional: true }),
        speedKmh: number(raw.speedKmh, `${path}.set.speedKmh`, 0, 120, { optional: true }),
      });
      if (set.offset !== undefined && set.location === undefined)
        fail(`${path}.set.offset`, 'needs a location.');
    }
    const stopAt = oneOf(scene.stopAt, stops, `${path}.stopAt`, { optional: true });
    const actors = {};
    for (const [castId, entity] of Object.entries(record(scene.actors ?? {}, `${path}.actors`))) {
      castRef(castId, `${path}.actors.${castId}`);
      if (typeof entity !== 'string' || !ENTITY_ID_PATTERN.test(entity))
        fail(`${path}.actors.${castId}`, 'must be a character id such as commuter-2.');
      actors[castId] = entity;
    }
    const beats = list(scene.beats, `${path}.beats`, EPISODE_LIMITS.beatsPerScene).map(
      (rawBeat, b) => {
        const at = `${path}.beats[${b}]`;
        const beat = record(rawBeat, at);
        only(
          beat,
          [
            'shot',
            'caption',
            'subtitle',
            'line',
            'lineTranslations',
            'dialogue',
            'hold',
            'waitFor',
            'cues',
          ],
          at,
        );
        const rawShot = record(beat.shot, `${at}.shot`);
        let subject = rawShot.subject;
        const episodeSubject =
          subject && typeof subject === 'object' && ('cast' in subject || 'crossing' in subject);
        if (episodeSubject) {
          only(subject, ['cast', 'crossing'], `${at}.shot.subject`);
          if ('cast' in subject) {
            castRef(subject.cast, `${at}.shot.subject.cast`);
            if (!actors[subject.cast])
              fail(`${at}.shot.subject.cast`, 'needs an actor for this cast member in the scene.');
            subject = { cast: subject.cast };
          } else
            subject = {
              crossing: oneOf(subject.crossing, crossings, `${at}.shot.subject.crossing`),
            };
        }
        let shot;
        try {
          shot = normalizeShot({
            ...rawShot,
            ...(episodeSubject ? { subject: { point: [0, 0, 0] } } : {}),
          });
        } catch (error) {
          fail(`${at}.shot:`, error.message);
        }
        if (shot.set) fail(`${at}.shot.set`, 'belongs on the scene, not the shot.');
        if (episodeSubject) shot.subject = subject;
        const dialogue = (
          beat.dialogue === undefined
            ? []
            : // Empty lists are accepted so a normalized episode validates again.
              list(beat.dialogue, `${at}.dialogue`, EPISODE_LIMITS.linesPerBeat, {
                allowEmpty: true,
              })
        ).map((rawLine, l) => {
          const lineAt = `${at}.dialogue[${l}]`;
          const line = record(rawLine, lineAt);
          only(line, ['cast', 'speaker', 'text', 'phone', 'emotion', 'translations'], lineAt);
          if (line.cast === undefined && line.speaker === undefined)
            fail(lineAt, 'needs a cast id or a speaker label.');
          if (line.phone !== undefined && typeof line.phone !== 'boolean')
            fail(`${lineAt}.phone`, 'must be true or false.');
          return clean({
            cast: line.cast === undefined ? undefined : castRef(line.cast, `${lineAt}.cast`),
            speaker: text(line.speaker, `${lineAt}.speaker`, 40, { optional: true }),
            text: text(line.text, `${lineAt}.text`),
            phone: line.phone,
            emotion: oneOf(line.emotion, Object.keys(VOICE_DELIVERY), `${lineAt}.emotion`, {
              optional: true,
            }),
            translations: translations(line.translations, `${lineAt}.translations`),
          });
        });
        const cues = (
          beat.cues === undefined
            ? []
            : list(beat.cues, `${at}.cues`, EPISODE_LIMITS.cuesPerBeat, { allowEmpty: true })
        ).map((rawCue, c) => {
          const cueAt = `${at}.cues[${c}]`;
          const cue = record(rawCue, cueAt);
          only(cue, ['after', 'doors', 'event', 'weather', 'direct', 'release'], cueAt);
          const actions = ['doors', 'event', 'weather', 'direct', 'release'].filter(
            (key) => cue[key] !== undefined,
          );
          if (actions.length !== 1) fail(cueAt, 'needs exactly one action.');
          const result = { after: number(cue.after ?? 0, `${cueAt}.after`, 0, 120) };
          if (cue.doors !== undefined)
            result.doors = oneOf(cue.doors, ['open', 'close'], `${cueAt}.doors`);
          if (cue.event !== undefined)
            result.event = oneOf(cue.event, MIND_EVENTS, `${cueAt}.event`);
          if (cue.weather !== undefined)
            result.weather = oneOf(cue.weather, WEATHER, `${cueAt}.weather`);
          if (cue.release !== undefined) {
            if (cue.release !== true) fail(`${cueAt}.release`, 'must be true.');
            result.release = true;
          }
          if (cue.direct !== undefined) {
            const direct = record(cue.direct, `${cueAt}.direct`);
            only(direct, ['cast', 'mood', 'intent', 'hold'], `${cueAt}.direct`);
            castRef(direct.cast, `${cueAt}.direct.cast`);
            if (!actors[direct.cast])
              fail(`${cueAt}.direct.cast`, 'needs an actor for this cast member in the scene.');
            if (direct.mood === undefined && direct.intent === undefined)
              fail(`${cueAt}.direct`, 'needs a mood, an intent or both.');
            result.direct = clean({
              cast: direct.cast,
              mood: oneOf(direct.mood, MOODS, `${cueAt}.direct.mood`, { optional: true }),
              intent: oneOf(direct.intent, INTENTS, `${cueAt}.direct.intent`, { optional: true }),
              hold: number(direct.hold ?? 30, `${cueAt}.direct.hold`, 1, 300),
            });
          }
          return result;
        });
        if (beat.lineTranslations !== undefined && beat.line === undefined)
          fail(`${at}.lineTranslations`, 'needs a line to translate.');
        if (cues.some((cue) => cue.release) && !stopAt)
          fail(`${at}.cues`, 'release only applies to a scene with stopAt.');
        return clean({
          shot,
          caption: text(beat.caption, `${at}.caption`, 80, { optional: true }),
          subtitle: text(beat.subtitle, `${at}.subtitle`, 80, { optional: true }),
          line: text(beat.line, `${at}.line`, EPISODE_LIMITS.text, { optional: true }),
          lineTranslations: translations(beat.lineTranslations, `${at}.lineTranslations`),
          dialogue,
          hold: number(beat.hold, `${at}.hold`, 1, 90, { optional: true }),
          waitFor: oneOf(beat.waitFor, ['stopped', 'doors-closed'], `${at}.waitFor`, {
            optional: true,
          }),
          cues,
        });
      },
    );
    return clean({
      id: scene.id,
      heading: text(scene.heading, `${path}.heading`, 100),
      set,
      stopAt,
      actors,
      beats,
    });
  });
  let endCard;
  if (episode.endCard !== undefined) {
    const raw = record(episode.endCard, 'episode.endCard');
    only(raw, ['title', 'line'], 'episode.endCard');
    endCard = clean({
      title: text(raw.title, 'episode.endCard.title', 80, { optional: true }),
      line: text(raw.line, 'episode.endCard.line', EPISODE_LIMITS.text, { optional: true }),
    });
  }
  return clean({
    id: episode.id,
    series: text(episode.series, 'episode.series', 60, { optional: true }),
    number: number(episode.number, 'episode.number', 1, 99, { optional: true }),
    title: text(episode.title, 'episode.title', 80),
    logline: text(episode.logline, 'episode.logline', 300, { optional: true }),
    cast: normalizedCast,
    scenes,
    endCard,
  });
}

/** Seconds a viewer needs to read a subtitle: about 180 words per minute, within bounds. */
export function readingSeconds(value) {
  const words = String(value).trim().split(/\s+/).filter(Boolean).length;
  return Math.min(7, Math.max(1.8, 0.9 + words * 0.33));
}

/** How long a voiced line keeps the floor: the clip plus a breath, never a flash. */
export function voicedSeconds(durationMs) {
  return Math.max(1.2, durationMs / 1000 + 0.2);
}

/** The voice part that speaks a line, or null for a line that stays subtitles only. */
export function voiceOf(episode, line) {
  if (!line.cast) return null;
  const voice = episode.cast[line.cast]?.voice ?? line.cast;
  return Object.hasOwn(VOICE_CAST, voice) ? voice : null;
}

/**
 * Seconds each line occupies: the voice clip when one is known (seconds[i] is a
 * number), otherwise reading time. Also used by the video renderer's audio manifest.
 */
export function lineSeconds(beat, seconds = []) {
  return beat.dialogue.map((line, index) =>
    Number.isFinite(seconds[index]) ? seconds[index] : readingSeconds(line.text),
  );
}

/**
 * Planned length of a beat before any wait: lead-in, every line, and a short tail.
 * Pass per-line seconds (voicedSeconds of each clip) to plan a voiced beat.
 */
export function beatSeconds(beat, seconds) {
  const speech = lineSeconds(beat, seconds).reduce((sum, value) => sum + value + LINE_GAP, 0);
  const cues = beat.cues.reduce((latest, cue) => Math.max(latest, cue.after + 1), 0);
  return Math.max(beat.hold ?? 4, beat.dialogue.length ? LINE_LEAD + speech + BEAT_TAIL : 0, cues);
}

/** Planned episode length in seconds, excluding waits for the train. */
export function episodeSeconds(episode) {
  return episode.scenes.reduce(
    (sum, scene) => sum + scene.beats.reduce((total, beat) => total + beatSeconds(beat), 0),
    0,
  );
}
