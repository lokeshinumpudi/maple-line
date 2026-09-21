import './station-duties-panel.css';

/** Compact station task card; every button uses the same validated action path as agents. */
export function mountStationDutiesPanel({ duties, onAction }) {
  const root = document.createElement('section');
  root.className = 'station-duty-card';
  root.setAttribute('aria-label', 'Momiji station duties');
  root.hidden = true;
  root.addEventListener('keydown', (event) => {
    // Keep H available to restore the HUD; focused buttons must not drive the train.
    if (event.key?.toLowerCase() !== 'h') event.stopPropagation();
    if (event.key === 'Escape') {
      event.preventDefault();
      setCollapsed(true);
      toggle.focus({ preventScroll: true });
    }
  });
  const header = document.createElement('div');
  header.className = 'station-duty-header';
  const kicker = document.createElement('p');
  kicker.className = 'station-duty-kicker';
  const toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.className = 'station-duty-toggle';
  toggle.setAttribute('aria-controls', 'station-duty-details');
  const details = document.createElement('div');
  details.id = 'station-duty-details';
  const title = document.createElement('h2');
  title.tabIndex = -1;
  const message = document.createElement('p');
  message.className = 'station-duty-message';
  message.setAttribute('aria-live', 'polite');
  const progressRow = document.createElement('div');
  progressRow.className = 'station-duty-progress';
  const progressLabel = document.createElement('span');
  const progress = document.createElement('progress');
  progress.max = 1;
  progressRow.append(progressLabel, progress);
  const actions = document.createElement('div');
  actions.className = 'station-duty-actions';
  const feedback = document.createElement('p');
  feedback.className = 'station-duty-feedback';
  feedback.setAttribute('role', 'status');
  header.append(kicker, toggle);
  details.append(title, message, progressRow, actions, feedback);
  root.append(header, details);
  document.body.append(root);
  let lastPhase = null;
  let collapsed = false;
  let disposed = false;
  const setText = (node, value) => {
    if (node.textContent !== value) node.textContent = value;
  };
  function setCollapsed(value) {
    collapsed = value;
    details.hidden = value;
    root.classList.toggle('is-collapsed', value);
    toggle.textContent = value ? 'Show duties' : '−';
    toggle.setAttribute('aria-expanded', String(!value));
    toggle.setAttribute('aria-label', value ? 'Show station duties' : 'Minimize station duties');
  }
  toggle.addEventListener('click', () => setCollapsed(!collapsed));
  setCollapsed(false);
  const buttons = {
    routing: [
      ['route-passenger', 'Mountain passenger service'],
      ['route-freight', 'Freight delivery siding'],
    ],
    boarding: [['open-doors', 'Open platform doors']],
    closing: [['close-doors', 'Close doors']],
    dispatch: [['request-clearance', 'Request the line']],
    ready: [['depart', 'Ring bell & depart']],
  };
  const titles = {
    routing: 'Check the service card.',
    boarding: 'Give everyone a moment.',
    closing: 'Ready on the platform?',
    dispatch: 'Ask before you set off.',
    passing: 'Let the valley local pass.',
    ready: 'The line is yours.',
  };
  const steps = { routing: 1, boarding: 2, closing: 2, dispatch: 3, passing: 3, ready: 4 };
  function render() {
    if (disposed) return;
    const state = duties.getState();
    root.hidden = !state.active || document.hidden;
    document.body.classList.toggle('station-duty-active', state.active);
    if (!state.active) {
      lastPhase = null;
      setCollapsed(false);
      return;
    }
    setText(kicker, `MOMIJI · ${steps[state.phase] ?? 1} / 4`);
    setText(title, titles[state.phase] ?? 'At the station');
    setText(message, state.message ?? '');
    root.dataset.phase = state.phase;
    progressRow.hidden = !['boarding', 'passing'].includes(state.phase);
    const passing = state.phase === 'passing';
    const fraction = passing ? state.passingProgress : state.boardingProgress;
    progress.value = Math.max(0, Math.min(1, Number(fraction) || 0));
    const remaining = Math.ceil(
      passing ? state.passingSecondsRemaining : state.boardingSecondsRemaining,
    );
    const progressText = passing
      ? `Signal at red · ${remaining}s remaining`
      : progress.value > 0
        ? `Passengers boarding · ${remaining}s remaining`
        : 'Boarding begins with doors fully open';
    setText(progressLabel, progressText);
    progress.setAttribute(
      'aria-label',
      passing ? 'Waiting for a clear line' : 'Passenger boarding',
    );
    progress.setAttribute('aria-valuetext', progressText);
    const hadActionFocus = actions.contains(document.activeElement);
    const phaseChanged = lastPhase !== state.phase;
    if (phaseChanged) {
      lastPhase = state.phase;
      feedback.textContent = '';
      actions.replaceChildren();
      for (const [action, label] of buttons[state.phase] ?? []) {
        const button = document.createElement('button');
        button.type = 'button';
        button.textContent = label;
        button.dataset.dutyAction = action;
        button.addEventListener('click', () => {
          const result = onAction(action);
          feedback.textContent = result?.ok === false ? result.message : '';
        });
        actions.append(button);
      }
    }
    for (const button of actions.querySelectorAll('button')) {
      button.disabled = !state.availableActions.includes(button.dataset.dutyAction);
    }
    if (phaseChanged && hadActionFocus && !root.hidden && !collapsed) {
      (actions.querySelector('button:not(:disabled)') ?? title).focus({ preventScroll: true });
    }
  }
  const visibilityChanged = () => render();
  document.addEventListener('visibilitychange', visibilityChanged);
  const unsubscribe = duties.subscribe(render);
  render();
  return {
    dispose() {
      disposed = true;
      unsubscribe();
      document.removeEventListener('visibilitychange', visibilityChanged);
      root.remove();
      document.body.classList.remove('station-duty-active');
    },
  };
}
