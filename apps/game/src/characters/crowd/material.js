/**
 * The crowd kit's one material per detail level. It is MeshToonMaterial with a few shader
 * additions, so three.js lights, shadows, fog, skinning and morph targets keep working:
 *
 * - colour: each vertex names a palette slot per outfit (kitSlots) and the material reads
 *   the person's palette row (palette.js), so every look shares one material;
 * - parts: each vertex has a part id (kitPart); parts not in the look's mask are moved
 *   outside the view volume, so hidden hair, outfits and accessories draw nothing;
 * - shading: a two-tone step with a warm lavender shaded side that never falls below
 *   `shadeFloor`, flat-lit face decals and a weak warm rim, after characters/mtoon-tone.js;
 * - fading: a 4x4 ordered dither, complementary between the near and mid tiers, so a person
 *   crossing between them never shows two bodies or a gap;
 * - mid tier only (KIT_MID): InstancedMesh attributes for the look and two baked clips,
 *   skinning read from the bone texture (anim-texture.js) and a blink shape in kitBlink.
 */
import { CHARACTER_TONE } from '../mtoon-tone.js';

const VERTEX_PARS = /* glsl */ `
attribute vec4 kitSlots;
attribute float kitPart;
uniform highp sampler2D kitPalette;
varying vec3 vKitColor;
varying float vKitFlat;
#ifdef KIT_MID
  attribute vec4 skinIndex;
  attribute vec4 skinWeight;
  attribute vec3 kitBlink;
  attribute vec4 kitAnimA;
  attribute vec4 kitAnimB;
  attribute vec4 kitLook;
  uniform highp sampler2D kitBones;
  varying float vKitFade;
  mat4 kitBoneAt(float row, float bone) {
    int x = int(bone + 0.5) * 4;
    int y = int(row + 0.5);
    return mat4(
      texelFetch(kitBones, ivec2(x, y), 0),
      texelFetch(kitBones, ivec2(x + 1, y), 0),
      texelFetch(kitBones, ivec2(x + 2, y), 0),
      texelFetch(kitBones, ivec2(x + 3, y), 0));
  }
  mat4 kitPose(float bone) {
    mat4 a = kitBoneAt(kitAnimA.x, bone) * (1.0 - kitAnimA.z) + kitBoneAt(kitAnimA.y, bone) * kitAnimA.z;
    if (kitAnimA.w > 0.001) {
      mat4 b = kitBoneAt(kitAnimB.x, bone) * (1.0 - kitAnimB.z) + kitBoneAt(kitAnimB.y, bone) * kitAnimB.z;
      a = a * (1.0 - kitAnimA.w) + b * kitAnimA.w;
    }
    return a;
  }
  mat4 kitSkinMatrix() {
    mat4 m = kitPose(skinIndex.x) * skinWeight.x;
    if (skinWeight.y > 0.0) m += kitPose(skinIndex.y) * skinWeight.y;
    if (skinWeight.z > 0.0) m += kitPose(skinIndex.z) * skinWeight.z;
    if (skinWeight.w > 0.0) m += kitPose(skinIndex.w) * skinWeight.w;
    return m;
  }
  #define KIT_LOOK kitLook
#else
  uniform vec4 kitLookU;
  #define KIT_LOOK kitLookU
#endif
bool kitShown() {
  float bit = exp2(floor(kitPart + 0.5));
  return mod(floor(KIT_LOOK.z / bit), 2.0) > 0.5;
}
`;

const VERTEX_START = /* glsl */ `
void main() {
#ifdef KIT_MID
  mat4 kitSkin = kitSkinMatrix();
#endif
`;

const VERTEX_NORMAL = /* glsl */ `
#include <beginnormal_vertex>
#ifdef KIT_MID
  objectNormal = normalize(mat3(kitSkin) * objectNormal);
#endif
`;

const VERTEX_BEGIN = /* glsl */ `
#include <begin_vertex>
#ifdef KIT_MID
  transformed += kitBlink * KIT_LOOK.w;
  transformed = (kitSkin * vec4(transformed, 1.0)).xyz;
  vKitFade = kitAnimB.w;
#endif
{
  float outfit = KIT_LOOK.y;
  float slot = outfit < 0.5 ? kitSlots.x : outfit < 1.5 ? kitSlots.y : outfit < 2.5 ? kitSlots.z : kitSlots.w;
  vec4 kitColor = texelFetch(kitPalette, ivec2(int(slot + 0.5), int(KIT_LOOK.x + 0.5)), 0);
  vKitColor = kitColor.rgb;
  vKitFlat = kitColor.a;
}
`;

const VERTEX_PROJECT = /* glsl */ `
#include <project_vertex>
if (!kitShown()) gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
`;

const FRAGMENT_PARS = /* glsl */ `
varying vec3 vKitColor;
varying float vKitFlat;
uniform vec3 kitShadeTint;
uniform float kitShadeFloor;
uniform vec3 kitRim;
uniform float kitLit;
uniform float kitLift;
#ifdef KIT_MID
  varying float vKitFade;
  #define KIT_FADE vKitFade
#else
  uniform float kitFade;
  #define KIT_FADE kitFade
#endif
float kitDither(vec2 p) {
  ivec2 i = ivec2(mod(p, 4.0));
  const float m[16] = float[16](0.0, 8.0, 2.0, 10.0, 12.0, 4.0, 14.0, 6.0, 3.0, 11.0, 1.0, 9.0, 15.0, 7.0, 13.0, 5.0);
  return (m[i.x + i.y * 4] + 0.5) / 16.0;
}
`;

const GRADIENT = /* glsl */ `
vec3 getGradientIrradiance( vec3 normal, vec3 lightDirection ) {
  float x = dot( normal, lightDirection ) * 0.5 + 0.5 + vKitFlat * 0.45;
  float w = fwidth( x ) * 0.5 + 0.015;
  float lit = smoothstep( 0.5 - w, 0.5 + w, x );
  return mix( kitShadeTint * kitShadeFloor, vec3( 1.0 ), lit );
}
`;

const FRAGMENT_START = /* glsl */ `
#include <clipping_planes_fragment>
{
  float threshold = kitDither(gl_FragCoord.xy);
#ifdef KIT_MID
  if (threshold < 1.0 - KIT_FADE) discard;
#else
  if (threshold >= KIT_FADE) discard;
#endif
}
`;

const FRAGMENT_COLOR = /* glsl */ `
#include <color_fragment>
diffuseColor.rgb *= vKitColor * kitLit;
`;

const FRAGMENT_RIM = /* glsl */ `
{
  float facing = clamp(dot(normal, normalize(vViewPosition)), 0.0, 1.0);
  outgoingLight += kitRim * diffuseColor.rgb * pow(1.0 - facing, 4.0) * (1.0 - vKitFlat);
  // MToon's GI equalisation evens the sky light over the body; a flat lift stands in for it.
  outgoingLight += diffuseColor.rgb * kitLift;
}
#include <opaque_fragment>
`;

function patchVertex(shader) {
  shader.vertexShader = shader.vertexShader
    .replace('#include <common>', `#include <common>\n${VERTEX_PARS}`)
    .replace('void main() {', VERTEX_START)
    .replace('#include <begin_vertex>', VERTEX_BEGIN)
    .replace('#include <project_vertex>', VERTEX_PROJECT);
  if (shader.vertexShader.includes('#include <beginnormal_vertex>'))
    shader.vertexShader = shader.vertexShader.replace('#include <beginnormal_vertex>', VERTEX_NORMAL);
}

/** Shared uniform values for one tier (palette, bones) plus per-material look uniforms. */
export function kitUniforms(THREE, { palette, bones = null, tone = CHARACTER_TONE }) {
  return {
    kitPalette: { value: palette },
    kitBones: { value: bones },
    kitLookU: { value: new THREE.Vector4(0, 0, 1, 0) },
    kitFade: { value: 1 },
    kitShadeTint: { value: new THREE.Color(...tone.shadeTint) },
    kitShadeFloor: { value: 0.72 },
    kitLift: { value: 0.35 },
    kitRim: { value: new THREE.Color(...tone.rim.color).multiplyScalar(tone.rim.strength * 2) },
    kitLit: { value: tone.lit },
  };
}

/**
 * @param {typeof import('three')} THREE
 * @param {object} options
 * @param {'near'|'mid'} options.mode
 * @param {object} options.uniforms from kitUniforms (shared or per person)
 */
export function createKitMaterial(THREE, { mode, uniforms, name = `Crowd / ${mode}` }) {
  const material = new THREE.MeshToonMaterial({ color: 0xffffff, name });
  material.side = THREE.DoubleSide;
  if (mode === 'mid') material.defines = { KIT_MID: '' };
  material.userData.kit = uniforms;
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    patchVertex(shader);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${FRAGMENT_PARS}`)
      .replace('#include <gradientmap_pars_fragment>', GRADIENT)
      .replace('#include <clipping_planes_fragment>', FRAGMENT_START)
      .replace('#include <color_fragment>', FRAGMENT_COLOR)
      .replace('#include <opaque_fragment>', FRAGMENT_RIM);
  };
  material.customProgramCacheKey = () => `maple-crowd-${mode}`;
  return material;
}

/** Shadow-map material with the same part mask and (mid) baked skinning. */
export function createKitDepthMaterial(THREE, { mode, uniforms }) {
  const material = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking });
  if (mode === 'mid') material.defines = { KIT_MID: '' };
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    patchVertex(shader);
  };
  material.customProgramCacheKey = () => `maple-crowd-depth-${mode}`;
  return material;
}

/**
 * Turn a kit mesh's integer texture coordinates (build.py: slot per outfit and part id,
 * stored as 1 - v by glTF export) into the kitSlots and kitPart attributes, in place.
 */
export function decodeKitAttributes(THREE, geometry) {
  const a = geometry.attributes.uv;
  const b = geometry.attributes.uv1;
  const c = geometry.attributes.uv2;
  if (!a || !b || !c) throw new Error('not a crowd-kit mesh: TEXCOORD_0..2 are missing');
  const n = a.count;
  const slots = new Float32Array(n * 4);
  const parts = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    slots[i * 4] = Math.round(a.getX(i));
    slots[i * 4 + 1] = Math.round(1 - a.getY(i));
    slots[i * 4 + 2] = Math.round(b.getX(i));
    slots[i * 4 + 3] = Math.round(1 - b.getY(i));
    parts[i] = Math.round(c.getX(i));
  }
  geometry.setAttribute('kitSlots', new THREE.BufferAttribute(slots, 4));
  geometry.setAttribute('kitPart', new THREE.BufferAttribute(parts, 1));
  geometry.deleteAttribute('uv');
  geometry.deleteAttribute('uv1');
  geometry.deleteAttribute('uv2');
  return geometry;
}

/** Triangles drawn for a part mask (for the budget report). */
export function trianglesForMask(geometry, mask) {
  const index = geometry.index;
  const part = geometry.attributes.kitPart;
  if (!index || !part) return 0;
  const counts = geometry.userData.kitPartTriangles ?? countPartTriangles(geometry);
  let total = 0;
  for (const [id, count] of counts) if (Math.floor(mask / 2 ** id) % 2 === 1) total += count;
  return total;
}

function countPartTriangles(geometry) {
  const counts = new Map();
  const index = geometry.index;
  const part = geometry.attributes.kitPart;
  for (let i = 0; i < index.count; i += 3) {
    const id = part.getX(index.getX(i));
    counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  geometry.userData.kitPartTriangles = counts;
  return counts;
}
