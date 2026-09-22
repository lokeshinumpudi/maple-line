import { createSurfaceDetail } from '../rendering/surface-detail.js';
/** Fictional Tokyo-inspired passage. World metres; seed 7319, generation version 3.
 * Fixed 40 m cells belong to the regional chunk containing their centre.
 * Each chunk owns its batches, materials and atlas; no separate streaming system.
 */
export const TOKYO_PASSAGE = Object.freeze({
  start: 21600,
  end: 23960,
  entry: 22160,
  seed: 7319,
  version: 3,
});
const smooth = (v) => {
  const t = Math.max(0, Math.min(1, v));
  return t * t * (3 - 2 * t);
};
export function tokyoDistrictWeight(z, lateral) {
  // Preserve the authored Harumi platform/station terrace inside the wider city shelf.
  const station =
    smooth((40 - Math.abs(z - 23300)) / 8) * smooth((lateral - 6) / 2) * smooth((24 - lateral) / 3);
  return (
    smooth((z - 21360) / 240) *
    smooth((24200 - z) / 240) *
    (1 - smooth((Math.abs(lateral) - 240) / 100)) *
    (1 - station)
  );
}
/** Height and street intensity grow from low-rise suburbs into the centre, then recede. */
export function tokyoUrbanIntensity(z) {
  return smooth((z - 21600) / 660) * smooth((23960 - z) / 560);
}
const hash = (n) => {
  let v = (n + TOKYO_PASSAGE.seed) | 0;
  v = Math.imul(v ^ (v >>> 16), 0x45d9f3b);
  v = Math.imul(v ^ (v >>> 16), 0x45d9f3b);
  return ((v ^ (v >>> 16)) >>> 0) / 4294967296;
};
export function tokyoCells(start, end) {
  return Array.from({ length: (TOKYO_PASSAGE.end - TOKYO_PASSAGE.start) / 40 }, (_, id) => ({
    id,
    z: TOKYO_PASSAGE.start + 20 + id * 40,
  })).filter((cell) => cell.z >= start && cell.z < end);
}
export function createTokyoPassage({ THREE, parent, railPoint, start, end }) {
  const cells = tokyoCells(start, end);
  if (!cells.length) return null;
  const group = new THREE.Group();
  group.name = 'Tokyo passage / connected city streets';
  parent.add(group);
  const box = new THREE.BoxGeometry(1, 1, 1);
  const sphere = new THREE.SphereGeometry(1, 8, 6);
  const plane = new THREE.PlaneGeometry(1, 1);
  const umbrellaGeo = new THREE.SphereGeometry(1, 10, 5, 0, Math.PI * 2, 0, Math.PI / 2);
  const solid = new THREE.MeshStandardMaterial({
    color: '#ffffff',
    roughness: 0.72,
    metalness: 0.2,
  });
  const surfaceDetail = createSurfaceDetail();
  const facade = solid.clone();
  facade.name = 'Tokyo / weathered facade panels';
  surfaceDetail.apply(facade, 'plaster');
  const road = new THREE.MeshStandardMaterial({
    color: '#252e42',
    roughness: 0.65,
    metalness: 0.28,
  });
  const light = new THREE.MeshBasicMaterial({ color: '#ffffff', toneMapped: false });
  const glass = new THREE.MeshStandardMaterial({
    color: '#254a61',
    roughness: 0.19,
    metalness: 0.65,
  });
  const materials = [solid, facade, road, light, glass],
    textures = [];
  const cameraObstacles = [];
  const batches = new Map(),
    animated = [];
  const dummy = new THREE.Object3D(),
    color = new THREE.Color();
  const cyan = '#46e9ec',
    pink = '#ff599f',
    amber = '#ffc879';
  let lastPoseTime = -1;
  let elapsed = 0,
    disposed = false;
  function record(material, geometry, x, y, z, sx, sy, sz, tint = '#ffffff', yaw = 0, pitch = 0) {
    const key = `${material.uuid}:${geometry.uuid}`;
    if (!batches.has(key)) batches.set(key, { material, geometry, entries: [] });
    const p = railPoint(z);
    // Pavement and light decals share the grade, avoiding sliced-up glows on a slope.
    if ((geometry === box && y < 0.2 && sy < 0.5) || (geometry === plane && material === spill)) {
      const slope = Math.atan((railPoint(z + 1).y - railPoint(z - 1).y) / 2);
      pitch = (geometry === plane ? -Math.PI / 2 : 0) - slope;
    }
    batches.get(key).entries.push({ x: p.x + x, y: p.y + y, z, sx, sy, sz, tint, yaw, pitch });
  }
  const block = (mat, x, y, z, sx, sy, sz, tint, yaw) =>
    record(mat, box, x, y, z, sx, sy, sz, tint, yaw);
  let glowTexture = null;
  if (typeof document !== 'undefined') {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 64;
    const context = canvas.getContext('2d');
    if (context) {
      const gradient = context.createRadialGradient(32, 32, 0, 32, 32, 32);
      gradient.addColorStop(0, '#ffffff');
      gradient.addColorStop(0.3, '#ffffffaa');
      gradient.addColorStop(1, '#ffffff00');
      context.fillStyle = gradient;
      context.fillRect(0, 0, 64, 64);
      glowTexture = new THREE.CanvasTexture(canvas);
      textures.push(glowTexture);
    }
  }
  const spill = new THREE.MeshBasicMaterial({
    map: glowTexture,
    transparent: true,
    opacity: 0.22,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
  });
  materials.push(spill);
  const labels = ['ネオン通り', '夜の喫茶', 'レコード', '晴海電気', '東京 / TOKYO', '星のホテル'];
  const signs = labels.map((label, i) => {
    let texture = null;
    if (typeof document !== 'undefined') {
      const canvas = document.createElement('canvas');
      canvas.width = 512;
      canvas.height = 256;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.fillStyle = '#10172e';
        ctx.fillRect(0, 0, 512, 256);
        ctx.strokeStyle = [cyan, pink, amber][i % 3];
        ctx.lineWidth = 9;
        ctx.strokeRect(8, 8, 496, 240);
        ctx.fillStyle = ctx.strokeStyle;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.font = 'bold 56px sans-serif';
        ctx.fillText(label, 256, 105, 470);
        ctx.font = '24px sans-serif';
        ctx.fillStyle = '#e3faff';
        ctx.fillText(
          [
            'NIGHT LINE',
            'COFFEE • OPEN',
            'SOUND & RECORDS',
            'ELECTRIC AVENUE',
            'CITY LIGHTS',
            'STAR HOTEL',
          ][i],
          256,
          184,
          450,
        );
        texture = new THREE.CanvasTexture(canvas);
        texture.colorSpace = THREE.SRGBColorSpace;
        textures.push(texture);
      }
    }
    const material = new THREE.MeshBasicMaterial({
      map: texture,
      color: texture ? '#ffffff' : [cyan, pink, amber][i % 3],
      toneMapped: false,
      side: THREE.DoubleSide,
    });
    materials.push(material);
    return material;
  });
  for (const { id, z } of cells) {
    const intensity = tokyoUrbanIntensity(z);
    for (const side of [-1, 1]) {
      for (let step = -17.5; step < 20; step += 5)
        block(solid, side * 122, -0.58, z + step, 224, 0.1, 5.1, '#364255');
      // The street follows the railway shelf, separated from the track by a fence.
      for (let step = -17.5; step < 20; step += 5) {
        if (side > 0 && Math.abs(z + step - 23300) < 40) {
          block(road, 33, -0.48, z + step, 7, 0.16, 5.1);
          continue;
        }
        block(road, side * 22, -0.48, z + step, 15, 0.16, 5.1);
        block(solid, side * 33, -0.32, z + step, 7, 0.35, 5.1, '#707b8d');
        block(solid, side * 11, -0.32, z + step, 5, 0.35, 5.1, '#636c7d');
        block(light, side * 22, -0.385, z + step, 0.13, 0.025, 2, '#d3c9a5');
        block(solid, side * 8.3, 0.48, z + step, 0.1, 1.8, 0.1, '#405268');
        block(solid, side * 8.3, 0.9, z + step, 0.09, 0.08, 5.1, '#5b7185');
      }
      // Crosswalks cross the road only; no scenery enters the railway clearance.
      for (let stripe = -3; stripe <= 3; stripe++)
        if (!(side > 0 && Math.abs(z - 23300) < 45))
          block(solid, side * 22, -0.375, z + 15 + stripe * 0.65, 14, 0.025, 0.35, '#c4d4da');
      block(solid, side * 31, 3.6, z + 9, 0.16, 8, 0.16, '#43516a');
      block(light, side * 30, 7.5, z + 9, 2.3, 0.12, 0.5, amber);
      const h =
        6 +
        intensity *
          (side > 0 ? [14, 24, 18, 36, 12][id % 5] + hash(id * 17) * 9 : 6 + hash(id * 19) * 12);
      const width = 15 + hash(id * 31) * 8,
        depth = 25 + hash(id * 37) * 7;
      const x = side * (39 + width / 2),
        neon = [cyan, pink, amber][(id + (side > 0 ? 1 : 0)) % 3];
      block(facade, x, h / 2 - 0.4, z, width, h, depth, ['#655463', '#2e4054', '#565c68'][id % 3]);
      block(solid, x, h + 0.4, z, width + 0.8, 1.3, depth + 0.8, '#526077');
      block(solid, x + side * 2, h + 2.2, z + 4, 4, 3, 5, '#38485f');
      const rail = railPoint(z);
      cameraObstacles.push(
        new THREE.Box3(
          new THREE.Vector3(rail.x + x - width / 2 - 0.8, rail.y - 0.4, z - depth / 2 - 0.8),
          new THREE.Vector3(rail.x + x + width / 2 + 0.8, rail.y + h + 1.8, z + depth / 2 + 0.8),
        ),
      );
      // Side and rear windows remain visible from elevated and passing-camera views.
      for (let floor = 3; floor < h - 1; floor += 3.3) {
        for (const end of [-1, 1]) {
          for (let col = -width / 2 + 2; col < width / 2 - 1; col += 3.2) {
            const paneZ = z + end * (depth / 2 + 0.1);
            block(solid, x + col, floor, paneZ, 1.9, 1.8, 0.16, '#172936');
            block(
              hash(id * 91 + floor + col + end) > 0.45 ? light : glass,
              x + col,
              floor,
              paneZ + end * 0.1,
              1.5,
              1.35,
              0.08,
              hash(id + col) > 0.5 ? '#d2be93' : '#759cac',
            );
            block(solid, x + col, floor - 0.95, paneZ + end * 0.16, 2.1, 0.14, 0.38, '#87939a');
          }
        }
        for (let col = -depth / 2 + 2; col < depth / 2 - 1; col += 4) {
          const rearX = x + side * (width / 2 + 0.1);
          block(solid, rearX, floor, z + col, 0.16, 1.8, 1.9, '#172936');
          block(glass, rearX + side * 0.1, floor, z + col, 0.08, 1.35, 1.5, '#9bb0ad');
        }
      }
      // Retrofit details are grouped at the service edge, leaving the sign readable.
      block(solid, side * 38.45, h * 0.48, z + depth / 2 - 1.3, 0.32, h * 0.88, 0.32, '#819097');
      for (let floor = 7; floor < h - 2; floor += 8) {
        block(solid, side * 38.15, floor, z + depth / 2 - 3.4, 1.4, 1.2, 2, '#89979e');
        for (let fin = -0.65; fin < 0.8; fin += 0.32)
          block(solid, side * 37.4, floor, z + depth / 2 - 3.4 + fin, 0.06, 0.8, 0.08, '#233644');
        if (id % 3 === 0) {
          block(solid, side * 37.4, floor - 1.4, z - 5, 3, 0.2, 7, '#4e5e70');
          block(solid, side * 35.95, floor - 0.8, z - 5, 0.08, 1.1, 7, '#718591');
        }
      }
      // A faded base and shuttered service bay sit below the newer screens.
      block(solid, side * 38.5, 1.65, z + 7, 0.2, 3.3, 3.5, '#69717c');
      for (let slat = 0.25; slat < 3.1; slat += 0.3)
        block(solid, side * 38.35, slat, z + 7, 0.06, 0.04, 3.4, '#354050');
      record(spill, plane, side * 27, -0.36, z, 5.2, 18, 1, neon, 0, -Math.PI / 2);
      record(spill, plane, side * 33, -0.13, z, 6, 12, 1, neon, 0, -Math.PI / 2);
      for (let floor = 3; floor < h - 1; floor += 3.3) {
        for (let column = -depth / 2 + 2; column < depth / 2 - 1; column += 3.1) {
          if (hash(id * 1000 + floor * 10 + column * 3) < 0.22) continue;
          block(
            light,
            side * 38.94,
            floor,
            z + column,
            0.07,
            1.5,
            1.6,
            hash(id + floor + column) > 0.36 ? '#e7c791' : '#5596bd',
          );
        }
        block(solid, side * 38.85, floor + 1.1, z, 0.22, 0.22, depth, '#172838');
      }
      block(light, side * 38.6, h / 2, z - depth / 2 + 0.4, 0.18, h - 1, 0.28, neon);
      block(light, side * 38.6, 4.1, z, 0.18, 0.3, depth, neon);
      block(light, side * 38.6, h - 1.3, z, 0.18, 0.45, depth, neon);
      block(glass, side * 38.75, 1.8, z, 0.12, 3.7, depth - 2);
      block(solid, side * 37.5, 4.45, z, 3.2, 0.35, depth, '#23344b');
      if (intensity > 0.35)
        record(
          signs[(id + (side > 0 ? 0 : 2)) % signs.length],
          plane,
          side * 37.3,
          7.2,
          z - 4,
          8,
          4,
          1,
          '#ffffff',
          (side * -Math.PI) / 2,
        );
      block(light, side * 35.5, 1, z + 8, 0.6, 2, 1.15, neon);
      if (side > 0 && intensity > 0.55) {
        record(
          signs[(id + 1) % signs.length],
          plane,
          side * 38.4,
          h * 0.63,
          z + 1,
          18,
          9,
          1,
          '#ffffff',
          -Math.PI / 2,
        );
        block(light, 38.5, h * 0.63 - 5.2, z, 0.2, 0.35, depth - 1, neon);
      }
      // Far towers make a skyline; lower foreground shops leave Scenic's train visible.
      if (side > 0 && intensity > 0.15) {
        const towerH = 14 + intensity * (35 + hash(id * 47) * 52),
          towerX = 77 + hash(id * 53) * 10;
        block(solid, towerX, towerH / 2 - 0.4, z, 25, towerH, 29, '#26384d');
        block(glass, towerX - 12.6, towerH / 2, z, 0.15, towerH - 2, 27);
        for (let floor = 5; floor < towerH; floor += 4.5) {
          block(light, towerX - 12.75, floor, z, 0.12, 0.24, 26, id % 2 ? cyan : pink);
          for (let col = -10; col <= 10; col += 5)
            block(light, towerX, floor, z - 14.6, 2.6, 1.9, 0.12, '#94a9cf');
        }
        block(light, towerX, towerH + 0.15, z, 25.3, 0.25, 29.3, neon);
        if (id % 3 === 0)
          record(signs[4], plane, towerX - 12.9, towerH - 12, z, 18, 9, 1, '#ffffff', -Math.PI / 2);
      }
      // Parallel service street separates the shop frontage from residential blocks.
      for (let step = -17.5; step < 20; step += 5) {
        block(road, side * 111, -0.48, z + step, 11, 0.16, 5.1);
        block(solid, side * 119, -0.31, z + step, 4.7, 0.3, 5.1, '#89918f');
        block(solid, side * 103, -0.31, z + step, 4.7, 0.3, 5.1, '#89918f');
      }
      if (id % 3 === 0) {
        block(road, side * 177, -0.47, z, 113, 0.14, 8);
        for (let stripe = -2; stripe <= 2; stripe++)
          block(solid, side * (123 + stripe * 0.65), -0.38, z, 0.35, 0.025, 7, '#ddd6bd');
        block(solid, side * 124, 2.6, z + 6, 0.15, 6, 0.15, '#5f6a69');
        block(light, side * 124, 5.7, z + 6, 1.8, 0.16, 0.45, amber);
      } else {
        for (let row = 0; row < 2; row++) {
          const bx = side * (143 + row * 63);
          const bh = (row ? 10 : 7) + intensity * (row ? 42 : 22) + hash(id * 97 + row) * 7;
          const bw = row ? 29 : 31;
          // Podiums, recessed upper floors, balconies and roof plant vary silhouettes.
          const palette = ['#b2aa99', '#7f8d91', '#b29b89', '#6d7d86'];
          block(solid, bx, bh * 0.25 - 0.4, z, bw, bh * 0.5, 29, palette[(id + row) % 4]);
          block(
            solid,
            bx + side * 2,
            bh * 0.75 - 0.4,
            z + 1,
            bw - 4,
            bh * 0.5,
            25,
            palette[(id + row) % 4],
          );
          block(solid, bx, bh + 0.05, z, bw - 1, 0.9, 27, '#677371');
          block(solid, bx + side * 4, bh + 1, z - 5, 4, 1.5, 5, '#7c8782');
          for (let floor = 2.4; floor < bh - 1; floor += 3.4) {
            block(glass, bx - side * (bw / 2 + 0.04), floor, z, 0.12, 1.3, 25);
            if (id % 2 === 0) {
              block(solid, bx - side * (bw / 2 + 0.65), floor - 0.9, z, 1.5, 0.18, 27, '#bac0b6');
              block(solid, bx - side * (bw / 2 + 1.35), floor - 0.4, z, 0.1, 0.9, 27, '#a1aba6');
            }
          }
        }
      }
      // Bus shelters, bicycle racks, bins and utility cabinets give the street a scale.
      if (id % 4 === 1) {
        block(solid, side * 33, 2.7, z + 13, 3, 0.18, 4.5, '#56736c');
        for (const dz of [-1.8, 1.8])
          block(solid, side * 34, 1.1, z + 13 + dz, 0.12, 3, 0.12, '#77847b');
        block(solid, side * 34, 0.5, z + 13, 0.8, 0.18, 3, '#947b59');
      }
      block(solid, side * 35, 0.35, z - 14, 0.75, 1.3, 0.8, '#64776f');
      block(solid, side * 101, 0.65, z + 14, 1, 2, 1.8, '#7b8780');
    }
  }
  function setPose(mesh, index, pose) {
    dummy.position.set(pose.x, pose.y, pose.z);
    dummy.rotation.set(pose.pitch || 0, pose.yaw || 0, 0);
    dummy.scale.set(pose.sx, pose.sy, pose.sz);
    dummy.updateMatrix();
    mesh.setMatrixAt(index, dummy.matrix);
  }
  for (const { material, geometry, entries } of batches.values()) {
    const mesh = new THREE.InstancedMesh(geometry, material, entries.length);
    mesh.name = `Tokyo passage / ${material === light ? 'neon and windows' : 'street architecture'}`;
    entries.forEach((pose, i) => {
      setPose(mesh, i, pose);
      mesh.setColorAt(i, color.set(pose.tint));
    });
    mesh.computeBoundingSphere();
    mesh.receiveShadow = material !== light;
    group.add(mesh);
  }
  function dynamic(name, geometry, material, count) {
    const mesh = new THREE.InstancedMesh(geometry, material, count);
    mesh.name = `Tokyo passage / ${name}`;
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.frustumCulled = false;
    group.add(mesh);
    animated.push(mesh);
    return mesh;
  }
  const cars = cells.flatMap(({ id }) =>
    [-1, 1].flatMap((side) =>
      [0, 1]
        .map((lane) => ({
          id: id * 4 + (side > 0 ? 2 : 0) + lane,
          cellZ: TOKYO_PASSAGE.start + 20 + id * 40,
          side,
          lane,
          bus: id % 5 === 0 && lane === 0,
        }))
        .filter((car) => !(car.side > 0 && Math.abs(car.cellZ - 23300) < 60)),
    ),
  );
  const bodies = dynamic('traffic bodies', box, solid, cars.length);
  const cabins = dynamic('traffic glazing', box, glass, cars.length);
  const wheels = dynamic('traffic wheels', box, solid, cars.length * 4);
  const lamps = dynamic('traffic lamps', box, light, cars.length * 4);
  const walkers = cells.flatMap(({ id }) =>
    Array.from({ length: 8 }, (_, n) => ({
      id: id * 8 + n,
      side: n % 2 ? 1 : -1,
      direction: n % 3 ? 1 : -1,
    })).filter(
      (walker) => !(walker.side > 0 && Math.abs(TOKYO_PASSAGE.start + 20 + id * 40 - 23300) < 80),
    ),
  );
  const coats = dynamic('walking coats', box, solid, walkers.length);
  const heads = dynamic('walking faces', sphere, solid, walkers.length);
  const legs = dynamic('walking limbs', box, solid, walkers.length * 4);
  const bags = dynamic('bags and phones', box, solid, walkers.length);
  const umbrellas = dynamic('rain umbrellas', umbrellaGeo, solid, walkers.length);
  const umbrellaStems = dynamic('umbrella stems', box, solid, walkers.length);
  cars.forEach((car, i) => {
    bodies.setColorAt(
      i,
      color.set(car.bus ? '#efbb59' : ['#529da8', '#dcd9ce', '#be587d', '#647cac'][car.id % 4]),
    );
    for (let n = 0; n < 4; n++) {
      wheels.setColorAt(i * 4 + n, color.set('#182332'));
      lamps.setColorAt(i * 4 + n, color.set(n < 2 ? '#fff1c1' : '#ff466a'));
    }
  });
  walkers.forEach((walker, i) => {
    coats.setColorAt(
      i,
      color.set(['#65bfc7', '#c7558c', '#debb77', '#7072aa', '#d4dbe2'][walker.id % 5]),
    );
    heads.setColorAt(i, color.set(['#d2aa87', '#b18468', '#e4c3a3'][walker.id % 3]));
    for (let n = 0; n < 4; n++)
      legs.setColorAt(i * 4 + n, color.set(n < 2 ? '#233049' : '#506077'));
    bags.setColorAt(i, color.set(walker.id % 8 < 2 ? '#74dfef' : '#514358'));
    umbrellas.setColorAt(i, color.set(['#628d98', '#815874', '#c3a365'][walker.id % 3]));
    umbrellaStems.setColorAt(i, color.set('#a2a9ac'));
  });
  const wrap = (v, length) => ((v % length) + length) % length;
  const api = {
    cameraObstacles,
    update(dt, { dusk = false, weather = 'clear', activityTime } = {}) {
      surfaceDetail.update(dt, weather);
      if (disposed) return;
      elapsed = Number.isFinite(activityTime)
        ? activityTime
        : elapsed + Math.max(0, Math.min(dt, 0.1));
      road.roughness = weather === 'rain' ? 0.22 : 0.65;
      light.color.setScalar(dusk ? 1 : 0.75);
      spill.opacity = dusk ? (weather === 'rain' ? 0.44 : 0.25) : 0.06;
      umbrellas.visible = weather === 'rain';
      umbrellaStems.visible = umbrellas.visible;
      if (lastPoseTime === elapsed) return;
      lastPoseTime = elapsed;
      cars.forEach((car, i) => {
        const direction = car.lane ? -1 : 1,
          length = car.bus ? 8 : 4.4;
        const travelStart = cells[0].z - 8;
        const travelSpan = cells.length * 40 - 24;
        const z = travelStart + wrap(car.id * 37.13 + elapsed * direction * 8, travelSpan);
        const stationDetour =
          car.side > 0 ? (car.lane ? 9.2 : 12.8) * smooth((75 - Math.abs(z - 23300)) / 30) : 0;
        const p = railPoint(z),
          yaw = Math.atan2(railPoint(z + 0.1).x - p.x, 0.1);
        const x = p.x + car.side * (car.lane ? 25.4 : 18.6) + stationDetour,
          y = p.y;
        setPose(bodies, i, { x, y: y + 0.33, z, sx: 1.9, sy: 1.05, sz: length, yaw });
        setPose(cabins, i, {
          x,
          y: y + (car.bus ? 1.45 : 1.13),
          z,
          sx: 1.75,
          sy: car.bus ? 1.2 : 0.65,
          sz: length * 0.69,
          yaw,
        });
        for (let n = 0; n < 4; n++) {
          const dx = n % 2 ? 0.98 : -0.98,
            dz = n < 2 ? length * 0.33 : -length * 0.33;
          setPose(wheels, i * 4 + n, {
            x: x + dx * Math.cos(yaw) + dz * Math.sin(yaw),
            y: y - 0.03,
            z: z + dz * Math.cos(yaw) - dx * Math.sin(yaw),
            sx: 0.2,
            sy: 0.55,
            sz: 0.65,
            yaw,
          });
          const end = (n < 2 ? 1 : -1) * direction * length * 0.505;
          setPose(lamps, i * 4 + n, {
            x: x + dx * 0.65 + end * Math.sin(yaw),
            y: y + 0.4,
            z: z + end * Math.cos(yaw),
            sx: 0.38,
            sy: 0.22,
            sz: 0.12,
            yaw,
          });
        }
      });
      walkers.forEach((walker, i) => {
        const waiting = walker.id % 8 < 2;
        const z = waiting
          ? TOKYO_PASSAGE.start + 20 + Math.floor(walker.id / 8) * 40 + 8
          : TOKYO_PASSAGE.start +
            6 +
            Math.floor(walker.id / 8) * 40 +
            wrap(walker.id * 23.731 + elapsed * walker.direction * 1.1, 28);
        const p = railPoint(z),
          x = p.x + walker.side * (waiting ? 34 : 31 + (walker.id % 3) * 1.15),
          y = p.y - 0.15;
        const yaw = waiting ? (walker.side * Math.PI) / 2 : walker.direction < 0 ? Math.PI : 0;
        const stride = waiting ? 0 : Math.sin(elapsed * 6 + walker.id) * 0.42;
        const height = 0.93 + hash(walker.id * 59) * 0.16;
        setPose(coats, i, {
          x,
          y: y + 1.08 * height,
          z,
          sx: 0.43,
          sy: 0.68 * height,
          sz: 0.32,
          yaw,
        });
        setPose(heads, i, { x, y: y + 1.62 * height, z, sx: 0.18, sy: 0.22, sz: 0.18, yaw });
        for (let n = 0; n < 2; n++) {
          const side = n ? 1 : -1;
          setPose(legs, i * 4 + n, {
            x: x + side * 0.12 * Math.cos(yaw),
            y: y + 0.4,
            z: z - side * 0.12 * Math.sin(yaw),
            sx: 0.14,
            sy: 0.65,
            sz: 0.16,
            yaw,
            pitch: side * stride,
          });
          setPose(legs, i * 4 + 2 + n, {
            x: x + side * 0.29 * Math.cos(yaw),
            y: y + 1.05 * height,
            z: z - side * 0.29 * Math.sin(yaw),
            sx: 0.12,
            sy: 0.52,
            sz: 0.13,
            yaw,
            pitch: waiting ? -0.65 : -side * stride,
          });
        }
        setPose(bags, i, {
          x: x + (waiting ? walker.side * 0.3 : 0.29),
          y: y + (waiting ? 1.16 : 0.65),
          z,
          sx: waiting ? 0.09 : 0.25,
          sy: waiting ? 0.16 : 0.32,
          sz: 0.14,
          yaw,
        });
        setPose(umbrellas, i, { x: x + 0.23, y: y + 2 * height, z, sx: 0.68, sy: 0.24, sz: 0.68 });
        setPose(umbrellaStems, i, {
          x: x + 0.23,
          y: y + 1.6 * height,
          z,
          sx: 0.035,
          sy: 0.8,
          sz: 0.035,
        });
      });
      for (const mesh of animated) mesh.instanceMatrix.needsUpdate = true;
    },
    state: () => ({
      name: 'Tokyo urban corridor',
      start: TOKYO_PASSAGE.start,
      end: TOKYO_PASSAGE.end,
      version: TOKYO_PASSAGE.version,
      cells: cells.map((cell) => cell.id),
      cars: cars.length,
      pedestrians: walkers.length,
      batches: group.children.length,
      waitingPedestrians: walkers.filter((walker) => walker.id % 8 < 2).length,
      elapsed,
    }),
    dispose() {
      if (disposed) return;
      disposed = true;
      parent.remove(group);
      group.traverse((object) => {
        if (object.isInstancedMesh) object.dispose();
      });
      for (const geometry of [box, sphere, plane, umbrellaGeo]) geometry.dispose();
      for (const material of materials) material.dispose();
      for (const texture of textures) texture.dispose();
      surfaceDetail.dispose();
    },
  };
  api.update(0);
  return api;
}
