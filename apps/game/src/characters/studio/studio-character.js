/**
 * The studio's character: the game's own createHeroCast (hero-cast.js) standing on a
 * one-person stage, so the loaders, MToon tone, clip set, clip blender and every motion
 * layer are the code the game runs. The studio feeds it a figure (where the simulation
 * would put the person) and switches through hero.setDebug: a forced clip held at the
 * timeline's time, rig layers off by name, steering off and prop visibility.
 *
 * Ghosts (onion skin) are extra instances of the same model posed by the pure clip at
 * nearby times, drawn in a flat translucent colour.
 */
import * as THREE from 'three';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { createHeroCast, MOMIJI_CAST, VRM_CLIPS } from '../../world/hero-cast.js';
import { createVrmActor } from '../vrm-actor.js';
import { tuningKey } from '../cast-tuning.js';
import { GAITS } from '../../world/character-motion.js';

const PEOPLE = { sato: 'Mr. Sato', riko: 'Riko', ishida: 'Mr. Ishida' };
const SIT_CLIPS = new Set(['sit', 'sit-enter', 'sit-exit']);

const stem = (path) =>
  String(path)
    .split('/')
    .pop()
    .replace(/\.[a-z0-9]+$/i, '');
const titleCase = (name) =>
  name.replace(/[-_]+/g, ' ').replace(/\b[a-z]/g, (letter) => letter.toUpperCase());

/** The clip a studio-made name derives from ("wave-mirror+fix" -> "wave"). */
export const baseClip = (name) => String(name).replace(/(\+fix|-mirror)+$/g, '');
export const isGait = (name) => GAITS.has(baseClip(name));
export const isSeated = (name) => SIT_CLIPS.has(baseClip(name));

/** Character list entries for every model file the dev server found. */
export function characterEntries(files) {
  return files.map(({ path, kind, bytes }) => {
    const member = MOMIJI_CAST.find((m) => m.vrm === path || m.path === path) ?? null;
    const person = member ? stem(member.vrm) : stem(path);
    const label = PEOPLE[person] ?? titleCase(person);
    const group = member
      ? 'Momiji cast'
      : /crowd|resident|passenger/i.test(path)
        ? 'Crowd kit'
        : 'Other models';
    return {
      id: tuningKey(path),
      path,
      kind,
      bytes,
      member,
      person,
      label,
      detail: kind === 'vrm' ? 'VRM' : member ? 'Blender GLB (?cast=blender)' : 'GLB',
      group,
    };
  });
}

/** A seeded random source, so blinks and idle phases repeat between loads. */
export function seededRandom(seed = 1) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Load one entry as a hero on `stage`. Resolves to the hero, its internals and the figure
 * the studio moves. `clipFile` picks the VRM clip set (cast-clips.vrma by default).
 */
export async function loadCharacter({
  entry,
  stage,
  modelLoader,
  vrmLoader,
  minds,
  clipFile = VRM_CLIPS,
}) {
  const personId = `studio:${entry.id}`;
  const figure = {
    visible: true,
    pose: 'standing',
    state: '',
    position: new THREE.Vector3(),
    heading: 0,
    walking: false,
    speed: 0,
  };
  const member = entry.member ?? {};
  const isVrm = entry.kind === 'vrm';
  const hero = createHeroCast({
    THREE,
    scene: stage,
    loader: modelLoader,
    worldDetails: { setStandIn() {}, figureOf: (id) => (id === personId ? figure : null) },
    minds,
    personId,
    path: isVrm ? (member.path ?? entry.path) : entry.path,
    vrm: isVrm ? entry.path : null,
    vrmLoader: isVrm ? vrmLoader : null,
    clips: clipFile,
    props: isVrm ? (member.props ?? null) : null,
    pocketed: member.pocketed ?? [],
    clipVariants: member.clipVariants ?? {},
    carry: member.carry ?? null,
    seatHeight: member.seatHeight ?? null,
    random: seededRandom(7),
  });
  await hero.ready;
  const internals = hero.internals();
  if (!internals.root) throw new Error(`${entry.path} did not load`);
  // The bind pose, before any clip: feet rest heights and the body's height for overlays.
  internals.root.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(internals.root);
  const footRest = {};
  for (const side of ['L', 'R']) {
    const foot = internals.humanoid.raw[`foot${side}`];
    footRest[side] = foot ? foot.getWorldPosition(new THREE.Vector3()).y - bounds.min.y : 0.08;
  }
  return {
    entry,
    hero,
    internals,
    figure,
    personId,
    modelPath: isVrm ? entry.path : entry.path,
    clipFile,
    bindBounds: bounds,
    footRest,
  };
}

// ---- ghosts ---------------------------------------------------------------------------------

function ghostMaterial(color) {
  return new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity: 0.24,
    depthWrite: false,
    toneMapped: false,
  });
}

/**
 * Onion-skin copies of a loaded character. Each ghost is a fresh instance of the same file
 * (a VRM through createVrmActor with the same clip set, a GLB through a skeleton clone),
 * posed by the clip alone at its own time: the layers are not run on ghosts.
 */
export async function createGhosts({ loaded, stage, vrmLoader, modelLoader, count = 1 }) {
  const ghosts = [];
  const { entry } = loaded;
  const make = async (k) => {
    let root;
    let mixer;
    let actions;
    let update;
    if (entry.kind === 'vrm') {
      const [vrm, clipSet] = await Promise.all([
        vrmLoader.vrm(entry.path),
        vrmLoader.animations(loaded.clipFile),
      ]);
      if (!vrm) return null;
      const actor = createVrmActor({ THREE, vrm: vrm.vrm, m: vrm.m, clipSet });
      root = actor.root;
      mixer = actor.mixer;
      actions = actor.actions;
      update = () => actor.update(0);
    } else {
      const gltf = await modelLoader.get(entry.path);
      if (!gltf) return null;
      root = SkeletonUtils.clone(gltf.scene);
      mixer = new THREE.AnimationMixer(root);
      actions = new Map(gltf.animations.map((clip) => [clip.name, mixer.clipAction(clip)]));
      update = () => mixer.update(0);
    }
    const material = ghostMaterial(k < 0 ? '#6aa7ff' : '#ffb35c');
    root.traverse((node) => {
      if (!node.isMesh) return;
      node.material = material;
      node.castShadow = false;
      node.receiveShadow = false;
      node.frustumCulled = false;
      node.renderOrder = 2;
    });
    root.name = `ghost ${k}`;
    stage.add(root);
    return { k, root, mixer, actions, update, material, current: null };
  };
  for (let i = 1; i <= count; i++) for (const k of [-i, i]) ghosts.push(make(k));
  const list = (await Promise.all(ghosts)).filter(Boolean);
  return {
    list,
    /** Pose each ghost: `times` from ghostTimes(), `offsetFor(k)` its root shift. */
    update(clip, times, place) {
      for (const ghost of list) {
        const entryTime = times.find((t) => t.k === ghost.k);
        ghost.root.visible = Boolean(entryTime);
        if (!entryTime) continue;
        const action = ghost.actions.get(clip) ?? ghost.actions.get(baseClip(clip));
        if (!action) {
          ghost.root.visible = false;
          continue;
        }
        if (ghost.current !== action) {
          ghost.mixer.stopAllAction();
          action.reset().play();
          action.setEffectiveWeight(1);
          ghost.current = action;
        }
        action.time = entryTime.time;
        action.timeScale = 0;
        ghost.update();
        place(ghost.root, ghost.k, entryTime);
      }
    },
    setVisible(visible, { previous = true, next = true } = {}) {
      for (const ghost of list)
        ghost.root.visible = visible && (ghost.k < 0 ? previous : next) && ghost.root.visible;
    },
    /** Studio-made clips (mirrors, corrections) are added to ghosts too. */
    addClip(name, clip) {
      for (const ghost of list)
        if (!ghost.actions.has(name)) ghost.actions.set(name, ghost.mixer.clipAction(clip));
    },
    dispose() {
      for (const ghost of list) {
        ghost.mixer.stopAllAction();
        ghost.root.removeFromParent();
        ghost.material.dispose();
      }
    },
  };
}
