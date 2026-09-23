import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { createTrain, TRAIN_MODEL_PATH } from '../src/train/train.js';
import { CAR_COUNT } from '../src/train/consist.js';

const root = new URL('../../../', import.meta.url);
const report = JSON.parse(
  readFileSync(new URL('asset-src/vehicles/momiji-emu/report.json', root), 'utf8'),
);

async function loadModel() {
  const bytes = readFileSync(new URL(`apps/game/public/${TRAIN_MODEL_PATH}`, root));
  const loader = new GLTFLoader();
  loader.setMeshoptDecoder(MeshoptDecoder);
  return loader.parseAsync(
    bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.length),
    '',
  );
}
const setup = () => createTrain({ THREE, scene: new THREE.Scene(), wireHeight: 12.1 });
const fakeLoader = (gltf) => ({ get: () => Promise.resolve(gltf) });
const models = (car, name) =>
  car.children.filter(
    (child) => child.isInstancedMesh && child.visible && child.name.includes(name),
  );

test('the Blender train replaces the exterior and keeps the cabin', async () => {
  const model = setup();
  assert.equal(await model.attachModel(fakeLoader(await loadModel())), 'blender');
  assert.equal(model.getSystemsState().model, 'blender');
  for (const car of model.cars) {
    assert.ok(car.children.some((child) => child.name.endsWith('Blender body')));
    for (const child of car.children) {
      if (child.userData.trainLayer === 'shell') assert.equal(child.visible, false, child.name);
      if (child.userData.trainLayer === 'keep') assert.equal(child.visible, true, child.name);
    }
    // The cab camera looks through real glass, and the cabin figures are still drawn.
    assert.ok(car.children.some((child) => child.name.includes('Interior / swinging hand straps')));
  }
  // Only the first two cars raise a pantograph, and it reaches the wire.
  const raised = model.cars.filter((car) =>
    car.children.some((child) => child.name.endsWith('Blender pantograph')),
  );
  assert.deepEqual(
    raised.map((car) => car.userData.carIndex),
    [0, 1],
  );
  const arms = raised[0].children.find((child) => child.name.endsWith('Blender pantograph'));
  const top = new THREE.Box3().setFromObject(arms).max.y;
  assert.ok(Math.abs(top - model.pantographs[0].localContactHeight) < 0.002, `top ${top}`);
  // The rear driving car is the cab body turned to face backwards.
  const rear = model.cars[CAR_COUNT - 1].children.find((child) =>
    child.name.endsWith('Blender body'),
  );
  assert.ok(Math.abs(rear.rotation.y - Math.PI) < 1e-9);
  model.dispose();
});

test('model doors slide 0.64 m on the platform side only and close before moving', async () => {
  const model = setup();
  await model.attachModel(fakeLoader(await loadModel()));
  const [leaves] = models(model.cars[0], 'sliding door leaves');
  const at = (i) => {
    const m = new THREE.Matrix4();
    leaves.getMatrixAt(i, m);
    return new THREE.Vector3().setFromMatrixPosition(m);
  };
  const closed = Array.from({ length: leaves.count }, (_, i) => at(i));
  for (let i = 0; i < 100; i++) model.update(0.05, { doorsOpen: true, direction: 1, speed: 0 });
  assert.equal(model.getDoorState().openFraction, 1);
  for (let i = 0; i < leaves.count; i++) {
    const moved = at(i).z - closed[i].z;
    if (closed[i].x > 0) assert.ok(Math.abs(Math.abs(moved) - 0.64) < 1e-5, `leaf ${i}`);
    else assert.equal(moved, 0);
  }
  for (let i = 0; i < 100; i++) model.update(0.05, { doorsOpen: true, speed: 3, direction: 1 });
  assert.equal(model.getDoorState().openFraction, 0);
  model.dispose();
});

test('model wheelsets sit on the railhead and turn with distance travelled', async () => {
  const model = setup();
  await model.attachModel(fakeLoader(await loadModel()));
  const wheels = models(model.cars[2], 'wheelsets');
  assert.ok(wheels.length > 0);
  const box = new THREE.Box3();
  wheels[0].geometry.computeBoundingBox();
  box.copy(wheels[0].geometry.boundingBox);
  const matrix = new THREE.Matrix4();
  wheels[0].getMatrixAt(0, matrix);
  const centre = new THREE.Vector3().setFromMatrixPosition(matrix);
  // Tread radius 0.458 on a 0.775 m centre leaves the tread on the 0.315 m railhead.
  assert.ok(Math.abs(centre.y - model.dimensions.wheelCenterHeight) < 1e-5);
  assert.ok(Math.abs(centre.y - 0.458 - 0.315) < 0.005);
  model.update(0.1, { distance: 0 });
  model.update(0.1, { distance: 1 });
  wheels[0].getMatrixAt(0, matrix);
  const angle = new THREE.Euler().setFromRotationMatrix(matrix).x;
  assert.ok(Math.abs(angle - ((1 / model.dimensions.wheelRadius) % (Math.PI * 2))) < 1e-5);
  model.dispose();
});

test('a missing or incomplete model file keeps the procedural train', async () => {
  const missing = setup();
  assert.equal(await missing.attachModel(fakeLoader(null)), 'failed');
  assert.ok(missing.cars[0].children.some((c) => c.visible && c.userData.trainLayer === 'shell'));
  missing.dispose();
  const partial = setup();
  const scene = new THREE.Group();
  scene.add(Object.assign(new THREE.Group(), { name: 'car-cab' }));
  assert.equal(await partial.attachModel(fakeLoader({ scene })), 'failed');
  partial.dispose();
});

test('model materials draw one side and never mix plain and instanced meshes', async () => {
  const model = setup();
  await model.attachModel(fakeLoader(await loadModel()));
  const users = new Map();
  for (const car of model.cars)
    car.traverse((object) => {
      if (!object.isMesh || !object.material.name?.startsWith('train-')) return;
      const kinds = users.get(object.material) ?? new Set();
      kinds.add(object.isInstancedMesh ? 'instanced' : 'plain');
      users.set(object.material, kinds);
    });
  assert.ok(users.size > 0);
  for (const [material, kinds] of users) {
    // One material on both kinds makes three.js pick a new program on every draw.
    assert.equal(kinds.size, 1, `${material.name} is shared by plain and instanced meshes`);
    // Blender exports double-sided materials; hidden back faces of closed parts z-fight.
    if (material.name === 'train-glass') assert.equal(material.forceSinglePass, true);
    else assert.equal(material.side, THREE.FrontSide, material.name);
  }
  model.dispose();
});

test('the train build report stays inside its budget', () => {
  assert.ok(report.trainTriangles <= 160000, `${report.trainTriangles} triangles`);
  assert.ok(report.glbBytes <= 800 * 1024, `${report.glbBytes} bytes`);
  assert.equal(report.contactHeight, 12.1 - 4.75);
  assert.deepEqual(report.layout.doorCentres, [-4.59, 4.59]);
  assert.equal(report.layout.leafSlide, 0.64);
  assert.equal(report.layout.halfLength, 6.2);
});
