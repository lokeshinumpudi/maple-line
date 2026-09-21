import test from 'node:test';
import assert from 'node:assert/strict';
import {
  regionalVariation,
  regionalMountainHeight,
  REGION_LENGTH,
} from '../src/world/region-variation.js';

test('region recipes are stable and reflect snow country, terraces and city', () => {
  assert.deepEqual(regionalVariation(7200), regionalVariation(7200));
  assert.notDeepEqual(regionalVariation(7200, 42), regionalVariation(7200, 43));
  assert.equal(regionalVariation(13000).architecture.tier, 'snow-village');
  assert.equal(regionalVariation(18000).farm.type, 'rice-terraces');
  assert.equal(regionalVariation(23300).architecture.tier, 'urban');
  assert.deepEqual(JSON.parse(JSON.stringify(regionalVariation(23300))), regionalVariation(23300));
});
test('continuous numeric fields and terrain meet across all region seams', () => {
  for (let z = -REGION_LENGTH; z <= 26000; z += REGION_LENGTH) {
    const before = regionalVariation(z - 0.001),
      after = regionalVariation(z + 0.001);
    for (const key of [
      'ridgeHeight',
      'ridgeSpacing',
      'secondaryRidge',
      'contourFrequency',
      'wetness',
    ])
      assert.ok(Math.abs(before[key] - after[key]) < 0.001, key);
    for (const x of [-400, -150, 46, 150, 400])
      assert.ok(
        Math.abs(regionalMountainHeight(x, z - 0.001) - regionalMountainHeight(x, z + 0.001)) <
          0.01,
      );
  }
});
test('added hills preserve rail corridor and remain bounded for many seeds', () => {
  for (const seed of [0, 1, 42, 2719, 99999])
    for (let z = 0; z < 25000; z += 241) {
      for (const x of [-45, -20, 0, 20, 45]) assert.equal(regionalMountainHeight(x, z, seed), 0);
      for (const x of [-900, -350, -75, 75, 350, 900]) {
        const h = regionalMountainHeight(x, z, seed);
        assert.ok(Number.isFinite(h) && h >= 0 && h < 160, `${h}`);
      }
    }
  assert.equal(regionalMountainHeight(Infinity, 0), 0);
  assert.equal(regionalMountainHeight(100, NaN), 0);
});
test('corridor boundary has no step and neighbouring sides have distinct contours', () => {
  assert.ok(regionalMountainHeight(45.01, 4000) < 1e-6);
  assert.notEqual(regionalMountainHeight(-250, 4000), regionalMountainHeight(250, 4000));
});
