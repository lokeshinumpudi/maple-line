import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createRailNetwork,
  STEP_MINUTES,
  ORIGIN_BOARDING_MINUTES,
  MAPLE_JUNCTIONS,
} from '../src/simulation/rail-network.js';
import { additionalStops } from '../src/world/extended-route.js';

const mapleStops = [
  { id: 'momiji', name: 'Momiji', z: 525, theme: 'riverside' },
  ...additionalStops,
].map((stop) => ({ ...stop, distance: stop.z * 1.01 }));
const create = (options = {}) => createRailNetwork({ mapleStops, ...options });

function singleTrackOccupancy(network) {
  const map = network.getMap();
  const single = new Set(map.edges.filter((e) => e.track === 'single').map((e) => e.id));
  const counts = {};
  for (const train of network.getState().trains)
    if (train.edge && single.has(train.edge.id))
      counts[train.edge.id] = (counts[train.edge.id] ?? 0) + 1;
  return counts;
}

test('the network has six lines, five prefectures and Maple junctions from the input stops', () => {
  const network = create();
  const map = network.getMap();
  assert.equal(map.lines.length, 6);
  assert.equal(map.prefectures.length, 5);
  const maple = map.lines.find((line) => line.id === 'maple');
  assert.deepEqual(
    maple.stations,
    mapleStops.map((stop) => stop.id),
  );
  assert.equal(maple.rendered, true);
  assert.ok(map.lines.filter((line) => line.id !== 'maple').every((line) => !line.rendered));
  for (const id of MAPLE_JUNCTIONS) assert.ok(map.junctions.includes(id), id);
  // Maple edge lengths come from the supplied distances, so nothing drifts from the route.
  const edge = map.edges.find((e) => e.id === 'maple:momiji-sakuragawa');
  assert.ok(Math.abs(edge.km - ((1500 - 525) * 1.01) / 1000) < 1e-3);
  for (const station of map.stations)
    for (const industry of station.industries)
      assert.ok(industry.supply >= 0 && industry.demand >= 0);
  assert.equal(network.isLineUnlocked('maple'), true);
  assert.equal(network.isLineUnlocked('trunk'), false);
});

test('input validation rejects unordered or incomplete stop lists', () => {
  assert.throws(() => createRailNetwork({ mapleStops: [] }), /two Maple/);
  assert.throws(
    () =>
      createRailNetwork({
        mapleStops: [
          { id: 'a', name: 'A', z: 10 },
          { id: 'b', name: 'B', z: 5 },
        ],
      }),
    /strictly increasing/,
  );
  assert.throws(() => create({ distanceOf: null }), /distance function/);
});

test('pathfinding chooses the fastest route by time, with transfers and lock filtering', () => {
  const network = create();
  const through = network.planRoute('momiji', 'miyako');
  assert.equal(through.ok, true);
  assert.deepEqual(
    through.legs.map((leg) => leg.lineId),
    ['maple', 'trunk'],
  );
  assert.equal(through.transfers, 1);
  assert.equal(through.stations[0], 'momiji');
  assert.equal(through.stations.at(-1), 'miyako');
  // Harumi to Kamome: the electrified loop via Asahigaoka beats the slow coastal line.
  const yard = network.planRoute('harumi', 'kamome');
  assert.deepEqual(
    yard.legs.map((leg) => leg.lineId),
    ['trunk', 'loop'],
  );
  const coastal = network.planRoute('minato', 'kamome');
  assert.ok(yard.minutes < coastal.minutes + 10);
  assert.equal(network.planRoute('momiji', 'miyako', { unlockedOnly: true }).ok, false);
  network.setLineUnlocked('trunk');
  assert.equal(network.planRoute('momiji', 'miyako', { unlockedOnly: true }).ok, true);
  assert.equal(network.planRoute('momiji', 'nowhere').reason, 'unknown-station');
  assert.equal(network.planRoute('momiji', 'momiji').reason, 'same-station');
  const lake = network.planRoute('hotaru', 'kitagawa');
  assert.deepEqual(
    lake.legs.map((leg) => leg.lineId),
    ['lake', 'maple', 'mountain'],
  );
});

test('the dispatcher never admits two trains to one single-track block', () => {
  const network = create({ seed: 3 });
  for (let i = 0; i < 18 * 60; i++) {
    network.tick(1);
    for (const [edge, count] of Object.entries(singleTrackOccupancy(network)))
      assert.ok(count <= 1, `${edge} holds ${count} trains at ${network.now()}`);
    const state = network.getState();
    for (const [edge, holder] of Object.entries(state.blocks))
      if (holder) assert.ok(state.trains.some((t) => t.id === holder && t.edge?.id === edge));
  }
  const { stats } = network.getState();
  assert.equal(stats.safetyViolations, 0);
  assert.equal(stats.maxBlockOccupancy, 1);
  assert.ok(stats.heldMinutes > 0, 'meets on single track make trains wait at stations');
  assert.ok(stats.completedTrips > 50);
});

test('ticks are deterministic for a seed regardless of how time is split', () => {
  const a = create({ seed: 11 });
  const b = create({ seed: 11 });
  a.tick(600);
  for (let i = 0; i < 2400; i++) b.tick(STEP_MINUTES);
  assert.deepEqual(a.getState(), b.getState());
  const c = create({ seed: 11 });
  for (let i = 0; i < 600; i++) c.tick(1);
  assert.deepEqual(a.getState(), c.getState());
  assert.throws(() => a.tick(-1), /non-negative/);
  assert.throws(() => a.tick(NaN), /finite/);
  const state = a.getState();
  assert.deepEqual(JSON.parse(JSON.stringify(state)), state, 'state is plain serializable data');
});

test('departures move from scheduled to boarding to departed through the simulation', () => {
  const network = create();
  const [next] = network.upcomingDepartures('harumi', {
    from: network.now() + 10,
    lineId: 'trunk',
    horizon: 60,
  });
  assert.ok(next && next.departsAt >= network.now() + 10);
  assert.equal(next.lineId, 'trunk');
  assert.equal(network.departureStatus(next.tripId, 'harumi'), 'scheduled');
  network.tick(next.departsAt - ORIGIN_BOARDING_MINUTES - network.now() + STEP_MINUTES);
  assert.equal(network.departureStatus(next.tripId, 'harumi'), 'boarding');
  network.tick(ORIGIN_BOARDING_MINUTES + 1);
  assert.equal(network.departureStatus(next.tripId, 'harumi'), 'departed');
  network.tick(240);
  assert.equal(network.departureStatus(next.tripId, 'harumi'), 'departed');
  assert.equal(network.departureStatus('nonsense', 'harumi'), 'unknown');
});

test('restoring the clock rebuilds a running timetable and the Maple map point interpolates', () => {
  const network = create();
  network.restoreClock(12 * 60);
  assert.equal(network.now(), 720);
  assert.ok(network.getState().trains.length > 5);
  const sakuragawa = network.getStation('sakuragawa');
  const momiji = network.getStation('momiji');
  const middle = network.mapleMapPoint((momiji.routeMetres + sakuragawa.routeMetres) / 2);
  assert.ok(Math.abs(middle.x - (momiji.map.x + sakuragawa.map.x) / 2) < 0.2);
  assert.deepEqual(network.mapleMapPoint(-1e6), momiji.map);
});
