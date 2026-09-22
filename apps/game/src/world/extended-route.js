import { TERRAIN_LATERAL_SAMPLES, naturalValleyTerrain } from './terrain-surface.js';
import { scenicAlignmentOffset, SCENIC_BENDS } from '../simulation/scenic-alignment.js';
import { regionalVariation, regionalMountainHeight } from './region-variation.js';
import { addRegionalBuilding, createRegionalArchitectureCatalog } from './regional-architecture.js';
import { createRegionalResidents } from './regional-residents.js';
import { TOKYO_PASSAGE, tokyoDistrictWeight, createTokyoPassage } from './tokyo-passage.js';
import { createWetlandWaterProfile, wetlandTerrainHeight } from '../simulation/wetland-profile.js';
import { regionalLakes as lakes, lakeRadius, createLakeScenery } from './lake-scenery.js';
import { paintTerrain } from '../rendering/terrain-palette.js';
import { inForestGrove } from './scenery-fields.js';
import { createSurfaceDetail, smoothTerrainNormals } from '../rendering/surface-detail.js';
import { createCedarGeometry } from './nature-geometry.js';
import { createLeafClusterGeometry, createLeafClusterTexture } from './tree-foliage.js';
/** Fixed regional railway: procedural scenery is streamed around the train. */
export const ROUTE_START_Z = 790;
export const ROUTE_END_Z = 24000;
export const landmarks = Object.freeze({
  bridgeZ: 6250,
  bridgeSpan: 152.4,
  tunnelStartZ: 11400,
  tunnelEndZ: 11760,
  summitZ: 12800,
  tokyoZ: TOKYO_PASSAGE.entry,
});
export const additionalStops = Object.freeze([
  { id: 'sakuragawa', name: 'Sakuragawa', japanese: '桜川', z: 1500, theme: 'farmland' },
  { id: 'kawasemi', name: 'Kawasemi', japanese: '川蝉', z: 3100, theme: 'wetland' },
  { id: 'aonuma', name: 'Aonuma', japanese: '青沼', z: 4700, theme: 'lakeside' },
  { id: 'takabashi', name: 'Takabashi', japanese: '高橋', z: 6400, theme: 'bridge' },
  { id: 'hinoki', name: 'Hinoki', japanese: '檜', z: 8000, theme: 'cedar' },
  { id: 'kirinomori', name: 'Kiri no Mori', japanese: '霧の森', z: 9600, theme: 'forest' },
  { id: 'ishikura', name: 'Ishikura', japanese: '石倉', z: 11200, theme: 'mountain' },
  { id: 'yukihara', name: 'Yukihara', japanese: '雪原', z: 12800, theme: 'snow' },
  { id: 'hoshimi', name: 'Hoshimi', japanese: '星見', z: 14400, theme: 'alpine-lake' },
  { id: 'shirakaba', name: 'Shirakaba', japanese: '白樺', z: 16000, theme: 'birch' },
  { id: 'akane', name: 'Akane', japanese: '茜', z: 17600, theme: 'autumn' },
  { id: 'tanada', name: 'Tanada', japanese: '棚田', z: 19300, theme: 'terraces' },
  { id: 'minato', name: 'Minato', japanese: '港', z: 21200, theme: 'harbour' },
  { id: 'harumi', name: 'Harumi', japanese: '晴海', z: 23300, theme: 'city' },
]);
const smooth = (x) => {
  const t = Math.max(0, Math.min(1, x));
  return t * t * (3 - 2 * t);
};
const oldCenter = (z) => 22 * Math.sin(z * 0.006) + 12 * Math.sin(z * 0.014);
export function routeCenter(z) {
  if (z <= ROUTE_START_Z) return oldCenter(z);
  const s = z - ROUTE_START_Z;
  const broad = oldCenter(ROUTE_START_Z) + 50 * Math.sin(s / 800) + 35 * Math.sin(s / 2200);
  return oldCenter(z) + (broad - oldCenter(z)) * smooth(s / 1000) + scenicAlignmentOffset(z);
}
const rampUp = (grade, s, length) =>
  grade * 0.5 * (s - (length / Math.PI) * Math.sin((Math.PI * s) / length));
const rampDown = (grade, s, length) => grade * s - rampUp(grade, s, length);
export function routeElevation(z) {
  if (z <= 790) return 4.75;
  if (z < 1790) return 4.75 + rampUp(0.04, z - 790, 1000);
  if (z < 10500) return 24.75 + 0.04 * (z - 1790);
  if (z < 11800) return 373.15 + rampDown(0.04, z - 10500, 1300);
  if (z < 13700) return 399.15;
  if (z < 14700) return 399.15 + rampUp(-0.035, z - 13700, 1000);
  if (z < 22400) return 381.65 - 0.035 * (z - 14700);
  if (z < 23600) return 112.15 + rampDown(-0.035, z - 22400, 1200);
  return 91.15;
}
export function routeGrade(z) {
  return (routeElevation(z + 0.1) - routeElevation(z - 0.1)) / 0.2;
}
// Village lots have stable identities independent of chunk generation order.
const villageLots = additionalStops
  .filter((stop) => stop.theme !== 'city')
  .flatMap((stop) =>
    [-112, -78, 78, 112].flatMap((along, row) =>
      [33, 64].map((lateral, column) => {
        const z = stop.z + along;
        return {
          id: `${stop.id}-lot-${row}-${column}`,
          stopId: stop.id,
          theme: stop.theme,
          x: routeCenter(z) + 28 + lateral,
          z,
          y: routeElevation(z) + lateral * 0.1,
          lateral,
        };
      }),
    ),
  );
const farmingAt = (z) =>
  (z > 1350 && z < 1940) || (z > 2820 && z < 3380) || (z > 17700 && z < 19700);
function farmPlot(z, row) {
  if (!farmingAt(z)) return null;
  const recipe = regionalVariation(z);
  return {
    x: routeCenter(z) + 28 - 43 - row * 27,
    z,
    y: routeElevation(z) + 1.2 + row * recipe.farm.terraceStep,
    type: recipe.farm.type,
    row,
  };
}
function fieldAt(x, z) {
  const zz = Math.round(z / 72) * 72;
  if (Math.abs(z - zz) > 31) return null;
  for (let row = 0; row < 3; row++) {
    const plot = farmPlot(zz, row);
    if (plot && Math.abs(x - plot.x) < 13) return plot;
  }
  return null;
}
function lakeAt(x, z) {
  for (const lake of lakes) {
    const radius = lakeRadius(lake, x, z, routeCenter);
    if (radius < 1.8) return { ...lake, radius, waterY: routeElevation(lake.z) - lake.drop };
  }
  return null;
}
function bridgeFactor(z) {
  return smooth((landmarks.bridgeSpan / 2 - Math.abs(z - landmarks.bridgeZ)) / 25);
}
function tunnelAt(z) {
  return z >= landmarks.tunnelStartZ && z <= landmarks.tunnelEndZ;
}
/** Ground height, including the ravine and tunnel's mountain roof; world coordinates. */
const wetlandProfile = createWetlandWaterProfile((z) => ({
  x: routeCenter(z) + 28,
  y: routeElevation(z),
  z,
}));
export function scenicTerrain(worldX, z) {
  const u = worldX - routeCenter(z),
    fromRail = u - 28;
  const base = routeElevation(z) - 0.65;
  const shoulder = Math.max(0, Math.abs(fromRail) - 8);
  let y =
    base +
    shoulder * 0.31 +
    Math.sin(z * 0.018 + u * 0.033) * Math.min(shoulder * 0.2, 13) +
    Math.sin(z * 0.004 - u * 0.023) * Math.min(shoulder * 0.22, 18);
  const bridgeClearance = 1 - smooth((Math.abs(z - landmarks.bridgeZ) - 160) / 180);
  const tunnelDistance = Math.max(landmarks.tunnelStartZ - z, z - landmarks.tunnelEndZ, 0);
  const tunnelClearance = 1 - smooth((tunnelDistance - 80) / 180);
  y += regionalMountainHeight(fromRail, z) * (1 - Math.max(bridgeClearance, tunnelClearance));
  y -= bridgeFactor(z) * 79 * Math.exp(-Math.abs(fromRail) / 430);
  if (z > landmarks.tunnelStartZ - 110 && z < landmarks.tunnelEndZ + 110) {
    const approach = Math.min(
      smooth((z - landmarks.tunnelStartZ + 110) / 110),
      smooth((landmarks.tunnelEndZ + 110 - z) / 110),
    );
    // Before either portal, excavate the centre corridor rather than lifting
    // a solid hillside across the rails. The mountain roof begins inside it.
    const corridor = tunnelAt(z) ? 1 : smooth((Math.abs(fromRail) - 10) / 10);
    y += approach * corridor * Math.max(0, 32 - Math.abs(fromRail) * 0.26);
  }
  for (const stop of additionalStops) {
    const along = Math.abs(z - stop.z);
    if (along < 60 && fromRail > 6 && fromRail < 42) {
      const terrace =
        smooth((60 - along) / 15) * smooth((fromRail - 6) / 4) * smooth((42 - fromRail) / 8);
      y += (routeElevation(z) + 0.02 - y) * terrace;
    }
  }
  for (const stop of additionalStops) {
    if (stop.theme === 'city' || Math.abs(z - stop.z) > 153) continue;
    const street =
      (1 - smooth((Math.abs(fromRail - 48) - 3) / 3)) *
      (1 - smooth((Math.abs(z - stop.z) - 145) / 8));
    y += (routeElevation(z) + 4.8 - y) * street;
    if (Math.abs(z - stop.z) < 3 && fromRail > 18 && fromRail < 48) {
      const path = 1 - smooth((Math.abs(z - stop.z) - 1.5) / 1.5);
      const height = routeElevation(z) + 0.2 + ((fromRail - 18) / 30) * 4.6;
      y += (height - y) * path;
    }
  }
  for (const lot of villageLots) {
    if (Math.abs(z - lot.z) > 19 || Math.abs(worldX - lot.x) > 17) continue;
    const weight =
      (1 - smooth((Math.abs(z - lot.z) - 12) / 7)) *
      (1 - smooth((Math.abs(worldX - lot.x) - 11) / 6));
    y += (lot.y - y) * weight;
  }
  const plot = fieldAt(worldX, z);
  if (plot) {
    const weight =
      (1 - smooth((Math.abs(worldX - plot.x) - 10) / 3)) *
      (1 - smooth((Math.abs(z - plot.z) - 27) / 4));
    y += (plot.y - y) * weight;
  }
  // Fade the generated shelf into the existing level railway at the old world boundary.
  if (z < 1000) {
    const old = naturalValleyTerrain(u, z);
    y = old + (y - old) * smooth((z - ROUTE_START_Z) / 210);
  }
  // The branch shares the base rail elevation; cut its shelf through the hillside.
  if (z > 2430 && z < 2790) {
    const along = smooth((z - 2430) / 30) * smooth((2790 - z) / 30);
    const across = 1 - smooth((Math.abs(fromRail + 7) - 13) / 7);
    y = Math.min(y, y + (base - y) * along * across);
  }
  // Independent rural railway and its halt share the running elevation.
  if (z > 1510 && z < 2290) {
    const along = smooth((z - 1510) / 40) * smooth((2290 - z) / 40);
    const across = 1 - smooth((Math.abs(fromRail + 8) - 5) / 4);
    y += (base - y) * along * across;
  }
  // A city shelf blends into the hills without changing the existing rail grade.
  y += (base - y) * tokyoDistrictWeight(z, fromRail);
  const lake = lakeAt(worldX, z);
  if (lake)
    y +=
      (lake.waterY - 2 - y) *
      (1 - smooth((lake.radius - 1.035) / 0.765)) *
      smooth((Math.abs(fromRail) - 12) / 12);
  return wetlandTerrainHeight(worldX, z, y, wetlandProfile);
}

export function createExtendedWorld({ THREE, scene, railPoint, center = routeCenter, wind }) {
  const surfaceDetail = createSurfaceDetail();
  const root = new THREE.Group();
  root.name = 'Regional railway / streamed countryside';
  scene.add(root);
  const chunkSize = 600,
    chunkCount = Math.ceil((ROUTE_END_Z - ROUTE_START_Z) / chunkSize),
    active = new Map();
  const materials = new Map(),
    geometries = new Set();
  const material = (name, color, properties = {}) => {
    if (!materials.has(name)) {
      const m = new THREE.MeshStandardMaterial({
        color,
        roughness: 0.86,
        flatShading: true,
        ...properties,
      });
      if (name.includes('terrain')) {
        m.flatShading = false;
        surfaceDetail.apply(m, 'terrain');
      }
      m.name = `Regional railway / ${name}`;
      materials.set(name, m);
    }
    return materials.get(name);
  };
  const m = {
    grass: material('meadow terrain', '#839166', { vertexColors: true }),
    timber: material('cedar timber', '#66543f'),
    stone: material('retaining stone', '#a9ac9d'),
    cream: material('station plaster', '#e4dec9'),
    roof: material('blue slate roofing', '#586d70'),
    steel: material('bridge steel', '#63756b'),
    rail: material('dark rail hardware', '#48534d'),
    ballast: material('ballast and platform', '#85877b'),
    yellow: material('platform edge', '#dbc98b'),
    glass: material('station glazing', '#5b8388', { metalness: 0.24, roughness: 0.29 }),
    foliage: material('tree crowns', '#ffffff'),
    trunk: material('tree trunks', '#665746'),
    snow: material('permanent mountain snow', '#e2ebe8'),
    water: material('mountain lake water', '#518987', { roughness: 0.22, metalness: 0.3 }),
    light: material('warm station lamps', '#ead7a2', {
      emissive: '#e8bd7f',
      emissiveIntensity: 0.18,
    }),
    urban: material('city graphite panels', '#334252', { roughness: 0.55, metalness: 0.35 }),
    cyan: material('city cyan signage', '#69d9e2', { emissive: '#36bfcf', emissiveIntensity: 0.8 }),
    magenta: material('city magenta signage', '#d66f9d', {
      emissive: '#b53876',
      emissiveIntensity: 0.65,
    }),
    red: material('painted vermilion', '#ae5842'),
    person: material('passenger coats', '#63776c'),
    skin: material('passenger faces', '#d5bea1'),
    rice: material('rice field rows', '#9dac70'),
    dark: material('tunnel lining', '#4e5e5c', { side: THREE.DoubleSide }),
  };
  for (const key of ['roof']) surfaceDetail.apply(m[key], 'roof');
  for (const key of ['timber', 'trunk']) surfaceDetail.apply(m[key], 'timber');
  surfaceDetail.apply(m.stone, 'stone');
  surfaceDetail.apply(m.cream, 'plaster');
  surfaceDetail.apply(m.urban, 'plaster');
  surfaceDetail.apply(m.ballast, 'ballast');
  const keep = (g) => (geometries.add(g), g);
  const boxGeo = keep(new THREE.BoxGeometry(1, 1, 1));
  const architecture = createRegionalArchitectureCatalog(THREE);
  keep(architecture.gable);
  const coneGeo = keep(createCedarGeometry());
  const crownGeo = keep(new THREE.IcosahedronGeometry(1, 1));
  const leafGeo = keep(createLeafClusterGeometry(THREE));
  const leafTexture = createLeafClusterTexture(THREE);
  const leafyMaterial = material('broadleaf foliage', '#ffffff', {
    map: leafTexture,
    alphaTest: 0.45,
    side: THREE.DoubleSide,
  });
  const trunkGeo = keep(new THREE.CylinderGeometry(1, 1, 1, 6));
  const roofGeo = keep(new THREE.ConeGeometry(1, 1, 4));
  const dummy = new THREE.Object3D(),
    color = new THREE.Color(),
    up = new THREE.Vector3(0, 1, 0);
  let activityTime = 0;
  let lastChunk = -999,
    disposed = false,
    latestPosition = null,
    totalBuilt = 0;

  function buildChunk(index) {
    const start = ROUTE_START_Z + index * chunkSize,
      end = Math.min(ROUTE_END_Z, start + chunkSize);
    const group = new THREE.Group();
    group.name = `Regional scenery / ${Math.round(start)}–${Math.round(end)} m`;
    root.add(group);
    const ownedGeometries = [],
      textures = [],
      ownedMaterials = [],
      batches = new Map(),
      canopy = new Map(),
      residents = [],
      lakeScenes = [],
      cameraObstacles = [];
    let seed = (2719 + index * 7919) >>> 0;
    const random = () => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      return seed / 4294967296;
    };
    const between = (a, b) => a + (b - a) * random();
    function item(geo, mat, x, y, z, sx, sy, sz, yaw = 0, tint, cast = true) {
      const key = `${geo.uuid}:${mat.uuid}:${cast}`;
      if (!batches.has(key)) batches.set(key, { geo, mat, cast, transforms: [], colors: [] });
      dummy.position.set(x, y, z);
      dummy.scale.set(sx, sy, sz);
      dummy.rotation.set(0, yaw, 0);
      dummy.updateMatrix();
      batches.get(key).transforms.push(dummy.matrix.clone());
      batches.get(key).colors.push(tint);
    }
    const box = (mat, x, y, z, sx, sy, sz, yaw = 0, cast = true) =>
      item(boxGeo, mat, x, y, z, sx, sy, sz, yaw, undefined, cast);
    function beam(mat, a, b, thickness, depth = thickness) {
      const midpoint = a.clone().add(b).multiplyScalar(0.5),
        delta = b.clone().sub(a);
      dummy.position.copy(midpoint);
      dummy.scale.set(thickness, delta.length(), depth);
      dummy.quaternion.setFromUnitVectors(up, delta.normalize());
      dummy.updateMatrix();
      const key = `${boxGeo.uuid}:${mat.uuid}:true`;
      if (!batches.has(key))
        batches.set(key, { geo: boxGeo, mat, cast: true, transforms: [], colors: [] });
      batches.get(key).transforms.push(dummy.matrix.clone());
      batches.get(key).colors.push(undefined);
    }
    function registerCrown(x, z, radius, top) {
      for (let ix = Math.floor((x - radius - 2) / 8); ix <= Math.floor((x + radius + 2) / 8); ix++)
        for (
          let iz = Math.floor((z - radius - 2) / 8);
          iz <= Math.floor((z + radius + 2) / 8);
          iz++
        ) {
          const key = `${ix}:${iz}`;
          canopy.set(key, Math.max(canopy.get(key) ?? -Infinity, top));
        }
    }
    // Ground cross-sections preserve a railway shelf. Portal strips leave genuine openings.
    const offsets = TERRAIN_LATERAL_SAMPLES;
    const terrainStep = (z) =>
      (z >= 2560 && z <= 2660) || additionalStops.some((stop) => Math.abs(z - stop.z) < 170)
        ? 2
        : 15;
    const positions = [],
      colors = [];
    function face(a, b, c, snow) {
      const tint = new THREE.Color(
        snow
          ? ['#e3e9df', '#d8e2df', '#c6d2cf'][Math.floor(random() * 3)]
          : ['#73855d', '#8c996b', '#a0a17a', '#849475'][Math.floor(random() * 4)],
      );
      for (const v of [a, b, c]) {
        positions.push(v.x, v.y, v.z);
        colors.push(tint.r, tint.g, tint.b);
      }
    }
    const terrainEnd = end === ROUTE_END_Z ? end + 1600 : end;
    for (let z = start; z < terrainEnd; z += z >= end ? 40 : terrainStep(z))
      for (let i = 0; i < offsets.length - 1; i++) {
        const z1 = Math.min(terrainEnd, z + (z >= end ? 40 : terrainStep(z))),
          u0 = offsets[i],
          u1 = offsets[i + 1];
        const portal =
          (z < landmarks.tunnelStartZ + 18 && z1 > landmarks.tunnelStartZ - 35) ||
          (z < landmarks.tunnelEndZ + 35 && z1 > landmarks.tunnelEndZ - 18);
        if (portal && u0 >= -10 && u1 <= 10) continue;
        const at = (u, zz) => {
          const p = railPoint(zz);
          return new THREE.Vector3(p.x + u, scenicTerrain(p.x + u, zz), zz);
        };
        const a = at(u0, z),
          b = at(u1, z),
          c = at(u0, z1),
          d = at(u1, z1),
          snow = routeElevation((z + z1) / 2) > 337;
        face(a, c, b, snow);
        face(b, c, d, snow);
      }
    const groundGeo = new THREE.BufferGeometry();
    groundGeo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    groundGeo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    smoothTerrainNormals(groundGeo);
    paintTerrain(groundGeo, {
      seed: 2719,
      snowAt: (_x, z) => THREE.MathUtils.smoothstep(routeElevation(z), 325, 350),
    });
    ownedGeometries.push(groundGeo);
    const groundMat = material('colored regional terrain', '#ffffff', { vertexColors: true });
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.name = 'Mountain and valley terrain';
    ground.receiveShadow = true;
    group.add(ground);
    // A sparse forest uses shared instances and per-chunk canopy lookup for the camera.
    for (let i = 0; i < 290; i++) {
      const z = between(start + 1, end - 1),
        p = railPoint(z),
        lateral = between(-260, 260),
        x = p.x + lateral;
      if (tokyoDistrictWeight(z, lateral) > 0.01) continue;
      if (villageLots.some((lot) => Math.abs(z - lot.z) < 18 && Math.abs(x - lot.x) < 17)) continue;
      if (!inForestGrove(x, z, 2719)) continue;
      if (fieldAt(x, z)) continue;
      if (Math.abs(z - wetlandProfile.centerZ) < 45 && Math.abs(x - wetlandProfile.centerX) < 21)
        continue;
      if (z > 2420 && z < 2800 && lateral > -25 && lateral < 10) continue;
      if (z > 1500 && z < 2300 && lateral > -19 && lateral < -3) continue;
      if (Math.abs(lateral) < 10 || (tunnelAt(z) && Math.abs(lateral) < 18)) continue;
      if (additionalStops.some((stop) => Math.abs(z - stop.z) < 55 && lateral > 6 && lateral < 44))
        continue;
      if (lakeAt(x, z)?.radius < 1.18 || (bridgeFactor(z) > 0.1 && Math.abs(lateral) < 18))
        continue;
      const y = scenicTerrain(x, z),
        snow = routeElevation(z) > 337,
        h = between(7, 15),
        r = between(2.2, 4.9),
        pine = snow || random() < 0.56;
      item(trunkGeo, m.trunk, x, y + h * 0.31, z, 0.22, h * 0.62, 0.22);
      if (pine)
        for (let tier = 0; tier < 3; tier++) {
          const radius = r * (1 - tier * 0.23),
            cy = y + h * (0.47 + tier * 0.2);
          item(
            coneGeo,
            m.foliage,
            x,
            cy,
            z,
            radius,
            h * 0.58,
            radius,
            random() * 6,
            snow ? '#baccc2' : ['#416a48', '#57794e', '#365b40'][tier],
          );
          if (snow)
            item(coneGeo, m.snow, x, cy + h * 0.095, z, radius * 0.84, h * 0.39, radius * 0.84);
        }
      else {
        const autumn = z > 16800 && z < 20000;
        for (let tier = 0; tier < 2; tier++)
          item(
            leafGeo,
            leafyMaterial,
            x + between(-0.7, 0.7),
            y + h * 0.72 + tier * 1.3,
            z,
            r,
            r * 0.8,
            r,
            random() * 6,
            autumn
              ? ['#be8847', '#c7a558', '#9b703e'][i % 3]
              : ['#7b955b', '#91a566', '#607d4f'][i % 3],
          );
      }
      registerCrown(x, z, r + 1, pine ? y + h * 1.18 : y + h * 0.72 + 1.3 + r * 0.8);
    }
    // Permanent field cells belong to one chunk; the same pads shape their terrain.
    for (let z = Math.ceil(start / 72) * 72; z < end; z += 72)
      for (let row = 0; row < 3; row++) {
        const plot = farmPlot(z, row);
        if (!plot || lakeAt(plot.x, z)?.radius < 1.5) continue;
        const { x, y, type } = plot;
        box(m.timber, x, y + 0.08, z, 21.8, 0.22, 55);
        box(
          type === 'vegetable-fields' ? m.stone : m.water,
          x,
          y + 0.21,
          z,
          21.1,
          0.07,
          54.3,
          0,
          false,
        );
        for (let strip = -24; strip <= 24; strip += 4) {
          box(m.rice, x, y + 0.39, z + strip, 20.4, 0.26, 0.7, 0, false);
          if (type === 'vegetable-fields')
            for (let plant = -8; plant <= 8; plant += 4)
              item(
                crownGeo,
                m.foliage,
                x + plant,
                y + 0.58,
                z + strip,
                0.55,
                0.4,
                0.65,
                0,
                '#67844d',
                false,
              );
        }
        box(m.stone, x + 12, y + 0.16, z, 1.25, 0.2, 64, 0, false);
        group.userData.farms ??= [];
        group.userData.farms.push({ ...plot, id: `field-${z}-${row}` });
      }
    // Track fixtures are local to this extension; the parent supplies continuous steel rails.
    for (let z = start; z < end; z += 1.85) {
      const p = railPoint(z),
        next = railPoint(Math.min(z + 1, ROUTE_END_Z)),
        yaw = Math.atan2(next.x - p.x, next.z - p.z);
      box(m.timber, p.x, p.y - 0.06, z, 2.8, 0.2, 0.27, yaw);
    }
    for (let z = start; z < end; z += 6) {
      const p = railPoint(z),
        next = railPoint(Math.min(z + 6, end)),
        bridge = bridgeFactor(z) > 0.001;
      if (!bridge)
        beam(
          m.ballast,
          new THREE.Vector3(p.x, p.y - 0.37, z),
          new THREE.Vector3(next.x, next.y - 0.37, next.z),
          4.5,
          0.3,
        );
      if (!tunnelAt(z))
        beam(
          m.rail,
          new THREE.Vector3(p.x, p.y + 7.35, z),
          new THREE.Vector3(next.x, next.y + 7.35, next.z),
          0.037,
        );
    }
    for (let z = Math.ceil(start / 32) * 32; z < end; z += 32) {
      if (tunnelAt(z)) continue;
      const p = railPoint(z);
      box(m.rail, p.x + 3.7, p.y + 4.3, z, 0.16, 8.4, 0.16);
      box(m.rail, p.x + 1.85, p.y + 8.4, z, 4.2, 0.13, 0.13);
      beam(
        m.rail,
        new THREE.Vector3(p.x + 3.7, p.y + 6.5, z),
        new THREE.Vector3(p.x, p.y + 8.4, z),
        0.06,
      );
    }
    function addStation(stop) {
      const urban = stop.id === 'harumi';
      const p = railPoint(stop.z),
        tangent = railPoint(stop.z + 1)
          .sub(railPoint(stop.z - 1))
          .normalize(),
        yaw = Math.atan2(tangent.x, tangent.z),
        snow = routeElevation(stop.z) > 337;
      const local = (x, y, z) => {
        const q = railPoint(stop.z + z);
        return new THREE.Vector3(q.x + Math.cos(yaw) * x, q.y + y, q.z - Math.sin(yaw) * x);
      };
      const sbox = (mat, x, y, z, w, h, d) => {
        const q = local(x, y, z);
        box(mat, q.x, q.y, q.z, w, h, d, yaw);
      };
      for (let z = -28; z < 24; z += 2) {
        sbox(m.stone, 5.8, 0.05, z, 5.6, 1.1, 2.05);
        sbox(m.yellow, 3.2, 0.625, z, 0.23, 0.08, 2.05);
      }
      for (const z of [-21, -9, 3, 15]) {
        sbox(urban ? m.urban : m.timber, 6.8, 2.5, z, 0.17, 3.8, 0.17);
        sbox(urban ? m.urban : snow ? m.snow : m.roof, 5.8, 4.45, z, 5.5, 0.25, 11.96);
        if (urban) {
          sbox(m.cyan, 3.12, 4.45, z, 0.12, 0.14, 11.96);
          sbox(m.light, 5.8, 4.28, z, 0.35, 0.05, 9.6);
          sbox(m.urban, 7.9, 2.9, z + 4, 0.15, 2.5, 0.15);
          sbox(m.cyan, 7.87, 3.6, z + 4, 0.07, 0.5, 1.3);
        }
        sbox(m.timber, 6.5, 1.12, z, 1, 0.15, 3.2);
        sbox(m.timber, 7, 1.49, z, 0.15, 0.75, 3.2);
        for (const end of [-1, 1]) sbox(m.rail, 6.5, 0.84, z + end * 1.18, 0.68, 0.5, 0.15);
      }
      sbox(m.stone, 14, 0.05, -8, 10, 1.1, 16);
      sbox(urban ? m.urban : m.cream, 14, 2.4, -8, 8.8, 3.6, 13.8);
      const roofPoint = local(14, 5.1, -8);
      if (urban) {
        sbox(m.urban, 14, 4.55, -8, 10.3, 0.4, 15.5);
        sbox(m.magenta, 8.82, 4.58, -8, 0.12, 0.15, 15.5);
        sbox(m.urban, 15, 5.3, -11, 3.2, 1.1, 2.7);
      } else
        item(
          roofGeo,
          snow ? m.snow : m.roof,
          roofPoint.x,
          roofPoint.y,
          roofPoint.z,
          8.1,
          2.6,
          11.3,
          yaw + Math.PI / 4,
        );
      sbox(m.timber, 9.52, 1.8, -8, 0.14, 2.5, 1.8);
      for (const z of [-12.5, -3.5]) sbox(m.glass, 9.51, 2.6, z, 0.12, 1.45, 2.2);
      sbox(m.red, 7.2, 1.68, 19, 1.1, 2.16, 1.1);
      sbox(m.light, 6.6, 1.95, 19, 0.08, 1.02, 0.8);
      sbox(m.rail, 6.55, 0.95, 19, 0.05, 0.2, 0.55);
      for (const z of [-26, 23]) {
        sbox(m.rail, 7.9, 2.9, z, 0.13, 4.7, 0.13);
        sbox(m.roof, 7.4, 5.25, z, 1.5, 0.17, 0.65);
        sbox(m.light, 7.4, 5.09, z, 0.9, 0.13, 0.37);
      }
      if (typeof document !== 'undefined') {
        const canvas = document.createElement('canvas');
        canvas.width = 768;
        canvas.height = 192;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = urban ? '#17273d' : snow ? '#324d5d' : '#2d5747';
        ctx.fillRect(0, 0, 768, 192);
        ctx.fillStyle = urban ? '#77e0e7' : '#fff1cb';
        ctx.textAlign = 'center';
        ctx.font = '600 65px sans-serif';
        ctx.fillText(stop.japanese, 384, 85);
        ctx.font = '30px sans-serif';
        ctx.fillText(urban ? '01  ·  HARUMI  →  CITY EXIT' : stop.name.toUpperCase(), 384, 145);
        const texture = new THREE.CanvasTexture(canvas);
        textures.push(texture);
        const mat = new THREE.MeshBasicMaterial({ map: texture, side: THREE.DoubleSide });
        ownedMaterials.push(mat);
        const geo = new THREE.PlaneGeometry(urban ? 12 : 5.2, urban ? 3 : 1.3);
        ownedGeometries.push(geo);
        const sign = new THREE.Mesh(geo, mat);
        sign.name = `${stop.name} / bilingual station sign`;
        sign.position.copy(local(urban ? 9.4 : 7.8, urban ? 6.6 : 3.2, 9));
        sign.rotation.y = yaw - Math.PI / 2;
        group.add(sign);
      }
      if (urban) {
        // The city concourse remains outside the boarding path and the story platform.
        sbox(m.stone, 21, 0.2, 2, 24, 0.35, 58);
        for (const z of [3, 15]) sbox(m.urban, 9.5, 4.1, z, 0.18, 7.1, 0.18);
        sbox(m.urban, 26, 5.7, 10, 16.4, 0.4, 26.4);
        sbox(m.cyan, 17.8, 5.65, 10, 0.16, 0.18, 26.4);
        sbox(m.magenta, 26, 5.65, 23.25, 16.4, 0.18, 0.16);
        for (const x of [19, 33]) for (const z of [-1, 21]) sbox(m.urban, x, 3, z, 0.35, 5.7, 0.35);
        for (const z of [3, 6, 9]) {
          sbox(m.urban, 30, 1.35, z, 1.2, 2, 1.7);
          sbox(m.cyan, 29.37, 1.65, z, 0.06, 0.65, 1.15);
          sbox(m.rail, 29.35, 0.8, z, 0.05, 0.15, 0.65);
        }
        for (const z of [2, 11, 20]) {
          sbox(m.light, 26, 5.46, z, 10, 0.08, 0.2);
          sbox(m.yellow, 21, 0.405, z, 0.8, 0.04, 6);
        }
      }
      residents.push(
        createRegionalResidents({
          THREE,
          parent: group,
          stop,
          local,
          yaw,
          place: (lateral, along) => {
            const z = stop.z + along;
            const rail = railPoint(z);
            const x = rail.x + lateral;
            return new THREE.Vector3(x, scenicTerrain(x, z) + 0.62, z);
          },
        }),
      );
      // A village street links the station forecourt to both rows of homes.
      if (!urban) {
        for (let dz = -145; dz < 145; dz += 6) {
          const z = stop.z + dz,
            x = railPoint(z).x + 48,
            y = scenicTerrain(x, z) + 0.08;
          box(m.ballast, x, y, z, 5.2, 0.14, 6.05);
          box(m.stone, x + 3.2, y + 0.08, z, 1.3, 0.12, 6.05);
          if (Math.round(dz + 145) % 30 === 0) {
            box(m.timber, x - 3.9, y + 2.6, z, 0.15, 5.2, 0.15);
            box(m.light, x - 3.5, y + 5.2, z, 1.1, 0.15, 0.28);
          }
        }
        for (let lateral = 19; lateral < 48; lateral += 2) {
          const x = p.x + lateral,
            y = scenicTerrain(x, stop.z) + 0.1;
          box(m.stone, x, y, stop.z, 2.05, 0.15, 2.8);
        }
        // Garden lane in front of the inner row, plus door spurs onto both house rows.
        for (let dz = -120; dz <= 120; dz += 6) {
          const z = stop.z + dz,
            x = railPoint(z).x + 21,
            y = scenicTerrain(x, z) + 0.08;
          box(m.stone, x, y, z, 1.7, 0.12, 6.05);
        }
        for (const along of [-112, -78, 78, 112]) {
          const z = stop.z + along;
          for (const lateral of [21, 23, 25, 27, 29, 46, 48, 50, 52, 54, 56, 58]) {
            const x = railPoint(z).x + lateral,
              y = scenicTerrain(x, z) + 0.08;
            box(m.stone, x, y, z, 2.15, 0.12, 1.6);
          }
        }
      }
      for (const lot of villageLots.filter((lot) => lot.stopId === stop.id)) {
        const building = addRegionalBuilding({
          ...lot,
          seed: 2719,
          yaw: -Math.PI / 2,
          emit: (part) =>
            item(
              part.geometry === 'box' ? boxGeo : architecture.gable,
              m[part.material],
              part.x,
              part.y,
              part.z,
              part.sx,
              part.sy,
              part.sz,
              part.yaw,
            ),
          isAllowed: (bounds) => bounds.minX > railPoint(lot.z).x + 12 && !lakeAt(lot.x, lot.z),
        });
        if (!building) continue;
        // A continuous retaining foundation reaches below the sampled hillside. The
        // old 22 x 24 m paving slab protruded beyond coarse ground triangles.
        const width = building.footprint.maxX - building.footprint.minX;
        const depth = building.footprint.maxZ - building.footprint.minZ;
        let bottom = lot.y - 0.6;
        for (const dx of [-width / 2, 0, width / 2])
          for (const dz of [-depth / 2, 0, depth / 2])
            bottom = Math.min(bottom, scenicTerrain(lot.x + dx, lot.z + dz) - 0.6);
        box(m.stone, lot.x, (lot.y + bottom) / 2, lot.z, width, lot.y - bottom, depth);
        group.userData.buildings ??= [];
        group.userData.buildings.push(building);
        cameraObstacles.push(
          new THREE.Box3(
            new THREE.Vector3(building.footprint.minX, lot.y, building.footprint.minZ),
            new THREE.Vector3(
              building.footprint.maxX,
              lot.y + building.height,
              building.footprint.maxZ,
            ),
          ),
        );
      }
      if (['farmland', 'terraces', 'wetland'].includes(stop.theme)) {
        for (let row = 0; row < 5; row++)
          for (let patch = 0; patch < 3; patch++) {
            const z = stop.z + (patch - 1) * 21,
              x = railPoint(z).x - 28 - row * 10,
              y = scenicTerrain(x, z);
            box(m.timber, x, y + 0.05, z, 9, 0.25, 18);
            box(m.water, x, y + 0.21, z, 8.5, 0.06, 17.5, 0, false);
            for (let r = 0; r < 5; r++)
              box(m.rice, x, y + 0.37, z - 7 + r * 3.3, 8, 0.23, 0.58, 0, false);
          }
      }
      group.userData.stations ??= [];
      group.userData.stations.push({
        id: stop.id,
        name: stop.name,
        theme: stop.theme,
        position: p.toArray(),
      });
    }
    for (const stop of additionalStops) if (stop.z >= start && stop.z < end) addStation(stop);
    for (const lake of lakes)
      if (lake.z >= start && lake.z < end)
        lakeScenes.push(
          createLakeScenery({
            THREE,
            lake,
            group,
            center,
            elevation: routeElevation,
            terrain: scenicTerrain,
            item,
            box,
            crownGeo,
            m,
            ownedGeometries,
            ownedMaterials,
          }),
        );
    if (landmarks.bridgeZ >= start && landmarks.bridgeZ < end) {
      const lo = landmarks.bridgeZ - landmarks.bridgeSpan / 2,
        hi = landmarks.bridgeZ + landmarks.bridgeSpan / 2,
        segments = 16;
      for (let i = 0; i < segments; i++) {
        const z0 = lo + ((hi - lo) * i) / segments,
          z1 = lo + ((hi - lo) * (i + 1)) / segments,
          p0 = railPoint(z0),
          p1 = railPoint(z1);
        beam(
          m.steel,
          p0.clone().add(new THREE.Vector3(0, -0.42, 0)),
          p1.clone().add(new THREE.Vector3(0, -0.42, 0)),
          5.6,
          0.44,
        );
        for (const side of [-1, 1]) {
          const a = p0.clone().add(new THREE.Vector3(side * 2.4, -0.6, 0)),
            b = p1.clone().add(new THREE.Vector3(side * 2.4, -0.6, 0));
          beam(m.steel, a, b, 0.34);
          beam(
            m.steel,
            a.clone().add(new THREE.Vector3(0, -6, 0)),
            b.clone().add(new THREE.Vector3(0, -6, 0)),
            0.34,
          );
          beam(m.steel, a, b.clone().add(new THREE.Vector3(0, -6, 0)), 0.2);
          beam(m.steel, a.clone().add(new THREE.Vector3(0, -6, 0)), b, 0.2);
          beam(
            m.steel,
            a.clone().add(new THREE.Vector3(0, 1.65, 0)),
            b.clone().add(new THREE.Vector3(0, 1.65, 0)),
            0.085,
          );
          beam(m.steel, a, a.clone().add(new THREE.Vector3(0, 1.65, 0)), 0.09);
        }
      }
      for (const z of [lo, hi]) {
        const p = railPoint(z),
          ground = scenicTerrain(p.x, z);
        box(m.stone, p.x, (p.y + ground) / 2 - 2, z, 8, 5, 4);
      }
      // A river crosses the railway seventy metres below the uninterrupted main span.
      const p = railPoint(landmarks.bridgeZ);
      box(m.water, p.x, p.y - 77, landmarks.bridgeZ, 570, 0.12, 13, 0, false);
      group.userData.bridge = {
        spanMetres: landmarks.bridgeSpan,
        feet: 500,
        centreZ: landmarks.bridgeZ,
      };
    }
    const tunnelLo = Math.max(start, landmarks.tunnelStartZ),
      tunnelHi = Math.min(end, landmarks.tunnelEndZ);
    if (tunnelHi > tunnelLo) {
      const vertices = [],
        indices = [],
        radius = 9.1,
        archSegments = 18,
        lengthSegments = Math.ceil((tunnelHi - tunnelLo) / 9);
      for (let row = 0; row <= lengthSegments; row++) {
        const z = tunnelLo + ((tunnelHi - tunnelLo) * row) / lengthSegments,
          p = railPoint(z);
        for (let i = 0; i <= archSegments; i++) {
          const a = (Math.PI * i) / archSegments;
          vertices.push(p.x + Math.cos(a) * radius, p.y + 0.9 + Math.sin(a) * radius, z);
        }
        if (row < lengthSegments)
          for (let i = 0; i < archSegments; i++) {
            const a = row * (archSegments + 1) + i,
              b = a + archSegments + 1;
            indices.push(a, b, a + 1, a + 1, b, b + 1);
          }
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
      geo.setIndex(indices);
      geo.computeVertexNormals();
      ownedGeometries.push(geo);
      const tube = new THREE.Mesh(geo, m.dark);
      tube.name = 'Ishikura tunnel / open arch interior';
      tube.castShadow = true;
      tube.receiveShadow = true;
      group.add(tube);
      for (let z = tunnelLo; z < tunnelHi; z += 8) {
        const p = railPoint(z),
          next = railPoint(Math.min(z + 8, tunnelHi));
        for (const side of [-1, 1])
          beam(
            m.dark,
            new THREE.Vector3(p.x + side * 9.1, p.y + 0.1, z),
            new THREE.Vector3(next.x + side * 9.1, next.y + 0.1, next.z),
            0.5,
            1.9,
          );
        beam(
          m.rail,
          new THREE.Vector3(p.x, p.y + 7.35, z),
          new THREE.Vector3(next.x, next.y + 7.35, next.z),
          0.04,
        );
      }
      for (let z = Math.ceil(tunnelLo / 24) * 24; z < tunnelHi; z += 24) {
        const p = railPoint(z);
        box(m.light, p.x + 8.6, p.y + 3.2, z, 0.1, 0.32, 0.8, 0, false);
        beam(
          m.rail,
          new THREE.Vector3(p.x, p.y + 10, z),
          new THREE.Vector3(p.x, p.y + 7.35, z),
          0.05,
        );
      }
    }
    for (const z of [landmarks.tunnelStartZ, landmarks.tunnelEndZ])
      if (z >= start && z < end) {
        const p = railPoint(z),
          positions = [],
          n = 24;
        for (let i = 0; i < n; i++) {
          const a = (Math.PI * i) / n,
            b = (Math.PI * (i + 1)) / n;
          const point = (angle, radius) => [
            p.x + Math.cos(angle) * radius,
            p.y + 0.9 + Math.sin(angle) * radius,
            z,
          ];
          positions.push(
            ...point(a, 9.1),
            ...point(b, 9.1),
            ...point(a, 11),
            ...point(b, 9.1),
            ...point(b, 11),
            ...point(a, 11),
          );
        }
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
        geo.computeVertexNormals();
        ownedGeometries.push(geo);
        const portalMat = material('tunnel portal stone', '#aeb6a9', { side: THREE.DoubleSide });
        const portal = new THREE.Mesh(geo, portalMat);
        portal.name = 'Ishikura tunnel / open stone portal';
        portal.castShadow = true;
        group.add(portal);
        for (const side of [-1, 1]) box(m.stone, p.x + side * 10.1, p.y + 0.25, z, 1.8, 1.7, 1.1);
      }
    for (const { geo, mat, cast, transforms, colors: instanceColors } of batches.values()) {
      const mesh = new THREE.InstancedMesh(geo, mat, transforms.length);
      mesh.name = `${group.name} / ${mat.name}`;
      mesh.castShadow = cast;
      mesh.receiveShadow = true;
      for (let i = 0; i < transforms.length; i++) {
        mesh.setMatrixAt(i, transforms[i]);
        if (instanceColors[i]) mesh.setColorAt(i, color.set(instanceColors[i]));
      }
      mesh.computeBoundingSphere();
      if (
        wind &&
        ((mat === m.foliage && geo === coneGeo) ||
          mat === leafyMaterial ||
          (mat === m.snow && geo === coneGeo))
      )
        wind.apply(mesh, { amplitude: 0.48, anchorMin: -1.2, anchorMax: -0.3, flutter: 0.06 });
      if (wind && mat === m.trunk)
        wind.apply(mesh, { amplitude: 0.008, anchorMin: -0.5, anchorMax: 0.5, flutter: 0 });
      group.add(mesh);
    }
    const tokyo = createTokyoPassage({ THREE, parent: group, railPoint, start, end });
    totalBuilt++;
    return {
      index,
      start,
      end,
      group,
      canopy,
      residents,
      lakeScenes,
      cameraObstacles,
      tokyo,
      dispose() {
        tokyo?.dispose();
        for (const resident of residents) resident.dispose();
        root.remove(group);
        group.traverse((object) => {
          if (object.isInstancedMesh) {
            wind?.remove(object);
            object.dispose();
          }
        });
        for (const geo of ownedGeometries) geo.dispose();
        for (const texture of textures) texture.dispose();
        for (const mat of ownedMaterials) mat.dispose();
        canopy.clear();
      },
    };
  }
  const api = {
    update(dt, { position, dusk = false, weather = 'clear' } = {}) {
      surfaceDetail.update(dt || 1 / 60, weather);
      if (disposed) return;
      const z = Array.isArray(position) ? position[2] : position?.z;
      if (!Number.isFinite(z)) return;
      latestPosition = z;
      activityTime += Math.max(0, Math.min(dt, 0.1));
      const index = Math.floor((z - ROUTE_START_Z) / chunkSize);
      if (index !== lastChunk) {
        const needed = new Set();
        for (let i = Math.max(0, index - 2); i <= Math.min(chunkCount - 1, index + 2); i++)
          needed.add(i);
        for (const [key, chunk] of active)
          if (!needed.has(key)) {
            chunk.dispose();
            active.delete(key);
          }
        for (const i of needed) if (!active.has(i)) active.set(i, buildChunk(i));
        lastChunk = index;
      }
      m.light.emissiveIntensity = dusk ? 1.2 : 0.18;
      for (const chunk of active.values()) {
        chunk.group.visible = Math.abs((chunk.start + chunk.end) / 2 - z) < 1650;
        for (const lake of chunk.lakeScenes) lake.update(dt);
        chunk.tokyo?.update(dt, { dusk, weather, activityTime });
        for (const resident of chunk.residents) resident.update(activityTime, { weather });
      }
    },
    cameraObstacles() {
      return [...active.values()].flatMap((chunk) => [
        ...chunk.cameraObstacles,
        ...(chunk.tokyo?.cameraObstacles ?? []),
      ]);
    },
    foliageHeight(x, z) {
      const index = Math.floor((z - ROUTE_START_Z) / chunkSize),
        key = `${Math.floor(x / 8)}:${Math.floor(z / 8)}`;
      let result = -Infinity;
      for (let i = index - 1; i <= index + 1; i++)
        result = Math.max(result, active.get(i)?.canopy.get(key) ?? -Infinity);
      return result;
    },
    getState() {
      return {
        loadedChunks: [...active.keys()],
        region: latestPosition === null ? null : regionalVariation(latestPosition),
        scenicBends: SCENIC_BENDS,
        farms: [...active.values()].flatMap((chunk) => chunk.group.userData.farms ?? []),
        buildings: [...active.values()].flatMap((chunk) => chunk.group.userData.buildings ?? []),
        residents: [...active.values()].flatMap((chunk) =>
          chunk.residents.map((resident) => resident.getState()),
        ),
        tokyo: [...active.values()].flatMap((chunk) => (chunk.tokyo ? [chunk.tokyo.state()] : [])),
        lakes: [...active.values()].flatMap((chunk) =>
          chunk.lakeScenes.map((lake) => lake.state()),
        ),
        loadedStations: [...active.values()].flatMap(
          (chunk) => chunk.group.userData.stations ?? [],
        ),
        totalStops: additionalStops.length,
        totalChunks: chunkCount,
        totalBuilt,
        routeEndZ: ROUTE_END_Z,
        peakElevation: routeElevation(landmarks.summitZ),
        positionZ: latestPosition,
        inTunnel: latestPosition !== null && tunnelAt(latestPosition),
        bridgeSpan: landmarks.bridgeSpan,
        disposed,
      };
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const chunk of active.values()) chunk.dispose();
      active.clear();
      scene.remove(root);
      for (const geo of geometries) geo.dispose();
      for (const mat of materials.values()) mat.dispose();
      materials.clear();
      leafTexture.dispose();
      surfaceDetail.dispose();
    },
  };
  return api;
}
