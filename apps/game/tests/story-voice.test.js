import test from 'node:test';
import assert from 'node:assert/strict';
import { campaign } from '../src/narrative/story-data.js';
import {
  STORY_VOICE_DIRECTIONS,
  scoreStoryBeat,
  upcomingStoryVoice,
} from '../src/narrative/story-voice.js';
import { VOICE_CAST, VOICE_DELIVERY } from '@maple-line/voice-score';

test('every authored quotation has a character, and scoring preserves all story words', () => {
  for (const beat of campaign.beats) {
    const direction = STORY_VOICE_DIRECTIONS[beat.id];
    assert.ok(direction, beat.id);
    for (const [id, lines, cast] of [
      [null, beat.lines, direction.quotes],
      ...beat.choices.map((choice) => [choice.id, choice.response, direction.choices?.[choice.id]]),
    ]) {
      const quotes = lines.flatMap((line) => [...line.matchAll(/“([^”]+)”/gu)]);
      assert.equal(quotes.length, cast?.length, `${beat.id}/${id}: every quote must be cast`);
      const cues = scoreStoryBeat(beat, id);
      const words = (value) => value.match(/[\p{L}\p{N}]+/gu);
      assert.deepEqual(words(cues.map((cue) => cue.text).join(' ')), words(lines.join(' ')));
      for (const cue of cues) {
        assert.ok(Object.hasOwn(VOICE_CAST, cue.character));
        assert.ok(Object.hasOwn(VOICE_DELIVERY, cue.emotion));
        assert.ok(cue.text.length <= 1600);
        assert.ok(cue.pauseAfterMs >= 0 && cue.pauseAfterMs <= 10000);
      }
    }
  }
});

test('two characters in one paragraph get separate turns and scene delivery', () => {
  const beat = campaign.beats.find((beat) => beat.id === 'hoshimi-emi-plan');
  const cues = scoreStoryBeat(beat);
  assert.equal(cues.find((cue) => cue.text === 'Grandma could').character, 'haru');
  assert.equal(cues.find((cue) => cue.text === 'The Saturday class is mine,').character, 'emi');
  assert.equal(cues[0].emotion, 'vulnerable');
});

test('lookahead covers branches and travel, but a dormant story generates nothing', () => {
  const beat = campaign.beats[0];
  assert.deepEqual(upcomingStoryVoice({ enabled: false, nextBeat: beat }), []);
  const upcoming = upcomingStoryVoice({ enabled: true, nextBeat: beat });
  assert.ok(upcoming.length > scoreStoryBeat(beat).length);
  for (const choice of beat.choices)
    for (const cue of scoreStoryBeat(beat, choice.id))
      assert.ok(
        upcoming.some((item) => item.text === cue.text && item.character === cue.character),
      );
});

test('Emi keeps first-person narration through replies and Haru keeps his quoted dialogue', () => {
  const beat = campaign.beats.find((item) => item.id === 'akane-notebook');
  const cues = scoreStoryBeat(beat, 'notebook-revise');
  assert.equal(cues[0].character, 'emi');
  assert.equal(
    cues.find((cue) => cue.text === 'Leave my endorsement at the top,').character,
    'haru',
  );
  assert.equal(cues.find((cue) => cue.text === 'Grandpa says.').character, 'emi');
  const broadcast = campaign.beats.find((item) => item.id === 'harumi-broadcast');
  const response = scoreStoryBeat(broadcast, 'broadcast-voices');
  assert.equal(response[0].character, 'haru');
  assert.equal(response.at(-1).character, 'emi');
});

test('resolved callback lines retain their text and scene narrator in playback and lookahead', () => {
  for (const beat of campaign.beats.filter((item) => item.callbacks?.length)) {
    for (const callback of beat.callbacks) {
      const displayLines = [...beat.lines, ...callback.lines];
      const resolved = { ...beat, displayLines };
      const cues = scoreStoryBeat(resolved, undefined, displayLines);
      const appended = cues.filter((cue) => cue.lineIndex >= beat.lines.length);
      assert.deepEqual(
        appended.map((cue) => cue.text),
        callback.lines,
      );
      assert.ok(
        appended.every(
          (cue) => cue.character === (STORY_VOICE_DIRECTIONS[beat.id].narrator ?? 'haru'),
        ),
      );
      const upcoming = upcomingStoryVoice({ enabled: true, activeBeat: resolved });
      for (const cue of appended)
        assert.ok(
          upcoming.some((item) => item.text === cue.text && item.character === cue.character),
        );
    }
  }
});

test('Jun has a named voice and every irrigation conversation uses it', () => {
  const beat = campaign.beats.find((item) => item.id === 'sakuragawa-water');
  assert.equal(VOICE_CAST.jun.name, 'Jun');
  for (const id of [undefined, ...beat.choices.map((choice) => choice.id)]) {
    assert.ok(scoreStoryBeat(beat, id).some((cue) => cue.character === 'jun'));
  }
});

test('travel prefetch includes only callbacks selected by previous choices', () => {
  const beat = campaign.beats.find((item) => item.callbacks?.length);
  const callback = beat.callbacks[0];
  const state = {
    enabled: true,
    nextBeat: beat,
    choices: { [callback.beatId]: callback.choiceId },
  };
  const predicted = upcomingStoryVoice(state);
  for (const line of callback.lines) assert.ok(predicted.some((cue) => cue.text === line));
  const unchosen = upcomingStoryVoice({ ...state, choices: {} });
  for (const line of callback.lines) assert.ok(!unchosen.some((cue) => cue.text === line));
});

test('each character has a distinct provider voice', () => {
  const voices = Object.values(VOICE_CAST).map((character) => character.speaker);
  assert.equal(new Set(voices).size, voices.length);
});
