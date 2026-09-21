import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createStationDuties,
  validateStationDutySave,
  BOARDING_SECONDS,
  PASSING_SECONDS,
} from '../src/simulation/station-duties.js';

const station = {
  dt: 0,
  z: 525,
  speed: 0,
  doorsOpen: false,
  doorFraction: 0,
  storyEnabled: true,
  storyBeatId: 'sakuragawa-water',
  storyCompletedIds: ['the-recorder', 'the-spanner', 'momiji-bread'],
};
function update(engine, patch = {}) {
  return engine.update({ ...station, ...patch });
}
function boarded(engine) {
  update(engine);
  engine.act('route-passenger');
  for (let i = 0; i < BOARDING_SECONDS * 4; i++)
    update(engine, { dt: 0.25, doorsOpen: true, doorFraction: 1 });
  update(engine);
  assert.equal(engine.getState().phase, 'dispatch');
}

test('station duties activate only after the Momiji conversation and never at a later chapter', () => {
  const engine = createStationDuties();
  update(engine, { storyEnabled: false });
  assert.equal(engine.getState().active, false);
  update(engine, { z: 1000 });
  assert.equal(engine.getState().phase, 'inactive');
  update(engine, { storyCompletedIds: ['the-recorder'] });
  assert.equal(engine.getState().phase, 'inactive');
  update(engine, { storyCompletedIds: [...station.storyCompletedIds, 'sakuragawa-water'] });
  assert.equal(engine.getState().phase, 'inactive');
  update(engine, { storyBeatId: 'the-return-ticket' });
  assert.equal(engine.getState().phase, 'inactive');
  update(engine);
  assert.equal(engine.getState().phase, 'routing');
  assert.equal(engine.getState().active, true);
});

test('wrong routing is recoverable and door actions require physical boarding evidence', () => {
  const engine = createStationDuties();
  update(engine);
  assert.equal(engine.act('route-freight').ok, true);
  assert.equal(engine.getState().phase, 'routing');
  assert.match(engine.getState().message, /freight/);
  assert.equal(engine.act('request-clearance').ok, false);
  engine.act('route-passenger');
  assert.equal(engine.getState().route, 'passenger');
  assert.deepEqual(engine.act('open-doors').effect, 'open-doors');
  for (let i = 0; i < 60; i++) update(engine, { dt: 0.25, doorsOpen: true, doorFraction: 0.5 });
  assert.equal(engine.getState().boardingProgress, 0);
  for (let i = 0; i < 12; i++) update(engine, { dt: 0.25, doorsOpen: true, doorFraction: 1 });
  assert.equal(engine.getState().phase, 'closing');
  assert.equal(engine.act('depart').ok, false);
  assert.equal(engine.act('close-doors').effect, 'close-doors');
  update(engine, { doorFraction: 0.2 });
  assert.equal(engine.getState().phase, 'closing');
  update(engine);
  assert.equal(engine.getState().phase, 'dispatch');
});

test('boarding needs three continuous stopped seconds and closing early restarts its timer', () => {
  const engine = createStationDuties();
  update(engine);
  engine.act('route-passenger');
  for (let i = 0; i < 8; i++) update(engine, { dt: 0.25, doorsOpen: true, doorFraction: 1 });
  assert.ok(engine.getState().boardingProgress > 0.6);
  update(engine, { dt: 0.25, doorsOpen: true, doorFraction: 1, speed: 2 });
  assert.equal(engine.getState().boardingProgress, 0);
  update(engine, { dt: 0.25, doorsOpen: true, doorFraction: 1 });
  assert.equal(engine.act('close-doors').effect, 'close-doors');
  update(engine);
  assert.equal(engine.getState().boardingProgress, 0);
});

test('the passing train requires twelve active seconds and departure remains an explicit action', () => {
  const engine = createStationDuties();
  boarded(engine);
  assert.equal(engine.act('request-clearance').ok, true);
  for (let i = 0; i < PASSING_SECONDS * 4 - 1; i++) update(engine, { dt: 0.25 });
  assert.equal(engine.getState().phase, 'passing');
  assert.equal(engine.act('depart').ok, false);
  update(engine, { dt: 0.25 });
  assert.equal(engine.getState().phase, 'ready');
  assert.equal(engine.getState().canDepart, true);
  assert.equal(engine.getState().active, true);
  const departure = engine.act('depart');
  assert.equal(departure.effect, 'depart');
  assert.equal(engine.getState().completed, true);
  assert.equal(engine.getState().active, false);
  update(engine);
  assert.equal(engine.getState().phase, 'complete');
  assert.equal(engine.act('depart').ok, false);
});

test('pause, exploration, leaving the platform, and moving do not consume the wait', () => {
  const engine = createStationDuties();
  boarded(engine);
  engine.act('request-clearance');
  for (const patch of [{ paused: true }, { storyEnabled: false }, { z: 1000 }, { speed: 4 }]) {
    for (let i = 0; i < 60; i++) update(engine, { dt: 0.25, ...patch });
    assert.equal(engine.getState().passingProgress, 0);
  }
  update(engine, { dt: 0.25 });
  assert.ok(engine.getState().passingProgress > 0);
  update(engine, { z: 1000 });
  assert.match(engine.getState().message, /Return to Momiji/);
  assert.deepEqual(engine.getState().availableActions, []);
});

test('doors reopened while waiting must be shut again before departure', () => {
  const engine = createStationDuties();
  boarded(engine);
  engine.act('request-clearance');
  for (let i = 0; i < 48; i++) update(engine, { dt: 0.25, doorsOpen: true, doorFraction: 1 });
  assert.equal(engine.getState().phase, 'closing');
  assert.equal(engine.getState().canDepart, false);
  update(engine, { doorFraction: 0.4 });
  assert.equal(engine.getState().phase, 'closing');
  update(engine);
  assert.equal(engine.getState().phase, 'ready');
});

test('UI subscriptions are bounded while getState keeps smooth passing progress', () => {
  const engine = createStationDuties();
  boarded(engine);
  engine.act('request-clearance');
  let notifications = 0;
  const unsubscribe = engine.subscribe(() => notifications++);
  for (let i = 0; i < 600; i++) update(engine, { dt: 1 / 60 });
  assert.ok(notifications <= 42);
  const previous = engine.getState().passingProgress;
  update(engine, { dt: 1 / 60 });
  assert.ok(engine.getState().passingProgress > previous);
  unsubscribe();
});

test('invalid dt fails, catchup is bounded, reset restarts duties, and dispose disables actions', () => {
  const engine = createStationDuties();
  boarded(engine);
  engine.act('request-clearance');
  for (const dt of [-1, Infinity, NaN]) assert.throws(() => update(engine, { dt }), /dt/);
  update(engine, { dt: 300 });
  assert.equal(engine.getState().passingSecondsRemaining, PASSING_SECONDS - 0.25);
  engine.reset();
  assert.equal(engine.getState().phase, 'inactive');
  update(engine);
  assert.equal(engine.getState().phase, 'routing');
  engine.dispose();
  assert.equal(engine.getState().active, false);
  assert.equal(engine.act('route-passenger').ok, false);
});

test('completed duties survive reload without reopening the sequence', () => {
  const original = createStationDuties();
  boarded(original);
  original.act('request-clearance');
  for (let i = 0; i < 48; i++) update(original, { dt: 0.25 });
  original.act('depart');
  const save = original.exportSave();
  const restored = createStationDuties();
  assert.equal(restored.importSave(JSON.stringify(save)).ok, true);
  assert.equal(restored.getState().phase, 'complete');
  assert.equal(restored.getState().completed, true);
  assert.equal(restored.getState().active, false);
  update(restored);
  assert.equal(restored.getState().phase, 'complete');
  assert.equal(restored.act('depart').ok, false);
  save.phase = 'routing';
  assert.equal(original.exportSave().phase, 'complete', 'exported saves are detached');
  restored.reset();
  update(restored);
  assert.equal(restored.getState().phase, 'routing');
});

test('restoring partial boarding requires fresh continuous dwell and observed doors', () => {
  const original = createStationDuties();
  update(original);
  original.act('route-passenger');
  for (let i = 0; i < 8; i++) update(original, { dt: 0.25, doorsOpen: true, doorFraction: 1 });
  assert.ok(original.getState().boardingProgress > 0);
  const restored = createStationDuties();
  update(restored, { doorsOpen: true, doorFraction: 1 });
  assert.equal(restored.importSave(original.exportSave()).ok, true);
  assert.equal(restored.getState().phase, 'boarding');
  assert.equal(restored.getState().boardingProgress, 0);
  assert.equal(restored.getState().active, false);
  assert.deepEqual(restored.getState().availableActions, []);
  assert.equal(restored.act('open-doors').ok, false, 'pre-import physical context is invalidated');
  update(restored);
  assert.deepEqual(restored.getState().availableActions, ['open-doors']);
  for (let i = 0; i < 11; i++) update(restored, { dt: 0.25, doorsOpen: true, doorFraction: 1 });
  assert.equal(restored.getState().phase, 'boarding');
  update(restored, { dt: 0.25, doorsOpen: true, doorFraction: 1 });
  assert.equal(restored.getState().phase, 'closing');
});

test('dispatch, passing and green signals all restore to a fresh clearance request', () => {
  const original = createStationDuties();
  boarded(original);
  const saves = [original.exportSave()];
  original.act('request-clearance');
  for (let i = 0; i < 24; i++) update(original, { dt: 0.25 });
  saves.push(original.exportSave());
  for (let i = 0; i < 24; i++) update(original, { dt: 0.25 });
  saves.push(original.exportSave());
  assert.deepEqual(
    saves.map((save) => save.phase),
    ['dispatch', 'passing', 'ready'],
  );
  for (const save of saves) {
    const restored = createStationDuties();
    assert.equal(restored.importSave(save).ok, true);
    assert.equal(restored.getState().phase, 'dispatch');
    assert.equal(restored.getState().passingProgress, 0);
    assert.equal(restored.getState().boardingProgress, 1);
    assert.equal(restored.act('request-clearance').ok, false);
    update(restored, { z: 1000 });
    assert.equal(restored.act('request-clearance').ok, false);
    update(restored, { speed: 3 });
    assert.equal(restored.act('request-clearance').ok, false);
    update(restored, { doorFraction: 0.5 });
    assert.equal(restored.getState().phase, 'closing');
    assert.equal(restored.act('request-clearance').ok, false);
    update(restored);
    assert.equal(restored.act('request-clearance').ok, true);
    for (let i = 0; i < 47; i++) update(restored, { dt: 0.25 });
    assert.equal(restored.act('depart').ok, false);
    update(restored, { dt: 0.25 });
    assert.equal(restored.act('depart').effect, 'depart');
  }
});

test('completed boarding restores closing while discarding any former clearance', () => {
  const original = createStationDuties();
  boarded(original);
  original.act('request-clearance');
  for (let i = 0; i < 48; i++) update(original, { dt: 0.25, doorsOpen: true, doorFraction: 1 });
  assert.equal(original.getState().phase, 'closing');
  const restored = createStationDuties();
  assert.equal(restored.importSave(original.exportSave()).ok, true);
  assert.equal(restored.getState().phase, 'closing');
  assert.equal(restored.getState().boardingProgress, 1);
  assert.equal(restored.getState().passingProgress, 0);
  update(restored, { doorsOpen: true, doorFraction: 1 });
  assert.equal(restored.getState().phase, 'closing');
  update(restored);
  assert.equal(restored.getState().phase, 'dispatch');
});

test('inactive and routing saves preserve recoverable route selection', () => {
  const original = createStationDuties();
  const restored = createStationDuties();
  assert.equal(restored.importSave(original.exportSave()).ok, true);
  assert.equal(restored.getState().phase, 'inactive');
  update(original);
  original.act('route-freight');
  assert.equal(restored.importSave(original.exportSave()).ok, true);
  update(restored);
  assert.equal(restored.getState().phase, 'routing');
  assert.equal(restored.getState().route, 'freight');
  assert.equal(restored.act('route-passenger').ok, true);
});

test('malformed, impossible and oversized duty saves are rejected without mutation', () => {
  const engine = createStationDuties();
  boarded(engine);
  const save = engine.exportSave();
  const cyclic = {};
  cyclic.self = cyclic;
  const invalid = [
    null,
    false,
    [],
    '{',
    ' '.repeat(2049),
    cyclic,
    { ...save, version: 2 },
    { ...save, stationId: 'elsewhere' },
    { ...save, completed: true },
    { ...save, route: 'freight' },
    { ...save, boardingTime: 1 },
    { ...save, passingTime: 4 },
    { ...save, boardingTime: -1 },
    { ...save, passingTime: Infinity },
    { ...save, phase: 'missing' },
    { ...save, phase: 'ready' },
    { ...save, phase: 'complete', completed: true },
    { ...save, phase: 'boarding', boardingTime: 3 },
    { ...save, phase: 'closing', passingTime: 3 },
    { ...save, phase: 'passing', passingTime: 12 },
    { ...save, phase: 'inactive', route: 'passenger', boardingTime: 0 },
    { ...save, context: { z: 525, speed: 0, doorsOpen: false } },
  ];
  let notifications = 0;
  engine.subscribe(() => notifications++);
  for (const raw of invalid) {
    assert.equal(engine.importSave(raw).ok, false);
    assert.deepEqual(engine.exportSave(), save);
    assert.equal(engine.getState().active, true);
  }
  assert.equal(notifications, 0);
  engine.dispose();
  assert.equal(engine.importSave(save).ok, false);
});

test('the exported save validator returns detached original progress without restoration effects', () => {
  const duties = createStationDuties();
  boarded(duties);
  duties.act('request-clearance');
  for (let i = 0; i < 10; i++) update(duties, { dt: 0.25 });
  const save = duties.exportSave();
  const validated = validateStationDutySave(save);
  assert.deepEqual(validated, save);
  assert.equal(validated.phase, 'passing');
  assert.equal(validated.passingTime, 2.5);
  validated.passingTime = 0;
  assert.equal(save.passingTime, 2.5);
  assert.deepEqual(validateStationDutySave(JSON.stringify(save)), save);
  assert.equal(validateStationDutySave({ ...save, version: 99 }), null);
  assert.equal(duties.getState().phase, 'passing');
});
