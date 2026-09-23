import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {
  createCharacterGrab,
  motionSummary,
  registerGrabTools,
} from '../src/agent/character-grab.js';

function setup(characters, describe) {
  const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 500);
  camera.position.set(0, 1.6, 10);
  camera.lookAt(0, 1, 0);
  camera.updateMatrixWorld();
  let now = 0;
  const grabber = createCharacterGrab({
    THREE,
    camera,
    listCharacters: () => characters,
    describe,
    clock: () => now,
  });
  return { grabber, camera, tick: (seconds) => (now += seconds) };
}

test('motion summary counts direction reversals but ignores standing still', () => {
  const pacing = [0, 1, 2, 3, 4, 5].map((i) => [i * 0.1, i % 2 ? 0.2 : 0, 0, 0]);
  const walking = [0, 1, 2, 3].map((i) => [i * 0.1, 0, 0, i * 0.1]);
  const still = [0, 1, 2].map((i) => [i * 0.1, 1, 0, 1]);
  assert.equal(motionSummary(pacing).reversals, 4);
  assert.equal(motionSummary(walking).reversals, 0);
  assert.equal(motionSummary(walking).speedMps, 1);
  assert.deepEqual(
    { ...motionSummary(still), samples: 0 },
    { samples: 0, seconds: 0.2, pathMetres: 0, netMetres: 0, speedMps: 0, reversals: 0 },
  );
  assert.equal(motionSummary([]).samples, 0);
});

test('a grab finds the character under the point, not a far miss', () => {
  const characters = [
    { id: 'near', kind: 'momiji', name: 'student', position: [0, 0, 0], height: 1.7 },
    { id: 'side', kind: 'regional', name: 'vendor', position: [4, 0, 0], height: 1.7 },
  ];
  const { grabber } = setup(characters, (c) => ({ state: `state of ${c.id}` }));
  const hit = grabber.grab({ x: 0, y: 0 });
  assert.equal(hit.found, true);
  assert.equal(hit.id, 'near');
  assert.equal(hit.state, 'state of near');
  assert.deepEqual(hit.position, [0, 0, 0]);
  const miss = grabber.grab({ x: -0.95, y: 0.95 });
  assert.equal(miss.found, false);
  assert.equal(miss.nearest[0].id, 'near');
  assert.equal(grabber.getGrabs().length, 1, 'misses are not stored');
  assert.equal(grabber.grab({ id: 'side' }).name, 'vendor');
  assert.deepEqual(
    grabber.list().map((item) => item.id),
    ['near', 'side'],
  );
});

test('the history reveals a figure pacing back and forth', () => {
  const pacer = { id: 'pacer', kind: 'momiji', position: [0, 0, 0], height: 1.7 };
  const { grabber, tick } = setup([pacer]);
  for (let i = 0; i < 20; i++) {
    pacer.position = [i % 2 ? 0.15 : 0, 0, 0];
    grabber.update({ viewportAspect: 1 });
    tick(0.11);
  }
  const grabbed = grabber.grab({ x: 0, y: 0 }, 'click');
  assert.equal(grabbed.source, 'click');
  assert.ok(grabbed.motion.reversals >= 15, `reversals ${grabbed.motion.reversals}`);
  assert.ok(grabbed.path.length > 10);
});

test('grab tools validate their input and read back stored grabs', () => {
  const tools = new Map();
  const { grabber } = setup([{ id: 'a', kind: 'momiji', position: [0, 0, 0] }]);
  registerGrabTools({
    tool: (name, _description, schema, readOnly, handler) =>
      tools.set(name, { schema, readOnly, handler }),
    grabber,
  });
  assert.deepEqual([...tools.keys()].sort(), [
    'get_grabbed_characters',
    'grab_character',
    'list_grabbable_characters',
  ]);
  assert.equal(tools.get('grab_character').schema.additionalProperties, false);
  assert.throws(() => tools.get('grab_character').handler({}), /x and y, or an id/);
  assert.equal(tools.get('grab_character').handler({ x: 0, y: 0 }).id, 'a');
  assert.equal(tools.get('get_grabbed_characters').handler({}).grabs.length, 1);
});
