import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createTrain } from '../src/train/train.js';

test('passenger and driver windows have no opaque backing across their sightlines', () => {
  const scene = new THREE.Scene(),
    train = createTrain({ THREE, scene });
  scene.updateMatrixWorld(true);
  const opaque = [];
  train.cars[0].traverse((mesh) => {
    if (mesh.isMesh && !mesh.material.transparent) opaque.push(mesh);
  });
  const rays = [
    new THREE.Raycaster(new THREE.Vector3(0, 2.9, -2.3), new THREE.Vector3(1, 0, 0), 0, 2),
    new THREE.Raycaster(new THREE.Vector3(0, 2.9, -2.3), new THREE.Vector3(-1, 0, 0), 0, 2),
    new THREE.Raycaster(new THREE.Vector3(-0.86, 2.76, 4.98), new THREE.Vector3(0, 0, 1), 0, 2),
  ];
  const driverEye = new THREE.Vector3(-0.86, 2.72, 4.65);
  const dial = new THREE.Vector3(-1.02, 2.26, 5.67);
  rays.push(
    new THREE.Raycaster(
      driverEye,
      dial.clone().sub(driverEye).normalize(),
      0,
      driverEye.distanceTo(dial) - 0.03,
    ),
  );
  for (const ray of rays) assert.equal(ray.intersectObjects(opaque, false).length, 0);
  assert.ok(train.materials.glass.transparent && !train.materials.glass.depthWrite);
  train.dispose();
  assert.equal(scene.children.length, 0);
});

test('named passengers follow boarding and alighting state while gauges follow the controls', () => {
  const train = createTrain({ THREE, scene: new THREE.Scene() });
  train.update(0.1, {
    speed: 20,
    power: 0.7,
    brake: 0.2,
    passengers: [{ id: 'commuter-1', state: 'riding' }],
  });
  const interior = train.getSystemsState().interiors;
  assert.ok(interior[1].passengerIds.includes('commuter-1'));
  assert.equal(interior[1].seated, 5);
  assert.ok(interior[0].gauges.find((g) => g.kind === 'speed').angle > 0);
  assert.ok(Math.abs(interior[0].gauges.find((g) => g.kind === 'brake').angle - 0.3) < 1e-10);
  train.update(0.1, { passengers: [{ id: 'commuter-1', state: 'walking-to-exit' }] });
  assert.equal(train.getSystemsState().interiors[1].seated, 4);
  train.dispose();
});
