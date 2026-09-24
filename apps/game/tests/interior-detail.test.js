import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createTrain } from '../src/train/train.js';
import { CAR_COUNT } from '../src/train/consist.js';
import { CAB_CARS } from '../src/train/interior.js';
import { DRIVE_LIMITS } from '../src/simulation/physics.js';

const gaugeNames = (car) => {
  const names = [];
  car.traverse((node) => {
    if (typeof node.name === 'string' && node.name.startsWith('Cab / ')) names.push(node.name);
  });
  return names;
};

test('only the first and last cars of the consist carry a driving cab', () => {
  const train = createTrain({ THREE, scene: new THREE.Scene() });
  assert.deepEqual(CAB_CARS, [0, CAR_COUNT - 1]);
  const interiors = train.getSystemsState().interiors;
  assert.equal(interiors.length, CAR_COUNT);
  for (let index = 0; index < CAR_COUNT; index++) {
    const cab = index === 0 || index === CAR_COUNT - 1;
    assert.equal(interiors[index].cab, cab, `car ${index} cab flag`);
    assert.equal(interiors[index].gauges.length, cab ? 3 : 0, `car ${index} gauges`);
    assert.equal(gaugeNames(train.cars[index]).length > 0, cab, `car ${index} cab meshes`);
  }
  train.dispose();
});

test('every visible passenger has a real rider ID and a deterministic activity', () => {
  const train = createTrain({ THREE, scene: new THREE.Scene() });
  const allNamed = [];
  for (const interior of train.getSystemsState().interiors) {
    assert.equal(interior.seated, 4, `car ${interior.carIndex} through riders`);
    for (const id of interior.passengerIds) assert.equal(typeof id, 'string');
    assert.ok(interior.passengerIds.every((id) => !id.includes('undefined')));
    assert.equal(interior.activities.length, interior.passengerIds.length);
    assert.ok(new Set(interior.activities.map((a) => a.activity)).size >= 3);
  }
  const riders = ['returning-1', 'commuter-1', 'commuter-4', 'commuter-6'].map((id) => ({
    id,
    state: 'riding',
  }));
  train.update(0.1, { passengers: riders });
  for (const interior of train.getSystemsState().interiors)
    allNamed.push(...interior.passengerIds.filter((id) => !id.startsWith('through-')));
  assert.deepEqual(allNamed.sort(), ['commuter-1', 'commuter-4', 'commuter-6', 'returning-1']);
  const second = createTrain({ THREE, scene: new THREE.Scene() });
  assert.deepEqual(
    second.getSystemsState().interiors.map((i) => i.activities),
    train
      .getSystemsState()
      .interiors.map((i) => i.activities)
      .map((a) => a.slice(0, 4)),
  );
  train.dispose();
  second.dispose();
});

test('passenger batches stay bounded with finite matrices and no point lights', () => {
  const scene = new THREE.Scene();
  const train = createTrain({ THREE, scene });
  train.update(0.05, {
    speed: 30,
    passengers: ['returning-2', 'commuter-2', 'commuter-5'].map((id) => ({ id, state: 'riding' })),
  });
  for (const car of train.cars) {
    const batches = [];
    car.traverse((node) => {
      assert.ok(!node.isPointLight, 'interior adds no point lights');
      if (node.isInstancedMesh && node.name.startsWith('Interior / passengers')) batches.push(node);
    });
    // Three coats, face, hair, dark, wood, plus collar lining and paper: at most two new batches.
    assert.ok(batches.length <= 11, `car has ${batches.length} passenger batches`);
    for (const mesh of batches) {
      assert.ok(mesh.count > 0 && mesh.count <= 100);
      const array = mesh.instanceMatrix.array;
      for (let i = 0; i < mesh.count * 16; i++) assert.ok(Number.isFinite(array[i]));
    }
  }
  train.dispose();
});

test('speed gauge honours the shared drive limit and pausing keeps the interior still', () => {
  const train = createTrain({ THREE, scene: new THREE.Scene() });
  const speedAngle = () =>
    train.getSystemsState().interiors[0].gauges.find((g) => g.kind === 'speed').angle;
  train.update(0.1, { speed: 0 });
  assert.equal(speedAngle(), 0);
  train.update(0.1, { speed: DRIVE_LIMITS.maxSpeed / 2 });
  assert.ok(Math.abs(speedAngle() - 2.3) < 1e-9);
  train.update(0.1, { speed: DRIVE_LIMITS.maxSpeed * 3 });
  assert.ok(Math.abs(speedAngle() - 4.6) < 1e-9, 'needle clamps at the top of the dial');
  train.update(0.1, { speed: 40 / 3.6 });
  const before = JSON.stringify(train.getSystemsState().interiors);
  train.update(0, { speed: 40 / 3.6 });
  train.update(-1, { speed: 40 / 3.6 });
  assert.equal(JSON.stringify(train.getSystemsState().interiors), before);
  train.dispose();
});

test('a reserved drama seat keeps nearby riders out of the shot only while it is renewed', () => {
  const train = createTrain({ THREE, scene: new THREE.Scene() });
  const car0 = () => train.getSystemsState().interiors.find((i) => i.carIndex === 0);
  assert.equal(car0().seated, 4);
  // A cast member sits beside the first through rider on the left bench.
  train.reserveSeat(0, -1.0, -2.3);
  train.update(0.1, { passengers: [] });
  assert.equal(car0().seated, 3, 'the neighbouring rider is hidden');
  assert.ok(!car0().passengerIds.includes('through-0-0'));
  for (const interior of train.getSystemsState().interiors.filter((i) => i.carIndex !== 0))
    assert.equal(interior.seated, 4, `car ${interior.carIndex} is untouched`);
  // Once the seat is no longer renewed, the rider comes back.
  for (let i = 0; i < 10; i++) train.update(0.1, { passengers: [] });
  assert.equal(car0().seated, 4);
  train.dispose();
});
