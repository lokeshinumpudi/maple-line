import * as THREE from 'three';
import { Water } from 'three/addons/objects/Water.js';

// One flat river surface: scene reflection plus a depth-aware view of the bed.
export function createRiverWater({
  scene,
  renderer,
  camera,
  center,
  riverProfile,
  riverBedHeight,
}) {
  const vertices = [],
    depths = [],
    flowCoordinates = [],
    flowDirections = [],
    indices = [];
  const cross = [-1, -0.82, -0.48, 0, 0.48, 0.82, 1],
    rows = 851;
  for (let j = 0; j < rows; j++) {
    const z = -850 + j * 2,
      profile = riverProfile(z);
    for (const fraction of cross) {
      const u = profile.offset + fraction * profile.halfWidth;
      vertices.push(center(z) + u, -0.4, z);
      depths.push(Math.max(0, -0.4 - riverBedHeight(u, z)));
      flowCoordinates.push(fraction * profile.halfWidth, z);
      const before = riverProfile(z - 0.5),
        after = riverProfile(z + 0.5);
      flowDirections.push(center(z + 0.5) + after.offset - center(z - 0.5) - before.offset, 1);
    }
    if (j < rows - 1)
      for (let k = 0; k < cross.length - 1; k++) {
        const i = j * cross.length + k;
        indices.push(i, i + cross.length, i + 1, i + 1, i + cross.length, i + cross.length + 1);
      }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  geometry.setAttribute('riverDepth', new THREE.Float32BufferAttribute(depths, 1));
  geometry.setAttribute('riverFlowUv', new THREE.Float32BufferAttribute(flowCoordinates, 2));
  geometry.setAttribute('riverFlowDirection', new THREE.Float32BufferAttribute(flowDirections, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  // Water's mirror plane is local XY, with +Z as its normal.
  geometry.translate(0, 0.4, 0);
  geometry.rotateX(Math.PI / 2);
  const bytes = new Uint8Array(128 * 128 * 4);
  const wave = (x, y) =>
    Math.sin(((x * 5 + y * 3) * Math.PI) / 64 + Math.sin((y * Math.PI) / 32)) * 0.5 +
    Math.sin(((x * 11 - y * 7) * Math.PI) / 64) * 0.25 +
    Math.cos(((x * 23 + y * 17) * Math.PI) / 64) * 0.125;
  for (let y = 0; y < 128; y++)
    for (let x = 0; x < 128; x++) {
      const i = (y * 128 + x) * 4;
      bytes[i] = 128 + (wave(x + 1, y) - wave(x - 1, y)) * 18;
      bytes[i + 1] = 128 + (wave(x, y + 1) - wave(x, y - 1)) * 18;
      bytes[i + 2] = 253;
      bytes[i + 3] = 255;
    }
  const normals = new THREE.DataTexture(bytes, 128, 128);
  normals.wrapS = normals.wrapT = THREE.RepeatWrapping;
  normals.magFilter = normals.minFilter = THREE.LinearFilter;
  normals.needsUpdate = true;
  const water = new Water(geometry, {
    textureWidth: 512,
    textureHeight: 512,
    waterNormals: normals,
    sunDirection: new THREE.Vector3(-0.5, 0.8, -0.35).normalize(),
    sunColor: '#ffe2ad',
    waterColor: '#24695f',
    distortionScale: 1.5,
    fog: true,
  });
  const reflectScene = water.onBeforeRender;
  let refreshReflection = true;
  water.onBeforeRender = function (...args) {
    if (refreshReflection) {
      reflectScene.apply(this, args);
      refreshReflection = false;
    }
  };
  water.rotation.x = -Math.PI / 2;
  water.position.y = -0.4;
  scene.add(water);
  const material = water.material;
  const refraction = new THREE.WebGLRenderTarget(1, 1, {
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
    depthBuffer: true,
    type: THREE.HalfFloatType,
  });
  refraction.depthTexture = new THREE.DepthTexture(1, 1, THREE.UnsignedIntType);
  Object.assign(material.uniforms, {
    dusk: { value: 0 },
    rainStrength: { value: 0 },
    bedSampler: { value: refraction.texture },
    bedDepthSampler: { value: refraction.depthTexture },
    screenSize: { value: new THREE.Vector2() },
  });
  material.uniforms.size.value = 3.2;
  material.vertexShader =
    'attribute float riverDepth; attribute vec2 riverFlowUv; attribute vec2 riverFlowDirection; varying float vRiverDepth; varying vec2 vFlowUv; varying vec2 vFlowDirection;\n' +
    material.vertexShader.replace(
      'void main() {',
      'void main() {\nvRiverDepth=riverDepth;vFlowUv=riverFlowUv;vFlowDirection=riverFlowDirection;',
    );
  material.fragmentShader =
    'varying float vRiverDepth; varying vec2 vFlowUv; varying vec2 vFlowDirection; uniform sampler2D bedSampler; uniform sampler2D bedDepthSampler; uniform vec2 screenSize; uniform float rainStrength;\n' +
    material.fragmentShader;
  // Advect both normal layers downstream in river coordinates, then rotate the
  // ripples into the local bend. No extra capture or fluid simulation is added.
  material.fragmentShader = material.fragmentShader.replace(
    /vec4 getNoise\( vec2 uv \) \{[\s\S]*?\n\s*\}/,
    `vec4 getNoise( vec2 uv ) {
    vec2 downstream=vec2(0.,time*1.25);
    vec4 broad=texture2D(normalSampler,(uv-downstream)/32.);
    vec4 fine=texture2D(normalSampler,(uv-downstream*.84+vec2(8.,3.))/18.);
    return mix(broad,fine,.28)*2.-1.;
  }`,
  );
  material.fragmentShader = material.fragmentShader.replace(
    'getNoise( worldPosition.xz * size )',
    'getNoise( vFlowUv )',
  );
  material.fragmentShader = material.fragmentShader.replace(
    'vec3 surfaceNormal = normalize( noise.xzy * vec3( 1.5, 1.0, 1.5 ) );',
    `vec2 downstream=normalize(vFlowDirection);
    vec2 across=vec2(downstream.y,-downstream.x);
    vec2 ripples=(across*noise.x+downstream*noise.y)*(1.1+rainStrength*.35);
    ripples+=downstream*sin(vFlowUv.y*.75-time*1.1+sin(vFlowUv.x*.23))*.016;
    vec3 surfaceNormal=normalize(vec3(ripples.x,noise.z,ripples.y));`,
  );
  material.fragmentShader = material.fragmentShader.replace(
    'float rf0 = 0.3;',
    'float rf0 = 0.06;',
  );
  material.fragmentShader = material.fragmentShader.replace(
    /vec3 albedo = mix\([^\n]+;/,
    `
 vec2 screenUv=gl_FragCoord.xy/screenSize;
 vec2 refractedUv=clamp(screenUv+surfaceNormal.xz*.009*min(vRiverDepth,2.5),vec2(.001),vec2(.999));
 // Avoid pulling above-water foreground objects into the refracted riverbed.
 if(texture2D(bedDepthSampler,refractedUv).x < gl_FragCoord.z-.00001)refractedUv=screenUv;
 vec3 bed=texture2D(bedSampler,refractedUv).rgb;
 float opticalDepth=vRiverDepth/max(.3,theta);
 vec3 transmission=exp(-opticalDepth*vec3(.20,.077,.055));
 vec3 deepColor=vec3(.018,.11,.088);
 vec3 clearWater=bed*transmission+deepColor*(1.-transmission);
 float reflectionWeight=clamp(reflectance*.83,.025,.78);
 vec3 reflected=reflectionSample*(.85+specularLight*.15);
 vec3 albedo=mix(clearWater,reflected,reflectionWeight);
 float edge=1.-smoothstep(.06,.45,vRiverDepth);
 float foam=edge*smoothstep(.45,.94,sin(vFlowUv.y*2.9-time*3.6)*sin(vFlowUv.x*6.7+sin(vFlowUv.y*.12)));
 albedo+=foam*vec3(.09,.12,.11);
 `,
  );
  function resize() {
    const size = renderer.getDrawingBufferSize(new THREE.Vector2());
    material.uniforms.screenSize.value.copy(size);
    const scale = Math.min(0.5, 800 / size.x);
    refraction.setSize(
      Math.max(1, Math.round(size.x * scale)),
      Math.max(1, Math.round(size.y * scale)),
    );
  }
  resize();
  return {
    mesh: water,
    material,
    resize,
    capture({ refreshReflection: refresh = true } = {}) {
      refreshReflection = refresh;
      const previous = renderer.getRenderTarget();
      const visible = water.visible;
      water.visible = false;
      renderer.setRenderTarget(refraction);
      renderer.render(scene, camera);
      renderer.setRenderTarget(previous);
      water.visible = visible;
    },
    dispose() {
      scene.remove(water);
      geometry.dispose();
      material.uniforms.mirrorSampler.value.dispose();
      material.dispose();
      normals.dispose();
      refraction.dispose();
    },
  };
}
