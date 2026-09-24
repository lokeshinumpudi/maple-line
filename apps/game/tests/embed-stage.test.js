import test from 'node:test';
import assert from 'node:assert/strict';
import { postEmbedState, validateEmbedConfig } from '../src/embed/bridge.js';
import {
  CAST_CLIPS,
  CAST_SUBJECTS,
  EMBED_BEATS,
  EMBED_BEAT_IDS,
  createBeatHold,
  createCaptionVoice,
  createHeldClock,
} from '../src/embed/stage.js';
import { THE_1742 } from '../src/drama/series/the-1742.js';
import { createEpisodeRunner } from '../src/drama/episode-runner.js';
import { additionalStops } from '../src/world/extended-route.js';
import { LEVEL_CROSSINGS } from '../src/world/level-crossings.js';
import { MOMIJI_CAST } from '../src/world/hero-cast.js';
import { STAGED_CAST } from '../src/drama/drama-roles.js';

const context = {
  stops: ['momiji', ...additionalStops.map((stop) => stop.id)],
  crossings: LEVEL_CROSSINGS.map((site) => site.id),
};
const episodeOf = (id) => THE_1742.episodes.find((item) => item.number === EMBED_BEATS[id].episode);
const beatOf = (id) => {
  const { scene, beat } = EMBED_BEATS[id];
  return episodeOf(id).scenes[scene].beats[beat];
};

test('staging settings accept only fixed choices', () => {
  const config = {
    beat: 'momiji-exchange',
    captions: 'te-IN',
    focus: 'cast',
    subject: 'ammamma',
    clip: 'check-phone',
    pose: 'reset-bug',
    skeleton: true,
    motionLayers: false,
  };
  assert.deepEqual(validateEmbedConfig(config), config);
  assert.deepEqual(validateEmbedConfig({ beat: null }), { beat: null });
  for (const invalid of [
    { beat: 'episode-4' },
    { beat: '' },
    { beat: 1 },
    { captions: 'fr' },
    { captions: null },
    { subject: 'haru' },
    { subject: 'commuter-2' },
    { clip: 'dance' },
    { clip: 'toString' },
    { pose: 'tpose' },
    { skeleton: 'true' },
    { motionLayers: 0 },
    { focus: 'person' },
    { constructor: 'cast' },
    JSON.parse('{"__proto__": "cast"}'),
  ])
    assert.throws(() => validateEmbedConfig(invalid), TypeError, JSON.stringify(invalid));
});

test('every staged beat points at the scene it is named for', () => {
  const expected = {
    'momiji-arrival': (b) => b.shot.type === 'establishing' && b.caption === 'Momiji',
    'momiji-timetable': (b) => b.shot.subject?.prop === 'momiji-timetable',
    'momiji-two-minutes': (b) => b.dialogue[0]?.text.startsWith('Two minutes'),
    'momiji-exchange': (b) => b.dialogue.some((line) => line.text === 'What’s in the box?'),
    'momiji-ishida': (b) => b.shot.subject?.cast === 'ishida',
    'momiji-doors': (b) => b.cues.some((cue) => cue.move?.to === 'front-car-door'),
    'train-call': (b) => b.dialogue.some((line) => line.phone && line.cast === 'ammamma'),
    'train-arjun-call': (b) => b.dialogue[0]?.text.startsWith('Divya?'),
    'train-seated': (b) => b.dialogue[0]?.text === 'Who was that?',
    'aonuma-arrival': (b) => b.caption?.startsWith('Aonuma'),
    'aonuma-clock': (b) => b.shot.subject?.prop === 'aonuma-clock',
    'aonuma-bus': (b) => b.shot.subject?.cast === 'divya',
    'aonuma-ammamma': (b) => b.dialogue.some((line) => line.cast === 'ammamma'),
    'aonuma-radio': (b) => b.dialogue[0]?.text.startsWith('That’s his station'),
  };
  assert.deepEqual(Object.keys(expected).sort(), [...EMBED_BEAT_IDS].sort());
  for (const [id, check] of Object.entries(expected)) assert.ok(check(beatOf(id)), id);
});

test('the embed cast and clips match the game cast', () => {
  const people = new Set([...MOMIJI_CAST, ...STAGED_CAST].map((member) => member.personId));
  for (const person of Object.values(CAST_SUBJECTS)) assert.ok(people.has(person), person);
  assert.ok(CAST_CLIPS.includes('idle'));
  assert.equal(new Set(CAST_CLIPS).size, CAST_CLIPS.length);
});

test('caption voice shows hand-written translations without audio', () => {
  const telugu = createCaptionVoice('te-IN');
  const item = { text: 'Thank you.', translations: { 'te-IN': 'థాంక్యూ అండీ.' } };
  assert.equal(telugu.active(), true);
  assert.equal(telugu.text(item), 'థాంక్యూ అండీ.');
  assert.equal(telugu.text({ text: 'No translation' }), 'No translation');
  assert.equal(telugu.play(item), null);
  assert.equal(createCaptionVoice('en').active(), false);
});

test('the held clock stops with the scene and fires timers in order', () => {
  const clock = createHeldClock();
  const fired = [];
  clock.setTimeout(() => fired.push('b'), 2000);
  clock.setTimeout(() => fired.push('a'), 1000);
  const cancelled = clock.setTimeout(() => fired.push('never'), 500);
  clock.clearTimeout(cancelled);
  clock.advance(0);
  clock.advance(0.9);
  assert.deepEqual(fired, []);
  clock.advance(1.2);
  assert.deepEqual(fired, ['a', 'b']);
  assert.equal(clock.now(), 2100);
});

test('a staged beat holds once its first caption has been readable', () => {
  const hold = createBeatHold({ lineSeconds: 1.5, silentSeconds: 3 });
  hold.arm(true);
  assert.equal(hold.update(1), false);
  hold.event({ type: 'line' });
  assert.equal(hold.update(1), false);
  assert.equal(hold.update(0.6), true);
  assert.equal(hold.pending, false);
  hold.arm(true);
  assert.equal(hold.update(2.9), false);
  assert.equal(hold.update(0.2), true);
  hold.arm(false);
  assert.equal(hold.update(10), false);
  // Holding on a later line waits for it, however long the first lines take.
  hold.arm(true, 2);
  hold.event({ type: 'line' });
  assert.equal(hold.update(5), false);
  hold.event({ type: 'beat' });
  hold.event({ type: 'line' });
  assert.equal(hold.update(1), false);
  assert.equal(hold.update(0.6), true);
});

test('a beat held on a later line names a line that exists', () => {
  for (const id of EMBED_BEAT_IDS) {
    const line = EMBED_BEATS[id].line ?? 1;
    const count = (beatOf(id).dialogue ?? []).length;
    assert.ok(count === 0 ? line === 1 : line <= count, id);
  }
});

test('the runner can start at a beat as if the scene had played to it', () => {
  const calls = [];
  const host = {
    setScene: (set) => calls.push(['scene', set]),
    setStop: (id) => calls.push(['stop', id]),
    cut: (shot) => calls.push(['cut', shot]),
    say: (line) => calls.push(['say', line]),
    card: (card) => calls.push(['card', card]),
    direct: (id, note) => calls.push(['direct', id, note]),
    event: (type) => calls.push(['event', type]),
    weather: () => {},
    doors: (action) => calls.push(['doors', action]) && true,
    isStopped: () => true,
    doorsClosed: () => true,
    resolve: (s) => (s.cast ? { person: s.entity } : { point: [0, 0, 0] }),
    mark: (entity, mark) => calls.push(['mark', entity, mark]),
    move: (entity, mark) => calls.push(['move', entity, mark]),
    bus: (state) => calls.push(['bus', state]),
    clearStage: () => {},
    voice: createCaptionVoice('hi-IN'),
  };
  const runner = createEpisodeRunner(host, context);
  const { scene, beat } = EMBED_BEATS['aonuma-bus'];
  runner.play(episodeOf('aonuma-bus'), { from: { scene, beat } });
  // No title card; the train is already at the stop because an earlier beat waited for it.
  assert.ok(!calls.some((call) => call[0] === 'card'));
  const set = calls.find((call) => call[0] === 'scene')[1];
  assert.equal(set.offset, 0);
  assert.equal(set.speedKmh, 0);
  // Earlier walks are placements; the bus is waiting; doors are not replayed.
  assert.ok(
    calls.some((c) => c[0] === 'mark' && c[1] === 'commuter-2' && c[2] === 'aonuma-bus-door'),
  );
  assert.ok(calls.some((c) => c[0] === 'bus' && c[1] === 'wait'));
  assert.ok(!calls.some((c) => c[0] === 'move' || c[0] === 'doors'));
  assert.equal(runner.getState().beat.index, beat);
  assert.equal(calls.filter((c) => c[0] === 'cut')[0][1].subject.person, 'divya');
  for (let t = 0; t < 3; t += 0.1) runner.update(0.1);
  const line = calls.find((c) => c[0] === 'say')[1];
  assert.equal(line.text, 'तुम मीरा होगी। मेरा भाई फ़ोन पर फ़ोन किए जा रहा था।');
  assert.throws(
    () => runner.play(episodeOf('aonuma-bus'), { from: { scene: 0, beat: 99 } }),
    TypeError,
  );
});

test('starting at a beat before the train stops keeps the approach', () => {
  const sets = [];
  const host = {
    setScene: (set) => sets.push(set),
    setStop() {},
    cut() {},
    say() {},
    card() {},
    direct() {},
    event() {},
    weather() {},
    doors: () => true,
    isStopped: () => true,
    doorsClosed: () => true,
    resolve: (s) => (s.cast ? { person: s.entity } : { point: [0, 0, 0] }),
  };
  const runner = createEpisodeRunner(host, context);
  const { scene, beat } = EMBED_BEATS['momiji-exchange'];
  runner.play(episodeOf('momiji-exchange'), { from: { scene, beat } });
  assert.equal(sets[0].offset, -380);
});

test('an unrequested state update goes only to the same-origin parent', () => {
  const posts = [];
  const parent = { postMessage: (data, origin) => posts.push({ data, origin }) };
  postEmbedState({ parent, location: { origin: 'https://example.com' } }, { paused: true });
  assert.deepEqual(posts, [
    {
      data: { channel: 'maple-line-embed-v1', type: 'state', state: { paused: true } },
      origin: 'https://example.com',
    },
  ]);
  // A top-level page (its own parent) has nobody to tell.
  const top = { location: { origin: 'https://example.com' }, postMessage: () => posts.push(1) };
  top.parent = top;
  postEmbedState(top, {});
  assert.equal(posts.length, 1);
});
