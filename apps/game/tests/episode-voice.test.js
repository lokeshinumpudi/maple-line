import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeEpisode, beatSeconds, voicedSeconds } from '../src/drama/episode-schema.js';
import { createEpisodeRunner } from '../src/drama/episode-runner.js';
import { createEpisodeVoice, wavDurationMs } from '../src/drama/episode-voice.js';
import {
  buildVoiceManifest,
  clipFileName,
  createManifestVoice,
  voicedLines,
} from '../src/drama/voice-manifest.js';
import { THE_1742 } from '../src/drama/series/the-1742.js';
import { additionalStops } from '../src/world/extended-route.js';
import { LEVEL_CROSSINGS } from '../src/world/level-crossings.js';
import { VOICE_CAST, voiceFor } from '@maple-line/voice-score';

const context = {
  stops: ['momiji', ...additionalStops.map((stop) => stop.id)],
  crossings: LEVEL_CROSSINGS.map((site) => site.id),
};
const episode = (line = {}) => ({
  id: 'voiced',
  title: 'Voiced',
  cast: { riko: { name: 'Riko' }, clerk: { name: 'Clerk', voice: 'sato' }, extra: { name: 'X' } },
  scenes: [
    {
      id: 's1',
      heading: 'EXT. PLATFORM',
      actors: { riko: 'commuter-2' },
      beats: [
        {
          shot: { type: 'portrait', subject: { cast: 'riko' } },
          line: 'The platform is quiet.',
          dialogue: [
            { cast: 'riko', text: 'Front car.', ...line },
            { cast: 'clerk', text: 'Mind the gap.' },
          ],
        },
        { shot: { type: 'platform' }, hold: 2, dialogue: [{ cast: 'extra', text: 'Hm.' }] },
      ],
    },
  ],
});
/** A 24 kHz, 16-bit mono WAV header followed by `ms` of silence. */
function wav(ms) {
  const bytes = Math.round(48 * ms);
  const buffer = Buffer.alloc(44 + bytes);
  buffer.write('RIFF');
  buffer.writeUInt32LE(36 + bytes, 4);
  buffer.write('WAVEfmt ', 8);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(24000, 24);
  buffer.writeUInt32LE(48000, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write('data', 36);
  buffer.writeUInt32LE(bytes, 40);
  return buffer;
}
function fakeHost(voice) {
  const calls = [];
  return {
    calls,
    setScene: () => {},
    setStop: (id) => calls.push(['stop', id]),
    cut: (shot) => calls.push(['cut', shot]),
    say: (line) => calls.push(['say', line]),
    card: (card) => calls.push(['card', card]),
    direct: () => {},
    event: () => {},
    weather: () => {},
    doors: () => true,
    isStopped: () => true,
    doorsClosed: () => true,
    resolve: (s) => (s.cast ? { person: s.entity } : null),
    ...(voice ? { voice } : {}),
  };
}
const run = (runner, seconds) => {
  for (let t = 0; t < seconds; t += 0.1) runner.update(0.1);
};

test('older episodes normalize exactly as before and voice fields are optional', () => {
  const plain = normalizeEpisode(episode(), context);
  const line = plain.scenes[0].beats[0].dialogue[0];
  assert.deepEqual(Object.keys(line), ['cast', 'text']);
  assert.equal('lineTranslations' in plain.scenes[0].beats[0], false);
  assert.equal(plain.cast.clerk.voice, 'sato');
  const voiced = normalizeEpisode(
    episode({ emotion: 'dry', translations: { 'te-IN': 'ముందు బోగీ.' } }),
    context,
  );
  assert.deepEqual(voiced.scenes[0].beats[0].dialogue[0], {
    cast: 'riko',
    text: 'Front car.',
    emotion: 'dry',
    translations: { 'te-IN': 'ముందు బోగీ.' },
  });
  for (const [change, pattern] of [
    [{ emotion: 'furious' }, /dialogue\[0\]\.emotion must be one of/],
    [{ translations: { 'ja-JP': 'x' } }, /translations\.ja-JP must be one of/],
    [{ translations: { 'en-IN': 'x' } }, /translations\.en-IN must be one of/],
    [{ translations: { 'te-IN': '' } }, /translations\.te-IN must be text/],
  ])
    assert.throws(() => normalizeEpisode(episode(change), context), pattern);
  const badVoice = episode();
  badVoice.cast.riko.voice = 'nobody';
  assert.throws(() => normalizeEpisode(badVoice, context), /cast\.riko\.voice must be one of/);
});

test('every speaking part in The 17:42 has a distinct Sarvam voice and a valid delivery', () => {
  const parts = new Set();
  for (const source of THE_1742.episodes) {
    const clean = normalizeEpisode(source, context);
    const lines = voicedLines(clean);
    const spoken = clean.scenes.flatMap((scene) => scene.beats.flatMap((beat) => beat.dialogue));
    assert.equal(lines.length, spoken.length, `${source.id} has an unvoiced line`);
    for (const line of lines) parts.add(line.voice);
  }
  assert.deepEqual([...parts].sort(), ['aoi', 'fusae', 'ishida', 'riko', 'sato']);
  const speakers = [...parts].map((part) => VOICE_CAST[part].speaker);
  assert.equal(new Set(speakers).size, speakers.length);
});

test('a v4 model keeps v3 voices for parts without a confirmed v4 speaker', () => {
  assert.deepEqual(voiceFor('riko', 'natural'), {
    model: 'bulbul:v3',
    speaker: 'ishita',
    pace: 1.05,
  });
  assert.equal(
    voiceFor('riko', 'natural', { model: 'bulbul:v4-flash', language: 'te-IN' }).speaker,
    'pooja_te_conversation',
  );
  assert.deepEqual(voiceFor('sato', 'dry', { model: 'bulbul:v4-flash', language: 'te-IN' }), {
    model: 'bulbul:v3',
    ...voiceFor('sato', 'dry'),
  });
});

test('a voiced line holds its beat until the clip ends and shows the translated subtitle', () => {
  const plays = [];
  let handle = null;
  const voice = {
    active: () => true,
    prepare: (items) => plays.push(['prepare', items.map((item) => item.id)]),
    ready: () => true,
    text: (item) =>
      item.id.endsWith('.line') ? 'ప్లాట్‌ఫాం నిశ్శబ్దంగా ఉంది.' : `te:${item.text}`,
    durationMs: (item) => (item.voice === 'riko' ? 6000 : null),
    play(item) {
      if (item.voice !== 'riko') return null;
      handle = { durationMs: 6000, done: false, stop: () => (handle.done = true) };
      plays.push(['play', item.id]);
      return handle;
    },
    stopAll: () => {},
    status: () => ({ mode: 'voice', language: 'te-IN', reason: null }),
  };
  const host = fakeHost(voice);
  const runner = createEpisodeRunner(host, context);
  runner.play(episode());
  // The first beat waits under the title card until its voice is ready (here at once).
  runner.update(0.1);
  const cut = host.calls.find((call) => call[0] === 'cut')[1];
  assert.equal(cut.line, 'ప్లాట్‌ఫాం నిశ్శబ్దంగా ఉంది.');
  assert.ok(plays[0][1].includes('voiced:0.0.0') && plays[0][1].includes('voiced:0.1.0'));
  run(runner, 6);
  const said = host.calls.filter((call) => call[0] === 'say').map((call) => call[1]);
  assert.equal(said[0].text, 'te:Front car.');
  assert.equal(said[0].voiced, true);
  assert.equal(said[0].seconds, voicedSeconds(6000));
  // Reading time for "Front car." is 1.8 s; the clip is 6.2 s, so the next line waits,
  // and keeps waiting while the audio element has not reported the end.
  run(runner, 4);
  assert.equal(host.calls.filter((call) => call[0] === 'say').length, 1);
  assert.deepEqual(plays.at(-1), ['play', 'voiced:0.0.0']);
  assert.equal(runner.getState().beat.waitingFor, 'line');
  handle.done = true;
  run(runner, 2.5);
  const second = host.calls.filter((call) => call[0] === 'say')[1][1];
  assert.equal(second.speaker, 'Clerk');
  assert.equal(second.voiced, false);
});

test('a clip that never reports its end cannot hold the beat forever', () => {
  const voice = {
    active: () => true,
    prepare: () => {},
    ready: () => true,
    text: (item) => item.text,
    durationMs: () => 1000,
    play: (item) => (item.voice === 'riko' ? { durationMs: 1000, done: false, stop() {} } : null),
    stopAll: () => {},
    status: () => ({ mode: 'voice', language: 'en-IN', reason: null }),
  };
  const host = fakeHost(voice);
  const runner = createEpisodeRunner(host, context);
  runner.play(episode());
  run(runner, 14);
  assert.equal(host.calls.filter((call) => call[0] === 'say').length, 2);
});

test('offline director: labelled subtitles, authored translations still win, no audio', async () => {
  const requests = [];
  const voice = createEpisodeVoice({
    fetchImpl: async (url) => {
      requests.push(url);
      throw new TypeError('fetch failed');
    },
  });
  voice.configure({ language: 'te-IN', enabled: true });
  await voice.check();
  const status = voice.status();
  assert.equal(status.mode, 'subtitles');
  assert.equal(status.reason, 'Director offline · subtitles only');
  const authored = {
    id: 'a',
    text: 'Front car.',
    voice: 'riko',
    translations: { 'te-IN': 'ముందు బోగీ.' },
  };
  const machine = { id: 'b', text: 'Mind the gap.', voice: 'sato', translations: null };
  voice.prepare([authored, machine]);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(voice.ready(authored), true);
  assert.equal(voice.ready(machine), true);
  assert.equal(voice.text(authored), 'ముందు బోగీ.');
  assert.equal(voice.text(machine), 'Mind the gap.');
  assert.equal(voice.play(authored), null);
  assert.deepEqual(requests, ['/api/director/narration/status']);
  // The runner then plays exactly the reading-time schedule it used before voices existed.
  const host = fakeHost(voice);
  const runner = createEpisodeRunner(host, context);
  runner.play(episode({ translations: { 'te-IN': 'ముందు బోగీ.' } }));
  run(runner, 9);
  const said = host.calls.filter((call) => call[0] === 'say').map((call) => call[1]);
  assert.equal(said[0].text, 'ముందు బోగీ.');
  assert.equal(said[0].voiced, false);
  assert.equal(said[0].seconds, 1.8);
});

test('a director without a Sarvam key is reported, and the key never reaches the browser', async () => {
  const voice = createEpisodeVoice({
    fetchImpl: async () => Response.json({ configured: false, provider: 'sarvam' }),
  });
  voice.configure({ language: 'en-IN', enabled: true });
  await voice.check();
  assert.equal(voice.status().reason, 'No Sarvam key on the director · subtitles only');
  assert.equal(voice.active(), false);
});

test('prepared lines fetch translation then audio and report the clip length', async () => {
  const bodies = [];
  const clip = wav(2500);
  const voice = createEpisodeVoice({
    audio: {
      play: async () => {},
      pause() {},
      load() {},
      removeAttribute() {},
      addEventListener() {},
      removeEventListener() {},
    },
    urls: { createObjectURL: () => 'blob:clip', revokeObjectURL() {} },
    fetchImpl: async (url, options) => {
      if (url.endsWith('/status')) return Response.json({ configured: true });
      const body = JSON.parse(options.body);
      bodies.push([url, body]);
      return url.endsWith('/translate')
        ? Response.json({ text: 'పెట్టెలో ఏముంది?', language: 'te-IN', source: 'sarvam' })
        : new Response(clip, { headers: { 'content-type': 'audio/wav' } });
    },
  });
  voice.configure({ language: 'te-IN', enabled: true });
  await voice.check();
  const item = { id: 'x', text: 'What’s in the box?', voice: 'sato', emotion: 'curious' };
  voice.prepare([item]);
  for (let i = 0; i < 20 && !voice.ready(item); i++)
    await new Promise((resolve) => setTimeout(resolve, 1));
  assert.equal(voice.ready(item), true);
  assert.equal(voice.text(item), 'పెట్టెలో ఏముంది?');
  assert.equal(voice.durationMs(item), 2500);
  assert.deepEqual(bodies[0][1], {
    text: 'What’s in the box?',
    language: 'te-IN',
    character: 'sato',
  });
  assert.deepEqual(bodies[1][1], {
    text: 'పెట్టెలో ఏముంది?',
    language: 'te-IN',
    character: 'sato',
    emotion: 'curious',
    priority: 'prefetch',
    textLanguage: 'te-IN',
  });
  const handle = voice.play(item);
  assert.equal(handle.durationMs, 2500);
  assert.equal(voice.status().mode, 'voice');
});

test('WAV length comes from the header', () => {
  assert.equal(wavDurationMs(wav(1234)), 1234);
  assert.equal(
    wavDurationMs(Buffer.from('not a wave file at all, not even close to 44 bytes')),
    null,
  );
});

test('the audio manifest uses renderer line ids and runner timing', () => {
  const clean = normalizeEpisode(THE_1742.episodes[0], context);
  const lines = voicedLines(clean);
  const generated = lines.map((line, index) => ({
    ...line,
    file: clipFileName(line),
    durationMs: 1000 + index * 100,
    text: line.sourceText,
    textSource: 'original',
    speaker: VOICE_CAST[line.voice].speaker,
  }));
  const manifest = buildVoiceManifest({
    episode: clean,
    language: 'en-IN',
    model: 'bulbul:v3',
    generated,
  });
  // Exactly the renderer's audio manifest: version 1 and { line, file } clips.
  assert.equal(manifest.version, 1);
  assert.deepEqual(manifest.clips[0], {
    line: 'momiji-platform/4/1',
    file: 'momiji-platform-4-1-riko.wav',
  });
  for (const clip of manifest.clips) assert.deepEqual(Object.keys(clip), ['line', 'file']);
  assert.equal(manifest.lines[0].text, 'Two minutes. I’ll miss the last bus by two minutes.');
  // Beat 5 is Sato and Riko: the second and third voiced lines (1100 and 1200 ms).
  const beat = clean.scenes[0].beats[4];
  const entry = manifest.plan.beats.find((item) => item.beat === 'momiji-platform/5');
  assert.equal(
    entry.plannedMs,
    Math.round(beatSeconds(beat, [voicedSeconds(1100), voicedSeconds(1200)]) * 1000),
  );
  assert.equal(entry.lines[0].offsetMs, 1000);
  assert.equal(entry.lines[1].offsetMs, 1000 + Math.round(voicedSeconds(1100) * 1000) + 350);
  // The first beat carries the title card lead; later beats start where the previous ended.
  assert.equal(manifest.plan.beats[0].plannedMs, 4500 + 6000);
  const before = manifest.plan.beats.slice(0, 4).reduce((sum, item) => sum + item.plannedMs, 0);
  assert.equal(entry.startMs, before);
  const first = manifest.plan.beats.find((item) => item.beat === 'momiji-platform/4');
  assert.equal(manifest.lines[0].plannedStartMs, first.startMs + 1000);
  assert.equal(
    manifest.plan.plannedMs,
    manifest.plan.beats.reduce((sum, item) => sum + item.plannedMs, 0),
  );
});

test('a render replays manifest lengths and emits line events with the same ids', () => {
  const clean = normalizeEpisode(THE_1742.episodes[0], context);
  const generated = voicedLines(clean).map((line) => ({
    ...line,
    file: clipFileName(line),
    durationMs: 3000,
    text: `te:${line.sourceText}`,
    textSource: 'machine',
    speaker: 'x',
  }));
  const manifest = buildVoiceManifest({
    episode: clean,
    language: 'te-IN',
    model: 'bulbul:v3',
    generated,
    captions: { 'momiji-platform/1': 'te:caption' },
  });
  const events = [];
  const host = fakeHost(createManifestVoice(manifest));
  const runner = createEpisodeRunner(host, { ...context, onEvent: (event) => events.push(event) });
  runner.play(THE_1742.episodes[0]);
  run(runner, 40);
  const cut = host.calls.find((call) => call[0] === 'cut')[1];
  assert.equal(cut.line, 'te:caption');
  const spoken = events.filter((event) => event.type === 'line');
  assert.equal(spoken[0].id, 'momiji-platform/4/1');
  assert.equal(spoken[0].text, 'te:Two minutes. I’ll miss the last bus by two minutes.');
  assert.equal(spoken[0].seconds, voicedSeconds(3000));
  assert.equal(spoken[0].voiced, true);
  assert.deepEqual(
    events.slice(0, 3).map((event) => event.type),
    ['episode', 'scene', 'beat'],
  );
});
