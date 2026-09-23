import test from 'node:test';
import assert from 'node:assert/strict';
import { createRailNetwork } from '../src/simulation/rail-network.js';
import {
  createBusiness,
  quotePrice,
  validateLedger,
  PRICE_LIMITS,
  CARGO,
  COMPANY_START,
} from '../src/simulation/business.js';
import { additionalStops } from '../src/world/extended-route.js';

const mapleStops = [
  { id: 'momiji', name: 'Momiji', z: 525, theme: 'riverside' },
  ...additionalStops,
];
const setup = (seed = 7) => {
  const network = createRailNetwork({ mapleStops });
  return { network, business: createBusiness({ network, seed }) };
};

test('prices grow with distance and urgency and stay inside documented limits', () => {
  for (const type of Object.keys(CARGO)) {
    const near = quotePrice({ type, km: 2, units: 10 });
    const far = quotePrice({ type, km: 40, units: 10 });
    const urgent = quotePrice({ type, km: 40, units: 10, urgency: 'urgent' });
    assert.ok(near <= far && far <= urgent, type);
  }
  assert.equal(quotePrice({ type: 'mail', km: 0, units: 1 }), PRICE_LIMITS.min);
  assert.equal(
    quotePrice({ type: 'fish', km: 5000, units: 1000, urgency: 'urgent' }),
    PRICE_LIMITS.max,
  );
  assert.equal(quotePrice({ type: 'rice', km: 10, units: 12 }), 9360);
  assert.ok(
    quotePrice({ type: 'rice', km: 10, units: 12, reputation: 100 }) >
      quotePrice({ type: 'rice', km: 10, units: 12 }),
  );
  assert.throws(() => quotePrice({ type: 'gold', km: 1, units: 1 }), /Unknown cargo/);
  assert.throws(() => quotePrice({ type: 'rice', km: -1, units: 1 }), /non-negative/);
  assert.throws(() => quotePrice({ type: 'rice', km: 1, units: 0 }), /positive/);
  assert.throws(() => quotePrice({ type: 'rice', km: 1, units: 1, urgency: 'now' }), /urgency/);
});

test('demand is seeded, bounded and only offers stations the caller can serve', () => {
  const a = setup(5).business.refresh(360);
  const b = setup(5).business.refresh(360);
  assert.deepEqual(a, b);
  assert.ok(a.length > 0 && a.length <= 12);
  for (const entry of a) {
    assert.notEqual(entry.from, entry.to);
    assert.ok(entry.units >= 1 && entry.units <= 160);
    assert.ok(entry.price >= PRICE_LIMITS.min && entry.price <= PRICE_LIMITS.max);
    assert.ok(entry.expiresAt > 360);
  }
  const { business, network } = setup(5);
  const momijiOnly = business.refresh(360, {
    canServe: (from, to) => from.prefecture === 'momiji' && to.prefecture === 'momiji',
  });
  for (const entry of momijiOnly) {
    assert.equal(network.getStation(entry.from).prefecture, 'momiji');
    assert.equal(network.getStation(entry.to).prefecture, 'momiji');
  }
  // Demand refreshes on a 30-minute cadence and expires after two hours.
  assert.equal(business.refresh(370).length, momijiOnly.length);
  assert.equal(business.refresh(360 + 121, { canServe: () => false }).length, 0);
});

test('the ledger tracks money and reputation without going below zero', () => {
  const { business } = setup();
  const start = business.getLedger();
  assert.equal(start.money, COMPANY_START.money);
  assert.equal(start.capacity.seats, 320);
  assert.equal(start.capacity.freightWagons, 1);
  business.credit(5000, 'delivery', 400);
  assert.equal(business.getLedger().money, 25000);
  business.debit(1e9, 'huge fine', 410);
  assert.equal(business.getLedger().money, 0);
  assert.equal(business.getLedger().history[0].amount, -25000);
  assert.equal(business.adjustReputation('momiji', 500), 100);
  assert.equal(business.adjustReputation('takane', -5), 0);
  assert.equal(business.adjustReputation('atlantis', 5), null);
  assert.throws(() => business.credit(-1, 'x'), /positive/);
});

test('saved ledgers are validated before they replace the current one', () => {
  const { business } = setup();
  business.credit(1234, 'x');
  const saved = business.getLedger();
  assert.deepEqual(validateLedger(saved), saved);
  assert.equal(validateLedger({ ...saved, money: 'lots' }), null);
  assert.equal(
    validateLedger({ ...saved, reputation: { ...saved.reputation, momiji: 101 } }),
    null,
  );
  assert.equal(validateLedger({ ...saved, history: [{ amount: 1 }] }), null);
  assert.equal(validateLedger([]), null);
  const other = setup().business;
  assert.equal(other.restoreLedger({ nonsense: true }), false);
  assert.equal(other.getLedger().money, COMPANY_START.money);
  assert.equal(other.restoreLedger(saved), true);
  assert.equal(other.getLedger().money, COMPANY_START.money + 1234);
});
