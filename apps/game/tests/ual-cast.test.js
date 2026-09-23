import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import {
  RIGS,
  RIG_REST,
  UAL_CAST,
  UAL_GAITS,
  VRM_PARENT,
  envelopeWeight,
  reduceKeys,
  restCorrections,
  retarget,
} from '../../../asset-src/characters/vrm-cast/retarget.mjs';
import { heroClip, seatPhase, MOMIJI_CAST, VRM_CLIPS } from '../src/world/hero-cast.js';
import { createCharacterRig, createClipBlender, spring } from '../src/world/character-rig.js';
import { humanoidRigFor } from '../src/characters/humanoid-bones.js';
import {
  DIRECTED_INTENTS,
  GESTURE_INTENTS,
  INTENTS,
  createNpcMinds,
} from '../src/simulation/npc-minds.js';
import { normalizeEpisode } from '../src/drama/episode-schema.js';

const publicDir = new URL('../public/', import.meta.url);
const close = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) <= eps, `${a} != ${b}`);

// ---- the UAL bone map -------------------------------------------------------------------

test('the UAL rig map names every VRM humanoid bone the pipeline animates, once', () => {
  const mapped = Object.values(RIGS.ual);
  assert.equal(new Set(mapped).size, mapped.length, 'no VRM bone mapped twice');
  assert.deepEqual([...mapped].sort(), Object.keys(VRM_PARENT).sort());
  // UE mannequin names as they are in UAL1_Standard.glb and UAL2_Standard.glb.
  assert.equal(RIGS.ual.pelvis, 'hips');
  assert.equal(RIGS.ual.spine_03, 'upperChest');
  assert.equal(RIGS.ual.clavicle_r, 'rightShoulder');
  assert.equal(RIGS.ual.ball_l, 'leftToes');
  assert.equal(RIGS.ual.thumb_01_l, 'leftThumbMetacarpal');
  assert.equal(RIGS.ual.thumb_03_r, 'rightThumbDistal');
  assert.equal(RIGS.ual.pinky_02_l, 'leftLittleIntermediate');
  assert.equal(RIGS.ual.index_01_r, 'rightIndexProximal');
  // Root motion and leaf tips are not humanoid bones.
  for (const name of ['root', 'index_04_leaf_l', 'ball_leaf_r'])
    assert.equal(RIGS.ual[name], undefined);
  // Finger chains hang from the hand, knuckle outward.
  assert.equal(VRM_PARENT.leftIndexProximal, 'leftHand');
  assert.equal(VRM_PARENT.rightLittleDistal, 'rightLittleIntermediate');
  assert.equal(VRM_PARENT.leftThumbProximal, 'leftThumbMetacarpal');
});

test('a T-pose rest needs no correction; the arms-down Blender rest does', () => {
  assert.equal(RIG_REST.ual, 'identity');
  assert.equal(RIG_REST.momiji, 'direction');
  const order = ['hips', 'spine', 'leftUpperArm', 'leftLowerArm'];
  const present = new Set(order);
  const restPos = new Map([
    ['hips', new THREE.Vector3(0, 0.9, 0)],
    ['spine', new THREE.Vector3(0, 1.05, 0.03)],
    ['leftUpperArm', new THREE.Vector3(0.2, 1.4, 0)],
    ['leftLowerArm', new THREE.Vector3(0.2, 1.12, 0)],
  ]);
  for (const q of restCorrections(order, present, restPos, 'identity').values()) close(q.w, 1);
  // Arms down: the upper arm's correction turns +X (T-pose) to -Y (hanging).
  const arm = restCorrections(order, present, restPos, 'direction').get('leftUpperArm');
  const turned = new THREE.Vector3(1, 0, 0).applyQuaternion(arm);
  close(turned.y, -1, 1e-6);
});

/** A tiny UAL-named skeleton with one clip: the left arm swings down, the index curls. */
function ualFigure() {
  const bone = (name, parent, [x, y, z]) => {
    const b = new THREE.Bone();
    b.name = name;
    b.position.set(x, y, z);
    parent?.add(b);
    return b;
  };
  const pelvis = bone('pelvis', null, [0, 0.92, 0]);
  const spine = bone('spine_01', pelvis, [0, 0.13, 0]);
  const clavicle = bone('clavicle_l', spine, [0.02, 0.4, 0]);
  const upper = bone('upperarm_l', clavicle, [0.17, 0, 0]);
  const lower = bone('lowerarm_l', upper, [0.27, 0, 0]);
  const hand = bone('hand_l', lower, [0.27, 0, 0]);
  bone('index_01_l', hand, [0.12, 0, 0]);
  bone('thigh_l', pelvis, [0.09, 0, 0]);
  bone('foot_l', pelvis.getObjectByName('thigh_l'), [0, -0.83, 0]);
  const scene = new THREE.Group();
  scene.add(pelvis);
  const down = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), -Math.PI / 2);
  const curl = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), -0.8);
  const clip = new THREE.AnimationClip('Test_Loop', 1, [
    new THREE.QuaternionKeyframeTrack(
      'upperarm_l.quaternion',
      [0, 1],
      [0, 0, 0, 1, ...down.toArray()],
    ),
    new THREE.QuaternionKeyframeTrack(
      'index_01_l.quaternion',
      [0, 1],
      [0, 0, 0, 1, ...curl.toArray()],
    ),
  ]);
  return { scene, animations: [clip], down, curl };
}

test('retargeting a UAL-named rig gives normalized rotations, fingers included', () => {
  const { scene, animations, down, curl } = ualFigure();
  const result = retarget({ scene, animations }, RIGS.ual, { rest: 'identity' });
  const clip = result.clips[0];
  const last = clip.times.length - 1;
  const at = (bone, f) => new THREE.Quaternion().fromArray(clip.rotations[bone], f * 4);
  // Frame 0 is the rest: identity everywhere.
  for (const bone of result.order) close(Math.abs(at(bone, 0).w), 1, 1e-6);
  // Last frame: the upper arm carries the swing, the forearm none (it moved with its parent).
  close(Math.abs(at('leftUpperArm', last).dot(down)), 1, 1e-5);
  close(Math.abs(at('leftLowerArm', last).w), 1, 1e-5);
  close(Math.abs(at('leftIndexProximal', last).dot(curl)), 1, 1e-5);
  // 30 fps resampling.
  assert.equal(clip.times.length, 31);
  assert.ok(result.order.includes('leftIndexProximal'));
});

// ---- the hero-cast clip names -----------------------------------------------------------

const CAST = Object.fromEntries(UAL_CAST.map((entry) => [entry.name, entry]));

test('every clip the hero cast asks for comes from a named UAL clip', () => {
  const asked = new Set(['walk', 'hurry', 'sit', 'sit-enter', 'sit-exit', 'board', 'idle']);
  for (const intent of [...INTENTS, ...GESTURE_INTENTS]) asked.add(heroClip({ intent }).clip);
  for (const member of MOMIJI_CAST) {
    for (const name of Object.values(member.clipVariants ?? {})) asked.add(name);
    for (const [key, name] of Object.entries(member.carry ?? {}))
      if (key !== 'prop') asked.add(name);
  }
  for (const name of asked) assert.ok(CAST[name], `${name} has no UAL source`);
  // The mapping the cast relies on.
  const source = (name) => `${CAST[name].pack}/${CAST[name].clip}`;
  assert.equal(source('idle'), 'UAL1/Idle_Loop');
  assert.equal(source('chat'), 'UAL1/Idle_Talking_Loop');
  assert.equal(source('walk'), 'UAL1/Walk_Loop');
  assert.equal(source('walk-formal'), 'UAL1/Walk_Formal_Loop');
  assert.equal(source('sit'), 'UAL1/Sitting_Idle_Loop');
  assert.equal(source('check-phone'), 'UAL2/Idle_TalkingPhone_Loop');
  assert.equal(source('watch-train'), 'UAL2/Idle_FoldArms_Loop');
  assert.equal(CAST.shelter.alias, 'watch-train');
  assert.equal(CAST['walk-carry'].splice.clip, 'Walk_Carry_Loop');
  assert.equal(CAST.hurry.splice.clip, 'Jog_Fwd_Loop');
  assert.equal(CAST.wave.splice.clip, 'Idle_Rail_Call');
  assert.equal(CAST['sit-enter'].loop, false);
  assert.equal(CAST.board.loop, false);
  assert.deepEqual([...UAL_GAITS].sort(), ['hurry', 'walk', 'walk-carry', 'walk-formal']);
  // Sato walks formally; Riko carries her radio.
  assert.equal(MOMIJI_CAST[0].clipVariants.walk, 'walk-formal');
  assert.equal(MOMIJI_CAST[1].carry.walk, 'walk-carry');
});

test('the committed clip file holds exactly the UAL cast set', () => {
  const bytes = readFileSync(new URL(VRM_CLIPS, publicDir));
  const length = bytes.readUInt32LE(12);
  const json = JSON.parse(bytes.subarray(20, 20 + length).toString('utf8'));
  const names = UAL_CAST.filter((e) => !e.alias).map((e) => e.name);
  assert.deepEqual(
    json.animations.map((a) => a.name),
    names,
  );
  for (const animation of json.animations)
    assert.equal(animation.extras.loop, CAST[animation.name].loop ?? true, animation.name);
});

test('key reduction keeps corners and drops keys a straight line explains', () => {
  const times = Float32Array.from({ length: 11 }, (_v, i) => i / 10);
  // A straight line in 3D: only the ends are needed.
  const line = Float32Array.from({ length: 33 }, (_v, i) => (i % 3 === 0 ? i / 3 / 10 : 0));
  assert.deepEqual(reduceKeys(times, line, 3, 0.001), [0, 10]);
  // A corner at key 5 is kept.
  const corner = Float32Array.from({ length: 33 }, (_v, i) => {
    const k = Math.floor(i / 3);
    return i % 3 === 1 ? Math.min(k, 10 - k) / 10 : 0;
  });
  assert.deepEqual(reduceKeys(times, corner, 3, 0.001), [0, 5, 10]);
  // Quaternions: a steady spin about one axis reduces to its ends (slerp is exact).
  const spin = new Float32Array(44);
  for (let i = 0; i < 11; i++)
    new THREE.Quaternion()
      .setFromAxisAngle(new THREE.Vector3(0, 1, 0), i * 0.1)
      .toArray(spin, i * 4);
  assert.deepEqual(reduceKeys(times, spin, 4, 0.001), [0, 10]);
  // Envelopes ease in and out and are zero outside.
  assert.equal(envelopeWeight(0, [0.2, 0.5, 1, 1.3]), 0);
  assert.equal(envelopeWeight(0.7, [0.2, 0.5, 1, 1.3]), 1);
  close(envelopeWeight(0.35, [0.2, 0.5, 1, 1.3]), 0.5, 1e-9);
});

// ---- playback: transitions, holds and layers --------------------------------------------

test('sitting down and standing up go through their one-shots', () => {
  const has = { hasTransitions: true };
  assert.equal(seatPhase('none', { seated: true, ...has }), 'enter');
  assert.equal(seatPhase('enter', { seated: true, ...has }), 'enter');
  assert.equal(seatPhase('enter', { seated: true, clipDone: true, ...has }), 'seated');
  assert.equal(seatPhase('seated', { seated: false, ...has }), 'exit');
  assert.equal(seatPhase('exit', { seated: false, clipDone: true, ...has }), 'none');
  // A jump (Places, first frame) and rigs without the clips skip the transitions.
  assert.equal(seatPhase('none', { seated: true, jumped: true, ...has }), 'seated');
  assert.equal(seatPhase('none', { seated: true, hasTransitions: false }), 'seated');
  assert.equal(seatPhase('seated', { seated: false, hasTransitions: false }), 'none');
});

function clipRig() {
  const root = new THREE.Group();
  const bones = ['a', 'b', 'c'].map((name) => {
    const bone = new THREE.Object3D();
    bone.name = name;
    root.add(bone);
    return bone;
  });
  const q = (angle) =>
    new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), angle).toArray();
  const clip = (name, angle) =>
    new THREE.AnimationClip(name, 1, [
      new THREE.QuaternionKeyframeTrack('a.quaternion', [0], q(angle)),
      new THREE.QuaternionKeyframeTrack('b.quaternion', [0], q(-angle)),
    ]);
  const mixer = new THREE.AnimationMixer(root);
  const actions = new Map(
    ['idle', 'walk', 'wave'].map((name, i) => [name, mixer.clipAction(clip(name, i * 0.5))]),
  );
  return { root, bones, mixer, actions };
}

test('cross-fades sum to one and a change of mind mid-fade carries on smoothly', () => {
  const { mixer, actions } = clipRig();
  const blender = createClipBlender(THREE, mixer, actions, { random: () => 0 });
  blender.play('idle');
  blender.update(1 / 60);
  const walk = actions.get('walk');
  const trace = [];
  for (let f = 0; f < 90; f++) {
    // Walk, then back to idle 0.2 s in, then walk again 0.2 s later.
    blender.play(f < 12 || f >= 24 ? 'walk' : 'idle');
    blender.update(1 / 60);
    const sum = blender.weights().reduce((a, b) => a + b, 0);
    close(sum, 1, 1e-9);
    trace.push(walk.getEffectiveWeight());
  }
  // No kick: the weight's speed changes by at most the spring's own pull in a frame
  // (omega^2 dt^2 for the 0.4 s idle-walk fade), including at the two changes of mind,
  // where a restarted ease would stop it dead.
  const pull = (4.7 / 0.4) ** 2 / 3600;
  for (let f = 2; f < trace.length; f++) {
    const change = Math.abs(trace[f] - 2 * trace[f - 1] + trace[f - 2]);
    assert.ok(change <= pull * 1.05, `frame ${f}: ${change}`);
  }
  close(trace.at(-1), 1, 0.02);
  // The same clip asked for again does not restart it.
  const time = walk.time;
  blender.play('walk');
  assert.equal(walk.time, time);
});

test('the rig restores the clips’ own pose, so a still clip bone is never left at rest', () => {
  const { root, bones, mixer, actions } = clipRig();
  const rig = createCharacterRig(THREE, root, {
    bones: { hips: bones[0], spine: bones[1], neck: bones[2] },
    random: () => 0.5,
  });
  const blender = createClipBlender(THREE, mixer, actions, { random: () => 0 });
  const expected = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), 0.5);
  for (let f = 0; f < 90; f++) {
    rig.resetPose();
    blender.play('walk');
    blender.update(1 / 30);
    rig.apply(1 / 30, {
      layers: { life: false, look: false, hands: false, grip: false, feet: false },
    });
  }
  // The walk clip holds `a` at 0.5 rad with a single key; three.js stops writing it once the
  // mix settles, so a reset to the rest pose would leave it at identity.
  close(Math.abs(bones[0].quaternion.dot(expected)), 1, 1e-6);
});

test('critically damped springs reach their target without overshoot', () => {
  const state = { x: 0, v: 0 };
  let max = 0;
  for (let i = 0; i < 120; i++) max = Math.max(max, spring(state, 1, 8, 1 / 60));
  assert.ok(max <= 1 + 1e-9);
  close(state.x, 1, 1e-3);
  // Frame-rate independent: 30 and 120 fps agree after one second.
  const a = { x: 0, v: 0 };
  const b = { x: 0, v: 0 };
  for (let i = 0; i < 30; i++) spring(a, 1, 5, 1 / 30);
  for (let i = 0; i < 120; i++) spring(b, 1, 5, 1 / 120);
  close(a.x, b.x, 1e-6);
});

test('a still rig with every layer on stays within the clip pose', () => {
  const figure = new THREE.Group();
  const names = ['Hips', 'Spine', 'Neck', 'Head'];
  let parent = figure;
  for (const name of names) {
    const bone = new THREE.Bone();
    bone.name = name;
    bone.position.set(0, name === 'Hips' ? 0.9 : 0.2, 0);
    parent.add(bone);
    parent = bone;
  }
  const humanoid = humanoidRigFor(figure);
  const rig = createCharacterRig(THREE, figure, { bones: humanoid.bones, random: () => 0.5 });
  // No look target and no idle: breathing only, a fraction of a degree.
  for (let i = 0; i < 60; i++) {
    rig.resetPose();
    figure.updateMatrixWorld(true);
    rig.apply(1 / 30, { idle: 0, breath: 1 });
  }
  const head = humanoid.bones.head;
  assert.ok(2 * Math.acos(Math.min(1, Math.abs(head.quaternion.w))) < 0.02);
});

// ---- directed gestures ------------------------------------------------------------------

test('nod, head shake and eating are acting notes only, validated end to end', () => {
  assert.deepEqual(GESTURE_INTENTS, ['nod-yes', 'shake-no', 'eat']);
  for (const intent of GESTURE_INTENTS) {
    assert.ok(DIRECTED_INTENTS.includes(intent));
    assert.ok(!INTENTS.includes(intent), `${intent} is not a local or Jev choice`);
    assert.equal(heroClip({ intent }).clip, intent);
  }
  const minds = createNpcMinds({ seed: 3 });
  minds.sense('p-0', 'office commuter', 0, 0, false, true, true, 'waiting');
  minds.tick(0.1, { weather: 'clear', dusk: false, region: 'station', trainSpeed: 0 });
  minds.setDirective('p-0', { intent: 'nod-yes', holdSeconds: 5 });
  assert.equal(minds.expressionFor('p-0').intent, 'nod-yes');
  // Jev only ever hears about its own vocabulary.
  const batch = minds.buildJevBatch({ camera: { x: 0, z: 0 } });
  for (const entity of batch?.entities ?? []) assert.ok(INTENTS.includes(entity.intent));
  assert.throws(() => minds.setDirective('p-0', { intent: 'dance', holdSeconds: 5 }), TypeError);
  // Episodes accept them in `direct` cues.
  const episode = normalizeEpisode(
    {
      id: 'nod',
      title: 'Nod',
      cast: { a: { name: 'A' } },
      scenes: [
        {
          id: 's1',
          heading: 'EXT. MOMIJI',
          stopAt: 'momiji',
          actors: { a: 'commuter-1' },
          beats: [
            {
              shot: { type: 'portrait', subject: { cast: 'a' } },
              dialogue: [{ cast: 'a', text: 'Yes.' }],
              cues: [{ after: 0, direct: { cast: 'a', intent: 'nod-yes' } }],
            },
          ],
        },
      ],
    },
    { stops: ['momiji'], crossings: [], entities: ['commuter-1'] },
  );
  assert.equal(episode.scenes[0].beats[0].cues[0].direct.intent, 'nod-yes');
});
