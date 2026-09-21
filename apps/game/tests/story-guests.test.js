import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createStoryGuests } from '../src/narrative/story-guests.js';
import { campaign } from '../src/narrative/story-data.js';
import { routeCenter, routeElevation, scenicTerrain } from '../src/world/extended-route.js';

const scenes = [
  ['nao', 525, 'bread crate'],
  ['jun', 1500, 'field hat'],
  ['endo', 3100, 'folded private letter'],
  ['fumi', 4700, 'workbench'],
  ['mika', 12800, 'wool scarf'],
];
const stateAt = (z) => ({ enabled: true, activeBeat: campaign.beats.find((beat) => beat.z === z) });
function setup(options = {}) {
  const scene = new THREE.Scene();
  const railPoint = options.railPoint ?? ((z) => new THREE.Vector3(0, 4.75, z));
  const guests = createStoryGuests({
    THREE,
    scene,
    railPoint,
    terrainHeight: () => 4.1,
    ...options,
  });
  function arrive(z, extra = {}) {
    const input = { storyState: stateAt(z), trainPosition: railPoint(z), ...extra };
    guests.update(input);
    guests.update(input);
    return guests.getState();
  }
  return { scene, guests, railPoint, arrive };
}

test('each authored scene has only its resident, work props, and three shared batches', () => {
  const { guests, arrive } = setup();
  for (const [id, z, prop] of scenes) {
    const state = arrive(z);
    assert.equal(state.visible, true, `${id}: ${state.hiddenReason}`);
    assert.deepEqual(
      state.characters.map((person) => person.id),
      [id],
    );
    assert.ok(state.props.includes(prop));
    assert.equal(state.renderBatches, 3);
    assert.ok(state.detailInstances > 35 && state.detailInstances < 100);
    assert.deepEqual(state.feet[0].position, [6.55, 5.35, z + 3.6]);
    assert.ok(state.focusPoint[1] > state.feet[0].position[1] + 1.2);
    assert.ok(state.characters[0].facing[0] > 0.99);
  }
  guests.dispose();
});

test('guests do not appear in unrelated scenes, while moving, or after leaving the station', () => {
  const { guests, arrive, railPoint } = setup();
  for (const z of [-440, 6250, 11500, 23300]) {
    const state = arrive(z);
    assert.equal(state.visible, false);
    assert.equal(state.hiddenReason, 'no-authored-guest');
  }
  assert.equal(arrive(525, { trainSpeed: 1 }).hiddenReason, 'train-moving');
  assert.equal(arrive(525).visible, true);
  guests.update({ storyState: stateAt(525), trainPosition: railPoint(527) });
  assert.equal(guests.getState().hiddenReason, 'train-moving');
  guests.update({ storyState: stateAt(525), trainPosition: railPoint(550) });
  assert.equal(guests.getState().hiddenReason, 'train-away');
  assert.equal(arrive(525, { trainPosition: [NaN, 4, 525] }).hiddenReason, 'train-away');
  assert.equal(
    arrive(525, { storyState: { enabled: false, activeBeat: stateAt(525).activeBeat } })
      .hiddenReason,
    'no-dialogue',
  );
  guests.dispose();
});

test('unsafe ground refuses to stage figures instead of floating or clipping into a hillside', () => {
  for (const terrainHeight of [() => 80, () => -40, () => NaN, (x) => x * 8]) {
    const { guests, arrive } = setup({ terrainHeight });
    assert.equal(arrive(525).hiddenReason, 'unsafe-ground');
    guests.dispose();
  }
});

test('real regional station terrain supports the guests and keeps them apart from Haru and Emi', () => {
  const railPoint = (z) => new THREE.Vector3(routeCenter(z) + 28, routeElevation(z), z);
  // Momiji’s actual shelf is flat at 4.1 for this right-of-track corridor.
  const terrainHeight = (x, z) => (z <= 790 ? 4.1 : scenicTerrain(x, z));
  const { guests, arrive } = setup({ railPoint, terrainHeight });
  for (const [id, z] of scenes) {
    const state = arrive(z);
    assert.equal(state.visible, true, `${id}: ${state.hiddenReason}`);
    const foot = new THREE.Vector3(...state.feet[0].position);
    const p = railPoint(z + state.longitudinalOffset);
    assert.ok(Math.abs(Math.hypot(foot.x - p.x, foot.z - p.z) - 6.55) < 1e-8);
    assert.equal(foot.y, p.y + 0.6);
    const tangent = railPoint(z + 1)
      .sub(railPoint(z - 1))
      .normalize();
    const yaw = Math.atan2(tangent.x, tangent.z);
    for (const dz of [-0.8, 0.8]) {
      const protagonist = railPoint(z).add(
        new THREE.Vector3(
          Math.cos(yaw) * 6.55 + Math.sin(yaw) * dz,
          0.6,
          -Math.sin(yaw) * 6.55 + Math.cos(yaw) * dz,
        ),
      );
      assert.ok(foot.distanceTo(protagonist) > 2.5, `${id}: guest overlaps protagonist`);
    }
  }
  guests.dispose();
});

test('idle breathing moves clothing by less than five millimetres and fixes feet and workbench', () => {
  const { guests, arrive, scene, railPoint } = setup();
  arrive(4700);
  const foot = guests.getState().feet;
  const batches = scene.children[0].children;
  const before = batches.map((batch) => Array.from(batch.instanceMatrix.array));
  for (let i = 0; i < 20; i++)
    guests.update({ storyState: stateAt(4700), trainPosition: railPoint(4700), dt: 0.1 });
  assert.deepEqual(guests.getState().feet, foot);
  let changed = 0;
  batches.forEach((batch, b) => {
    for (let i = 0; i < batch.count; i++) {
      const shift = Math.hypot(
        ...[12, 13, 14].map(
          (axis) => batch.instanceMatrix.array[i * 16 + axis] - before[b][i * 16 + axis],
        ),
      );
      assert.ok(shift < 0.005);
      if (shift > 0) changed++;
    }
  });
  assert.ok(changed > 0);
  guests.dispose();
});

test('inspection is detached and resources are disposed once', () => {
  const { guests, arrive, scene } = setup();
  const state = arrive(525);
  state.feet[0].position[0] = 10000;
  state.characters[0].name = 'changed';
  state.props.push('fake');
  assert.equal(guests.getState().characters[0].name, 'Nao');
  assert.equal(guests.getState().feet[0].position[0], 6.55);
  assert.ok(!guests.getState().props.includes('fake'));
  const geometries = new Set(),
    materials = new Set();
  scene.traverse((item) => {
    if (item.geometry) geometries.add(item.geometry);
    if (item.material) materials.add(item.material);
  });
  assert.equal(geometries.size, 3);
  assert.equal(materials.size, 1);
  let disposed = 0;
  for (const resource of [...geometries, ...materials])
    resource.addEventListener('dispose', () => disposed++);
  guests.dispose();
  guests.dispose();
  arrive(525);
  assert.equal(disposed, 4);
  assert.equal(scene.children.length, 0);
  assert.equal(guests.getState().hiddenReason, 'disposed');
});
