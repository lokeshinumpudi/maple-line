/**
 * Offline retarget: humanoid clips from a glTF rig -> one VRM Animation (.vrma) file.
 *
 * The output holds every clip as its own glTF animation on a rest skeleton whose rotations
 * are all identity, so each track is already a VRM normalized-bone rotation.
 * @pixiv/three-vrm-animation turns it into clips for any VRM at load time, scaling hips
 * motion by the target's hips height. Runtime does no retargeting maths.
 *
 * Per bone b with source rest world rotation R and posed world rotation W, the world delta
 * is D = W R^-1. Source rigs that are not in T-pose (arms down, for example) need a rest
 * correction A: the shortest rotation from the VRM T-pose direction of b to the source
 * rest direction. The normalized local rotation is then (D_p A_p)^-1 (D_b A_b), with p the
 * nearest mapped humanoid parent. A bone with no mapped child inherits its parent's A.
 *
 * Gait is measured on the source (the planted foot's backward speed during stance) and
 * stored per unit of hips height in the scene extras, so the game can scale it to each
 * character's leg length.
 *
 *   node asset-src/characters/vrm-cast/retarget.mjs            # the Momiji clip set
 *   node asset-src/characters/vrm-cast/retarget.mjs --source <glb> --rig ual --out <vrma>
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { THREE, loadGlb } from '../../lib/three-node.mjs';
import { encodeGlb, round } from '../../lib/glb.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..', '..', '..');

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
  // Quaternius Universal Animation Library (UE mannequin-style names). Check against the
  // downloaded file before use: print the joint names and adjust.
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
  },
};

const FPS = 30;

export function mappedParent(bone, present) {
  let parent = VRM_PARENT[bone];
  while (parent && !present.has(parent)) parent = VRM_PARENT[parent];
  return parent ?? null;
}

/**
 * Retarget every clip of a loaded source glTF. Returns { rest, clips, gait } where rest
 * maps VRM bone -> world position and clips are { name, duration, loop, times,
 * rotations: {bone: Float32Array}, hips: Float32Array }.
 */
export function retarget(gltf, rigMap, { loops = {}, rename = {} } = {}) {
  const scene = gltf.scene;
  scene.updateMatrixWorld(true);
  const source = new Map();
  scene.traverse((node) => {
    const bone = rigMap[node.name];
    if (bone && !source.has(bone)) source.set(bone, node);
  });
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
  // Rest correction per bone.
  const correction = new Map();
  for (const bone of order) {
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

  const mixer = new THREE.AnimationMixer(scene);
  const clips = [];
  const q = new THREE.Quaternion();
  const world = new Map();
  const hipsRestHeight = restPos.get('hips').y;
  const gait = {};
  for (const clip of gltf.animations) {
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
        // Keep neighbouring samples in the same hemisphere so interpolation takes the short way.
        const out = rotations[bone];
        if (f > 0) {
          const dot =
            out[(f - 1) * 4] * q.x +
            out[(f - 1) * 4 + 1] * q.y +
            out[(f - 1) * 4 + 2] * q.z +
            out[(f - 1) * 4 + 3] * q.w;
          if (dot < 0) q.set(-q.x, -q.y, -q.z, -q.w);
        }
        out.set([q.x, q.y, q.z, q.w], f * 4);
      }
      const hipsPos = source.get('hips').getWorldPosition(new THREE.Vector3());
      hips.set([hipsPos.x, hipsPos.y, hipsPos.z], f * 3);
      for (const side of ['left', 'right']) {
        const foot = source.get(`${side}Foot`);
        if (foot) feet[side].push(foot.getWorldPosition(new THREE.Vector3()));
      }
    }
    action.stop();
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

/** Encode the retarget result as a VRMA GLB (every clip one animation). */
export function encodeVrma({ rest, clips, gait, order }, extras = {}) {
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
  const animations = clips.map((clip) => {
    const input = addAccessor(clip.times, 'SCALAR', {
      min: [clip.times[0]],
      max: [clip.times[clip.times.length - 1]],
    });
    const samplers = [];
    const channels = [];
    for (const bone of order) {
      // Rotations are unit quaternions, so normalized shorts (glTF core) keep 1/32767 steps.
      // A bone that never moves in a clip is stored as a single key.
      const values = clip.rotations[bone];
      const moving = values.some((v, i) => Math.abs(v - values[i % 4]) > 2e-4);
      const keys = moving ? values : values.slice(0, 4);
      const output = addAccessor(
        Int16Array.from(keys, (v) => Math.round(Math.max(-1, Math.min(1, v)) * 32767)),
        'VEC4',
        { componentType: 5122, normalized: true },
      );
      samplers.push({ input: moving ? input : still, output, interpolation: 'LINEAR' });
      channels.push({
        sampler: samplers.length - 1,
        target: { node: index.get(bone), path: 'rotation' },
      });
    }
    const output = addAccessor(roundArray(clip.hips, 5), 'VEC3');
    samplers.push({ input, output, interpolation: 'LINEAR' });
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

function parseArgs(argv) {
  const args = {
    source: 'apps/game/public/models/characters/student-riko.glb',
    rig: 'momiji',
    out: 'apps/game/public/models/characters/vrm/cast-clips.vrma',
    // Seat height measured on the source model in its `sit` clip (the Blender cast report).
    'seat-report': 'asset-src/characters/momiji-cast/riko.report.json',
  };
  for (let i = 0; i < argv.length; i += 2) args[argv[i].replace(/^--/, '')] = argv[i + 1];
  return args;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = parseArgs(process.argv.slice(2));
  const gltf = await loadGlb(join(root, args.source));
  const result = retarget(gltf, RIGS[args.rig], { loops: { board: false } });
  if (args['seat-report'] && result.gait.sit) {
    const seat = JSON.parse(readFileSync(join(root, args['seat-report']), 'utf8')).seatHeight;
    result.gait.sit.seatPerHipsHeight = round(seat / result.hipsRestHeight, 4);
  }
  const bytes = encodeVrma(result, { source: args.source, rig: args.rig });
  mkdirSync(dirname(join(root, args.out)), { recursive: true });
  writeFileSync(join(root, args.out), bytes);
  const report = {
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
  writeFileSync(join(here, 'clips.report.json'), `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify(report, null, 1));
}
