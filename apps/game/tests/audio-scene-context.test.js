import test from 'node:test';
import assert from 'node:assert/strict';
import {
  sceneSoundContext,
  waterEmitters,
  forestContext,
  waterAttenuation,
  WATER_INTENSITY,
  ROUTE_FIXTURES,
  GORGE_RIVER,
} from '../src/audio/scene-context.js';
import { soundMix } from '../src/audio/sound-model.js';
import { riverProfile } from '../src/world/river-profile.js';
import { routeCenter, routeElevation, landmarks } from '../src/world/extended-route.js';
import { regionalLakes, lakeRadius } from '../src/world/lake-scenery.js';

const isPlain = (value) =>
  value === null ||
  ['number', 'string', 'boolean', 'undefined'].includes(typeof value) ||
  (Array.isArray(value) && value.every(isPlain)) ||
  (Object.getPrototypeOf(value) === Object.prototype && Object.values(value).every(isPlain));

test('original valley reproduces the existing main.js river source', () => {
  const listener = ROUTE_FIXTURES.originalValley.listener;
  const context = sceneSoundContext({ listener });
  const river = riverProfile(200);
  const riverX = routeCenter(200) + river.offset;
  assert.equal(context.water.id, 'valley-river');
  assert.equal(context.riverIntensity, 1);
  assert.ok(Math.abs(context.riverSource[2] - 200) < 0.01);
  assert.ok(Math.abs(context.riverSource[1] + 0.4) < 0.01);
  assert.ok(context.riverSource[0] <= riverX + river.halfWidth + 0.01);
  assert.ok(context.riverSource[0] >= riverX - river.halfWidth - 0.01);
  const expected = Math.hypot(
    listener[0] - context.riverSource[0],
    listener[1] - context.riverSource[1],
    listener[2] - context.riverSource[2],
  );
  assert.ok(Math.abs(context.riverDistance - expected) < 0.05);
  assert.ok(context.forest.originalValley);
});

test('water is rejected outside its actual extents instead of following the listener', () => {
  const beyond = waterEmitters([routeCenter(3000) + 28, routeElevation(3000) + 3, 3000]);
  const valley = beyond.find((e) => e.id === 'valley-river');
  assert.equal(valley.point[2], 1350);
  assert.ok(valley.distance > 1600);
  assert.ok(valley.level < 1e-9);
  const dry = sceneSoundContext({ listener: ROUTE_FIXTURES.dryFar.listener });
  assert.ok(dry.waterLevel < 0.001, `dry forest still hears water: ${dry.water.id}`);
  assert.ok(soundMix({ ...dry, enabled: true, active: true }).river < 0.001);
});

test('mountain shelves near the tunnel and summit carry no shoreline', () => {
  for (const z of [landmarks.tunnelStartZ - 300, landmarks.summitZ, 10500]) {
    const context = sceneSoundContext({
      listener: [routeCenter(z) + 28, routeElevation(z) + 3, z],
    });
    assert.ok(context.waterLevel < 0.002, `z=${z} heard ${context.water.id}`);
  }
});

test('the Kawasemi wetland is a quiet marsh, not a river', () => {
  const context = sceneSoundContext({ listener: ROUTE_FIXTURES.wetNear.listener });
  assert.equal(context.water.id, 'kawasemi-wetland');
  assert.equal(context.riverIntensity, WATER_INTENSITY.wetland);
  assert.ok(context.riverDistance < 45);
  assert.ok(context.riverIntensity < 0.2);
});

test('lakes lap instead of rushing and the emitter sits on the shoreline', () => {
  for (const lake of regionalLakes) {
    const listener = [routeCenter(lake.z) + 28, routeElevation(lake.z) + 3, lake.z];
    const context = sceneSoundContext({ listener });
    assert.equal(context.water.id, lake.id);
    assert.equal(context.water.kind, lake.coast ? 'coast' : 'lake');
    assert.ok(context.riverIntensity < 0.5);
    const radius = lakeRadius(lake, context.riverSource[0], context.riverSource[2], routeCenter);
    assert.ok(Math.abs(radius - 1) < 0.02, `${lake.id} shoreline radius ${radius}`);
    assert.ok(Math.abs(context.riverSource[1] - (routeElevation(lake.z) - lake.drop)) < 0.01);
    assert.ok(!context.water.overWater);
  }
  const hoshimi = regionalLakes.find((l) => l.id === 'hoshimi');
  const overWater = waterEmitters([
    routeCenter(hoshimi.z) + hoshimi.u,
    routeElevation(hoshimi.z),
    hoshimi.z,
  ]).find((e) => e.id === 'hoshimi');
  assert.ok(overWater.overWater);
  assert.ok(Math.abs(overWater.distance - hoshimi.drop) < 0.01);
});

test('the Takabashi gorge river is heard from the deck but stays 77 m down', () => {
  const z = landmarks.bridgeZ;
  const context = sceneSoundContext({ listener: [routeCenter(z) + 28, routeElevation(z) + 3, z] });
  assert.equal(context.water.id, 'takabashi-gorge');
  assert.ok(Math.abs(context.riverDistance - (GORGE_RIVER.dropBelowDeck + 3)) < 0.01);
  assert.ok(context.riverIntensity >= 0.9);
  const far = sceneSoundContext({
    listener: [routeCenter(z) + 28 + 900, routeElevation(z) + 3, z],
  });
  assert.ok(far.emitters.find((e) => e.id === 'takabashi-gorge').distance > 600);
});

test('soundMix scales river by intensity and keeps its defaults', () => {
  const riding = { enabled: true, active: true, riverDistance: 10 };
  const base = soundMix(riding);
  assert.equal(base.river, soundMix({ ...riding, riverIntensity: 1 }).river);
  assert.ok(
    Math.abs(soundMix({ ...riding, riverIntensity: 0.3 }).river - base.river * 0.3) < 1e-12,
  );
  assert.equal(soundMix({ ...riding, riverIntensity: 5 }).river, base.river);
  assert.equal(soundMix({ ...riding, riverIntensity: 0.3, inTunnel: true }).river, 0);
  assert.equal(soundMix().river, 0);
  assert.equal(
    soundMix({ ...riding, riverIntensity: 0.3, view: 'cab', weather: 'rain' }).roofRain,
    0.065,
  );
});

test('combined water level never exceeds one river and attenuation matches the mix', () => {
  const context = sceneSoundContext({ listener: ROUTE_FIXTURES.originalValley.listener });
  assert.ok(context.waterLevel <= 1);
  assert.ok(Math.abs(waterAttenuation(60) - Math.exp(-1)) < 1e-12);
  assert.equal(waterAttenuation(Infinity), 0);
  assert.equal(waterAttenuation(-5), 1);
});

test('forest context follows the region field and snowbound highlands', () => {
  const valley = forestContext({ z: 300, season: 'autumn', forest: 'dense' });
  assert.equal(valley.density, 1);
  assert.equal(valley.season, 'autumn');
  const summit = forestContext({ z: landmarks.summitZ, season: 'summer', forest: 'dense' });
  assert.ok(summit.snowbound);
  assert.equal(summit.season, 'winter');
  assert.equal(summit.plannedSeason, 'summer');
  const tokyo = forestContext({ z: 23300, season: 'summer' });
  assert.equal(tokyo.density, 0.15);
  assert.ok(forestContext({ z: 9600, forest: 'sparse' }).density < 0.5);
});

test('fixtures resolve to their expected water and the model is serializable', () => {
  for (const [name, fixture] of Object.entries(ROUTE_FIXTURES)) {
    const context = sceneSoundContext({ listener: fixture.listener, z: fixture.z });
    if (fixture.expect) assert.equal(context.water.id, fixture.expect, name);
    else assert.ok(context.waterLevel < 0.001, name);
    assert.ok(isPlain(context), `${name} contains non-plain values`);
    assert.deepEqual(JSON.parse(JSON.stringify(context)), context);
  }
  const fromObject = sceneSoundContext({ listener: { x: 5, y: 2, z: 100 } });
  assert.deepEqual(fromObject.listener, [5, 2, 100]);
});
