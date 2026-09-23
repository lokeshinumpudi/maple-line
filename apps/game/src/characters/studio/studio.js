/**
 * Character studio (character-studio.html): a development page for inspecting and tuning
 * the cast with the game's own code. See docs/CHARACTER-STUDIO.md. Not part of any build.
 *
 * Query parameters: character=vrm/riko, clip=idle, t=1.2 (seconds, paused), view=front
 * (maximise one view), ghosts=1, skeleton=1.
 */
import * as THREE from 'three';
import { createModelLoader, createGltfLoader } from '../../rendering/model-loader.js';
import { createVrmLoader } from '../vrm-loader.js';
import { CANONICAL_TO_VRM } from '../humanoid-bones.js';
import { CAST_TUNING, parseTuning } from '../cast-tuning.js';
import { RIG_LAYERS } from '../../world/character-rig.js';
import { VRM_CLIPS } from '../../world/hero-cast.js';
import { createStudioScene } from './studio-scene.js';
import {
  characterEntries,
  createGhosts,
  isGait,
  isSeated,
  loadCharacter,
  baseClip,
} from './studio-character.js';
import {
  footSlide,
  fromFrame,
  ghostTimes,
  groupJitter,
  jitterRms,
  toFrame,
  trimmedTime,
  round,
} from './studio-math.js';
import { h } from './dom.js';
import { buildPanels } from './studio-panels.js';
import { buildPropsPanel } from './studio-props.js';
import { registerStudioTools } from './studio-tools.js';
import { createCapture } from './studio-capture.js';
import { buildRetargetPanel } from './studio-retarget.js';
import { createSaving } from './studio-save.js';

const params = new URLSearchParams(location.search);
const $ = (id) => document.getElementById(id);
const FPS = 30;
const STEP = 1 / 60;

const view = createStudioScene({ canvas: $('gl'), container: $('views') });
const stage = new THREE.Group();
stage.name = 'studio stage';
view.scene.add(stage);

const gltfLoader = createGltfLoader();
const modelLoader = createModelLoader({
  load: (path) => gltfLoader.then((load) => load(path)),
  onError: (path) => toast(`${path} could not load`),
});
const vrmLoader = createVrmLoader();

const state = {
  entryId: null,
  clip: 'idle',
  t: 0,
  playing: true,
  speed: 1,
  loop: true,
  layers: Object.fromEntries([...RIG_LAYERS, 'steering'].map((name) => [name, true])),
  look: 'none',
  mood: 'content',
  show: { model: true, skeleton: false, ghosts: false, feet: true, overlay: true, grid: true },
  follow: true,
  ghosts: { count: 1, spacing: 8, previous: true, next: true },
  propsShown: {},
  joint: 'head',
  faceOverrides: new Map(),
  clipFile: VRM_CLIPS,
};

const minds = {
  expressionFor: () => ({ mood: state.mood, lookAt: state.look === 'train' ? 'train' : undefined }),
};
const lookTarget = new THREE.Mesh(
  new THREE.SphereGeometry(0.04, 16, 12),
  new THREE.MeshBasicMaterial({ color: '#ffd166', depthTest: false }),
);
lookTarget.renderOrder = 20;
lookTarget.position.set(0.6, 1.5, 1.2);
lookTarget.visible = false;
view.scene.add(lookTarget);

// ---- helpers drawn over the body -------------------------------------------------------------

const jointMarker = new THREE.Mesh(
  new THREE.SphereGeometry(0.022, 12, 8),
  new THREE.MeshBasicMaterial({ color: '#7fd1a8', depthTest: false }),
);
jointMarker.renderOrder = 21;
view.scene.add(jointMarker);

const feetGroup = new THREE.Group();
view.scene.add(feetGroup);
const FOOT_COLOURS = {
  planted: '#5fd08f',
  grounded: '#e8d25a',
  sliding: '#ff5a4a',
  swing: '#6a7a82',
};
const footRings = {};
for (const side of ['L', 'R']) {
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(0.045, 0.06, 24),
    new THREE.MeshBasicMaterial({ color: FOOT_COLOURS.swing, depthTest: false, side: 2 }),
  );
  ring.rotation.x = -Math.PI / 2;
  ring.renderOrder = 15;
  feetGroup.add(ring);
  footRings[side] = ring;
}
const TRAIL = 240;
const trailGeometry = new THREE.BufferGeometry();
trailGeometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(TRAIL * 3), 3));
trailGeometry.setAttribute('color', new THREE.BufferAttribute(new Float32Array(TRAIL * 3), 3));
trailGeometry.setDrawRange(0, 0);
const trail = new THREE.Points(
  trailGeometry,
  new THREE.PointsMaterial({
    size: 4,
    sizeAttenuation: false,
    vertexColors: true,
    depthTest: false,
  }),
);
trail.renderOrder = 14;
trail.frustumCulled = false;
feetGroup.add(trail);
let trailCount = 0;
let trailHead = 0;

const bench = new THREE.Mesh(
  new THREE.BoxGeometry(1.1, 0.05, 0.42),
  new THREE.MeshStandardMaterial({ color: '#6b5a48', roughness: 0.8 }),
);
bench.castShadow = bench.receiveShadow = true;
bench.visible = false;
view.scene.add(bench);

let skeletonHelper = null;

// ---- the studio object panels and tools share -------------------------------------------------

const listeners = new Map();
const S = {
  THREE,
  view,
  stage,
  state,
  modelLoader,
  vrmLoader,
  lookTarget,
  loaded: null,
  ghosts: null,
  assets: null,
  entries: [],
  tuning: { cast: parseTuning(CAST_TUNING), studio: { version: 1, overlays: {}, trims: {} } },
  dirty: new Set(),
  studioClips: new Map(), // studio-made AnimationClips by name, per loaded character
  samples: { joint: [], feet: [] },
  on(name, fn) {
    if (!listeners.has(name)) listeners.set(name, new Set());
    listeners.get(name).add(fn);
  },
  emit(name, detail) {
    for (const fn of listeners.get(name) ?? []) fn(detail);
  },
  toast,
  markDirty(file) {
    S.dirty.add(file);
    S.emit('dirty');
  },
};
window.characterStudio = S;

function toast(message, ms = 2600) {
  const node = $('toast');
  node.textContent = message;
  node.style.display = 'block';
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => (node.style.display = 'none'), ms);
}

// ---- clips and trims --------------------------------------------------------------------------

/** The trims key for a clip: the clip file (VRM) or the model (GLB), then the clip name. */
S.clipKey = (clip = state.clip) => {
  const entry = S.loaded?.entry;
  const owner =
    entry?.kind === 'vrm'
      ? String(state.clipFile)
          .replace(/^models\/characters\//, '')
          .replace(/\.vrma$/, '')
      : entry?.id;
  return `${owner}/${clip}`;
};
S.action = (clip = state.clip) => S.loaded?.internals.actions.get(clip) ?? null;
S.duration = (clip = state.clip) => S.action(clip)?.getClip().duration ?? 1;
S.trim = (clip = state.clip) => {
  const saved = S.tuning.studio.trims?.[S.clipKey(clip)];
  const duration = S.duration(clip);
  return {
    start: Math.max(0, Math.min(duration, saved?.in ?? 0)),
    end: Math.max(0, Math.min(duration, saved?.out ?? duration)),
    loop: state.loop,
    saved: Boolean(saved),
  };
};
S.setTrim = (start, end) => {
  const duration = S.duration();
  const trims = { ...S.tuning.studio.trims };
  if (start <= 1e-6 && end >= duration - 1e-6) delete trims[S.clipKey()];
  else trims[S.clipKey()] = { in: round(start, 4), out: round(end, 4) };
  S.tuning.studio = { ...S.tuning.studio, trims };
  S.markDirty('studio-tuning');
  S.emit('trim');
};
S.clipNames = () => [...(S.loaded?.internals.actions.keys() ?? [])];

/** Add a studio-made clip to the hero and its ghosts. */
S.addClip = (name, clip) => {
  const internals = S.loaded.internals;
  clip.name = name;
  const existing = internals.actions.get(name);
  if (existing) {
    existing.stop();
    internals.mixer.uncacheAction(existing.getClip());
  }
  internals.actions.set(name, internals.mixer.clipAction(clip));
  S.studioClips.set(name, clip);
  S.ghosts?.addClip(name, clip);
  S.emit('clips');
};

/**
 * Select a clip. By default the hero settles into it at the trim start (1.5 s of updates
 * with the time held), so the view shows the clip itself; `blend: true` switches the way the
 * game does, and the outgoing clip keeps playing through the cross-fade.
 */
S.setClip = (name, { blend = false, time = null } = {}) => {
  if (!S.loaded || !S.action(name)) return false;
  const previous = S.action(state.clip);
  state.clip = name;
  const trim = S.trim();
  state.t = time ?? trim.start;
  if (blend) {
    if (previous && previous !== S.action(name)) previous.timeScale = state.speed;
  } else {
    S.loaded.figure.walking = false;
    for (let i = 0; i < 90; i++) runHero(STEP);
  }
  resetSamples();
  S.emit('clip');
  return true;
};

S.setTime = (t, { pause = true } = {}) => {
  const trim = S.trim();
  state.t = Math.max(0, Math.min(S.duration(), t));
  if (pause) state.playing = false;
  if (trim && !state.loop) state.t = Math.min(trim.end, Math.max(trim.start, state.t));
  runHero(1 / FPS);
  sample(1 / FPS);
  S.emit('time');
};
S.stepFrame = (n) => {
  state.playing = false;
  const trim = S.trim();
  S.setTime(trimmedTime(state.t + n / FPS, { ...trim, loop: true }));
};
S.play = (playing = !state.playing) => {
  state.playing = playing;
  if (playing) {
    const trim = S.trim();
    if (!state.loop && state.t >= trim.end - 1e-6) state.t = trim.start;
  }
  S.emit('play');
};

// ---- the hero each step -----------------------------------------------------------------------

/** Foot speed (m/s) of a gait clip on this model. */
function footSpeed(clip) {
  const gait = S.loaded.internals.gait;
  const base = baseClip(clip);
  return gait.speeds?.[base] ?? (base === 'hurry' ? gait.hurrySpeed : gait.walkSpeed);
}

function runHero(dt) {
  const L = S.loaded;
  if (!L) return;
  const off = Object.fromEntries(RIG_LAYERS.map((layer) => [layer, state.layers[layer]]));
  L.figure.pose = isSeated(state.clip) ? 'seated' : 'standing';
  L.hero.setDebug({
    clip: state.clip,
    time: state.t,
    timeScale: 0,
    layers: off,
    steering: state.layers.steering ? undefined : false,
    props: state.propsShown,
    trace: true,
  });
  const lookAt =
    state.look === 'camera' ? view.views.persp.camera : state.look === 'target' ? lookTarget : null;
  L.hero.update(dt, {
    camera: lookAt ? { position: lookAt.getWorldPosition(new THREE.Vector3()) } : null,
    portrait: lookAt ? L.personId : null,
    trainPosition:
      state.look === 'train' ? lookTarget.getWorldPosition(new THREE.Vector3()).setY(0) : null,
  });
  applyFaceOverrides();
}

function applyFaceOverrides() {
  const face = S.loaded?.internals.face;
  if (!face?.morphTargetDictionary || S.loaded.internals.actor) return;
  for (const [name, value] of state.faceOverrides) {
    const index = face.morphTargetDictionary[name];
    if (index !== undefined) face.morphTargetInfluences[index] = value;
  }
}

function step(h) {
  const L = S.loaded;
  if (!L) return;
  const playing = state.playing;
  const dt = playing ? h * state.speed : 1e-3;
  if (playing) {
    const trim = S.trim();
    let t = state.t + dt;
    if (t >= trim.end || t < trim.start) {
      if (state.loop) t = trimmedTime(t, trim);
      else {
        t = trim.end;
        state.playing = false;
        S.emit('play');
      }
    }
    state.t = t;
    const gait = isGait(state.clip);
    L.figure.walking = gait;
    L.figure.speed = gait ? footSpeed(state.clip) : 0;
    if (gait) L.figure.position.z += L.figure.speed * dt;
  }
  runHero(dt);
  if (playing) sample(dt);
}

// ---- samples: the selected joint and the feet -------------------------------------------------

const SAMPLE_LIMIT = 240;
function resetSamples() {
  S.samples.joint = [];
  S.samples.feet = [];
  trailCount = 0;
  trailHead = 0;
  trailGeometry.setDrawRange(0, 0);
}

/** The rendered joint for a canonical or raw bone name. */
S.jointNode = (name = state.joint) => {
  const internals = S.loaded?.internals;
  if (!internals) return null;
  return internals.humanoid.raw[name] ?? internals.root.getObjectByName(name) ?? null;
};
/** The animation track that drives a joint in the current clip, if any. */
S.jointTrack = (name = state.joint, clip = S.action()?.getClip()) => {
  if (!clip) return null;
  const internals = S.loaded.internals;
  const target =
    internals.actor && CANONICAL_TO_VRM[name]
      ? `Normalized_${CANONICAL_TO_VRM[name]}.quaternion`
      : `${S.jointNode(name)?.name}.quaternion`;
  return clip.tracks.find((track) => track.name === target) ?? null;
};

const v3 = () => new THREE.Vector3();
function footReadings() {
  const L = S.loaded;
  const raw = L.internals.humanoid.raw;
  const rig = L.internals.rig?.getState();
  const ground = L.figure.position.y;
  const out = {};
  for (const side of ['L', 'R']) {
    const foot = raw[`foot${side}`];
    const toes = raw[`toes${side}`];
    if (!foot) continue;
    const heel = foot.getWorldPosition(v3());
    const toe = toes ? toes.getWorldPosition(v3()) : null;
    out[side] = {
      heel,
      toe,
      height: heel.y - ground - L.footRest[side],
      planted: Boolean(rig?.feet?.[side]?.planted),
    };
  }
  return out;
}

function sample(dt) {
  const L = S.loaded;
  if (!L) return;
  const node = S.jointNode();
  if (node) {
    S.samples.joint.push({ q: node.quaternion.toArray(), dt, t: state.t });
    if (S.samples.joint.length > SAMPLE_LIMIT) S.samples.joint.shift();
  }
  const feet = footReadings();
  const root = L.internals.root.position;
  const contacts = [];
  for (const side of ['L', 'R']) {
    const f = feet[side];
    if (!f) continue;
    contacts.push(f.heel.toArray());
    if (f.toe) contacts.push(f.toe.toArray());
  }
  const previous = S.samples.feet.at(-1);
  for (const side of ['L', 'R']) {
    const f = feet[side];
    if (!f || !previous?.feet?.[side]) continue;
    const before = previous.feet[side].heel;
    f.speed = Math.hypot(f.heel.x - before.x, f.heel.z - before.z) / Math.max(dt, 1e-4);
  }
  S.samples.feet.push({ root: [root.x, root.z], contacts, feet, dt });
  if (S.samples.feet.length > 120) S.samples.feet.shift();
  // The trail: where each heel touched down, coloured by its state.
  for (const side of ['L', 'R']) {
    const f = feet[side];
    if (!f || f.height > 0.04) continue;
    const status = S.footStatus(f);
    const colour = new THREE.Color(FOOT_COLOURS[status]);
    trailGeometry.attributes.position.setXYZ(trailHead, f.heel.x, 0.004, f.heel.z);
    trailGeometry.attributes.color.setXYZ(trailHead, colour.r, colour.g, colour.b);
    trailHead = (trailHead + 1) % TRAIL;
    trailCount = Math.min(TRAIL, trailCount + 1);
  }
  trailGeometry.attributes.position.needsUpdate = true;
  trailGeometry.attributes.color.needsUpdate = true;
  trailGeometry.setDrawRange(0, trailCount);
}

S.footStatus = (f) => {
  const speed = f.speed ?? 0;
  if (f.planted && speed <= 0.12) return 'planted';
  if (f.height < 0.03) return speed > 0.12 ? 'sliding' : 'grounded';
  return 'swing';
};
S.recentSlide = () => footSlide(S.samples.feet);

// ---- measurement ------------------------------------------------------------------------------

/**
 * The CHARACTER-MOTION jitter figure for one clip: RMS angular acceleration of every
 * canonical rendered joint over `seconds` at `fps`, with the current layers, plus foot slide.
 * Runs on the studio's own clock (not wall time); the view stays on the last frame.
 */
S.measureJitter = ({ clip = state.clip, seconds = 5, fps = 60 } = {}) => {
  if (!S.setClip(clip)) throw new Error(`No clip ${clip} on this character`);
  const L = S.loaded;
  const raw = L.internals.humanoid.raw;
  const names = Object.keys(raw);
  const series = Object.fromEntries(names.map((name) => [name, []]));
  const frames = [];
  const wasPlaying = state.playing;
  state.playing = true;
  const dt = 1 / fps;
  const trim = S.trim();
  const gait = isGait(clip);
  L.figure.walking = gait;
  L.figure.speed = gait ? footSpeed(clip) : 0;
  for (let f = 0; f < Math.round(seconds * fps); f++) {
    state.t = trimmedTime(state.t + dt, { ...trim, loop: true });
    if (gait) L.figure.position.z += L.figure.speed * dt;
    runHero(dt);
    for (const name of names) series[name].push(raw[name].quaternion.toArray());
    const feet = footReadings();
    frames.push({
      root: [L.internals.root.position.x, L.internals.root.position.z],
      contacts: ['L', 'R'].flatMap((side) =>
        feet[side]
          ? [feet[side].heel.toArray(), ...(feet[side].toe ? [feet[side].toe.toArray()] : [])]
          : [],
      ),
    });
  }
  state.playing = wasPlaying;
  const perBone = Object.fromEntries(
    names.map((name) => {
      const r = jitterRms(series[name], dt);
      return [name, { rms: round(r.rms, 2), max: round(r.max, 1) }];
    }),
  );
  const groups = Object.fromEntries(
    Object.entries(groupJitter(perBone)).map(([k, value]) => [
      k,
      value === null ? null : round(value, 2),
    ]),
  );
  const slide = footSlide(frames);
  const layersOff = Object.entries(state.layers)
    .filter(([, on]) => !on)
    .map(([name]) => name);
  const result = {
    character: L.entry.id,
    clip,
    seconds,
    fps,
    layersOff,
    groups,
    footSlide: {
      metres: round(slide.slide, 3),
      walked: round(slide.path, 2),
      percent: round(slide.percent, 1),
    },
    bones: perBone,
  };
  S.emit('measured', result);
  return result;
};

// ---- loading ----------------------------------------------------------------------------------

S.loadEntry = async (id, { clip = null } = {}) => {
  const entry = S.entries.find((e) => e.id === id);
  if (!entry) throw new Error(`Unknown character ${id}`);
  setStatus(`Loading ${entry.label}…`);
  const previous = S.loaded;
  S.loaded = null;
  view.transform.detach();
  previous?.hero.dispose();
  S.ghosts?.dispose();
  S.ghosts = null;
  skeletonHelper?.removeFromParent();
  skeletonHelper = null;
  S.studioClips.clear();
  state.faceOverrides.clear();
  state.propsShown = {};
  let loaded;
  try {
    loaded = await loadCharacter({
      entry,
      stage,
      modelLoader,
      vrmLoader,
      minds,
      clipFile: state.clipFile,
    });
  } catch (error) {
    setStatus(`${entry.label} did not load: ${error.message}`);
    throw error;
  }
  S.loaded = loaded;
  state.entryId = id;
  const actor = loaded.internals.actor;
  if (actor?.face) {
    // Face sliders win over the game's face drive for the expressions they hold.
    const flush = actor.face.flush;
    const manager = actor.vrm.expressionManager;
    actor.face.flush = () => {
      flush();
      for (const [name, value] of state.faceOverrides) manager?.setValue(name, value);
    };
  }
  skeletonHelper = new THREE.SkeletonHelper(loaded.internals.root);
  skeletonHelper.material.depthTest = false;
  skeletonHelper.material.transparent = true;
  skeletonHelper.renderOrder = 12;
  skeletonHelper.visible = state.show.skeleton;
  view.scene.add(skeletonHelper);
  const names = S.clipNames();
  const wanted =
    clip && names.includes(clip)
      ? clip
      : names.includes(state.clip)
        ? state.clip
        : names.includes('idle')
          ? 'idle'
          : names[0];
  if (wanted) S.setClip(wanted);
  if (state.show.ghosts) await S.rebuildGhosts();
  const url = new URL(location.href);
  url.searchParams.set('character', id);
  history.replaceState(null, '', url);
  setStatus(`${entry.label} · ${entry.detail} · ${entry.path}`);
  S.emit('character', loaded);
  return loaded;
};

S.rebuildGhosts = async () => {
  S.ghosts?.dispose();
  S.ghosts = null;
  if (!S.loaded || !state.show.ghosts) return;
  const loaded = S.loaded;
  const ghosts = await createGhosts({
    loaded,
    stage,
    vrmLoader,
    modelLoader,
    count: state.ghosts.count,
  });
  if (S.loaded !== loaded) return ghosts.dispose();
  for (const [name, clip] of S.studioClips) ghosts.addClip(name, clip);
  S.ghosts = ghosts;
};

function setStatus(text) {
  $('status').textContent = text;
}

// ---- per animation frame ----------------------------------------------------------------------

let last = performance.now();
let accumulator = 0;
let slowTick = 0;
function frame(now) {
  requestAnimationFrame(frame);
  const real = Math.min(0.1, (now - last) / 1000);
  last = now;
  if (!paused) {
    accumulator += real;
    let steps = 0;
    while (accumulator >= STEP && steps < 4) {
      step(STEP);
      accumulator -= STEP;
      steps++;
    }
    if (steps === 4) accumulator = 0;
  }
  afterStep();
  view.render();
  slowTick += real;
  if (slowTick > 0.1) {
    slowTick = 0;
    S.emit('tick');
  }
}
/** The capture code steps the studio itself and pauses the frame loop. */
let paused = false;
S.pauseLoop = (value) => {
  paused = value;
};
S.step = step;
S.afterStep = afterStep;

function afterStep() {
  const L = S.loaded;
  if (!L) return;
  const root = L.internals.root;
  if (state.follow) view.followTo(root.position);
  root.visible = state.show.model || false;
  // Ghosts: the clip alone at nearby times, shifted along the walk.
  if (S.ghosts) {
    const times = ghostTimes(state.t, {
      count: state.ghosts.count,
      spacing: state.ghosts.spacing,
      fps: FPS,
      trim: S.trim(),
    });
    const speed = isGait(state.clip) ? L.figure.speed : 0;
    S.ghosts.update(state.clip, times, (ghostRoot, k) => {
      ghostRoot.position.copy(root.position);
      ghostRoot.quaternion.copy(root.quaternion);
      ghostRoot.position.z += (k * state.ghosts.spacing * speed) / FPS;
      ghostRoot.visible = state.show.ghosts && (k < 0 ? state.ghosts.previous : state.ghosts.next);
    });
  }
  if (skeletonHelper) skeletonHelper.visible = state.show.skeleton;
  const node = S.jointNode();
  jointMarker.visible = Boolean(node);
  if (node) node.getWorldPosition(jointMarker.position);
  feetGroup.visible = state.show.feet;
  if (state.show.feet) {
    const feet = footReadings();
    const latest = S.samples.feet.at(-1)?.feet ?? {};
    for (const side of ['L', 'R']) {
      const f = feet[side];
      const ring = footRings[side];
      ring.visible = Boolean(f);
      if (!f) continue;
      f.speed = latest[side]?.speed ?? 0;
      ring.position.set(f.heel.x, L.figure.position.y + 0.003, f.heel.z);
      ring.material.color.set(FOOT_COLOURS[S.footStatus(f)]);
      const lift = Math.max(0, f.height);
      ring.scale.setScalar(1 + lift * 6);
    }
  }
  const seated = isSeated(state.clip);
  bench.visible = seated;
  if (seated) {
    const hips = L.internals.humanoid.raw.hips.getWorldPosition(v3());
    const top = L.entry.member?.seatHeight ?? L.internals.gait.seatHeight ?? 0.45;
    bench.position.set(hips.x, top - 0.025, hips.z);
    bench.scale.y = 1;
  }
  lookTarget.visible = state.look === 'target' || state.look === 'train';
  S.emit('frame');
}

// ---- left column: characters and clips --------------------------------------------------------

function renderCharacters() {
  const query = $('char-search').value.trim().toLowerCase();
  const list = $('char-list');
  list.replaceChildren();
  let group = null;
  const shown = S.entries.filter((e) =>
    `${e.label} ${e.path} ${e.group}`.toLowerCase().includes(query),
  );
  for (const entry of shown) {
    if (entry.group !== group) {
      group = entry.group;
      list.append(h('div', { class: 'group' }, group));
    }
    list.append(
      h(
        'div',
        {
          class: `item${entry.id === state.entryId ? ' sel' : ''}`,
          onclick: () => S.loadEntry(entry.id).catch(() => {}),
        },
        entry.label,
        h('small', {}, `${entry.detail} · ${(entry.bytes / 1024).toFixed(0)} KB`),
      ),
    );
  }
  $('char-count').textContent = S.entries.length;
}

function renderCharacterInfo() {
  const L = S.loaded;
  if (!L) return;
  const { internals } = L;
  let bones = 0;
  let triangles = 0;
  internals.root.traverse((node) => {
    if (node.isBone) bones++;
    if (node.isMesh && node.geometry)
      triangles += (node.geometry.index?.count ?? node.geometry.attributes.position.count) / 3;
  });
  const height = L.bindBounds.max.y - L.bindBounds.min.y;
  $('char-info').replaceChildren(
    h(
      'div',
      {},
      `${bones} bones · ${Math.round(triangles / 100) / 10}k tris · ${height.toFixed(2)} m`,
    ),
    h(
      'div',
      {},
      `rig ${internals.humanoid.kind}${internals.humanoid.missing.length ? ` · missing ${internals.humanoid.missing.join(', ')}` : ''}`,
    ),
    h(
      'div',
      {},
      `props: ${internals.props.map((p) => `${p.name} (${p.side})`).join(', ') || 'none'}`,
    ),
  );
}

function renderClips() {
  const L = S.loaded;
  const list = $('clip-list');
  list.replaceChildren();
  if (!L) return;
  const query = $('clip-search').value.trim().toLowerCase();
  const own = S.clipNames();
  const groups = [
    [
      L.entry.kind === 'vrm'
        ? `Cast clips · ${String(state.clipFile).split('/').pop()}`
        : 'Blender GLB clips',
      own.filter((name) => !S.studioClips.has(name)),
    ],
    ['Studio clips (not saved as clips)', own.filter((name) => S.studioClips.has(name))],
  ];
  // The other clip family belongs to the other model of the same person.
  const counterpart = S.entries.find(
    (e) => e.member && e.member === L.entry.member && e.kind !== L.entry.kind,
  );
  if (counterpart && S.otherClips?.[counterpart.kind])
    groups.push([
      `${counterpart.kind === 'vrm' ? 'Cast clips' : 'Blender GLB clips'} · on ${counterpart.detail}`,
      S.otherClips[counterpart.kind].map((name) => ({ name, entry: counterpart })),
    ]);
  let count = 0;
  for (const [title, names] of groups) {
    const items = names.filter((item) =>
      (typeof item === 'string' ? item : item.name).toLowerCase().includes(query),
    );
    if (!items.length) continue;
    list.append(h('div', { class: 'group' }, title));
    for (const item of items) {
      const name = typeof item === 'string' ? item : item.name;
      const other = typeof item === 'string' ? null : item.entry;
      const duration = other ? null : S.duration(name);
      const trimmed = !other && S.tuning.studio.trims?.[S.clipKey(name)];
      count++;
      list.append(
        h(
          'div',
          {
            class: `item${!other && name === state.clip ? ' sel' : ''}${other ? ' off' : ''}`,
            title: other ? `Switches to ${other.label} (${other.detail})` : '',
            onclick: () =>
              other ? S.loadEntry(other.id, { clip: name }).catch(() => {}) : S.setClip(name),
          },
          name,
          h(
            'small',
            {},
            other
              ? 'other model'
              : `${duration.toFixed(2)} s · ${toFrame(duration, FPS)} f${trimmed ? ' · trimmed' : ''}${isGait(name) ? ' · gait' : ''}`,
          ),
        ),
      );
    }
  }
  $('clip-count').textContent = count;
}

// ---- timeline ---------------------------------------------------------------------------------

const track = $('track');
let dragging = null;
function trackX(t, width) {
  return 8 + (t / S.duration()) * (width - 16);
}
function trackT(x, width) {
  return Math.max(0, Math.min(S.duration(), ((x - 8) / (width - 16)) * S.duration()));
}
function drawTrack() {
  const dpr = devicePixelRatio;
  const width = track.clientWidth;
  const height = track.clientHeight;
  if (track.width !== width * dpr) track.width = width * dpr;
  if (track.height !== height * dpr) track.height = height * dpr;
  const g = track.getContext('2d');
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.clearRect(0, 0, width, height);
  if (!S.loaded) return;
  const duration = S.duration();
  const trim = S.trim();
  g.fillStyle = '#1f3a2e';
  g.fillRect(
    trackX(trim.start, width),
    16,
    trackX(trim.end, width) - trackX(trim.start, width),
    height - 22,
  );
  const frames = toFrame(duration, FPS);
  g.fillStyle = '#8b979d';
  g.font = '10px ui-monospace, monospace';
  g.strokeStyle = '#3a454b';
  for (let f = 0; f <= frames; f++) {
    const x = trackX(fromFrame(f, FPS), width);
    const major = f % 5 === 0;
    g.beginPath();
    g.moveTo(x + 0.5, major ? 14 : 18);
    g.lineTo(x + 0.5, 22);
    g.stroke();
    if (major && (frames < 80 || f % 10 === 0)) g.fillText(String(f), x - 3, 10);
  }
  // Keys of the selected joint's track in this clip.
  const keys = S.jointTrack();
  if (keys) {
    g.fillStyle = '#e8b35a';
    for (const time of keys.times) {
      const x = trackX(time, width);
      g.beginPath();
      g.moveTo(x, height - 14);
      g.lineTo(x + 3, height - 10);
      g.lineTo(x, height - 6);
      g.lineTo(x - 3, height - 10);
      g.fill();
    }
  }
  for (const [time, colour] of [
    [trim.start, '#7fd1a8'],
    [trim.end, '#7fd1a8'],
  ]) {
    const x = trackX(time, width);
    g.fillStyle = colour;
    g.fillRect(x - 2, 14, 4, height - 18);
  }
  const x = trackX(state.t, width);
  g.fillStyle = '#ffffff';
  g.fillRect(x - 1, 12, 2, height - 12);
  g.fillStyle = '#d6dde0';
  g.fillText(
    `${state.clip}  ${keys ? `· ${keys.times.length} keys on ${state.joint}` : `· ${state.joint} has no track`}`,
    12,
    35,
  );
}
track.addEventListener('pointerdown', (event) => {
  if (!S.loaded) return;
  const width = track.clientWidth;
  const x = event.offsetX;
  const trim = S.trim();
  if (Math.abs(x - trackX(trim.start, width)) < 6) dragging = 'in';
  else if (Math.abs(x - trackX(trim.end, width)) < 6) dragging = 'out';
  else {
    dragging = 'scrub';
    S.setTime(trackT(x, width));
  }
  track.setPointerCapture(event.pointerId);
});
track.addEventListener('pointermove', (event) => {
  if (!dragging) return;
  const width = track.clientWidth;
  const t = trackT(event.offsetX, width);
  const trim = S.trim();
  const snap = (value) => fromFrame(toFrame(value, FPS), FPS);
  if (dragging === 'scrub') S.setTime(t);
  else if (dragging === 'in') S.setTrim(Math.min(snap(t), trim.end - 1 / FPS), trim.end);
  else S.setTrim(trim.start, Math.max(snap(t), trim.start + 1 / FPS));
});
track.addEventListener('pointerup', () => (dragging = null));

function renderTransport() {
  $('t-play').textContent = state.playing ? '❚❚' : '▶';
  $('t-play').classList.toggle('primary', state.playing);
  if (document.activeElement !== $('t-frame')) $('t-frame').value = toFrame(state.t, FPS);
  const duration = S.duration();
  $('t-total').textContent = `/ ${toFrame(duration, FPS)} · ${state.t.toFixed(3)} s`;
  const trim = S.trim();
  $('t-trim').textContent =
    `in ${toFrame(trim.start, FPS)} · out ${toFrame(trim.end, FPS)}${trim.saved ? ' · saved' : ''}`;
}

function wireTransport() {
  $('t-play').onclick = () => S.play();
  $('t-prev').onclick = () => S.stepFrame(-1);
  $('t-next').onclick = () => S.stepFrame(1);
  $('t-first').onclick = () => S.setTime(S.trim().start);
  $('t-last').onclick = () => S.setTime(S.trim().end);
  $('t-frame').onchange = () => S.setTime(fromFrame(Number($('t-frame').value), FPS));
  $('t-speed').onchange = () => (state.speed = Number($('t-speed').value));
  $('t-loop').onchange = () => (state.loop = $('t-loop').checked);
  $('t-set-in').onclick = () => S.setTrim(Math.min(state.t, S.trim().end - 1 / FPS), S.trim().end);
  $('t-set-out').onclick = () =>
    S.setTrim(S.trim().start, Math.max(state.t, S.trim().start + 1 / FPS));
  $('t-reset-trim').onclick = () => S.setTrim(0, S.duration());
  addEventListener('keydown', (event) => {
    if (['INPUT', 'SELECT', 'TEXTAREA'].includes(document.activeElement?.tagName)) return;
    if (event.code === 'Space') {
      S.play();
      event.preventDefault();
    } else if (event.key === ',') S.stepFrame(-1);
    else if (event.key === '.') S.stepFrame(1);
    else if (event.key === 'Home') S.setTime(S.trim().start);
    else if (event.key === 'End') S.setTime(S.trim().end);
    else if (event.key === 'i') $('t-set-in').click();
    else if (event.key === 'o') $('t-set-out').click();
    else if (event.key === 'w') setGizmoMode('translate');
    else if (event.key === 'e') setGizmoMode('rotate');
  });
  for (const [id, key] of [
    ['show-model', 'model'],
    ['show-skeleton', 'skeleton'],
    ['show-ghosts', 'ghosts'],
    ['show-feet', 'feet'],
    ['show-overlay', 'overlay'],
    ['show-grid', 'grid'],
  ]) {
    $(id).checked = state.show[key];
    $(id).onchange = async () => {
      state.show[key] = $(id).checked;
      if (key === 'ghosts') await S.rebuildGhosts();
      if (key === 'grid') view.setGrid(state.show.grid);
      S.emit('show');
    };
  }
  $('follow').onchange = () => (state.follow = $('follow').checked);
  for (const button of document.querySelectorAll('[data-max]'))
    button.onclick = () => view.maximise(button.dataset.max);
  $('gizmo-translate').onclick = () => setGizmoMode('translate');
  $('gizmo-rotate').onclick = () => setGizmoMode('rotate');
  for (const what of ['body', 'face', 'hands']) $(`frame-${what}`).onclick = () => S.frame(what);
  $('gizmo-space').onclick = () => {
    view.transform.setSpace(view.transform.space === 'local' ? 'world' : 'local');
    $('gizmo-space').textContent = view.transform.space === 'local' ? 'Local' : 'World';
  };
}
function setGizmoMode(mode) {
  view.transform.setMode(mode);
  $('gizmo-translate').classList.toggle('on', mode === 'translate');
  $('gizmo-rotate').classList.toggle('on', mode === 'rotate');
}
S.setGizmoMode = setGizmoMode;

/** Aim the perspective camera at the body, the face or the hands (relative to the body). */
S.frame = (what = 'body') => {
  const L = S.loaded;
  if (!L) return;
  const raw = L.internals.humanoid.raw;
  const at = (node, fallback) => (node ? node.getWorldPosition(v3()) : fallback);
  const root = L.internals.root.position.clone();
  const persp = view.views.persp;
  let target;
  let offset;
  if (what === 'face') {
    target = at(raw.head, root.clone().setY(1.4)).add(new THREE.Vector3(0, 0.06, 0));
    offset = new THREE.Vector3(0.25, 0.02, 0.62);
  } else if (what === 'hands') {
    const l = at(raw.handL, root);
    const r = at(raw.handR, root);
    target = l.add(r).multiplyScalar(0.5);
    offset = new THREE.Vector3(0.75, 0.3, 0.9);
  } else {
    target = root.clone().setY(0.85);
    offset = new THREE.Vector3(2.1, 0.6, 2.9);
  }
  persp.controls.target.copy(target);
  persp.camera.position.copy(target).add(offset);
  persp.controls.update();
};

function renderReadouts() {
  const L = S.loaded;
  if (!L) return;
  const s = L.hero.getState();
  $('readout-persp').textContent =
    `${state.clip} · f ${toFrame(state.t, FPS)} · ${s.kind} · speed ${s.speed.toFixed(2)} m/s`;
  const bounds = new THREE.Box3().setFromObject(L.internals.root);
  $('readout-front').textContent =
    `height ${(L.bindBounds.max.y - L.bindBounds.min.y).toFixed(3)} m (bind) · now ${(bounds.max.y - L.figure.position.y).toFixed(3)} m`;
  const slide = S.recentSlide();
  $('readout-side').textContent =
    `foot slide ${slide.percent.toFixed(1)}% of ${slide.path.toFixed(2)} m (last 2 s)`;
  $('readout-top').textContent =
    `heading ${(s.steering.heading * 57.3).toFixed(1)}° · ${s.steering.resting ? 'resting' : 'moving'}${s.steering.turning ? ' · turning' : ''}`;
}

// ---- boot -------------------------------------------------------------------------------------

async function boot() {
  wireTransport();
  const response = await fetch('/__studio/assets');
  if (!response.ok) throw new Error('The studio needs the Vite dev server (pnpm dev).');
  S.assets = await response.json();
  S.entries = characterEntries(S.assets.characters).sort(
    (a, b) =>
      ['Momiji cast', 'Crowd kit', 'Other models'].indexOf(a.group) -
        ['Momiji cast', 'Crowd kit', 'Other models'].indexOf(b.group) ||
      a.person.localeCompare(b.person) ||
      a.kind.localeCompare(b.kind),
  );
  try {
    const text = (await (await fetch('/__studio/file?name=studio-tuning')).json()).text;
    if (text) S.tuning.studio = JSON.parse(text);
  } catch (error) {
    toast(`studio-tuning.json could not be read: ${error.message}`);
  }
  $('char-search').oninput = renderCharacters;
  $('clip-search').oninput = renderClips;
  const right = $('right');
  buildPanels(S, right);
  buildPropsPanel(S, right);
  buildRetargetPanel(S, right);
  const saving = createSaving(S);
  $('save').onclick = () => saving.review();
  $('download').onclick = () => saving.download();
  const capture = createCapture(S);
  $('capture-still').onclick = () => capture.still({ region: $('capture-view').value });
  $('capture-video').onclick = () => capture.video({ region: $('capture-view').value });
  S.capture = capture;
  S.on('character', () => {
    renderCharacters();
    renderCharacterInfo();
    renderClips();
  });
  S.on('clip', renderClips);
  S.on('clips', renderClips);
  S.on('trim', renderClips);
  S.on(
    'dirty',
    () => ($('save').textContent = `Review and save${S.dirty.size ? ` (${S.dirty.size})` : ''}`),
  );
  S.on('tick', () => {
    renderTransport();
    renderReadouts();
    drawTrack();
  });
  renderCharacters();
  requestAnimationFrame(frame);
  // Clip names of the other model family, for the library's cross-links.
  S.otherClips = {};
  vrmLoader.animations(VRM_CLIPS).then((set) => (S.otherClips.vrm = set?.names ?? []));
  const blender = S.entries.find((e) => e.kind === 'glb' && e.member);
  if (blender)
    modelLoader.get(blender.path).then((gltf) => {
      S.otherClips.glb = gltf?.animations.map((clip) => clip.name) ?? [];
      renderClips();
    });
  registerStudioTools(S);
  const wanted =
    params.get('character') ?? S.entries.find((e) => e.id === 'vrm/riko')?.id ?? S.entries[0]?.id;
  if (params.get('ghosts') === '1') {
    state.show.ghosts = true;
    $('show-ghosts').checked = true;
  }
  if (params.get('skeleton') === '1') {
    state.show.skeleton = true;
    $('show-skeleton').checked = true;
  }
  if (wanted) await S.loadEntry(wanted, { clip: params.get('clip') });
  if (params.has('t')) S.setTime(Number(params.get('t')));
  if (params.get('view')) view.maximise(params.get('view'));
  S.ready = true;
  S.emit('ready');
}

boot().catch((error) => {
  setStatus(error.message);
  console.error(error);
});
