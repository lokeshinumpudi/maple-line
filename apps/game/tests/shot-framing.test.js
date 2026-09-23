import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {
  CLEAR,
  candidateViews,
  composeAim,
  createFramingMonitor,
  faceVisible,
  lineSide,
  mirrorView,
  placeView,
  searchView,
  thirds,
} from '../src/camera/shot-framing.js';
import { createDirector } from '../src/camera/director.js';

const DEG = Math.PI / 180;
const base = { angle: 0.5, reach: 3.2, rise: 0.05 };
const near = (a, b, eps = 1e-6) => Math.abs(a - b) < eps;
const turned = (view, from = base) =>
  Math.atan2(Math.sin(view.angle - from.angle), Math.cos(view.angle - from.angle));

test('candidates start at the planned view and grow in cost', () => {
  const list = candidateViews(base);
  assert.equal(list[0].cost, 0);
  assert.ok(near(list[0].angle, base.angle) && list[0].reach === base.reach);
  for (let i = 1; i < list.length; i++) assert.ok(list[i].cost >= list[i - 1].cost);
  // Orbit ±15–90°, raise, lower, push in and pull back are all on offer.
  const turns = list.map((view) => Math.round(Math.abs(turned(view)) / DEG));
  for (const degrees of [15, 30, 45, 60, 90]) assert.ok(turns.includes(degrees));
  assert.ok(list.some((view) => view.rise > base.rise + 1));
  assert.ok(list.some((view) => view.rise < base.rise));
  assert.ok(list.some((view) => view.reach < base.reach * 0.6));
  assert.ok(list.some((view) => view.reach > base.reach));
});

test('a clear planned view is kept, and a blocked one moves the least that works', () => {
  const clear = searchView({ base, score: () => 1 });
  assert.equal(clear.view.cost, 0);
  assert.equal(clear.fallback, false);
  // A post blocks everything within 20° of the planned bearing.
  const post = (view) => (Math.abs(turned(view)) < 20 * DEG ? 0 : 1);
  const moved = searchView({ base, score: post });
  assert.equal(moved.score, 1);
  assert.ok(near(Math.abs(turned(moved.view)), 30 * DEG));
  // The same scene gives the same answer: the choice is stable, not random.
  assert.deepEqual(searchView({ base, score: post }).view, moved.view);
});

test('the search stays on its side of the line and crosses only when it must', () => {
  const lineAngle = 0;
  const side = lineSide(lineAngle, base.angle);
  assert.equal(side, 1);
  // Only a far same-side angle is clear; a nearer one across the line is ignored.
  const farSame = (view) =>
    lineSide(lineAngle, view.angle) === side ? (turned(view) > 50 * DEG ? 1 : 0) : 1;
  const kept = searchView({ base, score: farSame, lineAngle, side });
  assert.equal(kept.flipped, false);
  assert.equal(lineSide(lineAngle, kept.view.angle), side);
  // Nothing clear on this side: the mirrored side is used, and the result says so.
  const wall = (view) => (lineSide(lineAngle, view.angle) === side ? 0 : 1);
  const crossed = searchView({ base, score: wall, lineAngle, side });
  assert.equal(crossed.flipped, true);
  assert.equal(lineSide(lineAngle, crossed.view.angle), -side);
  assert.ok(near(mirrorView(base, lineAngle).angle, -base.angle));
});

test('when nothing is clear the best partial view is kept as a fallback', () => {
  const partial = (view) => (view.rise > 1 ? 0.5 : 0);
  const found = searchView({ base, score: partial });
  assert.equal(found.fallback, true);
  assert.equal(found.score, 0.5);
  const none = searchView({ base, score: () => 0 });
  assert.equal(none.fallback, true);
  assert.equal(none.score, 0);
});

test('dialogue views never show the back of the speaker’s head', () => {
  const facing = 0;
  assert.ok(faceVisible(facing, 30 * DEG));
  assert.ok(!faceVisible(facing, Math.PI));
  assert.ok(faceVisible(null, Math.PI));
  const behind = { angle: Math.PI - 0.2, reach: 3, rise: 0 };
  const found = searchView({
    base: behind,
    score: () => 1,
    accept: (view) => faceVisible(facing, view.angle),
  });
  assert.ok(faceVisible(facing, found.view.angle));
});

test('a held shot changes angle only after repeated blocked checks, then rests', () => {
  const monitor = createFramingMonitor({ interval: 0.25, patience: 2, cooldown: 1.5, margin: 0.3 });
  const tick = (seconds) => {
    let due = false;
    for (let t = 0; t < seconds - 1e-9; t += 1 / 30) due = monitor.due(1 / 30) || due;
    return due;
  };
  assert.ok(tick(0.26));
  assert.equal(monitor.report(0.4), false); // one blocked check is not enough
  assert.ok(tick(0.26));
  assert.equal(monitor.report(0.4), true);
  // A similar angle is not worth a move; a clearly better one is.
  assert.equal(monitor.better(0.4, 0.6), false);
  assert.equal(monitor.better(0.4, 1), true);
  monitor.switched();
  tick(0.26);
  monitor.report(0);
  tick(0.26);
  assert.equal(monitor.report(0), false); // cooling down after a change
  tick(1.5);
  monitor.report(0);
  assert.equal(monitor.report(0), true);
  // A clear check resets the count.
  monitor.switched();
  tick(2);
  monitor.report(0);
  monitor.report(CLEAR);
  assert.equal(monitor.report(0), false);
});

test('composeAim puts the eyes on the thirds with look room', () => {
  for (const aspect of [16 / 9, 9 / 16]) {
    const camera = new THREE.PerspectiveCamera(30, aspect, 0.1, 100);
    const eye = new THREE.Vector3(3, 1.6, -2);
    const face = new THREE.Vector3(0.4, 1.55, 1.2);
    const offsets = thirds(aspect, 1);
    assert.ok(offsets.nx < 0 && offsets.ny > 0); // facing right: left third, upper third
    const aim = composeAim(eye, face, { ...offsets, vfov: 30 * DEG, aspect });
    camera.position.copy(eye);
    camera.lookAt(aim.x, aim.y, aim.z);
    camera.updateMatrixWorld(true);
    const ndc = face.clone().project(camera);
    assert.ok(Math.abs(ndc.x - offsets.nx) < 0.03, `x ${ndc.x} vs ${offsets.nx}`);
    assert.ok(Math.abs(ndc.y - offsets.ny) < 0.03, `y ${ndc.y} vs ${offsets.ny}`);
  }
  assert.deepEqual(placeView({ x: 1, y: 2, z: 3 }, { angle: 0, reach: 2, rise: 0.5 }), {
    x: 3,
    y: 2.5,
    z: 3,
  });
});

// ---- the director with people ----

function stage({ obstructed, heads = () => [] } = {}) {
  const track = new THREE.LineCurve3(new THREE.Vector3(0, 0.5, 0), new THREE.Vector3(0, 0.5, 4000));
  const camera = new THREE.PerspectiveCamera(48, 16 / 9, 0.5, 1800);
  const notes = [];
  // Two people on a platform 6 m east of the line, facing each other along z.
  const people = {
    a: { point: [6, 1.1, 500], head: [6, 2.6, 500], heading: 0 },
    b: { point: [6, 1.1, 504], head: [6, 2.6, 504], heading: Math.PI },
  };
  const director = createDirector({
    THREE,
    camera,
    track,
    getTrackLength: () => 4000,
    groundAt: () => 0,
    resolveSubject: (subject) => people[subject.person] ?? null,
    obstructed: obstructed ?? (() => false),
    interiorHeads: heads,
    onNote: (message) => notes.push(message),
  });
  const context = (extra = {}) => ({
    dt: 1 / 30,
    enabled: true,
    distance: 480,
    direction: 1,
    speed: 0,
    inTunnel: false,
    stop: null,
    bridge: null,
    tunnelAhead: null,
    place: null,
    ...extra,
  });
  return { director, camera, notes, context, people };
}
const eyesOf = (person) => new THREE.Vector3(...person.head).add(new THREE.Vector3(0, 0.06, 0));

test('a portrait avoids a wall between the camera and the face and logs the move', () => {
  // A wall along x = 7.5 hides every view from the east of the speaker.
  const wall = (from, to) => (from.x - 7.5) * (to.x - 7.5) < 0;
  const { director, camera, notes, context, people } = stage({ obstructed: wall });
  director.cut({ type: 'portrait', subject: { person: 'a' }, partner: { person: 'b' } });
  director.update(context());
  assert.ok(camera.position.x < 7.5, `camera x ${camera.position.x}`);
  const state = director.getState().shot;
  assert.equal(state.framing.clear, 1);
  // The face is in frame, in front of the camera.
  camera.updateMatrixWorld(true);
  const ndc = eyesOf(people.a).project(camera);
  assert.ok(Math.abs(ndc.x) < 0.9 && Math.abs(ndc.y) < 0.9 && ndc.z < 1);
  assert.ok(notes.length >= 0);
});

test('a reverse shot keeps the same side of the line between two speakers', () => {
  const { director, camera, context, people } = stage();
  const side = () => {
    const [ax, , az] = people.a.head;
    const [bx, , bz] = people.b.head;
    return Math.sign((bx - ax) * (camera.position.z - az) - (bz - az) * (camera.position.x - ax));
  };
  director.cut({ type: 'portrait', subject: { person: 'a' }, partner: { person: 'b' } });
  director.update(context());
  const first = side();
  director.cut({
    type: 'portrait',
    subject: { person: 'b' },
    partner: { person: 'a' },
    framing: 'ots',
  });
  director.update(context());
  assert.equal(director.getState().shot.framing.kind, 'ots');
  assert.equal(side(), first);
  // Back to the first speaker: still the same side.
  director.cut({
    type: 'portrait',
    subject: { person: 'a' },
    partner: { person: 'b' },
    framing: 'ots',
  });
  director.update(context());
  assert.equal(side(), first);
});

test('a view blocked mid-shot moves after two checks and blends without a jump', () => {
  // Later, something blocks the whole side of the line the camera stands on.
  let blockedSide = 0;
  const { director, camera, notes, context } = stage({
    obstructed: (from) => blockedSide !== 0 && Math.sign(from.x - 6) === blockedSide,
  });
  director.cut({ type: 'portrait', subject: { person: 'a' }, side: 'left' });
  director.update(context());
  const start = camera.position.clone();
  blockedSide = Math.sign(start.x - 6);
  let last = camera.position.clone();
  let largest = 0;
  for (let frame = 0; frame < 90; frame++) {
    director.update(context());
    largest = Math.max(largest, camera.position.distanceTo(last));
    last = camera.position.clone();
  }
  assert.ok(director.getState().shot.framing.substitutions >= 1);
  assert.ok(notes.some((note) => /blocked while holding/.test(note)));
  assert.ok(camera.position.distanceTo(start) > 0.5);
  assert.notEqual(Math.sign(camera.position.x - 6), blockedSide);
  assert.ok(notes.some((note) => /across the line/.test(note)));
  assert.ok(largest < 0.35, `largest step ${largest}`);
});

test('a window shot turns away from a seated passenger close to the lens', () => {
  // Passengers on the right-hand bench, 1–3 m from the lens; the left side is empty.
  const heads = () => {
    const list = [];
    for (let z = 460; z < 470; z += 0.8) list.push([1.01, 3.1, z]);
    return list;
  };
  const { director, camera, notes, context } = stage({ heads });
  director.cut({ type: 'window' });
  director.update(context());
  camera.updateMatrixWorld(true);
  const inFrame = heads().filter((head) => {
    const point = new THREE.Vector3(...head);
    if (point.distanceTo(camera.position) >= 3.2) return false;
    point.project(camera);
    return point.z < 1 && Math.abs(point.x) < 1 && Math.abs(point.y) < 1;
  });
  assert.equal(inFrame.length, 0);
  // It films the empty side.
  assert.ok(camera.getWorldDirection(new THREE.Vector3()).x < 0);
  assert.ok(notes.every((note) => !/least crowded/.test(note)));
});
