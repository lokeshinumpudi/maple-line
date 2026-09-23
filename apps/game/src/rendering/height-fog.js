/**
 * Height fog, far haze and sun in-scatter for every material that already uses scene fog.
 *
 * Installed once by replacing Three's fog shader chunks, so no material is rewritten.
 * The extra uniforms are shared Float32Arrays: UniformsUtils.clone keeps typed arrays by
 * reference, so one write per frame reaches every compiled program. A material without
 * these uniforms reads zeros and falls back to the original FogExp2 result.
 */
export const HEIGHT_FOG_UNIFORMS = Object.freeze({
  // x base height (world y), y falloff per metre, z density at the base, w sun scatter
  mapleFogHeight: new Float32Array([0, 0.05, 0, 0]),
  // xyz sun direction, w distance in metres at which far haze is complete
  mapleFogSun: new Float32Array([0, 1, 0, 900]),
  mapleFogSunColor: new Float32Array([1, 0.9, 0.75, 0]),
  // rgb far haze colour, a strength
  mapleFogHaze: new Float32Array([0.8, 0.85, 0.85, 0]),
});

const parsVertex = /* glsl */ `
#ifdef USE_FOG
  varying float vFogDepth;
  varying vec3 vMapleFogRay;
#endif
`;
const vertex = /* glsl */ `
#ifdef USE_FOG
  vFogDepth = - mvPosition.z;
  // World-space ray from the camera: the view rotation is orthonormal, so its inverse is its transpose.
  vMapleFogRay = transpose( mat3( viewMatrix ) ) * mvPosition.xyz;
#endif
`;
const parsFragment = /* glsl */ `
#ifdef USE_FOG
  uniform vec3 fogColor;
  varying float vFogDepth;
  varying vec3 vMapleFogRay;
  uniform vec4 mapleFogHeight;
  uniform vec4 mapleFogSun;
  uniform vec4 mapleFogSunColor;
  uniform vec4 mapleFogHaze;
  #ifdef FOG_EXP2
    uniform float fogDensity;
  #else
    uniform float fogNear;
    uniform float fogFar;
  #endif
#endif
`;
const fragment = /* glsl */ `
#ifdef USE_FOG
  #ifdef FOG_EXP2
    float fogFactor = 1.0 - exp( - fogDensity * fogDensity * vFogDepth * vFogDepth );
  #else
    float fogFactor = smoothstep( fogNear, fogFar, vFogDepth );
  #endif
  float mapleFogDistance = length( vMapleFogRay );
  if ( mapleFogHeight.z > 0.0 ) {
    // Exponential density with height, integrated along the view ray.
    float falloff = max( mapleFogHeight.y, 0.0001 );
    float eyeHeight = cameraPosition.y - mapleFogHeight.x;
    float rise = falloff * vMapleFogRay.y;
    float spread = abs( rise ) > 0.0001 ? ( 1.0 - exp( - rise ) ) / rise : 1.0;
    float optical = mapleFogHeight.z * exp( - falloff * clamp( eyeHeight, -40.0, 400.0 ) ) * spread * mapleFogDistance;
    fogFactor = 1.0 - ( 1.0 - fogFactor ) * exp( - min( optical, 16.0 ) );
  }
  vec3 mapleFogTint = fogColor;
  float mapleFar = smoothstep( 0.0, 1.0, mapleFogDistance / max( mapleFogSun.w, 1.0 ) );
  mapleFogTint = mix( mapleFogTint, mapleFogHaze.rgb, mapleFogHaze.a * mapleFar );
  vec3 mapleRayDirection = vMapleFogRay / max( mapleFogDistance, 0.001 );
  float mapleSun = pow( max( dot( mapleRayDirection, mapleFogSun.xyz ), 0.0 ), 6.0 );
  mapleFogTint = mix( mapleFogTint, mapleFogSunColor.rgb, clamp( mapleSun * mapleFogHeight.w, 0.0, 1.0 ) );
  gl_FragColor.rgb = mix( gl_FragColor.rgb, mapleFogTint, fogFactor );
#endif
`;

let installed = false;

/** Replace the fog chunks and register the shared uniforms. Call before the first render. */
export function installHeightFog(THREE) {
  if (installed) return HEIGHT_FOG_UNIFORMS;
  installed = true;
  THREE.ShaderChunk.fog_pars_vertex = parsVertex;
  THREE.ShaderChunk.fog_vertex = vertex;
  THREE.ShaderChunk.fog_pars_fragment = parsFragment;
  THREE.ShaderChunk.fog_fragment = fragment;
  const entries = Object.entries(HEIGHT_FOG_UNIFORMS);
  // UniformsLib.fog is merged by later ShaderMaterials (three's Water, for example).
  for (const [name, value] of entries) THREE.UniformsLib.fog[name] = { value };
  for (const shader of Object.values(THREE.ShaderLib))
    if (shader.uniforms?.fogColor)
      for (const [name, value] of entries) shader.uniforms[name] = { value };
  return HEIGHT_FOG_UNIFORMS;
}

/**
 * Write this frame's fog parameters. Colours are THREE.Color-like ({ r, g, b }) in the
 * renderer's working (linear) space; sunDirection is normalized.
 */
export function updateHeightFog({
  baseHeight = 0,
  falloff = 0.05,
  density = 0,
  sunScatter = 0,
  sunDirection,
  sunColor,
  hazeColor,
  hazeStrength = 0,
  hazeDistance = 900,
} = {}) {
  const { mapleFogHeight, mapleFogSun, mapleFogSunColor, mapleFogHaze } = HEIGHT_FOG_UNIFORMS;
  mapleFogHeight[0] = baseHeight;
  mapleFogHeight[1] = falloff;
  mapleFogHeight[2] = density;
  mapleFogHeight[3] = sunScatter;
  if (sunDirection) {
    mapleFogSun[0] = sunDirection.x;
    mapleFogSun[1] = sunDirection.y;
    mapleFogSun[2] = sunDirection.z;
  }
  mapleFogSun[3] = hazeDistance;
  if (sunColor) {
    mapleFogSunColor[0] = sunColor.r;
    mapleFogSunColor[1] = sunColor.g;
    mapleFogSunColor[2] = sunColor.b;
  }
  if (hazeColor) {
    mapleFogHaze[0] = hazeColor.r;
    mapleFogHaze[1] = hazeColor.g;
    mapleFogHaze[2] = hazeColor.b;
  }
  mapleFogHaze[3] = hazeStrength;
}
