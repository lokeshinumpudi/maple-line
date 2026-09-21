import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {
  regionalLakes,
  shorelineRadius,
  lakeRadius,
  lakeShorePlan,
} from '../src/world/lake-scenery.js';
import {
  routeCenter,
  routeElevation,
  scenicTerrain,
  createExtendedWorld,
} from '../src/world/extended-route.js';
const railPoint = (z) => new THREE.Vector3(routeCenter(z) + 28, routeElevation(z), z);

test('lake coves use the same shoreline as terrain and leave the railway shelf dry', () => {
  for (const lake of regionalLakes) {
    for (let a = 0; a < Math.PI * 2; a += 0.08) {
      const r = shorelineRadius(lake, a);
      const x = routeCenter(lake.z) + lake.u + Math.cos(a) * lake.rx * r;
      const z = lake.z + Math.sin(a) * lake.rz * r;
      assert.ok(Math.abs(lakeRadius(lake, x, z, routeCenter) - 1) < 1e-10);
      assert.ok(scenicTerrain(x, z) < routeElevation(lake.z) - lake.drop);
    }
    for (let z = lake.z - lake.rz; z <= lake.z + lake.rz; z += 5) {
      const p = railPoint(z);
      assert.ok(Math.abs(scenicTerrain(p.x, z) - (p.y - 0.65)) < 1e-8);
    }
  }
});

test('lake surfaces face upward, cascades freeze on pause and release with their owner chunk', () => {
  const scene = new THREE.Scene(),
    world = createExtendedWorld({ THREE, scene, railPoint });
  world.update(0.5, { position: railPoint(4700) });
  assert.equal(world.getState().lakes[0].cascades, 3);
  let water;
  scene.traverse((mesh) => {
    if (mesh.name === 'Aonuma / cedar falls / open water') water = mesh;
  });
  assert.ok(water);
  const normals = water.geometry.attributes.normal;
  assert.ok(normals.getY(140) > 0.99);
  world.update(0, { position: railPoint(4700) });
  assert.equal(world.getState().lakes[0].time, 0.5);
  let disposed = false;
  water.geometry.addEventListener('dispose', () => {
    disposed = true;
  });
  world.update(0.25, { position: railPoint(14400) });
  assert.ok(disposed);
  assert.equal(world.getState().lakes[0].cascades, 6);
  world.update(0, { position: railPoint(4700) });
  assert.equal(world.getState().lakes[0].time, 0);
  assert.ok(world.getState().loadedChunks.length <= 5);
  world.dispose();
});

test('lake shore access follows dry coves, keeps buildings on land and boats within water', () => {
  for (const lake of regionalLakes) {
    const plan = lakeShorePlan(lake, routeCenter, routeElevation, scenicTerrain);
    assert.deepEqual(plan, lakeShorePlan(lake, routeCenter, routeElevation, scenicTerrain));
    assert.equal(plan.trail.length, 33);
    assert.ok(plan.house);
    assert.equal(plan.boats.length, 2);
    for (const p of plan.trail) {
      assert.ok(lakeRadius(lake, p.x, p.z, routeCenter) > 1.075);
      assert.ok(scenicTerrain(p.x, p.z) > plan.waterY + 0.35);
      assert.ok(p.x < routeCenter(p.z) + 18);
    }
    for (let i = 1; i < plan.trail.length; i++) {
      assert.ok(
        Math.hypot(plan.trail[i].x - plan.trail[i - 1].x, plan.trail[i].z - plan.trail[i - 1].z) <
          12,
      );
    }
    for (const dx of [-3.5, 3.5])
      for (const dz of [-4.5, 4.5]) {
        const x = plan.house.x + dx,
          z = plan.house.z + dz;
        assert.ok(lakeRadius(lake, x, z, routeCenter) > 1.075);
        assert.ok(scenicTerrain(x, z) > plan.waterY + 0.35);
        assert.ok(plan.house.y > scenicTerrain(x, z));
      }
    for (const boat of plan.boats) {
      for (const dx of [-2.5, 2.5])
        for (const dz of [-2.5, 2.5]) {
          assert.ok(lakeRadius(lake, boat.x + dx, boat.z + dz, routeCenter) < 1);
        }
    }
    assert.ok(plan.grove.length <= 14 && plan.reeds.length <= 24);
  }
});
