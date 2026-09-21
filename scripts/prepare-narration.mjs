import { campaign } from '../apps/game/src/narrative/story-data.js';
import { scoreStoryBeat, STORY_VOICE_DIRECTIONS } from '../apps/game/src/narrative/story-voice.js';
import { wildlifeBroadcast } from '../apps/game/src/narrative/wildlife-encounters.js';

const args = process.argv.slice(2);
const option = (name) =>
  args
    .find((value) => value.startsWith(`--${name}=`))
    ?.split('=')
    .slice(1)
    .join('=');
const language = option('language') ?? 'en-IN';
const beatId = option('beat');
const beats = campaign.beats.filter((beat) => !beatId || beat.id === beatId);
if (!beats.length) throw new Error('Unknown story beat.');
// Reject stale casting before making any paid request.
for (const beat of beats) {
  const direction = STORY_VOICE_DIRECTIONS[beat.id];
  const scenes = [
    [beat.id, beat.lines, direction?.quotes],
    ...beat.choices.map((choice) => [choice.id, choice.response, direction?.choices?.[choice.id]]),
  ];
  for (const [id, lines, cast] of scenes) {
    const count = lines.reduce((sum, line) => sum + [...line.matchAll(/“([^”]+)”/gu)].length, 0);
    if (count !== cast?.length)
      throw new Error(`Update voice casting for ${id} before preparing audio.`);
  }
}
const unique = new Map();
for (const beat of beats) {
  const cues = [
    scoreStoryBeat(beat),
    ...beat.choices.map((choice) => scoreStoryBeat(beat, choice.id)),
    ...(beat.callbacks ?? []).map((callback) =>
      scoreStoryBeat(beat, null, [...beat.lines, ...callback.lines]),
    ),
  ].flat();
  if (beat.id === wildlifeBroadcast.beatId)
    cues.push(...scoreStoryBeat(beat, null, [wildlifeBroadcast.line]));
  for (const { text, character, emotion } of cues) {
    const cue = { text, language, character, emotion, priority: 'prefetch' };
    unique.set(JSON.stringify(cue), cue);
  }
}
const cues = [...unique.values()];
console.log(
  `${cues.length} voice clips; ${cues.reduce((sum, cue) => sum + cue.text.length, 0)} source characters; ${language}.`,
);
if (!args.includes('--list')) {
  const status = await fetch('http://127.0.0.1:4175/api/director/narration/status').then(
    (response) => response.json(),
  );
  if (!status.revision) throw new Error('Restart the director to load the character voice engine.');
  if (!status.languages.some((item) => item.code === language))
    throw new Error('Unsupported narration language.');
  let completed = 0;
  for (const cue of cues) {
    let response;
    for (let attempt = 0; attempt < 5; attempt++) {
      response = await fetch('http://127.0.0.1:4175/api/director/narration', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(cue),
        signal: AbortSignal.timeout(65000),
      });
      if (response.status !== 429 || attempt === 4) break;
      await response.arrayBuffer();
      const waitMs = 2000 * 2 ** attempt;
      console.log(`Rate limited at clip ${completed + 1}; retrying in ${waitMs / 1000}s.`);
      await new Promise((resolve) => setTimeout(resolve, waitMs));
    }
    if (!response.ok) {
      const detail = await response.json();
      throw new Error(`Stopped at clip ${completed + 1}: ${detail.error}`);
    }
    await response.arrayBuffer();
    completed++;
    if (completed % 10 === 0 || completed === cues.length)
      console.log(`Prepared ${completed}/${cues.length}`);
  }
  console.log('Audio is stored in the local narration cache. Re-running reuses matching clips.');
}
