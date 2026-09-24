/**
 * Embed-only staging: one beat of The 17:42 with captions in a chosen language, or one hero
 * cast member standing alone on the Momiji platform with a chosen clip. Everything here is
 * picked from fixed lists; the embed never plays sound or asks the AI director.
 */

/**
 * Beats a page can stage, by id. `episode` is the episode number in The 17:42, `scene` and
 * `beat` are indices from 0 (tests check that each still points at the intended beat).
 * A held beat stops once line `line` (from 1, default 1) has been on screen for a moment.
 */
export const EMBED_BEATS = Object.freeze({
  'momiji-arrival': { episode: 1, scene: 0, beat: 0 },
  'momiji-timetable': { episode: 1, scene: 0, beat: 2 },
  'momiji-two-minutes': { episode: 1, scene: 0, beat: 3 },
  // Held on Meera's answer about the radio: what she wants, and why tonight.
  'momiji-exchange': { episode: 1, scene: 0, beat: 4, line: 4 },
  'momiji-ishida': { episode: 1, scene: 0, beat: 5 },
  'momiji-doors': { episode: 1, scene: 0, beat: 8 },
  'train-call': { episode: 2, scene: 0, beat: 1 },
  'train-arjun-call': { episode: 2, scene: 0, beat: 5 },
  'train-seated': { episode: 2, scene: 0, beat: 6 },
  'aonuma-arrival': { episode: 3, scene: 0, beat: 0 },
  'aonuma-clock': { episode: 3, scene: 0, beat: 1 },
  'aonuma-bus': { episode: 3, scene: 0, beat: 6 },
  // Held on Ammamma's reply, framed on her face.
  'aonuma-ammamma': { episode: 3, scene: 0, beat: 7, line: 2 },
  'aonuma-radio': { episode: 3, scene: 0, beat: 9 },
});
export const EMBED_BEAT_IDS = Object.freeze(Object.keys(EMBED_BEATS));
export const CAPTION_LANGUAGES = Object.freeze(['en', 'te-IN', 'hi-IN']);
/** Hero cast members by name, and the person each model follows. */
export const CAST_SUBJECTS = Object.freeze({
  meera: 'commuter-2',
  arjun: 'commuter-1',
  ishida: 'reader-1',
  ammamma: 'ammamma',
  divya: 'divya',
});
export const CAST_SUBJECT_IDS = Object.freeze(Object.keys(CAST_SUBJECTS));
/** Clips from the shared VRM clip set (world/hero-cast.js VRM_CLIPS). */
export const CAST_CLIPS = Object.freeze([
  'idle',
  'chat',
  'walk',
  'hurry',
  'check-phone',
  'watch-train',
  'wave',
  'stretch',
  'nod-yes',
  'shake-no',
  'sit',
]);
/**
 * `clip` plays the clip normally, `rest` shows the skeleton's rest pose (a T-pose for VRM),
 * `reset-bug` puts every bone back to rest before the mixer each frame: bones the clip holds
 * still are never written again and stay at rest (the chapter 39 bug).
 */
export const CAST_POSES = Object.freeze(['clip', 'rest', 'reset-bug']);

/** Subtitles only: the runner reads each line in the chosen language, with no audio. */
export function createCaptionVoice(language = 'en') {
  return {
    language,
    active: () => language !== 'en',
    prepare() {},
    ready: () => true,
    text: (item) => (language === 'en' ? item.text : (item.translations?.[language] ?? item.text)),
    durationMs: () => null,
    play: () => null,
    stopAll() {},
    status: () => ({ mode: 'subtitles', language, reason: null }),
  };
}

/**
 * A clock for film captions that runs on simulation time: advance(seconds) with the frame's
 * dt, and 0 while the scene is held, so a held beat keeps its caption on screen.
 */
export function createHeldClock() {
  let now = 0;
  let nextId = 1;
  let timers = [];
  return {
    now: () => now,
    advance(seconds) {
      if (!(seconds > 0)) return now;
      now += seconds * 1000;
      for (let guard = 0; guard < 100; guard++) {
        const due = timers.filter((timer) => timer.at <= now).sort((a, b) => a.at - b.at);
        if (!due.length) break;
        timers = timers.filter((timer) => timer !== due[0]);
        due[0].callback();
      }
      return now;
    },
    setTimeout(callback, ms = 0) {
      const id = nextId++;
      timers.push({ id, at: now + Math.max(0, Number(ms) || 0), callback });
      return id;
    },
    clearTimeout(id) {
      timers = timers.filter((timer) => timer.id !== id);
    },
  };
}

/**
 * When to hold a staged beat: once its line `line` (from 1) has been on screen long enough
 * to read its caption, or a few seconds in for a beat without lines. Feed it runner events.
 */
export function createBeatHold({ lineSeconds = 1.6, silentSeconds = 3 } = {}) {
  let pending = null;
  return {
    /** Start watching a newly staged beat; `hold` false lets it play on. */
    arm(hold, line = 1) {
      pending = hold ? { elapsed: 0, due: silentSeconds, lines: 0, line } : null;
    },
    cancel() {
      pending = null;
    },
    event(event) {
      if (!pending || event.type !== 'line') return;
      pending.lines += 1;
      if (pending.lines === pending.line) pending.due = pending.elapsed + lineSeconds;
      // Until the wanted line arrives, the silent fallback must not hold the beat early.
      else if (pending.lines < pending.line) pending.due = Infinity;
    },
    /** Advance by simulation seconds; true once, when the beat should hold. */
    update(dt) {
      if (!pending || !(dt > 0)) return false;
      pending.elapsed += dt;
      if (pending.elapsed < pending.due) return false;
      pending = null;
      return true;
    },
    get pending() {
      return Boolean(pending);
    },
  };
}

/**
 * One hero cast member alone on the Momiji platform: their model follows a figure placed
 * here instead of the simulation or the drama stage. `place(subject)` returns where they
 * stand in world space: { x, y, z, heading, bench }. With `bench` (Mr. Ishida's reading
 * bench) the sit clip sits them on it.
 */
export function createEmbedCast({ THREE, scene, heroCasts, place }) {
  const settings = {
    active: false,
    subject: 'meera',
    clip: 'idle',
    skeleton: false,
    motionLayers: true,
    pose: 'clip',
  };
  let figure = null;
  let helper = null;
  let helperRoot = null;
  const patched = new Map();
  // Materials swapped for an inspection surface (clay, triangles), put back on release.
  const swapped = new Map();
  let surface = null;
  const heroOf = (name) => heroCasts.find((hero) => hero.personId === CAST_SUBJECTS[name]) ?? null;
  const subjectHero = () => (settings.active ? heroOf(settings.subject) : null);

  function removeHelper() {
    helper?.removeFromParent();
    helper?.dispose?.();
    helper = null;
    helperRoot = null;
  }
  /** Wrap the subject's mixer so `reset-bug` can put the rest pose back before it runs. */
  function patchMixer(hero) {
    const { mixer, actor } = hero.internals();
    if (!mixer || !actor?.vrm || patched.has(hero)) return;
    const update = mixer.update;
    mixer.update = function (dt) {
      if (settings.pose === 'reset-bug' && subjectHero() === hero)
        actor.vrm.humanoid.resetNormalizedPose();
      return update.call(this, dt);
    };
    patched.set(hero, { mixer, update });
  }
  function restoreSurface() {
    for (const [mesh, material] of swapped) mesh.material = material;
    swapped.clear();
  }
  function release(hero) {
    hero?.setDebug({});
    restoreSurface();
  }

  return {
    configure(next) {
      const before = subjectHero();
      for (const key of Object.keys(settings))
        if (Object.hasOwn(next, key)) settings[key] = next[key];
      const after = subjectHero();
      if (before && before !== after) release(before);
      if (!after) {
        figure = null;
        removeHelper();
        restoreSurface();
        return;
      }
      const spot = place(settings.subject);
      figure = spot
        ? {
            position: { x: spot.x, y: spot.y, z: spot.z },
            heading: spot.heading,
            visible: true,
            walking: false,
            pose: spot.bench && settings.clip === 'sit' ? 'seated' : 'standing',
            state: 'staged',
          }
        : null;
    },
    active: () => settings.active,
    /**
     * An inspection material for the subject's meshes only, or null for its own. A scene
     * override would also repaint the skeleton overlay and the sky.
     */
    setSurface(material) {
      if (surface !== material) restoreSurface();
      surface = material;
    },
    /** The figure the subject's model follows, or undefined for everyone else. */
    figureOf(id) {
      if (!settings.active || !figure) return undefined;
      return id === CAST_SUBJECTS[settings.subject] ? figure : undefined;
    },
    /** After the heroes update: switches, skeleton overlay and the rest pose. */
    update() {
      const hero = subjectHero();
      if (!hero?.internals().actor) {
        if (helper) removeHelper();
        return;
      }
      patchMixer(hero);
      hero.setDebug({
        clip: settings.clip,
        ...(settings.motionLayers
          ? {}
          : { layers: { life: false, look: false, hands: false, grip: false, feet: false } }),
      });
      if (settings.pose === 'rest') {
        const vrm = hero.internals().actor?.vrm;
        vrm?.humanoid.resetNormalizedPose();
        vrm?.humanoid.update();
      }
      const root = hero.root;
      if (surface && root)
        root.traverse((object) => {
          if (!object.isMesh || swapped.has(object)) return;
          swapped.set(object, object.material);
          object.material = surface;
        });
      if (settings.skeleton && root && helperRoot !== root) {
        removeHelper();
        helper = new THREE.SkeletonHelper(root);
        helper.material.depthTest = false;
        helper.material.transparent = true;
        helper.renderOrder = 12;
        helper.name = 'embed skeleton overlay';
        helperRoot = root;
        scene.add(helper);
      } else if (!settings.skeleton && helper) removeHelper();
    },
    /** True for meshes of the subject's model (for subject isolation). */
    contains(object) {
      const root = subjectHero()?.root;
      for (let parent = object; parent; parent = parent.parent) if (parent === root) return true;
      return false;
    },
    focusPose() {
      if (!figure) return null;
      const { x, y, z } = figure.position;
      const target = new THREE.Vector3(x, y + 0.8, z);
      // Three-quarter view, so a bent knee or a raised arm reads as well as the face.
      const ahead = 2.3;
      const side = 1.35;
      const eye = new THREE.Vector3(
        x + Math.sin(figure.heading) * ahead + Math.cos(figure.heading) * side,
        y + 1.1,
        z + Math.cos(figure.heading) * ahead - Math.sin(figure.heading) * side,
      );
      return {
        key: `cast:${settings.subject}`,
        target: target.toArray(),
        eye: eye.toArray(),
        minDistance: 0.8,
        maxDistance: 16,
      };
    },
    snapshot() {
      const hero = subjectHero();
      const state = hero?.getState();
      return {
        subject: settings.active ? settings.subject : null,
        status: state?.status ?? null,
        clip: state?.clip ?? null,
        clips: state?.clips ?? [],
        pose: settings.pose,
        skeleton: Boolean(helper),
        motionLayers: settings.motionLayers,
        rig: state?.rig ?? null,
      };
    },
    dispose() {
      release(subjectHero());
      restoreSurface();
      removeHelper();
      for (const { mixer, update } of patched.values()) mixer.update = update;
      patched.clear();
    },
  };
}
