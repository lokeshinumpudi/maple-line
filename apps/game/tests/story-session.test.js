import test from 'node:test';
import assert from 'node:assert/strict';
import { createStoryEngine } from '../src/narrative/story-engine.js';
import { createStoryHost } from '../src/narrative/story-host.js';
import { connectStorySession } from '../src/narrative/story-session.js';
import { createStationDuties } from '../src/simulation/station-duties.js';
import { createGameStore } from '../src/state/game-store.js';

const campaign = {
  id: 'duty-save-test',
  title: 'Station work',
  chapters: [{ id: 'one', title: 'One' }],
  beats: ['momiji-bread', 'sakuragawa-water'].map((id, index) => ({
    id,
    chapterId: 'one',
    z: index ? 1500 : 525,
    title: id,
    lines: ['A scene.'],
    choices: [],
  })),
};
function memoryStorage() {
  const data = new Map();
  return {
    writes: 0,
    getItem: (key) => data.get(key),
    setItem(key, value) {
      this.writes++;
      data.set(key, value);
    },
    removeItem: (key) => data.delete(key),
  };
}
function setup(storage) {
  const engine = createStoryEngine({ campaign, storage });
  const duties = createStationDuties();
  const gameStore = createGameStore();
  const session = connectStorySession({ engine, duties });
  const jumps = [];
  const host = createStoryHost({
    engine,
    stationDuties: duties,
    gameStore,
    jumpTo: (z) => jumps.push(z),
    zToDistance: (z) => z,
  });
  function update(patch = {}) {
    const story = engine.getState();
    return duties.update({
      z: 525,
      speed: 0,
      doorsOpen: false,
      doorFraction: 0,
      dt: 0,
      storyEnabled: story.enabled,
      storyBeatId: story.nextBeat?.id,
      storyCompletedIds: story.seenIds,
      ...patch,
    });
  }
  function startDuty() {
    host.start();
    engine.start();
    engine.advance();
    update();
  }
  function board() {
    duties.act('route-passenger');
    for (let i = 0; i < 12; i++) update({ dt: 0.25, doorsOpen: true, doorFraction: 1 });
    update();
  }
  return { engine, duties, host, session, jumps, gameStore, update, startDuty, board };
}
test('one checkpoint resumes partial boarding at Momiji with physical doors closed and no skipped duty', () => {
  const storage = memoryStorage(),
    first = setup(storage);
  assert.equal(storage.writes, 0, 'title screen must not create a save');
  first.startDuty();
  first.duties.act('route-passenger');
  const writes = storage.writes;
  for (let i = 0; i < 6; i++) first.update({ dt: 0.25, doorsOpen: true, doorFraction: 1 });
  assert.equal(storage.writes, writes, 'partial timers do not write on every update');
  const restored = setup(storage);
  restored.host.resume();
  restored.engine.start();
  restored.update();
  assert.equal(restored.jumps.at(-1), 525);
  assert.equal(restored.duties.getState().phase, 'boarding');
  assert.equal(restored.duties.getState().boardingProgress, 0);
  assert.equal(restored.gameStore.getState().drive.doorsOpen, false);
  assert.equal(restored.host.travel(1500), false);
});
test('reload at a green signal requires a fresh observed passing train; completed dispatch survives', () => {
  const storage = memoryStorage(),
    first = setup(storage);
  first.startDuty();
  first.board();
  first.duties.act('request-clearance');
  for (let i = 0; i < 48; i++) first.update({ dt: 0.25 });
  assert.equal(first.duties.getState().phase, 'ready');
  const restored = setup(storage);
  restored.host.resume();
  restored.engine.start();
  restored.update();
  assert.equal(restored.duties.getState().phase, 'dispatch');
  assert.equal(restored.duties.act('depart').ok, false);
  restored.duties.act('request-clearance');
  for (let i = 0; i < 48; i++) restored.update({ dt: 0.25 });
  assert.equal(restored.duties.act('depart').ok, true);
  const completed = setup(storage);
  completed.host.resume();
  completed.engine.start();
  completed.update();
  assert.equal(completed.duties.getState().completed, true);
  assert.equal(completed.host.travel(1500), true);
  completed.host.start();
  completed.engine.start();
  assert.equal(completed.duties.getState().phase, 'inactive', 'new story resets duty facts');
});
test('legacy stories beyond Momiji retain progress while malformed duty imports are atomic', () => {
  const storage = memoryStorage(),
    first = setup(storage);
  first.engine.start();
  first.engine.advance();
  first.engine.update({ z: 1500, speed: 0, started: true, paused: false });
  first.engine.advance();
  const old = first.engine.exportSave();
  delete old.stationDuty;
  storage.setItem('maple-line:story:v1', JSON.stringify(old));
  const migrated = setup(storage);
  assert.equal(migrated.engine.getState().progress.completed, 2);
  assert.equal(migrated.duties.getState().completed, true);
  const before = migrated.engine.exportSave();
  assert.equal(
    migrated.engine.importSave({
      ...before,
      stationDuty: { ...before.stationDuty, passingTime: Infinity },
    }).ok,
    false,
  );
  assert.deepEqual(migrated.engine.exportSave(), before);
});
test('storage failures keep railway safety working and report unsaved progress', () => {
  const fixture = setup({
    getItem() {
      return null;
    },
    setItem() {
      throw Error('quota');
    },
    removeItem() {},
  });
  fixture.startDuty();
  fixture.board();
  assert.match(fixture.engine.getState().saveError, /could not be saved/);
  assert.equal(fixture.host.travel(1500), false);
  fixture.session.dispose();
});
