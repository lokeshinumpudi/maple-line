import { QUALITY_TIERS, adaptQualityTier, selectQualityTier } from './quality-tiers.js';
import { updateWaterSurface } from './water-surface.js';
import { createCardCanopy } from '../world/card-canopy.js';
import { createFallingLeaves } from '../world/falling-leaves.js';
import { createLightHalos } from './light-halos.js';

/** Camera layer for particles the water mirror should not redraw (rain, snow, leaves). */
export const FX_LAYER = 3;

/**
 * One owner for the tiered scenery effects: graphics tier selection and adaptation,
 * near-camera card canopies, falling leaves and petals, and the shared water clock.
 * Systems that already exist (river, atmosphere, rain rings) are told the tier here.
 */
export function createSceneryEffects({
  THREE,
  scene,
  camera,
  mobile = false,
  preference = 'auto',
  wetness,
  snowCoverage = { value: 0 },
  environment = globalThis.navigator,
}) {
  camera.layers.enable(FX_LAYER);
  const detect = (value) =>
    selectQualityTier({
      preference: value,
      mobile,
      deviceMemoryGb: environment?.deviceMemory ?? null,
      logicalProcessors: environment?.hardwareConcurrency ?? null,
    });
  let currentPreference = preference;
  let ceiling = detect(preference);
  let tier = ceiling;
  const listeners = new Set();
  const canopy = createCardCanopy({ THREE, tier, wetness, snowCoverage });
  const leaves = createFallingLeaves({ THREE, count: 360, layer: FX_LAYER });
  leaves.setCount(QUALITY_TIERS[tier].fallingLeaves);
  scene.add(leaves.mesh);
  const halos = createLightHalos({ THREE, scene });
  let slowSeconds = 0,
    healthySeconds = 0,
    sinceChange = 0;
  const light = new THREE.Color();

  function apply(next) {
    if (next === tier) return;
    tier = next;
    canopy.setTier(tier);
    leaves.setCount(QUALITY_TIERS[tier].fallingLeaves);
    for (const listener of listeners) listener(QUALITY_TIERS[tier], tier);
  }
  return {
    FX_LAYER,
    snowCoverage,
    canopy,
    leaves,
    halos,
    get tier() {
      return tier;
    },
    get settings() {
      return QUALITY_TIERS[tier];
    },
    /** Systems register to hear tier changes: (settings, tierName) => void. */
    onTier(listener) {
      listeners.add(listener);
      listener(QUALITY_TIERS[tier], tier);
      return () => listeners.delete(listener);
    },
    setPreference(value) {
      if (value === currentPreference) return;
      currentPreference = value;
      ceiling = detect(value);
      slowSeconds = healthySeconds = sinceChange = 0;
      apply(ceiling);
    },
    /**
     * Per frame. frame: { dt, cameraPosition, weather, stormAmount, rain, gust, season,
     * leafKind, groundHeight, sunColor, hemiColor, frameMs }.
     */
    update({
      dt = 0,
      realDt = dt,
      cameraPosition = camera.position,
      rain = 0,
      gust = 0,
      leafKind = null,
      groundHeight = 0,
      sunColor,
      skyColor,
      frameMs = null,
      paused = false,
      night = 0,
      pixelHeight = 900,
    } = {}) {
      updateWaterSurface(paused ? 0 : dt, { rain });
      halos.update(realDt, { cameraPosition, night, wet: Math.min(1, rain), pixelHeight });
      canopy.update(cameraPosition);
      if (sunColor && skyColor) light.copy(sunColor).multiplyScalar(0.35).add(skyColor);
      leaves.update(paused ? 0 : dt, {
        kind: leafKind,
        // Rain knocks most leaves down; a storm strips the air of them.
        target: leafKind ? 1 - rain * 0.75 : 0,
        floor: groundHeight,
        wind: { x: 0.9 + gust * 4, z: 0.35 + gust * 1.5 },
        light: sunColor && skyColor ? light : undefined,
      });
      // Automatic tiers step down after sustained slow frames, never above the detected tier.
      if (currentPreference !== 'auto' || !Number.isFinite(frameMs)) return;
      sinceChange += realDt;
      slowSeconds = frameMs > 28 ? slowSeconds + realDt : Math.max(0, slowSeconds - realDt * 0.5);
      healthySeconds = frameMs < 18 ? healthySeconds + realDt : 0;
      if (sinceChange < 6) return;
      const next = adaptQualityTier(tier, {
        p75FrameMs: slowSeconds > 4 ? frameMs : 0,
        healthySeconds,
        ceiling,
      });
      if (next !== tier) {
        slowSeconds = healthySeconds = sinceChange = 0;
        apply(next);
      }
    },
    getState: () => ({
      preference: currentPreference,
      tier,
      detectedTier: ceiling,
      settings: { ...QUALITY_TIERS[tier] },
      canopy: canopy.getState(),
      fallingLeaves: leaves.getState(),
      halos: halos.getState(),
    }),
    dispose() {
      scene.remove(leaves.mesh);
      leaves.dispose();
      halos.dispose();
      canopy.dispose();
      listeners.clear();
    },
  };
}
