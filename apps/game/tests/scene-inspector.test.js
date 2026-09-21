import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { installSceneInspector } from '../src/agent/scene-inspector.js';

function fixture() {
  const scene = new THREE.Scene();
  const shared = new THREE.MeshStandardMaterial({ color: '#ff0000', roughness: 0.6 });
  const train = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 4), shared);
  train.name = 'train-front';
  scene.add(train);
  const other = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), shared);
  other.name = 'rock';
  other.position.x = 10;
  scene.add(other);
  const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 100);
  camera.position.set(0, 0, 10);
  camera.lookAt(0, 0, 0);
  const calls = [];
  const api = installSceneInspector({
    THREE,
    scene,
    camera,
    train: [train],
    renderer: {
      info: { render: { calls: 12 }, memory: { geometries: 2 }, programs: [] },
      getPixelRatio: () => 1,
    },
    getState: () => ({ speed: 15, view: 'driver' }),
    actions: {
      camera: (value) => {
        calls.push(value);
        return 'changed';
      },
    },
  });
  return { api, scene, camera, train, other, shared, calls };
}

test('snapshot returns compact game, camera, rendering and named object context', () => {
  const { api } = fixture();
  const snapshot = api.snapshot();
  assert.equal(snapshot.game.speed, 15);
  assert.deepEqual(snapshot.camera.position, [0, 0, 10]);
  assert.equal(snapshot.renderer.render.calls, 12);
  assert.equal(snapshot.scene.entities.length, 2);
  assert.equal(snapshot.scene.entities[0].geometry.vertices, 24);
  assert.ok(!JSON.stringify(snapshot).includes('arrayBuffer'));
  assert.doesNotThrow(() => JSON.stringify(snapshot));
});

test('find, inspect and raycast identify visible geometry without exposing vertex buffers', () => {
  const { api, train } = fixture();
  assert.equal(api.find('train').length, 1);
  assert.equal(api.inspect(train.uuid).name, 'train-front');
  assert.equal(api.inspect(train.id).uuid, train.uuid);
  assert.equal(api.raycast(0, 0)[0].uuid, train.uuid);
  train.visible = false;
  assert.equal(api.raycast(0, 0).length, 0);
  assert.throws(() => api.raycast(2, 0), TypeError);
});

test('patch isolates shared materials, restores changes with undo, and supports stacked edits', () => {
  const { api, train, other, shared } = fixture();
  api.patchObject('train-front', {
    position: [1, 2, 3],
    material: { color: '#00ff00', roughness: 0.2 },
  });
  assert.notEqual(train.material, shared);
  assert.equal(other.material.color.getHexString(), 'ff0000');
  assert.equal(train.material.color.getHexString(), '00ff00');
  api.patchObject(train.uuid, { visible: false, scale: [2, 2, 2] });
  api.undo();
  assert.equal(train.visible, true);
  assert.equal(train.material.color.getHexString(), '00ff00');
  api.undo();
  assert.deepEqual(train.position.toArray(), [0, 0, 0]);
  assert.equal(train.material, shared);
  assert.equal(api.undo(), false);
});

test('invalid patches fail before mutation, and ambiguous names require a UUID', () => {
  const { api, train, other } = fixture();
  assert.throws(
    () => api.patchObject(train.uuid, { position: [1, 2, 3], material: { roughness: NaN } }),
    TypeError,
  );
  assert.deepEqual(train.position.toArray(), [0, 0, 0]);
  assert.throws(() => api.patchObject(train.uuid, { scale: [0, 1, 1] }), TypeError);
  assert.throws(() => api.patchObject(train.uuid, { eval: 'code' }), /Unsupported/);
  assert.throws(() => api.patchObject(train.uuid, { material: { color: 'red' } }), TypeError);
  other.name = train.name;
  assert.throws(() => api.patchObject('train-front', { visible: false }), /ambiguous/);
});

test('set forwards only supported and installed actions', () => {
  const { api, calls } = fixture();
  assert.equal(api.set('camera', 'driver'), 'changed');
  assert.deepEqual(calls, ['driver']);
  assert.throws(() => api.set('eval', 'anything'), /Unknown/);
  assert.throws(() => api.set('weather', 'snow'), /unavailable/);
});

test('audit detects camera within the train bounds and non-finite transforms', () => {
  const { api, camera, other } = fixture();
  assert.equal(api.audit().cameraWithinTrainBounds.length, 0);
  camera.position.set(0, 0, 0);
  other.position.x = NaN;
  const audit = api.audit();
  assert.equal(audit.cameraWithinTrainBounds.length, 1);
  assert.equal(audit.nonFiniteTransforms.length, 1);
});
