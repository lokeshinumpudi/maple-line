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
