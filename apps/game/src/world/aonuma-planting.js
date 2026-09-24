import { stationFrame } from './station-props.js';
import { BUS_STOP } from './village-bus.js';
import { createLeafClusterGeometry, createLeafClusterTexture } from './tree-foliage.js';
import { createCedarGeometry } from './nature-geometry.js';
import { createRainImpacts } from './rain-impacts.js';
import { applyWaterSurface } from '../rendering/water-surface.js';

/**
 * Aonuma at night in the rain: a lived-in hillside behind the bus stop and station, and the
 * station's lamps as local light sources.
 *
 * Planting (station-local metres, see stationFrame; +x is away from the rail on the platform
 * side, the lake is on the other side): garden walls and clipped hedges behind the bus bay,
 * hydrangeas along the walls, a few houses with warm windows, maple and cedar stands, and
 * two bamboo groves. Broadleaf crowns, hedges, hydrangeas and bamboo tops register with the
 * card canopy, so near ones draw leaf cards and far ones stay cheap. On the bay: wet leaves,
 * puddles that ripple in rain, and rain splashes at the stand.
 *
 * Lights: platform canopy lamps, the two end lamp posts and the kiosk become light-pool
 * sources, as do the house windows at a low strength.
 */
const PLANT_SEED = 47001;
// Keep the lane to the village street and the bay itself clear.
const clear = (x, z) =>
  (x < 19 && z > -34 && z < 50) || // platform, building, bay
  (z > 0 && z < 13 && x < 95) || // the lane and the village street
  x < -34; // the lake side beyond the shore strip

export function createAonumaPlanting({
  THREE,
  scene,
  railPoint,
  groundAt,
  stops,
  cardCanopy = null,
  lightPool = null,
  wind = null,
  surfaceDetail = null,
}) {
  const stop = stops.find((item) => item.id === BUS_STOP.stop);
  if (!stop) return null;
  const frame = stationFrame(railPoint, stop.z);
  const root = new THREE.Group();
  root.name = 'Aonuma / hillside planting and lamps';
  scene.add(root);
  let seed = PLANT_SEED;
  const random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  const between = (a, b) => a + (b - a) * random();
  const owned = [];
  const own = (item) => (owned.push(item), item);
  const leafTexture = own(createLeafClusterTexture(THREE));
  const clusterGeo = own(createLeafClusterGeometry(THREE));
  const cedarGeo = own(createCedarGeometry());
  const box = own(new THREE.BoxGeometry(1, 1, 1));
  const culm = own(new THREE.CylinderGeometry(0.045, 0.06, 1, 5));
  const trunkGeo = own(new THREE.CylinderGeometry(0.16, 0.26, 1, 6));
  const roofGeo = own(new THREE.ConeGeometry(1, 1, 4));
  const standard = (name, color, extra = {}) =>
    own(
      new THREE.MeshStandardMaterial({
        name: `Aonuma / ${name}`,
        color,
        roughness: 0.85,
        ...extra,
      }),
    );
  const leafy = (name) =>
    standard(name, '#ffffff', { map: leafTexture, alphaTest: 0.45, side: THREE.DoubleSide });
  const m = {
    hedge: leafy('clipped hedges'),
    hydrangea: leafy('hydrangea heads'),
    maple: leafy('maple crowns'),
    bamboo: leafy('bamboo leaves'),
    cedar: standard('cedar stands', '#ffffff'),
    trunk: standard('trunks', '#4d3b2c'),
    culm: standard('bamboo culms', '#7b8d4a', { roughness: 0.55 }),
    wall: standard('garden wall stone', '#8b877c'),
    cap: standard('wall tiles', '#3b4447', { roughness: 0.5 }),
    plaster: standard('house plaster', '#cfc6b1'),
    timber: standard('house timber', '#4a3829'),
    roof: standard('house roof tiles', '#39464a', { roughness: 0.55 }),
    window: standard('warm windows', '#6b5a3e', {
      emissive: '#ffbf73',
      emissiveIntensity: 0,
      roughness: 0.3,
    }),
    lamp: standard('platform lamps', '#fff2d2', { emissive: '#ffd49a', emissiveIntensity: 0 }),
  };
  if (surfaceDetail) {
    surfaceDetail.apply(m.wall, 'stone');
    surfaceDetail.apply(m.cap, 'roof');
    surfaceDetail.apply(m.roof, 'roof');
    surfaceDetail.apply(m.plaster, 'plaster');
    surfaceDetail.apply(m.timber, 'timber');
  }
  const batches = new Map();
  const dummy = new THREE.Object3D();
  function item(geo, mat, x, y, z, sx, sy, sz, yaw = 0, tint = null, cast = true) {
    const key = `${geo.uuid}:${mat.uuid}`;
    if (!batches.has(key)) batches.set(key, { geo, mat, cast, matrices: [], tints: [] });
    const p = frame.point(x, 0, z);
    dummy.position.set(p.x, y, p.z);
    dummy.rotation.set(0, frame.yaw + yaw, 0);
    dummy.scale.set(sx, sy, sz);
    dummy.updateMatrix();
    batches.get(key).matrices.push(dummy.matrix.clone());
    batches.get(key).tints.push(tint);
  }
  const ground = (x, z) => {
    const p = frame.point(x, 0, z);
    return groundAt(p.x, p.z);
  };
  const railY = (z) => railPoint(stop.z + z).y;

  // ---- garden walls and hedges behind the bay ----
  function wall(x0, z0, x1, z1, height = 0.95) {
    const length = Math.hypot(x1 - x0, z1 - z0);
    const yaw = Math.atan2(x1 - x0, z1 - z0);
    for (let s = 0; s < length; s += 2) {
      const t = (s + 1) / length;
      const x = x0 + (x1 - x0) * t,
        z = z0 + (z1 - z0) * t;
      const y = ground(x, z);
      item(box, m.wall, x, y + height / 2 - 0.2, z, 0.45, height + 0.4, 2.02, yaw);
      item(box, m.cap, x, y + height + 0.03, z, 0.62, 0.1, 2.06, yaw);
    }
  }
  function hedge(x0, z0, x1, z1, tintSet) {
    const length = Math.hypot(x1 - x0, z1 - z0);
    for (let s = 0; s < length; s += 1.05) {
      const t = s / length;
      const x = x0 + (x1 - x0) * t + between(-0.1, 0.1),
        z = z0 + (z1 - z0) * t;
      const y = ground(x, z);
      const r = between(0.7, 0.9);
      item(
        clusterGeo,
        m.hedge,
        x,
        y + 0.75,
        z,
        r,
        r * 0.95,
        r,
        random() * 6,
        tintSet[Math.round(s) % tintSet.length],
      );
    }
  }
  const hedgeGreens = ['#2d4a2b', '#35532f', '#284427'];
  const hydrangea = ['#5d74b8', '#7a6bb5', '#4f86b0', '#8f78b8', '#6c93c4', '#b27aa8'];
  wall(19.4, 13.5, 19.4, 49);
  wall(19.4, -2, 19.4, -32);
  wall(19.4, 49, 34, 58);
  hedge(20.4, 14, 20.4, 48.5, hedgeGreens);
  hedge(20.4, -3, 20.4, -31, hedgeGreens);
  // Hydrangeas in front of the walls, catching the bus and shelter light.
  for (let z = 15; z < 48; z += between(1.4, 2.6)) {
    const x = between(18.2, 18.9),
      y = ground(x, z);
    const r = between(0.55, 0.85);
    item(
      clusterGeo,
      m.hydrangea,
      x,
      y + r * 0.8,
      z,
      r,
      r * 0.85,
      r,
      random() * 6,
      hydrangea[Math.abs(Math.round(z * 7)) % 6],
    );
  }
  for (let z = -4; z > -31; z -= between(1.4, 2.4)) {
    const x = between(18.2, 18.9),
      y = ground(x, z);
    const r = between(0.55, 0.85);
    item(
      clusterGeo,
      m.hydrangea,
      x,
      y + r * 0.8,
      z,
      r,
      r * 0.85,
      r,
      random() * 6,
      hydrangea[Math.abs(Math.round(z * 5)) % 6],
    );
  }

  // ---- houses with warm windows ----
  // Houses stand square to the station, so their windows face the platform.
  const houses = [
    [30, 26],
    [44, 38],
    [31, -18],
    [52, -6],
    [60, 30],
    [40, 60],
  ];
  const windowSources = [];
  for (const [x, z] of houses) {
    const y = ground(x, z);
    const w = between(6.5, 8.5),
      d = between(5.5, 6.8),
      h = between(3.6, 4.6);
    item(box, m.timber, x, y + 0.2, z, w + 0.4, 0.8, d + 0.4);
    item(box, m.plaster, x, y + h / 2 + 0.5, z, w, h, d);
    item(roofGeo, m.roof, x, y + h + 1.6, z, w * 0.78, 2.3, d * 0.9, Math.PI / 4);
    // Windows on the face toward the station (-x), and one on the end wall.
    for (const along of [-d * 0.26, d * 0.2]) {
      const wx = x - w / 2 - 0.03,
        wz = z + along;
      item(box, m.window, wx, y + 2.1, wz, 0.06, 1.1, 1.3, 0, null, false);
      windowSources.push({ x: wx - 0.6, y: y + 2.1, z: wz, floor: y });
    }
    item(box, m.window, x + 0.5, y + 2.2, z - d / 2 - 0.03, 1.1, 0.9, 0.06, 0, null, false);
    // A garden wall in front of the plot.
    wall(x - w / 2 - 3, z - d / 2 - 2, x - w / 2 - 3, z + d / 2 + 2, 0.8);
  }

  // ---- maple and cedar stands, bamboo ----
  const mapleTints = ['#56703c', '#6b7f45', '#8a3b2a', '#a2472b', '#4b6634', '#7d3526'];
  let maples = 0;
  for (let attempt = 0; attempt < 260 && maples < 38; attempt++) {
    const x = between(21, 88),
      z = between(-48, 70);
    if (clear(x, z) || houses.some(([hx, hz]) => Math.hypot(hx - x, hz - z) < 8)) continue;
    const y = ground(x, z),
      h = between(5, 9),
      r = between(1.8, 3.2);
    item(trunkGeo, m.trunk, x, y + h * 0.3, z, 1, h * 0.6, 1, random() * 6);
    const tint = mapleTints[maples % mapleTints.length];
    for (let k = 0; k < 3; k++) {
      const a = random() * Math.PI * 2;
      const spread = k ? r * 0.45 : 0;
      item(
        clusterGeo,
        m.maple,
        x + Math.cos(a) * spread,
        y + h * 0.66 + (k ? 0 : r * 0.4),
        z + Math.sin(a) * spread,
        r * 0.8,
        r * 0.7,
        r * 0.8,
        a,
        tint,
      );
    }
    maples++;
  }
  let cedars = 0;
  for (let attempt = 0; attempt < 400 && cedars < 70; attempt++) {
    const x = between(34, 110),
      z = between(-70, 90);
    if (clear(x, z) || houses.some(([hx, hz]) => Math.hypot(hx - x, hz - z) < 9)) continue;
    const y = ground(x, z),
      h = between(10, 17),
      r = between(1.6, 2.6);
    item(trunkGeo, m.trunk, x, y + h * 0.25, z, 0.8, h * 0.5, 0.8);
    for (let k = 0; k < 3; k++)
      item(
        cedarGeo,
        m.cedar,
        x,
        y + h * (0.45 + k * 0.2),
        z,
        r * (1 - k * 0.22),
        h * 0.5,
        r * (1 - k * 0.22),
        random() * 6,
        ['#23392a', '#2c4430', '#355036'][k],
      );
    cedars++;
  }
  // The wider hillsides on both sides of the line, so no view out of the stop ends in bare
  // slope. The lake and the ravine are skipped: nothing grows below the waterline.
  let hillside = 0;
  for (let attempt = 0; attempt < 1400 && hillside < 320; attempt++) {
    const side = random() < 0.62 ? 1 : -1;
    const x = side > 0 ? between(24, 170) : between(-170, -16),
      z = between(-160, 170);
    if (clear(x, z) && side > 0) continue;
    if (houses.some(([hx, hz]) => Math.hypot(hx - x, hz - z) < 9)) continue;
    const y = ground(x, z);
    if (y < railY(z) - 6.5) continue;
    if (Math.abs(x) < 20 && z > -40 && z < 60) continue;
    if (random() < 0.62) {
      const h = between(11, 19),
        r = between(1.7, 2.8);
      for (let k = 0; k < 3; k++)
        item(
          cedarGeo,
          m.cedar,
          x,
          y + h * (0.42 + k * 0.2),
          z,
          r * (1 - k * 0.22),
          h * 0.5,
          r * (1 - k * 0.22),
          random() * 6,
          ['#1f3326', '#283f2c', '#2f4832'][k],
        );
    } else {
      const h = between(6, 10),
        r = between(2.2, 3.6);
      item(trunkGeo, m.trunk, x, y + h * 0.3, z, 1, h * 0.6, 1);
      item(
        clusterGeo,
        m.maple,
        x,
        y + h * 0.7,
        z,
        r,
        r * 0.8,
        r,
        random() * 6,
        mapleTints[hillside % 6],
      );
    }
    hillside++;
  }
  // Across the rail, a strip of shore planting before the lake.
  for (let z = -40; z < 60; z += between(3, 6)) {
    const x = between(-30, -13);
    if (clear(x, z)) continue;
    const y = ground(x, z),
      r = between(1.4, 2.4);
    item(
      clusterGeo,
      m.maple,
      x,
      y + r * 0.9,
      z,
      r,
      r * 0.8,
      r,
      random() * 6,
      mapleTints[Math.abs(Math.round(z)) % 6],
    );
  }
  for (const [cx, cz, count] of [
    [27, 58, 60],
    [24, -38, 50],
  ]) {
    for (let i = 0; i < count; i++) {
      const x = cx + between(-5, 5),
        z = cz + between(-6, 6),
        y = ground(x, z),
        h = between(6, 9.5);
      const lean = between(-0.08, 0.08);
      item(culm, m.culm, x, y + h / 2, z, 1, h, 1, lean);
      if (i % 2 === 0)
        item(
          clusterGeo,
          m.bamboo,
          x,
          y + h * 0.85,
          z,
          0.9,
          h * 0.16,
          0.9,
          random() * 6,
          ['#6f8f3e', '#5d7f38'][i % 2],
        );
    }
  }

  // ---- wet ground at the bus stop: leaves and puddles ----
  const deck = (z) => railY(z) + BUS_STOP.deck;
  const leafLitter = standard('wet leaf litter', '#ffffff', {
    map: leafTexture,
    alphaTest: 0.5,
    roughness: 0.32,
    side: THREE.DoubleSide,
  });
  const litterGeo = own(new THREE.PlaneGeometry(1, 1));
  litterGeo.rotateX(-Math.PI / 2);
  for (let i = 0; i < 70; i++) {
    const onPlatform = i % 3 === 0;
    const x = onPlatform ? between(3.6, 8.2) : between(9, 17.2),
      z = onPlatform ? between(10, 24) : between(14, 44);
    const s = between(0.35, 0.8);
    item(
      litterGeo,
      leafLitter,
      x,
      deck(z) + 0.012 + i * 0.00005,
      z,
      s,
      1,
      s,
      random() * 6,
      ['#6b3a22', '#7d4a26', '#5a4a2a', '#8a3a23'][i % 4],
      false,
    );
  }
  const puddleGeo = own(new THREE.CircleGeometry(1, 24));
  puddleGeo.rotateX(-Math.PI / 2);
  const puddle = standard('rain puddles', '#1c2226', {
    roughness: 0.06,
    metalness: 0,
    transparent: true,
    opacity: 0,
    depthWrite: false,
  });
  applyWaterSurface(THREE, puddle, { scale: 1.4, flow: [0.004, 0.003] });
  for (const [x, z, sx, sz] of [
    [11.2, 24.5, 1.4, 0.8],
    [14.8, 36.8, 1.9, 1.1],
    [10.4, 40.8, 1.1, 0.7],
    [15.9, 19.6, 1.3, 0.9],
    [13.2, 12.1, 1.6, 1],
    [22, 7, 2, 1.2],
    [31, 5.5, 1.5, 0.9],
  ])
    item(
      puddleGeo,
      puddle,
      x,
      (x <= BUS_STOP.bay.x[1] ? deck(z) : ground(x, z) + 0.1) + 0.018,
      z,
      sx,
      1,
      sz,
      random() * 6,
      null,
      false,
    );

  // ---- build the batches ----
  const crownBatches = [];
  const color = new THREE.Color();
  for (const { geo, mat, cast, matrices, tints } of batches.values()) {
    const mesh = new THREE.InstancedMesh(geo, mat, matrices.length);
    mesh.name = `${root.name} / ${mat.name.replace('Aonuma / ', '')}`;
    mesh.castShadow = cast;
    mesh.receiveShadow = true;
    matrices.forEach((matrix, i) => {
      mesh.setMatrixAt(i, matrix);
      if (tints[i]) mesh.setColorAt(i, color.set(tints[i]));
    });
    mesh.computeBoundingSphere();
    if (mat === m.window) mesh.userData.noHalo = true;
    root.add(mesh);
    const crown = [m.hedge, m.hydrangea, m.maple, m.bamboo].includes(mat);
    if (wind && (crown || mat === m.cedar))
      wind.apply(mesh, {
        amplitude: mat === m.hedge ? 0.05 : mat === m.hydrangea ? 0.08 : 0.4,
        flutter: 0.05,
      });
    if (wind && mat === m.culm)
      wind.apply(mesh, { amplitude: 0.3, anchorMin: -0.5, anchorMax: 0.5, flutter: 0 });
    if (cardCanopy && crown) {
      cardCanopy.register(mesh, { kind: mat === m.hydrangea ? 'blossom' : 'leaf', wind });
      crownBatches.push(mesh);
    }
  }
  const puddles = root.children.find((mesh) => mesh.material === puddle);

  // ---- station lamps as local light sources ----
  const lamps = [];
  const at = (x, y, z) => {
    const p = frame.point(x, y, z);
    return new THREE.Vector3(p.x, p.y, p.z);
  };
  const lampMesh = (x, y, z) => {
    const p = frame.point(x, 0, z);
    const mesh = new THREE.Mesh(box, m.lamp);
    mesh.position.set(p.x, railY(z) + y, p.z);
    mesh.rotation.y = frame.yaw;
    mesh.scale.set(0.3, 0.07, 0.3);
    root.add(mesh);
  };
  const addLamp = (id, x, y, z, spec) => {
    const handle = lightPool?.add(`aonuma-${id}`, {
      position: at(x, y, z),
      ground: railY(z) + 0.6,
      ...spec,
    });
    if (handle) lamps.push(handle);
  };
  // Pendant lamps under each platform canopy (the canopies stand at these z).
  for (const z of [-21, -9, 3, 15]) {
    lampMesh(5.8, 4.22, z);
    addLamp(`canopy-${z}`, 5.8, 4.05, z, {
      intensity: 9,
      distance: 11,
      pool: 2.6,
      color: '#ffd9a6',
    });
  }
  for (const z of [-26, 23])
    addLamp(`post-${z}`, 7.4, 4.95, z, {
      intensity: 14,
      distance: 15,
      pool: 3.4,
      color: '#ffe0b0',
    });
  addLamp('kiosk', 6.2, 1.9, 19, { intensity: 6, distance: 7, pool: 1.8, color: '#fff0d8' });
  windowSources.forEach((w, i) => {
    const handle = lightPool?.add(`aonuma-window-${i}`, {
      position: at(w.x, 0, w.z).setY(w.y),
      ground: w.floor,
      intensity: 3,
      distance: 6,
      pool: 1.6,
      color: '#ffb866',
    });
    if (handle) lamps.push(handle);
  });

  // ---- rain splashes on the bay and platform ----
  const bayHeight = (x, z) => {
    // World point back to station-local: good enough near the stop, where the rail is straight.
    const origin = railPoint(stop.z);
    const lx = (x - origin.x) * Math.cos(frame.yaw) - (z - origin.z) * Math.sin(frame.yaw);
    const lz = (x - origin.x) * Math.sin(frame.yaw) + (z - origin.z) * Math.cos(frame.yaw);
    if (lx > 3 && lx < BUS_STOP.bay.x[1] && lz > -28 && lz < 46) return deck(lz);
    return groundAt(x, z);
  };
  const splashes = createRainImpacts({ scene: root, heightAt: bayHeight, count: 90 });
  const standPoint = at(12.35, 0, 30.6);

  let near = false;
  return {
    root,
    update(dt, { camera, dusk = false, weather = 'clear', wetness = 0 } = {}) {
      near = camera ? Math.abs(camera.position.z - stop.z) < 700 : false;
      root.visible = near;
      const night = dusk ? 1 : 0;
      for (const lamp of lamps) lamp.set({ level: near ? night : 0 });
      if (!near) return;
      m.window.emissiveIntensity = dusk ? 1.5 : 0.04;
      m.lamp.emissiveIntensity = dusk ? 2.4 : 0;
      puddle.opacity = Math.min(0.9, wetness * 1.2);
      if (puddles) puddles.visible = wetness > 0.05;
      const close = camera.position.distanceTo(standPoint) < 90;
      splashes.update(close ? dt : 0, {
        weather: close ? weather : 'clear',
        position: standPoint,
      });
    },
    getState: () => ({
      visible: near,
      batches: batches.size,
      crowns: crownBatches.reduce((sum, mesh) => sum + mesh.count, 0),
      maples,
      cedars,
      hillside,
      houses: houses.length,
      lamps: lamps.length,
    }),
    dispose() {
      for (const mesh of crownBatches) cardCanopy?.unregister(mesh);
      for (const lamp of lamps) lightPool?.remove(lamp.source.id);
      splashes.dispose();
      root.removeFromParent();
      root.traverse((object) => {
        if (object.isInstancedMesh) {
          wind?.remove(object);
          object.dispose();
        }
      });
      for (const thing of owned) thing.dispose();
    },
  };
}
