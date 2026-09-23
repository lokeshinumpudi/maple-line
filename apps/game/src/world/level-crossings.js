import {
  ROUTE_START_Z,
  additionalStops,
  landmarks,
  routeCenter,
  routeElevation,
  scenicTerrain,
} from './extended-route.js';
import { regionalLakes, lakeRadius } from './lake-scenery.js';
import { TOKYO_PASSAGE, tokyoDistrictWeight } from './tokyo-passage.js';
import { REGIONAL_TRAFFIC } from './regional-rail-traffic.js';
import { TERRAIN_LATERAL_SAMPLES } from './terrain-surface.js';
/**
 * Railway level crossings (踏切) with rural road traffic that reacts to the train.
 * Route z is metres along the main line. A crossing road is perpendicular to the rail:
 * `s` is metres along the road from the rail centre, `w` metres across it (along the track).
 * Japan drives on the left, so a car heading toward +s uses the lane at w = -1.5.
 */
export const CROSSING_TIMING = Object.freeze({
  warning: 2, // lamps and bell before the arms move
  lower: 4,
  raise: 3,
  leadSeconds: 12, // start warning when the train is this many seconds away
  approachMetres: 250,
  holdMetres: 60, // a stopped train this close keeps the crossing shut
  clearMetres: 15,
  teleportMetres: 60,
});
export const CROSSING_ROAD = Object.freeze({
  width: 6,
  maxHalfLength: 60,
  minHalfLength: 26,
  deckHalf: 2.95,
  stopLine: 6.2,
  post: 4.4,
  lane: 1.5,
  fade: 5,
});
export const CROSSING_RULES = Object.freeze({
  stopClearance: 150, // outside village lots (±131 m) and the ≥90 m platform rule
  bridgeClearance: 200,
  tunnelClearance: 200,
  mastSpacing: 32,
  mastClearance: 6,
  maxRise: 6,
  maxGrade: 0.25,
});
// Deterministic sites where the valley floor is flat on both sides of the rail. The tests
// also rebuild the streamed world and check no generated tree, field or house is on a road.
export const LEVEL_CROSSINGS = Object.freeze(
  [
    { id: 'sakuragawa-farm-road', name: 'Sakuragawa farm road', japanese: '桜川農道踏切', z: 1235 },
    { id: 'aonuma-cedar-lane', name: 'Aonuma cedar lane', japanese: '青沼杉道踏切', z: 4368 },
    { id: 'hinoki-orchard-road', name: 'Hinoki orchard road', japanese: '檜果樹園踏切', z: 7536 },
    { id: 'yukihara-snow-road', name: 'Yukihara snow road', japanese: '雪原踏切', z: 12464 },
    { id: 'akane-maple-lane', name: 'Akane maple lane', japanese: '茜紅葉踏切', z: 16944 },
    { id: 'tanada-terrace-road', name: 'Tanada terrace road', japanese: '棚田踏切', z: 18740 },
    { id: 'minato-harbour-road', name: 'Minato harbour road', japanese: '港道踏切', z: 20072 },
  ].map((site) => Object.freeze(site)),
);
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const smooth = (x) => {
  const t = clamp(x, 0, 1);
  return t * t * (3 - 2 * t);
};
const defaultRailPoint = (z) => ({ x: routeCenter(z) + 28, y: routeElevation(z), z });

/** Rail centre, horizontal track tangent `t` and road direction `n` (points to +x side). */
export function crossingFrame(z, railPoint = defaultRailPoint) {
  const p = railPoint(z),
    a = railPoint(z - 1),
    b = railPoint(z + 1);
  const length = Math.hypot(b.x - a.x, b.z - a.z) || 1;
  const t = { x: (b.x - a.x) / length, z: (b.z - a.z) / length };
  return { rail: { x: p.x, y: p.y, z: p.z }, t, n: { x: t.z, z: -t.x } };
}

// The streamed terrain is a piecewise-linear lattice, not the analytic field. Roads must
// sit on the rendered triangles, so this mirrors the chunk lattice in extended-route.js.
const CHUNK = 600;
const lattices = new Map();
function chunkLattice(index) {
  if (lattices.has(index)) return lattices.get(index);
  const start = ROUTE_START_Z + index * CHUNK,
    end = Math.min(24000, start + CHUNK);
  // Same shared cross-section samples and row spacing as the streamed terrain.
  const offsets = TERRAIN_LATERAL_SAMPLES;
  const rows = [];
  const step = (z) =>
    (z >= 2560 && z <= 2660) || additionalStops.some((stop) => Math.abs(z - stop.z) < 170) ? 2 : 15;
  for (let z = start; z < end; z += step(z)) rows.push(z);
  rows.push(end);
  const lattice = { offsets, rows };
  lattices.set(index, lattice);
  return lattice;
}
/** Height of the rendered regional terrain triangles at a world point (z > 790). */
export function renderedTerrainHeight(
  x,
  z,
  terrainAt = scenicTerrain,
  railPoint = defaultRailPoint,
) {
  const index = Math.floor((z - ROUTE_START_Z) / CHUNK);
  if (index < 0) return terrainAt(x, z);
  const { offsets, rows } = chunkLattice(index);
  let row = 0;
  while (row < rows.length - 2 && rows[row + 1] <= z) row++;
  const z0 = rows[row],
    z1 = rows[row + 1],
    x0 = railPoint(z0).x,
    x1 = railPoint(z1).x;
  const tz = clamp((z - z0) / (z1 - z0), 0, 1),
    u = x - (x0 + (x1 - x0) * tz);
  if (u <= offsets[0] || u >= offsets[offsets.length - 1]) return terrainAt(x, z);
  let column = 0;
  while (offsets[column + 1] < u) column++;
  const u0 = offsets[column],
    u1 = offsets[column + 1],
    tu = (u - u0) / (u1 - u0);
  const ha = terrainAt(x0 + u0, z0),
    hb = terrainAt(x0 + u1, z0),
    hc = terrainAt(x1 + u0, z1);
  if (tu + tz <= 1) return ha + tu * (hb - ha) + tz * (hc - ha);
  const hd = terrainAt(x1 + u1, z1);
  return hd + (1 - tu) * (hc - hd) + (1 - tz) * (hb - hd);
}

/** Checks a proposed site against the route's clearances and the ground beside the rail. */
export function crossingSiteReport(
  z,
  { terrainAt = scenicTerrain, railPoint = defaultRailPoint } = {},
) {
  const reasons = [];
  const nearestStop = additionalStops.reduce((best, stop) =>
    Math.abs(stop.z - z) < Math.abs(best.z - z) ? stop : best,
  );
  if (z < ROUTE_START_Z + 200) reasons.push('inside the original valley');
  if (Math.abs(nearestStop.z - z) < CROSSING_RULES.stopClearance)
    reasons.push(`too close to ${nearestStop.name}`);
  if (Math.abs(z - landmarks.bridgeZ) < landmarks.bridgeSpan / 2 + CROSSING_RULES.bridgeClearance)
    reasons.push('bridge approach');
  if (
    z > landmarks.tunnelStartZ - CROSSING_RULES.tunnelClearance &&
    z < landmarks.tunnelEndZ + CROSSING_RULES.tunnelClearance
  )
    reasons.push('tunnel approach');
  if (z > TOKYO_PASSAGE.start - 300 || tokyoDistrictWeight(z, 0) > 0) reasons.push('city streets');
  if (z > REGIONAL_TRAFFIC.startZ - 60 && z < REGIONAL_TRAFFIC.endZ + 60)
    reasons.push('second rural railway');
  if (z > 2400 && z < 2830) reasons.push('wetland branch');
  const mast = Math.abs(
    z - Math.round(z / CROSSING_RULES.mastSpacing) * CROSSING_RULES.mastSpacing,
  );
  if (mast < CROSSING_RULES.mastClearance) reasons.push('catenary mast in the road');
  const { rail, n } = crossingFrame(z, railPoint);
  const base = rail.y - 0.65;
  const sideLength = (sign) => {
    let length = 0,
      previous = null;
    for (let s = 0; s <= CROSSING_ROAD.maxHalfLength; s += 2) {
      const x = rail.x + n.x * s * sign,
        zz = rail.z + n.z * s * sign,
        h = terrainAt(x, zz);
      if (Math.abs(h - base) > CROSSING_RULES.maxRise) break;
      if (regionalLakes.some((lake) => lakeRadius(lake, x, zz, routeCenter) < 1.15)) break;
      if (previous !== null && s > 8 && Math.abs(h - previous) / 2 > CROSSING_RULES.maxGrade) break;
      previous = h;
      length = s;
    }
    return length;
  };
  const sides = { minus: sideLength(-1), plus: sideLength(1) };
  if (Math.min(sides.minus, sides.plus) < CROSSING_ROAD.minHalfLength)
    reasons.push('hillside too steep beside the rail');
  return {
    z,
    ok: reasons.length === 0,
    reasons,
    nearestStop: nearestStop.id,
    stopDistance: Math.abs(nearestStop.z - z),
    sides,
  };
}

/** Pure crossing state machine. Inputs are route z values; speed is m/s. */
export function crossingPhase({
  trainFront,
  trainRear,
  crossingZ,
  speed = 0,
  direction,
  prevPhase = 'open',
  timer = 0,
  dt = 0,
  prevFront,
  timing = CROSSING_TIMING,
}) {
  if (!Number.isFinite(trainFront) || !Number.isFinite(trainRear) || !Number.isFinite(crossingZ))
    return result('open', 0, true);
  const lo = Math.min(trainFront, trainRear),
    hi = Math.max(trainFront, trainRear);
  const heading = Math.sign(direction ?? trainFront - trainRear) || 1;
  const ahead = (crossingZ - trainFront) * heading;
  const moving = Math.abs(speed) > 0.3;
  const occupied = crossingZ >= lo - timing.clearMetres && crossingZ <= hi + timing.clearMetres;
  const approaching =
    ahead > 0 &&
    (ahead <= timing.holdMetres ||
      (moving &&
        (ahead <= timing.approachMetres || ahead / Math.abs(speed) <= timing.leadSeconds)));
  const active = occupied || approaching;
  // A viewpoint jump places the crossing directly in the state the new train position implies.
  if (Number.isFinite(prevFront) && Math.abs(trainFront - prevFront) > timing.teleportMetres)
    return result(occupied ? 'closed' : approaching ? 'warning' : 'open', 0, true);
  const step = clamp(Number.isFinite(dt) ? dt : 0, 0, 0.25);
  let phase = prevPhase,
    time = timer + step;
  if (phase === 'open') {
    if (active) [phase, time] = ['warning', 0];
  } else if (phase === 'warning') {
    if (!active) [phase, time] = ['open', 0];
    else if (time >= timing.warning) [phase, time] = ['lowering', time - timing.warning];
  }
  if (phase === 'lowering') {
    if (!active) [phase, time] = ['raising', (1 - clamp(time / timing.lower, 0, 1)) * timing.raise];
    else if (time >= timing.lower) [phase, time] = ['closed', 0];
  } else if (phase === 'closed') {
    if (!active) [phase, time] = ['raising', 0];
  } else if (phase === 'raising') {
    if (active) [phase, time] = ['lowering', (1 - clamp(time / timing.raise, 0, 1)) * timing.lower];
    else if (time >= timing.raise) [phase, time] = ['open', 0];
  }
  return result(phase, time, false);
  function result(value, t, reset) {
    const down =
      value === 'closed'
        ? 1
        : value === 'lowering'
          ? clamp(t / timing.lower, 0, 1)
          : value === 'raising'
            ? 1 - clamp(t / timing.raise, 0, 1)
            : 0;
    return {
      phase: value,
      timer: t,
      reset,
      ringing: value === 'warning' || value === 'lowering' || value === 'closed',
      barrier: down,
      trainDirection: Number.isFinite(trainFront) ? Math.sign(trainFront - trainRear) || 1 : 0,
    };
  }
}

/**
 * Car kinematics for one crossing, mutating `cars` in place. Each car:
 * { s, d, speed, cruise, length, doneStop, wait, hidden }.
 * Every car makes a full stop at its stop line (Japanese law) and waits 1 s once the
 * crossing is open; while it is not open, cars queue behind the line with a 2 m gap.
 */
export function advanceCrossingTraffic(
  cars,
  dt,
  { open, ends = { minus: 40, plus: 40 }, stopLine = CROSSING_ROAD.stopLine, gap = 2 },
) {
  const step = clamp(dt, 0, 0.1);
  if (step === 0) return cars;
  const exitEnd = (d) => (d > 0 ? ends.plus : ends.minus),
    entryEnd = (d) => (d > 0 ? ends.minus : ends.plus);
  for (const car of cars) {
    const front = car.s + (car.d * car.length) / 2;
    // The stop line for this car is on its approach side: s = -d * stopLine.
    const line = -car.d * stopLine;
    const beforeLine = (line - front) * car.d > -0.05;
    if (!beforeLine) car.doneStop = true;
    else if (!open && car.doneStop && (line - front) * car.d > 0.4) car.doneStop = false;
    const lineDistance = beforeLine && !car.doneStop ? (line - front) * car.d : Infinity;
    let limit = lineDistance;
    for (const other of cars) {
      if (other === car || other.d !== car.d || other.hidden) continue;
      const ahead = (other.s - car.s) * car.d;
      if (ahead <= 0) continue;
      limit = Math.min(limit, ahead - (other.length + car.length) / 2 - gap);
    }
    // A respawned car waits out of sight at the road end until its lane is clear.
    if (car.hidden) {
      if (limit > 4) car.hidden = false;
      else continue;
    }
    const comfortable = 2.4;
    const desired = Math.min(car.cruise, Math.sqrt(2 * comfortable * Math.max(0, limit - 0.05)));
    const previous = car.speed;
    car.speed =
      desired > car.speed
        ? Math.min(desired, car.speed + 1.8 * step)
        : Math.max(desired, car.speed - 6 * step);
    car.braking = car.speed < previous - 0.02 || (car.speed < 0.05 && limit < 1);
    const move = Math.max(0, Math.min(car.speed * step, limit));
    car.s += car.d * move;
    if (car.speed < 0.08 && lineDistance - move < 0.35) {
      car.speed = 0;
      car.wait = open ? (car.wait ?? 0) + step : 0;
      if (car.wait >= 1) {
        car.doneStop = true;
        car.wait = 0;
      }
    }
    if (car.s * car.d > exitEnd(car.d) + 1) {
      car.s = -car.d * (entryEnd(car.d) + 1);
      car.speed = Math.min(car.cruise, 7);
      car.doneStop = false;
      car.wait = 0;
      car.hidden = true;
    }
  }
  return cars;
}
/** Visible scale for a car near a road end, so it appears and leaves without popping. */
export function carFade(car, ends, fade = CROSSING_ROAD.fade) {
  if (car.hidden) return 0;
  const end = car.s >= 0 ? ends.plus : ends.minus;
  return smooth((end - Math.abs(car.s)) / fade);
}

// Kei cars, vans and light trucks in car-local metres: x across, y up from the road, z forward.
const CAR_TYPES = Object.freeze({
  car: {
    length: 3.4,
    paint: [
      [0, 0.55, 0, 1.47, 0.62, 3.36],
      [0, 1.63, -0.3, 1.36, 0.06, 2.2],
      [0, 0.33, 0, 1.49, 0.18, 3.42, '#2c2e30'],
      [0, 0.87, 1.36, 1.3, 0.05, 0.62],
    ],
    glass: [0, 1.23, -0.28, 1.36, 0.76, 2.24],
  },
  van: {
    length: 3.4,
    paint: [
      [0, 0.55, 0, 1.47, 0.62, 3.36],
      [0, 1.8, -0.22, 1.4, 0.07, 2.86],
      [0, 0.33, 0, 1.49, 0.18, 3.42, '#2c2e30'],
      [0, 0.87, 1.5, 1.3, 0.05, 0.34],
    ],
    glass: [0, 1.32, -0.2, 1.4, 0.9, 2.84],
  },
  truck: {
    length: 3.4,
    paint: [
      [0, 0.5, 0, 1.47, 0.44, 3.36],
      [0, 1.5, 1.05, 1.42, 0.07, 1.22],
      [0, 0.3, 0, 1.49, 0.16, 3.42, '#2c2e30'],
      [0, 0.92, -0.62, 1.47, 0.34, 2.02, '#c9cbc6'],
    ],
    glass: [0, 1.1, 1.05, 1.4, 0.74, 1.18],
  },
});
const CAR_COLORS = ['#e8e6df', '#b7bcc0', '#8fb3c7', '#e2d3a8', '#b8423a', '#9cc5a9', '#3b4f6b'];
const CAR_COUNTS = [3, 4, 3, 2, 4, 3, 3];
const hash = (n) => {
  let v = Math.imul(n + 0x9e37, 0x45d9f3b);
  v = Math.imul(v ^ (v >>> 16), 0x45d9f3b);
  return ((v ^ (v >>> 16)) >>> 0) / 4294967296;
};
function crossingCars(siteIndex, ends) {
  return Array.from({ length: CAR_COUNTS[siteIndex % CAR_COUNTS.length] }, (_, k) => {
    const seed = siteIndex * 17 + k,
      d = k % 2 ? -1 : 1,
      entry = d > 0 ? ends.minus : ends.plus;
    const type = hash(seed) < 0.5 ? 'car' : hash(seed) < 0.78 ? 'van' : 'truck';
    return {
      id: `${siteIndex}-${k}`,
      type,
      color: type === 'truck' ? '#e8e6df' : CAR_COLORS[Math.floor(hash(seed * 3 + 1) * 7)],
      d,
      s: -d * (entry - 4 - (k >> 1) * 11),
      speed: 0,
      cruise: 8.3 + hash(seed * 5 + 2) * 2.8,
      length: CAR_TYPES[type].length,
      doneStop: false,
      wait: 0,
      hidden: false,
      braking: false,
    };
  });
}

/** Instanced level crossings with road traffic. All crossings share about a dozen draw calls. */
export function createLevelCrossings({
  THREE,
  scene,
  railPoint,
  center = routeCenter,
  terrainAt = scenicTerrain,
  sites = LEVEL_CROSSINGS,
}) {
  railPoint ??= (z) => new THREE.Vector3(center(z) + 28, routeElevation(z), z);
  const root = new THREE.Group();
  root.name = 'Level crossings / rural roads and traffic';
  scene.add(root);
  const geometries = [],
    materials = [];
  const own = (item, list) => (list.push(item), item);
  const R = CROSSING_ROAD;
  const crossings = sites.map((site, index) => {
    const frame = crossingFrame(site.z, railPoint);
    const report = crossingSiteReport(site.z, { terrainAt, railPoint });
    const ends = {
      minus: Math.min(R.maxHalfLength, Math.max(R.minHalfLength, report.sides.minus)),
      plus: Math.min(R.maxHalfLength, Math.max(R.minHalfLength, report.sides.plus)),
    };
    const a = railPoint(site.z - 1),
      b = railPoint(site.z + 1);
    const grade = (b.y - a.y) / (Math.hypot(b.x - a.x, b.z - a.z) || 1);
    const { rail, n, t } = frame;
    const deck = rail.y + 0.29,
      step = 0.5,
      count = Math.round((ends.minus + ends.plus) / step) + 1;
    const ground = new Float32Array(count),
      heights = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      const s = -ends.minus + i * step;
      let g = -Infinity;
      for (const w of [-3.6, 0, 3.6]) {
        const x = rail.x + n.x * s + t.x * w,
          z = rail.z + n.z * s + t.z * w;
        g = Math.max(g, renderedTerrainHeight(x, z, terrainAt, railPoint), terrainAt(x, z));
      }
      ground[i] = g + 0.07;
    }
    const raw = Array.from(ground, (g, i) => {
      const distance = Math.abs(-ends.minus + i * step);
      if (distance <= R.deckHalf) return deck;
      return Math.max(g, deck + (g - deck) * smooth((distance - R.deckHalf) / 6));
    });
    for (let i = 0; i < count; i++) {
      let sum = 0,
        weight = 0;
      for (let k = -3; k <= 3; k++) {
        const j = clamp(i + k, 0, count - 1);
        sum += raw[j];
        weight++;
      }
      const distance = Math.abs(-ends.minus + i * step);
      heights[i] = distance <= R.deckHalf ? deck : Math.max(ground[i], sum / weight);
    }
    const heightAt = (s) => {
      const f = clamp((s + ends.minus) / step, 0, count - 1),
        i = Math.min(count - 2, Math.floor(f));
      return heights[i] + (heights[i + 1] - heights[i]) * (f - i);
    };
    // Cross-fall matches the track grade across the deck and fades out along the approach.
    const surface = (s, w) =>
      heightAt(s) + w * grade * (1 - smooth((Math.abs(s) - R.deckHalf) / 5));
    const point = (s, w, y) =>
      new THREE.Vector3(rail.x + n.x * s + t.x * w, y, rail.z + n.z * s + t.z * w);
    const marker = new THREE.Group();
    marker.name = `Level crossing · ${site.name}`;
    marker.position.copy(point(0, 0, deck));
    marker.userData = { id: site.id, japanese: site.japanese, z: site.z, ends };
    root.add(marker);
    return {
      site,
      index,
      frame,
      ends,
      grade,
      deck,
      heightAt,
      surface,
      point,
      marker,
      phase: 'open',
      timer: 0,
      barrier: 0,
      ringing: false,
      trainDirection: 1,
      prevFront: undefined,
      flash: 0,
      active: false,
      shown: true,
      cars: crossingCars(index, ends),
    };
  });

  // Shared materials. Lamp colours exceed 1.0 so a bloom pass catches the flashing reds.
  const stripeTexture = own(
    new THREE.DataTexture(new Uint8Array([232, 190, 32, 255, 24, 22, 20, 255]), 1, 2),
    [],
  );
  stripeTexture.wrapS = stripeTexture.wrapT = THREE.RepeatWrapping;
  stripeTexture.magFilter = stripeTexture.minFilter = THREE.NearestFilter;
  stripeTexture.colorSpace = THREE.SRGBColorSpace;
  stripeTexture.needsUpdate = true;
  const mats = {
    road: own(
      new THREE.MeshStandardMaterial({ color: '#46494b', roughness: 0.92, flatShading: false }),
      materials,
    ),
    marking: own(
      new THREE.MeshStandardMaterial({
        color: '#ecebe4',
        roughness: 0.7,
        polygonOffset: true,
        polygonOffsetFactor: -2,
        polygonOffsetUnits: -2,
      }),
      materials,
    ),
    deck: own(new THREE.MeshStandardMaterial({ color: '#3b3d3a', roughness: 0.95 }), materials),
    stripes: own(
      new THREE.MeshStandardMaterial({ map: stripeTexture, roughness: 0.55 }),
      materials,
    ),
    metal: own(
      new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, metalness: 0.25 }),
      materials,
    ),
    light: own(new THREE.MeshBasicMaterial({ color: '#ffffff', toneMapped: false }), materials),
    arrow: own(
      new THREE.MeshBasicMaterial({ color: '#ffffff', toneMapped: false, side: THREE.DoubleSide }),
      materials,
    ),
    paint: own(new THREE.MeshStandardMaterial({ roughness: 0.42, metalness: 0.35 }), materials),
    glass: own(
      new THREE.MeshStandardMaterial({ color: '#2a3a44', roughness: 0.12, metalness: 0.7 }),
      materials,
    ),
    tyre: own(new THREE.MeshStandardMaterial({ color: '#1c1d1f', roughness: 0.85 }), materials),
  };
  for (const [key, material] of Object.entries(mats)) material.name = `Level crossings / ${key}`;

  // Merge helper: parts are [geometry, matrix, colour?, uv(x, y, z)?] in unit-local metres.
  const tmpColor = new THREE.Color();
  function merge(parts) {
    const position = [],
      normal = [],
      uv = [],
      color = [];
    const v = new THREE.Vector3(),
      nrm = new THREE.Vector3(),
      normalMatrix = new THREE.Matrix3();
    for (const [source, matrix, tint = '#ffffff', mapUv] of parts) {
      const geo = source.index ? source.toNonIndexed() : source;
      normalMatrix.getNormalMatrix(matrix);
      tmpColor.set(tint);
      const p = geo.attributes.position,
        q = geo.attributes.normal;
      for (let i = 0; i < p.count; i++) {
        v.fromBufferAttribute(p, i);
        const local = mapUv ? mapUv(v.x, v.y, v.z) : 0;
        v.applyMatrix4(matrix);
        nrm.fromBufferAttribute(q, i).applyMatrix3(normalMatrix).normalize();
        position.push(v.x, v.y, v.z);
        normal.push(nrm.x, nrm.y, nrm.z);
        uv.push(0.5, local);
        color.push(tmpColor.r, tmpColor.g, tmpColor.b);
      }
      if (geo !== source) geo.dispose();
      source.dispose();
    }
    const out = new THREE.BufferGeometry();
    out.setAttribute('position', new THREE.Float32BufferAttribute(position, 3));
    out.setAttribute('normal', new THREE.Float32BufferAttribute(normal, 3));
    out.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    out.setAttribute('color', new THREE.Float32BufferAttribute(color, 3));
    return own(out, geometries);
  }
  const at = (x, y, z, rz = 0) =>
    new THREE.Matrix4().compose(
      new THREE.Vector3(x, y, z),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, rz)),
      new THREE.Vector3(1, 1, 1),
    );
  const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
  // Warning unit (警報機 + 遮断機): local +z faces approaching cars, +x points across the road.
  const postGeo = merge([
    [new THREE.CylinderGeometry(0.075, 0.075, 3.7, 10), at(0, 1.85, 0), '#fff', (_x, y) => y * 2.2],
    [box(1.3, 0.22, 0.04), at(0, 3.45, 0.1, Math.PI / 4), '#fff', (x) => x * 3.1 + 0.25],
    [box(1.3, 0.22, 0.04), at(0, 3.45, 0.13, -Math.PI / 4), '#fff', (x) => x * 3.1 + 0.25],
  ]);
  const housingGeo = merge([
    [box(0.55, 0.7, 0.55), at(0, 0, 0), '#9a9a92'],
    [box(0.95, 0.08, 0.08), at(0, 2.75, 0.02), '#2a2a2a'],
    [box(1.15, 0.5, 0.03), at(0, 2.75, 0.05), '#141414'],
    [box(0.34, 0.04, 0.22), at(-0.38, 2.93, 0.17), '#141414'],
    [box(0.34, 0.04, 0.22), at(0.38, 2.93, 0.17), '#141414'],
    [box(0.55, 0.26, 0.1), at(0, 2.28, 0.05), '#141414'],
    [box(0.42, 1.05, 0.34), at(0.34, 0.52, 0.02), '#d4d2c7'],
    [box(0.46, 0.06, 0.38), at(0.34, 1.07, 0.02), '#8b8d88'],
  ]);
  const armGeo = merge([
    [box(0.09, 6.3, 0.07), at(0, 3.15 + 0.12, 0), '#fff', (_x, y) => y * 2 + 0.2],
    [box(0.18, 0.5, 0.14), at(0, -0.28, 0), '#fff', () => 0.75],
  ]);
  const lampGeo = own(new THREE.CylinderGeometry(0.14, 0.14, 0.06, 16), geometries);
  lampGeo.rotateX(Math.PI / 2);
  const arrowShape = new THREE.Shape();
  arrowShape.moveTo(0.11, 0);
  arrowShape.lineTo(0.01, 0.08);
  arrowShape.lineTo(0.01, 0.03);
  arrowShape.lineTo(-0.1, 0.03);
  arrowShape.lineTo(-0.1, -0.03);
  arrowShape.lineTo(0.01, -0.03);
  arrowShape.lineTo(0.01, -0.08);
  arrowShape.closePath();
  const arrowGeo = own(new THREE.ShapeGeometry(arrowShape), geometries);
  const boxGeo = own(new THREE.BoxGeometry(1, 1, 1), geometries);
  const wheelGeo = own(new THREE.CylinderGeometry(0.27, 0.27, 0.17, 12), geometries);
  wheelGeo.rotateZ(Math.PI / 2);

  // Road ribbons, markings and deck panels: static, merged across every crossing.
  const road = { position: [], index: [] },
    lines = { position: [], index: [] };
  function ribbon(target, crossing, s0, s1, columns, lift = 0) {
    const rows = Math.max(1, Math.round(Math.abs(s1 - s0) / 0.5));
    const base = target.position.length / 3;
    for (let r = 0; r <= rows; r++) {
      const s = s0 + ((s1 - s0) * r) / rows;
      for (const [w, drop = 0] of columns) {
        const p = crossing.point(s, w, crossing.surface(s, w) + lift - drop);
        target.position.push(p.x, p.y, p.z);
      }
    }
    const c = columns.length,
      forward = s1 > s0;
    for (let r = 0; r < rows; r++)
      for (let k = 0; k < c - 1; k++) {
        const a = base + r * c + k,
          b = a + 1,
          d = a + c,
          e = d + 1;
        if (forward) target.index.push(a, b, d, b, e, d);
        else target.index.push(a, d, b, b, d, e);
      }
  }
  const half = R.width / 2;
  const deckInstances = [];
  for (const crossing of crossings) {
    const { ends } = crossing;
    const columns = [[-half - 0.7, 0.9], [-half], [half], [half + 0.7, 0.9]];
    ribbon(road, crossing, R.deckHalf, ends.plus, columns);
    // Columns always run toward +w; ribbon() flips the winding when s decreases.
    ribbon(road, crossing, -R.deckHalf, -ends.minus, columns);
    for (const sign of [-1, 1]) {
      const end = sign > 0 ? ends.plus : ends.minus;
      // Centre line, edge lines, and the stop line across the approaching (left) lane.
      for (const [w0, w1] of [
        [-0.08, 0.08],
        [half - 0.32, half - 0.2],
        [-half + 0.2, -half + 0.32],
      ]) {
        ribbon(lines, crossing, sign * (R.stopLine + 0.6), sign * (end - 0.5), [[w0], [w1]], 0.012);
      }
      const inner = sign * R.stopLine,
        outer = sign * (R.stopLine + 0.45);
      const cols = sign > 0 ? [[0.1], [half - 0.2]] : [[-half + 0.2], [-0.1]];
      ribbon(lines, crossing, inner, outer, cols, 0.014);
    }
    for (const [s, width] of [
      [0, 1.6],
      [-2.03, 1.84],
      [2.03, 1.84],
    ])
      deckInstances.push({ crossing, s, width });
  }
  function staticMesh(name, target, material) {
    const geo = own(new THREE.BufferGeometry(), geometries);
    geo.setAttribute('position', new THREE.Float32BufferAttribute(target.position, 3));
    geo.setIndex(target.index);
    geo.computeVertexNormals();
    geo.computeBoundingSphere();
    const mesh = new THREE.Mesh(geo, material);
    mesh.name = `Level crossings / ${name}`;
    mesh.receiveShadow = true;
    root.add(mesh);
    return mesh;
  }
  staticMesh('asphalt farm roads', road, mats.road);
  staticMesh('road markings and stop lines', lines, mats.marking);
  const instanced = [];
  function instances(name, geometry, material, count, { dynamic = false, cast = true } = {}) {
    const mesh = new THREE.InstancedMesh(geometry, material, count);
    mesh.name = `Level crossings / ${name}`;
    mesh.castShadow = cast;
    mesh.receiveShadow = true;
    if (dynamic) {
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.frustumCulled = false;
    }
    root.add(mesh);
    instanced.push(mesh);
    return mesh;
  }
  const m4 = new THREE.Matrix4(),
    local = new THREE.Matrix4(),
    basis = new THREE.Matrix4(),
    scaleM = new THREE.Matrix4(),
    zero = new THREE.Matrix4().makeScale(0, 0, 0);
  const deckMesh = instances(
    'rubber crossing deck panels',
    boxGeo,
    mats.deck,
    deckInstances.length,
    {
      cast: false,
    },
  );
  deckInstances.forEach(({ crossing, s, width }, i) => {
    const { n, t } = crossing.frame;
    const along = new THREE.Vector3(t.x, crossing.grade, t.z).normalize();
    const across = new THREE.Vector3(n.x, 0, n.z);
    const up = new THREE.Vector3().crossVectors(along, across);
    const p = crossing.point(s, 0, crossing.deck - 0.16);
    basis.makeBasis(across, up, along).setPosition(p);
    deckMesh.setMatrixAt(
      i,
      m4.multiplyMatrices(basis, scaleM.makeScale(width, 0.32, R.width + 0.4)),
    );
  });
  deckMesh.computeBoundingSphere();

  // Two warning units per crossing, each on the left of the traffic approaching it.
  const units = crossings.flatMap((crossing) =>
    [-1, 1].map((sign) => {
      const { n, t } = crossing.frame;
      const x = new THREE.Vector3(-sign * t.x, 0, -sign * t.z),
        y = new THREE.Vector3(0, 1, 0),
        z = new THREE.Vector3(sign * n.x, 0, sign * n.z);
      const s = sign * R.post,
        w = sign * (half + 0.7);
      const origin = crossing.point(s, w, crossing.surface(s, w));
      return { crossing, sign, matrix: new THREE.Matrix4().makeBasis(x, y, z).setPosition(origin) };
    }),
  );
  const posts = instances(
    'striped warning posts and crossbucks',
    postGeo,
    mats.stripes,
    units.length,
  );
  const housings = instances(
    'lamp boards and barrier machines',
    housingGeo,
    mats.metal,
    units.length,
  );
  units.forEach((unit, i) => {
    posts.setMatrixAt(i, unit.matrix);
    housings.setMatrixAt(i, unit.matrix);
  });
  posts.computeBoundingSphere();
  housings.computeBoundingSphere();
  const arms = instances('striped barrier arms', armGeo, mats.stripes, units.length, {
    dynamic: true,
  });
  const lamps = instances('alternating red lamps', lampGeo, mats.light, units.length * 2, {
    dynamic: true,
    cast: false,
  });
  const arrows = instances('train direction arrows', arrowGeo, mats.arrow, units.length * 2, {
    dynamic: true,
    cast: false,
  });
  const lampOff = new THREE.Color(0.16, 0.03, 0.03),
    lampOn = new THREE.Color(4.2, 0.35, 0.18),
    arrowOff = new THREE.Color(0.08, 0.07, 0.05),
    arrowOn = new THREE.Color(3.2, 2.1, 0.5);
  units.forEach((unit, i) => {
    for (let k = 0; k < 2; k++) {
      local.makeTranslation(k ? 0.38 : -0.38, 2.75, 0.1);
      lamps.setMatrixAt(i * 2 + k, m4.multiplyMatrices(unit.matrix, local));
      lamps.setColorAt(i * 2 + k, lampOff);
      local
        .makeTranslation(k ? 0.13 : -0.13, 2.28, 0.106)
        .multiply(scaleM.makeScale(k ? 1 : -1, 1, 1));
      arrows.setMatrixAt(i * 2 + k, m4.multiplyMatrices(unit.matrix, local));
      arrows.setColorAt(i * 2 + k, arrowOff);
    }
  });

  // Cars: one instanced mesh per part for every crossing.
  const allCars = crossings.flatMap((crossing) => crossing.cars.map((car) => ({ crossing, car })));
  allCars.forEach((entry, i) => (entry.slot = i));
  const paint = instances('kei car bodies', boxGeo, mats.paint, allCars.length * 4, {
    dynamic: true,
  });
  const glass = instances('kei car glazing', boxGeo, mats.glass, allCars.length, { dynamic: true });
  const wheels = instances('kei car wheels', wheelGeo, mats.tyre, allCars.length * 4, {
    dynamic: true,
  });
  const carLights = instances(
    'kei car head and tail lights',
    boxGeo,
    mats.light,
    allCars.length * 4,
    {
      dynamic: true,
      cast: false,
    },
  );
  const color = new THREE.Color();
  for (const { car, slot } of allCars) {
    CAR_TYPES[car.type].paint.forEach((part, k) =>
      paint.setColorAt(slot * 4 + k, color.set(part[6] ?? car.color)),
    );
    for (let k = 0; k < 4; k++) carLights.setColorAt(slot * 4 + k, color.setRGB(0.8, 0.8, 0.75));
  }
  const carMatrix = new THREE.Matrix4(),
    quaternion = new THREE.Quaternion(),
    euler = new THREE.Euler(0, 0, 0, 'YXZ'),
    position = new THREE.Vector3(),
    unitScale = new THREE.Vector3();
  function placePart(mesh, index, x, y, z, sx, sy, sz) {
    local.makeTranslation(x, y, z).multiply(scaleM.makeScale(sx, sy, sz));
    mesh.setMatrixAt(index, m4.multiplyMatrices(carMatrix, local));
  }
  function hideCar(slot) {
    for (let k = 0; k < 4; k++) {
      paint.setMatrixAt(slot * 4 + k, zero);
      wheels.setMatrixAt(slot * 4 + k, zero);
      carLights.setMatrixAt(slot * 4 + k, zero);
    }
    glass.setMatrixAt(slot, zero);
  }
  const head = { off: new THREE.Color(0.85, 0.85, 0.8), on: new THREE.Color(3.4, 3.2, 2.6) };
  const tail = {
    off: new THREE.Color(0.35, 0.04, 0.04),
    night: new THREE.Color(1.3, 0.08, 0.06),
    brake: new THREE.Color(3.6, 0.18, 0.1),
  };
  function drawCar({ crossing, car, slot }, headlights) {
    const scale = carFade(car, crossing.ends);
    if (scale <= 0.001) return hideCar(slot);
    const w = -car.d * R.lane;
    const y = crossing.heightAt(car.s);
    const slope = (crossing.heightAt(car.s + car.d) - crossing.heightAt(car.s - car.d)) / 2;
    const { n } = crossing.frame;
    position.copy(crossing.point(car.s, w, y));
    euler.set(-Math.atan(slope), Math.atan2(car.d * n.x, car.d * n.z), 0);
    carMatrix.compose(position, quaternion.setFromEuler(euler), unitScale.setScalar(scale));
    const type = CAR_TYPES[car.type];
    type.paint.forEach(([x, py, z, sx, sy, sz], k) =>
      placePart(paint, slot * 4 + k, x, py, z, sx, sy, sz),
    );
    const [gx, gy, gz, gsx, gsy, gsz] = type.glass;
    placePart(glass, slot, gx, gy, gz, gsx, gsy, gsz);
    const axle = type.length * 0.32;
    for (let k = 0; k < 4; k++)
      placePart(wheels, slot * 4 + k, k % 2 ? 0.64 : -0.64, 0.27, k < 2 ? axle : -axle, 1, 1, 1);
    const front = type.length / 2 + 0.01;
    for (let k = 0; k < 4; k++) {
      const isHead = k < 2,
        x = k % 2 ? 0.52 : -0.52;
      placePart(
        carLights,
        slot * 4 + k,
        isHead ? x : x * 1.18,
        isHead ? 0.74 : 0.86,
        isHead ? front : -front,
        isHead ? 0.3 : 0.16,
        isHead ? 0.13 : 0.24,
        0.04,
      );
      carLights.setColorAt(
        slot * 4 + k,
        isHead
          ? headlights
            ? head.on
            : head.off
          : car.braking || car.speed < 0.05
            ? tail.brake
            : headlights
              ? tail.night
              : tail.off,
      );
    }
  }
  for (const entry of allCars) hideCar(entry.slot);

  const ACTIVE_RADIUS = 900;
  let disposed = false,
    lastCamera = null;
  function drawUnits(crossing) {
    const lit = crossing.ringing;
    const phaseA = Math.floor(crossing.flash * 2) % 2 === 0;
    units.forEach((unit, i) => {
      if (unit.crossing !== crossing) return;
      local
        .makeTranslation(0.34, 0.85, 0.22)
        .multiply(m4.makeRotationZ((-Math.PI / 2) * crossing.barrier));
      arms.setMatrixAt(i, basis.multiplyMatrices(unit.matrix, local));
      lamps.setColorAt(i * 2, lit && phaseA ? lampOn : lampOff);
      lamps.setColorAt(i * 2 + 1, lit && !phaseA ? lampOn : lampOff);
      // The lit arrow points toward the side the train is coming from.
      const source = crossing.trainDirection * unit.sign;
      arrows.setColorAt(i * 2, lit && source < 0 ? arrowOn : arrowOff);
      arrows.setColorAt(i * 2 + 1, lit && source > 0 ? arrowOn : arrowOff);
    });
  }
  for (const crossing of crossings) drawUnits(crossing);
  const queued = (crossing) =>
    !crossing.active
      ? 0
      : crossing.cars.filter(
          (car) =>
            !car.hidden &&
            car.speed < 0.1 &&
            (-car.d * R.stopLine - (car.s + (car.d * car.length) / 2)) * car.d > -0.05,
        ).length;

  return {
    group: root,
    crossings: sites,
    update(
      dt,
      {
        trainFront,
        trainRear,
        speed = 0,
        direction,
        cameraPosition,
        dusk = false,
        weather = 'clear',
        paused = false,
      } = {},
    ) {
      if (disposed) return;
      const step = paused ? 0 : clamp(Number.isFinite(dt) ? dt : 0, 0, 0.1);
      const cameraZ = Array.isArray(cameraPosition)
        ? cameraPosition[2]
        : (cameraPosition?.z ?? trainFront);
      if (cameraPosition)
        lastCamera = Array.isArray(cameraPosition)
          ? { x: cameraPosition[0], y: cameraPosition[1], z: cameraPosition[2] }
          : { x: cameraPosition.x, y: cameraPosition.y, z: cameraPosition.z };
      const headlights = dusk || weather === 'rain' || weather === 'snow';
      let anyActive = false,
        carsDirty = false;
      for (const crossing of crossings) {
        if (!paused) {
          const next = crossingPhase({
            trainFront,
            trainRear,
            crossingZ: crossing.site.z,
            speed,
            direction,
            prevPhase: crossing.phase,
            timer: crossing.timer,
            dt: step,
            prevFront: crossing.prevFront,
          });
          crossing.phase = next.phase;
          crossing.timer = next.timer;
          crossing.barrier = next.barrier;
          crossing.ringing = next.ringing;
          if (next.trainDirection) crossing.trainDirection = next.trainDirection;
          crossing.prevFront = Number.isFinite(trainFront) ? trainFront : undefined;
          crossing.flash = crossing.ringing ? crossing.flash + step : 0;
        }
        const active =
          Number.isFinite(cameraZ) && Math.abs(cameraZ - crossing.site.z) < ACTIVE_RADIUS;
        crossing.marker.visible = active;
        anyActive ||= active;
        if (active) {
          advanceCrossingTraffic(crossing.cars, step, {
            open: crossing.phase === 'open',
            ends: crossing.ends,
          });
          for (const entry of allCars) if (entry.crossing === crossing) drawCar(entry, headlights);
          carsDirty = true;
        } else if (crossing.active) {
          for (const entry of allCars) if (entry.crossing === crossing) hideCar(entry.slot);
          carsDirty = true;
        }
        if (active || crossing.active) drawUnits(crossing);
        crossing.active = active;
      }
      root.visible = anyActive;
      if (anyActive || carsDirty) {
        for (const mesh of [arms, lamps, arrows, paint, glass, wheels, carLights]) {
          mesh.instanceMatrix.needsUpdate = true;
          if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
        }
      }
    },
    getState() {
      const list = crossings.map((crossing) => {
        const p = crossing.point(0, 0, crossing.deck);
        return {
          id: crossing.site.id,
          name: crossing.site.name,
          z: crossing.site.z,
          phase: crossing.phase,
          lampsOn: crossing.ringing,
          barrierAngle: Math.round(crossing.barrier * 900) / 10,
          queuedCars: queued(crossing),
          cars: crossing.cars.filter((car) => !car.hidden).length,
          bell: crossing.ringing,
          active: crossing.active,
          roadLength: crossing.ends.minus + crossing.ends.plus,
          position: [p.x, p.y, p.z],
        };
      });
      let nearestBell = null;
      if (lastCamera)
        for (const item of list) {
          if (!item.bell) continue;
          const distance = Math.hypot(
            item.position[0] - lastCamera.x,
            item.position[1] - lastCamera.y,
            item.position[2] - lastCamera.z,
          );
          if (!nearestBell || distance < nearestBell.distance)
            nearestBell = { id: item.id, distance, position: item.position };
        }
      return {
        crossings: list,
        nearestBell,
        totals: {
          crossings: list.length,
          active: list.filter((item) => item.active).length,
          ringing: list.filter((item) => item.bell).length,
          closed: list.filter((item) => item.phase === 'closed').length,
          cars: allCars.length,
          queuedCars: list.reduce((sum, item) => sum + item.queuedCars, 0),
          drawCalls: root.children.filter((child) => child.isMesh).length,
        },
        disposed,
      };
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      scene.remove(root);
      for (const mesh of instanced) mesh.dispose();
      for (const geo of geometries) geo.dispose();
      for (const material of materials) material.dispose();
      stripeTexture.dispose();
    },
  };
}
