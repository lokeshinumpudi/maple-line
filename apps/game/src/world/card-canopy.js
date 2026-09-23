import { QUALITY_TIERS } from '../rendering/quality-tiers.js';

/**
 * Near-camera tree crowns made of many small alpha-tested leaf cards.
 *
 * Each registered crown batch (an InstancedMesh of the cheap crossed clusters) gets a
 * twin InstancedMesh that shares its instance matrices and colours, so no instance data
 * is copied. The choice is made per tree in the vertex shaders: the twin collapses trees
 * beyond the card distance and the cheap batch collapses trees inside it. Each tree
 * switches at a slightly different distance, so there is no visible ring. Shadows still
 * come from the cheap crowns, so the shadow pass does not pay for the cards.
 */
const CARD_KINDS = ['leaf', 'blossom'];

/** GLSL that sets canopyNear to 1 for trees inside the (per-tree jittered) card distance. */
const LOD_GLSL = /* glsl */ `
  float canopyNear = 0.0;
  #ifdef USE_INSTANCING
  {
    vec3 canopyOrigin = (modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
    float canopyJitter = fract(sin(dot(canopyOrigin.xz, vec2(12.9898, 78.233))) * 43758.5453);
    float canopyLimit = canopyCardDistance * (0.86 + 0.28 * canopyJitter);
    canopyNear = step(distance(canopyOrigin.xz, cameraPosition.xz), canopyLimit);
  }
  #endif
`;

export function createCardCanopyGeometry(THREE, { cards = 30, seed = 3301 } = {}) {
  let state = seed;
  const random = () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
  const positions = [],
    normals = [],
    uvs = [],
    indices = [];
  const radial = new THREE.Vector3(),
    facing = new THREE.Vector3(),
    tangent = new THREE.Vector3(),
    bitangent = new THREE.Vector3(),
    blended = new THREE.Vector3(),
    corner = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0);
  for (let i = 0; i < cards; i++) {
    // Cards sit in a thick shell, flatter underneath, like a real crown.
    const u = random() * 2 - 1,
      a = random() * Math.PI * 2;
    const y = u * 0.8 + 0.2 * random();
    const ring = Math.sqrt(Math.max(0, 1 - y * y));
    radial.set(Math.cos(a) * ring, y, Math.sin(a) * ring).normalize();
    const depth = 0.5 + 0.5 * Math.sqrt(random());
    const center = radial
      .clone()
      .multiply(new THREE.Vector3(1, y < 0 ? 0.7 : 0.92, 1))
      .multiplyScalar(depth);
    facing
      .copy(radial)
      .add(new THREE.Vector3(random() - 0.5, random() * 0.6, random() - 0.5).multiplyScalar(1.1))
      .normalize();
    tangent.crossVectors(Math.abs(facing.y) > 0.95 ? new THREE.Vector3(1, 0, 0) : up, facing);
    tangent.normalize();
    bitangent.crossVectors(facing, tangent).normalize();
    const spin = random() * Math.PI * 2;
    const t = tangent
      .clone()
      .multiplyScalar(Math.cos(spin))
      .addScaledVector(bitangent, Math.sin(spin));
    const b = bitangent
      .clone()
      .multiplyScalar(Math.cos(spin))
      .addScaledVector(tangent, -Math.sin(spin));
    const size = 0.36 + random() * 0.26;
    const variant = Math.floor(random() * 4);
    const u0 = (variant % 2) * 0.5,
      v0 = Math.floor(variant / 2) * 0.5;
    const base = positions.length / 3;
    for (const [sx, sy] of [
      [-1, -1],
      [1, -1],
      [1, 1],
      [-1, 1],
    ]) {
      corner
        .copy(center)
        .addScaledVector(t, sx * size)
        .addScaledVector(b, sy * size);
      positions.push(corner.x, corner.y, corner.z);
      // Mostly spherical normals: the crown shades as one soft volume, not as cards.
      blended
        .copy(corner)
        .normalize()
        .multiplyScalar(0.72)
        .addScaledVector(facing, 0.28)
        .normalize();
      normals.push(blended.x, blended.y, blended.z);
      uvs.push(u0 + ((sx + 1) / 2) * 0.5, v0 + ((sy + 1) / 2) * 0.5);
    }
    indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeBoundingSphere();
  return geometry;
}

/**
 * 512 × 512 atlas of four sprigs drawn in code. 'leaf' draws small lobed maple leaves on a
 * twig; 'blossom' draws five-petal flowers with a few young leaves. Grey values are tinted
 * by each tree's instance colour.
 */
export function createSprigTexture(THREE, kind = 'leaf') {
  if (!CARD_KINDS.includes(kind)) throw new TypeError(`Unknown sprig kind: ${kind}`);
  const size = 512,
    cell = 256;
  const data = new Uint8Array(size * size * 4);
  // Bleed a leaf-like grey into transparent texels so mipmaps do not darken edges.
  for (let i = 0; i < data.length; i += 4) {
    data[i] = data[i + 1] = data[i + 2] = kind === 'blossom' ? 236 : 205;
    data[i + 3] = 0;
  }
  let seed = kind === 'blossom' ? 7741 : 4123;
  const random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  const plot = (x, y, grey, alpha, g = grey, b = grey) => {
    const px = Math.round(x),
      py = Math.round(y);
    if (px < 0 || py < 0 || px >= size || py >= size) return;
    const i = (py * size + px) * 4;
    if (alpha < data[i + 3] * 0.6) return;
    data[i] = grey;
    data[i + 1] = g;
    data[i + 2] = b;
    data[i + 3] = Math.max(data[i + 3], alpha);
  };
  // Shape test in a leaf's own frame. Returns 0..1 inside, <0 outside.
  const lobed = (u, v, lobes) => {
    const angle = Math.atan2(v, u),
      r = Math.hypot(u, v);
    const edge = lobes ? 0.62 + 0.38 * Math.abs(Math.cos((angle * lobes) / 2)) ** 0.7 : 1;
    return 1 - r / edge;
  };
  function leaf(cx, cy, length, angle, grey, lobes, bounds) {
    const cs = Math.cos(angle),
      sn = Math.sin(angle);
    const reach = Math.ceil(length);
    for (let y = -reach; y <= reach; y++)
      for (let x = -reach; x <= reach; x++) {
        const px = cx + x,
          py = cy + y;
        if (px < bounds[0] + 2 || py < bounds[1] + 2 || px > bounds[2] - 2 || py > bounds[3] - 2)
          continue;
        const u = (x * cs + y * sn) / length,
          v = (-x * sn + y * cs) / length;
        const inside = lobes ? lobed(u, v, lobes) : 1 - Math.hypot(u * 0.9, v * 1.8);
        if (inside <= 0) continue;
        const vein =
          Math.abs(v) < 0.05 || (lobes && Math.abs(Math.sin(Math.atan2(v, u) * lobes)) < 0.08);
        const shade = grey * (0.9 + 0.1 * (1 - Math.hypot(u, v))) - (vein ? 10 : 0);
        plot(px, py, Math.max(0, Math.min(255, shade)), Math.round(255 * Math.min(1, inside * 6)));
      }
  }
  function blossom(cx, cy, radius, bounds) {
    const turn = random() * Math.PI;
    const reach = Math.ceil(radius * 1.1);
    for (let y = -reach; y <= reach; y++)
      for (let x = -reach; x <= reach; x++) {
        const px = cx + x,
          py = cy + y;
        if (px < bounds[0] + 2 || py < bounds[1] + 2 || px > bounds[2] - 2 || py > bounds[3] - 2)
          continue;
        const r = Math.hypot(x, y) / radius,
          angle = Math.atan2(y, x) + turn;
        // Five notched petals.
        const petal = 0.55 + 0.45 * Math.abs(Math.cos((angle * 5) / 2)) ** 0.5;
        const notch = 1 - 0.18 * Math.max(0, Math.cos(angle * 5)) ** 12;
        const inside = 1 - r / (petal * notch);
        if (inside <= 0) continue;
        const centre = r < 0.22;
        const grey = centre ? 190 : 238 + Math.round(random() * 14);
        plot(
          px,
          py,
          grey,
          Math.round(255 * Math.min(1, inside * 5)),
          centre ? 150 : grey - 10,
          centre ? 160 : grey - 4,
        );
      }
  }
  for (let variant = 0; variant < 4; variant++) {
    const ox = (variant % 2) * cell,
      oy = Math.floor(variant / 2) * cell;
    const bounds = [ox, oy, ox + cell - 1, oy + cell - 1];
    // Twig across the cell.
    const angle = -0.6 + random() * 1.2 + Math.PI * 0.25;
    const tx = Math.cos(angle),
      ty = Math.sin(angle);
    for (let s = -95; s <= 95; s += 0.5)
      for (let w = -1.5; w <= 1.5; w += 0.5)
        plot(ox + 128 + tx * s - ty * w, oy + 128 + ty * s + tx * w, 96, 255, 84, 70);
    const count = kind === 'blossom' ? 16 : 13;
    for (let i = 0; i < count; i++) {
      const along = (random() * 2 - 1) * 90;
      const side = random() < 0.5 ? -1 : 1;
      const offset = side * (6 + random() * 34);
      const cx = ox + 128 + tx * along - ty * offset,
        cy = oy + 128 + ty * along + tx * offset;
      if (kind === 'blossom' && random() < 0.8) blossom(cx, cy, 13 + random() * 9, bounds);
      else
        leaf(
          cx,
          cy,
          kind === 'blossom' ? 13 + random() * 6 : 20 + random() * 14,
          angle + side * (0.7 + random() * 0.8),
          kind === 'blossom' ? 170 : 205 + Math.round(random() * 50),
          kind === 'blossom' ? 0 : 5,
          bounds,
        );
    }
  }
  const texture = new THREE.DataTexture(data, size, size);
  texture.name = `Generated ${kind} sprig atlas`;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.anisotropy = 4;
  texture.needsUpdate = true;
  return texture;
}

/** Leaf-card material: alpha-tested, two-sided, lit through from behind by the sun. */
export function createCardCanopyMaterial(
  THREE,
  texture,
  { wetness, snowCoverage, cardDistance } = {},
) {
  const material = new THREE.MeshStandardMaterial({
    name: 'Card canopy leaves',
    color: '#ffffff',
    map: texture,
    alphaTest: 0.5,
    side: THREE.DoubleSide,
    roughness: 0.78,
  });
  const wet = wetness ?? { value: 0 };
  const snow = snowCoverage ?? { value: 0 };
  const distanceUniform = cardDistance ?? { value: 200 };
  material.onBeforeCompile = (shader) => {
    shader.uniforms.canopyWetness = wet;
    shader.uniforms.canopySnow = snow;
    shader.uniforms.canopyCardDistance = distanceUniform;
    shader.vertexShader =
      'uniform float canopyCardDistance; varying float vCanopyUp;\n' +
      shader.vertexShader
        .replace(
          '#include <beginnormal_vertex>',
          '#include <beginnormal_vertex>\nvCanopyUp = normal.y;',
        )
        .replace(
          '#include <project_vertex>',
          `${LOD_GLSL}
          // Far trees keep their cheap crowns: collapse the cards to a point.
          transformed *= canopyNear;
          #include <project_vertex>`,
        );
    shader.fragmentShader =
      'uniform float canopyWetness; uniform float canopySnow; varying float vCanopyUp;\n' +
      shader.fragmentShader
        .replace(
          '#include <color_fragment>',
          `#include <color_fragment>
          // Rain darkens leaves a little and makes them glossier; snow settles on top.
          diffuseColor.rgb *= 1.0 - canopyWetness * 0.18;
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.83, 0.9, 0.92), canopySnow * smoothstep(-0.1, 0.55, vCanopyUp));`,
        )
        .replace(
          '#include <roughnessmap_fragment>',
          `#include <roughnessmap_fragment>
          roughnessFactor = mix(roughnessFactor, 0.42, canopyWetness * 0.7);`,
        )
        .replace(
          '#include <lights_fragment_end>',
          `#include <lights_fragment_end>
          #if NUM_DIR_LIGHTS > 0
          {
            // Thin leaves glow when the sun is behind them, as in a backlit grove.
            vec3 toCamera = normalize(vViewPosition);
            float behind = pow(clamp(dot(-toCamera, directionalLights[0].direction), 0.0, 1.0), 3.0);
            reflectedLight.directDiffuse += diffuseColor.rgb * directionalLights[0].color * behind * 0.42;
          }
          #endif`,
        );
  };
  material.customProgramCacheKey = () => 'maple-card-canopy-v2';
  return material;
}

/**
 * Chain onto a cheap crown material so it hides the trees that draw cards. Only the
 * visible material changes; the batch's shadow material keeps every crown.
 */
export function hideNearCrowns(material, cardDistance) {
  const previous = material.onBeforeCompile;
  const previousKey = material.customProgramCacheKey();
  material.onBeforeCompile = function (shader, renderer) {
    previous.call(this, shader, renderer);
    shader.uniforms.canopyCardDistance = cardDistance;
    shader.vertexShader =
      'uniform float canopyCardDistance;\n' +
      shader.vertexShader.replace(
        '#include <project_vertex>',
        `${LOD_GLSL}
        transformed *= 1.0 - canopyNear;
        #include <project_vertex>`,
      );
  };
  material.customProgramCacheKey = () => `${previousKey}|maple-canopy-lod-v1`;
  material.needsUpdate = true;
  return material;
}

export function createCardCanopy({ THREE, tier = 'high', wetness, snowCoverage } = {}) {
  const geometry = createCardCanopyGeometry(THREE);
  const cardDistance = { value: QUALITY_TIERS[tier]?.canopyCardDistance ?? 0 };
  const textures = {
    leaf: createSprigTexture(THREE, 'leaf'),
    blossom: createSprigTexture(THREE, 'blossom'),
  };
  const options = { wetness, snowCoverage, cardDistance };
  const materials = {
    leaf: createCardCanopyMaterial(THREE, textures.leaf, options),
    blossom: createCardCanopyMaterial(THREE, textures.blossom, options),
  };
  const pairs = [];
  const patched = new WeakSet();
  // One wind-bound twin per wind field and kind; later twins share its shaders.
  const windTemplates = new Map();
  const centre = new THREE.Vector3();
  let activeTier = tier;
  let batchesDrawn = 0;
  return {
    geometry,
    materials,
    cardDistance,
    /**
     * Add a twin for a cheap crown batch. wind (optional) is the wind field that sways
     * the batch, so cards and cheap crowns move together. The batch's own material is
     * patched once so it hides the trees that now draw cards.
     */
    register(clusters, { kind = 'leaf', wind = null } = {}) {
      if (!clusters?.isInstancedMesh) throw new TypeError('Card canopies need an InstancedMesh.');
      if (!CARD_KINDS.includes(kind)) throw new TypeError(`Unknown canopy kind: ${kind}`);
      if (!patched.has(clusters.material)) {
        hideNearCrowns(clusters.material, cardDistance);
        patched.add(clusters.material);
      }
      const cards = new THREE.InstancedMesh(geometry, materials[kind], 1);
      // Share the instance buffers; the batch owns them.
      cards.instanceMatrix = clusters.instanceMatrix;
      if (clusters.instanceColor) cards.instanceColor = clusters.instanceColor;
      cards.count = clusters.count;
      cards.name = `${clusters.name || 'Tree crowns'} / leaf cards`;
      cards.castShadow = false;
      cards.receiveShadow = true;
      cards.visible = false;
      cards.position.copy(clusters.position);
      cards.quaternion.copy(clusters.quaternion);
      cards.scale.copy(clusters.scale);
      cards.updateMatrix();
      clusters.computeBoundingSphere?.();
      cards.boundingSphere = clusters.boundingSphere?.clone() ?? null;
      if (wind) {
        const template = windTemplates.get(wind)?.[kind];
        if (template) wind.copyToChunk(template, cards);
        else {
          wind.apply(cards, { amplitude: 0.48, flutter: 0.07 });
          windTemplates.set(wind, { ...windTemplates.get(wind), [kind]: cards });
        }
      }
      clusters.parent?.add(cards);
      pairs.push({ clusters, cards, wind });
      return cards;
    },
    unregister(clusters) {
      const index = pairs.findIndex((pair) => pair.clusters === clusters);
      if (index < 0) return false;
      const [pair] = pairs.splice(index, 1);
      pair.cards.removeFromParent();
      const templates = pair.wind && windTemplates.get(pair.wind);
      if (templates)
        for (const [key, value] of Object.entries(templates))
          if (value === pair.cards) delete templates[key];
      pair.wind?.remove(pair.cards);
      return true;
    },
    setTier(value) {
      activeTier = value;
      cardDistance.value = QUALITY_TIERS[value]?.canopyCardDistance ?? 0;
    },
    /** Draw a twin only while its batch is visible and could hold a near tree. */
    update(cameraPosition) {
      batchesDrawn = 0;
      const reach = cardDistance.value * 1.15;
      for (const { clusters, cards } of pairs) {
        let shown = false;
        if (reach > 0 && clusters.visible && clusters.boundingSphere) {
          centre.copy(clusters.boundingSphere.center).applyMatrix4(clusters.matrixWorld);
          shown =
            Math.hypot(centre.x - cameraPosition.x, centre.z - cameraPosition.z) -
              clusters.boundingSphere.radius <
            reach;
        }
        for (let parent = clusters.parent; shown && parent; parent = parent.parent)
          if (!parent.visible) shown = false;
        cards.visible = shown;
        cards.count = clusters.count;
        if (shown) batchesDrawn++;
      }
    },
    getState: () => ({
      tier: activeTier,
      cardDistanceMetres: cardDistance.value,
      batches: pairs.length,
      batchesWithCards: batchesDrawn,
      cardsPerCrown: geometry.index.count / 6,
    }),
    dispose() {
      for (const pair of pairs.slice()) this.unregister(pair.clusters);
      geometry.dispose();
      for (const texture of Object.values(textures)) texture.dispose();
      for (const material of Object.values(materials)) material.dispose();
    },
  };
}
