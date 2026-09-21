import test from 'node:test';
import assert from 'node:assert/strict';
import { railJointCrossings, sourcePan } from '../src/audio/sound-model.js';
import { blendLoop } from '../src/audio/recordings.js';
import { CAR_COUNT } from '../src/train/consist.js';

test('the same distance produces the same axle rhythm at different frame rates, in either direction', () => {
  function travel(step, direction) {
    let count = 0;
    const start = 500.013,
      end = start + direction * 120;
    for (let distance = start; direction * (end - distance) > 0.0001;) {
      const next = direction > 0 ? Math.min(end, distance + step) : Math.max(end, distance - step);
      count += railJointCrossings(distance, next, direction).length;
      distance = next;
    }
    return count;
  }
  for (const direction of [1, -1]) {
    assert.equal(travel(0.1, direction), CAR_COUNT * 4 * 10);
    assert.equal(travel(0.8, direction), CAR_COUNT * 4 * 10);
    assert.equal(travel((160 / 3.6) * 0.12, direction), CAR_COUNT * 4 * 10);
  }
});
test('stationary trains, initialization and teleports do not play a rail-joint backlog', () => {
  for (const [from, to] of [
    [null, 20],
    [20, 20],
    [20, 900],
    [NaN, 20],
  ])
    assert.deepEqual(railJointCrossings(from, to), []);
});
test('axle events retain their position within an interval, including reverse travel', () => {
  for (const [from, to, direction] of [
    [0.5, 3, 1],
    [3, 0.5, -1],
  ]) {
    const events = railJointCrossings(from, to, direction);
    assert.ok(events.length > 1);
    assert.ok(events.every(({ fraction }) => fraction >= 0 && fraction <= 1));
    assert.ok(events.every(({ strength }) => Number.isFinite(strength) && strength > 0));
    assert.deepEqual(
      events.map((e) => e.fraction),
      events.map((e) => e.fraction).sort((a, b) => a - b),
    );
    assert.ok(new Set(events.map((e) => e.fraction)).size > 1);
  }
});
test('turning the camera reverses the perceived side of a source', () => {
  const listener = { x: 0, z: 0 },
    source = { x: 10, z: 0 };
  assert.equal(sourcePan(listener, { x: 1, z: 0 }, source), 0.9);
  assert.equal(sourcePan(listener, { x: -1, z: 0 }, source), -0.9);
  assert.equal(sourcePan(listener, { x: 0, z: 1 }, source), 0);
  assert.equal(sourcePan(listener, { x: 1, z: 0 }, listener), 0);
});
test('loop crossfade joins adjacent original samples and preserves stereo channels', () => {
  const context = {
    createBuffer(channels, length, sampleRate) {
      const data = Array.from({ length: channels }, () => new Float32Array(length));
      return { numberOfChannels: channels, length, sampleRate, getChannelData: (ch) => data[ch] };
    },
  };
  const buffer = context.createBuffer(2, 100, 100);
  for (let i = 0; i < 100; i++) {
    buffer.getChannelData(0)[i] = i / 100;
    buffer.getChannelData(1)[i] = -i / 100;
  }
  const result = blendLoop(context, buffer, 0.1);
  assert.equal(result.length, 90);
  for (const ch of [0, 1]) {
    const output = result.getChannelData(ch),
      input = buffer.getChannelData(ch);
    assert.equal(output[0], input[10]);
    assert.equal(output.at(-1), input[9]);
    assert.ok(output.every(Number.isFinite));
  }
});
