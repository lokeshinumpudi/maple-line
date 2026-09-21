/** Version 1: one encounter owned by its story beat, in world x/z metres.
 * Bounded, seed-stable candidates; no scene resources or changes to rail/terrain.
 */
export function createStoryWildlife({
  encounters,
  railPoint,
  terrainHeight,
  habitatAllowed = () => true,
}) {
  let key = null;
  let anchor = null;
  let elapsed = 0;
  let trust = 0;
  let roam = 0;
  let state = { visible: false, reason: 'no-encounter', pose: null };
  function place(beat, cast, seed) {
    const feet = cast.feet?.map((person) => person.position) ?? [];
    if (!feet.length) return null;
    const rail = railPoint(beat.z);
    const ahead = railPoint(beat.z + 1),
      behind = railPoint(beat.z - 1);
    const length = Math.hypot(ahead.x - behind.x, ahead.z - behind.z);
    if (!Number.isFinite(length) || length < 0.001) return null;
    const fx = (ahead.x - behind.x) / length,
      fz = (ahead.z - behind.z) / length;
    const cx = feet.reduce((sum, p) => sum + p[0], 0) / feet.length;
    const cz = feet.reduce((sum, p) => sum + p[2], 0) / feet.length;
    const sign = (cx - rail.x) * fz - (cz - rail.z) * fx < 0 ? -1 : 1;
    let hash = 2166136261;
    for (const c of `story-wildlife:1:${seed}:${beat.id}`)
      hash = Math.imul(hash ^ c.charCodeAt(0), 16777619) >>> 0;
    for (let attempt = 0; attempt < 12; attempt++) {
      // Regional platforms extend to 8.6 m from the rail; buildings sit behind
      // the stop. Use the open verge ahead and outside both footprints.
      const platform = cast.stageType === 'platform';
      const across = (platform ? 3.65 : 1.5) + Math.floor(attempt / 4) * 0.55;
      const along = (platform ? 0.75 : -1.5) + (((hash % 4) + attempt) % 4) * 0.65;
      const x = cx + fz * sign * across + fx * along;
      const z = cz - fx * sign * across + fz * along;
      const y = terrainHeight(x, z);
      if (!Number.isFinite(y) || Math.abs(y - feet[0][1]) > 1.4) continue;
      let safe = true;
      // Check the entire small roaming footprint, including distance from the curved rail.
      for (const dx of [-0.6, 0, 0.6])
        for (const dz of [-0.6, 0, 0.6]) {
          const height = terrainHeight(x + dx, z + dz),
            track = railPoint(z + dz);
          if (
            !Number.isFinite(height) ||
            Math.abs(height - y) > 0.3 ||
            Math.hypot(x + dx - track.x, z + dz - track.z) < 4.8 ||
            !habitatAllowed(x + dx, z + dz)
          )
            safe = false;
        }
      if (safe && feet.every((p) => Math.hypot(p[0] - x, p[2] - z) > 1.2))
        return { x, y, z, heading: Math.atan2(cx - x, cz - z) };
    }
    return null;
  }
  return {
    update({
      dt = 0,
      storyState,
      castState,
      season = 'autumn',
      seed = 1,
      weather = 'clear',
      trainSpeed = 0,
    }) {
      if (!Number.isFinite(dt) || dt < 0)
        throw new TypeError('Encounter time step must be finite and nonnegative.');
      const beat =
        storyState?.enabled && storyState.status === 'dialogue' ? storyState.activeBeat : null;
      const encounter = beat && encounters[beat.id];
      const hide = (reason) => (state = { visible: false, reason, pose: null });
      if (!encounter || !Object.hasOwn(encounter.species, season)) {
        key = null;
        anchor = null;
        return hide('no-encounter');
      }
      if (!castState?.visible || castState.beatId !== beat.id || trainSpeed > 0.05)
        return hide('train-or-cast-moving');
      const nextKey = `${beat.id}:${season}:${seed}`;
      if (nextKey !== key) {
        key = nextKey;
        anchor = place(beat, castState, seed);
        elapsed = 0;
        trust = 0;
        roam = 0;
      }
      if (!anchor) return hide('no-safe-habitat');
      const species = encounter.species[season][0];
      const snowVisitor =
        season === 'winter' && ['red-fox', 'japanese-hare', 'japanese-macaque'].includes(species);
      if (weather !== 'clear' && !(weather === 'snow' && snowVisitor)) return hide('sheltering');
      const step = Math.min(dt, 0.1);
      elapsed += step;
      const action = storyState.fieldNotes?.[beat.id]?.action ?? null;
      trust += ((action ? 1 : 0) - trust) * (1 - Math.exp(-step * 1.2));
      const walking = weather === 'clear' && trust > 0.55 && Math.sin(elapsed * 0.7) > 0.15;
      if (walking) roam += step * 0.45;
      const x = anchor.x + Math.sin(roam) * 0.22;
      const z = anchor.z + (Math.cos(roam) - 1) * 0.22;
      const pose = {
        species,
        x,
        y: terrainHeight(x, z),
        z,
        heading: anchor.heading + Math.sin(elapsed * 0.5) * trust * 0.4,
        time: elapsed,
        season,
        size: species === 'japanese-squirrel' ? 0.65 : 1,
        alert: trust < 0.55,
        walking,
        flying: false,
        graze: trust * (walking ? 0.3 : 0.85),
        hop: species === 'japanese-hare' && walking ? Math.max(0, Math.sin(elapsed * 5)) * 0.07 : 0,
      };
      return (state = {
        visible: true,
        reason: null,
        beatId: beat.id,
        season,
        species,
        behaviour: trust < 0.55 ? 'watching' : walking ? 'foraging' : 'settled',
        action,
        pose,
      });
    },
    getState: () => structuredClone(state),
  };
}
