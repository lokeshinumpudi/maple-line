const clamp = (value, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, value));
export const CROSSING_BELL = Object.freeze({
  rate: 2.2, // strikes per second, alternating "kan" and "kan"
  lookAhead: 0.25,
  audibleMetres: 400,
  referenceMetres: 15,
  // Inharmonic bell partials: frequency ratio, relative gain, decay seconds.
  partials: Object.freeze([
    [1, 1, 0.35],
    [2.76, 0.42, 0.2],
    [5.4, 0.2, 0.11],
    [8.93, 0.09, 0.06],
  ]),
  strikes: Object.freeze([780, 735]),
});

/** Loudness for a bell `distance` metres from the listener; silent beyond ~400 m. */
export function bellLevel(distance, volume = 1) {
  if (!Number.isFinite(distance)) return 0;
  const { referenceMetres, audibleMetres } = CROSSING_BELL;
  const d = Math.max(referenceMetres, distance);
  const fall = (referenceMetres / d) ** 1.15;
  const edge = clamp((audibleMetres - distance) / (audibleMetres * 0.25));
  return clamp(volume) * 0.16 * fall * edge * edge;
}

/** Strike times in [from, to) on a fixed audio-clock grid, so look-ahead never duplicates. */
export function bellStrikeTimes(next, until, rate = CROSSING_BELL.rate) {
  const times = [];
  for (let time = next; time < until; time += 1 / rate) times.push(time);
  return times;
}

/** Procedural Japanese level-crossing bell. No recordings; strikes run on the audio clock. */
export function createCrossingBell(context, destination = context.destination) {
  const output = context.createGain();
  output.gain.value = 0;
  const panner = context.createStereoPanner();
  const tone = context.createBiquadFilter();
  tone.type = 'lowpass';
  tone.frequency.value = 9000;
  output.connect(tone).connect(panner).connect(destination);
  const voices = new Set();
  let nextStrike = null,
    strikeIndex = 0,
    ringing = false,
    level = 0,
    disposed = false;
  const targets = new WeakMap();
  const smooth = (param, value, time) => {
    if (targets.get(param) === value) return;
    targets.set(param, value);
    param.setTargetAtTime(value, context.currentTime, time);
  };
  function strike(time, fundamental) {
    if (voices.size >= 40) return;
    for (const [ratio, gain, decay] of CROSSING_BELL.partials) {
      const oscillator = context.createOscillator();
      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(fundamental * ratio, time);
      const envelope = context.createGain();
      envelope.gain.setValueAtTime(0, time);
      envelope.gain.linearRampToValueAtTime(gain, time + 0.003);
      envelope.gain.exponentialRampToValueAtTime(0.0001, time + decay * 3);
      oscillator.connect(envelope).connect(output);
      voices.add(oscillator);
      oscillator.onended = () => {
        oscillator.disconnect();
        envelope.disconnect();
        voices.delete(oscillator);
      };
      oscillator.start(time);
      oscillator.stop(time + decay * 3 + 0.02);
    }
  }
  return {
    update({
      ringing: ring = false,
      distance = Infinity,
      pan = 0,
      volume = 1,
      active = true,
    } = {}) {
      if (disposed) return;
      const now = context.currentTime;
      level = active && ring ? bellLevel(distance, volume) : 0;
      ringing = level > 0;
      smooth(output.gain, level, ringing ? 0.05 : 0.12);
      smooth(panner.pan, clamp(Number.isFinite(pan) ? pan : 0, -1, 1), 0.08);
      smooth(tone.frequency, 9000 - clamp(distance / CROSSING_BELL.audibleMetres) * 6000, 0.2);
      if (!ringing) {
        nextStrike = null;
        return;
      }
      // Restart on the next tick after silence or a stalled frame; never replay a backlog.
      if (nextStrike === null || nextStrike < now - 0.05) nextStrike = now + 0.02;
      const times = bellStrikeTimes(nextStrike, now + CROSSING_BELL.lookAhead);
      for (const time of times) {
        strike(time, CROSSING_BELL.strikes[strikeIndex % 2]);
        strikeIndex++;
      }
      if (times.length) nextStrike = times[times.length - 1] + 1 / CROSSING_BELL.rate;
    },
    state() {
      return { ringing, level, voices: voices.size, nextStrike };
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const voice of voices) {
        voice.onended = null;
        try {
          voice.stop();
        } catch {
          // Already stopped.
        }
        voice.disconnect();
      }
      voices.clear();
      output.disconnect();
      tone.disconnect();
      panner.disconnect();
    },
  };
}
