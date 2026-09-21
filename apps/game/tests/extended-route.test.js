import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {
  ROUTE_START_Z,
  ROUTE_END_Z,
  additionalStops,
  landmarks,
  routeCenter,
  routeElevation,
  routeGrade,
  scenicTerrain,
  createExtendedWorld,
} from '../src/world/extended-route.js';
const railPoint = (z) => new THREE.Vector3(routeCenter(z) + 28, routeElevation(z), z);
function fixture() {
  const scene = new THREE.Scene();
  const world = createExtendedWorld({ THREE, scene, railPoint, center: routeCenter });
  return { scene, world };
}

test('extension connects continuously and reaches a snowy summit without grades above four percent', () => {
  assert.equal(routeElevation(ROUTE_START_Z), 4.75);
  assert.ok(Math.abs(routeCenter(790.001) - routeCenter(790)) < 0.01);
  assert.ok(Math.abs(routeElevation(790.001) - 4.75) < 1e-8);
  let maximumGrade = 0;
  for (let z = 790; z <= ROUTE_END_Z; z += 2)
    maximumGrade = Math.max(maximumGrade, Math.abs(routeGrade(z)));
  assert.ok(maximumGrade <= 0.04000001);
  assert.ok(routeElevation(landmarks.summitZ) > 395);
  assert.ok(routeElevation(ROUTE_END_Z) < 100);
  for (const z of [1790, 10500, 11800, 13700, 14700, 22400, 23600])
    assert.ok(Math.abs(routeElevation(z - 0.001) - routeElevation(z + 0.001)) < 0.0001);
});

test('fourteen named stations are ordered along one fixed regional route', () => {
  assert.equal(additionalStops.length, 14);
  assert.equal(new Set(additionalStops.map((stop) => stop.id)).size, 14);
  for (let i = 0; i < additionalStops.length; i++) {
    const stop = additionalStops[i];
    assert.ok(stop.name && stop.japanese && stop.theme);
    assert.ok(stop.z > 790 && stop.z < ROUTE_END_Z);
    if (i) assert.ok(stop.z - additionalStops[i - 1].z >= 1500);
  }
});

test('the five-hundred-foot bridge crosses a ravine, and mountain terrain covers the tunnel roof', () => {
  assert.equal(landmarks.bridgeSpan, 152.4);
  const bridge = railPoint(landmarks.bridgeZ);
  assert.ok(bridge.y - scenicTerrain(bridge.x, bridge.z) > 70);
  const portal = railPoint(landmarks.tunnelStartZ + 40);
  assert.ok(scenicTerrain(portal.x, portal.z) > portal.y + 20);
});

test('scenery loads lazily, keeps at most five chunks, and releases old canopy cells on travel', () => {
  const { scene, world } = fixture();
  assert.equal(world.getState().loadedChunks.length, 0);
  world.update(0.016, { position: railPoint(1500) });
  assert.ok(world.getState().loadedChunks.length <= 5);
  assert.ok(world.getState().loadedStations.some((stop) => stop.id === 'sakuragawa'));
  const firstKeys = world.getState().loadedChunks;
  world.update(0.016, { position: railPoint(12800) });
  assert.ok(world.getState().loadedChunks.every((key) => !firstKeys.includes(key)));
  assert.ok(world.getState().loadedStations.some((stop) => stop.id === 'yukihara'));
  assert.equal(world.foliageHeight(100, 1500), -Infinity);
  world.update(0.016, { position: railPoint(23900) });
  assert.ok(world.getState().loadedChunks.length <= 5);
  let invalid = 0;
  scene.traverse((o) => {
    if (o.isInstancedMesh)
      for (const value of o.instanceMatrix.array) if (!Number.isFinite(value)) invalid++;
  });
  assert.equal(invalid, 0);
  world.dispose();
  assert.equal(scene.children.length, 0);
  assert.deepEqual(world.getState().loadedChunks, []);
  assert.doesNotThrow(() => world.dispose());
});

test('the tunnel is an open arch, not a solid mesh across the track', () => {
  const { scene, world } = fixture();
  world.update(0.016, { position: railPoint(11500) });
  scene.updateMatrixWorld(true);
  const tunnel = [];
  scene.traverse((o) => {
    if (o.isMesh && o.name.includes('tunnel /')) tunnel.push(o);
  });
  assert.ok(tunnel.some((o) => o.name.includes('open arch interior')));
  assert.ok(tunnel.some((o) => o.name.includes('open stone portal')));
  const origin = railPoint(landmarks.tunnelStartZ + 2);
  origin.y += 3;
  const direction = railPoint(landmarks.tunnelEndZ - 2)
    .add(new THREE.Vector3(0, 3, 0))
    .sub(origin)
    .normalize();
  const ray = new THREE.Raycaster(
    origin,
    direction,
    0,
    landmarks.tunnelEndZ - landmarks.tunnelStartZ - 4,
  );
  assert.equal(ray.intersectObjects(tunnel, false).length, 0);
  world.dispose();
});

test('both tunnel approaches remain excavated and do not put a hillside across the cab', () => {
  const { scene, world } = fixture();
  world.update(0.016, { position: railPoint(11500) });
  scene.updateMatrixWorld(true);
  const terrain = [];
  scene.traverse((o) => {
    if (o.isMesh && (o.name === 'Mountain and valley terrain' || o.name.includes('tunnel /')))
      terrain.push(o);
  });
  for (const [entrance, direction] of [
    [landmarks.tunnelStartZ, 1],
    [landmarks.tunnelEndZ, -1],
  ]) {
    for (let d = 1; d < 100; d += 3) {
      const z = entrance - direction * d,
        p = railPoint(z);
      assert.ok(scenicTerrain(p.x, z) < p.y);
    }
    const origin = railPoint(entrance - direction * 80).add(new THREE.Vector3(0, 3, 0)),
      target = railPoint(entrance + direction * 35).add(new THREE.Vector3(0, 3, 0));
    const ray = new THREE.Raycaster(
      origin,
      target.clone().sub(origin).normalize(),
      0,
      origin.distanceTo(target),
    );
    assert.equal(
      ray.intersectObjects(terrain, false).length,
      0,
      'portal approach must have an unobstructed driver sightline',
    );
  }
  world.dispose();
});
