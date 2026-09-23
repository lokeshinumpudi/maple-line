import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {
  applyTwoBoneIK,
  attachProps,
  createHandSockets,
  createSteering,
  fadeFor,
  handSocketFrame,
  solveTwoBone,
  strideTimeScale,
} from '../src/world/character-motion.js';
import { createCharacterRig } from '../src/world/character-rig.js';
import {
  canonicalForName,
  humanoidRigFor,
  parseBoneName,
  REQUIRED_CANONICAL,
} from '../src/characters/humanoid-bones.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const close = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) <= eps, `${a} != ${b}`);

// ---- two-bone IK ------------------------------------------------------------------------

test('two-bone IK reaches a target in range, keeps both lengths and bends toward the pole', () => {
  const root = V(0, 1, 0);
  const joint = V(0, 0.7, 0.02);
  const end = V(0, 0.4, 0);
  const upper = root.distanceTo(joint);
  const lower = joint.distanceTo(end);
  for (const [target, pole] of [
    [V(0.2, 0.6, 0.3), V(0, 0.8, 1)],
    [V(-0.1, 0.9, 0.35), V(-1, 0.8, 0)],
    [V(0, 0.55, 0), V(0, 0.8, -1)],
  ]) {
    const solved = solveTwoBone(THREE, root, joint, end, target, pole);
    assert.ok(solved.reached);
    close(solved.end.distanceTo(target), 0, 1e-4);
    close(root.distanceTo(solved.joint), upper, 1e-9);
    close(solved.joint.distanceTo(solved.end), lower, 1e-4);
    // The joint lies on the pole's side of the root-target line.
    const axis = target.clone().sub(root).normalize();
    const side = (p) => {
      const d = p.clone().sub(root);
      return d.sub(axis.clone().multiplyScalar(d.dot(axis)));
    };
    assert.ok(side(solved.joint).dot(side(pole)) > 0);
  }
});

test('two-bone IK out of reach stretches straight at the target without growing', () => {
  const root = V(0, 0, 0);
  const joint = V(0, -0.3, 0.05);
  const end = V(0, -0.6, 0);
  const target = V(0, -2, 1);
  const solved = solveTwoBone(THREE, root, joint, end, target, V(0, -1, 1));
  assert.equal(solved.reached, false);
  const length = root.distanceTo(joint) + joint.distanceTo(end);
  close(solved.end.length(), length, 1e-4);
  close(solved.end.clone().normalize().dot(target.clone().normalize()), 1, 1e-6);
});

test('two-bone IK drives a real bone chain to the target', () => {
  const hips = new THREE.Bone();
  const knee = new THREE.Bone();
  const ankle = new THREE.Bone();
  hips.add(knee);
  knee.add(ankle);
  knee.position.set(0, -0.45, 0.01);
  ankle.position.set(0, -0.42, -0.01);
  const scene = new THREE.Group();
  scene.add(hips);
  hips.position.set(0, 0.95, 0);
  scene.updateMatrixWorld(true);
  const target = V(0.1, 0.25, 0.2);
  applyTwoBoneIK(THREE, hips, knee, ankle, target, V(0, 0.5, 1));
  close(ankle.getWorldPosition(V()).distanceTo(target), 0, 1e-4);
  // Weight 0.5 goes half way from where the foot was.
  hips.quaternion.identity();
  knee.quaternion.identity();
  scene.updateMatrixWorld(true);
  const start = ankle.getWorldPosition(V());
  applyTwoBoneIK(THREE, hips, knee, ankle, target, V(0, 0.5, 1), 0.5);
  const half = start.clone().lerp(target, 0.5);
  close(ankle.getWorldPosition(V()).distanceTo(half), 0, 1e-3);
});

// ---- steering ---------------------------------------------------------------------------

/** Deterministic noise in [-1, 1]. */
function noise(seed) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return (s / 4294967296) * 2 - 1;
  };
}

test('steering ignores jitter around a standing person: no shuffle, no fidgeting turns', () => {
  const steering = createSteering();
  const rand = noise(7);
  steering.update(1 / 60, { x: 0, z: 0, heading: 0.4 });
  let path = 0;
  let turn = 0;
  let prev = { ...steering.state };
  for (let i = 0; i < 600; i++) {
    const s = steering.update(1 / 60, {
      x: rand() * 0.03,
      z: rand() * 0.03,
      heading: 0.4 + rand() * 0.2,
      moving: false,
    });
    path += Math.hypot(s.x - prev.x, s.z - prev.z);
    turn += Math.abs(s.heading - prev.heading);
    prev = { ...s };
  }
  assert.ok(path < 0.05, `drifted ${path} m`);
  assert.ok(turn < 0.05, `turned ${turn} rad`);
  assert.equal(steering.state.speed, 0);
});

test('steering follows a noisy walk without reversals or backward steps', () => {
  const steering = createSteering();
  const rand = noise(11);
  const dt = 1 / 30;
  steering.update(dt, { x: 0, z: 0, heading: 0 });
  let reversals = 0;
  let last = null;
  let maxTurnStep = 0;
  let prev = { ...steering.state };
  for (let i = 1; i <= 300; i++) {
    const z = i * dt * 1.15; // a 1.15 m/s walk, sampled with 2 cm of noise
    const s = steering.update(dt, {
      x: rand() * 0.02,
      z: z + rand() * 0.02,
      heading: 0,
      moving: true,
    });
    const dx = s.x - prev.x;
    const dz = s.z - prev.z;
    // Motion is only ever along the body's heading.
    if (Math.hypot(dx, dz) > 1e-6)
      assert.ok(dx * Math.sin(s.heading) + dz * Math.cos(s.heading) > 0, 'stepped backward');
    if (Math.hypot(dx, dz) > 0.004) {
      if (last && last[0] * dx + last[1] * dz < 0) reversals++;
      last = [dx, dz];
    }
    maxTurnStep = Math.max(maxTurnStep, Math.abs(s.heading - prev.heading));
    prev = { ...s };
  }
  assert.equal(reversals, 0);
  assert.ok(maxTurnStep < 0.12, `heading jumped ${maxTurnStep} rad in a frame`);
  // Trails the simulation by a bounded lag and matches its speed.
  const lag = 300 * dt * 1.15 - steering.state.z;
  assert.ok(lag > 0 && lag < 1, `lag ${lag}`);
  close(steering.state.speed, 1.15, 0.15);
});

test('steering turns around in place instead of walking backward, and never flips instantly', () => {
  const steering = createSteering();
  const dt = 1 / 30;
  steering.update(dt, { x: 0, z: 0, heading: 0 });
  for (let i = 1; i <= 60; i++)
    steering.update(dt, { x: 0, z: i * dt * 1.1, heading: 0, moving: true });
  const turnAt = steering.state.z;
  let sawTurning = false;
  let maxStep = 0;
  let prevHeading = steering.state.heading;
  let back = 0;
  for (let i = 1; i <= 150; i++) {
    const before = { x: steering.state.x, z: steering.state.z };
    const s = steering.update(dt, {
      x: 0,
      z: turnAt + 0.6 - i * dt * 1.1,
      heading: Math.PI,
      moving: true,
    });
    sawTurning ||= s.turning;
    const step = Math.abs(
      Math.atan2(Math.sin(s.heading - prevHeading), Math.cos(s.heading - prevHeading)),
    );
    maxStep = Math.max(maxStep, step);
    prevHeading = s.heading;
    // Any movement goes where the body faces.
    const dx = s.x - before.x;
    const dz = s.z - before.z;
    if (Math.hypot(dx, dz) > 1e-6 && dx * Math.sin(s.heading) + dz * Math.cos(s.heading) < 0)
      back++;
  }
  assert.ok(sawTurning, 'a reversal should turn on the spot');
  assert.ok(maxStep < 0.12, `heading jumped ${maxStep} rad in a frame`);
  assert.equal(back, 0);
  close(Math.abs(steering.state.heading), Math.PI, 0.2);
});

test('steering snaps over teleports and pins the body when told to hold', () => {
  const steering = createSteering();
  steering.update(1 / 30, { x: 0, z: 0, heading: 0 });
  steering.update(1 / 30, { x: 20, z: 5, heading: 1 });
  assert.equal(steering.state.x, 20);
  assert.equal(steering.state.z, 5);
  steering.update(1 / 30, { x: 20.3, z: 5.1, heading: 1, hold: true });
  assert.equal(steering.state.x, 20.3);
  assert.equal(steering.state.speed, 0);
});

test('stride timeScale matches clip foot speed to body speed; fades depend on the clip pair', () => {
  close(strideTimeScale(1.15, 1.15), 1);
  close(strideTimeScale(0.575, 1.15), 0.5);
  assert.equal(strideTimeScale(5, 1.15), 1.6);
  assert.equal(strideTimeScale(1, 0), 1);
  assert.ok(fadeFor('walk', 'hurry') < fadeFor('walk', 'idle'));
  assert.ok(fadeFor('idle', 'sit') > fadeFor('idle', 'walk'));
  assert.equal(fadeFor(null, 'idle'), 0);
});

// ---- bone maps --------------------------------------------------------------------------

function skeleton(names) {
  // names: [name, parentName] in parent-first order.
  const root = new THREE.Group();
  const byName = {};
  for (const [name, parent] of names) {
    const bone = new THREE.Bone();
    bone.name = name;
    (parent ? byName[parent] : root).add(bone);
    byName[name] = bone;
  }
  return root;
}

const chain = (hips, spines, neck, head, arm, leg, sides) => {
  const names = [[hips, null]];
  let parent = hips;
  for (const spine of spines) {
    names.push([spine, parent]);
    parent = spine;
  }
  const top = parent;
  names.push([neck, top], [head, neck]);
  for (const side of sides) {
    let p = top;
    for (const bone of arm(side)) {
      names.push([bone, p]);
      p = bone;
    }
    p = hips;
    for (const bone of leg(side)) {
      names.push([bone, p]);
      p = bone;
    }
  }
  return names;
};

test('bone names from common rigs resolve to canonical bones with side and fingers', () => {
  assert.deepEqual(parseBoneName('mixamorigLeftHand'), { side: 'L', base: 'hand' });
  assert.deepEqual(parseBoneName('upperarm_r'), { side: 'R', base: 'upperarm' });
  assert.deepEqual(parseBoneName('DEF-thighL'), { side: 'L', base: 'thigh' });
  assert.equal(canonicalForName('mixamorig:RightForeArm'), 'lowerArmR');
  assert.equal(canonicalForName('calf_l'), 'lowerLegL');
  assert.equal(canonicalForName('index_01_r'), 'indexR1');
  assert.equal(canonicalForName('LeftHandThumb1'), 'thumbL1');
  assert.equal(canonicalForName('pelvis'), 'hips');
  assert.equal(canonicalForName('eye-l'), null);
});

test('a Mixamo, an Unreal/UAL and a Rigify skeleton each resolve every required bone', () => {
  const mixamo = skeleton(
    chain(
      'mixamorigHips',
      ['mixamorigSpine', 'mixamorigSpine1', 'mixamorigSpine2'],
      'mixamorigNeck',
      'mixamorigHead',
      (s) => [
        `mixamorig${s}Shoulder`,
        `mixamorig${s}Arm`,
        `mixamorig${s}ForeArm`,
        `mixamorig${s}Hand`,
        `mixamorig${s}HandIndex1`,
      ],
      (s) => [
        `mixamorig${s}UpLeg`,
        `mixamorig${s}Leg`,
        `mixamorig${s}Foot`,
        `mixamorig${s}ToeBase`,
      ],
      ['Left', 'Right'],
    ),
  );
  const unreal = skeleton(
    chain(
      'pelvis',
      ['spine_01', 'spine_02', 'spine_03'],
      'neck_01',
      'head',
      (s) => [`clavicle_${s}`, `upperarm_${s}`, `lowerarm_${s}`, `hand_${s}`, `index_01_${s}`],
      (s) => [`thigh_${s}`, `calf_${s}`, `foot_${s}`, `ball_${s}`],
      ['l', 'r'],
    ),
  );
  const rigify = skeleton(
    chain(
      'DEF-hips',
      ['DEF-spine', 'DEF-chest'],
      'DEF-neck',
      'DEF-head',
      (s) => [`DEF-shoulder${s}`, `DEF-upper_arm${s}`, `DEF-forearm${s}`, `DEF-hand${s}`],
      (s) => [`DEF-thigh${s}`, `DEF-shin${s}`, `DEF-foot${s}`, `DEF-toe${s}`],
      ['L', 'R'],
    ),
  );
  for (const [label, root] of [
    ['mixamo', mixamo],
    ['unreal', unreal],
    ['rigify', rigify],
  ]) {
    const rig = humanoidRigFor(root);
    assert.deepEqual(rig.missing, [], `${label} missing ${rig.missing}`);
    assert.ok(rig.bones.handL.name.toLowerCase().includes('hand'), label);
  }
  assert.equal(humanoidRigFor(unreal).bones.upperChest.name, 'spine_03');
  assert.equal(humanoidRigFor(mixamo).bones.indexL1.name, 'mixamorigLeftHandIndex1');
});

test('a boneMap in glTF extras or a passed table names an unconventional rig', () => {
  const odd = skeleton(
    chain(
      'b0',
      ['b1', 'b2'],
      'b3',
      'b4',
      (s) => [`${s}a`, `${s}b`, `${s}c`],
      (s) => [`${s}d`, `${s}e`, `${s}f`],
      ['p', 'q'],
    ),
  );
  assert.ok(humanoidRigFor(odd).missing.length > 0);
  const table = {
    hips: 'b0',
    spine: 'b1',
    chest: 'b2',
    neck: 'b3',
    head: 'b4',
    upperArmL: 'pa',
    lowerArmL: 'pb',
    handL: 'pc',
    upperArmR: 'qa',
    lowerArmR: 'qb',
    handR: 'qc',
    upperLegL: 'pd',
    lowerLegL: 'pe',
    footL: 'pf',
    upperLegR: 'qd',
    lowerLegR: 'qe',
    footR: 'qf',
  };
  assert.deepEqual(humanoidRigFor(odd, table).missing, []);
  odd.children[0].userData.boneMap = table;
  const fromExtras = humanoidRigFor(odd);
  assert.deepEqual(fromExtras.missing, []);
  assert.equal(fromExtras.source.handL, 'extras');
  assert.ok(REQUIRED_CANONICAL.every((name) => fromExtras.bones[name]));
});

test('only the hand is needed to find the arm: structure fills the chain', () => {
  const root = skeleton([
    ['Hips', null],
    ['Spine', 'Hips'],
    ['Neck', 'Spine'],
    ['Head', 'Neck'],
    ['j1', 'Spine'],
    ['j2', 'j1'],
    ['hand.L', 'j2'],
  ]);
  const rig = humanoidRigFor(root);
  assert.equal(rig.bones.lowerArmL.name, 'j2');
  assert.equal(rig.bones.upperArmL.name, 'j1');
});

// ---- sockets, props and rig layers --------------------------------------------------------

test('the hand socket frame is orthonormal at the palm; its palm faces the body or the floor', () => {
  const hanging = handSocketFrame(THREE, {
    wrist: V(0.2, 0.86, 0),
    elbow: V(0.2, 1.1, 0),
    side: 'L',
  });
  const x = V();
  const y = V();
  const z = V();
  hanging.extractBasis(x, y, z);
  close(x.dot(y), 0);
  close(y.dot(z), 0);
  close(y.y, -1); // fingers down
  close(z.x, -1); // left palm toward the body
  const origin = V().setFromMatrixPosition(hanging);
  close(origin.y, 0.86 - 0.3 * 0.24, 1e-9);
  const tpose = handSocketFrame(THREE, {
    wrist: V(-0.6, 1.4, 0),
    elbow: V(-0.35, 1.4, 0),
    side: 'R',
  });
  tpose.extractBasis(x, y, z);
  close(z.y, -1); // palm down in a T-pose
});

function testFigure() {
  // A 1.7 m stick figure facing +Z with a skinned mesh, so bind matrices exist.
  const names = chain(
    'Hips',
    ['Spine', 'Spine1', 'Spine2'],
    'Neck',
    'Head',
    (s) => [`${s}Shoulder`, `${s}Arm`, `${s}ForeArm`, `${s}Hand`],
    (s) => [`${s}UpLeg`, `${s}Leg`, `${s}Foot`],
    ['Left', 'Right'],
  );
  const offsets = {
    Hips: [0, 0.93, 0],
    Spine: [0, 0.1, 0],
    Spine1: [0, 0.12, 0],
    Spine2: [0, 0.13, 0],
    Neck: [0, 0.14, 0],
    Head: [0, 0.1, 0],
    Shoulder: [0.03, 0.11, 0],
    Arm: [0.14, 0, 0],
    ForeArm: [0.03, -0.27, 0.01],
    Hand: [0.015, -0.24, -0.02],
    UpLeg: [0.09, 0, 0],
    Leg: [0.005, -0.43, 0],
    Foot: [0, -0.41, 0.02],
  };
  const root = new THREE.Group();
  const bones = [];
  const byName = {};
  for (const [name, parent] of names) {
    const bone = new THREE.Bone();
    bone.name = name;
    const side = name.startsWith('Left') ? 1 : name.startsWith('Right') ? -1 : 0;
    const o = offsets[name.replace(/^(Left|Right)/, '')];
    bone.position.set(o[0] * (side || 1), o[1], o[2]);
    (parent ? byName[parent] : root).add(bone);
    byName[name] = bone;
    bones.push(bone);
  }
  root.updateMatrixWorld(true);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    'position',
    new THREE.Float32BufferAttribute([0, 0, 0, 0, 1, 0, 1, 0, 0], 3),
  );
  geometry.setAttribute(
    'skinIndex',
    new THREE.Uint16BufferAttribute(
      Array.from({ length: 12 }, () => 0),
      4,
    ),
  );
  geometry.setAttribute(
    'skinWeight',
    new THREE.Float32BufferAttribute([1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0], 4),
  );
  const mesh = new THREE.SkinnedMesh(geometry, new THREE.MeshBasicMaterial());
  root.add(mesh);
  mesh.bind(new THREE.Skeleton(bones));
  return { root, byName };
}

test('props attach to hand sockets and move with the hand', () => {
  const { root, byName } = testFigure();
  const phone = new THREE.Mesh(new THREE.BoxGeometry(0.01, 0.07, 0.04));
  phone.name = 'phone';
  phone.userData = { prop: 'phone', hand: 'right' };
  root.add(phone);
  const rig = humanoidRigFor(root);
  assert.deepEqual(rig.missing, []);
  const sockets = createHandSockets(THREE, root, rig.bones);
  const props = attachProps(THREE, root, sockets);
  assert.equal(props.length, 1);
  assert.equal(phone.parent, sockets.R);
  assert.equal(sockets.R.parent, byName.RightHand);
  root.updateMatrixWorld(true);
  const palm = phone.getWorldPosition(V());
  const wrist = byName.RightHand.getWorldPosition(V());
  close(palm.distanceTo(wrist), 0.3 * byName.RightHand.position.length(), 1e-6);
  // Raise the forearm: the phone goes with the hand.
  byName.RightForeArm.rotation.x = -1.2;
  root.updateMatrixWorld(true);
  assert.ok(phone.getWorldPosition(V()).y > palm.y + 0.1);
});

test('planted feet stay put while the body sways over them', () => {
  const { root } = testFigure();
  const humanoid = humanoidRigFor(root);
  const rig = createCharacterRig(THREE, root, { bones: humanoid.bones, random: () => 0.5 });
  const foot = humanoid.bones.footL;
  let start = null;
  let worst = 0;
  for (let i = 0; i < 120; i++) {
    rig.resetPose();
    // An animation that slides the hips and swings the thigh.
    humanoid.bones.hips.position.x = Math.sin(i / 10) * 0.05;
    humanoid.bones.upperLegL.rotation.x = Math.sin(i / 7) * 0.1;
    root.updateMatrixWorld(true);
    rig.apply(1 / 30, { idle: 1, planted: true, groundY: 0 });
    root.updateMatrixWorld(true);
    const now = foot.getWorldPosition(V());
    // Where the foot was planted on the first frame (after the idle weight shift).
    start ??= now.clone();
    worst = Math.max(worst, Math.hypot(now.x - start.x, now.z - start.z));
  }
  assert.ok(worst < 0.01, `foot slid ${worst} m`);
});

test('look-at turns the head toward a target within its limits, and eases back', () => {
  const { root } = testFigure();
  const humanoid = humanoidRigFor(root);
  const rig = createCharacterRig(THREE, root, { bones: humanoid.bones, random: () => 0.5 });
  const head = humanoid.bones.head;
  const target = V(3, 1.6, 3); // 45 degrees to the character's left
  const forward = () => V(0, 0, 1).applyQuaternion(head.getWorldQuaternion(new THREE.Quaternion()));
  for (let i = 0; i < 90; i++) {
    rig.resetPose();
    root.updateMatrixWorld(true);
    rig.apply(1 / 30, { lookTarget: target, lookStrength: 1, breath: 0 });
  }
  const f = forward();
  close(Math.atan2(f.x, f.z), Math.PI / 4, 0.08);
  // Behind the character: clamped to the yaw limit, not twisted round.
  for (let i = 0; i < 90; i++) {
    rig.resetPose();
    root.updateMatrixWorld(true);
    rig.apply(1 / 30, { lookTarget: V(-0.2, 1.6, -3), lookStrength: 1, maxYaw: 1.2, breath: 0 });
  }
  assert.ok(Math.abs(Math.atan2(forward().x, forward().z)) <= 1.25);
  for (let i = 0; i < 120; i++) {
    rig.resetPose();
    root.updateMatrixWorld(true);
    rig.apply(1 / 30, { lookTarget: null, breath: 0 });
  }
  close(Math.atan2(forward().x, forward().z), 0, 0.05);
});
