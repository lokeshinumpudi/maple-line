/** All horizontal coordinates are relative to the valley center at z.
 * Water sits at -0.4 m. The railway begins beyond the right bank at u=20.
 */
const WATER_Y = -0.4;
const BANK_RUN = 8;
const smoothstep = (t) => t * t * (3 - 2 * t);

export function riverProfile(z) {
  // Incommensurate broad waves give alternating pools and narrow river bends.
  // A soft upper bound holds the right shoreline below the railway shelf.
  const rawOffset = -18 + 27 * Math.sin(z * 0.014) + 11 * Math.sin(z * 0.031);
  const halfWidth = 14.5 + 4.5 * Math.sin(z * 0.009 + 0.8) + 2 * Math.sin(z * 0.023 - 1.1);
  const maximumOffset = 18 - halfWidth;
  const softness = 1.5;
  const offset =
    maximumOffset - softness * Math.log1p(Math.exp((maximumOffset - rawOffset) / softness));
  const depth = 3.4 + 0.95 * Math.sin(z * 0.008 - 0.6) + 0.65 * Math.sin(z * 0.017 + 1.2);
  return { offset, halfWidth, depth };
}

export function riverBedHeight(u, z) {
  const { offset, halfWidth, depth } = riverProfile(z);
  const delta = u - offset;
  const distance = Math.abs(delta);
  const outside = distance - halfWidth;
  if (outside > BANK_RUN) return null;
  if (outside > 0) {
    // Dry gravel banks reach the established shelf height without a sharp lip.
    // The right bank reaches shelf height by u=20, preserving track clearance.
    const bankWidth =
      delta > 0 ? Math.min(BANK_RUN, Math.max(2, 20 - offset - halfWidth)) : BANK_RUN;
    return WATER_Y + (4.1 - WATER_Y) * smoothstep(Math.min(outside / bankWidth, 1));
  }
  const normalized = distance / halfWidth;
  // The narrow wet margin drops through visible shallows toward an uneven bed.
  // The surface and bank meet exactly at the edge; depth remains continuous.
  const immersion = 1 - smoothstep(normalized);
  const channel = immersion * (0.92 + 0.08 * Math.sin(z * 0.031 + delta * 0.23));
  return WATER_Y - depth * channel;
}
