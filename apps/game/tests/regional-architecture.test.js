import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {
  addRegionalBuilding,
  createRegionalArchitectureCatalog,
  REGIONAL_BUILDING_TYPES,
} from '../src/world/regional-architecture.js';
function build(extra = {}) {
  const parts = [];
  const metadata = addRegionalBuilding({
    emit: (part) => parts.push(part),
    id: 'farm-2',
    x: 80,
    y: 12,
    z: 1200,
    ...extra,
  });
  return { metadata, parts };
}
test('building grammar is deterministic independent of other building generation', () => {
  const first = build();
  build({ id: 'unrelated', z: 900 });
  assert.deepEqual(build(), first);
  assert.notDeepEqual(build({ id: 'farm-3' }), first);
  assert.deepEqual(JSON.parse(JSON.stringify(first)), first);
});
test('six building silhouettes use bounded shared instances and finite transforms', () => {
  const silhouettes = new Set();
  for (const type of REGIONAL_BUILDING_TYPES) {
    const { parts, metadata } = build({ type, yaw: 0.71 });
    assert.ok(parts.length <= 40);
    assert.equal(metadata.instanceCount, parts.length);
    assert.ok(parts.some((p) => p.geometry === 'gable'));
    for (const part of parts) {
      assert.ok(['box', 'gable'].includes(part.geometry));
      for (const key of ['x', 'y', 'z', 'sx', 'sy', 'sz', 'yaw'])
        assert.ok(Number.isFinite(part[key]));
      assert.ok(part.sx > 0 && part.sy > 0 && part.sz > 0);
    }
    silhouettes.add(JSON.stringify(parts.map((p) => [p.geometry, p.sx, p.sy, p.sz])));
  }
  assert.equal(silhouettes.size, 6);
});
test('clearance rejection emits no geometry and includes porch and roof extents', () => {
  const result = build({ x: 9, isAllowed: (bounds) => bounds.minX > 8 });
  assert.equal(result.metadata, null);
  assert.equal(result.parts.length, 0);
  for (const type of REGIONAL_BUILDING_TYPES) {
    const { metadata, parts } = build({ type, yaw: 0.9 });
    for (const p of parts) {
      const hx = (Math.abs(Math.cos(p.yaw)) * p.sx + Math.abs(Math.sin(p.yaw)) * p.sz) / 2;
      const hz = (Math.abs(Math.sin(p.yaw)) * p.sx + Math.abs(Math.cos(p.yaw)) * p.sz) / 2;
      assert.ok(p.x - hx >= metadata.footprint.minX && p.x + hx <= metadata.footprint.maxX);
      assert.ok(p.z - hz >= metadata.footprint.minZ && p.z + hz <= metadata.footprint.maxZ);
    }
  }
});
test('shared gable roof has two pitched faces and valid unit normals', () => {
  const { gable } = createRegionalArchitectureCatalog(THREE);
  gable.computeBoundingBox();
  assert.deepEqual(gable.boundingBox.min.toArray(), [-0.5, 0, -0.5]);
  assert.deepEqual(gable.boundingBox.max.toArray(), [0.5, 1, 0.5]);
  const normals = gable.getAttribute('normal');
  for (let i = 0; i < normals.count; i++)
    assert.ok(
      Math.abs(Math.hypot(normals.getX(i), normals.getY(i), normals.getZ(i)) - 1) < 0.00001,
    );
  gable.dispose();
});
