import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {
  addRegionalBuilding,
  createRegionalArchitectureCatalog,
  REGIONAL_BUILDING_TYPES,
} from '../src/world/regional-architecture.js';
/** Material keys the extended-route chunk builder resolves through its shared catalog. */
const MATERIAL_CATALOG = ['stone', 'timber', 'cream', 'roof', 'snow', 'red', 'rail', 'glass'];
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
function worldBounds(p) {
  const hx = (Math.abs(Math.cos(p.yaw)) * p.sx + Math.abs(Math.sin(p.yaw)) * p.sz) / 2;
  const hz = (Math.abs(Math.sin(p.yaw)) * p.sx + Math.abs(Math.cos(p.yaw)) * p.sz) / 2;
  return { minX: p.x - hx, maxX: p.x + hx, minZ: p.z - hz, maxZ: p.z + hz };
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
    assert.ok(parts.length <= 56, `${type} emits ${parts.length} instances`);
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
test('every emitted part uses a material key from the shared chunk catalog', () => {
  for (const type of REGIONAL_BUILDING_TYPES)
    for (const theme of ['farmland', 'snow', 'harbour'])
      for (const p of build({ type, theme }).parts)
        assert.ok(MATERIAL_CATALOG.includes(p.material), `${type}: ${p.material}`);
});
test('rejected lots emit nothing for every type and yaw', () => {
  for (const type of REGIONAL_BUILDING_TYPES)
    for (const yaw of [0, 0.4, Math.PI / 2]) {
      const result = build({ type, yaw, x: 9, isAllowed: (bounds) => bounds.minX > 8 });
      assert.equal(result.metadata, null);
      assert.equal(result.parts.length, 0);
    }
});
test('transformed xz bounds of every part stay inside the footprint at yaw 0, 0.4 and pi/2', () => {
  for (const type of REGIONAL_BUILDING_TYPES)
    for (const yaw of [0, 0.4, Math.PI / 2, -Math.PI / 2]) {
      const { metadata, parts } = build({ type, yaw });
      assert.ok(parts.length > 0);
      for (const p of parts) {
        const b = worldBounds(p);
        const tag = `${type} yaw ${yaw} ${p.material}`;
        assert.ok(b.minX >= metadata.footprint.minX - 1e-9, tag);
        assert.ok(b.maxX <= metadata.footprint.maxX + 1e-9, tag);
        assert.ok(b.minZ >= metadata.footprint.minZ - 1e-9, tag);
        assert.ok(b.maxZ <= metadata.footprint.maxZ + 1e-9, tag);
      }
    }
});
test('same type on different seeded lots shares structure with dimensions inside the scale band', () => {
  const profiles = {
    'tile-home': [8, 4.1, 7],
    farmhouse: [11, 3.6, 8],
    shopfront: [6.8, 6.3, 7.5],
    storehouse: [6, 6.8, 8],
    'snow-lodge': [7.4, 4.4, 8.8],
    'harbour-shed': [12, 3.8, 7],
  };
  for (const type of REGIONAL_BUILDING_TYPES) {
    const a = build({ type });
    const b = build({ type, id: 'lot-9', x: 140, z: 2200 });
    assert.equal(a.parts.length, b.parts.length);
    assert.deepEqual(
      a.parts.map((p) => [p.geometry, p.material]),
      b.parts.map((p) => [p.geometry, p.material]),
    );
    for (const { parts } of [a, b]) {
      const body = parts[1];
      const [w, h, d] = profiles[type];
      const scale = body.sx / w;
      assert.ok(scale >= 0.85 && scale <= 1.15, `${type} scale ${scale}`);
      assert.ok(Math.abs(body.sy / h - scale) < 1e-9);
      assert.ok(Math.abs(body.sz / d - scale) < 1e-9);
    }
    assert.deepEqual(build({ type }), a);
  }
});
test('side and rear detailing sits on the walls and leaves the front door clear', () => {
  for (const type of REGIONAL_BUILDING_TYPES) {
    const { parts } = build({ type, yaw: 0 });
    const [, body] = parts;
    const front = body.z + body.sz / 2 + 0.07;
    const door = parts.find((p) => p.x === body.x && p.z === front && p.sy === 2.3);
    assert.ok(door, `${type} door`);
    // Full-width facade bands and the harbour sliding panel behind the door are backing layers.
    const contains = (p) =>
      Math.abs(p.x - door.x) + door.sx / 2 <= p.sx / 2 + 1e-9 && p.sy >= door.sy;
    const blocking = parts.filter(
      (p) =>
        p !== door &&
        p.sx > 0.2 &&
        p.sx < body.sx - 0.5 &&
        !contains(p) &&
        Math.abs(p.z - front) < 0.3 &&
        Math.abs(p.x - door.x) < (p.sx + door.sx) / 2 &&
        Math.abs(p.y - door.y) < (p.sy + door.sy) / 2,
    );
    assert.equal(blocking.length, 0, `${type} door blocked by ${blocking.length} parts`);
    const sideWindows = parts.filter(
      (p) => p.material === 'timber' && p.sx === 0.17 && Math.abs(p.x - body.x) > body.sx / 2,
    );
    assert.ok(sideWindows.length >= 1, `${type} side windows`);
    for (const p of sideWindows) {
      assert.ok(Math.abs(p.z - body.z) + p.sz / 2 < body.sz / 2, `${type} side window on wall`);
      assert.ok(p.y + p.sy / 2 < body.y + body.sy / 2, `${type} side window under eave`);
    }
    const rearWindow = parts.find((p) => p.material === 'timber' && p.sz === 0.17 && p.z < body.z);
    assert.ok(rearWindow, `${type} rear window`);
    assert.ok(Math.abs(rearWindow.x - body.x) < 0.001);
    if (type === 'farmhouse')
      assert.ok(
        sideWindows.every((p) => p.x < body.x),
        'farmhouse windows avoid the shed side',
      );
    if (type === 'storehouse')
      assert.ok(
        parts.some((p) => p.material === 'stone' && p.sy === 0.1),
        'storehouse stone sills',
      );
    if (type === 'harbour-shed')
      assert.ok(
        parts.some((p) => p.material === 'rail' && Math.abs(p.x - body.x) > body.sx / 2),
        'harbour shutters',
      );
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
