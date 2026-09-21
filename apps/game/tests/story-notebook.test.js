import test from 'node:test';
import assert from 'node:assert/strict';
import { createStoryEngine } from '../src/narrative/story-engine.js';
import {
  currentNotebookPage,
  describeRecordedTask,
  latestConversationMemory,
} from '../src/narrative/story-notebook.js';

const campaign = {
  id: 'notebook-test',
  title: 'A borrowed tool',
  chapters: [{ id: 'home', title: 'Home' }],
  beats: [
    {
      id: 'workshop',
      chapterId: 'home',
      z: 0,
      title: 'At the workshop',
      lines: ['A borrowed tool.'],
      choices: [
        {
          id: 'return',
          label: 'Ask about the tool.',
          response: ['Thank you.'],
          memory: { id: 'tool', title: 'A loan repaid', text: 'Fumi has her spanner.' },
        },
        {
          id: 'other',
          label: 'Ask about Saturday.',
          response: ['Saturday.'],
          memory: { id: 'saturday', title: 'Saturday', text: 'A different memory.' },
        },
      ],
      task: {
        id: 'return-spanner',
        title: 'Return Fumi’s spanner',
        actionLabel: 'Set it on the bench',
        required: true,
      },
    },
    { id: 'home', chapterId: 'home', z: 100, title: 'Home', lines: ['Home.'], choices: [] },
  ],
};

test('notebook separates an unanswered scene, reply, completed action and awarded memory', () => {
  const engine = createStoryEngine({ campaign, storage: null });
  engine.start();
  let page = currentNotebookPage(engine.getState());
  assert.match(page.prompt, /reply is waiting/);
  assert.equal(page.reply, null);
  assert.equal(page.action, null);
  engine.choose('return');
  page = currentNotebookPage(engine.getState());
  assert.equal(page.reply, 'Ask about the tool.');
  assert.match(page.prompt, /Still to do: Return Fumi/);
  assert.deepEqual(engine.journal(), []);
  assert.equal(latestConversationMemory(engine.getState()), null);
  engine.recordTask('return-spanner');
  assert.match(currentNotebookPage(engine.getState()).action, /spanner returned/);
  assert.deepEqual(
    engine.journal(),
    [],
    'finishing the prop action does not finish the conversation',
  );
  engine.advance();
  const state = engine.getState();
  assert.equal(currentNotebookPage(state), null);
  const memory = latestConversationMemory(state);
  assert.equal(memory.id, 'tool');
  assert.equal(memory.origin.title, 'At the workshop');
  assert.equal(memory.origin.choiceLabel, 'Ask about the tool.');
  assert.equal(memory.origin.completedTask.completed, true);
  assert.equal(state.memories.length, 1, 'unchosen memory stays hidden');
});

test('notebook context is rebuilt from existing save facts and stays detached', () => {
  const original = createStoryEngine({ campaign, storage: null });
  original.start();
  original.choose('return');
  original.recordTask('return-spanner');
  original.advance();
  const save = original.exportSave();
  assert.equal('memories' in save, false, 'no new persisted presentation data');
  const restored = createStoryEngine({ campaign, storage: null });
  assert.equal(restored.importSave(save).ok, true);
  assert.deepEqual(restored.journal(), original.journal());
  restored.journal()[0].origin.completedTask.title = 'changed';
  assert.equal(restored.journal()[0].origin.completedTask.title, 'Return Fumi’s spanner');
});

test('receipt identifies the completed conversation even if field notes come last', () => {
  const state = {
    status: 'travelling',
    seenIds: ['first', 'second'],
    memories: [
      { id: 'first', origin: { beatId: 'first' } },
      { id: 'second', origin: { beatId: 'second' } },
      { id: 'bird', origin: { beatId: 'second', kind: 'field-note' } },
    ],
  };
  assert.equal(latestConversationMemory(state).id, 'second');
  assert.equal(latestConversationMemory({ ...state, seenIds: ['no-memory'] }), null);
  assert.equal(latestConversationMemory({ ...state, status: 'complete' }), null);
});

test('clinic labels preserve pending confirmation and never announce delivery', () => {
  for (const proposal of ['later-clinic', 'shared-van']) {
    const task = { kind: 'delivery-plan', completed: false, delivery: { proposal } };
    assert.equal(describeRecordedTask(task), null);
    const label = describeRecordedTask({ ...task, completed: true });
    assert.match(label, /Confirmation is still pending; the crate stays with Nao/);
    assert.match(label, proposal === 'later-clinic' ? /10:00/ : /shared van/);
  }
});
