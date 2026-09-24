/**
 * The route story's people as crowd-kit characters. Haru, Emi and each scene's guest keep
 * their authored places from story-cast.js and story-guests.js (feet, facing, when they
 * appear); this source hands those to the crowd (characters/crowd/crowd.js) as named roles
 * with their own near figures and hand props, and hides the older instanced figures while
 * the models stand in. With `?crowd=legacy` nothing here runs and the old figures stay.
 *
 * Mouths: `speak(character, seconds)` moves a role's mouth; main.js calls it for quoted
 * story narration cues (the story panel's `maple:story-voice` event) and, with voices off,
 * for the beat's speaker while its lines are on screen.
 */
export function createStoryCrowdSource({ storyCast, storyGuests }) {
  const records = new Map();
  let spannerHidden = false;

  function recordFor(id) {
    let record = records.get(id);
    if (!record) {
      record = {
        id,
        source: 'story',
        named: id,
        role: 'neighbour',
        // Always near, with their own figure and props (crowd dedicated slots).
        priority: 2,
        dedicated: true,
        position: { x: 0, y: 0, z: 0 },
        heading: 0,
        walking: false,
        pose: 'standing',
        state: 'story',
        intent: null,
        visible: true,
        hiddenProps: [],
      };
      records.set(id, record);
    }
    return record;
  }

  return {
    id: 'story',
    collect(push) {
      for (const host of [storyCast, storyGuests]) {
        const state = host?.getState?.();
        if (!state?.visible) continue;
        if (host === storyCast) spannerHidden = !state.props?.includes('spanner');
        for (const character of state.characters) {
          const foot = state.feet.find((item) => item.id === character.id)?.position;
          if (!foot) continue;
          const record = recordFor(character.id);
          record.position.x = foot[0];
          record.position.y = foot[1];
          record.position.z = foot[2];
          record.heading = Math.atan2(character.facing[0], character.facing[2]);
          record.hiddenProps = character.id === 'haru' && spannerHidden ? ['spanner'] : [];
          push(record);
        }
      }
    },
    hide(id, hidden) {
      storyCast?.setStandIn?.(id, hidden);
      storyGuests?.setStandIn?.(id, hidden);
    },
    /** A speaking role gestures while talking (the crowd's `chat` clip). */
    setSpeaking(id, speaking) {
      const record = records.get(id);
      if (record) record.intent = speaking ? 'chat' : null;
    },
  };
}
