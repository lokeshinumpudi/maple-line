/**
 * The hero-cast face API (blink-l, blink-r, smile, jaw-open) expressed as VRM 1.0 preset
 * expressions. Blender cast models have those four morph targets; a VRM has named presets
 * instead, so this module turns one into the other. While a character talks, the jaw
 * value becomes one of the five vowel visemes per syllable, so the mouth changes shape
 * rather than only opening and closing. A line with a mouth curve from its audio
 * (drama/mouth-curve.js) sets the visemes directly through createMouthDriver instead.
 */

export const VISEMES = Object.freeze(['aa', 'ih', 'ou', 'ee', 'oh']);

/** How far each vowel opens relative to the jaw (aa is the widest). */
const VISEME_GAIN = Object.freeze({ aa: 1, oh: 0.9, ou: 0.8, ee: 0.75, ih: 0.65 });

/** hero-cast morph name -> [VRM expression, weight scale]. */
export const MORPH_TO_EXPRESSION = Object.freeze({
  'blink-l': ['blinkLeft', 1],
  'blink-r': ['blinkRight', 1],
  // A cheerful mood (0.7) reads as a warm smile; a full `happy` closes the eyes into arcs.
  smile: ['happy', 0.85],
});

/**
 * Which vowel a syllable uses. Deterministic per syllable so a replayed line moves the
 * same way; a syllable that would repeat its predecessor's vowel moves to the next one.
 */
export function syllableVowel(syllable) {
  const n = Math.abs(Math.floor(syllable));
  const pick = vowelHash(n);
  return VISEMES[n > 0 && pick === vowelHash(n - 1) ? (pick + 1) % VISEMES.length : pick];
}

function vowelHash(n) {
  return (Math.imul(n ^ 0x9e3779b1, 0x85ebca6b) >>> 13) % VISEMES.length;
}

/** Viseme weights for a jaw opening (0..1) on a given syllable. */
export function visemeWeights(jaw, syllable) {
  const weights = { aa: 0, ih: 0, ou: 0, ee: 0, oh: 0 };
  if (!(jaw > 0)) return weights;
  const vowel = syllableVowel(syllable);
  weights[vowel] = Math.min(1, jaw * VISEME_GAIN[vowel] * 1.4);
  return weights;
}

/** Seconds a new vowel must last before the mouth changes to it (unless nearly closed). */
export const VOWEL_HOLD = 0.05;
/** Open-level smoothing (s): opening a touch slower than the audio envelope, closing faster. */
export const MOUTH_SMOOTHING = Object.freeze({ attack: 0.04, release: 0.06, blend: 0.05 });
/** Below this opening the mouth is closed: a pause is a pause, not a quiver. */
const MOUTH_CLOSED = 0.05;

/**
 * Turns an audio mouth sample ({ open 0..1, vowel } or null for silence) into smoothed
 * viseme weights each frame. The opening follows with attack/release smoothing; the vowel
 * changes only once a new one has held for VOWEL_HOLD, or while the mouth is nearly shut,
 * and the shapes cross-fade, so a vowel class that flips frame to frame does not chatter.
 */
export function createMouthDriver({ hold = VOWEL_HOLD, smoothing = MOUTH_SMOOTHING } = {}) {
  const weights = { aa: 0, ih: 0, ou: 0, ee: 0, oh: 0 };
  let open = 0;
  let vowel = 'aa';
  let candidate = null;
  let candidateFor = 0;
  return {
    update(dt, sample) {
      if (!(dt > 0)) return { ...weights };
      const target = sample && sample.open >= MOUTH_CLOSED ? Math.min(1, sample.open) : 0;
      const wanted = sample?.vowel && VISEMES.includes(sample.vowel) ? sample.vowel : vowel;
      if (wanted === vowel) candidate = null;
      else if (open < MOUTH_CLOSED * 2) {
        vowel = wanted;
        candidate = null;
      } else {
        candidateFor = candidate === wanted ? candidateFor + dt : dt;
        candidate = wanted;
        if (candidateFor >= hold - 1e-9) {
          vowel = wanted;
          candidate = null;
        }
      }
      const tau = target > open ? smoothing.attack : smoothing.release;
      open += (target - open) * (1 - Math.exp(-dt / tau));
      if (target === 0 && open < 0.01) open = 0;
      const blend = 1 - Math.exp(-dt / smoothing.blend);
      for (const name of VISEMES) {
        const goal = name === vowel ? Math.min(1, open * VISEME_GAIN[name] * 1.3) : 0;
        weights[name] += (goal - weights[name]) * (name === vowel ? 1 : blend);
        if (weights[name] < 0.002) weights[name] = 0;
      }
      return { ...weights };
    },
    reset() {
      open = 0;
      candidate = null;
      for (const name of VISEMES) weights[name] = 0;
    },
    get open() {
      return open;
    },
    get vowel() {
      return vowel;
    },
  };
}

/**
 * Every VRM expression value for one frame of the hero-cast face. `morphs` holds the
 * hero-cast values; `syllable` counts syllables while talking. `visemes`, when given,
 * are the mouth shapes from an audio curve and replace the syllable rhythm.
 */
export function heroFaceToVrm(morphs, syllable = 0, visemes = null) {
  const out = {};
  for (const [morph, [expression, scale]] of Object.entries(MORPH_TO_EXPRESSION))
    out[expression] = clamp01((morphs[morph] ?? 0) * scale);
  if (visemes) for (const name of VISEMES) out[name] = clamp01(visemes[name] ?? 0);
  else Object.assign(out, visemeWeights(morphs['jaw-open'] ?? 0, syllable));
  return out;
}

function clamp01(value) {
  return Math.min(1, Math.max(0, value));
}

/**
 * A face adapter with the same `set(name, value)` call hero-cast uses for morph targets.
 * `flush()` writes the frame to the VRM expression manager (vrm.update applies it).
 */
export function createVrmFace(expressionManager) {
  const morphs = {};
  let syllable = 0;
  let visemes = null;
  return {
    kind: 'vrm',
    set(name, value) {
      morphs[name] = value;
    },
    setSyllable(value) {
      syllable = value;
    },
    /** Mouth shapes from an audio curve ({ aa, ih, ou, ee, oh }), or null for the jaw rhythm. */
    setVisemes(value) {
      visemes = value;
    },
    flush() {
      if (!expressionManager) return;
      for (const [name, value] of Object.entries(heroFaceToVrm(morphs, syllable, visemes)))
        expressionManager.setValue(name, value);
    },
    names() {
      return expressionManager ? expressionManager.expressions.map((e) => e.expressionName) : [];
    },
  };
}
