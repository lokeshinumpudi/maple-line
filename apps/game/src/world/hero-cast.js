import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';

/**
 * A Blender-built, skinned character standing in for one simulated person. The person's
 * movement, boarding and routines stay in the population simulation; this module only
 * replaces how they are drawn. Clips follow walking speed and the NPC mind's intent,
 * blinks run on their own clock, the smile follows mood, and the jaw moves while an
 * episode line attributed to this person is on screen. If the model fails to load, the
 * instanced figure stays visible.
 */
export const HERO_WALK_SPEED = 1.15;

/** Which clip to play, and at what speed, for a person's current movement and intent. */
export function heroClip({ speed = 0, intent = 'continue' } = {}) {
  if (speed > 0.25) {
    return {
      clip: 'walk',
      timeScale: Math.min(1.6, Math.max(0.6, speed / HERO_WALK_SPEED)),
    };
  }
  if (intent === 'wave') return { clip: 'wave', timeScale: 1 };
  if (intent === 'check-phone') return { clip: 'check-phone', timeScale: 1 };
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
  random = Math.random,
}) {
  let status = 'loading';
  let root = null;
  let mixer = null;
  let face = null;
  const actions = new Map();
  let current = null;
  let speed = 0;
  const last = new THREE.Vector3(NaN, NaN, NaN);
  let blinkIn = 2 + random() * 3;
  let blinkT = -1;
  let talkFor = 0;
  let talkT = 0;
  let smile = 0;

  const ready = loader.get(path).then((gltf) => {
    if (!gltf || status === 'disposed') {
      if (status !== 'disposed') status = 'fallback';
      return;
    }
    root = SkeletonUtils.clone(gltf.scene);
    root.name = `Hero / ${personId}`;
    root.traverse((node) => {
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
    scene.add(root);
    worldDetails.setStandIn(personId, true);
    status = 'ready';
  });

  function morph(name, value) {
    const index = face?.morphTargetDictionary[name];
    if (index !== undefined) face.morphTargetInfluences[index] = value;
  }

  function play(name, timeScale) {
    const next = actions.get(name) ?? actions.get('idle');
    if (!next) return;
    next.timeScale = timeScale;
    if (next === current) return;
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
      if (!root.visible) return;
      root.position.copy(figure.position);
      root.rotation.y = figure.heading;
      if (paused || !(dt > 0)) return;
      if (Number.isFinite(last.x)) {
        const moved = Math.hypot(figure.position.x - last.x, figure.position.z - last.z) / dt;
        speed += (Math.min(moved, 4) - speed) * (1 - Math.exp(-dt * 6));
      }
      last.copy(figure.position);
      const expression = minds?.expressionFor(personId);
      const choice = heroClip({ speed, intent: expression?.intent });
      play(choice.clip, choice.timeScale);
      mixer.update(dt);

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
        morphs: face ? Object.keys(face.morphTargetDictionary) : [],
      };
    },
    dispose() {
      status = 'disposed';
      worldDetails.setStandIn(personId, false);
      if (root) scene.remove(root);
      mixer?.stopAllAction();
    },
  };
}
