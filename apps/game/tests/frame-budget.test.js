import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createFrameBudget,
  createResolutionGovernor,
  RESOLUTION_POLICY,
} from '../src/rendering/frame-budget.js';
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
  // Three steps of 0.1, at least eight seconds apart: about 25 s of 30 fps.
  for (let i = 0; i < 900; i++)
    budget.record({ intervalMs: 33.3, cpuMs: 8, calls: 200, triangles: 300000 });
  assert.equal(budget.getState().adaptiveScale, 0.7);
  const low = budget.getState().pixelRatio;
  for (let i = 0; i < 1800; i++) budget.record({ intervalMs: 16.67, cpuMs: 5 });
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

/** Runs a governor on one p75 frame time per second; returns the seconds each step landed. */
function drive(governor, seconds, p75, { start = 0, allowed = () => true } = {}) {
  const steps = [];
  for (let t = start; t < start + seconds; t++) {
    governor.check(t, typeof p75 === 'function' ? p75(t) : p75);
    const next = governor.commit(t, allowed(t));
    if (next !== null) steps.push({ t, scale: next });
  }
  return steps;
}

test('resolution steps are at least the dwell time apart and never below the floor', () => {
  const governor = createResolutionGovernor();
  const steps = drive(governor, 60, 40);
  assert.deepEqual(
    steps.map((step) => step.scale),
    [0.9, 0.8, 0.7],
  );
  for (let i = 1; i < steps.length; i++)
    assert.ok(steps[i].t - steps[i - 1].t >= RESOLUTION_POLICY.dwellSeconds);
  // The first step needs three slow checks in a row, not one slow second.
  assert.equal(steps[0].t, RESOLUTION_POLICY.slowChecks - 1);
});

test('frame times inside the dead band never change the resolution', () => {
  const governor = createResolutionGovernor();
  // Alternating between just-healthy-enough and just-slow-enough frames.
  assert.deepEqual(
    drive(governor, 300, (t) => (t % 2 ? 20 : 23)),
    [],
  );
  // Short slow bursts reset before they count.
  assert.deepEqual(
    drive(governor, 300, (t) => (t % 3 === 0 ? 30 : 17), { start: 300 }),
    [],
  );
});

test('recovery waits for a long healthy stretch', () => {
  const governor = createResolutionGovernor();
  drive(governor, 10, 40);
  assert.equal(governor.scale, 0.9);
  const up = drive(governor, 60, 12, { start: 10 });
  assert.equal(up.length, 1);
  assert.ok(up[0].t - 10 >= RESOLUTION_POLICY.healthySeconds - 1);
  assert.equal(governor.scale, 1);
});

test('a level that bounces straight back down is locked out', () => {
  const governor = createResolutionGovernor();
  drive(governor, 10, 40); // down to 0.9
  const up = drive(governor, 42, 12, { start: 10 }); // back to 1
  assert.equal(up.at(-1).scale, 1);
  const down = drive(governor, 10, 40, { start: 52 }); // 1 is too heavy again
  assert.equal(down[0].scale, 0.9);
  assert.equal(governor.scale, 0.9);
  // Healthy again, but 1.0 just failed: it stays at 0.9 for the lock period.
  const held = drive(governor, RESOLUTION_POLICY.lockSeconds - 10, 12, { start: 62 });
  assert.deepEqual(held, []);
  assert.equal(governor.getState().ceiling, 0.9);
  // After the lock it may try again.
  const later = drive(governor, 60, 12, { start: 62 + RESOLUTION_POLICY.lockSeconds });
  assert.equal(later.at(-1).scale, 1);
});

test('a decided step waits for a cut, but not forever', () => {
  const governor = createResolutionGovernor();
  const cutAt = 5;
  const held = drive(governor, 10, 40, { allowed: (t) => t === cutAt });
  assert.deepEqual(held, [{ t: cutAt, scale: 0.9 }]);
  const noCut = createResolutionGovernor();
  const late = drive(noCut, 10, 40, { allowed: () => false });
  assert.deepEqual(late, [{ t: 2 + RESOLUTION_POLICY.deferSeconds, scale: 0.9 }]);
});

test('the frame budget holds a step until canApply allows it', () => {
  let ratio = 1;
  let cut = false;
  const renderer = {
    getPixelRatio: () => ratio,
    setPixelRatio: (value) => {
      ratio = value;
    },
  };
  const budget = createFrameBudget({ renderer, devicePixelRatio: 1, canApply: () => cut });
  budget.resize(1280, 720);
  // 90 warm-up frames plus three slow checks: the step is decided but held.
  for (let i = 0; i < 200; i++) budget.record({ intervalMs: 33.3, cpuMs: 8 });
  assert.equal(budget.getState().adaptiveScale, 1);
  assert.equal(budget.getState().resolutionSteps.pending, 0.9);
  cut = true;
  assert.equal(budget.record({ intervalMs: 33.3, cpuMs: 8 }), true);
  assert.equal(budget.getState().adaptiveScale, 0.9);
  assert.ok(Math.abs(ratio - 0.9) < 1e-9);
});
