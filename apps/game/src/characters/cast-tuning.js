/**
 * Hand-prop grips tuned in the character studio (docs/CHARACTER-STUDIO.md), stored in
 * cast-tuning.json beside this file. hero-cast passes a model's entry to attachProps, where
 * it wins over the prop's glTF extras and the PROP_GRIPS defaults. An empty file changes
 * nothing. Keys are model paths under models/characters/ without the extension
 * ("vrm/riko"), because two models of the same person can have different hands.
 */
import CAST_TUNING from './cast-tuning.json' with { type: 'json' };

export { CAST_TUNING };

const HANDS = new Set(['left', 'right']);
const HOLDS = new Set(['one', 'two']);

/** "models/characters/vrm/riko.vrm" -> "vrm/riko". */
export function tuningKey(modelPath) {
  return String(modelPath ?? '')
    .replace(/^\/?(models\/characters\/)?/, '')
    .replace(/\.(vrm|glb|gltf)$/i, '');
}

/** The grip overrides for one model, by prop name ({} when nothing is tuned). */
export function gripOverrides(modelPath, tuning = CAST_TUNING) {
  return tuning?.grips?.[tuningKey(modelPath)] ?? {};
}

const round = (value, digits) => {
  if (!Number.isFinite(value)) throw new TypeError(`${value} is not a finite number`);
  const f = 10 ** digits;
  return Math.round(value * f) / f + 0; // + 0 turns -0 into 0
};
const vector = (value, size, digits, what) => {
  if (!Array.isArray(value) || value.length !== size)
    throw new TypeError(`${what} must have ${size} numbers`);
  return value.map((item) => round(item, digits));
};
/** Unit quaternion with w >= 0, so equal rotations always serialise the same way. */
const quaternion = (value, what) => {
  const q = vector(value, 4, 12, what);
  const length = Math.hypot(...q);
  if (!(length > 1e-6)) throw new TypeError(`${what} must be a rotation`);
  const sign = q[3] < 0 ? -1 : 1;
  return q.map((item) => round((item / length) * sign, 5));
};
/** A second-hand grip: position (metres, prop space) and a quaternion. */
const grip2 = (value, what) => {
  if (!Array.isArray(value) || value.length !== 7) throw new TypeError(`${what} must be 7 numbers`);
  return [...vector(value.slice(0, 3), 3, 4, what), ...quaternion(value.slice(3), what)];
};

/**
 * One grip as stored: `hand` left|right, `hold` one|two, `offset` metres and `rotation`
 * quaternion in hand-socket space, `grip2` for the second hand (prop space), and `cradle`
 * ({ at, turn, rotation, grip2 }; `rotation` turns the cradling hand in socket space) for a
 * standing two-hand cradle. Unknown fields are dropped and
 * numbers rounded (0.1 mm, 1e-5 quaternion units) so a save produces a small, stable diff.
 */
export function serializeGrip(grip = {}) {
  const out = {};
  if (grip.hand !== undefined) {
    if (!HANDS.has(grip.hand)) throw new TypeError('hand must be left or right');
    out.hand = grip.hand;
  }
  if (grip.hold !== undefined) {
    if (!HOLDS.has(grip.hold)) throw new TypeError('hold must be one or two');
    out.hold = grip.hold;
  }
  if (grip.offset !== undefined) out.offset = vector(grip.offset, 3, 4, 'offset');
  if (grip.rotation !== undefined) out.rotation = quaternion(grip.rotation, 'rotation');
  if (grip.grip2 !== undefined && grip.grip2 !== null) out.grip2 = grip2(grip.grip2, 'grip2');
  if (grip.cradle) {
    const cradle = {};
    cradle.at = vector(grip.cradle.at ?? [0, 1, 0.3], 3, 4, 'cradle.at');
    cradle.turn = round(grip.cradle.turn ?? 0, 4);
    if (grip.cradle.rotation) cradle.rotation = quaternion(grip.cradle.rotation, 'cradle.rotation');
    if (grip.cradle.grip2) cradle.grip2 = grip2(grip.cradle.grip2, 'cradle.grip2');
    out.cradle = cradle;
  }
  return out;
}

const sortKeys = (object) =>
  Object.fromEntries(
    Object.keys(object)
      .sort()
      .map((key) => [key, object[key]]),
  );

/** A copy of `tuning` with one prop's grip set (or removed when `grip` is null). */
export function setGrip(tuning, modelPath, prop, grip) {
  const key = tuningKey(modelPath);
  const grips = { ...tuning?.grips };
  const entry = { ...grips[key] };
  if (grip === null) delete entry[prop];
  else entry[prop] = serializeGrip(grip);
  if (Object.keys(entry).length) grips[key] = sortKeys(entry);
  else delete grips[key];
  return { ...tuning, version: 1, grips: sortKeys(grips) };
}

/** Validate a parsed cast-tuning file; returns it with every grip normalised. */
export function parseTuning(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new TypeError('cast tuning must be an object');
  if (value.version !== 1) throw new TypeError('cast tuning version must be 1');
  let out = { ...value, grips: {} };
  for (const [key, props] of Object.entries(value.grips ?? {}))
    for (const [prop, grip] of Object.entries(props)) out = setGrip(out, key, prop, grip);
  return out;
}
