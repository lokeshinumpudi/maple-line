import test from 'node:test';
import assert from 'node:assert/strict';
import { bridgeRiverProfile, carveBridgeRiver } from '../src/world/bridge-river.js';

test('ravine river and bed share their course without square surface ends or bank steps', () => {
  for (let x = -450; x <= 450; x += 9) {
    const r = bridgeRiverProfile(x, 0, 6250, 200);
    assert.ok(carveBridgeRiver(200, x, r.z, 0, 6250, 200) < r.waterY);
    for (const side of [-1, 1]) {
      const edge = r.z + side * (r.halfWidth + 65);
      assert.equal(carveBridgeRiver(200, x, edge, 0, 6250, 200), 200);
      assert.ok(Math.abs(carveBridgeRiver(200, x, edge - 0.001, 0, 6250, 200) - 200) < 0.001);
    }
  }
  assert.equal(carveBridgeRiver(200, 550, 6250, 0, 6250, 200), 200);
});
