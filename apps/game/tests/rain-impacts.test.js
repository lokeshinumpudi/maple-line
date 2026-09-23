import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createRainImpacts } from '../src/world/rain-impacts.js';

function setup(heightAt = () => 2) {
  const scene = new THREE.Scene();
  const impacts = createRainImpacts({ scene, heightAt });
  return { scene, impacts, mesh: scene.children[0] };
}

function translation(mesh, i) {
  const m = new THREE.Matrix4();
  mesh.getMatrixAt(i, m);
  return new THREE.Vector3().setFromMatrixPosition(m);
}

function scaleLen(mesh, i) {
  const m = new THREE.Matrix4();
  mesh.getMatrixAt(i, m);
  return new THREE.Vector3().setFromMatrixScale(m).length();
}

test('rings stay world-anchored while the observer moves within a lifetime', () => {
  const { impacts, mesh } = setup();
  impacts.update(0.02, { weather: 'rain', position: { x: 0, y: 0, z: 0 } });
  const before = Array.from({ length: 96 }, (_, i) => translation(mesh, i).clone());
  impacts.update(0.02, { weather: 'rain', position: { x: 8, y: 0, z: -5 } });
  for (let i = 0; i < 96; i++) {
    const after = translation(mesh, i);
    assert.ok(after.distanceTo(before[i]) < 1e-6);
  }
  assert.equal(mesh.count, 96);
  assert.equal(mesh.isInstancedMesh, true);
});

test('respawn chooses a new world position after a lifetime', () => {
  const { impacts, mesh } = setup();
  impacts.update(0.02, { weather: 'rain', position: { x: 0, y: 0, z: 0 } });
  const first = translation(mesh, 0).clone();
  impacts.update(0.8, { weather: 'rain', position: { x: 40, y: 0, z: 12 } });
  const second = translation(mesh, 0);
  assert.ok(second.distanceTo(first) > 5);
});

test('finite slope samples tilt rings instead of leaving them horizontal', () => {
  const { impacts, mesh } = setup((x) => x * 0.25);
  impacts.update(0.05, { weather: 'rain', position: { x: 0, y: 0, z: 0 } });
  const m = new THREE.Matrix4();
  const yAxis = new THREE.Vector3();
  let tilted = 0;
  for (let i = 0; i < 96; i++) {
    if (scaleLen(mesh, i) < 0.02) continue;
    mesh.getMatrixAt(i, m);
    yAxis.setFromMatrixColumn(m, 1).normalize();
    assert.ok(Number.isFinite(yAxis.x) && Number.isFinite(yAxis.y) && Number.isFinite(yAxis.z));
    assert.ok(Math.abs(yAxis.x) > 0.05);
    assert.ok(yAxis.y > 0.8);
    tilted += 1;
  }
  assert.ok(tilted > 0);
});

test('steep terrain suppresses rings instead of floating a halo', () => {
  const { impacts, mesh } = setup((x) => x * 8);
  impacts.update(0.05, { weather: 'rain', position: { x: 0, y: 0, z: 0 } });
  for (let i = 0; i < 96; i++) assert.ok(scaleLen(mesh, i) < 0.01);
});

test('paused dt keeps matrices stable', () => {
  const { impacts, mesh } = setup();
  const ctx = { weather: 'rain', position: { x: 3, y: 0, z: 1 } };
  impacts.update(0.1, ctx);
  const before = Array.from(mesh.instanceMatrix.array);
  impacts.update(0, ctx);
  assert.deepEqual(Array.from(mesh.instanceMatrix.array), before);
});

test('weather and tunnels hide the batch', () => {
  const { impacts, mesh } = setup();
  impacts.update(0.1, { weather: 'rain', position: { x: 0, y: 0, z: 0 } });
  assert.equal(mesh.visible, true);
  impacts.update(0.1, { weather: 'clear', position: { x: 0, y: 0, z: 0 } });
  assert.equal(mesh.visible, false);
  impacts.update(0.1, { weather: 'rain', position: { x: 0, y: 0, z: 0 }, inTunnel: true });
  assert.equal(mesh.visible, false);
});

test('teleporting the train recycles distant rings', () => {
  const { impacts, mesh } = setup();
  impacts.update(0.05, { weather: 'rain', position: { x: 0, y: 0, z: 0 } });
  impacts.update(0.05, { weather: 'rain', position: { x: 4000, y: 0, z: -3000 } });
  for (let i = 0; i < 96; i++) {
    const p = translation(mesh, i);
    assert.ok(Math.hypot(p.x - 4000, p.z + 3000) < 80);
  }
});

test('dispose removes the batch and GPU resources', () => {
  const { scene, impacts, mesh } = setup();
  // Rings and their splash crowns.
  assert.equal(scene.children.length, 2);
  impacts.dispose();
  assert.equal(scene.children.length, 0);
  assert.equal(mesh.parent, null);
});

test('the graphics tier sets the ring count and splash crowns follow the rings', () => {
  const scene = new THREE.Scene();
  const impacts = createRainImpacts({ scene, heightAt: () => 0, count: 160 });
  const [rings, crowns] = scene.children;
  assert.equal(rings.count, 160);
  assert.equal(crowns.count, 160);
  impacts.update(0.05, { weather: 'rain', position: { x: 0, y: 0, z: 0 } });
  assert.equal(crowns.visible, true);
  for (let i = 0; i < 160; i++)
    assert.ok(translation(crowns, i).distanceTo(translation(rings, i)) < 1e-6);
  impacts.update(0.05, { weather: 'clear', position: { x: 0, y: 0, z: 0 } });
  assert.equal(crowns.visible, false);
});
