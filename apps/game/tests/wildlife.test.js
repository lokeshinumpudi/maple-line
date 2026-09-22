import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { addWildlife } from '../src/world/wildlife.js';
import { riverProfile, riverBedHeight } from '../src/world/river-profile.js';
import { createRiverWater } from '../src/world/river-water.js';
const center = (z) => 22 * Math.sin(z * 0.006) + 12 * Math.sin(z * 0.014);
const terrain = (u, z) => riverBedHeight(u, z) ?? 4.1 + Math.max(0, -u - 30) * 0.15;
function setup(season) {
  const scene = new THREE.Scene();
  return {
    scene,
    world: addWildlife({ THREE, scene, center, terrain, riverProfile, waterY: -0.4, season }),
  };
}

test('schools remain below water, above bed and inside curved river over a full circuit', () => {
  const { world } = setup();
  let previous;
  for (let frame = 0; frame < 1100; frame++) {
    world.update(0.1);
    const state = world.getState();
    for (let i = 0; i < state.fish.length; i++) {
      const [x, y, z] = state.fish[i].position,
        p = riverProfile(z),
        u = x - center(z);
      assert.ok(Math.abs(u - p.offset) < p.halfWidth - 2);
      assert.ok(y < -0.6 && y > riverBedHeight(u, z) + 0.18);
      if (previous)
        assert.ok(Math.hypot(x - previous[i].position[0], z - previous[i].position[2]) < 0.5);
    }
    previous = state.fish;
  }
  world.dispose();
});
test('deer stay on dry banks, hold while alert and expose a train reaction', () => {
  const { world } = setup();
  for (let i = 0; i < 300; i++) world.update(0.1);
  const first = world.getState().deer[0];
  for (let i = 0; i < 20; i++) world.update(0.1, { trainPosition: first.position });
  const current = world.getState();
  assert.equal(current.deer[0].state, 'alert');
  assert.deepEqual(current.deer[0].position, first.position);
  for (const deer of current.deer) {
    const [x, y, z] = deer.position,
      u = x - center(z),
      p = riverProfile(z);
    assert.ok(u < p.offset - p.halfWidth - 8);
    assert.ok(u < 20 && y > 0);
  }
  world.dispose();
});
test('birds return gradually to perches in rain without teleporting or growing scene objects', () => {
  const { world, scene } = setup(),
    count = scene.children[0].children.length;
  world.update(0.1);
  let previous = world.getState().birds;
  assert.ok(previous.some((b) => b.state === 'flying'));
  for (let i = 0; i < 100; i++) {
    world.update(0.1, { weather: 'rain' });
    const current = world.getState().birds;
    current.forEach((bird, index) => {
      assert.ok(Math.hypot(...bird.position.map((n, k) => n - previous[index].position[k])) < 2);
    });
    previous = current;
  }
  assert.ok(
    previous.every((b) => b.state === (b.species === 'mandarin-duck' ? 'resting' : 'perched')),
  );
  assert.equal(scene.children[0].children.length, count);
  assert.ok(count <= 72);
  world.dispose();
});
test('wildlife is deterministic, transforms stay finite, and disposal removes owned objects', () => {
  const a = setup(),
    b = setup();
  for (let i = 0; i < 80; i++) {
    a.world.update(0.05);
    b.world.update(0.05);
  }
  assert.deepEqual(a.world.getState(), b.world.getState());
  a.scene.traverse((object) => {
    if (object.isInstancedMesh) assert.ok(object.instanceMatrix.array.every(Number.isFinite));
  });
  assert.throws(() => a.world.update(NaN));
  assert.throws(() => a.world.update(-1));
  a.world.dispose();
  b.world.dispose();
  assert.equal(a.scene.children.length, 0);
  assert.equal(b.scene.children.length, 0);
});
test('river normal coordinates follow channel direction and retain reflection/refraction shader inputs', () => {
  const scene = new THREE.Scene(),
    camera = new THREE.PerspectiveCamera(),
    renderer = { getDrawingBufferSize: (value) => value.set(1280, 720) };
  const water = createRiverWater({ scene, camera, renderer, center, riverProfile, riverBedHeight });
  assert.ok(water.mesh.geometry.attributes.riverFlowUv.array.every(Number.isFinite));
  assert.ok(water.mesh.geometry.attributes.riverFlowDirection.array.every(Number.isFinite));
  assert.ok(water.material.fragmentShader.includes('getNoise( vFlowUv )'));
  assert.ok(water.material.fragmentShader.includes('vec2 downstream=vec2(0.,time*1.25)'));
  assert.ok(water.material.fragmentShader.includes('bedSampler'));
  assert.ok(water.material.fragmentShader.includes('mirrorSampler'));
  water.dispose();
  assert.equal(scene.children.length, 0);
});

test('all seasonal casts stay in habitat and reuse their instance buffers when switched while paused', () => {
  const { world, scene } = setup();
  const root = scene.children[0],
    buffers = root.children.map((mesh) => mesh.instanceMatrix);
  const expected = {
    spring: ['yamame', 'japanese-hare', 14, 6],
    summer: ['ayu', 'tanuki', 6, 4],
    autumn: ['oikawa', null, 6, 12],
    winter: ['iwana', 'red-fox', 12, 4],
  };
  for (let pass = 0; pass < 2; pass++)
    for (const [season, [fish, mammal, mammals, deer]] of Object.entries(expected)) {
      const elapsed = world.getState().elapsed;
      world.update(0, { season });
      const initial = world.getState();
      assert.equal(initial.elapsed, elapsed);
      assert.equal(initial.season, season);
      assert.equal(initial.species.fish, fish);
      assert.equal(initial.species.mammals, mammal);
      assert.equal(initial.mammals.length, mammals);
      assert.equal(initial.deer.length, deer);
      assert.equal(root.getObjectByName('Wildlife / sika-deer / body').count, deer);
      assert.ok(initial.rendering.activeBatches <= 27);
      if (mammal) assert.ok(root.getObjectByName(`Wildlife / ${mammal} / body`).count > 0);
      assert.deepEqual(
        root.children.map((mesh) => mesh.instanceMatrix),
        buffers,
      );
      for (let frame = 0; frame < 150; frame++) {
        world.update(0.1, { season });
        const state = world.getState();
        for (const animal of [...state.deer, ...state.mammals, ...state.reptiles]) {
          const [x, y, z] = animal.position,
            u = x - center(z),
            p = riverProfile(z);
          assert.ok(u < p.offset - p.halfWidth - 8);
          assert.ok(Math.abs(y - terrain(u, z)) < 0.002);
        }
        for (const fish of state.fish) {
          const [x, y, z] = fish.position,
            u = x - center(z),
            p = riverProfile(z);
          assert.ok(Math.abs(u - p.offset) < p.halfWidth - 2);
          assert.ok(y + 0.19 < -0.4 && y - 0.19 > riverBedHeight(u, z));
        }
      }
      root.traverse((object) => {
        if (object.isInstancedMesh) assert.ok(object.instanceMatrix.array.every(Number.isFinite));
      });
    }
  let released = 0;
  root.children.forEach((mesh) => mesh.addEventListener('dispose', () => released++));
  world.dispose();
  world.dispose();
  assert.equal(released, buffers.length);
});

test('weather preserves the season, snow shelters animals, and pause freezes their motion', () => {
  const { world } = setup('winter');
  for (let i = 0; i < 120; i++) world.update(0.1, { weather: 'snow' });
  const snow = world.getState();
  assert.equal(snow.season, 'winter');
  assert.ok(snow.mammals.every((a) => a.state === 'sheltering'));
  assert.ok(
    snow.birds.every((a) => a.state === (a.species === 'mandarin-duck' ? 'resting' : 'perched')),
  );
  for (let i = 0; i < 20; i++) world.update(0, { weather: 'snow' });
  assert.deepEqual(world.getState(), snow);
  world.update(0.1, { weather: 'clear' });
  assert.equal(world.getState().species.fish, 'iwana');
  assert.throws(() => world.update(0, { season: 'monsoon' }));
  assert.equal(world.getState().season, 'winter');
  world.dispose();
});

test('winter fish swim more slowly and deeper than summer fish', () => {
  const summer = setup('summer').world,
    winter = setup('winter').world;
  const beforeSummer = summer.getState().fish,
    beforeWinter = winter.getState().fish;
  summer.update(0.1);
  winter.update(0.1);
  const distance = (a, b) =>
    Math.hypot(a.position[0] - b.position[0], a.position[2] - b.position[2]);
  const summerTravel = summer
    .getState()
    .fish.reduce((sum, p, i) => sum + distance(p, beforeSummer[i]), 0);
  const winterTravel = winter
    .getState()
    .fish.reduce((sum, p, i) => sum + distance(p, beforeWinter[i]), 0);
  assert.ok(winterTravel < summerTravel * 0.4);
  assert.ok(beforeWinter.every((p, i) => p.position[1] < beforeSummer[i].position[1]));
  summer.dispose();
  winter.dispose();
});

test('expanded seasonal species are present, buffers are bounded, and waterfowl stay in the channel', () => {
  const expected = {
    spring: ['japanese-squirrel', 'medaka', 'kingfisher'],
    summer: ['pond-turtle', 'koi', 'kingfisher'],
    autumn: ['wild-boar', 'koi', 'mandarin-duck'],
    winter: ['japanese-macaque', 'yamame', 'mandarin-duck'],
  };
  const { world, scene } = setup();
  const root = scene.children[0];
  const buffers = root.children.map((mesh) => mesh.instanceMatrix);
  for (const [season, additions] of Object.entries(expected)) {
    world.update(0, { season });
    for (let frame = 0; frame < 180; frame++) world.update(0.1, { season });
    const state = world.getState();
    const present = new Set(
      [...state.mammals, ...state.reptiles, ...state.fish, ...state.birds].map((a) => a.species),
    );
    additions.forEach((species) => assert.ok(present.has(species), species));
    assert.equal(new Set(state.fish.map((f) => f.species)).size, 2);
    assert.equal(new Set(state.birds.map((b) => b.species)).size, 2);
    assert.equal(state.catalog.length, 20);
    for (const duck of state.birds.filter((b) => b.species === 'mandarin-duck')) {
      const [x, y, z] = duck.position,
        p = riverProfile(z);
      assert.ok(Math.abs(x - center(z) - p.offset) < p.halfWidth - 2);
      assert.equal(y, -0.335);
      assert.equal(duck.state, 'swimming');
    }
    root.children.forEach((mesh, i) => {
      assert.equal(mesh.instanceMatrix, buffers[i]);
      assert.ok(mesh.count <= mesh.instanceMatrix.count);
      assert.ok(mesh.geometry.attributes.position.array.every(Number.isFinite));
      assert.ok(mesh.geometry.attributes.normal.array.every(Number.isFinite));
      const transform = new THREE.Matrix4();
      for (let instance = 0; instance < mesh.count; instance++) {
        mesh.getMatrixAt(instance, transform);
        assert.ok(transform.determinant() > 0, `${mesh.name} must not invert its faces`);
      }
    });
    assert.ok(state.rendering.triangles < 650000);
    const countBySpecies = new Map();
    for (const animal of [
      ...state.fish,
      ...state.birds,
      ...state.deer,
      ...state.mammals,
      ...state.reptiles,
    ])
      countBySpecies.set(animal.species, (countBySpecies.get(animal.species) ?? 0) + 1);
    for (const id of state.catalog)
      assert.equal(
        root.getObjectByName(`Wildlife / ${id} / body`).count,
        countBySpecies.get(id) ?? 0,
      );
  }
  world.dispose();
});

test('wildlife searches around blocked groves and keeps walking inside clear habitat', () => {
  const blocked = (_x, z) =>
    Math.abs(z + 650) < 14 || Math.abs(z + 450) < 12 || Math.abs(z - 480) < 10;
  const world = addWildlife({
    THREE,
    scene: new THREE.Scene(),
    center,
    terrain,
    riverProfile,
    isHabitatClear: (x, z) => !blocked(x, z),
  });
  for (const season of ['autumn', 'spring', 'summer', 'winter']) {
    for (let frame = 0; frame < 100; frame++) {
      world.update(0.1, { season });
      const state = world.getState();
      for (const animal of [...state.deer, ...state.mammals, ...state.reptiles])
        assert.equal(blocked(animal.position[0], animal.position[2]), false, animal.id);
    }
  }
  world.dispose();
});
