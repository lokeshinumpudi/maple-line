import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createTrain } from '../src/train/train.js';
const setup = () =>
  createTrain({
    THREE,
    scene: new THREE.Scene(),
    track: new THREE.LineCurve3(new THREE.Vector3(0, 4.75, 0), new THREE.Vector3(0, 4.75, 100)),
    trackLength: 100,
    wireHeight: 12.1,
  });
test('pantograph contact shoes meet the wire and wheels meet the railhead', () => {
  const model = setup();
  for (const p of model.pantographs) assert.equal(p.localContactHeight + p.railHeight, 12.1);
  assert.equal(model.dimensions.wheelCenterHeight - model.dimensions.wheelRadius, 0.315);
  model.dispose();
});
test('stationary doors visibly slide on the platform side and close before moving', () => {
  const model = setup(),
    mesh = model.cars[0].children.find(
      (o) => o.name.includes('sliding door leaves') && o.material === model.materials.cream,
    ),
    before = new THREE.Matrix4(),
    after = new THREE.Matrix4();
  mesh.getMatrixAt(0, before);
  for (let i = 0; i < 100; i++) model.update(0.05, { doorsOpen: true, direction: 1, speed: 0 });
  assert.equal(model.getDoorState().openFraction, 1);
  mesh.getMatrixAt(0, after);
  assert.deepEqual([...before.elements], [...after.elements]);
  mesh.getMatrixAt(4, after);
  const zOpened = after.elements[14];
  model.update(4, { doorsOpen: false, direction: 1, speed: 0 });
  mesh.getMatrixAt(4, before);
  assert.ok(Math.abs(Math.abs(zOpened - before.elements[14]) - 0.64) < 0.001);
  for (let i = 0; i < 100; i++) model.update(0.05, { doorsOpen: true, speed: 3, direction: -1 });
  assert.equal(model.getDoorState().openFraction, 0);
  assert.equal(model.getDoorState().platformSide, 'left');
  model.dispose();
});

test('local service has five carriages with rear lighting attached to the last carriage', () => {
  const model = setup();
  assert.equal(model.cars.length, 5);
  assert.ok(model.cars[4].children.some((object) => object.isSpotLight));
  assert.ok(!model.cars[2].children.some((object) => object.isSpotLight));
  model.dispose();
});
