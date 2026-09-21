import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SCENIC_BENDS,
  scenicAlignmentOffset,
  scenicAlignmentSpeedLimit,
} from '../src/simulation/scenic-alignment.js';

test('five disjoint scenic intervals have serializable stable descriptors', () => {
  assert.equal(SCENIC_BENDS.length, 5);
  assert.deepEqual(JSON.parse(JSON.stringify(SCENIC_BENDS)), SCENIC_BENDS);
  for (let i = 0; i < SCENIC_BENDS.length; i++) {
    const bend = SCENIC_BENDS[i];
    assert.ok(bend.end > bend.start);
    assert.ok(Math.abs(bend.amplitude) >= 45 && Math.abs(bend.amplitude) <= 60);
    if (i) assert.ok(bend.start > SCENIC_BENDS[i - 1].end + 300);
  }
});

test('excursions preserve position, slope and curvature at either join', () => {
  const h = 0.05;
  for (const bend of SCENIC_BENDS)
    for (const z of [bend.start, bend.end]) {
      const x = scenicAlignmentOffset(z),
        before = scenicAlignmentOffset(z - h),
        after = scenicAlignmentOffset(z + h);
      assert.equal(x, 0);
      assert.ok(Math.abs((after - before) / (2 * h)) < 1e-6);
      assert.ok(Math.abs((after - 2 * x + before) / (h * h)) < 1e-6);
    }
});

test('offset is bounded and added planar curvature permits radius above 500m', () => {
  const h = 0.5;
  for (const bend of SCENIC_BENDS) {
    assert.ok(Math.abs(scenicAlignmentOffset((bend.start + bend.end) / 2) - bend.amplitude) < 1e-9);
    for (let z = bend.start; z <= bend.end; z += 2) {
      const x = scenicAlignmentOffset(z),
        before = scenicAlignmentOffset(z - h),
        after = scenicAlignmentOffset(z + h);
      const slope = (after - before) / (2 * h);
      const second = (after - 2 * x + before) / (h * h);
      const curvature = Math.abs(second) / Math.pow(1 + slope * slope, 1.5);
      assert.ok(Number.isFinite(x));
      assert.ok(Math.abs(x) <= Math.abs(bend.amplitude) + 1e-9);
      assert.ok(curvature <= 1 / 500, `${bend.id}: curvature ${curvature} at ${z}`);
    }
  }
});

test('speed caps protect both travel directions and leave other segments untouched', () => {
  for (const bend of SCENIC_BENDS) {
    assert.equal(scenicAlignmentSpeedLimit(bend.start - 150), 80);
    assert.equal(scenicAlignmentSpeedLimit(bend.end + 150), 80);
    assert.equal(scenicAlignmentSpeedLimit((bend.start + bend.end) / 2), 80);
    assert.equal(scenicAlignmentSpeedLimit(bend.start - 151), Infinity);
    assert.equal(scenicAlignmentSpeedLimit(bend.end + 151), Infinity);
  }
  for (const z of [-500, 0, 2500, 5000, 11000, 14000, 24000, Infinity, NaN]) {
    assert.equal(scenicAlignmentOffset(z), 0);
    assert.equal(scenicAlignmentSpeedLimit(z), Infinity);
  }
});
