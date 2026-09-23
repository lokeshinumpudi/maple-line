import { beatSeconds, episodeSeconds } from './episode-schema.js';
import { DRAMA_PROPS } from './drama-props.js';

/**
 * Screenplay text generated from episode data, so the readable script and the
 * programmed episode cannot disagree. Output is Markdown.
 */
const SHOT_WORDS = {
  trackside: 'TRACKSIDE',
  telephoto: 'LONG LENS',
  drone: 'DRONE',
  helicopter: 'AERIAL ORBIT',
  chase: 'CHASE',
  wheels: 'LOW, AT THE WHEELS',
  cab: 'CAB',
  window: 'CARRIAGE WINDOW',
  platform: 'PLATFORM',
  'bridge-low': 'BELOW THE BRIDGE',
  establishing: 'ESTABLISHING',
  portrait: 'CLOSE',
  orbit: 'ORBIT',
  insert: 'INSERT',
};

function shotLine(beat, episode, scene) {
  const subject = beat.shot.subject;
  const who =
    subject?.cast !== undefined
      ? ` ON ${episode.cast[subject.cast]?.name.toUpperCase() ?? subject.cast}`
      : subject?.crossing
        ? ' ON THE CROSSING'
        : subject?.prop
          ? ` ON: ${(DRAMA_PROPS[subject.prop] ?? subject.prop).toUpperCase()}`
          : '';
  const lens = beat.shot.lens ? `, ${beat.shot.lens} mm` : '';
  const cast = subject?.cast !== undefined ? ` (${scene.actors[subject.cast]})` : '';
  return `**${SHOT_WORDS[beat.shot.type] ?? beat.shot.type.toUpperCase()}${who}**${lens}${cast}`;
}

function cueText(cue, episode) {
  if (cue.doors) return `Doors ${cue.doors}.`;
  if (cue.weather) return `Weather turns to ${cue.weather}.`;
  if (cue.event) return `World event: ${cue.event}.`;
  if (cue.release) return 'The train is released and departs.';
  if (cue.bus)
    return {
      wait: 'The bus waits: headlights on, doors open.',
      leave: 'The bus shuts its doors and pulls away.',
      arrive: 'The bus pulls in to the stop.',
    }[cue.bus.state];
  if (cue.move) {
    const name = episode.cast[cue.move.cast]?.name ?? cue.move.cast;
    return `${name} ${cue.move.pace === 'run' ? 'runs' : 'walks'} to ${cue.move.to}.`;
  }
  if (cue.direct) {
    const name = episode.cast[cue.direct.cast]?.name ?? cue.direct.cast;
    const parts = [cue.direct.mood, cue.direct.intent].filter(Boolean).join(', ');
    return `${name}: ${parts}.`;
  }
  return '';
}

export function episodeScreenplay(episode) {
  const out = [];
  const label = [episode.series, episode.number ? `Episode ${episode.number}` : null]
    .filter(Boolean)
    .join(' · ');
  out.push(`## ${label ? `${label}: ` : ''}${episode.title}`, '');
  if (episode.logline) out.push(`_${episode.logline}_`, '');
  out.push(
    `Episode id \`${episode.id}\` · about ${Math.round(episodeSeconds(episode) / 10) * 10} seconds before waits for the train.`,
    '',
  );
  for (const scene of episode.scenes) {
    out.push(`### ${scene.heading}`, '');
    const setting = [];
    if (scene.set?.location)
      setting.push(
        `train placed ${scene.set.offset ? `${Math.abs(scene.set.offset)} m ${scene.set.offset < 0 ? 'before' : 'after'} ` : 'at '}${scene.set.location}`,
      );
    if (scene.set?.speedKmh !== undefined) setting.push(`moving at ${scene.set.speedKmh} km/h`);
    if (scene.stopAt) setting.push(`stops at ${scene.stopAt}`);
    if (scene.holdAt) setting.push(`held at the ${scene.holdAt} crossing`);
    if (scene.set?.clock) setting.push(`clocks at ${scene.set.clock}`);
    if (scene.set?.timeOfDay) setting.push(scene.set.timeOfDay);
    if (scene.set?.weather) setting.push(scene.set.weather);
    if (setting.length) out.push(`_Setting: ${setting.join(', ')}._`, '');
    const marks = Object.entries(scene.marks ?? {}).map(
      ([cast, mark]) => `${episode.cast[cast]?.name ?? cast} at ${mark}`,
    );
    if (marks.length) out.push(`_Staged: ${marks.join(', ')}._`, '');
    for (const beat of scene.beats) {
      out.push(`${shotLine(beat, episode, scene)} · ${beatSeconds(beat).toFixed(0)} s`, '');
      if (beat.caption || beat.subtitle)
        out.push(`> ${[beat.caption, beat.subtitle].filter(Boolean).join(' · ')}`, '');
      const cues = beat.cues.map((cue) => cueText(cue, episode)).filter(Boolean);
      if (cues.length) out.push(`_${cues.join(' ')}_`, '');
      if (beat.line) out.push(beat.line, '');
      for (const [code, text] of Object.entries(beat.lineTranslations ?? {}))
        out.push(`> _${code}:_ ${text}`, '');
      for (const line of beat.dialogue) {
        const name = (line.speaker ?? episode.cast[line.cast]?.name ?? line.cast).toUpperCase();
        const notes = [line.phone ? 'on the phone' : null, line.emotion ?? null].filter(Boolean);
        out.push(`**${name}**${notes.length ? ` (${notes.join(', ')})` : ''}: ${line.text}`, '');
        for (const [code, text] of Object.entries(line.translations ?? {}))
          out.push(`> _${code}:_ ${text}`, '');
      }
      if (beat.waitFor)
        out.push(
          `_Holds until the train is ${beat.waitFor === 'stopped' ? 'stopped' : 'closed up'}._`,
          '',
        );
    }
  }
  if (episode.endCard)
    out.push(`> ${[episode.endCard.title, episode.endCard.line].filter(Boolean).join(' — ')}`, '');
  for (const [code, text] of Object.entries(episode.endCard?.lineTranslations ?? {}))
    out.push(`> _${code}:_ ${text}`, '');
  return out.join('\n');
}

export function seriesScreenplay(series, normalize = (episode) => episode) {
  const episodes = series.episodes.map(normalize);
  const cast = episodes[0]?.cast ?? {};
  return [
    `# ${series.title}${series.japanese ? ` (${series.japanese})` : ''}`,
    '',
    series.logline,
    '',
    '## Cast',
    '',
    ...Object.values(cast).map(
      (member) => `- **${member.name}**${member.note ? `: ${member.note}` : ''}`,
    ),
    '',
    ...episodes.map(episodeScreenplay),
    ...(series.review?.length
      ? [
          '## Translations to check',
          '',
          'These hand-written Telugu lines should be read by a native speaker before a video is shared:',
          '',
          ...series.review.map((item) => `- ${item}`),
          '',
        ]
      : []),
  ].join('\n');
}
