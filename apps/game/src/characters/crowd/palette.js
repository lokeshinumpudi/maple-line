/**
 * One palette texture for the whole crowd: a row per person, a column per slot (kit.js).
 * RGB is the slot colour in sRGB (the texture is decoded to linear on sampling); alpha
 * marks the face decals, which the material lights flat like the hero VRMs' MToon decals.
 */
import { PALETTE_WIDTH, SLOTS } from './kit.js';

/** Slots drawn with flat (always lit) shading: the face decals. */
export const FLAT_SLOTS = new Set([
  'eyeWhite',
  'iris',
  'irisLight',
  'pupil',
  'glint',
  'line',
  'brow',
  'mouth',
  'blush',
  'nose',
]);

export function hexBytes(hex) {
  const value = String(hex ?? '#808080').replace('#', '');
  return [0, 2, 4].map((i) => parseInt(value.slice(i, i + 2), 16) || 0);
}

/** The bytes of one palette row for a look's colours (pure; tested). */
export function paletteRow(colors) {
  const row = new Uint8Array(PALETTE_WIDTH * 4);
  SLOTS.forEach((slot, i) => {
    const [r, g, b] = hexBytes(colors[slot]);
    row.set([r, g, b, FLAT_SLOTS.has(slot) ? 255 : 0], i * 4);
  });
  return row;
}

export function createPalette(THREE, { rows = 512 } = {}) {
  const data = new Uint8Array(PALETTE_WIDTH * rows * 4);
  const texture = new THREE.DataTexture(
    data,
    PALETTE_WIDTH,
    rows,
    THREE.RGBAFormat,
    THREE.UnsignedByteType,
  );
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.NearestFilter;
  texture.magFilter = THREE.NearestFilter;
  texture.generateMipmaps = false;
  texture.name = 'Crowd / palette';
  texture.needsUpdate = true;
  const byKey = new Map();
  const free = [];
  let next = 0;
  return {
    texture,
    /** The row for `key`, written from `colors` when new or when the colours changed. */
    acquire(key, colors) {
      let entry = byKey.get(key);
      if (!entry) {
        const row = free.length ? free.pop() : next < rows ? next++ : null;
        if (row === null) return 0;
        entry = { row, colors: null };
        byKey.set(key, entry);
      }
      if (entry.colors !== colors) {
        entry.colors = colors;
        data.set(paletteRow(colors), entry.row * PALETTE_WIDTH * 4);
        texture.needsUpdate = true;
      }
      return entry.row;
    },
    release(key) {
      const entry = byKey.get(key);
      if (!entry) return;
      byKey.delete(key);
      free.push(entry.row);
    },
    get used() {
      return byKey.size;
    },
    dispose() {
      texture.dispose();
    },
  };
}
