import test from 'node:test';
import assert from 'node:assert/strict';
import { Vector3 } from 'three';
import {
  createStableSunShadow,
  SUN_SHADOW_FRUSTUM,
  SUN_SHADOW_MAP,
  SUN_SHADOW_OFFSET,
} from '../src/rendering/stable-sun-shadow.js';

function mockLight() {
  return {
    position: new Vector3(),
    target: {
      position: new Vector3(),
      updateMatrixWorld() {},
    },
  };
}

test('sun shadow basis matches Three lookAt up-cross-z and is orthonormal', () => {
  const shadow = createStableSunShadow();
  const { x, y, z } = shadow.basis;
  const offset = new Vector3(
    SUN_SHADOW_OFFSET.x,
    SUN_SHADOW_OFFSET.y,
    SUN_SHADOW_OFFSET.z,
  ).normalize();
  assert.ok(z.distanceTo(offset) < 1e-10);
  assert.ok(Math.abs(x.dot(y)) < 1e-10);
  assert.ok(Math.abs(y.dot(z)) < 1e-10);
  assert.ok(Math.abs(z.dot(x)) < 1e-10);
  assert.ok(Math.abs(x.length() - 1) < 1e-10);
  assert.ok(Math.abs(y.length() - 1) < 1e-10);
  const rebuiltX = new Vector3(0, 1, 0).cross(z).normalize();
  assert.ok(x.distanceTo(rebuiltX) < 1e-10);
  const rebuiltY = new Vector3().crossVectors(z, x);
  assert.ok(y.distanceTo(rebuiltY) < 1e-10);
});

test('sub-texel movement in the light plane does not move the snapped target', () => {
  const shadow = createStableSunShadow();
  const origin = new Vector3(12, 4, -8);
  const a = shadow.snap(origin, new Vector3());
  const nudged = origin.clone().addScaledVector(shadow.basis.x, shadow.texelSize * 0.24);
  const b = shadow.snap(nudged, new Vector3());
  assert.ok(a.distanceTo(b) < 1e-9);
});

test('a one-texel light-plane step moves the snap by exactly one texel', () => {
  const shadow = createStableSunShadow();
  const origin = new Vector3(3, 1, 9);
  const a = shadow.snap(origin, new Vector3());
  const stepped = origin.clone().addScaledVector(shadow.basis.y, shadow.texelSize);
  const b = shadow.snap(stepped, new Vector3());
  assert.ok(Math.abs(b.distanceTo(a) - shadow.texelSize) < 1e-9);
  assert.ok(Math.abs(b.clone().sub(a).dot(shadow.basis.z)) < 1e-9);
});

test('grades along the sun keep depth unquantized', () => {
  const shadow = createStableSunShadow();
  const start = new Vector3(40, 12, -20);
  const along = start.clone().addScaledVector(shadow.basis.z, 17.33);
  const snappedStart = shadow.snap(start, new Vector3());
  const snappedAlong = shadow.snap(along, new Vector3());
  const delta = snappedAlong.clone().sub(snappedStart);
  assert.ok(Math.abs(delta.dot(shadow.basis.x)) < 1e-9);
  assert.ok(Math.abs(delta.dot(shadow.basis.y)) < 1e-9);
  assert.ok(Math.abs(delta.dot(shadow.basis.z) - 17.33) < 1e-9);
});

test('world y is not independently rounded', () => {
  const shadow = createStableSunShadow();
  const flat = new Vector3(5, 0, 5);
  const raised = new Vector3(5, 1.37, 5);
  const snapped = shadow.snap(raised, new Vector3());
  const worldAxisRounded = new Vector3(
    Math.round(raised.x / shadow.texelSize) * shadow.texelSize,
    Math.round(raised.y / shadow.texelSize) * shadow.texelSize,
    Math.round(raised.z / shadow.texelSize) * shadow.texelSize,
  );
  assert.notEqual(snapped.y, worldAxisRounded.y);
  const residual = snapped.clone().sub(raised);
  assert.ok(Math.abs(residual.dot(shadow.basis.z)) < 1e-9);
  assert.equal(shadow.snap(flat, new Vector3()).y === worldAxisRounded.y, false);
});

test('jumps larger than the 220 m frustum request an immediate shadow refresh', () => {
  const shadow = createStableSunShadow();
  const light = mockLight();
  const map = { needsUpdate: false };
  assert.equal(shadow.apply(light, new Vector3(0, 0, 0), map), false);
  assert.equal(map.needsUpdate, false);
  const jumped = shadow.apply(light, new Vector3(SUN_SHADOW_FRUSTUM + 1, 0, 0), map);
  assert.equal(jumped, true);
  assert.equal(map.needsUpdate, true);
  map.needsUpdate = false;
  shadow.apply(light, new Vector3(SUN_SHADOW_FRUSTUM + 2, 0, 0), map);
  assert.equal(map.needsUpdate, false);
});

test('non-finite focus coordinates skip the light pose', () => {
  const shadow = createStableSunShadow();
  const light = mockLight();
  light.position.set(1, 2, 3);
  light.target.position.set(4, 5, 6);
  assert.equal(shadow.apply(light, new Vector3(Number.NaN, 0, 0)), false);
  assert.equal(shadow.apply(light, new Vector3(0, Number.POSITIVE_INFINITY, 0)), false);
  assert.deepEqual(light.position.toArray(), [1, 2, 3]);
  assert.deepEqual(light.target.position.toArray(), [4, 5, 6]);
});

test('frustum and map size stay 220 m / 2048', () => {
  const shadow = createStableSunShadow();
  assert.equal(SUN_SHADOW_FRUSTUM, 220);
  assert.equal(SUN_SHADOW_MAP, 2048);
  assert.equal(shadow.frustumSize, 220);
  assert.equal(shadow.texelSize, 220 / 2048);
});
