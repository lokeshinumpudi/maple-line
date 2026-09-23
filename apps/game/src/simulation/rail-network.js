/**
 * Fictional regional rail network around the Maple Line. Pure data and logic, no Three.js.
 *
 * Only the Maple Line is driven and rendered in 3D. The other five lines exist on the
 * schematic map: timetabled AI trains run on them, single-track sections are protected by
 * one-train-per-block dispatching, and missions read departures from here.
 *
 * Time is in game minutes (absolute, minute 0 = day 1 00:00). The simulation advances in
 * fixed 0.25 minute steps so `tick(10)` and ten `tick(1)` calls give the same state.
 */

export const STEP_MINUTES = 0.25;
export const ORIGIN_BOARDING_MINUTES = 3;
const WARMUP_MINUTES = 120;
const MAX_STEPS_PER_TICK = 1440 * 4;
const MAX_EVENTS = 24;
const EPSILON = 1e-9;
export const MAPLE_JUNCTIONS = Object.freeze(['aonuma', 'yukihara', 'minato', 'harumi']);

export const PREFECTURES = Object.freeze([
  { id: 'momiji', name: 'Momiji Prefecture', japanese: '紅葉県', color: '#d9895b' },
  { id: 'takane', name: 'Takane Prefecture', japanese: '高嶺県', color: '#a9c3d6' },
  { id: 'kitagawa', name: 'Kitagawa Prefecture', japanese: '北川県', color: '#9fc59a' },
  { id: 'shiokaze', name: 'Shiokaze Prefecture', japanese: '潮風県', color: '#7fb7b0' },
  { id: 'miyako', name: 'Miyako Metropolis', japanese: '都府', color: '#d8c47f' },
]);

export const SERVICE_KINDS = Object.freeze({
  limited: { label: 'Limited express', speedKmh: 160, priority: 0, dwell: 1 },
  rapid: { label: 'Rapid', speedKmh: 110, priority: 1, dwell: 0.75 },
  local: { label: 'Local', speedKmh: 90, priority: 2, dwell: 0.5 },
  freight: { label: 'Freight', speedKmh: 75, priority: 3, dwell: 3 },
});

// Supply/demand are units per game hour (tonnes, bags of mail, or passengers for tourists).
export const INDUSTRY_TYPES = Object.freeze([
  'rice',
  'timber',
  'fish',
  'tea',
  'stone',
  'goods',
  'mail',
  'tourists',
]);

const THEME_PROFILES = {
  riverside: [4200, { mail: [3, 2], tourists: [8, 6], goods: [0, 3] }],
  farmland: [2600, { rice: [9, 0], goods: [0, 3], mail: [1, 1] }],
  wetland: [1400, { rice: [6, 0], tourists: [3, 4] }],
  lakeside: [3100, { fish: [4, 0], tourists: [6, 9], goods: [0, 2] }],
  bridge: [1800, { goods: [2, 3], stone: [0, 4] }],
  cedar: [1500, { timber: [10, 0], goods: [0, 2] }],
  forest: [900, { timber: [6, 0], tea: [2, 0], tourists: [0, 3] }],
  mountain: [2200, { stone: [8, 0], timber: [0, 2], mail: [1, 2] }],
  snow: [1300, { tourists: [4, 8], goods: [0, 3] }],
  'alpine-lake': [1100, { tourists: [5, 7], fish: [2, 0] }],
  birch: [800, { timber: [5, 0], tea: [0, 2] }],
  autumn: [1900, { tea: [7, 0], rice: [0, 3], tourists: [2, 3] }],
  terraces: [2400, { rice: [8, 0], tea: [3, 0], goods: [0, 2] }],
  harbour: [9800, { fish: [12, 0], goods: [6, 5], timber: [0, 6], stone: [0, 4] }],
  city: [48000, { goods: [8, 10], mail: [6, 8], tourists: [9, 6], rice: [0, 8], fish: [0, 6] }],
};
const MAPLE_PREFECTURE = {
  momiji: 'momiji',
  sakuragawa: 'momiji',
  kawasemi: 'momiji',
  aonuma: 'momiji',
  takabashi: 'momiji',
  hinoki: 'momiji',
  kirinomori: 'momiji',
  ishikura: 'takane',
  yukihara: 'takane',
  hoshimi: 'takane',
  shirakaba: 'takane',
  akane: 'shiokaze',
  tanada: 'shiokaze',
  minato: 'shiokaze',
  harumi: 'shiokaze',
};

// Off-map stations. Map positions are offsets from the named Maple junction so the
// schematic stays attached even if Maple station distances change.
const OFF_MAP_STATIONS = [
  [
    'kagamiko',
    'Kagami-ko Onsen',
    '鏡湖温泉',
    'momiji',
    'aonuma',
    [30, 72],
    3600,
    { tourists: [10, 12], fish: [3, 0] },
  ],
  ['hotaru', 'Hotaru', '蛍', 'momiji', 'aonuma', [110, 98], 1700, { rice: [8, 0], tea: [2, 0] }],
  [
    'kurotani',
    'Kurotani',
    '黒谷',
    'takane',
    'yukihara',
    [-60, -64],
    1200,
    { timber: [12, 0], stone: [4, 0] },
  ],
  ['toge', 'Tōge', '峠', 'takane', 'yukihara', [-24, -128], 300, { tourists: [2, 4] }],
  [
    'kitagawa',
    'Kitagawa',
    '北川',
    'kitagawa',
    'yukihara',
    [90, -160],
    21000,
    { tea: [10, 0], goods: [4, 8], mail: [3, 5], tourists: [4, 5] },
  ],
  [
    'isohama',
    'Isohama',
    '磯浜',
    'shiokaze',
    'minato',
    [-40, 78],
    2600,
    { fish: [14, 0], goods: [0, 3] },
  ],
  ['shiraura', 'Shiraura', '白浦', 'shiokaze', 'minato', [50, 132], 1500, { stone: [12, 0] }],
  [
    'kamome',
    'Kamome Yard',
    '鴎操車場',
    'shiokaze',
    'minato',
    [170, 140],
    400,
    { goods: [8, 8], timber: [0, 8], stone: [0, 6] },
  ],
  [
    'hamanaka',
    'Hamanaka',
    '浜中',
    'shiokaze',
    'harumi',
    [190, 22],
    5200,
    { goods: [3, 4], fish: [0, 4], mail: [1, 2] },
  ],
  [
    'asahigaoka',
    'Asahigaoka',
    '旭丘',
    'miyako',
    'harumi',
    [80, -104],
    36000,
    { goods: [5, 8], mail: [4, 6], tourists: [6, 6] },
  ],
  [
    'nishimiyako',
    'Nishi-Miyako',
    '西都',
    'miyako',
    'harumi',
    [120, -232],
    88000,
    { goods: [9, 12], mail: [6, 8], tourists: [8, 10] },
  ],
  [
    'miyako',
    'Miyako Central',
    '都中央',
    'miyako',
    'harumi',
    [150, -360],
    240000,
    {
      goods: [14, 18],
      mail: [10, 12],
      tourists: [16, 14],
      rice: [0, 14],
      fish: [0, 10],
      tea: [0, 8],
    },
  ],
];

const OFF_MAP_LINES = [
  {
    id: 'lake',
    name: 'Kagami Lake Branch',
    color: '#6fb6d8',
    track: 'single',
    electrified: false,
    speedKmh: 60,
    stations: ['aonuma', 'kagamiko', 'hotaru'],
    km: [9, 7],
  },
  {
    id: 'mountain',
    name: 'Takane Mountain Line',
    color: '#b59ad6',
    track: 'single',
    electrified: true,
    speedKmh: 70,
    stations: ['yukihara', 'kurotani', 'toge', 'kitagawa'],
    km: [16, 11, 21],
  },
  {
    id: 'coastal',
    name: 'Shiokaze Coastal Freight Line',
    color: '#5fa89a',
    track: 'single',
    electrified: false,
    speedKmh: 85,
    stations: ['minato', 'isohama', 'shiraura', 'kamome'],
    km: [14, 18, 12],
  },
  {
    id: 'trunk',
    name: 'Miyako Intercity Trunk',
    color: '#e0c060',
    track: 'double',
    electrified: true,
    speedKmh: 160,
    stations: ['harumi', 'asahigaoka', 'nishimiyako', 'miyako'],
    km: [24, 38, 16],
  },
  {
    id: 'loop',
    name: 'Hamanaka Link Line',
    color: '#e59aa8',
    track: 'single',
    electrified: true,
    speedKmh: 110,
    stations: ['kamome', 'hamanaka', 'asahigaoka'],
    km: [15, 13],
  },
];

// Each pattern runs in both directions; the return runs start half a headway later.
const SERVICE_PATTERNS = [
  {
    id: 'trunk-limited',
    kind: 'limited',
    name: 'Miyako limited express',
    route: ['harumi', 'asahigaoka', 'nishimiyako', 'miyako'],
    stops: ['harumi', 'nishimiyako', 'miyako'],
    first: 365,
    last: 1350,
    headway: 30,
  },
  {
    id: 'trunk-local',
    kind: 'local',
    name: 'Trunk local',
    route: ['harumi', 'asahigaoka', 'nishimiyako', 'miyako'],
    first: 360,
    last: 1380,
    headway: 20,
  },
  {
    id: 'lake-local',
    kind: 'local',
    name: 'Lake branch local',
    route: ['aonuma', 'kagamiko', 'hotaru'],
    first: 370,
    last: 1320,
    headway: 40,
  },
  {
    id: 'mountain-local',
    kind: 'local',
    name: 'Mountain local',
    route: ['yukihara', 'kurotani', 'toge', 'kitagawa'],
    first: 380,
    last: 1300,
    headway: 60,
  },
  {
    id: 'mountain-freight',
    kind: 'freight',
    name: 'Timber freight',
    route: ['kitagawa', 'toge', 'kurotani', 'yukihara'],
    stops: ['kitagawa', 'kurotani', 'yukihara'],
    first: 420,
    last: 1260,
    headway: 180,
  },
  {
    id: 'coastal-freight',
    kind: 'freight',
    name: 'Coastal freight',
    route: ['minato', 'isohama', 'shiraura', 'kamome'],
    first: 390,
    last: 1320,
    headway: 90,
  },
  {
    id: 'loop-rapid',
    kind: 'rapid',
    name: 'Coast loop rapid',
    route: ['harumi', 'asahigaoka', 'hamanaka', 'kamome', 'shiraura', 'isohama', 'minato'],
    stops: ['harumi', 'asahigaoka', 'hamanaka', 'kamome', 'isohama', 'minato'],
    first: 375,
    last: 1290,
    headway: 60,
  },
];

// Schematic path of the Maple Line on a 1100 x 640 map.
const MAPLE_WAYPOINTS = [
  [90, 560],
  [330, 470],
  [470, 250],
  [560, 190],
  [700, 300],
  [790, 440],
  [860, 470],
];
export const MAP_SIZE = Object.freeze({ width: 1100, height: 640 });

/** Small seeded generator; the state is one serializable integer. */
export function createRandom(seed = 1) {
  let state = seed >>> 0 || 1;
  return {
    next() {
      state = (state + 0x6d2b79f5) >>> 0;
      let t = state;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    },
    get state() {
      return state;
    },
    set state(value) {
      state = value >>> 0 || 1;
    },
  };
}

export function formatClock(minute) {
  if (!Number.isFinite(minute)) return '--:--';
  const day = Math.floor(minute / 1440) + 1;
  const ofDay = ((Math.floor(minute) % 1440) + 1440) % 1440;
  const hh = String(Math.floor(ofDay / 60)).padStart(2, '0');
  const mm = String(ofDay % 60).padStart(2, '0');
  return `Day ${day} · ${hh}:${mm}`;
}

const round = (value, places = 2) => Math.round(value * 10 ** places) / 10 ** places;
const industriesFrom = (table) =>
  Object.entries(table).map(([type, [supply, demand]]) => ({ type, supply, demand }));

function pointAlong(points, fraction) {
  const lengths = [];
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    const length = Math.hypot(points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1]);
    lengths.push(length);
    total += length;
  }
  let target = Math.max(0, Math.min(1, fraction)) * total;
  for (let i = 0; i < lengths.length; i++) {
    if (target <= lengths[i] || i === lengths.length - 1) {
      const t = lengths[i] ? Math.min(1, target / lengths[i]) : 0;
      return {
        x: round(points[i][0] + (points[i + 1][0] - points[i][0]) * t, 1),
        y: round(points[i][1] + (points[i + 1][1] - points[i][1]) * t, 1),
      };
    }
    target -= lengths[i];
  }
  return { x: points[0][0], y: points[0][1] };
}

function validateMapleStops(mapleStops, distanceOf) {
  if (!Array.isArray(mapleStops) || mapleStops.length < 2)
    throw new TypeError('The rail network needs at least two Maple Line stops.');
  if (typeof distanceOf !== 'function')
    throw new TypeError('The rail network needs a route distance function.');
  let previous = -Infinity;
  const seen = new Set();
  return mapleStops.map((stop) => {
    if (!stop || typeof stop.id !== 'string' || !stop.id || typeof stop.name !== 'string')
      throw new TypeError('Each Maple Line stop needs an id and a name.');
    if (seen.has(stop.id)) throw new TypeError(`Duplicate Maple Line stop: ${stop.id}`);
    seen.add(stop.id);
    const metres = distanceOf(stop);
    if (!Number.isFinite(metres) || metres <= previous)
      throw new RangeError('Maple Line stop distances must be finite and strictly increasing.');
    previous = metres;
    return { ...stop, metres };
  });
}

/**
 * @param {object} options
 * @param {Array<{id:string,name:string,z:number,theme?:string,japanese?:string}>} options.mapleStops
 *   Maple Line stops in route order (use `routeStops` or `additionalStops`).
 * @param {(stop:object)=>number} options.distanceOf route distance in metres for a stop.
 */
export function createRailNetwork({
  mapleStops,
  distanceOf = (stop) => stop.distance ?? stop.z,
  seed = 1,
  startMinute = 360,
} = {}) {
  const maple = validateMapleStops(mapleStops, distanceOf);
  const random = createRandom(seed);
  const stations = new Map();
  const lines = new Map();
  const edges = new Map();
  const adjacency = new Map();
  const mapleSpan = maple.at(-1).metres - maple[0].metres;

  maple.forEach((stop, index) => {
    const [population, industries] = THEME_PROFILES[stop.theme] ?? [1000, { mail: [1, 1] }];
    const fraction = (stop.metres - maple[0].metres) / mapleSpan;
    const prefecture =
      MAPLE_PREFECTURE[stop.id] ??
      (fraction < 0.45 ? 'momiji' : fraction < 0.7 ? 'takane' : 'shiokaze');
    stations.set(stop.id, {
      id: stop.id,
      name: stop.name,
      japanese: stop.japanese ?? '',
      prefecture,
      population,
      industries: industriesFrom(industries),
      lines: [],
      maple: true,
      mapleIndex: index,
      routeMetres: stop.metres,
      map: pointAlong(MAPLE_WAYPOINTS, fraction),
    });
  });
  for (const [
    id,
    name,
    japanese,
    prefecture,
    anchor,
    [dx, dy],
    population,
    table,
  ] of OFF_MAP_STATIONS) {
    const base = stations.get(anchor)?.map;
    if (!base) continue;
    stations.set(id, {
      id,
      name,
      japanese,
      prefecture,
      population,
      industries: industriesFrom(table),
      lines: [],
      maple: false,
      map: { x: base.x + dx, y: base.y + dy },
    });
  }

  const addLine = (definition) => {
    const line = {
      id: definition.id,
      name: definition.name,
      color: definition.color,
      track: definition.track,
      electrified: definition.electrified,
      speedKmh: definition.speedKmh,
      rendered: definition.id === 'maple',
      stations: [...definition.stations],
      edges: [],
    };
    for (let i = 1; i < line.stations.length; i++) {
      const from = line.stations[i - 1],
        to = line.stations[i];
      const edge = {
        id: `${line.id}:${from}-${to}`,
        lineId: line.id,
        from,
        to,
        km: round(definition.km[i - 1], 3),
        speedKmh: definition.speedKmh,
        track: definition.track,
        electrified: definition.electrified,
      };
      edges.set(edge.id, edge);
      line.edges.push(edge.id);
      for (const [a, b] of [
        [from, to],
        [to, from],
      ]) {
        if (!adjacency.has(a)) adjacency.set(a, []);
        adjacency.get(a).push({ edge, to: b });
      }
    }
    for (const id of line.stations) stations.get(id).lines.push(line.id);
    lines.set(line.id, line);
  };
  addLine({
    id: 'maple',
    name: 'Maple Line',
    color: '#f0d49b',
    track: 'single',
    electrified: true,
    speedKmh: 120,
    stations: maple.map((stop) => stop.id),
    km: maple.slice(1).map((stop, i) => (stop.metres - maple[i].metres) / 1000),
  });
  for (const line of OFF_MAP_LINES)
    if (line.stations.every((id) => stations.has(id))) addLine(line);

  const unlocked = new Set(['maple']);
  const edgeBetween = (a, b) => adjacency.get(a)?.find((link) => link.to === b)?.edge ?? null;
  const services = [];
  for (const pattern of SERVICE_PATTERNS) {
    if (!pattern.route.every((id) => stations.has(id))) continue;
    for (const reverse of [false, true]) {
      const route = reverse ? [...pattern.route].reverse() : [...pattern.route];
      const legs = route.slice(1).map((to, i) => edgeBetween(route[i], to));
      if (legs.some((edge) => !edge || edge.lineId === 'maple'))
        throw new Error(`Service ${pattern.id} uses a missing or player-only edge.`);
      services.push({
        id: `${pattern.id}:${reverse ? 'b' : 'a'}`,
        pattern: pattern.id,
        name: pattern.name,
        kind: pattern.kind,
        lineId: legs[0].lineId,
        route,
        stops: pattern.stops ? [...pattern.stops] : [...route],
        departures: (() => {
          const list = [];
          const offset = reverse ? Math.round(pattern.headway / 2) : 0;
          for (let m = pattern.first + offset; m <= pattern.last; m += pattern.headway)
            list.push(m);
          return list;
        })(),
      });
    }
  }
  const serviceById = new Map(services.map((service) => [service.id, service]));

  let clock = 0;
  let trips = [];
  let blocks = {};
  let events = [];
  let stats = {};
  const resetDynamic = (minute) => {
    clock = minute;
    trips = [];
    blocks = {};
    events = [];
    stats = { completedTrips: 0, heldMinutes: 0, maxBlockOccupancy: 0, safetyViolations: 0 };
    for (const edge of edges.values()) if (edge.track === 'single') blocks[edge.id] = null;
  };

  const runMinutes = (edge, kind) =>
    (edge.km / Math.min(edge.speedKmh, SERVICE_KINDS[kind].speedKmh)) * 60;

  function spawn(service, departAt, stepStart) {
    const kind = SERVICE_KINDS[service.kind];
    const planned = [];
    let t = departAt;
    service.route.forEach((station, index) => {
      if (index > 0) t += runMinutes(edgeBetween(service.route[index - 1], station), service.kind);
      const stops =
        service.stops.includes(station) && index > 0 && index < service.route.length - 1;
      const arrive = index === 0 ? null : round(t);
      if (stops) t += kind.dwell;
      planned.push({
        station,
        arrive,
        depart: index === service.route.length - 1 ? null : round(t),
      });
    });
    trips.push({
      id: `${service.id}@${departAt}`,
      serviceId: service.id,
      name: service.name,
      kind: service.kind,
      lineId: service.lineId,
      route: service.route,
      index: 0,
      status: 'boarding',
      edgeId: null,
      progressKm: 0,
      dwellLeft: departAt - stepStart,
      planned,
      departed: [],
      delay: 0,
      heldMinutes: 0,
    });
  }

  function spawnDue(t0, t1) {
    const days = new Set([Math.floor(t0 / 1440), Math.floor(t1 / 1440)]);
    for (const service of services)
      for (const day of days)
        for (const m of service.departures) {
          const departAt = day * 1440 + m;
          const spawnAt = departAt - ORIGIN_BOARDING_MINUTES;
          if (spawnAt >= t0 && spawnAt < t1) spawn(service, departAt, t0);
        }
  }

  const pushEvent = (event) => {
    events.push(event);
    if (events.length > MAX_EVENTS) events = events.slice(-MAX_EVENTS);
  };

  function advanceTrip(trip, stepStart) {
    let time = STEP_MINUTES;
    while (time > EPSILON && trip.status !== 'done') {
      if (trip.status === 'running') {
        const edge = edges.get(trip.edgeId);
        const speed = Math.min(edge.speedKmh, SERVICE_KINDS[trip.kind].speedKmh);
        const need = ((edge.km - trip.progressKm) / speed) * 60;
        if (need > time) {
          trip.progressKm += (speed * time) / 60;
          time = 0;
          break;
        }
        time -= need;
        if (blocks[edge.id] === trip.id) blocks[edge.id] = null;
        trip.index += 1;
        trip.edgeId = null;
        trip.progressKm = 0;
        const station = trip.route[trip.index];
        if (trip.index === trip.route.length - 1) {
          trip.status = 'done';
          pushEvent({
            minute: round(stepStart + STEP_MINUTES - time),
            type: 'terminated',
            tripId: trip.id,
            stationId: station,
          });
          break;
        }
        const service = serviceById.get(trip.serviceId);
        trip.status = 'dwell';
        trip.dwellLeft = service.stops.includes(station)
          ? SERVICE_KINDS[trip.kind].dwell + Math.floor(random.next() * 3) * STEP_MINUTES
          : 0;
        continue;
      }
      if (trip.dwellLeft > EPSILON) {
        const used = Math.min(time, trip.dwellLeft);
        trip.dwellLeft -= used;
        time -= used;
        if (trip.dwellLeft > EPSILON) break;
      }
      const edge = edgeBetween(trip.route[trip.index], trip.route[trip.index + 1]);
      if (edge.track === 'single' && blocks[edge.id] && blocks[edge.id] !== trip.id) {
        if (trip.status !== 'held')
          pushEvent({
            minute: round(stepStart + STEP_MINUTES - time),
            type: 'held',
            tripId: trip.id,
            stationId: trip.route[trip.index],
            blockedBy: blocks[edge.id],
          });
        trip.status = 'held';
        trip.heldMinutes += time;
        stats.heldMinutes += time;
        time = 0;
        break;
      }
      if (edge.track === 'single') blocks[edge.id] = trip.id;
      const now = stepStart + STEP_MINUTES - time;
      trip.delay = round(Math.max(0, now - trip.planned[trip.index].depart));
      trip.departed.push(trip.route[trip.index]);
      trip.status = 'running';
      trip.edgeId = edge.id;
      trip.progressKm = 0;
    }
  }

  function step() {
    const stepStart = clock;
    spawnDue(stepStart, stepStart + STEP_MINUTES);
    trips.sort(
      (a, b) =>
        SERVICE_KINDS[a.kind].priority - SERVICE_KINDS[b.kind].priority ||
        a.planned[0].depart - b.planned[0].depart ||
        (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
    );
    for (const trip of trips) advanceTrip(trip, stepStart);
    const occupancy = {};
    for (const trip of trips)
      if (trip.status === 'running' && edges.get(trip.edgeId).track === 'single')
        occupancy[trip.edgeId] = (occupancy[trip.edgeId] ?? 0) + 1;
    for (const count of Object.values(occupancy)) {
      stats.maxBlockOccupancy = Math.max(stats.maxBlockOccupancy, count);
      if (count > 1) stats.safetyViolations += 1;
    }
    const before = trips.length;
    trips = trips.filter((trip) => trip.status !== 'done');
    stats.completedTrips += before - trips.length;
    clock = round(stepStart + STEP_MINUTES, 6);
  }

  let pending = 0;
  function tick(dtGameMinutes) {
    if (!Number.isFinite(dtGameMinutes) || dtGameMinutes < 0)
      throw new RangeError('Network tick needs a finite, non-negative game-minute step.');
    pending += dtGameMinutes;
    let steps = 0;
    while (pending + EPSILON >= STEP_MINUTES && steps < MAX_STEPS_PER_TICK) {
      pending -= STEP_MINUTES;
      step();
      steps++;
    }
    if (steps === MAX_STEPS_PER_TICK) pending = 0;
    if (pending < EPSILON) pending = Math.max(0, pending);
    return steps;
  }

  function restoreClock(minute) {
    if (!Number.isFinite(minute) || minute < 0)
      throw new RangeError('Clock must be a finite minute.');
    const target = Math.round(minute / STEP_MINUTES) * STEP_MINUTES;
    resetDynamic(Math.max(0, target - WARMUP_MINUTES));
    pending = 0;
    tick(target - clock);
  }
  restoreClock(startMinute);

  function trainView(trip) {
    const station = stations.get(trip.route[trip.index]);
    let map = station.map;
    let at = station.id;
    let edge = null;
    if (trip.status === 'running') {
      const e = edges.get(trip.edgeId);
      const next = stations.get(trip.route[trip.index + 1]);
      const t = Math.min(1, trip.progressKm / e.km);
      map = {
        x: round(station.map.x + (next.map.x - station.map.x) * t, 1),
        y: round(station.map.y + (next.map.y - station.map.y) * t, 1),
      };
      at = null;
      edge = { id: e.id, from: station.id, to: next.id, progress: round(t, 3) };
    }
    return {
      id: trip.id,
      serviceId: trip.serviceId,
      name: trip.name,
      kind: trip.kind,
      lineId: edge ? edges.get(edge.id).lineId : trip.lineId,
      status: trip.status,
      at,
      edge,
      origin: trip.route[0],
      destination: trip.route.at(-1),
      delayMinutes: trip.delay,
      heldMinutes: round(trip.heldMinutes),
      map,
    };
  }

  function planRoute(
    from,
    to,
    { unlockedOnly = false, transferMinutes = 5, dwellMinutes = 0.5 } = {},
  ) {
    if (!stations.has(from) || !stations.has(to))
      return {
        ok: false,
        reason: 'unknown-station',
        message: 'Both stations must exist on the network.',
      };
    if (from === to)
      return { ok: false, reason: 'same-station', message: 'Choose two different stations.' };
    const key = (station, line) => `${station}|${line ?? ''}`;
    const best = new Map([[key(from, null), 0]]);
    const previous = new Map();
    const open = [{ station: from, line: null, cost: 0 }];
    const done = new Set();
    let goal = null;
    while (open.length) {
      let bestIndex = 0;
      for (let i = 1; i < open.length; i++) if (open[i].cost < open[bestIndex].cost) bestIndex = i;
      const node = open.splice(bestIndex, 1)[0];
      const nodeKey = key(node.station, node.line);
      if (done.has(nodeKey)) continue;
      done.add(nodeKey);
      if (node.station === to) {
        goal = node;
        break;
      }
      for (const { edge, to: next } of adjacency.get(node.station) ?? []) {
        if (unlockedOnly && !unlocked.has(edge.lineId)) continue;
        const cost =
          node.cost +
          (edge.km / edge.speedKmh) * 60 +
          dwellMinutes +
          (node.line && node.line !== edge.lineId ? transferMinutes : 0);
        const nextKey = key(next, edge.lineId);
        if (cost < (best.get(nextKey) ?? Infinity) - EPSILON) {
          best.set(nextKey, cost);
          previous.set(nextKey, { key: nodeKey, edge });
          open.push({ station: next, line: edge.lineId, cost });
        }
      }
    }
    if (!goal)
      return {
        ok: false,
        reason: 'no-route',
        message: unlockedOnly
          ? 'No route on unlocked lines yet.'
          : 'No route between these stations.',
      };
    const path = [];
    for (let k = key(goal.station, goal.line); previous.has(k); k = previous.get(k).key)
      path.unshift(previous.get(k).edge);
    const stationsOnPath = [from];
    const legs = [];
    let km = 0;
    for (const edge of path) {
      const next = edge.from === stationsOnPath.at(-1) ? edge.to : edge.from;
      stationsOnPath.push(next);
      km += edge.km;
      const minutes = (edge.km / edge.speedKmh) * 60;
      const leg = legs.at(-1);
      if (leg && leg.lineId === edge.lineId) {
        leg.to = next;
        leg.stations.push(next);
        leg.km += edge.km;
        leg.minutes += minutes;
      } else
        legs.push({
          lineId: edge.lineId,
          from: stationsOnPath.at(-2),
          to: next,
          stations: [stationsOnPath.at(-2), next],
          km: edge.km,
          minutes,
        });
    }
    return {
      ok: true,
      from,
      to,
      stations: stationsOnPath,
      legs: legs.map((leg) => ({ ...leg, km: round(leg.km), minutes: round(leg.minutes, 1) })),
      km: round(km),
      minutes: round(goal.cost, 1),
      transfers: Math.max(0, legs.length - 1),
      unlockedOnly,
    };
  }

  function upcomingDepartures(stationId, { from = clock, horizon = 180, lineId } = {}) {
    const list = [];
    const firstDay = Math.floor(from / 1440);
    for (const service of services) {
      if (service.route[0] !== stationId || (lineId && service.lineId !== lineId)) continue;
      for (const day of [firstDay, firstDay + 1])
        for (const m of service.departures) {
          const departsAt = day * 1440 + m;
          if (departsAt < from || departsAt > from + horizon) continue;
          list.push({
            tripId: `${service.id}@${departsAt}`,
            serviceId: service.id,
            name: service.name,
            kind: service.kind,
            lineId: service.lineId,
            destination: service.route.at(-1),
            departsAt,
          });
        }
    }
    return list.sort((a, b) => a.departsAt - b.departsAt || (a.tripId < b.tripId ? -1 : 1));
  }

  /** 'scheduled' | 'boarding' | 'departed' for a trip at a station (origin or intermediate). */
  function departureStatus(tripId, stationId) {
    const trip = trips.find((item) => item.id === tripId);
    if (trip) return trip.departed.includes(stationId) ? 'departed' : 'boarding';
    const [serviceId, minuteText] = String(tripId).split('@');
    const departsAt = Number(minuteText);
    if (!serviceById.has(serviceId) || !Number.isFinite(departsAt)) return 'unknown';
    return clock < departsAt - ORIGIN_BOARDING_MINUTES ? 'scheduled' : 'departed';
  }

  function mapleMapPoint(distanceMetres) {
    const list = maple.map((stop) => stations.get(stop.id));
    if (!Number.isFinite(distanceMetres)) return { ...list[0].map };
    if (distanceMetres <= list[0].routeMetres) return { ...list[0].map };
    for (let i = 1; i < list.length; i++) {
      if (distanceMetres <= list[i].routeMetres) {
        const a = list[i - 1],
          b = list[i];
        const t = (distanceMetres - a.routeMetres) / (b.routeMetres - a.routeMetres);
        return {
          x: round(a.map.x + (b.map.x - a.map.x) * t, 1),
          y: round(a.map.y + (b.map.y - a.map.y) * t, 1),
        };
      }
    }
    return { ...list.at(-1).map };
  }

  const clone = (value) => JSON.parse(JSON.stringify(value));
  const map = clone({
    size: MAP_SIZE,
    prefectures: PREFECTURES,
    stations: [...stations.values()],
    lines: [...lines.values()],
    edges: [...edges.values()],
    services: services.map(({ departures: _d, ...service }) => service),
    junctions: [...stations.values()].filter((s) => s.lines.length > 1).map((s) => s.id),
  });

  return {
    tick,
    restoreClock,
    planRoute,
    upcomingDepartures,
    departureStatus,
    mapleMapPoint,
    now: () => clock,
    getMap: () => clone(map),
    getStation: (id) => (stations.has(id) ? clone(stations.get(id)) : null),
    getLine: (id) => (lines.has(id) ? clone(lines.get(id)) : null),
    stationIds: () => [...stations.keys()],
    mapleStationIds: () => maple.map((stop) => stop.id),
    isLineUnlocked: (id) => unlocked.has(id),
    setLineUnlocked(id, value = true) {
      if (!lines.has(id)) return false;
      if (id === 'maple') return true;
      if (value) unlocked.add(id);
      else unlocked.delete(id);
      return true;
    },
    getState() {
      return {
        clock,
        timeLabel: formatClock(clock),
        seed,
        unlockedLines: [...unlocked].sort(),
        trains: trips.map(trainView),
        blocks: { ...blocks },
        events: events.map((event) => ({ ...event })),
        stats: { ...stats, heldMinutes: round(stats.heldMinutes), activeTrains: trips.length },
      };
    },
  };
}
