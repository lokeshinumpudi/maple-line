// Rail-constrained train dynamics. Metres, seconds, and metres per second.
// This models longitudinal motion; wheels and suspension are not rigid bodies.
export const DRIVE_LIMITS = Object.freeze({
  maxSpeed: 160 / 3.6,
  traction: 1.65,
  serviceBrake: 1.4,
  emergencyBrake: 2.1,
});
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const WEATHER_ADHESION = { clear: 1, dry: 1, rain: 0.78, wet: 0.78, snow: 0.6 };

export function driveParameters({ grade = 0, weather = 'clear', adhesion } = {}) {
  if (!Number.isFinite(grade)) throw new RangeError('Track grade must be finite.');
  const grip = adhesion ?? WEATHER_ADHESION[weather] ?? 1;
  if (!Number.isFinite(grip) || grip <= 0 || grip > 1.3)
    throw new RangeError('Adhesion multiplier must be greater than zero and at most 1.3.');
  return { adhesion: grip, gradeForce: 9.81 * Math.sin(Math.atan(clamp(grade, -0.08, 0.08))) };
}

export function driveResistance(speed) {
  return speed > 0 ? 0.045 + 0.0003 * speed * speed : 0;
}

function actuator(current, target, dt, response) {
  const decay = Math.exp(-dt / response);
  return {
    next: target + (current - target) * decay,
    mean: target + ((current - target) * (1 - decay) * response) / dt,
  };
}

/**
 * grade is rise/run in the direction of travel: .01 means 1% uphill.
 * weather rain/wet and snow reduce traction and braking; adhesion overrides it.
 * state.emergency or options.emergency engages stronger braking and cuts power.
 * state.power/brake remain requested controls. actualPower/actualBrake describe
 * their response. acceleration and jerk are m/s² and m/s³; maxJerk is a peak.
 * comfortPenalty accumulates harsh acceleration/jerk exposure, not a percentage.
 * penalty preserves the existing overspeed seconds counter; overspeedSeconds is
 * its explicit counterpart. Defaults retain the 120 km/h service speed limit.
 */
export function advanceDrive(state, dt, options = {}) {
  if (!Number.isFinite(dt) || dt < 0)
    throw new RangeError('Drive dt must be finite and nonnegative.');
  const environment = driveParameters(options);
  const speedLimit = (options.speedLimitKmh ?? 120) / 3.6;
  state.actualPower ??= 0;
  state.actualBrake ??= 0;
  state.acceleration ??= 0;
  state.jerk ??= 0;
  state.maxJerk ??= 0;
  state.comfortPenalty ??= 0;
  state.overspeedSeconds ??= state.penalty ?? 0;
  state.penalty ??= 0;
  state.elapsed ??= 0;
  let remaining = dt;
  while (remaining > 1e-10) {
    const step = Math.min(0.01, remaining);
    remaining -= step;
    const emergency = Boolean(state.emergency || options.emergency);
    const doorsLocked = Boolean(state.doorsOpen || state.doorsClosing);
    if (doorsLocked) state.actualPower = 0;
    const targetBrake = emergency || doorsLocked ? 1 : clamp(state.brake, 0, 1);
    const targetPower = emergency || targetBrake > 0 ? 0 : clamp(state.power, 0, 1);
    const traction = actuator(
      state.actualPower,
      targetPower,
      step,
      emergency ? 0.035 : targetPower < state.actualPower ? 0.1 : 0.25,
    );
    const brake = actuator(state.actualBrake, targetBrake, step, emergency ? 0.04 : 0.1);
    state.actualPower = traction.next;
    state.actualBrake = brake.next;
    const brakeStrength = emergency ? DRIVE_LIMITS.emergencyBrake : DRIVE_LIMITS.serviceBrake;
    const force =
      (traction.mean * DRIVE_LIMITS.traction - brake.mean * brakeStrength) * environment.adhesion -
      driveResistance(state.speed) -
      environment.gradeForce;
    const oldSpeed = state.speed;
    state.speed = clamp(oldSpeed + force * step, 0, DRIVE_LIMITS.maxSpeed);
    state.distance += (oldSpeed + state.speed) * 0.5 * step;
    const acceleration = (state.speed - oldSpeed) / step;
    state.jerk = (acceleration - state.acceleration) / step;
    state.acceleration = acceleration;
    state.maxJerk = Math.max(state.maxJerk, Math.abs(state.jerk));
    state.comfortPenalty +=
      (Math.max(0, Math.abs(state.jerk) - 3) * 0.12 + Math.max(0, Math.abs(acceleration) - 1)) *
      step;
    state.elapsed += step;
    if ((oldSpeed + state.speed) * 0.5 > speedLimit) {
      state.penalty += step;
      state.overspeedSeconds += step;
    }
  }
}

export function stationOutcome(state, stopDistance) {
  const remaining = stopDistance - state.distance;
  if (Math.abs(remaining) <= 12 && state.speed < 0.15) return 'stopped';
  if (remaining < -25) return 'missed';
  return 'approaching';
}
