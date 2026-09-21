import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createRailwayPoints } from '../src/world/railway-points.js';
import { createPassingLoopCurve } from '../src/world/passing-loop.js';
import { createStationDuties } from '../src/simulation/station-duties.js';
const railPoint = (z) => new THREE.Vector3(Math.sin(z / 70) * 10, 4 + z * 0.003, z);
function setup() {
  const scene = new THREE.Scene();
  return { scene, points: createRailwayPoints({ THREE, scene, railPoint }) };
}
const input = {
  dt: 0.1,
  dutyState: { phase: 'passing', route: 'passenger' },
  trainZ: 525,
  trainSpeed: 0,
};
const settle = (points, patch = {}) => {
  for (let i = 0; i < 16; i++) points.update({ ...input, ...patch });
};

test('points animate both loop joins and settle before reporting a route aligned', () => {
  const { points } = setup();
  assert.equal(points.getState().mainAligned, true);
  points.update(input);
  assert.equal(points.getState().moving, true);
  assert.equal(points.getState().mainAligned, false);
  assert.equal(points.getState().loopAligned, false);
  for (let i = 0; i < 11; i++) points.update(input);
  assert.equal(points.getState().turnouts[0].alignment, 1);
  assert.equal(points.getState().loopAligned, false, 'blade contact alone is not settled evidence');
  for (let i = 0; i < 3; i++) points.update(input);
  assert.equal(points.getState().loopAligned, true);
  settle(points, { dutyState: { phase: 'ready', route: 'passenger' } });
  assert.equal(points.getState().mainAligned, true);
  assert.equal(points.getState().requestedRoute, 'main');
  settle(points, { dutyState: { phase: 'routing', route: 'freight' } });
  assert.equal(points.getState().loopAligned, true);
  settle(points, { dutyState: { phase: 'routing', route: 'freight', active: false } });
  assert.equal(points.getState().mainAligned, true, 'exploration restores the main route');
  settle(points, { dutyState: { phase: 'boarding', route: 'passenger' } });
  assert.equal(points.getState().mainAligned, true);
});

test('full player footprint and each passing carriage lock occupied throats without hidden movement', () => {
  const { points } = setup();
  settle(points, { trainZ: 600, trainSpeed: 10 });
  let state = points.getState();
  assert.equal(state.turnouts[1].alignment, 0);
  assert.deepEqual(state.turnouts[1].occupiedBy, ['player']);
  assert.equal(state.turnouts[0].alignment, 1);
  assert.equal(state.loopAligned, false);
  settle(points);
  assert.equal(points.getState().loopAligned, true);
  const passingState = {
    cars: [
      { visible: true, position: railPoint(420).toArray() },
      { visible: true, position: railPoint(630).toArray() },
    ],
  };
  settle(points, { dutyState: { phase: 'ready' }, passingState });
  state = points.getState();
  assert.equal(state.turnouts[0].alignment, 1);
  assert.equal(state.turnouts[1].alignment, 1);
  assert.equal(state.locked, true);
  assert.equal(state.mainAligned, false);
  assert.deepEqual(state.turnouts[1].occupiedBy, ['passing-car-2']);
  settle(points, { dutyState: { phase: 'ready' }, passingState: { cars: [] } });
  assert.equal(points.getState().mainAligned, true);
});

test('missing physical context locks points, invalid time is rejected and catchup is bounded', () => {
  const { points } = setup();
  settle(points, { trainZ: NaN });
  assert.ok(points.getState().turnouts.every((point) => point.alignment === 0));
  assert.equal(points.getState().locked, true);
  for (const dt of [-1, Infinity, NaN]) assert.throws(() => points.update({ ...input, dt }), /dt/);
  points.update({ ...input, dt: 100 });
  assert.ok(points.getState().turnouts[0].alignment < 0.1);
  const before = points.getState().turnouts[0].alignment;
  points.update({ ...input, dt: 0 });
  assert.equal(points.getState().turnouts[0].alignment, before);
});

test('blade tips share the main endpoints and loop tails use the existing passing curve', () => {
  const { scene, points } = setup();
  const curve = createPassingLoopCurve({ THREE, railPoint });
  settle(points);
  scene.updateMatrixWorld(true);
  for (const z of [410, 640]) {
    const blade = scene.getObjectByName(`points / ${z} movable right blade`);
    const ends = [-0.5, 0.5].map((localZ) =>
      new THREE.Vector3(0, 0, localZ).applyMatrix4(blade.matrixWorld),
    );
    const tangent = railPoint(z + 0.1)
      .sub(railPoint(z - 0.1))
      .normalize();
    const normal = new THREE.Vector3(tangent.z, 0, -tangent.x).normalize();
    const tip = railPoint(z)
      .addScaledVector(normal, 0.96)
      .add(new THREE.Vector3(0, 0.11, 0));
    assert.ok(ends[0].distanceTo(tip) < 1e-8);
    let nearest = Infinity;
    for (let i = 0; i <= 5000; i++) {
      const t = i / 5000,
        point = curve.getPoint(t),
        tangent = curve.getTangent(t).normalize();
      point.addScaledVector(new THREE.Vector3(tangent.z, 0, -tangent.x).normalize(), 0.96).y +=
        0.11;
      nearest = Math.min(nearest, point.distanceTo(ends[1]));
    }
    assert.ok(nearest < 0.04, `blade tail should meet the existing siding rail: ${nearest}`);
  }
});

test('geometry stays bounded across animation and owned resources are disposed once', () => {
  const { scene, points } = setup();
  const geometry = new Set(),
    materials = new Set();
  scene.traverse((object) => {
    if (object.geometry) geometry.add(object.geometry);
    if (object.material) materials.add(object.material);
  });
  assert.equal(geometry.size, 1);
  assert.ok(points.getState().renderBatches <= 12);
  for (let i = 0; i < 100; i++)
    points.update({ ...input, dutyState: { phase: i % 30 < 15 ? 'passing' : 'ready' } });
  const after = new Set();
  scene.traverse((object) => {
    if (object.geometry) after.add(object.geometry);
  });
  assert.deepEqual(after, geometry);
  let released = 0;
  for (const resource of [...geometry, ...materials])
    resource.addEventListener('dispose', () => released++);
  points.dispose();
  points.dispose();
  assert.equal(released, geometry.size + materials.size);
  assert.equal(scene.children.length, 0);
  assert.equal(points.update(input).disposed, true);
  assert.equal(points.getState().mainAligned, false);
});

test('real point alignment gates opposing movement and final departure through station duties', () => {
  const { points } = setup();
  const duties = createStationDuties();
  const station = {
    z: 525,
    speed: 0,
    doorsOpen: false,
    doorFraction: 0,
    storyEnabled: true,
    storyCompletedIds: ['momiji-bread'],
    storyBeatId: 'sakuragawa-water',
  };
  const tick = (patch = {}) => {
    points.update({ ...input, dutyState: duties.getState() });
    return duties.update({ ...station, dt: 0.1, pointsState: points.getState(), ...patch });
  };
  tick();
  duties.act('route-passenger');
  for (let i = 0; i < 31; i++) tick({ doorsOpen: true, doorFraction: 1 });
  tick();
  duties.act('request-clearance');
  for (let i = 0; i < 12; i++) tick();
  assert.equal(duties.getState().passingProgress, 0);
  assert.equal(duties.getState().waitingForPoints, true);
  for (let i = 0; i < 125; i++) tick();
  assert.equal(duties.getState().phase, 'ready');
  assert.equal(duties.act('depart').ok, false);
  for (let i = 0; i < 16; i++) tick();
  assert.equal(points.getState().mainAligned, true);
  assert.equal(duties.act('depart').effect, 'depart');
});
