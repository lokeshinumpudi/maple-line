import test from 'node:test';
import assert from 'node:assert/strict';
import { createStoryHost } from '../src/narrative/story-host.js';
import { createStoryEngine } from '../src/narrative/story-engine.js';
import { createGameStore } from '../src/state/game-store.js';
const campaign = {
  id: 'test',
  title: 'Test',
  chapters: [{ id: 'one', title: 'One' }],
  beats: [
    { id: 'a', chapterId: 'one', z: 0, title: 'A', lines: ['a'], choices: [] },
    { id: 'b', chapterId: 'one', z: 200, title: 'B', lines: ['b'], choices: [] },
  ],
};
function setup(source = campaign, options = {}) {
  const gameStore = createGameStore(),
    engine = createStoryEngine({ campaign: source, storage: null }),
    jumps = [];
  const host = createStoryHost({
    engine,
    gameStore,
    jumpTo: (z) => {
      jumps.push(z);
      gameStore.updateDrive((d) => {
        d.started = true;
        d.distance = z;
      });
    },
    zToDistance: (z) => z + 800,
    ...options,
  });
  return { gameStore, engine, host, jumps };
}
test('story conversations stop driving and continuation resumes auto drive toward next scene', () => {
  const { gameStore, engine, host } = setup();
  host.start();
  engine.start();
  assert.equal(gameStore.getState().drive.paused, true);
  assert.equal(gameStore.getState().drive.speed, 0);
  engine.advance();
  assert.equal(gameStore.getState().drive.paused, false);
  assert.equal(gameStore.getState().drive.autopilot, true);
  assert.equal(host.scheduledStopDistance(), 1000);
  host.dispose();
});
test('explicit travel only reaches the next unfinished scene and completion holds the train', () => {
  const { gameStore, engine, host, jumps } = setup();
  host.start();
  engine.start();
  assert.equal(host.travel(200), false);
  engine.advance();
  assert.equal(host.travel(999), false);
  assert.equal(host.travel(200), true);
  assert.deepEqual(jumps, [0, 200]);
  assert.equal(engine.getState().activeBeat.id, 'b');
  engine.advance();
  assert.equal(engine.getState().status, 'complete');
  assert.equal(gameStore.getState().drive.paused, true);
  engine.suspend();
  host.exit();
  assert.equal(gameStore.getState().drive.paused, false);
  host.dispose();
});
test('outside controls cannot roll the train during dialogue and resume restores saved scene position', () => {
  const { gameStore, engine, host, jumps } = setup();
  host.start();
  engine.start();
  gameStore.updateDrive((d) => {
    d.paused = false;
    d.speed = 10;
  });
  host.update({ z: 0, speed: 10, started: true, paused: false });
  assert.equal(gameStore.getState().drive.paused, true);
  assert.equal(gameStore.getState().drive.speed, 0);
  engine.advance();
  host.travel(200);
  engine.suspend();
  host.resume();
  engine.start();
  assert.equal(jumps.at(-1), 200);
  assert.equal(engine.getState().activeBeat.id, 'b');
  host.dispose();
});

test('rolling scenes never halt the train and keep the next platform braking target while read', () => {
  const source = structuredClone(campaign);
  source.beats.splice(1, 0, {
    id: 'tunnel',
    chapterId: 'one',
    z: 100,
    title: 'Tunnel',
    lines: ['Listen.'],
    choices: [],
    delivery: 'rolling',
  });
  const { gameStore, engine, host, jumps } = setup(source);
  host.start();
  engine.start();
  engine.advance();
  assert.equal(host.scheduledStopDistance(), 1000);
  gameStore.updateDrive((d) => {
    d.speed = 12;
  });
  host.update({ z: 100, speed: 12, paused: false, started: true });
  assert.equal(engine.getState().activeBeat.id, 'tunnel');
  assert.equal(gameStore.getState().drive.paused, false);
  assert.equal(gameStore.getState().drive.speed, 12);
  assert.equal(host.scheduledStopDistance(), 1000);
  host.update({ z: 150, speed: 12, paused: false, started: true });
  engine.suspend();
  host.resume();
  engine.start();
  assert.equal(jumps.at(-1), 150, 'resuming a moving conversation does not rewind the route');
  assert.equal(gameStore.getState().drive.paused, false);
  gameStore.updateDrive((d) => {
    d.paused = true;
  });
  engine.advance();
  assert.equal(gameStore.getState().drive.paused, true, 'Continue must respect a manual pause');
  host.update({ z: 200, speed: 0, paused: true, started: true });
  assert.equal(engine.getState().activeBeat, null);
  gameStore.updateDrive((d) => {
    d.paused = false;
  });
  host.update({ z: 200, speed: 0, paused: false, started: true });
  assert.equal(engine.getState().activeBeat.id, 'b');
  assert.equal(gameStore.getState().drive.paused, true);
  host.dispose();
});

test('starting and resuming a story preserve the player’s manual driving preference', () => {
  const { gameStore, engine, host } = setup();
  gameStore.setPreferences({ manualControls: true });
  host.start();
  engine.start();
  engine.advance();
  assert.equal(gameStore.getState().preferences.manualControls, true);
  assert.equal(gameStore.getState().drive.autopilot, false);
  engine.suspend();
  host.resume();
  assert.equal(gameStore.getState().preferences.manualControls, true);
  assert.equal(gameStore.getState().drive.autopilot, false);
  host.dispose();
});

test('travelling resume can return to a safe route checkpoint without advancing dialogue', () => {
  const { host, engine, jumps } = setup(campaign, { resumePosition: () => 50 });
  host.start();
  engine.start();
  engine.advance();
  host.update({ z: 100, speed: 5, paused: false, started: true });
  engine.suspend();
  host.resume();
  assert.equal(jumps.at(-1), 50);
  assert.equal(engine.getState().nextBeat.id, 'b');
  host.dispose();
});
