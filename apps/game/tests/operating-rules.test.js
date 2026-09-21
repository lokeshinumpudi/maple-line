import test from 'node:test';
import assert from 'node:assert/strict';
import { operatingEnvelope } from '../src/simulation/operating-rules.js';
import { updateJourney } from '../src/simulation/journey.js';
import { initialDrive } from '../src/state/game-store.js';

for (const weather of ['clear', 'rain', 'snow']) {
  for (const direction of [1, -1]) {
    test(`120 km/h approach brakes before bridge in ${weather}, direction ${direction}`, () => {
      const s = initialDrive(direction > 0 ? 4200 : 8300);
      Object.assign(s, { speed: 120 / 3.6, autopilot: true, direction });
      const grade = -0.03 * direction;
      for (let frame = 0; frame < 12000; frame++) {
        const envelope = operatingEnvelope(s.distance, { direction, weather, grade });
        updateJourney(s, 0.05, {
          trackLength: 25000,
          weather,
          grade,
          cruiseSpeedKmh: envelope.autopilotKmh,
          speedLimitKmh: envelope.limitKmh,
        });
        if (direction > 0 ? s.distance >= 6173.8 : s.distance <= 6326.2) {
          assert.ok(s.speed * 3.6 <= 25.5, `entry speed ${s.speed * 3.6}`);
          return;
        }
      }
      assert.fail('Train did not reach the bridge');
    });
  }
}

test('open line permits 120 km/h and distant snowy restrictions are anticipated', () => {
  assert.equal(operatingEnvelope(18000).autopilotKmh, 120);
  assert.ok(operatingEnvelope(4200, { weather: 'snow', grade: -0.04 }).autopilotKmh < 120);
});

test('restricted bridge and tunnel speeds apply in both directions, with earlier wet downhill braking', () => {
  assert.equal(operatingEnvelope(6250).limitKmh, 25);
  assert.equal(operatingEnvelope(11500).limitKmh, 35);
  assert.equal(operatingEnvelope(6250, { direction: -1 }).limitKmh, 25);
  assert.ok(
    operatingEnvelope(6020, { weather: 'rain', grade: -0.03 }).autopilotKmh <
      operatingEnvelope(6020).autopilotKmh,
  );
  assert.ok(
    operatingEnvelope(6480, { direction: -1, weather: 'snow', grade: 0.03 }).autopilotKmh < 45,
  );
});
for (const direction of [1, -1]) {
  test(`automatic service enters bridge at restricted speed in rain, direction ${direction}`, () => {
    const s = initialDrive(direction > 0 ? 5850 : 6650);
    Object.assign(s, { speed: 45 / 3.6, autopilot: true, direction });
    for (let frame = 0; frame < 5000; frame++) {
      const envelope = operatingEnvelope(s.distance, { direction, weather: 'rain' });
      updateJourney(s, 0.05, {
        trackLength: 25000,
        weather: 'rain',
        cruiseSpeedKmh: envelope.autopilotKmh,
        speedLimitKmh: envelope.limitKmh,
      });
      if (direction > 0 ? s.distance >= 6173.8 : s.distance <= 6326.2) {
        assert.ok(s.speed * 3.6 <= 25.5, `entry speed ${s.speed * 3.6}`);
        return;
      }
    }
    assert.fail('The train did not reach the bridge.');
  });
}
test('manual overspeed above a local limit is counted without an artificial speed clamp', () => {
  const s = initialDrive(6200);
  Object.assign(s, { speed: 10, autopilot: false, power: 0.4 });
  updateJourney(s, 1, { trackLength: 25000, speedLimitKmh: 25 });
  assert.ok(s.speed > 25 / 3.6);
  assert.ok(s.overspeedSeconds > 0.9);
});
