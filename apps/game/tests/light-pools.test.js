import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {
  LIGHT_POOL_TIERS,
  capCharacterLight,
  chooseSources,
  createLightPool,
  createSlotBank,
  sourceScore,
} from '../src/rendering/light-pools.js';
import { haloHiddenBy } from '../src/rendering/light-halos.js';
import { createAonumaPlanting } from '../src/world/aonuma-planting.js';

test('a person between the camera and a lamp hides its halo; one off to the side does not', () => {
  const camera = new THREE.Vector3(0, 1.6, 0);
  const lamp = new THREE.Vector3(0, 1.7, 10);
  const person = (x, z) => ({ x, z, bottom: 0, top: 1.75 });
  assert.ok(haloHiddenBy([person(0, 4)], camera, lamp, 0.8) > 0.9);
  assert.ok(haloHiddenBy([person(0.45, 4)], camera, lamp, 0.8) > 0.2, 'a glow wrapping a head');
  assert.equal(haloHiddenBy([person(3, 4)], camera, lamp, 0.8), 0);
  assert.equal(haloHiddenBy([person(0, 12)], camera, lamp, 0.8), 0, 'behind the lamp');
  assert.equal(haloHiddenBy([], camera, lamp), 0);
});

test('character light is capped only on MToon materials and only once', () => {
  assert.equal(capCharacterLight(new THREE.MeshStandardMaterial()), false);
  const toon = new THREE.ShaderMaterial();
  toon.isMToonMaterial = true;
  assert.equal(capCharacterLight(toon), true);
  assert.equal(capCharacterLight(toon), false);
  const shader = {
    uniforms: {},
    fragmentShader: 'vec3 col = reflectedLight.directDiffuse + reflectedLight.indirectDiffuse;',
  };
  toon.onBeforeCompile(shader);
  assert.ok(shader.uniforms.mapleCharacterLight);
  assert.match(shader.fragmentShader, /mapleCeiling/);
  // Skin keeps only part of the light's colour and has its own saturation.
  assert.ok(
    shader.uniforms.mapleLightChroma.value > 0 && shader.uniforms.mapleLightChroma.value < 1,
  );
  assert.match(shader.fragmentShader, /mapleCharacterSaturation/);
});

test('close subjects are exempt from fog near the camera', async () => {
  const { nearClearFog } = await import('../src/rendering/height-fog.js');
  const chunk = nearClearFog();
  assert.match(chunk, /fogFactor \*= smoothstep\( 3\.0, 28\.0, mapleFogDistance \)/);
});

const at = (x, y, z) => new THREE.Vector3(x, y, z);
const lamp = (id, x, level = 1, intensity = 10) => ({
  id,
  position: at(x, 4, 0),
  level,
  intensity,
});

test('the nearest bright lamps win the real lights; off and far lamps never do', () => {
  const camera = at(0, 1.6, 0);
  const sources = [lamp('near', 3), lamp('mid', 12), lamp('far', 200), lamp('off', 1, 0)];
  assert.deepEqual(chooseSources(sources, camera, 2), ['near', 'mid']);
  assert.equal(sourceScore(sources[2], camera), 0);
  assert.equal(sourceScore(sources[3], camera), 0);
  // A lamp already lit keeps its light against a slightly better one.
  const pair = [lamp('a', 10), lamp('b', 9.6)];
  assert.deepEqual(chooseSources(pair, camera, 1), ['b']);
  assert.deepEqual(chooseSources(pair, camera, 1, new Set(['a'])), ['a']);
});

test('a light fades out before it moves to another lamp, so nothing pops', () => {
  const bank = createSlotBank(1);
  const dt = 1 / 60;
  for (let i = 0; i < 120; i++) bank.update(dt, ['a']);
  assert.equal(bank.slots[0].id, 'a');
  assert.ok(bank.slots[0].weight > 0.99);
  let previous = bank.slots[0].weight;
  let switched = false;
  for (let i = 0; i < 240; i++) {
    const [slot] = bank.update(dt, ['b']);
    if (slot.id === 'a') {
      assert.ok(slot.weight <= previous + 1e-9, 'fading out');
      assert.ok(previous - slot.weight < 0.1, 'no jump');
    } else if (slot.id === 'b') {
      if (!switched) assert.ok(slot.weight < 0.1, 'fades in from dark');
      switched = true;
    }
    previous = slot.weight;
  }
  assert.ok(switched);
  assert.equal(bank.slots[0].id, 'b');
});

test('the pool keeps a fixed light count per tier and lights sources only at night', () => {
  const scene = new THREE.Scene();
  const pool = createLightPool({ THREE, scene, tier: 'medium' });
  const count = () => scene.children.filter((object) => object.isLight).length;
  const { points, spots } = LIGHT_POOL_TIERS.medium;
  assert.equal(count(), points + spots);
  pool.add('lamp', { position: at(2, 4, 0), ground: 0, intensity: 12, pool: 3 });
  pool.add('headlight', {
    kind: 'spot',
    position: at(0, 0.8, 4),
    direction: at(0, -0.1, 1),
    ground: 0,
    intensity: 70,
  });
  pool.update(1 / 60, { cameraPosition: at(0, 1.6, -4), night: 0, wet: 1 });
  assert.equal(pool.getState().lit.length, 0);
  for (let i = 0; i < 60; i++)
    pool.update(1 / 60, { cameraPosition: at(0, 1.6, -4), night: 1, wet: 1 });
  const state = pool.getState();
  assert.deepEqual(state.lit.map((entry) => entry.id).sort(), ['headlight', 'lamp']);
  assert.equal(state.pools, 2);
  assert.equal(state.reflections, 2);
  assert.equal(count(), points + spots, 'no lights added or removed');
  pool.setTier('low');
  assert.equal(count(), LIGHT_POOL_TIERS.low.points + LIGHT_POOL_TIERS.low.spots);
  pool.dispose();
  assert.equal(count(), 0);
});

test('aonuma planting builds cheap batches, registers crowns and lamps, and cleans up', () => {
  const scene = new THREE.Scene();
  const registered = [];
  let released = 0;
  const canopy = {
    register: (mesh, { kind }) => registered.push(kind),
    unregister: () => released++,
  };
  const pool = createLightPool({ THREE, scene, tier: 'high' });
  const planting = createAonumaPlanting({
    THREE,
    scene,
    railPoint: (z) => at(0, 10, z),
    groundAt: () => 10,
    stops: [{ id: 'aonuma', z: 4700 }],
    cardCanopy: canopy,
    lightPool: pool,
  });
  const state = planting.getState();
  assert.ok(state.batches < 30, `few draws (${state.batches})`);
  assert.ok(state.crowns > 200);
  assert.ok(state.houses >= 5);
  assert.ok(registered.includes('blossom') && registered.includes('leaf'));
  assert.ok(pool.getState().sources >= 7 + state.houses);
  planting.update(1 / 30, {
    camera: { position: at(10, 12, 4720) },
    dusk: true,
    weather: 'rain',
    wetness: 1,
  });
  assert.equal(planting.root.visible, true);
  planting.update(1 / 30, { camera: { position: at(0, 12, 9000) }, dusk: true });
  assert.equal(planting.root.visible, false);
  planting.dispose();
  assert.equal(released, registered.length);
  assert.equal(pool.getState().sources, 0);
  assert.equal(planting.root.parent, null);
  pool.dispose();
});
