import { soundMix, railJointCrossings, electricTrainTones } from './sound-model.js';
import { RECORDINGS, RECORDING_OPTIONS, blendLoop } from './recordings.js';
export { soundMix } from './sound-model.js';
const clamp = (value, max = 1) => Math.max(0, Math.min(max, value));

/** Recorded ambience and procedural train audio, created only after a user enables sound. */
export function createSoundscape(context) {
  const master = context.createGain();
  master.gain.value = 0;
  const tone = context.createBiquadFilter();
  tone.type = 'lowpass';
  tone.frequency.value = 12000;
  const compressor = context.createDynamicsCompressor();
  compressor.threshold.value = -18;
  compressor.knee.value = 16;
  compressor.ratio.value = 4;
  compressor.attack.value = 0.006;
  compressor.release.value = 0.25;
  tone.connect(master).connect(compressor).connect(context.destination);
  const environment = context.createBiquadFilter();
  environment.type = 'lowpass';
  environment.frequency.value = 12000;
  environment.connect(tone);
  const trainBus = context.createGain();
  trainBus.connect(tone);
  const echo = context.createConvolver();
  const impulse = context.createBuffer(2, Math.floor(context.sampleRate * 1.8), context.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const data = impulse.getChannelData(ch);
    let low = 0;
    for (let i = 0; i < data.length; i++) {
      low = low * 0.65 + (Math.random() * 2 - 1) * 0.35;
      data[i] =
        low * Math.exp((-i / context.sampleRate) * 4.5) * (i < context.sampleRate * 0.025 ? 0 : 1);
    }
  }
  echo.buffer = impulse;
  const echoGain = context.createGain();
  echoGain.gain.value = 0;
  trainBus.connect(echo).connect(echoGain).connect(tone);
  const abort = new AbortController();
  const recordings = {};
  let loading = null;
  const sources = new Set();
  const transients = new Set();
  const railVoices = new Map();
  const layers = {};
  let disposed = false;
  let current = soundMix();
  let nextBird = 0,
    nextVoice = 0,
    nextDrop = 0,
    nextStep = 0,
    nextWiper = 0;
  let previousSpeed = 0,
    previousBrake = 0,
    previousEmergency = false,
    previousDistance = null,
    previousAudioTime = null,
    previousDirection = null,
    previousDoors = null,
    wasActive = false;

  const noiseBuffer = context.createBuffer(1, context.sampleRate * 6, context.sampleRate);
  const samples = noiseBuffer.getChannelData(0);
  for (let i = 0; i < samples.length; i++) samples[i] = Math.random() * 2 - 1;
  function sourceLoop(
    name,
    {
      type = 'noise',
      frequency = 500,
      filter = 'lowpass',
      q = 0.7,
      pan = 0,
      rate = 0.15,
      buffer,
      train = false,
    } = {},
  ) {
    const source = type === 'noise' ? context.createBufferSource() : context.createOscillator();
    if (type === 'noise') {
      source.buffer = buffer ?? noiseBuffer;
      source.loop = true;
    } else {
      source.type = type;
      source.frequency.value = frequency;
    }
    const band = context.createBiquadFilter();
    band.type = filter;
    band.frequency.value = frequency;
    band.Q.value = q;
    const gain = context.createGain();
    gain.gain.value = 0;
    const panner = context.createStereoPanner();
    panner.pan.value = pan;
    const movement = context.createGain();
    movement.gain.value = 0.82;
    const lfo = context.createOscillator();
    lfo.frequency.value = rate;
    const depth = context.createGain();
    depth.gain.value = 0.18;
    lfo.connect(depth).connect(movement.gain);
    source
      .connect(band)
      .connect(movement)
      .connect(gain)
      .connect(panner)
      .connect(train ? trainBus : environment);
    source.start(
      context.currentTime,
      ...(type === 'noise' ? [Math.random() * Math.max(0.01, source.buffer.duration - 0.1)] : []),
    );
    lfo.start();
    sources.add(source);
    sources.add(lfo);
    layers[name] = { source, band, gain, panner, movement, depth, train };
  }
  sourceLoop('motor', { type: 'sine', frequency: 900, rate: 0.7, train: true });
  sourceLoop('traction', { type: 'triangle', frequency: 1400, rate: 0.9, train: true });
  sourceLoop('airRush', { frequency: 900, filter: 'bandpass', q: 0.6, rate: 0.23, train: true });
  sourceLoop('rumble', { frequency: 180, filter: 'lowpass', rate: 0.73, train: true });
  sourceLoop('rolling', { frequency: 600, filter: 'bandpass', rate: 2.3, train: true });
  sourceLoop('brake', { frequency: 2300, filter: 'bandpass', q: 4, rate: 7, train: true });
  sourceLoop('wind', { frequency: 330, rate: 0.09, pan: -0.25 });
  sourceLoop('forest', { frequency: 1800, filter: 'bandpass', rate: 0.21, pan: 0.35 });
  sourceLoop('river', { frequency: 1100, filter: 'lowpass', rate: 0.37, pan: -0.5 });
  sourceLoop('rain', { frequency: 3800, filter: 'highpass', rate: 0.43 });
  sourceLoop('snow', { frequency: 480, filter: 'lowpass', rate: 0.12, pan: 0.2 });
  sourceLoop('tunnel', { frequency: 160, filter: 'bandpass', q: 2, rate: 1.2, train: true });
  sourceLoop('roofRain', { frequency: 1200, filter: 'bandpass', q: 0.7, rate: 1.4, train: true });
  sourceLoop('insects', { type: 'sine', frequency: 4600, filter: 'bandpass', q: 1, rate: 32 });

  function event({
    frequency = 400,
    endFrequency = frequency,
    gain = 0.02,
    duration = 0.15,
    delay = 0,
    type = 'sine',
    pan = 0,
    filterFrequency = 1200,
    q = 1,
    train = false,
    rail = false,
  }) {
    if (disposed || transients.size >= 48) return;
    const start = context.currentTime + delay;
    const source = type === 'noise' ? context.createBufferSource() : context.createOscillator();
    if (type === 'noise') source.buffer = noiseBuffer;
    else {
      source.type = type;
      source.frequency.setValueAtTime(frequency, start);
      source.frequency.exponentialRampToValueAtTime(Math.max(20, endFrequency), start + duration);
    }
    const band = context.createBiquadFilter();
    band.type = 'bandpass';
    band.frequency.value = filterFrequency;
    band.Q.value = q;
    const envelope = context.createGain();
    envelope.gain.setValueAtTime(0, start);
    envelope.gain.linearRampToValueAtTime(gain, start + Math.min(0.025, duration * 0.15));
    envelope.gain.exponentialRampToValueAtTime(0.00001, start + duration);
    const panner = context.createStereoPanner();
    panner.pan.value = pan;
    source
      .connect(band)
      .connect(envelope)
      .connect(panner)
      .connect(train ? trainBus : environment);
    transients.add(source);
    if (rail) railVoices.set(source, start);
    source.onended = () => {
      source.disconnect();
      band.disconnect();
      envelope.disconnect();
      panner.disconnect();
      transients.delete(source);
      railVoices.delete(source);
    };
    source.start(start, ...(type === 'noise' ? [Math.random() * 4] : []));
    source.stop(start + duration + 0.01);
  }
  const targets = new WeakMap();
  const smooth = (param, value, time = 0.3) => {
    if (targets.get(param) === value) return;
    targets.set(param, value);
    param.setTargetAtTime(value, context.currentTime, time);
  };
  return {
    loadRecordings(fetcher = globalThis.fetch) {
      if (disposed) return Promise.resolve();
      if (loading) return loading;
      loading = Promise.allSettled(
        Object.entries(RECORDINGS).map(async ([name, url]) => {
          if (recordings[name] === 'ready') return;
          recordings[name] = 'loading';
          try {
            const response = await fetcher(url, {
              signal: AbortSignal.any([abort.signal, AbortSignal.timeout(10000)]),
            });
            if (!response.ok) throw new Error('Audio file unavailable');
            const decoded = await context.decodeAudioData(await response.arrayBuffer());
            if (disposed) return;
            const buffer = blendLoop(context, decoded);
            sourceLoop(`recorded-${name}`, {
              buffer,
              frequency: 12000,
              rate: 0.07,
              ...RECORDING_OPTIONS[name],
            });
            recordings[name] = 'ready';
          } catch {
            if (!disposed) recordings[name] = 'fallback';
          }
        }),
      ).finally(() => {
        loading = null;
      });
      return loading;
    },
    update(input) {
      if (disposed) return;
      if (input.ambientOnly) input = { ...input, speed: 0, power: 0, brake: 0 };
      current = soundMix(input);
      if (input.ambientOnly)
        for (const key of ['motor', 'traction', 'rumble', 'rolling', 'brake', 'tunnel', 'roofRain'])
          current[key] = 0;
      if (targets.get(master.gain) !== current.master) {
        targets.set(master.gain, current.master);
        master.gain.cancelAndHoldAtTime(context.currentTime);
        if (current.master === 0)
          master.gain.linearRampToValueAtTime(0, context.currentTime + 0.18);
        else
          master.gain.setTargetAtTime(
            current.master,
            context.currentTime,
            input.narrationPlaying ? 0.12 : 0.7,
          );
      }
      smooth(tone.frequency, current.cutoff, 0.5);
      smooth(environment.frequency, current.environmentCutoff, 0.5);
      smooth(echoGain.gain, current.reverb, 0.3);
      for (const [name, layer] of Object.entries(layers)) {
        const recorded = name.startsWith('recorded-');
        const key = recorded ? name.slice(9) : name;
        let level = current[key];
        if (recorded) level *= RECORDING_OPTIONS[key]?.gain ?? 1;
        if (!recorded && recordings[key] === 'ready') level *= 0.08;
        smooth(layer.gain.gain, level, 0.6);
        const pan = layer.train
          ? (input.trainPan ?? 0)
          : key === 'river'
            ? (input.riverPan ?? -0.4)
            : key === 'people'
              ? (input.peoplePan ?? 0.2)
              : null;
        if (pan !== null) smooth(layer.panner.pan, clamp(pan + 1, 2) - 1);
      }
      const tones = electricTrainTones(input.speed, input.power);
      smooth(layers.motor.source.frequency, tones.motorHz, 0.15);
      smooth(layers.traction.source.frequency, tones.inverterHz, 0.15);
      smooth(layers.traction.band.frequency, 2200, 0.15);
      smooth(layers.airRush.band.frequency, tones.airHz, 0.3);
      smooth(layers.brake.band.frequency, 1450 + Math.abs(input.speed ?? 0) * 40, 0.25);
      smooth(layers.rolling.band.frequency, tones.rollingHz);
      smooth(layers.river.panner.pan, clamp((input.riverPan ?? -0.5) + 1, 2) - 1);
      const now = context.currentTime;
      const active = current.master > 0;
      if (!active) {
        if (wasActive) for (const source of transients) source.stop(context.currentTime + 0.18);
        previousDistance = null;
        previousAudioTime = null;
        previousDirection = null;
        previousSpeed = 0;
        previousBrake = input.brake ?? 0;
        previousEmergency = Boolean(input.emergency);
        previousDoors = input.doorsOpen;
        wasActive = false;
        return;
      }
      // Start sparse events afresh after mute/pause. Never replay a backlog.
      if (!wasActive) {
        nextBird = now + 1;
        nextVoice = now + 0.5;
        nextStep = now + 0.4;
        nextDrop = now;
        nextWiper = now + 0.4;
      }
      wasActive = true;
      const speed = Math.abs(input.speed ?? 0);
      const interval = previousAudioTime === null ? 0 : now - previousAudioTime;
      const direction = input.direction ?? 1;
      const discontinuity =
        interval > 0.12 ||
        interval <= 0 ||
        !Number.isFinite(previousDistance) ||
        !Number.isFinite(input.distance) ||
        Math.abs(input.distance - previousDistance) > 6 ||
        (previousDirection !== null && direction !== previousDirection);
      if (
        discontinuity ||
        speed <= 0.2 ||
        input.ambientOnly ||
        Math.abs((input.brake ?? 0) - previousBrake) > 0.2
      ) {
        for (const [source, start] of railVoices) {
          if (start > now) {
            source.stop(now);
            railVoices.delete(source);
          }
        }
      }
      if (speed > 0.2 && !input.ambientOnly && !discontinuity) {
        for (const joint of railJointCrossings(previousDistance, input.distance, input.direction)) {
          const strength = current.train * joint.strength * (0.4 + Math.min(1, speed / 12));
          const pan = clamp((input.trainPan ?? 0) + (joint.car - 1) * 0.06 + 1, 2) - 1;
          // Present the measured interval one update late, retaining axle offsets on audio time.
          // A stalled frame is discarded above; it must not become a catch-up burst.
          const delay = joint.fraction * interval;
          event({
            type: 'noise',
            filterFrequency: 850,
            gain: strength * 0.09,
            duration: 0.055,
            pan,
            train: true,
            rail: true,
            delay,
          });
          event({
            frequency: input.onBridge ? 150 : 100,
            endFrequency: 52,
            filterFrequency: 140,
            gain: strength * 0.045,
            duration: input.onBridge ? 0.24 : 0.11,
            pan,
            train: true,
            rail: true,
            delay,
          });
        }
      }
      previousDistance = input.distance;
      previousAudioTime = now;
      previousDirection = direction;
      if (
        !input.ambientOnly &&
        ((previousSpeed > 0.3 && speed <= 0.3 && input.brake > 0.15) ||
          (previousBrake > 0.25 && input.brake < 0.05) ||
          (input.emergency && !previousEmergency))
      ) {
        event({
          type: 'noise',
          filterFrequency: 1800,
          duration: input.emergency ? 1.1 : 0.55,
          gain: current.train * 0.07,
          train: true,
        });
      }
      previousSpeed = speed;
      previousBrake = input.brake ?? 0;
      previousEmergency = Boolean(input.emergency);
      if (now >= nextWiper) {
        nextWiper = now + (input.weather === 'rain' ? 0.57 : 0.98);
        if (input.wipersOn && (input.view === 'cab' || input.inTunnel) && !input.ambientOnly)
          event({ type: 'noise', filterFrequency: 900, duration: 0.2, gain: 0.026, train: true });
      }
      if (previousDoors !== null && previousDoors !== input.doorsOpen) {
        event({
          type: 'noise',
          gain: 0.08 * current.train,
          duration: 0.75,
          filterFrequency: 1600,
          train: true,
        });
        if (!input.doorsOpen)
          for (const delay of [0, 0.25])
            event({
              frequency: 880,
              gain: 0.025 * current.train,
              duration: 0.18,
              delay,
              filterFrequency: 1000,
              train: true,
            });
      }
      previousDoors = input.doorsOpen;
      if (now >= nextBird) {
        nextBird = now + 3 + Math.random() * 5;
        if (current.birds > 0.1 && recordings.birds !== 'ready') {
          const pitch = 2300 + Math.random() * 1200,
            pan = Math.random() * 1.6 - 0.8;
          for (let i = 0; i < 3; i++)
            event({
              frequency: pitch,
              endFrequency: pitch * (i === 1 ? 1.3 : 0.78),
              gain: 0.021 * current.birds,
              duration: 0.13,
              delay: i * 0.19,
              filterFrequency: 3000,
              pan,
            });
        }
      }
      if (now >= nextVoice) {
        nextVoice = now + 0.65 + Math.random() * 1.6;
        if (current.people > 0.001 && recordings.people !== 'ready') {
          const pitch = 120 + Math.random() * 95,
            pan = Math.random() * 1.4 - 0.7;
          // Quiet overlapping syllables suggest a distant crowd, with no spoken words.
          for (let i = 0; i < 5; i++)
            event({
              type: 'noise',
              frequency: pitch,
              endFrequency: pitch * (0.85 + Math.random() * 0.3),
              filterFrequency: 450 + Math.random() * 650,
              gain: current.people * 0.6,
              duration: 0.13 + Math.random() * 0.16,
              delay: i * 0.18,
              pan,
            });
        }
      }
      if (now >= nextStep) {
        nextStep = now + 0.42 + Math.random() * 0.25;
        if (current.footsteps > 0.003 && Math.abs(input.speed) < 2)
          event({
            type: 'noise',
            filterFrequency: input.weather === 'snow' ? 1600 : 420,
            duration: input.weather === 'snow' ? 0.18 : 0.08,
            gain: current.footsteps,
            pan: 0.4,
          });
      }
      if (now >= nextDrop) {
        nextDrop = now + 0.09 + Math.random() * 0.22;
        if (current.rain > 0)
          event({
            type: 'noise',
            filterFrequency: 1800 + Math.random() * 2800,
            duration: 0.025 + Math.random() * 0.05,
            gain: current.rain * 0.3,
            pan: Math.random() * 2 - 1,
          });
      }
    },
    controlNotch() {
      if (disposed || current.master === 0) return;
      event({
        type: 'noise',
        filterFrequency: 850,
        q: 0.7,
        gain: 0.035,
        duration: 0.045,
        train: true,
      });
    },
    horn() {
      if (disposed || current.master === 0 || current.motor === 0) return;
      for (const frequency of [370, 465])
        event({
          type: 'triangle',
          frequency,
          endFrequency: frequency * 0.985,
          filterFrequency: 1400,
          gain: current.train * 0.065,
          duration: 0.85,
          train: true,
        });
    },
    state() {
      return {
        context: context.state,
        mix: { ...current },
        loops: sources.size / 2,
        recordings: { ...recordings },
        transients: transients.size,
        scheduledRailVoices: railVoices.size,
        recordedBytes: Object.entries(layers).reduce(
          (total, [name, layer]) =>
            total +
            (name.startsWith('recorded-')
              ? layer.source.buffer.length * layer.source.buffer.numberOfChannels * 4
              : 0),
          0,
        ),
      };
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      abort.abort();
      for (const source of [...sources, ...transients]) {
        source.stop();
        source.disconnect();
      }
      for (const layer of Object.values(layers)) {
        layer.gain.disconnect();
        layer.band.disconnect();
        layer.panner.disconnect();
        layer.movement.disconnect();
        layer.depth.disconnect();
      }
      environment.disconnect();
      trainBus.disconnect();
      echo.disconnect();
      echoGain.disconnect();
      tone.disconnect();
      master.disconnect();
      compressor.disconnect();
    },
  };
}
