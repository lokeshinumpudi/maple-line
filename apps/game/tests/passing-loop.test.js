import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createPassingLoop, createPassingLoopCurve } from '../src/world/passing-loop.js';
import { routeCenter, routeElevation } from '../src/world/extended-route.js';

const railPoint = (z) => {
  const u = z > 130 && z < 430 ? 28 - 85 * Math.sin(((z - 130) / 300) * Math.PI) ** 2 : 28;
  return new THREE.Vector3(routeCenter(z) + u, routeElevation(z), z);
};
const setup = () => {
  const scene = new THREE.Scene();
  return { scene, loop: createPassingLoop({ THREE, scene, railPoint, terrainHeight: () => 4.1 }) };
};

test('passing loop joins the main line at both ends and keeps a safe parallel berth', () => {
  const curve = createPassingLoopCurve({ THREE, railPoint });
  assert.ok(curve.getPoint(0).distanceTo(railPoint(410)) < 1e-8);
  assert.ok(curve.getPoint(1).distanceTo(railPoint(640)) < 1e-8);
  const occupiedTrack = Array.from({ length: 241 }, (_, i) => railPoint(478 + i / 4));
  let nearest = Infinity;
  for (let t = 0; t <= 1; t += 0.001) {
    const point = curve.getPointAt(t);
    const distance = Math.min(...occupiedTrack.map((main) => point.distanceTo(main)));
    nearest = Math.min(nearest, distance);
  }
  // Main half-width ~1.4 m + passing half-width 1.225 m, with over a metre to spare.
  assert.ok(nearest > 4, `siding clearance ${nearest} m`);
});

test('both carriages follow exactly the rail curve and clear the main platform', () => {
  const { loop } = setup();
  const curve = createPassingLoopCurve({ THREE, railPoint });
  const length = curve.getLength();
  let sightings = 0;
  for (let progress = 0; progress <= 1; progress += 0.01) {
    loop.update({ active: true, progress });
    for (const car of loop.getState().cars) {
      if (!car.visible) continue;
      sightings++;
      const actual = new THREE.Vector3(...car.position);
      assert.ok(actual.distanceTo(curve.getPointAt(car.distance / length)) < 1e-8);
      assert.ok(Math.abs(Math.hypot(...car.tangent) - 1) < 1e-8);
    }
  }
  assert.ok(sightings > 150);
  assert.ok(loop.getState().renderBatches <= 15);
  loop.dispose();
});

test('signals hold red through the pass and release green only when finished or inactive', () => {
  const { loop } = setup();
  assert.equal(loop.getState().signal, 'green');
  for (const progress of [0, 0.5, 0.99]) {
    loop.update({ active: true, progress });
    assert.equal(loop.getState().signal, 'red');
  }
  loop.update({ active: true, progress: 1 });
  assert.equal(loop.getState().signal, 'green');
  assert.ok(loop.getState().cars.every((car) => !car.visible));
  loop.update({ active: false, progress: 0.5 });
  assert.equal(loop.getState().signal, 'green');
  assert.ok(loop.getState().cars.every((car) => !car.visible));
  loop.dispose();
});

test('updates reuse geometry and disposal releases the static railway and train', () => {
  const { loop, scene } = setup();
  const geometry = new Set();
  scene.traverse((object) => {
    if (object.geometry) geometry.add(object.geometry);
  });
  for (let i = 0; i < 100; i++) loop.update({ active: true, progress: i / 100, dt: 0.12 });
  const after = new Set();
  scene.traverse((object) => {
    if (object.geometry) after.add(object.geometry);
  });
  assert.deepEqual(after, geometry);
  let disposed = 0;
  for (const item of geometry) item.addEventListener('dispose', () => disposed++);
  loop.dispose();
  loop.dispose();
  assert.equal(disposed, geometry.size);
  assert.equal(scene.children.length, 0);
  loop.update({ active: true, progress: 0.5 });
  assert.ok(loop.getState().cars.every((car) => !car.visible));
});

test('a finished pass remains red until the duty interlocking permits departure', () => {
  const { loop } = setup();
  loop.update({ active: true, progress: 0.5, canDepart: true });
  assert.equal(
    loop.getState().signal,
    'red',
    'an occupied line takes precedence over a stale clearance',
  );
  loop.update({ active: true, progress: 1, canDepart: false });
  assert.equal(loop.getState().signal, 'red');
  loop.update({ active: false, progress: 1, canDepart: false });
  assert.equal(loop.getState().signal, 'red');
  loop.update({ active: false, progress: 1, canDepart: true });
  assert.equal(loop.getState().signal, 'green');
  loop.dispose();
});
