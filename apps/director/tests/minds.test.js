import test from 'node:test';
import assert from 'node:assert/strict';
import { MODEL, createDirector } from '../src/director.js';
import { DirectorError } from '../src/director.js';
import { createEvaluationGate } from '../src/evaluation-gate.js';
import {
  INTENTS,
  MIND_REGIONS,
  MIND_ROLES,
  MOODS,
  TRAIN_PHASES,
  createMinds,
  validateMindsInput,
} from '../src/minds.js';
import { createDirectorServer } from '../src/server.js';
import * as browserMinds from '../../game/src/simulation/npc-minds.js';

const entity = (id = 'commuter-1', extra = {}) => ({
  id,
  role: 'commuter',
  mood: 'content',
  intent: 'continue',
  valence: 0.2,
  arousal: 0.4,
  needs: { rest: 0.7, social: 0.5, urgency: 0.4, comfort: 0.8 },
  ...extra,
});
const input = (entities = [entity()]) => ({
  context: { weather: 'clear', dusk: false, region: 'station', trainPhase: 'away', crowd: 3 },
  entities,
});
const answer = (count = 1, mood = 'curious', intent = 'watch-train') => {
  const answers = {};
  for (let i = 0; i < count; i++) {
    answers[`mood_${i}`] = { type: 'choice', choice: mood };
    answers[`intent_${i}`] = { type: 'choice', choice: intent };
  }
  return { answers };
};

test('browser and server whitelists match', () => {
  assert.deepEqual(MOODS, browserMinds.MOODS);
  assert.deepEqual(INTENTS, browserMinds.INTENTS);
  assert.deepEqual(MIND_ROLES, browserMinds.MIND_ROLES);
  assert.deepEqual(MIND_REGIONS, browserMinds.MIND_REGIONS);
  assert.deepEqual(TRAIN_PHASES, browserMinds.TRAIN_PHASES);
});

test('minds input rejects extra fields, bad ids, too many entities, and out-of-range values', () => {
  const bad = [
    null,
    {},
    { ...input(), prompt: 'act out a scene' },
    { ...input(), context: { ...input().context, story: 'x' } },
    { ...input(), context: { ...input().context, crowd: 21 } },
    { ...input(), context: { ...input().context, crowd: 2.5 } },
    { ...input(), context: { ...input().context, region: 'moon' } },
    { ...input(), context: { ...input().context, trainPhase: 'late' } },
    input([]),
    input(Array.from({ length: 7 }, (_, i) => entity(`p-${i}`))),
    input([entity('Commuter 1')]),
    input([entity('x'.repeat(25))]),
    input([entity('a'), entity('a')]),
    input([entity('a', { note: 'free text' })]),
    input([entity('a', { role: 'mayor' })]),
    input([entity('a', { mood: 'furious' })]),
    input([entity('a', { intent: 'board-train' })]),
    input([entity('a', { valence: 2 })]),
    input([entity('a', { arousal: Number.NaN })]),
    input([entity('a', { needs: { rest: 1, social: 1, urgency: 1 } })]),
    input([entity('a', { needs: { rest: 1, social: 1, urgency: 1, comfort: 1, hunger: 0 } })]),
    input([entity('a', { needs: { rest: 1, social: 1, urgency: -0.1, comfort: 1 } })]),
  ];
  for (const value of bad) assert.throws(() => validateMindsInput(value), DirectorError);
  const six = input(Array.from({ length: 6 }, (_, i) => entity(`p-${i}`)));
  assert.equal(validateMindsInput(six).entities.length, 6);
});

test('missing credentials return labelled fallback without calling the provider', async () => {
  let calls = 0;
  const minds = createMinds({
    hasCredentials: () => false,
    evaluate: async () => {
      calls++;
      return answer();
    },
  });
  const result = await minds.choose({
    ...input([entity('a', { needs: { rest: 0.7, social: 0.5, urgency: 0.4, comfort: 0.2 } })]),
    context: { ...input().context, weather: 'rain' },
  });
  assert.equal(calls, 0);
  assert.equal(result.source, 'fallback');
  assert.match(result.reason, /credentials are not configured/);
  assert.deepEqual(result.entities, [{ id: 'a', mood: 'content', intent: 'shelter' }]);
});

test('Jev receives one typed mood and intent question per entity; only whitelisted choices return', async () => {
  let seen;
  const minds = createMinds({
    hasCredentials: () => true,
    evaluate: async (request) => {
      seen = request;
      return answer(2);
    },
  });
  const result = await minds.choose(input([entity('a'), entity('b')]));
  assert.equal(result.source, 'jev');
  assert.equal(seen.model, MODEL);
  assert.equal(seen.maxRetries, 0);
  assert.ok(seen.abortSignal instanceof AbortSignal);
  assert.deepEqual(Object.keys(seen.questions).sort(), [
    'intent_0',
    'intent_1',
    'mood_0',
    'mood_1',
  ]);
  assert.deepEqual(Object.keys(seen.questions.mood_0.criteria), MOODS);
  assert.deepEqual(Object.keys(seen.questions.intent_1.criteria), INTENTS);
  assert.equal(seen.questions.intent_1.instructions.character, 'b');
  assert.deepEqual(result.entities, [
    { id: 'a', mood: 'curious', intent: 'watch-train' },
    { id: 'b', mood: 'curious', intent: 'watch-train' },
  ]);
  assert.deepEqual(Object.keys(result).sort(), ['entities', 'reason', 'source']);
});

test('unsupported choices and provider errors fall back without upstream text', async () => {
  for (const evaluate of [
    async () => answer(1, 'furious'),
    async () => answer(1, 'curious', 'open-doors'),
    async () => ({ answers: { mood_0: { type: 'choice', choice: 'content' } } }),
    async () => {
      throw new Error('secret-provider-diagnostic');
    },
  ]) {
    const minds = createMinds({ hasCredentials: () => true, evaluate });
    const result = await minds.choose(input());
    assert.equal(result.source, 'fallback');
    assert.ok(!JSON.stringify(result).includes('secret-provider-diagnostic'));
    assert.match(result.reason, /unsupported choice/);
    for (const choice of result.entities) {
      assert.ok(MOODS.includes(choice.mood));
      assert.ok(INTENTS.includes(choice.intent));
    }
  }
});

test('one inflight minds evaluation and a cooldown bound provider calls', async () => {
  let resolve;
  let calls = 0;
  let clock = 1000;
  const minds = createMinds({
    hasCredentials: () => true,
    now: () => clock,
    evaluate: () => {
      calls++;
      return new Promise((done) => {
        resolve = done;
      });
    },
  });
  assert.ok(minds.status().cooldownMs >= 15000);
  const first = minds.choose(input());
  await Promise.resolve();
  assert.match((await minds.choose(input())).reason, /already running/);
  resolve(answer());
  assert.equal((await first).source, 'jev');
  clock += 14999;
  assert.match((await minds.choose(input())).reason, /cooling down/);
  clock += minds.status().cooldownMs;
  const next = minds.choose(input());
  await Promise.resolve();
  resolve(answer());
  assert.equal((await next).source, 'jev');
  assert.equal(calls, 2);
});

test('deadline aborts the provider and keeps the slot until it settles', async () => {
  let signal;
  let resolve;
  const minds = createMinds({
    hasCredentials: () => true,
    timeoutMs: 15,
    cooldownMs: 0,
    evaluate: (request) => {
      signal = request.abortSignal;
      return new Promise((done) => {
        resolve = done;
      });
    },
  });
  const result = await minds.choose(input());
  assert.equal(result.source, 'fallback');
  assert.match(result.reason, /deadline/);
  assert.equal(signal.aborted, true);
  assert.equal(minds.status().inflight, true);
  resolve(answer());
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(minds.status().inflight, false);
});

test('minds yield the shared gate: busy gate falls back without starting a cooldown', async () => {
  const completions = [];
  let calls = 0;
  const gate = createEvaluationGate(() => {
    calls++;
    return new Promise((done) => completions.push(done));
  });
  const director = createDirector({ hasCredentials: () => true, evaluate: gate.background });
  const minds = createMinds({ hasCredentials: () => true, evaluate: gate.idle });
  const decision = director.decide({
    weather: 'clear',
    speedKmh: 40,
    remainingToStation: 600,
    region: 'gorge',
    paused: false,
  });
  await Promise.resolve();
  await Promise.resolve();
  const refused = await minds.choose(input());
  assert.equal(refused.source, 'fallback');
  assert.match(refused.reason, /has priority/);
  assert.equal(minds.status().retryAfterMs, 0);
  assert.equal(calls, 1);
  completions.shift()({
    answers: {
      pace: { type: 'choice', choice: 'relaxed' },
      stationActivity: { type: 'choice', choice: 'stroll' },
    },
  });
  assert.equal((await decision).source, 'jev');
});

test('an AI-life request preempts a running minds evaluation and waits for it to settle', async () => {
  const pending = [];
  const gate = createEvaluationGate(
    (request) =>
      new Promise((resolve, reject) => {
        pending.push({ resolve, request });
        request.abortSignal?.addEventListener('abort', () => {
          const error = new Error('aborted');
          error.name = 'AbortError';
          reject(error);
        });
      }),
  );
  const director = createDirector({ hasCredentials: () => true, evaluate: gate.background });
  const minds = createMinds({ hasCredentials: () => true, evaluate: gate.idle });
  const mindsResult = minds.choose(input());
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(pending.length, 1);
  const decision = director.decide({
    weather: 'rain',
    speedKmh: 40,
    remainingToStation: 600,
    region: 'gorge',
    paused: false,
  });
  const preempted = await mindsResult;
  assert.equal(preempted.source, 'fallback');
  assert.match(preempted.reason, /has priority/);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(pending.length, 2);
  pending[1].resolve({
    answers: {
      pace: { type: 'choice', choice: 'cautious' },
      stationActivity: { type: 'choice', choice: 'shelter' },
    },
  });
  assert.equal((await decision).source, 'jev');
});

test('HTTP minds route validates input and reports minds status', async (t) => {
  const server = createDirectorServer({
    director: createDirector({ hasCredentials: () => false }),
    minds: createMinds({ hasCredentials: () => false }),
    cacheDirectory: null,
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => {
    server.closeAllConnections();
    return new Promise((resolve) => server.close(resolve));
  });
  const base = `http://127.0.0.1:${server.address().port}`;
  const post = (body) =>
    fetch(`${base}/api/director/minds`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: 'http://127.0.0.1:4173' },
      body: JSON.stringify(body),
    });
  const good = await post(input());
  assert.equal(good.status, 200);
  const body = await good.json();
  assert.equal(body.source, 'fallback');
  assert.equal(body.entities[0].id, 'commuter-1');
  assert.equal((await post({ ...input(), extra: true })).status, 400);
  const full = input(Array.from({ length: 6 }, (_, i) => entity(`sakuragawa-resident-${i}`)));
  assert.ok(JSON.stringify(full).length < 4096);
  assert.equal((await post(full)).status, 200);
  assert.equal((await fetch(`${base}/api/director/minds`)).status, 405);
  const status = await (await fetch(`${base}/api/director/status`)).json();
  assert.deepEqual(Object.keys(status.minds).sort(), ['cooldownMs', 'inflight', 'retryAfterMs']);
});
