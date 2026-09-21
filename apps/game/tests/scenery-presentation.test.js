import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { sceneryFields, inForestGrove } from '../src/world/scenery-fields.js';
import { paintTerrain } from '../src/rendering/terrain-palette.js';
import { smoothTerrainNormals } from '../src/rendering/surface-detail.js';
import { createEveningMotes } from '../src/world/evening-motes.js';

test('regional fields agree across chunk boundaries and are independent of query order', () => {
  const samples = [-790, -600, -0.001, 0, 599.999, 600, 1190, 1790].map((z) => [41, z]);
  const first = samples.map(([x, z]) => [sceneryFields(x, z, 431), inForestGrove(x, z, 431)]);
  const reversed = [...samples]
    .reverse()
    .map(([x, z]) => [sceneryFields(x, z, 431), inForestGrove(x, z, 431)])
    .reverse();
  assert.deepEqual(first, reversed);
  for (const [, z] of samples) {
    const before = sceneryFields(41, z - 0.00001, 431),
      after = sceneryFields(41, z + 0.00001, 431);
    assert.ok(Math.abs(before.forestDensity - after.forestDensity) < 0.00001);
    assert.ok(before.moisture >= 0 && before.moisture <= 1);
    assert.ok(before.forestDensity >= 0.22 && before.forestDensity <= 1);
  }
  assert.notDeepEqual(
    first,
    samples.map(([x, z]) => [sceneryFields(x, z, 99), inForestGrove(x, z, 99)]),
  );
});

test('terrain paint removes color seams at shared vertices without moving the ground', () => {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    'position',
    new THREE.Float32BufferAttribute([0, 0, 0, 0, 0, 4, 4, 2, 0, 4, 2, 0, 0, 0, 4, 4, 2, 4], 3),
  );
  const original = [...geometry.attributes.position.array];
  smoothTerrainNormals(geometry);
  paintTerrain(geometry, { bankDistance: () => 20 });
  assert.deepEqual([...geometry.attributes.position.array], original);
  const values = [...geometry.attributes.color.array];
  assert.deepEqual(values.slice(6, 9), values.slice(9, 12));
  assert.deepEqual(values.slice(3, 6), values.slice(12, 15));
  assert.ok(values.every((value) => Number.isFinite(value) && value >= 0 && value <= 1));
  geometry.dispose();
});

test('evening motes avoid water and track, freeze when paused, and reuse buffers across travel', () => {
  const scene = new THREE.Scene();
  const field = createEveningMotes({
    scene,
    renderer: { getPixelRatio: () => 1 },
    center: () => 0,
    terrain: () => 4,
    railU: () => 28,
    riverBedHeight: (u) => (u < -20 ? -2 : null),
  });
  const context = { position: new THREE.Vector3(28, 4, -180), dusk: true, weather: 'clear' };
  field.update(1, context);
  const mesh = scene.children[0],
    geometry = mesh.geometry;
  const array = geometry.attributes.position.array;
  assert.ok(field.getState().count > 0);
  for (let i = 0; i < geometry.drawRange.count; i++) {
    assert.ok(array[i * 3] >= -20);
    assert.ok(Math.abs(array[i * 3] - 28) >= 8);
    assert.ok(array[i * 3 + 1] > 4);
  }
  const first = Array.from(array.slice(0, geometry.drawRange.count * 3));
  const time = field.getState().time;
  field.update(1, { ...context, paused: true });
  assert.equal(field.getState().time, time);
  field.update(1, { ...context, position: new THREE.Vector3(28, 4, 400) });
  field.update(1, context);
  assert.equal(geometry.attributes.position.array, array);
  assert.deepEqual(Array.from(array.slice(0, geometry.drawRange.count * 3)), first);
  for (let i = 0; i < 8; i++) field.update(1, { ...context, weather: 'snow' });
  assert.equal(field.getState().visible, false);
  let released = 0;
  geometry.addEventListener('dispose', () => released++);
  field.dispose();
  field.dispose();
  assert.equal(released, 1);
  assert.equal(scene.children.length, 0);
});
