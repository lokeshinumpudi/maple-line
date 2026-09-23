import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createDirector, normalizeShot, lensToFov, SHOT_TYPES } from '../src/camera/director.js';
import { sunScreenPosition, shaftStrength } from '../src/rendering/film-pipeline.js';

// A straight 4 km line along +z on flat ground at y = 0.
function setup(options = {}) {
  const track = new THREE.LineCurve3(new THREE.Vector3(0, 0.5, 0), new THREE.Vector3(0, 0.5, 4000));
  const camera = new THREE.PerspectiveCamera(48, 16 / 9, 0.5, 1800);
  const sets = [];
  const captions = [];
  const director = createDirector({
    THREE,
    camera,
    track,
    getTrackLength: () => 4000,
    groundAt: () => 0,
    onSet: (set) => sets.push(set),
    onCaption: (caption) => captions.push(caption),
    ...options,
  });
  const context = (distance, extra = {}) => ({
    dt: 1 / 30,
    enabled: true,
    distance,
    direction: 1,
    speed: 25,
    inTunnel: false,
    stop: null,
    bridge: null,
    tunnelAhead: null,
    place: null,
    ...extra,
  });
  return { director, camera, sets, captions, context };
}

test('focal lengths map to full-frame vertical fields of view', () => {
  assert.ok(Math.abs(lensToFov(50) - 26.99) < 0.05);
  assert.ok(lensToFov(24) > lensToFov(85));
  // Portrait screens widen the view so the subject still fits across.
  assert.ok(lensToFov(50, 0.46) > lensToFov(50, 16 / 9));
  assert.ok(lensToFov(12, 0.4) <= 75);
});

test('shot requests are validated before they reach the camera', () => {
  assert.deepEqual(normalizeShot({ type: 'drone', duration: 6 }), { type: 'drone', duration: 6 });
  assert.throws(() => normalizeShot({ type: 'crane-arm' }), /Shot type/);
  assert.throws(() => normalizeShot({ type: 'telephoto', lens: 2000 }), /lens/);
  assert.throws(() => normalizeShot({ type: 'portrait' }), /portrait needs/);
  assert.throws(() => normalizeShot({ type: 'drone', set: { speedKmh: 400 } }), /Unsupported/);
  assert.throws(() => normalizeShot({ type: 'drone', caption: 'x'.repeat(161) }), /160/);
  const shot = normalizeShot({ type: 'portrait', subject: { person: 'commuter-1' } });
  assert.deepEqual(shot.subject, { person: 'commuter-1' });
});

test('the automatic editor cuts between different shots and keeps the camera above ground', () => {
  const { director, camera, context } = setup();
  let distance = 400;
  const types = new Set();
  let letterbox = 0;
  for (let i = 0; i < 30 * 90; i++) {
    distance += 25 / 30;
    const look = director.update(context(distance));
    letterbox = look.letterbox;
    types.add(director.getState().shot.type);
    assert.ok(camera.position.y > 0, `camera below ground in ${director.getState().shot.type}`);
    assert.ok(Number.isFinite(camera.fov) && camera.fov > 1 && camera.fov < 80);
  }
  assert.equal(letterbox, 1);
  assert.ok(types.size >= 4, `only ${[...types].join(', ')}`);
  const history = director.getState().history.map((item) => item.type);
  for (let i = 1; i < history.length; i++) assert.notEqual(history[i], history[i - 1]);
});

test('a trackside shot is planted ahead of the train and ends after the train has passed', () => {
  const { director, camera, context } = setup();
  director.update(context(400));
  director.cut({ type: 'trackside', side: 'left' });
  director.update(context(400));
  const anchor = camera.position.clone();
  assert.ok(anchor.z > 400, 'planted ahead of the lead car');
  assert.ok(Math.abs(anchor.x) >= 8, 'beside the track, not on it');
  let distance = 400;
  while (director.getState().shot.type === 'trackside' && distance < 1200) {
    distance += 25 / 30;
    director.update(context(distance));
    if (director.getState().shot.type === 'trackside') assert.ok(camera.position.equals(anchor));
  }
  assert.ok(distance - 4 * 13.5 > anchor.z, 'the rear car passed the camera before the cut');
});

test('scripted sequences play in order, apply scene settings and show captions', () => {
  const { director, sets, captions, context } = setup();
  director.play({
    title: 'The Late Bus',
    shots: [
      { type: 'establishing', duration: 2, caption: 'Minato', set: { location: 'minato' } },
      { type: 'chase', duration: 2, line: 'Haru checks his watch.' },
    ],
  });
  const seen = [];
  let distance = 500;
  for (let i = 0; i < 30 * 5; i++) {
    distance += 25 / 30;
    director.update({ ...context(distance), enabled: false });
    const type = director.getState().shot?.type;
    if (type && seen.at(-1) !== type) seen.push(type);
  }
  assert.deepEqual(seen.slice(0, 2), ['establishing', 'chase']);
  assert.deepEqual(sets, [{ location: 'minato' }]);
  assert.deepEqual(
    captions.map((c) => c.kind),
    ['title', 'shot', 'shot', 'end'],
  );
  // With the sequence finished and the Director view off, the director releases the camera.
  assert.equal(director.update({ ...context(distance), enabled: false }), null);
});

test('interior shots follow the carriage and building obstruction rejects a trackside view', () => {
  const blocked = setup({ obstructed: () => true });
  blocked.director.update(blocked.context(400));
  blocked.director.cut({ type: 'trackside' });
  assert.notEqual(blocked.director.getState().shot.type, 'trackside');
  const { director, camera, context } = setup();
  director.update(context(400, { inTunnel: true }));
  assert.ok(['cab', 'window'].includes(director.getState().shot.type));
  assert.ok(Math.abs(camera.position.x) < 2 && camera.near < 0.1);
});

test('every shot type can be requested', () => {
  for (const type of SHOT_TYPES) {
    const { director, camera, context } = setup();
    director.update(context(900, { stop: { id: 'x', distance: 950 }, bridge: { distance: 1100 } }));
    const subject = ['portrait', 'insert'].includes(type) ? { point: [4, 0, 950] } : undefined;
    director.cut({ type, ...(subject ? { subject } : {}) });
    director.update(context(901, { stop: { id: 'x', distance: 950 }, bridge: { distance: 1100 } }));
    assert.equal(director.getState().shot.type, type);
    assert.ok(camera.position.toArray().every(Number.isFinite));
  }
});

test('sun shafts appear only for a sun in or near the frame in clear or snowy air', () => {
  const camera = new THREE.PerspectiveCamera(50, 16 / 9, 0.5, 1800);
  camera.position.set(0, 2, 0);
  camera.lookAt(0, 2, -10);
  camera.updateMatrixWorld();
  const ahead = sunScreenPosition(camera, new THREE.Vector3(0, 0.2, -1));
  assert.ok(ahead && Math.abs(ahead.x - 0.5) < 0.01 && ahead.y > 0.5);
  assert.equal(sunScreenPosition(camera, new THREE.Vector3(0, 0.2, 1)), null);
  assert.ok(shaftStrength(ahead, { weather: 'clear' }) > 0);
  assert.equal(shaftStrength(ahead, { weather: 'rain' }), 0);
  assert.equal(shaftStrength(ahead, { weather: 'clear', inTunnel: true }), 0);
  assert.ok(shaftStrength(ahead, { dusk: true }) > shaftStrength(ahead, {}));
  assert.equal(shaftStrength({ x: 2.5, y: 0.5 }, {}), 0);
});
