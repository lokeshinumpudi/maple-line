/**
 * GPU rain: one instanced draw of camera-facing streaks in a volume that wraps around
 * the camera. The CPU writes a handful of uniforms per frame; positions are computed in
 * the vertex shader from a fixed random seed per drop and the accumulated fall time.
 */
export const RAIN_VOLUME = Object.freeze({ x: 64, y: 38, z: 64 });

export function createRainStreaks({ THREE, count = 4000, layer = 0 }) {
  const quad = new THREE.InstancedBufferGeometry();
  quad.setAttribute(
    'corner',
    new THREE.Float32BufferAttribute([-1, 0, 1, 0, 1, 1, -1, 0, 1, 1, -1, 1], 2),
  );
  // three needs a position attribute to size the draw; the shader ignores it.
  quad.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(18), 3));
  let seed = 90211;
  const random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  const seeds = new Float32Array(count * 4);
  for (let i = 0; i < seeds.length; i++) seeds[i] = random();
  quad.setAttribute('dropSeed', new THREE.InstancedBufferAttribute(seeds, 4));
  quad.instanceCount = count;
  quad.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6);
  const uniforms = {
    rainTime: { value: 0 },
    rainVolume: { value: new THREE.Vector3(RAIN_VOLUME.x, RAIN_VOLUME.y, RAIN_VOLUME.z) },
    rainWind: { value: new THREE.Vector3(2.2, 0, 0.8) },
    rainFall: { value: 11 },
    rainLength: { value: 0.85 },
    rainOpacity: { value: 0 },
    rainColor: { value: new THREE.Color('#c9d6d8') },
    rainFlash: { value: 0 },
  };
  const material = new THREE.ShaderMaterial({
    name: 'Weather · GPU rain streaks',
    uniforms,
    transparent: true,
    depthWrite: false,
    vertexShader: /* glsl */ `
      attribute vec2 corner;
      attribute vec4 dropSeed;
      uniform float rainTime;
      uniform vec3 rainVolume;
      uniform vec3 rainWind;
      uniform float rainFall;
      uniform float rainLength;
      varying float vAlong;
      varying float vAcross;
      varying float vFade;
      void main() {
        float speed = 0.82 + dropSeed.w * 0.36;
        vec3 velocity = vec3(rainWind.x, -rainFall * speed, rainWind.z);
        vec3 p = dropSeed.xyz * rainVolume + velocity * rainTime;
        vec3 rel = mod(p - cameraPosition + rainVolume * 0.5, rainVolume) - rainVolume * 0.5;
        vec3 world = cameraPosition + rel;
        vec3 axis = normalize(velocity);
        vec3 toCamera = cameraPosition - world;
        float distance = length(toCamera);
        vec3 side = normalize(cross(axis, toCamera / max(distance, 0.001)));
        // Keep each streak about a pixel wide at any distance instead of shimmering.
        float width = max(0.006, distance * 0.0011);
        world += axis * (corner.y - 0.5) * rainLength * (0.65 + dropSeed.w * 0.7);
        world += side * corner.x * width;
        vAlong = corner.y;
        vAcross = corner.x;
        vec3 edge = abs(rel) / (rainVolume * 0.5);
        float border = max(edge.x, max(edge.y, edge.z));
        vFade = smoothstep(1.2, 3.5, distance) * (1.0 - smoothstep(0.7, 1.0, border))
          * (0.006 / width + 0.35) ;
        gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      uniform float rainOpacity;
      uniform vec3 rainColor;
      uniform float rainFlash;
      varying float vAlong;
      varying float vAcross;
      varying float vFade;
      void main() {
        float taper = smoothstep(0.0, 0.35, vAlong) * (1.0 - smoothstep(0.7, 1.0, vAlong));
        float core = 1.0 - abs(vAcross);
        float alpha = rainOpacity * taper * core * clamp(vFade, 0.0, 1.0);
        if (alpha < 0.004) discard;
        vec3 color = rainColor * (1.0 + rainFlash * 2.5);
        gl_FragColor = vec4(color, alpha);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const mesh = new THREE.Mesh(quad, material);
  mesh.name = 'Weather · GPU rain streaks';
  mesh.frustumCulled = false;
  mesh.visible = false;
  mesh.renderOrder = 5;
  if (layer) mesh.layers.set(layer);
  return {
    mesh,
    uniforms,
    /** amount 0..1, wind in m/s as {x, z}; flash 0..1 brightens the drops. */
    update(dt, { amount = 0, wind, flash = 0, color, storm = 0, dusk = false } = {}) {
      uniforms.rainTime.value += Math.max(0, dt);
      // Keep the accumulated time small enough for float precision in the shader.
      if (uniforms.rainTime.value > 600) uniforms.rainTime.value -= 600;
      mesh.visible = amount > 0.005;
      uniforms.rainOpacity.value = amount * (dusk ? 0.34 : 0.42) * (1 + storm * 0.35);
      uniforms.rainFall.value = 10.5 + storm * 3;
      uniforms.rainLength.value = 0.8 + storm * 0.45;
      if (wind) uniforms.rainWind.value.set(wind.x, 0, wind.z);
      uniforms.rainFlash.value = flash;
      if (color) uniforms.rainColor.value.copy(color);
    },
    setCount(value) {
      quad.instanceCount = Math.max(0, Math.min(count, Math.floor(value)));
    },
    dispose() {
      quad.dispose();
      material.dispose();
    },
  };
}
