import test from 'node:test';
import assert from 'node:assert/strict';
import { createForestLayout, createProceduralWorld } from '../src/world/procedural-world.js';
import { riverBedHeight, riverProfile } from '../src/world/river-profile.js';
import { worldClearings, createCitySites } from '../src/world/world-details.js';
import { validateWorldSpec } from '@maple-line/world-spec';
import { createMeadowLayout } from '../src/world/seasonal-meadow.js';
import { OFFLINE_WORLDS } from '../src/world/presets/offline-worlds.js';

const plan = {
  season: 'spring',
  forest: 'balanced',
  settlement: 'rural',
  weather: 'clear',
  time: 'daylight',
  seed: 42,
};
const railU = (z) =>
  z > 130 && z < 430 ? 28 - 85 * Math.sin(((z - 130) / 300) * Math.PI) ** 2 : 28;
const context = { plan, terrain: () => 4.1, railU, riverBedHeight };

test('city sites separate the largest building footprints', () => {
  const sites = createCitySites(() => 0.5);
  assert.equal(sites.length, 48);
  for (let i = 0; i < sites.length; i++)
    for (let j = i + 1; j < sites.length; j++) {
      assert.ok(Math.abs(sites[i].u - sites[j].u) >= 19 || Math.abs(sites[i].z - sites[j].z) >= 21);
    }
});

test('seeded forests reproduce placement and preserve rail, river and landmark clearances', () => {
  const trees = createForestLayout(context);
  assert.deepEqual(trees, createForestLayout(context));
  assert.notDeepEqual(trees, createForestLayout({ ...context, plan: { ...plan, seed: 43 } }));
  assert.ok(trees.length > 1000);
  for (const tree of trees) {
    assert.ok(Math.abs(tree.u - railU(tree.z)) >= 9);
    const bed = riverBedHeight(tree.u, tree.z);
    assert.ok(bed === null || bed >= 3);
    assert.ok(
      !worldClearings.some(
        (r) => tree.z >= r.minZ && tree.z <= r.maxZ && tree.u >= r.minU && tree.u <= r.maxU,
      ),
    );
    assert.ok(Number.isFinite(tree.y));
  }
  const sparse = createForestLayout({ ...context, plan: { ...plan, forest: 'sparse' } });
  const dense = createForestLayout({ ...context, plan: { ...plan, forest: 'dense' } });
  assert.ok(sparse.length < trees.length && trees.length < dense.length);
});

test('world plans reject extra keys, unsupported choices and unbounded seeds', () => {
  for (const candidate of [
    { ...plan, seed: -1 },
    { ...plan, seed: Infinity },
    { ...plan, season: 'lava' },
    { ...plan, script: 'execute' },
    null,
  ])
    assert.throws(() => validateWorldSpec(candidate));
});

test('all saved forests preserve trunk spacing and stable density subsets', () => {
  const center = (z) => Math.sin(z / 70) * 30;
  for (const preset of OFFLINE_WORLDS) {
    const trees = createForestLayout({ ...context, center, plan: preset.plan });
    const cells = new Map();
    for (const tree of trees) {
      const x = center(tree.z) + tree.u;
      const cx = Math.floor(x / 3.2),
        cz = Math.floor(tree.z / 3.2);
      for (let dx = -1; dx <= 1; dx++)
        for (let dz = -1; dz <= 1; dz++)
          for (const other of cells.get(`${cx + dx}:${cz + dz}`) ?? [])
            assert.ok(Math.hypot(x - other.x, tree.z - other.z) >= 3.2);
      const key = `${cx}:${cz}`;
      if (!cells.has(key)) cells.set(key, []);
      cells.get(key).push({ x, z: tree.z });
    }
    const sparse = createForestLayout({
      ...context,
      center,
      plan: { ...preset.plan, forest: 'sparse' },
    });
    const dense = createForestLayout({
      ...context,
      center,
      plan: { ...preset.plan, forest: 'dense' },
    });
    assert.deepEqual(dense.slice(0, sparse.length), sparse);
  }
});

test('meadow generation fits dry terrain and rejects cliffs with an independent seed stream', () => {
  const center = (z) => z * 0.25;
  const terrain = (u, z) => 4 + (u + center(z)) * 0.4;
  const meadowContext = { ...context, center, terrain };
  const patches = createMeadowLayout(meadowContext);
  assert.ok(patches.length > 100 && patches.length <= 5000);
  assert.deepEqual(patches, createMeadowLayout(meadowContext));
  assert.equal(new Set(patches.map((p) => p.id)).size, patches.length);
  for (const patch of patches) {
    assert.ok(Math.abs(patch.normal[0] + 0.4) < 1e-10);
    assert.ok(Math.abs(patch.normal[2]) < 1e-10);
    assert.ok(Math.abs(patch.y - terrain(patch.u, patch.z) + 0.06) < 1e-10);
    for (const [dx, dz] of [
      [-3, -3],
      [-3, 3],
      [3, -3],
      [3, 3],
    ]) {
      const u = patch.u + dx + center(patch.z) - center(patch.z + dz),
        z = patch.z + dz;
      assert.ok(Math.abs(u - railU(z)) >= 9);
      const bed = riverBedHeight(u, z);
      assert.ok(bed === null || bed >= 3);
      assert.ok(
        !worldClearings.some((r) => u >= r.minU && u <= r.maxU && z >= r.minZ && z <= r.maxZ),
      );
    }
  }
  assert.deepEqual(createMeadowLayout({ ...context, terrain: (u) => u * 2 }), []);
  const forestBefore = createForestLayout(context);
  createMeadowLayout(context);
  assert.deepEqual(createForestLayout(context), forestBefore);
});

test('prepared scenery is detached and releases instanced buffers and geometry on disposal', () => {
  const world = createProceduralWorld({
    ...context,
    center: () => 0,
    riverProfile,
    snowCoverage: { value: 0 },
  });
  assert.equal(world.root.parent, null);
  assert.ok(world.root.children.length > 10);
  let released = 0,
    instances = 0;
  world.root.traverse((object) => {
    if (object.isInstancedMesh) {
      instances++;
      object.addEventListener('dispose', () => {
        released++;
      });
    }
  });
  world.dispose();
  assert.equal(released, instances);
  assert.equal(world.root.children.length, 0);
  world.dispose();
  assert.equal(released, instances);
});
