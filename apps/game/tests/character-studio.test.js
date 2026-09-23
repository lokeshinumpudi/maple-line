import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import {
  alignFromTwoPoints,
  angularSeries,
  correctionWeight,
  diffHunks,
  fitOverlayToBody,
  footSlide,
  footState,
  ghostTimes,
  groupJitter,
  imageToView,
  inkBounds,
  jitterRms,
  lineDiff,
  mirrorClipData,
  mirrorName,
  mirrorQuaternion,
  overlayRect,
  quaternionFromEulerDegrees,
  rotationVector,
  trimmedTime,
  viewToImage,
} from '../src/characters/studio/studio-math.js';
import {
  CAST_TUNING,
  gripOverrides,
  parseTuning,
  serializeGrip,
  setGrip,
  tuningKey,
} from '../src/characters/cast-tuning.js';
import { attachProps } from '../src/world/character-motion.js';

const close = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) <= eps, `${a} != ${b}`);
const axisAngle = (axis, angle) =>
  new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(...axis).normalize(), angle).toArray();

// ---- jitter metric ------------------------------------------------------------------------

test('rotation vector is the relative rotation, the short way round', () => {
  const a = axisAngle([0, 1, 0], 0.3);
  const b = axisAngle([0, 1, 0], 0.5);
  const w = rotationVector(a, b);
  close(w[1], 0.2);
  close(Math.hypot(w[0], w[2]), 0);
  // q and -q are the same rotation: no 2 pi jump.
  const negated = b.map((c) => -c);
  close(rotationVector(a, negated)[1], 0.2);
  assert.deepEqual(rotationVector(a, a), [0, 0, 0]);
});

test('a steady spin has constant angular velocity and no jitter', () => {
  const dt = 1 / 60;
  const omega = 2; // rad/s
  const qs = Array.from({ length: 120 }, (_, i) => axisAngle([1, 0.5, 0], omega * i * dt));
  const { velocity, acceleration } = angularSeries(qs, dt);
  for (let i = 1; i < qs.length; i++) close(velocity[i], omega, 1e-6);
  for (let i = 2; i < qs.length; i++) close(acceleration[i], 0, 1e-3);
  close(jitterRms(qs, dt).rms, 0, 1e-3);
});

test('a one-frame shake shows up as jitter of the expected size', () => {
  const dt = 1 / 60;
  const qs = Array.from({ length: 30 }, () => axisAngle([0, 0, 1], 0));
  qs[15] = axisAngle([0, 0, 1], 0.01); // a 0.01 rad pop for one frame
  const { rms, max, n } = jitterRms(qs, dt);
  assert.equal(n, 28);
  // Second differences around the pop: +0.01, -0.02, +0.01 rad over dt^2.
  close(max, 0.02 / (dt * dt), 1e-3);
  close(rms, Math.sqrt((0.01 ** 2 + 0.02 ** 2 + 0.01 ** 2) / 28) / (dt * dt), 1e-2);
  // Excluding the frames around it removes it.
  assert.equal(jitterRms(qs, dt, (i) => i < 12).rms, 0);
  const groups = groupJitter({ upperArmL: { rms: 2 }, handR: { rms: 4 }, head: { rms: 1 } });
  assert.equal(groups.arms, 3);
  assert.equal(groups.neckHead, 1);
  assert.equal(groups.legs, null);
});

test('foot slide counts the least-moving contact against the distance walked', () => {
  // Root walks 1 cm a frame; one heel stays put, so there is no slide.
  const frames = Array.from({ length: 11 }, (_, i) => ({
    root: [0, i * 0.01],
    contacts: [
      [0, 0, 0.1],
      [0, 0.05, i * 0.02],
    ],
  }));
  const planted = footSlide(frames);
  close(planted.path, 0.1);
  close(planted.slide, 0);
  // Both contacts skate 5 mm a frame: 50% slide.
  const skating = footSlide(
    frames.map((f, i) => ({
      ...f,
      contacts: f.contacts.map((c) => [c[0], c[1], c[2] + i * 0.005]),
    })),
  );
  close(skating.percent, 50, 1e-6);
  assert.equal(footState({ height: 0.01, speed: 0.01, planted: true }), 'planted');
  assert.equal(footState({ height: 0.01, speed: 0.5, planted: false }), 'sliding');
  assert.equal(footState({ height: 0.2, speed: 1, planted: false }), 'swing');
});

// ---- overlay alignment ---------------------------------------------------------------------

test('overlay pixels and view points map both ways, flipped or not', () => {
  for (const flip of [false, true]) {
    const alignment = { height: 2, offset: [0.1, -0.05], opacity: 0.5, flip };
    const rect = overlayRect(alignment, 1024, 512);
    close(rect.width, 4);
    close(rect.centre[1], 0.95);
    for (const pixel of [
      [0, 0],
      [512, 256],
      [900, 500],
    ]) {
      const back = viewToImage(alignment, 1024, 512, imageToView(alignment, 1024, 512, pixel));
      close(back[0], pixel[0], 1e-9);
      close(back[1], pixel[1], 1e-9);
    }
    // The bottom-centre pixel sits at the offset.
    const bottom = imageToView(alignment, 1024, 512, [512, 512]);
    close(bottom[0], 0.1);
    close(bottom[1], -0.05);
  }
});

test('two-point alignment puts the head and soles of the concept on the body', () => {
  const alignment = alignFromTwoPoints({
    imageWidth: 1024,
    imageHeight: 1024,
    pixelA: [480, 980], // soles
    pixelB: [470, 30], // top of the head
    viewA: [0, 0],
    viewB: [0.02, 1.58],
  });
  const soles = imageToView(alignment, 1024, 1024, [480, 980]);
  close(soles[0], 0, 1e-4);
  close(soles[1], 0, 1e-4);
  const head = imageToView(alignment, 1024, 1024, [480, 30]);
  close(head[1], 1.58, 1e-4);
  assert.throws(() =>
    alignFromTwoPoints({
      imageWidth: 10,
      imageHeight: 10,
      pixelA: [1, 5],
      pixelB: [9, 5],
      viewA: [0, 0],
      viewB: [0, 1],
    }),
  );
});

test('ink bounds find a dark figure on cream paper and fit it to a body', () => {
  const width = 64;
  const height = 80;
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const figure = x >= 20 && x <= 40 && y >= 10 && y <= 70;
      const [r, g, b] = figure ? [40, 45, 80] : [240, 228, 205];
      data.set([r, g, b, 255], i);
    }
  data.set([10, 10, 10, 255], (2 * width + 2) * 4); // a speck, ignored
  const ink = inkBounds(data, width, height);
  assert.deepEqual(ink, {
    left: 20,
    right: 40,
    top: 10,
    bottom: 70,
    feet: { left: 20, right: 40 },
  });
  const alignment = fitOverlayToBody({
    imageWidth: width,
    imageHeight: height,
    ink,
    bodyTop: 1.6,
    bodyBottom: 0,
  });
  const feet = imageToView(alignment, width, height, [30, 70]);
  const head = imageToView(alignment, width, height, [30, 10]);
  close(feet[0], 0, 1e-4);
  close(feet[1], 0, 1e-4);
  close(head[1], 1.6, 1e-4);
});

// ---- timeline, mirroring, corrections -------------------------------------------------------

test('trimmed time loops or holds inside the trim, ghosts wrap with it', () => {
  const trim = { start: 0.5, end: 1.5, loop: true };
  close(trimmedTime(1.7, trim), 0.7);
  close(trimmedTime(0.2, trim), 1.2);
  close(trimmedTime(1.7, { ...trim, loop: false }), 1.5);
  const ghosts = ghostTimes(0.6, { count: 1, spacing: 6, fps: 30, trim });
  assert.deepEqual(
    ghosts.map((g) => g.k),
    [-1, 1],
  );
  close(ghosts[0].time, 1.4);
  close(ghosts[1].time, 0.8);
});

test('mirroring swaps sides and reflects rotations across the body', () => {
  assert.equal(
    mirrorName('Normalized_leftUpperArm.quaternion'),
    'Normalized_rightUpperArm.quaternion',
  );
  assert.equal(mirrorName('upperArmLeft'), 'upperArmRight');
  // Raising the left arm (a roll about +Z) mirrors to the matching roll of the right arm.
  const raise = axisAngle([0, 0, 1], 0.8);
  const mirrored = new THREE.Quaternion(...mirrorQuaternion(raise));
  const hand = new THREE.Vector3(1, 0, 0).applyQuaternion(new THREE.Quaternion(...raise));
  const other = new THREE.Vector3(-1, 0, 0).applyQuaternion(mirrored);
  close(other.x, -hand.x);
  close(other.y, hand.y);
  close(other.z, hand.z);
  const clip = mirrorClipData({
    name: 'wave',
    duration: 1,
    tracks: [
      { name: 'Normalized_leftHand.quaternion', kind: 'quaternion', times: [0], values: raise },
      { name: 'Normalized_hips.position', kind: 'vector', times: [0], values: [0.1, 0.9, 0] },
    ],
  });
  assert.equal(clip.name, 'wave-mirror');
  assert.equal(clip.tracks[0].name, 'Normalized_rightHand.quaternion');
  assert.deepEqual(clip.tracks[1].values, [-0.1, 0.9, 0]);
  close(
    correctionWeight(
      [
        { t: 0, w: 0 },
        { t: 1, w: 1 },
      ],
      0.25,
    ),
    0.25,
  );
  close(correctionWeight([{ t: 0.5, w: 0.7 }], 3), 0.7);
  const q = quaternionFromEulerDegrees([30, -20, 10]);
  const expected = new THREE.Quaternion().setFromEuler(
    new THREE.Euler(...[30, -20, 10].map(THREE.MathUtils.degToRad), 'XYZ'),
  );
  q.forEach((c, i) => close(c, expected.toArray()[i], 1e-9));
});

test('the save review diff marks changed lines only', () => {
  const diff = lineDiff('a\nb\nc\nd', 'a\nB\nc\nd\ne');
  assert.deepEqual(
    diff.map((d) => d.op + d.line),
    [' a', '-b', '+B', ' c', ' d', '+e'],
  );
  const hunks = diffHunks(lineDiff('1\n2\n3\n4\n5\n6\n7\n8', '1\n2\n3\n4\n5\n6\n7\nX'), 1);
  assert.equal(hunks[0].op, '…');
});

// ---- grip-offset serialisation -------------------------------------------------------------

test('grips serialise with rounded offsets and a canonical quaternion', () => {
  const grip = serializeGrip({
    hand: 'left',
    hold: 'two',
    offset: [0.012345678, -0.0000001, 0.3],
    rotation: [0, 0, -0.7071068, -0.7071068], // same rotation as [0, 0, 0.707, 0.707]
    grip2: [0.1, 0.2, 0.3, 0, 0, 0, 2],
    junk: 'dropped',
  });
  assert.deepEqual(grip, {
    hand: 'left',
    hold: 'two',
    offset: [0.0123, 0, 0.3],
    rotation: [0, 0, 0.70711, 0.70711],
    grip2: [0.1, 0.2, 0.3, 0, 0, 0, 1],
  });
  assert.throws(() => serializeGrip({ hand: 'middle' }));
  assert.throws(() => serializeGrip({ offset: [0, Number.NaN, 0] }));
  assert.throws(() => serializeGrip({ rotation: [0, 0, 0, 0] }));
});

test('setGrip keys by model file, round-trips through JSON and removes cleanly', () => {
  assert.equal(tuningKey('models/characters/vrm/riko.vrm'), 'vrm/riko');
  assert.equal(tuningKey('models/characters/student-riko.glb'), 'student-riko');
  let tuning = { version: 1, grips: {} };
  tuning = setGrip(tuning, 'models/characters/vrm/riko.vrm', 'radio', {
    offset: [0, 0.01, -0.02],
    rotation: [0, 0, 0, 1],
  });
  tuning = setGrip(tuning, 'models/characters/vrm/riko.vrm', 'phone', { hand: 'right' });
  assert.deepEqual(Object.keys(tuning.grips['vrm/riko']), ['phone', 'radio']);
  const parsed = parseTuning(JSON.parse(JSON.stringify(tuning)));
  assert.deepEqual(parsed, tuning);
  assert.deepEqual(
    gripOverrides('models/characters/vrm/riko.vrm', parsed).radio.offset,
    [0, 0.01, -0.02],
  );
  assert.deepEqual(gripOverrides('models/characters/vrm/sato.vrm', parsed), {});
  tuning = setGrip(tuning, 'vrm/riko', 'radio', null);
  tuning = setGrip(tuning, 'vrm/riko', 'phone', null);
  assert.deepEqual(tuning.grips, {});
  // The committed file parses.
  assert.equal(parseTuning(CAST_TUNING).version, 1);
});

test('tuned grips win over prop extras when props attach to a hand', () => {
  const root = new THREE.Group();
  const hand = new THREE.Object3D();
  root.add(hand);
  const socket = new THREE.Object3D();
  hand.add(socket);
  const radio = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.1));
  radio.name = 'radio';
  radio.userData = { prop: 'radio', hand: 'left', hold: 'one' };
  root.add(radio);
  const [prop] = attachProps(THREE, root, { L: socket, R: socket }, undefined, {
    radio: { offset: [0.01, 0.02, 0.03], rotation: [0, 0, 0.70711, 0.70711], hold: 'two' },
  });
  assert.equal(prop.node.parent, socket);
  assert.deepEqual(prop.node.position.toArray(), [0.01, 0.02, 0.03]);
  close(prop.node.quaternion.z, 0.70711);
  assert.equal(prop.hold, 'two');
});

// ---- dev only ---------------------------------------------------------------------------------

test('the studio page and its endpoints stay out of every build', async () => {
  const { default: config } = await import('../vite.config.js');
  for (const mode of ['production', 'ship', 'public', 'ship-embed', 'public-embed', 'readable']) {
    const resolved = config({ mode, command: 'build' });
    const inputs = JSON.stringify(resolved.build?.rollupOptions?.input ?? null);
    assert.ok(!inputs.includes('character-studio'), `${mode} builds the studio page`);
    for (const plugin of resolved.plugins.flat())
      if (plugin?.name === 'maple-character-studio') assert.equal(plugin.apply, 'serve');
  }
  const html = readFileSync(new URL('../character-studio.html', import.meta.url), 'utf8');
  assert.match(html, /src\/characters\/studio\/studio\.js/);
});
