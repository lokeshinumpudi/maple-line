import { TRAIN_SPAN } from '../train/consist.js';
import { advanceDrive, driveParameters, driveResistance, DRIVE_LIMITS } from './physics.js';

export { CAR_SPACING, TRAIN_SPAN } from '../train/consist.js';
export const TERMINAL_MARGIN = 50;
export const TERMINAL_DWELL = 3;
const CRUISE_SPEED = 120 / 3.6;
const clamp = (n, low, high) => Math.max(low, Math.min(high, n));

function controlSpeed(state, targetSpeed, environment, feedForward = 0) {
  const resistance = driveResistance(state.speed) + environment.gradeForce;
  const acceleration = (targetSpeed - state.speed) * 2 + feedForward;
  const effort = acceleration + resistance;
  state.power = clamp(effort / (DRIVE_LIMITS.traction * environment.adhesion), 0, 1);
  state.brake = clamp(-effort / (DRIVE_LIMITS.serviceBrake * environment.adhesion), 0, 1);
}

function status(state, stationDistance) {
  if (state.journeyPhase === 'dwelling') return 'End of the line. Changing ends…';
  if (state.journeyPhase === 'approaching-terminal')
    return 'End of the line ahead. Slowing for the return journey.';
  const remaining = (stationDistance - state.distance) * state.direction;
  if (Number.isFinite(remaining) && remaining > 0 && remaining < 220) {
    return 'Village station ahead. Stop for the view, or keep exploring.';
  }
  return state.direction > 0
    ? 'Explore the valley toward the city.'
    : 'Return through the valley toward the mountains.';
}

/**
 * Advance the finite route's sightseeing service, including train physics.
 * Caller must not also call advanceDrive for this frame.
 *
 * distance locates the leading carriage centre. Render carriage i at
 * distance - direction * i * CAR_SPACING, facing direction along the route.
 * On reversal the array order changes; the occupied carriage positions do not.
 *
 * Mutates drive state plus direction, journeyPhase, dwellRemaining, reversals,
 * journeyStatus, and temporary journeyResumePower/journeyResumeBrake fields.
 * Autopilot drives at 120 km/h; manual controls work until terminal protection
 * takes over. Stations never end sightseeing mode. Terminal changes take 3 s.
 * grade is rise/run along increasing route distance; reverse travel flips it.
 * weather and adhesion use the same options as advanceDrive.
 */
export function updateJourney(
  state,
  dt,
  {
    trackLength,
    stationDistance,
    grade = 0,
    weather = 'clear',
    adhesion,
    cruiseSpeedKmh = 120,
    scheduledStopDistance,
    speedLimitKmh = 120,
  } = {},
) {
  if (!Number.isFinite(trackLength) || trackLength <= TERMINAL_MARGIN * 2 + TRAIN_SPAN) {
    throw new RangeError('The round-trip route must exceed 154 metres.');
  }
  if (!Number.isFinite(dt) || dt < 0)
    throw new RangeError('Journey dt must be finite and nonnegative.');
  state.direction = state.direction === -1 ? -1 : 1;
  state.journeyPhase ??= 'cruising';
  state.dwellRemaining ??= 0;
  state.reversals ??= 0;
  state.elapsed ??= 0;
  state.penalty ??= 0;
  let reversed = false;
  let remainingTime = dt;
  while (remainingTime > 1e-9) {
    const step = Math.min(0.05, remainingTime);
    const physics = { grade: grade * state.direction, weather, adhesion, speedLimitKmh };
    const environment = driveParameters(physics);
    const terminalDeceleration = Math.max(
      0.08,
      Math.min(
        0.65,
        DRIVE_LIMITS.serviceBrake * environment.adhesion * 0.65 + environment.gradeForce,
      ),
    );
    remainingTime -= step;
    if (state.journeyPhase === 'dwelling') {
      state.speed = 0;
      state.power = 0;
      state.brake = 1;
      state.actualPower = 0;
      state.actualBrake = 1;
      state.acceleration = 0;
      state.jerk = 0;
      state.elapsed += step;
      state.dwellRemaining = Math.max(0, state.dwellRemaining - step);
      if (state.dwellRemaining <= 1e-8) {
        state.distance -= state.direction * TRAIN_SPAN;
        state.direction *= -1;
        state.reversals++;
        state.journeyPhase = 'cruising';
        state.power = state.journeyResumePower ?? 0;
        state.brake = state.journeyResumeBrake ?? 0;
        delete state.journeyResumePower;
        delete state.journeyResumeBrake;
        reversed = true;
      }
      continue;
    }
    const terminal = state.direction > 0 ? trackLength - TERMINAL_MARGIN : TERMINAL_MARGIN;
    const distanceToEnd = Math.max(0, (terminal - state.distance) * state.direction);
    const safetyDistance = state.speed ** 2 / (2 * terminalDeceleration) + state.speed * 0.35 + 10;
    if (state.journeyPhase === 'cruising' && distanceToEnd <= safetyDistance) {
      state.journeyResumePower = state.power;
      state.journeyResumeBrake = state.brake;
      state.journeyPhase = 'approaching-terminal';
    }
    if (state.journeyPhase === 'approaching-terminal') {
      // A conservative deceleration envelope leaves room for the speed loop.
      const target = Math.min(CRUISE_SPEED, Math.sqrt(2 * terminalDeceleration * distanceToEnd));
      controlSpeed(
        state,
        Math.max(0.25, target),
        environment,
        target < CRUISE_SPEED ? -terminalDeceleration : 0,
      );
      // Finish the final few centimetres at walking pace if braking stopped early.
      if (state.speed < 0.1 && distanceToEnd > 0.05) {
        state.power = 0.25;
        state.brake = 0;
      }
    } else if (state.autopilot) {
      const cruise = Number.isFinite(cruiseSpeedKmh)
        ? Math.max(0, Math.min(120, cruiseSpeedKmh)) / 3.6
        : CRUISE_SPEED;
      const distanceToStop = Number.isFinite(scheduledStopDistance)
        ? (scheduledStopDistance - state.distance) * state.direction
        : Infinity;
      const stoppingTarget = Math.sqrt(2 * terminalDeceleration * Math.max(0, distanceToStop - 8));
      const target = Math.min(cruise, stoppingTarget);
      controlSpeed(
        state,
        target,
        environment,
        target < cruise && target > 0 ? -terminalDeceleration : 0,
      );
    }
    const oldDistance = state.distance;
    advanceDrive(state, step, physics);
    state.distance = oldDistance + (state.distance - oldDistance) * state.direction;
    const afterRemaining = (terminal - state.distance) * state.direction;
    if (afterRemaining <= 0.05) {
      // Terminal protection is also a final guard for externally restored states.
      state.distance = terminal;
      state.speed = 0;
      state.power = 0;
      state.brake = 1;
      state.journeyPhase = 'dwelling';
      state.dwellRemaining = TERMINAL_DWELL;
    }
  }
  state.journeyStatus = status(state, stationDistance);
  return { phase: state.journeyPhase, status: state.journeyStatus, reversed };
}
