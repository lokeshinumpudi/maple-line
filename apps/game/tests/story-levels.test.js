import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createStoryLevels } from '../src/world/story-levels.js';
import { routeCenter, routeElevation, scenicTerrain } from '../src/world/extended-route.js';
const railPoint = (z) => new THREE.Vector3(routeCenter(z) + 28, routeElevation(z), z);
function setup() {
  const scene = new THREE.Scene();
  const levels = createStoryLevels({ THREE, scene, railPoint, terrainHeight: scenicTerrain });
  return { scene, levels };
}
test('authored station work areas follow route elevations and remain outside rail clearance', () => {
  const { scene, levels } = setup();
  const state = levels.getState();
  assert.equal(state.levels.length, 3);
  assert.ok(state.renderBatches < 35);
  for (const level of state.levels) {
    assert.equal(level.platformHeight, railPoint(level.z).y + 0.6);
    for (const item of level.interactions) {
      assert.ok(item.position.every(Number.isFinite));
      assert.ok(item.position[0] - railPoint(item.position[2]).x > 5);
      assert.ok(item.position[1] >= railPoint(level.z).y);
    }
  }
  const box = new THREE.Box3().setFromObject(scene);
  assert.ok(Number.isFinite(box.min.y));
  const before = new Map();
  scene.traverse((o) => {
    if (o.isMesh) before.set(o.uuid, o.matrixWorld.clone());
  });
  levels.update({ position: railPoint(4700) });
  assert.deepEqual(
    levels
      .getState()
      .levels.filter((l) => l.visible)
      .map((l) => l.id),
    ['aonuma'],
  );
  levels.update({ position: railPoint(12000) });
  assert.ok(levels.getState().levels.every((l) => !l.visible));
  levels.dispose();
  assert.equal(scene.children.length, 0);
});
test('only saved completed task facts alter spanner and corrected connection sheet', () => {
  const { scene, levels } = setup();
  const spanner = scene.getObjectByName('Aonuma / returned spanner');
  const correction = scene.getObjectByName('Minato / pinned connection correction');
  assert.equal(spanner.visible, false);
  assert.equal(correction.visible, false);
  levels.update({
    position: railPoint(4700),
    storyState: {
      enabled: true,
      activeBeat: { task: { id: 'return-spanner', completed: false } },
      completedTasks: [],
    },
  });
  assert.equal(levels.getState().levels[1].interactions[0].enabled, true);
  assert.equal(spanner.visible, false);
  levels.update({ position: railPoint(4700), storyState: { completedTasks: ['return-spanner'] } });
  assert.equal(spanner.visible, true);
  assert.equal(correction.visible, false);
  levels.update({
    position: railPoint(21200),
    storyState: { completedTasks: ['return-spanner', 'amend-connection'] },
    dutiesState: { completed: true },
  });
  assert.equal(correction.visible, true);
  assert.equal(scene.getObjectByName('Momiji / Nao’s bread crates').visible, false);
  levels.update({
    position: railPoint(525),
    storyState: { completedTasks: [] },
    dutiesState: { completed: false },
  });
  assert.equal(spanner.visible, false);
  assert.equal(correction.visible, false);
  assert.equal(levels.getState().breadDispatched, false);
  levels.dispose();
  levels.dispose();
});
test('restored completed tasks reconstruct the same visible props without replaying actions', () => {
  const { levels } = setup();
  const state = { completedTasks: ['return-spanner', 'amend-connection'] };
  levels.update({ position: railPoint(21200), storyState: state });
  const first = levels.getState();
  levels.update({ position: railPoint(21200), storyState: state });
  assert.deepEqual(levels.getState(), first);
  levels.dispose();
});

test('three bread crates include a pending clinic delivery that is not dispatched with passengers', () => {
  const { scene, levels } = setup();
  const clinic = scene.getObjectByName('Momiji / clinic crate awaiting a delivery plan');
  levels.update({
    position: railPoint(525),
    storyState: { enabled: true, activeBeat: { id: 'momiji-bread' } },
  });
  let crates = levels.getState().crates;
  assert.equal(crates.length, 3);
  assert.equal(crates.filter((crate) => crate.visible).length, 3);
  assert.equal(crates[2].representation, 'nao-guest-prop');
  assert.equal(clinic.visible, false, 'avoid duplicating the crate beside the active guest');
  levels.update({
    position: railPoint(525),
    storyState: { enabled: true, activeBeat: null },
    dutiesState: { completed: true },
  });
  crates = levels.getState().crates;
  assert.equal(crates.filter((crate) => crate.visible).length, 1);
  assert.equal(crates[2].status, 'pending');
  assert.equal(crates[2].representation, 'station-prop');
  assert.equal(clinic.visible, true);
  levels.update({ position: railPoint(525), dutiesState: { completed: false } });
  assert.equal(levels.getState().crates.filter((crate) => crate.visible).length, 3);
  const interaction = levels
    .getState()
    .levels[0].interactions.find((item) => item.id === 'momiji:clinic-crate');
  assert.equal(interaction.connected, true);
  assert.equal(interaction.action, 'plan-clinic-delivery');
  assert.equal(interaction.enabled, false);
  levels.dispose();
});

test('clinic inspection and two saved proposals change the tag without recreating geometry or claiming delivery', () => {
  const { scene, levels } = setup();
  const stripe = scene.getObjectByName('Momiji / clinic crate proposal stripe');
  const geometry = stripe.geometry,
    material = stripe.material;
  const original = material.color.getHexString();
  const context = {
    position: railPoint(525),
    storyState: {
      enabled: true,
      activeBeat: { id: 'momiji-bread', task: { id: 'plan-clinic-delivery', completed: false } },
      deliveryPlan: { inspected: false, proposal: null },
    },
  };
  levels.update(context);
  const interaction = () =>
    levels.getState().levels[0].interactions.find((item) => item.id === 'momiji:clinic-crate');
  assert.equal(interaction().enabled, true);
  context.storyState.deliveryPlan.inspected = true;
  levels.update(context);
  const inspectedColor = material.color.getHexString();
  assert.notEqual(inspectedColor, original);
  const colors = new Set([original, inspectedColor]);
  for (const proposal of ['later-clinic', 'shared-van']) {
    context.storyState.deliveryPlan.proposal = proposal;
    levels.update(context);
    const crate = levels.getState().crates[2];
    assert.equal(crate.inspected, true);
    assert.equal(crate.proposal, proposal);
    assert.equal(crate.status, 'awaiting-confirmation');
    assert.equal(crate.visible, true);
    colors.add(material.color.getHexString());
    const state = levels.getState();
    for (let i = 0; i < 120; i++) levels.update(context);
    assert.deepEqual(levels.getState(), state);
    assert.equal(stripe.geometry, geometry);
    assert.equal(stripe.material, material);
    const restored = setup();
    restored.levels.update(structuredClone(context));
    assert.deepEqual(restored.levels.getState().crates, state.crates);
    assert.equal(
      restored.scene
        .getObjectByName('Momiji / clinic crate proposal stripe')
        .material.color.getHexString(),
      material.color.getHexString(),
    );
    restored.levels.dispose();
  }
  assert.equal(colors.size, 4);
  context.storyState.activeBeat.task.completed = true;
  context.dutiesState = { completed: true };
  levels.update(context);
  assert.equal(interaction().enabled, false);
  assert.equal(levels.getState().crates.filter((crate) => crate.visible).length, 1);
  assert.equal(levels.getState().crates[2].status, 'awaiting-confirmation');
  levels.update({
    ...context,
    position: railPoint(600),
    storyState: {
      ...context.storyState,
      activeBeat: { task: { id: 'plan-clinic-delivery', completed: false } },
    },
  });
  assert.equal(interaction().enabled, false);
  levels.dispose();
});
