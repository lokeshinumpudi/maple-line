import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {
  sampleRegionalTraffic,
  createRegionalTrafficCurve,
  createRegionalRailTraffic,
} from '../src/world/regional-rail-traffic.js';
const railPoint = (z) => new THREE.Vector3(Math.sin(z / 300) * 20, 15 + z * 0.01, z);
function setup() {
  const scene = new THREE.Scene();
  const traffic = createRegionalRailTraffic({ THREE, scene, railPoint, terrainHeight: () => 10 });
  return { scene, traffic };
}
test('exclusive timetable has two different trains, scheduled dwell and offstage gaps', () => {
  assert.equal(sampleRegionalTraffic(0).service, 'village-local');
  assert.equal(sampleRegionalTraffic(84).service, null);
  assert.equal(sampleRegionalTraffic(95).service, 'blue-parcels');
  assert.equal(sampleRegionalTraffic(179).service, null);
  assert.equal(sampleRegionalTraffic(190).service, 'village-local');
  for (const time of [35, 40, 49, 130, 139, 144]) {
    assert.equal(sampleRegionalTraffic(time).stopped, true);
    assert.equal(sampleRegionalTraffic(time).progress, 0.5);
  }
  assert.equal(sampleRegionalTraffic(34.999).stopped, false);
  assert.equal(sampleRegionalTraffic(49.001).stopped, false);
  for (let time = 0; time < 570; time += 0.1) {
    const sample = sampleRegionalTraffic(time);
    assert.ok(sample.progress >= 0 && sample.progress <= 1);
    assert.deepEqual(sampleRegionalTraffic(time + 190).service, sample.service);
  }
});
test('parallel track keeps eight metre normal offset and no player rail intersections', () => {
  const curve = createRegionalTrafficCurve({ THREE, railPoint });
  for (const point of curve.points) {
    // Nearest same-height main rail remains over 7.9 m away on this curved grade.
    let minimum = Infinity;
    for (let dz = -1; dz <= 1; dz += 0.1)
      minimum = Math.min(minimum, point.distanceTo(railPoint(point.z + dz)));
    assert.ok(minimum > 7.9 && minimum < 8.1, `${minimum}`);
  }
});
test('lazy geometry is finite, shared, bounded and each complete train fits between buffers', () => {
  const { traffic, scene } = setup();
  traffic.update(0, { position: 5000 });
  assert.equal(traffic.getState().built, false);
  traffic.update(0, { position: new THREE.Vector3(0, 0, 1800) });
  assert.equal(traffic.getState().built, true);
  assert.equal(traffic.getState().renderBatches, 6);
  const geometry = new Set();
  const materials = new Set();
  scene.traverse((object) => {
    if (!object.isInstancedMesh) return;
    geometry.add(object.geometry);
    materials.add(object.material);
    for (const value of object.instanceMatrix.array) assert.ok(Number.isFinite(value));
  });
  assert.equal(geometry.size, 1);
  assert.equal(materials.size, 1);
  const counts = new Set();
  for (let step = 0; step < 190; step++) {
    traffic.update(1, { position: 1800 });
    const state = traffic.getState();
    if (state.service) counts.add(state.cars.length);
    assert.ok(new Set(state.cars.map((car) => car.service)).size <= 1);
    for (const car of state.cars) {
      assert.ok(car.distance - 6 > 1);
      assert.ok(car.distance + 6 < state.trackLength - 1);
      assert.ok(car.position.every(Number.isFinite));
    }
  }
  assert.deepEqual([...counts].sort(), [2, 3]);
  traffic.dispose();
});
test('pause and player jumps do not alter timetable and disposal is idempotent', () => {
  const { traffic, scene } = setup();
  traffic.update(40, { position: 1800 });
  const before = traffic.getState();
  traffic.update(0, { position: 20000 });
  assert.equal(traffic.getState().elapsed, before.elapsed);
  assert.equal(traffic.getState().visible, false);
  traffic.update(0, { position: 1800 });
  assert.deepEqual(traffic.getState(), before);
  let geometryDisposed = 0;
  const geometry = new Set();
  scene.traverse((object) => {
    if (object.geometry) geometry.add(object.geometry);
  });
  for (const item of geometry) item.addEventListener('dispose', () => geometryDisposed++);
  traffic.dispose();
  traffic.dispose();
  traffic.update(10, { position: 1800 });
  assert.equal(geometryDisposed, 1);
  assert.equal(traffic.getState().elapsed, before.elapsed);
  assert.equal(scene.children.length, 0);
});
