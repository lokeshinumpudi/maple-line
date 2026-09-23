import * as THREE from 'three';
import { sceneryFields } from '../world/scenery-fields.js';

/** Paint shared vertices alike, using smoothed slope rather than a per-face cliff cutoff. */
export function paintTerrain(geometry, { seed = 431, bankDistance, snowAt } = {}) {
  const positions = geometry.attributes.position;
  const normals = geometry.attributes.normal;
  const colors = new Float32Array(positions.count * 3);
  // Warm, slightly dry meadow greens: closer to late-season grass under haze.
  const meadow = new THREE.Color('#9ba279'),
    moss = new THREE.Color('#6f836c');
  const stone = new THREE.Color('#969b91'),
    sand = new THREE.Color('#c1bda2');
  const snow = new THREE.Color('#dce7e4'),
    color = new THREE.Color();
  for (let i = 0; i < positions.count; i++) {
    const x = positions.getX(i),
      z = positions.getZ(i);
    const fields = sceneryFields(x, z, seed);
    const slope = 1 - Math.abs(normals.getY(i));
    color.copy(meadow).lerp(moss, fields.moisture * 0.68 + fields.grove * 0.18);
    color.lerp(stone, THREE.MathUtils.smoothstep(slope, 0.18, 0.65) * 0.8);
    if (bankDistance) color.lerp(sand, 1 - THREE.MathUtils.smoothstep(bankDistance(x, z), 0, 7));
    color.lerp(snow, THREE.MathUtils.clamp(snowAt?.(x, z) ?? 0, 0, 1));
    color.multiplyScalar(0.94 + fields.grove * 0.12);
    colors.set([color.r, color.g, color.b], i * 3);
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return geometry;
}
