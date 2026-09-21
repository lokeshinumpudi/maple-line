import { CAR_COUNT, CAR_SPACING } from '../train/consist.js';
const clamp = (value, max = 1) => Math.max(0, Math.min(max, value));

// Distances are in metres, speed in m/s. No scene objects enter the audio engine.
export function soundMix({
  speed = 0,
  power = 0,
  brake = 0,
  weather = 'clear',
  dusk = false,
  inTunnel = false,
  onBridge = false,
  doorsOpen = false,
  view = 'scenic',
  trainDistance = 0,
  riverDistance = Infinity,
  peopleDistance = Infinity,
  walkingDistance = Infinity,
  forest = 1,
  wind = 2,
  enabled = false,
  active = false,
  volume = 0.8,
  season = 'autumn',
  narrationPlaying = false,
} = {}) {
  const motion = clamp(Math.abs(speed) / (160 / 3.6));
  const cab = view === 'cab' || view === 'passenger' || inTunnel;
  const exterior = inTunnel ? 0 : cab ? (doorsOpen ? 0.75 : 0.28) : 1;
  const train = cab ? 1 : 1 / (1 + (Math.max(0, trainDistance) / 55) ** 1.5);
  const people = Math.exp(-Math.max(0, peopleDistance) / 45) * exterior;
  const winter = season === 'winter' || weather === 'snow';
  return {
    master: enabled && active ? clamp(volume) * 0.75 * (narrationPlaying ? 0.28 : 1) : 0,
    motor: train * (0.003 + motion * 0.007 + clamp(power) * 0.032),
    traction: train * clamp(power) * (0.035 - motion * 0.018),
    rumble: train * Math.sqrt(motion) * (onBridge ? 0.2 : 0.13),
    rolling: train * Math.sqrt(motion) * (weather === 'snow' ? 0.075 : 0.15),
    airRush: train * motion ** 2 * (cab ? 0.035 : 0.09),
    brake: train * clamp(brake) * Math.min(1, Math.abs(speed) / 2) * 0.038,
    wind: exterior * (0.012 + clamp(wind / 15) * 0.035 + motion * 0.012),
    forest: exterior * clamp(forest) * (winter ? 0.007 : 0.018) * (0.25 + clamp(wind / 10) * 1.5),
    river: exterior * Math.exp(-Math.max(0, riverDistance) / 60) * 0.26,
    rain: exterior * (weather === 'rain' ? 0.23 : 0),
    roofRain: cab && weather === 'rain' && !inTunnel ? 0.065 : 0,
    snow: exterior * (weather === 'snow' ? 0.075 : 0),
    tunnel: inTunnel ? 0.09 * motion : 0,
    people: people * (weather === 'clear' ? 0.105 : 0.055),
    footsteps: exterior * Math.exp(-Math.max(0, walkingDistance) / 25) * 0.085,
    birds:
      exterior * clamp(forest) * (winter ? 0.025 : weather === 'clear' ? (dusk ? 0.3 : 1) : 0.06),
    insects:
      exterior *
      clamp(forest) *
      (season === 'summer' && weather === 'clear' ? (dusk ? 0.018 : 0.011) : 0),
    train,
    reverb: inTunnel ? 0.38 : 0,
    environmentCutoff: cab && !doorsOpen ? 1600 : winter ? 5400 : 12000,
    cutoff: inTunnel ? 4200 : cab ? 6400 : weather === 'snow' ? 6500 : 14000,
  };
}

// Continuous fictional electric-drive tones. Coasting removes torque through the mix above.
export function electricTrainTones(speed = 0, power = 0) {
  const metresPerSecond = clamp(Math.abs(speed), 160 / 3.6);
  return {
    motorHz: 48 + metresPerSecond * 5.2,
    inverterHz: 170 + metresPerSecond * 24 + Math.sqrt(clamp(power)) * 90,
    rollingHz: 250 + metresPerSecond * 65,
    airHz: 450 + metresPerSecond * 48,
  };
}

export function sourcePan(listener, right, source) {
  const x = source.x - listener.x,
    z = source.z - listener.z;
  const distance = Math.hypot(x, z);
  return distance > 0.01
    ? Math.max(-0.9, Math.min(0.9, (x * right.x + z * right.z) / distance))
    : 0;
}

// Trigger axle pairs from travelled distance, so braking and reversal change the rhythm.
// Teleports and invalid positions must never produce a burst of old rail joints.
export function railJointCrossings(from, to, direction = 1) {
  if (!Number.isFinite(from) || !Number.isFinite(to) || Math.abs(to - from) > 6 || from === to)
    return [];
  const events = [];
  for (let car = 0; car < CAR_COUNT; car++) {
    for (const axle of [0, 2.2, 9.2, 11.4]) {
      const offset = direction * (car * CAR_SPACING + axle);
      if (Math.floor((from - offset) / 12) !== Math.floor((to - offset) / 12)) {
        const joint =
          (to > from ? Math.floor((to - offset) / 12) : Math.floor((from - offset) / 12)) * 12 +
          offset;
        events.push({
          car,
          strength: 0.6 ** car,
          fraction: clamp((joint - from) / (to - from)),
        });
      }
    }
  }
  return events.sort((a, b) => a.fraction - b.fraction);
}
