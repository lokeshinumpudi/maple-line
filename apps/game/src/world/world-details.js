import { createSurfaceDetail } from '../rendering/surface-detail.js';
import { createPopulation, READING_BENCH_X } from '../simulation/population.js';
// Authored countryside landmarks. All coordinates are relative to the winding river.
export const worldClearings = [
  { minZ: -455, maxZ: -280, minU: -140, maxU: -21 },
  { minZ: -265, maxZ: -95, minU: 38, maxU: 91 },
  { minZ: 78, maxZ: 145, minU: 38, maxU: 75 },
  { minZ: 52, maxZ: 68, minU: -80, maxU: 21 },
  { minZ: 536, maxZ: 567, minU: 30, maxU: 39 },
  { minZ: 615, maxZ: 815, minU: 52, maxU: 180 },
];

export function addWorldDetails({
  THREE,
  scene,
  center,
  terrain,
  riverProfile,
  worldSeed = 9041,
  settlement = 'town',
}) {
  const surfaceDetail = createSurfaceDetail();
  const root = new THREE.Group();
  root.name = 'Japanese countryside';
  scene.add(root);
  const batches = new Map(),
    peopleBatches = new Map(),
    geometries = new Set(),
    materials = new Set(),
    pedestrians = [];
  // People drawn by a loaded model instead of the instanced parts (see world/hero-cast.js).
  const standIns = new Set();
  // People the crowd kit draws (characters/crowd/), hidden here the same way.
  const crowdHidden = new Set();
  const homes = [];
  let area = 'Countryside',
    signTexture;
  const snowSurfaces = [],
    windows = [];
  let elapsed = 0,
    lastSnow = -1,
    lastDusk = null;
  let seed = worldSeed;
  const random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  const makeMat = (color, extra = {}) => {
    const m = new THREE.MeshStandardMaterial({
      color,
      roughness: 0.88,
      flatShading: true,
      ...extra,
    });
    materials.add(m);
    return m;
  };
  const palette = {
    stone: makeMat('#777d70'),
    stoneTop: makeMat('#a9aa8d'),
    wood: makeMat('#51463a'),
    timber: makeMat('#443e35'),
    plaster: makeMat('#dfd6b3'),
    cream: makeMat('#e9dfc3'),
    roof: makeMat('#53686a'),
    roof2: makeMat('#687678'),
    vermilion: makeMat('#a74631'),
    road: makeMat('#858577'),
    path: makeMat('#b7ab87'),
    water: makeMat('#789e8c', { metalness: 0.28, roughness: 0.17 }),
    rice: makeMat('#a5b258'),
    soil: makeMat('#73794a'),
    glass: makeMat('#527578', { metalness: 0.28, roughness: 0.3 }),
    window: makeMat('#e8d59a', { emissive: '#edb35e', emissiveIntensity: 0.05 }),
    ink: makeMat('#333e38'),
    red: makeMat('#a03f35'),
    silver: makeMat('#b4b5a2'),
    paper: makeMat('#ece8d9'),
    print: makeMat('#59605a'),
  };
  for (const [name, material] of Object.entries(palette)) material.name = `Countryside / ${name}`;
  for (const name of ['roof', 'roof2']) surfaceDetail.apply(palette[name], 'roof');
  for (const name of ['wood', 'timber']) surfaceDetail.apply(palette[name], 'timber');
  for (const name of ['stone', 'stoneTop', 'path']) surfaceDetail.apply(palette[name], 'stone');
  for (const name of ['plaster', 'cream']) surfaceDetail.apply(palette[name], 'plaster');
  windows.push(palette.window);
  snowSurfaces.push(
    [palette.roof, palette.roof.color.clone()],
    [palette.roof2, palette.roof2.color.clone()],
    [palette.rice, palette.rice.color.clone()],
    [palette.stoneTop, palette.stoneTop.color.clone()],
  );
  const boxGeo = new THREE.BoxGeometry(1, 1, 1),
    coneGeo = new THREE.ConeGeometry(1, 1, 8),
    sphereGeo = new THREE.IcosahedronGeometry(1, 1),
    cylinderGeo = new THREE.CylinderGeometry(1, 1, 1, 8);
  for (const g of [boxGeo, coneGeo, sphereGeo, cylinderGeo]) geometries.add(g);
  const dummy = new THREE.Object3D();
  function piece(geometry, material, x, y, z, sx, sy, sz, rotation = 0) {
    const key = `${area}:${geometry.uuid}:${material.uuid}`;
    if (!batches.has(key)) batches.set(key, { area, geometry, material, transforms: [] });
    dummy.position.set(x, y, z);
    dummy.scale.set(sx, sy, sz);
    dummy.rotation.set(0, rotation, 0);
    dummy.updateMatrix();
    batches.get(key).transforms.push(dummy.matrix.clone());
  }
  const block = (material, x, y, z, sx, sy, sz, rotation = 0) =>
    piece(boxGeo, material, x, y, z, sx, sy, sz, rotation);
  // Ridge runs along z. Extended eaves and a shallow second edge give tile roofs their silhouette.
  const roofGeo = new THREE.BufferGeometry();
  const rv = [
    -0.5, 0, -0.5, 0.5, 0, -0.5, 0, 1, -0.5, -0.5, 0, 0.5, 0, 1, 0.5, 0.5, 0, 0.5, -0.5, 0, -0.5, 0,
    1, -0.5, -0.5, 0, 0.5, -0.5, 0, 0.5, 0, 1, -0.5, 0, 1, 0.5, 0, 1, -0.5, 0.5, 0, -0.5, 0.5, 0,
    0.5, 0, 1, -0.5, 0.5, 0, 0.5, 0, 1, 0.5,
  ]; // Reverse each triangle so both gables and pitched slopes face outward.
  for (let i = 0; i < rv.length; i += 9)
    for (let axis = 0; axis < 3; axis++) {
      const v = rv[i + 3 + axis];
      rv[i + 3 + axis] = rv[i + 6 + axis];
      rv[i + 6 + axis] = v;
    }
  roofGeo.setAttribute('position', new THREE.Float32BufferAttribute(rv, 3));
  roofGeo.computeVertexNormals();
  geometries.add(roofGeo);
  function roof(x, y, z, w, h, d, material = palette.roof) {
    piece(roofGeo, material, x, y, z, w, h, d);
    block(palette.timber, x, y - 0.05, z, w, 0.18, d);
    block(material, x, y + h + 0.07, z, 0.26, 0.18, d + 0.35);
    for (const side of [-1, 1])
      block(material, x + side * w * 0.5, y + 0.02, z, 0.24, 0.16, d + 0.2);
  }
  function foundation(u, z, w, d) {
    const samples = [
      terrain(u - w / 2, z - d / 2),
      terrain(u + w / 2, z - d / 2),
      terrain(u - w / 2, z + d / 2),
      terrain(u + w / 2, z + d / 2),
    ];
    const top = Math.max(...samples) + 0.35;
    const bottom = Math.min(...samples) - 0.2;
    block(palette.stone, center(z) + u, (top + bottom) / 2, z, w, top - bottom, d);
    block(palette.stoneTop, center(z) + u, top + 0.12, z, w + 0.25, 0.24, d + 0.25);
    return top + 0.24;
  }
  function house(u, z, index) {
    const w = 7 + random() * 2,
      d = 9 + random() * 4,
      h = 4 + random() * 1.4,
      x = center(z) + u,
      y = foundation(u, z, w + 3, d + 3);
    const wall = index % 3 ? palette.plaster : palette.cream;
    homes.push({ u, z, y, w, d });
    block(wall, x, y + h / 2, z, w, h, d);
    for (const side of [-1, 1]) {
      block(palette.timber, x + side * (w / 2 - 0.12), y + h / 2, z, 0.22, h, d + 0.03);
      for (const zz of [-d * 0.32, 0, d * 0.32]) {
        block(palette.wood, x + side * (w / 2 + 0.02), y + 2.2, z + zz, 0.08, 2.4, 2.15);
        block(
          index % 3 === 0 ? palette.window : palette.glass,
          x + side * (w / 2 + 0.07),
          y + 2.3,
          z + zz,
          0.04,
          1.9,
          1.65,
        );
        block(palette.cream, x + side * (w / 2 + 0.1), y + 2.3, z + zz, 0.07, 1.95, 0.07);
        block(palette.cream, x + side * (w / 2 + 0.1), y + 2.3, z + zz, 0.07, 0.07, 1.7);
      }
    }
    for (const zz of [-d / 2, d / 2]) {
      block(palette.timber, x, y + 0.65, z + zz, w, 0.16, 0.09);
      block(palette.timber, x, y + h - 0.18, z + zz, w, 0.16, 0.09);
      block(palette.wood, x, y + 1.3, z + zz * 1.006, 1.25, 2.6, 0.08);
    }
    roof(x, y + h, z, w + 1.7, 1.8, d + 1.5, index % 2 ? palette.roof : palette.roof2);
    for (const side of [-1, 1]) {
      block(palette.silver, x + side * (w / 2 + 0.8), y + h - 0.12, z, 0.12, 0.12, d + 1.5);
      block(palette.silver, x + side * (w / 2 + 0.72), y + h * 0.5, z + d / 2 - 0.2, 0.1, h, 0.1);
    }
    // The rail-facing veranda, laundry, and small garden make each dwelling lived-in.
    block(palette.wood, x - w / 2 - 0.8, y + 0.4, z, 1.6, 0.25, d - 1);
    for (const zz of [-d * 0.35, d * 0.35])
      block(palette.timber, x - w / 2 - 1.4, y + 1.8, z + zz, 0.13, 3.2, 0.13);
    block(palette.roof, x - w / 2 - 0.85, y + 3.45, z, 2.15, 0.16, d);
    for (let k = 0; k < 3; k++)
      piece(
        sphereGeo,
        k === 1 ? palette.rice : palette.soil,
        x + w / 2 + 1,
        y + 0.4,
        z + (k - 1) * 2,
        0.65,
        0.6,
        0.7,
      );
    if (index % 2 === 0) {
      block(palette.red, x - w / 2 - 1, y + 1.05, z + d / 2 + 1, 0.62, 1.8, 0.5);
      block(palette.window, x - w / 2 - 1.33, y + 1.1, z + d / 2 + 1, 0.035, 0.9, 0.35);
    }
    if (index % 3 === 1) {
      for (const zz of [-2, 2])
        block(palette.wood, x + w / 2 + 0.7, y + 1.5, z + zz, 0.07, 3, 0.07);
      block(palette.silver, x + w / 2 + 0.7, y + 2.8, z, 0.035, 0.035, 4);
      for (let k = 0; k < 3; k++)
        block(
          k === 1 ? palette.cream : palette.glass,
          x + w / 2 + 0.7,
          y + 2.25,
          z - 1.3 + k * 1.15,
          0.07,
          1,
          0.7,
        );
    }
  }
  // A hamlet steps up the mountainside instead of occupying the railway clearance.
  area = 'Hillside hamlet';
  for (const [i, u, z] of [
    [0, 48, -235],
    [1, 49, -208],
    [2, 48, -178],
    [3, 49, -145],
    [4, 67, -220],
    [5, 69, -185],
    [6, 70, -148],
    [7, 49, -113],
  ])
    house(u, z, i);
  for (let z = -255; z < -93; z += 4) {
    const u = 39.5,
      x = center(z) + u,
      y = terrain(u, z) + 0.16;
    block(palette.path, x, y, z, 2.6, 0.25, 4.3, Math.atan2(center(z + 1) - center(z), 1));
  }
  // Doorway stairs meet each foundation and the village lane.
  for (const home of homes) {
    const x0 = center(home.z) + 39.5,
      x1 = center(home.z) + home.u - home.w / 2 - 0.8,
      y0 = terrain(39.5, home.z) + 0.285,
      y1 = home.y + 0.55,
      n = 12;
    for (let k = 0; k < n; k++) {
      const t = (k + 0.5) / n;
      block(
        palette.stoneTop,
        x0 + (x1 - x0) * t,
        y0 + (y1 - y0) * t - 0.12,
        home.z,
        Math.abs(x1 - x0) / n + 0.03,
        0.24,
        1.25,
      );
    }
  }
  area = 'Rice terraces';
  // Irrigated terraces reflect the sky; rows follow the horizontal terraces.
  for (let row = 0; row < 5; row++) {
    for (let section = 0; section < 3; section++) {
      const z = -425 + section * 48;
      let shore = -26;
      for (let zz = z - 22; zz <= z + 22; zz += 4) {
        if (riverProfile) {
          const r = riverProfile(zz);
          shore = Math.min(shore, r.offset - r.halfWidth - 10);
        }
      }
      const u = shore - row * 8;
      const w = 7,
        d = 41,
        x = center(z) + u,
        y = foundation(u, z, w, d);
      block(palette.soil, x, y + 0.14, z, w, 0.32, d);
      block(palette.water, x, y + 0.33, z, w - 0.7, 0.04, d - 1);
      for (let k = 0; k < 8; k++)
        block(palette.rice, x, y + 0.43, z - d / 2 + 3 + k * 4.8, w - 1, 0.2, 0.75);
      for (const edge of [-1, 1])
        block(palette.soil, x + edge * w * 0.5, y + 0.38, z, 0.4, 0.42, d + 1);
    }
  }
  area = 'Torii shrine';
  // Torii gate and small hillside shrine, with a stone stair approached from the line.
  const shrineZ = 110,
    shrineU = 53,
    shrineX = center(shrineZ) + shrineU,
    shrineY = foundation(shrineU, shrineZ, 12, 17);
  for (const dz of [-3.1, 3.1]) {
    block(palette.vermilion, shrineX - 4, shrineY + 3, shrineZ + dz, 0.58, 6, 0.58);
    block(palette.ink, shrineX - 4, shrineY + 0.35, shrineZ + dz, 0.68, 0.7, 0.68);
  }
  block(palette.vermilion, shrineX - 4, shrineY + 5.3, shrineZ, 0.48, 0.52, 8);
  block(palette.vermilion, shrineX - 4, shrineY + 6.1, shrineZ, 0.76, 0.6, 9);
  block(palette.ink, shrineX - 4, shrineY + 6.48, shrineZ, 0.9, 0.22, 9.4);
  block(palette.wood, shrineX + 2, shrineY + 1.7, shrineZ, 4.8, 3.4, 6.5);
  roof(shrineX + 2, shrineY + 3.4, shrineZ, 6.8, 2, 8, palette.roof);
  block(palette.vermilion, shrineX - 0.48, shrineY + 1.9, shrineZ, 0.08, 2.8, 3.9);
  for (let k = 0; k < 9; k++) {
    const u = 40 + k * 1.25,
      y = terrain(40, shrineZ) + ((shrineY - terrain(40, shrineZ)) * (k + 1)) / 9;
    block(palette.stoneTop, center(shrineZ) + u, y - 0.35, shrineZ, 1.3, 0.7, 3.6);
  }
  for (const dz of [-5.8, 5.8]) {
    piece(cylinderGeo, palette.stone, shrineX - 2, shrineY + 0.8, shrineZ + dz, 0.25, 1.6, 0.25);
    block(palette.window, shrineX - 2, shrineY + 1.95, shrineZ + dz, 0.65, 0.7, 0.65);
    roof(shrineX - 2, shrineY + 2.32, shrineZ + dz, 1.05, 0.5, 1.05, palette.stone);
  }
  area = 'Distant town';
  // A far town is a destination landmark. Small towers are grouped around a station quarter.
  const cityMaterials = ['#9aafa9', '#c2c4b5', '#829b99', '#b0b4a5'].map((color) => makeMat(color));
  const buildingCount = { rural: 10, town: 32, city: 48 }[settlement] ?? 32;
  const heightRange = { rural: [4, 4], town: [8, 27], city: [18, 40] }[settlement] ?? [8, 27];
  const citySites = createCitySites(random);
  for (let i = 0; i < buildingCount; i++) {
    const { z, u } = citySites[i];
    const w = 7 + random() * 8,
      d = 8 + random() * 10,
      h = heightRange[0] + random() * heightRange[1],
      x = center(z) + u,
      y = foundation(u, z, w, d);
    const material = cityMaterials[i % 4];
    block(material, x, y + h / 2, z, w, h, d);
    block(palette.roof, x, y + h + 0.2, z, w + 0.4, 0.4, d + 0.4);
    for (let floor = 0; floor < Math.floor(h / 3); floor++)
      for (let col = 0; col < 3; col++) {
        block(
          (floor + col + i) % 4 === 0 ? palette.window : palette.glass,
          x - w / 2 - 0.025,
          y + 2 + floor * 3,
          z + (col - 1) * d * 0.26,
          0.05,
          1.25,
          d * 0.16,
        );
        block(
          palette.glass,
          x + (col - 1) * w * 0.26,
          y + 2 + floor * 3,
          z - d / 2 - 0.025,
          w * 0.15,
          1.25,
          0.05,
        );
      }
    if (i % 4 === 0) {
      block(palette.silver, x, y + h + 1, z, w * 0.35, 2, d * 0.35);
    }
  }
  area = 'Village lantern lane';
  // Telegraph crossarms and paper lanterns along the village approach.
  for (let i = 0; i < 8; i++) {
    const z = -255 + i * 22,
      u = 37.5,
      x = center(z) + u,
      y = terrain(u, z);
    block(palette.wood, x, y + 3.5, z, 0.15, 7, 0.15);
    block(palette.wood, x, y + 6.6, z, 2.2, 0.13, 0.13);
    piece(sphereGeo, palette.window, x - 0.8, y + 2.8, z, 0.32, 0.48, 0.32);
  }
  const population = createPopulation({ center, terrain, homes });
  area = 'Momiji station furniture';
  const stationRotation = Math.atan2(center(526) - center(525), 1);
  const stationBlock = (material, x, y, z, w, h, d) => {
    const p = population.stationPoint(x, z, y);
    block(material, p.x, y, p.z, w, h, d, stationRotation);
  };
  // The middle bench stands in front of the station building, whose wall is at x 5.5
  // from z -20.5 to -9.5; at x 6.1 it (and the reader on it) would sit inside the wall.
  for (const [x, z] of [
    [6.1, -31],
    [READING_BENCH_X, -19],
    [6.1, -7],
  ]) {
    stationBlock(palette.wood, x, 5.87, z, 1.1, 0.17, 3.5);
    stationBlock(palette.wood, x + 0.55, 6.28, z, 0.13, 0.75, 3.5);
    for (const end of [-1, 1]) stationBlock(palette.ink, x, 5.58, z + end * 1.3, 0.8, 0.45, 0.14);
  }
  stationBlock(palette.red, 6.4, 6.45, 9, 1.05, 2.2, 0.9);
  stationBlock(palette.cream, 5.84, 6.7, 9, 0.05, 1.1, 0.69);
  stationBlock(palette.ink, 5.805, 5.85, 9, 0.025, 0.23, 0.56);
  for (let row = 0; row < 3; row++)
    for (let col = 0; col < 3; col++)
      stationBlock(
        col % 2 ? palette.vermilion : palette.window,
        5.8,
        6.37 + row * 0.27,
        8.78 + col * 0.22,
        0.024,
        0.15,
        0.12,
      );
  for (const z of [-39, 4]) {
    stationBlock(palette.wood, 6.6, 6.97, z, 0.15, 3.25, 0.15);
    stationBlock(palette.roof, 6.2, 8.58, z, 1.15, 0.16, 0.6);
    stationBlock(palette.window, 6.2, 8.43, z, 0.7, 0.12, 0.38);
  }
  // A gently rising entry ramp joins the existing platform at local z=14.
  for (let k = 0; k < 16; k++) {
    const z = 23 - ((k + 0.5) * 9) / 16,
      t = (k + 0.5) / 16,
      y = population.rampBottom.y + (5.35 - population.rampBottom.y) * t;
    stationBlock(palette.path, 5, y - 0.12, z, 2.3, 0.24, 9 / 16 + 0.02);
  }
  for (let z = 24; z <= 38; z += 2) {
    const p = population.stationPoint(5, z);
    const y = terrain(p.x - center(p.z), p.z) + 0.16;
    stationBlock(palette.path, 5, y, z, 2.3, 0.25, 2.05);
  }
  for (const z of [-35, -24, -13, -2]) {
    stationBlock(palette.cream, 3.6, 5.365, z, 0.55, 0.03, 0.12);
    stationBlock(palette.cream, 4.3, 5.365, z, 0.55, 0.03, 0.12);
  }
  if (typeof document !== 'undefined') {
    const canvas = document.createElement('canvas');
    canvas.width = 768;
    canvas.height = 192;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#234c42';
    ctx.fillRect(0, 0, 768, 192);
    ctx.fillStyle = '#f1e2b8';
    ctx.font = 'bold 67px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('もみじ   MOMIJI', 384, 89);
    ctx.font = '27px sans-serif';
    ctx.fillText('← RIVER BEND     LOCAL LINE     SAKURAGAWA →', 384, 145);
    const texture = new THREE.CanvasTexture(canvas),
      signMaterial = new THREE.MeshBasicMaterial({ map: texture, side: THREE.FrontSide });
    materials.add(signMaterial);
    const signGeo = new THREE.PlaneGeometry(5.3, 1.33);
    geometries.add(signGeo);
    const sign = new THREE.Mesh(signGeo, signMaterial),
      p = population.stationPoint(6.7, -1, 8.8);
    sign.name = 'Momiji station / bilingual destination board';
    sign.position.set(p.x, p.y, p.z);
    sign.rotation.y = stationRotation - Math.PI / 2;
    const back = new THREE.Mesh(signGeo, signMaterial);
    back.name = 'Momiji station / destination board platform face';
    back.rotation.y = Math.PI;
    back.position.z = -0.02;
    sign.add(back);
    root.add(sign);
    signTexture = texture;
  }
  if (riverProfile) {
    area = 'River footbridge';
    const z = 60,
      r = riverProfile(z),
      left = r.offset - r.halfWidth - 2.8,
      right = Math.min(20.1, r.offset + r.halfWidth + 3.8),
      y = Math.max(terrain(left, z), terrain(right, z), 3.4) + 0.4;
    // Deck and railings stay entirely outside the railway shelf at u24..32.
    block(palette.wood, center(z) + (left + right) / 2, y - 0.14, z, right - left, 0.28, 2.3);
    for (let u = left + 0.4; u < right; u += 2.2)
      for (const side of [-1, 1])
        block(palette.wood, center(z) + u, y + 0.62, z + side * 1.13, 0.12, 1.3, 0.12);
    for (const side of [-1, 1]) {
      block(
        palette.wood,
        center(z) + (left + right) / 2,
        y + 1.17,
        z + side * 1.13,
        right - left,
        0.12,
        0.13,
      );
      block(
        palette.wood,
        center(z) + (left + right) / 2,
        y + 0.56,
        z + side * 1.13,
        right - left,
        0.08,
        0.08,
      );
    }
    for (const u of [left + 0.8, right - 0.8])
      for (const side of [-1, 1]) {
        const bottom = terrain(u, z);
        block(
          palette.stone,
          center(z) + u,
          (y + bottom) / 2,
          z + side * 0.7,
          0.65,
          Math.max(0.3, y - bottom),
          0.65,
        );
      }
    for (const [edge, direction] of [
      [left, -1],
      [right, 1],
    ])
      for (let k = 0; k < 7; k++) {
        const u = edge + direction * (k + 0.5) * 0.55;
        if (u + 0.275 >= 21) continue;
        const base = terrain(u, z),
          top = y + ((base - y) * (k + 1)) / 7;
        block(palette.stoneTop, center(z) + u, top - 0.12, z, 0.59, 0.24, 2.3);
      }
  }
  for (const { area: label, geometry, material, transforms } of batches.values()) {
    const inst = new THREE.InstancedMesh(geometry, material, transforms.length);
    inst.name = `${label} / ${material.name || 'building facade'}`;
    transforms.forEach((matrix, i) => inst.setMatrixAt(i, matrix));
    inst.castShadow = ![
      palette.window,
      palette.glass,
      palette.silver,
      palette.water,
      palette.rice,
      palette.path,
    ].includes(material);
    inst.receiveShadow = true;
    root.add(inst);
  }
  // People share one instanced draw per geometry/material in each settlement.
  // Only coats cast shadows; small heads, fingers, and legs do not need a shadow pass.
  const coatMaterials = ['#4d6669', '#b17750', '#6d735b', '#8f5c4b', '#e0c489'].map((color) =>
    makeMat(color),
  );
  coatMaterials.forEach((material, i) => (material.name = `Resident coat / ${i + 1}`));
  function person(agent, index) {
    const onPlatform = !agent.village,
      group = new THREE.Group();
    group.name = `Resident / ${agent.id} / ${agent.role}`;
    group.userData.populationId = agent.id;
    root.add(group);
    group.position.set(agent.position.x, agent.position.y, agent.position.z);
    const coat = coatMaterials[agent.coat % 5],
      parts = [];
    const part = (
      geo,
      material,
      x,
      y,
      z,
      sx,
      sy,
      sz,
      casts = false,
      weatherOnly = false,
      poseOnly = '',
    ) => {
      const key = `${onPlatform}:${geo.uuid}:${material.uuid}:${casts}`;
      if (!peopleBatches.has(key))
        peopleBatches.set(key, { geometry: geo, material, casts, parts: [], mesh: null });
      const batch = peopleBatches.get(key),
        local = new THREE.Object3D();
      local.position.set(x, y, z);
      local.scale.set(sx, sy, sz);
      const item = {
        local,
        group,
        batch,
        index: batch.parts.length,
        weatherOnly,
        poseOnly,
        slot: null,
        position: local.position.clone(),
        rotation: local.rotation.clone(),
        scale: local.scale.clone(),
      };
      batch.parts.push(item);
      parts.push(item);
      local.userData.item = item;
      return local;
    };
    // Palette slot per part, so the crowd can tint this far figure to the person's look.
    const slot = (local, name) => {
      local.userData.item.slot = name;
      return local;
    };
    const head = slot(part(sphereGeo, palette.cream, 0, 1.52, 0, 0.18, 0.22, 0.18), 'skin');
    const hair = slot(part(sphereGeo, palette.ink, 0, 1.66, -0.025, 0.195, 0.13, 0.19), 'hair');
    const torso = slot(part(boxGeo, coat, 0, 0.99, 0, 0.46, 0.74, 0.3, true), 'top');
    const legs = [
      slot(part(boxGeo, palette.ink, -0.12, 0.32, 0, 0.16, 0.64, 0.18), 'lower'),
      slot(part(boxGeo, palette.ink, 0.12, 0.32, 0, 0.16, 0.64, 0.18), 'lower'),
    ];
    const arms = [
      slot(part(boxGeo, coat, -0.3, 1.02, 0, 0.14, 0.65, 0.16, true), 'top'),
      slot(part(boxGeo, coat, 0.3, 1.02, 0, 0.14, 0.65, 0.16, true), 'top'),
    ];
    const bag = slot(part(boxGeo, palette.wood, 0.36, 0.63, 0, 0.2, 0.35, 0.26), 'bag');
    for (const side of [-1, 1]) {
      slot(
        part(
          boxGeo,
          palette.ink,
          side * 0.12,
          0.36,
          0.38,
          0.16,
          0.62,
          0.18,
          false,
          false,
          'reading',
        ),
        'lower',
      );
      slot(
        part(
          boxGeo,
          palette.ink,
          side * 0.12,
          0.055,
          0.45,
          0.18,
          0.11,
          0.3,
          false,
          false,
          'reading',
        ),
        'shoes',
      );
      slot(
        part(
          sphereGeo,
          palette.cream,
          side * 0.3,
          1.05,
          0.49,
          0.08,
          0.085,
          0.07,
          false,
          false,
          'reading',
        ),
        'skin',
      );
    }
    part(boxGeo, palette.paper, 0, 1.14, 0.53, 0.78, 0.47, 0.025, false, false, 'reading');
    part(boxGeo, palette.print, 0, 1.3, 0.547, 0.66, 0.035, 0.01, false, false, 'reading');
    for (const side of [-1, 1])
      for (let row = 0; row < 5; row++)
        part(
          boxGeo,
          palette.print,
          side * 0.18,
          1.23 - row * 0.05,
          0.547,
          0.28,
          0.012,
          0.01,
          false,
          false,
          'reading',
        );
    slot(
      part(
        coneGeo,
        index % 2 ? palette.vermilion : palette.roof,
        0,
        2.18,
        0,
        0.95,
        0.34,
        0.95,
        false,
        true,
      ),
      'umbrella',
    );
    part(cylinderGeo, palette.silver, 0.15, 1.7, 0, 0.016, 1.1, 0.016, false, true);
    pedestrians.push({
      group,
      legs,
      arms,
      head,
      hair,
      torso,
      bag,
      parts,
      agent,
      phase: index * 2.4,
      onPlatform,
      lookTurn: 0,
      crowd: {
        id: agent.id,
        source: 'momiji',
        role: agent.role,
        position: group.position,
        heading: 0,
        walking: false,
        pose: 'standing',
        state: '',
        visible: true,
        intent: null,
        seatHeight: 0.61,
        region: 'forest',
      },
    });
  }
  population.people.forEach(person);
  const personMatrix = new THREE.Matrix4();
  const tint = new THREE.Color();
  for (const batch of peopleBatches.values()) {
    const mesh = new THREE.InstancedMesh(batch.geometry, batch.material, batch.parts.length);
    batch.mesh = mesh;
    mesh.name = `Residents / ${batch.material.name || 'coat'}`;
    mesh.castShadow = batch.casts;
    mesh.receiveShadow = true;
    // The small actor pool travels between village and station; initial bounds cannot cover its paths.
    mesh.frustumCulled = false;
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    root.add(mesh);
    for (const part of batch.parts) {
      part.group.updateMatrix();
      part.local.updateMatrix();
      personMatrix.multiplyMatrices(part.group.matrix, part.local.matrix);
      mesh.setMatrixAt(part.index, personMatrix);
    }
    mesh.computeBoundingSphere();
    mesh.boundingSphere.radius += 55;
  }
  // Mind cues on existing parts: body/head turn, posture, and one-arm gestures. No allocations.
  function expressPerson(person, expression, context, dt) {
    if (!expression) return;
    const agent = person.agent;
    let target = NaN;
    if (expression.lookAt === 'train' && context.trainPosition) {
      target = Math.atan2(
        context.trainPosition[0] - agent.position.x,
        context.trainPosition[2] - agent.position.z,
      );
    } else if (expression.lookAt === 'neighbour') {
      let best = 16;
      for (const other of pedestrians) {
        if (other === person || !other.agent.visible) continue;
        const dx = other.agent.position.x - agent.position.x,
          dz = other.agent.position.z - agent.position.z,
          d = dx * dx + dz * dz;
        if (d < best) {
          best = d;
          target = Math.atan2(dx, dz);
        }
      }
    }
    let turn = Number.isFinite(target)
      ? Math.atan2(Math.sin(target - agent.heading), Math.cos(target - agent.heading))
      : expression.headTurn * 0.5;
    turn = Math.max(agent.walking ? -0.35 : -1.3, Math.min(agent.walking ? 0.35 : 1.3, turn));
    person.lookTurn += (turn - person.lookTurn) * (1 - Math.exp(-(dt || 0) * 3));
    // Standing people turn their whole body; walkers only glance, shown by the hair offset.
    if (!agent.walking) person.group.rotation.y = agent.heading + person.lookTurn;
    const glance = agent.walking ? person.lookTurn : 0;
    person.hair.position.x += Math.sin(glance) * -0.03;
    if (expression.lookAt === 'sky') {
      person.head.position.z -= 0.02;
      person.hair.position.set(person.hair.position.x, 1.63, -0.07);
    } else if (expression.lookAt === 'ground') {
      person.head.position.z += 0.05;
      person.head.position.y -= 0.03;
      person.hair.position.set(person.hair.position.x, 1.64, 0.03);
    }
    if (expression.posture === 'slumped') {
      person.torso.rotation.x = 0.12;
      person.head.position.y -= 0.04;
      person.head.position.z += 0.04;
      person.hair.position.y -= 0.04;
      person.hair.position.z += 0.04;
    } else if (expression.posture === 'eager') {
      person.torso.rotation.x = -0.05;
      person.head.position.y += 0.02;
      person.hair.position.y += 0.02;
    }
    if (agent.walking) return;
    const wave = Math.sin(elapsed * 7 + person.phase);
    const arm = person.arms[1];
    // Arm boxes rotate about their centres, so raised arms are also moved up beside the head.
    if (expression.intent === 'wave') {
      arm.position.set(0.42, 1.5, 0);
      arm.rotation.z = 2.75 + wave * 0.2;
    } else if (expression.intent === 'check-phone') {
      arm.position.set(0.2, 1.05, 0.2);
      arm.rotation.x = -1.2;
    } else if (expression.intent === 'stretch') {
      const reach = Math.sin(elapsed * 1.5 + person.phase) * 0.12;
      person.arms[0].position.set(-0.36, 1.52, 0);
      person.arms[0].rotation.z = -2.9 - reach;
      arm.position.set(0.36, 1.52, 0);
      arm.rotation.z = 2.9 + reach;
    } else {
      const sway = Math.sin(elapsed * 2.2 + person.phase) * expression.gestureRate;
      person.arms[0].rotation.z = sway * 0.08;
      arm.rotation.z = expression.intent === 'chat' ? -0.45 - sway * 0.2 : -sway * 0.08;
    }
  }
  return {
    root,
    getPopulationState: () => population.getState(),
    /** Hide or show one person's instanced figure while a model stands in for them. */
    setStandIn(id, enabled) {
      if (enabled) standIns.add(id);
      else standIns.delete(id);
    },
    /** Momiji people for the crowd kit (characters/crowd/crowd.js), except hero stand-ins. */
    crowdPeople(push) {
      for (const person of pedestrians) {
        const agent = person.agent;
        // Riders are reported by their carriage (train/interior.js) while aboard.
        if (standIns.has(agent.id) || !agent.visible) continue;
        const record = person.crowd;
        record.heading = person.group.rotation.y;
        record.walking = Boolean(agent.walking);
        record.pose = agent.pose ?? 'standing';
        record.state = agent.state;
        record.visible = agent.visible;
        record.intent = agent.pose === 'talking' ? 'chat' : null;
        push(record);
      }
    },
    /** Hide or show one person's instanced figure while the crowd kit draws them. */
    setCrowdHidden(id, hidden) {
      if (hidden) crowdHidden.add(id);
      else crowdHidden.delete(id);
    },
    /** Tint one person's simple figure to a crowd look's palette (far tier). */
    tintPerson(id, look) {
      const person = pedestrians.find((item) => item.agent.id === id);
      if (!person || !look) return;
      for (const item of person.parts) {
        const hex = item.slot && look.colors[item.slot];
        if (!hex) continue;
        tint.set(hex);
        const base = item.batch.material.color;
        tint.setRGB(
          tint.r / Math.max(base.r, 0.02),
          tint.g / Math.max(base.g, 0.02),
          tint.b / Math.max(base.b, 0.02),
        );
        item.batch.mesh.setColorAt(item.index, tint);
        item.batch.mesh.instanceColor.needsUpdate = true;
      }
    },
    /** Live placement of one person's figure, for a stand-in model to follow. */
    figureOf(id) {
      const person = pedestrians.find((item) => item.agent.id === id);
      if (!person) return null;
      const agent = person.agent;
      return {
        position: person.group.position,
        heading: agent.heading,
        visible: agent.visible,
        walking: Boolean(agent.walking),
        pose: agent.pose ?? 'standing',
        state: agent.state,
      };
    },
    update(dt, context = {}) {
      elapsed += dt;
      surfaceDetail.update(dt || 1 / 60, context.weather);
      // Optional NPC minds: report where each person is, then let movement read expressions.
      const minds = context.minds;
      if (minds)
        for (const agent of population.people)
          minds.sense(
            agent.id,
            agent.role,
            agent.position.x,
            agent.position.z,
            agent.walking,
            population.platformAt(agent.position.x, agent.position.z),
            agent.visible,
            agent.state,
          );
      population.update(dt, context);
      const wet = context.weather === 'rain' || context.weather === 'snow';
      const snow = context.weather === 'snow' ? 1 : 0;
      if (snow !== lastSnow) {
        for (const [material, original] of snowSurfaces)
          material.color.copy(original).lerp(new THREE.Color('#e5ede7'), snow * 0.85);
        lastSnow = snow;
      }
      if (context.dusk !== lastDusk) {
        for (const material of windows) material.emissiveIntensity = context.dusk ? 1.1 : 0.08;
        lastDusk = context.dusk;
      }
      for (const person of pedestrians) {
        const agent = person.agent;
        person.group.position.set(agent.position.x, agent.position.y, agent.position.z);
        person.group.rotation.y = agent.heading;
        person.group.userData.state = agent.state;
        person.group.userData.destination = agent.destination;
        person.group.userData.pose = agent.pose ?? 'standing';
        for (const part of person.parts) {
          part.local.position.copy(part.position);
          part.local.rotation.copy(part.rotation);
          part.local.scale.copy(part.scale);
        }
        person.legs[0].rotation.x = agent.walking ? Math.sin(elapsed * 5 + person.phase) * 0.3 : 0;
        person.legs[1].rotation.x = -person.legs[0].rotation.x;
        if (agent.pose === 'reading') {
          for (let i = 0; i < 2; i++) {
            person.legs[i].position.set(i ? 0.12 : -0.12, 0.7, 0.18);
            person.legs[i].rotation.x = Math.PI / 2;
            person.legs[i].scale.y = 0.42;
            person.arms[i].position.z = 0.24;
            person.arms[i].rotation.x = -0.9;
          }
          person.head.rotation.x = 0.12;
          person.bag.position.set(0.48, 0.18, -0.05);
        } else if (agent.pose === 'helping') {
          person.torso.rotation.x = 0.65;
          person.torso.position.set(0, 0.88, 0.17);
          person.head.position.set(0, 1.2, 0.43);
          person.hair.position.set(0, 1.34, 0.41);
          for (const arm of person.arms) {
            arm.position.set(arm.position.x, 0.7, 0.39);
            arm.rotation.x = 0.6;
          }
        } else if (agent.pose === 'talking') {
          person.arms[1].rotation.z = -0.7 - Math.sin(elapsed * 2.2) * 0.13;
          person.arms[1].position.y = 1.13;
        }
        if (agent.bagDropped) person.bag.position.set(0.28, 0.18, 0.58);
        if (minds && agent.visible && (agent.pose ?? 'standing') === 'standing')
          expressPerson(person, minds.expressionFor(agent.id), context, dt);
        person.group.updateMatrix();
        for (const part of person.parts) {
          if (
            !agent.visible ||
            standIns.has(agent.id) ||
            crowdHidden.has(agent.id) ||
            (part.weatherOnly && (!wet || agent.pose === 'reading')) ||
            (part.poseOnly && agent.pose !== part.poseOnly)
          )
            part.local.scale.setScalar(0);
          part.local.updateMatrix();
          personMatrix.multiplyMatrices(person.group.matrix, part.local.matrix);
          part.batch.mesh.setMatrixAt(part.index, personMatrix);
        }
      }
      for (const batch of peopleBatches.values()) batch.mesh.instanceMatrix.needsUpdate = true;
    },
    dispose() {
      surfaceDetail.dispose();
      root.traverse((object) => {
        if (object.isInstancedMesh) object.dispose();
      });
      scene.remove(root);
      signTexture?.dispose();
      for (const geometry of geometries) geometry.dispose();
      for (const material of materials) material.dispose();
    },
  };
}

/** Spaced sites keep the largest building footprints apart, even along river bends. */
export function createCitySites(random) {
  const sites = Array.from({ length: 48 }, (_, i) => ({
    u: 62 + (i % 6) * 19,
    z: 642 + Math.floor(i / 6) * 21,
  }));
  for (let i = sites.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [sites[i], sites[j]] = [sites[j], sites[i]];
  }
  return sites;
}
