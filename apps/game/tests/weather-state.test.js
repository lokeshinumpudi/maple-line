import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SPEED_OF_SOUND,
  createWeatherState,
  flashEnvelope,
  normalizeWeather,
  thunderDelay,
  weatherChoice,
} from '../src/world/weather-state.js';

const run = (weather, seconds, dt = 1 / 60) => {
  const strikes = [];
  for (let t = 0; t < seconds; t += dt) strikes.push(...weather.advance(dt));
  return strikes;
};

test('storm is stored as rain plus a storm flag and shown as one choice', () => {
  assert.deepEqual(normalizeWeather('storm'), { weather: 'rain', storm: true });
  assert.deepEqual(normalizeWeather('rain'), { weather: 'rain', storm: false });
  assert.deepEqual(normalizeWeather('snow'), { weather: 'snow', storm: false });
  assert.throws(() => normalizeWeather('hail'), TypeError);
  for (const choice of ['clear', 'rain', 'snow', 'storm'])
    assert.equal(weatherChoice(normalizeWeather(choice)), choice);
  // A storm flag without rain is not a storm.
  assert.equal(weatherChoice({ weather: 'snow', storm: true }), 'snow');
});

test('clear skies and plain rain never produce lightning', () => {
  const clear = createWeatherState({ weather: 'clear' });
  assert.equal(run(clear, 120).length, 0);
  const rain = createWeatherState({ weather: 'rain' });
  assert.equal(run(rain, 120).length, 0);
  assert.equal(rain.getState().flash, 0);
  assert.equal(rain.getState().nextStrikeIn, null);
});

test('a storm strikes at bounded intervals with sound-speed thunder delays', () => {
  const storm = createWeatherState({ weather: 'rain', storm: true, seed: 7 });
  const strikes = run(storm, 180);
  assert.ok(strikes.length >= 180 / 16 - 1, `enough strikes (${strikes.length})`);
  assert.ok(strikes[0].at >= 2.5 && strikes[0].at <= 6);
  for (let i = 1; i < strikes.length; i++) {
    const gap = strikes[i].at - strikes[i - 1].at;
    assert.ok(gap >= 5 - 1e-9 && gap <= 16 + 1e-9, `gap ${gap}`);
  }
  for (const strike of strikes) {
    assert.ok(Math.abs(strike.delay - strike.distance / SPEED_OF_SOUND) < 1e-9);
    assert.ok(strike.strength > 0 && strike.strength <= 1);
  }
  assert.equal(storm.getState().choice, 'storm');
});

test('the same seed and step sequence repeat the same storm', () => {
  const a = run(createWeatherState({ weather: 'rain', storm: true, seed: 42 }), 60);
  const b = run(createWeatherState({ weather: 'rain', storm: true, seed: 42 }), 60);
  assert.deepEqual(a, b);
});

test('a flash flickers, stays within 0..1 and is dark again within two seconds', () => {
  assert.equal(flashEnvelope(-0.1), 0);
  let peak = 0;
  for (let t = 0; t < 1.6; t += 0.005) {
    const value = flashEnvelope(t);
    assert.ok(value >= 0 && value <= 1);
    peak = Math.max(peak, value);
  }
  assert.equal(peak, 1);
  assert.ok(flashEnvelope(0.6) < 0.02);
  assert.equal(flashEnvelope(2), 0);
  const storm = createWeatherState({ weather: 'rain', storm: true, seed: 3 });
  const strikes = run(storm, 30);
  assert.ok(strikes.length > 0);
  storm.set('rain', false);
  run(storm, 2);
  assert.ok(storm.getState().flash < 1e-6);
});

test('blends move toward the chosen weather and pausing holds them', () => {
  const weather = createWeatherState({ weather: 'clear' });
  weather.set('storm');
  assert.equal(weather.getState().rain, 0);
  weather.advance(0);
  assert.equal(weather.getState().rain, 0);
  run(weather, 8);
  const stormy = weather.getState();
  assert.equal(stormy.rain, 1);
  assert.ok(stormy.stormAmount > 0.95);
  assert.ok(stormy.gust >= 0 && stormy.gust <= 1.25);
  weather.set('snow');
  run(weather, 8);
  const snowy = weather.getState();
  assert.equal(snowy.rain, 0);
  assert.equal(snowy.snow, 1);
  assert.equal(snowy.stormAmount, 0);
  assert.equal(snowy.storm, false);
});

test('thunder delay rejects impossible distances', () => {
  assert.equal(thunderDelay(686), 2);
  assert.throws(() => thunderDelay(-1), RangeError);
  assert.throws(() => thunderDelay(Number.NaN), RangeError);
});
