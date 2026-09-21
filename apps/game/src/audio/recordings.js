export const RECORDINGS = Object.freeze({
  birds: './audio/forest.mp3',
  river: './audio/river.mp3',
  rain: './audio/rain.mp3',
  people: './audio/people.mp3',
  forest: './audio/forest-wind.mp3',
  roofRain: './audio/roof-rain.mp3',
  insects: './audio/summer-cicadas.mp3',
});

// Keep material and gain choices beside the assets; roof impacts belong inside the carriage.
export const RECORDING_OPTIONS = Object.freeze({
  birds: { gain: 0.22 },
  people: { frequency: 1600 },
  forest: { gain: 5, frequency: 6500 },
  roofRain: { gain: 1.4, frequency: 7000, train: true },
  insects: { gain: 5, frequency: 8500 },
});

// Decoders may retain a few padding samples. Overlap the ends in PCM, once, before looping.
export function blendLoop(context, buffer, seconds = 0.65) {
  const fade = Math.min(Math.floor(seconds * buffer.sampleRate), Math.floor(buffer.length / 4));
  const length = buffer.length - fade;
  const result = context.createBuffer(buffer.numberOfChannels, length, buffer.sampleRate);
  for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
    const input = buffer.getChannelData(channel),
      output = result.getChannelData(channel);
    output.set(input.subarray(fade));
    for (let i = 0; i < fade; i++) {
      const t = i / Math.max(1, fade - 1);
      output[length - fade + i] =
        input[length + i] * Math.cos((t * Math.PI) / 2) + input[i] * Math.sin((t * Math.PI) / 2);
    }
  }
  return result;
}
