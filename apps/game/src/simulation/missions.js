/**
 * Missions played on the Maple Line, generated from network business demand.
 *
 * This layer only observes the drive: distance, speed, doors and the game clock. It never
 * changes speed, doors or power. Loading and unloading need the train stopped at the right
 * platform with doors open for the whole handling time; any interruption restarts the count.
 *
 * Lifecycle: offered → accepted → loading → in-transit → unloading → completed | failed.
 */
import { quotePrice } from './business.js';

export const MISSIONS_STORAGE_KEY = 'maple-line.missions.v1';
export const MISSIONS_SAVE_VERSION = 1;
export const STOPPED_SPEED_MPS = 0.1;
export const PLATFORM_RANGE_METRES = 26;
export const MISSION_TYPES = Object.freeze(['passenger', 'freight', 'express', 'connection']);
export const MISSION_STATUSES = Object.freeze([
  'offered',
  'accepted',
  'loading',
  'in-transit',
  'unloading',
  'completed',
  'failed',
]);
export const HANDLING_SECONDS = Object.freeze({
  passenger: { load: 6, unload: 6 },
  freight: { load: 20, unload: 15 },
  express: { load: 4, unload: 4 },
  connection: { load: 6, unload: 5 },
});
// Deadlines assume an average of 45 km/h including stops, plus a type-specific slack.
export const PLANNING_KMH = 45;
const SLACK_MINUTES = { passenger: 15, freight: 20, express: 5, connection: 10 };
const OFFER_LIFETIME_MINUTES = 90;
const CONNECTION_GRACE_MINUTES = 30;
const MAX_ACTIVE = 3;
const MAX_GENERATED_OFFERS = 4;
const MAX_ARCHIVE = 12;
const MAX_NOTICES = 5;
const MAX_SAVE_LENGTH = 64 * 1024;
const AUTOSAVE_SECONDS = 10;
const ACTIVE = ['accepted', 'loading', 'in-transit', 'unloading'];
const DONE = ['completed', 'failed'];

export const CAMPAIGN = Object.freeze([
  {
    type: 'passenger',
    from: 'momiji',
    to: 'aonuma',
    cargo: 'tourists',
    units: 40,
    title: 'First passengers',
    brief:
      'A school group wants to see Aonuma lake. Board them at Momiji and set them down at Aonuma.',
    unlocks: { lines: ['lake'], prefectures: [], flags: [] },
  },
  {
    type: 'freight',
    from: 'hinoki',
    to: 'ishikura',
    cargo: 'timber',
    units: 12,
    title: 'Cedar for the quarry sheds',
    brief:
      'Load 12 t of cedar at Hinoki and deliver it to the Ishikura quarry. Loading takes time: keep the doors open until it is done.',
    unlocks: { lines: ['mountain'], prefectures: ['takane'], flags: [] },
  },
  {
    type: 'express',
    from: 'ishikura',
    to: 'hoshimi',
    cargo: 'mail',
    units: 12,
    title: 'Mountain post',
    brief:
      'The Hoshimi post office closes soon. Arrive before the deadline; arriving far too early costs punctuality too.',
    unlocks: { lines: [], prefectures: [], flags: ['express-contracts'] },
  },
  {
    type: 'connection',
    from: 'hoshimi',
    to: 'yukihara',
    cargo: 'tourists',
    units: 30,
    connectLine: 'mountain',
    title: 'Over the border',
    brief: 'Hikers bound for Kitagawa must reach Yukihara before their Mountain Line train leaves.',
    unlocks: { lines: [], prefectures: ['kitagawa'], flags: [] },
  },
  {
    type: 'freight',
    from: 'minato',
    to: 'akane',
    cargo: 'fish',
    units: 10,
    title: 'Morning catch',
    brief: 'Fresh fish from Minato harbour for the Akane inns.',
    unlocks: { lines: ['coastal'], prefectures: ['shiokaze'], flags: [] },
  },
  {
    type: 'passenger',
    from: 'tanada',
    to: 'harumi',
    cargo: 'tourists',
    units: 120,
    title: 'Harvest festival crowd',
    brief: 'Terrace farmers are heading to the Harumi festival. Carry 120 passengers.',
    unlocks: { lines: [], prefectures: [], flags: ['city-contracts'] },
  },
  {
    type: 'connection',
    from: 'minato',
    to: 'harumi',
    cargo: 'tourists',
    units: 60,
    connectLine: 'trunk',
    title: 'The Miyako connection',
    brief: 'Business travellers must make their intercity train to Miyako at Harumi.',
    unlocks: { lines: ['trunk'], prefectures: ['miyako'], flags: [] },
  },
  {
    type: 'express',
    from: 'momiji',
    to: 'harumi',
    cargo: 'mail',
    units: 20,
    title: 'Through run to the coast',
    brief: 'Carry the evening mail the whole length of the Maple Line on time.',
    unlocks: { lines: ['loop'], prefectures: [], flags: ['network-complete'] },
  },
]);

/** Returns a `stopAt(distance)` that reads live stop distances (they change with the route). */
export function createStopLocator(stops, range = PLATFORM_RANGE_METRES) {
  return (distance) => {
    if (!Number.isFinite(distance)) return null;
    let best = null;
    for (const stop of stops) {
      const gap = Math.abs(stop.distance - distance);
      if (gap <= range && (!best || gap < Math.abs(best.distance - distance))) best = stop;
    }
    return best;
  };
}

const round = (value, places = 1) => Math.round(value * 10 ** places) / 10 ** places;
const isString = (value, max) =>
  typeof value === 'string' && value.length > 0 && value.length <= max;
const stringList = (value, allowed) =>
  Array.isArray(value) && value.length <= 16 && value.every((item) => allowed.has(item));

function validMission(m, ctx) {
  if (!m || typeof m !== 'object' || Array.isArray(m)) return false;
  if (!/^m\d{1,7}$/.test(m.id)) return false;
  if (!MISSION_TYPES.includes(m.type) || !MISSION_STATUSES.includes(m.status)) return false;
  if (!ctx.maple.has(m.from) || !ctx.maple.has(m.to) || m.from === m.to) return false;
  if (!ctx.stations.has(m.origin) || !ctx.stations.has(m.destination)) return false;
  if (!isString(m.cargo, 16) || !isString(m.title, 80) || !isString(m.brief, 240)) return false;
  if (!Number.isInteger(m.units) || m.units < 1 || m.units > 1000) return false;
  for (const key of ['reward', 'penalty'])
    if (!Number.isInteger(m[key]) || m[key] < 0 || m[key] > 1e6) return false;
  for (const key of ['repGain', 'repLoss', 'mapleKm', 'offeredAt', 'offerExpiresAt'])
    if (!Number.isFinite(m[key]) || m[key] < 0) return false;
  if (!Number.isFinite(m.progressSeconds) || m.progressSeconds < 0 || m.progressSeconds > 120)
    return false;
  if (
    m.campaignStep !== null &&
    !(Number.isInteger(m.campaignStep) && m.campaignStep >= 0 && m.campaignStep < CAMPAIGN.length)
  )
    return false;
  if (!ctx.prefectures.has(m.prefecture)) return false;
  const offered = m.status === 'offered';
  if (
    offered
      ? m.deadline !== null || m.acceptedAt !== null
      : !Number.isFinite(m.deadline) || !Number.isFinite(m.acceptedAt)
  )
    return false;
  if (m.connectLine !== null && !ctx.lines.has(m.connectLine)) return false;
  if (m.type === 'connection' && m.connectLine === null) return false;
  if (m.connection !== null) {
    const c = m.connection;
    if (
      !c ||
      !isString(c.tripId, 64) ||
      !ctx.stations.has(c.stationId) ||
      !Number.isFinite(c.departsAt) ||
      !isString(c.name, 64)
    )
      return false;
  }
  if (m.type === 'connection' && !offered && m.connection === null) return false;
  if (
    m.punctuality !== null &&
    !(Number.isFinite(m.punctuality) && m.punctuality >= 0 && m.punctuality <= 100)
  )
    return false;
  if (
    m.result !== null &&
    (!m.result || !isString(m.result.reason, 40) || !Number.isFinite(m.result.minute))
  )
    return false;
  if (DONE.includes(m.status) !== (m.result !== null)) return false;
  const u = m.unlocks;
  if (
    !u ||
    !stringList(u.lines, ctx.lines) ||
    !stringList(u.prefectures, ctx.prefectures) ||
    !Array.isArray(u.flags) ||
    !u.flags.every((f) => isString(f, 40))
  )
    return false;
  return true;
}

/** Validates a raw save (string or object). Returns a clean object or null. */
export function validateMissionsSave(raw, { stationIds, mapleStationIds, lineIds, prefectureIds }) {
  try {
    const text = typeof raw === 'string' ? raw : JSON.stringify(raw);
    if (!text || text.length > MAX_SAVE_LENGTH) return null;
    const save = JSON.parse(text);
    if (!save || typeof save !== 'object' || Array.isArray(save)) return null;
    if (save.version !== MISSIONS_SAVE_VERSION) return null;
    if (!Number.isFinite(save.clock) || save.clock < 0 || save.clock > 1e8) return null;
    if (!Number.isInteger(save.nextId) || save.nextId < 1 || save.nextId > 1e7) return null;
    if (
      !Number.isInteger(save.campaignIndex) ||
      save.campaignIndex < 0 ||
      save.campaignIndex > CAMPAIGN.length
    )
      return null;
    const ctx = {
      stations: new Set(stationIds),
      maple: new Set(mapleStationIds),
      lines: new Set(lineIds),
      prefectures: new Set(prefectureIds),
    };
    const u = save.unlocks;
    if (
      !u ||
      !stringList(u.lines, ctx.lines) ||
      !stringList(u.prefectures, ctx.prefectures) ||
      !Array.isArray(u.flags) ||
      u.flags.length > 16 ||
      !u.flags.every((f) => isString(f, 40))
    )
      return null;
    if (!Array.isArray(save.missions) || save.missions.length > 40) return null;
    if (!save.missions.every((m) => validMission(m, ctx))) return null;
    const ids = new Set(save.missions.map((m) => m.id));
    if (ids.size !== save.missions.length) return null;
    if (save.missions.some((m) => Number(m.id.slice(1)) >= save.nextId)) return null;
    if (save.missions.filter((m) => ACTIVE.includes(m.status)).length > MAX_ACTIVE) return null;
    if (!save.ledger || typeof save.ledger !== 'object') return null;
    return structuredClone(save);
  } catch {
    return null;
  }
}

/**
 * @param {object} options
 * @param {ReturnType<import('./rail-network.js').createRailNetwork>} options.network
 * @param {ReturnType<import('./business.js').createBusiness>} options.business
 * @param {Storage|null} [options.storage] localStorage-like; null disables saving.
 */
export function createMissions({
  network,
  business,
  storage = globalThis.localStorage ?? null,
} = {}) {
  if (!network?.planRoute || !business?.refresh)
    throw new TypeError('Missions need the rail network and business layer.');
  const map = network.getMap();
  const stationById = new Map(map.stations.map((station) => [station.id, station]));
  const mapleIds = network.mapleStationIds();
  const ids = {
    stationIds: map.stations.map((s) => s.id),
    mapleStationIds: mapleIds,
    lineIds: map.lines.map((l) => l.id),
    prefectureIds: map.prefectures.map((p) => p.id),
  };
  let missions = [];
  let nextId = 1;
  let campaignIndex = 0;
  let unlocks = { lines: new Set(), prefectures: new Set(['momiji']), flags: new Set() };
  let clock = network.now();
  let lastDistance = null;
  let lastOfferRefresh = -Infinity;
  let sinceSave = 0;
  let dirty = false;
  let notices = [];
  let loadedFrom = 'fresh';

  const station = (id) => stationById.get(id);
  const notice = (text, tone = 'info') => {
    notices = [
      ...notices,
      { id: `${Math.round(clock * 100)}-${notices.length}`, minute: clock, text, tone },
    ].slice(-MAX_NOTICES);
  };
  const mapleKm = (from, to) =>
    Math.abs(station(to).routeMetres - station(from).routeMetres) / 1000;

  function applyUnlocksToNetwork() {
    for (const line of map.lines)
      if (line.id !== 'maple') network.setLineUnlocked(line.id, unlocks.lines.has(line.id));
  }

  function makeMission(spec) {
    const km = mapleKm(spec.from, spec.to);
    const destination = station(spec.destination ?? spec.to);
    const reward =
      spec.reward ??
      quotePrice({ type: spec.cargo, km, units: spec.units, urgency: spec.urgency ?? 'standard' });
    return {
      id: `m${nextId++}`,
      type: spec.type,
      title: spec.title,
      brief: spec.brief,
      campaignStep: spec.campaignStep ?? null,
      from: spec.from,
      to: spec.to,
      origin: spec.origin ?? spec.from,
      destination: destination.id,
      prefecture: destination.prefecture,
      cargo: spec.cargo,
      units: spec.units,
      urgency: spec.urgency ?? 'standard',
      mapleKm: round(km, 2),
      connectLine: spec.connectLine ?? null,
      connection: null,
      reward,
      penalty: Math.round(reward * 0.3),
      repGain:
        spec.campaignStep !== undefined && spec.campaignStep !== null
          ? 5
          : { standard: 2, priority: 3, urgent: 4 }[spec.urgency ?? 'standard'],
      repLoss: 3,
      status: 'offered',
      offeredAt: clock,
      offerExpiresAt:
        spec.campaignStep !== undefined && spec.campaignStep !== null
          ? 1e8
          : clock + OFFER_LIFETIME_MINUTES,
      acceptedAt: null,
      deadline: null,
      progressSeconds: 0,
      punctuality: null,
      result: null,
      unlocks: {
        lines: [...(spec.unlocks?.lines ?? [])],
        prefectures: [...(spec.unlocks?.prefectures ?? [])],
        flags: [...(spec.unlocks?.flags ?? [])],
      },
    };
  }

  function offerCampaignStep() {
    if (campaignIndex >= CAMPAIGN.length) return;
    if (missions.some((m) => m.campaignStep === campaignIndex && !DONE.includes(m.status))) return;
    const step = CAMPAIGN[campaignIndex];
    if (!station(step.from) || !station(step.to)) return;
    const km = mapleKm(step.from, step.to);
    const reward = Math.max(
      3000,
      Math.round(
        (quotePrice({
          type: step.cargo,
          km,
          units: step.units,
          urgency: step.type === 'express' ? 'urgent' : 'priority',
        }) *
          1.5) /
          10,
      ) * 10,
    );
    missions.push(
      makeMission({
        ...step,
        campaignStep: campaignIndex,
        reward,
        title: `${campaignIndex + 1}/8 · ${step.title}`,
      }),
    );
    dirty = true;
  }

  function describe(demand, type, from, to) {
    const cargo = demand.type === 'tourists' ? 'passengers' : demand.type;
    const origin = station(demand.from).name,
      destination = station(demand.to).name;
    const leg =
      from === demand.from && to === demand.to
        ? ''
        : ` Carry the Maple Line leg ${station(from).name} → ${station(to).name}.`;
    const titles = {
      passenger: `Carry ${demand.units} passengers`,
      freight: `${demand.units} t of ${cargo}`,
      express: `Express ${cargo}`,
      connection: `Connection to ${destination}`,
    };
    return {
      title: `${titles[type]} · ${station(from).name} → ${station(to).name}`,
      brief:
        `${destination} is asking for ${cargo} from ${origin} (${demand.urgency}).${leg}`.slice(
          0,
          240,
        ),
    };
  }

  // Only stations the player can currently reach through unlocked prefectures and lines.
  function canServe(from, to) {
    if (!unlocks.prefectures.has(from.prefecture) || !unlocks.prefectures.has(to.prefecture))
      return false;
    const route = network.planRoute(from.id, to.id, { unlockedOnly: true });
    return route.ok && route.legs.some((leg) => leg.lineId === 'maple' && leg.stations.length > 1);
  }

  function refreshOffers() {
    const demand = business.refresh(clock, { canServe });
    let generated = missions.filter(
      (m) => m.status === 'offered' && m.campaignStep === null,
    ).length;
    const wagon = business.capacity().wagonTonnes;
    for (const entry of demand) {
      if (generated >= MAX_GENERATED_OFFERS) break;
      if (
        !unlocks.prefectures.has(station(entry.from).prefecture) ||
        !unlocks.prefectures.has(station(entry.to).prefecture)
      )
        continue;
      const route = network.planRoute(entry.from, entry.to, { unlockedOnly: true });
      if (!route.ok) continue;
      const legIndex = route.legs.findIndex((leg) => leg.lineId === 'maple');
      if (legIndex < 0) continue;
      const leg = route.legs[legIndex];
      const onward = route.legs[legIndex + 1];
      let type = 'passenger';
      if (entry.type === 'mail')
        type = unlocks.flags.has('express-contracts') ? 'express' : 'passenger';
      else if (entry.type !== 'tourists') type = 'freight';
      else if (legIndex === 0 && onward) type = 'connection';
      if (type === 'freight' && entry.units > wagon) continue;
      if (type === 'passenger' && entry.type === 'mail') continue;
      business.takeDemand(entry.id);
      const text = describe(entry, type, leg.from, leg.to);
      missions.push(
        makeMission({
          type,
          from: leg.from,
          to: leg.to,
          origin: entry.from,
          destination: entry.to,
          cargo: entry.type,
          units: entry.units,
          urgency: entry.urgency,
          connectLine: type === 'connection' ? onward.lineId : null,
          ...text,
        }),
      );
      generated++;
      dirty = true;
    }
  }

  function applyUnlocks(mission) {
    for (const line of mission.unlocks.lines) unlocks.lines.add(line);
    for (const prefecture of mission.unlocks.prefectures) unlocks.prefectures.add(prefecture);
    for (const flag of mission.unlocks.flags) unlocks.flags.add(flag);
    applyUnlocksToNetwork();
    const gained = [
      ...mission.unlocks.lines.map((id) => network.getLine(id)?.name ?? id),
      ...mission.unlocks.prefectures.map(
        (id) => map.prefectures.find((p) => p.id === id)?.name ?? id,
      ),
    ];
    if (gained.length) notice(`Unlocked: ${gained.join(', ')}`, 'unlock');
  }

  function archiveTrim() {
    const done = missions.filter((m) => DONE.includes(m.status));
    if (done.length <= MAX_ARCHIVE) return;
    const drop = new Set(done.slice(0, done.length - MAX_ARCHIVE).map((m) => m.id));
    missions = missions.filter((m) => !drop.has(m.id));
  }

  function complete(mission) {
    let reward = mission.reward;
    if (mission.type === 'express') {
      const early = mission.deadline - clock;
      mission.punctuality = Math.max(60, Math.round(100 - Math.max(0, early - 10) * 2));
      reward = Math.round((reward * (0.5 + mission.punctuality / 200)) / 10) * 10;
    }
    mission.status = 'completed';
    mission.progressSeconds = 0;
    mission.result = { reason: 'delivered', minute: clock, money: reward };
    business.credit(reward, mission.title, clock);
    business.adjustReputation(mission.prefecture, mission.repGain);
    business.recordOutcome(true);
    notice(`Completed: ${mission.title} · +¥${reward.toLocaleString('en-US')}`, 'success');
    if (mission.campaignStep !== null) {
      applyUnlocks(mission);
      if (mission.campaignStep === campaignIndex) campaignIndex += 1;
      offerCampaignStep();
    }
    archiveTrim();
    dirty = true;
  }

  function fail(mission, reason) {
    const penalty = reason === 'abandoned' ? Math.round(mission.penalty / 2) : mission.penalty;
    mission.status = 'failed';
    mission.progressSeconds = 0;
    mission.result = { reason, minute: clock, money: -penalty };
    business.debit(penalty, `${mission.title} (${reason})`, clock);
    business.adjustReputation(mission.prefecture, -mission.repLoss);
    business.recordOutcome(false);
    notice(`Failed: ${mission.title} · ${reason}`, 'failure');
    if (mission.campaignStep !== null) offerCampaignStep();
    archiveTrim();
    dirty = true;
  }

  function persist() {
    dirty = false;
    sinceSave = 0;
    if (!storage) return false;
    try {
      storage.setItem(MISSIONS_STORAGE_KEY, JSON.stringify(serialize()));
      return true;
    } catch {
      return false;
    }
  }

  function serialize() {
    return {
      version: MISSIONS_SAVE_VERSION,
      clock,
      nextId,
      campaignIndex,
      unlocks: {
        lines: [...unlocks.lines],
        prefectures: [...unlocks.prefectures],
        flags: [...unlocks.flags],
      },
      missions: structuredClone(missions),
      ledger: business.getLedger(),
    };
  }

  function restore(save) {
    if (!business.restoreLedger(save.ledger)) return false;
    missions = save.missions;
    nextId = save.nextId;
    campaignIndex = save.campaignIndex;
    unlocks = {
      lines: new Set(save.unlocks.lines),
      prefectures: new Set(['momiji', ...save.unlocks.prefectures]),
      flags: new Set(save.unlocks.flags),
    };
    if (save.clock > network.now()) network.restoreClock(save.clock);
    clock = network.now();
    applyUnlocksToNetwork();
    return true;
  }

  function freshStart() {
    missions = [];
    nextId = 1;
    campaignIndex = 0;
    unlocks = { lines: new Set(), prefectures: new Set(['momiji']), flags: new Set() };
    business.reset();
    applyUnlocksToNetwork();
    offerCampaignStep();
    refreshOffers();
  }

  function load() {
    let raw = null;
    try {
      raw = storage?.getItem(MISSIONS_STORAGE_KEY) ?? null;
    } catch {
      raw = null;
    }
    const save = raw ? validateMissionsSave(raw, ids) : null;
    if (save && restore(save)) {
      loadedFrom = 'save';
      offerCampaignStep();
    } else {
      loadedFrom = raw ? 'corrupt-save-replaced' : 'fresh';
      freshStart();
    }
    return loadedFrom;
  }

  const activeMissions = () => missions.filter((m) => ACTIVE.includes(m.status));

  function update({ dtSeconds = 0, gameMinutes, distance, speedMps, doorsOpen, stopAt } = {}) {
    if (Number.isFinite(gameMinutes)) clock = gameMinutes;
    if (Number.isFinite(distance)) lastDistance = distance;
    const dt = Number.isFinite(dtSeconds) && dtSeconds > 0 ? Math.min(dtSeconds, 1) : 0;
    const stop =
      typeof stopAt === 'function' && Number.isFinite(distance) ? stopAt(distance) : null;
    const handling =
      Boolean(stop) &&
      doorsOpen === true &&
      Number.isFinite(speedMps) &&
      Math.abs(speedMps) <= STOPPED_SPEED_MPS;

    for (const mission of activeMissions()) {
      // The network decides a connection: a held train can still be caught after its
      // timetabled minute. The deadline is only a backstop for that case.
      if (
        mission.connection &&
        network.departureStatus(mission.connection.tripId, mission.connection.stationId) ===
          'departed'
      ) {
        fail(mission, 'missed-connection');
        continue;
      }
      if (clock > mission.deadline) {
        fail(mission, 'deadline');
        continue;
      }
      const loadingPhase = ['accepted', 'loading'].includes(mission.status);
      const target = loadingPhase ? mission.from : mission.to;
      const need = HANDLING_SECONDS[mission.type][loadingPhase ? 'load' : 'unload'];
      if (handling && stop.id === target) {
        mission.status = loadingPhase ? 'loading' : 'unloading';
        mission.progressSeconds = Math.min(need, mission.progressSeconds + dt);
        if (mission.progressSeconds >= need) {
          if (loadingPhase) {
            mission.status = 'in-transit';
            mission.progressSeconds = 0;
            notice(`Loaded at ${station(mission.from).name}. Next: ${station(mission.to).name}.`);
            dirty = true;
          } else complete(mission);
        }
      } else if (mission.status === 'loading' || mission.status === 'unloading') {
        // Doors closed, train moved, or wrong platform: the handling count starts again.
        mission.status = mission.status === 'loading' ? 'accepted' : 'in-transit';
        mission.progressSeconds = 0;
      }
    }
    for (const mission of missions)
      if (mission.status === 'offered' && clock > mission.offerExpiresAt)
        mission.status = 'expired';
    if (missions.some((m) => m.status === 'expired')) {
      missions = missions.filter((m) => m.status !== 'expired');
      dirty = true;
    }
    if (clock - lastOfferRefresh >= 5) {
      lastOfferRefresh = clock;
      refreshOffers();
    }
    sinceSave += dt;
    if (dirty && sinceSave >= AUTOSAVE_SECONDS) persist();
    // Cheap per-frame call: read getState() at UI rate (the panel throttles to 4 Hz).
  }

  function allowanceFor(mission) {
    const toStart = Number.isFinite(lastDistance)
      ? Math.abs(station(mission.from).routeMetres - lastDistance) / 1000
      : mission.mapleKm;
    const km = toStart + mission.mapleKm;
    const handling = HANDLING_SECONDS[mission.type];
    return Math.ceil(
      (km / PLANNING_KMH) * 60 +
        SLACK_MINUTES[mission.type] +
        (handling.load + handling.unload) / 60,
    );
  }

  function accept(id) {
    const mission = missions.find((m) => m.id === id);
    if (!mission)
      return { ok: false, reason: 'unknown-mission', message: 'No mission with that id.' };
    if (mission.status !== 'offered')
      return { ok: false, reason: 'not-offered', message: 'That mission is not on offer.' };
    const active = activeMissions();
    if (active.length >= MAX_ACTIVE)
      return {
        ok: false,
        reason: 'too-many',
        message: `At most ${MAX_ACTIVE} missions can run at once.`,
      };
    const capacity = business.capacity();
    const seated = active
      .filter((m) => m.cargo === 'tourists')
      .reduce((sum, m) => sum + m.units, 0);
    if (mission.cargo === 'tourists' && seated + mission.units > capacity.seats)
      return {
        ok: false,
        reason: 'no-seats',
        message: `Only ${capacity.seats - seated} seats are free.`,
      };
    if (mission.type === 'freight') {
      const wagons = active.filter((m) => m.type === 'freight').length;
      if (wagons >= capacity.freightWagons)
        return { ok: false, reason: 'no-wagon', message: 'The freight wagon is already booked.' };
      if (mission.units > capacity.wagonTonnes)
        return {
          ok: false,
          reason: 'too-heavy',
          message: `The wagon carries at most ${capacity.wagonTonnes} t.`,
        };
    }
    const allowance = allowanceFor(mission);
    if (mission.type === 'connection') {
      const travel = allowance - SLACK_MINUTES.connection;
      const departure = network.upcomingDepartures(mission.to, {
        from: clock + travel,
        horizon: 240,
        lineId: mission.connectLine,
      })[0];
      if (!departure)
        return {
          ok: false,
          reason: 'no-connection',
          message: 'No connecting train is scheduled in the next four hours.',
        };
      mission.connection = {
        tripId: departure.tripId,
        stationId: mission.to,
        lineId: departure.lineId,
        departsAt: departure.departsAt,
        name: `${departure.name} to ${station(departure.destination)?.name ?? departure.destination}`,
      };
      mission.deadline = departure.departsAt + CONNECTION_GRACE_MINUTES;
    } else mission.deadline = clock + allowance;
    mission.status = 'accepted';
    mission.acceptedAt = clock;
    mission.progressSeconds = 0;
    notice(`Accepted: ${mission.title}`);
    persist();
    return { ok: true, mission: structuredClone(mission) };
  }

  function abandon(id) {
    const mission = missions.find((m) => m.id === id);
    if (!mission)
      return { ok: false, reason: 'unknown-mission', message: 'No mission with that id.' };
    if (mission.status === 'offered') {
      if (mission.campaignStep !== null)
        return {
          ok: false,
          reason: 'campaign',
          message: 'Campaign missions stay on the board until done.',
        };
      missions = missions.filter((m) => m.id !== id);
      persist();
      return { ok: true, declined: true };
    }
    if (!ACTIVE.includes(mission.status))
      return { ok: false, reason: 'not-active', message: 'That mission has already finished.' };
    fail(mission, 'abandoned');
    persist();
    return { ok: true, mission: structuredClone(mission) };
  }

  const view = (m) => {
    const need =
      HANDLING_SECONDS[m.type][['accepted', 'loading'].includes(m.status) ? 'load' : 'unload'];
    return {
      ...structuredClone(m),
      fromName: station(m.from).name,
      toName: station(m.to).name,
      handlingSeconds: need,
      handlingProgress: round(Math.min(1, m.progressSeconds / need), 2),
      minutesLeft: m.deadline === null ? null : round(m.deadline - clock, 1),
      nextStop: ['accepted', 'loading'].includes(m.status)
        ? m.from
        : ACTIVE.includes(m.status)
          ? m.to
          : null,
    };
  };

  function getState() {
    const active = activeMissions();
    return {
      version: MISSIONS_SAVE_VERSION,
      clock,
      loadedFrom,
      offers: missions.filter((m) => m.status === 'offered').map(view),
      active: active.map(view),
      archive: missions
        .filter((m) => DONE.includes(m.status))
        .map(view)
        .reverse(),
      campaign: {
        step: campaignIndex,
        total: CAMPAIGN.length,
        complete: campaignIndex >= CAMPAIGN.length,
        steps: CAMPAIGN.map((step, i) => ({
          title: step.title,
          type: step.type,
          done: i < campaignIndex,
        })),
      },
      unlocks: {
        lines: [...unlocks.lines].sort(),
        prefectures: [...unlocks.prefectures].sort(),
        flags: [...unlocks.flags].sort(),
      },
      ledger: business.getLedger(),
      notices: notices.map((n) => ({ ...n })),
    };
  }

  load();

  return {
    update,
    accept,
    abandon,
    getState,
    save: persist,
    load,
    reset() {
      freshStart();
      notices = [];
      loadedFrom = 'fresh';
      persist();
    },
    isUnlocked: (kind, id) => Boolean(unlocks[kind]?.has(id)),
  };
}
