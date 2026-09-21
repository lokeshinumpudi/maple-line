import test from 'node:test';
import assert from 'node:assert/strict';
import { CatmullRomCurve3, Vector3, Quaternion, Euler } from 'three';
import { cabPose, interiorPose } from '../src/camera/camera.js';
const track = new CatmullRomCurve3(
  Array.from({ length: 161 }, (_, i) => {
    const z = -800 + i * 10;
    return new Vector3(22 * Math.sin(z * 0.006) + 12 * Math.sin(z * 0.014) + 28, 4.75 + i * 0.3, z);
  }),
);
const length = track.getLength();
test('inside cameras stay in their carriage on curves, grades and reversals', () => {
  for (const direction of [-1, 1])
    for (const passenger of [false, true]) {
      for (let distance = 50; distance < length - 50; distance += 2.5) {
        const pose = passenger
          ? interiorPose(track, distance, length, direction, true)
          : cabPose(track, distance, length, direction);
        const carDistance = distance - (passenger ? direction * 13.5 : 0);
        const tangent = track.getTangentAt(carDistance / length).multiplyScalar(direction);
        const rotation = new Quaternion().setFromEuler(
          new Euler(-Math.asin(tangent.y), Math.atan2(tangent.x, tangent.z), 0, 'YXZ'),
        );
        const local = pose.eye
          .clone()
          .sub(track.getPointAt(carDistance / length))
          .applyQuaternion(rotation.invert());
        assert.ok(
          Math.abs(local.x) < 1.4 && local.y > 2.3 && local.y < 3.1 && Math.abs(local.z) < 5.2,
        );
        assert.ok(pose.target.clone().sub(pose.eye).dot(tangent) > 44.5);
      }
    }
});
