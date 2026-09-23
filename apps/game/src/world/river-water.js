import * as THREE from 'three';
import { Water } from 'three/addons/objects/Water.js';
import {
  WATER_GLSL,
  WATER_UNIFORMS,
  createWaterNormalTexture,
} from '../rendering/water-surface.js';

/**
 * One flat river surface: a planar scene reflection, a depth-aware view of the bed,
 * flow-aligned generated wave normals, Fresnel, sun glints, rain rings and bank foam.
 *
 * quality: { reflectionSize, refraction }. reflectionSize 0 skips the mirror pass and
 * reflects the sky gradient instead; refraction false skips the bed capture and tints by
 * depth. Both passes can be switched at runtime with setQuality.
 */
export function createRiverWater({
  scene,
  renderer,
  camera,
  center,
  riverProfile,
  riverBedHeight,
  quality = { reflectionSize: 512, refraction: true },
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
  const normals = createWaterNormalTexture(THREE);
  const mirrorSize = Math.max(1, quality.reflectionSize || 1);
  const water = new Water(geometry, {
    textureWidth: mirrorSize,
    textureHeight: mirrorSize,
    waterNormals: normals,
    sunDirection: new THREE.Vector3(-0.5, 0.8, -0.35).normalize(),
    sunColor: '#ffe2ad',
    waterColor: '#24695f',
    distortionScale: 1.5,
    fog: true,
  });
  // The mirror pass runs from capture(), before the main render, not from inside it. A
  // render nested in onBeforeRender gets its own light state in three.js, so every
  // material in the scene re-selected its shader program twice per mirror refresh.
  const reflectScene = water.onBeforeRender;
  water.onBeforeRender = () => {};
  let mirrorEnabled = quality.reflectionSize > 0;
  let refractionEnabled = quality.refraction !== false;
  water.rotation.x = -Math.PI / 2;
  water.position.y = -0.4;
  scene.add(water);
  const material = water.material;
  const mirrorTarget = material.uniforms.mirrorSampler.value.renderTarget;
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
    skyHorizon: { value: new THREE.Color('#f4dfbe') },
    skyZenith: { value: new THREE.Color('#8ab5be') },
    mirrorMix: { value: mirrorEnabled ? 1 : 0 },
    refractionMix: { value: refractionEnabled ? 1 : 0 },
    waterTime: WATER_UNIFORMS.waterTime,
  });
  material.uniforms.size.value = 3.2;
  material.vertexShader =
    'attribute float riverDepth; attribute vec2 riverFlowUv; attribute vec2 riverFlowDirection; varying float vRiverDepth; varying vec2 vFlowUv; varying vec2 vFlowDirection;\n' +
    material.vertexShader.replace(
      'void main() {',
      'void main() {\nvRiverDepth=riverDepth;vFlowUv=riverFlowUv;vFlowDirection=riverFlowDirection;',
    );
  material.fragmentShader = /* glsl */ `
    uniform sampler2D mirrorSampler;
    uniform float alpha;
    uniform float time;
    uniform float waterTime;
    uniform float distortionScale;
    uniform sampler2D normalSampler;
    uniform vec3 sunColor;
    uniform vec3 sunDirection;
    uniform vec3 eye;
    uniform vec3 waterColor;
    uniform float dusk;
    uniform float rainStrength;
    uniform sampler2D bedSampler;
    uniform sampler2D bedDepthSampler;
    uniform vec2 screenSize;
    uniform vec3 skyHorizon;
    uniform vec3 skyZenith;
    uniform float mirrorMix;
    uniform float refractionMix;
    varying vec4 mirrorCoord;
    varying vec4 worldPosition;
    varying float vRiverDepth;
    varying vec2 vFlowUv;
    varying vec2 vFlowDirection;
    #include <common>
    #include <packing>
    #include <bsdfs>
    #include <fog_pars_fragment>
    #include <logdepthbuf_pars_fragment>
    #include <lights_pars_begin>
    #include <shadowmap_pars_fragment>
    #include <shadowmask_pars_fragment>
    ${WATER_GLSL}
    void main() {
      #include <logdepthbuf_fragment>
      vec3 worldToEye = eye - worldPosition.xyz;
      float dist = length(worldToEye);
      vec3 eyeDirection = worldToEye / max(dist, 0.001);
      // Generated wave normals advected downstream in river coordinates, then turned
      // into the local bend. Finer layers fade with distance so far water stays calm.
      vec2 downstream = normalize(vFlowDirection);
      vec2 across = vec2(downstream.y, -downstream.x);
      vec2 flow = vFlowUv;
      vec4 broad = texture2D(normalSampler, (flow - vec2(0.0, time * 1.05)) / 13.0);
      vec4 middle = texture2D(normalSampler, (flow - vec2(0.3, time * 0.8) + vec2(3.7, 1.3)) / 5.1);
      vec4 fine = texture2D(normalSampler, (flow + vec2(time * 0.11, -time * 1.45)) / 1.9);
      float near = 1.0 - smoothstep(18.0, 110.0, dist);
      vec2 slope = (broad.xy * 2.0 - 1.0) * 0.5 + (middle.xy * 2.0 - 1.0) * 0.36
        + (fine.xy * 2.0 - 1.0) * 0.26 * near;
      vec2 worldSlope = (across * slope.x + downstream * slope.y) * (0.12 + rainStrength * 0.1);
      if (rainStrength > 0.01)
        worldSlope += rainRipples(worldPosition.xz * 1.7, waterTime) * rainStrength * 0.8
          * (1.0 - smoothstep(12.0, 42.0, dist));
      vec3 surfaceNormal = normalize(vec3(worldSlope.x, 1.0, worldSlope.y));

      float theta = clamp(dot(eyeDirection, surfaceNormal), 0.0, 1.0);
      float fresnel = 0.02 + 0.98 * pow(1.0 - theta, 5.0);
      float reflectionWeight = clamp(fresnel * 1.05 + 0.03, 0.03, 0.88);

      vec2 distortion = surfaceNormal.xz * (0.001 + 1.0 / max(dist, 1.0)) * distortionScale;
      vec3 mirror = texture2D(mirrorSampler, mirrorCoord.xy / mirrorCoord.w + distortion).rgb;
      vec3 reflectedRay = reflect(-eyeDirection, surfaceNormal);
      vec3 skyReflection = mix(skyHorizon, skyZenith, pow(clamp(reflectedRay.y, 0.0, 1.0), 0.5));
      // A water reflection is a little darker than the scene it shows.
      vec3 reflected = mix(skyReflection, mirror, mirrorMix) * 0.92;
      // Bright reflected lamps and sky glints get extra punch so they break into ripples.
      reflected += max(mirror - 0.55, vec3(0.0)) * 1.6 * mirrorMix;

      float shadow = getShadowMask();
      vec3 halfVector = normalize(sunDirection + eyeDirection);
      float highlight = max(dot(surfaceNormal, halfVector), 0.0);
      vec3 glint = sunColor * (pow(highlight, 700.0) * 9.0 + pow(highlight, 90.0) * 0.35) * shadow;

      vec2 screenUv = gl_FragCoord.xy / screenSize;
      vec2 refractedUv = clamp(screenUv + surfaceNormal.xz * 0.012 * min(vRiverDepth, 2.5), vec2(0.001), vec2(0.999));
      // Avoid pulling above-water foreground objects into the refracted riverbed.
      if (texture2D(bedDepthSampler, refractedUv).x < gl_FragCoord.z - 0.00001) refractedUv = screenUv;
      vec3 lit = sunColor * max(sunDirection.y, 0.0) * 0.45 * shadow + skyHorizon * 0.55;
      vec3 bedGuess = mix(vec3(0.34, 0.31, 0.23), vec3(0.16, 0.17, 0.13), smoothstep(0.0, 2.0, vRiverDepth)) * lit;
      vec3 bed = mix(bedGuess, texture2D(bedSampler, refractedUv).rgb, refractionMix);
      float opticalDepth = vRiverDepth / max(0.3, theta);
      vec3 transmission = exp(-opticalDepth * vec3(0.55, 0.3, 0.24));
      vec3 deepColor = waterColor * 0.22 * (0.35 + 0.65 * lit);
      vec3 clearWater = bed * transmission + deepColor * (1.0 - transmission);

      vec3 albedo = mix(clearWater, reflected, reflectionWeight) + glint;
      // Broken foam along the banks, moving with the current.
      float edge = 1.0 - smoothstep(0.05, 0.5, vRiverDepth);
      float breakup = texture2D(normalSampler, (flow - vec2(0.0, time * 1.6)) / 2.3).a;
      float foam = edge * smoothstep(0.62, 0.9, breakup + edge * 0.35 + sin(flow.y * 2.1 - time * 2.4) * 0.06);
      albedo = mix(albedo, vec3(0.78, 0.82, 0.8) * lit * 1.1, foam * 0.55);
      gl_FragColor = vec4(albedo, alpha);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
      #include <fog_fragment>
    }`;
  function resize() {
    const size = renderer.getDrawingBufferSize(new THREE.Vector2());
    material.uniforms.screenSize.value.copy(size);
    const scale = Math.min(0.5, 800 / size.x);
    refraction.setSize(
      refractionEnabled ? Math.max(1, Math.round(size.x * scale)) : 1,
      refractionEnabled ? Math.max(1, Math.round(size.y * scale)) : 1,
    );
  }
  resize();
  return {
    mesh: water,
    material,
    resize,
    setQuality(next) {
      mirrorEnabled = next.reflectionSize > 0;
      refractionEnabled = next.refraction !== false;
      mirrorTarget?.setSize(
        Math.max(1, next.reflectionSize || 1),
        Math.max(1, next.reflectionSize || 1),
      );
      material.uniforms.mirrorMix.value = mirrorEnabled ? 1 : 0;
      material.uniforms.refractionMix.value = refractionEnabled ? 1 : 0;
      resize();
    },
    getState: () => ({
      reflectionSize: mirrorEnabled ? mirrorTarget?.width : 0,
      refraction: refractionEnabled,
    }),
    capture({ refreshReflection: refresh = true } = {}) {
      const previous = renderer.getRenderTarget();
      if (refractionEnabled) {
        const visible = water.visible;
        water.visible = false;
        renderer.setRenderTarget(refraction);
        renderer.render(scene, camera);
        water.visible = visible;
      }
      if (refresh && mirrorEnabled) {
        // The mirror camera reads both world matrices; the refraction render updated them.
        if (!refractionEnabled) {
          scene.updateMatrixWorld();
          camera.updateMatrixWorld();
        }
        reflectScene.call(water, renderer, scene, camera);
      }
      renderer.setRenderTarget(previous);
    },
    dispose() {
      scene.remove(water);
      geometry.dispose();
      material.uniforms.mirrorSampler.value.dispose();
      material.dispose();
      refraction.dispose();
    },
  };
}
