/** Bounded village grammar, version 1. Coordinates are metres; local +z faces the street. */
export const REGIONAL_BUILDING_TYPES = Object.freeze([
  'tile-home',
  'farmhouse',
  'shopfront',
  'storehouse',
  'snow-lodge',
  'harbour-shed',
]);
const themes = {
  farmland: ['farmhouse', 'tile-home', 'storehouse', 'shopfront'],
  terraces: ['farmhouse', 'storehouse', 'tile-home'],
  snow: ['snow-lodge', 'storehouse', 'snow-lodge'],
  mountain: ['snow-lodge', 'farmhouse', 'storehouse'],
  'alpine-lake': ['snow-lodge', 'tile-home', 'storehouse'],
  harbour: ['harbour-shed', 'shopfront', 'tile-home', 'storehouse'],
  city: ['shopfront', 'storehouse', 'tile-home'],
};
function randomFor(value) {
  let state = 2166136261;
  for (const character of String(value))
    state = Math.imul(state ^ character.charCodeAt(0), 16777619);
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}
/** One shared triangular roof prism; caller owns disposal, boxes reuse its own catalog. */
export function createRegionalArchitectureCatalog(THREE) {
  const gable = new THREE.BufferGeometry();
  gable.setAttribute(
    'position',
    new THREE.Float32BufferAttribute(
      [-0.5, 0, -0.5, 0.5, 0, -0.5, 0, 1, -0.5, -0.5, 0, 0.5, 0.5, 0, 0.5, 0, 1, 0.5],
      3,
    ),
  );
  gable.setIndex([0, 2, 1, 3, 4, 5, 0, 3, 5, 0, 5, 2, 2, 5, 4, 2, 4, 1, 0, 1, 4, 0, 4, 3]);
  const flat = gable.toNonIndexed();
  gable.dispose();
  flat.computeVertexNormals();
  return { gable: flat };
}
/** Emits plain instance descriptions into the caller's existing chunk batches. No scene/resources. */
export function addRegionalBuilding({
  emit,
  id,
  theme = 'farmland',
  type,
  x,
  y,
  z,
  yaw = 0,
  seed = 2719,
  isAllowed = () => true,
}) {
  if (![x, y, z, yaw].every(Number.isFinite))
    throw new TypeError('Building coordinates must be finite');
  const random = randomFor(`${seed}:${id}:${x}:${z}`);
  const choices = themes[theme] ?? ['tile-home', 'farmhouse', 'shopfront', 'storehouse'];
  const kind = type ?? choices[Math.floor(random() * choices.length)];
  if (!REGIONAL_BUILDING_TYPES.includes(kind))
    throw new RangeError('Unknown regional building type');
  const scale = 0.85 + random() * 0.3;
  const profiles = {
    'tile-home': [8, 4.1, 7, 1.8],
    farmhouse: [11, 3.6, 8, 3.3],
    shopfront: [6.8, 6.3, 7.5, 1.6],
    storehouse: [6, 6.8, 8, 2.2],
    'snow-lodge': [7.4, 4.4, 8.8, 4.5],
    'harbour-shed': [12, 3.8, 7, 1.5],
  };
  const [w, h, d, rise] = profiles[kind].map((n) => n * scale);
  const c = Math.cos(yaw),
    s = Math.sin(yaw);
  // Includes roof overhangs, porches and the farmhouse side shed.
  const localWidth = w + (kind === 'farmhouse' ? 5 * scale : 2 * scale);
  const localDepth = d + 5 * scale;
  const footprint = {
    minX: x - (Math.abs(c) * localWidth + Math.abs(s) * localDepth) / 2,
    maxX: x + (Math.abs(c) * localWidth + Math.abs(s) * localDepth) / 2,
    minZ: z - (Math.abs(s) * localWidth + Math.abs(c) * localDepth) / 2,
    maxZ: z + (Math.abs(s) * localWidth + Math.abs(c) * localDepth) / 2,
  };
  if (!isAllowed(footprint)) return null;
  let count = 0;
  const part = (material, px, py, pz, sx, sy, sz, geometry = 'box') => {
    emit({
      geometry,
      material,
      x: x + px * c + pz * s,
      y: y + py,
      z: z - px * s + pz * c,
      sx,
      sy,
      sz,
      yaw,
    });
    count++;
  };
  const timber = ['farmhouse', 'snow-lodge', 'harbour-shed'].includes(kind);
  const wall = timber ? 'timber' : 'cream';
  const roof = theme === 'snow' ? 'snow' : kind === 'harbour-shed' ? 'red' : 'roof';
  part('stone', 0, 0.23, 0, w + 0.6, 0.46, d + 0.6);
  part(wall, 0, 0.46 + h / 2, 0, w, h, d);
  part(roof, 0, h + 0.46, 0, w + 1.2, rise, d + 1.4, 'gable');
  part(roof, 0, h + rise + 0.53, 0, 0.24, 0.18, d + 1.6);
  const front = d / 2 + 0.07;
  const floors = ['shopfront', 'storehouse'].includes(kind) ? 2 : 1;
  for (let floor = 0; floor < floors; floor++) {
    for (const side of [-1, 1]) {
      const wy = 1.9 + (floor * h) / 2;
      part('timber', side * w * 0.28, wy, front, w * 0.25, 1.4, 0.17);
      part(
        kind === 'storehouse' ? 'rail' : 'glass',
        side * w * 0.28,
        wy,
        front + 0.1,
        w * 0.21,
        1.1,
        0.07,
      );
      part(wall, side * w * 0.28, wy, front + 0.15, 0.065, 1.12, 0.055);
    }
  }
  part('timber', 0, 1.55, front, 1.28, 2.3, 0.18);
  if (kind === 'tile-home' || kind === 'farmhouse' || kind === 'snow-lodge') {
    part('timber', 0, 0.62, front + 0.66, w * 0.94, 0.2, 1.45);
    for (const side of [-1, 1]) part('timber', side * w * 0.43, 1.9, front + 1.1, 0.17, 2.5, 0.17);
    part(roof, 0, 3.13, front + 0.7, w + 0.4, 0.16, 1.9);
  }
  if (kind === 'farmhouse') {
    part('timber', w / 2 + 0.9 * scale, 1.4, -0.6, 1.8 * scale, 2.8, d * 0.7);
    part(roof, w / 2 + 0.9 * scale, 2.8, -0.6, 2.3 * scale, 0.65, d * 0.8, 'gable');
    for (const side of [-1, 0, 1])
      part('timber', side * w * 0.43, h * 0.53, front + 0.18, 0.14, h * 0.94, 0.14);
  }
  if (kind === 'shopfront') {
    part('red', 0, 3.05, front + 0.78, w + 0.55, 0.24, 1.8);
    part('cream', 0, 3.75, front + 0.15, w * 0.75, 0.63, 0.22);
    for (const side of [-1, 0, 1]) part('red', side * 0.53, 2.57, front + 0.96, 0.45, 0.58, 0.09);
    part('timber', w * 0.34, 0.85, front + 0.84, 1.3, 0.72, 0.85);
  }
  if (kind === 'storehouse') {
    for (const side of [-1, 1])
      part('stone', side * (w / 2 - 0.17), h / 2 + 0.46, front, 0.36, h, 0.2);
    part('stone', 0, 0.95, front + 0.02, w, 0.85, 0.23);
    part('cream', 0, h / 2 + 0.4, front + 0.14, w + 0.35, 0.25, 0.3);
  }
  if (kind === 'snow-lodge') {
    part('glass', 0, h + rise * 0.22, front, 1.05, 1.1, 0.16);
    part('stone', w * 0.3, h + rise * 0.6, -d * 0.2, 0.75, rise * 1.1, 0.75);
  }
  if (kind === 'harbour-shed') {
    part('rail', 0, 1.93, front + 0.08, w * 0.45, 2.8, 0.13);
    for (let i = -2; i <= 2; i++)
      part('timber', i * w * 0.18, h * 0.55, front + 0.18, 0.12, h * 0.94, 0.14);
    for (const side of [-1, 1]) part('timber', side * w * 0.35, 0.85, front + 0.75, 1.1, 1.25, 1.1);
  }
  // Side and rear elevations: bounded windows, projecting sills, timber dividers, eave brackets.
  // Sills stay under the 0.6 roof overhang; brackets sit just below the gable base (h + 0.46).
  // The farmhouse +x side is occupied by its shed, so only its -x side is detailed.
  const sideX = w / 2 + 0.07;
  const rear = -(d / 2 + 0.07);
  const sideFloors = kind === 'shopfront' ? 2 : 1;
  const windowZ = kind === 'shopfront' || kind === 'storehouse' ? [0] : [-d * 0.22, d * 0.22];
  const sill = kind === 'storehouse' ? 'stone' : 'timber';
  const pane = kind === 'storehouse' || kind === 'harbour-shed' ? 'rail' : 'glass';
  const ww = kind === 'storehouse' ? 0.7 : kind === 'harbour-shed' ? 1.6 : 1.15;
  const wh = kind === 'storehouse' ? 0.7 : kind === 'harbour-shed' ? 1 : 1.3;
  const window = (px, py, pz, alongX) => {
    const [fx, fz] = alongX ? [0.17, ww] : [ww, 0.17];
    const [gx, gz] = alongX ? [0.07, ww - 0.3] : [ww - 0.3, 0.07];
    const [sx, sz] = alongX ? [0.28, ww + 0.2] : [ww + 0.2, 0.28];
    const out = alongX ? Math.sign(px) : Math.sign(pz);
    part('timber', px, py, pz, fx, wh, fz);
    part(pane, px + (alongX ? out * 0.1 : 0), py, pz + (alongX ? 0 : out * 0.1), gx, wh - 0.3, gz);
    part(
      sill,
      px + (alongX ? out * 0.12 : 0),
      py - wh / 2 - 0.05,
      pz + (alongX ? 0 : out * 0.12),
      sx,
      0.1,
      sz,
    );
  };
  for (const side of kind === 'farmhouse' ? [-1] : [-1, 1]) {
    for (let floor = 0; floor < sideFloors; floor++) {
      const wy = kind === 'storehouse' ? h * 0.72 : 1.9 + (floor * h) / 2;
      for (const wz of windowZ) window(side * sideX, wy, wz, true);
    }
    if (timber)
      for (const post of [-1, 1])
        part('timber', side * (sideX + 0.02), h * 0.53, post * d * 0.43, 0.14, h * 0.94, 0.14);
    for (const bracket of [-1, 1])
      part('timber', side * (sideX + 0.25), h + 0.28, bracket * d * 0.36, 0.5, 0.14, 0.14);
  }
  window(0, kind === 'storehouse' ? h * 0.72 : 1.9, rear, false);
  return {
    id,
    type: kind,
    theme,
    generationVersion: 1,
    seed,
    position: [x, y, z],
    yaw,
    footprint,
    height: h + rise + 0.7,
    instanceCount: count,
  };
}
