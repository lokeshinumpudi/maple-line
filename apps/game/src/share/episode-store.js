import { encodeEpisodePayload, decodeEpisodePayload, EPISODE_JSON_BYTES } from './episode-codec.js';
import { SHARE_ID } from './deep-link.js';

/**
 * Where a shared custom episode lives. Every adapter has the same shape:
 *
 *   kind                   'url' | 'signal'
 *   save(episode)          -> Promise<link>   link is a deep-link object for buildDeepLink
 *   load(link)             -> Promise<unknown> parsed, NOT yet validated episode data
 *   handles(link)          -> boolean
 *
 * `createEpisodeSharing` puts adapters in order, validates everything it loads,
 * and falls back to the next adapter when a save fails.
 */

/** Carries the episode in the link hash. Needs no server and works on every host. */
export function createUrlEpisodeStore({ maxChars } = {}) {
  return {
    kind: 'url',
    handles: (link) => link?.kind === 'shared',
    async save(episode) {
      return { kind: 'shared', payload: await encodeEpisodePayload(episode, { maxChars }) };
    },
    load: (link) => decodeEpisodePayload(link.payload, { maxChars }),
  };
}

async function contentKey(text) {
  const digest = new Uint8Array(
    await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)),
  );
  let binary = '';
  for (const byte of digest.subarray(0, 16)) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
}

/**
 * Signal Ship site database (`signal.db(collection)`: get/set by key, about 900 KB
 * per value, per-collection read/write rules in ship.json). Keys are a hash of the
 * episode, so sharing the same episode twice gives the same short link, and the
 * `write: "author"` rule stops anyone else from replacing it.
 */
export const SIGNAL_EPISODE_COLLECTION = 'shared-episodes';
export function createSignalEpisodeStore({
  sdk = globalThis.signal,
  collection = SIGNAL_EPISODE_COLLECTION,
} = {}) {
  if (typeof sdk?.db !== 'function') return null;
  const db = () => sdk.db(collection);
  return {
    kind: 'signal',
    handles: (link) => link?.kind === 'watch',
    async save(episode) {
      const text = JSON.stringify(episode);
      if (new TextEncoder().encode(text).byteLength > EPISODE_JSON_BYTES)
        throw new TypeError('The episode is larger than 64 KB.');
      const shareId = await contentKey(text);
      const existing = await db().get(shareId);
      if (!existing) await db().set(shareId, { version: 1, episode });
      return { kind: 'watch', shareId };
    },
    async load(link) {
      if (!SHARE_ID.test(link?.shareId ?? '')) throw new TypeError('That shared link is damaged.');
      let value = await db().get(link.shareId);
      // Documents may come back wrapped as { key, data, updatedAt, updatedBy }.
      if (value && typeof value === 'object' && 'data' in value && 'updatedAt' in value)
        value = value.data;
      if (!value) throw new TypeError('That shared episode is no longer available.');
      if (value.version !== 1 || !value.episode)
        throw new TypeError('That shared episode was saved in a format this game cannot read.');
      return value.episode;
    },
  };
}

/**
 * Validates and caps everything it loads. `validate(data)` must return a detached
 * normalized episode or throw (normally normalizeEpisode with the game's stops).
 */
export function createEpisodeSharing({ stores, validate }) {
  const ordered = stores.filter(Boolean);
  return {
    stores: ordered.map((store) => store.kind),
    /** Short link from the first store that accepts the episode. */
    async save(episode) {
      const clean = validate(episode);
      let lastError;
      for (const store of ordered) {
        try {
          return await store.save(clean);
        } catch (error) {
          lastError = error;
        }
      }
      throw lastError ?? new Error('No episode store is available.');
    },
    async load(link) {
      const store = ordered.find((item) => item.handles(link));
      if (!store)
        throw new TypeError(
          link?.kind === 'watch'
            ? 'That shared episode lives in the Signal edition of Maple Line.'
            : 'That shared episode link is not supported here.',
        );
      const data = await store.load(link);
      if (new TextEncoder().encode(JSON.stringify(data) ?? '').byteLength > EPISODE_JSON_BYTES)
        throw new TypeError('That shared episode is larger than the game accepts.');
      try {
        return validate(data);
      } catch (error) {
        throw new TypeError(`That shared episode is not valid: ${error.message}`);
      }
    },
  };
}
