import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  normalizeEpisode,
  readingSeconds,
  beatSeconds,
  episodeSeconds,
} from '../src/drama/episode-schema.js';
import { createEpisodeRunner } from '../src/drama/episode-runner.js';
import { episodeScreenplay, seriesScreenplay } from '../src/drama/screenplay.js';
import { THE_1742 } from '../src/drama/series/the-1742.js';
import { createEpisodeLibrary, EPISODE_LIBRARY_KEY } from '../src/agent/drama-tools.js';
import { additionalStops } from '../src/world/extended-route.js';
import { LEVEL_CROSSINGS } from '../src/world/level-crossings.js';

const context = {
  stops: ['momiji', ...additionalStops.map((stop) => stop.id)],
  crossings: LEVEL_CROSSINGS.map((site) => site.id),
};
const tiny = (overrides = {}) => ({
  id: 'tiny',
  title: 'Tiny',
  cast: { a: { name: 'A' } },
  scenes: [
    {
      id: 's1',
      heading: 'EXT. SOMEWHERE',
      stopAt: 'momiji',
      actors: { a: 'commuter-1' },
      beats: [
        {
          shot: { type: 'portrait', subject: { cast: 'a' } },
          dialogue: [{ cast: 'a', text: 'Hello there.' }],
          cues: [{ after: 0, direct: { cast: 'a', mood: 'shy', intent: 'wave' } }],
        },
        { shot: { type: 'platform' }, waitFor: 'stopped', hold: 2 },
        { shot: { type: 'wheels' }, hold: 3, cues: [{ after: 0.5, doors: 'open' }] },
        { shot: { type: 'trackside' }, hold: 2, cues: [{ after: 0, release: true }] },
      ],
    },
  ],
  ...overrides,
});

function fakeHost({
  stopped = () => true,
  resolve = (s) => (s.cast ? { person: s.entity } : { point: [0, 0, 0] }),
} = {}) {
  const calls = [];
  const host = {
    calls,
    setScene: (set) => calls.push(['scene', set]),
    setStop: (id) => calls.push(['stop', id]),
    cut: (shot) => calls.push(['cut', shot]),
    say: (line) => calls.push(['say', line]),
    card: (card) => calls.push(['card', card]),
    direct: (id, note) => calls.push(['direct', id, note]),
    event: (type) => calls.push(['event', type]),
    weather: (value) => calls.push(['weather', value]),
    doors: (action) => {
      calls.push(['doors', action]);
      return true;
    },
    isStopped: stopped,
    doorsClosed: () => true,
    resolve,
  };
  return host;
}
const run = (runner, seconds) => {
  for (let t = 0; t < seconds; t += 0.1) runner.update(0.1);
};

test('every built-in episode validates against the real stops and crossings', () => {
  for (const episode of THE_1742.episodes) {
    const clean = normalizeEpisode(episode, context);
    assert.equal(clean.id, episode.id);
    const seconds = episodeSeconds(clean);
    assert.ok(seconds > 60 && seconds < 360, `${episode.id} plans ${seconds}s`);
  }
});

test('the format rejects mistakes with the path of the problem', () => {
  const bad = (mutate, pattern) => {
    const episode = structuredClone(tiny());
    mutate(episode);
    assert.throws(() => normalizeEpisode(episode, context), pattern);
  };
  bad(
    (e) => (e.scenes[0].beats[0].dialogue[0].cast = 'b'),
    /dialogue\[0\]\.cast must name a cast member/,
  );
  bad((e) => delete e.scenes[0].actors.a, /needs an actor for this cast member/);
  bad((e) => delete e.scenes[0].stopAt, /release only applies to a scene with stopAt/);
  bad((e) => (e.scenes[0].beats[0].cues[0].event = 'horn'), /exactly one action/);
  bad((e) => (e.scenes[0].beats[0].cues[0].direct.mood = 'furious'), /mood must be one of/);
  bad((e) => (e.scenes[0].beats[0].shot.type = 'crane'), /Shot type/);
  bad((e) => (e.scenes[0].set = { offset: 20 }), /offset needs a location/);
  bad((e) => (e.scenes[0].stopAt = 'narnia'), /stopAt must be one of/);
  bad((e) => (e.scenes[0].beats[0].script = 'alert(1)'), /is not allowed/);
  bad((e) => (e.scenes[0].actors.a = 'Bad Id!'), /character id/);
});

test('reading time follows the number of words within bounds', () => {
  assert.equal(readingSeconds('One.'), 1.8);
  assert.ok(readingSeconds('a '.repeat(12)) > readingSeconds('a '.repeat(4)));
  assert.equal(readingSeconds('word '.repeat(60)), 7);
  const beat = normalizeEpisode(tiny(), context).scenes[0].beats[0];
  assert.ok(beatSeconds(beat) >= 1 + readingSeconds('Hello there.'));
});

test('the runner plays beats in order, waits for the train and releases the stop', () => {
  let stopped = false;
  const host = fakeHost({ stopped: () => stopped });
  const runner = createEpisodeRunner(host, context);
  runner.play(tiny());
  assert.deepEqual(host.calls[0][0], 'card');
  assert.deepEqual(host.calls[1], ['stop', 'momiji']);
  const cut = host.calls.find((call) => call[0] === 'cut')[1];
  assert.deepEqual(cut.subject, { person: 'commuter-1' });
  run(runner, 12);
  assert.ok(host.calls.some((call) => call[0] === 'say' && call[1].speaker === 'A'));
  assert.ok(host.calls.some((call) => call[0] === 'direct' && call[1] === 'commuter-1'));
  // The platform beat holds while the train is still moving.
  assert.equal(runner.getState().beat.shot, 'platform');
  run(runner, 20);
  assert.equal(runner.getState().beat.shot, 'platform');
  assert.equal(runner.getState().beat.waitingFor, 'stopped');
  stopped = true;
  run(runner, 8);
  assert.ok(host.calls.some((call) => call[0] === 'doors' && call[1] === 'open'));
  run(runner, 6);
  assert.equal(runner.getState().status, 'ended');
  const stops = host.calls.filter((call) => call[0] === 'stop').map((call) => call[1]);
  assert.equal(stops.at(-1), null);
  assert.equal(host.calls.filter((call) => call[0] === 'cut').length, 4);
});

test('missing actors fall back to a safe shot and the log says so', () => {
  const host = fakeHost({ resolve: () => null });
  const runner = createEpisodeRunner(host, context);
  runner.play(tiny());
  const cut = host.calls.find((call) => call[0] === 'cut')[1];
  assert.equal(cut.type, 'platform');
  assert.equal(cut.subject, undefined);
  assert.match(
    runner
      .getState()
      .log.map((item) => item.message)
      .join(' '),
    /unavailable/,
  );
});

test('stopping an episode releases the held stop and pausing holds time', () => {
  const host = fakeHost({ stopped: () => false });
  const runner = createEpisodeRunner(host, context);
  runner.play(tiny());
  runner.update(0);
  assert.equal(runner.getState().elapsed, 0);
  runner.stop();
  assert.equal(host.calls.at(-1)[1], null);
  assert.equal(runner.getState().status, 'stopped');
});

test('the screenplay and the committed script contain every line the game plays', () => {
  const doc = readFileSync(new URL('../../../docs/drama/THE-1742.md', import.meta.url), 'utf8');
  const generated = seriesScreenplay(THE_1742, (episode) => normalizeEpisode(episode, context));
  for (const episode of THE_1742.episodes) {
    const clean = normalizeEpisode(episode, context);
    const text = episodeScreenplay(clean);
    for (const scene of clean.scenes)
      for (const beat of scene.beats)
        for (const line of beat.dialogue) {
          assert.ok(text.includes(line.text), line.text);
          assert.ok(doc.includes(line.text), `docs/drama/THE-1742.md is missing: ${line.text}`);
        }
  }
  assert.ok(generated.startsWith('# The 17:42'));
});

test('the episode library keeps valid episodes and survives bad storage', () => {
  const store = new Map();
  const storage = {
    getItem: (key) => store.get(key) ?? null,
    setItem: (key, value) => store.set(key, value),
  };
  const library = createEpisodeLibrary(storage);
  assert.deepEqual(library.list(), []);
  library.save(normalizeEpisode(tiny(), context));
  library.save(normalizeEpisode(tiny({ title: 'Tiny again' }), context));
  assert.equal(library.list().length, 1);
  assert.equal(library.list()[0].title, 'Tiny again');
  assert.equal(library.remove('tiny'), true);
  store.set(EPISODE_LIBRARY_KEY, '{not json');
  assert.deepEqual(library.list(), []);
});
