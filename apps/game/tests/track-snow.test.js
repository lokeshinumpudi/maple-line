import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { snowDepth, createTrackSnow } from '../src/world/track-snow.js';

test('snow builds on shoulders and between rails without covering running heads', () => {
  for (let z = -200; z < 1000; z += 17) {
    assert.equal(snowDepth(0.96, z, 1), 0);
    assert.equal(snowDepth(-0.96, z, 1), 0);
    assert.ok(snowDepth(1.8, z, 1) > 0.2);
    assert.ok(snowDepth(0, z, 1) > 0.1);
    assert.equal(snowDepth(1.8, z, 0), 0);
    assert.ok(snowDepth(0, z, 1) - 0.06 < 0.125);
  }
});

test('snow excludes covered railway and disposes its bounded geometry', () => {
  const scene = new THREE.Scene();
  const snow = createTrackSnow({
    THREE,
    scene,
    railPoint: (z) => new THREE.Vector3(0, 400, z),
    isCovered: (z) => z >= 0,
  });
  snow.update(1, { z: 0, weather: 'snow' });
  const mesh = scene.children[0];
  assert.ok(mesh.visible);
  const p = mesh.geometry.attributes.position;
  assert.ok(p.count < 5000);
  for (const index of mesh.geometry.index.array) assert.ok(p.getZ(index) < 0);
  snow.dispose();
  assert.equal(scene.children.length, 0);
});
