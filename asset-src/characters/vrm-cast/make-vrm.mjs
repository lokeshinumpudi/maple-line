/**
 * Turns a Blender GLB from build.py into a VRM 1.0 file: adds VRMC_vrm (meta, humanoid,
 * expressions, look-at), VRMC_springBone (hair chains and body colliders) and
 * VRMC_materials_mtoon, reading everything from the `<cast>.vrm.json` sidecar that
 * build.py writes. Geometry is not touched.
 *
 *   node asset-src/characters/vrm-cast/make-vrm.mjs riko [sato ishida]
 */
import { mkdirSync } from 'node:fs';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { readGlb, writeGlb, nodeWorldMatrices, toLocal, round } from '../../lib/glb.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..', '..', '..');
const outDir = join(root, 'apps/game/public/models/characters/vrm');

const srgbToLinear = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const linearToSrgb = (c) => (c <= 0.0031308 ? c * 12.92 : 1.055 * c ** (1 / 2.4) - 0.055);
/** Darken a linear colour in sRGB space so outlines keep the hue of the surface. */
const darken = (rgb, amount) => rgb.map((c) => round(srgbToLinear(linearToSrgb(c) * amount), 4));

export function makeVrm(json, spec) {
  const nodeIndex = new Map(json.nodes.map((node, index) => [node.name, index]));
  const need = (name) => {
    const index = nodeIndex.get(name);
    if (index === undefined) throw new Error(`node ${name} is missing from the GLB`);
    return index;
  };
  const world = nodeWorldMatrices(json);

  const humanBones = Object.fromEntries(
    spec.humanBones.map((bone) => [bone, { node: need(bone) }]),
  );

  const faceNode = need(spec.faceMesh);
  const faceMesh = json.meshes[json.nodes[faceNode].mesh];
  const targets = faceMesh.extras?.targetNames ?? [];
  const preset = {};
  for (const [expression, keys] of Object.entries(spec.expressions)) {
    preset[expression] = {
      morphTargetBinds: keys.map((key) => {
        const index = targets.indexOf(key);
        if (index < 0) throw new Error(`shape key ${key} is missing`);
        return { node: faceNode, index, weight: 1 };
      }),
      isBinary: false,
      // A smile curves the eyes itself, so it softens (not stacks with) a blink.
      overrideBlink: expression === 'happy' ? 'blend' : 'none',
      overrideLookAt: expression.startsWith('blink') || expression === 'happy' ? 'blend' : 'none',
      overrideMouth: 'none',
    };
  }

  const range = { inputMaxValue: 90, outputScale: 1 };
  const vrm = {
    specVersion: '1.0',
    meta: {
      name: spec.title,
      version: '0.1.0',
      authors: ['Maple Line'],
      copyrightInformation: 'Built by asset-src/characters/vrm-cast/build.py. No outside assets.',
      licenseUrl: 'https://vrm.dev/licenses/1.0/',
      avatarPermission: 'everyone',
      allowExcessivelyViolentUsage: false,
      allowExcessivelySexualUsage: false,
      commercialUsage: 'corporation',
      allowPoliticalOrReligiousUsage: false,
      allowAntisocialOrHateUsage: false,
      creditNotation: 'unnecessary',
      allowRedistribution: true,
      modification: 'allowModificationRedistribution',
      otherLicenseUrl: 'https://creativecommons.org/publicdomain/zero/1.0/',
    },
    humanoid: { humanBones },
    firstPerson: { meshAnnotations: [{ node: faceNode, type: 'thirdPersonOnly' }] },
    lookAt: {
      type: 'expression',
      offsetFromHeadBone: [0, round(0.06 * (spec.height / 1.58), 4), 0],
      rangeMapHorizontalInner: range,
      rangeMapHorizontalOuter: range,
      rangeMapVerticalDown: range,
      rangeMapVerticalUp: range,
    },
    expressions: { preset, custom: {} },
  };

  const colliders = spec.colliders.map(({ bone, center, radius }) => {
    const node = need(bone);
    return { node, shape: { sphere: { offset: toLocal(world[node], center), radius } } };
  });
  const springBone = {
    specVersion: '1.0',
    colliders,
    colliderGroups: [{ name: 'body', colliders: colliders.map((_c, i) => i) }],
    springs: spec.springs.map((spring) => ({
      name: spring.name,
      joints: spring.joints.map((joint) => ({
        node: need(joint),
        hitRadius: spring.hitRadius,
        stiffness: spring.stiffness,
        gravityPower: spring.gravity,
        gravityDir: [0, -1, 0],
        dragForce: spring.drag,
      })),
      colliderGroups: [0],
    })),
  };

  for (const material of json.materials) {
    const settings = spec.materials[material.name];
    if (!settings) throw new Error(`no MToon settings for material ${material.name}`);
    const pbr = (material.pbrMetallicRoughness ??= {});
    let base = (pbr.baseColorFactor ?? [1, 1, 1, 1]).slice(0, 3);
    if (settings.darken) base = darken(base, settings.darken);
    pbr.baseColorFactor = [...base.map((c) => round(c, 4)), settings.alpha ?? 1];
    pbr.metallicFactor = 0;
    pbr.roughnessFactor = 1;
    if (settings.alpha) material.alphaMode = 'BLEND';
    if (settings.emissive) material.emissiveFactor = [1, 1, 1].map((c) => c * settings.emissive);
    const shade = base.map((c, i) => round(c * settings.shadeTint[i], 4));
    const outline = settings.outline * (spec.height / 1.58);
    material.extensions = {
      ...material.extensions,
      VRMC_materials_mtoon: {
        specVersion: '1.0',
        transparentWithZWrite: false,
        renderQueueOffsetNumber: 0,
        shadeColorFactor: shade,
        shadingShiftFactor: settings.shift,
        shadingToonyFactor: settings.toony,
        giEqualizationFactor: 0.9,
        matcapFactor: [0, 0, 0],
        parametricRimColorFactor: [1, 0.86, 0.72].map((c) => round(c * settings.rim, 4)),
        rimLightingMixFactor: 1,
        parametricRimFresnelPowerFactor: 4,
        parametricRimLiftFactor: 0.04,
        outlineWidthMode: outline > 0 ? 'worldCoordinates' : 'none',
        outlineWidthFactor: round(outline, 5),
        outlineColorFactor: darken(base, 0.32),
        outlineLightingMixFactor: 1,
        uvAnimationScrollXSpeedFactor: 0,
        uvAnimationScrollYSpeedFactor: 0,
        uvAnimationRotationSpeedFactor: 0,
      },
    };
  }

  json.extensions = { ...json.extensions, VRMC_vrm: vrm, VRMC_springBone: springBone };
  const used = new Set(json.extensionsUsed ?? []);
  for (const name of ['VRMC_vrm', 'VRMC_springBone', 'VRMC_materials_mtoon']) used.add(name);
  json.extensionsUsed = [...used];
  json.asset = { ...json.asset, generator: `${json.asset?.generator ?? 'glTF'} + maple make-vrm` };
  // The game reads the posture and cast from the scene extras.
  json.scenes[json.scene ?? 0].extras = {
    cast: spec.cast,
    person: spec.person,
    posture: spec.posture ?? {},
  };
  return json;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const casts = process.argv.slice(2);
  if (!casts.length) throw new Error('usage: make-vrm.mjs <cast> [cast...]');
  mkdirSync(outDir, { recursive: true });
  for (const cast of casts) {
    const glb = readGlb(join(here, 'build', `${cast}.glb`));
    const spec = JSON.parse(readFileSync(join(here, 'build', `${cast}.vrm.json`), 'utf8'));
    makeVrm(glb.json, spec);
    const out = join(outDir, `${cast}.vrm`);
    writeGlb(out, glb);
    console.log(`wrote ${out}`);
  }
}
