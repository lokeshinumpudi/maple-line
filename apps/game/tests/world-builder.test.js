import test from 'node:test';
import assert from 'node:assert/strict';
import { createGameStore } from '../src/state/game-store.js';
import { createWorldBuilder } from '../src/agent/world-builder.js';

const plan = {
  season: 'spring',
  forest: 'sparse',
  settlement: 'rural',
  weather: 'clear',
  time: 'daylight',
  seed: 42,
};
const response = (patch = {}) => ({
  ok: true,
  json: async () => ({ source: 'jev', coverage: 'supported', plan, ...patch }),
});
function setup(options = {}) {
  const store = createGameStore();
  let activations = 0,
    disposals = 0;
  const builder = createWorldBuilder({
    getState: () => store.getState().worldBuilder,
    update: (patch) => store.updateWorldBuilder(patch),
    fetcher: async () => response(),
    prepareWorld: async () => ({
      activate() {
        activations++;
      },
      dispose() {
        disposals++;
      },
    }),
    ...options,
  });
  return {
    store,
    builder,
    state: () => store.getState().worldBuilder,
    activations: () => activations,
    disposals: () => disposals,
  };
}

test('activation happens after preparation and retains driving state', async () => {
  const app = setup();
  app.store.updateDrive((state) => {
    state.speed = 12;
    state.distance = 100;
  });
  await app.builder.create('A blossom valley');
  assert.equal(app.state().status, 'active');
  assert.equal(app.state().active.source, 'jev');
  assert.equal(app.activations(), 1);
  assert.equal(app.store.getState().drive.speed, 12);
  const snapshot = app.store.snapshot();
  snapshot.worldBuilder.active.plan.seed = 7;
  assert.equal(app.state().active.plan.seed, 42);
});

test('partial requests require accepting the actual supported settings', async () => {
  const app = setup({ fetcher: async () => response({ coverage: 'partial' }) });
  await app.builder.create('A blossom valley with a castle');
  assert.equal(app.state().status, 'review');
  assert.equal(app.activations(), 0);
  await app.builder.accept();
  assert.equal(app.state().status, 'active');
  assert.equal(app.activations(), 1);
});

test('unsupported requests, failed requests and invalid plans cannot replace the active world', async () => {
  let next = response();
  const app = setup({ fetcher: async () => next });
  await app.builder.create('A blossom valley');
  const active = app.state().active;
  for (const bad of [
    response({ coverage: 'unsupported' }),
    response({ source: 'fallback' }),
    response({ plan: { ...plan, weather: 'lava' } }),
    { ok: false, status: 503, json: async () => ({ error: 'unavailable' }) },
  ]) {
    next = bad;
    await app.builder.create('A different world');
    assert.deepEqual(app.state().active, active);
    assert.equal(app.activations(), 1);
  }
});

test('cancelled network responses never start building', async () => {
  let resolve;
  const app = setup({
    fetcher: () =>
      new Promise((done) => {
        resolve = done;
      }),
  });
  const request = app.builder.create('A blossom valley');
  app.builder.cancel();
  resolve(response());
  await request;
  assert.equal(app.state().status, 'idle');
  assert.equal(app.activations(), 0);
});

test('cancelled scene preparation is disposed and never activated', async () => {
  let resolve,
    disposed = false;
  const app = setup({
    prepareWorld: () =>
      new Promise((done) => {
        resolve = done;
      }),
  });
  const request = app.builder.create('A blossom valley');
  await new Promise((done) => setImmediate(done));
  assert.equal(app.state().status, 'building');
  app.builder.cancel();
  resolve({
    activate() {
      assert.fail('Cancelled');
    },
    dispose() {
      disposed = true;
    },
  });
  await request;
  assert.equal(disposed, true);
  assert.equal(app.state().active, null);
});

test('scene preparation failures keep the previous active world', async () => {
  const app = setup({
    prepareWorld: async () => {
      throw new Error('GPU failure');
    },
  });
  app.store.updateWorldBuilder({ active: { plan, source: 'jev' } });
  await app.builder.create('A blossom valley');
  assert.equal(app.state().status, 'error');
  assert.deepEqual(app.state().active.plan, plan);
});

test('a busy response is retried once and cancellation stops the retry', async () => {
  let calls = 0;
  const app = setup({
    retryMs: 1,
    fetcher: async () => (++calls === 1 ? { status: 429 } : response()),
  });
  await app.builder.create('A blossom village');
  assert.equal(calls, 2);
  assert.equal(app.state().status, 'active');
  const cancelled = setup({
    retryMs: 5000,
    fetcher: async () => {
      calls++;
      return { status: 429 };
    },
  });
  const request = cancelled.builder.create('A snowy town');
  await new Promise((resolve) => setImmediate(resolve));
  cancelled.builder.cancel();
  await request;
  assert.equal(calls, 3);
  assert.equal(cancelled.state().status, 'idle');
});

test('server failure builds an exact bundled Jev description without claiming live generation', async () => {
  const { OFFLINE_WORLDS } = await import('../src/world/presets/offline-worlds.js');
  for (const fetcher of [
    async () => {
      throw new TypeError('Offline');
    },
    async () => ({ ok: false, status: 503 }),
    async () => ({ ok: false, status: 404 }),
    async () => ({
      ok: true,
      json: async () => {
        throw new SyntaxError('HTML from static host');
      },
    }),
  ]) {
    const app = setup({ fetcher });
    await app.builder.create(OFFLINE_WORLDS[0].prompt);
    assert.equal(app.activations(), 1);
    assert.equal(app.state().active.source, 'jev-preset');
    assert.deepEqual(app.state().active.plan, OFFLINE_WORLDS[0].plan);
    assert.match(app.state().message, /saved Jev/);
  }
});

test('unknown offline requests require review; explicit saved selection performs no fetch', async () => {
  let calls = 0;
  const app = setup({
    fetcher: async () => {
      calls++;
      throw new TypeError('Offline');
    },
  });
  await app.builder.createPreset('valley-01');
  assert.equal(calls, 0);
  const original = app.state().active;
  await app.builder.create('A pink alien planet with flying trains');
  assert.equal(app.state().status, 'review');
  assert.equal(app.state().active, original);
  assert.equal(app.activations(), 1);
  assert.equal(app.state().proposal.coverage, 'preset');
  await app.builder.accept();
  assert.equal(app.activations(), 2);
  assert.equal(app.state().active.source, 'jev-preset');
});

test('cancellation and newer saved choices suppress late failures and live responses', async () => {
  let reject;
  const app = setup({
    fetcher: () =>
      new Promise((_resolve, fail) => {
        reject = fail;
      }),
  });
  const first = app.builder.create('A winter world');
  app.builder.cancel();
  reject(new Error('Offline'));
  await first;
  assert.equal(app.state().status, 'idle');
  assert.equal(app.activations(), 0);
  const next = app.builder.create('A summer world');
  await app.builder.createPreset('valley-01');
  reject(new Error('Offline'));
  await next;
  assert.equal(app.state().active.preset.id, 'valley-01');
  assert.equal(app.activations(), 1);
});

test('deadline fallback remains usable but invalid provider plans and rejected input stay errors', async () => {
  const { OFFLINE_WORLDS } = await import('../src/world/presets/offline-worlds.js');
  const app = setup({
    timeoutMs: 5,
    fetcher: (_url, { signal }) =>
      new Promise((_resolve, reject) =>
        signal.addEventListener('abort', () => reject(new Error('Deadline'))),
      ),
  });
  await app.builder.create(OFFLINE_WORLDS[0].prompt);
  assert.equal(app.state().active.source, 'jev-preset');
  for (const fetcher of [
    async () => response({ plan: { ...plan, seed: -1 } }),
    async () => ({ ok: false, status: 400 }),
  ]) {
    const rejected = setup({ fetcher });
    await rejected.builder.create(OFFLINE_WORLDS[0].prompt);
    assert.equal(rejected.state().status, 'error');
    assert.equal(rejected.activations(), 0);
  }
});
