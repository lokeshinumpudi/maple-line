import test from 'node:test';
import assert from 'node:assert/strict';
import { createRailNetwork } from '../src/simulation/rail-network.js';
import { createBusiness } from '../src/simulation/business.js';
import {
  createMissions,
  createStopLocator,
  validateMissionsSave,
  MISSIONS_STORAGE_KEY,
  HANDLING_SECONDS,
  CAMPAIGN,
} from '../src/simulation/missions.js';
import { additionalStops } from '../src/world/extended-route.js';

const stops = [
  { id: 'momiji', name: 'Momiji', z: 525, theme: 'riverside' },
  ...additionalStops,
].map((stop) => ({ ...stop, distance: stop.z + 40 }));
const stopAt = createStopLocator(stops);
const at = (id) => stops.find((stop) => stop.id === id).distance;

function memoryStorage(initial = {}) {
  const data = new Map(Object.entries(initial));
  return {
    getItem: (key) => (data.has(key) ? data.get(key) : null),
    setItem: (key, value) => data.set(key, String(value)),
    removeItem: (key) => data.delete(key),
    data,
  };
}
function setup(storage = memoryStorage()) {
  const network = createRailNetwork({ mapleStops: stops });
  const business = createBusiness({ network });
  const missions = createMissions({ network, business, storage });
  return { network, business, missions, storage };
}
// A drive observation. Frozen so the test proves missions never write drive state.
const drive = (network, patch) =>
  Object.freeze({
    dtSeconds: 0.5,
    gameMinutes: network.now(),
    distance: 0,
    speedMps: 0,
    doorsOpen: false,
    stopAt,
    ...patch,
  });
function hold(ctx, stationId, seconds, patch = {}) {
  for (let t = 0; t < seconds; t += 0.5)
    ctx.missions.update(drive(ctx.network, { distance: at(stationId), doorsOpen: true, ...patch }));
}
const campaignOffer = (missions) => missions.getState().offers.find((m) => m.campaignStep !== null);
function playCampaignStep(ctx) {
  const offer = campaignOffer(ctx.missions);
  const accepted = ctx.missions.accept(offer.id);
  assert.equal(accepted.ok, true, accepted.message);
  hold(ctx, offer.from, HANDLING_SECONDS[offer.type].load + 0.5);
  hold(ctx, offer.to, HANDLING_SECONDS[offer.type].unload + 0.5);
  const done = ctx.missions.getState().archive.find((m) => m.id === offer.id);
  assert.equal(done?.status, 'completed', `${offer.title} completed`);
  return done;
}

test('platform locator finds the nearest stop within range and reads live distances', () => {
  const local = [
    { id: 'a', distance: 100 },
    { id: 'b', distance: 140 },
  ];
  const locate = createStopLocator(local, 26);
  assert.equal(locate(110).id, 'a');
  assert.equal(locate(131).id, 'b');
  assert.equal(locate(200), null);
  local[1].distance = 400;
  assert.equal(locate(131), null);
});

test('a passenger mission runs offered → accepted → loading → in-transit → unloading → completed', () => {
  const ctx = setup();
  const offer = campaignOffer(ctx.missions);
  assert.equal(offer.status, 'offered');
  assert.equal(offer.from, 'momiji');
  const money = ctx.missions.getState().ledger.money;
  assert.equal(ctx.missions.accept(offer.id).ok, true);
  assert.equal(ctx.missions.getState().active[0].status, 'accepted');
  ctx.missions.update(drive(ctx.network, { distance: at('momiji'), doorsOpen: true }));
  assert.equal(ctx.missions.getState().active[0].status, 'loading');
  hold(ctx, 'momiji', HANDLING_SECONDS.passenger.load);
  assert.equal(ctx.missions.getState().active[0].status, 'in-transit');
  ctx.missions.update(drive(ctx.network, { distance: at('aonuma'), doorsOpen: true }));
  assert.equal(ctx.missions.getState().active[0].status, 'unloading');
  hold(ctx, 'aonuma', HANDLING_SECONDS.passenger.unload);
  const state = ctx.missions.getState();
  assert.equal(state.active.length, 0);
  assert.equal(state.archive[0].status, 'completed');
  assert.equal(state.ledger.money, money + offer.reward);
  assert.ok(state.ledger.reputation.momiji > 10);
  assert.equal(state.campaign.step, 1);
  assert.deepEqual(state.unlocks.lines, ['lake']);
  assert.equal(ctx.network.isLineUnlocked('lake'), true);
});

test('freight handling needs the train stopped at the right platform with doors open for the full time', () => {
  const ctx = setup();
  playCampaignStep(ctx);
  const freight = campaignOffer(ctx.missions);
  assert.equal(freight.type, 'freight');
  assert.equal(ctx.missions.accept(freight.id).ok, true);
  const load = HANDLING_SECONDS.freight.load;
  const status = () => ctx.missions.getState().active[0];
  hold(ctx, 'hinoki', load, { speedMps: 1.5 });
  assert.equal(status().progressSeconds, 0, 'rolling through the platform does not load');
  hold(ctx, 'hinoki', load, { doorsOpen: false });
  assert.equal(status().progressSeconds, 0, 'closed doors do not load');
  hold(ctx, 'ishikura', load);
  assert.equal(status().status, 'accepted', 'the wrong platform does not load');
  hold(ctx, 'hinoki', load - 1);
  assert.equal(status().status, 'loading');
  assert.ok(status().handlingProgress > 0.9 && status().handlingProgress < 1);
  ctx.missions.update(drive(ctx.network, { distance: at('hinoki'), doorsOpen: false }));
  assert.equal(status().status, 'accepted', 'closing the doors early restarts the count');
  assert.equal(status().progressSeconds, 0);
  hold(ctx, 'hinoki', load);
  assert.equal(status().status, 'in-transit');
  hold(ctx, 'ishikura', HANDLING_SECONDS.freight.unload - 1);
  assert.equal(status().status, 'unloading');
  hold(ctx, 'ishikura', 1);
  const done = ctx.missions.getState();
  assert.equal(done.active.length, 0);
  assert.equal(done.archive[0].status, 'completed');
  assert.ok(done.unlocks.lines.includes('mountain'));
  assert.ok(done.unlocks.prefectures.includes('takane'));
});

test('missing a deadline fails the mission, charges the penalty and re-offers the campaign step', () => {
  const ctx = setup();
  ctx.business.credit(10000, 'float');
  const offer = campaignOffer(ctx.missions);
  ctx.missions.accept(offer.id);
  const accepted = ctx.missions.getState().active[0];
  const money = ctx.missions.getState().ledger.money;
  ctx.network.tick(accepted.deadline - ctx.network.now() + 1);
  ctx.missions.update(drive(ctx.network, { distance: at('momiji'), doorsOpen: true }));
  const state = ctx.missions.getState();
  const failed = state.archive.find((m) => m.id === offer.id);
  assert.equal(failed.status, 'failed');
  assert.equal(failed.result.reason, 'deadline');
  assert.equal(state.ledger.money, money - offer.penalty);
  assert.equal(state.campaign.step, 0);
  const again = campaignOffer(ctx.missions);
  assert.notEqual(again.id, offer.id);
  assert.equal(again.campaignStep, 0);
});

test('abandoning costs half the penalty and campaign offers cannot be declined', () => {
  const ctx = setup();
  const offer = campaignOffer(ctx.missions);
  assert.equal(ctx.missions.abandon(offer.id).ok, false);
  ctx.missions.accept(offer.id);
  const money = ctx.missions.getState().ledger.money;
  assert.equal(ctx.missions.abandon(offer.id).ok, true);
  const state = ctx.missions.getState();
  assert.equal(state.archive[0].result.reason, 'abandoned');
  assert.equal(state.ledger.money, money - Math.round(offer.penalty / 2));
  assert.equal(ctx.missions.abandon(offer.id).ok, false);
  assert.equal(ctx.missions.accept('m9999').reason, 'unknown-mission');
});

test('connections resolve through the network: caught before departure, missed after it', () => {
  const reach = () => {
    const ctx = setup();
    for (let i = 0; i < 3; i++) playCampaignStep(ctx);
    const offer = campaignOffer(ctx.missions);
    assert.equal(offer.type, 'connection');
    const result = ctx.missions.accept(offer.id);
    assert.equal(result.ok, true, result.message);
    const { connection } = result.mission;
    assert.equal(connection.stationId, 'yukihara');
    assert.equal(connection.lineId, 'mountain');
    assert.ok(connection.departsAt > ctx.network.now());
    return { ctx, offer, connection };
  };
  const caught = reach();
  hold(caught.ctx, caught.offer.from, HANDLING_SECONDS.connection.load + 0.5);
  hold(caught.ctx, caught.offer.to, HANDLING_SECONDS.connection.unload + 0.5);
  const made = caught.ctx.missions.getState();
  assert.equal(made.archive[0].status, 'completed');
  assert.ok(made.unlocks.prefectures.includes('kitagawa'));

  const missed = reach();
  hold(missed.ctx, missed.offer.from, HANDLING_SECONDS.connection.load + 0.5);
  missed.ctx.network.tick(missed.connection.departsAt - missed.ctx.network.now() + 2);
  assert.equal(
    missed.ctx.network.departureStatus(missed.connection.tripId, 'yukihara'),
    'departed',
  );
  missed.ctx.missions.update(drive(missed.ctx.network, { distance: at('yukihara') }));
  const lost = missed.ctx.missions.getState().archive.find((m) => m.id === missed.offer.id);
  assert.equal(lost.status, 'failed');
  assert.equal(lost.result.reason, 'missed-connection');
});

test('the eight-mission campaign unlocks every line and prefecture in order', () => {
  const ctx = setup();
  assert.equal(CAMPAIGN.length, 8);
  const unlockedAfter = [];
  for (let i = 0; i < CAMPAIGN.length; i++) {
    const done = playCampaignStep(ctx);
    assert.equal(done.campaignStep, i);
    unlockedAfter.push(ctx.missions.getState().unlocks.lines.length);
  }
  const state = ctx.missions.getState();
  assert.equal(state.campaign.complete, true);
  assert.deepEqual(state.unlocks.lines, ['coastal', 'lake', 'loop', 'mountain', 'trunk']);
  assert.deepEqual(state.unlocks.prefectures, [
    'kitagawa',
    'miyako',
    'momiji',
    'shiokaze',
    'takane',
  ]);
  assert.ok(state.unlocks.flags.includes('network-complete'));
  for (const id of ['lake', 'mountain', 'coastal', 'trunk', 'loop'])
    assert.equal(ctx.network.isLineUnlocked(id), true);
  assert.deepEqual(unlockedAfter, [1, 2, 2, 2, 3, 3, 4, 5]);
  assert.equal(campaignOffer(ctx.missions), undefined);
  assert.equal(state.ledger.contractsCompleted, 8);
});

test('saves restore missions and ledger; corrupt or tampered saves start fresh', () => {
  const storage = memoryStorage();
  const first = setup(storage);
  playCampaignStep(first);
  const offer = campaignOffer(first.missions);
  first.missions.accept(offer.id);
  const raw = storage.getItem(MISSIONS_STORAGE_KEY);
  assert.ok(raw);
  const reloaded = setup(memoryStorage({ [MISSIONS_STORAGE_KEY]: raw })).missions.getState();
  assert.equal(reloaded.loadedFrom, 'save');
  assert.equal(reloaded.active[0].id, offer.id);
  assert.equal(reloaded.campaign.step, 1);
  assert.equal(reloaded.ledger.money, first.missions.getState().ledger.money);
  assert.deepEqual(reloaded.unlocks.lines, ['lake']);

  const ids = {
    stationIds: first.network.stationIds(),
    mapleStationIds: first.network.mapleStationIds(),
    lineIds: first.network.getMap().lines.map((l) => l.id),
    prefectureIds: first.network.getMap().prefectures.map((p) => p.id),
  };
  assert.ok(validateMissionsSave(raw, ids));
  const save = JSON.parse(raw);
  const tampered = [
    '{not json',
    JSON.stringify({ ...save, version: 99 }),
    JSON.stringify({ ...save, missions: [{ ...save.missions[0], status: 'teleported' }] }),
    JSON.stringify({ ...save, missions: [{ ...save.missions[0], from: 'atlantis' }] }),
    JSON.stringify({ ...save, missions: [{ ...save.missions[0], reward: -5 }] }),
    JSON.stringify({ ...save, ledger: { ...save.ledger, money: null } }),
    JSON.stringify({ ...save, unlocks: { ...save.unlocks, lines: ['hyperloop'] } }),
    'x'.repeat(70000),
  ];
  for (const text of tampered) {
    const state = setup(memoryStorage({ [MISSIONS_STORAGE_KEY]: text })).missions.getState();
    assert.notEqual(state.loadedFrom, 'save', text.slice(0, 60));
    assert.equal(state.campaign.step, 0);
    assert.equal(state.active.length, 0);
  }
  assert.equal(validateMissionsSave('{not json', ids), null);
  const broken = {
    getItem() {
      throw new Error('denied');
    },
    setItem() {
      throw new Error('full');
    },
  };
  const safe = setup(broken).missions;
  assert.equal(safe.getState().loadedFrom, 'fresh');
  assert.equal(safe.save(), false);
});

test('network tools validate arguments and share the dialog mission actions', async () => {
  const { registerGameWebMCP } = await import('../src/agent/webmcp.js');
  const { networkToolsExtension } = await import('../src/agent/network-tools.js');
  const ctx = setup();
  const inspector = { snapshot: () => ({ camera: {}, renderer: {}, scene: {} }) };
  const api = registerGameWebMCP({
    inspector,
    getGameState: () => ({}),
    environment: {},
    extensions: [networkToolsExtension(ctx)],
  });
  const call = async (name, input) => JSON.parse((await api.invoke(name, input)).content[0].text);
  const names = api.list().map((t) => t.name);
  for (const name of [
    'get_network_state',
    'get_missions',
    'accept_mission',
    'abandon_mission',
    'plan_network_route',
    'get_company_ledger',
  ])
    assert.ok(names.includes(name), name);
  const offer = (await call('get_missions', {})).result.offers[0];
  assert.match((await call('accept_mission', { id: 'x; drop' })).error, /invalid string/);
  assert.match((await call('accept_mission', { id: offer.id, extra: 1 })).error, /not allowed/);
  assert.equal((await call('accept_mission', { id: offer.id })).result.ok, true);
  assert.equal(ctx.missions.getState().active[0].id, offer.id);
  assert.match((await call('accept_mission', { id: offer.id })).error, /not on offer/);
  const route = await call('plan_network_route', { from: 'momiji', to: 'miyako' });
  assert.deepEqual(
    route.result.legs.map((leg) => leg.lineId),
    ['maple', 'trunk'],
  );
  assert.match(
    (await call('plan_network_route', { from: 'momiji', to: 'miyako', unlockedOnly: true })).error,
    /unlocked/,
  );
  assert.match((await call('plan_network_route', { from: 'mars', to: 'miyako' })).error, /one of/);
  assert.ok(Number.isFinite((await call('get_company_ledger', {})).result.money));
  assert.ok((await call('get_network_state', {})).result.lines.length === 6);
  api.dispose();
});
