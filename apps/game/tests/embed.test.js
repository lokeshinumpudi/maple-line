import test from 'node:test';
import assert from 'node:assert/strict';
import { EMBED_CHANNEL, installEmbedBridge, validateEmbedConfig } from '../src/embed/bridge.js';
import viteConfig from '../vite.config.js';

for (const config of [
  { paused: 'false' },
  { weather: 'storm' },
  { location: 1 },
  { script: 'run' },
  null,
  [],
]) {
  test(`embed rejects malformed config ${JSON.stringify(config)}`, () => {
    assert.throws(() => validateEmbedConfig(config), TypeError);
  });
}
test('embed checks source and origin, rejects the whole invalid config, and disposes', () => {
  let listener,
    removed,
    writes = 0,
    suspended;
  const replies = [];
  const parent = { postMessage: (data, origin) => replies.push({ data, origin }) };
  const environment = {
    parent,
    location: { origin: 'https://example.com' },
    addEventListener: (_, handler) => {
      listener = handler;
    },
    removeEventListener: (_, handler) => {
      removed = handler;
    },
  };
  const dispose = installEmbedBridge({
    environment,
    configure: () => {
      writes++;
    },
    snapshot: () => ({ paused: true }),
    suspend: (value) => {
      suspended = value;
    },
  });
  const send = (data, extra = {}) =>
    listener({
      source: parent,
      origin: environment.location.origin,
      data: { channel: EMBED_CHANNEL, id: '1', ...data },
      ...extra,
    });
  send({ type: 'configure', config: { weather: 'rain' } }, { origin: 'https://unrelated.example' });
  send({ type: 'configure', config: { weather: 'rain' } }, { source: {} });
  assert.equal(writes, 0);
  assert.equal(replies.length, 0);
  send({ type: 'configure', config: { weather: 'rain', paused: 'false' } });
  assert.equal(writes, 0);
  assert.match(replies.at(-1).data.error, /boolean/);
  send({ type: 'configure', config: { weather: 'rain', paused: false } });
  assert.equal(writes, 1);
  assert.deepEqual(replies.at(-1).data.state, { paused: true });
  send({ type: 'visibility', visible: false });
  assert.equal(suspended, true);
  send({ type: 'snapshot' });
  assert.equal(writes, 1);
  send({ type: 'eval' });
  assert.match(replies.at(-1).data.error, /Unknown/);
  dispose();
  assert.equal(removed, listener);
});
for (const mode of ['ship', 'public', 'ship-embed', 'public-embed']) {
  test(`${mode} keeps credit and guide destinations on the matching host`, () => {
    const { plugins } = viteConfig({ mode });
    const result = plugins[0].transformIndexHtml(
      '<html lang="en"><head></head><a href="https://signal.internal.loophealth.com">credit</a><a href="https://signal-ship.internal.loophealth.com/s/maple-line-runbook/">guide</a>',
    );
    if (mode.startsWith('public')) {
      assert.ok(result.includes('https://lokeshinumpudi.com/maple-line-runbook/'));
      assert.ok(!result.includes('loophealth.com'));
    } else {
      assert.ok(result.includes('signal.internal.loophealth.com'));
      assert.ok(!result.includes('lokeshinumpudi.com'));
    }
    if (mode.endsWith('-embed')) {
      assert.ok(result.includes('data-hosting="static"'));
      assert.ok(!result.includes('/sdk/v1/signal.js'));
    }
  });
}

test('visual overrides reject invalid ranges and accept explicit resets', () => {
  for (const bad of [
    { fov: 0 },
    { fov: 91 },
    { roughness: 2 },
    { exposure: NaN },
    { fogDensity: -1 },
    { shadows: 'yes' },
    { wireframe: 1 },
  ])
    assert.throws(() => validateEmbedConfig(bad), TypeError);
  const config = {
    fov: 60,
    exposure: null,
    roughness: 0.8,
    fogDensity: 0.004,
    shadows: false,
    wireframe: true,
  };
  assert.deepEqual(validateEmbedConfig(config), config);
});

test('chapter inspection controls validate before changing any scene state', () => {
  const config = {
    focus: 'water',
    surface: 'clay',
    isolation: 'subject',
    waterReflection: 0,
    waterRipples: 2.5,
    waterSpeed: 0,
    windStrength: 3,
  };
  assert.deepEqual(validateEmbedConfig(config), config);
  for (const invalid of [
    { waterRipples: 4 },
    { waterDepth: -1 },
    { waterReflection: Infinity },
    { focus: 'unknown' },
    { surface: 'script' },
    { windStrength: -1 },
  ])
    assert.throws(() => validateEmbedConfig(invalid));
});

test('embed validates screen coordinates before ray inspection', () => {
  let listener,
    calls = 0;
  const replies = [];
  const parent = { postMessage: (reply) => replies.push(reply) };
  installEmbedBridge({
    environment: {
      parent,
      location: { origin: 'https://example.com' },
      addEventListener: (_, fn) => {
        listener = fn;
      },
    },
    configure() {},
    suspend() {},
    snapshot: () => ({}),
    inspect: (x, y) => {
      calls++;
      return { x, y };
    },
  });
  for (const x of [2, NaN, '0', 0])
    listener({
      source: parent,
      origin: 'https://example.com',
      data: { channel: EMBED_CHANNEL, id: 'pick', type: 'inspect', x, y: 0 },
    });
  assert.equal(calls, 1);
  assert.ok(replies.slice(0, 3).every((reply) => reply.error));
  assert.deepEqual(replies[3].state.selection, { x: 0, y: 0 });
});
