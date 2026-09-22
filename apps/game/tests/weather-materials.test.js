import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {
  SURFACE_FAMILIES,
  TRAIN_FAMILIES,
  applyWeatherFinish,
  createWetnessTracker,
  wetnessTarget,
} from '../src/train/weather-materials.js';
import { createTrain } from '../src/train/train.js';

const setup = () => createTrain({ THREE, scene: new THREE.Scene(), wireHeight: 12.1 });

test('wetness starts dry, wets monotonically and stays bounded', () => {
  const tracker = createWetnessTracker();
  assert.equal(tracker.value, 0);
  let previous = 0;
  for (let i = 0; i < 600; i++) {
    const next = tracker.advance(1 / 60, 'rain');
    assert.ok(next >= previous && next <= 1);
    previous = next;
  }
  assert.ok(previous > 0.7, `rain shows within ten seconds (${previous})`);
  for (let i = 0; i < 100; i++) tracker.advance(1, 'rain');
  assert.equal(tracker.value, 1);
  previous = 1;
  for (let i = 0; i < 400; i++) {
    const next = tracker.advance(1, 'clear');
    assert.ok(next <= previous && next >= 0);
    previous = next;
  }
  assert.equal(tracker.value, 0);
});

test('drying is slower than wetting and snow only leaves surfaces damp', () => {
  const wetting = createWetnessTracker();
  wetting.advance(10, 'rain');
  const soaked = createWetnessTracker({ initial: 1 });
  soaked.advance(10, 'clear');
  assert.ok(wetting.value > 1 - soaked.value, 'ten seconds wets more than it dries');
  assert.ok(soaked.value > 0.5, 'still visibly wet ten seconds after rain stops');
  assert.equal(wetnessTarget('snow'), 0.25);
  const snowy = createWetnessTracker();
  for (let i = 0; i < 200; i++) snowy.advance(1, 'snow');
  assert.equal(snowy.value, 0.25);
});

test('advance is frame-partition invariant and a zero step is a pause', () => {
  const coarse = createWetnessTracker(),
    fine = createWetnessTracker();
  coarse.advance(3, 'rain');
  for (let i = 0; i < 300; i++) fine.advance(0.01, 'rain');
  assert.ok(Math.abs(coarse.value - fine.value) < 1e-9);
  const before = coarse.value;
  coarse.advance(0, 'clear');
  coarse.advance(-1, 'clear');
  coarse.advance(Number.NaN, 'clear');
  assert.equal(coarse.value, before);
});

test('porous families darken more and stay rougher than nonporous paint', () => {
  for (const kind of ['terrain', 'timber', 'ballast', 'plaster']) {
    const family = SURFACE_FAMILIES[kind];
    assert.equal(family.porous, true);
    assert.ok(family.darken > TRAIN_FAMILIES.paint.darken * 3);
    assert.ok(family.roughnessFloor > 0.5, `${kind} never turns to chrome`);
  }
  assert.ok(TRAIN_FAMILIES.paint.roughnessFloor < SURFACE_FAMILIES.roof.roughnessFloor + 0.01);
  assert.ok(TRAIN_FAMILIES.paint.darken < 0.1, 'vermilion keeps its colour identity');
});

test('exterior train paint wets while cabin, rubber, glass and lamps stay untouched', () => {
  const model = setup(),
    paints = model.materials;
  for (const key of ['red', 'cream', 'gold', 'roof', 'steel', 'bright', 'insulator'])
    assert.ok(paints[key].userData.weatherFinish, `${key} receives the weather finish`);
  for (const key of ['seat', 'interior', 'rubber', 'glass', 'cabinGlass', 'head', 'tail', 'sign'])
    assert.equal(paints[key].userData.weatherFinish, undefined, `${key} stays dry`);
  assert.equal(paints.red.color.getHexString(), '983f32');
  assert.equal(paints.red.roughness, 0.42);
  assert.equal(model.getSystemsState().exteriorWetness, 0);
  for (let i = 0; i < 120; i++) model.update(1 / 12, { weather: 'rain' });
  const wet = model.getSystemsState().exteriorWetness;
  assert.ok(wet > 0.7 && wet <= 1);
  model.update(0, { weather: 'clear' });
  assert.equal(model.getSystemsState().exteriorWetness, wet, 'paused frame changes nothing');
  assert.equal(paints.red.roughness, 0.42, 'base material roughness stays owned by the paint');
  model.dispose();
});

test('the weather finish chains shader hooks once and never recompiles per frame', () => {
  const material = new THREE.MeshStandardMaterial({ color: '#983f32' });
  let chained = 0;
  material.onBeforeCompile = () => {
    chained++;
  };
  const baseKey = material.customProgramCacheKey();
  const wetness = { value: 0 };
  applyWeatherFinish(material, TRAIN_FAMILIES.paint, wetness);
  applyWeatherFinish(material, TRAIN_FAMILIES.paint, wetness);
  const key = material.customProgramCacheKey();
  assert.ok(key.startsWith(baseKey) && key.includes('weather-finish'));
  const shader = {
    uniforms: {},
    vertexShader: '#include <defaultnormal_vertex>',
    fragmentShader: '#include <color_fragment>\n#include <roughnessmap_fragment>',
  };
  material.onBeforeCompile(shader, {});
  assert.equal(chained, 1, 'previous hook still runs exactly once');
  assert.equal(shader.uniforms.exteriorWetness, wetness, 'shared uniform, no copies');
  assert.match(shader.fragmentShader, /roughnessFactor = clamp\(mix\(roughnessFactor/);
  const version = material.version;
  const model = setup();
  const paintVersion = model.materials.red.version;
  for (let i = 0; i < 30; i++) model.update(1 / 60, { weather: 'rain' });
  assert.equal(model.materials.red.version, paintVersion, 'updates do not mark programs dirty');
  assert.equal(material.version, version);
  model.dispose();
});

test('all five carriages carry distinct names with the ends as driving cars', () => {
  const model = setup();
  const names = model.cars.map((car) => car.name);
  assert.equal(new Set(names).size, 5);
  assert.ok(names.every((name) => name.startsWith('Momiji EMU / ')));
  assert.equal(names[0], 'Momiji EMU / driving motor car');
  assert.equal(names[4], 'Momiji EMU / rear driving car');
  for (const car of model.cars)
    for (const child of car.children)
      if (child.isInstancedMesh) assert.ok(!child.name.startsWith('undefined'));
  model.dispose();
});

test('interior fittings and passenger paper do not inherit exterior wet shaders', () => {
  const model = createTrain({ THREE, scene: new THREE.Scene() });
  model.update(10, { weather: 'rain' });
  for (const car of model.cars)
    car.traverse((node) => {
      if (
        node.material &&
        (node.name.startsWith('Interior / passengers') || node.name.startsWith('Cab / live'))
      ) {
        assert.equal(node.material.userData.weatherFinish, undefined, node.name);
      }
    });
  model.dispose();
});
