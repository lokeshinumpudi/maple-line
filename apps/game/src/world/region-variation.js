/** Coherent district recipes. Coordinates are route metres; no chunk ownership or frame clock. */
export const REGION_LENGTH = 1200;
const clamp01 = (value) => Math.max(0, Math.min(1, value));
const ease = (value) => {
  const t = clamp01(value);
  return t * t * t * (t * (t * 6 - 15) + 10);
};
const mix = (a, b, t) => a + (b - a) * t;
function random(cell, seed, channel) {
  let value =
    (Math.imul(cell + 1009, 374761393) ^
      Math.imul(seed, 668265263) ^
      Math.imul(channel + 7, 1274126177)) >>>
    0;
  value = Math.imul(value ^ (value >>> 13), 1274126177);
  return ((value ^ (value >>> 16)) >>> 0) / 4294967296;
}
function field(cell, seed, channel, lower, upper, blend) {
  return (
    lower +
    (upper - lower) * mix(random(cell, seed, channel), random(cell + 1, seed, channel), blend)
  );
}

export function regionalVariation(z, seed = 2719) {
  const position = Number.isFinite(z) ? z : 0;
  const cell = Math.floor(position / REGION_LENGTH);
  const blend = ease(position / REGION_LENGTH - cell);
  const snow = ease((position - 11000) / 900) * (1 - ease((position - 14500) / 1000));
  const city = ease((position - 21100) / 1700);
  const terrace = ease((position - 16300) / 1000) * (1 - ease((position - 19800) / 1000));
  const wetness = field(cell, seed, 4, 0.25, 0.88, blend);
  return {
    id: `region-${cell}`,
    seed,
    start: cell * REGION_LENGTH,
    end: (cell + 1) * REGION_LENGTH,
    blend,
    ridgeHeight: field(cell, seed, 0, 40, 140, blend) * (1 - city * 0.5),
    ridgeSpacing: field(cell, seed, 1, 270, 520, blend),
    secondaryRidge: field(cell, seed, 2, 0.3, 0.72, blend),
    contourFrequency: field(cell, seed, 3, 0.0012, 0.0024, blend),
    wetness,
    snow,
    city,
    terrace,
    palette: { moss: wetness, ochre: (1 - wetness) * (1 - snow), snow },
    architecture: {
      tier: city > 0.65 ? 'urban' : city > 0.15 ? 'town' : snow > 0.5 ? 'snow-village' : 'rural',
      density: mix(0.2, 0.85, city),
    },
    farm: {
      type: terrace > 0.4 ? 'rice-terraces' : wetness > 0.6 ? 'rice-paddies' : 'vegetable-fields',
      terraceStep: field(cell, seed, 5, 2.8, 5.6, blend),
    },
  };
}

export function regionalMountainHeight(relativeRail, z, seed = 2719) {
  if (!Number.isFinite(relativeRail) || !Number.isFinite(z)) return 0;
  const distance = Math.abs(relativeRail);
  if (distance <= 45) return 0;
  const region = regionalVariation(z, seed);
  const side = relativeRail < 0 ? -1 : 1;
  const shoulder = ease((distance - 45) / 100);
  // Separate valley sides and add a slower distant ridge, while keeping all added ground positive.
  const along = z * 0.00165 + side * 1.7 + (seed % 997) * 0.013;
  const contour = Math.sin(along) * 0.32 + Math.sin(z * 0.0037 + side * 0.9) * 0.12;
  const cross = (distance - 45) / region.ridgeSpacing;
  const foothill = Math.pow(0.5 + 0.5 * Math.sin(cross * Math.PI * 2 + contour), 2);
  const distant = (0.5 + 0.5 * Math.sin(cross * Math.PI + along * 0.35)) * region.secondaryRidge;
  return shoulder * region.ridgeHeight * (0.22 + foothill * 0.62 + distant * 0.38);
}
