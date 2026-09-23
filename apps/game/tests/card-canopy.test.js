import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {
  createCardCanopy,
  createCardCanopyGeometry,
  createSprigTexture,
} from '../src/world/card-canopy.js';
import { createProceduralWorld } from '../src/world/procedural-world.js';
import { riverBedHeight, riverProfile } from '../src/world/river-profile.js';
import { QUALITY_TIERS } from '../src/rendering/quality-tiers.js';

function crowns(count = 12) {
  const mesh = new THREE.InstancedMesh(
    new THREE.PlaneGeometry(1, 1),
    new THREE.MeshStandardMaterial(),
    count,
  );
  const matrix = new THREE.Matrix4();
  for (let i = 0; i < count; i++) mesh.setMatrixAt(i, matrix.makeTranslation(i * 10, 5, 0));
  mesh.setColorAt(0, new THREE.Color('#e897b0'));
  mesh.computeBoundingSphere();
  return mesh;
}

test('card crowns are deterministic, bounded and use every atlas cell', () => {
  const a = createCardCanopyGeometry(THREE),
    b = createCardCanopyGeometry(THREE);
  assert.deepEqual([...a.attributes.position.array], [...b.attributes.position.array]);
  assert.equal(a.index.count / 6, 30);
  assert.ok(a.boundingSphere.radius < 1.8);
  const cells = new Set();
  const uv = a.attributes.uv.array;
  for (let i = 0; i < uv.length; i += 8) cells.add(`${uv[i] >= 0.5}:${uv[i + 1] >= 0.5}`);
  assert.equal(cells.size, 4);
  assert.throws(() => createSprigTexture(THREE, 'needles'), TypeError);
});

test('a twin shares its batch instance buffers and follows the batch visibility', () => {
  const scene = new THREE.Scene();
  const canopy = createCardCanopy({ THREE, tier: 'high' });
  const batch = crowns();
  scene.add(batch);
  const cards = canopy.register(batch, { kind: 'blossom' });
  assert.equal(cards.parent, scene);
  assert.equal(cards.instanceMatrix, batch.instanceMatrix);
  assert.equal(cards.instanceColor, batch.instanceColor);
  assert.equal(cards.castShadow, false);
  canopy.update(new THREE.Vector3(0, 0, 0));
  assert.equal(cards.visible, true);
  canopy.update(new THREE.Vector3(0, 0, 5000));
  assert.equal(cards.visible, false);
  batch.visible = false;
  canopy.update(new THREE.Vector3(0, 0, 0));
  assert.equal(cards.visible, false);
  batch.visible = true;
  canopy.setTier('low');
  assert.equal(canopy.cardDistance.value, QUALITY_TIERS.low.canopyCardDistance);
  canopy.update(new THREE.Vector3(0, 0, 0));
  assert.equal(cards.visible, false, 'low tier never draws cards');
  assert.equal(canopy.unregister(batch), true);
  assert.equal(cards.parent, null);
  assert.equal(canopy.getState().batches, 0);
  canopy.dispose();
});

test('the cheap crowns hide only the trees that draw cards, in the visible pass', () => {
  const canopy = createCardCanopy({ THREE, tier: 'medium' });
  const batch = crowns();
  new THREE.Scene().add(batch);
  canopy.register(batch);
  const shader = {
    uniforms: {},
    vertexShader: '#include <project_vertex>',
    fragmentShader: '',
  };
  batch.material.onBeforeCompile(shader);
  assert.equal(shader.uniforms.canopyCardDistance, canopy.cardDistance);
  assert.match(shader.vertexShader, /transformed \*= 1\.0 - canopyNear/);
  assert.match(batch.material.customProgramCacheKey(), /maple-canopy-lod/);
  canopy.dispose();
});

test('spring generated valleys register blossom cards and release them on disposal', () => {
  const kinds = [];
  let released = 0;
  const cardCanopy = {
    register: (mesh, { kind }) => kinds.push({ mesh, kind }),
    unregister: () => released++,
  };
  const world = createProceduralWorld({
    plan: {
      season: 'spring',
      forest: 'balanced',
      settlement: 'rural',
      weather: 'clear',
      time: 'daylight',
      seed: 42,
    },
    terrain: () => 4.1,
    railU: () => 28,
    riverBedHeight,
    riverProfile,
    center: () => 0,
    snowCoverage: { value: 0 },
    cardCanopy,
  });
  assert.ok(kinds.length > 0);
  assert.ok(kinds.every((entry) => entry.kind === 'blossom'));
  world.dispose();
  assert.equal(released, kinds.length);
});
