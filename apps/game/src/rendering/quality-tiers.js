/**
 * Graphics quality tiers for water, weather, foliage and fog. Pure data and selection
 * logic; the renderer modules read the settings they own.
 *
 * - low: phones and weak GPUs. No extra scene passes: water reflects the sky colour,
 *   rain and splashes are sparse, trees keep the cheap clusters everywhere.
 * - medium: one half-resolution reflection pass, the bed refraction, card canopies
 *   for the nearest trees.
 * - high: a sharper reflection, denser rain, card canopies further out.
 */
export const QUALITY_TIERS = Object.freeze({
  low: Object.freeze({
    reflectionSize: 0,
    refraction: false,
    reflectionInterval: 0,
    rainStreaks: 1600,
    splashes: 48,
    canopyCardDistance: 0,
    fallingLeaves: 90,
    rainRings: true,
    heightFog: true,
  }),
  medium: Object.freeze({
    reflectionSize: 512,
    refraction: true,
    reflectionInterval: 1 / 15,
    rainStreaks: 4200,
    splashes: 110,
    canopyCardDistance: 150,
    fallingLeaves: 220,
    rainRings: true,
    heightFog: true,
  }),
  high: Object.freeze({
    reflectionSize: 1024,
    refraction: true,
    reflectionInterval: 1 / 20,
    rainStreaks: 7600,
    splashes: 170,
    canopyCardDistance: 240,
    fallingLeaves: 360,
    rainRings: true,
    heightFog: true,
  }),
});
export const QUALITY_PREFERENCES = Object.freeze(['auto', 'high', 'medium', 'low']);
const ORDER = ['low', 'medium', 'high'];

/**
 * Pick the starting tier. Explicit preferences win. Automatic picks low on coarse-pointer
 * phones, medium on small or low-memory devices, and high otherwise.
 */
export function selectQualityTier({
  preference = 'auto',
  mobile = false,
  deviceMemoryGb = null,
  logicalProcessors = null,
  physicalPixels = 0,
} = {}) {
  if (!QUALITY_PREFERENCES.includes(preference))
    throw new TypeError(`Unknown graphics quality: ${preference}`);
  if (preference !== 'auto') return preference;
  if (mobile) return 'low';
  if (
    (Number.isFinite(deviceMemoryGb) && deviceMemoryGb <= 4) ||
    (Number.isFinite(logicalProcessors) && logicalProcessors <= 4)
  )
    return 'medium';
  // Very large drawing buffers pay for every extra pass per pixel.
  if (physicalPixels > 3200000) return 'medium';
  return 'high';
}

/**
 * Automatic tiers step down one level after sustained slow frames and step back up
 * only after a long healthy stretch. Returns the next tier.
 * stats: { p75FrameMs, healthySeconds } from the frame budget.
 */
export function adaptQualityTier(
  current,
  { p75FrameMs, healthySeconds = 0, floor = 'low', ceiling = 'high' } = {},
) {
  const index = ORDER.indexOf(current);
  if (index < 0) throw new TypeError(`Unknown tier: ${current}`);
  const minimum = ORDER.indexOf(floor),
    maximum = ORDER.indexOf(ceiling);
  if (Number.isFinite(p75FrameMs) && p75FrameMs > 28 && index > minimum) return ORDER[index - 1];
  if (healthySeconds >= 30 && index < maximum) return ORDER[index + 1];
  return current;
}
