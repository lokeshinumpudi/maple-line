import test from 'node:test';
import assert from 'node:assert/strict';
import { createNarrationPlayer } from '../src/narrative/narration-player.js';
function setup(fetchImpl) {
  const events = {},
    states = [],
    playing = [],
    revoked = [];
  const audio = {
    src: '',
    plays: 0,
    paused: true,
    load() {},
    pause() {
      this.paused = true;
    },
    removeAttribute() {
      this.src = '';
    },
    async play() {
      this.plays++;
      this.paused = false;
    },
    addEventListener(name, fn) {
      events[name] = fn;
    },
    removeEventListener(name) {
      delete events[name];
    },
  };
  const player = createNarrationPlayer({
    audio,
    fetchImpl,
    urls: { createObjectURL: () => 'blob:test', revokeObjectURL: (url) => revoked.push(url) },
    onState: (state) => states.push(state),
    onPlaying: (value) => playing.push(value),
  });
  return { player, audio, events, states, playing, revoked };
}
test('late responses cannot start audio after cancellation or disposal', async () => {
  let resolve;
  const s = setup(() => new Promise((r) => (resolve = r)));
  const pending = s.player.speak('Old story');
  s.player.cancel();
  resolve(new Response('wav'));
  await pending;
  assert.equal(s.audio.plays, 0);
  const next = s.player.speak('Next story');
  s.player.dispose();
  resolve(new Response('wav'));
  await next;
  assert.equal(s.audio.plays, 0);
});
test('playing, ended and cancellation release audio and restore the game sound', async () => {
  const s = setup(async () => new Response('wav'));
  await s.player.speak('Story', 'te-IN');
  assert.equal(s.states.at(-1).status, 'playing');
  assert.equal(s.playing.at(-1), true);
  s.events.ended();
  assert.equal(s.playing.at(-1), false);
  assert.equal(s.audio.src, '');
  assert.equal(s.revoked.length, 1);
  await s.player.speak('Next');
  s.player.cancel();
  assert.equal(s.audio.paused, true);
  assert.equal(s.revoked.length, 2);
  s.player.dispose();
});
test('blocked autoplay offers a direct playback retry; server errors remain visible', async () => {
  const s = setup(async () => new Response('wav'));
  s.audio.play = async () => {
    throw new Error('autoplay');
  };
  await s.player.speak('Story');
  assert.equal(s.states.at(-1).status, 'blocked');
  assert.equal(s.playing.at(-1), false);
  s.audio.play = async () => {};
  await s.player.resume();
  assert.equal(s.states.at(-1).status, 'playing');
  s.player.dispose();
  const fail = setup(async () => Response.json({ error: 'Add the server key.' }, { status: 503 }));
  await fail.player.speak('Story');
  assert.equal(fail.states.at(-1).message, 'Add the server key.');
  fail.player.dispose();
});

test('scored turns prefetch, switch voices in order, and reuse audio on replay', async () => {
  const calls = [];
  const s = setup(async (_url, options) => {
    calls.push(JSON.parse(options.body));
    return new Response('wav');
  });
  const cues = [
    { text: 'Grandpa?', character: 'emi', emotion: 'curious', pauseAfterMs: 0 },
    { text: 'Yes?', character: 'haru', emotion: 'warm', pauseAfterMs: 0 },
  ];
  await s.player.speak(cues);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(s.states.at(-1).cue.character, 'emi');
  assert.equal(calls.length, 2);
  s.events.ended();
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.equal(s.states.at(-1).cue.character, 'haru');
  assert.equal(s.audio.plays, 2);
  await s.player.speak(cues);
  assert.equal(calls.length, 2);
  s.player.dispose();
});

test('cancelling a dramatic pause prevents the next voice from starting', async () => {
  const s = setup(async () => new Response('wav'));
  await s.player.speak([
    { text: 'Wait.', character: 'haru', pauseAfterMs: 20 },
    { text: 'All right.', character: 'emi', pauseAfterMs: 0 },
  ]);
  s.events.ended();
  s.player.cancel();
  await new Promise((resolve) => setTimeout(resolve, 40));
  assert.equal(s.audio.plays, 1);
  s.player.dispose();
});

test('prepared branches do not play until selected and language gets its own cache', async () => {
  const calls = [];
  const s = setup(async (_url, options) => {
    calls.push(JSON.parse(options.body));
    return new Response('wav');
  });
  const cue = { text: 'A branch', character: 'emi', emotion: 'warm' };
  s.player.prepare([cue], 'en-IN');
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(s.audio.plays, 0);
  await s.player.speak([cue], 'en-IN');
  assert.equal(calls.length, 1);
  await s.player.speak([cue], 'te-IN');
  assert.equal(calls.length, 2);
  assert.equal(calls[1].language, 'te-IN');
  s.player.dispose();
});
