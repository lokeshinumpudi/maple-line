import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {
  INTENTS,
  JEV_HOLD_SECONDS,
  MAX_JEV_BATCH,
  MIN_INTENT_DWELL,
  MOODS,
  createNpcMinds,
  mindRole,
} from '../src/simulation/npc-minds.js';
import { createMindsClient, mindRegion } from '../src/agent/minds-client.js';
import { registerMindTools } from '../src/agent/mind-tools.js';
import { registerGameWebMCP } from '../src/agent/webmcp.js';
import { MAX_MIND_BOARDING_DELAY, createPopulation } from '../src/simulation/population.js';
import { createRegionalResidents } from '../src/world/regional-residents.js';
import { addWorldDetails } from '../src/world/world-details.js';

const clear = { weather: 'clear', dusk: false, region: 'station', trainSpeed: 20 };
// Characters spaced 10 m apart: nobody has a neighbour, so intent availability stays constant.
function populate(minds, count = 8, extra = {}) {
  for (let i = 0; i < count; i++)
    minds.sense(
      extra.prefix ? `${extra.prefix}-${i}` : `p-${i}`,
      ['office commuter', 'school student', 'retired neighbour', 'vendor'][i % 4],
      i * 10,
      0,
      false,
      extra.platform ?? false,
      true,
      'waiting',
    );
}
function run(minds, seconds, context = clear, count = 8, extra = {}) {
  for (let t = 0; t < seconds; t += 0.1) {
    populate(minds, count, extra);
    minds.tick(0.1, context);
  }
}

test('same seed and inputs reproduce every mind; another seed differs', () => {
  const a = createNpcMinds({ seed: 7 });
  const b = createNpcMinds({ seed: 7 });
  const c = createNpcMinds({ seed: 8 });
  for (const minds of [a, b, c]) run(minds, 60);
  assert.deepEqual(a.getState(), b.getState());
  assert.notDeepEqual(
    a.getState().entities.map((e) => e.persona),
    c.getState().entities.map((e) => e.persona),
  );
  for (const entity of a.getState().entities) {
    assert.ok(MOODS.includes(entity.mood));
    assert.ok(INTENTS.includes(entity.intent));
    assert.equal(entity.source, 'local');
    for (const value of Object.values(entity.persona)) assert.ok(value >= 0.05 && value <= 0.95);
  }
  assert.ok(new Set(a.getState().entities.map((e) => e.localIntent)).size > 1);
});

test('role labels from both populations map onto the whitelist', () => {
  assert.equal(mindRole('office commuter'), 'commuter');
  assert.equal(mindRole('retired newspaper reader'), 'reader');
  assert.equal(mindRole('conversation'), 'neighbour');
  assert.equal(mindRole('vendor'), 'vendor');
  assert.equal(mindRole('unknown role'), 'traveller');
});

test('rain onset lowers comfort and valence; sheltering recovers comfort', () => {
  const minds = createNpcMinds({ seed: 3 });
  run(minds, 30);
  const before = minds.getEntity('p-0');
  populate(minds);
  minds.tick(0.1, { ...clear, weather: 'rain' });
  const after = minds.getEntity('p-0');
  assert.ok(after.needs.comfort < before.needs.comfort - 0.2);
  assert.ok(after.valence < before.valence);
  run(minds, 60, { ...clear, weather: 'rain' });
  const wet = minds.getEntity('p-0').needs.comfort;
  minds.setDirective('p-0', { intent: 'shelter', holdSeconds: 120 });
  run(minds, 60, { ...clear, weather: 'rain' });
  assert.ok(minds.getEntity('p-0').needs.comfort > wet + 0.1);
});

test('events: dusk, late train, and a horn startle move emotion in the expected direction', () => {
  const minds = createNpcMinds({ seed: 5 });
  run(minds, 5, clear, 4, { platform: true });
  const calm = minds.getEntity('p-0').arousal;
  minds.observe({ type: 'horn' });
  assert.ok(minds.getEntity('p-0').arousal > calm + 0.1);
  const valence = minds.getEntity('p-1').valence;
  minds.observe({ type: 'train-arrival', late: true, ids: ['p-1'] });
  assert.ok(minds.getEntity('p-1').valence < valence);
  assert.throws(() => minds.observe({ type: 'explode' }), TypeError);
  assert.throws(() => minds.observe({ type: 'horn', late: 'yes' }), TypeError);
});

test('local intents respect a minimum dwell, so behaviour does not flicker', () => {
  const minds = createNpcMinds({ seed: 11 });
  const changes = new Map();
  const last = new Map();
  for (let t = 0; t < 240; t += 0.1) {
    populate(minds);
    minds.tick(0.1, clear);
    for (const entity of minds.getState().entities) {
      if (last.has(entity.id) && last.get(entity.id) !== entity.localIntent)
        changes.set(entity.id, [...(changes.get(entity.id) ?? []), t]);
      last.set(entity.id, entity.localIntent);
    }
  }
  let total = 0;
  for (const times of changes.values()) {
    total += times.length;
    for (let i = 1; i < times.length; i++)
      assert.ok(times[i] - times[i - 1] >= MIN_INTENT_DWELL - 0.11);
  }
  assert.ok(total > 0, 'characters should still change their minds sometimes');
});

test('directed beats Jev beats local, and each expires on game time', () => {
  const minds = createNpcMinds({ seed: 2 });
  run(minds, 5, clear, 3, { platform: true });
  const batch = minds.buildJevBatch({ camera: { x: 0, z: 0 } });
  assert.ok(batch.ids.includes('p-0'));
  const outcome = minds.applyJev(batch, [{ id: 'p-0', mood: 'tired', intent: 'sit' }]);
  assert.deepEqual(outcome.accepted, ['p-0']);
  assert.equal(minds.getEntity('p-0').source, 'jev');
  assert.equal(minds.getEntity('p-0').intent, 'sit');
  minds.setDirective('p-0', { mood: 'cheerful', intent: 'wave', holdSeconds: 10 });
  let entity = minds.getEntity('p-0');
  assert.equal(entity.source, 'directed');
  assert.equal(entity.intent, 'wave');
  assert.equal(entity.mood, 'cheerful');
  assert.equal(minds.expressionFor('p-0').intent, 'wave');
  run(minds, 11, clear, 3, { platform: true });
  entity = minds.getEntity('p-0');
  assert.equal(entity.source, 'jev');
  assert.equal(entity.intent, 'sit');
  run(minds, JEV_HOLD_SECONDS, clear, 3, { platform: true });
  assert.equal(minds.getEntity('p-0').source, 'local');
  assert.equal(minds.getEntity('p-0').expiresIn, 0);
  // Paused game time does not consume a directive.
  minds.setDirective('p-1', { intent: 'linger', holdSeconds: 5 });
  minds.tick(0, clear);
  assert.equal(minds.getEntity('p-1').expiresIn, 5);
  assert.throws(() => minds.setDirective('p-1', { holdSeconds: 5 }), TypeError);
  assert.throws(() => minds.setDirective('p-1', { intent: 'fly', holdSeconds: 5 }), TypeError);
  assert.throws(() => minds.setDirective('p-1', { intent: 'sit', holdSeconds: 301 }), TypeError);
  assert.throws(() => minds.setDirective('missing', { intent: 'sit', holdSeconds: 5 }), Error);
});

test('stale Jev answers are rejected when context or characters change', () => {
  const minds = createNpcMinds({ seed: 4 });
  run(minds, 3, clear, 4, { platform: true });
  const batch = minds.buildJevBatch({ camera: { x: 0, z: 0 } });
  run(minds, 1, { ...clear, weather: 'rain' }, 4, { platform: true });
  const stale = minds.applyJev(
    batch,
    batch.ids.map((id) => ({ id, mood: 'anxious', intent: 'shelter' })),
  );
  assert.equal(stale.stale, true);
  assert.equal(stale.accepted.length, 0);
  for (const id of batch.ids) assert.equal(minds.getEntity(id).source, 'local');

  const fresh = minds.buildJevBatch({ camera: { x: 0, z: 0 } });
  const [gone, reborn, kept] = fresh.ids;
  minds.forget(gone);
  minds.forget(reborn);
  minds.sense(reborn, 'vendor', 0, 0, false, true, true, 'waiting');
  const result = minds.applyJev(fresh, [
    { id: gone, mood: 'content', intent: 'linger' },
    { id: reborn, mood: 'content', intent: 'linger' },
    { id: kept, mood: 'curious', intent: 'linger' },
    { id: 'intruder', mood: 'content', intent: 'linger' },
  ]);
  assert.deepEqual(result.accepted, [kept]);
  assert.deepEqual(
    result.rejected.map((item) => item.reason),
    ['despawned', 'despawned', 'not-requested'],
  );
});

test('Jev batches are bounded, favour requested characters, and skip directed ones', () => {
  const minds = createNpcMinds({ seed: 9 });
  run(minds, 2, clear, 20, { platform: true });
  minds.requestJev('p-19');
  minds.setDirective('p-0', { intent: 'sit', holdSeconds: 60 });
  const batch = minds.buildJevBatch({ camera: { x: 0, z: 0 } });
  assert.ok(batch.entities.length <= MAX_JEV_BATCH);
  assert.equal(batch.ids[0], 'p-19');
  assert.ok(!batch.ids.includes('p-0'));
  assert.deepEqual(Object.keys(batch.context).sort(), [
    'crowd',
    'dusk',
    'region',
    'trainPhase',
    'weather',
  ]);
  assert.deepEqual(Object.keys(batch.entities[0]).sort(), [
    'arousal',
    'id',
    'intent',
    'mood',
    'needs',
    'role',
    'valence',
  ]);
  assert.ok(JSON.stringify({ context: batch.context, entities: batch.entities }).length < 4096);
  const empty = createNpcMinds();
  assert.equal(empty.buildJevBatch({ camera: { x: 0, z: 0 } }), null);
});

test('train phase follows the service and characters notice it', () => {
  const minds = createNpcMinds({ seed: 6 });
  run(minds, 2, { ...clear, trainSpeed: 20, remainingToStation: 2000 }, 3, { platform: true });
  assert.equal(minds.getState().context.trainPhase, 'away');
  run(minds, 1, { ...clear, trainSpeed: 12, remainingToStation: 300 }, 3, { platform: true });
  assert.equal(minds.getState().context.trainPhase, 'approaching');
  run(minds, 1, { ...clear, trainSpeed: 0, remainingToStation: 2, doorsOpen: true }, 3, {
    platform: true,
  });
  assert.equal(minds.getState().context.trainPhase, 'stopped');
  run(minds, 1, { ...clear, trainSpeed: 5, remainingToStation: 1990 }, 3, { platform: true });
  assert.equal(minds.getState().context.trainPhase, 'departing');
  run(minds, 25, { ...clear, trainSpeed: 20, remainingToStation: 1900 }, 3, { platform: true });
  assert.equal(minds.getState().context.trainPhase, 'away');
});

const center = (z) => Math.sin(z * 0.006) * 15;
const terrain = (u, z) => (u > 38 ? 4.1 + (u - 38) * 0.3 + Math.sin(z * 0.02) * 0.4 : 4.1);
const station = {
  trainPosition: [center(525) + 28, 4.75, 525],
  speed: 0,
  doorsOpen: true,
  travelDirection: 1,
};
function boardingTimes(minds) {
  const pop = createPopulation({
    center,
    terrain,
    homes: [-235, -208, -178, -145, -113].map((z) => ({ u: 48, z, y: 7.5, w: 8 })),
  });
  // Long enough for slowed walkers to reach their waiting marks before the train arrives.
  for (let t = 0; t < 200; t += 0.1) pop.update(0.1, { minds });
  const times = new Map();
  let t = 0;
  for (; t < 60; t += 0.1) {
    pop.update(0.1, { ...station, minds });
    for (const event of pop.getState().recentEvents)
      if (event.type === 'boarded-at-door' && !times.has(event.person))
        times.set(event.person, event.time);
  }
  return times;
}

test('a mind can delay boarding by a bounded amount but never prevent it', () => {
  const baseline = boardingTimes(undefined);
  const lingering = boardingTimes({
    expressionFor: () => ({ intent: 'linger', walkSpeedScale: 0.6 }),
  });
  assert.equal(baseline.size, 6);
  assert.equal(lingering.size, baseline.size);
  for (const [id, time] of baseline) {
    const delay = lingering.get(id) - time;
    assert.ok(delay >= 0 && delay <= MAX_MIND_BOARDING_DELAY + 0.25, `${id} delayed ${delay}s`);
  }
  // Shelter directives do not keep anyone off an open train.
  const sheltering = boardingTimes({
    expressionFor: () => ({ intent: 'shelter', walkSpeedScale: 1 }),
  });
  assert.equal(sheltering.size, 6);
});

test('world details and regional residents feed minds and render their cues', () => {
  const minds = createNpcMinds({ seed: 12 });
  const scene = new THREE.Scene();
  const world = addWorldDetails({ THREE, scene, center: () => 0, terrain: () => 4.1 });
  const parent = new THREE.Group();
  const stop = { id: 'sakuragawa', name: 'Sakuragawa', theme: 'farmland' };
  const residents = createRegionalResidents({
    THREE,
    parent,
    stop,
    local: (x, y, z) => new THREE.Vector3(x, y, z),
    place: (x, z) => new THREE.Vector3(x, 2, z),
  });
  for (let i = 0; i < 300; i++) {
    world.update(0.1, { weather: 'rain', trainPosition: [28, 4.75, 525], minds });
    residents.update(i / 10, { weather: 'rain', minds });
    minds.tick(0.1, { weather: 'rain', region: 'farmland', cameraPosition: { x: 0, z: 0 } });
  }
  const state = minds.getState();
  assert.ok(state.entities.some((e) => e.id === 'resident-1'));
  assert.ok(state.entities.some((e) => e.id === 'sakuragawa-resident-0'));
  minds.setDirective('sakuragawa-resident-1', { intent: 'wave', holdSeconds: 20 });
  residents.update(31, { weather: 'rain', minds });
  for (const object of [...world.root.children, ...parent.children[0].children])
    if (object.isInstancedMesh)
      assert.ok(Array.from(object.instanceMatrix.array).every(Number.isFinite), object.name);
  world.dispose();
  residents.dispose();
});

test('minds client: one inflight request, stale answers rejected, fallback not applied', async () => {
  const minds = createNpcMinds({ seed: 1 });
  run(minds, 2, clear, 4, { platform: true });
  let clock = 1000;
  let resolve;
  let calls = 0;
  let body;
  const statuses = [];
  const client = createMindsClient({
    minds,
    now: () => clock,
    getContext: () => ({ paused: false, camera: { x: 0, z: 0 } }),
    onStatus: (status) => statuses.push(status),
    fetcher: (url, options) => {
      calls++;
      assert.equal(url, '/api/director/minds');
      body = JSON.parse(options.body);
      return new Promise((done) => {
        resolve = done;
      });
    },
  });
  const first = client.tick();
  await client.tick();
  assert.equal(calls, 1);
  assert.deepEqual(Object.keys(body).sort(), ['context', 'entities']);
  const choice = (source, mood = 'curious') => ({
    ok: true,
    json: async () => ({
      source,
      entities: body.entities.map((entity) => ({ id: entity.id, mood, intent: 'linger' })),
    }),
  });
  // The world changes while the request is pending.
  run(minds, 1, { ...clear, weather: 'snow' }, 4, { platform: true });
  resolve(choice('jev'));
  await first;
  assert.equal(statuses.at(-1), 'stale');
  assert.ok(minds.getState().entities.every((entity) => entity.source === 'local'));

  clock += 25001;
  const second = client.tick();
  resolve(choice('fallback'));
  await second;
  assert.equal(statuses.at(-1), 'fallback');
  assert.ok(minds.getState().entities.every((entity) => entity.source === 'local'));

  clock += 25001;
  const third = client.tick();
  resolve(choice('jev', 'cheerful'));
  await third;
  assert.equal(statuses.at(-1), 'jev');
  assert.ok(minds.getState().entities.some((entity) => entity.source === 'jev'));

  clock += 25001;
  // Held characters are skipped until an agent asks for one again.
  minds.requestJev('p-0');
  const fourth = client.tick();
  resolve({
    ok: true,
    json: async () => ({ source: 'jev', entities: [{ id: 'x', mood: 'rage' }] }),
  });
  await fourth;
  assert.equal(statuses.at(-1), 'offline');
  client.dispose();
});

test('minds client stays offline on static hosting and discards answers after disable', async () => {
  const minds = createNpcMinds();
  run(minds, 2, clear, 3, { platform: true });
  let calls = 0;
  const statuses = [];
  const offline = createMindsClient({
    minds,
    offline: true,
    getContext: () => ({ paused: false }),
    onStatus: (status) => statuses.push(status),
    fetcher: () => {
      calls++;
    },
  });
  await offline.tick();
  assert.equal(calls, 0);
  assert.equal(statuses.at(-1), 'offline');

  let resolve;
  const client = createMindsClient({
    minds,
    getContext: () => ({ paused: false }),
    fetcher: (_url, options) => {
      const ids = JSON.parse(options.body).entities.map((entity) => entity.id);
      return new Promise((done) => {
        resolve = () =>
          done({
            ok: true,
            json: async () => ({
              source: 'jev',
              entities: ids.map((id) => ({ id, mood: 'tired', intent: 'sit' })),
            }),
          });
      });
    },
  });
  const pending = client.tick();
  client.setEnabled(false);
  resolve();
  await pending;
  assert.ok(minds.getState().entities.every((entity) => entity.source === 'local'));
});

test('mind region prefers a nearby regional stop theme', () => {
  const stops = [{ z: 1500, theme: 'farmland' }];
  assert.equal(mindRegion(1550, stops), 'farmland');
  assert.equal(mindRegion(520, stops), 'station');
});

test('mind tools validate arguments and give acting notes through the shared executor', async () => {
  const minds = createNpcMinds({ seed: 1 });
  run(minds, 1, clear, 2);
  const environment = {};
  const webmcp = registerGameWebMCP({
    inspector: { snapshot: () => ({ camera: {}, renderer: {}, scene: {}, game: {} }) },
    getGameState: () => ({}),
    extensions: [({ tool }) => registerMindTools({ tool, minds })],
    environment,
  });
  const parse = (result) => JSON.parse(result.content[0].text);
  const names = webmcp.list().map((definition) => definition.name);
  for (const name of [
    'get_npc_minds',
    'inspect_npc_mind',
    'direct_npc',
    'clear_npc_direction',
    'request_npc_jev',
    'cue_npc_event',
  ])
    assert.ok(names.includes(name), name);
  for (const input of [
    { entityId: 'p-0', intent: 'fly', holdSeconds: 10 },
    { entityId: 'P 0', intent: 'sit', holdSeconds: 10 },
    { entityId: 'p-0', intent: 'sit', holdSeconds: 1000 },
    { entityId: 'p-0', intent: 'sit', holdSeconds: 10, script: 'x' },
    { entityId: 'p-0', holdSeconds: 10 },
  ])
    assert.equal((await webmcp.invoke('direct_npc', input)).isError, true);
  const directed = parse(
    await webmcp.invoke('direct_npc', {
      entityId: 'p-0',
      mood: 'wistful',
      intent: 'linger',
      holdSeconds: 30,
    }),
  );
  assert.equal(directed.result.source, 'directed');
  const state = parse(await webmcp.invoke('get_npc_minds', {}));
  assert.equal(state.result.entities[0].id, 'p-0');
  assert.equal(state.result.jev.status, 'local-only');
  assert.equal(
    parse(await webmcp.invoke('cue_npc_event', { type: 'horn', ids: ['p-1'] })).result.affected,
    1,
  );
  assert.equal(
    parse(await webmcp.invoke('clear_npc_direction', { entityId: 'p-0' })).result.source,
    'local',
  );
  webmcp.dispose();
});
