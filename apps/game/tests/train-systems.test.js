import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { trainSystems } from '../src/train/systems.js';
import { createTrain } from '../src/train/train.js';
import { createPowerFlow } from '../src/train/power-flow.js';
import { createGameStore } from '../src/state/game-store.js';
import { advanceDrive } from '../src/simulation/physics.js';

test('weather, tunnels and manual overrides control lights and wipers', () => {
  assert.equal(trainSystems({ weather: 'rain' }).headlightOn, true);
  assert.equal(trainSystems({ weather: 'rain' }).wipersOn, true);
  assert.equal(trainSystems({ inTunnel: true }).cabinOn, true);
  assert.equal(trainSystems({ weather: 'clear' }).headlightOn, false);
  assert.equal(trainSystems({ weather: 'rain', lights: 'off', wipers: 'off' }).headlightOn, false);
  assert.equal(trainSystems({ weather: 'rain', wipers: 'off' }).wipersOn, false);
  const scene = new THREE.Scene(),
    model = createTrain({ THREE, scene });
  model.update(0.2, { weather: 'rain', leadCar: 0 });
  const a = model.getSystemsState().wiperAngles;
  model.update(0.2, { weather: 'rain', leadCar: 0 });
  const b = model.getSystemsState().wiperAngles;
  assert.notDeepEqual(a, b);
  const beams = [];
  scene.traverse((o) => {
    if (o.isSpotLight) beams.push(o);
  });
  assert.ok(beams[0].intensity > 0);
  assert.equal(beams[1].intensity, 0);
  model.update(0.2, { weather: 'rain', leadCar: 4, direction: -1 });
  assert.equal(beams[0].intensity, 0);
  assert.ok(beams[1].intensity > 0);
  model.dispose();
});

test('an open platform doorway exposes the aisle rather than a solid shell', () => {
  const scene = new THREE.Scene(),
    model = createTrain({ THREE, scene });
  const ray = new THREE.Raycaster(
    new THREE.Vector3(3, 2.4, 4.8),
    new THREE.Vector3(-1, 0, 0),
    0,
    3,
  );
  scene.updateMatrixWorld(true);
  assert.ok(ray.intersectObjects(model.cars[0].children, true).length > 0);
  for (let i = 0; i < 100; i++) model.update(0.05, { doorsOpen: true, direction: 1 });
  scene.updateMatrixWorld(true);
  assert.equal(ray.intersectObjects(model.cars[0].children, true).length, 0);
  model.dispose();
});

test('closing doors lock power in both state actions and the physics integrator', () => {
  const store = createGameStore();
  store.updateDrive((d) => {
    d.doorsClosing = true;
    d.power = 1;
    d.actualPower = 1;
    d.autopilot = true;
  });
  assert.equal(store.getState().drive.power, 0);
  assert.equal(store.getState().drive.autopilot, false);
  const state = { ...store.getState().drive, power: 1, brake: 0, actualPower: 1 };
  advanceDrive(state, 1);
  assert.equal(state.speed, 0);
  assert.equal(state.actualPower, 0);
  store.setPreferences({ trainLights: 'on', trainWipers: 'off', powerFlow: false });
  assert.throws(() => store.setPreferences({ trainLights: 'bright' }));
});

test('current markers follow rail elevation and turn off under interlocks', () => {
  const scene = new THREE.Scene(),
    cars = [{ position: new THREE.Vector3(0, 0, 20) }, { position: new THREE.Vector3(0, 0, 6.5) }];
  const flow = createPowerFlow({
    scene,
    cars,
    railPoint: (z) => new THREE.Vector3(z * 0.1, z * 0.02, z),
  });
  flow.update(0.1, { power: 0.8 });
  const m = new THREE.Matrix4();
  scene.children[0].getMatrixAt(0, m);
  assert.ok(Math.abs(m.elements[13] - (m.elements[14] * 0.02 + 7.35)) < 1e-5);
  assert.equal(flow.getState().visible, true);
  for (const patch of [
    { doorsOpen: true },
    { doorFraction: 0.5 },
    { emergency: true },
    { enabled: false },
  ]) {
    flow.update(0.1, { power: 1, ...patch });
    assert.equal(flow.getState().visible, false);
  }
  flow.dispose();
  assert.equal(scene.children.length, 0);
});

test('wheel rotation follows travelled distance and ignores viewpoint jumps', () => {
  const scene = new THREE.Scene(),
    model = createTrain({ THREE, scene });
  model.update(0, { distance: 100 });
  model.update(0.05, { distance: 101, speed: 0 });
  const expected = 1 / model.dimensions.wheelRadius;
  assert.ok(Math.abs(model.getSystemsState().wheelAngle - expected) < 1e-8);
  model.update(0.05, { distance: 900, speed: 0 });
  assert.ok(Math.abs(model.getSystemsState().wheelAngle - expected) < 1e-8);
  model.update(0.05, { distance: 899, wheelDirection: -1 });
  assert.ok(Math.abs(model.getSystemsState().wheelAngle) < 1e-8);
  model.dispose();
});
