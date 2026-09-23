import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { createVrmActor } from '../characters/vrm-actor.js';

/**
 * A skinned character standing in for one simulated person. The person's movement,
 * boarding and routines stay in the population simulation; this module only replaces how
 * they are drawn. Clips follow walking speed, seating, boarding and the NPC mind's intent,
 * blinks run on their own clock, the smile follows mood, and the mouth moves while an
 * episode line attributed to this person is on screen.
 *
 * Two model kinds share that behaviour. A VRM (anime style, MToon shading, spring-bone
 * hair, VRM expressions and visemes) loads first when the cast entry names one; the older
 * Blender GLB is the next fallback, and the instanced figure stays visible if both fail.
 */
export const HERO_WALK_SPEED = 1.15;
export const HERO_HURRY_SPEED = 1.75;

/**
 * Momiji people who have a model. `vrm` files are built by asset-src/characters/vrm-cast;
 * `path` GLBs by asset-src/characters/momiji-cast and stay as the fallback.
 */
export const MOMIJI_CAST = Object.freeze([
  {
    personId: 'commuter-1',
    path: 'models/characters/commuter-hero.glb',
    vrm: 'models/characters/vrm/sato.vrm',
  },
  {
    personId: 'commuter-2',
    path: 'models/characters/student-riko.glb',
    vrm: 'models/characters/vrm/riko.vrm',
  },
  // The Momiji reading bench is 0.61 m above the reader's figure origin, matching the
  // instanced figure's seated thighs (population.js reading pose).
  {
    personId: 'reader-1',
    path: 'models/characters/reader-ishida.glb',
    vrm: 'models/characters/vrm/ishida.vrm',
    seatHeight: 0.61,
  },
]);

/** The shared clip set for every VRM, retargeted offline (asset-src/characters/vrm-cast). */
export const VRM_CLIPS = 'models/characters/vrm/cast-clips.vrma';

/** Syllables per second in the talking rhythm below (the jaw's main 24 rad/s wave). */
const SYLLABLE_RATE = 24 / (2 * Math.PI);
/** A figure that moves further than this in one frame was placed, not walked. */
const TELEPORT_METRES = 1.5;

/** Intents whose clip has the same name. Others (continue, linger, hurry, sit) stand idle. */
const INTENT_CLIPS = new Set(['wave', 'check-phone', 'watch-train', 'shelter', 'chat', 'stretch']);
const SEATED_POSES = new Set(['reading', 'seated']);

/**
 * Which clip to play, and at what speed, for a person's movement, pose, state and intent.
 * `walkSpeed` and `hurrySpeed` are the model's own foot speeds, read from the GLB.
 */
export function heroClip({
  speed = 0,
  intent = 'continue',
  pose = 'standing',
  state = '',
  walkSpeed = HERO_WALK_SPEED,
  hurrySpeed = HERO_HURRY_SPEED,
} = {}) {
  if (state === 'boarding') return { clip: 'board', timeScale: 1, once: true };
  if (SEATED_POSES.has(pose)) return { clip: 'sit', timeScale: 1 };
  if (speed > 0.25) {
    if (speed > (walkSpeed + hurrySpeed) / 2)
      return { clip: 'hurry', timeScale: Math.min(1.5, Math.max(0.8, speed / hurrySpeed)) };
    return { clip: 'walk', timeScale: Math.min(1.6, Math.max(0.6, speed / walkSpeed)) };
  }
  if (INTENT_CLIPS.has(intent)) return { clip: intent, timeScale: 1 };
  return { clip: 'idle', timeScale: 1 };
}

/** Smile weight for a mind's mood; neutral moods keep a slight softness. */
export function moodSmile(mood) {
  return { cheerful: 0.7, content: 0.25, curious: 0.2, wistful: 0.05, shy: 0.15 }[mood] ?? 0;
}

export function createHeroCast({
  THREE,
  scene,
  loader,
  worldDetails,
  minds,
  personId = 'commuter-1',
  path = 'models/characters/commuter-hero.glb',
  // Height of this person's bench surface above their figure's origin, when seated.
  // Defaults to the model's own seat height, which places it without an offset.
  seatHeight = null,
  // VRM file and the loader from characters/vrm-loader.js; without both, the GLB is used.
  vrm = null,
  clips = VRM_CLIPS,
  vrmLoader = null,
  mobile = false,
  random = Math.random,
}) {
  let status = 'loading';
  let kind = null;
  let root = null;
  let mixer = null;
  let face = null;
  let actor = null;
  let actions = new Map();
  let wasVisible = false;
  let current = null;
  let speed = 0;
  const last = new THREE.Vector3(NaN, NaN, NaN);
  let blinkIn = 2 + random() * 3;
  let blinkT = -1;
  let talkFor = 0;
  let talkT = 0;
  let smile = 0;
  let gait = { walkSpeed: HERO_WALK_SPEED, hurrySpeed: HERO_HURRY_SPEED, seatHeight: 0 };
  let newspaper = null;

  async function loadVrm() {
    if (!vrm || !vrmLoader) return false;
    const [loaded, clipSet] = await Promise.all([vrmLoader.vrm(vrm), vrmLoader.animations(clips)]);
    if (!loaded) return false;
    if (status === 'disposed') {
      loaded.m.VRMUtils.deepDispose(loaded.vrm.scene);
      return true;
    }
    actor = createVrmActor({ THREE, vrm: loaded.vrm, m: loaded.m, clipSet, mobile });
    root = actor.root;
    mixer = actor.mixer;
    actions = actor.actions;
    gait = { ...actor.gait };
    kind = 'vrm';
    return true;
  }

  async function loadGlb() {
    const gltf = await loader.get(path);
    if (!gltf || status === 'disposed') return false;
    root = SkeletonUtils.clone(gltf.scene);
    root.traverse((node) => {
      if (Number.isFinite(node.userData?.walkSpeed))
        gait = {
          walkSpeed: node.userData.walkSpeed,
          hurrySpeed: node.userData.hurrySpeed ?? HERO_HURRY_SPEED,
          seatHeight: node.userData.seatHeight ?? 0,
        };
      if (node.isMesh) {
        node.castShadow = true;
        node.receiveShadow = true;
        // Skinned bounds come from the bind pose; animated limbs can leave them.
        node.frustumCulled = false;
        if (node.morphTargetDictionary) face = node;
      }
    });
    mixer = new THREE.AnimationMixer(root);
    for (const clip of gltf.animations) actions.set(clip.name, mixer.clipAction(clip));
    kind = 'glb';
    return true;
  }

  const ready = (async () => {
    const loaded = (await loadVrm()) || (await loadGlb());
    if (status === 'disposed') return;
    if (!loaded || !root) {
      status = 'fallback';
      return;
    }
    root.name = `Hero / ${personId}`;
    // A reader's paper is its own mesh, shown only while seated.
    newspaper = root.getObjectByName('newspaper') ?? null;
    if (newspaper) newspaper.visible = false;
    scene.add(root);
    worldDetails.setStandIn(personId, true);
    status = 'ready';
  })();

  function morph(name, value) {
    if (actor) {
      actor.face.set(name, value);
      return;
    }
    const index = face?.morphTargetDictionary[name];
    if (index !== undefined) face.morphTargetInfluences[index] = value;
  }

  function play(name, timeScale, once = false) {
    const next = actions.get(name) ?? actions.get('idle');
    if (!next) return;
    next.timeScale = timeScale;
    if (next === current) return;
    next.setLoop(once ? THREE.LoopOnce : THREE.LoopRepeat, Infinity);
    next.clampWhenFinished = once;
    next.reset().play();
    if (current) current.crossFadeTo(next, 0.3, false);
    current = next;
  }

  return {
    ready,
    update(dt, { paused = false } = {}) {
      if (status !== 'ready') return;
      const figure = worldDetails.figureOf(personId);
      root.visible = Boolean(figure?.visible);
      if (!root.visible) {
        wasVisible = false;
        return;
      }
      const jumped = !wasVisible || !(root.position.distanceTo(figure.position) < TELEPORT_METRES);
      wasVisible = true;
      root.position.copy(figure.position);
      root.rotation.y = figure.heading;
      const seated = SEATED_POSES.has(figure.pose);
      if (seated && seatHeight !== null) root.position.y += seatHeight - gait.seatHeight;
      if (newspaper) newspaper.visible = seated;
      if (jumped && actor) {
        root.updateMatrixWorld(true);
        actor.resetSprings();
      }
      if (paused || !(dt > 0)) return;
      if (Number.isFinite(last.x)) {
        const moved = Math.hypot(figure.position.x - last.x, figure.position.z - last.z) / dt;
        speed += (Math.min(moved, 4) - speed) * (1 - Math.exp(-dt * 6));
      }
      last.copy(figure.position);
      const expression = minds?.expressionFor(personId);
      const choice = heroClip({
        speed,
        intent: expression?.intent,
        pose: figure.pose,
        state: figure.state,
        walkSpeed: gait.walkSpeed,
        hurrySpeed: gait.hurrySpeed,
      });
      play(choice.clip, choice.timeScale, choice.once);
      // A GLB's mixer runs before its morphs; a VRM applies clips, face and springs together.
      if (!actor) mixer.update(dt);

      // Blink every few seconds: 70 ms closing, 90 ms opening.
      blinkIn -= dt;
      if (blinkIn <= 0 && blinkT < 0) {
        blinkT = 0;
        blinkIn = 2.2 + random() * 4;
      }
      let lid = 0;
      if (blinkT >= 0) {
        blinkT += dt;
        lid = blinkT < 0.07 ? blinkT / 0.07 : Math.max(0, 1 - (blinkT - 0.07) / 0.09);
        if (blinkT > 0.16) blinkT = -1;
      }
      morph('blink-l', lid);
      morph('blink-r', lid);
      smile += (moodSmile(expression?.mood) - smile) * (1 - Math.exp(-dt * 3));
      morph('smile', smile);
      // Talking: an uneven open-close rhythm, about four syllables a second.
      talkFor = Math.max(0, talkFor - dt);
      talkT += dt;
      const jaw =
        talkFor > 0
          ? Math.max(0, Math.sin(talkT * 24) * 0.55 + Math.sin(talkT * 9.3) * 0.35) *
            Math.min(1, talkFor * 4)
          : 0;
      morph('jaw-open', jaw);
      if (actor) {
        actor.face.setSyllable(Math.floor(talkT * SYLLABLE_RATE));
        actor.update(dt);
      }
    },
    /** Move the jaw for a line on screen; `seconds` is the subtitle's reading time. */
    talk(seconds) {
      talkFor = Math.max(talkFor, seconds * 0.85);
    },
    get personId() {
      return personId;
    },
    getState() {
      return {
        status,
        personId,
        clip: current?.getClip().name ?? null,
        speed: Number(speed.toFixed(2)),
        talking: talkFor > 0,
        clips: [...actions.keys()],
        gait: { ...gait },
        kind,
        morphs: actor ? actor.face.names() : face ? Object.keys(face.morphTargetDictionary) : [],
      };
    },
    dispose() {
      status = 'disposed';
      worldDetails.setStandIn(personId, false);
      if (root) scene.remove(root);
      mixer?.stopAllAction();
      actor?.dispose();
    },
  };
}
