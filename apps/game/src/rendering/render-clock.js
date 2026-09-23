/**
 * Render mode for video capture. With `?render=1` the game stops its
 * requestAnimationFrame loop and a capture script advances one fixed frame at a
 * time, so every frame is simulated at exactly 1/fps seconds however long the
 * machine takes to draw it. Everything that plays on a timeline (train motion,
 * people, weather, the episode runner, captions and their fades) reads this clock
 * in render mode instead of the wall clock.
 */
export const RENDER_FPS = Object.freeze([24, 25, 30, 60]);
export const RENDER_ASPECTS = Object.freeze({
  '16:9': Object.freeze({ width: 1920, height: 1080 }),
  '9:16': Object.freeze({ width: 1080, height: 1920 }),
});

/**
 * Reads render options from a query string. Returns null unless `render=1`.
 * Throws a readable TypeError for an unsupported frame rate or aspect.
 */
export function readRenderOptions(search = '') {
  const params = new URLSearchParams(search);
  if (params.get('render') !== '1') return null;
  const fps = Number(params.get('fps') ?? 30);
  if (!RENDER_FPS.includes(fps))
    throw new TypeError(`fps must be one of: ${RENDER_FPS.join(', ')}`);
  const aspect = params.get('aspect') ?? '16:9';
  if (!Object.hasOwn(RENDER_ASPECTS, aspect))
    throw new TypeError(`aspect must be one of: ${Object.keys(RENDER_ASPECTS).join(', ')}`);
  const { width, height } = RENDER_ASPECTS[aspect];
  return Object.freeze({ fps, aspect, width, height, portrait: height > width });
}

/**
 * A clock that only moves when advance() is called. now() is in milliseconds, like
 * performance.now(); timers fire during advance() in due order. Frame times are
 * computed from the frame count, so long renders do not accumulate rounding error.
 */
export function createRenderClock({ fps = 30, startMs = 0 } = {}) {
  if (!RENDER_FPS.includes(fps))
    throw new TypeError(`fps must be one of: ${RENDER_FPS.join(', ')}`);
  const frameMs = 1000 / fps;
  let frame = 0;
  let nextId = 1;
  let timers = [];
  const now = () => startMs + frame * frameMs;
  function runDue() {
    // A callback may schedule another timer that is already due; bound the loop.
    for (let guard = 0; guard < 1000; guard++) {
      const due = timers.filter((timer) => timer.at <= now());
      if (!due.length) return;
      due.sort((a, b) => a.at - b.at || a.id - b.id);
      const [first] = due;
      timers = timers.filter((timer) => timer !== first);
      first.callback();
    }
  }
  return {
    fps,
    dtSeconds: 1 / fps,
    now,
    /** Seconds since the clock started. */
    seconds: () => frame / fps,
    get frame() {
      return frame;
    },
    /** Moves one frame forward, runs due timers and returns the new time in ms. */
    advance() {
      frame += 1;
      runDue();
      return now();
    },
    setTimeout(callback, ms = 0) {
      const id = nextId++;
      timers.push({ id, at: now() + Math.max(0, Number(ms) || 0), callback });
      return id;
    },
    clearTimeout(id) {
      timers = timers.filter((timer) => timer.id !== id);
    },
    pendingTimers: () => timers.length,
  };
}

/** The wall clock with the same shape, used outside render mode. */
export const realClock = Object.freeze({
  now: () => performance.now(),
  setTimeout: (callback, ms) => setTimeout(callback, ms),
  clearTimeout: (id) => clearTimeout(id),
});

/** Seeded replacement for Math.random so repeated renders cast the same idle motion. */
export function seededRandom(seed = 1742) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Opacity of a fading element: 0 → 1 over `fadeMs` after it is shown, back to 0 over
 * `fadeMs` after it is hidden, starting from whatever opacity it had at the change.
 */
export function fadeOpacity({ shown, changedAt, from = 0 }, now, fadeMs = 900) {
  const progress = fadeMs > 0 ? Math.min(1, Math.max(0, (now - changedAt) / fadeMs)) : 1;
  // Ease in-out, close to the CSS `ease` curve the live captions use.
  const eased = progress * progress * (3 - 2 * progress);
  const target = shown ? 1 : 0;
  return from + (target - from) * eased;
}
