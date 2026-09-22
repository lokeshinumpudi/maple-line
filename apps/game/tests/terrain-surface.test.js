import test from 'node:test';
import assert from 'node:assert/strict';
import { TERRAIN_LATERAL_SAMPLES, naturalValleyTerrain } from '../src/world/terrain-surface.js';
import { scenicTerrain, routeCenter, landmarks } from '../src/world/extended-route.js';

test('shared terrain sections extend beyond inspection orbit range and never reverse', () => {
  assert.ok(TERRAIN_LATERAL_SAMPLES[0] <= -1600);
  assert.ok(TERRAIN_LATERAL_SAMPLES.at(-1) >= 1600);
  for (let i = 1; i < TERRAIN_LATERAL_SAMPLES.length; i++)
    assert.ok(TERRAIN_LATERAL_SAMPLES[i] > TERRAIN_LATERAL_SAMPLES[i - 1]);
  assert.ok(TERRAIN_LATERAL_SAMPLES.length < 160);
});

test('original valley and regional height field share their entire boundary', () => {
  for (const lateral of TERRAIN_LATERAL_SAMPLES) {
    const u = lateral + 28;
    assert.ok(
      Math.abs(naturalValleyTerrain(u, 790) - scenicTerrain(routeCenter(790) + u, 790)) < 1e-8,
    );
  }
});

test('landmark mountain transitions have no abrupt height steps', () => {
  for (const z of [
    landmarks.bridgeZ - 250,
    landmarks.bridgeZ + 250,
    landmarks.tunnelStartZ - 160,
    landmarks.tunnelEndZ + 160,
  ]) {
    for (const u of [-350, -220, -110, 110, 220, 350]) {
      const a = scenicTerrain(routeCenter(z - 0.001) + 28 + u, z - 0.001);
      const b = scenicTerrain(routeCenter(z + 0.001) + 28 + u, z + 0.001);
      assert.ok(Math.abs(a - b) < 0.02, `${z}:${u} height step ${a - b}`);
    }
  }
});
