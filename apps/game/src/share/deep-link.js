import { SCENE_PLACES, SCENE_TIMES, SCENE_WEATHER, SCENE_OFFSET } from '../drama/episode-schema.js';

/**
 * Links that open the game somewhere specific. Every value is checked against a
 * fixed vocabulary before the game acts on it; anything else is ignored and the
 * caller shows a short notice and starts the ride normally.
 *
 *   ?episode=<id>                      a built-in episode
 *   ?scene=<place>[/<offset>][/<time>][/<weather>][/<camera>]
 *                                      a place, using the episode scene vocabulary;
 *                                      after the place, segments may come in any order
 *   ?watch=<shareId>                   a custom episode kept in the Signal site store
 *   #ep=1.<payload>                    a custom episode carried in the link itself
 */
export const LINK_CAMERAS = Object.freeze(['scenic', 'follow', 'cab', 'passenger', 'vista']);
export const SHARE_ID = /^[A-Za-z0-9_-]{8,64}$/;
export const EPISODE_ID = /^[a-z0-9-]{1,40}$/;
export const PAYLOAD = /^1\.[A-Za-z0-9_-]+$/;
/** Longest `#ep=` payload accepted, in characters. */
export const PAYLOAD_CHARS = 12000;
const PARAM_CHARS = 200;
const OFFSET = /^[+-]?\d{1,4}(\.\d{1,2})?$/;
const KEYS = ['episode', 'scene', 'watch'];

const invalid = (notice) => ({ link: null, notice });

/** Parses a place link body such as `station/-380/sunset/rain`. Throws a TypeError. */
export function parseSceneValue(value, { stops = [] } = {}) {
  if (typeof value !== 'string' || !value.length || value.length > PARAM_CHARS)
    throw new TypeError('The place link is empty or too long.');
  const [location, ...rest] = value.split('/');
  if (![...SCENE_PLACES, ...stops].includes(location))
    throw new TypeError('The place link names a place that is not on the line.');
  if (rest.length > 4) throw new TypeError('The place link has too many parts.');
  const set = { location };
  let camera;
  for (const part of rest) {
    if (OFFSET.test(part)) {
      const offset = Number(part);
      if (set.offset !== undefined || offset < SCENE_OFFSET.min || offset > SCENE_OFFSET.max)
        throw new TypeError(
          `The place offset must appear once, from ${SCENE_OFFSET.min} to ${SCENE_OFFSET.max} m.`,
        );
      set.offset = offset;
    } else if (SCENE_TIMES.includes(part)) {
      if (set.timeOfDay) throw new TypeError('The place link sets the time twice.');
      set.timeOfDay = part;
    } else if (SCENE_WEATHER.includes(part)) {
      if (set.weather) throw new TypeError('The place link sets the weather twice.');
      set.weather = part;
    } else if (LINK_CAMERAS.includes(part)) {
      if (camera) throw new TypeError('The place link sets the camera twice.');
      camera = part;
    } else throw new TypeError('The place link has a part the game does not know.');
  }
  return camera ? { set, camera } : { set };
}

/** Writes a place link body in a fixed order. The inverse of parseSceneValue. */
export function formatSceneValue({ set, camera }) {
  return [
    set.location,
    set.offset === undefined ? null : String(Math.round(set.offset)),
    set.timeOfDay ?? null,
    set.weather ?? null,
    camera ?? null,
  ]
    .filter((part) => part !== null)
    .join('/');
}

/**
 * Reads the deep link from a URL. Returns `{ link, notice }`: `link` is null when
 * there is nothing to open, and `notice` is set when something was there but is
 * not usable. Unrelated query parameters (for example campaign tags) are ignored.
 */
export function parseDeepLink(href, { episodeIds = [], stops = [] } = {}) {
  let url;
  try {
    url = new URL(href);
  } catch {
    return { link: null, notice: null };
  }
  const params = url.searchParams;
  const hash = new URLSearchParams(url.hash.replace(/^#/, ''));
  const present = KEYS.filter((key) => params.has(key));
  const payloads = hash.getAll('ep');
  if (present.length + (payloads.length ? 1 : 0) > 1)
    return invalid('That link asks for more than one thing, so the ride starts normally.');
  if (payloads.length) {
    if (payloads.length > 1) return invalid('That shared episode link is damaged.');
    const [payload] = payloads;
    if (payload.length > PAYLOAD_CHARS)
      return invalid('That shared episode is too long to open from a link.');
    if (!PAYLOAD.test(payload)) return invalid('That shared episode link is damaged.');
    return { link: { kind: 'shared', payload }, notice: null };
  }
  if (!present.length) return { link: null, notice: null };
  const [key] = present;
  const values = params.getAll(key);
  if (values.length !== 1 || values[0].length > PARAM_CHARS)
    return invalid('That link could not be read, so the ride starts normally.');
  const [value] = values;
  if (key === 'episode') {
    if (!EPISODE_ID.test(value) || !episodeIds.includes(value))
      return invalid('That episode is not in this edition of Maple Line. Pick one under Places.');
    return { link: { kind: 'episode', id: value }, notice: null };
  }
  if (key === 'watch') {
    if (!SHARE_ID.test(value)) return invalid('That shared episode link is damaged.');
    return { link: { kind: 'watch', shareId: value }, notice: null };
  }
  try {
    return { link: { kind: 'scene', ...parseSceneValue(value, { stops }) }, notice: null };
  } catch (error) {
    return invalid(`${error.message} The ride starts normally.`);
  }
}

/**
 * Builds the link for a place, an episode or a shared episode on the page's own
 * address, so it works at `/`, `/maple-line/` and `/s/maple-line/` alike.
 */
export function buildDeepLink(href, link) {
  const url = new URL(href);
  url.search = '';
  url.hash = '';
  if (link.kind === 'episode') {
    if (!EPISODE_ID.test(link.id)) throw new TypeError('Episode ids are lowercase words.');
    url.searchParams.set('episode', link.id);
  } else if (link.kind === 'scene') {
    url.searchParams.set('scene', formatSceneValue(link));
  } else if (link.kind === 'watch') {
    if (!SHARE_ID.test(link.shareId)) throw new TypeError('Invalid share id.');
    url.searchParams.set('watch', link.shareId);
  } else if (link.kind === 'shared') {
    if (!PAYLOAD.test(link.payload) || link.payload.length > PAYLOAD_CHARS)
      throw new TypeError('Invalid episode payload.');
    url.hash = `ep=${link.payload}`;
  } else throw new TypeError('Unknown link kind.');
  // URLSearchParams escapes "/" in the place link; keep it readable.
  return url.href.replace(/scene=([^&#]*)/, (_, body) => `scene=${body.replaceAll('%2F', '/')}`);
}

/** The page address without any deep link, for replacing a link that was not usable. */
export function withoutDeepLink(href) {
  const url = new URL(href);
  for (const key of KEYS) url.searchParams.delete(key);
  const hash = new URLSearchParams(url.hash.replace(/^#/, ''));
  if (hash.has('ep')) url.hash = '';
  return url.href;
}
