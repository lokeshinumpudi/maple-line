import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createSurfaceDetail } from '../src/rendering/surface-detail.js';

const compile = (material) => {
  const shader = {
    uniforms: {},
    vertexShader: '#include <project_vertex>',
    fragmentShader: '#include <color_fragment>\n#include <roughnessmap_fragment>',
  };
  material.onBeforeCompile(shader, {});
  return shader;
};

test('scenery starts dry, wets in rain within seconds and dries slowly afterwards', () => {
  const detail = createSurfaceDetail();
  assert.equal(detail.wetness.value, 0);
  for (let i = 0; i < 600; i++) detail.update(1 / 60, 'rain');
  const afterTenSeconds = detail.wetness.value;
  assert.ok(afterTenSeconds > 0.7 && afterTenSeconds <= 1);
  detail.update(0, 'clear');
  assert.equal(detail.wetness.value, afterTenSeconds, 'zero dt pause holds the state');
  detail.update(10, 'clear');
  assert.ok(detail.wetness.value > afterTenSeconds * 0.6, 'still wet ten seconds later');
  detail.update(600, 'clear');
  assert.equal(detail.wetness.value, 0);
  detail.dispose();
});

test('wetting and drying are monotonic, bounded and frame-partition invariant', () => {
  const one = createSurfaceDetail(),
    many = createSurfaceDetail();
  one.update(4, 'rain');
  let previous = 0;
  for (let i = 0; i < 400; i++) {
    many.update(0.01, 'rain');
    assert.ok(many.wetness.value >= previous && many.wetness.value <= 1);
    previous = many.wetness.value;
  }
  assert.ok(Math.abs(one.wetness.value - many.wetness.value) < 1e-9);
  one.dispose();
  many.dispose();
});

test('material families keep base colours and get distinct porous or sheen behaviour', () => {
  const detail = createSurfaceDetail();
  const ballast = detail.apply(new THREE.MeshStandardMaterial({ color: '#8a8470' }), 'ballast');
  const roof = detail.apply(new THREE.MeshStandardMaterial({ color: '#445566' }), 'roof');
  assert.equal(ballast.color.getHexString(), '8a8470');
  assert.equal(ballast.userData.surfaceKind, undefined, 'kind is recorded at compile time');
  const ballastShader = compile(ballast),
    roofShader = compile(roof);
  assert.equal(ballast.userData.surfaceKind, 'ballast');
  assert.equal(ballastShader.uniforms.surfaceWetness, detail.wetness, 'one shared uniform');
  assert.match(ballastShader.fragmentShader, /surfaceWetness \* 0\.320 \* 1\.0/);
  assert.match(ballastShader.fragmentShader, /min\(roughnessFactor, 0\.560\)/);
  assert.match(roofShader.fragmentShader, /min\(roughnessFactor, 0\.200\)/);
  assert.match(roofShader.fragmentShader, /mix\(0\.6, 1\.0, surfaceWeights\.y\)/);
  assert.doesNotMatch(ballastShader.fragmentShader, /,\.24,1\.0\)/, 'no shared .24 clamp');
  assert.notEqual(ballast.customProgramCacheKey(), roof.customProgramCacheKey());
  assert.throws(() => detail.apply(new THREE.MeshStandardMaterial(), 'velvet'), TypeError);
  detail.dispose();
});

test('per-frame updates change only the uniform, never the material program', () => {
  const detail = createSurfaceDetail();
  const material = detail.apply(new THREE.MeshStandardMaterial(), 'stone');
  const version = material.version,
    key = material.customProgramCacheKey();
  for (let i = 0; i < 120; i++) detail.update(1 / 60, i % 2 ? 'rain' : 'clear');
  assert.equal(material.version, version);
  assert.equal(material.customProgramCacheKey(), key);
  detail.dispose();
});
