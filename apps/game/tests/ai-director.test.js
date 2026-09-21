import test from 'node:test';
import assert from 'node:assert/strict';
import { createDirectorClient, directorCruiseSpeed } from '../src/agent/ai-director.js';

const context = () => ({
  weather: 'clear',
  region: 'village',
  speedKmh: 30,
  remainingToStation: 300,
  paused: false,
});
const response = (decision = { pace: 'relaxed', stationActivity: 'stroll' }) => ({
  ok: true,
  json: async () => ({ source: 'jev', decision }),
});

test('director requests are throttled and never overlap', async () => {
  let resolve,
    calls = 0,
    clock = 1000;
  const decisions = [];
  const client = createDirectorClient({
    getContext: context,
    onDecision: (d) => decisions.push(d),
    now: () => clock,
    fetcher: () => {
      calls++;
      return new Promise((r) => {
        resolve = r;
      });
    },
  });
  const first = client.tick();
  await client.tick();
  assert.equal(calls, 1);
  resolve(response());
  await first;
  await client.tick();
  assert.equal(calls, 1);
  assert.equal(decisions[0].pace, 'relaxed');
  clock += 20001;
  const second = client.tick();
  resolve(response());
  await second;
  assert.equal(calls, 2);
  client.dispose();
});

test('disabling while a request is pending discards its eventual response', async () => {
  let resolve;
  const decisions = [];
  const client = createDirectorClient({
    getContext: context,
    onDecision: (d) => decisions.push(d),
    fetcher: () =>
      new Promise((r) => {
        resolve = r;
      }),
  });
  const pending = client.tick();
  client.setEnabled(false);
  resolve(response());
  await pending;
  assert.equal(decisions.length, 0);
  client.dispose();
});

test('invalid response actions are not applied', async () => {
  const current = context();
  let resolve;
  const decisions = [],
    statuses = [];
  const client = createDirectorClient({
    getContext: () => current,
    onDecision: (d) => decisions.push(d),
    onStatus: (s) => statuses.push(s),
    intervalMs: 0,
    fetcher: () =>
      new Promise((r) => {
        resolve = r;
      }),
  });
  const pending = client.tick();
  current.weather = 'rain';
  resolve(response({ pace: 'teleport', stationActivity: 'stroll' }));
  await pending;
  assert.equal(decisions.length, 0);
  assert.equal(statuses.at(-1), 'offline');
  client.dispose();
});

test('a decision for an earlier weather or location is discarded', async () => {
  let current = context(),
    resolve;
  const decisions = [],
    statuses = [];
  const client = createDirectorClient({
    getContext: () => ({ ...current }),
    onDecision: (d) => decisions.push(d),
    onStatus: (s) => statuses.push(s),
    fetcher: () =>
      new Promise((r) => {
        resolve = r;
      }),
  });
  const pending = client.tick();
  current = { ...current, weather: 'rain' };
  resolve(response());
  await pending;
  assert.equal(decisions.length, 0);
  assert.equal(statuses.at(-1), 'idle');
  client.dispose();
});

test('pause suppresses network calls and pace choices are bounded', async () => {
  let calls = 0;
  const client = createDirectorClient({
    getContext: () => ({ ...context(), paused: true }),
    onDecision: () => {},
    fetcher: async () => {
      calls++;
      return response();
    },
  });
  await client.tick();
  assert.equal(calls, 0);
  assert.equal(directorCruiseSpeed('cautious'), 60);
  assert.equal(directorCruiseSpeed('unknown'), 120);
  client.dispose();
});
