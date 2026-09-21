import test from 'node:test';
import assert from 'node:assert/strict';
import { advanceDrive, stationOutcome } from '../src/simulation/physics.js';

const initial = (extra = {}) => ({
  distance: 0,
  speed: 0,
  power: 1,
  brake: 0,
  elapsed: 0,
  penalty: 0,
  ...extra,
});

test('express power reaches 60 within 12 seconds, 120 within 25, and caps at 160 km/h', () => {
  const state = run(initial(), 12);
  assert.ok(state.speed * 3.6 >= 60);
  run(state, 13);
  assert.ok(state.speed * 3.6 >= 120);
  run(state, 95);
  assert.equal(state.speed * 3.6, 160);
});
function run(state, seconds, options = {}, dt = 1 / 60) {
  for (let elapsed = 0; elapsed < seconds - 1e-9; elapsed += dt)
    advanceDrive(state, Math.min(dt, seconds - elapsed), options);
  return state;
}
function brakingStop(options = {}, emergency = false) {
  const state = initial({ speed: 60 / 3.6, power: 0, brake: 1, emergency });
  for (let i = 0; i < 10000 && state.speed > 0; i++) advanceDrive(state, 0.01, options);
  assert.equal(state.speed, 0);
  return state;
}

test('train accelerates, coasts after traction releases, and brakes without reversing', () => {
  const state = run(initial(), 10);
  assert.ok(state.speed > 7);
  state.power = 0;
  const before = state.speed;
  run(state, 2);
  assert.ok(state.speed < before);
  assert.ok(state.actualPower < 0.001);
  state.brake = 1;
  run(state, 20);
  assert.equal(state.speed, 0);
  const stopped = state.distance;
  run(state, 1);
  assert.equal(state.distance, stopped);
});

test('traction builds progressively and service brake exceeds 90% within 0.25 seconds', () => {
  const state = initial();
  advanceDrive(state, 0.05);
  assert.ok(state.actualPower > 0 && state.actualPower < 0.2);
  assert.ok(state.speed < 0.02);
  state.power = 0;
  state.brake = 1;
  advanceDrive(state, 0.25);
  assert.ok(state.actualBrake > 0.9);
  assert.ok(state.actualPower < 0.02);
});

test('frame step changes produce nearly identical travel over one minute', () => {
  const reference = run(initial(), 60, {}, 1 / 120);
  for (const dt of [1 / 60, 0.05, 0.1, 0.5]) {
    const candidate = run(initial(), 60, {}, dt);
    assert.ok(Math.abs(reference.distance - candidate.distance) < 0.02);
    assert.ok(Math.abs(reference.speed - candidate.speed) < 0.001);
    assert.ok(candidate.speed <= 160 / 3.6);
    assert.ok(Math.abs(candidate.elapsed - 60) < 1e-7);
  }
});

test('uphill slows the train, downhill accelerates it, and a stopped train never rolls backward', () => {
  const level = run(initial({ speed: 12, power: 0 }), 10);
  const uphill = run(initial({ speed: 12, power: 0 }), 10, { grade: 0.02 });
  const downhill = run(initial({ speed: 12, power: 0 }), 10, { grade: -0.02 });
  assert.ok(uphill.speed < level.speed && level.speed < downhill.speed);
  assert.ok(downhill.speed > 12);
  const stopped = run(initial({ power: 0 }), 10, { grade: 0.03 });
  assert.equal(stopped.speed, 0);
  assert.equal(stopped.distance, 0);
});

test('wet and snowy adhesion lengthen stopping distance; emergency braking stops sooner', () => {
  const dry = brakingStop();
  const wet = brakingStop({ weather: 'rain' });
  const snow = brakingStop({ weather: 'snow' });
  const emergency = brakingStop({}, true);
  assert.ok(dry.distance > 90 && dry.distance < 100);
  assert.ok(wet.distance > dry.distance * 1.2);
  assert.ok(snow.distance > wet.distance * 1.2);
  assert.ok(emergency.distance < dry.distance * 0.75);
  assert.ok(emergency.elapsed < dry.elapsed);
});

test('emergency braking overrides requested power and supplies comfort telemetry', () => {
  const state = initial({ speed: 15, actualPower: 1, emergency: true });
  advanceDrive(state, 0.2);
  assert.ok(state.speed < 15);
  assert.ok(state.actualBrake > 0.99);
  assert.ok(state.actualPower < 0.01);
  assert.ok(Number.isFinite(state.acceleration) && Number.isFinite(state.jerk));
  assert.ok(state.maxJerk > 0 && state.comfortPenalty > 0);
});

test('overspeed seconds preserve the existing penalty counter', () => {
  const state = initial({ speed: 40, power: 0 });
  run(state, 2);
  assert.ok(Math.abs(state.penalty - 2) < 1e-9);
  assert.equal(state.penalty, state.overspeedSeconds);
  assert.ok(state.comfortPenalty >= 0);
});

test('station requires both low speed and proximity; overshoot fails', () => {
  const state = initial({ distance: 992, speed: 5 });
  assert.equal(stationOutcome(state, 1000), 'approaching');
  state.speed = 0;
  assert.equal(stationOutcome(state, 1000), 'stopped');
  state.distance = 980;
  assert.equal(stationOutcome(state, 1000), 'approaching');
  state.distance = 1026;
  assert.equal(stationOutcome(state, 1000), 'missed');
});

test('a complete 1km service can reach and stop at its destination', () => {
  const state = initial();
  for (let i = 0; i < 24000; i++) {
    const remaining = 1000 - state.distance;
    const brakingDistance = (state.speed * state.speed) / (2 * 1.12);
    state.power = remaining > brakingDistance + 6 && state.speed < 16 ? 1 : 0;
    state.brake = remaining <= brakingDistance + 6 ? 1 : 0;
    advanceDrive(state, 1 / 60);
    if (stationOutcome(state, 1000) === 'stopped') return;
    if (stationOutcome(state, 1000) === 'missed') assert.fail('Overshot station');
  }
  assert.fail('Service never completed');
});

test('invalid time and environment inputs fail explicitly', () => {
  assert.throws(() => advanceDrive(initial(), -1), RangeError);
  assert.throws(() => advanceDrive(initial(), 0.1, { grade: NaN }), RangeError);
  assert.throws(() => advanceDrive(initial(), 0.1, { adhesion: 0 }), RangeError);
});
