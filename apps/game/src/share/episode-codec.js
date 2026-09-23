import { PAYLOAD, PAYLOAD_CHARS } from './deep-link.js';

/**
 * Packs an episode into a link: JSON, raw deflate (CompressionStream), then
 * base64url with a `1.` version prefix. Decoding is written for untrusted input:
 * it checks the characters and length first, stops inflating past the byte cap
 * (so a small link cannot expand into a huge document), rejects invalid UTF-8 and
 * returns plain parsed JSON. The caller must still run the episode validator.
 */
export const EPISODE_JSON_BYTES = 65536;
const VERSION = '1.';

function toBase64Url(bytes) {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000)
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
}

function fromBase64Url(text) {
  const padded = text.replaceAll('-', '+').replaceAll('_', '/');
  let binary;
  try {
    binary = atob(padded + '='.repeat((4 - (padded.length % 4)) % 4));
  } catch {
    throw new TypeError('That shared episode link is damaged.');
  }
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function collect(readable, maxBytes) {
  const reader = readable.getReader();
  const chunks = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel().catch(() => {});
      throw new TypeError('That shared episode is larger than the game accepts.');
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

function pipe(bytes, stream) {
  const writer = stream.writable.getWriter();
  // Errors surface on the readable side; keep the writer promises from going unhandled.
  writer.write(bytes).catch(() => {});
  writer.close().catch(() => {});
  return stream.readable;
}

/** Returns the `1.<base64url>` payload for an episode. Throws if the link would be too long. */
export async function encodeEpisodePayload(episode, { maxChars = PAYLOAD_CHARS } = {}) {
  const json = new TextEncoder().encode(JSON.stringify(episode));
  if (json.byteLength > EPISODE_JSON_BYTES)
    throw new TypeError('The episode is larger than 64 KB.');
  const compressed = await collect(
    pipe(json, new CompressionStream('deflate-raw')),
    EPISODE_JSON_BYTES,
  );
  const payload = VERSION + toBase64Url(compressed);
  if (payload.length > maxChars)
    throw new RangeError(`The episode needs ${payload.length} characters; links hold ${maxChars}.`);
  return payload;
}

/** Decodes a payload to parsed JSON. Throws a TypeError with a reader-facing message. */
export async function decodeEpisodePayload(
  payload,
  { maxChars = PAYLOAD_CHARS, maxBytes = EPISODE_JSON_BYTES } = {},
) {
  if (typeof payload !== 'string' || payload.length > maxChars || !PAYLOAD.test(payload))
    throw new TypeError('That shared episode link is damaged.');
  const compressed = fromBase64Url(payload.slice(VERSION.length));
  let bytes;
  try {
    bytes = await collect(pipe(compressed, new DecompressionStream('deflate-raw')), maxBytes);
  } catch (error) {
    if (error instanceof TypeError && error.message.startsWith('That shared')) throw error;
    throw new TypeError('That shared episode link is damaged.');
  }
  let text;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    return JSON.parse(text);
  } catch {
    throw new TypeError('That shared episode link is damaged.');
  }
}
