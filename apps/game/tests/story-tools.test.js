import test from 'node:test';
import assert from 'node:assert/strict';
import { createStoryEngine } from '../src/narrative/story-engine.js';
import { registerStoryTools } from '../src/narrative/story-tools.js';
import { campaign } from '../src/narrative/story-data.js';
import { createStationDuties } from '../src/simulation/station-duties.js';

function setup() {
  const values = new Map();
  const storage = {
    getItem: (key) => values.get(key),
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
  };
  const engine = createStoryEngine({ campaign, storage });
  const definitions = new Map();
  const calls = [];
  registerStoryTools({
    engine,
    tool(name, description, schema, readOnly, execute) {
      definitions.set(name, { name, description, schema, readOnly, execute });
    },
    actions: {
      start: () => calls.push('start'),
      resume: () => calls.push('resume'),
      exit: () => calls.push('exit'),
      travel: (z) => {
        calls.push({ travel: z });
        engine.update({ z, speed: 0, paused: false, started: true });
      },
    },
  });
  return {
    engine,
    definitions,
    calls,
    act: (input) => definitions.get('story_action').execute(input),
  };
}

test('story tools expose an independent read-only state and strict action shapes', () => {
  const { engine, definitions } = setup();
  const read = definitions.get('get_story_state');
  assert.equal(read.readOnly, true);
  assert.deepEqual(read.execute(), engine.getState());
  read.execute().progress.completed = 100;
  assert.equal(engine.getState().progress.completed, 0);
  assert.equal(engine.getState().status, 'dormant');
  const schema = definitions.get('story_action').schema;
  assert.equal(schema.additionalProperties, false);
  assert.equal(schema.oneOf[0].properties.choiceId, undefined);
  assert.deepEqual(schema.oneOf[1].required, ['action', 'choiceId']);
  assert.equal(schema.properties.action.enum.includes('reset'), false);
});

test('tool actions use host driving callbacks and preserve response-before-travel ordering', async () => {
  const { engine, calls, act } = setup();
  await assert.rejects(act({ action: 'continue' }), /no conversation/);
  await act({ action: 'start' });
  assert.deepEqual(calls, ['start']);
  await assert.rejects(act({ action: 'start' }), /already active/);
  await assert.rejects(act({ action: 'travel' }), /between memories/);
  await assert.rejects(act({ action: 'continue' }), /Choose a reply/);
  const choice = engine.getState().activeBeat.choices[0];
  const response = await act({ action: 'choose', choiceId: choice.id });
  assert.equal(response.story.activeBeat.phase, 'response');
  await assert.rejects(act({ action: 'choose', choiceId: choice.id }), /already been chosen/);
  await act({ action: 'continue' });
  const next = engine.nextDestination();
  await act({ action: 'travel' });
  assert.deepEqual(calls.at(-1), { travel: next.z });
  assert.equal(engine.getState().activeBeat.id, next.id);
  await act({ action: 'exit' });
  assert.equal(engine.getState().status, 'dormant');
  assert.equal(calls.at(-1), 'exit');
  await assert.rejects(act({ action: 'start' }), /save already exists/);
  await act({ action: 'resume' });
  assert.equal(calls.at(-1), 'resume');
  assert.equal(engine.getState().activeBeat.id, next.id);
});

test('saved intro is protected from start and unavailable callbacks do not alter the story', async () => {
  const { engine, act } = setup();
  await act({ action: 'start' });
  await act({ action: 'exit' });
  await assert.rejects(act({ action: 'start' }), /save already exists/);
  const captured = new Map();
  registerStoryTools({
    engine,
    tool: (name, _description, _schema, _readOnly, handler) => captured.set(name, handler),
  });
  await assert.rejects(captured.get('story_action')({ action: 'resume' }), /unavailable/);
  assert.equal(engine.getState().enabled, false);
  await act({ action: 'resume' });
  await assert.rejects(captured.get('story_action')({ action: 'exit' }), /unavailable/);
  assert.equal(engine.getState().enabled, true);
  await assert.rejects(captured.get('story_action')({ action: 'reset' }), /Unknown/);
});

test('an asynchronous host transition cannot receive overlapping story actions', async () => {
  const engine = createStoryEngine({ campaign, storage: null });
  const definitions = new Map();
  let finishStart;
  registerStoryTools({
    engine,
    tool: (name, _description, _schema, _readOnly, execute) => definitions.set(name, execute),
    actions: {
      start: () =>
        new Promise((resolve) => {
          finishStart = resolve;
        }),
    },
  });
  const action = definitions.get('story_action');
  const pending = action({ action: 'start' });
  await assert.rejects(action({ action: 'start' }), /already in progress/);
  assert.equal(definitions.get('get_story_state')().enabled, false);
  finishStart();
  await pending;
  assert.equal(engine.getState().status, 'dialogue');
  await action({ action: 'choose', choiceId: engine.getState().activeBeat.choices[0].id });
  assert.equal(engine.getState().activeBeat.phase, 'response');
});

test('a host duty hold rejects story travel instead of falsely reporting a successful jump', async () => {
  const engine = createStoryEngine({ campaign, storage: null });
  const duties = createStationDuties();
  engine.start();
  for (const beat of campaign.beats.slice(0, 3)) {
    if (!engine.getState().activeBeat)
      engine.update({ z: beat.z, speed: 0, paused: false, started: true });
    if (beat.choices?.length) engine.choose(beat.choices[0].id);
    if (beat.task?.kind === 'delivery-plan') {
      engine.recordDeliveryAction('inspect');
      engine.recordDeliveryAction('later-clinic');
    }
    engine.advance();
  }
  duties.update({
    dt: 0,
    z: 525,
    speed: 0,
    doorsOpen: false,
    doorFraction: 0,
    storyEnabled: true,
    storyBeatId: engine.getState().nextBeat.id,
    storyCompletedIds: engine.getState().seenIds,
  });
  assert.equal(duties.getState().active, true);
  const captured = new Map();
  let jumps = 0;
  registerStoryTools({
    engine,
    tool: (name, _description, _schema, _readOnly, execute) => captured.set(name, execute),
    actions: {
      travel: (z) => {
        if (duties.getState().active) return false;
        jumps++;
        engine.update({ z, speed: 0, paused: false, started: true });
        return true;
      },
    },
  });
  await assert.rejects(captured.get('story_action')({ action: 'travel' }), /rejected: travel/);
  assert.equal(jumps, 0);
  assert.equal(engine.getState().status, 'travelling');
  assert.equal(engine.getState().nextBeat.id, 'sakuragawa-water');
  assert.equal(engine.getState().progress.completed, 3);
  duties.reset();
  await captured.get('story_action')({ action: 'travel' });
  assert.equal(jumps, 1);
  assert.equal(engine.getState().activeBeat.id, 'sakuragawa-water');
});

test('a rejected host start leaves the engine dormant and preserves the host error', async () => {
  const engine = createStoryEngine({ campaign, storage: null });
  const captured = new Map();
  registerStoryTools({
    engine,
    tool: (name, _description, _schema, _readOnly, execute) => captured.set(name, execute),
    actions: { start: () => ({ ok: false, message: 'The train is not ready.' }) },
  });
  await assert.rejects(captured.get('story_action')({ action: 'start' }), /train is not ready/);
  assert.equal(engine.getState().status, 'dormant');
});
