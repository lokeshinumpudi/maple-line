import test from 'node:test';
import assert from 'node:assert/strict';
import {
  QUALITY_TIERS,
  adaptQualityTier,
  selectQualityTier,
} from '../src/rendering/quality-tiers.js';

test('automatic quality keeps phones on the tier with no extra scene passes', () => {
  assert.equal(selectQualityTier({ mobile: true }), 'low');
  assert.equal(QUALITY_TIERS.low.reflectionSize, 0);
  assert.equal(QUALITY_TIERS.low.refraction, false);
  assert.equal(QUALITY_TIERS.low.canopyCardDistance, 0);
});

test('desktop picks high unless memory, cores or buffer size argue for medium', () => {
  assert.equal(selectQualityTier({}), 'high');
  assert.equal(selectQualityTier({ deviceMemoryGb: 4 }), 'medium');
  assert.equal(selectQualityTier({ logicalProcessors: 4 }), 'medium');
  assert.equal(selectQualityTier({ physicalPixels: 3840 * 2160 }), 'medium');
  assert.equal(selectQualityTier({ deviceMemoryGb: 16, logicalProcessors: 12 }), 'high');
});

test('an explicit preference wins over detection and unknown values are rejected', () => {
  assert.equal(selectQualityTier({ preference: 'high', mobile: true }), 'high');
  assert.equal(selectQualityTier({ preference: 'low' }), 'low');
  assert.throws(() => selectQualityTier({ preference: 'ultra' }), TypeError);
});

test('tiers grow monotonically in cost', () => {
  const [low, medium, high] = ['low', 'medium', 'high'].map((tier) => QUALITY_TIERS[tier]);
  for (const key of ['reflectionSize', 'rainStreaks', 'splashes', 'canopyCardDistance'])
    assert.ok(low[key] <= medium[key] && medium[key] <= high[key], key);
});

test('adaptive quality steps down on slow frames and recovers only after a long healthy run', () => {
  assert.equal(adaptQualityTier('high', { p75FrameMs: 40 }), 'medium');
  assert.equal(adaptQualityTier('low', { p75FrameMs: 40 }), 'low');
  assert.equal(adaptQualityTier('medium', { p75FrameMs: 40, floor: 'medium' }), 'medium');
  assert.equal(adaptQualityTier('medium', { p75FrameMs: 15, healthySeconds: 10 }), 'medium');
  assert.equal(adaptQualityTier('medium', { p75FrameMs: 15, healthySeconds: 31 }), 'high');
  assert.equal(
    adaptQualityTier('medium', { p75FrameMs: 15, healthySeconds: 31, ceiling: 'medium' }),
    'medium',
  );
  assert.throws(() => adaptQualityTier('ultra', {}), TypeError);
});
