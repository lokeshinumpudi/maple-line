import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { VRMLoaderPlugin, VRMUtils } from '@pixiv/three-vrm';
import {
  VRMAnimationLoaderPlugin,
  VRMLookAtQuaternionProxy,
  createVRMAnimationClip,
} from '@pixiv/three-vrm-animation';
import {
  CANONICAL_TO_VRM,
  VRM_TO_CANONICAL,
  MOMIJI_TO_CANONICAL,
  REQUIRED_CANONICAL,
  vrmHumanoidRig,
} from '../src/characters/humanoid-bones.js';
import {
  MORPH_TO_EXPRESSION,
  VISEMES,
  heroFaceToVrm,
  syllableVowel,
  visemeWeights,
  createVrmFace,
} from '../src/characters/vrm-expressions.js';
import { toneValues, CHARACTER_TONE } from '../src/characters/mtoon-tone.js';
import {
  createVrmActor,
  vrmGait,
  postureOffsets,
  stanceOffsets,
} from '../src/characters/vrm-actor.js';
import { MOMIJI_CAST, VRM_CLIPS } from '../src/world/hero-cast.js';

const root = new URL('../../../', import.meta.url);
const publicDir = new URL('apps/game/public/', root);
/** Every clip in the shared VRM clip file (UAL); `shelter` is an alias of watch-train. */
const CAST_CLIPS = [
  'board',
  'chat',
  'check-phone',
  'eat',
  'hurry',
  'idle',
  'nod-yes',
  'shake-no',
  'sit',
  'sit-enter',
  'sit-exit',
  'stretch',
  'walk',
  'walk-carry',
  'walk-formal',
  'watch-train',
  'wave',
];
const VRM_REQUIRED = [
  'hips',
  'spine',
  'head',
  'leftUpperArm',
  'leftLowerArm',
  'leftHand',
  'rightUpperArm',
  'rightLowerArm',
  'rightHand',
  'leftUpperLeg',
  'leftLowerLeg',
  'leftFoot',
  'rightUpperLeg',
  'rightLowerLeg',
  'rightFoot',
];

function glbJson(url) {
  const bytes = readFileSync(url);
  const length = bytes.readUInt32LE(12);
  return { json: JSON.parse(bytes.subarray(20, 20 + length).toString('utf8')), size: bytes.length };
}

// Node has no image decoder: painted VRMs (Riko's atlas) get a blank texture per image.
const blankTextures = () => ({
  name: 'test-blank-textures',
  loadTexture: () => Promise.resolve(new THREE.Texture()),
});

async function parse(path, plugin) {
  const bytes = readFileSync(new URL(path, publicDir));
  const loader = new GLTFLoader();
  loader.setMeshoptDecoder(MeshoptDecoder);
  loader.register(blankTextures);
  loader.register(plugin);
  return loader.parseAsync(
    bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.length),
    '',
  );
}

async function loadActor(path) {
  const gltf = await parse(path, (parser) => new VRMLoaderPlugin(parser));
  const clips = await parse(VRM_CLIPS, (parser) => new VRMAnimationLoaderPlugin(parser));
  const vrm = gltf.userData.vrm;
  const clipSet = {
    animations: clips.userData.vrmAnimations,
    names: clips.animations.map((clip) => clip.name),
    extras: clips.scene.userData,
  };
  const m = { createVRMAnimationClip, VRMLookAtQuaternionProxy, VRMUtils };
  return { vrm, actor: createVrmActor({ THREE, vrm, m, clipSet }) };
}

test('the canonical bone map covers every VRM humanoid bone the rigs use, both ways', () => {
  for (const name of REQUIRED_CANONICAL) assert.ok(CANONICAL_TO_VRM[name], name);
  assert.equal(CANONICAL_TO_VRM.upperArmL, 'leftUpperArm');
  assert.equal(CANONICAL_TO_VRM.footR, 'rightFoot');
  assert.equal(CANONICAL_TO_VRM.thumbL1, 'leftThumbMetacarpal');
  assert.equal(CANONICAL_TO_VRM.indexR3, 'rightIndexDistal');
  for (const [canonical, vrm] of Object.entries(CANONICAL_TO_VRM))
    assert.equal(VRM_TO_CANONICAL[vrm], canonical);
  // Every VRM-required bone has a canonical name.
  for (const bone of VRM_REQUIRED) assert.ok(VRM_TO_CANONICAL[bone], bone);
  // Mixamo-style rigs (the Momiji names) answer the same required names.
  const momiji = new Set(Object.values(MOMIJI_TO_CANONICAL));
  for (const name of REQUIRED_CANONICAL) assert.ok(momiji.has(name), name);
});

test('hero-cast face values become VRM expressions and one viseme per syllable', () => {
  assert.deepEqual(MORPH_TO_EXPRESSION['blink-l'], ['blinkLeft', 1]);
  assert.equal(MORPH_TO_EXPRESSION.smile[0], 'happy');
  const face = heroFaceToVrm({ 'blink-l': 1, 'blink-r': 0.5, smile: 0.7, 'jaw-open': 0 });
  assert.equal(face.blinkLeft, 1);
  assert.equal(face.blinkRight, 0.5);
  assert.ok(face.happy > 0.5 && face.happy < 0.7);
  for (const viseme of VISEMES) assert.equal(face[viseme], 0);
  // Talking: exactly one vowel is open, and it follows the syllable.
  const talking = heroFaceToVrm({ 'jaw-open': 0.6 }, 7);
  const open = VISEMES.filter((viseme) => talking[viseme] > 0);
  assert.deepEqual(open, [syllableVowel(7)]);
  assert.ok(talking[open[0]] <= 1);
  // Syllables are deterministic and use every vowel over a line.
  const vowels = new Set(Array.from({ length: 40 }, (_v, i) => syllableVowel(i)));
  assert.deepEqual([...vowels].sort(), [...VISEMES].sort());
  assert.equal(syllableVowel(12), syllableVowel(12));
  // A closed jaw closes the mouth, and a huge syllable count does not overflow.
  assert.deepEqual(Object.values(visemeWeights(0, 3)), [0, 0, 0, 0, 0]);
  assert.ok(VISEMES.includes(syllableVowel(1e9)));
  // The adapter writes through the expression manager's setValue.
  const written = {};
  const adapter = createVrmFace({
    setValue: (name, value) => (written[name] = value),
    expressions: [],
  });
  adapter.set('smile', 1);
  adapter.flush();
  assert.equal(written.happy, 0.85);
});

test('the house MToon tone keeps shade light, clamps outlines and drops them on mobile', () => {
  const values = toneValues(
    {
      base: [0.8, 0.6, 0.5],
      shade: [0.1, 0.05, 0.05],
      outline: 0.02,
      outlineMode: 'worldCoordinates',
    },
    { height: 1.6 },
  );
  // The shaded side never falls below the floor fraction of the lit colour.
  values.shade.forEach((c, i) =>
    assert.ok(c >= [0.8, 0.6, 0.5][i] * CHARACTER_TONE.shadeFloor - 1e-9),
  );
  assert.equal(values.outlineWidth, CHARACTER_TONE.outline.max);
  assert.equal(
    toneValues({ outline: 0.002, outlineMode: 'worldCoordinates' }, { mobile: true }).outlineWidth,
    0,
  );
  assert.equal(toneValues({ outline: 0.002, outlineMode: 'none' }).outlineMode, 'none');
});

test('gait scales with leg length and the stoop leans the upper back forward', () => {
  const extras = {
    gait: {
      walk: { footSpeedPerHipsHeight: 1.2 },
      hurry: { footSpeedPerHipsHeight: 1.9 },
      sit: { seatPerHipsHeight: 0.46 },
    },
  };
  assert.deepEqual(vrmGait(extras, 1), {
    walkSpeed: 1.2,
    hurrySpeed: 1.9,
    seatHeight: 0.46,
    seatBack: 0,
    seatDrop: 0,
    speeds: { walk: 1.2, hurry: 1.9 },
  });
  assert.equal(vrmGait(extras, 0.5).walkSpeed, 0.6);
  assert.ok(vrmGait({}, 0.9).walkSpeed > 0.9);
  assert.deepEqual(postureOffsets({}), []);
  // A stance turns both upper legs in (left negative about +Z) and the feet back flat.
  assert.deepEqual(stanceOffsets({}), []);
  const stance = Object.fromEntries(stanceOffsets({ stance: 4 }));
  assert.equal(stance.leftUpperLeg, -4);
  assert.equal(stance.rightUpperLeg, 4);
  assert.equal(stance.leftFoot + stance.leftUpperLeg, 0);
  const stoop = Object.fromEntries(postureOffsets({ stoop: 10 }));
  assert.ok(stoop.upperChest > 0 && stoop.head < 0);
});

test('every Momiji VRM carries the humanoid, expression, spring and MToon contract', () => {
  for (const { personId, vrm } of MOMIJI_CAST) {
    const { json, size } = glbJson(new URL(vrm, publicDir));
    const ext = json.extensions.VRMC_vrm;
    assert.equal(ext.specVersion, '1.0', vrm);
    for (const bone of VRM_REQUIRED) assert.ok(ext.humanoid.humanBones[bone], `${vrm} ${bone}`);
    for (const expression of ['blink', 'blinkLeft', 'blinkRight', 'happy', ...VISEMES])
      assert.ok(
        ext.expressions.preset[expression]?.morphTargetBinds.length,
        `${vrm} ${expression}`,
      );
    assert.equal(ext.meta.avatarPermission, 'everyone');
    assert.ok(
      json.materials.every((m) => m.extensions?.VRMC_materials_mtoon),
      vrm,
    );
    assert.ok(json.extensionsUsed.includes('EXT_meshopt_compression'));
    assert.equal(json.scenes[0].extras.person, personId);
    assert.ok(size <= 700 * 1024, `${vrm} is ${size} bytes`);
    const springs = json.extensions.VRMC_springBone;
    assert.ok(springs.colliders.length >= 4);
    for (const spring of springs.springs) assert.ok(spring.joints.length >= 3, spring.name);
  }
});

test('the shared clip file holds every hero-cast clip with measured gait', () => {
  const { json, size } = glbJson(new URL(VRM_CLIPS, publicDir));
  assert.ok(json.extensionsUsed.includes('VRMC_vrm_animation'));
  assert.deepEqual(json.animations.map((a) => a.name).sort(), CAST_CLIPS);
  const extras = json.scenes[0].extras;
  assert.deepEqual(extras.aliases, { shelter: 'watch-train' });
  assert.match(extras.source, /Quaternius Universal Animation Library/);
  const gait = extras.gait;
  assert.ok(gait.walk.footSpeedPerHipsHeight > 1 && gait.walk.footSpeedPerHipsHeight < 1.6);
  assert.ok(gait.hurry.footSpeedPerHipsHeight > gait.walk.footSpeedPerHipsHeight);
  assert.ok(gait.sit.seatPerHipsHeight > 0.35 && gait.sit.seatPerHipsHeight < 0.6);
  assert.ok(gait.sit.seatBackPerHipsHeight > 0.2 && gait.sit.seatBackPerHipsHeight < 0.5);
  // Fingers are animated: the grip layer tops them up instead of replacing them.
  const bones = Object.keys(json.extensions.VRMC_vrm_animation.humanoid.humanBones);
  for (const bone of ['leftIndexProximal', 'rightThumbDistal', 'leftLittleDistal'])
    assert.ok(bones.includes(bone), bone);
  // No root motion: in-place clips keep the hips over the origin.
  for (const animation of json.animations) assert.ok(animation.extras.loop !== undefined);
  assert.ok(size <= 450 * 1024, `clips are ${size} bytes`);
});

test('a VRM loads in three-vrm with canonical bones, clips, springs and a sensible pose', async () => {
  const { vrm, actor } = await loadActor(MOMIJI_CAST[1].vrm);
  assert.ok(vrm.springBoneManager.joints.size >= 9);
  assert.deepEqual([...actor.actions.keys()].sort(), [...CAST_CLIPS, 'shelter'].sort());
  assert.equal(actor.actions.get('shelter'), actor.actions.get('watch-train'));
  const rig = vrmHumanoidRig(vrm);
  assert.deepEqual(rig.missing, []);
  assert.equal(rig.get('upperArmL'), vrm.humanoid.getNormalizedBoneNode('leftUpperArm'));
  // UAL's walk, scaled to a 1.57 m student: a little under the residents' 1.05-1.29 m/s,
  // which the walk covers by playing up to 1.6 times faster.
  assert.ok(actor.gait.walkSpeed > 0.85 && actor.gait.walkSpeed < 1.2, actor.gait.walkSpeed);
  assert.ok(actor.gait.hurrySpeed > actor.gait.walkSpeed * 1.3);
  assert.ok(actor.gait.speeds['walk-formal'] > 0.85);
  assert.ok(actor.gait.seatHeight > 0.38 && actor.gait.seatHeight < 0.48);
  // Idle holds the arms down beside the body, not in the file's T-pose.
  actor.actions.get('idle').play();
  actor.update(1 / 30);
  vrm.scene.updateMatrixWorld(true);
  const hand = rig.raw.handL.getWorldPosition(new THREE.Vector3());
  const shoulder = rig.raw.upperArmL.getWorldPosition(new THREE.Vector3());
  assert.ok(
    hand.y < shoulder.y - 0.3,
    `hand ${hand.y.toFixed(2)} shoulder ${shoulder.y.toFixed(2)}`,
  );
  assert.ok(Math.abs(hand.x - shoulder.x) < 0.15);
  // The face adapter reaches the expression manager.
  actor.face.set('blink-l', 1);
  actor.update(1 / 30);
  assert.equal(vrm.expressionManager.getValue('blinkLeft'), 1);
  actor.dispose();
});
