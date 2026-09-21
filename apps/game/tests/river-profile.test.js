import test from 'node:test';
import assert from 'node:assert/strict';
import { riverProfile, riverBedHeight } from '../src/world/river-profile.js';
test('meanders vary width and depth without reaching the track', () => {
  let min = Infinity,
    max = -Infinity;
  for (let z = -850; z <= 850; z += 0.5) {
    const p = riverProfile(z);
    min = Math.min(min, p.offset);
    max = Math.max(max, p.offset);
    assert.ok(p.halfWidth >= 8 && p.halfWidth <= 21);
    assert.ok(p.offset + p.halfWidth <= 18);
    assert.ok(p.depth > 1.7 && p.depth < 5.1);
    assert.equal(riverBedHeight(28, z), null);
    assert.ok(Math.abs(riverBedHeight(p.offset + p.halfWidth, z) + 0.4) < 1e-6);
    assert.ok(Math.abs(riverBedHeight(p.offset - p.halfWidth, z) + 0.4) < 1e-6);
    assert.ok(riverBedHeight(p.offset, z) < -1.8);
  }
  assert.ok(max - min > 50, 'Bends should visibly separate from the railway');
});
test('bank and waterline heights join without discontinuity', () => {
  for (let z = -850; z < 850; z += 7) {
    const p = riverProfile(z);
    for (const side of [-1, 1]) {
      const u = p.offset + side * p.halfWidth;
      assert.ok(Math.abs(riverBedHeight(u + 0.001, z) - riverBedHeight(u - 0.001, z)) < 0.01);
    }
    assert.ok(Math.abs(riverProfile(z + 0.01).offset - p.offset) < 0.02);
  }
});
