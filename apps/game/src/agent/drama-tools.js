import { normalizeEpisode, episodeSeconds, EPISODE_LIMITS } from '../drama/episode-schema.js';
import { episodeScreenplay } from '../drama/screenplay.js';
import { SHOT_TYPES } from '../camera/director.js';
import { MOODS, INTENTS, MIND_EVENTS } from '../simulation/npc-minds.js';

/**
 * Narrative tools: agents write episodes as data, check them, read them back as a
 * screenplay, keep them in a browser-local library, and play them in the running
 * game. No tool here edits code, campaign dialogue or story saves.
 */
export const EPISODE_LIBRARY_KEY = 'maple-line:episodes:v1';
const LIBRARY_LIMIT = 24;
const EPISODE_CHARS = 65536;
const object = (properties = {}, required = []) => ({
  type: 'object',
  properties,
  required,
  additionalProperties: false,
});
const idSchema = { type: 'string', pattern: '^[a-z0-9-]{1,40}$' };
// Episode bodies are validated by normalizeEpisode, which reports the exact failing path.
const episodeSchema = {
  description:
    'Episode data: { id, series?, number?, title, logline?, cast: { id: { name, note? } }, scenes: [{ id, heading, set?, stopAt?, actors?, beats: [{ shot, caption?, subtitle?, line?, dialogue?, hold?, waitFor?, cues? }] }], endCard? }. Call get_drama_catalog for every allowed value.',
};

export function createEpisodeLibrary(storage) {
  const read = () => {
    try {
      const raw = storage?.getItem(EPISODE_LIBRARY_KEY);
      const parsed = raw ? JSON.parse(raw) : null;
      return parsed?.version === 1 && Array.isArray(parsed.episodes) ? parsed.episodes : [];
    } catch {
      return [];
    }
  };
  const write = (episodes) => {
    storage?.setItem(EPISODE_LIBRARY_KEY, JSON.stringify({ version: 1, episodes }));
  };
  return {
    list: read,
    save(episode) {
      const text = JSON.stringify(episode);
      if (text.length > EPISODE_CHARS) throw new TypeError('Episode is larger than 64 KB.');
      const episodes = read().filter((item) => item.id !== episode.id);
      if (episodes.length >= LIBRARY_LIMIT)
        throw new TypeError(`The library holds ${LIBRARY_LIMIT} episodes; remove one first.`);
      episodes.push(episode);
      write(episodes);
      return episodes.length;
    },
    remove(id) {
      const episodes = read();
      const next = episodes.filter((item) => item.id !== id);
      write(next);
      return episodes.length !== next.length;
    },
  };
}

export function registerDramaTools({ tool, runner, series, library, catalog, activate }) {
  const context = () => ({
    stops: catalog().stops.map((stop) => stop.id),
    crossings: catalog().crossings.map((c) => c.id),
  });
  const normalize = (episode) => normalizeEpisode(episode, context());
  const find = (id) => {
    for (const set of series)
      for (const episode of set.episodes) if (episode.id === id) return episode;
    for (const saved of library.list()) {
      if (saved.id !== id) continue;
      try {
        return normalize(saved);
      } catch {
        return null;
      }
    }
    return null;
  };
  const summary = (episode) => {
    const clean = normalize(episode);
    return {
      id: clean.id,
      series: clean.series ?? null,
      number: clean.number ?? null,
      title: clean.title,
      logline: clean.logline ?? null,
      scenes: clean.scenes.length,
      plannedSeconds: Math.round(episodeSeconds(clean)),
    };
  };
  tool(
    'get_drama_catalog',
    'Everything an episode author may use: stops and places, level crossings, characters currently in the world with their role and nearest stop, shot types, moods, intents, world events, times of day, weather, limits, and the episode format. Read-only. Character ids are casting options; regional residents exist only while their station area is loaded.',
    object(),
    true,
    () => ({
      ...catalog(),
      shotTypes: [...SHOT_TYPES],
      moods: [...MOODS],
      intents: [...INTENTS],
      events: [...MIND_EVENTS],
      timesOfDay: ['daylight', 'sunrise', 'sunset', 'dusk'],
      weather: ['clear', 'rain', 'snow'],
      limits: { ...EPISODE_LIMITS },
      format: episodeSchema.description,
      tips: [
        'Beats are one shot each; dialogue lines are timed to reading speed.',
        'Use waitFor "stopped" on the beat that shows the train arriving, then open doors in the next beat.',
        'Close doors, wait for "doors-closed", then release to let the train leave.',
        'A portrait needs the actor visible; otherwise the runner falls back to a platform or orbit shot and logs it.',
      ],
    }),
  );
  tool(
    'list_episodes',
    'List built-in series and episodes saved in this browser, with planned length. Read-only.',
    object(),
    true,
    () => ({
      series: series.map((set) => ({
        id: set.id,
        title: set.title,
        japanese: set.japanese ?? null,
        logline: set.logline,
        episodes: set.episodes.map(summary),
      })),
      saved: library.list().flatMap((episode) => {
        try {
          return [summary(episode)];
        } catch (error) {
          return [{ id: episode?.id ?? null, invalid: error.message }];
        }
      }),
    }),
  );
  tool(
    'get_episode_script',
    'Read one episode as validated data (to copy and adapt) or as a screenplay (to review). Read-only.',
    object({ id: idSchema, format: { type: 'string', enum: ['data', 'screenplay'] } }, ['id']),
    true,
    ({ id, format = 'screenplay' }) => {
      const episode = find(id);
      if (!episode) throw new Error(`No episode ${id}.`);
      const clean = normalize(episode);
      return format === 'data' ? clean : { id, screenplay: episodeScreenplay(clean) };
    },
  );
  tool(
    'validate_episode',
    'Check an episode without playing it. Returns the planned length and the generated screenplay, or the first problem with its exact path.',
    object({ episode: episodeSchema }, ['episode']),
    true,
    ({ episode }) => {
      const clean = normalize(episode);
      return {
        ok: true,
        plannedSeconds: Math.round(episodeSeconds(clean)),
        screenplay: episodeScreenplay(clean),
      };
    },
  );
  tool(
    'save_episode',
    'Validate and keep an episode in this browser’s episode library (24 at most, 64 KB each). Replaces an episode with the same id.',
    object({ episode: episodeSchema }, ['episode']),
    false,
    ({ episode }) => {
      const clean = normalize(episode);
      return { saved: clean.id, count: library.save(clean) };
    },
  );
  tool(
    'remove_saved_episode',
    'Remove an episode from this browser’s library. Built-in episodes cannot be removed.',
    object({ id: idSchema }, ['id']),
    false,
    ({ id }) => ({ removed: library.remove(id) }),
  );
  tool(
    'play_episode',
    'Play an episode in the running game: title card, scene settings, director shots, timed dialogue, acting notes, doors and weather cues. Pass the id of a built-in or saved episode, or a full episode to play once without saving. Pausing the ride pauses the episode.',
    {
      ...object({ id: idSchema, episode: episodeSchema }),
      minProperties: 1,
    },
    false,
    ({ id, episode }) => {
      if (id && episode) throw new TypeError('Pass an id or an episode, not both.');
      const source = episode ?? find(id);
      if (!source) throw new Error(`No episode ${id}.`);
      activate();
      return runner.play(source);
    },
  );
  tool(
    'get_episode_state',
    'Current episode, scene, beat, planned timing, what the runner is waiting for, and a log of substitutions or refused cues. Read-only.',
    object(),
    true,
    () => runner.getState(),
  );
  tool(
    'stop_episode',
    'Stop the current episode and release any held stop. The director keeps cutting on its own.',
    object(),
    false,
    () => {
      runner.stop();
      return runner.getState();
    },
  );
}
