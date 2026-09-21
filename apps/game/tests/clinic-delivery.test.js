import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { campaign } from '../src/narrative/story-data.js';
import { createStoryEngine } from '../src/narrative/story-engine.js';
import { createStoryLevels } from '../src/world/story-levels.js';
import {
  performClinicDeliveryAction,
  performLevelTask,
  registerStoryLevelTools,
} from '../src/narrative/story-level-tools.js';
import { routeCenter, routeElevation, scenicTerrain } from '../src/world/extended-route.js';

const railPoint = (z) => new THREE.Vector3(routeCenter(z) + 28, routeElevation(z), z);
const storage = () => {
  const data = new Map();
  return {
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => data.set(key, value),
    removeItem: (key) => data.delete(key),
  };
};
function setup(t, { persisted = storage(), authoredCampaign = campaign } = {}) {
  const engine = createStoryEngine({ campaign: authoredCampaign, storage: persisted });
  const scene = new THREE.Scene();
  const levels = createStoryLevels({ THREE, scene, railPoint, terrainHeight: scenicTerrain });
  let position = railPoint(525),
    speed = 0;
  const act = (action) => performClinicDeliveryAction({ action, engine, levels, position, speed });
  const registry = new Map();
  registerStoryLevelTools({
    tool: (name, description, schema, readOnly, execute) =>
      registry.set(name, { description, schema, readOnly, execute }),
    levels,
    performTask: (taskId) => performLevelTask({ taskId, engine, levels, position, speed }),
    performDeliveryAction: act,
  });
  t.after(() => {
    engine.dispose();
    levels.dispose();
  });
  return {
    engine,
    levels,
    scene,
    persisted,
    act,
    registry,
    setTrain(z, velocity) {
      position = railPoint(z);
      speed = velocity;
    },
  };
}
function reachMomiji(engine, reply = true) {
  engine.start();
  while (engine.getState().activeBeat?.id !== 'momiji-bread') {
    const beat = engine.getState().activeBeat;
    assert.ok(beat, 'story must arrive through its public update method');
    if (beat.choices.length) assert.equal(engine.choose(beat.choices[0].id), true);
    assert.equal(engine.advance(), true);
    const next = engine.nextDestination();
    assert.ok(next);
    engine.update({ z: next.z, speed: 0, started: true, paused: false });
  }
  if (reply) assert.equal(engine.choose('bread-today'), true);
}
const clinic = (levels) =>
  levels.getState().crates.find((crate) => crate.id === 'momiji:clinic-crate');
const stripe = (scene) => scene.getObjectByName('Momiji / clinic crate proposal stripe');

test('real campaign rejects clinic actions before the scene, reply, inspection, station and stop', (t) => {
  const fixture = setup(t),
    { engine, act, registry } = fixture;
  const tool = registry.get('plan_clinic_delivery');
  assert.equal(tool.readOnly, false);
  assert.deepEqual(tool.schema.properties.action.enum, ['inspect', 'later-clinic', 'shared-van']);
  const unchanged = (action) => {
    const before = engine.exportSave();
    assert.equal(act(action).ok, false);
    assert.deepEqual(engine.exportSave(), before);
    assert.throws(() => tool.execute({ action }));
    assert.deepEqual(engine.exportSave(), before);
  };
  unchanged('inspect');
  reachMomiji(engine, false);
  unchanged('inspect');
  unchanged('shared-van');
  engine.choose('bread-today');
  unchanged('later-clinic');
  fixture.setTrain(1500, 0);
  unchanged('inspect');
  fixture.setTrain(525, 0.2);
  unchanged('inspect');
  fixture.setTrain(525, NaN);
  unchanged('inspect');
  fixture.setTrain(525, 0);
  unchanged('invent-a-confirmed-delivery');
  assert.equal(engine.advance(), false);
  assert.equal(
    engine.recordTask('plan-clinic-delivery'),
    false,
    'generic task shortcut cannot bypass inspecting and proposing',
  );
});

test('inspection survives a storage reload, leaves Continue blocked, and is idempotent', (t) => {
  const first = setup(t);
  reachMomiji(first.engine);
  assert.equal(first.registry.get('plan_clinic_delivery').execute({ action: 'inspect' }).ok, true);
  const before = first.engine.exportSave();
  assert.equal(first.act('inspect').ok, true);
  assert.deepEqual(first.engine.exportSave(), before);
  assert.equal(first.engine.getState().canContinue, false);
  assert.equal(first.engine.advance(), false);
  const restored = setup(t, { persisted: first.persisted });
  assert.equal(restored.engine.getState().enabled, false);
  restored.engine.start();
  assert.equal(restored.engine.getState().activeBeat.id, 'momiji-bread');
  assert.deepEqual(restored.engine.getState().deliveryPlan, { inspected: true, proposal: null });
  assert.equal(restored.engine.getState().canContinue, false);
  restored.levels.update({ position: railPoint(525), storyState: restored.engine.getState() });
  assert.equal(clinic(restored.levels).tagState, 'inspected');
  assert.equal(clinic(restored.levels).status, 'pending');
  assert.equal(restored.engine.advance(), false);
});

for (const proposal of ['later-clinic', 'shared-van'])
  test(`${proposal} persists an unconfirmed plan and distinct geometry state without duplicate completion`, (t) => {
    const fixture = setup(t),
      { engine, levels, registry, scene } = fixture;
    reachMomiji(engine);
    const tool = registry.get('plan_clinic_delivery');
    tool.execute({ action: 'inspect' });
    const inspectedColor = stripe(scene).material.color.getHexString();
    const result = tool.execute({ action: proposal });
    assert.equal(result.ok, true);
    assert.deepEqual(result.deliveryPlan, { inspected: true, proposal });
    assert.equal(engine.getState().canContinue, true);
    assert.equal(
      engine.getState().completedTasks.filter((id) => id === 'plan-clinic-delivery').length,
      1,
    );
    assert.equal(clinic(levels).status, 'awaiting-confirmation');
    assert.equal(clinic(levels).visible, true);
    assert.notEqual(stripe(scene).material.color.getHexString(), inspectedColor);
    assert.equal(
      stripe(scene).material.color.getHexString(),
      proposal === 'later-clinic' ? '48856a' : '557caa',
    );
    const saved = engine.exportSave(),
      memories = engine.journal();
    for (const action of ['inspect', 'later-clinic', 'shared-van']) {
      assert.equal(fixture.act(action).ok, false);
      assert.throws(() => tool.execute({ action }));
      assert.deepEqual(engine.exportSave(), saved);
      assert.deepEqual(engine.journal(), memories);
    }
    const restored = setup(t, { persisted: fixture.persisted });
    restored.engine.start();
    assert.deepEqual(restored.engine.getState().deliveryPlan, { inspected: true, proposal });
    restored.levels.update({
      position: railPoint(525),
      storyState: restored.engine.getState(),
      dutiesState: { completed: true },
    });
    assert.equal(clinic(restored.levels).status, 'awaiting-confirmation');
    assert.equal(restored.levels.getState().crates.filter((crate) => crate.visible).length, 1);
    assert.equal(
      stripe(restored.scene).material.color.getHexString(),
      stripe(scene).material.color.getHexString(),
    );
    assert.equal(engine.advance(), true);
    const finished = engine.exportSave();
    assert.equal(engine.advance(), false);
    assert.deepEqual(engine.exportSave(), finished);
    assert.equal(fixture.act(proposal).ok, false);
  });

test('legacy checkpoints made before the clinic task retain their chapter position without invented proposals', (t) => {
  const oldCampaign = structuredClone(campaign);
  delete oldCampaign.beats.find((beat) => beat.id === 'momiji-bread').task;
  const legacy = setup(t, { authoredCampaign: oldCampaign });
  reachMomiji(legacy.engine);
  for (const complete of [false, true]) {
    if (complete) assert.equal(legacy.engine.advance(), true);
    const oldSave = legacy.engine.exportSave();
    delete oldSave.deliveryPlan;
    delete oldSave.taskFacts;
    const restored = setup(t);
    assert.equal(restored.engine.importSave(oldSave).ok, true);
    restored.engine.start();
    assert.equal(restored.engine.getState().progress.completed, oldSave.completed);
    assert.deepEqual(restored.engine.getState().deliveryPlan, { inspected: false, proposal: null });
    assert.equal(restored.engine.getState().completedTasks.includes('plan-clinic-delivery'), false);
    if (!complete) assert.equal(restored.engine.getState().canContinue, false);
    else assert.equal(restored.engine.nextDestination().id, 'sakuragawa-water');
  }
});

test('malformed or inconsistent delivery saves are rejected without changing the live story', (t) => {
  const { engine } = setup(t);
  reachMomiji(engine);
  const original = engine.exportSave();
  const variants = [
    { deliveryPlan: null },
    { deliveryPlan: [] },
    { deliveryPlan: { inspected: 'yes', proposal: null } },
    {
      deliveryPlan: { inspected: false, proposal: 'shared-van' },
      taskFacts: { 'plan-clinic-delivery': true },
    },
    { deliveryPlan: { inspected: true, proposal: 'confirmed' } },
    { deliveryPlan: { inspected: true, proposal: 'later-clinic' }, taskFacts: {} },
    {
      deliveryPlan: { inspected: true, proposal: null },
      taskFacts: { 'plan-clinic-delivery': true },
    },
    { deliveryPlan: { inspected: true, proposal: null, delivered: true } },
    {
      completed: 0,
      choices: {},
      selectedChoice: 'recorder-history',
      deliveryPlan: { inspected: true, proposal: null },
    },
  ];
  for (const patch of variants) {
    assert.equal(engine.importSave({ ...original, ...patch }).ok, false, JSON.stringify(patch));
    assert.deepEqual(engine.exportSave(), original);
  }
});

test('an imported inspection or proposal cannot precede the mandatory Momiji reply', (t) => {
  const { engine } = setup(t);
  reachMomiji(engine, false);
  const original = engine.exportSave();
  for (const proposal of [null, 'later-clinic']) {
    const attempted = {
      ...original,
      deliveryPlan: { inspected: true, proposal },
      taskFacts: proposal ? { 'plan-clinic-delivery': true } : {},
    };
    assert.equal(
      engine.importSave(attempted).ok,
      false,
      'saved task cannot bypass the reply required by the live action',
    );
    assert.deepEqual(engine.exportSave(), original);
  }
});
