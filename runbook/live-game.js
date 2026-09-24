// Real game controls are separate from the illustrative diagram's parameters.
const liveSection = document.createElement('section');
liveSection.className = 'live-game';
const loadLive = document.createElement('button');
loadLive.type = 'button';
loadLive.className = 'btn';
loadLive.textContent = 'Load live scene';
const liveStatus = document.createElement('p');
liveStatus.className = 'live-status';
liveStatus.setAttribute('role', 'status');
liveStatus.textContent = 'Loading scene…';
const liveViewport = document.createElement('div');
liveViewport.className = 'live-game-viewport';
liveViewport.hidden = true;
const liveControls = document.createElement('fieldset');
liveControls.className = 'live-controls';
liveControls.hidden = true;
liveControls.disabled = true;
const liveLegend = document.createElement('legend');
liveLegend.textContent = 'Change the live scene';
liveControls.append(liveLegend);
const liveInputs = {};
for (const [key, title, options] of [
  [
    'camera',
    'View',
    [
      ['follow', 'Follow the train'],
      ['scenic', 'Look around'],
      ['cab', 'Driver'],
      ['passenger', 'Passenger'],
      ['vista', 'Scenic lookout'],
    ],
  ],
  [
    'weather',
    'Weather',
    [
      ['clear', 'Clear'],
      ['rain', 'Rain'],
      ['snow', 'Snow'],
    ],
  ],
  [
    'timeOfDay',
    'Light',
    [
      ['daylight', 'Daylight'],
      ['dusk', 'Dusk'],
    ],
  ],
  [
    'location',
    'Place',
    [
      ['gorge', 'River gorge'],
      ['terraces', 'Rice terraces'],
      ['station', 'Station'],
      ['bridge', 'Valley bridge'],
      ['summit', 'Snow country'],
      ['tokyo', 'Tokyo passage'],
    ],
  ],
]) {
  const label = document.createElement('label');
  label.textContent = title;
  const input = document.createElement('select');
  input.setAttribute('aria-label', title);
  for (const [value, text] of options) input.add(new Option(text, value));
  liveInputs[key] = input;
  input.addEventListener('change', () => {
    void changeLive({ [key]: input.value });
  });
  label.append(input);
  liveControls.append(label);
}
const livePlay = document.createElement('button');
livePlay.type = 'button';
livePlay.className = 'btn';
livePlay.textContent = 'Play train';
livePlay.setAttribute('aria-pressed', 'false');
livePlay.addEventListener('click', () => {
  void changeLive(
    latestLiveState?.visual?.focus === 'water'
      ? { waterSpeed: latestLiveState.visual.waterSpeed ? 0 : 1 }
      : { paused: !livePaused },
  );
});
const unloadLive = document.createElement('button');
unloadLive.type = 'button';
unloadLive.className = 'btn';
unloadLive.textContent = 'Close live scene';
liveControls.append(livePlay, unloadLive);
liveSection.append(loadLive, liveViewport, liveControls, liveStatus);
panels.experiment.prepend(liveSection);
const demoPanel = document.createElement('section');
demoPanel.className = 'demo-panel';
const demoTabs = document.createElement('div');
demoTabs.className = 'demo-tabs';
demoTabs.setAttribute('role', 'tablist');
demoTabs.setAttribute('aria-label', 'Choose a demonstration');
const liveTab = document.createElement('button');
const diagramTab = document.createElement('button');
const demoViews = [liveSection, el('mechanism')];
[liveTab, diagramTab].forEach((button, index) => {
  button.type = 'button';
  button.id = `demo-tab-${index}`;
  button.textContent = index ? 'Simplified diagram' : 'Live game';
  button.setAttribute('role', 'tab');
  button.setAttribute('aria-controls', index ? 'maple-mechanism' : 'live-game-panel');
  button.addEventListener('click', () => setDemoView(index));
  button.addEventListener('keydown', (event) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? 1 : 1 - index;
    setDemoView(next);
    [liveTab, diagramTab][next].focus();
  });
  demoTabs.append(button);
});
liveSection.id = 'live-game-panel';
demoViews.forEach((panel, index) => {
  panel.setAttribute('role', 'tabpanel');
  panel.setAttribute('aria-labelledby', `demo-tab-${index}`);
});
let demoView = 0;
function setDemoView(index) {
  demoView = index;
  [liveTab, diagramTab].forEach((button, i) => {
    button.setAttribute('aria-selected', String(i === index));
    button.tabIndex = i === index ? 0 : -1;
    demoViews[i].hidden = i !== index;
  });
  if (index === 0) {
    stopPlayback();
    if (live && !liveLoading) void live.setVisible(!document.hidden).catch(() => {});
  } else {
    if (live && !liveLoading) void live.setVisible(false).catch(() => {});
    autoStartEligible = true;
    refreshActivities();
  }
}
demoPanel.append(demoTabs, liveSection, el('mechanism'));
panels.experiment.append(demoPanel);
let autoLoadAttempted = false;
let live = null,
  livePaused = true,
  liveVisible = false,
  liveLoading = false;
function livePreset() {
  const asset = gameReferences[selected].asset;
  const location =
    {
      bridge: 'bridge',
      station: 'station',
      cast: 'station',
      forest: 'terraces',
      snow: 'summit',
      tokyo: 'tokyo',
    }[asset] || 'gorge';
  return {
    location,
    camera: 'scenic',
    weather: asset === 'rain' ? 'rain' : asset === 'snow' ? 'snow' : 'clear',
    timeOfDay: asset === 'dusk' ? 'dusk' : 'daylight',
    windStrength: null,
    textureDetail: true,
    sceneryDistance: 720,
    focus: 'route',
    surface: 'materials',
    isolation: 'all',
    waterReflection: 1,
    waterRipples: 1,
    waterDepth: 1,
    waterFoam: 1,
    waterSpeed: 1,
    wireframe: false,
    shadows: true,
    fov: null,
    exposure: null,
    roughness: null,
    fogDensity: null,
    // A staged beat of The 17:42 and its caption language; a lone cast member's view.
    beat: null,
    captions: 'en',
    subject: 'meera',
    clip: 'idle',
    pose: 'clip',
    skeleton: false,
    motionLayers: true,
    ...livePresets[selected].options[0].config,
    ...livePresets[selected].initial,
    paused: true,
  };
}
let latestLiveState = null;
function showLiveState(state) {
  latestLiveState = state;
  syncChapterButtons();
  for (const key of ['camera', 'weather', 'timeOfDay', 'location'])
    if (typeof state[key] === 'string') liveInputs[key].value = state[key];
  livePaused = state.paused;
  // A lone cast member keeps playing their clip; the train button has nothing to do there.
  livePlay.hidden = state.visual?.focus === 'cast';
  livePlay.textContent =
    state.visual?.focus === 'water'
      ? state.visual.waterSpeed
        ? 'Pause ripples'
        : 'Play ripples'
      : state.beat
        ? state.paused
          ? 'Play the scene'
          : 'Hold the scene'
        : state.paused
          ? 'Play train'
          : 'Pause train';
  livePlay.setAttribute(
    'aria-pressed',
    String(state.visual?.focus === 'water' ? Boolean(state.visual.waterSpeed) : !state.paused),
  );
  liveStatus.textContent = '';
}
async function changeLive(config) {
  if (!live || liveLoading) return;
  liveControls.disabled = true;
  try {
    await live.configure(config);
  } catch (error) {
    liveStatus.textContent = error.message;
  } finally {
    liveControls.disabled = !live;
  }
}
loadLive.addEventListener('click', async () => {
  if (live || liveLoading) return;
  autoLoadAttempted = true;
  liveLoading = true;
  loadLive.disabled = true;
  loadLive.hidden = true;
  liveStatus.textContent = 'Loading the game renderer…';
  try {
    const { mountMapleLine } = await import(
      new URL('./assets/maple-embed.js', document.baseURI).href
    );
    const config = livePreset();
    liveInputs.location.value = config.location;
    liveViewport.hidden = false;
    live = mountMapleLine(liveViewport, {
      src: new URL('./game/index.html', document.baseURI).href,
      config,
      onState: showLiveState,
    });
    await live.ready;
    if (liveChapter !== selected) liveChapter = selected;
    await live.configure(livePreset());
    liveInputs.location.value = livePreset().location;
    await live.setVisible(liveVisible && demoView === 0 && !document.hidden);
    liveControls.hidden = false;
    liveControls.disabled = false;
    loadLive.hidden = true;
    stopPlayback();
    autoStartEligible = false;
  } catch (error) {
    live?.dispose();
    live = null;
    liveViewport.hidden = true;
    loadLive.hidden = false;
    loadLive.textContent = 'Retry live scene';
    liveStatus.textContent = `The live scene could not load. You can still use the diagram. ${error.message}`;
  } finally {
    liveLoading = false;
    loadLive.disabled = false;
  }
});
unloadLive.addEventListener('click', () => {
  live?.dispose();
  live = null;
  liveControls.hidden = true;
  liveControls.disabled = true;
  liveViewport.hidden = true;
  loadLive.hidden = false;
  liveStatus.textContent = 'Live scene closed. Load it again whenever you want.';
});
const liveObserver = new IntersectionObserver(
  ([entry]) => {
    liveVisible = entry.isIntersecting;
    if (liveVisible && demoView === 0 && !autoLoadAttempted) loadLive.click();
    if (live && !liveLoading)
      void live.setVisible(liveVisible && demoView === 0 && !document.hidden).catch(() => {});
  },
  { threshold: 0.05 },
);
liveObserver.observe(liveSection);
document.addEventListener('visibilitychange', () => {
  if (live && !liveLoading)
    void live.setVisible(liveVisible && demoView === 0 && !document.hidden).catch(() => {});
});
window.addEventListener('pagehide', () => live?.dispose(), { once: true });
let liveChapter = selected;
const updateBeforeLive = update;
update = () => {
  updateBeforeLive();
  if (liveChapter !== selected) {
    liveChapter = selected;
    const config = livePreset();
    liveInputs.location.value = config.location;
    if (live && !liveLoading) void changeLive(config);
  }
};

// Discrete settings avoid requiring a reader to drag a slider.
const exampleSettings = document.createElement('div');
exampleSettings.className = 'example-settings';
exampleSettings.setAttribute('role', 'group');
exampleSettings.setAttribute('aria-label', 'Choose an example setting');
labControls.after(exampleSettings);
function updateExampleSettings() {
  exampleSettings.replaceChildren();
  const lesson = lessons[selected];
  const labels = lesson.values || ['Low setting', 'Middle setting', 'High setting'];
  labels.forEach((label, index) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'btn';
    button.textContent = label;
    button.addEventListener('click', () => {
      autoStartEligible = false;
      stopPlayback();
      values[selected] = Math.round((index * 100) / Math.max(1, labels.length - 1));
      el('parameter').value = values[selected];
      draw();
    });
    exampleSettings.append(button);
  });
}
const updateBeforeSettings = update;
update = () => {
  updateBeforeSettings();
  updateExampleSettings();
};

const embedCodeHeading = document.createElement('h3');
embedCodeHeading.textContent = 'Embed a live scene in your page';
const embedCodeNote = document.createElement('p');
embedCodeNote.textContent =
  'The SDK mounts the same game in an iframe. Host the generated game folder and SDK on your site, then pass a scene configuration. Call dispose when the view is removed.';
const embedCode = document.createElement('pre');
embedCode.tabIndex = 0;
embedCode.textContent = `import { mountMapleLine } from './assets/maple-embed.js';

const scene = mountMapleLine(document.querySelector('#scene'), {
  src: './game/index.html',
  config: {
    camera: 'follow', location: 'bridge',
    weather: 'clear', timeOfDay: 'daylight', paused: true,
  },
});
await scene.ready;
await scene.configure({ weather: 'rain' });
await scene.configure({ paused: false });
// Stage a beat of The 17:42 with Hindi captions (no sound), then end it:
await scene.configure({ beat: 'momiji-exchange', captions: 'hi-IN' });
await scene.configure({ beat: null, camera: 'follow' });
// One cast member alone, in clay, with the skeleton drawn over the body:
await scene.configure({ focus: 'cast', subject: 'meera', clip: 'wave', surface: 'clay', skeleton: true });
console.log(await scene.snapshot());
// Suspend drawing when your view is hidden:
await scene.setVisible(false);
// Remove the iframe and its listeners when finished:
scene.dispose();`;
panels.code.append(embedCodeHeading, embedCodeNote, embedCode);

// Introduce the idea beside its live demonstration, then offer deeper reading.
const lessonStage = document.createElement('div');
lessonStage.className = 'lesson-stage';
const lessonIntroduction = document.createElement('div');
lessonIntroduction.className = 'lesson-introduction';
lessonIntroduction.append(el('title'), technicalName, intro, explanation);
lessonStage.append(lessonIntroduction, panels.experiment);
root.querySelector('.lesson-navigation').after(lessonStage);
const referenceDisclosure = document.createElement('details');
referenceDisclosure.className = 'reference-disclosure';
const referenceSummary = document.createElement('summary');
referenceSummary.textContent = 'Inspect the captured scene';
referenceDisclosure.append(referenceSummary, panels.scene);
extraReading.after(referenceDisclosure);

const referenceBeforeDemo = showReference;
showReference = () => {
  referenceBeforeDemo();
  el('mechanism').hidden = demoView !== 1;
};
setDemoView(0);

const diagramSize = new ResizeObserver(([entry]) => {
  if (entry.contentRect.width > 0) {
    width = Math.max(240, Math.round(entry.contentRect.width));
    draw();
  }
});
diagramSize.observe(el('mechanism'));

const chapterControlTitle = document.createElement('strong');
const chapterControlHint = document.createElement('p');
chapterControlHint.className = 'chapter-control-hint';
const chapterControls = document.createElement('div');
chapterControls.className = 'chapter-live-presets';
chapterControls.setAttribute('role', 'group');
chapterControls.setAttribute('aria-label', 'Chapter live settings');
const moreControls = document.createElement('details');
moreControls.className = 'more-scene-controls';
const moreSummary = document.createElement('summary');
moreSummary.textContent = 'More scene controls';
const moreFields = document.createElement('div');
moreFields.className = 'live-controls';
for (const input of Object.values(liveInputs)) moreFields.append(input.parentElement);
moreFields.append(unloadLive);
moreControls.append(moreSummary, moreFields);
liveControls.append(moreControls);
liveLegend.after(chapterControls);
const controlHelp = document.createElement('details');
controlHelp.className = 'control-help';
const controlHelpTitle = document.createElement('summary');
controlHelpTitle.textContent = 'About these controls';
controlHelp.append(controlHelpTitle, chapterControlTitle, chapterControlHint);
liveControls.append(controlHelp);
const mouseHint = document.createElement('p');
mouseHint.className = 'mouse-hint';
mouseHint.textContent = 'Drag to look around · pinch or scroll to zoom';
liveViewport.after(mouseHint);
const snapshotButton = document.createElement('button');
snapshotButton.type = 'button';
snapshotButton.className = 'btn';
snapshotButton.textContent = 'Read live scene state';
const snapshotOutput = document.createElement('pre');
snapshotOutput.className = 'live-snapshot';
snapshotOutput.hidden = true;
snapshotOutput.tabIndex = 0;
snapshotButton.addEventListener('click', async () => {
  if (!live) return;
  snapshotButton.disabled = true;
  try {
    const state = await live.snapshot();
    snapshotOutput.textContent = JSON.stringify(state, null, 2);
    snapshotOutput.hidden = false;
  } catch (error) {
    liveStatus.textContent = error.message;
  } finally {
    snapshotButton.disabled = false;
  }
});
// A real ray from the camera through the crosshair: the nearest visible mesh it hits.
const inspectButton = document.createElement('button');
inspectButton.type = 'button';
inspectButton.className = 'btn';
inspectButton.textContent = 'Inspect crosshair';
inspectButton.addEventListener('click', async () => {
  if (!live) return;
  inspectButton.disabled = true;
  try {
    const state = await live.inspect();
    snapshotOutput.textContent = JSON.stringify(state.selection, null, 2);
    snapshotOutput.hidden = false;
  } catch (error) {
    liveStatus.textContent = error.message;
  } finally {
    inspectButton.disabled = false;
  }
});
liveControls.append(inspectButton, snapshotButton);
liveStatus.after(snapshotOutput);
let chapterButtons = [];
function syncChapterButtons() {
  if (!latestLiveState) return;
  for (const { button, config } of chapterButtons) {
    button.setAttribute(
      'aria-pressed',
      String(
        Object.entries(config).every(
          ([key, value]) =>
            (Object.hasOwn(latestLiveState, key)
              ? latestLiveState[key]
              : latestLiveState.visual?.[key]) === value,
        ),
      ),
    );
  }
}
function updateChapterControls() {
  const preset = livePresets[selected];
  for (const node of [embedCodeHeading, embedCodeNote, embedCode])
    node.hidden = ![0, 36].includes(selected);
  chapterControlTitle.textContent = preset.title;
  chapterControlHint.textContent = preset.hint;
  chapterControls.replaceChildren();
  chapterButtons = [];
  for (const { label, config } of preset.options) {
    // The shared play/pause button already owns train playback.
    if (Object.keys(config).every((key) => key === 'paused')) continue;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'btn';
    button.textContent = label;
    button.addEventListener('click', async () => {
      if (config.location) liveInputs.location.value = config.location;
      await changeLive(config);
    });
    chapterControls.append(button);
    chapterButtons.push({ button, config });
  }
  syncChapterButtons();
  // Chapter indices from 0: 16 and 37 aim a ray; these read the bridge snapshot.
  const inspects = [15, 36].includes(selected);
  inspectButton.hidden = !inspects;
  snapshotButton.hidden = ![11, 16, 17, 20, 27, 33, 36, 42, 46].includes(selected);
  liveViewport.classList.toggle('show-crosshair', inspects);
  snapshotOutput.hidden = true;
}
const updateBeforeChapterControls = update;
update = () => {
  updateBeforeChapterControls();
  updateChapterControls();
};

const lessonOverview = document.createElement('header');
lessonOverview.className = 'lesson-overview';
lessonOverview.append(el('title'), technicalName, intro);
lessonStage.before(lessonOverview);
lessonIntroduction.remove();
lessonStage.prepend(explanation);
