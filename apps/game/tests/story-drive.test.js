import test from 'node:test';
import assert from 'node:assert/strict';
import { updateJourney } from '../src/simulation/journey.js';
import { initialDrive } from '../src/state/game-store.js';
for (const weather of ['clear', 'rain', 'snow'])
  for (const grade of [-0.035, 0, 0.04]) {
    test(`scheduled narrative stop settles within arrival radius: ${weather}, grade ${grade}`, () => {
      const state = { ...initialDrive(100), started: true, autopilot: true, speed: 8 };
      let arrived = false;
      for (let i = 0; i < 20000; i++) {
        updateJourney(state, 1 / 60, {
          trackLength: 2000,
          stationDistance: 1000,
          scheduledStopDistance: 500,
          weather,
          grade,
        });
        if (Math.abs(state.distance - 500) <= 18 && state.speed <= 1) {
          arrived = true;
          break;
        }
        assert.ok(state.distance < 519, 'must not overshoot the story stop');
      }
      assert.equal(arrived, true);
      assert.ok(state.speed <= 1);
      assert.ok(state.distance >= 482);
    });
  }
test('manual driving remains under player control near a narrative stop', () => {
  const state = { ...initialDrive(400), started: true, autopilot: false, power: 0.5 };
  updateJourney(state, 0.1, {
    trackLength: 2000,
    stationDistance: 1000,
    scheduledStopDistance: 410,
  });
  assert.equal(state.power, 0.5);
});
