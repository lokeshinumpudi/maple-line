import test from 'node:test';
import assert from 'node:assert/strict';
import { CatmullRomCurve3, Vector3 } from 'three';
import { distanceAtZ, nextStop, recordStationVisit } from '../src/simulation/stops.js';

test('route-distance lookup finds a stop on a climbing, curved railway', () => {
  const track = new CatmullRomCurve3([
    new Vector3(0, 0, 0),
    new Vector3(30, 8, 300),
    new Vector3(-15, 18, 600),
  ]);
  const length = track.getLength();
  const distance = distanceAtZ(track, length, 275);
  assert.ok(Math.abs(track.getPointAt(distance / length).z - 275) < 0.001);
});
test('next stop follows direction and a two-second station stop records one visit immutably', () => {
  const stops = [
    { id: 'one', distance: 100 },
    { id: 'two', distance: 500 },
  ];
  assert.equal(nextStop(stops, 300, 1).id, 'two');
  assert.equal(nextStop(stops, 300, -1).id, 'one');
  const previous = [];
  const state = { distance: 100, speed: 0, visitedStops: previous };
  for (let i = 0; i < 40; i++) recordStationVisit(state, 0.1, stops);
  assert.deepEqual(state.visitedStops, ['one']);
  assert.deepEqual(previous, []);
  state.distance = 500;
  state.speed = 12;
  recordStationVisit(state, 10, stops);
  assert.deepEqual(state.visitedStops, ['one']);
});
