import test from 'node:test';
import assert from 'node:assert/strict';
import { registerRailwayTools } from '../src/narrative/railway-tools.js';
import { createStationDuties } from '../src/simulation/station-duties.js';

test('railway tools share the host duty action and cannot skip physical boarding or signal waiting', async () => {
  const duties = createStationDuties();
  duties.update({
    dt: 0,
    z: 525,
    speed: 0,
    doorsOpen: false,
    doorFraction: 0,
    storyEnabled: true,
    storyCompletedIds: ['momiji-bread'],
    storyBeatId: 'sakuragawa-water',
  });
  const captured = new Map();
  const effects = [];
  registerRailwayTools({
    duties,
    tool: (name, _description, schema, readOnly, execute) =>
      captured.set(name, { schema, readOnly, execute }),
    act: (action) => {
      const result = duties.act(action);
      if (result.effect) effects.push(result.effect);
      return result;
    },
  });
  assert.equal(captured.get('get_duties_state').readOnly, true);
  captured.get('get_duties_state').execute().station.z = 0;
  assert.equal(duties.getState().station.z, 525);
  const action = captured.get('railway_action');
  assert.equal(action.schema.additionalProperties, false);
  assert.equal(action.schema.properties.action.enum.includes('reset'), false);
  await assert.rejects(action.execute({ action: 'depart' }), /unavailable/);
  await action.execute({ action: 'route-freight' });
  assert.equal(duties.getState().phase, 'routing');
  await action.execute({ action: 'route-passenger' });
  await action.execute({ action: 'open-doors' });
  assert.deepEqual(effects, ['open-doors']);
  assert.equal(duties.getState().boardingProgress, 0);
  await assert.rejects(action.execute({ action: 'request-clearance' }), /unavailable/);
});

test('host failures are reported and an overlapping host action is rejected', async () => {
  const duties = createStationDuties();
  duties.update({
    dt: 0,
    z: 525,
    speed: 0,
    doorsOpen: false,
    doorFraction: 0,
    storyEnabled: true,
    storyCompletedIds: ['momiji-bread'],
  });
  const captured = new Map();
  let finish;
  registerRailwayTools({
    duties,
    tool: (name, _description, _schema, _readOnly, execute) => captured.set(name, execute),
    act: () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  });
  const action = captured.get('railway_action');
  const pending = action({ action: 'route-passenger' });
  await assert.rejects(action({ action: 'route-freight' }), /already in progress/);
  finish({ ok: false, message: 'The station controls are unavailable.' });
  await assert.rejects(pending, /station controls/);
  assert.equal(duties.getState().phase, 'routing');
});
