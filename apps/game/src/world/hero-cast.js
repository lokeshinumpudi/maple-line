import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import {
  attachProps,
  createHandSockets,
  createSteering,
  resolveBoneMap,
  strideTimeScale,
} from './character-motion.js';
import { createCharacterRig, createClipBlender } from './character-rig.js';

/**
 * A Blender-built, skinned character standing in for one simulated person. The person's
 * movement, boarding and routines stay in the population simulation; this module only
 * replaces how they are drawn.
 *
 * Between the simulation and the body sits a steering layer (character-motion.js): the body
 * walks only forward, turns in arcs or on the spot, accelerates within limits and ignores
 * sub-centimetre jitter, and the walk clip plays at the body's real speed. After the mixer,
 * character-rig.js adds breathing and weight shift, a clamped look-at (a speaker, the train,
 * or the camera in a portrait), props held in hand sockets with a closed grip and second-hand
 * IK, and planted feet. Blinks run on their own clock, the smile follows mood, and the jaw
 * moves while an episode line attributed to this person is on screen. If the model fails to
 * load, the instanced figure stays visible.
 */
export const HERO_WALK_SPEED = 1.15;
export const HERO_HURRY_SPEED = 1.75;

/** Momiji people who have a Blender model, built by asset-src/characters/momiji-cast. */
export const MOMIJI_CAST = Object.freeze([
  { personId: 'commuter-1', path: 'models/characters/commuter-hero.glb' },
  // Riko keeps her phone in a pocket and takes it out to check it; both hands are for the
  // radio she is carrying home.
  { personId: 'commuter-2', path: 'models/characters/student-riko.glb', pocketed: ['phone'] },
  // The Momiji reading bench is 0.61 m above the reader's figure origin, matching the
  // instanced figure's seated thighs (population.js reading pose).
  { personId: 'reader-1', path: 'models/characters/reader-ishida.glb', seatHeight: 0.61 },
]);

/** Intents whose clip has the same name. Others (continue, linger, hurry, sit) stand idle. */
const INTENT_CLIPS = new Set(['wave', 'check-phone', 'watch-train', 'shelter', 'chat', 'stretch']);
const SEATED_POSES = new Set(['reading', 'seated']);
/** How much idle life each clip takes: full while idle, a little under gestures. */
const IDLE_LIFE = { idle: 1, 'watch-train': 0.6, chat: 0.4, shelter: 0.3, 'check-phone': 0.4 };
/** Clips during which a cradled prop comes up to the chest. */
const CRADLE_CLIPS = new Set(['idle', 'watch-train']);

const TRAIN_LOOK_METRES = 140;

/** Everyone drawn this way, so listeners can look at whoever is speaking. */
const stage = new Map();

/**
 * Which clip to play, and at what speed, for a person's movement, pose, state and intent.
 * `walkSpeed` and `hurrySpeed` are the model's own foot speeds, read from the GLB; the
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
} = {}) {
  if (state === 'boarding') return { clip: 'board', timeScale: 1, once: true };
  if (SEATED_POSES.has(pose)) return { clip: 'sit', timeScale: 1 };
  if (speed > 0.25) {
    if (speed > (walkSpeed + hurrySpeed) / 2)
      return { clip: 'hurry', timeScale: strideTimeScale(speed, hurrySpeed, { min: 0.8, max: 1.5 }) };
    return { clip: 'walk', timeScale: strideTimeScale(speed, walkSpeed) };
  }
  if (turning) return { clip: 'turn', timeScale: 1 };
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
  // Props kept out of sight except while their clip needs them (a phone in a pocket).
  pocketed = [],
  random = Math.random,
}) {
  let status = 'loading';
  let root = null;
  let mixer = null;
  let blender = null;
  let rig = null;
  let face = null;
  let props = [];
  let bones = null;
  let boneMap = null;
  let height = 1.7;
  const actions = new Map();
  const steering = createSteering();
  let wasVisible = false;
  let blinkIn = 2 + random() * 3;
  let blinkT = -1;
  let talkFor = 0;
  let talkT = 0;
  let smile = 0;
  let gait = { walkSpeed: HERO_WALK_SPEED, hurrySpeed: HERO_HURRY_SPEED, seatHeight: 0 };
  let lookingAt = null;
  const head = new THREE.Vector3();
  const lookPoint = new THREE.Vector3();
  const entry = { personId, visible: false, talking: false, head, position: new THREE.Vector3() };

  const ready = loader.get(path).then((gltf) => {
    if (!gltf || status === 'disposed') {
      if (status !== 'disposed') status = 'fallback';
      return;
    }
    root = SkeletonUtils.clone(gltf.scene);
    root.name = `Hero / ${personId}`;
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
        if (node.morphTargetDictionary && node.isSkinnedMesh) face = node;
      }
    });
    const resolved = resolveBoneMap(root);
    bones = resolved.bones;
    boneMap = { missing: resolved.missing, source: resolved.source };
    const bounds = new THREE.Box3().setFromObject(root);
    height = Math.max(1, bounds.max.y - bounds.min.y);
    const sockets = createHandSockets(THREE, root, bones);
    props = attachProps(THREE, root, sockets);
    rig = resolved.missing.length
      ? null
      : createCharacterRig(THREE, root, {
          bones,
          sockets,
          props,
          face,
          random,
          heightScale: height / 1.7,
        });
    mixer = new THREE.AnimationMixer(root);
    for (const clip of gltf.animations) actions.set(clip.name, mixer.clipAction(clip));
    blender = createClipBlender(THREE, mixer, actions, { random });
    scene.add(root);
    worldDetails.setStandIn(personId, true);
    stage.set(personId, entry);
    status = 'ready';
  });

  function morph(name, value) {
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
      // A train out of sight down the line is not something to stare at.
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
      const target = {
        x: figure.position.x,
        y: figure.position.y,
        z: figure.position.z,
        heading: figure.heading,
        moving: Boolean(figure.walking),
        hold: seated || boarding,
      };
      // Reappearing (alighting at a door, a Places jump): start where the simulation is.
      if (!wasVisible) steering.snap(target);
      wasVisible = true;
      const step = paused || !(dt > 0) ? 0 : dt;
      const body = step ? steering.update(step, target) : steering.state;
      root.position.set(body.x, body.y, body.z);
      root.rotation.y = body.heading;
      if (seated && seatHeight !== null) root.position.y += seatHeight - gait.seatHeight;
      entry.position.copy(root.position);
      for (const prop of props) {
        if (prop.name === 'newspaper') prop.node.visible = seated;
        else if (pocketed.includes(prop.name))
          prop.node.visible = blender.name === 'check-phone';
      }
      if (!step) return;

      const expression = minds?.expressionFor(personId);
      const choice = heroClip({
        speed: body.speed,
        intent: expression?.intent,
        pose: figure.pose,
        state: figure.state,
        turning: body.turning || Math.abs(body.turnVelocity) > 1.2,
        walkSpeed: gait.walkSpeed,
        hurrySpeed: gait.hurrySpeed,
      });
      if (choice.clip === 'turn' && !actions.has('turn')) choice.clip = 'idle';
      rig?.resetPose();
      blender.play(choice.clip, choice.timeScale, choice.once);
      blender.update(step);

      if (rig) {
        bones.head.getWorldPosition(head);
        const walking = body.speed > 0.25;
        const look = chooseLook(expression, context, walking);
        lookingAt = look?.what ?? null;
        rig.apply(step, {
          idle: walking ? 0 : (IDLE_LIFE[blender.name] ?? 0),
          breath: seated ? 0.6 : 1,
          lookTarget: look?.point ?? null,
          lookStrength: look?.strength ?? 0,
          maxYaw: walking ? 0.6 : 1.2,
          planted: !seated && !boarding,
          moving: walking || blender.name === 'turn',
          groundY: body.y,
          cradle: CRADLE_CLIPS.has(blender.name) && body.resting && !body.turning,
        });
        bones.head.getWorldPosition(head);
      }

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
    },
    /** Move the jaw for a line on screen; `seconds` is the subtitle's reading time. */
    talk(seconds) {
      talkFor = Math.max(talkFor, seconds * 0.85);
    },
    get personId() {
      return personId;
    },
    getState() {
      const body = steering.state;
      return {
        status,
        personId,
        clip: blender?.name ?? null,
        speed: Number(body.speed.toFixed(2)),
        talking: talkFor > 0,
        clips: [...actions.keys()],
        gait: { ...gait },
        morphs: face ? Object.keys(face.morphTargetDictionary) : [],
        steering: {
          heading: Number(body.heading.toFixed(3)),
          turning: body.turning,
          resting: body.resting,
          position: [body.x, body.y, body.z].map((value) => Number(value.toFixed(3))),
        },
        lookingAt,
        boneMap,
        rig: rig?.getState() ?? null,
      };
    },
    dispose() {
      status = 'disposed';
      stage.delete(personId);
      worldDetails.setStandIn(personId, false);
      if (root) scene.remove(root);
      mixer?.stopAllAction();
    },
  };
}
