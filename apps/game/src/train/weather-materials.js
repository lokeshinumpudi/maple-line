/**
 * Bounded, time-continuous wetting and drying for standard PBR materials.
 *
 * Wetness only changes existing roughness and albedo inside the material's own shader, so the
 * six cached PMREM environments supply the reflection. There are no extra passes or lights.
 * Porous families (soil, timber, ballast) darken a lot and stay fairly rough; nonporous
 * families (paint, glazed tile, steel) barely darken but drop to a low roughness sheen.
 */

/** Scenery material families keyed by surface-detail kind. */
export const SURFACE_FAMILIES = {
  terrain: { porous: true, darken: 0.3, roughnessFloor: 0.62, sheen: 0.5 },
  stone: { porous: true, darken: 0.28, roughnessFloor: 0.38, sheen: 0.8 },
  roof: { porous: false, darken: 0.16, roughnessFloor: 0.2, sheen: 1 },
  timber: { porous: true, darken: 0.34, roughnessFloor: 0.58, sheen: 0.45 },
  plaster: { porous: true, darken: 0.22, roughnessFloor: 0.7, sheen: 0.25 },
  ballast: { porous: true, darken: 0.32, roughnessFloor: 0.56, sheen: 0.5 },
};

/** Exterior train finishes. Paint keeps its colour identity and gains a sheen, not chrome. */
export const TRAIN_FAMILIES = {
  paint: { porous: false, darken: 0.06, roughnessFloor: 0.14, sheen: 1 },
  roofPaint: { porous: false, darken: 0.1, roughnessFloor: 0.3, sheen: 0.9 },
  steel: { porous: false, darken: 0.08, roughnessFloor: 0.3, sheen: 0.8 },
};

/** Steady-state wetness for a weather mode. Snow leaves surfaces damp, not streaming. */
export function wetnessTarget(weather) {
  if (weather === 'rain') return 1;
  if (weather === 'snow') return 0.25;
  return 0;
}

/**
 * Exponential approach to the weather target. Rain shows within seconds while drying is
 * several times slower. The step is exact for any partition of dt, and dt <= 0 is a no-op.
 */
export function createWetnessTracker({ wetTime = 7, dryTime = 40, initial = 0 } = {}) {
  const uniform = { value: clamp01(initial) };
  return {
    uniform,
    get value() {
      return uniform.value;
    },
    advance(dt, weather) {
      const step = Number.isFinite(dt) ? Math.max(0, dt) : 0;
      if (step === 0) return uniform.value;
      const target = wetnessTarget(weather);
      const time = target > uniform.value ? wetTime : dryTime;
      const next = target + (uniform.value - target) * Math.exp(-step / time);
      uniform.value = clamp01(Math.abs(next - target) < 1e-4 ? target : next);
      return uniform.value;
    },
  };
}

function clamp01(value) {
  return Math.min(1, Math.max(0, value));
}

const fixed = (value) => Number(value).toFixed(3);

/**
 * GLSL for the roughness hook. `weight` is the 0..1 share of the surface receiving standing
 * water (upward faces); darkening soaks every face on porous families.
 */
export function wetnessRoughnessGlsl(family, { wetness = 'surfaceWetness', weight = '1.0' } = {}) {
  return `
    float wetSheen = ${wetness} * ${fixed(family.sheen)} * ${weight};
    roughnessFactor = clamp(mix(roughnessFactor, min(roughnessFactor, ${fixed(family.roughnessFloor)}), wetSheen), 0.0, 1.0);
  `;
}

export function wetnessDarkenGlsl(family, { wetness = 'surfaceWetness', weight = '1.0' } = {}) {
  const soak = family.porous ? '1.0' : `mix(0.6, 1.0, ${weight})`;
  return `diffuseColor.rgb *= 1.0 - ${wetness} * ${fixed(family.darken)} * ${soak};`;
}

/**
 * Chain a wetness finish onto a MeshStandardMaterial. Keeps the previous onBeforeCompile and
 * cache key, adds one shared uniform, and marks the program once. Never call this per frame.
 */
export function applyWeatherFinish(material, family, wetness, { name = 'exterior' } = {}) {
  if (!material || !material.isMeshStandardMaterial) return material;
  if (material.userData.weatherFinish) return material;
  const previous = material.onBeforeCompile;
  const previousKey = material.customProgramCacheKey();
  const key = Object.entries(TRAIN_FAMILIES).find(([, value]) => value === family)?.[0] ?? name;
  material.onBeforeCompile = function (shader, renderer) {
    previous.call(this, shader, renderer);
    shader.uniforms.exteriorWetness = wetness;
    shader.vertexShader =
      'varying vec3 vWeatherNormal;\n' +
      shader.vertexShader.replace(
        '#include <defaultnormal_vertex>',
        `#include <defaultnormal_vertex>
        // transformedNormal already accounts for instance scaling and the normal matrix.
        // Undo only the camera rotation to obtain a world-space normal.
        vWeatherNormal = normalize(vec3(
          dot(viewMatrix[0].xyz, transformedNormal),
          dot(viewMatrix[1].xyz, transformedNormal),
          dot(viewMatrix[2].xyz, transformedNormal)));`,
      );
    shader.fragmentShader =
      'uniform float exteriorWetness; varying vec3 vWeatherNormal;\n' + shader.fragmentShader;
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <color_fragment>',
      `#include <color_fragment>
      float weatherUp = smoothstep(0.0, 0.6, vWeatherNormal.y);
      ${wetnessDarkenGlsl(family, { wetness: 'exteriorWetness', weight: 'weatherUp' })}`,
    );
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <roughnessmap_fragment>',
      `#include <roughnessmap_fragment>
      ${wetnessRoughnessGlsl(family, {
        wetness: 'exteriorWetness',
        weight: 'mix(0.55, 1.0, weatherUp)',
      })}`,
    );
  };
  material.customProgramCacheKey = () => `${previousKey}:weather-finish-v1:${key}`;
  material.userData.weatherFinish = key;
  material.needsUpdate = true;
  return material;
}
