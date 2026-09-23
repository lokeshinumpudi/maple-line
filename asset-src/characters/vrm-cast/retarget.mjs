/**
 * Offline retarget: humanoid clips from a glTF rig -> one VRM Animation (.vrma) file.
 *
 * The output holds every clip as its own glTF animation on a rest skeleton whose rotations
 * are all identity, so each track is already a VRM normalized-bone rotation.
 * @pixiv/three-vrm-animation turns it into clips for any VRM at load time, scaling hips
 * motion by the target's hips height. Runtime does no retargeting maths.
 *
 * Per bone b with source rest world rotation R and posed world rotation W, the world delta
 * is D = W R^-1. The normalized local rotation is (D_p A_p)^-1 (D_b A_b), with p the nearest
 * mapped humanoid parent and A a rest correction:
 *
 * - `direction` (the Blender cast, whose rest has the arms down): A is the shortest rotation
 *   from the VRM T-pose direction of b to the source rest direction. A bone with no mapped
 *   child inherits its parent's A.
 * - `identity` (Quaternius UAL, whose rest is already a T-pose): A = I. The source's rest
 *   body counts as the VRM's rest body, so the mannequin's curved spine and swept-back
 *   clavicles do not bend an upright VRM.
 *
 * Gait is stored per unit of hips height in the scene extras, so the game can scale it to
 * each character's leg length. For UAL the walking speed comes from the root-motion (_RM)
 * file, which moves the `root` bone by the distance the feet cover.
 *
 *   node asset-src/characters/vrm-cast/retarget.mjs                 # the UAL cast clip set
 *   node asset-src/characters/vrm-cast/retarget.mjs --ual <folder>  # UAL somewhere else
 *   node asset-src/characters/vrm-cast/retarget.mjs --rig momiji --source <glb> --out <vrma>
 *
 * The UAL folder holds the two unzipped Standard packs. It defaults to $MAPLE_UAL_DIR, then
 * ~/Downloads/maple-assets/quaternius. Library files are never copied into the repository.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative } from 'node:path';
import { THREE, loadGlb } from '../../lib/three-node.mjs';
import { encodeGlb, round } from '../../lib/glb.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..', '..', '..');

const SIDES = ['left', 'right'];
const FINGER_SEGMENTS = {
  Thumb: ['Metacarpal', 'Proximal', 'Distal'],
  Index: ['Proximal', 'Intermediate', 'Distal'],
  Middle: ['Proximal', 'Intermediate', 'Distal'],
  Ring: ['Proximal', 'Intermediate', 'Distal'],
  Little: ['Proximal', 'Intermediate', 'Distal'],
};

/** VRM finger bones of one side, knuckle outward, with their humanoid parents. */
function fingerParents(side) {
  const out = {};
  for (const [finger, segments] of Object.entries(FINGER_SEGMENTS))
    segments.forEach((segment, i) => {
      out[`${side}${finger}${segment}`] =
        i === 0 ? `${side}Hand` : `${side}${finger}${segments[i - 1]}`;
    });
  return out;
}

/** VRM humanoid parent of each bone this pipeline animates. */
export const VRM_PARENT = {
  hips: null,
  spine: 'hips',
  chest: 'spine',
  upperChest: 'chest',
  neck: 'upperChest',
  head: 'neck',
  leftShoulder: 'upperChest',
  leftUpperArm: 'leftShoulder',
  leftLowerArm: 'leftUpperArm',
  leftHand: 'leftLowerArm',
  rightShoulder: 'upperChest',
  rightUpperArm: 'rightShoulder',
  rightLowerArm: 'rightUpperArm',
  rightHand: 'rightLowerArm',
  leftUpperLeg: 'hips',
  leftLowerLeg: 'leftUpperLeg',
  leftFoot: 'leftLowerLeg',
  leftToes: 'leftFoot',
  rightUpperLeg: 'hips',
  rightLowerLeg: 'rightUpperLeg',
  rightFoot: 'rightLowerLeg',
  rightToes: 'rightFoot',
  ...fingerParents('left'),
  ...fingerParents('right'),
};

/** Direction from each bone to its child in the VRM 1.0 T-pose (three.js axes, facing +Z). */
const TPOSE = {
  hips: [0, 1, 0],
  spine: [0, 1, 0],
  chest: [0, 1, 0],
  upperChest: [0, 1, 0],
  neck: [0, 1, 0],
  leftShoulder: [1, 0, 0],
  leftUpperArm: [1, 0, 0],
  leftLowerArm: [1, 0, 0],
  rightShoulder: [-1, 0, 0],
  rightUpperArm: [-1, 0, 0],
  rightLowerArm: [-1, 0, 0],
  leftUpperLeg: [0, -1, 0],
  leftLowerLeg: [0, -1, 0],
  leftFoot: [0, -0.45, 0.89],
  rightUpperLeg: [0, -1, 0],
  rightLowerLeg: [0, -1, 0],
  rightFoot: [0, -0.45, 0.89],
};

/** UAL finger joint names: thumb_01_l .. pinky_03_r. */
function ualFingers() {
  const names = { Thumb: 'thumb', Index: 'index', Middle: 'middle', Ring: 'ring', Little: 'pinky' };
  const out = {};
  for (const side of SIDES)
    for (const [finger, segments] of Object.entries(FINGER_SEGMENTS))
      segments.forEach((segment, i) => {
        out[`${names[finger]}_0${i + 1}_${side[0]}`] = `${side}${finger}${segment}`;
      });
  return out;
}

/** Source bone names per rig. `momiji` is the Blender cast rig (Mixamo-style names). */
export const RIGS = {
  momiji: {
    Hips: 'hips',
    Spine: 'spine',
    Spine1: 'chest',
    Spine2: 'upperChest',
    Neck: 'neck',
    Head: 'head',
    LeftShoulder: 'leftShoulder',
    LeftArm: 'leftUpperArm',
    LeftForeArm: 'leftLowerArm',
    LeftHand: 'leftHand',
    RightShoulder: 'rightShoulder',
    RightArm: 'rightUpperArm',
    RightForeArm: 'rightLowerArm',
    RightHand: 'rightHand',
    LeftUpLeg: 'leftUpperLeg',
    LeftLeg: 'leftLowerLeg',
    LeftFoot: 'leftFoot',
    LeftToeBase: 'leftToes',
    RightUpLeg: 'rightUpperLeg',
    RightLeg: 'rightLowerLeg',
    RightFoot: 'rightFoot',
    RightToeBase: 'rightToes',
  },
  // Quaternius Universal Animation Library 1 and 2 (UE mannequin names, checked against
  // UAL1_Standard.glb and UAL2_Standard.glb). `root` carries root motion in the _RM files;
  // the `*_leaf_*` tip joints and `root` itself are not humanoid bones and are dropped.
  ual: {
    pelvis: 'hips',
    spine_01: 'spine',
    spine_02: 'chest',
    spine_03: 'upperChest',
    neck_01: 'neck',
    Head: 'head',
    clavicle_l: 'leftShoulder',
    upperarm_l: 'leftUpperArm',
    lowerarm_l: 'leftLowerArm',
    hand_l: 'leftHand',
    clavicle_r: 'rightShoulder',
    upperarm_r: 'rightUpperArm',
    lowerarm_r: 'rightLowerArm',
    hand_r: 'rightHand',
    thigh_l: 'leftUpperLeg',
    calf_l: 'leftLowerLeg',
    foot_l: 'leftFoot',
    ball_l: 'leftToes',
    thigh_r: 'rightUpperLeg',
    calf_r: 'rightLowerLeg',
    foot_r: 'rightFoot',
    ball_r: 'rightToes',
    ...ualFingers(),
  },
};

/** How each rig's rest pose relates to the VRM T-pose (see the header). */
export const RIG_REST = { momiji: 'direction', ual: 'identity' };

const FPS = 30;

/** Right arm chain, and both arms, for clips spliced from two sources. */
const ARM = (side) => [
  `${side}Shoulder`,
  `${side}UpperArm`,
  `${side}LowerArm`,
  `${side}Hand`,
  ...Object.keys(fingerParents(side)),
];

/**
 * The hero-cast clip set, from Quaternius UAL 1 and 2. `name` is what the game plays;
 * `pack` and `clip` name the source. `loop: false` marks a one-shot. `speed` plays the source
 * faster (a quicker cadence; measured speeds scale with it). `splice` lays some bones of
 * another UAL clip over the base clip (local rotations), at `weight`, in step (`phase`) or
 * faded by `envelope` (seconds: in-start, in-end, out-start, out-end). `wave` adds a forearm
 * swing about the facing axis.
 * `alias` clips share another clip's animation in the game (no bytes in the file).
 */
export const UAL_CAST = Object.freeze([
  { name: 'idle', pack: 'UAL1', clip: 'Idle_Loop' },
  { name: 'chat', pack: 'UAL1', clip: 'Idle_Talking_Loop' },
  { name: 'walk', pack: 'UAL1', clip: 'Walk_Loop' },
  { name: 'walk-formal', pack: 'UAL1', clip: 'Walk_Formal_Loop' },
  // Walk_Carry_Loop itself is a slow, heavy trudge (0.65 m/s); its arms, held in front with
  // no swing, go over the ordinary walk so a carried radio does not slow the legs.
  {
    name: 'walk-carry',
    pack: 'UAL1',
    clip: 'Walk_Loop',
    // Fingers stay the walk's relaxed ones; the hand holding the radio closes on it (grip layer).
    splice: {
      pack: 'UAL2',
      clip: 'Walk_Carry_Loop',
      bones: [...ARM('left'), ...ARM('right')],
      phase: true,
      fingers: false,
    },
  },
  // Jog_Fwd_Loop is a 5.4 m/s run. Hurrying people walk fast: the walk at 1.4 times its
  // cadence, with half of the jog's forward lean and arm drive laid over it in step.
  {
    name: 'hurry',
    pack: 'UAL1',
    clip: 'Walk_Loop',
    speed: 1.4,
    splice: {
      pack: 'UAL1',
      clip: 'Jog_Fwd_Loop',
      bones: ['spine', 'chest', 'upperChest', ...ARM('left'), ...ARM('right')],
      weight: 0.5,
      phase: true,
    },
  },
  { name: 'sit', pack: 'UAL1', clip: 'Sitting_Idle_Loop' },
  { name: 'sit-enter', pack: 'UAL1', clip: 'Sitting_Enter', loop: false },
  { name: 'sit-exit', pack: 'UAL1', clip: 'Sitting_Exit', loop: false },
  { name: 'check-phone', pack: 'UAL2', clip: 'Idle_TalkingPhone_Loop' },
  { name: 'watch-train', pack: 'UAL2', clip: 'Idle_FoldArms_Loop' },
  { name: 'shelter', alias: 'watch-train' },
  // Reaching for the door button as the doors are reached.
  { name: 'board', pack: 'UAL1', clip: 'Interact', loop: false },
  // UAL has no wave: the calling arm of Idle_Rail_Call over an upright idle, swung.
  {
    name: 'wave',
    pack: 'UAL1',
    clip: 'Idle_Loop',
    splice: { pack: 'UAL2', clip: 'Idle_Rail_Call', bones: ARM('right'), fingers: false },
    envelope: [0, 0.35, 2.15, 2.5],
    wave: { side: 'right', amplitude: 0.42, hertz: 2 },
  },
  // Arms overhead from Pistol_Aim_Up (hands together) over the idle: a stretch.
  {
    name: 'stretch',
    pack: 'UAL1',
    clip: 'Idle_Loop',
    seconds: 4,
    splice: {
      pack: 'UAL1',
      clip: 'Pistol_Aim_Up',
      bones: [...ARM('left'), ...ARM('right')],
      fingers: false,
    },
    envelope: [0.3, 1.2, 2.8, 3.7],
  },
  // Directed gestures (episode `direct` intents).
  { name: 'nod-yes', pack: 'UAL2', clip: 'Yes' },
  { name: 'shake-no', pack: 'UAL2', clip: 'Idle_No_Loop' },
  { name: 'eat', pack: 'UAL2', clip: 'Consume' },
]);

/** Locomotion clips whose speed is measured from the root-motion file. */
export const UAL_GAITS = Object.freeze(['walk', 'walk-formal', 'walk-carry', 'hurry']);

export function mappedParent(bone, present) {
  let parent = VRM_PARENT[bone];
  while (parent && !present.has(parent)) parent = VRM_PARENT[parent];
  return parent ?? null;
}

/** Map a scene's nodes to VRM bones with a rig table. */
export function mapBones(scene, rigMap) {
  const source = new Map();
  scene.traverse((node) => {
    const bone = rigMap[node.name];
    if (bone && !source.has(bone)) source.set(bone, node);
  });
  return source;
}

/**
 * Retarget clips of a loaded source glTF. Returns { rest, clips, gait, order } where rest
 * maps VRM bone -> world position and clips are { name, duration, loop, times,
 * rotations: {bone: Float32Array}, hips: Float32Array }. `only` limits the clips read.
 */
export function retarget(
  gltf,
  rigMap,
  { loops = {}, rename = {}, only = null, rest: restMode = 'direction' } = {},
) {
  const scene = gltf.scene;
  scene.updateMatrixWorld(true);
  const source = mapBones(scene, rigMap);
  if (!source.has('hips')) throw new Error('source rig has no hips bone');
  const present = new Set(source.keys());
  const order = Object.keys(VRM_PARENT).filter((bone) => present.has(bone));

  const restRot = new Map();
  const restPos = new Map();
  for (const bone of order) {
    const node = source.get(bone);
    restRot.set(bone, node.getWorldQuaternion(new THREE.Quaternion()));
    restPos.set(bone, node.getWorldPosition(new THREE.Vector3()));
  }
  const correction = restCorrections(order, present, restPos, restMode);

  const mixer = new THREE.AnimationMixer(scene);
  const clips = [];
  const q = new THREE.Quaternion();
  const world = new Map();
  const hipsRestHeight = restPos.get('hips').y;
  const gait = {};
  for (const clip of gltf.animations) {
    if (only && !only.includes(clip.name)) continue;
    const name = rename[clip.name] ?? clip.name;
    const frames = Math.max(1, Math.round(clip.duration * FPS));
    const times = new Float32Array(frames + 1);
    const rotations = Object.fromEntries(
      order.map((bone) => [bone, new Float32Array((frames + 1) * 4)]),
    );
    const hips = new Float32Array((frames + 1) * 3);
    const feet = { left: [], right: [] };
    mixer.stopAllAction();
    const action = mixer.clipAction(clip);
    // Play once and hold, so sampling at the clip's end reads the last pose, not the first.
    action.setLoop(THREE.LoopOnce, 1);
    action.clampWhenFinished = true;
    action.reset().play();
    for (let f = 0; f <= frames; f++) {
      const t = Math.min(clip.duration, f / FPS);
      times[f] = t;
      mixer.setTime(t);
      scene.updateMatrixWorld(true);
      for (const bone of order) {
        const posed = source.get(bone).getWorldQuaternion(new THREE.Quaternion());
        const delta = posed.multiply(restRot.get(bone).clone().invert());
        world.set(bone, delta.multiply(correction.get(bone)));
      }
      for (const bone of order) {
        const parent = mappedParent(bone, present);
        q.copy(world.get(bone));
        if (parent) q.premultiply(world.get(parent).clone().invert());
        writeQuat(rotations[bone], f, q);
      }
      const hipsPos = source.get('hips').getWorldPosition(new THREE.Vector3());
      hips.set([hipsPos.x, hipsPos.y, hipsPos.z], f * 3);
      for (const side of ['left', 'right']) {
        const foot = source.get(`${side}Foot`);
        if (foot) feet[side].push(foot.getWorldPosition(new THREE.Vector3()));
      }
    }
    action.stop();
    mixer.uncacheAction(clip);
    const loop = loops[name] ?? true;
    clips.push({ name, duration: times[frames], loop, times, rotations, hips });
    if (feet.left.length) {
      gait[name] = {
        footSpeedPerHipsHeight: round(stanceSpeed(feet.left, hipsRestHeight) / hipsRestHeight, 4),
        hipsDropPerHipsHeight: round((hipsRestHeight - minY(hips)) / hipsRestHeight, 4),
      };
    }
  }
  const rest = Object.fromEntries(
    order.map((bone) => [
      bone,
      restPos
        .get(bone)
        .toArray()
        .map((v) => round(v, 5)),
    ]),
  );
  return { rest, clips, gait, hipsRestHeight: round(hipsRestHeight, 5), order };
}

/** Rest correction per bone (see the header). */
export function restCorrections(order, present, restPos, mode = 'direction') {
  const correction = new Map();
  for (const bone of order) {
    if (mode === 'identity') {
      correction.set(bone, new THREE.Quaternion());
      continue;
    }
    const child = order.find((other) => mappedParent(other, present) === bone && TPOSE[bone]);
    const preferred = {
      hips: 'spine',
      upperChest: 'neck',
      leftUpperLeg: 'leftLowerLeg',
      rightUpperLeg: 'rightLowerLeg',
    }[bone];
    const target = preferred && present.has(preferred) ? preferred : child;
    if (TPOSE[bone] && target) {
      const actual = restPos.get(target).clone().sub(restPos.get(bone)).normalize();
      const canonical = new THREE.Vector3(...TPOSE[bone]).normalize();
      correction.set(bone, new THREE.Quaternion().setFromUnitVectors(canonical, actual));
    } else {
      const parent = mappedParent(bone, present);
      correction.set(bone, parent ? correction.get(parent).clone() : new THREE.Quaternion());
    }
  }
  return correction;
}

/** Store q at frame f, kept in the previous frame's hemisphere so interpolation is short. */
function writeQuat(out, f, q) {
  let { x, y, z, w } = q;
  if (f > 0) {
    const dot = out[(f - 1) * 4] * x + out[(f - 1) * 4 + 1] * y + out[(f - 1) * 4 + 2] * z;
    if (dot + out[(f - 1) * 4 + 3] * w < 0) [x, y, z, w] = [-x, -y, -z, -w];
  }
  out.set([x, y, z, w], f * 4);
}

function minY(hips) {
  let lowest = Infinity;
  for (let i = 1; i < hips.length; i += 3) lowest = Math.min(lowest, hips[i]);
  return lowest;
}

/** Backward speed (m/s, along -Z) of a foot during its longest planted run. */
export function stanceSpeed(positions, scale = 1) {
  const lowest = Math.min(...positions.map((p) => p.y));
  const stance = positions
    .map((p, i) => (p.y < lowest + 0.012 * scale ? i : -1))
    .filter((i) => i >= 0);
  if (stance.length < 2) return 0;
  let best = [stance[0]];
  let run = [stance[0]];
  for (const i of stance.slice(1)) {
    if (i === run[run.length - 1] + 1) run.push(i);
    else run = [i];
    if (run.length > best.length) best = run.slice();
  }
  const a = positions[best[0]];
  const b = positions[best[best.length - 1]];
  const seconds = (best[best.length - 1] - best[0]) / FPS;
  return seconds > 0 ? (a.z - b.z) / seconds : 0;
}

/** Ground speed (m/s) of a root-motion clip: the `root` bone's travel over the clip. */
export function rootMotionSpeed(gltf, clipName, rootName = 'root') {
  const clip = gltf.animations.find((c) => c.name === clipName);
  const node = gltf.scene.getObjectByName(rootName);
  if (!clip || !node) return 0;
  const mixer = new THREE.AnimationMixer(gltf.scene);
  const action = mixer.clipAction(clip);
  action.setLoop(THREE.LoopOnce, 1);
  action.clampWhenFinished = true;
  action.reset().play();
  const at = (t) => {
    mixer.setTime(t);
    gltf.scene.updateMatrixWorld(true);
    return node.getWorldPosition(new THREE.Vector3());
  };
  const start = at(0);
  const end = at(clip.duration);
  action.stop();
  mixer.uncacheAction(clip);
  return Math.hypot(end.x - start.x, end.z - start.z) / clip.duration;
}

/**
 * Seat height of a sitting pose: the lowest point of the skinned body within 12 cm of the
 * pelvis in depth and 20 cm to either side (the buttocks and thighs on the seat). Also the
 * pelvis position, whose depth says how far behind the figure origin the seat is.
 */
export function measureSeat(gltf, clipName) {
  const clip = gltf.animations.find((c) => c.name === clipName);
  const scene = gltf.scene;
  const mixer = new THREE.AnimationMixer(scene);
  const action = mixer.clipAction(clip);
  action.reset().play();
  mixer.setTime(0);
  scene.updateMatrixWorld(true);
  const pelvis = scene.getObjectByName('pelvis').getWorldPosition(new THREE.Vector3());
  let seat = Infinity;
  const v = new THREE.Vector3();
  scene.traverse((mesh) => {
    if (!mesh.isSkinnedMesh) return;
    const count = mesh.geometry.attributes.position.count;
    for (let i = 0; i < count; i++) {
      mesh.getVertexPosition(i, v);
      v.applyMatrix4(mesh.matrixWorld);
      if (Math.abs(v.z - pelvis.z) < 0.12 && Math.abs(v.x) < 0.2) seat = Math.min(seat, v.y);
    }
  });
  action.stop();
  return { seat, pelvis };
}

// ---- clip editing on retargeted (normalized local) rotations ------------------------------

const qa = new THREE.Quaternion();
const qb = new THREE.Quaternion();

function readQuat(array, f, target) {
  return target.fromArray(array, f * 4);
}

/** Fractional frame of a clip at time t: wrapped for loops, held at the end otherwise. */
function frameAt(clip, t, wrap = clip.loop) {
  const local = wrap ? ((t % clip.duration) + clip.duration) % clip.duration : t;
  return Math.min(clip.times.length - 1, Math.max(0, local * FPS));
}

/** A bone's rotation at a fractional frame (slerp between the neighbouring keys). */
function sampleQuat(values, frame, target) {
  const last = values.length / 4 - 1;
  const a = Math.min(last, Math.floor(frame));
  const b = Math.min(last, a + 1);
  return target.fromArray(values, a * 4).slerp(qb.fromArray(values, b * 4), frame - a);
}

function sampleVec(values, frame, target) {
  const last = values.length / 3 - 1;
  const a = Math.min(last, Math.floor(frame));
  const b = Math.min(last, a + 1);
  const u = frame - a;
  for (let c = 0; c < 3; c++) target[c] = values[a * 3 + c] + (values[b * 3 + c] - values[a * 3 + c]) * u;
  return target;
}

/**
 * Resample a retargeted clip to `seconds` of output, reading the source `speed` times as
 * fast (a faster cadence for speed > 1). Loops wrap; one-shots hold their last frame.
 */
export function resample(clip, seconds, { speed = 1, wrap = clip.loop } = {}) {
  const frames = Math.round(seconds * FPS);
  const times = new Float32Array(frames + 1);
  const rotations = {};
  const hips = new Float32Array((frames + 1) * 3);
  const at = (f) => frameAt(clip, (f / FPS) * speed, wrap);
  for (let f = 0; f <= frames; f++) times[f] = f / FPS;
  for (const [bone, values] of Object.entries(clip.rotations)) {
    const out = new Float32Array((frames + 1) * 4);
    for (let f = 0; f <= frames; f++) writeQuat(out, f, sampleQuat(values, at(f), qa));
    rotations[bone] = out;
  }
  const v = [0, 0, 0];
  for (let f = 0; f <= frames; f++) hips.set(sampleVec(clip.hips, at(f), v), f * 3);
  return { ...clip, duration: times[frames], times, rotations, hips };
}

/** Weight 0..1 at time t for an envelope [inStart, inEnd, outStart, outEnd] (smoothstep). */
export function envelopeWeight(t, envelope) {
  if (!envelope) return 1;
  const [a, b, c, d] = envelope;
  const s = (x) => x * x * (3 - 2 * x);
  if (t <= a || t >= d) return 0;
  if (t < b) return s((t - a) / (b - a));
  if (t > c) return s((d - t) / (d - c));
  return 1;
}

/**
 * Lay `bones` of `other` over `base`, blended by `weight` and the envelope. `other` is read
 * at the same time (wrapping), or at the same phase of its cycle when `phase` is set, so two
 * gaits that both start on the left foot stay in step. Rotations are normalized local, so
 * the spliced limb keeps its pose relative to the base body.
 */
export function splice(base, other, bones, { envelope = null, weight = 1, phase = false } = {}) {
  const out = { ...base, rotations: { ...base.rotations } };
  const q = new THREE.Quaternion();
  for (const bone of bones) {
    const from = base.rotations[bone];
    const to = other.rotations[bone];
    if (!from || !to) continue;
    const values = new Float32Array(from.length);
    for (let f = 0; f < base.times.length; f++) {
      const t = base.times[f];
      const u = phase ? (t / base.duration) * other.duration : t;
      sampleQuat(to, frameAt(other, u, true), q);
      readQuat(from, f, qa).slerp(q, weight * envelopeWeight(t, envelope));
      writeQuat(values, f, qa);
    }
    out.rotations[bone] = values;
  }
  return out;
}

/** World (clip-space) rotation of a bone: the product of normalized locals down the chain. */
function chainWorld(clip, bone, f, present) {
  const chain = [];
  for (let b = bone; b; b = mappedParent(b, present)) chain.unshift(b);
  const out = new THREE.Quaternion();
  for (const b of chain) out.multiply(readQuat(clip.rotations[b], f, qb));
  return out;
}

/**
 * A wave: swing the forearm side to side about the body's facing axis (+Z), at `hertz`,
 * faded by the envelope. The hand follows the forearm.
 */
export function addWave(clip, { side = 'right', amplitude = 0.4, hertz = 2 }, envelope, order) {
  const present = new Set(order);
  const lower = `${side}LowerArm`;
  const upper = `${side}UpperArm`;
  const values = new Float32Array(clip.rotations[lower]);
  const axis = new THREE.Vector3(0, 0, 1);
  const swing = new THREE.Quaternion();
  for (let f = 0; f < clip.times.length; f++) {
    const t = clip.times[f];
    const angle = amplitude * envelopeWeight(t, envelope) * Math.sin(2 * Math.PI * hertz * t);
    const upperWorld = chainWorld(clip, upper, f, present);
    const lowerWorld = upperWorld.clone().multiply(readQuat(values, f, qa));
    swing.setFromAxisAngle(axis, angle);
    const local = upperWorld.invert().multiply(swing.multiply(lowerWorld));
    writeQuat(values, f, local);
  }
  return { ...clip, rotations: { ...clip.rotations, [lower]: values } };
}

/**
 * Soften snaps on the finger tracks: one binomial pass (1, 2, 1) over the 30 fps keys, in
 * each key's hemisphere. UAL keys its fingers abruptly (Consume closes the hand within a
 * frame), which reads as a flick at 60 Hz. Loops wrap across the seam (the first and last
 * keys are the same pose); one-shots keep their end keys. Other bones are left as authored.
 */
export function smoothFingers(clip, { passes = 1 } = {}) {
  const out = { ...clip, rotations: { ...clip.rotations } };
  const n = clip.times.length;
  if (n < 3) return out;
  const a = new THREE.Quaternion();
  const b = new THREE.Quaternion();
  const c = new THREE.Quaternion();
  for (const [bone, source] of Object.entries(clip.rotations)) {
    if (!isFinger(bone)) continue;
    let values = source;
    for (let pass = 0; pass < passes; pass++) {
      const next = new Float32Array(values.length);
      for (let f = 0; f < n; f++) {
        const ends = f === 0 || f === n - 1;
        if (ends && !clip.loop) {
          next.set(values.subarray(f * 4, f * 4 + 4), f * 4);
          continue;
        }
        // Loop neighbours across the seam: key n-1 repeats key 0.
        const before = f === 0 ? n - 2 : f - 1;
        const after = f === n - 1 ? 1 : f + 1;
        readQuat(values, f, b);
        readQuat(values, before, a);
        readQuat(values, after, c);
        const sa = a.dot(b) < 0 ? -1 : 1;
        const sc = c.dot(b) < 0 ? -1 : 1;
        const q = new THREE.Quaternion(
          sa * a.x + 2 * b.x + sc * c.x,
          sa * a.y + 2 * b.y + sc * c.y,
          sa * a.z + 2 * b.z + sc * c.z,
          sa * a.w + 2 * b.w + sc * c.w,
        ).normalize();
        writeQuat(next, f, q);
      }
      values = next;
    }
    out.rotations[bone] = values;
  }
  return out;
}

// ---- key reduction ------------------------------------------------------------------------

/**
 * Indices of the keys to keep so that linear interpolation between kept keys stays within
 * `tolerance` of every dropped key: radians for quaternions (slerp), metres for vectors.
 * The first and last keys are always kept.
 */
export function reduceKeys(times, values, width, tolerance) {
  const n = times.length;
  if (n <= 2) return [...Array(n).keys()];
  const keep = [0];
  let a = 0;
  const qi = new THREE.Quaternion();
  const qk = new THREE.Quaternion();
  const qe = new THREE.Quaternion();
  const error = (i, b) => {
    const u = (times[i] - times[a]) / (times[b] - times[a]);
    if (width === 4) {
      qi.fromArray(values, a * 4).slerp(qk.fromArray(values, b * 4), u);
      qe.fromArray(values, i * 4);
      return 2 * Math.acos(Math.min(1, Math.abs(qi.dot(qe))));
    }
    let sum = 0;
    for (let c = 0; c < width; c++) {
      const v = values[a * width + c] + (values[b * width + c] - values[a * width + c]) * u;
      sum += (v - values[i * width + c]) ** 2;
    }
    return Math.sqrt(sum);
  };
  for (let b = 2; b < n; b++) {
    let fits = true;
    for (let i = a + 1; i < b && fits; i++) fits = error(i, b) <= tolerance;
    if (!fits) {
      keep.push(b - 1);
      a = b - 1;
    }
  }
  keep.push(n - 1);
  return keep;
}

/** Degrees of rotation error allowed when dropping keys: tighter on the body than fingers. */
export const KEY_TOLERANCE = { body: 0.25, finger: 0.6, hipsMetres: 0.0015 };

const isFinger = (bone) => /(Thumb|Index|Middle|Ring|Little)/.test(bone);

/** Encode the retarget result as a VRMA GLB (every clip one animation). */
export function encodeVrma({ rest, clips, gait, order }, extras = {}, { reduce = false } = {}) {
  const present = new Set(order);
  const nodes = order.map((bone) => {
    const parent = mappedParent(bone, present);
    const p = rest[bone];
    const q = parent ? rest[parent] : [0, 0, 0];
    return { name: bone, translation: [0, 1, 2].map((i) => round(p[i] - q[i], 5)) };
  });
  const index = new Map(order.map((bone, i) => [bone, i]));
  for (const bone of order) {
    const parent = mappedParent(bone, present);
    if (parent) (nodes[index.get(parent)].children ??= []).push(index.get(bone));
  }
  const chunks = [];
  let offset = 0;
  const bufferViews = [];
  const accessors = [];
  const addAccessor = (array, type, extra = {}) => {
    const raw = Buffer.from(array.buffer, array.byteOffset, array.byteLength);
    // Accessor data stays 4-byte aligned.
    const bytes = raw.length % 4 ? Buffer.concat([raw, Buffer.alloc(4 - (raw.length % 4))]) : raw;
    bufferViews.push({ buffer: 0, byteOffset: offset, byteLength: raw.length });
    chunks.push(bytes);
    offset += bytes.length;
    const width = { SCALAR: 1, VEC3: 3, VEC4: 4 }[type];
    accessors.push({
      bufferView: bufferViews.length - 1,
      componentType: 5126,
      count: array.length / width,
      type,
      ...extra,
    });
    return accessors.length - 1;
  };
  const still = addAccessor(new Float32Array([0]), 'SCALAR', { min: [0], max: [0] });
  const pick = (array, keys, width) => {
    const out = new array.constructor(keys.length * width);
    keys.forEach((k, i) => out.set(array.subarray(k * width, k * width + width), i * width));
    return out;
  };
  const animations = clips.map((clip) => {
    // Time accessors are shared inside a clip when two channels keep the same keys.
    const inputs = new Map();
    const inputFor = (keys) => {
      const id = keys.length === clip.times.length ? 'all' : keys.join(',');
      if (!inputs.has(id)) {
        const times = pick(clip.times, keys, 1);
        inputs.set(
          id,
          addAccessor(times, 'SCALAR', { min: [times[0]], max: [times[times.length - 1]] }),
        );
      }
      return inputs.get(id);
    };
    const all = [...clip.times.keys()];
    const samplers = [];
    const channels = [];
    for (const bone of order) {
      // Rotations are unit quaternions, so normalized shorts (glTF core) keep 1/32767 steps.
      // A bone that never moves in a clip is stored as a single key.
      const values = clip.rotations[bone];
      const moving = values.some((v, i) => Math.abs(v - values[i % 4]) > 2e-4);
      let keys = [0];
      if (moving) {
        const degrees = isFinger(bone) ? KEY_TOLERANCE.finger : KEY_TOLERANCE.body;
        keys = reduce ? reduceKeys(clip.times, values, 4, (degrees * Math.PI) / 180) : all;
      }
      const output = addAccessor(
        Int16Array.from(pick(values, keys, 4), (v) => Math.round(Math.max(-1, Math.min(1, v)) * 32767)),
        'VEC4',
        { componentType: 5122, normalized: true },
      );
      samplers.push({ input: moving ? inputFor(keys) : still, output, interpolation: 'LINEAR' });
      channels.push({
        sampler: samplers.length - 1,
        target: { node: index.get(bone), path: 'rotation' },
      });
    }
    const hips = roundArray(clip.hips, 5);
    const hipsKeys = reduce ? reduceKeys(clip.times, hips, 3, KEY_TOLERANCE.hipsMetres) : all;
    const output = addAccessor(pick(hips, hipsKeys, 3), 'VEC3');
    samplers.push({ input: inputFor(hipsKeys), output, interpolation: 'LINEAR' });
    channels.push({
      sampler: samplers.length - 1,
      target: { node: index.get('hips'), path: 'translation' },
    });
    return { name: clip.name, samplers, channels, extras: { loop: clip.loop } };
  });
  const bin = Buffer.concat(chunks);
  const json = {
    asset: { version: '2.0', generator: 'maple retarget.mjs' },
    scene: 0,
    scenes: [
      {
        nodes: [index.get('hips')],
        extras: {
          gait,
          clips: clips.map((c) => ({ name: c.name, loop: c.loop, seconds: round(c.duration, 3) })),
          ...extras,
        },
      },
    ],
    nodes,
    animations,
    accessors,
    bufferViews,
    buffers: [{ byteLength: bin.length }],
    extensionsUsed: ['VRMC_vrm_animation'],
    extensions: {
      VRMC_vrm_animation: {
        specVersion: '1.0',
        humanoid: {
          humanBones: Object.fromEntries(order.map((bone) => [bone, { node: index.get(bone) }])),
        },
      },
    },
  };
  return encodeGlb({ json, bin });
}

function roundArray(array, digits) {
  const f = 10 ** digits;
  return Float32Array.from(array, (v) => Math.round(v * f) / f);
}

// ---- the UAL cast set ---------------------------------------------------------------------

/** The UAL folder: --ual, then $MAPLE_UAL_DIR, then ~/Downloads/maple-assets/quaternius. */
export function ualFolder(argument = null) {
  return argument ?? process.env.MAPLE_UAL_DIR ?? join(homedir(), 'Downloads/maple-assets/quaternius');
}

/** Paths of the Standard and root-motion GLBs of both packs under a UAL folder. */
export function ualFiles(folder) {
  const find = (dir, file) => {
    if (!existsSync(dir)) return null;
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) {
        const found = find(path, file);
        if (found) return found;
      } else if (entry.name === file) return path;
    }
    return null;
  };
  const files = {};
  for (const pack of ['UAL1', 'UAL2'])
    for (const [key, suffix] of [
      [pack, ''],
      [`${pack}_RM`, '_RM'],
    ]) {
      const path = find(folder, `${pack}_Standard${suffix}.glb`);
      if (!path) throw new Error(`${pack}_Standard${suffix}.glb not found under ${folder}`);
      files[key] = path;
    }
  return files;
}

/** Build the hero-cast clip set from the UAL packs. Returns { result, report }. */
export async function buildUalCast(folder, { cast = UAL_CAST } = {}) {
  const files = ualFiles(folder);
  const gltf = {};
  for (const [key, path] of Object.entries(files)) gltf[key] = await loadGlb(path);
  const wanted = { UAL1: new Set(), UAL2: new Set() };
  for (const entry of cast) {
    if (entry.alias) continue;
    wanted[entry.pack].add(entry.clip);
    if (entry.splice) wanted[entry.splice.pack].add(entry.splice.clip);
  }
  const sourced = {};
  let order = null;
  let rest = null;
  let hipsRestHeight = null;
  for (const pack of ['UAL1', 'UAL2']) {
    const r = retarget(gltf[pack], RIGS.ual, { only: [...wanted[pack]], rest: RIG_REST.ual });
    for (const clip of r.clips) sourced[`${pack}/${clip.name}`] = clip;
    order ??= r.order;
    rest ??= r.rest;
    hipsRestHeight ??= r.hipsRestHeight;
    if (r.order.join() !== order.join()) throw new Error(`${pack} bones differ from UAL1`);
  }
  const clips = [];
  const gait = {};
  const aliases = {};
  const speeds = {};
  for (const entry of cast) {
    if (entry.alias) {
      aliases[entry.name] = entry.alias;
      continue;
    }
    let clip = sourced[`${entry.pack}/${entry.clip}`];
    if (!clip) throw new Error(`${entry.pack} has no clip ${entry.clip}`);
    const speed = entry.speed ?? 1;
    if (entry.seconds || speed !== 1)
      clip = resample(clip, entry.seconds ?? clip.duration / speed, { speed });
    if (entry.splice) {
      const other = sourced[`${entry.splice.pack}/${entry.splice.clip}`];
      const { fingers = true, weight = 1, phase = false } = entry.splice;
      const bones = entry.splice.bones.filter((b) => fingers || !isFinger(b));
      clip = splice(clip, other, bones, { envelope: entry.envelope, weight, phase });
    }
    if (entry.wave) clip = addWave(clip, entry.wave, entry.envelope, order);
    clip = smoothFingers({ ...clip, name: entry.name, loop: entry.loop ?? true });
    clips.push(clip);
    const drop = round((hipsRestHeight - minY(clip.hips)) / hipsRestHeight, 4);
    gait[entry.name] = { footSpeedPerHipsHeight: 0, hipsDropPerHipsHeight: drop };
    if (UAL_GAITS.includes(entry.name)) {
      const ground = rootMotionSpeed(gltf[`${entry.pack}_RM`], entry.clip) * speed;
      speeds[entry.name] = round(ground, 3);
      gait[entry.name].footSpeedPerHipsHeight = round(ground / hipsRestHeight, 4);
    }
  }
  // Seat: measured on the mannequin's skinned body in the sitting loop.
  const sitEntry = cast.find((entry) => entry.name === 'sit');
  const seat = measureSeat(gltf[sitEntry.pack], sitEntry.clip);
  gait.sit.seatPerHipsHeight = round(seat.seat / hipsRestHeight, 4);
  // How far behind the figure origin the pelvis sits, so the game can put it over the seat.
  gait.sit.seatBackPerHipsHeight = round(-seat.pelvis.z / hipsRestHeight, 4);
  const result = { rest, clips, gait, order, hipsRestHeight };
  return {
    result,
    aliases,
    report: {
      speeds,
      seatMetres: round(seat.seat, 3),
      seatPelvis: seat.pelvis.toArray().map((v) => round(v, 3)),
    },
  };
}

function parseArgs(argv) {
  const args = {
    rig: 'ual',
    out: 'apps/game/public/models/characters/vrm/cast-clips.vrma',
    // Only for --rig momiji: the Blender cast source and its measured seat height.
    source: 'apps/game/public/models/characters/student-riko.glb',
    'seat-report': 'asset-src/characters/momiji-cast/riko.report.json',
    ual: null,
  };
  for (let i = 0; i < argv.length; i += 2) args[argv[i].replace(/^--/, '')] = argv[i + 1];
  return args;
}

const sha256 = async (path) => {
  const { createHash } = await import('node:crypto');
  return createHash('sha256').update(readFileSync(path)).digest('hex');
};

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = parseArgs(process.argv.slice(2));
  let bytes;
  let report;
  if (args.rig === 'ual') {
    const folder = ualFolder(args.ual);
    const { result, aliases, report: measured } = await buildUalCast(folder);
    const files = ualFiles(folder);
    const sources = {};
    for (const [key, path] of Object.entries(files))
      sources[key] = { file: relative(folder, path), sha256: await sha256(path) };
    bytes = encodeVrma(
      result,
      {
        source: 'Quaternius Universal Animation Library 1 and 2 [Standard], CC0 1.0',
        rig: 'ual',
        aliases,
      },
      { reduce: true },
    );
    report = {
      source: 'Quaternius UAL 1 and 2 [Standard]',
      sources,
      rig: 'ual',
      rest: RIG_REST.ual,
      out: args.out,
      bytes: bytes.length,
      bones: result.order,
      hipsRestHeight: result.hipsRestHeight,
      aliases,
      clips: result.clips.map((c) => {
        const entry = UAL_CAST.find((e) => e.name === c.name);
        return {
          name: c.name,
          from: `${entry.pack}/${entry.clip}${entry.splice ? ` + ${entry.splice.clip} arms` : ''}`,
          seconds: round(c.duration, 3),
          loop: c.loop,
          frames: c.times.length,
        };
      }),
      rootMotionSpeeds: measured.speeds,
      seatMetres: measured.seatMetres,
      seatPelvis: measured.seatPelvis,
      gait: result.gait,
    };
  } else {
    const gltf = await loadGlb(join(root, args.source));
    const result = retarget(gltf, RIGS[args.rig], {
      loops: { board: false },
      rest: RIG_REST[args.rig] ?? 'direction',
    });
    if (args['seat-report'] && result.gait.sit) {
      const seat = JSON.parse(readFileSync(join(root, args['seat-report']), 'utf8')).seatHeight;
      result.gait.sit.seatPerHipsHeight = round(seat / result.hipsRestHeight, 4);
    }
    bytes = encodeVrma(result, { source: args.source, rig: args.rig });
    report = {
      source: args.source,
      rig: args.rig,
      out: args.out,
      bytes: bytes.length,
      bones: result.order,
      hipsRestHeight: result.hipsRestHeight,
      clips: result.clips.map((c) => ({
        name: c.name,
        seconds: round(c.duration, 3),
        loop: c.loop,
        frames: c.times.length,
      })),
      gait: result.gait,
    };
  }
  mkdirSync(dirname(join(root, args.out)), { recursive: true });
  writeFileSync(join(root, args.out), bytes);
  writeFileSync(join(here, 'clips.report.json'), `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify({ ...report, bones: report.bones.length }, null, 1));
}
