import test from 'node:test';
import assert from 'node:assert/strict';
import { createFrameBudget } from '../src/rendering/frame-budget.js';
function setup() {
  let ratio = 1;
  const renderer = {
    getPixelRatio: () => ratio,
    setPixelRatio: (v) => {
      ratio = v;
    },
  };
  return createFrameBudget({ renderer, devicePixelRatio: 2 });
}
test('a coarse phone starts at one pixel per CSS pixel', () => {
  let ratio = 1;
  const renderer = {
    getPixelRatio: () => ratio,
    setPixelRatio: (value) => {
      ratio = value;
    },
  };
  const budget = createFrameBudget({
    renderer,
    devicePixelRatio: 3,
    pixelBudget: 700000,
    maxPixelRatio: 1,
  });
  budget.resize(390, 844);
  assert.equal(budget.getState().pixelRatio, 1);
  assert.ok(budget.getState().physicalPixels <= 390 * 844 + 1);
});
test('large Retina windows stay within the physical pixel budget', () => {
  const budget = setup();
  budget.resize(3440, 2160);
  assert.ok(budget.getState().physicalPixels <= 2000001);
  assert.ok(budget.getState().pixelRatio < 1);
});
test('sustained missed frames reduce resolution with a floor, healthy frames recover slowly', () => {
  const budget = setup();
  budget.resize(1920, 1080);
  for (let i = 0; i < 600; i++)
    budget.record({ intervalMs: 33.3, cpuMs: 8, calls: 200, triangles: 300000 });
  assert.equal(budget.getState().adaptiveScale, 0.7);
  const low = budget.getState().pixelRatio;
  for (let i = 0; i < 1000; i++) budget.record({ intervalMs: 16.67, cpuMs: 5 });
  assert.ok(budget.getState().pixelRatio > low);
  assert.equal(budget.getState().medianFps, 60);
});
test('hidden tabs and invalid first-frame intervals do not downscale the game', () => {
  const budget = setup();
  for (let i = 0; i < 300; i++) {
    budget.record({ intervalMs: -1, cpuMs: 800 });
    budget.record({ intervalMs: 50, cpuMs: 40, active: false });
  }
  assert.equal(budget.getState().samples, 0);
  assert.equal(budget.getState().adaptiveScale, 1);
});
test('live performance sampler includes all-pass rendering totals and rejects invalid duration', async () => {
  const budget = setup();
  await assert.rejects(budget.measure(0));
  const result = budget.measure(1);
  for (let i = 0; i < 60; i++)
    budget.record({ intervalMs: 1000 / 60, cpuMs: 5, calls: 200, triangles: 500000 });
  const report = await result;
  assert.equal(report.samples, 60);
  assert.ok(Math.abs(report.averageFps - 60) < 0.001);
  assert.equal(report.averageDrawCalls, 200);
  assert.equal(report.averageTriangles, 500000);
  assert.equal(report.framesOverBudget, 0);
  const controller = new AbortController();
  const cancelled = budget.measure(2, { signal: controller.signal });
  controller.abort();
  await assert.rejects(cancelled, /cancelled/);
});

test('visible long frames remain in measured results', async () => {
  const budget = setup();
  const promise = budget.measure(1);
  budget.record({ intervalMs: 350, cpuMs: 300, calls: 300 });
  const result = await promise;
  assert.equal(result.frameMs.max, 350);
  assert.equal(result.framesOverBudget, 1);
});
