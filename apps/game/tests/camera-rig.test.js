import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createCameraRig } from '../src/camera/camera-rig.js';
import { cabPose } from '../src/camera/camera.js';

const center = (z) => 22 * Math.sin(z * 0.006) + 12 * Math.sin(z * 0.014);
const track = new THREE.CatmullRomCurve3(
  Array.from({ length: 161 }, (_, i) => {
    const z = -800 + i * 10;
    return new THREE.Vector3(center(z) + 28, 4.75, z);
  }),
);
const trackLength = track.getLength();
const valley = (u, z) =>
  Math.abs(u) < 40 ? 1 : 1 + (Math.abs(u) - 40) * 1.4 + 4 * Math.sin(z * 0.015);
function fixture(terrain = valley, foliageHeight) {
  const camera = new THREE.PerspectiveCamera(48, 16 / 9, 0.5, 1800);
  const rig = createCameraRig({
    THREE,
    camera,
    track,
    trackLength,
    terrain,
    center,
    foliageHeight,
  });
  return { rig, camera };
}

test('cab remains exactly on its rigid front anchor at 90 km/h through curves and reversals', () => {
  const { rig, camera } = fixture();
  for (const direction of [1, -1]) {
    for (let distance = 60; distance < trackLength - 60; distance += 25 / 15) {
      rig.update({ dt: 1 / 15, distance, direction, view: 'cab' });
      const expected = cabPose(track, distance, trackLength, direction);
      assert.ok(camera.position.distanceTo(expected.eye) < 1e-8);
      assert.ok(new THREE.Vector3(...rig.state().target).distanceTo(expected.target) < 1e-8);
    }
  }
});

test('scenic and follow preserve terrain clearance and a train sightline while moving', () => {
  const { rig, camera } = fixture();
  for (const view of ['scenic', 'follow'])
    for (let distance = 100; distance < trackLength - 100; distance += 3) {
      rig.update({ dt: 0.12, distance, direction: 1, view });
      const position = track.getPointAt(distance / trackLength);
      const subject = position.clone().add(new THREE.Vector3(0, 3, 0));
      assert.ok(
        camera.position.y >=
          valley(camera.position.x - center(camera.position.z), camera.position.z) + 1.9,
      );
      for (let i = 6; i <= 80; i++) {
        const sample = subject.clone().lerp(camera.position, i / 80);
        assert.ok(
          sample.y >= valley(sample.x - center(sample.z), sample.z) + 1.5,
          `terrain blocks ${view} at ${distance}`,
        );
      }
      assert.ok(
        camera.position.y - position.y < 70,
        'valley framing should remain near the railway',
      );
    }
});

test('scenic framing has a restrained orbit over time while follow stays behind the train', () => {
  const { rig, camera } = fixture(() => -5);
  rig.update({ dt: 0.1, distance: 500, view: 'scenic', time: 0, snap: true });
  const before = camera.position.clone();
  rig.update({ dt: 0.1, distance: 500, view: 'scenic', time: 30, snap: true });
  assert.ok(camera.position.distanceTo(before) > 1);
  assert.ok(camera.position.distanceTo(before) < 20);
  for (const direction of [1, -1]) {
    rig.update({ dt: 0.1, distance: 500, direction, view: 'follow', snap: true });
    const position = track.getPointAt(500 / trackLength);
    const forward = track.getTangentAt(500 / trackLength).multiplyScalar(direction);
    assert.ok(camera.position.clone().sub(position).dot(forward) < -30);
  }
});

test('camera changes snap out of the carriage and orbit has a valid non-DOM fallback', () => {
  const { rig, camera } = fixture();
  rig.update({ dt: 0.01, distance: 500, view: 'cab' });
  rig.update({ dt: 0.01, distance: 500, view: 'scenic' });
  const train = track.getPointAt(500 / trackLength);
  assert.ok(camera.position.distanceTo(train) > 30);
  rig.update({ dt: 0.01, distance: 500, view: 'orbit' });
  assert.equal(rig.state().view, 'scenic');
  assert.equal(rig.state().orbitEnabled, false);
  assert.ok(camera.position.toArray().every(Number.isFinite));
  assert.doesNotThrow(() => rig.dispose());
});

test('unsupported modes and invalid motion input fail explicitly', () => {
  const { rig } = fixture();
  assert.throws(() => rig.update({ dt: -1, distance: 100 }), TypeError);
  assert.throws(() => rig.update({ dt: 0.1, distance: NaN }), TypeError);
  assert.throws(() => rig.update({ dt: 0.1, distance: 100, view: 'unknown' }), /Unknown/);
});

test('exterior views clear canopies at the eye and along the train sightline', () => {
  // First find the unconstrained camera, then place a crown across that camera's path.
  const baseline = fixture(() => -5);
  baseline.rig.update({ dt: 0.1, distance: 800, view: 'scenic', time: 0, snap: true });
  const crown = baseline.camera.position.clone();
  const foliageHeight = (x, z) => (Math.hypot(x - crown.x, z - crown.z) < 15 ? 43 : -Infinity);
  const { rig, camera } = fixture(() => -5, foliageHeight);
  for (const view of ['scenic', 'follow', 'orbit']) {
    rig.update({ dt: 0.1, distance: 800, view, time: 0, snap: true });
    const subject = track.getPointAt(800 / trackLength).add(new THREE.Vector3(0, 3, 0));
    assert.ok(camera.position.y >= foliageHeight(camera.position.x, camera.position.z) + 1.99);
    for (let i = 2; i <= 32; i++) {
      const point = subject.clone().lerp(camera.position, i / 32);
      if (Math.hypot(point.x - subject.x, point.z - subject.z) >= 8)
        assert.ok(point.y >= foliageHeight(point.x, point.z) + 1.99);
    }
    assert.ok(camera.position.y < 90, 'prefer a nearer framing over climbing above the valley');
  }
});

test('dense canopies preserve a wide scenic view and ignore the first eight metres', () => {
  const train = track.getPointAt(800 / trackLength);
  const foliageHeight = (x, z) => (Math.hypot(x - train.x, z - train.z) < 7.8 ? 1000 : 40);
  const { rig, camera } = fixture(() => -5, foliageHeight);
  rig.update({ dt: 0.1, distance: 800, view: 'scenic', time: 0, snap: true });
  assert.ok(
    camera.position.y < 100,
    'near-carriage canopy cells must not create a huge camera lift',
  );
  assert.ok(camera.position.y >= 42);
  assert.ok(Math.hypot(camera.position.x - train.x, camera.position.z - train.z) >= 90);
  assert.ok(rig.state().foliageClearance >= 2);
});

test('foliage never offsets the cab anchor, including direction reversals', () => {
  const { rig, camera } = fixture(
    () => -5,
    () => 1000,
  );
  for (const direction of [1, -1]) {
    rig.update({ dt: 0.1, distance: 800, direction, view: 'cab' });
    const expected = cabPose(track, 800, trackLength, direction);
    assert.ok(camera.position.distanceTo(expected.eye) < 1e-8);
    assert.equal(rig.state().foliageClearance, null);
  }
});

test('entering dense foliage corrects the interpolated eye without a one-frame altitude spike', () => {
  let dense = false;
  const { rig, camera } = fixture(
    () => -5,
    () => (dense ? 40 : -Infinity),
  );
  rig.update({ dt: 0.016, distance: 800, view: 'scenic', time: 0, snap: true });
  dense = true;
  rig.update({ dt: 0.016, distance: 800.3, view: 'scenic', time: 0 });
  assert.ok(camera.position.y < 100);
  assert.ok(camera.position.y >= 42);
});

test('tunnel uses the rigid cab and restores the requested scenic view on exit', () => {
  const { rig, camera } = fixture();
  for (const direction of [1, -1]) {
    rig.update({ dt: 0.1, distance: 500, direction, view: 'scenic', inTunnel: true });
    const expected = cabPose(track, 500, trackLength, direction);
    assert.ok(camera.position.distanceTo(expected.eye) < 1e-8);
    assert.equal(rig.state().requestedView, 'scenic');
    assert.equal(rig.state().automaticReason, 'tunnel');
    rig.update({ dt: 0.1, distance: 510, direction, view: 'scenic' });
    assert.equal(rig.state().view, 'scenic');
    assert.equal(rig.state().automaticReason, null);
    assert.ok(camera.position.distanceTo(track.getPointAt(510 / trackLength)) > 90);
  }
});

test('passenger view remains inside tunnels and restores the exterior lens on exit', () => {
  const { rig, camera } = fixture();
  rig.update({ distance: 500, view: 'passenger', inTunnel: true });
  assert.equal(rig.state().view, 'passenger');
  assert.equal(rig.state().automaticReason, null);
  assert.equal(camera.near, 0.06);
  assert.equal(camera.fov, 60);
  rig.update({ distance: 500, view: 'scenic' });
  assert.equal(camera.near, 0.5);
  assert.equal(camera.fov, 48);
  rig.dispose();
});

test('presentation overlays cannot drag the scenic rig away from its own base pose', () => {
  const baseline = fixture(() => -5);
  const overlaid = fixture(() => -5);
  for (let frame = 0; frame < 90; frame++) {
    const input = { dt: 1 / 60, distance: 500 + frame * 0.2, view: 'scenic' };
    baseline.rig.update(input);
    overlaid.rig.update(input);
    assert.ok(overlaid.camera.position.distanceTo(baseline.camera.position) < 1e-8);
    assert.ok(overlaid.camera.quaternion.angleTo(baseline.camera.quaternion) < 1e-7);
    overlaid.camera.position.set(500, 900, -200);
    overlaid.camera.lookAt(0, 0, 0);
  }
});

test('canopy cell changes steer the scenic height gradually instead of snapping it', () => {
  let dense = false;
  const { rig, camera } = fixture(
    () => -5,
    () => (dense ? 58 : -Infinity),
  );
  rig.update({ dt: 1 / 60, distance: 800, view: 'scenic', snap: true });
  const before = camera.position.clone();
  dense = true;
  rig.update({ dt: 1 / 60, distance: 800, view: 'scenic' });
  assert.ok(camera.position.distanceTo(before) < 2);
  assert.ok(camera.position.y > before.y);
});

test('inspection camera follows its subject without resetting the user offset, then releases to cab', () => {
  const { rig, camera } = fixture();
  const focusPose = { key: 'water', eye: [30, 20, 40], target: [0, 0, 0] };
  rig.update({ dt: 0, distance: 100, direction: 1, view: 'scenic', focusPose });
  assert.deepEqual(camera.position.toArray(), focusPose.eye);
  camera.position.x += 5;
  rig.update({
    dt: 0.1,
    distance: 100,
    direction: 1,
    view: 'scenic',
    focusPose: { ...focusPose, target: [10, 0, 0] },
  });
  assert.equal(camera.position.x, 45);
  rig.update({ dt: 0, distance: 100, direction: 1, view: 'cab' });
  assert.ok(camera.position.distanceTo(cabPose(track, 100, trackLength, 1).eye) < 1e-8);
});
