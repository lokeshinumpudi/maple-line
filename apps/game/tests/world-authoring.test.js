import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createWorldAuthoring } from '../src/agent/world-authoring.js';
import { registerGameWebMCP } from '../src/agent/webmcp.js';
import { createArtDirection } from '../src/agent/build-tools.js';
function fixture() {
  const scene = new THREE.Scene();
  return {
    scene,
    builder: createWorldAuthoring({ THREE, scene, terrainHeight: (x, z) => x * 0.1 + z * 0.01 }),
  };
}
const place = (id = 'tree') => ({
  type: 'place',
  entity: { id, kind: 'broadleaf-tree', position: [10, 0, 20], groundSnap: true },
});
test('prefabs render in an authored layer and ground snapping preserves the base scene', () => {
  const { scene, builder } = fixture(),
    base = new THREE.Mesh();
  scene.add(base);
  builder.applyBatch({
    label: 'Grove',
    operations: Object.keys(builder.catalog().prefabs).map((kind, i) => ({
      type: 'place',
      entity: { id: `item${i}`, kind, position: [i * 4, 0, 10], groundSnap: true },
    })),
  });
  assert.equal(builder.getState().entityCount, 7);
  assert.equal(builder.inspect({ id: 'item1' }).entities[0].position[1], 0.5);
  assert.ok(scene.children.includes(base));
  const layer = scene.getObjectByName('Authored scenery');
  assert.ok(layer.children.length > 7);
  assert.ok(layer.children.every((o) => o.isInstancedMesh));
  builder.dispose();
  assert.ok(scene.children.includes(base));
  assert.equal(scene.getObjectByName('Authored scenery'), undefined);
});
test('invalid batch, duplicate IDs, executable fields, and invalid import leave scene and undo state unchanged', () => {
  const { builder, scene } = fixture();
  builder.applyBatch({ label: 'First', operations: [place()] });
  const before = builder.exportLayout(),
    state = builder.getState(),
    layer = scene.getObjectByName('Authored scenery');
  for (const operation of [
    place(),
    { type: 'place', entity: { ...place().entity, id: 'new', scale: [NaN, 1, 1] } },
    { type: 'update', id: 'tree', patch: { script: 'alert(1)' } },
    { type: 'remove', id: 'missing' },
  ]) {
    assert.throws(() =>
      builder.applyBatch({ label: 'Bad', operations: [place('valid-first'), operation] }),
    );
    assert.deepEqual(builder.exportLayout(), before);
    assert.deepEqual(builder.getState(), state);
    assert.equal(scene.getObjectByName('Authored scenery'), layer);
  }
  assert.throws(() =>
    builder.importLayout({ version: 1, entities: [before.entities[0], before.entities[0]] }),
  );
  assert.deepEqual(builder.exportLayout(), before);
  builder.dispose();
});
test('seeded scatter is repeatable, bounded, and a single undo/redo action', () => {
  const a = fixture(),
    b = fixture(),
    operation = {
      type: 'scatter',
      idPrefix: 'grove',
      kind: 'cedar',
      seed: 77,
      count: 200,
      bounds: { minX: 10, maxX: 20, minZ: 40, maxZ: 60 },
    };
  for (const f of [a, b]) f.builder.applyBatch({ label: 'Scatter', operations: [operation] });
  assert.deepEqual(a.builder.exportLayout(), b.builder.exportLayout());
  for (const e of a.builder.exportLayout().entities) {
    assert.ok(e.position[0] >= 10 && e.position[0] <= 20);
    assert.ok(e.position[2] >= 40 && e.position[2] <= 60);
    assert.equal(e.position[1], e.position[0] * 0.1 + e.position[2] * 0.01);
  }
  assert.ok(a.builder.getState().drawBatches < 10);
  a.builder.undo();
  assert.equal(a.builder.getState().entityCount, 0);
  a.builder.redo();
  assert.equal(a.builder.getState().entityCount, 200);
  const saved = a.builder.exportLayout();
  saved.entities[0].position[0] = 999;
  assert.notEqual(a.builder.exportLayout().entities[0].position[0], 999);
  a.builder.undo();
  a.builder.applyBatch({ label: 'Fork', operations: [place()] });
  assert.equal(a.builder.redo(), false);
  a.builder.dispose();
  b.builder.dispose();
});
test('editing, region pages and imports keep stable IDs and can be reversed', () => {
  const { builder } = fixture();
  builder.applyBatch({ label: 'Start', operations: [place('a'), place('b')] });
  builder.applyBatch({
    label: 'Move',
    operations: [{ type: 'update', id: 'a', patch: { position: [20, 2, 40], color: '#abcdef' } }],
  });
  assert.equal(builder.inspect({ id: 'a' }).entities[0].color, '#abcdef');
  assert.equal(builder.inspect({ offset: 1, limit: 1 }).entities[0].id, 'b');
  const saved = builder.exportLayout();
  builder.importLayout({ version: 1, entities: [] });
  assert.equal(builder.getState().entityCount, 0);
  builder.undo();
  assert.deepEqual(builder.exportLayout(), saved);
  builder.dispose();
});
test('WebMCP discovers building tools, enforces schemas, saves/loads and exports complete pages', async () => {
  const { builder, scene } = fixture();
  scene.fog = new THREE.FogExp2();
  const renderer = { toneMappingExposure: 1 },
    sun = new THREE.DirectionalLight(),
    hemi = new THREE.HemisphereLight();
  const art = createArtDirection({ scene, renderer, sun, hemi });
  const memory = new Map(),
    storage = {
      get length() {
        return memory.size;
      },
      key: (i) => [...memory.keys()][i],
      getItem: (k) => memory.get(k) ?? null,
      setItem: (k, v) => memory.set(k, v),
    };
  const api = registerGameWebMCP({
    inspector: { snapshot: () => ({ scene: {} }) },
    getGameState: () => ({}),
    environment: {},
    building: {
      builder,
      storage,
      art,
      performance: { measure: async (durationSeconds) => ({ durationSeconds, averageFps: 60 }) },
      sampleRoute: (z) => ({ z }),
    },
  });
  await api.ready;
  assert.equal(api.list().length, 20);
  const invoke = async (name, input = {}) => {
    const response = await api.invoke(name, input);
    assert.equal(response.isError, undefined, JSON.stringify(response));
    return JSON.parse(response.content[0].text).result;
  };
  assert.equal((await invoke('measure_game_performance', { durationSeconds: 1 })).averageFps, 60);
  assert.equal(
    (await api.invoke('measure_game_performance', { durationSeconds: 99 })).isError,
    true,
  );
  await invoke('edit_level', { label: 'Grove', operations: [place()] });
  await invoke('save_level', { slot: 'test-layout' });
  await invoke('undo_level');
  await invoke('load_level', { slot: 'test-layout' });
  assert.equal(builder.getState().entityCount, 1);
  assert.equal((await invoke('export_level')).entities[0].id, 'tree');
  assert.equal((await invoke('list_levels'))[0].slot, 'test-layout');
  assert.deepEqual(await invoke('sample_route', { positions: [10, 20] }), [{ z: 10 }, { z: 20 }]);
  assert.equal(
    (
      await api.invoke('edit_level', {
        label: 'X',
        operations: [{ type: 'eval', script: 'alert(1)' }],
      })
    ).isError,
    true,
  );
  assert.equal(
    (await api.invoke('set_art_direction', { settings: { exposure: 100 } })).isError,
    true,
  );
  await invoke('set_art_direction', { settings: { exposure: 1.4, sunColor: '#ffeedd' } });
  art.apply();
  assert.equal(renderer.toneMappingExposure, 1.4);
  assert.equal(sun.color.getHexString(), 'ffeedd');
  await invoke('set_art_direction', { settings: {} });
  assert.deepEqual(art.getState().overrides, {});
  api.dispose();
  builder.dispose();
});
