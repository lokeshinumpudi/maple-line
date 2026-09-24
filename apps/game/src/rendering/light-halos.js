/**
 * Soft glow halos around lamps, lanterns and signal lights at night.
 *
 * Lamps are found, not listed: every few seconds the scene is scanned for small meshes
 * whose emissive light is bright, and one halo point is placed on each (instanced lamps
 * give one halo per instance). All halos draw in one additive Points batch with fog, so
 * they also show without the film pipeline and soften in rain.
 */
const MAX_HALOS = 320;
const SCAN_INTERVAL = 2.5;

/** Emissive strength of a material in linear units, or 0 when it does not glow. */
export function emissiveStrength(material) {
  if (!material?.emissive || !(material.emissiveIntensity > 0)) return 0;
  const { r, g, b } = material.emissive;
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) * material.emissiveIntensity;
}

/**
 * How much of a halo a person hides, 0..1: the camera-to-lamp sightline tested against each
 * person's upright capsule, widened by the halo's own size where the line passes them, so a
 * glow that would wrap a head fades as well as one right behind it.
 */
export function haloHiddenBy(people, camera, lamp, haloRadius = 1) {
  const dx = lamp.x - camera.x,
    dy = lamp.y - camera.y,
    dz = lamp.z - camera.z;
  const flat = dx * dx + dz * dz;
  if (flat < 1e-6) return 0;
  let hidden = 0;
  for (const person of people) {
    const u = ((person.x - camera.x) * dx + (person.z - camera.z) * dz) / flat;
    if (u <= 0.02 || u >= 0.98) continue;
    const across = Math.hypot(camera.x + dx * u - person.x, camera.z + dz * u - person.z);
    const height = camera.y + dy * u;
    const margin = haloRadius * u + 0.12;
    const side = 1 - smooth(0.26, 0.26 + margin, across);
    const above = 1 - smooth(person.top, person.top + margin, height);
    const below = smooth(person.bottom - 0.1, person.bottom + 0.2, height);
    hidden = Math.max(hidden, side * above * below);
  }
  return hidden;
}
function smooth(edge0, edge1, x) {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

export function createLightHalos({ THREE, scene, layer = 0, radius = 420 }) {
  const positions = new Float32Array(MAX_HALOS * 3);
  const colors = new Float32Array(MAX_HALOS * 3);
  const sizes = new Float32Array(MAX_HALOS);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geometry.setAttribute('haloSize', new THREE.BufferAttribute(sizes, 1));
  geometry.setDrawRange(0, 0);
  const material = new THREE.ShaderMaterial({
    name: 'Night lamp halos',
    uniforms: THREE.UniformsUtils.merge([
      THREE.UniformsLib.fog,
      { haloStrength: { value: 0 }, haloScale: { value: 1 }, pixelHeight: { value: 900 } },
    ]),
    fog: true,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    vertexShader: /* glsl */ `
      attribute vec3 color;
      attribute float haloSize;
      uniform float haloScale;
      uniform float pixelHeight;
      varying vec3 vColor;
      #include <fog_pars_vertex>
      void main() {
        vColor = color;
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * mvPosition;
        // World-size halo projected to pixels, clamped so far lamps stay small points.
        float pixels = haloSize * haloScale * projectionMatrix[1][1] * pixelHeight * 0.5 / max(-mvPosition.z, 0.5);
        // Capped so a lamp near the lens never becomes a disc over the frame.
        gl_PointSize = clamp(pixels, 2.0, pixelHeight * 0.07);
        #include <fog_vertex>
      }`,
    fragmentShader: /* glsl */ `
      uniform float haloStrength;
      varying vec3 vColor;
      #include <fog_pars_fragment>
      void main() {
        float r = length(gl_PointCoord - 0.5) * 2.0;
        if (r > 1.0) discard;
        // A bright core with a long soft tail, like light scattered in damp air.
        float glow = exp(-r * r * 9.0) * 0.9 + exp(-r * 3.2) * 0.25;
        glow *= 1.0 - smoothstep(0.75, 1.0, r);
        vec3 light = vColor * glow * haloStrength;
        // Additive blending: fog dims the glow instead of mixing in the fog colour.
        #if defined( USE_FOG ) && defined( FOG_EXP2 )
          light *= exp(-fogDensity * fogDensity * vFogDepth * vFogDepth * 0.7);
        #endif
        gl_FragColor = vec4(light, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const points = new THREE.Points(geometry, material);
  points.name = 'Night lamp halos';
  points.frustumCulled = false;
  points.visible = false;
  points.renderOrder = 6;
  if (layer) points.layers.set(layer);
  scene.add(points);
  let sinceScan = SCAN_INTERVAL,
    scale = 1,
    count = 0,
    strength = 0;
  // Each halo remembers its lamp, so moving lamps (the train, crossing cars) are followed
  // every frame and lamps that switch off or blink take their halo with them.
  const sources = [];
  const world = new THREE.Vector3(),
    instance = new THREE.Matrix4(),
    matrix = new THREE.Matrix4(),
    sphere = new THREE.Sphere();

  function scan(cameraPosition) {
    sources.length = 0;
    scene.traverseVisible((object) => {
      if (sources.length >= MAX_HALOS || object === points || !object.isMesh) return;
      if (object.userData.noHalo) return;
      const materialValue = Array.isArray(object.material) ? object.material[0] : object.material;
      if (emissiveStrength(materialValue) < 0.35) return;
      const geometryValue = object.geometry;
      if (!geometryValue.boundingSphere) geometryValue.computeBoundingSphere();
      sphere.copy(geometryValue.boundingSphere);
      const add = (m, index) => {
        // Lamps are small; lit windows and signboards are left to the bloom pass.
        if (sphere.radius * m.getMaxScaleOnAxis() > 1.3 || sources.length >= MAX_HALOS) return;
        world.copy(sphere.center).applyMatrix4(m);
        if (world.distanceTo(cameraPosition) > radius) return;
        sources.push({ object, index, material: materialValue, centre: sphere.center.clone() });
      };
      if (object.isInstancedMesh) {
        for (let i = 0; i < object.count && sources.length < MAX_HALOS; i++) {
          object.getMatrixAt(i, instance);
          add(matrix.multiplyMatrices(object.matrixWorld, instance), i);
        }
      } else add(object.matrixWorld, -1);
    });
  }
  function place(cameraPosition, people, step) {
    count = 0;
    for (const source of sources) {
      const glow = emissiveStrength(source.material);
      if (glow < 0.2 || !source.object.parent) continue;
      if (source.index >= 0) {
        source.object.getMatrixAt(source.index, instance);
        matrix.multiplyMatrices(source.object.matrixWorld, instance);
      } else matrix.copy(source.object.matrixWorld);
      world.copy(source.centre).applyMatrix4(matrix);
      positions[count * 3] = world.x;
      positions[count * 3 + 1] = world.y;
      positions[count * 3 + 2] = world.z;
      const size = 1.1 + Math.min(1.6, glow) * 0.9;
      // A lamp close to the lens or behind someone keeps its light but loses the halo.
      const distance = world.distanceTo(cameraPosition);
      const near = Math.min(1, Math.max(0, (distance - 2.5) / 8));
      const hidden = people?.length
        ? haloHiddenBy(people, cameraPosition, world, (size * scale) / 2)
        : 0;
      source.hidden = (source.hidden ?? hidden) + (hidden - (source.hidden ?? hidden)) * step;
      const shown = near * (1 - source.hidden);
      if (shown < 0.02) continue;
      const c = source.material.emissive,
        level = Math.min(1.4, glow * 1.2) * shown;
      colors[count * 3] = c.r * level;
      colors[count * 3 + 1] = c.g * level;
      colors[count * 3 + 2] = c.b * level;
      sizes[count] = size * (0.4 + 0.6 * shown);
      count++;
    }
    geometry.setDrawRange(0, count);
    geometry.attributes.position.needsUpdate = true;
    geometry.attributes.color.needsUpdate = true;
    geometry.attributes.haloSize.needsUpdate = true;
  }

  return {
    points,
    /** night 0..1 (dusk), wet 0..1 (rain/fog makes halos wider), pixelHeight of the canvas. */
    /** people: upright capsules { x, z, bottom, top } of the characters near the camera. */
    update(dt, { cameraPosition, night = 0, wet = 0, pixelHeight = 900, people = null } = {}) {
      const step = Math.max(0, dt);
      scale = 1 + wet * 0.8;
      strength += (night - strength) * (1 - Math.exp(-step * 1.5));
      points.visible = strength > 0.02;
      material.uniforms.haloStrength.value = strength * (0.55 + wet * 0.3);
      material.uniforms.haloScale.value = scale;
      material.uniforms.pixelHeight.value = pixelHeight;
      if (!points.visible) {
        sinceScan = SCAN_INTERVAL;
        return;
      }
      sinceScan += Math.max(step, 1 / 60);
      if (sinceScan >= SCAN_INTERVAL && cameraPosition) {
        sinceScan = 0;
        scan(cameraPosition);
      }
      if (cameraPosition) place(cameraPosition, people, 1 - Math.exp(-Math.max(step, 1 / 60) * 12));
    },
    getState: () => ({ halos: count, strength, visible: points.visible }),
    dispose() {
      scene.remove(points);
      geometry.dispose();
      material.dispose();
    },
  };
}
