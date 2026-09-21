import { DRIVE_LIMITS, driveParameters } from '../simulation/physics.js';

export function driveNotch({ power = 0, brake = 0 }) {
  return brake > 0 ? -Math.round(brake * 5) : Math.round(power * 5);
}
export function notchDemand(value) {
  if (!Number.isFinite(value)) throw new TypeError('Controller notch must be finite.');
  const notch = Math.max(-5, Math.min(5, Math.round(value)));
  return { power: Math.max(0, notch) / 5, brake: Math.max(0, -notch) / 5 };
}
export function notchLabel(notch) {
  return notch < 0 ? `Brake B${-notch}` : notch > 0 ? `Power P${notch}` : 'Coast';
}
export function drivingFeedback(state, environment = {}) {
  const { adhesion, gradeForce } = driveParameters(environment);
  const deceleration = DRIVE_LIMITS.serviceBrake * adhesion + gradeForce;
  const stoppingMetres =
    state.speed > 0.2 && deceleration > 0.1
      ? Math.ceil(state.speed * 0.3 + state.speed ** 2 / (2 * deceleration))
      : null;
  const motion = state.emergency
    ? 'Emergency brake applied'
    : state.doorsOpen || state.doorsClosing
      ? 'Doors interlock · traction locked'
      : state.paused
        ? 'Paused · resume to move'
        : state.actualBrake > 0.05
          ? `Braking · ${Math.round(state.actualBrake * 100)}% applied`
          : state.speed < 0.2 && state.power === 0
            ? 'At rest · move the lever toward power'
            : state.power > state.actualPower + 0.06
              ? 'Traction building…'
              : state.acceleration > 0.025
                ? 'Gathering speed'
                : state.acceleration < -0.025
                  ? 'Easing down'
                  : 'Rolling steadily';
  return { motion, stoppingMetres };
}
