import { validateWorldSpec } from '@maple-line/world-spec';
import { sceneryFields, sceneryHash } from './scenery-fields.js';
import { worldClearings } from './world-details.js';

const PALETTES = {
  spring: ['#f5c6d5', '#f1dba0', '#efebd5'],
  summer: ['#e8dfa4', '#b7cf89', '#e9e8ca'],
  autumn: ['#d3a567', '#c6b575', '#dbaa81'],
  winter: ['#bfb6a0', '#c9c7ba', '#aaa58e'],
};

// Version 2: independent meadow namespace, metres; bounded original-valley extent.
// The complete patch footprint must fit on dry, gentle ground outside landmarks.
export function createMeadowLayout({
  plan: raw,
  terrain,
  railU,
  riverBedHeight,
  center = () => 0,
}) {
  const plan = validateWorldSpec(raw);
  const patches = [];
  const sample = (i, lane) => sceneryHash(i, lane, plan.seed ^ 0x4d454144);
  const safe = (u, z) => {
    const bed = riverBedHeight(u, z);
    return (
      Math.abs(u - railU(z)) >= 9 &&
      Math.abs(u) >= 21 &&
      !(u > 18 && u < 43) &&
      (bed === null || bed >= 3) &&
      !(z > 460 && z < 580 && u > 20 && u < 58) &&
      !worldClearings.some(
        (r) => z >= r.minZ - 4 && z <= r.maxZ + 4 && u >= r.minU - 5 && u <= r.maxU + 5,
      )
    );
  };
  for (let i = 0; i < 5000; i++) {
    const u = -140 + sample(i, 1) * 280;
    const z = -812 + sample(i, 2) * 1624;
    const fields = sceneryFields(center(z) + u, z, plan.seed);
    // Broad ribbons on grove margins, with gaps; keep deep woods quieter.
    const edge = Math.max(0, 1 - Math.abs(fields.grove - 0.48) * 3);
    if (sample(i, 3) > edge * (plan.forest === 'sparse' ? 0.6 : 0.88)) continue;
    const y = terrain(u, z);
    if (!Number.isFinite(y)) continue;
    const at = (dx, dz) => terrain(u + dx + center(z) - center(z + dz), z + dz);
    const slopeX = (at(1, 0) - at(-1, 0)) / 2;
    const slopeZ = (at(0, 1) - at(0, -1)) / 2;
    if (Math.hypot(slopeX, slopeZ) > 1.35) continue;
    if (
      ![
        [0, 0],
        [-3, -3],
        [-3, 3],
        [3, -3],
        [3, 3],
      ].every(
        ([dx, dz]) =>
          safe(u + dx + center(z) - center(z + dz), z + dz) &&
          Math.abs(at(dx, dz) - (y + slopeX * dx + slopeZ * dz)) < 0.45,
      )
    )
      continue;
    const palette = PALETTES[plan.season];
    patches.push({
      id: `meadow-${i}`,
      u,
      z,
      y: y - 0.06,
      normal: [-slopeX, 1, -slopeZ],
      angle: sample(i, 4) * Math.PI * 2,
      scale: 0.8 + sample(i, 5) * 0.9,
      height: (plan.season === 'winter' ? 0.5 : 0.7) + sample(i, 6) * 0.5,
      tint: palette[Math.min(palette.length - 1, Math.floor(fields.moisture * palette.length))],
    });
  }
  return patches;
}

/** One shared tuft: tapered blades and five open flower/seed heads, no alpha overdraw. */
export function createMeadowGeometry(THREE) {
  const positions = [],
    colors = [];
  const green = new THREE.Color('#698052'),
    stem = new THREE.Color('#82936a');
  function triangle(a, b, c, tint) {
    positions.push(...a, ...b, ...c);
    for (let k = 0; k < 3; k++) colors.push(tint.r, tint.g, tint.b);
  }
  for (let i = 0; i < 24; i++) {
    const a = i * 2.399,
      r = Math.sqrt((i + 0.5) / 24) * 1.25;
    const x = Math.cos(a) * r,
      z = Math.sin(a) * r;
    const h = 0.3 + sceneryHash(i, 1, 581) * 0.65;
    const dx = Math.cos(a) * 0.09,
      dz = Math.sin(a) * 0.09;
    triangle([x - dx, -0.3, z - dz], [x + dx, -0.3, z + dz], [x + dz * 3, h, z - dx * 3], green);
  }
  const white = new THREE.Color('#fff5de');
  for (let i = 0; i < 5; i++) {
    const a = i * 2.399,
      x = Math.cos(a) * 0.9,
      z = Math.sin(a) * 0.9;
    const h = 0.65 + sceneryHash(i, 8, 581) * 0.45;
    triangle([x - 0.025, -0.3, z], [x + 0.025, -0.3, z], [x, h, z], stem);
    for (let p = 0; p < 5; p++) {
      const a1 = (p * Math.PI * 2) / 5,
        a2 = a1 + 0.8;
      triangle(
        [x, h - 0.035, z],
        [x + Math.cos(a1) * 0.19, h + 0.04, z + Math.sin(a1) * 0.19],
        [x + Math.cos(a2) * 0.19, h + 0.04, z + Math.sin(a2) * 0.19],
        white,
      );
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  geometry.name = 'Meadow / blades and open heads';
  return geometry;
}
