/**
 * Turns the crowd-kit GLBs from build.py into VRM 1.0 files with the same step the VRM
 * cast uses (../vrm-cast/make-vrm.mjs): humanoid bones, expressions on Kit_LOD0's shape
 * keys, the expression look-at and MToon settings. Geometry is not touched; the game
 * replaces the material with its crowd material (apps/game/src/characters/crowd/).
 *
 *   node asset-src/characters/crowd-kit/make-kit.mjs [body ...]
 */
import { mkdirSync, readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { gzipSync } from 'node:zlib';
import { readGlb, writeGlb, encodeGlb } from '../../lib/glb.mjs';
import { makeVrm } from '../vrm-cast/make-vrm.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..', '..', '..');
const kit = JSON.parse(readFileSync(join(root, 'apps/game/src/characters/crowd/kit-spec.json')));
const outDir = join(root, 'apps/game/public/models/characters/crowd');
mkdirSync(outDir, { recursive: true });

const bodies = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(kit.bodies);
let total = 0;
let totalGz = 0;
for (const body of bodies) {
  const glb = readGlb(join(here, 'build', `${body}.glb`));
  const spec = JSON.parse(readFileSync(join(here, 'build', `${body}.vrm.json`), 'utf8'));
  makeVrm(glb.json, spec);
  glb.json.extensions.VRMC_vrm.meta.copyrightInformation =
    'Built by asset-src/characters/crowd-kit/build.py. No outside assets.';
  glb.json.scenes[glb.json.scene ?? 0].extras.kit = { body, version: kit.version };
  const out = join(outDir, `${body}.vrm`);
  writeGlb(out, glb);
  const bytes = statSync(out).size;
  const gz = gzipSync(encodeGlb(glb)).length;
  total += bytes;
  totalGz += gz;
  console.log(`wrote ${out} ${bytes} bytes (${gz} gzip)`);
}
console.log(`total ${total} bytes (${totalGz} gzip)`);
