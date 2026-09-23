/**
 * Business layer for the regional network: cargo demand, prices and the player's company ledger.
 * Pure logic, no DOM or Three.js. All money is whole yen; all times are game minutes.
 *
 * Numbers, kept deliberately small and readable:
 * - price = units × (base + perKm × km) × urgency multiplier × reputation bonus,
 *   rounded to 10 yen and clamped to PRICE_LIMITS.
 * - urgency multipliers: standard 1.0, priority 1.25, urgent 1.6.
 * - reputation bonus: +0.2% per reputation point in the destination prefecture (max +20%).
 * - the company starts with ¥20,000, 10 reputation in Momiji Prefecture and 0 elsewhere.
 * - capacity: 5 cars × 64 seats = 320 seats, plus one freight wagon of 20 tonnes.
 */
import { INDUSTRY_TYPES, PREFECTURES, createRandom } from './rail-network.js';

export const CARGO = Object.freeze({
  rice: { label: 'Rice', unit: 't', base: 400, perKm: 38, freight: true },
  timber: { label: 'Timber', unit: 't', base: 350, perKm: 30, freight: true },
  fish: { label: 'Fresh fish', unit: 't', base: 500, perKm: 55, freight: true, perishable: true },
  tea: { label: 'Tea', unit: 't', base: 450, perKm: 45, freight: true },
  stone: { label: 'Stone', unit: 't', base: 300, perKm: 22, freight: true },
  goods: { label: 'Goods', unit: 't', base: 420, perKm: 40, freight: true },
  mail: { label: 'Mail', unit: 'bags', base: 120, perKm: 16, freight: false, express: true },
  tourists: { label: 'Passengers', unit: 'passengers', base: 90, perKm: 9, freight: false },
});
export const URGENCY = Object.freeze({ standard: 1, priority: 1.25, urgent: 1.6 });
export const PRICE_LIMITS = Object.freeze({ min: 500, max: 250000 });
export const REPUTATION_LIMITS = Object.freeze({ min: 0, max: 100 });
export const COMPANY_START = Object.freeze({
  money: 20000,
  reputation: { momiji: 10 },
  seats: 320,
  freightWagons: 1,
  wagonTonnes: 20,
});
export const DEMAND_INTERVAL_MINUTES = 30;
export const DEMAND_LIFETIME_MINUTES = 120;
const MAX_DEMAND = 12;
const MAX_HISTORY = 20;
const MAX_UNITS = { freight: 20, tourists: 160, mail: 40 };

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

/** Contract price in yen. Invalid input throws; the result is always inside PRICE_LIMITS. */
export function quotePrice({ type, km, units, urgency = 'standard', reputation = 0 }) {
  const cargo = CARGO[type];
  if (!cargo) throw new TypeError(`Unknown cargo type: ${type}`);
  if (!Number.isFinite(km) || km < 0)
    throw new RangeError('Distance must be a non-negative number.');
  if (!Number.isFinite(units) || units <= 0) throw new RangeError('Units must be positive.');
  if (!Object.hasOwn(URGENCY, urgency)) throw new TypeError(`Unknown urgency: ${urgency}`);
  const bonus = 1 + clamp(Number(reputation) || 0, 0, 100) * 0.002;
  const raw = units * (cargo.base + cargo.perKm * km) * URGENCY[urgency] * bonus;
  return clamp(Math.round(raw / 10) * 10, PRICE_LIMITS.min, PRICE_LIMITS.max);
}

function freshLedger() {
  return {
    money: COMPANY_START.money,
    reputation: Object.fromEntries(
      PREFECTURES.map((p) => [p.id, COMPANY_START.reputation[p.id] ?? 0]),
    ),
    capacity: {
      seats: COMPANY_START.seats,
      freightWagons: COMPANY_START.freightWagons,
      wagonTonnes: COMPANY_START.wagonTonnes,
    },
    contractsCompleted: 0,
    contractsFailed: 0,
    history: [],
  };
}

/** Validates a saved ledger; returns a clean copy or null. */
export function validateLedger(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const fresh = freshLedger();
  if (!Number.isFinite(raw.money) || Math.abs(raw.money) > 1e9) return null;
  if (!raw.reputation || typeof raw.reputation !== 'object') return null;
  const reputation = {};
  for (const id of Object.keys(fresh.reputation)) {
    const value = raw.reputation[id];
    if (!Number.isFinite(value) || value < REPUTATION_LIMITS.min || value > REPUTATION_LIMITS.max)
      return null;
    reputation[id] = value;
  }
  for (const key of ['contractsCompleted', 'contractsFailed'])
    if (!Number.isInteger(raw[key]) || raw[key] < 0 || raw[key] > 1e6) return null;
  if (!Array.isArray(raw.history) || raw.history.length > MAX_HISTORY) return null;
  const history = [];
  for (const entry of raw.history) {
    if (
      !entry ||
      !Number.isFinite(entry.amount) ||
      !Number.isFinite(entry.minute) ||
      typeof entry.reason !== 'string' ||
      entry.reason.length > 120
    )
      return null;
    history.push({ minute: entry.minute, amount: entry.amount, reason: entry.reason });
  }
  return {
    ...fresh,
    money: Math.round(raw.money),
    reputation,
    contractsCompleted: raw.contractsCompleted,
    contractsFailed: raw.contractsFailed,
    history,
  };
}

/**
 * @param {{ network: ReturnType<import('./rail-network.js').createRailNetwork>, seed?: number }} options
 */
export function createBusiness({ network, seed = 7 } = {}) {
  if (!network?.getMap || !network?.planRoute)
    throw new TypeError('Business needs the rail network.');
  const map = network.getMap();
  const stationById = new Map(map.stations.map((station) => [station.id, station]));
  const random = createRandom(seed);
  let ledger = freshLedger();
  let demand = [];
  let nextDemandId = 1;
  let lastRefresh = -Infinity;
  const copyDemand = () => demand.map((entry) => ({ ...entry }));

  const record = (minute, amount, reason) => {
    ledger.history = [
      { minute, amount, reason: String(reason).slice(0, 120) },
      ...ledger.history,
    ].slice(0, MAX_HISTORY);
  };

  /** `canServe(fromStation, toStation)` limits buyers to places the player can reach. */
  function refresh(minute, { canServe = () => true } = {}) {
    if (!Number.isFinite(minute)) return copyDemand();
    demand = demand.filter((entry) => entry.expiresAt > minute);
    if (minute - lastRefresh < DEMAND_INTERVAL_MINUTES) return copyDemand();
    lastRefresh = minute;
    for (const station of map.stations)
      for (const industry of station.industries) {
        if (demand.length >= MAX_DEMAND) break;
        if (industry.supply <= 0 || !INDUSTRY_TYPES.includes(industry.type)) continue;
        // Chance per refresh rises with supply rate: 10 units/h ≈ 50%.
        if (random.next() > clamp(industry.supply / 20, 0.05, 0.8)) continue;
        const buyers = map.stations.filter(
          (other) =>
            other.id !== station.id &&
            canServe(station, other) &&
            other.industries.some((item) => item.type === industry.type && item.demand > 0),
        );
        if (!buyers.length) continue;
        const total = buyers.reduce(
          (sum, other) => sum + other.industries.find((i) => i.type === industry.type).demand,
          0,
        );
        let pick = random.next() * total;
        const buyer =
          buyers.find((other) => {
            pick -= other.industries.find((i) => i.type === industry.type).demand;
            return pick <= 0;
          }) ?? buyers.at(-1);
        const route = network.planRoute(station.id, buyer.id);
        if (!route.ok) continue;
        const cargo = CARGO[industry.type];
        const cap = cargo.freight
          ? MAX_UNITS.freight
          : industry.type === 'mail'
            ? MAX_UNITS.mail
            : MAX_UNITS.tourists;
        const scale = industry.type === 'tourists' ? 6 : 1;
        const units = clamp(Math.round(industry.supply * scale * (0.5 + random.next())), 1, cap);
        const roll = random.next();
        const urgency =
          cargo.perishable || cargo.express
            ? roll < 0.5
              ? 'urgent'
              : 'priority'
            : roll < 0.15
              ? 'urgent'
              : roll < 0.45
                ? 'priority'
                : 'standard';
        demand.push({
          id: `d${nextDemandId++}`,
          type: industry.type,
          from: station.id,
          to: buyer.id,
          units,
          urgency,
          km: route.km,
          createdAt: minute,
          expiresAt: minute + DEMAND_LIFETIME_MINUTES,
          price: quotePrice({
            type: industry.type,
            km: route.km,
            units,
            urgency,
            reputation: ledger.reputation[buyer.prefecture] ?? 0,
          }),
        });
      }
    return copyDemand();
  }

  return {
    refresh,
    quote: (input) =>
      quotePrice({
        ...input,
        reputation:
          input.reputation ?? ledger.reputation[stationById.get(input.to)?.prefecture] ?? 0,
      }),
    takeDemand(id) {
      const index = demand.findIndex((entry) => entry.id === id);
      return index < 0 ? null : demand.splice(index, 1)[0];
    },
    getDemand: () => demand.map((entry) => ({ ...entry })),
    credit(amount, reason, minute = 0) {
      if (!Number.isFinite(amount) || amount < 0) throw new RangeError('Credit must be positive.');
      ledger.money += Math.round(amount);
      record(minute, Math.round(amount), reason);
      return ledger.money;
    },
    /** Penalties never push the company below zero; the unpaid part is forgiven. */
    debit(amount, reason, minute = 0) {
      if (!Number.isFinite(amount) || amount < 0) throw new RangeError('Debit must be positive.');
      const paid = Math.min(ledger.money, Math.round(amount));
      ledger.money -= paid;
      record(minute, -paid, reason);
      return ledger.money;
    },
    adjustReputation(prefecture, delta) {
      if (!Object.hasOwn(ledger.reputation, prefecture) || !Number.isFinite(delta)) return null;
      ledger.reputation[prefecture] = clamp(
        Math.round((ledger.reputation[prefecture] + delta) * 10) / 10,
        REPUTATION_LIMITS.min,
        REPUTATION_LIMITS.max,
      );
      return ledger.reputation[prefecture];
    },
    recordOutcome(success) {
      if (success) ledger.contractsCompleted += 1;
      else ledger.contractsFailed += 1;
    },
    capacity: () => ({ ...ledger.capacity }),
    getLedger: () => structuredClone(ledger),
    restoreLedger(raw) {
      const valid = validateLedger(raw);
      if (!valid) return false;
      ledger = valid;
      return true;
    },
    reset() {
      ledger = freshLedger();
      demand = [];
      lastRefresh = -Infinity;
    },
    getState() {
      return { ...structuredClone(ledger), demand: demand.map((entry) => ({ ...entry })) };
    },
  };
}
