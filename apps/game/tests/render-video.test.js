import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createRenderClock,
  fadeOpacity,
  readRenderOptions,
  seededRandom,
} from '../src/rendering/render-clock.js';
import {
  audioFilterGraph,
  beatId,
  createRenderTimeline,
  lineId,
  normalizeAudioManifest,
  resolveAudioClips,
} from '../src/drama/render-timeline.js';
import { createEpisodeRunner } from '../src/drama/episode-runner.js';
import { createFrameBudget } from '../src/rendering/frame-budget.js';
import { lensToFov } from '../src/camera/director.js';
import { THE_1742 } from '../src/drama/series/the-1742.js';
import { additionalStops } from '../src/world/extended-route.js';
import { LEVEL_CROSSINGS } from '../src/world/level-crossings.js';

test('render options are off unless render=1 and reject unsupported sizes', () => {
  assert.equal(readRenderOptions(''), null);
  assert.equal(readRenderOptions('?render=0'), null);
  assert.deepEqual(readRenderOptions('?render=1'), {
    fps: 30,
    aspect: '16:9',
    width: 1920,
    height: 1080,
    portrait: false,
  });
  const vertical = readRenderOptions('?render=1&fps=60&aspect=9:16');
  assert.equal(vertical.width, 1080);
  assert.equal(vertical.height, 1920);
  assert.equal(vertical.portrait, true);
  assert.throws(() => readRenderOptions('?render=1&fps=29'), /fps must be one of/);
  assert.throws(() => readRenderOptions('?render=1&aspect=4:3'), /aspect must be one of/);
});

test('the render clock only moves on advance and keeps exact frame times', () => {
  const clock = createRenderClock({ fps: 30 });
  assert.equal(clock.now(), 0);
  for (let i = 0; i < 3000; i++) clock.advance();
  // Computed from the frame count, so 3000 frames are exactly 100 s with no drift.
  assert.equal(clock.now(), 100000);
  assert.equal(clock.seconds(), 100);
  assert.equal(clock.frame, 3000);
  assert.equal(clock.dtSeconds, 1 / 30);
});

test('render clock timers fire in due order during advance, and can be cleared', () => {
  const clock = createRenderClock({ fps: 25 });
  const fired = [];
  clock.setTimeout(() => fired.push('b'), 80);
  clock.setTimeout(() => fired.push('a'), 40);
  const cancelled = clock.setTimeout(() => fired.push('never'), 40);
  clock.clearTimeout(cancelled);
  clock.advance(); // 40 ms
  assert.deepEqual(fired, ['a']);
  clock.advance(); // 80 ms
  assert.deepEqual(fired, ['a', 'b']);
  // A timer scheduled from a callback that is already due runs in the same advance.
  clock.setTimeout(() => clock.setTimeout(() => fired.push('chained'), 0), 1);
  clock.advance();
  assert.deepEqual(fired, ['a', 'b', 'chained']);
  assert.equal(clock.pendingTimers(), 0);
});

test('fades ease to their target and reverse from the current opacity', () => {
  const shown = { shown: true, changedAt: 1000, from: 0 };
  assert.equal(fadeOpacity(shown, 1000), 0);
  assert.equal(fadeOpacity(shown, 1450), 0.5);
  assert.equal(fadeOpacity(shown, 1900), 1);
  assert.equal(fadeOpacity(shown, 5000), 1);
  const hidden = { shown: false, changedAt: 2000, from: 0.6 };
  assert.equal(fadeOpacity(hidden, 2000), 0.6);
  assert.equal(fadeOpacity(hidden, 2900), 0);
});

test('seeded random repeats the same sequence', () => {
  const a = seededRandom(7);
  const b = seededRandom(7);
  const values = Array.from({ length: 5 }, () => a());
  assert.deepEqual(
    values,
    Array.from({ length: 5 }, () => b()),
  );
  assert.ok(values.every((value) => value >= 0 && value < 1));
});

test('a fixed frame budget never drops resolution for slow frames', () => {
  let ratio = 1;
  const renderer = {
    getPixelRatio: () => ratio,
    setPixelRatio: (value) => {
      ratio = value;
    },
  };
  const budget = createFrameBudget({
    renderer,
    devicePixelRatio: 1,
    pixelBudget: Infinity,
    maxPixelRatio: 1,
    adaptive: false,
  });
  budget.resize(1080, 1920);
  for (let i = 0; i < 400; i++) budget.record({ intervalMs: 250, cpuMs: 200 });
  assert.equal(ratio, 1);
  assert.equal(budget.getState().adaptiveScale, 1);
  assert.equal(budget.getState().adaptive, false);
});

test('vertical video framing keeps close shots tighter than the phone game framing', () => {
  const tall = 9 / 16;
  assert.equal(lensToFov(50, 16 / 9, { framing: 'subject', scale: 'close' }), lensToFov(50));
  assert.equal(lensToFov(50, tall), lensToFov(50, tall, { framing: 'wide', scale: 'close' }));
  assert.ok(
    lensToFov(50, tall, { framing: 'subject', scale: 'close' }) <
      lensToFov(50, tall, { framing: 'wide', scale: 'close' }) - 10,
  );
  assert.ok(
    lensToFov(35, tall, { framing: 'subject', scale: 'wide' }) >
      lensToFov(35, tall, { framing: 'subject', scale: 'close' }),
  );
});

const context = {
  stops: ['momiji', ...additionalStops.map((stop) => stop.id)],
  crossings: LEVEL_CROSSINGS.map((site) => site.id),
};
function fakeHost() {
  return {
    setScene() {},
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
    resolve: () => ({ person: 'someone' }),
  };
}

test('the runner reports scenes, beats, lines and the end with stable ids', () => {
  const timeline = createRenderTimeline();
  let t = 0;
  const runner = createEpisodeRunner(fakeHost(), {
    ...context,
    onEvent: (event) => timeline.record(event, t),
  });
  const episode = THE_1742.episodes[0];
  runner.play(episode);
  const fps = 30;
  let frames = 0;
  while (runner.getState().status === 'playing' && frames < fps * 600) {
    frames += 1;
    t = frames / fps;
    runner.update(1 / fps);
  }
  assert.equal(runner.getState().status, 'ended');
  const manifest = timeline.toManifest({ episode, fps, width: 1080, height: 1920, frames });
  assert.equal(manifest.kind, 'maple-line-render-timeline');
  assert.equal(manifest.video.durationSeconds, Number((frames / fps).toFixed(3)));
  assert.equal(manifest.scenes[0].id, episode.scenes[0].id);
  assert.equal(manifest.scenes[0].t, 0);
  assert.equal(manifest.beats[0].id, beatId(episode.scenes[0].id, 0));
  const spoken = episode.scenes.flatMap((scene) =>
    scene.beats.flatMap((beat, b) =>
      (beat.dialogue ?? []).map((line, l) => ({ id: lineId(scene.id, b, l), text: line.text })),
    ),
  );
  assert.deepEqual(
    manifest.lines.map(({ id, text }) => ({ id, text })),
    spoken,
  );
  // Times only move forward, and each line starts after its beat.
  const times = manifest.lines.map((line) => line.t);
  assert.deepEqual(
    times,
    [...times].sort((a, b) => a - b),
  );
  for (const line of manifest.lines) {
    const beat = manifest.beats.find((item) => item.id === `${line.scene}/${line.beat}`);
    assert.ok(line.t >= beat.t, `${line.id} starts after its beat`);
    assert.ok(line.seconds >= 1.8 && line.speaker);
  }
  assert.ok(manifest.endedAt > times.at(-1));
});

test('audio manifests accept timed and line clips and reject bad fields', () => {
  assert.deepEqual(normalizeAudioManifest([{ t: 1, file: 'a.wav' }]), {
    clips: [{ file: 'a.wav', t: 1, offset: 0, gain: 1 }],
  });
  assert.deepEqual(
    normalizeAudioManifest({
      version: 1,
      clips: [{ line: 'momiji-platform/2/1', file: 'riko.wav', offset: -0.1, gain: 0.8 }],
    }).clips[0],
    { file: 'riko.wav', line: 'momiji-platform/2/1', offset: -0.1, gain: 0.8 },
  );
  assert.throws(() => normalizeAudioManifest({ clips: [{ file: 'a.wav' }] }), /exactly one of/);
  assert.throws(
    () => normalizeAudioManifest({ clips: [{ file: 'a.wav', t: 1, line: 'x/1/1' }] }),
    /exactly one of/,
  );
  assert.throws(() => normalizeAudioManifest({ clips: [{ file: '', t: 1 }] }), /needs a path/);
  assert.throws(() => normalizeAudioManifest({ clips: [{ file: 'a', t: -1 }] }), /seconds ≥ 0/);
  assert.throws(() => normalizeAudioManifest({ clips: [{ file: 'a', t: 1, gain: 9 }] }), /0 to 4/);
  assert.throws(
    () => normalizeAudioManifest({ clips: [{ file: 'a', t: 1, pan: 0 }] }),
    /not a clip/,
  );
  assert.throws(() => normalizeAudioManifest({ version: 2, clips: [] }), /must be 1/);
});

test('audio clips resolve to line times, drop missing lines and clips past the end', () => {
  const timeline = {
    video: { durationSeconds: 20 },
    lines: [
      { id: 'a/2/1', t: 6.2 },
      { id: 'a/2/2', t: 9.5 },
    ],
  };
  const { clips, missing } = resolveAudioClips(
    {
      clips: [
        { line: 'a/2/2', file: 'two.wav' },
        { line: 'a/2/1', file: 'one.wav', offset: 0.15, gain: 1.2 },
        { line: 'b/1/1', file: 'gone.wav' },
        { t: 0, file: 'bed.wav', gain: 0.3 },
        { t: 25, file: 'late.wav' },
      ],
    },
    timeline,
  );
  assert.deepEqual(missing, ['b/1/1']);
  assert.deepEqual(clips, [
    { file: 'bed.wav', start: 0, gain: 0.3 },
    { file: 'one.wav', start: 6.35, gain: 1.2, line: 'a/2/1' },
    { file: 'two.wav', start: 9.5, gain: 1, line: 'a/2/2' },
  ]);
});

test('the ffmpeg mix delays each clip and pads to the video length', () => {
  const graph = audioFilterGraph(
    [
      { file: 'one.wav', start: 0, gain: 0.3 },
      { file: 'two.wav', start: 6.35, gain: 1 },
    ],
    { durationSeconds: 81.5 },
  );
  assert.match(graph, /\[1:a\].*volume=0\.3,adelay=0\|0\[a0\]/);
  assert.match(graph, /\[2:a\].*adelay=6350\|6350\[a1\]/);
  assert.match(graph, /\[a0\]\[a1\]amix=inputs=2:duration=longest:normalize=0/);
  assert.match(graph, /apad=whole_dur=81\.5,atrim=0:81\.5\[aout\]$/);
  assert.equal(
    audioFilterGraph([], { durationSeconds: 3 }),
    'anullsrc=channel_layout=stereo:sample_rate=48000,atrim=0:3[aout]',
  );
  assert.throws(() => audioFilterGraph([], { durationSeconds: 0 }), /positive/);
});
