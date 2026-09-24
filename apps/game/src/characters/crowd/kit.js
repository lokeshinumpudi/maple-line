/**
 * The crowd kit's shared vocabulary: palette slots, base bodies and their parts. The same
 * JSON drives the Blender build (asset-src/characters/crowd-kit/build.py), so part ids and
 * slot numbers here always match the ones written into the meshes.
 *
 * A body's parts are numbered 0 (always drawn: skin, face, base clothes), then its hair
 * styles, then its outfits, then the shared accessories. A look is drawn by a 24-bit mask
 * of those ids. Adding a base body: see docs/CROWD.md.
 */
import spec from './kit-spec.json' with { type: 'json' };

export const KIT = spec;
export const SLOTS = Object.freeze([...spec.slots]);
export const SLOT_INDEX = Object.freeze(Object.fromEntries(SLOTS.map((name, i) => [name, i])));
export const ACCESSORIES = Object.freeze([...spec.accessories]);
export const BODY_IDS = Object.freeze(Object.keys(spec.bodies));
/** Palette texture columns; slots past the kit's own are spare. */
export const PALETTE_WIDTH = 32;
/** The mesh stores at most four outfit colourings per vertex. */
export const MAX_OUTFITS = 4;

const partCache = new Map();

/** { 'hair:bob': 1, 'outfit:coat': 7, 'acc:cap': 9, ... } for one body. */
export function partIds(bodyId) {
  if (partCache.has(bodyId)) return partCache.get(bodyId);
  const body = spec.bodies[bodyId];
  if (!body) throw new Error(`unknown crowd body ${bodyId}`);
  const ids = {};
  let n = 1;
  for (const hair of body.hair) ids[`hair:${hair}`] = n++;
  for (const outfit of body.outfits) ids[`outfit:${outfit}`] = n++;
  for (const acc of ACCESSORIES) ids[`acc:${acc}`] = n++;
  if (n > 24) throw new Error(`${bodyId} has more than 23 parts`);
  partCache.set(bodyId, Object.freeze(ids));
  return partCache.get(bodyId);
}

export function bodySpec(bodyId) {
  const body = spec.bodies[bodyId];
  if (!body) throw new Error(`unknown crowd body ${bodyId}`);
  return body;
}

/** Which of the body's (up to four) outfit colourings a look uses. */
export function outfitIndex(bodyId, outfit) {
  const index = bodySpec(bodyId).outfits.indexOf(outfit);
  return index < 0 ? 0 : index;
}

/** The part mask for a look: base, one hair style, one outfit, any accessories. */
export function partMask(bodyId, { hair, outfit, accessories = [] }) {
  const ids = partIds(bodyId);
  let mask = 1;
  const add = (key) => {
    if (ids[key] !== undefined) mask += 2 ** ids[key];
  };
  add(`hair:${hair}`);
  add(`outfit:${outfit}`);
  for (const acc of new Set(accessories)) add(`acc:${acc}`);
  return mask;
}

/** True when part `id` is drawn under `mask` (the shader's test, in JS for tests). */
export function maskHas(mask, id) {
  return Math.floor(mask / 2 ** id) % 2 === 1;
}
