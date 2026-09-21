import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { createGameStore } from '../src/state/game-store.js';

const main = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
function harness() {
  const choice = { checked: true };
  const calls = [];
  const context = vm.createContext({
    sound: createGameStore().getState().preferences.sound,
    audioCtx: undefined,
    $: () => choice,
    setSound: (enabled) => calls.push(enabled),
  });
  const source = main.slice(
    main.indexOf('function activateRideSound()'),
    main.indexOf('function start()'),
  );
  vm.runInContext(source, context);
  return { context, choice, calls, start: () => context.activateRideSound() };
}

test('sound is enabled by default but audio activation still occurs on the start gesture', () => {
  const h = harness();
  assert.equal(h.context.sound, true);
  h.start();
  assert.deepEqual(h.calls, [true]);
});

test('a suspended context resumes on a start gesture without restarting an active context', () => {
  const h = harness();
  h.context.audioCtx = { state: 'suspended' };
  h.start();
  h.context.audioCtx.state = 'running';
  h.start();
  assert.deepEqual(h.calls, [true]);
});

test('unchecked sound and explicit mute stay silent when beginning or restarting', () => {
  const h = harness();
  h.choice.checked = false;
  h.start();
  assert.deepEqual(h.calls, [false]);
  h.context.sound = false;
  h.start();
  assert.deepEqual(h.calls, [false]);
});
