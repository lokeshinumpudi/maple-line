/**
 * One humanoid bone vocabulary for every character rig in the game. Motion code (hand
 * sockets, two-bone IK, foot planting, look-at) asks for canonical names; each rig kind
 * supplies its own lookup. VRM characters answer with three-vrm's *normalized* bones:
 * their rest rotation is identity in a T-pose facing +Z, so a rotation means the same thing
 * on every VRM regardless of how its author oriented the raw joints. three-vrm copies the
 * normalized pose to the skinned bones in `vrm.update()`; write to these, not the raw bones.
 */

const SIDES = [
  ['L', 'left'],
  ['R', 'right'],
];
const FINGERS = ['thumb', 'index', 'middle', 'ring', 'little'];

/** Canonical name -> VRM 1.0 humanoid bone name. */
export const CANONICAL_TO_VRM = Object.freeze({
  hips: 'hips',
  spine: 'spine',
  chest: 'chest',
  upperChest: 'upperChest',
  neck: 'neck',
  head: 'head',
  ...Object.fromEntries(
    SIDES.flatMap(([s, side]) => [
      [`shoulder${s}`, `${side}Shoulder`],
      [`upperArm${s}`, `${side}UpperArm`],
      [`lowerArm${s}`, `${side}LowerArm`],
      [`hand${s}`, `${side}Hand`],
      [`upperLeg${s}`, `${side}UpperLeg`],
      [`lowerLeg${s}`, `${side}LowerLeg`],
      [`foot${s}`, `${side}Foot`],
      [`toes${s}`, `${side}Toes`],
      [`eye${s}`, `${side}Eye`],
      // Fingers: thumbL1..3, indexL1..3 and so on, from the knuckle outward.
      ...FINGERS.flatMap((finger) =>
        (finger === 'thumb'
          ? ['Metacarpal', 'Proximal', 'Distal']
          : ['Proximal', 'Intermediate', 'Distal']
        ).map((segment, i) => [
          `${finger}${s}${i + 1}`,
          `${side}${finger[0].toUpperCase()}${finger.slice(1)}${segment}`,
        ]),
      ),
    ]),
  ),
});

export const VRM_TO_CANONICAL = Object.freeze(
  Object.fromEntries(Object.entries(CANONICAL_TO_VRM).map(([canonical, vrm]) => [vrm, canonical])),
);

/** The same canonical names on the older Blender cast GLBs (Mixamo-style joint names). */
export const MOMIJI_TO_CANONICAL = Object.freeze({
  Hips: 'hips',
  Spine: 'spine',
  Spine1: 'chest',
  Spine2: 'upperChest',
  Neck: 'neck',
  Head: 'head',
  ...Object.fromEntries(
    SIDES.flatMap(([s]) => {
      const L = s === 'L' ? 'Left' : 'Right';
      return [
        [`${L}Shoulder`, `shoulder${s}`],
        [`${L}Arm`, `upperArm${s}`],
        [`${L}ForeArm`, `lowerArm${s}`],
        [`${L}Hand`, `hand${s}`],
        [`${L}UpLeg`, `upperLeg${s}`],
        [`${L}Leg`, `lowerLeg${s}`],
        [`${L}Foot`, `foot${s}`],
        [`${L}ToeBase`, `toes${s}`],
        [`eye-${s.toLowerCase()}`, `eye${s}`],
      ];
    }),
  ),
});

/** Canonical bones every rig must provide for IK, planting and look-at to work. */
export const REQUIRED_CANONICAL = Object.freeze([
  'hips',
  'spine',
  'neck',
  'head',
  'upperArmL',
  'lowerArmL',
  'handL',
  'upperArmR',
  'lowerArmR',
  'handR',
  'upperLegL',
  'lowerLegL',
  'footL',
  'upperLegR',
  'lowerLegR',
  'footR',
]);

/**
 * A canonical rig over a loaded VRM. `bones` maps canonical name -> normalized bone node
 * (missing optional bones are left out); `raw` gives the skinned joint, for reading a
 * world position after `vrm.update()`. `restPose` is the normalized rest (translations
 * relative to the parent, rotations identity).
 */
export function vrmHumanoidRig(vrm) {
  const humanoid = vrm.humanoid;
  const bones = {};
  const raw = {};
  for (const [canonical, name] of Object.entries(CANONICAL_TO_VRM)) {
    const normalized = humanoid.getNormalizedBoneNode(name);
    if (normalized) bones[canonical] = normalized;
    const joint = humanoid.getRawBoneNode(name);
    if (joint) raw[canonical] = joint;
  }
  return {
    kind: 'vrm',
    bones,
    raw,
    missing: REQUIRED_CANONICAL.filter((name) => !bones[name]),
    get(name) {
      return bones[name] ?? null;
    },
    restPose: humanoid.normalizedRestPose,
  };
}

/** A canonical rig over a Blender cast GLB, found by joint name. */
export function momijiHumanoidRig(root) {
  const bones = {};
  root.traverse((node) => {
    const canonical = MOMIJI_TO_CANONICAL[node.name];
    if (canonical && !bones[canonical]) bones[canonical] = node;
  });
  return {
    kind: 'momiji',
    bones,
    raw: bones,
    missing: REQUIRED_CANONICAL.filter((name) => !bones[name]),
    get(name) {
      return bones[name] ?? null;
    },
    restPose: null,
  };
}

// ---- any other rig: names from a table, glTF extras, known conventions or structure ----

// Side-free, lower-case, punctuation-free names each canonical bone is known by in the
// common conventions: Mixamo, Unreal/UAL mannequin, MPFB/MakeHuman, Rigify DEF bones.
const ALIASES = {
  hips: ['hips', 'hip', 'pelvis'],
  spine: ['spine', 'spine01', 'spine1', 'spinelower', 'abdomen', 'spine001'],
  chest: ['chest', 'spine2', 'spine02', 'thorax'],
  upperChest: ['upperchest', 'spine3', 'spine03'],
  neck: ['neck', 'neck01', 'neck1', 'neck001'],
  head: ['head'],
  shoulder: ['shoulder', 'clavicle', 'collar'],
  upperArm: ['arm', 'upperarm', 'uparm', 'upperarm01', 'humerus'],
  lowerArm: ['forearm', 'lowerarm', 'lowerarm01', 'elbow'],
  hand: ['hand', 'wrist'],
  upperLeg: ['upleg', 'thigh', 'upperleg', 'upperleg01', 'femur'],
  lowerLeg: ['leg', 'calf', 'shin', 'lowerleg', 'lowerleg01', 'knee'],
  foot: ['foot', 'ankle'],
  toes: ['toebase', 'toe', 'toes', 'ball', 'toe01'],
  thumb1: ['handthumb1', 'thumb01', 'thumb1', 'thumbmetacarpal', 'finger0'],
  index1: ['handindex1', 'index01', 'index1', 'indexproximal', 'finger1'],
  middle1: ['handmiddle1', 'middle01', 'middle1', 'middleproximal', 'finger2'],
  ring1: ['handring1', 'ring01', 'ring1', 'ringproximal', 'finger3'],
  little1: ['handpinky1', 'pinky01', 'pinky1', 'littleproximal', 'finger4'],
};
const CENTRE = new Set(['hips', 'spine', 'chest', 'upperChest', 'neck', 'head']);
const PREFIXES = ['mixamorig', 'def', 'org', 'bip01', 'bip001', 'ccbase', 'armature', 'rig'];

/**
 * Split a joint name into a side ('L', 'R' or '') and a normalised base name. Handles
 * LeftArm, upperarm_l, upper_arm.L, DEF-thigh.L, mixamorig:LeftHand and the forms three.js
 * leaves after sanitising node names (mixamorigLeftHand, upper_armL).
 */
export function parseBoneName(name) {
  let raw = String(name ?? '');
  let side = '';
  const take = (pattern, value) => {
    if (side || !pattern.test(raw)) return;
    side = value;
    raw = raw.replace(pattern, ' ');
  };
  take(/left/i, 'L');
  take(/right/i, 'R');
  take(/(?:[._\-\s:]|^)[lL](?=$|[._\-\s:\d])/, 'L');
  take(/(?:[._\-\s:]|^)[rR](?=$|[._\-\s:\d])/, 'R');
  take(/(?<=[a-z0-9])L$/, 'L');
  take(/(?<=[a-z0-9])R$/, 'R');
  let base = raw.toLowerCase().replace(/[^a-z0-9]/g, '');
  for (const prefix of PREFIXES)
    if (base.startsWith(prefix) && base.length > prefix.length) base = base.slice(prefix.length);
  return { side, base };
}

/** The canonical name for a joint name, or null. Finger roots map to `indexL1` and so on. */
export function canonicalForName(name) {
  const { side, base } = parseBoneName(name);
  for (const [part, names] of Object.entries(ALIASES)) {
    if (!names.includes(base) || CENTRE.has(part) === Boolean(side)) continue;
    if (CENTRE.has(part)) return part;
    const finger = part.match(/^([a-z]+)1$/);
    return finger ? `${finger[1]}${side}1` : `${part}${side}`;
  }
  return null;
}

const KNOWN = new Set(Object.keys(CANONICAL_TO_VRM));

/**
 * A canonical rig over any skeleton. Order of trust: `mapping` (canonical -> joint name),
 * then a `boneMap` object in any node's glTF extras, then the Momiji joint names, then the
 * alias list, then structure (a hand's parent is the lower arm and so on; the upper chest
 * is whatever the shoulders hang from). A new rig plugs in by naming its joints only.
 */
export function humanoidRigFor(root, mapping = null) {
  const nodes = [];
  root.traverse((node) => nodes.push(node));
  const byName = new Map(nodes.map((node) => [node.name, node]));
  const joints = nodes.filter((node) => node.isBone);
  const bones = {};
  const source = {};
  const set = (canonical, node, from) => {
    if (node && KNOWN.has(canonical) && !bones[canonical]) {
      bones[canonical] = node;
      source[canonical] = from;
    }
  };
  const table = mapping ?? nodes.find((node) => node.userData?.boneMap)?.userData.boneMap;
  const sanitized = (name) => String(name).replace(/[\s.:[\]/]/g, '');
  for (const [canonical, name] of Object.entries(table ?? {}))
    set(canonical, byName.get(name) ?? byName.get(sanitized(name)), mapping ? 'table' : 'extras');
  for (const node of joints.length ? joints : nodes) {
    set(MOMIJI_TO_CANONICAL[node.name], node, 'momiji');
    set(canonicalForName(node.name), node, 'alias');
  }
  const parentBone = (node) => (node?.parent?.isBone ? node.parent : null);
  for (const [s] of SIDES) {
    set(`lowerArm${s}`, parentBone(bones[`hand${s}`]), 'structure');
    set(`upperArm${s}`, parentBone(bones[`lowerArm${s}`]), 'structure');
    set(`lowerLeg${s}`, parentBone(bones[`foot${s}`]), 'structure');
    set(`upperLeg${s}`, parentBone(bones[`lowerLeg${s}`]), 'structure');
  }
  set('neck', parentBone(bones.head), 'structure');
  const shoulder = bones.shoulderL ?? bones.shoulderR;
  const hung = parentBone(shoulder) ?? parentBone(bones.upperArmL ?? bones.upperArmR);
  if (hung && ![bones.spine, bones.chest, bones.hips].includes(hung))
    set('upperChest', hung, 'structure');
  return {
    kind: 'generic',
    bones,
    raw: bones,
    source,
    missing: REQUIRED_CANONICAL.filter((name) => !bones[name]),
    get(name) {
      return bones[name] ?? null;
    },
    restPose: null,
  };
}

/**
 * The head joint of any loaded character, for cameras that frame a face. Tries the rig
 * vocabulary above, then any joint whose name ends in "head" (VRoid's J_Bip_C_Head,
 * three-vrm's Normalized_head). Returns null when the model has no head joint.
 */
export function findHeadNode(root) {
  const rigged = humanoidRigFor(root).bones.head;
  if (rigged) return rigged;
  let bone = null;
  let node = null;
  root.traverse((item) => {
    if (!/(^|[^a-z])head$/i.test(item.name ?? '')) return;
    if (item.isBone) bone ??= item;
    else node ??= item;
  });
  return bone ?? node;
}
