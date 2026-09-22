import test from 'node:test';
import assert from 'node:assert/strict';
import generateWorld from '../../../ship/generate-world.mjs';
import { fetchShipWorld } from '../src/agent/ship-world-client.js';

const evaluation = (values) => ({
  answers: Object.fromEntries(
    Object.entries(values).map(([key, choice]) => [key, { type: 'choice', choice }]),
  ),
});

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
test('Ship browser calls evaluate directly with cancellation and validates bounded output', async () => {
  const controller = new AbortController();
  let calls = 0;
  const sdk = {
    evaluate: async (options) => {
      calls++;
      assert.equal(options.model, 'typesafe-ai/jev');
      assert.deepEqual(options.state, { description: 'Spring village' });
      assert.equal(options.questions.season.type, 'choice');
      assert.ok(options.questions.coverage.criteria.unsupported);
      return evaluation({ ...plan, coverage: 'supported' });
    },
  };
  const options = { body: JSON.stringify({ prompt: 'Spring village' }), signal: controller.signal };
  const response = await fetchShipWorld('', options, sdk);
  const result = await response.json();
  assert.equal(result.source, 'signal');
  assert.equal(result.plan.season, 'spring');
  assert.ok(Number.isInteger(result.plan.seed));
  assert.equal(calls, 1);
  controller.abort();
  await assert.rejects(fetchShipWorld('', options, sdk), { name: 'AbortError' });
  assert.equal(calls, 1);
});
test('Ship browser rejects invalid model settings and results arriving after cancellation', async () => {
  const options = { body: JSON.stringify({ prompt: 'Spring village' }) };
  for (const answer of [
    { coverage: 'invented', plan },
    { coverage: 'supported', plan: { ...plan, weather: 'lava' } },
    null,
  ]) {
    await assert.rejects(
      fetchShipWorld('', options, {
        evaluate: async () =>
          evaluation(answer ? { ...answer.plan, coverage: answer.coverage } : {}),
      }),
    );
  }
  const controller = new AbortController();
  await assert.rejects(
    fetchShipWorld(
      '',
      { ...options, signal: controller.signal },
      {
        evaluate: async () => {
          controller.abort();
          return evaluation({ ...plan, coverage: 'supported' });
        },
      },
    ),
    { name: 'AbortError' },
  );
});

test('Ship evaluation rejects missing SDK, non-choice answers and provider failures', async () => {
  const options = { body: JSON.stringify({ prompt: 'Spring village' }) };
  await assert.rejects(
    fetchShipWorld('', options, { llm: async () => {} }),
    /evaluation is unavailable/,
  );
  await assert.rejects(
    fetchShipWorld('', options, {
      evaluate: async () => ({ answers: { season: { type: 'boolean', probability: 1 } } }),
    }),
    /Invalid evaluation/,
  );
  const failure = Object.assign(new Error('Daily limit'), { status: 429 });
  await assert.rejects(
    fetchShipWorld('', options, {
      evaluate: async () => {
        throw failure;
      },
    }),
    (error) => error === failure,
  );
});

test('cancellation ends the local wait even when the SDK ignores abort', async () => {
  const controller = new AbortController();
  let started;
  const ready = new Promise((resolve) => {
    started = resolve;
  });
  const pending = fetchShipWorld(
    '',
    { body: JSON.stringify({ prompt: 'Spring village' }), signal: controller.signal },
    {
      evaluate: () => {
        started();
        return new Promise(() => {});
      },
    },
  );
  await ready;
  controller.abort();
  await assert.rejects(pending, { name: 'AbortError' });
});
