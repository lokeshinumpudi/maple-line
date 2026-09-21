import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {
  createOpeningSequence,
  sampleOpening,
  openingAnimalPose,
  openingShotPose,
} from '../src/presentation/opening-sequence.js';

test('four seasonal shots loop with changes hidden beneath the film fade', () => {
  assert.deepEqual(
    [0, 9, 18, 27, 36].map((t) => sampleOpening(t).season),
    ['spring', 'summer', 'autumn', 'winter', 'spring'],
  );
  for (const t of [0, 9, 18, 27, 36]) assert.ok(sampleOpening(t).veil > 0.9);
  for (const t of [4.5, 13.5, 22.5, 31.5]) assert.equal(sampleOpening(t).veil, 0);
  assert.equal(sampleOpening(31).weather, 'snow');
});
test('reduced motion keeps one stable autumn shot without fade or weather cycling', () => {
  assert.deepEqual(sampleOpening(0, true), sampleOpening(500, true));
  assert.equal(sampleOpening(0, true).season, 'autumn');
  assert.equal(sampleOpening(0, true).veil, 0);
});
test('opening mammals follow dry bank paths clear of the stationary train and sample terrain', () => {
  const center = (z) => Math.sin(z * 0.01) * 10;
  const terrain = (u, z) => u * 0.12 + z * 0.01;
  const train = { x: center(-460) + 28, y: 4.75, z: -460 };
  for (const [species, season] of [
    ['sika-deer', 'autumn'],
    ['japanese-hare', 'spring'],
    ['red-fox', 'winter'],
    ['tanuki', 'summer'],
  ])
    for (let t = 0; t < 9; t += 0.25) {
      const pose = openingAnimalPose(
        species,
        0,
        { ...sampleOpening(t), season, active: true, elapsed: t },
        train,
        center,
        terrain,
      );
      assert.ok(pose.x - center(pose.z) - 28 >= 12);
      assert.equal(pose.y, terrain(pose.x - center(pose.z), pose.z));
    }
});
test('wildlife staging ends immediately with gameplay and does not allocate extra animals', () => {
  const args = [{ x: 28, y: 4.75, z: -460 }, () => 0, () => 4.1];
  assert.equal(openingAnimalPose('sika-deer', 0, { active: false }, ...args), null);
  assert.equal(openingAnimalPose('sika-deer', 3, { active: true }, ...args), null);
  assert.equal(openingAnimalPose('koi', 0, { active: true }, ...args), null);
});
test('opening birds pass above train and wires; reduced-motion mammals remain still', () => {
  const args = [{ x: 28, y: 4.75, z: -460 }, () => 0, () => 4.1];
  const shot = { ...sampleOpening(13), elapsed: 13, active: true };
  const bird = openingAnimalPose('barn-swallow', 1, shot, ...args);
  assert.ok(bird.y >= 14.75);
  assert.equal(bird.flying, true);
  const mammal = openingAnimalPose(
    'sika-deer',
    0,
    { ...shot, season: 'autumn', reducedMotion: true },
    ...args,
  );
  assert.equal(mammal.walking, false);
  assert.equal(mammal.time, 0);
});

test('each season has a distinct camera bearing and winter reveals a map-like overview', () => {
  const poses = [0, 1, 2, 3].map((shot) => openingShotPose(shot, 0.5));
  assert.equal(new Set(poses.map((p) => p.name)).size, 4);
  assert.ok(poses[0].side < 0 && poses[2].side > 0);
  assert.ok(poses[1].along < -50);
  assert.ok(poses[3].height > 120);
});
test('the opening deer encounter is exclusive to autumn', () => {
  const args = [{ x: 28, y: 4.75, z: -460 }, () => 0, () => 4.1];
  for (const season of ['spring', 'summer', 'winter'])
    assert.equal(openingAnimalPose('sika-deer', 0, { active: true, season }, ...args), null);
});

test('opening keeps real elapsed time, pauses its handoff, and holds a surveyed dolly height', () => {
  const previousDocument = globalThis.document;
  const child = { style: {} };
  globalThis.document = {
    createElement: () => ({
      style: {},
      setAttribute() {},
      querySelector: () => child,
      remove() {},
    }),
    body: { append() {} },
  };
  try {
    const camera = new THREE.PerspectiveCamera(48, 1.6, 0.5, 1800);
    let calls = 0;
    const opening = createOpeningSequence({
      THREE,
      camera,
      terrainHeight: () => 0,
      foliageHeight: (x) => {
        calls++;
        return x < -55 ? 45 : -Infinity;
      },
    });
    const front = new THREE.Vector3(28, 4.75, -460),
      rear = new THREE.Vector3(28, 4.75, -514);
    opening.update(0.2, {});
    assert.equal(opening.getState().elapsed, 0.2);
    opening.applyCamera(front, rear);
    const height = camera.position.y,
      surveyedCalls = calls;
    for (let i = 0; i < 40; i++) {
      opening.update(0.1, {});
      opening.applyCamera(front, rear);
      assert.equal(camera.position.y, height);
    }
    assert.equal(calls, surveyedCalls, 'canopy survey should not run each frame');
    opening.update(0.5, { started: true, suspended: true });
    assert.equal(opening.getState().mix, 1);
    opening.update(1.8, { started: true });
    assert.equal(opening.getState().mix, 0);
    opening.dispose();
  } finally {
    globalThis.document = previousDocument;
  }
});
