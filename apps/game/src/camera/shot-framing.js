/**
 * Framing geometry for shots of people: where to stand so a face is not hidden, and where
 * to aim so it sits on the rule-of-thirds lines. Plain math on {x, y, z} objects, so the
 * search can be tested without a scene. The director supplies the sightline test.
 *
 * A viewpoint is { angle, reach, rise } around a pivot (usually the speaker's eyes):
 * the camera stands at pivot + (cos angle, 0, sin angle) · reach, raised by rise.
 */

/** A score at or above this means every target point has a clear sightline. */
export const CLEAR = 0.999;
const DEG = Math.PI / 180;
/** Orbit steps tried around the planned bearing, nearest first. */
const ORBIT = [0, 15, -15, 30, -30, 45, -45, 60, -60, 90, -90].map((d) => d * DEG);

const wrap = (angle) => Math.atan2(Math.sin(angle), Math.cos(angle));

export function placeView(pivot, view) {
  return {
    x: pivot.x + Math.cos(view.angle) * view.reach,
    y: pivot.y + view.rise,
    z: pivot.z + Math.sin(view.angle) * view.reach,
  };
}

/** Horizontal bearing from a to b in the same angle convention as placeView. */
export function bearing(a, b) {
  return Math.atan2(b.z - a.z, b.x - a.x);
}

/**
 * Which side of a line a bearing falls on: +1 or -1. The line runs through the pivot at
 * `lineAngle`. Reversing the line direction flips the sign for the same half-plane.
 */
export function lineSide(lineAngle, angle) {
  return Math.sin(angle - lineAngle) >= 0 ? 1 : -1;
}

/** The same viewpoint reflected across the line, onto the other side of it. */
export function mirrorView(view, lineAngle) {
  return { ...view, angle: wrap(2 * lineAngle - view.angle) };
}

/**
 * Candidate viewpoints near `base`, cheapest change first: orbit, raise or lower, push in,
 * pull back. `cost` grows with how far a candidate strays from the planned shot.
 */
export function candidateViews(base) {
  const list = [];
  const add = (dAngle, dRise, scale) =>
    list.push({
      angle: wrap(base.angle + dAngle),
      reach: base.reach * scale,
      rise: base.rise + dRise,
      cost:
        Math.abs(dAngle) / (90 * DEG) + Math.abs(dRise) * 0.45 + Math.abs(Math.log(scale)) * 0.9,
    });
  for (const d of ORBIT) add(d, 0, 1);
  for (const d of ORBIT) add(d, 0.6, 1);
  for (const d of ORBIT.slice(0, 7)) {
    add(d, 1.4, 1);
    add(d, -0.3, 1);
  }
  for (const d of ORBIT.slice(0, 5)) {
    add(d, 0, 0.7);
    add(d, 0, 0.5);
    add(d, 0.4, 0.6);
  }
  for (const d of [0, 30 * DEG, -30 * DEG]) add(d, 0.3, 1.3);
  return list.sort((a, b) => a.cost - b.cost);
}

/**
 * Finds the clearest viewpoint near `base`.
 *
 *   score(view) -> 0..1   share of the target points with a clear sightline
 *   accept(view) -> bool  optional: rejects views that lose the shot (the back of a head)
 *   lineAngle, side       optional 180° line: stay on `side` of it unless no angle there
 *                         is clear; only then try the mirrored side
 *
 * Returns { view, score, flipped, tried, fallback }. `fallback` is true when no view was
 * fully clear and the best partial one was kept.
 */
export function searchView({ base, score, accept = () => true, lineAngle = null, side = null }) {
  let tried = 0;
  const lined = lineAngle !== null && side !== null;
  const pass = (start, wanted) => {
    let best = null;
    for (const view of candidateViews(start)) {
      if (lined && lineSide(lineAngle, view.angle) !== wanted) continue;
      if (!accept(view)) continue;
      tried++;
      const value = score(view);
      // Sorted by cost: the first fully clear view is the least change that works.
      if (value >= CLEAR) return { view, score: value };
      if (!best || value - view.cost * 0.1 > best.score - best.view.cost * 0.1)
        best = { view, score: value };
    }
    return best;
  };
  const same = pass(base, side);
  if (same && same.score >= CLEAR) return { ...same, flipped: false, tried, fallback: false };
  if (lined) {
    const other = pass(mirrorView(base, lineAngle), -side);
    if (other && other.score >= CLEAR) return { ...other, flipped: true, tried, fallback: false };
    if (other && (!same || other.score > same.score + 0.25))
      return { ...other, flipped: true, tried, fallback: true };
  }
  if (same) return { ...same, flipped: false, tried, fallback: true };
  return { view: { ...base, cost: 0 }, score: 0, flipped: false, tried, fallback: true };
}

/**
 * Keeps a held shot's viewpoint stable. Check the current view every `interval` seconds;
 * only after `patience` blocked checks in a row, and never within `cooldown` seconds of the
 * last change, may the caller search. A replacement must be clearly better (`margin`) or
 * fully clear where the current view is not, so two similar angles never flicker.
 */
export function createFramingMonitor({
  interval = 0.25,
  patience = 2,
  margin = 0.3,
  cooldown = 1.5,
} = {}) {
  let clock = 0;
  let since = Infinity;
  let strikes = 0;
  return {
    /** True when a check is due this frame. */
    due(dt) {
      clock += dt;
      since += dt;
      if (clock < interval) return false;
      clock = 0;
      return true;
    },
    /** Record the current view's score; true when a search is allowed now. */
    report(value) {
      strikes = value >= CLEAR ? 0 : strikes + 1;
      return strikes >= patience && since >= cooldown;
    },
    better(current, candidate) {
      return candidate >= current + margin || (candidate >= CLEAR && current < CLEAR - 0.2);
    },
    switched() {
      since = 0;
      strikes = 0;
    },
    reset() {
      clock = 0;
      since = Infinity;
      strikes = 0;
    },
  };
}

/** True when a camera at `viewAngle` (bearing from the face) can see a face turned to `facing`. */
export function faceVisible(facing, viewAngle, limit = 100 * DEG) {
  if (!Number.isFinite(facing)) return true;
  return Math.abs(wrap(viewAngle - facing)) <= limit;
}

/**
 * Aim point that puts `point` at normalized screen position (nx, ny) for a camera at `eye`
 * with vertical field of view `vfov` (radians) and `aspect`. Positive nx is right of centre,
 * positive ny above it. Yaw and pitch are solved separately, which is within a few percent
 * of the frame for the offsets used here (thirds).
 */
export function composeAim(eye, point, { nx = 0, ny = 0, vfov, aspect }) {
  const dx = point.x - eye.x,
    dy = point.y - eye.y,
    dz = point.z - eye.z;
  const flat = Math.hypot(dx, dz);
  const distance = Math.hypot(flat, dy);
  const tanV = Math.tan(vfov / 2);
  // Turning left (larger yaw) moves the point right on screen; pitching down moves it up.
  const pitch = Math.atan2(dy, flat) - Math.atan(ny * tanV);
  const yaw = Math.atan2(dx, dz) + Math.atan(nx * tanV * aspect * Math.cos(pitch));
  return {
    x: eye.x + Math.sin(yaw) * Math.cos(pitch) * distance,
    y: eye.y + Math.sin(pitch) * distance,
    z: eye.z + Math.cos(yaw) * Math.cos(pitch) * distance,
  };
}

/**
 * Screen offsets for a single: eyes on the upper third, and look room ahead of the face.
 * `lookSign` is +1 when the subject faces screen right, -1 for left, 0 when unknown.
 * Tall frames keep the face nearer the centre, where there is little width to spare.
 */
export function thirds(aspect, lookSign = 0) {
  const tall = aspect < 1;
  return { nx: -lookSign * (tall ? 0.14 : 0.3), ny: tall ? 0.36 : 0.33 };
}
