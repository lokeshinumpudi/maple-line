import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createStoryEngine,
  STORY_ARRIVAL_RADIUS,
  STORY_ARRIVAL_SPEED,
} from '../src/narrative/story-engine.js';
import { campaign as authoredCampaign } from '../src/narrative/story-data.js';

const memory = (id) => ({ id, title: id, text: `Remember ${id}.` });
const campaign = {
  id: 'test-campaign',
  title: 'A grandfather’s railway',
  chapters: [
    { id: 'home', title: 'Home', zStart: -440, zEnd: 100 },
    { id: 'return', title: 'Return', zStart: 100, zEnd: 500 },
  ],
  beats: [
    {
      id: 'intro',
      chapterId: 'home',
      z: -440,
      title: 'A ticket',
      speaker: 'Haru',
      lines: ['I kept it.'],
      choices: [],
      memory: memory('ticket'),
    },
    {
      id: 'bridge',
      chapterId: 'home',
      z: 100,
      title: 'The bridge',
      speaker: 'Haru',
      lines: ['What would you like to know?'],
      choices: [
        {
          id: 'friend',
          label: 'The friend',
          response: ['We shared our lunch.'],
          memory: memory('lunch'),
        },
        {
          id: 'work',
          label: 'The work',
          response: ['I repaired the signals.'],
          memory: memory('signal'),
        },
      ],
    },
    {
      id: 'ending',
      chapterId: 'return',
      z: 500,
      title: 'Tomorrow',
      speaker: 'Haru',
      lines: ['There is another train tomorrow.'],
      choices: [],
      memory: memory('tomorrow'),
    },
  ],
};
const arrive = (engine, z, patch = {}) =>
  engine.update({ z, speed: 0, paused: false, started: true, ...patch });
function fakeStorage() {
  const values = new Map();
  return {
    values,
    writes: 0,
    getItem(key) {
      return values.get(key) ?? null;
    },
    setItem(key, value) {
      this.writes++;
      values.set(key, value);
    },
    removeItem(key) {
      values.delete(key);
    },
  };
}

test('story is dormant until start and intro waits for explicit Continue', () => {
  const engine = createStoryEngine({ campaign, storage: null });
  assert.equal(engine.getState().status, 'dormant');
  assert.equal(arrive(engine, -440), false);
  assert.equal(engine.start(), true);
  assert.equal(engine.getState().activeBeat.id, 'intro');
  assert.equal(engine.getState().canContinue, true);
  assert.deepEqual(engine.journal(), []);
  assert.equal(arrive(engine, 500), false);
  engine.advance();
  assert.equal(engine.getState().status, 'travelling');
  assert.deepEqual(
    engine.journal().map((entry) => entry.id),
    ['ticket'],
  );
});

test('choice response is locked, displayed, then committed once by Continue', () => {
  const engine = createStoryEngine({ campaign, storage: null });
  engine.start();
  engine.advance();
  arrive(engine, 100);
  assert.equal(engine.advance(), false);
  assert.equal(engine.choose('missing'), false);
  assert.equal(engine.choose('friend'), true);
  assert.equal(engine.choose('work'), false);
  assert.deepEqual(engine.getState().activeBeat.displayLines, ['We shared our lunch.']);
  assert.equal(engine.getState().activeBeat.phase, 'response');
  assert.equal(engine.journal().length, 1, 'response keepsake is not awarded before Continue');
  assert.equal(engine.advance(), true);
  assert.equal(engine.advance(), false);
  assert.deepEqual(engine.getState().choices, { bridge: 'friend' });
  assert.deepEqual(
    engine.journal().map((entry) => entry.id),
    ['ticket', 'lunch'],
  );
  assert.deepEqual(engine.getState().progress.completedChapterIds, ['home']);
});

test('arrival requires near the next location and a slow, unpaused, started train', () => {
  const engine = createStoryEngine({ campaign, storage: null });
  engine.start();
  engine.advance();
  assert.equal(arrive(engine, 100, { paused: true }), false);
  assert.equal(arrive(engine, 100, { started: false }), false);
  assert.equal(arrive(engine, 100, { speed: 18 }), false);
  assert.equal(arrive(engine, 100, { speed: NaN }), false);
  assert.equal(arrive(engine, 100, { speed: -1 }), false);
  assert.equal(arrive(engine, 100 + STORY_ARRIVAL_RADIUS + 1), false);
  assert.equal(arrive(engine, 100 + STORY_ARRIVAL_RADIUS, { speed: STORY_ARRIVAL_SPEED }), true);
});

test('teleporting to the ending cannot skip the bridge; reverse travel cannot replay completed beats', () => {
  const engine = createStoryEngine({ campaign, storage: null });
  engine.start();
  engine.advance();
  assert.equal(arrive(engine, 500), false);
  assert.equal(engine.nextDestination().id, 'bridge');
  assert.equal(arrive(engine, 100), true);
  engine.choose('work');
  engine.advance();
  assert.equal(arrive(engine, -440), false);
  assert.equal(arrive(engine, 100), false);
  assert.equal(arrive(engine, 500), true);
  engine.advance();
  assert.equal(engine.getState().status, 'complete');
  assert.equal(engine.getState().progress.fraction, 1);
  assert.deepEqual(engine.getState().progress.completedChapterIds, ['home', 'return']);
  assert.equal(engine.nextDestination(), null);
  assert.equal(arrive(engine, 500), false);
});

test('saved choice responses resume exactly once and reset starts a new campaign', () => {
  const storage = fakeStorage();
  const first = createStoryEngine({ campaign, storage });
  first.start();
  first.advance();
  arrive(first, 100);
  first.choose('work');
  first.dispose();
  const resumed = createStoryEngine({ campaign, storage });
  assert.equal(resumed.getState().status, 'dormant');
  assert.equal(resumed.getState().hasSave, true);
  assert.equal(resumed.getState().activeBeat, null);
  resumed.start();
  assert.equal(resumed.getState().activeBeat.selectedChoice, 'work');
  assert.deepEqual(resumed.getState().activeBeat.displayLines, ['I repaired the signals.']);
  resumed.advance();
  assert.deepEqual(
    resumed.journal().map((entry) => entry.id),
    ['ticket', 'signal'],
  );
  resumed.reset();
  assert.equal(resumed.getState().hasSave, false);
  assert.equal(storage.values.size, 0);
  resumed.start();
  assert.equal(resumed.getState().activeBeat.id, 'intro');
  assert.deepEqual(resumed.journal(), []);
});

test('suspending into explore retains dialogue without firing beats', () => {
  const engine = createStoryEngine({ campaign, storage: null });
  engine.start();
  engine.advance();
  arrive(engine, 100);
  engine.choose('friend');
  engine.suspend();
  assert.equal(engine.getState().enabled, false);
  assert.equal(engine.getState().activeBeat, null);
  assert.equal(arrive(engine, 500), false);
  assert.equal(engine.advance(), false);
  engine.start();
  assert.equal(engine.getState().activeBeat.selectedChoice, 'friend');
});

test('corrupt, oversized, incompatible, and structurally invalid saves are rejected without changing progress', () => {
  const engine = createStoryEngine({ campaign, storage: null });
  engine.start();
  engine.advance();
  const save = engine.exportSave();
  const invalid = [
    '{',
    ' '.repeat(65537),
    null,
    { ...save, version: 2 },
    { ...save, campaignId: 'other' },
    { ...save, completed: 99 },
    { ...save, completed: 1.5 },
    { ...save, active: 'yes' },
    { ...save, choices: { ending: 'invented' } },
    { ...save, selectedChoice: 'work' },
    { ...save, completed: 2, choices: {} },
    { ...save, lastKnownRouteZ: Infinity },
    { ...save, completed: 3, active: true, choices: { bridge: 'friend' } },
  ];
  for (const value of invalid) {
    assert.equal(engine.importSave(value).ok, false);
    assert.deepEqual(engine.exportSave(), save);
  }
  assert.equal(engine.importSave(JSON.stringify(save)).ok, true);
  const storage = fakeStorage();
  storage.setItem('broken', '{');
  const broken = createStoryEngine({ campaign, storage, saveKey: 'broken' });
  assert.equal(broken.getState().hasSave, false);
  assert.match(broken.getState().saveError, /damaged/);
  assert.equal(broken.start(), true);
});

test('unavailable storage does not prevent the campaign, and movement saves are bounded', () => {
  const blocked = createStoryEngine({
    campaign,
    storage: {
      getItem() {
        throw new Error('blocked');
      },
      setItem() {
        throw new Error('quota');
      },
      removeItem() {
        throw new Error('blocked');
      },
    },
  });
  blocked.start();
  blocked.advance();
  arrive(blocked, 100);
  assert.equal(blocked.getState().activeBeat.id, 'bridge');
  assert.match(blocked.getState().saveError, /could not be saved/);
  const storage = fakeStorage();
  const engine = createStoryEngine({ campaign, storage });
  engine.start();
  engine.advance();
  for (let frame = 0; frame < 10000; frame++) arrive(engine, -440 + frame / 50);
  assert.ok(storage.writes <= 4, 'position must not write localStorage every animation frame');
  assert.ok(engine.getState().lastKnownRouteZ > -250);
});

test('journal/export do not expose internal mutable data and disposed engines stop accepting commands', () => {
  const engine = createStoryEngine({ campaign, storage: null });
  let changes = 0;
  const unsubscribe = engine.subscribe(() => changes++);
  engine.start();
  engine.advance();
  engine.journal()[0].text = 'changed';
  engine.exportSave().choices.intro = 'changed';
  assert.equal(engine.journal()[0].text, 'Remember ticket.');
  assert.deepEqual(engine.getState().choices, {});
  engine.dispose();
  assert.equal(engine.start(), false);
  assert.equal(engine.reset(), false);
  assert.equal(engine.choose('friend'), false);
  assert.equal(arrive(engine, 100), false);
  assert.equal(changes, 2);
  unsubscribe();
});

test('bad campaign ordering or choice data fails during construction', () => {
  assert.throws(
    () => createStoryEngine({ campaign: { ...campaign, beats: [...campaign.beats].reverse() } }),
    /ordered/,
  );
  assert.throws(() => createStoryEngine({ campaign: { ...campaign, beats: [] } }), /1–256/);
});

test('the authored 18-beat campaign reaches its ending through either set of choices with reloads', () => {
  assert.equal(authoredCampaign.beats.length, 18);
  for (const branch of [0, 1]) {
    const storage = fakeStorage();
    let engine = createStoryEngine({ campaign: authoredCampaign, storage });
    engine.start();
    for (const beat of authoredCampaign.beats) {
      if (!engine.getState().activeBeat) assert.equal(arrive(engine, beat.z), true);
      assert.equal(engine.getState().activeBeat.id, beat.id);
      if (beat.choices?.length) {
        const choice = beat.choices[Math.min(branch, beat.choices.length - 1)];
        assert.equal(engine.choose(choice.id), true);
        engine.dispose();
        engine = createStoryEngine({ campaign: authoredCampaign, storage });
        engine.start();
        assert.deepEqual(engine.getState().activeBeat.displayLines, choice.response);
      }
      if (beat.task?.kind === 'delivery-plan') {
        assert.equal(engine.recordDeliveryAction('inspect'), true);
        assert.equal(engine.recordDeliveryAction('shared-van'), true);
      } else if (beat.task?.required) assert.equal(engine.recordTask(beat.task.id), true);
      assert.equal(engine.advance(), true);
    }
    assert.equal(engine.getState().status, 'complete');
    assert.equal(engine.getState().progress.completedChapterIds.length, 5);
    assert.equal(engine.getState().seenIds.length, 18);
    assert.equal(new Set(engine.journal().map((entry) => entry.id)).size, engine.journal().length);
    assert.equal(engine.journal().at(-1).id, branch === 0 ? 'next-saturday' : 'future-ticket');
    engine.dispose();
    const finished = createStoryEngine({ campaign: authoredCampaign, storage });
    finished.start();
    assert.equal(finished.getState().status, 'complete');
    assert.equal(finished.getState().activeBeat, null);
  }
});

test('earlier choices return in later dialogue on both paths and survive reload', () => {
  const source = structuredClone(campaign);
  source.beats[2].callbacks = [
    { beatId: 'bridge', choiceId: 'friend', lines: ['You remembered your friend.'] },
    { beatId: 'bridge', choiceId: 'work', lines: ['You remembered the repair.'] },
  ];
  for (const [choiceId, expected] of [
    ['friend', 'You remembered your friend.'],
    ['work', 'You remembered the repair.'],
  ]) {
    const engine = createStoryEngine({ campaign: source, storage: null });
    engine.start();
    engine.advance();
    arrive(engine, 100);
    engine.choose(choiceId);
    engine.advance();
    const restored = createStoryEngine({ campaign: source, storage: null });
    assert.equal(restored.importSave(engine.exportSave()).ok, true);
    restored.start();
    arrive(restored, 500);
    assert.deepEqual(restored.getState().activeBeat.displayLines, [
      ...source.beats[2].lines,
      expected,
    ]);
    assert.equal(restored.getState().activeBeat.displayLines.length, 2);
  }
  for (const callback of [
    { beatId: 'ending', choiceId: 'friend', lines: ['self'] },
    { beatId: 'bridge', choiceId: 'unknown', lines: ['missing'] },
    { beatId: 'bridge', choiceId: 'friend', lines: [2] },
  ]) {
    source.beats[2].callbacks = [callback];
    assert.throws(() => createStoryEngine({ campaign: source, storage: null }), /callbacks/);
  }
  source.beats[0].callbacks = [{ beatId: 'bridge', choiceId: 'friend', lines: ['future'] }];
  assert.throws(() => createStoryEngine({ campaign: source, storage: null }), /earlier/);
});

test('rolling dialogue activates at speed, follows the train in saves, and cannot replay', () => {
  const source = structuredClone(campaign);
  source.beats[1].delivery = 'rolling';
  const storage = fakeStorage();
  let engine = createStoryEngine({ campaign: source, storage });
  engine.start();
  engine.advance();
  assert.equal(engine.getState().nextStopBeat.id, 'ending');
  assert.equal(arrive(engine, 100, { speed: 15, paused: true }), false);
  assert.equal(arrive(engine, 100, { speed: 15 }), true);
  assert.equal(arrive(engine, 320, { speed: 15 }), false);
  assert.equal(engine.getState().lastKnownRouteZ, 320);
  assert.equal(engine.getState().activeBeat.id, 'bridge');
  engine.choose('friend');
  engine.dispose();
  engine = createStoryEngine({ campaign: source, storage });
  engine.start();
  assert.equal(engine.getState().lastKnownRouteZ, 320);
  assert.equal(engine.getState().activeBeat.selectedChoice, 'friend');
  engine.advance();
  assert.equal(arrive(engine, 100, { speed: 15 }), false);
  assert.equal(arrive(engine, 500, { speed: 15 }), false);
  assert.equal(arrive(engine, 500), true);
});

test('physical tasks require a settled choice and persist alongside wildlife observations', () => {
  const source = structuredClone(campaign);
  source.beats[1].task = {
    id: 'spanner',
    title: 'Return the spanner',
    actionLabel: 'Put it on the bench',
    required: true,
  };
  source.beats[2].task = {
    id: 'sheet',
    title: 'Amend the sheet',
    actionLabel: 'Pin the sheet',
    required: true,
  };
  const encounters = {
    bridge: {
      title: 'River birds',
      note: 'A bird sang.',
      invitation: 'Listen.',
      species: { autumn: ['bird', 'Bird'] },
      actions: [{ id: 'record', label: 'Record' }],
      record: 'Recorded.',
    },
  };
  const engine = createStoryEngine({ campaign: source, encounters, storage: null });
  engine.start();
  engine.advance();
  arrive(engine, 100);
  assert.equal(engine.recordTask('spanner'), false);
  engine.choose('friend');
  assert.equal(engine.getState().canContinue, false);
  assert.equal(engine.advance(), false);
  assert.equal(engine.recordTask('sheet'), false);
  engine.setNearbyWildlife({ beatId: 'bridge', season: 'autumn' });
  assert.equal(engine.observeWildlife('record'), true);
  assert.equal(engine.recordTask('spanner'), true);
  assert.equal(engine.recordTask('spanner'), false);
  assert.equal(engine.getState().activeBeat.task.completed, true);
  assert.equal(engine.getState().canContinue, true);
  const save = engine.exportSave();
  const restored = createStoryEngine({ campaign: source, encounters, storage: null });
  assert.equal(restored.importSave(save).ok, true);
  restored.start();
  assert.deepEqual(restored.getState().completedTasks, ['spanner']);
  assert.deepEqual(restored.getState().fieldNotes, {
    bridge: { season: 'autumn', action: 'record' },
  });
  assert.equal(restored.getState().wildlifeEncounter.selectedAction, 'record');
  for (const taskFacts of [{ sheet: true }, { unknown: true }, { spanner: false }, []])
    assert.equal(restored.importSave({ ...save, taskFacts }).ok, false);
  const legacy = { ...save };
  delete legacy.taskFacts;
  assert.equal(restored.importSave(legacy).ok, true);
  assert.equal(restored.getState().canContinue, false);
  assert.equal(restored.recordTask('spanner'), true);
  restored.advance();
  arrive(restored, 500);
  assert.equal(
    restored.recordTask('sheet'),
    true,
    'tasks without choices can be completed directly',
  );
  restored.advance();
  restored.reset();
  assert.deepEqual(restored.getState().completedTasks, []);
  assert.deepEqual(restored.getState().fieldNotes, {});
});
