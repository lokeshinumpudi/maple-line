/**
 * The hero-cast face API (blink-l, blink-r, smile, jaw-open) expressed as VRM 1.0 preset
 * expressions. Blender cast models have those four morph targets; a VRM has named presets
 * instead, so this module turns one into the other. While a character talks, the jaw
 * value becomes one of the five vowel visemes per syllable, so the mouth changes shape
 * rather than only opening and closing.
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

/**
 * Every VRM expression value for one frame of the hero-cast face. `morphs` holds the
 * hero-cast values; `syllable` counts syllables while talking.
 */
export function heroFaceToVrm(morphs, syllable = 0) {
  const out = {};
  for (const [morph, [expression, scale]] of Object.entries(MORPH_TO_EXPRESSION))
    out[expression] = clamp01((morphs[morph] ?? 0) * scale);
  Object.assign(out, visemeWeights(morphs['jaw-open'] ?? 0, syllable));
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
  return {
    kind: 'vrm',
    set(name, value) {
      morphs[name] = value;
    },
    setSyllable(value) {
      syllable = value;
    },
    flush() {
      if (!expressionManager) return;
      for (const [name, value] of Object.entries(heroFaceToVrm(morphs, syllable)))
        expressionManager.setValue(name, value);
    },
    names() {
      return expressionManager ? expressionManager.expressions.map((e) => e.expressionName) : [];
    },
  };
}
