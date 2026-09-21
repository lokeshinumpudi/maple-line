import { CAR_COUNT } from '../src/train/consist.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  updateJourney,
  CAR_SPACING,
  TRAIN_SPAN,
  TERMINAL_MARGIN,
  TERMINAL_DWELL,
} from '../src/simulation/journey.js';

const route = { trackLength: 1600, stationDistance: 1250 };

test('express cruise stops before a scheduled platform in snow, in both directions', () => {
  for (const direction of [1, -1]) {
    const state = initial({ distance: direction > 0 ? 10000 : 16000, speed: 120 / 3.6, direction });
    for (let i = 0; i < 6000; i++)
      updateJourney(state, 0.05, {
        trackLength: 25000,
        scheduledStopDistance: 13000,
        weather: 'snow',
        grade: -0.03 * direction,
      });
    const remaining = (13000 - state.distance) * direction;
    assert.ok(state.speed < 0.1);
    assert.ok(remaining >= 0 && remaining <= 10, `distance remaining ${remaining}`);
  }
});

test('director cruise target affects auto drive without replacing manual controls', () => {
  const auto = initial();
  for (let i = 0; i < 800; i++) updateJourney(auto, 0.05, { ...route, cruiseSpeedKmh: 28 });
  assert.ok(Math.abs(auto.speed * 3.6 - 28) < 1);
  const manual = initial({ autopilot: false, power: 0.6 });
  updateJourney(manual, 0.05, { ...route, cruiseSpeedKmh: 28 });
  assert.equal(manual.power, 0.6);
});
const initial = (extra = {}) => ({
  distance: 300,
  speed: 0,
  power: 0.5,
  brake: 0,
  elapsed: 0,
  penalty: 0,
  autopilot: true,
  ...extra,
});
const occupied = (state) =>
  Array.from({ length: CAR_COUNT }, (_, i) => i)
    .map((i) => state.distance - state.direction * i * CAR_SPACING)
    .sort((a, b) => a - b);

test('autopilot travels the finite route repeatedly with bounded speed and carriage positions', () => {
  const state = initial();
  let passedStation = false;
  for (let i = 0; i < 72000; i++) {
    updateJourney(state, 0.05, route);
    if (state.distance > route.stationDistance && state.direction === 1) passedStation = true;
    assert.ok(state.speed >= 0 && state.speed <= 160 / 3.6);
    assert.ok(
      state.distance >= TERMINAL_MARGIN && state.distance <= route.trackLength - TERMINAL_MARGIN,
    );
    for (const d of occupied(state)) assert.ok(d >= 0 && d <= route.trackLength);
  }
  assert.ok(passedStation, 'sightseeing must continue beyond the station');
  assert.ok(state.reversals >= 10, 'the train must repeatedly depart after changing ends');
  assert.ok(Math.abs(state.elapsed - 3600) < 1e-6);
});

test('autopilot holds approximately 120 km/h away from the terminal', () => {
  const state = initial();
  for (let i = 0; i < 1200; i++) updateJourney(state, 0.05, { ...route, trackLength: 25000 });
  assert.ok(Math.abs(state.speed * 3.6 - 120) < 0.1);
});

test('both reversals preserve the occupied five-carriage position set after a three-second dwell', () => {
  for (const direction of [1, -1]) {
    const state = initial({ direction, distance: direction > 0 ? 1550 : 50, speed: 0 });
    updateJourney(state, 0.05, route);
    assert.equal(state.journeyPhase, 'dwelling');
    const before = occupied(state);
    const frontBefore = state.distance;
    updateJourney(state, TERMINAL_DWELL - 0.05, route);
    assert.equal(state.direction, direction);
    assert.equal(state.speed, 0);
    const result = updateJourney(state, 0.05, route);
    assert.equal(result.reversed, true);
    assert.equal(state.direction, -direction);
    assert.equal(state.distance, frontBefore - direction * TRAIN_SPAN);
    assert.deepEqual(occupied(state), before);
  }
});

test('manual full power is protected at the terminus and resumes on the return trip', () => {
  const state = initial({ autopilot: false, power: 1 });
  for (let i = 0; i < 24000 && state.reversals !== 2; i++) {
    updateJourney(state, 0.05, route);
    assert.ok(state.distance >= 50 && state.distance <= 1550);
  }
  assert.equal(state.reversals, 2);
  assert.equal(state.power, 1);
  assert.equal(state.brake, 0);
});

test('manual stop away from a terminal remains stopped', () => {
  const state = initial({ autopilot: false, power: 0, brake: 1 });
  updateJourney(state, 10, route);
  assert.equal(state.distance, 300);
  assert.equal(state.speed, 0);
  assert.equal(state.journeyPhase, 'cruising');
});

test('invalid route lengths and time steps fail explicitly', () => {
  assert.throws(() => updateJourney(initial(), 0.1, { trackLength: 127 }), RangeError);
  assert.throws(() => updateJourney(initial(), -1, route), RangeError);
  assert.throws(() => updateJourney(initial(), Infinity, route), RangeError);
});

test('rain and snow round trips brake within route boundaries on grades for one simulated hour', () => {
  for (const weather of ['rain', 'snow']) {
    const state = initial();
    const gradedRoute = { ...route, weather, grade: 0.015 };
    for (let i = 0; i < 36000; i++) {
      updateJourney(state, 0.1, gradedRoute);
      assert.ok(state.distance >= 50 && state.distance <= 1550);
      assert.ok(state.speed >= 0 && state.speed <= 160 / 3.6);
      assert.ok(Number.isFinite(state.comfortPenalty));
    }
    assert.ok(state.reversals >= 10);
    assert.ok(Math.abs(state.elapsed - 3600) < 1e-6);
  }
});

test('manual snowy terminal protection begins early enough to reduce speed before arrival', () => {
  const state = initial({ autopilot: false, power: 1 });
  let lastSpeed = 0;
  for (let i = 0; i < 20000; i++) {
    lastSpeed = state.speed;
    updateJourney(state, 0.05, { ...route, weather: 'snow' });
    if (state.journeyPhase === 'dwelling') {
      assert.ok(
        lastSpeed < 0.6,
        'arrival must brake progressively instead of clamping a fast train',
      );
      return;
    }
  }
  assert.fail('Never reached the terminus');
});
