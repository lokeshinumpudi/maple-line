import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {
  TOKYO_PASSAGE,
  tokyoCells,
  tokyoDistrictWeight,
  tokyoUrbanIntensity,
  createTokyoPassage,
} from '../src/world/tokyo-passage.js';
import {
  createExtendedWorld,
  routeCenter,
  routeElevation,
  scenicTerrain,
} from '../src/world/extended-route.js';
const railPoint = (z) => new THREE.Vector3(routeCenter(z) + 28, routeElevation(z), z);
function fixture(start = 22390, end = 22990) {
  const parent = new THREE.Group();
  const passage = createTokyoPassage({ THREE, parent, railPoint, start, end });
  return { parent, passage };
}
function matrices(parent) {
  return parent.children[0].children.map((mesh) => Array.from(mesh.instanceMatrix.array));
}
test('city cells have exactly one chunk owner, independent of visit order', () => {
  const left = tokyoCells(22390, 22990),
    right = tokyoCells(22990, 23590);
  assert.equal(left.length + right.length, 30);
  assert.equal(new Set([...right, ...left].map((c) => c.id)).size, 30);
  const a = fixture(),
    b = fixture(22990, 23590),
    c = fixture();
  assert.deepEqual(matrices(a.parent), matrices(c.parent));
  assert.ok(a.passage.state().cars + b.passage.state().cars >= 100);
  assert.ok(a.passage.state().pedestrians + b.passage.state().pedestrians >= 200);
  assert.ok(a.passage.state().batches <= 22 && b.passage.state().batches <= 22);
  for (const item of [a, b, c]) item.passage.dispose();
});
test('city shelf preserves the rail and Harumi station, and blends into the country', () => {
  for (let z = 22500; z <= 23100; z += 5) {
    const rail = railPoint(z);
    assert.ok(Math.abs(scenicTerrain(rail.x, z) - (rail.y - 0.65)) < 1e-8);
    for (const offset of [-90, -22, 22, 90])
      assert.ok(Math.abs(scenicTerrain(rail.x + offset, z) - (rail.y - 0.65)) < 1e-8);
  }
  assert.equal(tokyoDistrictWeight(23300, 14), 0);
  assert.equal(tokyoDistrictWeight(21360, 0), 0);
  assert.equal(tokyoDistrictWeight(24200, 0), 0);
  assert.equal(tokyoDistrictWeight(22800, 340), 0);
  const p = railPoint(23300);
  assert.ok(Math.abs(scenicTerrain(p.x + 14, p.z) - (p.y + 0.02)) < 1e-7);
});
test('traffic and crowds pause, remain clear of the railway, and synchronize after chunk reload', () => {
  const { passage, parent } = fixture();
  passage.update(0.05, { activityTime: 500, weather: 'rain', dusk: true });
  const moving = matrices(parent);
  passage.update(0, { weather: 'clear' });
  assert.deepEqual(matrices(parent), moving);
  passage.update(0.05);
  assert.notDeepEqual(matrices(parent), moving);
  const pose = new THREE.Matrix4(),
    point = new THREE.Vector3();
  for (let step = 0; step < 25; step++) {
    passage.update(0.1, { activityTime: step * 113 });
    for (const mesh of parent.children[0].children) {
      assert.ok(Array.from(mesh.instanceMatrix.array).every(Number.isFinite));
      if (!/traffic|walking/.test(mesh.name)) continue;
      for (let i = 0; i < mesh.count; i++) {
        mesh.getMatrixAt(i, pose);
        point.setFromMatrixPosition(pose);
        assert.ok(Math.abs(point.x - railPoint(point.z).x) > 16);
        assert.ok(point.z > 22400 && point.z < 23000);
      }
    }
  }
  passage.update(0, { activityTime: 83 });
  const reloaded = fixture();
  reloaded.passage.update(0, { activityTime: 83 });
  assert.deepEqual(matrices(parent), matrices(reloaded.parent));
  passage.dispose();
  reloaded.passage.dispose();
});
test('the regional streamer releases city batches once and restores them on reverse travel', () => {
  const scene = new THREE.Scene(),
    world = createExtendedWorld({ THREE, scene, railPoint });
  world.update(0, { position: railPoint(22760) });
  assert.ok(world.getState().tokyo.length >= 3 && world.getState().tokyo.length <= 5);
  assert.equal(new Set(world.getState().tokyo.flatMap((district) => district.cells)).size, 59);
  const owned = new Set();
  scene.traverse((node) => {
    if (!node.name.startsWith('Tokyo passage /') || !node.isMesh) return;
    owned.add(node);
    owned.add(node.geometry);
    owned.add(node.material);
  });
  const disposals = new Map();
  for (const item of owned)
    item.addEventListener('dispose', () => disposals.set(item, (disposals.get(item) || 0) + 1));
  world.update(0, { position: railPoint(19000) });
  assert.equal(world.getState().tokyo.length, 0);
  for (const item of owned) assert.equal(disposals.get(item), 1);
  world.update(0, { position: railPoint(22995) });
  assert.ok(world.getState().tokyo.length >= 3 && world.getState().tokyo.length <= 5);
  assert.ok(world.getState().loadedChunks.length <= 5);
  world.dispose();
  world.dispose();
  assert.equal(scene.children.length, 0);
});

test('Harumi transit additions preserve the main line and platform walking lane', () => {
  const scene = new THREE.Scene(),
    world = createExtendedWorld({ THREE, scene, railPoint });
  world.update(0, { position: railPoint(23300) });
  scene.updateMatrixWorld(true);
  const city = [];
  scene.traverse((node) => {
    if (node.isMesh && /city graphite|city cyan|city magenta/.test(node.material?.name))
      city.push(node);
  });
  assert.ok(city.length > 0);
  for (const offset of [0, 4.9]) {
    const origin = railPoint(23274).add(new THREE.Vector3(offset, 2, 0));
    const finish = railPoint(23322).add(new THREE.Vector3(offset, 2, 0));
    const ray = new THREE.Raycaster(
      origin,
      finish.clone().sub(origin).normalize(),
      0,
      origin.distanceTo(finish),
    );
    assert.equal(ray.intersectObjects(city, false).length, 0);
  }
  world.dispose();
});

test('city approach and exit graduate from suburbs without unowned or duplicate cells', () => {
  const cells = tokyoCells(TOKYO_PASSAGE.start, TOKYO_PASSAGE.end);
  assert.equal(cells.length, 59);
  const chunks = [];
  for (let start = 21190; start < 24000; start += 600)
    chunks.push(...tokyoCells(start, start + 600));
  assert.deepEqual(chunks, cells);
  assert.equal(tokyoUrbanIntensity(21600), 0);
  assert.equal(tokyoUrbanIntensity(23960), 0);
  assert.equal(tokyoUrbanIntensity(22800), 1);
  assert.ok(tokyoUrbanIntensity(21800) < tokyoUrbanIntensity(22100));
  assert.ok(tokyoUrbanIntensity(23800) < tokyoUrbanIntensity(23500));
  for (const z of [21620, 22000, 22800, 23940]) {
    assert.equal(tokyoDistrictWeight(z, 220), 1);
    assert.ok(tokyoDistrictWeight(z, 280) < 1);
  }
});
