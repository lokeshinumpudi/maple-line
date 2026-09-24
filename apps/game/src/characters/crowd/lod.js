/**
 * Which detail level each person gets. Pure functions over distances, so the rules can be
 * tested without a renderer:
 *
 * - near: the closest `nearCount` people inside `nearEnter` metres (pooled skinned
 *   characters); someone already near keeps it until `nearExit`, and ranks as if 15%
 *   closer, so two people at similar distance do not trade places every frame;
 * - mid: the next `midCount` inside `midEnter` (instanced, baked clips), kept until `midExit`;
 * - far: everyone else (the simple instanced figures, recoloured to the person's palette).
 *
 * A person changes tier at most once per `hold` seconds, unless they left the scene.
 */
export const LOD_DEFAULTS = Object.freeze({
  nearEnter: 10,
  nearExit: 13,
  midEnter: 80,
  midExit: 88,
  nearCount: 6,
  midCount: 120,
  hold: 0.6,
  keepBias: 0.85,
});

/** Crowd budgets per graphics tier (rendering/quality-tiers.js names). */
export const CROWD_TIERS = Object.freeze({
  // Phones: two near figures, a short mid ring, no crowd shadows.
  low: Object.freeze({ nearCount: 2, nearEnter: 6, nearExit: 8, midCount: 12, midEnter: 30, midExit: 34, shadows: false }),
  medium: Object.freeze({ nearCount: 4, nearEnter: 8, nearExit: 11, midCount: 60, midEnter: 60, midExit: 66, shadows: false }),
  // Near figures cost CPU (clips, IK, look-at); the mid tier is GPU-only, so it carries the crowd.
  high: Object.freeze({ nearCount: 6, nearEnter: 10, nearExit: 13, midCount: 120, midEnter: 80, midExit: 88, shadows: true }),
});

/**
 * @param {{id: string, distance: number, priority?: number}[]} people this frame
 * @param {Map<string, {tier: string, since: number}>} previous last frame's result
 * @param {number} time seconds
 * @param {Partial<typeof LOD_DEFAULTS>} [options]
 * @returns {Map<string, {tier: 'near'|'mid'|'far', since: number}>}
 */
export function selectTiers(people, previous, time, options = {}) {
  const o = { ...LOD_DEFAULTS, ...options };
  const rank = (person, tier, keep) => {
    const was = previous.get(person.id)?.tier;
    const kept = was === tier || (tier === 'mid' && was === 'near');
    const limit = kept ? keep : tier === 'near' ? o.nearEnter : o.midEnter;
    if (!(person.distance < limit) && !(person.priority > 0 && tier === 'near')) return null;
    // Priority (a story role, a speaker in a portrait) sorts ahead of distance.
    return (person.distance * (kept ? o.keepBias : 1)) - (person.priority ?? 0) * 1000;
  };
  const wanted = new Map();
  const nearList = [];
  for (const person of people) {
    const score = rank(person, 'near', o.nearExit);
    if (score !== null) nearList.push([score, person]);
  }
  nearList.sort((a, b) => a[0] - b[0]);
  const nearIds = new Set(nearList.slice(0, o.nearCount).map(([, person]) => person.id));
  const midList = [];
  for (const person of people) {
    if (nearIds.has(person.id)) continue;
    const score = rank(person, 'mid', o.midExit);
    if (score !== null) midList.push([score, person]);
  }
  midList.sort((a, b) => a[0] - b[0]);
  const midIds = new Set(midList.slice(0, o.midCount).map(([, person]) => person.id));
  for (const person of people)
    wanted.set(person.id, nearIds.has(person.id) ? 'near' : midIds.has(person.id) ? 'mid' : 'far');

  const next = new Map();
  let near = 0;
  let mid = 0;
  for (const person of people) {
    const before = previous.get(person.id);
    let tier = wanted.get(person.id);
    let since = time;
    if (before) {
      if (before.tier === tier) since = before.since;
      else if (time - before.since < o.hold) {
        tier = before.tier;
        since = before.since;
      }
    }
    // Holding a tier never breaks the caps.
    if (tier === 'near' && near >= o.nearCount) tier = 'mid';
    if (tier === 'mid' && mid >= o.midCount) tier = 'far';
    if (tier === 'near') near++;
    if (tier === 'mid') mid++;
    if (before && before.tier !== tier && since === before.since) since = time;
    next.set(person.id, { tier, since });
  }
  return next;
}

/**
 * Near figures are pooled per base body. Keeps existing bindings, fills free slots of the
 * right body, and says which bodies need a new slot (up to `cap` slots in total).
 * @param {string[]} nearIds people who should be near, closest first
 * @param {{body: string, personId: string|null, ready: boolean}[]} slots
 * @param {(id: string) => string} bodyOf
 */
export function assignSlots(nearIds, slots, bodyOf, cap) {
  const wanted = new Set(nearIds);
  const bound = new Map();
  const release = [];
  for (const slot of slots) {
    if (slot.personId && wanted.has(slot.personId) && bodyOf(slot.personId) === slot.body)
      bound.set(slot.personId, slot);
    else if (slot.personId) release.push(slot);
  }
  const free = slots.filter((slot) => !slot.personId || release.includes(slot));
  const assign = [];
  const create = [];
  let total = slots.length;
  for (const id of nearIds) {
    if (bound.has(id)) continue;
    const body = bodyOf(id);
    const index = free.findIndex((slot) => slot.body === body);
    if (index >= 0) {
      const [slot] = free.splice(index, 1);
      assign.push({ slot, personId: id });
      bound.set(id, slot);
    } else if (total < cap && !create.includes(body)) {
      create.push(body);
      total++;
    }
  }
  return { assign, release: release.filter((slot) => !assign.some((a) => a.slot === slot)), create };
}
