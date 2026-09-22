import { riverProfile, riverBedHeight } from './river-profile.js';

const smooth = (x, a, b) => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

// Shared section samples keep adjacent terrain strips welded, including lake chunks.
// Coordinates are metres from the railway; far bands close the horizon for wide views.
export const TERRAIN_LATERAL_SAMPLES = Object.freeze(
  [
    ...new Set([
      -1600,
      -1200,
      -850,
      -600,
      -430,
      -350,
      -320,
      -280,
      -230,
      -170,
      -130,
      ...Array.from({ length: 71 }, (_, i) => -130 + i * 3),
      ...Array.from({ length: 48 }, (_, i) => -300 + i * 6),
      -14,
      -10,
      -7,
      0,
      7,
      10,
      14,
      25,
      45,
      75,
      90,
      110,
      135,
      165,
      200,
      245,
      320,
      430,
      600,
      850,
      1200,
      1600,
    ]),
  ].sort((a, b) => a - b),
);

// The original valley and the first regional chunk must use the same height at their seam.
export function naturalValleyTerrain(u, z) {
  const bed = riverBedHeight(u, z);
  if (bed !== null) return bed;
  const river = riverProfile(z),
    left = river.offset - river.halfWidth - 8;
  if (u >= left && u <= 38) return 4.1;
  const d = u > 38 ? u - 38 : left - u;
  // Broad foothills replace the former constant 85% bank slope away from the river.
  const rise = 0.46 * d - 18 * (1 - Math.exp(-d / 60));
  const height =
    4.1 +
    rise +
    Math.sin(z * 0.009 + u * 0.021) * Math.min(d * 0.18, 15) +
    Math.sin(z * 0.027 + u * 0.052) * Math.min(d * 0.07, 5);
  const basin = (a, b) => smooth(z, a - 70, a) * (1 - smooth(z, b, b + 70));
  const weight = u > 38 ? Math.max(basin(-270, -80), basin(600, 850)) : basin(-465, -265);
  return height + (4.1 + d * 0.2 - height) * weight;
}
