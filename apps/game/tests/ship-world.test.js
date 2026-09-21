import test from 'node:test';
import assert from 'node:assert/strict';
import generateWorld from '../../../ship/generate-world.mjs';
import { fetchShipWorld } from '../src/agent/ship-world-client.js';

const plan = {
  season: 'spring',
  forest: 'balanced',
  settlement: 'rural',
  weather: 'clear',
  time: 'dusk',
};
test('Ship generation validates the model, saves its result and reuses a request without another call', async () => {
  const records = new Map();
  let calls = 0;
  const signal = {
    db: () => ({
      get: async (id) => records.get(id),
      set: async (id, value) => records.set(id, value),
    }),
    llm: async () => {
      calls++;
      return { content: JSON.stringify({ coverage: 'supported', plan }) };
    },
  };
  const args = { requestId: 'test-world-123', prompt: 'A blossom village at dusk' };
  const result = await generateWorld({ signal, args });
  assert.equal(result.source, 'signal');
  assert.equal(records.get(args.requestId).plan.season, 'spring');
  assert.deepEqual(await generateWorld({ signal, args }), result);
  assert.equal(calls, 1);
  signal.llm = async () => ({
    content: JSON.stringify({ coverage: 'supported', plan: { ...plan, weather: 'lava' } }),
  });
  await assert.rejects(
    generateWorld({ signal, args: { ...args, requestId: 'invalid-123' } }),
    /weather/,
  );
  assert.equal(records.size, 1);
});
test('Ship browser reads the saved function output and rejects an unsaved agent reply', async () => {
  let request;
  const sdk = {
    agent: () => ({
      send: async (message) => {
        request = JSON.parse(message);
        return { status: 'done' };
      },
    }),
    db: () => ({
      get: async (id) => {
        assert.equal(id, request.requestId);
        return { data: { source: 'signal', prompt: request.prompt, plan } };
      },
    }),
  };
  const response = await fetchShipWorld(
    '',
    { body: JSON.stringify({ prompt: 'Spring village' }) },
    sdk,
  );
  assert.equal((await response.json()).source, 'signal');
  sdk.db = () => ({ get: async () => null });
  await assert.rejects(
    fetchShipWorld('', { body: JSON.stringify({ prompt: 'Spring village' }) }, sdk),
    /not saved/,
  );
});
