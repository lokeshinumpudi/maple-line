import test from 'node:test';
import assert from 'node:assert/strict';
import { drivingAction } from '../src/ui/driving-input.js';

test('WASD and arrow controls share train actions', () => {
  for (const [code, action] of Object.entries({
    KeyW: 'power',
    ArrowUp: 'power',
    KeyS: 'brake',
    ArrowDown: 'brake',
    KeyA: 'coast',
    KeyX: 'coast',
    KeyD: 'doors',
  }))
    assert.equal(drivingAction({ code }), action);
});
test('typing, menus and button activation cannot move the train', () => {
  assert.equal(drivingAction({ code: 'KeyW', target: { closest: () => ({}) } }), null);
  assert.equal(drivingAction({ code: 'KeyW' }, { menuOpen: true }), null);
  assert.equal(
    drivingAction({
      code: 'Space',
      target: { closest: (selector) => (selector.includes('button') ? {} : null) },
    }),
    null,
  );
  assert.equal(drivingAction({ code: 'KeyW', metaKey: true }), null);
});
test('stopped story conversations protect motion and repeated keys only step notches', () => {
  for (const code of ['KeyW', 'KeyS', 'KeyA', 'Space', 'KeyR'])
    assert.equal(drivingAction({ code }, { dialogue: true }), null);
  assert.equal(drivingAction({ code: 'KeyW', repeat: true }), 'power');
  assert.equal(drivingAction({ code: 'KeyS', repeat: true }), 'brake');
  for (const code of ['KeyD', 'KeyE', 'Space', 'KeyR', 'KeyH'])
    assert.equal(drivingAction({ code, repeat: true }), null);
});

test('holding a notch repeats, release avoids an extra notch, and cancellation stops it', async (t) => {
  const { installNotchHold } = await import('../src/ui/driving-input.js');
  const previousWindow = globalThis.window;
  const previousDocument = globalThis.document;
  globalThis.window = new EventTarget();
  globalThis.document = new EventTarget();
  t.after(() => {
    globalThis.window = previousWindow;
    globalThis.document = previousDocument;
  });
  t.mock.timers.enable({ apis: ['setTimeout', 'setInterval'] });
  const button = new EventTarget();
  button.setPointerCapture = () => {};
  const emit = (type, values = {}) => {
    const event = new Event(type);
    Object.assign(event, values);
    button.dispatchEvent(event);
  };
  let notches = 0;
  const dispose = installNotchHold(button, () => notches++);
  t.after(dispose);
  emit('pointerdown', { button: 0, pointerId: 1 });
  t.mock.timers.tick(349);
  assert.equal(notches, 0);
  t.mock.timers.tick(1);
  assert.equal(notches, 1);
  t.mock.timers.tick(160);
  assert.equal(notches, 2);
  emit('pointerup');
  emit('click', { detail: 1 });
  t.mock.timers.tick(1000);
  assert.equal(notches, 2);
  emit('pointerdown', { button: 0, pointerId: 2 });
  emit('pointercancel');
  t.mock.timers.tick(1000);
  assert.equal(notches, 2);
  emit('click', { detail: 0 });
  assert.equal(notches, 3, 'keyboard activation still moves one notch');
  emit('pointerdown', { button: 0, pointerId: 3 });
  window.dispatchEvent(new Event('blur'));
  t.mock.timers.tick(1000);
  assert.equal(notches, 3);
});
