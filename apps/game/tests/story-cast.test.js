import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createStoryCast } from '../src/narrative/story-cast.js';
import { campaign } from '../src/narrative/story-data.js';
import { routeCenter, routeElevation, scenicTerrain } from '../src/world/extended-route.js';

function setup(overrides = {}) {
  const scene = new THREE.Scene();
  const railPoint = (z) => new THREE.Vector3(0, 4.75, z);
  const cast = createStoryCast({ THREE, scene, railPoint, terrainHeight: () => 4.1, ...overrides });
  return { scene, cast, railPoint };
}
const stateAt = (z) => ({ enabled: true, activeBeat: campaign.beats.find((beat) => beat.z === z) });

test('cast stages both feet on station deck and remains outside the rail corridor', () => {
  const { cast, railPoint } = setup();
  cast.update({ storyState: stateAt(525), trainPosition: railPoint(525), trainSpeed: 0 });
  const state = cast.getState();
  assert.equal(state.visible, true);
  assert.equal(state.renderBatches, 3);
  assert.deepEqual(
    state.characters.map((p) => p.height),
    [1.65, 1.5],
  );
  for (const foot of state.feet) {
    assert.ok(foot.position[0] >= 6);
    assert.equal(foot.position[1], 5.35);
  }
  cast.dispose();
});

test('unsupported route scenes stay hidden, while station responses remain staged', () => {
  const { cast, railPoint } = setup();
  for (const z of [6250, 11500, 23800]) {
    cast.update({ storyState: stateAt(z), trainPosition: railPoint(z) });
    assert.equal(cast.getState().visible, false);
    assert.equal(cast.getState().hiddenReason, 'not-a-station');
  }
  const storyState = stateAt(1500);
  storyState.activeBeat = { ...storyState.activeBeat, phase: 'response' };
  cast.update({ storyState, trainPosition: railPoint(1500) });
  cast.update({ storyState, trainPosition: railPoint(1500) });
  assert.equal(cast.getState().visible, true);
  cast.update({ storyState: { enabled: true, activeBeat: null }, trainPosition: railPoint(1500) });
  assert.equal(cast.getState().visible, false);
  cast.dispose();
});

test('cast hides while train moves, after a teleport, and away from the active station', () => {
  const { cast, railPoint } = setup();
  const storyState = stateAt(525);
  cast.update({ storyState, trainPosition: railPoint(525), trainSpeed: 0.2 });
  assert.equal(cast.getState().hiddenReason, 'train-moving');
  cast.update({ storyState, trainPosition: railPoint(526), trainSpeed: 0 });
  assert.equal(cast.getState().hiddenReason, 'train-moving');
  cast.update({ storyState, trainPosition: railPoint(526), trainSpeed: 0 });
  assert.equal(cast.getState().visible, true);
  cast.update({ storyState, trainPosition: railPoint(550), trainSpeed: 0 });
  assert.equal(cast.getState().hiddenReason, 'train-away');
  cast.dispose();
});

test('curved graded rail uses the platform side and the local deck elevation', () => {
  const yaw = 0.2;
  const railPoint = (z) => new THREE.Vector3(z * Math.tan(yaw), 10 + z * 0.04, z);
  const terrainHeight = (_x, z) => railPoint(z).y - 0.65;
  const { cast } = setup({ railPoint, terrainHeight });
  cast.update({ storyState: stateAt(1500), trainPosition: railPoint(1500) });
  const state = cast.getState();
  assert.equal(state.visible, true);
  for (const foot of state.feet) {
    const perpendicular = (foot.position[0] - railPoint(foot.position[2]).x) * Math.cos(yaw);
    assert.ok(Math.abs(perpendicular - 6.55) < 1e-6);
    assert.ok(Math.abs(foot.position[1] - (railPoint(1500).y + 0.6)) < 0.04);
  }
  cast.dispose();
});

test('unsafe cliffs and terrain above the platform suppress staging', () => {
  for (const terrainHeight of [() => 100, () => -50, (x) => x * 10, () => NaN]) {
    const { cast, railPoint } = setup({ terrainHeight });
    cast.update({ storyState: stateAt(525), trainPosition: railPoint(525) });
    assert.equal(cast.getState().visible, false);
    assert.equal(cast.getState().hiddenReason, 'unsafe-ground');
    cast.dispose();
  }
});

test('every authored regional station has safe staging on the existing world terrain', () => {
  const railPoint = (z) => new THREE.Vector3(routeCenter(z) + 28, routeElevation(z), z);
  const { cast } = setup({ railPoint, terrainHeight: scenicTerrain });
  for (const z of [1500, 3100, 4700, 8000, 9600, 12800, 14400, 16000, 17600, 19300, 21200, 23300]) {
    cast.update({ storyState: stateAt(z), trainPosition: railPoint(z) });
    cast.update({ storyState: stateAt(z), trainPosition: railPoint(z) });
    assert.equal(cast.getState().visible, true, `station ${z}: ${cast.getState().hiddenReason}`);
  }
  cast.dispose();
});

test('shared assets are disposed once and further updates cannot reattach the cast', () => {
  const { cast, scene, railPoint } = setup();
  const geometries = new Set();
  const materials = new Set();
  scene.traverse((object) => {
    if (object.geometry) geometries.add(object.geometry);
    if (object.material) materials.add(object.material);
  });
  let disposals = 0;
  for (const asset of [...geometries, ...materials])
    asset.addEventListener('dispose', () => disposals++);
  assert.equal(geometries.size, 3);
  assert.equal(materials.size, 1);
  cast.dispose();
  cast.dispose();
  cast.update({ storyState: stateAt(525), trainPosition: railPoint(525) });
  assert.equal(disposals, 4);
  assert.equal(scene.children.length, 0);
  assert.equal(cast.getState().visible, false);
});

test('the opening two scenes use flat trackside ground without inventing a platform', () => {
  const { cast, railPoint } = setup();
  for (const z of [-440, -120]) {
    cast.update({ storyState: stateAt(z), trainPosition: railPoint(z) });
    cast.update({ storyState: stateAt(z), trainPosition: railPoint(z) });
    const state = cast.getState();
    assert.equal(state.visible, true);
    assert.equal(state.stageType, 'trackside');
    for (const foot of state.feet) assert.equal(foot.position[1], 4.1);
    assert.ok(Math.abs(state.focusPoint[1] - 5.23) < 1e-10);
  }
  cast.dispose();
  const unsafe = setup({ terrainHeight: (x, z) => 4.1 + z * 0.4 });
  unsafe.cast.update({ storyState: stateAt(-440), trainPosition: unsafe.railPoint(-440) });
  assert.equal(unsafe.cast.getState().hiddenReason, 'unsafe-ground');
  unsafe.cast.dispose();
});

test('detailed models keep the batch budget and subtle animation leaves feet fixed', () => {
  const { cast, railPoint, scene } = setup();
  const storyState = stateAt(525);
  cast.update({ storyState, trainPosition: railPoint(525), elapsed: 0 });
  const before = scene.children[0].children.map((batch) => [...batch.instanceMatrix.array]);
  const footBefore = cast.getState().feet;
  cast.update({ storyState, trainPosition: railPoint(525), elapsed: 5 });
  const after = scene.children[0].children.map((batch) => [...batch.instanceMatrix.array]);
  assert.equal(cast.getState().renderBatches, 3);
  assert.ok(cast.getState().detailInstances > 120);
  assert.notDeepEqual(before, after);
  assert.deepEqual(cast.getState().feet, footBefore);
  let maxDisplacement = 0;
  for (let b = 0; b < before.length; b++)
    for (let i = 0; i < before[b].length; i += 16) {
      maxDisplacement = Math.max(
        maxDisplacement,
        Math.hypot(...[12, 13, 14].map((axis) => before[b][i + axis] - after[b][i + axis])),
      );
    }
  assert.ok(maxDisplacement < 0.03, `pose moved ${maxDisplacement}m`);
  for (const person of cast.getState().characters) {
    assert.equal(person.headFocus.length, 3);
    assert.ok(Math.abs(Math.hypot(...person.facing) - 1) < 1e-10);
  }
  cast.dispose();
});
