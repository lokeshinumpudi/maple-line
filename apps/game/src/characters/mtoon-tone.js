/**
 * One look for every VRM character under the game's light. MToon parameters arrive from
 * each file (our build scripts, or an outside avatar with its own taste); this pass keeps
 * each character's colours but brings outline width, the shaded side and the rim light
 * into one house style, so a VRoid sample and a Maple-built figure stand together on a
 * platform. The scene renders linear HDR and the film pipeline applies ACES afterwards,
 * so values here are chosen for that curve: shade colours stay fairly light because ACES
 * deepens darks, and rim light is warm and weak so it reads as evening sun, not a halo.
 */

export const CHARACTER_TONE = Object.freeze({
  /**
   * Lit colour scale. Characters are authored in display colours; under the game's sun,
   * sky light and exposure a Lambert surface receives about 1.6x its base, which would
   * clip skin and white shirts to white before ACES.
   */
  lit: 0.62,
  /** Outline width in metres at 1.6 m tall, clamped so tiny or huge authoring values agree. */
  outline: { min: 0.0012, max: 0.0032 },
  /** Mix the file's shade colour toward a warm lavender, the slice-of-life shadow hue. */
  shadeTint: [0.86, 0.8, 0.94],
  shadeMix: 0.35,
  /** Never let the shaded side fall below this fraction of the lit colour (per channel). */
  shadeFloor: 0.42,
  giEqualization: 0.9,
  rim: { color: [1, 0.84, 0.66], strength: 0.15, fresnelPower: 4, lift: 0.04, lightingMix: 1 },
  /** Mobile draws no outlines: each outline is a second draw of the mesh. */
  mobileOutlines: false,
});

/** Tone values for one material as plain numbers (testable without three.js). */
export function toneValues(
  { base = [1, 1, 1], shade = null, outline = 0, outlineMode = 'none' },
  { height = 1.6, mobile = false, tone = CHARACTER_TONE } = {},
) {
  const source = shade ?? base.map((c) => c * 0.7);
  const mixed = source.map((c, i) => c + (c * tone.shadeTint[i] - c) * tone.shadeMix);
  const floored = mixed.map((c, i) => Math.max(c, base[i] * tone.shadeFloor));
  const scale = height / 1.6;
  const hasOutline = outlineMode !== 'none' && outline > 0 && (!mobile || tone.mobileOutlines);
  const width = hasOutline
    ? Math.min(tone.outline.max * scale, Math.max(tone.outline.min * scale, outline))
    : 0;
  return {
    shade: floored,
    outlineWidth: width,
    outlineMode: hasOutline ? 'worldCoordinates' : 'none',
    rim: tone.rim.color.map((c) => c * tone.rim.strength),
  };
}

/**
 * Apply the house tone to every MToon material of a loaded VRM. Face decals (no outline in
 * the file) keep their flat shading; everything else gets the shared shade, rim and outline.
 */
export function toneVrm(vrm, { height = 1.6, mobile = false, tone = CHARACTER_TONE } = {}) {
  const seen = new Set();
  let count = 0;
  vrm.scene.traverse((node) => {
    if (!node.isMesh) return;
    node.castShadow = true;
    node.receiveShadow = true;
    // Skinned bounds come from the bind pose; animated limbs leave them.
    node.frustumCulled = false;
    const materials = Array.isArray(node.material) ? node.material : [node.material];
    for (const material of materials) {
      if (!material?.isMToonMaterial || seen.has(material)) continue;
      seen.add(material);
      count++;
      material.fog = true;
      if (!material.userData.mapleLit) {
        // Once per material, so toning a VRM twice does not darken it twice.
        material.userData.mapleLit = true;
        material.color.multiplyScalar(tone.lit);
        material.shadeColorFactor.multiplyScalar(tone.lit);
      }
      if (material.isOutline) {
        // Outline copies share the tone of their surface; mobile hides them.
        if (mobile && !tone.mobileOutlines) material.visible = false;
        continue;
      }
      const flat = material.outlineWidthMode === 'none' && material.shadingToonyFactor >= 0.99;
      if (flat) continue;
      const values = toneValues(
        {
          base: material.color.toArray(),
          shade: material.shadeColorFactor.toArray(),
          outline: material.outlineWidthFactor,
          outlineMode: material.outlineWidthMode,
        },
        { height, mobile, tone },
      );
      material.shadeColorFactor.fromArray(values.shade);
      material.giEqualizationFactor = tone.giEqualization;
      material.parametricRimColorFactor.fromArray(values.rim);
      material.parametricRimFresnelPowerFactor = tone.rim.fresnelPower;
      material.parametricRimLiftFactor = tone.rim.lift;
      material.rimLightingMixFactor = tone.rim.lightingMix;
      material.outlineWidthFactor = values.outlineWidth;
    }
  });
  // Outline materials copy uniforms from their surface when the surface changes.
  vrm.scene.traverse((node) => {
    if (!node.isMesh || !Array.isArray(node.material)) return;
    const [surface, outline] = node.material;
    if (outline?.isOutline && surface?.isMToonMaterial) {
      outline.outlineWidthFactor = surface.outlineWidthFactor;
      outline.outlineColorFactor.copy(surface.outlineColorFactor);
      outline.shadeColorFactor.copy(surface.shadeColorFactor);
    }
  });
  return count;
}
