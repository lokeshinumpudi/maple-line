import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {
  createExtendedWorld,
  routeCenter,
  routeElevation,
  scenicTerrain,
  additionalStops,
} from '../src/world/extended-route.js';
import { SCENIC_BENDS } from '../src/simulation/scenic-alignment.js';
import { operatingEnvelope } from '../src/simulation/operating-rules.js';
const railPoint = (z) => new THREE.Vector3(routeCenter(z) + 28, routeElevation(z), z);

test('regional village lots and residents remain the same after unloading and revisiting', () => {
  const scene = new THREE.Scene(),
    world = createExtendedWorld({ THREE, scene, railPoint });
  world.update(0, { position: railPoint(1500) });
  const first = world.getState();
  assert.ok(first.buildings.length >= 8);
  assert.ok(new Set(first.buildings.map((b) => b.type)).size >= 3);
  assert.ok(first.farms.length >= 12);
  assert.ok(first.residents.length >= 1);
  for (const building of first.buildings)
    assert.ok(
      building.footprint.minX >
        railPoint((building.footprint.minZ + building.footprint.maxZ) / 2).x + 5,
    );
  world.update(0, { position: railPoint(12800) });
  world.update(0, { position: railPoint(1500) });
  assert.deepEqual(world.getState().buildings, first.buildings);
  assert.deepEqual(world.getState().farms, first.farms);
  world.dispose();
  assert.equal(scene.children.length, 0);
});

test('composed scenic bends maintain gentle curvature, operating caps and clear station rails', () => {
  for (const bend of SCENIC_BENDS) {
    for (let z = bend.start; z <= bend.end; z += 2) {
      const h = 0.5,
        dx = (routeCenter(z + h) - routeCenter(z - h)) / (2 * h);
      const dd = (routeCenter(z + h) - 2 * routeCenter(z) + routeCenter(z - h)) / (h * h);
      assert.ok(Math.abs(dd) / Math.pow(1 + dx * dx, 1.5) < 1 / 500);
      assert.ok(operatingEnvelope(z).limitKmh <= 80);
    }
  }
  for (const stop of additionalStops) {
    const p = railPoint(stop.z);
    assert.ok(Math.abs(scenicTerrain(p.x, p.z) - (p.y - 0.65)) < 1e-6);
  }
});
