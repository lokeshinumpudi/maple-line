import './mobile-hud.css';

/** Keep the valley clear on phones without changing the saved HUD preference. */
export function installMobileHUD({ store }) {
  const media = window.matchMedia('(max-width: 700px), (max-height: 500px) and (pointer: coarse)');
  const abort = new AbortController();
  const on = (target, type, handler, options = {}) =>
    target.addEventListener(type, handler, { ...options, signal: abort.signal });
  const menu = document.getElementById('journey-menu');
  const entry = document.createElement('button');
  entry.id = 'mobile-hud-toggle';
  entry.type = 'button';
  entry.setAttribute('aria-controls', 'speedometer mobile-ride-controls');
  document.querySelector('.ride-controls').id = 'mobile-ride-controls';
  document.body.append(entry);

  const shortcuts = document.createElement('div');
  shortcuts.className = 'mobile-hud-shortcuts';
  shortcuts.setAttribute('aria-label', 'Ride actions');
  const targets = [
    ['Places', '#places-toggle'],
    ['Notebook', '.ml-story-launch'],
    ['Sound', '#sound'],
    ['Drive yourself', '#ride-driving'],
  ];
  for (const [label, selector] of targets) {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = label;
    button.dataset.target = selector;
    on(button, 'click', () => {
      menu.close();
      document.querySelector(selector)?.click();
      reveal();
    });
    shortcuts.append(button);
  }
  menu.querySelector('.settings-tabs').before(shortcuts);

  let timer;
  let held = false;
  let resting = true;
  const active = () => media.matches && store.getState().drive.started;
  const blocked = () =>
    held ||
    document.querySelector('dialog[open], [popover]:popover-open') ||
    document.activeElement?.matches('input:focus, textarea:focus, select:focus') ||
    (document.activeElement !== entry && document.activeElement?.matches(':focus-visible'));
  function paint() {
    const hidden = resting || !store.getState().preferences.hudVisible;
    document.body.classList.toggle('mobile-hud-resting', active() && hidden);
    entry.hidden = !active();
    entry.textContent = hidden ? 'Controls' : 'Hide';
    entry.setAttribute('aria-label', hidden ? 'Show controls' : 'Hide controls');
    entry.setAttribute('aria-expanded', String(!hidden));
    for (const button of shortcuts.children) {
      const target = document.querySelector(button.dataset.target);
      if (target && button.dataset.target !== '.ml-story-launch')
        button.textContent = target.textContent;
    }
  }
  function schedule() {
    clearTimeout(timer);
    if (!active() || resting) return;
    timer = setTimeout(() => {
      if (blocked()) schedule();
      else {
        resting = true;
        paint();
      }
    }, 3500);
  }
  function reveal() {
    if (!active()) return;
    resting = false;
    paint();
    schedule();
  }
  on(entry, 'click', () => {
    if (resting || !store.getState().preferences.hudVisible) {
      store.setPreferences({ hudVisible: true });
      reveal();
    } else {
      resting = true;
      clearTimeout(timer);
      paint();
    }
  });
  on(
    document,
    'pointerdown',
    (event) => {
      held = true;
      if (event.target !== entry) reveal();
    },
    { passive: true },
  );
  on(
    document,
    'pointerup',
    () => {
      held = false;
      schedule();
    },
    { passive: true },
  );
  on(
    document,
    'pointercancel',
    () => {
      held = false;
      schedule();
    },
    { passive: true },
  );
  on(window, 'blur', () => {
    held = false;
    schedule();
  });
  on(document, 'keydown', reveal);
  on(document, 'input', schedule);
  on(
    document,
    'close',
    () => {
      paint();
      schedule();
    },
    { capture: true },
  );
  on(media, 'change', () => {
    resting = true;
    clearTimeout(timer);
    paint();
  });
  const unsubscribe = store.subscribe(
    (state) =>
      `${state.drive.started}:${state.preferences.hudVisible}:${state.preferences.manualControls}:${state.preferences.sound}`,
    () => {
      paint();
      schedule();
    },
  );
  paint();
  return () => {
    clearTimeout(timer);
    abort.abort();
    unsubscribe();
    entry.remove();
    shortcuts.remove();
    document.body.classList.remove('mobile-hud-resting');
  };
}
