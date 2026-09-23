/**
 * Weather blends, storms and lightning timing. Pure logic: no Three.js, no clocks.
 * Time only advances through advance(dt), so paused or fixed-step renders stay in sync.
 *
 * A storm is heavy rain. Everything that already reads `weather === 'rain'` (braking,
 * audio, residents, wipers) keeps working; the storm adds darker skies, gusts and
 * lightning on top.
 */
export const WEATHER_CHOICES = Object.freeze(['clear', 'rain', 'snow', 'storm']);
export const BASE_WEATHER = Object.freeze(['clear', 'rain', 'snow']);
export const SPEED_OF_SOUND = 343;
const FIRST_STRIKE = [2.5, 6];
const STRIKE_INTERVAL = [5, 16];
const STRIKE_DISTANCE = [350, 3200];
// A strike is a quick triple flicker: leader, return stroke, restrike.
const PULSES = [
  [0, 0.75],
  [0.085, 1],
  [0.24, 0.6],
];
const PULSE_DECAY = 0.07;

/** 'storm' is stored as rain plus a storm flag. Other values pass through. */
export function normalizeWeather(value) {
  if (value === 'storm') return { weather: 'rain', storm: true };
  if (BASE_WEATHER.includes(value)) return { weather: value, storm: false };
  throw new TypeError(`Unknown weather: ${value}`);
}

/** The single choice a menu shows for stored weather. */
export function weatherChoice({ weather = 'clear', storm = false } = {}) {
  return weather === 'rain' && storm ? 'storm' : weather;
}

/** Seconds between a flash and its thunder for a strike this far away. */
export function thunderDelay(distanceMetres) {
  if (!Number.isFinite(distanceMetres) || distanceMetres < 0)
    throw new RangeError('Distance must be a finite, nonnegative number of metres.');
  return distanceMetres / SPEED_OF_SOUND;
}

/** Brightness of one strike's flash t seconds after it starts, 0..1. */
export function flashEnvelope(t) {
  if (!(t >= 0) || t > 1.6) return 0;
  let value = 0;
  for (const [start, amplitude] of PULSES)
    if (t >= start) value = Math.max(value, amplitude * Math.exp(-(t - start) / PULSE_DECAY));
  return value;
}

export function createWeatherState({ seed = 1742, weather = 'clear', storm = false } = {}) {
  let state = seed >>> 0 || 1;
  const random = () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
  const between = ([a, b]) => a + (b - a) * random();
  let target = normalizeWeather(weather === 'rain' && storm ? 'storm' : weather);
  const amounts = {
    rain: target.weather === 'rain' ? 1 : 0,
    snow: target.weather === 'snow' ? 1 : 0,
    storm: target.storm ? 1 : 0,
  };
  let elapsed = 0,
    nextStrike = Infinity,
    lastStrike = null,
    strikes = 0;
  const approach = (value, goal, dt, seconds) => goal + (value - goal) * Math.exp(-dt / seconds);
  function schedule(range) {
    nextStrike = elapsed + between(range);
  }
  if (target.storm) schedule(FIRST_STRIKE);

  return {
    set(nextWeather, nextStorm = false) {
      const previous = target.storm;
      target = normalizeWeather(nextWeather === 'rain' && nextStorm ? 'storm' : nextWeather);
      if (target.storm && !previous) schedule(FIRST_STRIKE);
      if (!target.storm) nextStrike = Infinity;
    },
    /** Advance by dt seconds. Returns the strikes that began during this step. */
    advance(dt) {
      const step = Number.isFinite(dt) ? Math.min(Math.max(dt, 0), 0.25) : 0;
      if (step === 0) return [];
      elapsed += step;
      amounts.rain = approach(amounts.rain, target.weather === 'rain' ? 1 : 0, step, 0.55);
      amounts.snow = approach(amounts.snow, target.weather === 'snow' ? 1 : 0, step, 0.55);
      // Storms build a little slower than the rain itself and clear faster.
      amounts.storm = approach(amounts.storm, target.storm ? 1 : 0, step, target.storm ? 2.2 : 1);
      for (const key of Object.keys(amounts))
        if (Math.abs(amounts[key] - Math.round(amounts[key])) < 1e-3)
          amounts[key] = Math.round(amounts[key]);
      const started = [];
      while (target.storm && elapsed >= nextStrike) {
        const distance = between(STRIKE_DISTANCE);
        const strike = {
          at: nextStrike,
          distance,
          bearing: random() * Math.PI * 2,
          delay: thunderDelay(distance),
          // Near strikes are brighter and louder; far ones rumble.
          strength: Math.min(1, 1.25 - distance / 3200) * Math.max(0.4, amounts.storm),
        };
        started.push(strike);
        lastStrike = strike;
        strikes++;
        schedule(STRIKE_INTERVAL);
      }
      return started;
    },
    getState() {
      const flash = lastStrike ? flashEnvelope(elapsed - lastStrike.at) * lastStrike.strength : 0;
      // Slow, bounded gusts: two incommensurate waves, strongest in storms.
      const wave = 0.5 + 0.5 * Math.sin(elapsed * 0.41) * Math.sin(elapsed * 0.137 + 1.1);
      return {
        weather: target.weather,
        storm: target.storm,
        choice: weatherChoice(target),
        rain: amounts.rain,
        snow: amounts.snow,
        stormAmount: amounts.storm,
        flash,
        flashBearing: lastStrike?.bearing ?? 0,
        gust: amounts.storm * wave + amounts.rain * 0.25 * wave,
        strikes,
        nextStrikeIn: Number.isFinite(nextStrike) ? Math.max(0, nextStrike - elapsed) : null,
        elapsed,
      };
    },
  };
}
