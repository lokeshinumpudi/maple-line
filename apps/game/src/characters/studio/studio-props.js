/**
 * Prop sockets: pick a prop, put it in a hand, drag or rotate it with the gizmo, choose a
 * one- or two-hand hold, and store the grip in characters/cast-tuning.json, the file
 * hero-cast passes to attachProps. The studio edits the hero's live prop entries (the same
 * objects the rig reads each frame), so the view is what the game will draw.
 */
import * as THREE from 'three';
import { setGrip, gripOverrides } from '../cast-tuning.js';
import { PROP_GRIPS } from '../../world/character-motion.js';
import { checkbox, fmt, h, section, select, slider } from './dom.js';

/** Where props come from when a model has none of its own. */
const PROP_SOURCES = {
  radio: 'models/characters/props/riko.glb',
  phone: 'models/characters/props/sato.glb',
  newspaper: 'models/characters/props/ishida.glb',
};

function placeholderBag() {
  // No bag prop is built yet: a shoulder-bag-sized box in socket space, handle along +Y.
  const bag = new THREE.Mesh(
    new THREE.BoxGeometry(0.3, 0.24, 0.1).translate(0, -0.14, 0.02),
    new THREE.MeshStandardMaterial({ color: '#c9b48c', roughness: 0.85 }),
  );
  bag.name = 'bag';
  bag.userData = { prop: 'bag', hand: 'right', hold: 'one' };
  return bag;
}

export function buildPropsPanel(S, root) {
  const list = h('div', { class: 'list' });
  const readout = h('div', { class: 'mono', style: 'white-space:pre;font-size:11px' });
  const note = h('div', { class: 'note' });
  const addSelect = select(['radio', 'phone', 'newspaper', 'bag'], 'radio', () => {});
  let selected = null;
  let target = 'offset'; // offset | grip2 | cradle
  const marker = new THREE.Group();
  marker.name = 'studio grip2 marker';
  marker.add(new THREE.AxesHelper(0.06));
  const palm = new THREE.Mesh(
    new THREE.SphereGeometry(0.012, 10, 8),
    new THREE.MeshBasicMaterial({ color: '#ff7fd1', depthTest: false }),
  );
  palm.renderOrder = 22;
  marker.add(palm);
  marker.visible = false;

  const cradleSliders = ['x', 'y', 'z'].map((axis, i) =>
    slider(`Cradle ${axis}`, {
      min: i === 1 ? 0.5 : -0.4,
      max: i === 1 ? 1.6 : 0.6,
      step: 0.005,
      value: 0,
      digits: 3,
      onInput: (v) => {
        if (!selected?.cradle) return;
        const at = [...selected.cradle.at];
        at[i] = v;
        selected.cradle = { ...selected.cradle, at };
      },
    }),
  );
  const turn = slider('Cradle turn', {
    min: -3.14,
    max: 3.14,
    step: 0.01,
    value: 0,
    digits: 2,
    onInput: (v) => {
      if (selected?.cradle) selected.cradle = { ...selected.cradle, turn: v };
    },
  });

  const props = () => S.loaded?.internals.props ?? [];
  const modelPath = () => S.loaded?.modelPath;

  function socketOf(side) {
    return S.loaded.internals.sockets[side];
  }

  function attachGizmo() {
    const transform = S.view.transform;
    marker.removeFromParent();
    marker.visible = false;
    if (!selected) return transform.detach();
    if (target === 'offset') {
      transform.attach(selected.node);
      return;
    }
    const grip = target === 'cradle' ? selected.cradle?.grip2 : selected.grip2;
    if (!grip) {
      transform.attach(selected.node);
      target = 'offset';
      return render();
    }
    selected.node.add(marker);
    marker.position.fromArray(grip, 0);
    marker.quaternion.fromArray(grip, 3);
    marker.visible = true;
    transform.attach(marker);
  }

  S.view.transform.addEventListener('objectChange', () => {
    if (!selected) return;
    if (S.view.transform.object === marker) {
      // A new array each time: the rig caches grip matrices by array.
      const grip = [...marker.position.toArray(), ...marker.quaternion.toArray()];
      if (target === 'cradle') selected.cradle = { ...selected.cradle, grip2: grip };
      else selected.grip2 = grip;
    }
    showReadout();
  });

  function select_(prop) {
    selected = prop;
    S.state.propsShown = prop ? { [prop.name]: true } : {};
    attachGizmo();
    render();
  }

  function showReadout() {
    if (!selected) {
      readout.textContent = 'Select a prop.';
      return;
    }
    const n = selected.node;
    const q = n.quaternion;
    const e = new THREE.Euler().setFromQuaternion(q);
    const deg = (r) => ((r * 180) / Math.PI).toFixed(1);
    readout.textContent = [
      `${selected.name} in hand ${selected.side} · hold ${selected.hold}`,
      `offset   ${n.position
        .toArray()
        .map((v) => fmt(v, 4))
        .join('  ')} m (socket)`,
      `rotation ${deg(e.x)}° ${deg(e.y)}° ${deg(e.z)}°  q ${q
        .toArray()
        .map((v) => fmt(v, 3))
        .join(' ')}`,
      selected.grip2
        ? `grip2    ${selected.grip2
            .slice(0, 3)
            .map((v) => fmt(v, 3))
            .join('  ')} (prop space)`
        : 'grip2    –',
      selected.cradle
        ? `cradle   at ${selected.cradle.at.map((v) => fmt(v, 3)).join(' ')} turn ${fmt(selected.cradle.turn ?? 0, 2)}${selected.cradle.rotation ? ` hand q ${selected.cradle.rotation.map((v) => fmt(v, 3)).join(' ')}` : ''}`
        : 'cradle   –',
    ].join('\n');
    if (selected.cradle) {
      cradleSliders.forEach((s, i) => s.set(selected.cradle.at[i]));
      turn.set(selected.cradle.turn ?? 0);
    }
  }

  function render() {
    list.replaceChildren();
    for (const prop of props())
      list.append(
        h(
          'div',
          { class: `item${prop === selected ? ' sel' : ''}`, onclick: () => select_(prop) },
          prop.name,
          h(
            'small',
            {},
            `${prop.side === 'L' ? 'left' : 'right'} hand · ${prop.hold}${prop.cradle ? ' · cradle' : ''}${gripOverrides(modelPath(), S.tuning.cast)[prop.name] ? ' · tuned' : ''}`,
          ),
        ),
      );
    if (!props().length)
      list.append(h('div', { class: 'note' }, 'This model holds nothing yet. Add a prop below.'));
    for (const [name, button] of Object.entries(targetButtons))
      button.classList.toggle('on', target === name);
    showReadout();
    note.textContent =
      selected && !propFileHas(selected.name)
        ? `${selected.name} is not in this model's props file, so the game will not show it until the prop is built for this person. The grip still saves.`
        : '';
  }
  let ownProps = [];
  const propFileHas = (name) => ownProps.includes(name);

  async function addProp(name) {
    const L = S.loaded;
    if (!L) return;
    if (props().some((p) => p.name === name)) return select_(props().find((p) => p.name === name));
    let node;
    if (name === 'bag') node = placeholderBag();
    else {
      const gltf = await S.modelLoader.get(PROP_SOURCES[name]);
      const source = gltf?.scene.getObjectByName(name);
      if (!source) return S.toast(`No ${name} prop found`);
      node = source.clone();
    }
    const spec = { ...PROP_GRIPS[name], ...node.userData };
    const side = spec.hand === 'left' ? 'L' : 'R';
    socketOf(side).add(node);
    node.position.set(0, 0, 0);
    node.quaternion.identity();
    node.castShadow = true;
    node.frustumCulled = false;
    const prop = {
      name,
      node,
      side,
      other: side === 'L' ? 'R' : 'L',
      hold: spec.hold ?? 'one',
      grip2: spec.grip2 ?? null,
      cradle: null,
    };
    // Same array the rig iterates: the new prop is held from the next frame.
    L.internals.props.push(prop);
    select_(prop);
  }

  function setHand(side) {
    if (!selected || selected.side === side) return;
    const socket = socketOf(side);
    if (!socket) return;
    const position = selected.node.position.clone();
    const quaternion = selected.node.quaternion.clone();
    socket.add(selected.node);
    selected.node.position.copy(position);
    selected.node.quaternion.copy(quaternion);
    selected.side = side;
    selected.other = side === 'L' ? 'R' : 'L';
    render();
  }

  function setHold(hold) {
    if (!selected) return;
    selected.hold = hold;
    if (hold === 'two' && !selected.grip2) selected.grip2 = [0, 0.12, 0.04, 0, 0, 0, 1];
    render();
  }

  /** The grip as stored for the game (cast-tuning.js serializeGrip shape). */
  S.gripOf = (prop = selected) =>
    prop && {
      hand: prop.side === 'L' ? 'left' : 'right',
      hold: prop.hold,
      offset: prop.node.position.toArray(),
      rotation: prop.node.quaternion.toArray(),
      ...(prop.grip2 ? { grip2: prop.grip2 } : {}),
      ...(prop.cradle ? { cradle: prop.cradle } : {}),
    };

  S.storeGrip = (prop = selected) => {
    if (!prop) return null;
    S.tuning.cast = setGrip(S.tuning.cast, modelPath(), prop.name, S.gripOf(prop));
    S.markDirty('cast-tuning');
    render();
    return S.tuning.cast.grips;
  };

  /**
   * Keep the cradle looking as it did before the prop was rotated in the hand: the cradling
   * hand turns by the inverse of the prop's socket rotation.
   */
  S.keepCradleLook = (prop = selected) => {
    if (!prop?.cradle) return null;
    const inverse = prop.node.quaternion.clone().invert().toArray();
    prop.cradle = { ...prop.cradle, rotation: inverse };
    showReadout();
    return prop.cradle;
  };

  /** Set a grip from numbers (WebMCP set_grip): offset metres, rotation quaternion. */
  S.setGrip = async ({ prop: name, hand, hold, offset, rotation, grip2, cradle }) => {
    let prop = props().find((p) => p.name === name);
    if (!prop) {
      await addProp(name);
      prop = props().find((p) => p.name === name);
    }
    if (!prop) throw new Error(`No prop ${name}`);
    select_(prop);
    if (hand) setHand(hand === 'left' ? 'L' : 'R');
    if (hold) setHold(hold);
    if (offset) prop.node.position.fromArray(offset);
    if (rotation) prop.node.quaternion.fromArray(rotation).normalize();
    if (grip2) prop.grip2 = [...grip2];
    if (cradle === 'keep') S.keepCradleLook(prop);
    else if (cradle && prop.cradle) prop.cradle = { ...prop.cradle, ...cradle };
    showReadout();
    return S.gripOf(prop);
  };

  const targetButtons = {
    offset: h('button', { onclick: () => ((target = 'offset'), attachGizmo(), render()) }, 'Prop'),
    grip2: h(
      'button',
      { onclick: () => ((target = 'grip2'), attachGizmo(), render()) },
      'Second hand',
    ),
    cradle: h(
      'button',
      { onclick: () => ((target = 'cradle'), attachGizmo(), render()) },
      'Cradle hand',
    ),
  };

  S.on('character', () => {
    ownProps = props().map((p) => p.name);
    selected = null;
    S.view.transform.detach();
    render();
  });
  S.on('tick', () => selected && S.view.transform.object && showReadout());

  root.append(
    section(
      'Prop sockets',
      {},
      list,
      h(
        'div',
        { class: 'row' },
        addSelect,
        h('button', { onclick: () => addProp(addSelect.value) }, 'Add to hand'),
      ),
      h(
        'div',
        { class: 'row' },
        h('span', { class: 'dim' }, 'Hand'),
        h('button', { onclick: () => setHand('L') }, 'Left'),
        h('button', { onclick: () => setHand('R') }, 'Right'),
        h('span', { class: 'dim' }, 'Hold'),
        h('button', { onclick: () => setHold('one') }, 'One'),
        h('button', { onclick: () => setHold('two') }, 'Two'),
      ),
      h(
        'div',
        { class: 'row' },
        h('span', { class: 'dim' }, 'Gizmo on'),
        ...Object.values(targetButtons),
      ),
      h('div', { class: 'kv' }, ...cradleSliders.flatMap((s) => s.row), ...turn.row),
      readout,
      note,
      h(
        'div',
        { class: 'row' },
        checkbox('Always show', true, (v) => {
          if (selected) S.state.propsShown = v ? { [selected.name]: true } : {};
        }),
        h('span', { class: 'grow' }),
        h(
          'button',
          {
            title: 'Turn the cradling hand so the cradle looks as before the prop rotation',
            onclick: () => S.keepCradleLook(),
          },
          'Keep cradle look',
        ),
        h(
          'button',
          {
            onclick: () => {
              if (!selected) return;
              S.tuning.cast = setGrip(S.tuning.cast, modelPath(), selected.name, null);
              S.markDirty('cast-tuning');
              render();
            },
          },
          'Clear tuning',
        ),
        h('button', { class: 'primary', onclick: () => S.storeGrip() }, 'Store grip'),
      ),
      h(
        'div',
        { class: 'note' },
        'Offsets are in the hand socket frame (palm centre; +Y to the fingers, +Z out of the palm). Pause the clip to place a prop, then play to check it. Second-hand and cradle grips are in prop space.',
      ),
    ),
  );
}
