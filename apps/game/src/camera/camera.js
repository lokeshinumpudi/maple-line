import { Euler, MathUtils, Quaternion, Vector3 } from 'three';

/** Matches the car placement exactly, including pitch on grades and reversed running. */
export function interiorPose(
  track,
  distance,
  trackLength,
  direction = 1,
  passenger = false,
  yaw = 0,
  pitch = 0,
) {
  const carDistance = distance - (passenger ? direction * 13.5 : 0);
  const t = MathUtils.clamp(carDistance / trackLength, 0, 1);
  const position = track.getPointAt(t);
  const forward = track.getTangentAt(t).multiplyScalar(direction);
  const rotation = new Quaternion().setFromEuler(
    new Euler(-Math.asin(forward.y), Math.atan2(forward.x, forward.z), 0, 'YXZ'),
  );
  const localEye = passenger ? new Vector3(0, 2.62, -3.65) : new Vector3(-0.86, 2.72, 4.65);
  const eye = localEye.applyQuaternion(rotation).add(position);
  const aim = new Vector3(
    Math.sin(yaw) * Math.cos(pitch),
    Math.sin(pitch),
    Math.cos(yaw) * Math.cos(pitch),
  ).applyQuaternion(rotation);
  const target = eye.clone().addScaledVector(aim, 45);
  return { eye, target, forward, trainPosition: position };
}
export function cabPose(track, distance, trackLength, direction = 1) {
  return interiorPose(track, distance, trackLength, direction, false, 0, -0.12);
}
