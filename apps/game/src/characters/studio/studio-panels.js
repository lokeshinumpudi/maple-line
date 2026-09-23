/**
 * Right-hand panels of the character studio: joints (tree and jitter graph), motion
 * layers, ghosts, grounding, face, concept overlays and clip editing. Props are in
 * studio-props.js, retargeting in studio-retarget.js.
 */
import * as THREE from 'three';
import { CANONICAL_TO_VRM } from '../humanoid-bones.js';
import { moodSmile } from '../../world/hero-cast.js';
import { syllableVowel, VISEMES } from '../vrm-expressions.js';
import {
  angularSeries,
  correctionWeight,
  DEFAULT_OVERLAY,
  fitOverlayToBody,
  inkBounds,
  mirrorClipData,
  quaternionFromEulerDegrees,
  round,
} from './studio-math.js';
import { baseClip } from './studio-character.js';
import { checkbox, fmt, h, section, select, slider } from './dom.js';

const LAYER_LABELS = {
  life: 'Breathing and idle life',
  look: 'Look-at',
  hands: 'Arm IK (cradle, second hand)',
  grip: 'Grip curl',
  feet: 'Foot IK and planting',
  steering: 'Steering',
};

export function buildPanels(S, root) {
  root.append(
    jointsPanel(S),
    layersPanel(S),
    ghostsPanel(S),
    groundingPanel(S),
    facePanel(S),
    overlayPanel(S),
    clipEditPanel(S),
  );
}

// ---- joints -------------------------------------------------------------------------------

function jointsPanel(S) {
  const search = h('input', { type: 'search', placeholder: 'Find a joint' });
  let humanoidOnly = true;
  const tree = h('div', { class: 'tree' });
  const graph = h('canvas', { class: 'graph' });
  const numbers = h('div', { class: 'mono dim' });
  const seconds = h('input', { type: 'number', value: 5, min: 1, max: 30, style: 'width:52px' });
  const result = h('div', { class: 'mono', style: 'white-space:pre;font-size:11px' });

  function renderTree() {
    tree.replaceChildren();
    const L = S.loaded;
    if (!L) return;
    const canonicalOf = new Map(
      Object.entries(L.internals.humanoid.raw).map(([name, node]) => [node, name]),
    );
    const query = search.value.trim().toLowerCase();
    const visit = (node, depth) => {
      const canonical = canonicalOf.get(node);
      const counts = !humanoidOnly || canonical;
      if (node.isBone && counts) {
        const label = canonical ?? node.name;
        const text = `${label} ${node.name}`.toLowerCase();
        if (!query || text.includes(query))
          tree.append(
            h(
              'div',
              {
                class: `node${S.state.joint === label ? ' sel' : ''}`,
                style: `padding-left:${4 + depth * 10}px`,
                onclick: () => {
                  S.state.joint = label;
                  S.samples.joint = [];
                  renderTree();
                  S.emit('joint');
                },
              },
              label,
              canonical && canonical !== node.name ? h('small', {}, node.name) : null,
            ),
          );
      }
      for (const child of node.children) visit(child, depth + (node.isBone && counts ? 1 : 0));
    };
    visit(L.internals.root, 0);
  }

  function drawGraph() {
    const samples = S.samples.joint;
    const dpr = devicePixelRatio;
    const width = graph.clientWidth;
    const height = graph.clientHeight;
    if (!width) return;
    graph.width = width * dpr;
    graph.height = height * dpr;
    const g = graph.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, width, height);
    if (samples.length < 3) {
      numbers.textContent = 'Play or step the clip to sample the joint.';
      return;
    }
    const dt = samples.at(-1).dt;
    const { velocity, acceleration } = angularSeries(
      samples.map((s) => s.q),
      dt,
    );
    const vMax = Math.max(1, ...velocity);
    const aMax = Math.max(10, ...acceleration);
    const plot = (values, max, colour) => {
      g.strokeStyle = colour;
      g.beginPath();
      values.forEach((value, i) => {
        const x = (i / (240 - 1)) * width;
        const y = height - 4 - (value / max) * (height - 12);
        if (i) g.lineTo(x, y);
        else g.moveTo(x, y);
      });
      g.stroke();
    };
    plot(velocity, vMax, '#6aa7ff');
    plot(acceleration, aMax, '#ffb35c');
    const valid = acceleration.slice(2);
    const rms = Math.sqrt(valid.reduce((a, b) => a + b * b, 0) / Math.max(1, valid.length));
    numbers.replaceChildren(
      h(
        'span',
        {},
        h('i', { class: 'swatch', style: 'background:#6aa7ff' }),
        `ω ${fmt(velocity.at(-1), 2)} rad/s (max ${fmt(vMax, 1)})`,
      ),
      h('br'),
      h(
        'span',
        {},
        h('i', { class: 'swatch', style: 'background:#ffb35c' }),
        `α ${fmt(acceleration.at(-1), 1)} rad/s² · rms ${fmt(rms, 1)} · max ${fmt(aMax, 0)}`,
      ),
      h('br'),
      `${samples.length} samples at ${fmt(1 / dt, 0)} Hz`,
    );
  }

  const measure = h(
    'button',
    {
      onclick: () => {
        const r = S.measureJitter({ seconds: Number(seconds.value) || 5 });
        const lines = [
          `${r.character} · ${r.clip} · ${r.seconds} s at ${r.fps} Hz`,
          `layers off: ${r.layersOff.join(', ') || 'none'}`,
          ...Object.entries(r.groups).map(
            ([k, v]) => `${k.padEnd(9)} ${v === null ? '–' : v.toFixed(2)} rad/s²`,
          ),
          `foot slide ${r.footSlide.percent}% of ${r.footSlide.walked} m`,
        ];
        result.textContent = lines.join('\n');
        console.info('measure_jitter', r);
      },
    },
    'Measure jitter',
  );
  search.addEventListener('input', renderTree);
  S.on('character', renderTree);
  S.on('tick', drawGraph);
  return section(
    'Joints',
    { open: true },
    h(
      'div',
      { class: 'row' },
      search,
      checkbox('Humanoid', true, (v) => ((humanoidOnly = v), renderTree())),
    ),
    tree,
    graph,
    numbers,
    h('div', { class: 'row' }, measure, seconds, h('span', { class: 'dim' }, 's, current layers')),
    result,
  );
}

// ---- layers -------------------------------------------------------------------------------

function layersPanel(S) {
  const rigState = h('div', { class: 'mono dim', style: 'white-space:pre;font-size:11px' });
  const boxes = Object.entries(LAYER_LABELS).map(([layer, label]) =>
    checkbox(label, true, (on) => {
      S.state.layers[layer] = on;
      S.emit('layers');
    }),
  );
  const look = select(
    [
      ['none', 'Look: nobody'],
      ['camera', 'Look: the camera'],
      ['target', 'Look: target point'],
      ['train', 'Look: train at target'],
    ],
    'none',
    (value) => (S.state.look = value),
  );
  const moveTarget = h(
    'button',
    {
      onclick: () => {
        S.view.transform.attach(S.lookTarget);
        S.setGizmoMode('translate');
        S.toast('Drag the yellow target in the perspective view.');
      },
    },
    'Move target',
  );
  S.on('layers', () =>
    boxes.forEach((box) => {
      const layer = Object.keys(LAYER_LABELS)[boxes.indexOf(box)];
      box.querySelector('input').checked = S.state.layers[layer];
    }),
  );
  S.on('tick', () => {
    const state = S.loaded?.internals.rig?.getState();
    if (!state) return (rigState.textContent = 'No rig (missing bones).');
    rigState.textContent = [
      `look  yaw ${state.look.yaw}  pitch ${state.look.pitch}  weight ${state.look.weight}`,
      `feet  stance ${state.feet.stance ?? '–'}  pelvis drop ${state.feet.pelvisDrop}`,
      `      L ${state.feet.L.planted ? 'planted' : 'free'} ${state.feet.L.weight}  R ${state.feet.R.planted ? 'planted' : 'free'} ${state.feet.R.weight}`,
      `grip  L ${state.grips.L}  R ${state.grips.R}`,
      ...state.props.map(
        (p) =>
          `prop  ${p.name} ${p.hand} ${p.hold}${p.visible ? '' : ' hidden'} cradle ${p.cradle} 2nd ${p.secondHand}`,
      ),
    ].join('\n');
  });
  return section(
    'Motion layers',
    { open: true },
    h(
      'div',
      { class: 'note' },
      'Switch a layer off to see what it adds, or to find a layer fight.',
    ),
    ...boxes,
    h('div', { class: 'row' }, look, moveTarget),
    rigState,
  );
}

// ---- ghosts -------------------------------------------------------------------------------

function ghostsPanel(S) {
  const spacing = slider('Spacing', {
    min: 1,
    max: 20,
    step: 1,
    value: S.state.ghosts.spacing,
    digits: 0,
    unit: ' f',
    onInput: (v) => (S.state.ghosts.spacing = v),
  });
  const count = select(['1', '2', '3'], '1', async (v) => {
    S.state.ghosts.count = Number(v);
    await S.rebuildGhosts();
  });
  return section(
    'Ghosts',
    {},
    h('div', { class: 'kv' }, ...spacing.row),
    h(
      'div',
      { class: 'row' },
      h('span', { class: 'dim' }, 'Each side'),
      count,
      checkbox(
        h('span', { style: 'color:var(--prev)' }, 'Previous'),
        true,
        (v) => (S.state.ghosts.previous = v),
      ),
      checkbox(
        h('span', { style: 'color:var(--next)' }, 'Next'),
        true,
        (v) => (S.state.ghosts.next = v),
      ),
    ),
    h(
      'div',
      { class: 'note' },
      'Ghosts show the clip alone at those frames; the layers run on the main body only.',
    ),
  );
}

// ---- grounding ------------------------------------------------------------------------------

function groundingPanel(S) {
  const out = h('div', { class: 'mono', style: 'white-space:pre;font-size:11px' });
  const legend = h(
    'div',
    { class: 'legend note' },
    ...[
      ['#5fd08f', 'planted'],
      ['#e8d25a', 'on ground'],
      ['#ff5a4a', 'sliding'],
      ['#6a7a82', 'swing'],
    ].map(([c, t]) => h('span', {}, h('i', { class: 'swatch', style: `background:${c}` }), t)),
  );
  S.on('tick', () => {
    const latest = S.samples.feet.at(-1);
    if (!latest) return (out.textContent = 'Play the clip to measure the feet.');
    const slide = S.recentSlide();
    const lines = ['L', 'R'].map((side) => {
      const f = latest.feet[side];
      if (!f) return `${side} –`;
      return `${side} ${S.footStatus(f).padEnd(9)} height ${(f.height * 100).toFixed(1).padStart(5)} cm  speed ${(f.speed ?? 0).toFixed(2)} m/s`;
    });
    lines.push(
      `slide ${slide.percent.toFixed(1)}% of ${slide.path.toFixed(2)} m walked (${(slide.slide * 1000).toFixed(0)} mm)`,
    );
    out.textContent = lines.join('\n');
  });
  return section(
    'Grounding',
    {},
    legend,
    out,
    h(
      'div',
      { class: 'note' },
      'Rings sit under the ankles; the trail marks each touch-down. Slide is the least-moving heel or toe per frame, as in docs/CHARACTER-MOTION.md.',
    ),
  );
}

// ---- face ---------------------------------------------------------------------------------

function facePanel(S) {
  const sliders = h('div', { class: 'kv' });
  const bars = h('div', { class: 'bars' });
  const barFill = {};
  for (const vowel of VISEMES) {
    const fill = h('i', { style: 'height:0' });
    barFill[vowel] = fill;
    bars.append(h('div', {}, fill, h('b', {}, vowel)));
  }
  const smile = h('div', { class: 'mono dim' });
  const line = h('input', {
    type: 'text',
    value: 'The 17:42 is late again, but the radio still works.',
    class: 'grow',
  });
  const mood = select(
    ['neutral', 'cheerful', 'content', 'curious', 'wistful', 'shy'],
    S.state.mood,
    (v) => (S.state.mood = v),
  );
  const controls = new Map();

  function names() {
    const internals = S.loaded?.internals;
    if (!internals) return [];
    if (internals.actor) return internals.actor.face.names();
    return Object.keys(internals.face?.morphTargetDictionary ?? {});
  }
  function value(name) {
    const internals = S.loaded?.internals;
    if (internals?.actor) return internals.actor.vrm.expressionManager?.getValue(name) ?? 0;
    const index = internals?.face?.morphTargetDictionary?.[name];
    return index === undefined ? 0 : internals.face.morphTargetInfluences[index];
  }
  function render() {
    sliders.replaceChildren();
    controls.clear();
    for (const name of names()) {
      const hold = h('input', { type: 'checkbox', title: 'Hold this value over the game drive' });
      const control = slider(name, {
        min: 0,
        max: 1,
        step: 0.01,
        value: 0,
        onInput: (v) => {
          hold.checked = true;
          S.state.faceOverrides.set(name, v);
        },
      });
      hold.addEventListener('change', () => {
        if (hold.checked) S.state.faceOverrides.set(name, Number(control.input.value));
        else S.state.faceOverrides.delete(name);
      });
      control.row[0] = h('label', { class: 'dim' }, hold, name);
      sliders.append(...control.row);
      controls.set(name, { control, hold });
    }
  }
  S.on('character', render);
  S.on('tick', () => {
    for (const [name, { control, hold }] of controls)
      if (!hold.checked && document.activeElement !== control.input) control.set(value(name));
    for (const vowel of VISEMES) barFill[vowel].style.height = `${Math.round(value(vowel) * 100)}%`;
    const state = S.loaded?.hero.getState();
    smile.textContent = `mood smile ${moodSmile(S.state.mood).toFixed(2)} · happy now ${value('happy').toFixed(2)}${state?.talking ? ' · talking' : ''}`;
  });
  const speak = h(
    'button',
    {
      onclick: () => {
        // Reading time as the episode captions use it: about 14 characters a second.
        const seconds = Math.max(1.2, line.value.length / 14);
        S.loaded?.hero.talk(seconds);
        if (!S.state.playing) S.play(true);
      },
    },
    'Speak',
  );
  return section(
    'Face',
    {},
    h('div', { class: 'row' }, h('span', { class: 'dim' }, 'Mood'), mood, smile),
    h('div', { class: 'row' }, line, speak),
    bars,
    h(
      'div',
      { class: 'note' },
      `Syllable vowels: ${[0, 1, 2, 3, 4, 5, 6, 7].map(syllableVowel).join(' ')} … (vrm-expressions.js)`,
    ),
    sliders,
    h(
      'div',
      { class: 'row' },
      h(
        'button',
        {
          onclick: () => {
            S.state.faceOverrides.clear();
            for (const { hold } of controls.values()) hold.checked = false;
          },
        },
        'Release all',
      ),
    ),
  );
}

// ---- concept overlays ----------------------------------------------------------------------

function overlayPanel(S) {
  const views = ['front', 'side'];
  const current = {
    front: { alignment: { ...DEFAULT_OVERLAY }, image: null },
    side: { alignment: { ...DEFAULT_OVERLAY }, image: null },
  };
  S.overlay = current;
  const dropped = new Map(); // name -> object URL
  const blocks = {};

  const conceptOptions = () => [
    ['', 'none'],
    ...(S.assets?.concept ?? []).map((c) => [c.name, c.name]),
    ...[...dropped.keys()].map((name) => [`drop:${name}`, `${name} (dropped)`]),
  ];
  const urlFor = (name) =>
    name.startsWith('drop:')
      ? dropped.get(name.slice(5))
      : (S.assets?.concept ?? []).find((c) => c.name === name)?.url;

  async function setImage(view, name) {
    current[view].image = name || null;
    if (!name) {
      S.view.setOverlayImage(view, null);
      return refresh(view);
    }
    const url = urlFor(name);
    if (!url) return S.toast(`No image ${name}`);
    const image = new Image();
    image.src = url;
    await image.decode();
    S.view.setOverlayImage(view, image, name);
    refresh(view);
  }
  function refresh(view) {
    const a = current[view].alignment;
    S.view.overlays[view].onTop = Boolean(current[view].onTop);
    S.view.placeOverlay(view, a);
    S.view.overlays[view].plane.visible = S.state.show.overlay && Boolean(current[view].image);
    const b = blocks[view];
    if (!b) return;
    b.opacity.set(a.opacity);
    b.height.set(a.height);
    b.x.set(a.offset[0]);
    b.y.set(a.offset[1]);
    b.flip.querySelector('input').checked = a.flip;
    b.image.value = current[view].image ?? '';
  }
  S.setOverlay = async (view, { image, ...alignment } = {}) => {
    if (image !== undefined) await setImage(view, image);
    current[view].alignment = { ...current[view].alignment, ...alignment };
    refresh(view);
    return { view, image: current[view].image, alignment: current[view].alignment };
  };

  /** Where the feet are across a view (heels and toes, relative to the followed point). */
  const feetCentre = (view) => {
    const raw = S.loaded.internals.humanoid.raw;
    const points = ['footL', 'footR', 'toesL', 'toesR']
      .map((name) => raw[name]?.getWorldPosition(new THREE.Vector3()))
      .filter(Boolean)
      .map((p) => p.sub(S.view.follow.position));
    if (!points.length) return 0;
    const mean = points.reduce((a, p) => a.add(p), new THREE.Vector3()).divideScalar(points.length);
    return view === 'front' ? mean.x : -mean.z;
  };
  /** Fit the drawn figure to the body's bind-pose height, the drawn feet on the feet. */
  S.fitOverlay = (view) => {
    const overlay = S.view.overlays[view];
    const L = S.loaded;
    if (!overlay.image || !L) return null;
    const [w, hgt] = overlay.size;
    const scale = Math.min(1, 320 / w);
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(w * scale);
    canvas.height = Math.round(hgt * scale);
    const g = canvas.getContext('2d', { willReadFrequently: true });
    g.drawImage(overlay.image, 0, 0, canvas.width, canvas.height);
    const ink = inkBounds(
      g.getImageData(0, 0, canvas.width, canvas.height).data,
      canvas.width,
      canvas.height,
    );
    if (!ink) return S.toast('No figure found in the image.');
    const px = (value) => value / scale;
    const box = L.bindBounds;
    const alignment = fitOverlayToBody({
      imageWidth: w,
      imageHeight: hgt,
      ink: {
        left: px(ink.left),
        right: px(ink.right + 1),
        top: px(ink.top),
        bottom: px(ink.bottom + 1),
        feet: { left: px(ink.feet.left), right: px(ink.feet.right + 1) },
      },
      bodyTop: box.max.y,
      bodyBottom: box.min.y,
      bodyCentre: feetCentre(view),
      base: current[view].alignment,
    });
    current[view].alignment = alignment;
    refresh(view);
    return alignment;
  };

  S.storeOverlay = (view) => {
    const id = S.loaded?.entry.id;
    if (!id) return;
    const overlays = { ...S.tuning.studio.overlays };
    const a = current[view].alignment;
    overlays[id] = {
      ...overlays[id],
      [view]: {
        image: current[view].image?.replace(/^drop:/, '') ?? null,
        height: round(a.height, 4),
        offset: a.offset.map((v) => round(v, 4)),
        opacity: round(a.opacity, 2),
        flip: Boolean(a.flip),
      },
    };
    S.tuning.studio = { ...S.tuning.studio, overlays };
    S.markDirty('studio-tuning');
    S.toast(`Stored the ${view} alignment for ${id}.`);
  };

  const container = [];
  for (const view of views) {
    const opacity = slider('Opacity', {
      min: 0,
      max: 1,
      step: 0.01,
      value: 0.5,
      onInput: (v) => ((current[view].alignment.opacity = v), refresh(view)),
    });
    const height = slider('Height', {
      min: 0.5,
      max: 4,
      step: 0.001,
      value: 1.9,
      digits: 3,
      unit: ' m',
      onInput: (v) => ((current[view].alignment.height = v), refresh(view)),
    });
    const x = slider('Offset x', {
      min: -1,
      max: 1,
      step: 0.001,
      value: 0,
      digits: 3,
      onInput: (v) => (
        (current[view].alignment.offset = [v, current[view].alignment.offset[1]]),
        refresh(view)
      ),
    });
    const y = slider('Offset y', {
      min: -1,
      max: 1,
      step: 0.001,
      value: -0.05,
      digits: 3,
      onInput: (v) => (
        (current[view].alignment.offset = [current[view].alignment.offset[0], v]),
        refresh(view)
      ),
    });
    const flip = checkbox(
      'Mirror',
      false,
      (v) => ((current[view].alignment.flip = v), refresh(view)),
    );
    const onTop = checkbox(
      'Over the body',
      false,
      (v) => ((current[view].onTop = v), refresh(view)),
    );
    const image = select(conceptOptions(), '', (v) => setImage(view, v));
    blocks[view] = { opacity, height, x, y, flip, image };
    container.push(
      h('div', { class: 'group' }, view === 'front' ? 'Front view' : 'Side view'),
      image,
      h('div', { class: 'kv' }, ...opacity.row, ...height.row, ...x.row, ...y.row),
      h(
        'div',
        { class: 'row' },
        flip,
        onTop,
        h('button', { onclick: () => S.fitOverlay(view) }, 'Fit to body'),
        h('button', { onclick: () => S.storeOverlay(view) }, 'Store'),
      ),
    );
    // Drag and drop any image onto the view.
    const element = S.view.views[view].element;
    element.addEventListener('dragover', (event) => {
      event.preventDefault();
      element.classList.add('drop');
    });
    element.addEventListener('dragleave', () => element.classList.remove('drop'));
    element.addEventListener('drop', async (event) => {
      event.preventDefault();
      element.classList.remove('drop');
      const file = [...(event.dataTransfer?.files ?? [])].find((f) => f.type.startsWith('image/'));
      if (!file) return;
      dropped.set(file.name, URL.createObjectURL(file));
      for (const v of views) {
        const keep = blocks[v].image.value;
        blocks[v].image.replaceChildren(
          ...conceptOptions().map(([value, text]) => h('option', { value }, text)),
        );
        blocks[v].image.value = keep;
      }
      await setImage(view, `drop:${file.name}`);
      S.fitOverlay(view);
    });
  }

  // On load: the stored alignment, or the concept image named after the person, fitted.
  S.on('character', (L) => {
    S.overlayReady = loadOverlays(L);
  });
  async function loadOverlays(L) {
    for (const view of views) {
      blocks[view].image.replaceChildren(
        ...conceptOptions().map(([value, text]) => h('option', { value }, text)),
      );
      const saved = S.tuning.studio.overlays?.[L.entry.id]?.[view];
      const concept = (S.assets?.concept ?? []).find(
        (c) => c.name.startsWith(`${L.entry.person}-`) && c.name.includes(`-${view}.`),
      );
      const name =
        saved?.image && (S.assets?.concept ?? []).some((c) => c.name === saved.image)
          ? saved.image
          : (concept?.name ?? '');
      current[view].alignment = saved
        ? { ...DEFAULT_OVERLAY, ...saved, offset: saved.offset ?? DEFAULT_OVERLAY.offset }
        : { ...DEFAULT_OVERLAY };
      await setImage(view, name);
      if (name && !saved) S.fitOverlay(view);
    }
  }
  S.on('show', () => views.forEach(refresh));
  return section(
    'Concept overlay',
    {},
    h(
      'div',
      { class: 'note' },
      `Images from ${S.assets?.conceptDir ?? 'the concept folder'} or dropped on the front or side view. Fit to body scales the drawn figure to the model's bind-pose height.`,
    ),
    ...container,
  );
}

// ---- clip editing ---------------------------------------------------------------------------

function trackKind(track) {
  return track.ValueTypeName === 'quaternion'
    ? 'quaternion'
    : track.ValueTypeName === 'vector'
      ? 'vector'
      : 'other';
}

/** A three.js clip from studio-math clip data. */
function toClip(data, source) {
  const tracks = data.tracks.map((track, i) => {
    const Type = source.tracks[i].constructor;
    return new Type(track.name, track.times, track.values);
  });
  return new THREE.AnimationClip(data.name, data.duration, tracks);
}

export function mirrorClip(clip) {
  const data = mirrorClipData({
    name: clip.name,
    duration: clip.duration,
    tracks: clip.tracks.map((track) => ({
      name: track.name,
      kind: trackKind(track),
      times: Array.from(track.times),
      values: Array.from(track.values),
    })),
  });
  return toClip(data, clip);
}

/**
 * A copy of `clip` with additive corrections: each { bone, euler, keys } rotates that bone by
 * `euler` degrees (bone-local, after the clip) scaled by the key weight at each time. The
 * bone's track is resampled at 30 fps so the weight curve is followed.
 */
export function correctedClip(clip, corrections, trackNameFor) {
  const tracks = clip.tracks.map((track) => track.clone());
  for (const correction of corrections) {
    const name = trackNameFor(correction.bone);
    if (!name) continue;
    let index = tracks.findIndex((track) => track.name === name);
    const source = index >= 0 ? tracks[index] : null;
    const times = [];
    for (let t = 0; t <= clip.duration + 1e-6; t += 1 / 30) times.push(Math.min(clip.duration, t));
    const interpolant = source?.createInterpolant();
    const offset = new THREE.Quaternion(...quaternionFromEulerDegrees(correction.euler));
    const identity = new THREE.Quaternion();
    const values = [];
    const q = new THREE.Quaternion();
    for (const t of times) {
      if (interpolant) q.fromArray(interpolant.evaluate(t));
      else q.identity();
      const w = correctionWeight(correction.keys?.length ? correction.keys : [{ t: 0, w: 1 }], t);
      q.multiply(identity.clone().slerp(offset, w));
      values.push(...q.toArray());
    }
    const track = new THREE.QuaternionKeyframeTrack(name, times, values);
    if (index >= 0) tracks[index] = track;
    else tracks.push(track);
  }
  return new THREE.AnimationClip(`${clip.name}+fix`, clip.duration, tracks);
}

function clipEditPanel(S) {
  const info = h('div', { class: 'note' });
  const list = h('div', { class: 'mono', style: 'font-size:11px' });
  const euler = [0, 0, 0];
  let keys = [];
  const keyList = h('div', { class: 'mono dim', style: 'font-size:11px' });
  const weight = slider('Key weight', { min: 0, max: 1, step: 0.05, value: 1, digits: 2 });
  const axes = ['X', 'Y', 'Z'].map((axis, i) =>
    slider(`Rotate ${axis}`, {
      min: -90,
      max: 90,
      step: 0.5,
      value: 0,
      digits: 1,
      unit: '°',
      onInput: (v) => (euler[i] = v),
    }),
  );
  const from = h('select');
  const to = h('select');

  const trackNameFor = (bone) => {
    const internals = S.loaded.internals;
    if (internals.actor)
      return CANONICAL_TO_VRM[bone] ? `Normalized_${CANONICAL_TO_VRM[bone]}.quaternion` : null;
    const node = internals.humanoid.raw[bone] ?? internals.root.getObjectByName(bone);
    return node ? `${node.name}.quaternion` : null;
  };
  const correctionsKey = () => S.clipKey(baseClip(S.state.clip));
  const stored = () => S.tuning.studio.corrections?.[correctionsKey()] ?? [];

  function renderKeys() {
    keyList.textContent = keys.length
      ? keys.map((k) => `t ${k.t.toFixed(3)} s  w ${k.w.toFixed(2)}`).join('\n')
      : 'No weight keys: the correction applies at full weight all clip long.';
    keyList.style.whiteSpace = 'pre';
  }
  function renderStored() {
    const entries = stored();
    list.textContent = entries.length
      ? entries
          .map((c) => `${c.bone}  [${c.euler.join(', ')}]°  ${c.keys?.length ?? 0} keys`)
          .join('\n')
      : 'No stored corrections for this clip.';
    list.style.whiteSpace = 'pre';
    info.textContent = `Clip ${S.state.clip} · joint ${S.state.joint}${S.loaded?.internals.actor ? '' : ' · mirror needs a VRM (bone-local axes differ on other rigs)'}`;
    const names = S.clipNames();
    for (const node of [from, to]) {
      const keep = node.value;
      node.replaceChildren(...names.map((name) => h('option', { value: name }, name)));
      if (names.includes(keep)) node.value = keep;
    }
    if (!from.value && names.includes('idle')) from.value = 'idle';
    if (names.includes('watch-train') && to.value === from.value) to.value = 'watch-train';
  }
  /** Rebuild the +fix clip for the current base clip from its stored corrections. */
  function rebuild(corrections = stored()) {
    const base = S.action(baseClip(S.state.clip))?.getClip();
    if (!base || !corrections.length) return null;
    const clip = correctedClip(base, corrections, trackNameFor);
    S.addClip(`${baseClip(S.state.clip)}+fix`, clip);
    return clip;
  }
  S.applyCorrections = rebuild;
  S.on('character', () => {
    // Corrections stored in studio-tuning.json become +fix clips on load.
    const prefix = S.clipKey('');
    for (const [key, corrections] of Object.entries(S.tuning.studio.corrections ?? {})) {
      if (!key.startsWith(prefix)) continue;
      const base = S.action(key.slice(prefix.length))?.getClip();
      if (base) S.addClip(`${base.name}+fix`, correctedClip(base, corrections, trackNameFor));
    }
    renderStored();
  });
  S.on('clip', renderStored);
  S.on('clips', renderStored);
  S.on('joint', renderStored);
  renderKeys();

  const pending = () => ({
    bone: S.state.joint,
    euler: euler.map((v) => round(v, 2)),
    keys: keys.map((k) => ({ t: round(k.t, 4), w: round(k.w, 3) })),
  });
  return section(
    'Clip editing',
    {},
    info,
    h(
      'div',
      { class: 'row' },
      h(
        'button',
        {
          disabled: false,
          onclick: () => {
            if (!S.loaded?.internals.actor) return S.toast('Mirroring needs a VRM.');
            const clip = S.action()?.getClip();
            if (!clip) return;
            S.addClip(`${S.state.clip}-mirror`, mirrorClip(clip));
            S.setClip(`${S.state.clip}-mirror`);
          },
        },
        'Mirror clip',
      ),
    ),
    h('div', { class: 'group' }, 'Additive correction on the selected joint'),
    h('div', { class: 'kv' }, ...axes.flatMap((a) => a.row), ...weight.row),
    h(
      'div',
      { class: 'row' },
      h(
        'button',
        {
          onclick: () => {
            keys = [
              ...keys.filter((k) => Math.abs(k.t - S.state.t) > 1e-3),
              { t: S.state.t, w: Number(weight.input.value) },
            ].sort((a, b) => a.t - b.t);
            renderKeys();
          },
        },
        'Key at playhead',
      ),
      h(
        'button',
        {
          onclick: () => {
            keys = [];
            renderKeys();
          },
        },
        'Clear keys',
      ),
    ),
    keyList,
    h(
      'div',
      { class: 'row' },
      h(
        'button',
        {
          onclick: () => {
            const others = stored().filter((c) => c.bone !== S.state.joint);
            if (rebuild([...others, pending()]))
              S.setClip(`${baseClip(S.state.clip)}+fix`, { time: S.state.t });
          },
        },
        'Preview',
      ),
      h(
        'button',
        {
          class: 'primary',
          onclick: () => {
            const corrections = { ...S.tuning.studio.corrections };
            corrections[correctionsKey()] = [
              ...stored().filter((c) => c.bone !== S.state.joint),
              pending(),
            ];
            S.tuning.studio = { ...S.tuning.studio, corrections };
            S.markDirty('studio-tuning');
            rebuild();
            renderStored();
          },
        },
        'Store',
      ),
      h(
        'button',
        {
          onclick: () => {
            const corrections = { ...S.tuning.studio.corrections };
            const left = stored().filter((c) => c.bone !== S.state.joint);
            if (left.length) corrections[correctionsKey()] = left;
            else delete corrections[correctionsKey()];
            S.tuning.studio = { ...S.tuning.studio, corrections };
            S.markDirty('studio-tuning');
            renderStored();
          },
        },
        'Remove joint',
      ),
    ),
    list,
    h('div', { class: 'group' }, 'Blend preview (the game cross-fade)'),
    h(
      'div',
      { class: 'row' },
      from,
      h('span', { class: 'dim' }, '→'),
      to,
      h(
        'button',
        {
          onclick: () => {
            S.setClip(from.value);
            S.play(true);
            setTimeout(() => S.setClip(to.value, { blend: true }), 1000);
          },
        },
        'Play',
      ),
    ),
    h(
      'div',
      { class: 'note' },
      'Stored corrections live in studio-tuning.json and show here as +fix clips. The game does not read them yet; bake them in asset-src/characters/vrm-cast/retarget.mjs.',
    ),
  );
}
