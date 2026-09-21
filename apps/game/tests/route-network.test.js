import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {
  createRouteNetwork,
  WETLAND_BRANCH,
  branchOffsetAtZ,
} from '../src/simulation/route-network.js';
import { distanceAtZ } from '../src/simulation/stops.js';
import { routeCenter, routeElevation } from '../src/world/extended-route.js';

function baseCurve(
  sample = (z) => new THREE.Vector3(Math.sin(z / 450) * 15, z * 0.02, z),
  start = 0,
  end = 4000,
) {
  const points = [];
  for (let z = start; z <= end; z += 10) points.push(sample(z));
  const curve = new THREE.CatmullRomCurve3(points);
  curve.arcLengthDivisions = points.length * 4;
  curve.updateArcLengths();
  return curve;
}
function setup() {
  const baseTrack = baseCurve();
  const network = createRouteNetwork({ THREE, baseTrack });
  return { network, baseTrack };
}
const pointAtDistance = (curve, distance) => curve.getPointAt(distance / curve.getLength());
const positions = (track, distance, direction, span = 27) =>
  [0, span / 2, span].map((offset) => pointAtDistance(track, distance - direction * offset));

test('wetland offset is leftward, bounded and flat at both shared joins', () => {
  assert.deepEqual(WETLAND_BRANCH, { startZ: 2460, endZ: 2760, maxOffset: 12 });
  for (const z of [-100, 2459, 2460, 2760, 2800]) assert.equal(branchOffsetAtZ(z), 0);
  assert.equal(branchOffsetAtZ(2610), -12);
  assert.ok(Math.abs(branchOffsetAtZ(2460.01)) < 1e-10);
  assert.ok(Math.abs(branchOffsetAtZ(2759.99)) < 1e-10);
  for (let z = 2460; z <= 2760; z++)
    assert.ok(branchOffsetAtZ(z) <= 0 && branchOffsetAtZ(z) >= -12);
  assert.throws(() => branchOffsetAtZ(NaN), /finite/);
});

test('the exact renderable branch joins base position and tangent and retains increasing Z', () => {
  const { network, baseTrack } = setup();
  const branch = network.getBranchCurve();
  for (const [u, z] of [
    [0, 2460],
    [1, 2760],
  ]) {
    const baseDistance = network.baseDistanceAtZ(z);
    assert.ok(branch.getPointAt(u).distanceTo(pointAtDistance(baseTrack, baseDistance)) < 1e-8);
    assert.ok(
      branch.getTangentAt(u).angleTo(baseTrack.getTangentAt(baseDistance / baseTrack.getLength())) <
        1e-7,
    );
    const nearU = u === 0 ? 1e-5 : 1 - 1e-5;
    assert.ok(
      branch.getTangentAt(nearU).angleTo(branch.getTangentAt(u)) < 0.001,
      'the approaching tangent is continuous too',
    );
  }
  let previousZ = -Infinity;
  for (let i = 0; i <= 1200; i++) {
    const p = branch.getPointAt(i / 1200);
    assert.ok(p.z > previousZ);
    previousZ = p.z;
    const basePoint = pointAtDistance(baseTrack, network.baseDistanceAtZ(p.z));
    assert.ok(Math.abs(p.x - basePoint.x - branchOffsetAtZ(p.z)) < 1e-7);
    assert.ok(Math.abs(p.y - basePoint.y) < 1e-7);
    assert.ok(Math.abs(branch.getTangentAt(i / 1200).length() - 1) < 1e-12);
  }
});

test('selecting routes while stopped preserves every carriage pose before and after the branch in both directions', () => {
  for (const direction of [1, -1])
    for (const z of [2300, 2900]) {
      const { network } = setup();
      let distance = network.distanceAtZ(z);
      const original = positions(network, distance, direction);
      const selected = network.selectRoute('wetland', {
        distance,
        direction,
        trainSpan: 27,
        speed: 0,
      });
      assert.equal(selected.ok, true);
      assert.equal(selected.changed, true);
      distance = selected.distance;
      positions(network, distance, direction).forEach((point, i) =>
        assert.ok(point.distanceTo(original[i]) < 1e-7),
      );
      const restored = network.selectRoute('direct', {
        distance,
        direction,
        trainSpan: 27,
        speed: 0,
      });
      assert.equal(restored.ok, true);
      positions(network, restored.distance, direction).forEach((point, i) =>
        assert.ok(point.distanceTo(original[i]) < 1e-7),
      );
    }
});

test('the entire train and both turnout clearances prevent a route change until its tail clears', () => {
  for (const direction of [1, -1]) {
    const { network } = setup();
    const edge = direction === 1 ? 2760 : 2460;
    // Leading carriage has left the branch, but its following cars have not.
    const distance = network.distanceAtZ(edge) + direction * 15;
    assert.equal(
      network.selectRoute('wetland', { distance, direction, trainSpan: 27 }).reason,
      'turnout-occupied',
    );
    const clear = network.distanceAtZ(edge) + direction * (27 + 6.3 + 10.01);
    assert.equal(
      network.selectRoute('wetland', { distance: clear, direction, trainSpan: 27 }).ok,
      true,
    );
  }
  const { network } = setup();
  for (const z of [2450, 2460, 2600, 2760, 2770])
    assert.equal(
      network.selectRoute('wetland', { distance: network.distanceAtZ(z) }).reason,
      'turnout-occupied',
    );
  assert.equal(network.getState().selectedRoute, 'direct');
});

test('wetland occupancy uses its own physical distances after the longer route is selected', () => {
  const { network } = setup();
  network.selectRoute('wetland', { distance: network.distanceAtZ(2300) });
  const occupied = network.distanceAtZ(2760) + 20;
  assert.equal(
    network.selectRoute('direct', { distance: occupied, direction: 1 }).reason,
    'turnout-occupied',
  );
  const before = network.getState();
  assert.ok(before.branch.endDistance > before.branch.baseEndDistance);
  assert.equal(network.getState().selectedRoute, 'wetland');
  const same = network.selectRoute('wetland', { distance: network.distanceAtZ(2600), speed: 20 });
  assert.equal(same.ok, true);
  assert.equal(same.changed, false, 'an identical route request does not move anything');
});

test('distance advances by physical metres along the shared rendered curve without a speed jump at joins', () => {
  const { network } = setup();
  network.selectRoute('wetland', { distance: network.distanceAtZ(2300) });
  const branch = network.getBranchCurve();
  const state = network.getState();
  for (let u = 0; u <= 1; u += 0.025) {
    const distance = state.branch.startDistance + u * state.branch.branchLength;
    assert.ok(pointAtDistance(network, distance).distanceTo(branch.getPointAt(u)) < 1e-7);
  }
  const increment = 0.05;
  for (
    let distance = state.branch.startDistance - 2;
    distance < state.branch.endDistance + 2;
    distance += 0.1
  ) {
    const travelled = pointAtDistance(network, distance + increment).distanceTo(
      pointAtDistance(network, distance),
    );
    assert.ok(
      Math.abs(travelled - increment) < 0.0001,
      `distance metric near ${distance}: ${travelled}`,
    );
  }
  assert.ok(Math.abs(network.getLength() - state.baseLength - state.branch.extraLength) < 1e-9);
});

test('station distances remap by world Z and the existing distanceAtZ helper remains compatible', () => {
  const { network, baseTrack } = setup();
  network.selectRoute('wetland', { distance: network.distanceAtZ(2300) });
  for (const z of [0, 525, 1500, 2459, 2460, 2510, 2610, 2760, 3100, 3999, 4000]) {
    const baseDistance = network.baseDistanceAtZ(z);
    const mapped = network.baseDistanceToSelectedDistance(baseDistance);
    assert.ok(Math.abs(pointAtDistance(network, mapped).z - z) < 1e-7);
    assert.ok(Math.abs(mapped - network.distanceAtZ(z)) < 1e-7);
    assert.ok(Math.abs(distanceAtZ(network, network.getLength(), z) - mapped) < 0.0001);
    if (z >= 2760)
      assert.ok(Math.abs(mapped - baseDistance - network.getState().branch.extraLength) < 1e-8);
  }
  assert.equal(baseTrack.getLength(), network.getState().baseLength);
  assert.equal(network.distanceAtZ(-100), 0);
  assert.equal(network.distanceAtZ(5000), network.getLength());
  assert.deepEqual(network.getState(), JSON.parse(JSON.stringify(network.getState())));
});

test('invalid input and moving selection fail without changing the route', () => {
  const { network } = setup();
  const initial = network.getState();
  assert.equal(
    network.selectRoute('wetland', { distance: 2300, speed: 0.2 }).reason,
    'train-moving',
  );
  assert.equal(network.selectRoute('missing', { distance: 2300 }).reason, 'unknown-route');
  for (const patch of [
    { distance: NaN },
    { distance: -1 },
    { distance: 100000 },
    { direction: 0 },
    { trainSpan: -1 },
    { speed: Infinity },
    { speed: -2 },
  ])
    assert.equal(
      network.selectRoute('wetland', { distance: 2300, ...patch }).reason,
      'invalid-train-state',
    );
  assert.deepEqual(network.getState(), initial);
  assert.throws(() => network.getPointAt(Infinity), /finite/);
  assert.throws(() => network.distanceAtZ(NaN), /finite/);
  assert.throws(() => network.baseDistanceToSelectedDistance(-1), /Base distance/);
  assert.throws(() => network.getBranchCurve('freight'), /wetland/);
  assert.throws(
    () =>
      createRouteNetwork({ THREE, baseTrack: baseCurve(), branch: { startZ: 3000, endZ: 2000 } }),
    /branch/,
  );
  const reversed = baseCurve();
  reversed.points.reverse();
  reversed.updateArcLengths();
  assert.throws(() => createRouteNetwork({ THREE, baseTrack: reversed }), /branch|monotonically/);
});

test('the game’s 24 km base route supports the optional branch without changing its authored endpoints', () => {
  const baseTrack = baseCurve(
    (z) => new THREE.Vector3(routeCenter(z) + 28, routeElevation(z), z),
    -790,
    24000,
  );
  const network = createRouteNetwork({ THREE, baseTrack });
  const selection = network.selectRoute('wetland', {
    distance: network.distanceAtZ(2300),
    trainSpan: 27,
  });
  assert.equal(selection.ok, true);
  for (const z of [-790, 525, 1500, 3100, 4700, 6250, 11500, 12800, 23300, 24000]) {
    const basePosition = pointAtDistance(baseTrack, network.baseDistanceAtZ(z));
    assert.ok(basePosition.distanceTo(pointAtDistance(network, network.distanceAtZ(z))) < 1e-7);
  }
  const nearStart = network.getState().branch.startDistance;
  const difference = pointAtDistance(network, nearStart + 0.01).sub(
    pointAtDistance(network, nearStart - 0.01),
  );
  assert.ok(Math.abs(difference.length() - 0.02) < 0.0001);
});
