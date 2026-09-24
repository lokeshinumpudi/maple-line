/**
 * Mouth curves for lip sync: how open a speaker's mouth is, and roughly which vowel it
 * shapes, 60 times a second, read from the spoken audio.
 *
 *   open   RMS envelope of the clip (attack about 30 ms, release about 80 ms), divided by
 *          the speaker's loud level, gated to 0 in pauses and stored as 0-15.
 *   vowel  spectral balance of each frame: the magnitude centroid between 250 Hz and
 *          4 kHz, compared with the speaker's usual centroid. Rounded vowels (oh, ou) put
 *          their energy low, open ones (aa) in the middle, spread ones (ee, ih) high.
 *
 * `scripts/voice-episode.mjs` stores a curve per clip in the voice manifest; the browser
 * builds the same numbers from an AnalyserNode while a live clip plays (live-mouth.js).
 * Everything here is plain arithmetic so Node and the page share it.
 */

export const MOUTH_RATE = 60;
export const MOUTH_ATTACK = 0.03;
export const MOUTH_RELEASE = 0.08;
/** Quantised open levels: 0 closed to 15 fully open. */
export const MOUTH_LEVELS = 15;
/** Vowel classes from darkest (lowest centroid) to brightest. */
export const VOWEL_ORDER = Object.freeze(['ou', 'oh', 'aa', 'ih', 'ee']);
/** Upper bounds of each class but the last, as log2(centroid / speaker's centre). */
const VOWEL_EDGES = [-0.42, -0.14, 0.16, 0.44];
/** Band the centroid is measured in (Hz): the first two formants and a little above. */
export const CENTROID_BAND = Object.freeze([250, 4000]);
/** Below this share of the speaker's loud level, the mouth is closed. */
export const OPEN_GATE = 0.12;
/** Absolute floor (linear RMS, about -46 dBFS): room tone never opens a mouth. */
export const SILENCE_RMS = 0.005;
const FFT_SIZE = 512;

/** Decode a PCM (16/24/32-bit) or float WAV to mono samples in -1..1. */
export function decodeWav(buffer) {
  const bytes = buffer instanceof ArrayBuffer ? new Uint8Array(buffer) : buffer;
  if (!bytes || bytes.byteLength < 44) throw new Error('not a WAV: too short');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const tag = (at) => String.fromCharCode(...bytes.subarray(at, at + 4));
  if (tag(0) !== 'RIFF' || tag(8) !== 'WAVE') throw new Error('not a WAV: no RIFF/WAVE header');
  let format = null;
  for (let at = 12; at + 8 <= view.byteLength;) {
    const id = tag(at);
    const size = view.getUint32(at + 4, true);
    if (id === 'fmt ') {
      let code = view.getUint16(at + 8, true);
      // WAVE_FORMAT_EXTENSIBLE keeps the real format in its sub-format GUID.
      if (code === 0xfffe && size >= 26) code = view.getUint16(at + 32, true);
      format = {
        code,
        channels: view.getUint16(at + 10, true),
        sampleRate: view.getUint32(at + 12, true),
        bits: view.getUint16(at + 22, true),
      };
    }
    if (id === 'data') {
      if (!format) throw new Error('not a WAV: data before fmt');
      // Streamed WAVs can leave the size unset; take the bytes that follow.
      const available = view.byteLength - (at + 8);
      const length = size > 0 && size <= available ? size : available;
      return { sampleRate: format.sampleRate, samples: pcmToMono(view, at + 8, length, format) };
    }
    at += 8 + size + (size % 2);
  }
  throw new Error('not a WAV: no data chunk');
}

function pcmToMono(view, start, length, { code, channels, bits }) {
  const width = bits / 8;
  const frames = Math.floor(length / (width * channels));
  const out = new Float32Array(frames);
  const read =
    code === 3 && bits === 32
      ? (at) => view.getFloat32(at, true)
      : code === 1 && bits === 16
        ? (at) => view.getInt16(at, true) / 32768
        : code === 1 && bits === 24
          ? (at) =>
              (view.getUint8(at) | (view.getUint8(at + 1) << 8) | (view.getInt8(at + 2) << 16)) /
              8388608
          : code === 1 && bits === 32
            ? (at) => view.getInt32(at, true) / 2147483648
            : null;
  if (!read) throw new Error(`unsupported WAV format ${code}/${bits}-bit`);
  for (let i = 0; i < frames; i++) {
    let sum = 0;
    for (let c = 0; c < channels; c++) sum += read(start + (i * channels + c) * width);
    out[i] = sum / channels;
  }
  return out;
}

/** One step of the attack/release follower: rises with `attack`, falls with `release` (s). */
export function followEnvelope(
  previous,
  value,
  dt,
  { attack = MOUTH_ATTACK, release = MOUTH_RELEASE } = {},
) {
  const tau = value > previous ? attack : release;
  return previous + (value - previous) * (1 - Math.exp(-dt / tau));
}

/** Magnitude-weighted mean frequency of `magnitudes` (bin i is at i × binHz) inside a band. */
export function spectralCentroid(magnitudes, binHz, [low, high] = CENTROID_BAND) {
  let weighted = 0;
  let total = 0;
  const first = Math.max(1, Math.ceil(low / binHz));
  const last = Math.min(magnitudes.length - 1, Math.floor(high / binHz));
  for (let i = first; i <= last; i++) {
    weighted += magnitudes[i] * i * binHz;
    total += magnitudes[i];
  }
  return total > 0 ? weighted / total : 0;
}

/** The vowel class for a frame's centroid relative to the speaker's usual centroid. */
export function classifyVowel(centroid, centre) {
  if (!(centroid > 0) || !(centre > 0)) return 'aa';
  const offset = Math.log2(centroid / centre);
  const index = VOWEL_EDGES.findIndex((edge) => offset < edge);
  return VOWEL_ORDER[index < 0 ? VOWEL_ORDER.length - 1 : index];
}

/** 0..1 opening for an envelope value against the speaker's loud level, closed below the gate. */
export function openFromLevel(envelope, peak) {
  if (!(peak > 0) || envelope < SILENCE_RMS) return 0;
  const share = envelope / peak;
  if (share < OPEN_GATE) return 0;
  // The gate..1 range maps onto 0..1, so a pause closes the mouth before the voice stops.
  return Math.min(1, (share - OPEN_GATE) / (1 - OPEN_GATE));
}

/** In-place radix-2 FFT of real/imaginary arrays whose length is a power of two. */
function fft(re, im) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j], re[i]];
      [im[i], im[j]] = [im[j], im[i]];
    }
  }
  for (let size = 2; size <= n; size <<= 1) {
    const step = (-2 * Math.PI) / size;
    for (let start = 0; start < n; start += size)
      for (let k = 0; k < size / 2; k++) {
        const cos = Math.cos(step * k);
        const sin = Math.sin(step * k);
        const a = start + k;
        const b = a + size / 2;
        const tr = re[b] * cos - im[b] * sin;
        const ti = re[b] * sin + im[b] * cos;
        re[b] = re[a] - tr;
        im[b] = im[a] - ti;
        re[a] += tr;
        im[a] += ti;
      }
  }
}

/**
 * Per-frame RMS, envelope and centroid of a clip at `rate` frames a second. RMS and the
 * spectrum use a window centred on each frame time.
 */
export function analyseClip(samples, sampleRate, { rate = MOUTH_RATE } = {}) {
  const hop = sampleRate / rate;
  const frames = Math.max(1, Math.ceil(samples.length / hop));
  const rms = new Float32Array(frames);
  const envelope = new Float32Array(frames);
  const centroid = new Float32Array(frames);
  const size = Math.min(FFT_SIZE, 1 << Math.floor(Math.log2(Math.max(2, hop * 2))));
  const window = Float32Array.from(
    { length: size },
    (_, i) => 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (size - 1)),
  );
  const re = new Float32Array(size);
  const im = new Float32Array(size);
  const magnitudes = new Float32Array(size / 2);
  let level = 0;
  for (let f = 0; f < frames; f++) {
    const centre = Math.round((f + 0.5) * hop);
    const from = Math.max(0, centre - Math.round(hop));
    const to = Math.min(samples.length, centre + Math.round(hop));
    let sum = 0;
    for (let i = from; i < to; i++) sum += samples[i] * samples[i];
    rms[f] = to > from ? Math.sqrt(sum / (to - from)) : 0;
    level = followEnvelope(level, rms[f], 1 / rate);
    envelope[f] = level;
    const start = centre - size / 2;
    for (let i = 0; i < size; i++) {
      const at = start + i;
      re[i] = at >= 0 && at < samples.length ? samples[at] * window[i] : 0;
      im[i] = 0;
    }
    fft(re, im);
    for (let i = 0; i < size / 2; i++) magnitudes[i] = Math.hypot(re[i], im[i]);
    centroid[f] = spectralCentroid(magnitudes, sampleRate / size);
  }
  return { rate, frames, rms, envelope, centroid };
}

function quantile(values, q) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.round(q * (sorted.length - 1))))];
}

/**
 * One speaker's loud level (95th percentile of the voiced envelope) and usual centroid
 * (median over voiced frames), across all of that speaker's clips.
 */
export function speakerLevels(analyses) {
  const voiced = [];
  const centroids = [];
  let loudest = 0;
  for (const clip of analyses)
    for (const value of clip.envelope) loudest = Math.max(loudest, value);
  for (const clip of analyses)
    clip.envelope.forEach((value, i) => {
      if (value < SILENCE_RMS || value < loudest * 0.1) return;
      voiced.push(value);
      if (clip.centroid[i] > 0) centroids.push(clip.centroid[i]);
    });
  return { peak: quantile(voiced, 0.95) || loudest, centre: quantile(centroids, 0.5) };
}

/** Most common vowel over a window of voiced frames, so single odd frames do not flicker. */
function steadyVowels(raw, open, radius = 3) {
  const out = Array.from({ length: raw.length });
  let last = null;
  for (let i = 0; i < raw.length; i++) {
    if (!open[i]) continue;
    const counts = new Map();
    for (let j = Math.max(0, i - radius); j <= Math.min(raw.length - 1, i + radius); j++)
      if (open[j]) counts.set(raw[j], (counts.get(raw[j]) ?? 0) + 1 + (j === i ? 0.5 : 0));
    out[i] = [...counts].sort((a, b) => b[1] - a[1])[0][0];
    last ??= out[i];
  }
  // Pauses keep the vowel before them (the first voiced one at the start).
  for (let i = 0, held = last ?? 'aa'; i < out.length; i++) {
    if (open[i]) held = out[i];
    else out[i] = held;
  }
  return out;
}

/** The compact manifest curve: { rate, open: [0..15, ...], vowel: 'aaohee…' }. */
export function mouthCurve(analysis, levels) {
  const open = Array.from(analysis.envelope, (value) =>
    Math.round(openFromLevel(value, levels.peak) * MOUTH_LEVELS),
  );
  const raw = Array.from(analysis.centroid, (value) => classifyVowel(value, levels.centre));
  return { rate: analysis.rate, open, vowel: steadyVowels(raw, open).join('') };
}

/** Curves for many clips of many speakers: `clips` are { speaker, samples, sampleRate }. */
export function mouthCurves(clips, { rate = MOUTH_RATE } = {}) {
  const analyses = clips.map((clip) => analyseClip(clip.samples, clip.sampleRate, { rate }));
  const bySpeaker = new Map();
  clips.forEach((clip, i) => {
    const list = bySpeaker.get(clip.speaker) ?? [];
    list.push(analyses[i]);
    bySpeaker.set(clip.speaker, list);
  });
  const levels = new Map([...bySpeaker].map(([speaker, list]) => [speaker, speakerLevels(list)]));
  return clips.map((clip, i) => mouthCurve(analyses[i], levels.get(clip.speaker)));
}

/** Length of a curve in seconds. */
export const curveSeconds = (curve) => (curve?.open?.length ?? 0) / (curve?.rate || MOUTH_RATE);

/** Opening (0..1) and vowel at `t` seconds into a curve, or null outside it. */
export function sampleMouthCurve(curve, t) {
  if (!curve?.open?.length || !(t >= 0)) return null;
  const position = t * (curve.rate || MOUTH_RATE);
  const index = Math.floor(position);
  if (index >= curve.open.length) return null;
  const next = Math.min(curve.open.length - 1, index + 1);
  const fraction = position - index;
  const open = (curve.open[index] * (1 - fraction) + curve.open[next] * fraction) / MOUTH_LEVELS;
  const vowel = curve.vowel?.slice(index * 2, index * 2 + 2);
  return { open, vowel: VOWEL_ORDER.includes(vowel) ? vowel : 'aa' };
}
