import test from 'node:test';
import assert from 'node:assert/strict';
import {
  driveNotch,
  notchDemand,
  notchLabel,
  drivingFeedback,
} from '../src/ui/driving-feedback.js';
import { initialDrive, createGameStore } from '../src/state/game-store.js';
import { advanceDrive } from '../src/simulation/physics.js';

test('eleven detents provide mutually exclusive power/coast/braking and bounded demand', () => {
  for (let notch = -5; notch <= 5; notch++) {
    const demand = notchDemand(notch);
    assert.equal(demand.power * demand.brake, 0);
    assert.equal(driveNotch(demand), notch);
  }
  assert.deepEqual(notchDemand(99), { power: 1, brake: 0 });
  assert.deepEqual(notchDemand(-99), { power: 0, brake: 1 });
  assert.throws(() => notchDemand(NaN));
  assert.equal(notchLabel(0), 'Coast');
});
test('power changes acceleration rather than jumping speed; coasting retains momentum', () => {
  const state = { ...initialDrive(), ...notchDemand(3), started: true };
  advanceDrive(state, 2);
  assert.ok(state.speed > 0 && state.speed < 2);
  assert.ok(state.actualPower > 0);
  const speed = state.speed;
  Object.assign(state, notchDemand(0));
  advanceDrive(state, 0.5);
  assert.ok(state.speed > speed * 0.8);
  Object.assign(state, notchDemand(-5));
  advanceDrive(state, 3);
  assert.equal(state.speed, 0);
});
test('braking estimates reflect speed, snow and downhill grade; interlocks take precedence', () => {
  const state = { ...initialDrive(), speed: 12 };
  const dry = drivingFeedback(state).stoppingMetres;
  assert.ok(drivingFeedback(state, { weather: 'snow' }).stoppingMetres > dry);
  assert.ok(drivingFeedback(state, { grade: -0.03 }).stoppingMetres > dry);
  assert.match(drivingFeedback({ ...state, doorsOpen: true }).motion, /locked/);
  assert.match(drivingFeedback({ ...state, emergency: true }).motion, /Emergency/);
  assert.match(drivingFeedback({ ...state, paused: true }).motion, /Paused/);
});
test('game volume accepts only bounded finite levels', () => {
  const store = createGameStore();
  store.setPreferences({ soundVolume: 0.35 });
  assert.equal(store.getState().preferences.soundVolume, 0.35);
  for (const value of [-1, 2, NaN, Infinity, '0.5'])
    assert.throws(() => store.setPreferences({ soundVolume: value }));
});
