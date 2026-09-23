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
import { createHeroCast, MOMIJI_CAST, VRM_CLIPS } from '../src/world/hero-cast.js';
import { footSlide, jitterRms } from '../src/characters/studio/studio-math.js';

/**
 * Regression: the whole hero-cast update path on the real VRMs and clip file, at the render
 * script's fixed 30 fps step. Arms must hang (no T-pose) in every standing clip once the
 * cross-fades have settled, and a seated Mr. Ishida's hips must be at the bench.
 */
const publicDir = new URL('../public/', import.meta.url);
const m = { createVRMAnimationClip, VRMLookAtQuaternionProxy, VRMUtils };

async function parse(path, plugin) {
  const bytes = readFileSync(new URL(path, publicDir));
  const loader = new GLTFLoader();
  loader.setMeshoptDecoder(MeshoptDecoder);
  // Node has no image decoder; the pose checks need bones, not pixels (Riko's VRM is painted).
  loader.register(() => ({ name: 'test-textures', loadTexture: async () => new THREE.Texture() }));
  loader.register(plugin);
  return loader.parseAsync(
    bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.length),
    '',
  );
}

const clipGltf = await parse(VRM_CLIPS, (parser) => new VRMAnimationLoaderPlugin(parser));
const clipSet = {
  animations: clipGltf.userData.vrmAnimations,
  names: clipGltf.animations.map((clip) => clip.name),
  extras: clipGltf.scene.userData,
};
const vrmLoader = {
  async vrm(path) {
    const gltf = await parse(path, (parser) => new VRMLoaderPlugin(parser));
    return { vrm: gltf.userData.vrm, m };
  },
  async animations() {
    return clipSet;
  },
};

async function castMember(member, figure) {
  const scene = new THREE.Scene();
  const hero = createHeroCast({
    THREE,
    scene,
    loader: { get: async () => null },
    worldDetails: { setStandIn() {}, figureOf: () => figure },
    minds: null,
    vrmLoader,
    random: () => 0.5,
    ...member,
    props: null,
  });
  await hero.ready;
  assert.equal(hero.getState().kind, 'vrm');
  return hero;
}

/** Angle in degrees between the upper arm and straight down, from the rendered joints. */
function armDown(hero, side) {
  let upper = null;
  let lower = null;
  hero.root.traverse((node) => {
    if (node.isBone && node.name === `${side}UpperArm`) upper ??= node;
    if (node.isBone && node.name === `${side}LowerArm`) lower ??= node;
  });
  hero.root.updateMatrixWorld(true);
  const a = upper.getWorldPosition(new THREE.Vector3());
  const d = lower.getWorldPosition(new THREE.Vector3()).sub(a).normalize();
  return (Math.acos(Math.max(-1, Math.min(1, -d.y))) * 180) / Math.PI;
}

const run = (hero, seconds) => {
  for (let t = 0; t < seconds; t += 1 / 30) hero.update(1 / 30, {});
};

/** Clip: [max degrees from down for the left arm, for the right arm]. */
const LIMITS = {
  idle: [50, 50],
  chat: [50, 50],
  walk: [50, 50],
  sit: [50, 50],
  // The phone goes up to the face; the carry holds the forearms out in front.
  'check-phone': [50, 75],
  'walk-carry': [60, 60],
};

for (const member of MOMIJI_CAST) {
  test(`${member.personId} hangs its arms in every standing clip (no T-pose)`, async () => {
    const figure = {
      position: new THREE.Vector3(0, 0, 0),
      heading: 0,
      visible: true,
      walking: false,
      pose: 'standing',
      state: 'waiting',
    };
    const hero = await castMember(member, figure);
    for (const [clip, [left, right]] of Object.entries(LIMITS)) {
      if (!hero.getState().clips.includes(clip)) continue;
      hero.setDebug({ clip });
      // Long enough for the cross-fade to settle, which is when still bones stopped being
      // written and fell back to the rest (T) pose.
      run(hero, 2.5);
      assert.equal(hero.getState().clip, clip);
      const l = armDown(hero, 'left');
      const r = armDown(hero, 'right');
      assert.ok(l < left, `${member.personId} ${clip}: left arm ${l.toFixed(0)} degrees from down`);
      assert.ok(
        r < right,
        `${member.personId} ${clip}: right arm ${r.toFixed(0)} degrees from down`,
      );
    }
    hero.dispose();
  });
}

test('a seated Mr. Ishida sits on the bench, not in the air or the floor', async () => {
  const reader = MOMIJI_CAST.find((member) => member.personId === 'reader-1');
  const figure = {
    position: new THREE.Vector3(0, 0, 0),
    heading: 0,
    visible: true,
    walking: false,
    pose: 'reading',
    state: 'reading',
  };
  const hero = await castMember(reader, figure);
  run(hero, 2);
  const state = hero.getState();
  assert.equal(state.seat, 'seated');
  assert.equal(state.clip, 'sit');
  let hips = null;
  hero.root.traverse((node) => {
    if (node.isBone && node.name === 'hips') hips ??= node;
  });
  const at = hips.getWorldPosition(new THREE.Vector3());
  // The bench top is 0.61 m above his figure origin; the hip joint sits a little above it.
  assert.ok(at.y > reader.seatHeight && at.y < reader.seatHeight + 0.15, `hips at ${at.y}`);
  // The pelvis is over the seat point (the figure origin), not behind it.
  assert.ok(
    Math.hypot(at.x, at.z) < 0.12,
    `hips ${at.x.toFixed(2)}, ${at.z.toFixed(2)} off the seat`,
  );
  for (const side of ['left', 'right']) assert.ok(armDown(hero, side) < 50);
  hero.dispose();
});

// ---- motion audit regressions (docs/CHARACTER-MOTION.md) ----------------------------------

test('every rotation track in the clip file keeps consecutive keys in one hemisphere', () => {
  // A key and its negation are the same rotation, but interpolating across a sign flip swings
  // the long way round: the joint spins for a frame.
  for (const clip of clipGltf.animations)
    for (const track of clip.tracks) {
      if (!track.name.endsWith('.quaternion')) continue;
      const v = track.values;
      for (let k = 4; k < v.length; k += 4) {
        const dot =
          v[k - 4] * v[k] + v[k - 3] * v[k + 1] + v[k - 2] * v[k + 2] + v[k - 1] * v[k + 3];
        assert.ok(dot >= 0, `${clip.name} ${track.name} flips sign at key ${k / 4}`);
      }
    }
});

const standingFigure = () => ({
  position: new THREE.Vector3(0, 0, 0),
  heading: 0,
  visible: true,
  walking: false,
  pose: 'standing',
  state: 'waiting',
});
const step60 = (hero, seconds, each = () => {}) => {
  for (let f = 0; f < Math.round(seconds * 60); f++) {
    hero.update(1 / 60, {});
    each();
  }
};

test('Mr. Ishida’s stoop does not spin his neck in a clip that holds it still (eat)', async () => {
  const reader = MOMIJI_CAST.find((member) => member.personId === 'reader-1');
  const hero = await castMember(reader, standingFigure());
  hero.setDebug({ clip: 'eat' });
  step60(hero, 1.5);
  const { raw } = hero.internals().humanoid;
  const series = { neck: [], head: [] };
  step60(hero, 2, () => {
    for (const name of Object.keys(series)) series[name].push(raw[name].quaternion.toArray());
  });
  for (const [name, quaternions] of Object.entries(series)) {
    const { rms } = jitterRms(quaternions, 1 / 60);
    // About 10 rad/s^2 on every cast member; the stoop re-added each frame made it 247.
    assert.ok(rms < 30, `${name} jitter ${rms.toFixed(1)} rad/s^2`);
  }
  hero.dispose();
});

test('standing up from the bench, then checking a phone, the feet stay put', async () => {
  const reader = MOMIJI_CAST.find((member) => member.personId === 'reader-1');
  const figure = { ...standingFigure(), pose: 'reading', state: 'reading' };
  const hero = await castMember(reader, figure);
  step60(hero, 2.5);
  assert.equal(hero.getState().seat, 'seated');
  figure.pose = 'standing';
  figure.state = 'waiting';
  hero.setDebug({ clip: 'check-phone' });
  // As the studio audit does: 1.5 s to settle, then 2 s measured.
  step60(hero, 1.5);
  assert.equal(hero.getState().seat, 'none');
  const { raw } = hero.internals().humanoid;
  const frames = [];
  const point = (bone) => bone.getWorldPosition(new THREE.Vector3()).toArray();
  step60(hero, 2, () => {
    frames.push({
      root: [hero.root.position.x, hero.root.position.z],
      contacts: [raw.footL, raw.toesL, raw.footR, raw.toesR].map(point),
    });
  });
  const { slide, path } = footSlide(frames);
  // It slid 0.17-0.27 m while the root eased back from the feet onto the seat point.
  assert.ok(slide < 0.02, `feet slid ${slide.toFixed(3)} m`);
  assert.ok(path < 0.01, `body moved ${path.toFixed(3)} m while standing`);
  hero.dispose();
});
