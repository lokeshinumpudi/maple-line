import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { heroClip, moodSmile, HERO_WALK_SPEED } from '../src/world/hero-cast.js';
import { createModelLoader, modelUrl } from '../src/rendering/model-loader.js';
import { createStationModules, MODULE_PLACEMENTS } from '../src/world/station-modules.js';
import { INTENTS } from '../src/simulation/npc-minds.js';

const root = new URL('../../../', import.meta.url);
/** The JSON chunk of a GLB (meshopt compresses buffers, not the JSON). */
function glbJson(path) {
  const bytes = readFileSync(new URL(path, root));
  assert.equal(bytes.readUInt32LE(0), 0x46546c67, `${path} is not a GLB`);
  const length = bytes.readUInt32LE(12);
  assert.equal(bytes.readUInt32LE(16), 0x4e4f534a);
  return { json: JSON.parse(bytes.subarray(20, 20 + length).toString('utf8')), size: bytes.length };
}
const report = (path) => JSON.parse(readFileSync(new URL(path, root), 'utf8'));

test('the hero commuter GLB carries the clip, face and skeleton contract', () => {
  const { json, size } = glbJson('apps/game/public/models/characters/commuter-hero.glb');
  assert.deepEqual(json.animations.map((a) => a.name).sort(), [
    'check-phone',
    'idle',
    'walk',
    'wave',
  ]);
  const face = json.meshes.find((mesh) => mesh.extras?.targetNames);
  assert.deepEqual(face.extras.targetNames, ['blink-l', 'blink-r', 'jaw-open', 'smile']);
  // Morph weights must start neutral, or the face loads with closed eyes and an open jaw.
  assert.ok((face.weights ?? []).every((weight) => weight === 0));
  const joints = json.skins[0].joints.map((index) => json.nodes[index].name);
  for (const bone of ['Hips', 'Head', 'LeftArm', 'RightHand', 'LeftUpLeg', 'eye-l'])
    assert.ok(joints.includes(bone), `missing bone ${bone}`);
  assert.equal(json.materials.length, 1);
  assert.ok(json.extensionsUsed.includes('EXT_meshopt_compression'));
  assert.ok(size <= 600 * 1024, `hero GLB is ${size} bytes`);
});

test('the hero build report meets the milestone budgets', () => {
  const hero = report('asset-src/characters/commuter-hero/report.json');
  assert.ok(hero.triangles <= 8000);
  assert.ok(hero.boneCount <= 32);
  assert.equal(hero.materials, 1);
  assert.ok(hero.heightWithinTwoCentimetres);
  assert.ok(hero.lowestZ >= 0 && hero.lowestZ < 0.02, 'feet rest on the ground');
  for (const [name, clip] of Object.entries(hero.clips))
    assert.ok(clip.loopErrorDegrees <= 0.5, `${name} loop gap ${clip.loopErrorDegrees}°`);
  assert.ok(
    Math.abs(hero.walkFootSpeed - hero.walkTargetSpeed) / hero.walkTargetSpeed <= 0.05,
    `walk feet move at ${hero.walkFootSpeed} m/s`,
  );
  assert.equal(hero.walkTargetSpeed, HERO_WALK_SPEED);
});

test('the station shelter GLB has two detail levels and a bench socket', () => {
  const { json, size } = glbJson('apps/game/public/models/modules/station-shelter.glb');
  const lods = json.nodes.filter((node) => Number.isInteger(node.extras?.lod));
  assert.deepEqual(lods.map((node) => node.extras.lod).sort(), [0, 1]);
  assert.ok(json.nodes.some((node) => node.name === 'socket.bench-seat-1'));
  assert.ok(lods.every((node) => node.extras.kind === 'station-shelter'));
  assert.ok(size <= 150 * 1024);
  const shelter = report('asset-src/modules/station-shelter/report.json');
  assert.ok(shelter.lod0Triangles <= 2000 && shelter.lod1Triangles <= 600);
  assert.equal(shelter.lowestZ, 0);
});

test('clips follow walking speed first, then the mind’s intent', () => {
  assert.deepEqual(heroClip({ speed: 1.15, intent: 'wave' }), { clip: 'walk', timeScale: 1 });
  assert.equal(heroClip({ speed: 3 }).timeScale, 1.6);
  assert.equal(heroClip({ speed: 0, intent: 'wave' }).clip, 'wave');
  assert.equal(heroClip({ speed: 0.1, intent: 'check-phone' }).clip, 'check-phone');
  for (const intent of INTENTS) assert.ok(heroClip({ intent }).clip);
  assert.equal(heroClip({ intent: 'linger' }).clip, 'idle');
  assert.ok(moodSmile('cheerful') > moodSmile('content'));
  assert.equal(moodSmile('irritated'), 0);
});

test('the model loader fetches each file once and reports failures without throwing', async () => {
  const calls = [];
  const errors = [];
  const loader = createModelLoader({
    load: async (path) => {
      calls.push(path);
      if (path.includes('missing')) throw new Error('404');
      return { scene: path };
    },
    onError: (path) => errors.push(path),
  });
  const [a, b] = await Promise.all([loader.get('models/a.glb'), loader.get('models/a.glb')]);
  assert.equal(a, b);
  assert.deepEqual(calls, ['models/a.glb']);
  assert.equal(await loader.get('models/missing.glb'), null);
  assert.equal(await loader.get('models/missing.glb'), null);
  assert.deepEqual(errors, ['models/missing.glb']);
  assert.deepEqual(loader.getState(), { 'models/a.glb': 'ready', 'models/missing.glb': 'failed' });
  assert.equal(modelUrl('models/a.glb', '/maple-line/'), '/maple-line/models/a.glb');
  assert.equal(modelUrl('/models/a.glb', './'), './models/a.glb');
});

test('station modules place detail levels on the station and skip missing files', async () => {
  const meshAt = (lod) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial());
    mesh.userData = { lod, kind: 'station-shelter' };
    return mesh;
  };
  const scene = new THREE.Group();
  scene.add(meshAt(0), meshAt(1), new THREE.Object3D());
  const parent = new THREE.Group();
  const modules = createStationModules({
    THREE,
    parent,
    loader: { get: async () => ({ scene }) },
  });
  await modules.ready;
  const lod = parent.children[0];
  assert.ok(lod.isLOD);
  assert.equal(lod.levels.length, 2);
  assert.deepEqual(lod.position.toArray(), MODULE_PLACEMENTS[0].position);
  const empty = new THREE.Group();
  const missing = createStationModules({ THREE, parent: empty, loader: { get: async () => null } });
  await missing.ready;
  assert.equal(empty.children.length, 0);
});
