import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createStoryCinematics } from '../src/narrative/story-cinematics.js';

const train = new THREE.Vector3(0, 4.75, 100);
const story = { enabled: true, status: 'dialogue', activeBeat: { id: 'station', speaker: 'Haru' } };
const cast = {
  visible: true,
  feet: [
    { id: 'haru', position: [4.8, 5.35, 99] },
    { id: 'emi', position: [4.8, 5.35, 101] },
  ],
};
const ground = () => 4.75;
function setup({ terrainHeight = ground, reducedMotion = false } = {}) {
  const camera = new THREE.PerspectiveCamera(48, 16 / 9, 0.3, 2000);
  camera.position.set(-90, 59, 45);
  camera.lookAt(train.clone().add(new THREE.Vector3(0, 3, 0)));
  const base = camera.position.clone();
  const rotation = camera.quaternion.clone();
  const cinematic = createStoryCinematics({
    THREE,
    camera,
    railPoint: (z) => new THREE.Vector3(0, 4.75, z),
    terrainHeight,
    reducedMotion,
  });
  const update = (options = {}) =>
    cinematic.update({
      dt: 1 / 60,
      storyState: story,
      castState: cast,
      trainPosition: train,
      baseCameraPosition: base,
      baseCameraQuaternion: rotation,
      ...options,
    });
  return { camera, cinematic, base, rotation, update };
}

test('putting dialogue away recenters the cast without restarting the scene or moving the eye', () => {
  const { camera, cinematic, update } = setup();
  for (let i = 0; i < 100; i++) update();
  const initial = cinematic.getState();
  const initialEye = camera.position.clone();
  update({ dialogueFraction: 0 });
  const first = cinematic.getState();
  assert.equal(first.phase, 'conversation');
  assert.equal(first.beatId, initial.beatId);
  assert.ok(first.target[1] > initial.target[1]);
  assert.ok(first.target[1] - initial.target[1] < 0.1, 'reframing begins gently');
  for (let i = 0; i < 240; i++) update({ dialogueFraction: 0 });
  assert.ok(cinematic.getState().target[1] > initial.target[1] + 0.85);
  assert.ok(camera.position.distanceTo(initialEye) < 1e-6);
  for (let i = 0; i < 240; i++) update();
  assert.ok(Math.abs(cinematic.getState().target[1] - initial.target[1]) < 0.01);
});

test('conversation camera eases into the visible cast and returns to the latest gameplay pose', () => {
  const { camera, cinematic, base, rotation, update } = setup();
  const first = update({ dt: 0 });
  assert.equal(first.phase, 'entering');
  assert.equal(first.blend, 0);
  assert.ok(camera.position.distanceTo(base) < 1e-9);
  let previous = camera.position.clone();
  let previousBlend = 0;
  for (let i = 0; i < 100; i++) {
    const state = update();
    assert.ok(state.blend >= previousBlend);
    assert.ok(camera.position.distanceTo(previous) < 3, 'entry must not teleport the eye');
    previous.copy(camera.position);
    previousBlend = state.blend;
  }
  assert.equal(cinematic.getState().phase, 'conversation');
  assert.equal(cinematic.getState().subject, 'cast');
  assert.equal(cinematic.getState().ready, true);
  assert.ok(camera.position.x > 10 && camera.position.x < 15);
  const departure = camera.position.clone();
  update({ dt: 0, storyState: { enabled: true, status: 'travelling' } });
  assert.ok(camera.position.distanceTo(departure) < 1e-9);
  const newBase = new THREE.Vector3(-80, 70, 20);
  for (let i = 0; i < 100; i++)
    update({ storyState: { enabled: false }, baseCameraPosition: newBase });
  assert.equal(cinematic.getState().phase, 'gameplay');
  assert.equal(cinematic.getState().blend, 0);
  assert.ok(camera.position.distanceTo(newBase) < 1e-9);
  assert.ok(camera.quaternion.angleTo(rotation) < 1e-7);
});

test('train-only compositions stay wide when the platform cast is unavailable', () => {
  const { camera, cinematic, update } = setup();
  for (let i = 0; i < 100; i++) update({ castState: { visible: false } });
  assert.equal(cinematic.getState().subject, 'train');
  assert.ok(Math.hypot(camera.position.x - train.x, camera.position.z - train.z) > 50);
  assert.ok(camera.position.y > train.y + 20);
});

test('cast camera clears terrain samples across the line of sight and keeps the eye above ground', () => {
  const terrainHeight = (x, z) => (x > 7 && x < 10 && z > 95 && z < 110 ? 12 : 4.75);
  const { camera, cinematic, update } = setup({ terrainHeight });
  for (let i = 0; i < 100; i++) {
    update();
    const target = new THREE.Vector3(...cinematic.getState().target);
    assert.ok(camera.position.y >= terrainHeight(camera.position.x, camera.position.z) + 0.99);
    for (let j = 1; j <= 32; j++) {
      const sample = target.clone().lerp(camera.position, j / 32);
      assert.ok(sample.y >= terrainHeight(sample.x, sample.z) + 0.34);
    }
  }
});

test('speaker changes adjust framing gently without restarting or whipping the camera', () => {
  const { camera, cinematic, update } = setup();
  for (let i = 0; i < 100; i++) update();
  const previous = camera.quaternion.clone();
  const eye = camera.position.clone();
  update({ storyState: { ...story, activeBeat: { ...story.activeBeat, speaker: 'Emi' } } });
  assert.equal(cinematic.getState().phase, 'conversation');
  assert.ok(camera.position.distanceTo(eye) < 0.03);
  assert.ok(camera.quaternion.angleTo(previous) < 0.01);
});

test('reduced motion uses immediate compositions and tunnel views preserve the driver camera', () => {
  const { camera, cinematic, update, base, rotation } = setup({ reducedMotion: true });
  update();
  assert.equal(cinematic.getState().phase, 'conversation');
  assert.equal(cinematic.getState().blend, 1);
  update({ inTunnel: true });
  assert.equal(cinematic.getState().reason, 'tunnel-driver');
  assert.equal(cinematic.getState().blend, 0);
  assert.ok(camera.position.distanceTo(base) < 1e-9);
  assert.ok(camera.quaternion.angleTo(rotation) < 1e-7);
  update({ storyState: { enabled: false } });
  assert.equal(cinematic.getState().phase, 'gameplay');
});

test('base restoration prevents overlay feedback into the gameplay rig', () => {
  const { camera, cinematic, update, base, rotation } = setup();
  for (let i = 0; i < 100; i++) update();
  assert.ok(camera.position.distanceTo(base) > 30);
  cinematic.restoreBaseCamera();
  assert.ok(camera.position.distanceTo(base) < 1e-9);
  assert.ok(camera.quaternion.angleTo(rotation) < 1e-7);
  update();
  assert.ok(camera.position.distanceTo(base) > 30);
  cinematic.dispose();
  assert.equal(cinematic.getState().phase, 'disposed');
  assert.ok(camera.position.distanceTo(base) < 1e-9);
  update();
  assert.ok(camera.position.distanceTo(base) < 1e-9);
});

test('time boundaries reject invalid input, keep zero dt still, and bound background-tab catchup', () => {
  const { cinematic, update } = setup();
  for (const dt of [-1, Infinity, NaN]) assert.throws(() => update({ dt }), /dt/);
  update({ dt: 0 });
  assert.equal(cinematic.getState().elapsed, 0);
  update({ dt: 300 });
  assert.equal(cinematic.getState().elapsed, 0.1);
  assert.ok(cinematic.getState().blend < 0.02);
  assert.throws(() => update({ trainPosition: [0, NaN, 0] }), /position/);
});

test('camera travelling from the driver pose to platform cast never enters a carriage shell', () => {
  const { camera, update } = setup();
  const cabEye = train.clone().add(new THREE.Vector3(0, 2.9, 7.2));
  camera.position.copy(cabEye);
  camera.lookAt(cabEye.clone().add(new THREE.Vector3(0, 0, 40)));
  for (let i = 0; i < 100; i++) {
    update({ baseCameraPosition: cabEye, baseCameraQuaternion: camera.quaternion.clone() });
    const relative = camera.position.clone().sub(train);
    const inside =
      Math.abs(relative.x) < 2.2 && relative.z > -34 && relative.z < 6.8 && relative.y < 5.79;
    assert.equal(inside, false);
  }
});

test('base restoration runs once so a subsequent gameplay snap is not undone', () => {
  const { camera, cinematic, update, base } = setup();
  for (let i = 0; i < 100; i++) update();
  cinematic.restoreBaseCamera();
  assert.ok(camera.position.distanceTo(base) < 1e-9);
  const snapped = new THREE.Vector3(90, 80, 1900);
  camera.position.copy(snapped);
  camera.lookAt(new THREE.Vector3(0, 8, 2000));
  const rotation = camera.quaternion.clone();
  cinematic.restoreBaseCamera();
  assert.ok(camera.position.distanceTo(snapped) < 1e-9);
  assert.ok(camera.quaternion.angleTo(rotation) < 1e-7);
});

test('explicit travel starts the next composition at the new camera instead of crossing kilometres', () => {
  const { camera, cinematic, update } = setup();
  for (let i = 0; i < 100; i++) update();
  const destination = new THREE.Vector3(0, 4.75, 2000);
  const freshBase = new THREE.Vector3(-90, 59, 1945);
  const destinationCast = {
    ...cast,
    feet: cast.feet.map((foot) => ({
      ...foot,
      position: [foot.position[0], foot.position[1], foot.position[2] + 1900],
    })),
  };
  update({
    dt: 0,
    trainPosition: destination,
    castState: destinationCast,
    baseCameraPosition: freshBase,
    storyState: { ...story, activeBeat: { id: 'next-station', speaker: 'Emi' } },
  });
  assert.equal(cinematic.getState().reason, 'travel-cut');
  assert.equal(cinematic.getState().travelCuts, 1);
  assert.equal(cinematic.getState().phase, 'entering');
  assert.equal(cinematic.getState().blend, 0);
  assert.ok(camera.position.distanceTo(freshBase) < 1e-9);
  for (let i = 0; i < 100; i++) {
    update({
      trainPosition: destination,
      castState: destinationCast,
      baseCameraPosition: freshBase,
      storyState: { ...story, activeBeat: { id: 'next-station', speaker: 'Emi' } },
    });
    assert.ok(Math.abs(camera.position.z - destination.z) < 100);
  }
  assert.equal(cinematic.getState().phase, 'conversation');
});

test('rolling dialogue leaves the gameplay camera available through bridge and tunnel scenes', () => {
  const { camera, cinematic, update, base, rotation } = setup();
  const rolling = { ...story, activeBeat: { ...story.activeBeat, delivery: 'rolling' } };
  for (let i = 0; i < 120; i++) update({ storyState: rolling });
  assert.equal(cinematic.getState().phase, 'gameplay');
  assert.equal(cinematic.getState().blend, 0);
  assert.ok(camera.position.distanceTo(base) < 1e-9);
  assert.ok(camera.quaternion.angleTo(rotation) < 1e-7);
  update({ storyState: rolling, inTunnel: true });
  assert.ok(camera.position.distanceTo(base) < 1e-9);
});

test('wildlife framing keeps the visitor above an expanded conversation card', () => {
  const { camera, update } = setup({ reducedMotion: true });
  const animal = { x: 6.7, y: 4.75, z: 100 };
  const state = update({ wildlifeState: { visible: true, pose: animal }, dialogueFraction: 0.55 });
  assert.equal(state.subject, 'cast-and-wildlife');
  const screen = new THREE.Vector3(animal.x, animal.y + 0.3, animal.z).project(camera);
  assert.ok(screen.x > -1 && screen.x < 1);
  assert.ok(screen.y > 0.1 && screen.y < 1, 'visitor must be in the upper 45% above the card');
});

test('task response moves once to the physical prop and holds the completed result until Continue', () => {
  const { camera, cinematic, update, base } = setup();
  const task = { id: 'return-spanner', required: true, completed: false };
  const taskStory = {
    ...story,
    activeBeat: { ...story.activeBeat, task, phase: 'dialogue', choices: [{ id: 'return' }] },
  };
  const focus = { id: task.id, position: [7, 5.55, 135] };
  for (let i = 0; i < 100; i++) update({ storyState: taskStory, taskFocus: focus });
  assert.equal(cinematic.getState().subject, 'cast', 'the task shot waits for the reply');
  const origin = camera.position.clone();
  taskStory.activeBeat.phase = 'response';
  update({ dt: 0, storyState: taskStory, taskFocus: focus });
  assert.equal(cinematic.getState().phase, 'entering');
  assert.equal(cinematic.getState().sceneKey, 'station:task:return-spanner');
  assert.ok(camera.position.distanceTo(origin) < 1e-9);
  for (let i = 0; i < 100; i++) update({ storyState: taskStory, taskFocus: focus });
  assert.equal(
    cinematic.getState().phase,
    'conversation',
    'a repeated focus must not restart the transition',
  );
  assert.equal(cinematic.getState().subject, 'task');
  assert.ok(camera.position.distanceTo(new THREE.Vector3(12, 7.55, 138)) < 1e-9);
  assert.deepEqual(cinematic.getState().target, [7, 4.75, 135]);
  taskStory.activeBeat.task.completed = true;
  for (let i = 0; i < 30; i++) update({ storyState: taskStory });
  assert.equal(cinematic.getState().taskId, 'return-spanner');
  assert.equal(cinematic.getState().phase, 'conversation');
  const end = camera.position.clone();
  update({ dt: 0, storyState: { enabled: true, status: 'travelling' } });
  assert.equal(cinematic.getState().phase, 'leaving');
  assert.ok(camera.position.distanceTo(end) < 1e-9);
  for (let i = 0; i < 100; i++) update({ storyState: { enabled: true, status: 'travelling' } });
  assert.equal(cinematic.getState().phase, 'gameplay');
  assert.equal(cinematic.getState().taskId, null);
  assert.ok(camera.position.distanceTo(base) < 1e-9);
});

test('a new beat leaves the prior prop shot and malformed focus cannot poison the camera', () => {
  const { camera, cinematic, update } = setup({ reducedMotion: true });
  const taskStory = {
    ...story,
    activeBeat: { ...story.activeBeat, phase: 'response', task: { id: 'board', required: true } },
  };
  update({ storyState: taskStory, taskFocus: { id: 'board', position: [7, 5.55, 135] } });
  assert.equal(cinematic.getState().subject, 'task');
  update({ storyState: { ...story, activeBeat: { id: 'next', speaker: 'Emi' } } });
  assert.equal(cinematic.getState().subject, 'cast');
  assert.equal(cinematic.getState().taskId, null);
  assert.equal(cinematic.getState().sceneKey, 'next:cast');
  const eye = camera.position.clone();
  for (const taskFocus of [
    { id: 'x', position: [1, NaN, 2] },
    { id: 'x', position: [1, 2] },
    { id: '', position: [1, 2, 3] },
  ]) {
    assert.throws(() => update({ taskFocus }), /task focus/);
    assert.ok(camera.position.distanceTo(eye) < 1e-9);
  }
});

test('task shots keep terrain and carriage clearance during the transition', () => {
  const { camera, cinematic, update } = setup({
    terrainHeight: (x, z) => (x > 3 && x < 5 && z > 120 ? 8 : 4.75),
  });
  const taskStory = {
    ...story,
    activeBeat: { ...story.activeBeat, phase: 'response', task: { id: 'board', required: true } },
  };
  for (let i = 0; i < 100; i++) {
    update({ storyState: taskStory, taskFocus: { id: 'board', position: [7, 8.5, 135] } });
    assert.ok(camera.position.y >= 5.75);
    const target = new THREE.Vector3(...cinematic.getState().target);
    for (let j = 1; j <= 32; j++) {
      const sample = target.clone().lerp(camera.position, j / 32);
      const height = sample.x > 3 && sample.x < 5 && sample.z > 120 ? 8 : 4.75;
      assert.ok(sample.y >= height + 0.34);
    }
  }
  assert.equal(cinematic.getState().phase, 'conversation');
});

test('platform visitors and both faces remain above a tall dialogue card', () => {
  const { camera, update } = setup({ reducedMotion: true });
  const platformCast = {
    ...cast,
    stageType: 'platform',
    feet: [
      { id: 'haru', position: [6.55, 5.35, 99.2] },
      { id: 'emi', position: [6.55, 5.35, 100.8] },
    ],
  };
  const animal = { x: 10.2, y: 4.75, z: 102.7 };
  update({
    castState: platformCast,
    wildlifeState: { visible: true, pose: animal },
    dialogueFraction: 0.55,
  });
  const foot = new THREE.Vector3(animal.x, animal.y, animal.z).project(camera);
  assert.ok(foot.y > 0.16 && foot.y < 1, 'animal feet clear the card plus bottom margin');
  for (const person of platformCast.feet) {
    const head = new THREE.Vector3(...person.position)
      .add(new THREE.Vector3(0, 1.65, 0))
      .project(camera);
    assert.ok(head.y > 0.16 && head.y < 0.95, 'faces stay below the top HUD');
  }
});

test('near-track clinic task is viewed from outside the platform with no roof on its sightline', () => {
  const camera = new THREE.PerspectiveCamera(48, 16 / 9, 0.3, 2000);
  camera.position.set(55, 20, 510);
  const crate = new THREE.Vector3(44.7, 5.55, 528);
  camera.lookAt(crate);
  const cinematic = createStoryCinematics({
    THREE,
    camera,
    railPoint: (z) => new THREE.Vector3(38.15, 4.75, z),
    terrainHeight: () => 4.75,
    reducedMotion: true,
  });
  // Envelope from the reported blocking roof; it must not appear between the task eye and crate.
  const roof = new THREE.Box3(new THREE.Vector3(38, 9.4, 524), new THREE.Vector3(42, 9.7, 537));
  const previousEye = new THREE.Vector3(39.56, 10.55, 531);
  const previousLook = new THREE.Vector3(44.7, 5.35, 528);
  const hit = new THREE.Vector3();
  const previousRay = new THREE.Ray(previousEye, previousLook.clone().sub(previousEye).normalize());
  assert.ok(
    previousRay.intersectBox(roof, hit),
    'the regression fixture reproduces the blocked roof view',
  );
  assert.ok(hit.distanceTo(previousEye) < previousLook.distanceTo(previousEye));
  cinematic.update({
    dt: 0,
    trainPosition: new THREE.Vector3(38.15, 4.75, 525),
    storyState: {
      enabled: true,
      status: 'dialogue',
      activeBeat: {
        id: 'momiji-bread',
        phase: 'response',
        task: { id: 'plan-clinic-delivery', required: true },
      },
    },
    taskFocus: { id: 'plan-clinic-delivery', position: crate.toArray() },
  });
  assert.ok(camera.position.x > crate.x + 4.9);
  const ray = new THREE.Ray(
    camera.position.clone(),
    crate.clone().sub(camera.position).normalize(),
  );
  assert.equal(ray.intersectBox(roof, hit), null);
  const projected = crate.clone().project(camera);
  assert.ok(Math.abs(projected.x) < 0.8);
  assert.ok(projected.y > 0 && projected.y < 0.8, 'crate remains visible above frame centre');
  assert.ok(projected.z > -1 && projected.z < 1);
});

test('near-track props use either platform outer side while distant workbenches keep the front view', () => {
  const { camera, cinematic, update } = setup({ reducedMotion: true });
  for (const [x, expectedX] of [
    [6.55, 11.55],
    [-6.55, -11.55],
    [13.7, 8.7],
    [14.8, 9.8],
  ]) {
    const id = `prop-${x}`;
    update({
      storyState: { ...story, activeBeat: { id, phase: 'response', task: { id, required: true } } },
      taskFocus: { id, position: [x, 5.55, 135] },
    });
    assert.ok(Math.abs(camera.position.x - expectedX) < 1e-9);
    assert.deepEqual(cinematic.getState().target, [x, 4.75, 135]);
  }
});

test('clinic crate, spanner and noticeboard stay above a 55 percent dialogue card', () => {
  const fixtures = [
    { id: 'plan-clinic-delivery', position: [6.55, 5.55, 102.93] },
    { id: 'return-spanner', position: [13.7, 5.9, 135.5] },
    { id: 'amend-connection', position: [14.8, 6.85, 128] },
  ];
  for (const taskFocus of fixtures) {
    const { camera, cinematic, update } = setup({ reducedMotion: true });
    const activeStory = {
      ...story,
      activeBeat: {
        id: taskFocus.id,
        phase: 'response',
        task: { id: taskFocus.id, required: true },
      },
    };
    update({ storyState: activeStory, taskFocus, dialogueFraction: 0.55 });
    const prop = new THREE.Vector3(...taskFocus.position);
    const screen = prop.clone().project(camera);
    const pixelY = (1 - screen.y) * 400;
    assert.ok(
      pixelY > 64 && pixelY < 348,
      `${taskFocus.id} center at ${pixelY}px must clear card top360px by12px and stay below top HUD`,
    );
    assert.ok(Math.abs(screen.x) < 0.8 && screen.z > -1 && screen.z < 1);
    const eye = camera.position.clone();
    const expandedTarget = cinematic.getState().target[1];
    update({ storyState: activeStory, taskFocus, dialogueFraction: 0 });
    assert.ok(
      camera.position.distanceTo(eye) < 1e-9,
      'putting the card away only reframes the prop',
    );
    assert.ok(cinematic.getState().target[1] > expandedTarget + 1.5);
    assert.ok(Math.abs(prop.project(camera).y) < 1e-8, 'without a card the prop is centered');
  }
});
