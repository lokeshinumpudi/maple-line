import { VOICE_DELIVERY } from '@maple-line/voice-score';

// Each list assigns the quoted turns in reading order. Prose keeps its own narrator.
// Keep this authored: adjacent quotations can belong to different people.
export const STORY_VOICE_DIRECTIONS = {
  'the-recorder': {
    emotion: 'warm',
    quotes: ['emi', 'haru'],
    choices: { 'recorder-history': ['haru', 'emi'], 'recorder-listen': ['emi', 'emi'] },
  },
  'the-spanner': { emotion: 'playful', quotes: ['emi', 'haru'] },
  'momiji-bread': {
    emotion: 'natural',
    quotes: ['nao', 'haru', 'nao', 'nao'],
    choices: { 'bread-mother': ['nao', 'nao'], 'bread-today': ['nao'] },
  },
  'sakuragawa-water': {
    emotion: 'natural',
    quotes: ['jun', 'jun'],
    choices: { 'paddy-joke': ['jun'], 'paddy-work': ['jun', 'jun'] },
  },
  'kawasemi-lunch': { emotion: 'reflective', quotes: ['emi'] },
  'aonuma-fumi': {
    emotion: 'vulnerable',
    quotes: ['fumi', 'fumi', 'haru', 'fumi', 'fumi'],
    choices: { 'fumi-truth': ['haru', 'fumi'], 'fumi-account': ['fumi', 'fumi'] },
  },
  'bridge-silence': {
    emotion: 'reassuring',
    quotes: ['emi'],
    choices: { 'bridge-explain': ['haru', 'emi', 'emi'], 'bridge-listen': ['emi'] },
  },
  'hinoki-furniture': { emotion: 'reflective', quotes: ['emi'] },
  'kiri-missed-recital': {
    emotion: 'vulnerable',
    quotes: ['emi', 'emi'],
    choices: { 'recital-own': ['haru', 'emi'], 'recital-ask': ['emi', 'emi'] },
  },
  'tunnel-light': { emotion: 'reflective', narrator: 'emi', quotes: ['haru'] },
  'yukihara-scaffolding': {
    emotion: 'natural',
    quotes: ['mika', 'mika', 'mika'],
    choices: { 'cafe-old-days': ['haru', 'mika'], 'cafe-next-summer': ['mika'] },
  },
  'hoshimi-emi-plan': {
    emotion: 'vulnerable',
    quotes: ['emi', 'emi', 'haru', 'emi', 'emi'],
    choices: { 'emi-apology': ['haru', 'emi'], 'emi-curiosity': ['emi'] },
  },
  'shirakaba-call': { emotion: 'vulnerable', quotes: ['keiko', 'keiko', 'keiko'] },
  'akane-notebook': {
    emotion: 'reflective',
    narrator: 'emi',
    quotes: ['nao', 'nao', 'nao'],
    choices: { 'notebook-revise': ['haru', 'haru'], 'notebook-new-page': ['emi', 'emi'] },
  },
  'tanada-hands': { emotion: 'natural', quotes: [] },
  'minato-message': {
    emotion: 'reflective',
    quotes: [],
    choices: { 'son-message': ['son', 'son'], 'son-in-person': ['son', 'son'] },
  },
  'harumi-broadcast': {
    emotion: 'reflective',
    narrator: 'emi',
    quotes: [],
    choices: { 'broadcast-voices': ['haru'], 'broadcast-wheels': ['emi'] },
  },
  'the-return-ticket': {
    emotion: 'warm',
    quotes: ['haru', 'haru'],
    choices: { 'ending-together': ['emi', 'emi'], 'ending-her-trip': ['emi', 'emi', 'haru'] },
  },
};

/** Produce independent, cacheable voice cues without altering the displayed prose. */
export function scoreStoryBeat(beat, choiceId = beat?.selectedChoice, displayLines) {
  if (!beat) return [];
  const direction = STORY_VOICE_DIRECTIONS[beat.id] ?? { emotion: 'natural', quotes: [] };
  const choice = beat.choices?.find((item) => item.id === choiceId);
  const lines = displayLines ?? (choice ? choice.response : beat.lines) ?? [];
  const casting = choice ? (direction.choices?.[choice.id] ?? []) : direction.quotes;
  // Responses and resolved callback lines retain the scene's first-person narrator.
  const narrativeVoice = direction.narrator ?? 'haru';
  let quoteIndex = 0;
  const cues = [];
  lines.forEach((line, lineIndex) => {
    let offset = 0;
    const append = (text, character, quoted) => {
      text = text.trim();
      if (!/[\p{L}\p{N}]/u.test(text)) return;
      const emotion =
        quoted && character === 'emi' && text.endsWith('?') ? 'curious' : direction.emotion;
      cues.push({ text, character, emotion, lineIndex, quoted, pauseAfterMs: quoted ? 180 : 120 });
    };
    for (const match of line.matchAll(/“([^”]+)”/gu)) {
      append(line.slice(offset, match.index), narrativeVoice, false);
      append(match[1], casting[quoteIndex++] ?? narrativeVoice, true);
      offset = match.index + match[0].length;
    }
    append(line.slice(offset), narrativeVoice, false);
    if (cues.length) cues.at(-1).pauseAfterMs = VOICE_DELIVERY[direction.emotion].pauseMs;
  });
  // An authored pause lets the bridge ambience carry the scene.
  if (choiceId === 'bridge-listen' && cues.length > 1) cues[0].pauseAfterMs = 8000;
  return cues;
}

/** Prepare the current scene and its possible replies, or the approaching scene while travelling. */
export function upcomingStoryVoice(state) {
  if (!state.enabled) return [];
  const beat = state.activeBeat ?? state.nextBeat;
  if (!beat) return [];
  const displayLines = beat.displayLines ?? [
    ...beat.lines,
    ...(beat.callbacks ?? [])
      .filter((callback) => state.choices?.[callback.beatId] === callback.choiceId)
      .flatMap((callback) => callback.lines),
  ];
  const current = scoreStoryBeat(beat, beat.selectedChoice, displayLines);
  const alternatives = beat.selectedChoice
    ? []
    : (beat.choices ?? []).flatMap((choice) => scoreStoryBeat(beat, choice.id));
  return [...current, ...alternatives];
}
