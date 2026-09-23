import { SHOT_TYPES } from '../camera/director.js';
import { FILM_QUALITIES } from '../rendering/film-pipeline.js';
import { ROUTE_END_Z, additionalStops } from '../world/extended-route.js';

/**
 * Director tools for agents: read the director, cut to a shot, play a scripted
 * sequence of shots with captions and scene settings, and change the film look.
 * Scene settings use the same weather, time and location actions as the UI.
 */
const object = (properties = {}, required = []) => ({
  type: 'object',
  properties,
  required,
  additionalProperties: false,
});
const number = (minimum, maximum) => ({ type: 'number', minimum, maximum });
const text = (maxLength) => ({ type: 'string', minLength: 1, maxLength });
const LOCATIONS = [
  'gorge',
  'terraces',
  'village',
  'shrine',
  'station',
  'city',
  'tokyo',
  'bridge',
  'tunnel',
  'summit',
  ...additionalStops.map((stop) => stop.id),
];
export const shotSchema = object(
  {
    type: { type: 'string', enum: [...SHOT_TYPES] },
    duration: number(1.5, 60),
    lens: number(12, 600),
    distance: number(2, 800),
    height: number(0.3, 300),
    side: { type: 'string', enum: ['left', 'right'] },
    aperture: { type: 'string', enum: ['deep', 'normal', 'shallow'] },
    transition: { type: 'string', enum: ['cut', 'fade'] },
    subject: {
      oneOf: [
        { type: 'string', enum: ['lead', 'middle', 'rear'] },
        object({ person: text(48) }, ['person']),
        object({ stop: text(48) }, ['stop']),
        object({ point: { type: 'array', minItems: 3, maxItems: 3, items: number(-1e6, 1e6) } }, [
          'point',
        ]),
      ],
    },
    caption: text(160),
    subtitle: text(160),
    line: text(160),
    set: {
      ...object({
        weather: { type: 'string', enum: ['clear', 'rain', 'snow'] },
        timeOfDay: { type: 'string', enum: ['daylight', 'sunrise', 'sunset', 'dusk'] },
        location: { oneOf: [{ type: 'string', enum: LOCATIONS }, number(-700, ROUTE_END_Z)] },
        speedKmh: number(0, 160),
      }),
      minProperties: 1,
    },
  },
  ['type'],
);

export function registerDirectorTools({ tool, director, film, activate, getContext }) {
  tool(
    'get_director_state',
    'Read the film director: active shot, lens, queued scripted shots, recent shot history, available shot types, film look, and nearby filmable context (stop, bridge, tunnel, people). Read-only.',
    object(),
    true,
    () => ({ director: director.getState(), film: film.getState(), context: getContext() }),
  );
  tool(
    'direct_shot',
    'Switch the camera to the director and cut to one shot now. Shot types: trackside (planted beside the line ahead of the train), telephoto (long lens from far away), drone (rising pull-back), helicopter (slow orbit), chase (ahead of the train looking back), wheels (low beside the bogies), cab, window, platform (at the nearest stop), bridge-low (valley floor under the bridge), establishing (high wide of the place), portrait (close on a person or point), orbit (circle any subject). The automatic editor continues after it.',
    shotSchema,
    false,
    (shot) => {
      activate();
      return director.cut(shot);
    },
  );
  tool(
    'play_sequence',
    'Play a scripted sequence of 1–40 shots, optionally opening with a title card. Each shot may carry a caption, subtitle and narration line shown on screen, and `set` scene settings (weather, timeOfDay, location, speedKmh) applied at the cut with a fade. Location jumps move the train through the same action as Places. Use loop for a repeating showcase.',
    object(
      {
        title: text(80),
        loop: { type: 'boolean' },
        shots: { type: 'array', minItems: 1, maxItems: 40, items: shotSchema },
      },
      ['shots'],
    ),
    false,
    ({ title = null, loop = false, shots }) => {
      activate();
      return director.play({ title, loop, shots });
    },
  );
  tool(
    'stop_sequence',
    'Clear queued scripted shots. The director keeps cutting automatically while the Director camera is selected.',
    object(),
    false,
    () => director.stop(),
  );
  tool(
    'set_film_look',
    'Change the film finish. quality: off renders straight to the screen, lite keeps grade and lens finish, full adds MSAA, bloom, sun shafts and depth of field. letterbox forces 2.39:1 bars outside the director (0–1).',
    {
      ...object({
        quality: { type: 'string', enum: [...FILM_QUALITIES] },
        letterbox: number(0, 1),
      }),
      minProperties: 1,
    },
    false,
    ({ quality, letterbox }) => {
      if (quality) film.setPreference(quality);
      if (letterbox !== undefined) film.setLetterbox(letterbox);
      return film.getState();
    },
  );
}
