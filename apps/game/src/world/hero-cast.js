import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { createVrmActor } from '../characters/vrm-actor.js';
import { humanoidRigFor } from '../characters/humanoid-bones.js';
import {
  attachProps,
  createHandSockets,
  createSteering,
  strideTimeScale,
} from './character-motion.js';
import { createCharacterRig, createClipBlender } from './character-rig.js';

/**
 * A skinned character standing in for one simulated person. The person's movement,
 * boarding and routines stay in the population simulation; this module only replaces how
 * they are drawn. Two model kinds share the behaviour: a VRM (anime style, MToon, spring
 * hair, VRM expressions and visemes) loads first when the cast entry names one; the older
 * Blender GLB is the next fallback, and the instanced figure stays visible if both fail.
 *
 * Between the simulation and the body sits a steering layer (character-motion.js): the body
 * walks only forward, turns in arcs or on the spot, accelerates within limits and ignores
 * sub-centimetre jitter, and the walk clip plays at the body's real speed. After the clips,
 * character-rig.js adds breathing and weight shift, a clamped look-at (a speaker, the train,
 * or the camera in a portrait), props held in hand sockets with a closed grip and second-hand
 * IK, and planted feet. It works through canonical bones (characters/humanoid-bones.js), so
 * the same layers drive both model kinds. Blinks run on their own clock, the smile follows
 * mood, and the mouth moves while an episode line attributed to this person is on screen.
 */
export const HERO_WALK_SPEED = 1.15;
export const HERO_HURRY_SPEED = 1.75;

/**
 * Momiji people who have a model. `vrm` files are built by asset-src/characters/vrm-cast;
 * `path` GLBs and the hand-prop `props` GLBs by asset-src/characters/momiji-cast.
 */
export const MOMIJI_CAST = Object.freeze([
  {
    personId: 'commuter-1',
    path: 'models/characters/commuter-hero.glb',
    vrm: 'models/characters/vrm/sato.vrm',
    props: 'models/characters/props/sato.glb',
    // The office commuter walks upright, arms close (UAL Walk_Formal_Loop).
    clipVariants: { walk: 'walk-formal' },
  },
  {
    personId: 'commuter-2',
    path: 'models/characters/student-riko.glb',
    vrm: 'models/characters/vrm/riko.vrm',
    props: 'models/characters/props/riko.glb',
    // Riko keeps her phone in a pocket and takes it out to check it; her hands are for the
    // radio she is carrying home.
    pocketed: ['phone'],
    // Walking with the radio: the carry walk holds both hands in front without an arm swing,
    // and the radio stays in her left hand. No arm IK runs against that clip.
    carry: { prop: 'radio', walk: 'walk-carry', hurry: 'walk-carry' },
  },
  // The Momiji reading bench is 0.61 m above the reader's figure origin, matching the
  // instanced figure's seated thighs (population.js reading pose).
  {
    personId: 'reader-1',
    path: 'models/characters/reader-ishida.glb',
    vrm: 'models/characters/vrm/ishida.vrm',
    props: 'models/characters/props/ishida.glb',
    seatHeight: 0.61,
  },
]);

/**
 * The shared clip set for every VRM: Quaternius UAL 1 and 2, retargeted offline by
 * asset-src/characters/vrm-cast/retarget.mjs. The Blender cast's own clips stay inside the
 * Blender GLBs (`?cast=blender`) and are not used on VRMs.
 */
export const VRM_CLIPS = 'models/characters/vrm/cast-clips.vrma';

/** Syllables per second in the talking rhythm below (the jaw's main 24 rad/s wave). */
const SYLLABLE_RATE = 24 / (2 * Math.PI);

/** Intents whose clip has the same name. Others (continue, linger, hurry, sit) stand idle. */
const INTENT_CLIPS = new Set([
  'wave',
  'check-phone',
  'watch-train',
  'shelter',
  'chat',
  'stretch',
  'nod-yes',
  'shake-no',
  'eat',
]);
const SEATED_POSES = new Set(['reading', 'seated']);
/** How much idle life each clip takes: full while idle, a little under gestures. */
const IDLE_LIFE = {
  idle: 1,
  'watch-train': 0.6,
  chat: 0.4,
  shelter: 0.3,
  'check-phone': 0.4,
  'nod-yes': 0.3,
  'shake-no': 0.3,
  eat: 0.3,
};
/** m/s either side of the walk/hurry boundary before the gait changes. */
export const GAIT_HYSTERESIS = 0.1;
/** Clips that are a sitting pose: the feet are not planted and idle life rests. */
const SIT_CLIPS = new Set(['sit', 'sit-enter', 'sit-exit']);
/** A mind's intent must hold this long before the body changes gesture: no flicker. */
export const INTENT_HOLD_SECONDS = 1.5;
/** Clips during which a cradled prop comes up to the chest. */
const CRADLE_CLIPS = new Set(['idle', 'watch-train']);
/** A train further away than this, out of sight down the line, is not looked at. */
const TRAIN_LOOK_METRES = 140;

/** Everyone drawn this way, so listeners can look at whoever is speaking. */
const stage = new Map();

/**
 * Which clip to play, and at what speed, for a person's movement, pose, state and intent.
 * `walkSpeed` and `hurrySpeed` are the model's own foot speeds, read from the model; the
 * timeScale makes the feet travel at `speed`, the body's drawn speed.
 */
export function heroClip({
  speed = 0,
  intent = 'continue',
  pose = 'standing',
  state = '',
  turning = false,
  walkSpeed = HERO_WALK_SPEED,
  hurrySpeed = HERO_HURRY_SPEED,
  seat = null,
  // Already hurrying: the switch back to walking waits until the body is clearly slower, so
  // a speed that hovers at the boundary does not flip the gait every few frames.
  hurrying = false,
} = {}) {
  if (state === 'boarding') return { clip: 'board', timeScale: 1, once: true };
  // Sitting down and standing up, when the model has the transitions (see seatPhase).
  if (seat === 'enter') return { clip: 'sit-enter', timeScale: 1, once: true };
  if (seat === 'exit') return { clip: 'sit-exit', timeScale: 1, once: true };
  if (SEATED_POSES.has(pose)) return { clip: 'sit', timeScale: 1 };
  if (speed > 0.25) {
    const boundary = (walkSpeed + hurrySpeed) / 2 + (hurrying ? -GAIT_HYSTERESIS : GAIT_HYSTERESIS);
    if (speed > boundary)
      return {
        clip: 'hurry',
        timeScale: strideTimeScale(speed, hurrySpeed, { min: 0.8, max: 1.5 }),
      };
    return { clip: 'walk', timeScale: strideTimeScale(speed, walkSpeed) };
  }
  if (turning) return { clip: 'turn', timeScale: 1 };
  if (INTENT_CLIPS.has(intent)) return { clip: intent, timeScale: 1 };
  return { clip: 'idle', timeScale: 1 };
}

/**
 * The next sit-transition phase: 'enter' plays sit-enter, 'seated' the sit loop, 'exit'
 * sit-exit, 'none' standing. `clipDone` says the current one-shot has finished. Without
 * transition clips (the Blender GLBs) a person goes straight between 'none' and 'seated'.
 */
export function seatPhase(phase, { seated, clipDone = false, jumped = false, hasTransitions }) {
  if (jumped || !hasTransitions) return seated ? 'seated' : 'none';
  if (seated) {
    if (phase === 'none' || phase === 'exit') return 'enter';
    if (phase === 'enter' && clipDone) return 'seated';
    return phase;
  }
  if (phase === 'seated' || phase === 'enter') return 'exit';
  if (phase === 'exit' && clipDone) return 'none';
  return phase;
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
  // Hand props for a VRM (the GLB carries its own): a GLB of socket-space prop nodes.
  props: propsPath = null,
  // Props kept out of sight except while their clip needs them (a phone in a pocket).
  pocketed = [],
  // Per-person clip names: { walk: 'walk-formal' } plays that clip in place of `walk`.
  clipVariants = {},
  // A prop carried in both hands while walking: { prop: 'radio', walk: 'walk-carry' }.
  carry = null,
  random = Math.random,
}) {
  let status = 'loading';
  let kind = null;
  let root = null;
  let mixer = null;
  let face = null;
  let actor = null;
  let actions = new Map();
  let blender = null;
  let rig = null;
  let humanoid = null;
  let props = [];
  let wasVisible = false;
  let blinkIn = 2 + random() * 3;
  let blinkT = -1;
  let talkFor = 0;
  let talkT = 0;
  let smile = 0;
  let gait = {
    walkSpeed: HERO_WALK_SPEED,
    hurrySpeed: HERO_HURRY_SPEED,
    seatHeight: 0,
    seatBack: 0,
    seatDrop: 0,
    speeds: {},
  };
  let lookingAt = null;
  // Sitting down and standing up (VRM clip sets carry sit-enter and sit-exit).
  let seat = 'none';
  let seatClipTime = 0;
  let seatShift = 0;
  let hipsRestY = null;
  // The intent the body is showing, held for INTENT_HOLD_SECONDS before it may change.
  let shownIntent = null;
  let shownFor = Infinity;
  // Development and measurement switches: { layers: {look: false, ...}, clip, intent }.
  let debug = {};
  const steering = createSteering();
  const head = new THREE.Vector3();
  const lookPoint = new THREE.Vector3();
  const eyeTarget = new THREE.Object3D();
  const entry = { personId, visible: false, talking: false, head, position: new THREE.Vector3() };

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
    humanoid = actor.rig;
    // Hand props come from the Blender build: they sit in the canonical socket frame, so
    // they fit any skeleton's hand sockets. The VRM's own newspaper stays skinned.
    const propScene = propsPath ? (await loader.get(propsPath))?.scene : null;
    if (propScene)
      for (const node of propScene.children)
        if (node.isMesh && !root.getObjectByName(node.name)) {
          const copy = node.clone();
          copy.castShadow = true;
          root.add(copy);
        }
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
          ...gait,
          walkSpeed: node.userData.walkSpeed,
          hurrySpeed: node.userData.hurrySpeed ?? HERO_HURRY_SPEED,
          seatHeight: node.userData.seatHeight ?? 0,
        };
      if (node.isMesh) {
        node.castShadow = true;
        node.receiveShadow = true;
        // Skinned bounds come from the bind pose; animated limbs can leave them.
        node.frustumCulled = false;
        if (node.morphTargetDictionary && node.isSkinnedMesh) face = node;
      }
    });
    mixer = new THREE.AnimationMixer(root);
    for (const clip of gltf.animations) actions.set(clip.name, mixer.clipAction(clip));
    humanoid = humanoidRigFor(root);
    kind = 'glb';
    return true;
  }

  function buildRig() {
    root.updateMatrixWorld(true);
    const bounds = new THREE.Box3().setFromObject(root);
    const height = Math.max(1, bounds.max.y - bounds.min.y);
    const sockets = createHandSockets(THREE, root, humanoid.raw);
    props = attachProps(THREE, root, sockets);
    rig = humanoid.missing.length
      ? null
      : createCharacterRig(THREE, root, {
          bones: humanoid.bones,
          raw: humanoid.raw,
          sockets,
          props,
          face,
          random,
          heightScale: height / 1.7,
        });
    // A VRM's clips run inside actor.update(), after the blender sets the fade weights.
    blender = createClipBlender(THREE, mixer, actions, { random, drive: !actor });
    if (actor?.vrm.lookAt) scene.add(eyeTarget);
    hipsRestY = humanoid.bones.hips?.position.y ?? null;
  }

  /** How far a sitting pose has gone down, 0 standing to 1 seated, read from the hips. */
  function seatedFraction() {
    if (seat === 'none') return 0;
    if (seat === 'seated' || !(gait.seatDrop > 0) || hipsRestY === null) return 1;
    const drop = hipsRestY - humanoid.bones.hips.position.y;
    return Math.min(1, Math.max(0, drop / gait.seatDrop));
  }

  /** The clip a person's variants and carried props replace `name` with. */
  function variantOf(name, carrying) {
    const wanted = (carrying && carry?.[name]) || clipVariants[name];
    return wanted && actions.has(wanted) ? wanted : name;
  }

  const ready = (async () => {
    const loaded = (await loadVrm()) || (await loadGlb());
    if (status === 'disposed') return;
    if (!loaded || !root) {
      status = 'fallback';
      return;
    }
    root.name = `Hero / ${personId}`;
    buildRig();
    scene.add(root);
    worldDetails.setStandIn(personId, true);
    stage.set(personId, entry);
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

  /** Someone else talking nearby, the person this one is talking to, the camera or the train. */
  function chooseLook(expression, context, walking) {
    let best = null;
    let bestDistance = Infinity;
    for (const other of stage.values()) {
      if (other === entry || !other.visible) continue;
      const distance = other.position.distanceTo(entry.position);
      const wanted = talkFor > 0 ? distance < 5 : other.talking && distance < 9;
      if (wanted && distance < bestDistance) {
        best = other;
        bestDistance = distance;
      }
    }
    if (best) return { point: lookPoint.copy(best.head), strength: 1, what: best.personId };
    if (context.portrait === personId && context.camera)
      return { point: lookPoint.copy(context.camera.position), strength: 0.55, what: 'camera' };
    const train = context.trainPosition;
    if (train && (expression?.lookAt === 'train' || expression?.intent === 'watch-train')) {
      if (Array.isArray(train)) lookPoint.set(train[0], train[1], train[2]);
      else lookPoint.copy(train);
      if (lookPoint.distanceTo(entry.position) > TRAIN_LOOK_METRES) return null;
      lookPoint.y += 1.8;
      return { point: lookPoint, strength: walking ? 0.6 : 0.9, what: 'train' };
    }
    return null;
  }

  return {
    ready,
    /**
     * @param {number} dt
     * @param {object} [context]
     * @param {boolean} [context.paused]
     * @param {import('three').Vector3|number[]} [context.trainPosition] for looking at the train
     * @param {import('three').Camera} [context.camera]
     * @param {string|null} [context.portrait] personId the director's portrait is framing
     */
    update(dt, context = {}) {
      if (status !== 'ready') return;
      const { paused = false } = context;
      const figure = worldDetails.figureOf(personId);
      root.visible = Boolean(figure?.visible);
      entry.visible = root.visible;
      if (!root.visible) {
        wasVisible = false;
        return;
      }
      const seated = SEATED_POSES.has(figure.pose);
      const boarding = figure.state === 'boarding';
      const firstFrame = !wasVisible;
      const target = {
        x: figure.position.x,
        y: figure.position.y,
        z: figure.position.z,
        heading: figure.heading,
        moving: Boolean(figure.walking),
        hold: seated || boarding,
      };
      // Reappearing (alighting at a door, a Places jump): start where the simulation is.
      const before = { x: steering.state.x, z: steering.state.z };
      if (!wasVisible) steering.snap(target);
      const step = paused || !(dt > 0) ? 0 : dt;
      // Standing up: the body stays on the spot until sit-exit ends, then walks on.
      const standingUp = seat === 'exit' && !seated;
      const body = step && !standingUp ? steering.update(step, target) : steering.state;
      const jumped =
        !wasVisible ||
        Math.hypot(body.x - before.x, body.z - before.z) > steering.options.snapDistance;
      wasVisible = true;
      const clipDone =
        (seat === 'enter' || seat === 'exit') &&
        seatClipTime >= (actions.get(`sit-${seat}`)?.getClip().duration ?? 0);
      const nextSeat = seatPhase(seat, {
        seated,
        clipDone,
        jumped: firstFrame || jumped,
        hasTransitions: actions.has('sit-enter') && actions.has('sit-exit'),
      });
      if (nextSeat !== seat) seatClipTime = 0;
      seat = nextSeat;
      root.position.set(body.x, body.y, body.z);
      root.rotation.y = body.heading;
      // Seated clips put the pelvis behind the figure origin: move forward so it lands over
      // the bench, and lift by the bench height once the hips have gone down.
      const shiftTarget = seat === 'none' ? 0 : gait.seatBack;
      seatShift =
        firstFrame || jumped
          ? shiftTarget
          : seatShift + (shiftTarget - seatShift) * (1 - Math.exp(-(step || 0) * 6));
      if (seatShift) {
        root.position.x += Math.sin(body.heading) * seatShift;
        root.position.z += Math.cos(body.heading) * seatShift;
      }
      if (seatHeight !== null) root.position.y += (seatHeight - gait.seatHeight) * seatedFraction();
      entry.position.copy(root.position);
      for (const prop of props) {
        if (prop.name === 'newspaper') prop.node.visible = seated;
        else if (pocketed.includes(prop.name)) prop.node.visible = blender.name === 'check-phone';
      }
      if (actor) {
        // A VRM's own skinned paper is shown only while seated, like the GLB's prop.
        const paper = root.getObjectByName('newspaper');
        if (paper && !props.some((prop) => prop.node === paper)) paper.visible = seated;
      }
      if (jumped && actor) {
        root.updateMatrixWorld(true);
        actor.resetSprings();
      }
      if (!step) return;

      const expression = minds?.expressionFor(personId);
      // Hold a shown intent for a moment, so a mind that changes its mind every frame does
      // not restart gestures.
      const wantedIntent = debug.intent ?? expression?.intent ?? 'continue';
      shownFor += step;
      if (wantedIntent !== shownIntent && shownFor >= INTENT_HOLD_SECONDS) {
        shownIntent = wantedIntent;
        shownFor = 0;
      }
      const carrying = Boolean(
        carry && props.some((prop) => prop.name === carry.prop && prop.node.visible),
      );
      const walkName = variantOf('walk', carrying);
      const hurryName = variantOf('hurry', carrying);
      const choice = heroClip({
        speed: body.speed,
        intent: shownIntent,
        pose: figure.pose,
        state: figure.state,
        turning: body.turning || Math.abs(body.turnVelocity) > 1.2,
        walkSpeed: gait.speeds[walkName] ?? gait.walkSpeed,
        hurrySpeed: gait.hurrySpeed,
        seat: seat === 'enter' || seat === 'exit' ? seat : null,
        hurrying: blender.name === hurryName && hurryName !== walkName,
      });
      if (choice.clip === 'turn' && !actions.has('turn')) choice.clip = 'idle';
      if (choice.clip === 'walk') choice.clip = walkName;
      if (choice.clip === 'hurry' && hurryName !== 'hurry') {
        // A carried radio: hurrying is the carry walk at a quicker cadence.
        choice.clip = hurryName;
        choice.timeScale = strideTimeScale(body.speed, gait.speeds[hurryName] ?? gait.walkSpeed);
      }
      if (debug.clip && actions.has(debug.clip)) {
        choice.clip = debug.clip;
        choice.timeScale = debug.timeScale ?? choice.timeScale;
      }
      seatClipTime += step;
      rig?.resetPose();
      blender.play(choice.clip, choice.timeScale, choice.once);
      blender.update(step);

      const walking = body.speed > 0.25;
      const layers = () => {
        if (!rig) return;
        const look = chooseLook(expression, context, walking);
        lookingAt = look?.what ?? null;
        const inSeat = seat !== 'none' || seated || SIT_CLIPS.has(blender.name);
        rig.apply(step, {
          idle: walking || inSeat ? 0 : (IDLE_LIFE[blender.name] ?? 0),
          breath: inSeat ? 0.6 : 1,
          lookTarget: look?.point ?? null,
          lookStrength: look?.strength ?? 0,
          maxYaw: walking ? 0.6 : 1.2,
          planted: !inSeat && !boarding,
          moving: walking || blender.name === 'turn',
          groundY: body.y,
          // Someone carrying the prop keeps it cradled while turning on the spot; otherwise
          // it comes up only while standing still.
          cradle: CRADLE_CLIPS.has(blender.name) && (carrying || (body.resting && !body.turning)),
          layers: debug.layers,
        });
        humanoid.bones.head.getWorldPosition(head);
        if (actor?.vrm.lookAt) {
          // The VRM's eyes follow the same target as the head.
          if (look) eyeTarget.position.copy(look.point);
          actor.vrm.lookAt.target = look ? eyeTarget : null;
        }
      };
      if (!actor) layers();

      // Blink every few seconds: 70 ms closing, 90 ms opening.
      blinkIn -= step;
      if (blinkIn <= 0 && blinkT < 0) {
        blinkT = 0;
        blinkIn = 2.2 + random() * 4;
      }
      let lid = 0;
      if (blinkT >= 0) {
        blinkT += step;
        lid = blinkT < 0.07 ? blinkT / 0.07 : Math.max(0, 1 - (blinkT - 0.07) / 0.09);
        if (blinkT > 0.16) blinkT = -1;
      }
      morph('blink-l', lid);
      morph('blink-r', lid);
      smile += (moodSmile(expression?.mood) - smile) * (1 - Math.exp(-step * 3));
      morph('smile', smile);
      // Talking: an uneven open-close rhythm, about four syllables a second.
      talkFor = Math.max(0, talkFor - step);
      talkT += step;
      entry.talking = talkFor > 0;
      const jaw =
        talkFor > 0
          ? Math.max(0, Math.sin(talkT * 24) * 0.55 + Math.sin(talkT * 9.3) * 0.35) *
            Math.min(1, talkFor * 4)
          : 0;
      morph('jaw-open', jaw);
      if (actor) {
        actor.face.setSyllable(Math.floor(talkT * SYLLABLE_RATE));
        // Clips, posture, then these layers on the normalized bones, then vrm.update().
        actor.update(step, { afterPose: layers });
      }
    },
    /** Move the jaw for a line on screen; `seconds` is the subtitle's reading time. */
    talk(seconds) {
      talkFor = Math.max(talkFor, seconds * 0.85);
    },
    get personId() {
      return personId;
    },
    /**
     * Development and measurement switches. `layers` turns rig layers off by name
     * (character-rig.js RIG_LAYERS), `clip` forces a clip, `intent` replaces the mind's.
     */
    setDebug(next = {}) {
      debug = { ...next };
    },
    /** The live model root, for inspection tools (null until loaded). */
    get root() {
      return root;
    },
    getState() {
      const body = steering.state;
      return {
        status,
        personId,
        clip: blender?.name ?? null,
        clipWeights: debug.trace ? blender?.weights().map((w) => Number(w.toFixed(3))) : undefined,
        clipTime: debug.trace ? blender?.time : undefined,
        seat,
        speed: Number(body.speed.toFixed(2)),
        talking: talkFor > 0,
        clips: [...actions.keys()],
        gait: { ...gait },
        kind,
        morphs: actor ? actor.face.names() : face ? Object.keys(face.morphTargetDictionary) : [],
        steering: {
          heading: Number(body.heading.toFixed(3)),
          turning: body.turning,
          resting: body.resting,
          position: [body.x, body.y, body.z].map((value) => Number(value.toFixed(3))),
        },
        lookingAt,
        bones: humanoid ? { kind: humanoid.kind, missing: humanoid.missing } : null,
        rig: rig?.getState() ?? null,
      };
    },
    dispose() {
      status = 'disposed';
      stage.delete(personId);
      worldDetails.setStandIn(personId, false);
      if (root) scene.remove(root);
      eyeTarget.removeFromParent();
      mixer?.stopAllAction();
      actor?.dispose();
    },
  };
}
