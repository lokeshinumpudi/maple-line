/**
 * Shared water surface pieces: a tileable wave normal map generated in code, GLSL for
 * rain rings and glints, and a patch that gives the regional lakes and rivers the same
 * surface with the cached sky environment as their (far) reflection.
 */

/** Uniforms every water surface reads. Updated once per frame by updateWaterSurface. */
export const WATER_UNIFORMS = {
  waterTime: { value: 0 },
  waterRain: { value: 0 },
};

let normalTexture = null;

/**
 * 256 × 256 normals from a sum of directional waves with integer wave numbers, so the
 * texture tiles exactly. Alpha holds the height, used to break up foam.
 */
export function createWaterNormalTexture(THREE, size = 256) {
  if (normalTexture) return normalTexture;
  let seed = 51977;
  const random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  const waves = [];
  for (let i = 0; i < 44; i++) {
    // A loose swell direction with spread; shorter waves are smaller.
    const angle = -0.4 + (random() - 0.5) * 2.6 + (i % 5 === 0 ? Math.PI * 0.5 : 0);
    const magnitude = 1 + Math.floor(random() ** 1.6 * 14);
    const kx = Math.round(Math.cos(angle) * magnitude),
      ky = Math.round(Math.sin(angle) * magnitude);
    if (!kx && !ky) continue;
    const k = Math.hypot(kx, ky);
    waves.push({ kx, ky, amplitude: 1 / k ** 1.35, phase: random() * Math.PI * 2 });
  }
  const heights = new Float32Array(size * size),
    dx = new Float32Array(size * size),
    dy = new Float32Array(size * size);
  let min = Infinity,
    max = -Infinity,
    slope = 0;
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      let h = 0,
        gx = 0,
        gy = 0;
      for (const w of waves) {
        const a = ((w.kx * x + w.ky * y) / size) * Math.PI * 2 + w.phase;
        // Slightly sharpened crests read as water rather than sine ripples.
        const s = Math.sin(a),
          c = Math.cos(a);
        h += w.amplitude * (s - 0.18 * c * c);
        const d = w.amplitude * (c + 0.36 * c * s) * Math.PI * 2;
        gx += d * w.kx;
        gy += d * w.ky;
      }
      const i = y * size + x;
      heights[i] = h;
      dx[i] = gx;
      dy[i] = gy;
      min = Math.min(min, h);
      max = Math.max(max, h);
      slope = Math.max(slope, Math.abs(gx), Math.abs(gy));
    }
  const data = new Uint8Array(size * size * 4);
  const strength = 1.6 / slope;
  for (let i = 0; i < size * size; i++) {
    const nx = -dx[i] * strength,
      ny = -dy[i] * strength,
      length = Math.hypot(nx, ny, 1);
    data[i * 4] = Math.round((nx / length) * 127.5 + 127.5);
    data[i * 4 + 1] = Math.round((ny / length) * 127.5 + 127.5);
    data[i * 4 + 2] = Math.round((1 / length) * 127.5 + 127.5);
    data[i * 4 + 3] = Math.round(((heights[i] - min) / (max - min)) * 255);
  }
  const texture = new THREE.DataTexture(data, size, size);
  texture.name = 'Generated water wave normals';
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.anisotropy = 4;
  texture.needsUpdate = true;
  normalTexture = texture;
  return texture;
}

/**
 * GLSL helpers. rainRipples returns a world xz slope from expanding impact rings in two
 * offset cell grids; each ring stays inside its cell so only one cell is read per grid.
 */
export const WATER_GLSL = /* glsl */ `
vec2 waterHash22(vec2 p) {
  vec3 q = fract(vec3(p.xyx) * vec3(.1031, .1030, .0973));
  q += dot(q, q.yzx + 33.33);
  return fract((q.xx + q.yz) * q.zy);
}
vec2 rainRipples(vec2 p, float t) {
  vec2 slope = vec2(0.0);
  for (int layer = 0; layer < 2; layer++) {
    float fl = float(layer);
    vec2 q = p * (1.0 - fl * 0.23) + fl * vec2(7.31, 3.17);
    vec2 cell = floor(q);
    vec2 h = waterHash22(cell + fl * 17.0);
    vec2 centre = cell + 0.3 + 0.4 * h;
    float period = 0.75 + h.x * 0.55;
    float phase = fract(t / period + h.y);
    float radius = phase * 0.3;
    vec2 d = q - centre;
    float dist = length(d);
    float band = 1.0 - smoothstep(0.0, 0.07, abs(dist - radius));
    float wave = sin((dist - radius) * 58.0) * band * (1.0 - phase) * (1.0 - phase);
    slope += d / max(dist, 0.001) * wave;
  }
  return slope;
}
`;

export function updateWaterSurface(dt, { rain = 0 } = {}) {
  WATER_UNIFORMS.waterTime.value += Math.max(0, dt);
  if (WATER_UNIFORMS.waterTime.value > 3600) WATER_UNIFORMS.waterTime.value -= 3600;
  WATER_UNIFORMS.waterRain.value = rain;
}

/**
 * Patch a MeshStandardMaterial water surface (lakes, ravine river, harbour inlet):
 * moving generated wave normals, rain rings near the camera, a stronger grazing
 * reflection of the scene environment and a tighter sun glint. No extra passes.
 */
export function applyWaterSurface(THREE, material, { scale = 1, flow = [0.03, 0.02] } = {}) {
  const texture = createWaterNormalTexture(THREE);
  const previous = material.onBeforeCompile;
  const previousKey = material.customProgramCacheKey();
  material.roughness = Math.min(material.roughness, 0.12);
  material.metalness = 0;
  material.envMapIntensity = 1.6;
  material.onBeforeCompile = function (shader, renderer) {
    previous.call(this, shader, renderer);
    Object.assign(shader.uniforms, WATER_UNIFORMS, {
      waterNormals: { value: texture },
      waterScale: { value: scale },
      waterFlow: { value: new THREE.Vector2(...flow) },
    });
    shader.vertexShader =
      'varying vec3 vWaterWorld;\n' +
      shader.vertexShader.replace(
        '#include <worldpos_vertex>',
        `#include <worldpos_vertex>
        vec4 waterWorld = vec4(transformed, 1.0);
        #ifdef USE_INSTANCING
          waterWorld = instanceMatrix * waterWorld;
        #endif
        vWaterWorld = (modelMatrix * waterWorld).xyz;`,
      );
    shader.fragmentShader =
      `uniform sampler2D waterNormals; uniform float waterTime; uniform float waterRain;
      uniform float waterScale; uniform vec2 waterFlow; varying vec3 vWaterWorld;
      ${WATER_GLSL}\n` +
      shader.fragmentShader.replace(
        '#include <normal_fragment_maps>',
        `#include <normal_fragment_maps>
        {
          vec2 wp = vWaterWorld.xz * waterScale;
          float waterDistance = length(cameraPosition - vWaterWorld);
          vec3 a = texture2D(waterNormals, wp / 11.0 + waterFlow * waterTime).xyz * 2.0 - 1.0;
          vec3 b = texture2D(waterNormals, wp / 4.3 - waterFlow.yx * waterTime * 1.7).xyz * 2.0 - 1.0;
          float near = 1.0 - smoothstep(25.0, 110.0, waterDistance);
          vec2 slope = a.xy * 0.22 + b.xy * 0.16 * near;
          slope += rainRipples(vWaterWorld.xz * 1.7, waterTime) * waterRain * 0.55
            * (1.0 - smoothstep(10.0, 38.0, waterDistance));
          // The surface is level: perturb in world space, then express it in view space.
          vec3 worldNormal = normalize(vec3(slope.x, 1.0, slope.y));
          normal = normalize((viewMatrix * vec4(worldNormal, 0.0)).xyz);
        }`,
      );
    // Grazing views see more of the sky, as the real Fresnel term says they should.
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <lights_fragment_end>',
      `#include <lights_fragment_end>
      {
        float facing = clamp(dot(normal, normalize(vViewPosition)), 0.0, 1.0);
        float grazing = pow(1.0 - facing, 4.0);
        reflectedLight.indirectSpecular *= 1.0 + grazing * 2.5;
        reflectedLight.indirectDiffuse *= 1.0 - grazing * 0.55;
        reflectedLight.directDiffuse *= 1.0 - grazing * 0.55;
      }`,
    );
  };
  material.customProgramCacheKey = () => `${previousKey}|maple-water-surface-v1`;
  material.needsUpdate = true;
  return material;
}
