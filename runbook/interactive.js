// Keep the experiment beside its explanation; reveal optional detail on request.
for (const codeBlock of root.querySelectorAll('pre')) {
  codeBlock.tabIndex = 0;
  codeBlock.setAttribute('aria-label', 'Code example, scroll horizontally to read long lines');
}
const intro = root.querySelector('.lesson-copy');
el('title').after(intro);
const panels = {};
for (const [id, label] of [
  ['scene', 'Scene'],
  ['experiment', 'Experiment'],
  ['code', 'Show code'],
  ['practice', 'Try a question and get the skill'],
]) {
  const optional = id === 'code' || id === 'practice';
  const panel = document.createElement(optional ? 'details' : 'section');
  panel.id = `panel-${id}`;
  panel.className = 'activity-panel';
  if (optional) {
    const summary = document.createElement('summary');
    summary.textContent = label;
    panel.append(summary);
  }
  panels[id] = panel;
  root.append(panel);
}
const technicalName = document.createElement('p');
technicalName.className = 'technical-name';
el('title').after(technicalName);
const technicalExplanation = document.createElement('p');
technicalExplanation.className = 'technical-explanation';
panels.code.append(technicalExplanation);
panels.scene.append(el('game-reference'));
panels.experiment.append(el('mechanism'));
panels.code.append(
  root.querySelector('.view-switch'),
  el('code-title').parentElement,
  el('code').parentElement,
  root.querySelector('.source-row'),
);
panels.practice.append(el('exercise'), el('studio-detail'), skillPanel);
root.querySelector('hr').remove();
const archiveNote = root.querySelector(':scope > .text-small');
if (archiveNote) panels.scene.append(archiveNote);
function refreshActivities() {
  frameScene();
  draw();
  if (experimentVisible && autoStartEligible && !motionPreference.matches && !document.hidden) {
    autoStartEligible = false;
    startPlayback();
  }
}

const photo = el('photo');
const viewport = photo.parentElement;
const plane = document.createElement('div');
plane.className = 'scene-plane';
plane.append(photo, el('highlight'));
viewport.append(plane);
viewport.classList.add('scene-viewport');
const framing = document.createElement('div');
framing.className = 'scene-framing';
const focusButton = document.createElement('button');
focusButton.type = 'button';
focusButton.className = 'btn';
const focusLabel = document.createElement('span');
framing.append(focusLabel, focusButton);
viewport.before(framing);
let fullScene = true;
focusButton.addEventListener('click', () => {
  fullScene = !fullScene;
  frameScene();
});
photo.addEventListener('load', frameScene);
function frameScene() {
  const r = gameReferences[selected],
    spot = r.spots[focusIndex];
  if (!spot || !photo.naturalWidth) return;
  const imageRatio = photo.naturalWidth / photo.naturalHeight;
  let [x, y, w, h] = spot.box.map((n) => n / 100);
  const centerX = x + w / 2,
    centerY = y + h / 2;
  const cropRatio = 16 / 9 / imageRatio;
  w = Math.max(w * 1.18, 0.78, h * 1.18 * cropRatio);
  h = w / cropRatio;
  const overview = fullScene || w >= 1 || h >= 1;
  if (overview) {
    x = 0;
    y = 0;
    w = 1;
    h = 1;
  } else {
    x = Math.max(0, Math.min(1 - w, centerX - w / 2));
    y = Math.max(0, Math.min(1 - h, centerY - h / 2));
  }
  viewport.style.aspectRatio = String(overview ? imageRatio : 16 / 9);
  Object.assign(plane.style, {
    width: `${100 / w}%`,
    left: `${(-100 * x) / w}%`,
    top: `${(-100 * y) / h}%`,
  });
  focusLabel.textContent = `${overview ? 'Full scene' : 'Focused detail'} · ${spot.label}`;
  focusButton.textContent = fullScene ? 'Slightly closer' : 'Show full scene';
  focusButton.setAttribute('aria-pressed', String(fullScene));
}
const referenceBeforeFocus = showReference;
showReference = () => {
  referenceBeforeFocus();
  frameScene();
};
el('hotspots').addEventListener('click', () => {
  fullScene = true;
  frameScene();
});

const labControls = document.createElement('div');
labControls.className = 'lab-controls';
const labHint = document.createElement('p');
labHint.className = 'lab-hint';
// Retain the original diagram's internal parameter without exposing a slider.
el('parameter').closest('.lesson-control').hidden = true;
const motionPreference = matchMedia('(prefers-reduced-motion: reduce)');
let playing = false,
  playbackFrame = 0,
  lastTick = 0,
  playbackValue = 0,
  playbackDirection = 1;
let autoStartEligible = true,
  experimentVisible = false;
const experimentObserver = new IntersectionObserver(
  ([entry]) => {
    experimentVisible = entry.isIntersecting;
    if (!experimentVisible) {
      if (playing) autoStartEligible = true;
      stopPlayback();
    } else refreshActivities();
  },
  { threshold: 0.15 },
);
experimentObserver.observe(el('mechanism'));
const playButton = document.createElement('button');
playButton.type = 'button';
playButton.className = 'btn play-example';
playButton.textContent = 'Play';
playButton.setAttribute('aria-pressed', 'false');
labControls.append(playButton);
function stopPlayback() {
  playing = false;
  cancelAnimationFrame(playbackFrame);
  lastTick = 0;
  playButton.textContent = 'Play';
  playButton.setAttribute('aria-pressed', 'false');
  el('status').setAttribute('aria-live', 'polite');
}
function startPlayback() {
  if (playing || document.hidden || !experimentVisible) return;
  playing = true;
  playbackValue = Number(el('parameter').value);
  lastTick = 0;
  playButton.textContent = 'Pause';
  playButton.setAttribute('aria-pressed', 'true');
  el('status').setAttribute('aria-live', 'off');
  function tick(now) {
    if (!playing) return;
    if (!lastTick) lastTick = now;
    const elapsed = now - lastTick;
    if (elapsed >= 100) {
      playbackValue += (Math.min(elapsed, 200) / 90) * playbackDirection;
      if (playbackValue >= 100) {
        playbackValue = 100;
        playbackDirection = -1;
      }
      if (playbackValue <= 0) {
        playbackValue = 0;
        playbackDirection = 1;
      }
      values[selected] = Math.round(playbackValue);
      el('parameter').value = values[selected];
      draw();
      lastTick = now;
    }
    playbackFrame = requestAnimationFrame(tick);
  }
  playbackFrame = requestAnimationFrame(tick);
}
playButton.addEventListener('click', () => {
  autoStartEligible = false;
  if (playing) stopPlayback();
  else startPlayback();
});
document.addEventListener('visibilitychange', () => {
  if (document.hidden) stopPlayback();
});
motionPreference.addEventListener('change', () => {
  if (motionPreference.matches) stopPlayback();
});
el('mechanism').querySelector('.diagram-heading').after(labHint, labControls);

const explanation = document.createElement('section');
explanation.className = 'concept-explanation';
explanation.setAttribute('aria-label', 'Concept explained');
const explanationCopy = {};
for (const [key, label] of [
  ['howItWorks', 'How it works'],
  ['inScene', 'Reading this scene'],
  ['takeaway', 'What to keep in mind'],
]) {
  const heading = document.createElement('h3');
  heading.textContent = label;
  const paragraph = document.createElement('p');
  explanationCopy[key] = paragraph;
  const section = document.createElement('section');
  section.append(heading, paragraph);
  explanation.append(section);
}
panels.experiment.after(explanation);

const checks = [
  [
    'What chooses which part of the scene appears?',
    'The camera defines the viewpoint.',
    'The scene automatically chooses the viewpoint.',
  ],
  ['Which change alters the silhouette?', 'Change the geometry.', 'Change only the roughness.'],
  [
    'A beam points the wrong way. What should change?',
    'Its rotation or quaternion.',
    'Its material color.',
  ],
  [
    'How can doors move with a carriage and still slide?',
    'Parent the doors to the carriage and animate their local transforms.',
    'Give the doors a fixed world position.',
  ],
  ['What changes the actual height of terrain?', 'Vertex positions.', 'Only the surface color.'],
  [
    'What should stay fixed while comparing roughness?',
    'Geometry, lighting and the viewpoint.',
    'Nothing; change all three at once.',
  ],
  [
    'What can a normal map change?',
    'The shading direction across the surface.',
    'The mesh silhouette and collision geometry.',
  ],
  [
    'Why might an object cast no shadow?',
    'The light, caster and receiver need compatible shadow settings.',
    'Every material automatically produces shadows.',
  ],
  [
    'Why do nearby sleepers look larger?',
    'Perspective projects nearby geometry to a larger screen size.',
    'The geometry must grow near the camera.',
  ],
  [
    'What makes each carriage face along a curved track?',
    'The tangent at its own route position.',
    'A single fixed rotation for the whole train.',
  ],
  [
    'How do you keep motion consistent at different frame rates?',
    'Use elapsed time or travelled distance.',
    'Move the same distance on every rendered frame.',
  ],
  [
    'When is instancing a good fit?',
    'Many objects share geometry and material.',
    'Every object needs an unrelated mesh and material.',
  ],
  [
    'Which input can update wind time for a whole material?',
    'A uniform.',
    'A new mesh for every frame.',
  ],
  [
    'Why hide water during its own scene capture?',
    'To avoid capturing the water recursively.',
    'To permanently remove reflections.',
  ],
  [
    'Does denser visual rain automatically reduce braking grip?',
    'No; the driving simulation must apply that rule.',
    'Yes; rendering particles changes physics.',
  ],
  [
    'How does screen picking find a scene object?',
    'Cast a camera ray through the pointer position.',
    'Read the display color as an object ID in every scene.',
  ],
  [
    'Does hiding a distant mesh free its geometry?',
    'No; visibility and resource lifetime are separate.',
    'Yes; culling always disposes GPU resources.',
  ],
  [
    'When may a shared geometry be disposed?',
    'When no remaining consumer needs it.',
    'Whenever any one chunk leaves view.',
  ],
  [
    'What is tone mapping used for?',
    'Mapping scene brightness into the display range.',
    'Adding missing triangles to a mesh.',
  ],
  [
    'What is a direct fix for coplanar surfaces flickering?',
    'Separate the surfaces or remove the duplicate face.',
    'Add a brighter light.',
  ],
  [
    'Where should a station-stop rule live?',
    'In game state and simulation logic.',
    'Only in the train mesh transform.',
  ],
  [
    'What proves a chapter is finished?',
    'Its intended player experience passes concrete acceptance checks.',
    'Every possible system has been added.',
  ],
  [
    'How can the focal subject become easier to read?',
    'Use contrast and reduce competing detail around it.',
    'Give every object equal contrast and brightness.',
  ],
  [
    'What does a small bevel contribute?',
    'A visible edge that can catch light.',
    'Automatic texture coordinates for every surface.',
  ],
  [
    'How should lighting variants be compared?',
    'Use the same scene and camera.',
    'Change the camera and materials each time.',
  ],
  [
    'How do you check temporal stability?',
    'Inspect the same scene while the camera moves.',
    'Judge only one still image.',
  ],
  [
    'Why add hysteresis to LOD thresholds?',
    'To avoid repeated switching near a boundary.',
    'To force a switch every frame.',
  ],
  [
    'What can reduce a streaming frame spike?',
    'Schedule bounded work across frames.',
    'Build every pending chunk in one frame.',
  ],
  [
    'How should two camera systems share control?',
    'Assign explicit ownership and restore it at handoff.',
    'Let both write the pose in an arbitrary order.',
  ],
  [
    'What makes a planted foot convincing?',
    'Contact stays stable against the ground during the planted phase.',
    'The entire character bobs without checking the feet.',
  ],
  [
    'What should a player action communicate?',
    'A readable response and feedback tied to the result.',
    'The same effect regardless of whether it succeeded.',
  ],
  [
    'How can speech remain audible in a busy scene?',
    'Lower competing layers while speech plays.',
    'Raise every sound equally.',
  ],
  [
    'What makes a route choice consequential?',
    'Later state and play reflect the choice.',
    'Only the button label changes.',
  ],
  [
    'How should two performance samples be compared?',
    'Match viewport, scene, weather and sample duration.',
    'Compare unrelated scenes on different devices.',
  ],
  [
    'How can a signal remain readable without color vision?',
    'Pair color with shape, labels or another cue.',
    'Use red and green alone.',
  ],
  [
    'When should a migrated save replace the original?',
    'After validating the migration and retaining a recovery copy.',
    'Before checking whether the new state can load.',
  ],
];
checks.push([
  'Can a world snapshot alone establish the frame rate?',
  'No. Collect a timed performance sample with its scene context.',
  'Yes. The number of objects proves the frame rate.',
]);
// Chapters 38–49 (runbook/session-lessons.json), in the same order.
checks.push(
  [
    'Why did the characters look better with the same bodies?',
    'Their clips and pose handling changed.',
    'Their meshes got more triangles.',
  ],
  [
    'What should the rig restore before the mixer runs each frame?',
    'The pose the clips made last frame.',
    'The rest pose of every bone.',
  ],
  [
    'How do you know a look-at layer is not fighting the clip?',
    'Jitter with the layer on stays within 10% of the layer off.',
    'The head moves more than it did before.',
  ],
  [
    'Why do tube-built limbs bend like pipes?',
    'They have no edge loops at the joints.',
    'Their material is too shiny.',
  ],
  [
    'What makes a turnaround sheet useful for modelling?',
    'The front, side and back agree in pose and scale.',
    'Each view uses a different pose.',
  ],
  [
    'A wall blocks a planned portrait. What should the director do?',
    'Try nearby angles and keep the first clear one on the same side.',
    'Keep the shot; the dialogue carries the scene.',
  ],
  [
    'How do you test whether a short story reads?',
    'Watch it muted with someone who has not read the script.',
    'Count the number of lines.',
  ],
  [
    'Why step a fixed clock when rendering a video?',
    'Every frame advances by exactly 1/fps, however slow the machine is.',
    'It makes the machine render faster.',
  ],
  [
    'Which translation should a line use first?',
    'A hand-written translation, when the episode has one.',
    'Always the machine translation.',
  ],
  [
    'When should a shared link be size-checked?',
    'Before it is decoded or decompressed.',
    'After its text is shown on screen.',
  ],
  [
    'Why give each agent its own worktree and dev port?',
    'So agents do not overwrite each other’s files or servers.',
    'So all agents can share one dev server.',
  ],
  [
    'What makes a before/after pair fair?',
    'The same camera, weather, time of day and size.',
    'A better camera angle for the after shot.',
  ],
);
if (checks.length !== lessons.length) throw new Error('Every concept needs a practice check.');
const quiz = document.createElement('section');
quiz.className = 'concept-check';
const quizHeading = document.createElement('h4');
quizHeading.textContent = 'Check your understanding';
const quizQuestion = document.createElement('p');
const quizChoices = document.createElement('div');
quizChoices.className = 'quiz-choices';
quizChoices.setAttribute('role', 'group');
quizQuestion.id = 'practice-question';
quizChoices.setAttribute('aria-labelledby', quizQuestion.id);
const quizFeedback = document.createElement('p');
quizFeedback.setAttribute('role', 'status');
quiz.append(quizHeading, quizQuestion, quizChoices, quizFeedback);
panels.practice.querySelector('summary').after(quiz);
function renderCheck() {
  const [question, right, wrong] = checks[selected];
  quizQuestion.textContent = question;
  quizFeedback.textContent = '';
  quizChoices.replaceChildren();
  const choices = selected % 2 ? [wrong, right] : [right, wrong];
  for (const answer of choices) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'btn';
    button.textContent = answer;
    button.setAttribute('aria-pressed', 'false');
    button.addEventListener('click', () => {
      for (const sibling of quizChoices.children)
        sibling.setAttribute('aria-pressed', String(sibling === button));
      quizFeedback.textContent =
        answer === right
          ? `Correct. ${lessons[selected].definition}`
          : `Try again. ${lessons[selected].definition}`;
    });
    quizChoices.append(button);
  }
}
const extraReading = document.createElement('div');
extraReading.className = 'extra-reading';
explanation.after(extraReading);
let lastConcept = -1;
const updateBeforeActivities = update;
update = () => {
  if (lastConcept !== selected) {
    stopPlayback();
    autoStartEligible = true;
    playbackDirection = 1;
    focusIndex = 0;
    fullScene = true;
    extraReading.replaceChildren();
    for (const workflow of plainConcepts[selected].workflows || []) {
      const card = document.createElement('article');
      card.className = 'agent-workflow';
      const title = document.createElement('h3');
      title.textContent = workflow.title;
      const question = document.createElement('p');
      question.className = 'agent-question';
      question.textContent = workflow.question;
      const callHeading = document.createElement('h4');
      callHeading.textContent = '1. Ask the game';
      const calls = document.createElement('pre');
      calls.tabIndex = 0;
      calls.textContent = workflow.calls;
      card.append(title, question, callHeading, calls);
      for (const [key, label] of [
        ['evidence', '2. Read the evidence'],
        ['decision', '3. Choose the next action'],
        ['verify', '4. Verify the change'],
      ]) {
        const heading = document.createElement('h4');
        heading.textContent = label;
        const paragraph = document.createElement('p');
        paragraph.textContent = workflow[key];
        card.append(heading, paragraph);
      }
      extraReading.append(card);
    }
    for (const { heading, body } of plainConcepts[selected].sections || []) {
      const section = document.createElement('section');
      const title = document.createElement('h3');
      title.textContent = heading;
      const paragraph = document.createElement('p');
      paragraph.textContent = body;
      section.append(title, paragraph);
      extraReading.append(section);
    }
    const references = document.createElement('p');
    references.className = 'reading-references';
    for (const { label, url } of plainConcepts[selected].references || []) {
      const link = document.createElement('a');
      link.href = url;
      link.textContent = label;
      references.append(link);
    }
    if (references.childElementCount) extraReading.append(references);
    extraReading.hidden = !extraReading.childElementCount;
    lastConcept = selected;
    renderCheck();
  }
  updateBeforeActivities();
  el('title').textContent =
    `${String(selected + 1).padStart(2, '0')} / ${lessons[selected].plainTitle}`;
  technicalName.textContent = `Developer terms: ${lessons[selected].title}`;
  technicalExplanation.textContent = lessons[selected].technicalDefinition;
  const diagramNote = lessons[selected].measured
    ? `The bars use values measured in the game on ${lessons[selected].measured}; their lengths are to scale within each row.`
    : 'This is a teaching diagram, not a measurement of the game.';
  labHint.textContent = `${lessons[selected].watch} It plays automatically; pause whenever you want to look more closely. ${diagramNote}`;
  for (const [key, paragraph] of Object.entries(explanationCopy)) {
    paragraph.textContent = plainConcepts[selected][key];
  }
  refreshActivities();
};
