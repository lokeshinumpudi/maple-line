/**
 * Props an episode can film or cue. The world modules that draw them
 * (world/station-props.js, world/village-bus.js) use the same ids, and the episode schema
 * validates shot subjects `{ prop }` and `bus` cues against these lists.
 */
export const DRAMA_PROPS = Object.freeze({
  'momiji-timetable': 'Timetable board on the Momiji platform',
  'momiji-clock': 'Station clock under the Momiji canopy',
  'aonuma-timetable': 'Bus timetable at the Aonuma bus stop',
  'aonuma-clock': 'Station clock on the Aonuma platform',
  'aonuma-bus': 'The village bus at the Aonuma stop, seen from the front',
  'aonuma-bus-door': 'The bus front door, close',
  'aonuma-bus-stop': 'The bus stop from behind, wide, as the bus pulls away',
});
export const DRAMA_PROP_IDS = Object.freeze(Object.keys(DRAMA_PROPS));

/**
 * Village bus states. `parked`: engine off, doors shut, lights dim. `wait` (the cue) puts
 * it in `waiting`: headlights on, doors open. `leave` shuts the doors and drives the short
 * road loop out of the bus bay. `arrive` drives in along the loop and stops at the stand.
 */
export const BUS_CUES = Object.freeze(['wait', 'leave', 'arrive']);
export const BUS_STATES = Object.freeze(['parked', 'waiting', 'leaving', 'gone', 'arriving']);

/** Scene clock time, 24-hour `HH:MM`. */
export const CLOCK_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;
export const clockMinutes = (text) => {
  const [hours, minutes] = text.split(':').map(Number);
  return hours * 60 + minutes;
};
