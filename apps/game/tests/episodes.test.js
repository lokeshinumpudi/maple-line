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
    // Waits for the train come on top of the plan.
    assert.ok(seconds > 45 && seconds < 360, `${episode.id} plans ${seconds}s`);
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
  bad((e) => delete e.scenes[0].stopAt, /release only applies to a scene with stopAt or holdAt/);
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

test('dialogue lines are filmed on their speaker, with the reverse over the listener', () => {
  const episode = tiny({
    cast: { a: { name: 'A' }, b: { name: 'B' }, c: { name: 'C' } },
  });
  const scene = episode.scenes[0];
  scene.actors = { a: 'commuter-1', b: 'commuter-2', c: 'reader-1' };
  scene.beats[0].dialogue = [
    { cast: 'a', text: 'First line.' },
    { cast: 'b', text: 'An answer.' },
    { cast: 'a', text: 'A reply.' },
    { cast: 'c', text: 'Someone who is not on screen.' },
  ];
  // Shots cannot be authored with a partner for a cast member missing from the scene.
  assert.throws(
    () =>
      normalizeEpisode(
        {
          ...episode,
          scenes: [
            {
              ...scene,
              beats: [
                { ...scene.beats[0], shot: { ...scene.beats[0].shot, partner: { cast: 'z' } } },
              ],
            },
          ],
        },
        context,
      ),
    /partner\.cast/,
  );
  const host = fakeHost({
    resolve: (s) => (s.entity === 'reader-1' ? null : { person: s.entity }),
  });
  const runner = createEpisodeRunner(host, context);
  runner.play(episode);
  run(runner, 20);
  const cuts = host.calls.filter((call) => call[0] === 'cut').map((call) => call[1]);
  // The beat's own portrait of A knows who A is talking to.
  assert.deepEqual(cuts[0].subject, { person: 'commuter-1' });
  assert.deepEqual(cuts[0].partner, { person: 'commuter-2' });
  // B answers: over A's shoulder. A replies: over B's shoulder.
  assert.deepEqual(cuts[1].subject, { person: 'commuter-2' });
  assert.equal(cuts[1].framing, 'ots');
  assert.deepEqual(cuts[1].partner, { person: 'commuter-1' });
  assert.deepEqual(cuts[2].subject, { person: 'commuter-1' });
  assert.equal(cuts[2].framing, 'ots');
  // C is not on screen: the shot is kept and the log says why.
  assert.ok(!cuts.some((cut) => cut.subject?.person === 'reader-1'));
  assert.match(
    runner
      .getState()
      .log.map((item) => item.message)
      .join(' '),
    /C is not on screen/,
  );
  // Each coverage cut happens with its line, before the subtitle is shown.
  const order = host.calls.filter((call) => call[0] === 'cut' || call[0] === 'say');
  const answer = order.findIndex((call) => call[0] === 'say' && call[1].text === 'An answer.');
  assert.equal(order[answer - 1][0], 'cut');
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

test('a normalized episode validates again unchanged (replays, saved and shared copies)', () => {
  for (const episode of [...THE_1742.episodes, tiny()]) {
    const once = normalizeEpisode(episode, context);
    assert.deepEqual(normalizeEpisode(once, context), once);
  }
  const runner = createEpisodeRunner(fakeHost(), context);
  runner.play(tiny());
  const copy = runner.current();
  copy.title = 'Changed';
  assert.equal(runner.current().title, 'Tiny');
  assert.equal(runner.play(runner.current()).status, 'playing');
});

test('the runner tells the host when the last beat ends, not when stopped', () => {
  const host = fakeHost();
  const ended = [];
  host.ended = (state) => ended.push(state.status);
  const runner = createEpisodeRunner(host, context);
  runner.play(tiny());
  runner.stop();
  assert.deepEqual(ended, []);
  runner.play(tiny());
  run(runner, 200);
  assert.deepEqual(ended, ['ended']);
});
