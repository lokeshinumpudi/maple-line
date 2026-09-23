import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseDeepLink,
  buildDeepLink,
  withoutDeepLink,
  parseSceneValue,
  PAYLOAD_CHARS,
  SHARE_ID,
} from '../src/share/deep-link.js';
import {
  encodeEpisodePayload,
  decodeEpisodePayload,
  EPISODE_JSON_BYTES,
} from '../src/share/episode-codec.js';
import {
  createEpisodeSharing,
  createUrlEpisodeStore,
  createSignalEpisodeStore,
} from '../src/share/episode-store.js';
import { shareLink } from '../src/share/share-link.js';
import { normalizeEpisode } from '../src/drama/episode-schema.js';
import { THE_1742 } from '../src/drama/series/the-1742.js';
import { additionalStops } from '../src/world/extended-route.js';
import { LEVEL_CROSSINGS } from '../src/world/level-crossings.js';

const stops = ['momiji', ...additionalStops.map((stop) => stop.id)];
const context = { stops, crossings: LEVEL_CROSSINGS.map((site) => site.id) };
const episodeIds = THE_1742.episodes.map((episode) => episode.id);
const validate = (data) => normalizeEpisode(data, context);
const parse = (href) => parseDeepLink(href, { episodeIds, stops });
const custom = () => ({
  id: 'sunday-bench',
  title: 'Sunday Bench',
  logline: 'Mr. Ishida saves a seat.',
  cast: { ishida: { name: 'Mr. Ishida' } },
  scenes: [
    {
      id: 'bench',
      heading: 'EXT. MOMIJI STATION — DUSK',
      set: { location: 'station', offset: -200, timeOfDay: 'dusk' },
      stopAt: 'momiji',
      actors: { ishida: 'reader-1' },
      beats: [
        {
          shot: { type: 'portrait', subject: { cast: 'ishida' } },
          dialogue: [{ cast: 'ishida', text: '<img src=x onerror=alert(1)> is only text here.' }],
        },
      ],
    },
  ],
});
const encodeRaw = async (text) => {
  const stream = new CompressionStream('deflate-raw');
  const writer = stream.writable.getWriter();
  writer.write(new TextEncoder().encode(text));
  writer.close();
  const bytes = new Uint8Array(await new Response(stream.readable).arrayBuffer());
  return `1.${Buffer.from(bytes).toString('base64url')}`;
};

test('episode links accept built-in ids only', () => {
  const [first] = episodeIds;
  assert.deepEqual(parse(`https://example.test/maple-line/?episode=${first}`), {
    link: { kind: 'episode', id: first },
    notice: null,
  });
  for (const bad of ['nope', 'THE-1742', '../etc', '', 'a'.repeat(41)]) {
    const result = parse(`https://example.test/?episode=${encodeURIComponent(bad)}`);
    assert.equal(result.link, null, bad);
    assert.match(result.notice, /not in this edition|could not be read/);
  }
  assert.equal(parse(`https://example.test/?episode=${first}&episode=${first}`).link, null);
});

test('place links use the scene vocabulary, in any order after the place', () => {
  assert.deepEqual(parseSceneValue('station/-380/sunset/rain', { stops }), {
    set: { location: 'station', offset: -380, timeOfDay: 'sunset', weather: 'rain' },
  });
  assert.deepEqual(parseSceneValue('bridge/cab/snow', { stops }), {
    set: { location: 'bridge', weather: 'snow' },
    camera: 'cab',
  });
  assert.deepEqual(parseSceneValue('aonuma', { stops }).set, { location: 'aonuma' });
  for (const bad of [
    '',
    'moon',
    'bridge/5000',
    'bridge/-1e3',
    'bridge/rain/snow',
    'bridge/dusk/dusk',
    'bridge/10/20',
    'bridge/director',
    'bridge/1/dusk/rain/cab/extra',
    'bridge/<script>',
    '__proto__',
  ])
    assert.throws(() => parseSceneValue(bad, { stops }), TypeError, bad);
  const result = parse('https://example.test/?scene=moon/dusk');
  assert.equal(result.link, null);
  assert.match(result.notice, /not on the line.*starts normally/);
  assert.deepEqual(parse('https://example.test/?scene=gorge%2Fdusk&utm_source=chat').link, {
    kind: 'scene',
    set: { location: 'gorge', timeOfDay: 'dusk' },
  });
});

test('shared links check their id or payload shape and one link at a time', () => {
  assert.deepEqual(parse('https://example.test/?watch=Ab3_x-9QrStUvWxYz01234').link, {
    kind: 'watch',
    shareId: 'Ab3_x-9QrStUvWxYz01234',
  });
  for (const bad of ['short', 'has space here!', 'x'.repeat(65)])
    assert.equal(parse(`https://example.test/?watch=${encodeURIComponent(bad)}`).link, null);
  assert.deepEqual(parse('https://example.test/#ep=1.abc_DEF-123').link, {
    kind: 'shared',
    payload: '1.abc_DEF-123',
  });
  assert.equal(parse('https://example.test/#ep=2.abc').link, null);
  assert.equal(parse('https://example.test/#ep=1.a+b').link, null);
  assert.match(parse(`https://example.test/#ep=1.${'a'.repeat(PAYLOAD_CHARS)}`).notice, /too long/);
  const both = parse(`https://example.test/?episode=${episodeIds[0]}#ep=1.abc`);
  assert.equal(both.link, null);
  assert.match(both.notice, /more than one/);
  assert.deepEqual(parse('https://example.test/?mode=explore#top'), { link: null, notice: null });
  assert.deepEqual(parse('not a url'), { link: null, notice: null });
});

test('links are built on the page address under every base path', () => {
  for (const base of [
    'http://127.0.0.1:4473/',
    'https://lokeshinumpudi.com/maple-line/',
    'https://signal-ship.internal.loophealth.com/s/maple-line/',
  ]) {
    const href = `${base}?episode=old#ep=1.old`;
    assert.equal(
      buildDeepLink(href, { kind: 'episode', id: episodeIds[1] }),
      `${base}?episode=${episodeIds[1]}`,
    );
    const place = buildDeepLink(href, {
      kind: 'scene',
      set: { location: 'station', offset: -380, timeOfDay: 'sunset', weather: 'rain' },
      camera: 'follow',
    });
    assert.equal(place, `${base}?scene=station/-380/sunset/rain/follow`);
    assert.deepEqual(parse(place).link, {
      kind: 'scene',
      set: { location: 'station', offset: -380, timeOfDay: 'sunset', weather: 'rain' },
      camera: 'follow',
    });
    assert.equal(buildDeepLink(href, { kind: 'shared', payload: '1.abc' }), `${base}#ep=1.abc`);
  }
  assert.throws(() => buildDeepLink('https://x.test/', { kind: 'watch', shareId: 'no' }));
  assert.equal(
    withoutDeepLink('https://x.test/maple-line/?scene=moon&utm=1#ep=1.abc'),
    'https://x.test/maple-line/?utm=1',
  );
});

test('episode payloads round-trip through deflate and base64url', async () => {
  for (const episode of [...THE_1742.episodes, custom()]) {
    const clean = validate(episode);
    const payload = await encodeEpisodePayload(clean);
    assert.match(payload, /^1\.[A-Za-z0-9_-]+$/);
    assert.ok(payload.length < JSON.stringify(clean).length, 'compressed');
    assert.deepEqual(validate(await decodeEpisodePayload(payload)), clean);
  }
});

test('payload size caps apply on both sides', async () => {
  const clean = validate(THE_1742.episodes[0]);
  await assert.rejects(encodeEpisodePayload(clean, { maxChars: 200 }), RangeError);
  const payload = await encodeEpisodePayload(clean);
  await assert.rejects(decodeEpisodePayload(payload, { maxChars: payload.length - 1 }), /damaged/);
  await assert.rejects(
    encodeEpisodePayload({ padding: 'x'.repeat(EPISODE_JSON_BYTES) }),
    /larger than 64 KB/,
  );
  // A tiny link that inflates to megabytes stops at the byte cap.
  const bomb = await encodeRaw(`{"a":"${' '.repeat(4_000_000)}"}`);
  assert.ok(bomb.length < PAYLOAD_CHARS);
  await assert.rejects(decodeEpisodePayload(bomb), /larger than the game accepts/);
});

test('malformed payloads are rejected with a plain message', async () => {
  for (const bad of [
    '1.',
    '1.!!!!',
    '1.AAAA',
    `1.${Buffer.from('not deflate at all').toString('base64url')}`,
    await encodeRaw('{"unterminated": '),
    null,
    42,
  ])
    await assert.rejects(decodeEpisodePayload(bad), /damaged/, String(bad));
  // Invalid UTF-8 inside a valid deflate stream.
  const stream = new CompressionStream('deflate-raw');
  const writer = stream.writable.getWriter();
  writer.write(new Uint8Array([0x7b, 0xff, 0xfe, 0x7d]));
  writer.close();
  const bytes = new Uint8Array(await new Response(stream.readable).arrayBuffer());
  await assert.rejects(
    decodeEpisodePayload(`1.${Buffer.from(bytes).toString('base64url')}`),
    /damaged/,
  );
});

test('shared episodes are untrusted: unknown cues, keys and oversize text are refused', async () => {
  const sharing = createEpisodeSharing({ stores: [createUrlEpisodeStore()], validate });
  const load = async (data) =>
    sharing.load({ kind: 'shared', payload: await encodeRaw(JSON.stringify(data)) });
  const good = await load(custom());
  // Markup in dialogue survives only as a string; the game renders it with textContent.
  assert.equal(
    good.scenes[0].beats[0].dialogue[0].text,
    '<img src=x onerror=alert(1)> is only text here.',
  );
  const cases = [
    (e) => (e.scenes[0].beats[0].cues = [{ after: 0, script: 'alert(1)' }]),
    (e) => (e.scenes[0].beats[0].cues = [{ after: 0, eval: 'x', doors: 'open' }]),
    (e) => (e.onload = 'alert(1)'),
    (e) => (e.scenes[0].beats[0].dialogue[0].text = 'x'.repeat(161)),
    (e) => (e.scenes[0].actors.ishida = 'reader-1"><script>'),
    (e) => (e.scenes[0].set.location = 'javascript:alert(1)'),
    (e) => (e.id = '../../etc'),
    (e) => (e.scenes = Array.from({ length: 13 }, () => e.scenes[0])),
  ];
  for (const mutate of cases) {
    const episode = custom();
    mutate(episode);
    await assert.rejects(load(episode), /not valid/, mutate.toString());
  }
  // __proto__ arrives as an own key from JSON.parse and is refused, not merged.
  const polluted = JSON.stringify(custom()).replace('{"id"', '{"__proto__":{"polluted":1},"id"');
  await assert.rejects(
    sharing.load({ kind: 'shared', payload: await encodeRaw(polluted) }),
    /not valid/,
  );
  assert.equal({}.polluted, undefined);
  await assert.rejects(load([1, 2, 3]), /not valid/);
  await assert.rejects(load('just text'), /not valid/);
});

function fakeSignal() {
  const docs = new Map();
  const calls = [];
  return {
    docs,
    calls,
    db(collection) {
      return {
        async get(key) {
          calls.push(['get', collection, key]);
          return docs.has(key) ? structuredClone(docs.get(key)) : null;
        },
        async set(key, value) {
          calls.push(['set', collection, key]);
          docs.set(key, structuredClone(value));
        },
      };
    },
  };
}

test('the Signal store keeps one document per episode and validates what it reads', async () => {
  assert.equal(createSignalEpisodeStore({ sdk: undefined }), null);
  assert.equal(createSignalEpisodeStore({ sdk: {} }), null);
  const sdk = fakeSignal();
  const sharing = createEpisodeSharing({
    stores: [createSignalEpisodeStore({ sdk }), createUrlEpisodeStore()],
    validate,
  });
  const link = await sharing.save(custom());
  assert.equal(link.kind, 'watch');
  assert.match(link.shareId, SHARE_ID);
  assert.deepEqual(await sharing.save(custom()), link);
  assert.equal(sdk.calls.filter(([kind]) => kind === 'set').length, 1);
  assert.ok(sdk.calls.every(([, collection]) => collection === 'shared-episodes'));
  assert.deepEqual(await sharing.load(link), validate(custom()));
  // Documents wrapped with metadata are unwrapped; tampered documents are refused.
  const stored = sdk.docs.get(link.shareId);
  sdk.docs.set(link.shareId, { key: link.shareId, data: stored, updatedAt: 1, updatedBy: 'a' });
  assert.equal((await sharing.load(link)).id, 'sunday-bench');
  stored.episode.scenes[0].beats[0].cues = [{ after: 0, run: 'fetch("/x")' }];
  sdk.docs.set(link.shareId, stored);
  await assert.rejects(sharing.load(link), /not valid/);
  sdk.docs.set(link.shareId, { version: 9, episode: custom() });
  await assert.rejects(sharing.load(link), /format/);
  await assert.rejects(
    sharing.load({ kind: 'watch', shareId: 'missing-episode-key' }),
    /no longer available/,
  );
});

test('saving falls back to the link when the site store fails, and watch links need Signal', async () => {
  const broken = {
    db: () => ({
      get: async () => {
        throw new Error('offline');
      },
      set: async () => {},
    }),
  };
  const sharing = createEpisodeSharing({
    stores: [createSignalEpisodeStore({ sdk: broken }), createUrlEpisodeStore()],
    validate,
  });
  assert.equal((await sharing.save(custom())).kind, 'shared');
  const publicSharing = createEpisodeSharing({ stores: [createUrlEpisodeStore()], validate });
  await assert.rejects(
    publicSharing.load({ kind: 'watch', shareId: 'Ab3_x-9QrStUvWxYz01234' }),
    /Signal edition/,
  );
  await assert.rejects(publicSharing.save({ id: 'bad' }), TypeError);
});

test('share uses the system sheet, then the clipboard, then a manual copy', async () => {
  const data = { url: 'https://x.test/?episode=a', title: 'A', text: 'B' };
  const shared = [];
  assert.equal(await shareLink(data, { nav: { share: async (d) => shared.push(d) } }), 'shared');
  assert.deepEqual(shared, [data]);
  const abort = Object.assign(new Error('cancel'), { name: 'AbortError' });
  assert.equal(
    await shareLink(data, {
      nav: {
        share: async () => {
          throw abort;
        },
      },
    }),
    'cancelled',
  );
  const copied = [];
  const clipboard = { writeText: async (text) => copied.push(text) };
  assert.equal(await shareLink(data, { nav: { clipboard } }), 'copied');
  assert.equal(
    await shareLink(data, {
      nav: {
        clipboard,
        share: async () => {
          throw Object.assign(new Error('no'), { name: 'NotAllowedError' });
        },
      },
    }),
    'copied',
  );
  assert.equal(
    await shareLink(data, { nav: { canShare: () => false, share() {}, clipboard } }),
    'copied',
  );
  assert.deepEqual(copied, [data.url, data.url, data.url]);
  assert.equal(await shareLink(data, { nav: {} }), 'manual');
});
