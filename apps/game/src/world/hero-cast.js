import { createVrmActor } from '../characters/vrm-actor.js';
import { gripOverrides } from '../characters/cast-tuning.js';
import {
  GAITS,
  attachProps,
  createHandSockets,
  createSteering,
  strideTimeScale,
} from './character-motion.js';
import { createCharacterRig, createClipBlender } from './character-rig.js';
import { createMouthDriver } from '../characters/vrm-expressions.js';
import { curveSeconds, sampleMouthCurve } from '../drama/mouth-curve.js';

/**
 * A skinned character standing in for one simulated person. The person's movement,
 * boarding and routines stay in the population simulation; this module only replaces how
 * they are drawn: a VRM (anime style, MToon, spring hair, VRM expressions and visemes). If the
 * VRM is missing or fails to load, the instanced figure stays visible.
 *
 * Between the simulation and the body sits a steering layer (character-motion.js): the body
 * walks only forward, turns in arcs or on the spot, accelerates within limits and ignores
 * sub-centimetre jitter, and the walk clip plays at the body's real speed. After the clips,
 * character-rig.js adds breathing and weight shift, a clamped look-at (a speaker, the train,
 * or the camera in a portrait), props held in hand sockets with a closed grip and second-hand
 * IK, and planted feet. It works through canonical bones (characters/humanoid-bones.js), so
 * the layers do not depend on one skeleton. Blinks run on their own clock, the smile follows
 * mood, and the mouth moves while an episode line attributed to this person is on screen:
 * from the line's audio when it has a mouth curve (a voice manifest) or a live analyser
 * (drama/live-mouth.js), otherwise on a fixed syllable rhythm.
 */
export const HERO_WALK_SPEED = 1.15;
export const HERO_HURRY_SPEED = 1.75;

/**
 * Momiji people who have a model. `vrm` files are built by asset-src/characters/vrm-cast,
 * except Riko's, which asset-src/characters/concept-cast builds from the approved concept
 * art (her radio and phone props too). Mr. Sato's and Mr. Ishida's `props` GLBs were built
 * by the retired Blender cast script (asset-src/README.md says where to find it).
 */
export const MOMIJI_CAST = Object.freeze([
  {
    personId: 'commuter-1',
    vrm: 'models/characters/vrm/sato.vrm',
    props: 'models/characters/props/sato.glb',
    // The office commuter walks upright, arms close (UAL Walk_Formal_Loop).
    clipVariants: { walk: 'walk-formal' },
  },
  {
    personId: 'commuter-2',
    vrm: 'models/characters/vrm/riko.vrm',
    props: 'models/characters/props/riko.glb',
    // Riko keeps her phone in a pocket and takes it out to check it; her hands are for the
    // radio she is carrying home.
    pocketed: ['phone'],
    // Walking with the radio: the carry walk holds both hands in front without an arm swing,
    // and the radio stays in her left hand. No arm IK runs against that clip.
    // Standing, the radio is cradled in both hands, so the folded-arms clips (watch-train,
    // shelter) and the stretch, which want the same arms, play as the idle under the cradle.
    carry: {
      prop: 'radio',
      walk: 'walk-carry',
      hurry: 'walk-carry',
      'watch-train': 'idle',
      shelter: 'idle',
      stretch: 'idle',
    },
  },
  // The Momiji reading bench is 0.61 m above the reader's figure origin, matching the
  // instanced figure's seated thighs (population.js reading pose).
  {
    personId: 'reader-1',
    vrm: 'models/characters/vrm/ishida.vrm',
    props: 'models/characters/props/ishida.glb',
    seatHeight: 0.61,
  },
]);

/**
 * The shared clip set for every VRM: Quaternius UAL 1 and 2, retargeted offline by
 * asset-src/characters/vrm-cast/retarget.mjs.
 */
export const VRM_CLIPS = 'models/characters/vrm/cast-clips.vrma';

/** Syllables per second in the talking rhythm below (the jaw's main 24 rad/s wave). */
const SYLLABLE_RATE = 24 / (2 * Math.PI);
/** Seconds after a mouth curve ends before the face drops back to the syllable fallback. */
const CURVE_TAIL = 0.4;

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
/**
 * The walk/hurry boundary is never below this (m/s). UAL's walk is slow for a short figure
 * (0.9 m/s for Riko, 0.95 for Mr. Ishida), so the midpoint of the model's walk and hurry
 * speeds fell inside the residents' ordinary 1.05-1.3 m/s pace and an unhurried Mr. Ishida
 * hurried. Ordinary walking stays a walk, played up to 1.7 times its authored cadence.
 */
export const HURRY_FROM = 1.35;
/** Clips that are a sitting pose: the feet are not planted and idle life rests. */
const SIT_CLIPS = new Set(['sit', 'sit-enter', 'sit-exit']);
/** Seated variants (crowd/clips.js: phone, reading, dozing, window) count as sitting too. */
const isSitClip = (name) =>
  SIT_CLIPS.has(name) || (typeof name === 'string' && name.startsWith('sit-'));
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
    const boundary =
      Math.max(HURRY_FROM, (walkSpeed + hurrySpeed) / 2) +
      (hurrying ? -GAIT_HYSTERESIS : GAIT_HYSTERESIS);
    if (speed > boundary)
      return {
        clip: 'hurry',
        timeScale: strideTimeScale(speed, hurrySpeed, { min: 0.8, max: 1.5 }),
      };
    return { clip: 'walk', timeScale: strideTimeScale(speed, walkSpeed, { max: 1.7 }) };
  }
  if (turning) return { clip: 'turn', timeScale: 1 };
  if (INTENT_CLIPS.has(intent)) return { clip: intent, timeScale: 1 };
  return { clip: 'idle', timeScale: 1 };
}

/**
 * The next sit-transition phase: 'enter' plays sit-enter, 'seated' the sit loop, 'exit'
 * sit-exit, 'none' standing. `clipDone` says the current one-shot has finished. Without
 * transition clips a person goes straight between 'none' and 'seated'.
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
  // Height of this person's bench surface above their figure's origin, when seated.
  // Defaults to the model's own seat height, which places it without an offset.
  seatHeight = null,
  // VRM file and the loader from characters/vrm-loader.js; without both, the instanced
  // figure stays.
  vrm = null,
  clips = VRM_CLIPS,
  vrmLoader = null,
  mobile = false,
  // Hand props: a GLB of socket-space prop nodes, parented to the VRM's hand sockets.
  props: propsPath = null,
  // Props kept out of sight except while their clip needs them (a phone in a pocket).
  pocketed = [],
  // Per-person clip names: { walk: 'walk-formal' } plays that clip in place of `walk`.
  clipVariants = {},
  // A prop carried in both hands while walking: { prop: 'radio', walk: 'walk-carry' }.
  carry = null,
  random = Math.random,
  // Called once the model has loaded, before the rig is built: ({ root, actor, kind }).
  // The crowd uses it to put its palette material on a kit body and add seated clips.
  prepare = null,
  // Extra AnimationClips for a VRM, made from its own clips: (vrm, m, clips) => clips.
  extraClips = null,
  // Parent for the model root; defaults to the scene.
  parent = scene,
}) {
  let status = 'loading';
  let kind = null;
  let root = null;
  let mixer = null;
  let actor = null;
  let actions = new Map();
  let blender = null;
  let rig = null;
  let humanoid = null;
  let props = [];
  let sockets = {};
  let wasVisible = false;
  let blinkIn = 2 + random() * 3;
  let blinkT = -1;
  let talkFor = 0;
  let talkT = 0;
  // The spoken line's mouth: { curve, t } from a manifest, or { live } sampling the audio.
  let mouth = null;
  const mouthDriver = createMouthDriver();
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
  // Stood up in front of the seat: the body stays where its feet are ({ x, z } offset from the
  // simulation's seat point) until the simulation moves the person on.
  let standOffset = null;
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
    actor = createVrmActor({ THREE, vrm: loaded.vrm, m: loaded.m, clipSet, mobile, extraClips });
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

  function buildRig() {
    root.updateMatrixWorld(true);
    const bounds = new THREE.Box3().setFromObject(root);
    const height = Math.max(1, bounds.max.y - bounds.min.y);
    sockets = createHandSockets(THREE, root, humanoid.raw);
    // Grips tuned in the character studio (characters/cast-tuning.json), per model file.
    props = attachProps(THREE, root, sockets, undefined, gripOverrides(vrm));
    rig = humanoid.missing.length
      ? null
      : createCharacterRig(THREE, root, {
          bones: humanoid.bones,
          raw: humanoid.raw,
          sockets,
          props,
          random,
          heightScale: height / 1.7,
        });
    // A VRM's clips run inside actor.update(), after the blender sets the fade weights.
    blender = createClipBlender(THREE, mixer, actions, { random, drive: false });
    if (actor.vrm.lookAt) scene.add(eyeTarget);
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
    const loaded = await loadVrm();
    if (status === 'disposed') return;
    if (!loaded || !root) {
      status = 'fallback';
      return;
    }
    root.name = `Hero / ${personId}`;
    if (prepare) await prepare({ root, actor, kind });
    if (status === 'disposed') return;
    buildRig();
    parent.add(root);
    if (personId) {
      worldDetails.setStandIn(personId, true);
      stage.set(personId, entry);
    }
    status = 'ready';
  })();

  function morph(name, value) {
    actor.face.set(name, value);
  }

  /** This frame's audio mouth sample, or null (closed); ends the curve once it has run out. */
  function sampleMouth(step) {
    let value;
    if (mouth.live) value = mouth.live.sample(step);
    else {
      value = sampleMouthCurve(mouth.curve, mouth.t) ?? null;
      mouth.t += step;
      if (mouth.t > curveSeconds(mouth.curve) + CURVE_TAIL) value = undefined;
    }
    // The clip is over: the mouth has closed, and the syllable rhythm must not start again.
    if (value === undefined) {
      mouth = null;
      talkFor = 0;
      mouthDriver.reset();
    }
    return value ?? null;
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
      const figure = personId ? worldDetails.figureOf(personId) : null;
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
        // `debug.steering === false` (studio) follows the simulation exactly.
        hold: seated || boarding || debug.steering === false,
      };
      if (
        standOffset &&
        !seated &&
        Math.hypot(target.x - standOffset.x0, target.z - standOffset.z0) < 0.05
      ) {
        target.x += standOffset.x;
        target.z += standOffset.z;
      } else standOffset = null;
      // Reappearing (alighting at a door, a Places jump): start where the simulation is.
      const before = { x: steering.state.x, z: steering.state.z };
      if (!wasVisible) steering.snap(target);
      const step = paused || !(dt > 0) ? 0 : dt;
      // Standing up: the body stays on the spot until sit-exit ends, then walks on.
      const standingUp = seat === 'exit' && !seated;
      const body = step && !standingUp ? steering.update(step, target) : steering.state;
      // Steering off (studio): the body is where the figure is, at the figure's own speed.
      if (debug.steering === false) body.speed = figure.speed ?? 0;
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
      if (seat === 'exit' && nextSeat === 'none' && seatShift && !jumped) {
        // Risen: sit-exit ends standing over the feet, seatBack in front of the seat. Move the
        // body there (the drawn root does not move) instead of easing the root back onto the
        // seat point, which dragged the planted feet 0.3 m across the ground.
        const x = Math.sin(body.heading) * seatShift;
        const z = Math.cos(body.heading) * seatShift;
        standOffset = { x, z, x0: target.x, z0: target.z };
        steering.snap({ ...target, x: body.x + x, z: body.z + z, heading: body.heading });
        seatShift = 0;
      }
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
      const benchHeight = figure.seatHeight ?? seatHeight;
      if (benchHeight !== null && benchHeight !== undefined)
        root.position.y += (benchHeight - gait.seatHeight) * seatedFraction();
      entry.position.copy(root.position);
      for (const prop of props) {
        if (prop.name === 'newspaper') prop.node.visible = seated;
        else if (pocketed.includes(prop.name)) prop.node.visible = blender.name === 'check-phone';
        if (typeof debug.props?.[prop.name] === 'boolean')
          prop.node.visible = debug.props[prop.name];
      }
      // A VRM's own skinned paper is shown only while seated, like the hand prop.
      const paper = root.getObjectByName('newspaper');
      if (paper && !props.some((prop) => prop.node === paper)) paper.visible = seated;
      if (jumped) {
        root.updateMatrixWorld(true);
        actor.resetSprings();
      }
      if (!step) return;

      const expression = minds?.expressionFor(personId);
      // Hold a shown intent for a moment, so a mind that changes its mind every frame does
      // not restart gestures.
      const wantedIntent = debug.intent ?? expression?.intent ?? figure.intent ?? 'continue';
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
      // Per-person variants of the other clips (a seated reader's `sit` is `sit-read`).
      else if (clipVariants[choice.clip] && actions.has(clipVariants[choice.clip]))
        choice.clip = clipVariants[choice.clip];
      if (choice.clip === 'hurry' && hurryName !== 'hurry') {
        // A carried radio: hurrying is the carry walk at a quicker cadence.
        choice.clip = hurryName;
        choice.timeScale = strideTimeScale(body.speed, gait.speeds[hurryName] ?? gait.walkSpeed);
      }
      // Gestures a carried prop does not allow (see MOMIJI_CAST carry).
      if (carrying && !GAITS.has(choice.clip)) choice.clip = variantOf(choice.clip, true);
      if (debug.clip && actions.has(debug.clip)) {
        choice.clip = debug.clip;
        choice.timeScale = debug.timeScale ?? choice.timeScale;
      }
      seatClipTime += step;
      rig?.resetPose();
      blender.play(choice.clip, choice.timeScale, choice.once);
      if (Number.isFinite(debug.time)) {
        // Studio timeline: the current clip shows exactly this time (with timeScale 0).
        const action = actions.get(blender.name);
        if (action) {
          action.enabled = true;
          action.paused = false;
          action.time = debug.time;
          action.timeScale = 0;
        }
      }
      blender.update(step);

      const walking = body.speed > 0.25;
      const layers = () => {
        if (!rig) return;
        const look = chooseLook(expression, context, walking);
        lookingAt = look?.what ?? null;
        const inSeat = seat !== 'none' || seated || isSitClip(blender.name);
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
        if (actor.vrm.lookAt) {
          // The VRM's eyes follow the same target as the head.
          if (look) eyeTarget.position.copy(look.point);
          actor.vrm.lookAt.target = look ? eyeTarget : null;
        }
      };

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
      morph('jaw-open', mouth ? 0 : jaw);
      actor.face.setSyllable(Math.floor(talkT * SYLLABLE_RATE));
      actor.face.setVisemes?.(mouth ? mouthDriver.update(step, sampleMouth(step)) : null);
      // Clips, posture, then these layers on the normalized bones, then vrm.update().
      actor.update(step, { afterPose: layers });
    },
    /** Props kept out of sight (a returned spanner), or shown only for check-phone. */
    setPocketed(list = []) {
      pocketed = [...list];
    },
    /**
     * Move the mouth for a line on screen; `seconds` is how long the line holds. `mouth` is
     * the line's audio: a manifest curve ({ rate, open, vowel }, see drama/mouth-curve.js)
     * or a live source ({ sample(dt) } returning { open, vowel }, null for silence, or
     * undefined once the clip has ended). `startedAt` is how many seconds of the clip have
     * already played. Without a mouth the jaw keeps the syllable rhythm.
     */
    talk(seconds, { mouth: source = null, startedAt = 0 } = {}) {
      talkFor = Math.max(talkFor, seconds * 0.85);
      if (source?.sample) mouth = { live: source };
      else if (source?.open?.length) mouth = { curve: source, t: Math.max(0, startedAt) };
      else if (mouth) {
        // A line without audio takes over from a curve still playing.
        mouth = null;
        mouthDriver.reset();
      }
    },
    get personId() {
      return personId;
    },
    /**
     * Stand in for a different person (the crowd's pooled near figures). Motion state starts
     * afresh at the new person's position; `options` replaces the per-person settings.
     */
    assign(nextId, options = {}) {
      if (nextId === personId && !options.force) return;
      if (personId) {
        if (stage.get(personId) === entry) stage.delete(personId);
        if (status === 'ready') worldDetails.setStandIn(personId, false);
      }
      personId = nextId ?? null;
      entry.personId = personId;
      if (options.seatHeight !== undefined) seatHeight = options.seatHeight;
      if (options.clipVariants) clipVariants = options.clipVariants;
      if (options.carry !== undefined) carry = options.carry;
      if (options.pocketed) pocketed = options.pocketed;
      wasVisible = false;
      seat = 'none';
      seatClipTime = 0;
      seatShift = 0;
      shownIntent = null;
      shownFor = Infinity;
      talkFor = 0;
      mouth = null;
      mouthDriver.reset();
      lookingAt = null;
      if (root) {
        root.visible = false;
        root.name = `Hero / ${personId ?? 'free'}`;
      }
      if (personId && status === 'ready') {
        worldDetails.setStandIn(personId, true);
        stage.set(personId, entry);
      }
    },
    /**
     * Development and measurement switches. `layers` turns rig layers off by name
     * (character-rig.js RIG_LAYERS), `clip` forces a clip, `intent` replaces the mind's.
     * The studio also uses `time` (hold the clip at a time; pass `timeScale: 0`), `steering:
     * false` (follow the figure exactly) and `props` ({ phone: true } shows a prop).
     */
    setDebug(next = {}) {
      debug = { ...next };
    },
    /**
     * Development tools only (the character studio): the live mixer, actions, clip blender,
     * rig, bones, sockets and props. Read them, or change props and actions the way the
     * studio documents; the game never calls this.
     */
    internals() {
      return {
        actor,
        root,
        mixer,
        actions,
        blender,
        rig,
        humanoid,
        sockets,
        props,
        gait,
        steering,
        kind,
      };
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
        mouth: mouth
          ? {
              source: mouth.live ? 'live' : 'curve',
              open: Number(mouthDriver.open.toFixed(3)),
              vowel: mouthDriver.vowel,
            }
          : null,
        clips: [...actions.keys()],
        gait: { ...gait },
        kind,
        morphs: actor ? actor.face.names() : [],
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
      if (personId) {
        if (stage.get(personId) === entry) stage.delete(personId);
        worldDetails.setStandIn(personId, false);
      }
      root?.removeFromParent();
      eyeTarget.removeFromParent();
      mixer?.stopAllAction();
      actor?.dispose();
    },
  };
}
