/**
 * Retints a built VRM without rebuilding it: material colours and, optionally, its painted
 * texture. Geometry, bones, expressions and springs are left as they are.
 *
 *   node asset-src/characters/vrm-cast/retint.mjs <file.vrm> --extract <atlas.jpg>
 *   node asset-src/characters/vrm-cast/retint.mjs <file.vrm> [--texture <atlas.jpg>] \
 *     [--color skin=#cf8c5b ...] [--hide ribbon] [--name "Meera"]
 *
 * `--color` sets a material's base colour (sRGB hex) and moves its MToon shade and outline
 * colours by the same factor per channel, so the house shading keeps its shape. `--texture`
 * swaps the first embedded image (the painted atlas) for a new JPEG; the binary buffer is
 * rebuilt so the old image bytes do not stay behind. `--hide` cuts a material's surface out
 * completely and drops its outline (a tie on a student uniform). The skin recolour of an atlas is done
 * in Blender (concept-cast/retint_skin.py) between `--extract` and `--texture`.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { readGlb, writeGlb, round } from '../../lib/glb.mjs';

const srgbToLinear = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const hexLinear = (hex) =>
  [1, 3, 5].map((i) => srgbToLinear(parseInt(hex.slice(i, i + 2), 16) / 255));

/** Copy every buffer-0 byte range (plain or meshopt-compressed views) into a new buffer. */
function rebuildBuffer(json, bin, replace = new Map()) {
  const ranges = [];
  json.bufferViews.forEach((view, index) => {
    const ext = view.extensions?.EXT_meshopt_compression;
    if (ext) {
      if ((ext.buffer ?? 0) === 0) ranges.push({ owner: ext, index });
    } else if ((view.buffer ?? 0) === 0) ranges.push({ owner: view, index });
  });
  const parts = [];
  let offset = 0;
  for (const { owner, index } of ranges) {
    const start = owner.byteOffset ?? 0;
    const data = replace.get(index) ?? bin.subarray(start, start + owner.byteLength);
    const pad = (4 - (offset % 4)) % 4;
    if (pad) parts.push(Buffer.alloc(pad));
    offset += pad;
    owner.byteOffset = offset;
    owner.byteLength = data.length;
    parts.push(Buffer.from(data));
    offset += data.length;
  }
  const out = Buffer.concat(parts);
  json.buffers[0].byteLength = out.length;
  return out;
}

export function retint(glb, { colors = {}, texture = null, name = null, hide = [] } = {}) {
  const { json } = glb;
  for (const materialName of hide) {
    const material = json.materials.find((m) => m.name === materialName);
    if (!material) throw new Error(`no material ${materialName}`);
    material.alphaMode = 'MASK';
    material.alphaCutoff = 0.5;
    material.pbrMetallicRoughness.baseColorFactor[3] = 0;
    const mtoon = material.extensions?.VRMC_materials_mtoon;
    if (mtoon) {
      mtoon.outlineWidthMode = 'none';
      mtoon.outlineWidthFactor = 0;
    }
  }
  for (const [materialName, hex] of Object.entries(colors)) {
    const material = json.materials.find((m) => m.name === materialName);
    if (!material) throw new Error(`no material ${materialName}`);
    const pbr = material.pbrMetallicRoughness;
    const old = pbr.baseColorFactor.slice(0, 3);
    const next = hexLinear(hex);
    const ratio = next.map((c, i) => (old[i] > 1e-4 ? c / old[i] : 1));
    pbr.baseColorFactor = [...next.map((c) => round(c, 4)), pbr.baseColorFactor[3] ?? 1];
    const mtoon = material.extensions?.VRMC_materials_mtoon;
    if (mtoon) {
      const scale = (values) => values.map((c, i) => round(Math.min(1, c * ratio[i]), 4));
      mtoon.shadeColorFactor = scale(mtoon.shadeColorFactor);
      mtoon.outlineColorFactor = scale(mtoon.outlineColorFactor);
    }
  }
  if (texture) {
    const image = json.images?.[0];
    if (!image || image.bufferView === undefined) throw new Error('no embedded image to replace');
    image.mimeType = 'image/jpeg';
    glb.bin = rebuildBuffer(json, glb.bin, new Map([[image.bufferView, texture]]));
  }
  if (name) json.extensions.VRMC_vrm.meta.name = name;
  return glb;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const file = args.shift();
  const colors = {};
  let texture = null;
  let extract = null;
  let name = null;
  const hide = [];
  while (args.length) {
    const flag = args.shift();
    const value = args.shift();
    if (flag === '--color') {
      const [key, hex] = value.split('=');
      colors[key] = hex;
    } else if (flag === '--texture') texture = readFileSync(value);
    else if (flag === '--extract') extract = value;
    else if (flag === '--name') name = value;
    else if (flag === '--hide') hide.push(value);
    else throw new Error(`unknown option ${flag}`);
  }
  const glb = readGlb(file);
  if (extract) {
    const view = glb.json.bufferViews[glb.json.images[0].bufferView];
    const start = view.byteOffset ?? 0;
    writeFileSync(extract, glb.bin.subarray(start, start + view.byteLength));
    console.log(`wrote ${extract}`);
  } else {
    retint(glb, { colors, texture, name, hide });
    writeGlb(file, glb);
    console.log(`retinted ${file}`);
  }
}
