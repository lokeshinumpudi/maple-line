import test from 'node:test';
import assert from 'node:assert/strict';
import { createPopulation } from '../src/simulation/population.js';
const center = (z) => Math.sin(z * 0.006) * 15;
const terrain = (u, z) => (u > 38 ? 4.1 + (u - 38) * 0.3 + Math.sin(z * 0.02) * 0.4 : 4.1);
const setup = () =>
  createPopulation({
    center,
    terrain,
    homes: [-235, -208, -178, -145, -113].map((z) => ({ u: 48, z, y: 7.5, w: 8 })),
  });
const atStation = {
  trainPosition: [center(525) + 28, 4.75, 525],
  speed: 0,
  doorsOpen: true,
  travelDirection: 1,
};

test('shelter decisions move waiting people under cover and release them for service', () => {
  const pop = setup();
  step(pop, 100, { stationActivity: 'shelter' });
  assert.equal(pop.getState().counts.sheltering, 6);
  step(pop, 120, { ...atStation, stationActivity: 'shelter' });
  assert.ok(pop.getState().recentEvents.some((e) => e.type === 'boarded-at-door'));
});
function step(pop, seconds, context = {}) {
  for (let t = 0; t < seconds; t += 0.1) pop.update(0.1, context);
}

test('commuters arrive by path and wait when a moving train has open doors', () => {
  const pop = setup();
  step(pop, 100, { ...atStation, speed: 8 });
  const state = pop.getState();
  assert.equal(state.service, 0);
  assert.equal(state.counts.waiting, 6);
  assert.equal(
    state.recentEvents.some((e) => e.type === 'boarded-at-door'),
    false,
  );
});

test('alighting begins at real doors, boarding hides people only at the door threshold', () => {
  const pop = setup();
  step(pop, 80);
  let sawAlight = false,
    sawBoard = false;
  for (let t = 0; t < 100; t += 0.1) {
    const prior = new Map(pop.people.map((p) => [p.id, p.state]));
    pop.update(0.1, atStation);
    for (const p of pop.people) {
      if (prior.get(p.id) === 'alighting-scheduled' && p.state === 'alighting') {
        sawAlight = true;
        assert.equal(p.visible, true);
        assert.ok(Math.hypot(p.position.x - p.serviceDoor.x, p.position.z - p.serviceDoor.z) < 0.2);
      }
      if (prior.get(p.id) === 'boarding' && p.state === 'riding') {
        sawBoard = true;
        assert.equal(p.visible, false);
        assert.ok(
          Math.hypot(p.position.x - p.serviceDoor.x, p.position.z - p.serviceDoor.z) < 0.015,
        );
      }
    }
  }
  assert.ok(sawAlight);
  assert.ok(sawBoard);
  assert.equal(pop.getState().service, 1);
});

test('doors closing cancels approaches without hiding passengers', () => {
  const pop = setup();
  step(pop, 80);
  while (!pop.people.some((p) => p.state === 'approaching-door')) pop.update(0.1, atStation);
  const approaching = pop.people.filter((p) => p.state === 'approaching-door');
  pop.update(0.1, { ...atStation, doorsOpen: false });
  for (const p of approaching) {
    assert.equal(p.visible, true);
    assert.ok(['missed-door', 'arriving', 'waiting'].includes(p.state));
  }
});

test('residents complete their errands and repeat a home-to-destination cycle', () => {
  const pop = setup();
  step(pop, 700);
  const p = pop.people.find((p) => p.id === 'resident-4');
  assert.ok(Number.isFinite(p.departure));
  assert.ok(pop.getState().recentEvents.some((e) => e.type === 'errand-complete'));
  assert.ok(['going-to-errand', 'at-destination', 'returning-home', 'at-home'].includes(p.state));
  assert.equal(p.visible, true);
});

test('return service creates one scheduled alighting event rather than per-frame respawns', () => {
  const pop = setup();
  step(pop, 100);
  step(pop, 100, atStation);
  step(pop, 20, { ...atStation, doorsOpen: false, trainPosition: [0, 4.75, 300], speed: 15 });
  step(pop, 100, { ...atStation, travelDirection: -1 });
  assert.equal(pop.getState().service, 2);
  const keys = pop
    .getState()
    .recentEvents.filter((e) => e.type === 'disembarked-at-door')
    .map((e) => `${e.service}:${e.person}`);
  assert.equal(new Set(keys).size, keys.length);
});

test('reopening doors during the same station visit does not create another service', () => {
  const pop = setup();
  step(pop, 30, atStation);
  step(pop, 2, { ...atStation, doorsOpen: false });
  step(pop, 30, atStation);
  assert.equal(pop.getState().service, 1);
});

test('newspaper reader stays on the bench, walks home, and returns without position jumps', () => {
  const pop = setup();
  const reader = pop.people.find((p) => p.id === 'reader-1');
  const seat = { ...reader.position };
  step(pop, 35);
  assert.equal(reader.pose, 'reading');
  assert.deepEqual(reader.position, seat);
  let sawHome = false;
  let returned = false;
  for (let i = 0; i < 23000; i++) {
    const before = { ...reader.position };
    pop.update(0.1);
    assert.ok(
      Math.hypot(reader.position.x - before.x, reader.position.z - before.z) <=
        reader.speed * 0.1 + 0.016,
    );
    assert.ok(
      reader.position.x - center(reader.position.z) > 31,
      'reader stays beside the railway',
    );
    if (reader.state === 'at-home') sawHome = true;
    if (sawHome && reader.state === 'reading') {
      returned = true;
      break;
    }
  }
  assert.ok(sawHome && returned);
  assert.deepEqual(reader.position, seat);
});

test('bag incident has a drop, approach, help, and conversation in order away from the track', () => {
  const pop = setup();
  const observed = new Set();
  let lastEvents = [];
  let sawHelping = false;
  let sawTalking = false;
  for (let i = 0; i < 1100; i++) {
    pop.update(0.1);
    lastEvents = pop.getState().recentEvents;
    for (const event of lastEvents) observed.add(event.type);
    for (const actor of pop.people.filter((p) => p.actor === 'shopper' || p.actor === 'helper')) {
      assert.ok(actor.position.x - center(actor.position.z) > 31);
      assert.equal(actor.visible, true);
      sawHelping ||= actor.pose === 'helping';
      sawTalking ||= actor.pose === 'talking';
    }
  }
  assert.ok(observed.has('dropped-market-bag'));
  assert.ok(observed.has('noticed-dropped-bag'));
  assert.ok(observed.has('returned-market-bag'));
  assert.ok(sawHelping && sawTalking);
  const eventTypes = lastEvents.map((e) => e.type);
  const drop = eventTypes.indexOf('dropped-market-bag');
  const notice = eventTypes.indexOf('noticed-dropped-bag');
  const help = eventTypes.indexOf('returned-market-bag');
  if (drop >= 0 && notice >= 0 && help >= 0) assert.ok(drop < notice && notice < help);
  assert.equal(pop.people.length, 17);
});
