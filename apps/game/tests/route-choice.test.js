import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createRouteChoice,
  nearestScheduledStop,
  protectRouteStop,
} from '../src/simulation/route-choice.js';
function setup() {
  const drive = { distance: 2250, direction: 1, speed: 0, doorsOpen: false };
  const network = {
    distanceAtZ: (z) => z,
    getState: () => ({}),
    selectRoute: (route, { distance }) => ({ ok: true, route, distance }),
  };
  const choice = createRouteChoice({ network, getDrive: () => drive, getZ: () => drive.distance });
  return { drive, choice };
}
test('route authority requires stopped train at approach board and shut doors', () => {
  const { drive, choice } = setup();
  drive.speed = 1;
  assert.equal(choice.choose('wetland').ok, false);
  drive.speed = 0;
  drive.doorsOpen = true;
  assert.equal(choice.choose('wetland').ok, false);
  drive.doorsOpen = false;
  drive.distance = 2600;
  assert.equal(choice.choose('direct').ok, false);
  drive.distance = 2250;
  assert.equal(choice.choose('wetland').ok, true);
  assert.equal(choice.stopDistance(), undefined);
  drive.distance = 2600;
  assert.equal(choice.getState().limitKmh, 20);
});
test('route authority cannot override a conversation or station duty', () => {
  const choice = createRouteChoice({
    network: { getState: () => ({}) },
    getDrive: () => ({ direction: 1, speed: 0 }),
    getZ: () => 2250,
    isBlocked: () => true,
  });
  assert.equal(choice.getState().available, false);
  assert.equal(choice.choose('direct').ok, false);
});
test('manual protection holds at stop board in both directions without reversing distance', () => {
  for (const direction of [1, -1]) {
    const drive = { distance: 2250 + direction, direction, speed: 20, power: 1 };
    protectRouteStop(drive, 2250 - direction, 2250);
    assert.equal(drive.distance, 2250);
    assert.equal(drive.speed, 0);
    assert.equal(drive.power, 0);
  }
});
test('closer pending story stop wins over route board, including reverse travel', () => {
  assert.equal(nearestScheduledStop(1000, 1, 1500, 2250), 1500);
  assert.equal(nearestScheduledStop(3200, -1, 1500, 2950), 2950);
  assert.equal(nearestScheduledStop(1000, 1, 500, undefined), undefined);
});
test('only continuous driving through whole branch records traversal; teleport never counts', () => {
  const { choice } = setup();
  choice.choose('wetland');
  choice.recordMovement({ previousDistance: 2400, distance: 2800, direction: 1, dt: 0.05 });
  assert.equal(choice.getState().traversed, false);
  for (let distance = 2459; distance < 2822; distance += 1)
    choice.recordMovement({
      previousDistance: distance,
      distance: distance + 1,
      direction: 1,
      dt: 0.05,
    });
  assert.equal(choice.getState().traversed, true);
});
test('reversing inside the branch does not count as completing it', () => {
  const { choice } = setup();
  choice.choose('wetland');
  choice.recordMovement({ previousDistance: 2459, distance: 2461, direction: 1, dt: 0.1 });
  choice.recordMovement({ previousDistance: 2461, distance: 2459, direction: -1, dt: 0.1 });
  for (let d = 2459; d > 2400; d--)
    choice.recordMovement({ previousDistance: d, distance: d - 1, direction: -1, dt: 0.05 });
  assert.equal(choice.getState().traversed, false);
});
test('new ride resets route permission; viewpoint jumps clear partial traversal', () => {
  const { choice } = setup();
  choice.choose('wetland');
  choice.recordMovement({ previousDistance: 2459, distance: 2461, direction: 1, dt: 0.1 });
  choice.invalidateTraversal();
  assert.equal(choice.getState().entered, false);
  assert.equal(choice.reset().ok, true);
  assert.equal(choice.getState().confirmed, false);
  assert.equal(choice.stopDistance(), 2250);
});
