import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createWetlandRoute } from '../src/world/wetland-route.js';
import { createRouteNetwork } from '../src/simulation/route-network.js';
import {
  createWetlandWaterProfile,
  wetlandSection,
  wetlandBedHeight,
  wetlandTerrainHeight,
} from '../src/simulation/wetland-profile.js';
import { routeCenter, routeElevation, scenicTerrain } from '../src/world/extended-route.js';

const railPoint = (z) => new THREE.Vector3(routeCenter(z) + 28, routeElevation(z), z);
function setup(terrain = scenicTerrain) {
  const points = [];
  for (let z = 2000; z <= 3200; z += 10) points.push(railPoint(z));
  const baseTrack = new THREE.CatmullRomCurve3(points);
  baseTrack.arcLengthDivisions = 1500;
  const network = createRouteNetwork({ THREE, baseTrack });
  const branchCurve = network.getBranchCurve('wetland');
  const scene = new THREE.Scene();
  const route = createWetlandRoute({ THREE, scene, branchCurve, terrain, railPoint });
  return { scene, route, branchCurve, terrain };
}

function ringCenter(attribute, ring) {
  const p = new THREE.Vector3();
  for (let j = 0; j < 4; j++)
    p.add(new THREE.Vector3().fromBufferAttribute(attribute, ring * 4 + j));
  return p.multiplyScalar(0.25);
}

test('running rails, sleepers and contact wire follow the actual route-network branch on grades', () => {
  const { route, scene, branchCurve } = setup();
  const left = scene.getObjectByName('wetland / left running rail').geometry.attributes.position;
  const right = scene.getObjectByName('wetland / right running rail').geometry.attributes.position;
  const wire = scene.getObjectByName('wetland / contact wire 7.35 metres above rail').geometry
    .attributes.position;
  const count = left.count / 4;
  for (let i = 0; i < count; i += 7) {
    const center = branchCurve.getPointAt(i / (count - 1));
    const l = ringCenter(left, i),
      r = ringCenter(right, i),
      w = ringCenter(wire, i);
    assert.ok(l.clone().add(r).multiplyScalar(0.5).distanceTo(center) < 0.0003);
    assert.ok(Math.abs(l.distanceTo(r) - 1.92) < 0.0003);
    assert.ok(w.distanceTo(center.clone().add(new THREE.Vector3(0, 7.35, 0))) < 0.0003);
  }
  for (const sleeper of route.getState().sleepers) {
    assert.ok(
      new THREE.Vector3(...sleeper.position).distanceTo(branchCurve.getPointAt(sleeper.t)) < 1e-9,
    );
  }
  assert.ok(route.getState().sleeperCount > 390);
  route.dispose();
});

test('timber piles meet sampled ground and the narrow deck stays below the rails', () => {
  const { route, terrain, scene } = setup();
  const state = route.getState();
  assert.equal(state.deckWidth, 3.05);
  assert.ok(state.supportCount > 40);
  for (const support of state.supports) {
    assert.equal(support.bottom, terrain(support.x, support.z));
    assert.ok(support.top > support.bottom);
  }
  const deck = scene.getObjectByName('wetland / narrow maintenance deck');
  const pose = new THREE.Matrix4(),
    position = new THREE.Vector3(),
    rotation = new THREE.Quaternion(),
    scale = new THREE.Vector3();
  for (let i = 0; i < deck.count; i++) {
    deck.getMatrixAt(i, pose);
    pose.decompose(position, rotation, scale);
    assert.ok(position.y + scale.y / 2 < railPoint(position.z).y - 0.23);
  }
  route.dispose();
  const raisedGround = setup((_x, z) => routeElevation(z) + 0.1);
  assert.equal(raisedGround.route.getState().supportCount, 0);
  assert.equal(raisedGround.scene.getObjectByName('wetland / narrow maintenance deck'), undefined);
  raisedGround.route.dispose();
});

test('public footbridge crosses a visible channel and continues to a far-bank bench clear of both tracks', () => {
  const { route, scene, branchCurve } = setup();
  const { landmarks, props } = route.getState();
  assert.ok(landmarks);
  assert.ok(landmarks.footbridge.length >= 18 && landmarks.footbridge.length <= 23);
  assert.equal(landmarks.footbridge.width, 1.56);
  assert.equal(landmarks.channel.length, 70);
  assert.deepEqual(landmarks.continuingPath.at(-1), landmarks.waitingBench);
  assert.ok(scene.getObjectByName('wetland / continuous wetland channel'));
  assert.ok(scene.getObjectByName('wetland / public footbridge path and waiting bench'));
  const branchSamples = Array.from({ length: 1001 }, (_, i) => branchCurve.getPointAt(i / 1000));
  for (const point of [...landmarks.continuingPath, landmarks.footbridge.nearBank]) {
    const p = new THREE.Vector3(...point);
    assert.ok(Math.min(...branchSamples.map((b) => Math.hypot(b.x - p.x, b.z - p.z))) > 4);
    assert.ok(Math.hypot(railPoint(p.z).x - p.x, railPoint(p.z).z - p.z) > 4);
  }
  for (const prop of props)
    assert.ok(prop.clearance >= (prop.kind === 'catenary' ? 3.5 : 4), prop.id);
  assert.equal(props.filter((p) => p.kind === 'shrub').length, 5);
  route.dispose();
});

test('route selection never hides an available running path or invents signal clearance', () => {
  const { route, scene } = setup();
  for (const selectedRoute of ['wetland', 'direct', 'wetland']) {
    route.update({ selectedRoute, position: new THREE.Vector3(0, 20, 2600) });
    const state = route.getState();
    assert.equal(state.selectedRoute, selectedRoute);
    assert.equal(state.visible, true);
    assert.equal(state.approach.indicatesClearance, false);
    assert.equal(scene.getObjectByName('wetland / left running rail').visible, true);
  }
  route.update({ position: [0, 0, 18000] });
  assert.equal(route.getState().visible, false);
  route.update({ position: [0, 0, 2200] });
  assert.equal(route.getState().visible, true);
  route.dispose();
});

test('fixed placements and resource count survive updates and release once on disposal', () => {
  const a = setup(),
    b = setup();
  assert.deepEqual(a.route.getState().props, b.route.getState().props);
  assert.deepEqual(a.route.getState().landmarks, b.route.getState().landmarks);
  assert.ok(a.route.getState().drawCalls <= 16);
  const geometries = new Set(),
    materials = new Set();
  a.scene.traverse((o) => {
    if (o.geometry) geometries.add(o.geometry);
    if (o.material) materials.add(o.material);
  });
  for (let i = 0; i < 100; i++)
    a.route.update({
      position: [0, 0, i % 2 ? 2200 : 16000],
      selectedRoute: i % 2 ? 'wetland' : 'direct',
    });
  const after = new Set();
  a.scene.traverse((o) => {
    if (o.geometry) after.add(o.geometry);
  });
  assert.deepEqual(after, geometries);
  let geometryDisposals = 0,
    materialDisposals = 0;
  for (const g of geometries) g.addEventListener('dispose', () => geometryDisposals++);
  for (const m of materials) m.addEventListener('dispose', () => materialDisposals++);
  a.route.dispose();
  a.route.dispose();
  b.route.dispose();
  assert.equal(geometryDisposals, geometries.size);
  assert.equal(materialDisposals, materials.size);
  assert.equal(a.scene.children.length, 0);
  assert.equal(a.route.getState().visible, false);
});

test('one level channel shares its exact footprint and excavated bed with regional terrain', () => {
  const { route, scene } = setup();
  const profile = createWetlandWaterProfile(railPoint);
  assert.deepEqual(route.getState().waterProfile, profile);
  const water = scene.getObjectByName('wetland / continuous wetland channel').geometry;
  const position = water.attributes.position;
  for (let i = 0; i < position.count; i++)
    assert.ok(Math.abs(position.getY(i) - profile.waterY) < 1e-5);
  for (let z = profile.centerZ - 34; z <= profile.centerZ + 34; z++) {
    const section = wetlandSection(z, profile);
    for (const side of [-0.9, -0.5, 0, 0.5, 0.9]) {
      const x = section.centerX + section.halfWidth * side;
      assert.ok(scenicTerrain(x, z) < profile.waterY - 0.27, `exposed terrain at ${x},${z}`);
      assert.equal(scenicTerrain(x, z), wetlandBedHeight(x, z, profile));
    }
  }
  const indices = water.index;
  for (let i = 0; i < indices.count; i += 3) {
    const a = new THREE.Vector3().fromBufferAttribute(position, indices.getX(i));
    const b = new THREE.Vector3().fromBufferAttribute(position, indices.getX(i + 1));
    const c = new THREE.Vector3().fromBufferAttribute(position, indices.getX(i + 2));
    assert.ok(b.sub(a).cross(c.sub(a)).y >= -1e-7, 'water front faces point upward');
  }
  route.dispose();
});

test('wetland terrain blend is bounded and leaves both railway beds untouched', () => {
  const profile = createWetlandWaterProfile(railPoint);
  assert.equal(wetlandBedHeight(profile.centerX, 2500, profile), null);
  assert.equal(wetlandTerrainHeight(profile.centerX + 50, profile.centerZ, 37, profile), 37);
  for (let z = 2460; z <= 2760; z += 2) {
    const main = railPoint(z);
    const branchX = main.x - 12 * Math.sin((Math.PI * (z - 2460)) / 300) ** 4;
    for (const x of [main.x, branchX]) {
      assert.equal(wetlandBedHeight(x, z, profile), null, `cut entered railway at ${z}`);
      assert.equal(wetlandTerrainHeight(x, z, 37, profile), 37);
    }
  }
});
