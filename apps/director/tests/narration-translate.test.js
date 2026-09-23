import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createNarration, translationKey, TRANSLATION_MODEL } from '../src/narration.js';
import { createDirectorServer, devOrigins } from '../src/server.js';

const wav = Buffer.alloc(48);
wav.write('RIFF');
wav.write('WAVE', 8);
const speech = () => Response.json({ audios: [wav.toString('base64')] });

test('translation cache key depends on text, language and speaker gender only', () => {
  const key = translationKey('Front car.', 'te-IN', 'Female');
  assert.match(key, /^[a-f0-9]{64}$/);
  assert.equal(translationKey(' Front car. ', 'te-IN', 'Female'), key);
  assert.notEqual(translationKey('Front car.', 'hi-IN', 'Female'), key);
  assert.notEqual(translationKey('Front car.', 'te-IN', 'Male'), key);
  assert.notEqual(translationKey('Front car.', 'te-IN'), key);
  assert.notEqual(translationKey('Back car.', 'te-IN', 'Female'), key);
  assert.equal(TRANSLATION_MODEL, 'sarvam-translate:v1');
});

test('translations are cached on disk beside the audio and reused by a new engine', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'maple-translate-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const calls = [];
  const first = createNarration({
    apiKey: 'test-only',
    cacheDirectory: directory,
    fetchImpl: async (url, options) => {
      calls.push([url, JSON.parse(options.body)]);
      return Response.json({ translated_text: 'ముందు కారు.' });
    },
  });
  const request = { text: 'Front car.', language: 'te-IN', character: 'riko' };
  const [a, b] = await Promise.all([first.translate(request), first.translate(request)]);
  assert.deepEqual(a, { text: 'ముందు కారు.', language: 'te-IN', source: 'sarvam' });
  assert.equal(b.text, a.text);
  assert.equal(calls.length, 1);
  assert.equal(calls[0][1].speaker_gender, 'Female');
  assert.equal(calls[0][1].model, 'sarvam-translate:v1');
  assert.equal((await readdir(join(directory, 'translations'))).length, 1);
  const second = createNarration({
    apiKey: '',
    cacheDirectory: directory,
    fetchImpl: async () => {
      throw new Error('Should not translate again');
    },
  });
  assert.deepEqual(await second.translate(request), { ...a, source: 'cache' });
  assert.deepEqual(await second.translate({ text: 'Hello', language: 'en-IN' }), {
    text: 'Hello',
    language: 'en-IN',
    source: 'original',
  });
  for (const invalid of [
    { text: 'x', language: 'ja-JP' },
    { text: 'x', language: 'te-IN', character: 'nobody' },
    { text: 'x', language: 'te-IN', model: 'mayura:v1' },
  ])
    await assert.rejects(second.translate(invalid), (error) => error.status === 400);
  // Without a key, an uncached line reports the missing key rather than a fake translation.
  await assert.rejects(
    second.translate({ text: 'Not cached', language: 'te-IN' }),
    (error) => error.status === 503,
  );
});

test('text already in the target language is voiced without translating it again', async () => {
  const calls = [];
  const narration = createNarration({
    apiKey: 'test-only',
    fetchImpl: async (url, options) => {
      calls.push([url, JSON.parse(options.body)]);
      return speech();
    },
  });
  await narration.speak({
    text: 'ముందు బోగీ.',
    language: 'te-IN',
    character: 'riko',
    emotion: 'dry',
    textLanguage: 'te-IN',
  });
  assert.equal(calls.length, 1);
  assert.ok(calls[0][0].endsWith('/text-to-speech'));
  assert.equal(calls[0][1].text, 'ముందు బోగీ.');
  assert.equal(calls[0][1].speaker, 'ishita');
  assert.equal(calls[0][1].model, 'bulbul:v3');
  await assert.rejects(
    narration.speak({ text: 'x', language: 'te-IN', textLanguage: 'hi-IN' }),
    (error) => error.status === 400,
  );
});

test('an unknown SARVAM_VOICE_MODEL keeps bulbul:v3', () => {
  assert.equal(createNarration({ apiKey: '', model: 'bulbul:v9' }).status().model, 'bulbul:v3');
  assert.equal(
    createNarration({ apiKey: '', model: 'bulbul:v4-flash' }).status().model,
    'bulbul:v4-flash',
  );
});

test('the translate route and extra dev origins follow the same HTTP rules', async (t) => {
  assert.deepEqual(
    devOrigins(
      'http://127.0.0.1:4573, http://localhost:4573,https://evil.example,http://10.0.0.2:80',
    ),
    ['http://127.0.0.1:4573', 'http://localhost:4573'],
  );
  assert.deepEqual(devOrigins(undefined), []);
  const server = createDirectorServer({
    allowedOrigins: ['http://127.0.0.1:4573'],
    narration: createNarration({
      apiKey: 'test-only',
      fetchImpl: async () => Response.json({ translated_text: 'పెట్టెలో ఏముంది?' }),
    }),
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(
    () =>
      new Promise((resolve) => {
        server.close(resolve);
        server.closeIdleConnections();
      }),
  );
  const url = `http://127.0.0.1:${server.address().port}/api/director/narration/translate`;
  const post = (origin) =>
    fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin },
      body: JSON.stringify({ text: 'What’s in the box?', language: 'te-IN', character: 'sato' }),
    });
  const response = await post('http://127.0.0.1:4573');
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    text: 'పెట్టెలో ఏముంది?',
    language: 'te-IN',
    source: 'sarvam',
  });
  assert.equal((await post('http://127.0.0.1:4999')).status, 403);
});
