import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createStoryEngine } from '../src/narrative/story-engine.js';
import { createStoryLevels } from '../src/world/story-levels.js';
import { performLevelTask } from '../src/narrative/story-level-tools.js';
const campaign = {
  id: 'tasks',
  title: 'Task',
  chapters: [{ id: 'one' }],
  beats: [
    {
      id: 'fumi',
      chapterId: 'one',
      z: 4700,
      lines: ['Fumi holds out her hand.'],
      choices: [{ id: 'reply', label: 'Here it is.', response: ['I take the spanner out.'] }],
      task: {
        id: 'return-spanner',
        title: 'Return it',
        actionLabel: 'Set it down',
        required: true,
      },
    },
  ],
};
function setup() {
  const engine = createStoryEngine({ campaign, storage: null });
  const levels = createStoryLevels({
    THREE,
    scene: new THREE.Scene(),
    railPoint: (z) => new THREE.Vector3(0, 4, z),
    terrainHeight: () => 4,
  });
  engine.start();
  return { engine, levels };
}
test('prop action requires current reply, station proximity and stopped train before changing geometry and save', () => {
  const { engine, levels } = setup();
  const perform = (position = new THREE.Vector3(0, 4, 4700), speed = 0) =>
    performLevelTask({ taskId: 'return-spanner', engine, levels, position, speed });
  assert.equal(perform().ok, false);
  engine.choose('reply');
  assert.equal(engine.advance(), false);
  assert.equal(perform(new THREE.Vector3(0, 4, 4600)).ok, false);
  assert.equal(perform(undefined, 2).ok, false);
  assert.equal(levels.getState().spannerReturned, false);
  assert.equal(perform().ok, true);
  assert.equal(levels.getState().spannerReturned, true);
  assert.equal(perform().ok, false);
  const restored = createStoryEngine({ campaign, storage: null });
  assert.equal(restored.importSave(engine.exportSave()).ok, true);
  assert.deepEqual(restored.getState().completedTasks, ['return-spanner']);
  assert.equal(engine.advance(), true);
  levels.dispose();
  engine.dispose();
  restored.dispose();
});
