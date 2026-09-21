import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {
  stationResidents,
  residentPose,
  createRegionalResidents,
} from '../src/world/regional-residents.js';
const stop = { id: 'sakura', name: 'Sakura', theme: 'village' };
test('station casting is reproducible, varied and bounded', () => {
  const cast = stationResidents(stop);
  assert.deepEqual(cast, stationResidents(stop));
  assert.notDeepEqual(cast, stationResidents({ ...stop, id: 'forest' }));
  assert.equal(cast.length, 8);
  assert.equal(stationResidents({ ...stop, theme: 'city' }).length, 10);
  assert.ok(new Set(cast.map((x) => x.coat)).size >= 4);
  assert.ok(new Set(cast.map((x) => x.height)).size >= 5);
  assert.ok(cast.some((x) => x.age > 65) && cast.some((x) => x.age < 20));
});
test('commuters reach queue, dwell and return without teleporting across platform', () => {
  const resident = stationResidents(stop)[1];
  assert.equal(residentPose(resident, 0).activity, 'walking to the departure queue');
  assert.equal(residentPose(resident, 30).walking, false);
  assert.equal(residentPose(resident, 98).walking, true);
  assert.equal(residentPose(resident, 122).z, 22);
  for (let time = 0; time < 264; time += 0.25) {
    const p = residentPose(resident, time),
      q = residentPose(resident, time + 0.25);
    assert.ok(Math.abs(p.z - q.z) < 0.3);
  }
});
test('all routines remain on platform clear of railway and target stable props', () => {
  for (const r of stationResidents({ ...stop, theme: 'city' }))
    for (let t = 0; t < 400; t += 0.4) {
      const p = residentPose(r, t);
      assert.ok(p.x >= 4.5 && p.x <= 7.6);
      assert.ok(p.z >= -26 && p.z <= 22);
    }
  const cast = stationResidents(stop);
  assert.equal(residentPose(cast[0], 100).z, -21);
  assert.equal(residentPose(cast[6], 100).z, 3);
  assert.equal(residentPose(cast[3], 5).z, residentPose(cast[4], 5).z);
});
test('resident batch counts stay bounded and geometry is removed on disposal', () => {
  const parent = new THREE.Group();
  const people = createRegionalResidents({
    THREE,
    parent,
    stop: { ...stop, theme: 'city' },
    local: (x, y, z) => new THREE.Vector3(x, y + 10, z),
  });
  for (let t = 0; t < 140; t += 0.5) people.update(t);
  assert.equal(parent.children.length, 1);
  const batches = parent.children[0].children;
  assert.equal(batches.length, 2);
  assert.ok(batches[0].count <= 256 && batches[1].count <= 64);
  for (const mesh of batches)
    for (let i = 0; i < mesh.count * 16; i++)
      assert.ok(Number.isFinite(mesh.instanceMatrix.array[i]));
  assert.equal(people.getState().residents.length, 10);
  people.dispose();
  people.dispose();
  assert.equal(parent.children.length, 0);
});
