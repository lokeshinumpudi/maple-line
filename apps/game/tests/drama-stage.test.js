import test from 'node:test';
import assert from 'node:assert/strict';
import { createDramaStage, STAGE_MARKS } from '../src/drama/drama-stage.js';
import { normalizeEpisode } from '../src/drama/episode-schema.js';
import { createEpisodeRunner } from '../src/drama/episode-runner.js';
import { THE_1742 } from '../src/drama/series/the-1742.js';
import { FIXED_ROLES } from '../src/drama/drama-roles.js';
import { DRAMA_PROP_IDS } from '../src/drama/drama-props.js';
import { additionalStops } from '../src/world/extended-route.js';
import { LEVEL_CROSSINGS } from '../src/world/level-crossings.js';

const context = {
  stops: ['momiji', ...additionalStops.map((stop) => stop.id)],
  crossings: LEVEL_CROSSINGS.map((site) => site.id),
};

/** Marks on a flat plane: door at x 0, bus door at x 10, station points as given. */
function stageHost() {
  const spots = { door: { x: 0, y: 0, z: 0 }, bus: { x: 10, y: 0, z: 0, heading: Math.PI } };
  return {
    resolve: (mark) =>
      mark.kind === 'door'
        ? spots.door
        : mark.kind === 'bus'
          ? spots.bus
          : mark.kind === 'car'
            ? { x: mark.x, y: 1, z: mark.z, heading: mark.face, seated: true }
            : { x: mark.x, y: 0, z: mark.z, heading: mark.face },
    station: () => ({ x: 5, y: 0, z: 0 }),
    origin: () => ({ x: -3, y: 0, z: 0, heading: 0 }),
  };
}

test('a person at a door is aboard until they move, then walks the path and stands', () => {
  const stage = createDramaStage(stageHost());
  stage.place('commuter-2', 'front-car-door');
  assert.equal(stage.figureOf('commuter-2').visible, false);
  stage.move('commuter-2', 'aonuma-bus-door', 'run');
  const first = stage.figureOf('commuter-2');
  assert.equal(first.visible, true);
  assert.equal(first.walking, true);
  for (let i = 0; i < 400; i++) stage.update(0.05);
  const done = stage.figureOf('commuter-2');
  const mark = STAGE_MARKS['aonuma-bus-door'];
  assert.equal(done.walking, false);
  assert.deepEqual([done.position.x, done.position.z], [mark.x, mark.z]);
  assert.equal(done.heading, mark.face);
  // Running at 2.1 m/s takes seconds, not an instant.
  const again = createDramaStage(stageHost());
  again.place('commuter-2', 'front-car-door');
  again.move('commuter-2', 'aonuma-bus-door', 'run');
  again.update(1);
  assert.ok(again.figureOf('commuter-2').position.x < 3);
});

test('moving someone who is not staged starts where the simulation has them', () => {
  const stage = createDramaStage(stageHost());
  stage.move('commuter-1', 'front-car-door');
  assert.equal(stage.figureOf('commuter-1').position.x, -3);
  for (let i = 0; i < 200; i++) stage.update(0.05);
  // Arriving at a door boards: hidden aboard.
  assert.equal(stage.figureOf('commuter-1').visible, false);
  stage.clear();
  assert.equal(stage.figureOf('commuter-1'), null);
});

test('seats are seated poses and acting notes last as long as asked', () => {
  const stage = createDramaStage(stageHost());
  stage.place('commuter-2', 'front-car-seat');
  assert.equal(stage.figureOf('commuter-2').pose, 'seated');
  stage.direct('commuter-2', { mood: 'anxious', intent: 'check-phone', holdSeconds: 2 });
  assert.equal(stage.expressionFor('commuter-2').intent, 'check-phone');
  stage.update(2.5);
  assert.equal(stage.expressionFor('commuter-2'), null);
  assert.throws(() => stage.place('commuter-2', 'nowhere'), /unknown stage mark/);
});

test('scenes validate marks, moves, bus cues, prop subjects, clocks and crossing holds', () => {
  const episode = (scene, beat) => ({
    id: 'staged',
    title: 'Staged',
    cast: { riko: { name: 'Riko' } },
    scenes: [
      {
        id: 's1',
        heading: 'EXT. AONUMA',
        stopAt: 'aonuma',
        actors: { riko: 'commuter-2' },
        marks: { riko: 'front-car-door' },
        ...scene,
        beats: [
          {
            shot: { type: 'insert', subject: { prop: 'aonuma-bus' } },
            cues: [
              { after: 0, bus: { state: 'wait' } },
              { after: 1, move: { cast: 'riko', to: 'aonuma-bus-door', pace: 'run' } },
            ],
            ...beat,
          },
        ],
      },
    ],
  });
  const clean = normalizeEpisode(episode({ set: { clock: '17:47' } }), context);
  assert.deepEqual(clean.scenes[0].marks, { riko: 'front-car-door' });
  assert.equal(clean.scenes[0].set.clock, '17:47');
  assert.deepEqual(clean.scenes[0].beats[0].shot.subject, { prop: 'aonuma-bus' });
  assert.deepEqual(clean.scenes[0].beats[0].cues[0].bus, { state: 'wait' });
  const bad = (scene, beat, pattern) =>
    assert.throws(() => normalizeEpisode(episode(scene, beat), context), pattern);
  bad({ marks: { riko: 'the-moon' } }, {}, /marks\.riko must be one of/);
  bad({ set: { clock: '25:00' } }, {}, /clock must be a 24-hour time/);
  bad({ holdAt: 'sakuragawa-farm-road' }, {}, /holdAt cannot be used with stopAt/);
  bad({}, { shot: { type: 'insert', subject: { prop: 'teapot' } } }, /subject\.prop must be one/);
  bad({}, { cues: [{ after: 0, bus: { state: 'fly' } }] }, /bus\.state must be one of/);
  bad(
    {},
    { cues: [{ after: 0, move: { cast: 'riko', to: 'aonuma-bus-door', pace: 'skip' } }] },
    /move\.pace must be one of/,
  );
  // A held crossing can be released like a platform stop.
  const held = normalizeEpisode(
    episode(
      { stopAt: undefined, holdAt: 'sakuragawa-farm-road', marks: undefined },
      { cues: [{ after: 0, release: true }] },
    ),
    context,
  );
  assert.equal(held.scenes[0].holdAt, 'sakuragawa-farm-road');
});

test('the runner stands people on marks before the first shot and performs moves and bus cues', () => {
  const calls = [];
  const host = {
    setScene: () => {},
    setStop: (id, options) => calls.push(['stop', id, options?.crossing ?? null]),
    cut: (shot) => calls.push(['cut', shot]),
    say: () => {},
    card: () => {},
    direct: () => {},
    event: () => {},
    weather: () => {},
    doors: () => true,
    isStopped: () => true,
    doorsClosed: () => true,
    resolve: (s) => (s.prop ? { prop: s.prop } : s.cast ? { person: s.entity } : null),
    mark: (entity, mark) => calls.push(['mark', entity, mark]),
    move: (entity, mark, pace) => calls.push(['move', entity, mark, pace]),
    bus: (state) => calls.push(['bus', state]),
    clearStage: () => calls.push(['clear']),
  };
  const runner = createEpisodeRunner(host, context);
  runner.play(THE_1742.episodes[2]);
  const firstCut = calls.findIndex((call) => call[0] === 'cut');
  const marks = calls.filter((call) => call[0] === 'mark');
  assert.deepEqual(
    marks.map((call) => call[1]),
    ['commuter-2', 'fusae', 'aoi'],
  );
  assert.ok(calls.indexOf(marks.at(-1)) < firstCut);
  for (let t = 0; t < 200 && runner.getState().status === 'playing'; t += 0.1) runner.update(0.1);
  assert.ok(calls.some((call) => call[0] === 'bus' && call[1] === 'wait'));
  assert.ok(calls.some((call) => call[0] === 'bus' && call[1] === 'leave'));
  assert.ok(
    calls.some((call) => call[0] === 'move' && call[1] === 'commuter-2' && call[3] === 'run'),
  );
  assert.ok(calls.some((call) => call[0] === 'cut' && call[1].subject?.prop === 'aonuma-bus'));
  runner.stop();
  // Episode 2 holds the train at the farm road crossing.
  runner.play(THE_1742.episodes[1]);
  assert.ok(calls.some((call) => call[0] === 'stop' && call[2] === 'sakuragawa-farm-road'));
});

test('Riko is the same figure in every episode, and every staged part has a fixed role', () => {
  for (const episode of THE_1742.episodes)
    for (const scene of episode.scenes)
      if (scene.actors?.riko) assert.equal(scene.actors.riko, FIXED_ROLES.riko.entity);
  const aonuma = THE_1742.episodes[2].scenes[0];
  assert.equal(aonuma.actors.fusae, FIXED_ROLES.fusae.entity);
  assert.equal(aonuma.actors.aoi, FIXED_ROLES.aoi.entity);
  for (const mark of Object.values(aonuma.marks)) assert.ok(STAGE_MARKS[mark]);
});

test('the story reads with the sound off: key times are on screen as text', () => {
  const [one, two, three] = THE_1742.episodes;
  const screen = (episode) =>
    episode.scenes
      .flatMap((scene) => scene.beats.flatMap((beat) => [beat.caption, beat.subtitle, beat.line]))
      .filter(Boolean)
      .join(' | ');
  assert.match(screen(one), /17:42/);
  assert.match(screen(one), /17:40/);
  assert.match(screen(one), /care home/);
  assert.match(screen(two), /five minutes late/);
  assert.match(screen(three), /17:47/);
  assert.ok(one.scenes[0].beats.some((beat) => beat.shot.subject?.prop === 'momiji-timetable'));
  assert.ok(three.scenes[0].beats.some((beat) => beat.shot.subject?.prop === 'aonuma-bus'));
  for (const beat of THE_1742.episodes.flatMap((episode) =>
    episode.scenes.flatMap((scene) => scene.beats),
  ))
    if (beat.shot.subject?.prop) assert.ok(DRAMA_PROP_IDS.includes(beat.shot.subject.prop));
  // Every spoken line and on-screen sentence has a hand-written Telugu version.
  for (const episode of THE_1742.episodes) {
    for (const scene of episode.scenes)
      for (const beat of scene.beats) {
        if (beat.line) assert.ok(beat.lineTranslations?.['te-IN'], beat.line);
        for (const line of beat.dialogue ?? [])
          assert.ok(line.translations?.['te-IN'], `${episode.id}: ${line.text}`);
      }
    assert.ok(episode.endCard.lineTranslations['te-IN']);
  }
});
