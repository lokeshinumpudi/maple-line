// Wind moves vertices in world metres, including instanced trees and shadow passes.
// Apply after other material hooks (for example snow), then copyToChunk for each
// scenery chunk. Foliage outlines must receive the same parameters as their tree.
export const WIND_DIRECTION = Object.freeze({ x: 0.93, y: 0, z: 0.36 });
const GUST_RATE = 0.25;
const MAX_AMPLITUDE = 0.2;
const MAX_FLUTTER = 0.015;

export function createWindField({ THREE }) {
  const time = { value: 0 };
  const strength = { value: 0.7 };
  const ownedMaterials = new Set();
  const bindings = new Map();
  let weather = 'clear';
  let strengthOverride = null;
  const declarations = `
uniform float mapleWindTime;
uniform float mapleWindStrength;
uniform float mapleWindAmplitude;
uniform float mapleWindAnchorMin;
uniform float mapleWindAnchorMax;
uniform float mapleWindFlutter;
`;
  const bend = `
#include <begin_vertex>
mat4 mapleWindMatrix = modelMatrix;
#ifdef USE_INSTANCING
  mapleWindMatrix = modelMatrix * instanceMatrix;
#endif
vec3 mapleWindOrigin = mapleWindMatrix[3].xyz;
float mapleWindPhase = dot(mapleWindOrigin.xz, vec2(0.022, 0.014)) - mapleWindTime * ${GUST_RATE};
float mapleWindGust = sin(mapleWindPhase) * 0.72 + sin(mapleWindPhase * 2.17 + 1.4) * 0.28;
float mapleWindAnchor = smoothstep(mapleWindAnchorMin, mapleWindAnchorMax, position.y);
float mapleWindRipple = sin(mapleWindTime * 1.8 + dot(mapleWindOrigin.xz, vec2(0.09, 0.07)) + position.x * 2.0) * mapleWindFlutter;
vec3 mapleWindOffset = vec3(0.93, 0.04, 0.36) * (mapleWindGust + mapleWindRipple) * mapleWindAnchor * mapleWindAmplitude * mapleWindStrength;
transformed += vec3(
  dot(mapleWindMatrix[0].xyz, mapleWindOffset) / max(dot(mapleWindMatrix[0].xyz, mapleWindMatrix[0].xyz), 0.0001),
  dot(mapleWindMatrix[1].xyz, mapleWindOffset) / max(dot(mapleWindMatrix[1].xyz, mapleWindMatrix[1].xyz), 0.0001),
  dot(mapleWindMatrix[2].xyz, mapleWindOffset) / max(dot(mapleWindMatrix[2].xyz, mapleWindMatrix[2].xyz), 0.0001)
);
`;
  function wrap(original, settings) {
    const material = original.clone();
    const previous = original.onBeforeCompile;
    const previousKey = original.customProgramCacheKey();
    material.onBeforeCompile = function (shader, renderer) {
      previous.call(this, shader, renderer);
      Object.assign(shader.uniforms, {
        mapleWindTime: time,
        mapleWindStrength: strength,
        mapleWindAmplitude: { value: settings.amplitude },
        mapleWindAnchorMin: { value: settings.anchorMin },
        mapleWindAnchorMax: { value: settings.anchorMax },
        mapleWindFlutter: { value: settings.flutter },
      });
      shader.vertexShader =
        declarations + shader.vertexShader.replace('#include <begin_vertex>', bend);
    };
    material.customProgramCacheKey = () => `${previousKey}|maple-wind-v2`;
    material.needsUpdate = true;
    ownedMaterials.add(material);
    return material;
  }
  function inflate(mesh, amplitude) {
    if (mesh.userData.mapleWindBoundAdded) return;
    mesh.computeBoundingSphere?.();
    if (mesh.boundingSphere) mesh.boundingSphere.radius += amplitude * 3;
    mesh.userData.mapleWindBoundAdded = amplitude * 3;
  }
  const api = {
    apply(mesh, { amplitude = 0.1, anchorMin = -1.2, anchorMax = -0.3, flutter = 0.008 } = {}) {
      if (bindings.has(mesh)) return mesh;
      for (const value of [amplitude, anchorMin, anchorMax, flutter])
        if (!Number.isFinite(value)) throw new TypeError('Wind settings must be finite.');
      if (amplitude < 0 || amplitude > 3 || flutter < 0 || flutter > 1 || anchorMin >= anchorMax)
        throw new RangeError('Wind needs amplitude 0–3, flutter 0–1, and anchorMin < anchorMax.');
      // Bound legacy caller values as well as new defaults: this is a breeze,
      // not large-amplitude bending of whole trees.
      const settings = {
        amplitude: Math.min(amplitude, MAX_AMPLITUDE),
        anchorMin,
        anchorMax,
        flutter: Math.min(flutter, MAX_FLUTTER),
      };
      const original = {
        material: mesh.material,
        depth: mesh.customDepthMaterial,
        distance: mesh.customDistanceMaterial,
      };
      mesh.material = Array.isArray(mesh.material)
        ? mesh.material.map((material) => wrap(material, settings))
        : wrap(mesh.material, settings);
      const depthSource =
        mesh.customDepthMaterial ??
        new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking });
      const distanceSource = mesh.customDistanceMaterial ?? new THREE.MeshDistanceMaterial();
      const visibleMaterial = Array.isArray(original.material)
        ? original.material[0]
        : original.material;
      mesh.customDepthMaterial = wrap(depthSource, settings);
      mesh.customDistanceMaterial = wrap(distanceSource, settings);
      for (const shadow of [mesh.customDepthMaterial, mesh.customDistanceMaterial]) {
        shadow.map = visibleMaterial.map ?? null;
        shadow.alphaMap = visibleMaterial.alphaMap ?? null;
        shadow.alphaTest = visibleMaterial.alphaTest ?? 0;
        shadow.side = visibleMaterial.side;
      }
      if (!original.depth) depthSource.dispose();
      if (!original.distance) distanceSource.dispose();
      const shared = {
        settings,
        users: new Set([mesh]),
        materials: [
          ...(Array.isArray(mesh.material) ? mesh.material : [mesh.material]),
          mesh.customDepthMaterial,
          mesh.customDistanceMaterial,
        ],
      };
      bindings.set(mesh, { original, shared });
      inflate(mesh, settings.amplitude);
      return mesh;
    },
    copyToChunk(source, chunk) {
      const binding = bindings.get(source);
      if (!binding || bindings.has(chunk)) return chunk;
      const original = {
        material: chunk.material === source.material ? binding.original.material : chunk.material,
        depth: chunk.customDepthMaterial,
        distance: chunk.customDistanceMaterial,
      };
      chunk.material = source.material;
      chunk.customDepthMaterial = source.customDepthMaterial;
      chunk.customDistanceMaterial = source.customDistanceMaterial;
      binding.shared.users.add(chunk);
      bindings.set(chunk, { original, shared: binding.shared });
      inflate(chunk, binding.shared.settings.amplitude);
      return chunk;
    },
    // Eviction restores the caller-owned originals. Shared chunk shaders remain
    // alive until the final user is removed; this method never disposes geometry.
    remove(mesh) {
      const binding = bindings.get(mesh);
      if (!binding) return false;
      mesh.material = binding.original.material;
      mesh.customDepthMaterial = binding.original.depth;
      mesh.customDistanceMaterial = binding.original.distance;
      if (mesh.boundingSphere && mesh.userData.mapleWindBoundAdded)
        mesh.boundingSphere.radius = Math.max(
          0,
          mesh.boundingSphere.radius - mesh.userData.mapleWindBoundAdded,
        );
      delete mesh.userData.mapleWindBoundAdded;
      bindings.delete(mesh);
      binding.shared.users.delete(mesh);
      if (binding.shared.users.size === 0)
        for (const material of binding.shared.materials) {
          material.dispose();
          ownedMaterials.delete(material);
        }
      return true;
    },
    setStrength(value = null) {
      if (value !== null && (!Number.isFinite(value) || value < 0 || value > 3))
        throw new RangeError('Wind strength must be null or 0–3.');
      strengthOverride = value;
      if (value !== null) strength.value = value;
    },
    update(dt, context = {}) {
      if (!Number.isFinite(dt) || dt < 0)
        throw new TypeError('Wind dt must be finite and nonnegative.');
      weather = context.weather ?? weather;
      const target =
        strengthOverride ?? (weather === 'rain' ? 1.65 : weather === 'snow' ? 1.1 : 0.7);
      time.value += dt;
      strength.value += (target - strength.value) * (1 - Math.exp(-dt * 0.8));
    },
    getState() {
      return {
        time: time.value,
        strength: strength.value,
        weather,
        speedMps: 1.8 + strength.value * 1.4,
        direction: { ...WIND_DIRECTION },
        gustPeriodSeconds: (2 * Math.PI) / GUST_RATE,
        maxDisplacementMetres: MAX_AMPLITUDE * strength.value * (1 + MAX_FLUTTER),
        sources: bindings.size,
        materials: ownedMaterials.size,
      };
    },
    dispose() {
      for (const mesh of bindings.keys()) api.remove(mesh);
    },
  };
  return api;
}
