import { enhanceSelect } from './select-menu.js';
import './hud-theme.css';
import { installMobileHUD } from './mobile-hud.js';
import { installPlacesPicker, arrangeSettings } from './places-picker.js';

/** Keep existing controls and actions; reveal the detailed controls when requested. */
export function installSimpleHUD({ store }) {
  const $ = (id) => document.getElementById(id);
  const menu = $('journey-menu');
  const header = document.querySelector('header');
  const footer = document.querySelector('footer');
  const actions = document.createElement('div');
  actions.className = 'simple-header-actions';
  const options = document.createElement('button');
  options.id = 'journey-options';
  options.textContent = 'Settings';
  options.setAttribute('aria-haspopup', 'dialog');
  options.onclick = () => menu.showModal();
  const places = installPlacesPicker($('location'));
  actions.append(places.trigger, $('sound'), options);
  places.footer.append($('create-world'));
  $('create-world').addEventListener('click', () => places.dialog.close());
  header.append(actions);
  $('create-world').textContent = 'Create a world +';
  $('menu-atmosphere').append(document.querySelector('.top-actions'));
  $('menu-travel').append(document.querySelector('.explore-bar'));
  const camera = document.querySelector('.camera-control');
  $('menu-other').append($('restart'));
  if ($('inspect-world')) $('menu-help').append($('inspect-world'));
  $('menu-other').append($('hide-hud'));
  $('autopilot').hidden = true;
  // Preserve extra controls added by the route/editor UI before composing the dock.
  while (footer.firstElementChild) $('menu-other').append(footer.firstElementChild);
  footer.className = 'ride-dock';
  const driving = document.createElement('button');
  driving.id = 'ride-driving';
  driving.setAttribute('aria-controls', 'manual-controls');
  driving.onclick = () => {
    const next = !store.getState().preferences.manualControls;
    store.setPreferences({ manualControls: next });
    const drive = store.getState().drive;
    if (next && drive.autopilot) {
      $('autopilot').click();
      $('drive-lever').value = '0';
      $('drive-lever').dispatchEvent(new Event('input', { bubbles: true }));
    }
    if (!next && !drive.autopilot && !drive.emergency && !drive.doorsOpen && !drive.doorsClosing)
      $('autopilot').click();
  };
  const instruments = document.querySelector('.instruments');
  instruments.id = 'manual-controls';
  instruments.setAttribute('aria-label', 'Manual driving controls');
  const controls = document.createElement('div');
  controls.className = 'ride-controls';
  controls.append($('pause'), camera, driving);
  footer.append(document.querySelector('.journey'), controls);
  const speedometer = document.querySelector('.speed-row');
  speedometer.id = 'speedometer';
  speedometer.setAttribute('role', 'group');
  speedometer.setAttribute('aria-label', 'Speedometer');
  document.body.append(speedometer);
  const caption = document.createElement('span');
  caption.id = 'ride-caption';
  caption.setAttribute('role', 'status');
  controls.append(caption);
  header.append($('world-active-badge'));
  $('journey-menu-close').onclick = () => menu.close();
  $('location').addEventListener('change', () => {
    if ($('location').value !== '') menu.close();
  });

  $('restart').addEventListener('click', () => menu.close());
  $('hide-hud').addEventListener('click', () => menu.close());
  $('inspect-world')?.addEventListener('click', () => menu.close());
  for (const [id, key] of [
    ['train-lights', 'trainLights'],
    ['train-wipers', 'trainWipers'],
  ]) {
    $(id).value = store.getState().preferences[key];
    $(id).onchange = () => store.setPreferences({ [key]: $(id).value });
  }
  $('train-power-flow').checked = store.getState().preferences.powerFlow;
  $('train-power-flow').onchange = () =>
    store.setPreferences({ powerFlow: $('train-power-flow').checked });
  const pickers = [
    ['camera-view', 'Camera view', 'view'],
    ['weather', 'Weather', 'weather'],
    ['mode', 'Journey mode', 'mode'],
    ['train-lights', 'Headlights', 'trainLights'],
    ['train-wipers', 'Windscreen wipers', 'trainWipers'],
  ].map(([id, label, preference]) => ({
    select: $(id),
    preference,
    picker: enhanceSelect($(id), label),
  }));
  const unsubscribePickers = store.subscribe(
    (value) => value.preferences,
    (preferences) => {
      $('sound-volume').style.setProperty('--range-fill', `${preferences.soundVolume * 100}%`);
      for (const { select, preference, picker } of pickers) {
        if (preference) select.value = preferences[preference];
        picker.sync();
        if (!preferences.hudVisible) picker.close();
      }
    },
  );
  $('sound-volume').style.setProperty(
    '--range-fill',
    `${store.getState().preferences.soundVolume * 100}%`,
  );
  function render() {
    const { preferences, drive } = store.getState();
    $('pause').dataset.paused = String(drive.paused);
    document.body.classList.toggle('manual-driving', preferences.manualControls);
    driving.textContent = preferences.manualControls ? 'Sit back' : 'Drive yourself';
    driving.setAttribute('aria-pressed', String(preferences.manualControls));
    driving.setAttribute('aria-expanded', String(preferences.manualControls));
    document.body.classList.toggle('station-challenge', preferences.mode === 'challenge');
    instruments.hidden = !preferences.manualControls;
    const label = drive.emergency
      ? 'Emergency brake on'
      : drive.doorsClosing
        ? 'Doors closing · power locked'
        : drive.doorsOpen
          ? 'Doors open · close them to depart'
          : drive.paused
            ? 'Journey paused'
            : drive.autopilot
              ? 'Auto drive · Take in the view'
              : 'You have the controls.';
    if (caption.textContent !== label) caption.textContent = label;
  }
  const unsubscribe = store.subscribe(
    (value) =>
      `${value.preferences.manualControls}:${value.preferences.mode}:${value.preferences.view}:${value.drive.autopilot}:${value.drive.paused}:${value.drive.emergency}:${value.drive.doorsOpen}:${value.drive.doorsClosing}`,
    render,
  );
  render();
  const disposeSettings = arrangeSettings(menu);
  const disposeMobileHUD = installMobileHUD({ store });
  return () => {
    disposeMobileHUD();
    unsubscribe();
    unsubscribePickers();
    pickers.forEach(({ picker }) => picker.dispose());
    disposeSettings();
    places.dispose();
  };
}
