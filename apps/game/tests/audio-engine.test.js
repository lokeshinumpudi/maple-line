import test from 'node:test';
import assert from 'node:assert/strict';
import { createSoundscape } from '../src/audio/soundscape.js';
import { RECORDINGS } from '../src/audio/recordings.js';

// Observe scheduling/lifecycle only; browser offline renders verify the actual audio graph.
function audioClock() {
  const nodes = [];
  const parameter = () => ({
    value: 0,
    calls: [],
    setValueAtTime(...args) {
      this.calls.push(['set', ...args]);
    },
    setTargetAtTime(...args) {
      this.calls.push(['target', ...args]);
    },
    linearRampToValueAtTime(...args) {
      this.calls.push(['linear', ...args]);
    },
    exponentialRampToValueAtTime(...args) {
      this.calls.push(['exponential', ...args]);
    },
    cancelAndHoldAtTime(...args) {
      this.calls.push(['hold', ...args]);
    },
  });
  const node = () => {
    const result = {
      gain: parameter(),
      frequency: parameter(),
      Q: parameter(),
      pan: parameter(),
      threshold: parameter(),
      knee: parameter(),
      ratio: parameter(),
      attack: parameter(),
      release: parameter(),
      connect(next) {
        return next;
      },
      disconnect() {},
      start(time = 0) {
        this.started = time;
      },
      stop(time = 0) {
        this.stopped = time;
      },
    };
    nodes.push(result);
    return result;
  };
  const context = {
    currentTime: 0,
    sampleRate: 1000,
    state: 'running',
    destination: node(),
    createGain: node,
    createBiquadFilter: node,
    createDynamicsCompressor: node,
    createConvolver: node,
    createStereoPanner: node,
    createBufferSource: node,
    createOscillator: node,
    createBuffer(numberOfChannels, length, sampleRate) {
      const data = Array.from({ length: numberOfChannels }, () => new Float32Array(length));
      return {
        numberOfChannels,
        length,
        sampleRate,
        duration: length / sampleRate,
        getChannelData: (i) => data[i],
      };
    },
    async decodeAudioData() {
      return this.createBuffer(1, 4000, 1000);
    },
  };
  return { context, nodes };
}
const moving = { enabled: true, active: true, speed: 12, distance: 0.5, direction: 1 };

test('rail voices use distinct audio times and cancel queued impacts on reversal and mute', () => {
  const { context, nodes } = audioClock();
  const sound = createSoundscape(context);
  sound.update(moving);
  const before = nodes.length;
  context.currentTime = 0.04;
  sound.update({ ...moving, distance: 3 });
  const impacts = nodes.slice(before).filter((n) => n.started !== undefined);
  assert.ok(impacts.length >= 4);
  assert.ok(new Set(impacts.map((n) => n.started)).size > 1);
  assert.ok(impacts.every((n) => n.started >= 0.04 && n.started <= 0.08));
  context.currentTime = 0.041;
  sound.update({ ...moving, distance: 2.99, direction: -1 });
  assert.equal(sound.state().scheduledRailVoices, 0);
  assert.ok(impacts.filter((n) => n.started > 0.041).every((n) => n.stopped === 0.041));
  context.currentTime = 0.05;
  sound.update({ ...moving, active: false });
  assert.equal(sound.state().mix.master, 0);
  assert.ok(
    nodes.some((n) =>
      n.gain.calls.some(
        (call) => call[0] === 'linear' && call[1] === 0 && Math.abs(call[2] - 0.23) < 1e-9,
      ),
    ),
  );
  sound.dispose();
});

test('stalled frames and teleports discard rail history, and pause/resume starts fresh', () => {
  const { context } = audioClock();
  const sound = createSoundscape(context);
  sound.update(moving);
  context.currentTime = 0.25;
  sound.update({ ...moving, distance: 3 });
  assert.equal(sound.state().scheduledRailVoices, 0);
  context.currentTime = 0.29;
  sound.update({ ...moving, distance: 1000 });
  assert.equal(sound.state().scheduledRailVoices, 0);
  sound.update({ ...moving, active: false });
  context.currentTime = 0.33;
  sound.update({ ...moving, distance: 1001 });
  assert.equal(sound.state().scheduledRailVoices, 0);
  sound.dispose();
});

test('recording failures keep fallback, successful buffers are reused, and disposal is final', async () => {
  const { context } = audioClock();
  const sound = createSoundscape(context);
  let requests = 0;
  const fetcher = async (url) => {
    requests++;
    return { ok: url !== RECORDINGS.forest, arrayBuffer: async () => new ArrayBuffer(1) };
  };
  await Promise.all([sound.loadRecordings(fetcher), sound.loadRecordings(fetcher)]);
  assert.equal(requests, Object.keys(RECORDINGS).length);
  assert.equal(sound.state().recordings.forest, 'fallback');
  assert.equal(sound.state().recordings.roofRain, 'ready');
  assert.ok(sound.state().recordedBytes > 0);
  await sound.loadRecordings(fetcher);
  assert.equal(requests, Object.keys(RECORDINGS).length + 1);
  sound.dispose();
  const count = requests;
  await sound.loadRecordings(fetcher);
  assert.equal(requests, count);
});
