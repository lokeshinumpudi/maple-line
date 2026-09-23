/**
 * Falling maple leaves and cherry petals near the camera: one instanced draw, animated in
 * the vertex shader (fall, drift with the wind, tumble), wrapped in a box that follows
 * the camera. amount 0 hides it; rain knocks most of them down.
 */
export const LEAF_VOLUME = Object.freeze({ x: 56, y: 22, z: 56 });

export function createFallingLeaves({ THREE, count = 360, layer = 0 }) {
  const geometry = new THREE.InstancedBufferGeometry();
  geometry.setAttribute(
    'corner',
    new THREE.Float32BufferAttribute([-1, -1, 1, -1, 1, 1, -1, -1, 1, 1, -1, 1], 2),
  );
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(18), 3));
  let seed = 61129;
  const random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  const seeds = new Float32Array(count * 4);
  for (let i = 0; i < seeds.length; i++) seeds[i] = random();
  geometry.setAttribute('leafSeed', new THREE.InstancedBufferAttribute(seeds, 4));
  geometry.instanceCount = count;
  const uniforms = {
    leafTime: { value: 0 },
    leafVolume: { value: new THREE.Vector3(LEAF_VOLUME.x, LEAF_VOLUME.y, LEAF_VOLUME.z) },
    leafWind: { value: new THREE.Vector3(1.2, 0, 0.5) },
    leafFloor: { value: 0 },
    leafSize: { value: 0.07 },
    leafPetal: { value: 0 },
    leafOpacity: { value: 0 },
    leafColorA: { value: new THREE.Color('#c6532c') },
    leafColorB: { value: new THREE.Color('#e0a13f') },
    leafLight: { value: new THREE.Color('#ffffff') },
  };
  const material = new THREE.ShaderMaterial({
    name: 'Falling leaves and petals',
    uniforms,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    vertexShader: /* glsl */ `
      attribute vec2 corner;
      attribute vec4 leafSeed;
      uniform float leafTime;
      uniform vec3 leafVolume;
      uniform vec3 leafWind;
      uniform float leafFloor;
      uniform float leafSize;
      varying vec2 vCorner;
      varying float vTone;
      varying float vFade;
      mat3 rotation(vec3 axis, float angle) {
        axis = normalize(axis);
        float s = sin(angle), c = cos(angle), oc = 1.0 - c;
        return mat3(oc * axis.x * axis.x + c, oc * axis.x * axis.y + axis.z * s, oc * axis.z * axis.x - axis.y * s,
                    oc * axis.x * axis.y - axis.z * s, oc * axis.y * axis.y + c, oc * axis.y * axis.z + axis.x * s,
                    oc * axis.z * axis.x + axis.y * s, oc * axis.y * axis.z - axis.x * s, oc * axis.z * axis.z + c);
      }
      void main() {
        float fall = 0.55 + leafSeed.w * 0.6;
        float t = leafTime + leafSeed.x * 40.0;
        // Side-slip flutter as the leaf rocks, on top of the wind drift.
        vec3 drift = leafWind * leafTime + vec3(sin(t * 1.3 + leafSeed.y * 6.0), 0.0, cos(t * 1.1 + leafSeed.z * 6.0)) * 0.6;
        vec3 p = leafSeed.xyz * leafVolume + drift + vec3(0.0, -fall * leafTime, 0.0);
        vec3 anchor = vec3(cameraPosition.x, leafFloor + leafVolume.y * 0.5, cameraPosition.z);
        vec3 rel = mod(p - anchor + leafVolume * 0.5, leafVolume) - leafVolume * 0.5;
        vec3 world = anchor + rel;
        mat3 spin = rotation(vec3(leafSeed.y - 0.5, 0.6, leafSeed.z - 0.5), t * (1.5 + leafSeed.w * 2.0));
        vec3 local = spin * vec3(corner.x, corner.y * 0.72, 0.0) * leafSize * (0.8 + leafSeed.w * 0.5);
        world += local;
        vCorner = corner;
        vTone = leafSeed.y;
        float distance = length(world - cameraPosition);
        vec3 edge = abs(rel) / (leafVolume * 0.5);
        vFade = smoothstep(0.6, 2.0, distance) * (1.0 - smoothstep(0.75, 1.0, max(edge.x, edge.z)))
          * smoothstep(-1.0, -0.8, rel.y / (leafVolume.y * 0.5));
        gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      uniform float leafOpacity;
      uniform float leafPetal;
      uniform vec3 leafColorA;
      uniform vec3 leafColorB;
      uniform vec3 leafLight;
      varying vec2 vCorner;
      varying float vTone;
      varying float vFade;
      void main() {
        // A petal is a rounded teardrop; a maple leaf a five-pointed star.
        float r = length(vCorner);
        float angle = atan(vCorner.y, vCorner.x);
        float star = 0.55 + 0.45 * pow(abs(cos(angle * 2.5)), 0.6);
        float petal = 0.9 - 0.25 * vCorner.y;
        float edge = mix(star, petal, leafPetal);
        if (r > edge) discard;
        vec3 color = mix(leafColorA, leafColorB, vTone) * leafLight;
        gl_FragColor = vec4(color, leafOpacity * clamp(vFade, 0.0, 1.0));
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = 'Weather · falling leaves and petals';
  mesh.frustumCulled = false;
  mesh.visible = false;
  if (layer) mesh.layers.set(layer);
  let amount = 0;
  return {
    mesh,
    uniforms,
    /**
     * kind 'maple' | 'petal' | null, target 0..1, floor = ground height under the camera,
     * wind {x, z} in m/s, light = colour of the light reaching the leaves.
     */
    update(dt, { kind = null, target = 0, floor = 0, wind, light } = {}) {
      const step = Math.max(0, dt);
      uniforms.leafTime.value += step;
      if (uniforms.leafTime.value > 900) uniforms.leafTime.value -= 900;
      amount += ((kind ? target : 0) - amount) * (1 - Math.exp(-step * 0.8));
      mesh.visible = amount > 0.01;
      uniforms.leafOpacity.value = Math.min(1, amount);
      uniforms.leafFloor.value +=
        (floor - 2 - uniforms.leafFloor.value) * (1 - Math.exp(-step * 2));
      if (wind) uniforms.leafWind.value.set(wind.x, 0, wind.z);
      if (light) uniforms.leafLight.value.copy(light);
      if (kind === 'petal') {
        uniforms.leafPetal.value = 1;
        uniforms.leafSize.value = 0.045;
        uniforms.leafColorA.value.set('#f1c2cf');
        uniforms.leafColorB.value.set('#fbe3ea');
      } else if (kind === 'maple') {
        uniforms.leafPetal.value = 0;
        uniforms.leafSize.value = 0.08;
        uniforms.leafColorA.value.set('#b8452a');
        uniforms.leafColorB.value.set('#dc9a3c');
      }
    },
    setCount(value) {
      geometry.instanceCount = Math.max(0, Math.min(count, Math.floor(value)));
    },
    getState: () => ({ amount, count: geometry.instanceCount, visible: mesh.visible }),
    dispose() {
      geometry.dispose();
      material.dispose();
    },
  };
}
