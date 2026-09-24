/**
 * Local lamp light: a few real lights near the camera, and cheap light pools and wet
 * reflections for every lamp.
 *
 * Lamps register as sources (a street lamp, a kiosk, bus headlights). Each frame the
 * sources closest to the camera, weighted by brightness, borrow one of a small, fixed set of
 * real point and spot lights. A light fades out before it moves to another lamp and fades
 * in after, so nothing pops, and the light count never changes (no shader recompiles
 * except when the graphics tier changes). Every source also gets a soft light pool on the
 * ground and, when the ground is wet, a streak of reflected light toward the camera; those
 * two are single instanced draws.
 */
export const LIGHT_POOL_TIERS = Object.freeze({
  low: Object.freeze({ points: 1, spots: 0 }),
  medium: Object.freeze({ points: 3, spots: 1 }),
  high: Object.freeze({ points: 4, spots: 2 }),
});
const REACH = 70; // metres: sources further than this never borrow a real light
const DECAL_REACH = 160;
const FADE_RATE = 5; // per second: a light takes about half a second to fade
const KEEP_BONUS = 1.35; // a lamp already lit keeps its light unless another is clearly better

/** How much a source deserves a real light: brightness over distance, 0 when off or far. */
export function sourceScore(source, cameraPosition) {
  if (!(source.level > 0.01)) return 0;
  const dx = source.position.x - cameraPosition.x,
    dy = source.position.y - cameraPosition.y,
    dz = source.position.z - cameraPosition.z;
  const d2 = dx * dx + dy * dy + dz * dz;
  if (d2 > REACH * REACH) return 0;
  // priority lets a lamp that lights faces (a bus shelter, a bus cabin) win its light.
  return ((source.priority ?? 1) * source.level * source.intensity) / (1 + d2 / 64);
}

/**
 * Which sources should hold the given number of lights. holders are the ids lit now; they
 * get a bonus so two similar lamps do not trade the light back and forth.
 */
export function chooseSources(sources, cameraPosition, count, holders = new Set()) {
  return sources
    .map((source) => ({
      id: source.id,
      score: sourceScore(source, cameraPosition) * (holders.has(source.id) ? KEEP_BONUS : 1),
    }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score || (a.id < b.id ? -1 : 1))
    .slice(0, count)
    .map((entry) => entry.id);
}

/**
 * One kind of light (point or spot): fixed slots, each fading between lamps.
 * Pure bookkeeping; returns per-slot { id, weight } for the caller to apply.
 */
export function createSlotBank(count) {
  const slots = Array.from({ length: count }, () => ({ id: null, weight: 0 }));
  return {
    slots,
    update(dt, wanted) {
      const step = 1 - Math.exp(-Math.max(0, dt) * FADE_RATE);
      const want = new Set(wanted);
      for (const slot of slots) {
        if (slot.id === null) continue;
        const target = want.has(slot.id) ? 1 : 0;
        slot.weight += (target - slot.weight) * step;
        if (target === 0 && slot.weight < 0.01) {
          slot.id = null;
          slot.weight = 0;
        }
      }
      const held = new Set(slots.map((slot) => slot.id));
      for (const id of wanted) {
        if (held.has(id)) continue;
        const free = slots.find((slot) => slot.id === null);
        if (!free) break;
        free.id = id;
        free.weight = step;
        held.add(id);
      }
      return slots;
    },
  };
}

const decalVertex = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vTint;
  #include <fog_pars_vertex>
  void main() {
    vUv = uv;
    vTint = instanceColor;
    vec4 mvPosition = modelViewMatrix * instanceMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mvPosition;
    #include <fog_vertex>
  }`;
const decalFragment = /* glsl */ `
  uniform float poolTime;
  uniform float poolStreak;
  varying vec2 vUv;
  varying vec3 vTint;
  #include <fog_pars_fragment>
  void main() {
    vec2 p = vUv * 2.0 - 1.0;
    float glow;
    if (poolStreak > 0.5) {
      // A broken column of reflected light, brightest at the lamp and rippled by rain.
      // uv.y is 1 at the lamp end of the strip.
      float along = 1.0 - vUv.y;
      float across = p.x;
      float ripple = 0.65 + 0.35 * sin(along * 46.0 - poolTime * 5.0 + sin(along * 13.0 + poolTime) * 2.0);
      glow = pow(clamp(1.0 - along, 0.0, 1.0), 1.6) * exp(-across * across * 7.0) * ripple;
    } else {
      float r = length(p);
      glow = pow(max(1.0 - r, 0.0), 2.2) * 0.8 + exp(-r * r * 12.0) * 0.35;
    }
    vec3 light = vTint * glow;
    #if defined( USE_FOG ) && defined( FOG_EXP2 )
      light *= exp(-fogDensity * fogDensity * vFogDepth * vFogDepth * 0.8);
    #endif
    gl_FragColor = vec4(light, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }`;

/** Shared ceiling for direct light on character (MToon) materials, in multiples of their colour. */
export const CHARACTER_LIGHT = { value: 1000 };
const MTOON_COLOUR = 'vec3 col = reflectedLight.directDiffuse + reflectedLight.indirectDiffuse;';

/**
 * Soft-knee cap on the direct light a character material receives. Below the ceiling light
 * passes unchanged; above it the excess is compressed, so a lamp a metre from a face still
 * lights it warmly from its side without burning it flat.
 */
export function capCharacterLight(material) {
  if (!material?.isMToonMaterial || material.userData.mapleLightCap) return false;
  material.userData.mapleLightCap = true;
  const previous = material.onBeforeCompile;
  const previousKey = material.customProgramCacheKey?.() ?? '';
  material.onBeforeCompile = function (shader, renderer) {
    previous?.call(this, shader, renderer);
    if (!shader.fragmentShader.includes(MTOON_COLOUR)) return;
    shader.uniforms.mapleCharacterLight = CHARACTER_LIGHT;
    shader.fragmentShader =
      'uniform float mapleCharacterLight;\n' +
      shader.fragmentShader.replace(
        MTOON_COLOUR,
        `vec3 mapleDirect = reflectedLight.directDiffuse;
        float mapleBase = max(max(diffuseColor.r, diffuseColor.g), max(diffuseColor.b, 0.04));
        float mapleCeiling = mapleCharacterLight * mapleBase;
        float maplePeak = max(max(mapleDirect.r, mapleDirect.g), mapleDirect.b);
        if (maplePeak > mapleCeiling)
          mapleDirect *= (mapleCeiling + (maplePeak - mapleCeiling) * 0.25) / maplePeak;
        vec3 col = mapleDirect + reflectedLight.indirectDiffuse;`,
      );
  };
  material.customProgramCacheKey = () => `${previousKey}|maple-character-light-v1`;
  material.needsUpdate = true;
  return true;
}
function capCharacters(scene) {
  scene.traverse((object) => {
    if (!object.isMesh) return;
    const list = Array.isArray(object.material) ? object.material : [object.material];
    for (const material of list) capCharacterLight(material);
  });
}

export function createLightPool({ THREE, scene, tier = 'high', maxSources = 64 }) {
  const sources = new Map();
  const ordered = [];
  let banks = null;
  let lights = { point: [], spot: [] };
  let activeTier = null;
  const makeBatch = (name, streak) => {
    const geometry = new THREE.PlaneGeometry(1, 1);
    geometry.rotateX(-Math.PI / 2);
    // Streaks start at the lamp (local z = 0) and run toward +z.
    if (streak) geometry.translate(0, 0, 0.5);
    const material = new THREE.ShaderMaterial({
      name,
      uniforms: THREE.UniformsUtils.merge([
        THREE.UniformsLib.fog,
        { poolTime: { value: 0 }, poolStreak: { value: streak ? 1 : 0 } },
      ]),
      vertexShader: decalVertex,
      fragmentShader: decalFragment,
      fog: true,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -4,
    });
    const mesh = new THREE.InstancedMesh(geometry, material, maxSources);
    mesh.name = name;
    mesh.count = 0;
    mesh.frustumCulled = false;
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.setColorAt(0, new THREE.Color(0, 0, 0));
    mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
    mesh.renderOrder = 4;
    scene.add(mesh);
    return mesh;
  };
  let frame = 0;
  const pools = makeBatch('Lamp light pools on the ground', false);
  const streaks = makeBatch('Wet-ground lamp reflections', true);
  const dummy = new THREE.Object3D(),
    tint = new THREE.Color(),
    toCamera = new THREE.Vector3(),
    ground = new THREE.Vector3();

  function build(nextTier) {
    const counts = LIGHT_POOL_TIERS[nextTier] ?? LIGHT_POOL_TIERS.high;
    for (const light of [...lights.point, ...lights.spot]) {
      light.removeFromParent();
      light.target?.removeFromParent();
      light.dispose?.();
    }
    lights = {
      point: Array.from({ length: counts.points }, (_, i) => {
        const light = new THREE.PointLight('#ffd49a', 0, 14, 2);
        light.name = `Lamp light pool / point ${i + 1}`;
        scene.add(light);
        return light;
      }),
      spot: Array.from({ length: counts.spots }, (_, i) => {
        const light = new THREE.SpotLight('#fff1d6', 0, 30, 0.5, 0.6, 1.6);
        light.name = `Lamp light pool / spot ${i + 1}`;
        scene.add(light, light.target);
        return light;
      }),
    };
    banks = { point: createSlotBank(counts.points), spot: createSlotBank(counts.spots) };
    activeTier = nextTier;
  }
  build(tier);

  const api = {
    /**
     * Register a lamp. spec: { kind 'point'|'spot', position, direction (spot), color,
     * intensity, distance, ground (height of the floor under it), pool (radius in metres,
     * 0 for none), streak (reflects on wet ground), priority (default 1; higher wins a real
     * light over brighter lamps) }. Returns a handle to move or dim it.
     */
    add(id, spec) {
      if (sources.has(id)) api.remove(id);
      if (sources.size >= maxSources) throw new RangeError('Too many lamp sources.');
      const source = {
        id,
        kind: spec.kind === 'spot' ? 'spot' : 'point',
        position: new THREE.Vector3().copy(spec.position ?? new THREE.Vector3()),
        direction: new THREE.Vector3().copy(spec.direction ?? new THREE.Vector3(0, -1, 0)),
        color: new THREE.Color(spec.color ?? '#ffd49a'),
        intensity: spec.intensity ?? 10,
        distance: spec.distance ?? 14,
        angle: spec.angle ?? 0.5,
        ground: spec.ground ?? null,
        pool: spec.pool ?? 3,
        streak: spec.streak ?? true,
        level: spec.level ?? 1,
        priority: spec.priority ?? 1,
        // The real light sits a little above the lamp: a lamp is a shade, not a point, and
        // the lift keeps a head right under it from catching a hot spot.
        lift: spec.lift ?? (spec.kind === 'spot' ? 0 : 0.5),
      };
      sources.set(id, source);
      ordered.push(source);
      return {
        source,
        set(patch = {}) {
          if (patch.position) source.position.copy(patch.position);
          if (patch.direction) source.direction.copy(patch.direction).normalize();
          if (patch.color) source.color.set(patch.color);
          for (const key of ['level', 'intensity', 'ground', 'pool'])
            if (patch[key] !== undefined) source[key] = patch[key];
        },
      };
    },
    remove(id) {
      const source = sources.get(id);
      if (!source) return false;
      sources.delete(id);
      ordered.splice(ordered.indexOf(source), 1);
      return true;
    },
    setTier(value) {
      if (value !== activeTier) build(value);
    },
    /** night 0..1 scales everything; wet 0..1 brings out the reflections. */
    update(dt, { cameraPosition, night = 0, wet = 0 } = {}) {
      if (!cameraPosition) return;
      // Characters: at night lamp light on skin is compressed above a ceiling, so a face near
      // a lamp reads lit by it instead of glowing. Daylight is untouched.
      CHARACTER_LIGHT.value = night > 0.02 ? 2.6 + (1 - night) * 20 : 1000;
      if (frame++ % 90 === 0) capCharacters(scene);
      pools.material.uniforms.poolTime.value += Math.max(0, dt);
      streaks.material.uniforms.poolTime.value = pools.material.uniforms.poolTime.value;
      const weights = new Map();
      for (const kind of ['point', 'spot']) {
        const bank = banks[kind];
        const candidates = night > 0.02 ? ordered.filter((source) => source.kind === kind) : [];
        const holders = new Set(bank.slots.map((slot) => slot.id).filter(Boolean));
        const wanted = chooseSources(candidates, cameraPosition, bank.slots.length, holders);
        bank.update(dt, wanted).forEach((slot, i) => {
          const light = lights[kind][i];
          const source = slot.id && sources.get(slot.id);
          if (!source) {
            light.intensity = 0;
            return;
          }
          weights.set(source.id, slot.weight);
          light.position.copy(source.position);
          light.position.y += source.lift;
          light.color.copy(source.color);
          light.distance = source.distance;
          light.intensity = source.intensity * source.level * slot.weight * night;
          if (kind === 'spot') {
            light.angle = source.angle;
            light.target.position.copy(source.position).addScaledVector(source.direction, 10);
            light.target.updateMatrixWorld();
          }
        });
      }
      let poolCount = 0,
        streakCount = 0;
      for (const source of ordered) {
        const strength = source.level * night;
        if (strength < 0.01) continue;
        if (source.position.distanceTo(cameraPosition) > DECAL_REACH) continue;
        const floor = source.ground ?? source.position.y - 3;
        const height = Math.max(0.3, source.position.y - floor);
        // A real light already lights the ground near its lamp; the pool fills the rest.
        const real = weights.get(source.id) ?? 0;
        if (source.pool > 0) {
          ground.set(source.position.x, floor + 0.03, source.position.z);
          let scaleX = source.pool * 2,
            scaleZ = source.pool * 2,
            yaw = 0;
          if (source.kind === 'spot') {
            // Headlight pools land ahead of the lamp and stretch along the beam.
            const flat = Math.hypot(source.direction.x, source.direction.z) || 1;
            ground.x += (source.direction.x / flat) * source.pool * 1.6;
            ground.z += (source.direction.z / flat) * source.pool * 1.6;
            scaleZ *= 1.9;
            yaw = Math.atan2(source.direction.x, source.direction.z);
          }
          dummy.position.copy(ground);
          dummy.rotation.set(0, yaw, 0);
          dummy.scale.set(scaleX, 1, scaleZ);
          dummy.updateMatrix();
          pools.setMatrixAt(poolCount, dummy.matrix);
          const scale = source.kind === 'spot' ? 110 : 14;
          const level = strength * Math.min(1.2, source.intensity / scale) * (0.55 - real * 0.3);
          pools.setColorAt(
            poolCount,
            tint.copy(source.color).multiplyScalar(level * (1 + wet * 0.4)),
          );
          poolCount++;
        }
        if (source.streak && wet > 0.02) {
          // Reflections on wet ground stretch from under the lamp toward the viewer.
          toCamera.set(
            cameraPosition.x - source.position.x,
            0,
            cameraPosition.z - source.position.z,
          );
          const reach = toCamera.length();
          if (reach < 0.5) continue;
          const length = Math.min(reach * 0.8, 2 + height * 3.2) * (0.6 + wet * 0.4);
          dummy.position.set(source.position.x, floor + 0.035, source.position.z);
          dummy.rotation.set(0, Math.atan2(toCamera.x, toCamera.z), 0);
          dummy.scale.set(0.35 + height * 0.08, 1, length);
          dummy.updateMatrix();
          streaks.setMatrixAt(streakCount, dummy.matrix);
          const scale = source.kind === 'spot' ? 90 : 12;
          const level = strength * wet * Math.min(1.3, source.intensity / scale) * 0.5;
          streaks.setColorAt(streakCount, tint.copy(source.color).multiplyScalar(level));
          streakCount++;
        }
      }
      for (const [mesh, count] of [
        [pools, poolCount],
        [streaks, streakCount],
      ]) {
        mesh.count = count;
        mesh.visible = count > 0;
        mesh.instanceMatrix.needsUpdate = true;
        mesh.instanceColor.needsUpdate = true;
      }
    },
    getState() {
      const lit = [];
      for (const kind of ['point', 'spot'])
        for (const slot of banks[kind].slots)
          if (slot.id) lit.push({ kind, id: slot.id, weight: Number(slot.weight.toFixed(2)) });
      return {
        tier: activeTier,
        sources: sources.size,
        realLights: { points: lights.point.length, spots: lights.spot.length },
        lit,
        pools: pools.count,
        reflections: streaks.count,
      };
    },
    dispose() {
      for (const light of [...lights.point, ...lights.spot]) {
        light.removeFromParent();
        light.target?.removeFromParent();
      }
      for (const mesh of [pools, streaks]) {
        mesh.removeFromParent();
        mesh.geometry.dispose();
        mesh.material.dispose();
        mesh.dispose();
      }
      sources.clear();
      ordered.length = 0;
    },
  };
  return api;
}
