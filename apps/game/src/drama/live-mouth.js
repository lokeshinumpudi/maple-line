import { classifyVowel, followEnvelope, openFromLevel, spectralCentroid } from './mouth-curve.js';

/**
 * Lip sync for live episode voice: the drama <audio> element is routed through an
 * AnalyserNode, and each frame the speaking hero reads the same numbers a voice manifest
 * stores (mouth-curve.js): an RMS envelope with 30 ms attack and 80 ms release, divided by
 * the speaker's loud level, and a vowel class from the spectral centroid against the
 * speaker's usual centroid. A manifest knows both levels from every clip beforehand; here
 * they are running estimates per voice, starting from typical values of the Sarvam voices.
 *
 * Routing a media element through Web Audio sends its sound through the context, so the
 * element is connected only once the context runs. Until then (or without Web Audio) a
 * source is null and the hero keeps the syllable rhythm.
 */
const FFT_SIZE = 1024;
/** Typical 95th-percentile envelope and median centroid of the episode voices. */
const START_PEAK = 0.18;
const START_CENTRE = 1150;
/** The loud level forgets old peaks over a few seconds, never dropping below this. */
const PEAK_FLOOR = 0.04;
const PEAK_MEMORY = 6;
/** Share of the running maximum used as the loud level (a manifest uses the 95th percentile). */
const PEAK_SHARE = 0.85;
const CENTRE_MEMORY = 2;

export function createLiveMouth({
  audio,
  createContext = () =>
    typeof AudioContext === 'function' ? new AudioContext({ latencyHint: 'playback' }) : null,
} = {}) {
  let context = null;
  let analyser = null;
  let failed = false;
  let time = null;
  let frequency = null;
  let magnitudes = null;
  const speakers = new Map();

  /** Connect the element to an analyser once the context runs; true when connected. */
  function wire() {
    if (analyser) {
      if (context.state !== 'running') void context.resume?.()?.catch?.(() => {});
      return true;
    }
    if (failed || !audio) return false;
    try {
      context ??= createContext();
      if (!context) {
        failed = true;
        return false;
      }
      if (context.state !== 'running') {
        // Resuming is asynchronous: this line keeps the syllable rhythm, the next one syncs.
        void context.resume?.()?.catch?.(() => {});
        return false;
      }
      const source = context.createMediaElementSource(audio);
      analyser = context.createAnalyser();
      analyser.fftSize = FFT_SIZE;
      analyser.smoothingTimeConstant = 0;
      source.connect(analyser);
      analyser.connect(context.destination);
      time = new Float32Array(analyser.fftSize);
      frequency = new Float32Array(analyser.frequencyBinCount);
      magnitudes = new Float32Array(analyser.frequencyBinCount);
      return true;
    } catch {
      failed = true;
      return false;
    }
  }

  function measure(voice, dt) {
    let state = speakers.get(voice);
    if (!state) {
      state = { envelope: 0, loud: START_PEAK / PEAK_SHARE, centre: START_CENTRE };
      speakers.set(voice, state);
    }
    analyser.getFloatTimeDomainData(time);
    let sum = 0;
    for (const value of time) sum += value * value;
    const rms = Math.sqrt(sum / time.length);
    analyser.getFloatFrequencyData(frequency);
    for (let i = 0; i < frequency.length; i++)
      magnitudes[i] = Number.isFinite(frequency[i]) ? 10 ** (frequency[i] / 20) : 0;
    const centroid = spectralCentroid(magnitudes, context.sampleRate / analyser.fftSize);
    state.envelope = followEnvelope(state.envelope, rms, dt);
    state.loud = Math.max(
      state.envelope,
      PEAK_FLOOR / PEAK_SHARE,
      state.loud * Math.exp(-dt / PEAK_MEMORY),
    );
    const open = openFromLevel(state.envelope, state.loud * PEAK_SHARE);
    if (open > 0 && centroid > 0)
      state.centre += (centroid - state.centre) * (1 - Math.exp(-dt / CENTRE_MEMORY));
    return { open, vowel: classifyVowel(centroid, state.centre) };
  }

  return {
    wire,
    /**
     * A mouth source for one clip: { sample(dt) } returning { open, vowel }, null while
     * the element is paused, or undefined once `playing()` says the clip is over. Null when
     * the analyser is not connected.
     */
    source(voice, playing) {
      if (!wire()) return null;
      const key = voice ?? 'voice';
      return {
        sample(dt) {
          if (!playing()) return undefined;
          if (audio.paused || !(dt > 0)) return null;
          return measure(key, dt);
        },
      };
    },
    get connected() {
      return Boolean(analyser);
    },
  };
}
