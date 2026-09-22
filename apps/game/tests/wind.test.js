import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createWindField } from '../src/world/wind.js';

function compile(material) {
  const shader = {
    uniforms: {},
    vertexShader: '#include <beginnormal_vertex>\n#include <begin_vertex>',
    fragmentShader: '',
  };
  material.onBeforeCompile(shader, {});
  return shader;
}
function mesh() {
  const tree = new THREE.InstancedMesh(
    new THREE.ConeGeometry(1, 1, 6),
    new THREE.MeshStandardMaterial(),
    1,
  );
  tree.setMatrixAt(0, new THREE.Matrix4().makeScale(4, 10, 4));
  return tree;
}

test('wind retains previous snow hook and matches visible, depth and point-light deformation', () => {
  const tree = mesh();
  const original = tree.material;
  const snow = { value: 0.5 };
  original.onBeforeCompile = (shader) => {
    shader.uniforms.snowCoverage = snow;
    shader.vertexShader = '// snow hook\n' + shader.vertexShader;
  };
  original.customProgramCacheKey = () => 'snow-v1';
  const wind = createWindField({ THREE });
  wind.apply(tree, { amplitude: 0.12 });
  const visible = compile(tree.material);
  const depth = compile(tree.customDepthMaterial);
  const distance = compile(tree.customDistanceMaterial);
  assert.equal(visible.uniforms.snowCoverage, snow);
  assert.ok(visible.vertexShader.includes('// snow hook'));
  assert.ok(tree.material.customProgramCacheKey().includes('snow-v1'));
  for (const shader of [depth, distance]) {
    assert.equal(shader.uniforms.mapleWindTime, visible.uniforms.mapleWindTime);
    assert.equal(shader.uniforms.mapleWindStrength, visible.uniforms.mapleWindStrength);
    assert.equal(shader.uniforms.mapleWindAmplitude.value, 0.12);
    assert.equal(
      shader.vertexShader.split('mat4 mapleWindMatrix')[1],
      visible.vertexShader.split('mat4 mapleWindMatrix')[1],
    );
  }
  assert.notEqual(tree.material, original);
  assert.equal(compile(original).uniforms.mapleWindTime, undefined);
  wind.dispose();
  assert.equal(tree.material, original);
});

test('chunk copies keep wind shadows and gain a culling allowance', () => {
  const wind = createWindField({ THREE });
  const source = mesh();
  wind.apply(source, { amplitude: 0.15 });
  const chunk = mesh();
  chunk.computeBoundingSphere();
  const radius = chunk.boundingSphere.radius;
  wind.copyToChunk(source, chunk);
  assert.equal(chunk.material, source.material);
  assert.equal(chunk.customDepthMaterial, source.customDepthMaterial);
  assert.equal(chunk.customDistanceMaterial, source.customDistanceMaterial);
  assert.ok(chunk.boundingSphere.radius >= radius + 0.485);
  wind.copyToChunk(source, chunk);
  assert.ok(chunk.boundingSphere.radius < radius + 0.487);
  wind.dispose();
});

test('rain ramps the common wind field and pause freezes it', () => {
  const wind = createWindField({ THREE });
  wind.update(1, { weather: 'rain' });
  const rainy = wind.getState();
  assert.ok(rainy.strength > 0.7 && rainy.strength < 1.65);
  wind.update(0, { weather: 'rain' });
  assert.deepEqual(wind.getState(), rainy);
  wind.update(10, { weather: 'clear' });
  assert.ok(wind.getState().strength < 0.71);
  assert.throws(() => wind.update(-1), TypeError);
  assert.throws(() => wind.apply(mesh(), { amplitude: 10 }), RangeError);
});

test('chunk eviction releases cloned shaders only after their final shared user', () => {
  const wind = createWindField({ THREE });
  const source = mesh();
  const original = source.material;
  wind.apply(source);
  const chunk = new THREE.InstancedMesh(source.geometry, source.material, 1);
  chunk.setMatrixAt(0, new THREE.Matrix4());
  wind.copyToChunk(source, chunk);
  let disposed = 0;
  source.material.addEventListener('dispose', () => disposed++);
  assert.equal(wind.remove(source), true);
  assert.equal(source.material, original);
  assert.equal(disposed, 0);
  assert.equal(wind.getState().materials, 3);
  assert.equal(wind.remove(chunk), true);
  assert.equal(chunk.material, original);
  assert.equal(disposed, 1);
  assert.equal(wind.getState().materials, 0);
  assert.equal(wind.getState().sources, 0);
  assert.equal(wind.remove(chunk), false);
});

test('crown wind stays below 42 cm in clear weather and takes about 13 seconds per gust', () => {
  const wind = createWindField({ THREE });
  const tree = mesh();
  wind.apply(tree, { amplitude: 0.85, flutter: 0.08 });
  const shader = compile(tree.material);
  assert.equal(shader.uniforms.mapleWindAmplitude.value, 0.55);
  assert.equal(shader.uniforms.mapleWindFlutter.value, 0.08);
  assert.ok(wind.getState().maxDisplacementMetres < 0.42);
  assert.ok(wind.getState().gustPeriodSeconds > 13 && wind.getState().gustPeriodSeconds < 14);
  assert.ok(shader.vertexShader.includes('mapleWindTime * 0.48'));
  wind.dispose();
});

test('alpha-tested leaf cards cast matching cutout shadows', () => {
  const tree = mesh();
  const texture = new THREE.DataTexture(new Uint8Array([255, 255, 255, 128]), 1, 1);
  tree.material.map = texture;
  tree.material.alphaTest = 0.45;
  tree.material.side = THREE.DoubleSide;
  const wind = createWindField({ THREE });
  wind.apply(tree);
  for (const shadow of [tree.customDepthMaterial, tree.customDistanceMaterial]) {
    assert.equal(shadow.map, texture);
    assert.equal(shadow.alphaTest, 0.45);
    assert.equal(shadow.side, THREE.DoubleSide);
  }
  wind.dispose();
  texture.dispose();
});
