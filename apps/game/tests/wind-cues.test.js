import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createWindCues } from '../src/world/wind-cues.js';

const context = () => ({
  cameraPosition: new THREE.Vector3(0, 20, 0),
  weather: 'clear',
  altitude: 20,
  region: 'gorge',
});

test('leaf cues drift gently downwind and freeze when paused', () => {
  const scene = new THREE.Scene();
  const cues = createWindCues({ THREE, scene });
  cues.update(0, context());
  const before = cues.mesh.instanceMatrix.array.slice();
  cues.update(0, context());
  assert.deepEqual(cues.mesh.instanceMatrix.array, before);
  cues.update(0.1, context());
  const after = cues.mesh.instanceMatrix.array;
  for (let i = 0; i < cues.mesh.count; i++) {
    const dx = after[i * 16 + 12] - before[i * 16 + 12];
    const dz = after[i * 16 + 14] - before[i * 16 + 14];
    // Ignore recycled leaves; those beyond the local volume respawn upwind.
    if (Math.hypot(dx, dz) < 1) {
      assert.ok(dx > 0);
      assert.ok(dz > 0);
      assert.ok(Math.hypot(dx, dz) < 0.12);
    }
  }
  assert.equal(cues.getState().pool, 40);
  assert.ok(cues.getState().driftSpeedMps < 1);
  cues.dispose();
  assert.equal(scene.children.length, 0);
});

test('leaf cues disappear in snow, tunnels, alpine terrain, and city regions', () => {
  const cues = createWindCues({ THREE, scene: new THREE.Scene() });
  for (const extra of [
    { weather: 'snow' },
    { inTunnel: true },
    { altitude: 200 },
    { region: 'city' },
    { region: 'alpine' },
  ]) {
    cues.update(0.1, { ...context(), ...extra });
    assert.equal(cues.mesh.visible, false);
    assert.equal(cues.getState().count, 0);
  }
  cues.update(0.1, context());
  assert.equal(cues.mesh.visible, true);
  assert.equal(cues.getState().count, 40);
  cues.dispose();
});
