const bindings = {
  KeyW: 'power',
  ArrowUp: 'power',
  KeyS: 'brake',
  ArrowDown: 'brake',
  KeyA: 'coast',
  KeyX: 'coast',
  KeyD: 'doors',
  KeyE: 'emergency',
  Space: 'pause',
  KeyR: 'restart',
  KeyH: 'hud',
  KeyC: 'camera',
};
const motionActions = new Set(['power', 'brake', 'coast', 'pause', 'restart']);

/** Resolve shortcuts without taking keys from menus, text fields or activation. */
export function drivingAction(event, { menuOpen = false, dialogue = false } = {}) {
  if (menuOpen || event.ctrlKey || event.metaKey || event.altKey) return null;
  const target = event.target;
  if (target?.closest?.('input, select, textarea, [contenteditable="true"], [role="combobox"]'))
    return null;
  if (
    ['Space', 'Enter'].includes(event.code) &&
    target?.closest?.('button, a, summary, [role="button"]')
  )
    return null;
  const action = bindings[event.code];
  if (!action || (dialogue && motionActions.has(action))) return null;
  if (event.repeat && action !== 'power' && action !== 'brake') return null;
  return action;
}

/** A tap moves one notch; holding repeats until release, cancel or loss of focus. */
export function installNotchHold(button, action) {
  const abort = new AbortController();
  let delay, repeat;
  let repeated = false;
  const stop = () => {
    clearTimeout(delay);
    clearInterval(repeat);
  };
  const on = (target, type, handler) =>
    target.addEventListener(type, handler, { signal: abort.signal });
  on(button, 'pointerdown', (event) => {
    if (event.button !== 0) return;
    stop();
    repeated = false;
    button.setPointerCapture(event.pointerId);
    delay = setTimeout(() => {
      repeated = true;
      action();
      repeat = setInterval(action, 160);
    }, 350);
  });
  on(button, 'pointerup', stop);
  on(button, 'pointercancel', stop);
  on(button, 'lostpointercapture', stop);
  on(window, 'blur', stop);
  on(document, 'visibilitychange', stop);
  on(button, 'click', (event) => {
    if (!repeated || event.detail === 0) action();
    repeated = false;
  });
  return () => {
    stop();
    abort.abort();
  };
}
