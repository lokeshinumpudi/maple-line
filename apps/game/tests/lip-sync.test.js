import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MOUTH_LEVELS,
  MOUTH_RATE,
  VOWEL_ORDER,
  analyseClip,
  classifyVowel,
  curveSeconds,
  decodeWav,
  followEnvelope,
  mouthCurve,
  mouthCurves,
  openFromLevel,
  sampleMouthCurve,
  speakerLevels,
} from '../src/drama/mouth-curve.js';
import { createMouthDriver, heroFaceToVrm, VISEMES } from '../src/characters/vrm-expressions.js';
import { createLiveMouth } from '../src/drama/live-mouth.js';
import { createEpisodeRunner } from '../src/drama/episode-runner.js';
import { normalizeEpisode } from '../src/drama/episode-schema.js';
import { createManifestVoice } from '../src/drama/voice-manifest.js';
import { FIXED_ROLES, STAGED_CAST } from '../src/drama/drama-roles.js';
import { MOMIJI_CAST } from '../src/world/hero-cast.js';
import { THE_1742 } from '../src/drama/series/the-1742.js';
import { additionalStops } from '../src/world/extended-route.js';
import { LEVEL_CROSSINGS } from '../src/world/level-crossings.js';

const RATE = 24000;
const context = {
  stops: ['momiji', ...additionalStops.map((stop) => stop.id)],
  crossings: LEVEL_CROSSINGS.map((site) => site.id),
};

/** A 16-bit mono PCM WAV of the given samples. */
function wavOf(samples, sampleRate = RATE) {
  const buffer = Buffer.alloc(44 + samples.length * 2);
  buffer.write('RIFF');
  buffer.writeUInt32LE(36 + samples.length * 2, 4);
  buffer.write('WAVEfmt ', 8);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * 2, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write('data', 36);
  buffer.writeUInt32LE(samples.length * 2, 40);
  samples.forEach((value, i) =>
    buffer.writeInt16LE(Math.round(Math.max(-1, Math.min(1, value)) * 32767), 44 + i * 2),
  );
  return buffer;
}

/**
 * A voiced vowel: harmonics of 140 Hz shaped by two formant resonances, so its spectral
 * balance sits where a real vowel's does.
 */
function vowel(seconds, [f1, f2], amplitude = 0.4) {
  const out = new Float32Array(Math.round(seconds * RATE));
  const partials = [];
  for (let f = 140; f < 5000; f += 140) {
    const gain =
      Math.exp(-(((f - f1) / 120) ** 2)) + 0.7 * Math.exp(-(((f - f2) / 180) ** 2)) + 0.01;
    partials.push([f, gain]);
  }
  const norm = partials.reduce((sum, [, gain]) => sum + gain, 0);
  for (let i = 0; i < out.length; i++) {
    let value = 0;
    for (const [f, gain] of partials) value += gain * Math.sin((2 * Math.PI * f * i) / RATE);
    out[i] = (amplitude * value) / norm;
  }
  return out;
}
const silence = (seconds) => new Float32Array(Math.round(seconds * RATE));
const join = (...parts) => {
  const out = new Float32Array(parts.reduce((sum, part) => sum + part.length, 0));
  let at = 0;
  for (const part of parts) {
    out.set(part, at);
    at += part.length;
  }
  return out;
};
const frameAt = (seconds) => Math.round(seconds * MOUTH_RATE);

test('a PCM WAV decodes to mono samples at its own rate', () => {
  const samples = Float32Array.from({ length: 480 }, (_, i) => Math.sin(i / 10) * 0.5);
  const decoded = decodeWav(wavOf(samples));
  assert.equal(decoded.sampleRate, RATE);
  assert.equal(decoded.samples.length, 480);
  assert.ok(Math.abs(decoded.samples[37] - samples[37]) < 1e-4);
  assert.throws(() => decodeWav(Buffer.from('not a wav at all, clearly not one of those')));
});

test('the envelope attacks in about 30 ms and releases in about 80 ms', () => {
  // Step response of the follower at 60 frames a second: 63 % after one time constant.
  let rising = 0;
  let t = 0;
  while (rising < 1 - Math.exp(-1)) {
    rising = followEnvelope(rising, 1, 1 / 600);
    t += 1 / 600;
  }
  assert.ok(Math.abs(t - 0.03) < 0.003, `attack ${t}`);
  let falling = 1;
  t = 0;
  while (falling > Math.exp(-1)) {
    falling = followEnvelope(falling, 0, 1 / 600);
    t += 1 / 600;
  }
  assert.ok(Math.abs(t - 0.08) < 0.003, `release ${t}`);
});

test('the mouth opens on a loud syllable and is closed in pauses', () => {
  // 0.3 s silence, a loud 0.4 s vowel, 0.3 s pause, a quieter 0.3 s vowel, 0.3 s silence.
  const samples = join(
    silence(0.3),
    vowel(0.4, [750, 1200], 0.5),
    silence(0.3),
    vowel(0.3, [750, 1200], 0.25),
    silence(0.3),
  );
  const [curve] = mouthCurves([{ speaker: 'meera', samples, sampleRate: RATE }]);
  assert.equal(curve.rate, 60);
  assert.equal(curve.open.length, Math.ceil(samples.length / 400));
  assert.equal(curve.vowel.length, curve.open.length * 2);
  assert.ok(curve.open.every((value) => Number.isInteger(value) && value >= 0 && value <= 15));
  // Closed before the voice, open within about 50 ms of it, and wide at its loudest.
  assert.ok(curve.open.slice(0, frameAt(0.28)).every((value) => value === 0));
  assert.ok(curve.open[frameAt(0.35)] >= 8);
  const loud = Math.max(...curve.open.slice(frameAt(0.3), frameAt(0.7)));
  assert.equal(loud, MOUTH_LEVELS);
  // Closed again within a quarter second of the pause starting, for the rest of the pause.
  assert.ok(curve.open.slice(frameAt(0.95), frameAt(1.0)).every((value) => value === 0));
  // The quieter syllable opens less than the loud one, but it opens.
  const quiet = Math.max(...curve.open.slice(frameAt(1.0), frameAt(1.3)));
  assert.ok(quiet > 3 && quiet < loud, `quiet ${quiet}`);
  assert.equal(curve.open.at(-1), 0);
  // Sampling follows the frames and interpolates between them; past the end is null.
  const at = sampleMouthCurve(curve, 0.5);
  assert.ok(at.open > 0.5 && at.open <= 1);
  assert.equal(at.vowel, 'aa');
  assert.equal(sampleMouthCurve(curve, curveSeconds(curve) + 0.01), null);
  assert.equal(sampleMouthCurve(curve, -1), null);
});

test('openings are normalised per speaker, so a soft voice opens as wide as a loud one', () => {
  const [soft, loud] = mouthCurves([
    {
      speaker: 'ammamma',
      samples: join(vowel(0.4, [750, 1200], 0.08), silence(0.2)),
      sampleRate: RATE,
    },
    {
      speaker: 'divya',
      samples: join(vowel(0.4, [750, 1200], 0.6), silence(0.2)),
      sampleRate: RATE,
    },
  ]);
  assert.equal(Math.max(...soft.open), MOUTH_LEVELS);
  assert.equal(Math.max(...loud.open), MOUTH_LEVELS);
  // Room tone never opens a mouth, however it is normalised.
  assert.equal(openFromLevel(0.004, 0.004), 0);
  assert.equal(openFromLevel(0.1, 0.1), 1);
  assert.equal(openFromLevel(0.01, 0.1), 0);
});

test('spectral balance sorts vowels: rounded low, open in the middle, spread high', () => {
  const shapes = { u: [300, 800], a: [750, 1200], i: [300, 2400] };
  const analyses = Object.fromEntries(
    Object.entries(shapes).map(([name, formants]) => [
      name,
      analyseClip(vowel(0.5, formants), RATE),
    ]),
  );
  const middle = (analysis) => analysis.centroid[frameAt(0.25)];
  assert.ok(middle(analyses.u) < middle(analyses.a));
  assert.ok(middle(analyses.a) < middle(analyses.i));
  const levels = speakerLevels(Object.values(analyses));
  const vowelOf = (name) => mouthCurve(analyses[name], levels).vowel.slice(30, 32);
  assert.ok(['ou', 'oh'].includes(vowelOf('u')), vowelOf('u'));
  assert.equal(vowelOf('a'), 'aa');
  assert.ok(['ee', 'ih'].includes(vowelOf('i')), vowelOf('i'));
  // The classes run in order of centroid relative to the speaker's centre.
  const ladder = [0.5, 0.8, 1, 1.25, 1.8].map((ratio) => classifyVowel(ratio * 1000, 1000));
  assert.deepEqual(ladder, VOWEL_ORDER);
  assert.equal(classifyVowel(0, 1000), 'aa');
});

test('the mouth driver smooths a noisy, flipping curve without chatter', () => {
  const driver = createMouthDriver();
  const dt = 1 / 60;
  let seed = 7;
  const noise = () => ((seed = (seed * 16807) % 2147483647) / 2147483647 - 0.5) * 0.16;
  const frames = [];
  let switches = 0;
  let last = null;
  for (let i = 0; i < 90; i++) {
    // The vowel class flips every frame between two neighbours; the level jitters ±0.08.
    const weights = driver.update(dt, { open: 0.7 + noise(), vowel: i % 2 ? 'oh' : 'aa' });
    frames.push(weights);
    if (i > 6 && last !== null && driver.vowel !== last) switches++;
    last = driver.vowel;
  }
  assert.equal(switches, 0, 'a vowel that lasts one frame never takes the mouth');
  const settled = frames.slice(20);
  const total = (weights) => VISEMES.reduce((sum, name) => sum + weights[name], 0);
  let largestStep = 0;
  let turns = 0;
  for (let i = 1; i < settled.length; i++) {
    largestStep = Math.max(largestStep, Math.abs(total(settled[i]) - total(settled[i - 1])));
    if (i > 1) {
      const a = total(settled[i - 1]) - total(settled[i - 2]);
      const b = total(settled[i]) - total(settled[i - 1]);
      if (a * b < 0 && Math.abs(b) > 0.03) turns++;
    }
  }
  // Frame-to-frame jitter of 0.16 in the input becomes small steps in the mouth.
  assert.ok(largestStep < 0.08, `largest step ${largestStep}`);
  assert.ok(turns < 6, `visible reversals ${turns}`);
  // One vowel at a time once settled: the other shapes have faded out.
  const shown = settled.at(-1);
  assert.equal(VISEMES.filter((name) => shown[name] > 0.05).length, 1);
});

test('the mouth driver changes vowel when a new one holds, and closes on silence', () => {
  const driver = createMouthDriver();
  const dt = 1 / 60;
  for (let i = 0; i < 20; i++) driver.update(dt, { open: 0.8, vowel: 'aa' });
  assert.equal(driver.vowel, 'aa');
  let weights;
  for (let i = 0; i < 6; i++) weights = driver.update(dt, { open: 0.8, vowel: 'ee' });
  assert.equal(driver.vowel, 'ee');
  for (let i = 0; i < 10; i++) weights = driver.update(dt, { open: 0.8, vowel: 'ee' });
  assert.ok(weights.ee > 0.6 && weights.aa < 0.05, JSON.stringify(weights));
  // Silence (null) and levels under the closed threshold both shut the mouth: nearly
  // closed within a quarter second, fully closed by half a second.
  const hush = (frames) => {
    for (let i = 0; i < frames; i++)
      weights = driver.update(dt, i % 2 ? null : { open: 0.03, vowel: 'oh' });
  };
  hush(15);
  assert.ok(
    Object.values(weights).every((value) => value < 0.02),
    JSON.stringify(weights),
  );
  hush(15);
  assert.deepEqual(Object.values(weights), [0, 0, 0, 0, 0]);
  // The VRM face uses these weights instead of the syllable rhythm.
  const face = heroFaceToVrm({ 'jaw-open': 1 }, 3, { aa: 0, ih: 0, ou: 0.4, ee: 0, oh: 0 });
  assert.equal(face.ou, 0.4);
  assert.equal(face.aa + face.ih + face.ee + face.oh, 0);
});

test('a live analyser gives the same kind of samples and ends with its clip', () => {
  let playing = true;
  const audio = { paused: false };
  const analyser = {
    fftSize: 0,
    frequencyBinCount: 512,
    connect() {},
    getFloatTimeDomainData(out) {
      out.fill(0);
      for (let i = 0; i < out.length; i++) out[i] = Math.sin(i / 3) * 0.3;
    },
    getFloatFrequencyData(out) {
      out.fill(-Infinity);
      out[20] = -10; // about 940 Hz at 48 kHz / 1024
    },
  };
  const contextImpl = {
    state: 'running',
    sampleRate: 48000,
    destination: {},
    createMediaElementSource: () => ({ connect() {} }),
    createAnalyser: () => analyser,
  };
  const live = createLiveMouth({ audio, createContext: () => contextImpl });
  const source = live.source('meera', () => playing);
  assert.ok(live.connected);
  let sample = null;
  for (let i = 0; i < 20; i++) sample = source.sample(1 / 60);
  assert.ok(sample.open > 0.5, JSON.stringify(sample));
  assert.ok(VOWEL_ORDER.includes(sample.vowel));
  audio.paused = true;
  assert.equal(source.sample(1 / 60), null);
  playing = false;
  assert.equal(source.sample(1 / 60), undefined);
  // A context that has not started leaves the element alone: no source, syllable fallback.
  const idle = createLiveMouth({
    audio: {},
    createContext: () => ({ state: 'suspended', resume: async () => {} }),
  });
  assert.equal(
    idle.source('meera', () => true),
    null,
  );
  assert.equal(idle.connected, false);
});

test('a manifest line hands its mouth curve to the speaker; phone voices move no face', () => {
  const clean = normalizeEpisode(THE_1742.episodes[1], context);
  const curve = { rate: 60, open: [0, 8, 15, 8, 0], vowel: 'aaaaohohaa' };
  const lines = [];
  clean.scenes[0].beats.forEach((beat, b) =>
    beat.dialogue.forEach((line, l) =>
      lines.push({
        line: `${clean.scenes[0].id}/${b + 1}/${l + 1}`,
        durationMs: 1200,
        text: line.text,
        mouth: curve,
      }),
    ),
  );
  const voice = createManifestVoice({ lines, captions: {} });
  const said = [];
  const host = {
    setScene() {},
    setStop() {},
    cut() {},
    say: (line) => said.push(line),
    card() {},
    direct() {},
    event() {},
    weather() {},
    doors: () => true,
    isStopped: () => true,
    doorsClosed: () => true,
    resolve: (s) => (s.cast ? { person: s.entity } : null),
    mark() {},
    voice,
  };
  const runner = createEpisodeRunner(host, context);
  runner.play(THE_1742.episodes[1]);
  for (let t = 0; t < 40; t += 0.1) runner.update(0.1);
  const phone = said.filter((line) => line.phone);
  assert.ok(phone.length >= 3);
  assert.ok(phone.every((line) => line.entity === null));
  const meera = said.filter((line) => line.speaker === 'Meera');
  assert.ok(meera.length >= 3);
  assert.ok(meera.every((line) => line.entity === 'commuter-2' && line.mouth === curve));
});

test('every on-screen speaker in the 17:42 maps to the hero model that plays them', () => {
  const heroes = new Set([...MOMIJI_CAST, ...STAGED_CAST].map((member) => member.personId));
  const expected = {
    ...Object.fromEntries(Object.entries(FIXED_ROLES).map(([cast, role]) => [cast, role.entity])),
    ishida: 'reader-1',
  };
  const seen = new Set();
  for (const raw of THE_1742.episodes) {
    const clean = normalizeEpisode(raw, context);
    for (const scene of clean.scenes)
      for (const beat of scene.beats)
        for (const line of beat.dialogue) {
          if (line.cast === 'narrator') continue;
          const entity = scene.actors?.[line.cast] ?? null;
          if (line.phone) {
            // A voice on the phone is not someone in the scene.
            assert.equal(entity, null, `${scene.id}: ${line.cast} on the phone`);
            continue;
          }
          assert.equal(entity, expected[line.cast], `${scene.id}: ${line.cast}`);
          assert.ok(heroes.has(entity), `${entity} has a hero model`);
          seen.add(line.cast);
        }
  }
  assert.deepEqual([...seen].sort(), ['ammamma', 'arjun', 'divya', 'ishida', 'meera']);
});
