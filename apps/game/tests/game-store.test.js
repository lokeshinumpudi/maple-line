import test from 'node:test';
import assert from 'node:assert/strict';
import { createGameStore } from '../src/state/game-store.js';
test('simulation changes are immutable and notify only selected subscribers', () => {
  const s = createGameStore(100),
    old = s.getState();
  let driveUpdates = 0,
    uiUpdates = 0;
  s.subscribe(
    (x) => x.drive,
    () => driveUpdates++,
  );
  s.subscribe(
    (x) => x.preferences,
    () => uiUpdates++,
  );
  s.updateDrive((d) => {
    d.speed = 10;
    d.power = 0.5;
  });
  assert.equal(old.drive.speed, 0);
  assert.equal(s.getState().drive.speed, 10);
  assert.equal(driveUpdates, 1);
  assert.equal(uiUpdates, 0);
  s.setPreferences({ weather: 'rain' });
  assert.equal(uiUpdates, 1);
});
test('door interlock cuts traction and reset clears physics state', () => {
  const s = createGameStore(123);
  s.updateDrive((d) => {
    d.actualPower = 1;
    d.power = 1;
    d.doorsOpen = true;
    d.emergency = true;
    d.maxJerk = 20;
  });
  assert.equal(s.getState().drive.power, 0);
  assert.equal(s.getState().drive.brake, 1);
  s.resetDrive();
  assert.equal(s.getState().drive.distance, 123);
  assert.equal(s.getState().drive.doorsOpen, false);
  assert.equal(s.getState().drive.emergency, false);
  assert.equal(s.getState().drive.maxJerk, 0);
});
test('invalid settings fail without replacing state and snapshots are detached', () => {
  const s = createGameStore(),
    old = s.getState();
  assert.throws(() => s.setPreferences({ view: 'unknown' }));
  assert.equal(s.getState(), old);
  const snapshot = s.snapshot();
  snapshot.drive.speed = 99;
  assert.equal(s.getState().drive.speed, 0);
});

test('a menu hold never changes manual pause, movement, or story viewing state', () => {
  const store = createGameStore(123);
  store.updateDrive((drive) => {
    drive.started = true;
    drive.speed = 12;
    drive.paused = true;
  });
  const drive = store.getState().drive;
  store.updatePresentation({ sceneViewBeatId: 'the-recorder', menuOpen: true });
  store.updatePresentation({ menuOpen: false });
  assert.equal(store.getState().drive, drive);
  assert.equal(store.getState().presentation.sceneViewBeatId, 'the-recorder');
  const snapshot = store.snapshot();
  snapshot.presentation.sceneViewBeatId = null;
  assert.equal(store.getState().presentation.sceneViewBeatId, 'the-recorder');
  assert.throws(() => store.updatePresentation({ menuOpen: 'yes' }));
  assert.throws(() => store.updatePresentation({ sceneViewBeatId: {} }));
});

test('a storm is stored as rain with a storm flag, and other weather clears it', () => {
  const store = createGameStore();
  store.setPreferences({ weather: 'storm' });
  assert.equal(store.getState().preferences.weather, 'rain');
  assert.equal(store.getState().preferences.storm, true);
  store.setPreferences({ dusk: true });
  assert.equal(store.getState().preferences.storm, true, 'unrelated changes keep the storm');
  store.setPreferences({ weather: 'rain' });
  assert.equal(store.getState().preferences.storm, false);
  store.setPreferences({ weather: 'rain', storm: true });
  assert.equal(store.getState().preferences.storm, true, 'a restored flag is kept');
  store.setPreferences({ weather: 'snow' });
  assert.equal(store.getState().preferences.storm, false);
  store.setPreferences({ graphics: 'low' });
  assert.equal(store.getState().preferences.graphics, 'low');
  assert.throws(() => store.setPreferences({ graphics: 'ultra' }), TypeError);
});
