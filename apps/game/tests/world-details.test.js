import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { addWorldDetails } from '../src/world/world-details.js';

test('newspaper is visible only while its reader is seated and station props keep their place', () => {
  const scene = new THREE.Scene();
  const world = addWorldDetails({ THREE, scene, center: () => 0, terrain: () => 4.1 });
  world.update(0, { weather: 'clear' });
  const paper = world.root.children.find(
    (object) =>
      object.isInstancedMesh &&
      object.material.name === 'Countryside / paper' &&
      object.name.startsWith('Residents /'),
  );
  assert.ok(paper);
  const visible = () => {
    const matrix = new THREE.Matrix4();
    let count = 0;
    for (let i = 0; i < paper.count; i++) {
      paper.getMatrixAt(i, matrix);
      if (matrix.elements[0] ** 2 + matrix.elements[1] ** 2 + matrix.elements[2] ** 2 > 0.001)
        count++;
    }
    return count;
  };
  assert.equal(visible(), 1);
  const furniture = world.root.children.filter((object) =>
    object.name.startsWith('Momiji station furniture'),
  );
  const originals = furniture.map((object) => Array.from(object.instanceMatrix.array));
  for (let i = 0; i < 410; i++) world.update(0.1, { weather: 'clear' });
  assert.equal(visible(), 0);
  furniture.forEach((object, i) =>
    assert.deepEqual(Array.from(object.instanceMatrix.array), originals[i]),
  );
  assert.ok(
    world
      .getPopulationState()
      .people.some((person) => person.id === 'reader-1' && person.state === 'returning-home'),
  );
  world.dispose();
});
