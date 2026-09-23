/**
 * WebMCP tools for the character studio (development page only). Registered natively when
 * the browser has document.modelContext or navigator.modelContext; always reachable through
 * the page facade window.mapleStudioWebMCP.invoke(name, args), which is not native tool
 * discovery. Arguments are validated against each tool's schema before it runs.
 */
import { RIG_LAYERS } from '../../world/character-rig.js';

/** The schema subset these tools use: objects, enums, bounded numbers, strings, arrays. */
export function validateToolInput(value, schema, path = 'arguments') {
  if (schema.oneOf) {
    const fits = schema.oneOf.filter((choice) => {
      try {
        validateToolInput(value, choice, path);
        return true;
      } catch {
        return false;
      }
    });
    if (fits.length !== 1) throw new TypeError(`${path} does not match one allowed shape.`);
    return;
  }
  if (schema.enum && !schema.enum.includes(value))
    throw new TypeError(`${path} must be one of: ${schema.enum.join(', ')}.`);
  if (schema.type === 'object') {
    if (!value || typeof value !== 'object' || Array.isArray(value))
      throw new TypeError(`${path} must be an object.`);
    for (const key of schema.required ?? [])
      if (!Object.hasOwn(value, key)) throw new TypeError(`${path}.${key} is required.`);
    for (const key of Object.keys(value)) {
      if (!Object.hasOwn(schema.properties ?? {}, key))
        throw new TypeError(`${path}.${key} is not allowed.`);
      validateToolInput(value[key], schema.properties[key], `${path}.${key}`);
    }
  } else if (schema.type === 'array') {
    if (!Array.isArray(value) || value.length < schema.minItems || value.length > schema.maxItems)
      throw new TypeError(`${path} must contain ${schema.minItems} values.`);
    value.forEach((item, i) => validateToolInput(item, schema.items, `${path}[${i}]`));
  } else if (schema.type === 'number') {
    if (
      typeof value !== 'number' ||
      !Number.isFinite(value) ||
      value < schema.minimum ||
      value > schema.maximum
    )
      throw new TypeError(`${path} must be a number from ${schema.minimum} to ${schema.maximum}.`);
  } else if (schema.type === 'string') {
    if (
      typeof value !== 'string' ||
      value.length < (schema.minLength ?? 0) ||
      value.length > (schema.maxLength ?? Infinity) ||
      (schema.pattern && !new RegExp(schema.pattern).test(value))
    )
      throw new TypeError(`${path} has an invalid string value.`);
  } else if (schema.type === 'boolean' && typeof value !== 'boolean')
    throw new TypeError(`${path} must be true or false.`);
}

const object = (properties = {}, required = []) => ({
  type: 'object',
  properties,
  required,
  additionalProperties: false,
});
const number = (minimum, maximum) => ({ type: 'number', minimum, maximum });
const text = (maxLength = 160) => ({ type: 'string', minLength: 1, maxLength });
const list = (size, minimum, maximum) => ({
  type: 'array',
  minItems: size,
  maxItems: size,
  items: number(minimum, maximum),
});
const LAYERS = [...RIG_LAYERS, 'steering'];

export function registerStudioTools(S, environment = globalThis) {
  const definitions = [];
  const source = { page: 'character-studio', origin: environment.location?.origin ?? 'local' };
  function tool(name, description, inputSchema, readOnly, handler) {
    definitions.push({
      name,
      description,
      inputSchema,
      annotations: { readOnlyHint: readOnly, untrustedContentHint: true },
      async execute(input = {}) {
        try {
          validateToolInput(input, inputSchema);
          const result = await handler(input);
          return { content: [{ type: 'text', text: JSON.stringify({ source, result }) }] };
        } catch (error) {
          return {
            isError: true,
            content: [
              {
                type: 'text',
                text: JSON.stringify({ source, error: String(error?.message ?? error) }),
              },
            ],
          };
        }
      },
    });
  }

  const summary = () => {
    const L = S.loaded;
    return {
      character: L?.entry.id ?? null,
      kind: L?.entry.kind ?? null,
      clip: S.state.clip,
      time: Number(S.state.t.toFixed(4)),
      playing: S.state.playing,
      trim: S.loaded ? S.trim() : null,
      layers: { ...S.state.layers },
      look: S.state.look,
      props: L?.internals.props.map((p) => S.gripOf?.(p) && { name: p.name, ...S.gripOf(p) }) ?? [],
      unsaved: [...S.dirty],
      hero: L?.hero.getState() ?? null,
    };
  };

  tool(
    'get_studio_state',
    'Read the studio: character, clip, time, layers, props and hero state.',
    object(),
    true,
    summary,
  );
  tool(
    'list_characters',
    'List every character model the studio found (VRM and GLB cast, crowd bodies) and the loaded one.',
    object(),
    true,
    () => ({
      loaded: S.loaded?.entry.id ?? null,
      characters: S.entries.map(({ id, label, kind, path, group }) => ({
        id,
        label,
        kind,
        path,
        group,
      })),
      clips: S.clipNames(),
    }),
  );
  tool(
    'load_character',
    'Load a character by id from list_characters, optionally starting a clip.',
    object({ id: text(), clip: text(60) }, ['id']),
    false,
    async ({ id, clip }) => {
      await S.loadEntry(id, { clip });
      return summary();
    },
  );
  tool(
    'play_clip',
    'Play or pose a clip. `time` holds it at seconds (paused); `blend` uses the game cross-fade; speed and loop set the transport.',
    object({
      clip: text(60),
      time: number(0, 600),
      speed: number(0.05, 4),
      loop: { type: 'boolean' },
      blend: { type: 'boolean' },
      playing: { type: 'boolean' },
    }),
    false,
    ({ clip, time, speed, loop, blend = false, playing }) => {
      if (clip && !S.setClip(clip, { blend })) throw new Error(`No clip ${clip} on this character`);
      if (speed !== undefined) S.state.speed = speed;
      if (loop !== undefined) S.state.loop = loop;
      if (time !== undefined) S.setTime(time);
      if (playing !== undefined) S.play(playing);
      else if (time === undefined) S.play(true);
      return summary();
    },
  );
  tool(
    'set_layer',
    `Switch a motion layer on or off: ${LAYERS.join(', ')}. Optionally set the look target mode.`,
    object({
      layer: { type: 'string', enum: LAYERS },
      enabled: { type: 'boolean' },
      look: { type: 'string', enum: ['none', 'camera', 'target', 'train'] },
    }),
    false,
    ({ layer, enabled, look }) => {
      if (layer) {
        if (enabled === undefined) throw new Error('enabled is required with layer');
        S.state.layers[layer] = enabled;
        S.emit('layers');
      }
      if (look) S.state.look = look;
      return { layers: { ...S.state.layers }, look: S.state.look };
    },
  );
  tool(
    'measure_jitter',
    'RMS angular acceleration per joint and bone group (the CHARACTER-MOTION metric) plus foot slide, over `seconds` of a clip at 60 Hz with the current layers.',
    object({ clip: text(60), seconds: number(0.5, 30) }),
    true,
    ({ clip, seconds = 5 }) => S.measureJitter({ clip, seconds }),
  );
  tool(
    'set_grip',
    'Put a prop (radio, phone, newspaper, bag) in a hand with an offset (metres, socket space) and rotation (quaternion); `cradle` sets the standing cradle ({ at, turn, rotation }) or "keep" to turn the cradling hand so the cradle keeps its look; `store` records it for saving to cast-tuning.json.',
    object(
      {
        prop: { type: 'string', enum: ['radio', 'phone', 'newspaper', 'bag'] },
        hand: { type: 'string', enum: ['left', 'right'] },
        hold: { type: 'string', enum: ['one', 'two'] },
        offset: list(3, -1, 1),
        rotation: list(4, -1, 1),
        cradle: {
          oneOf: [
            { type: 'string', enum: ['keep'] },
            {
              type: 'object',
              properties: { at: list(3, -2, 3), turn: number(-7, 7), rotation: list(4, -1, 1) },
              additionalProperties: false,
            },
          ],
        },
        store: { type: 'boolean' },
      },
      ['prop'],
    ),
    false,
    async ({ store = false, ...grip }) => {
      const result = await S.setGrip(grip);
      if (store) S.storeGrip();
      return { grip: result, stored: store };
    },
  );
  tool(
    'set_overlay',
    'Set the concept overlay for the front or side view: image name (from the concept folder, or "" for none), height in metres, offset [x, y], opacity, flip; `fit` fits the drawn figure to the body; `store` records it.',
    object(
      {
        view: { type: 'string', enum: ['front', 'side'] },
        image: { type: 'string', maxLength: 160 },
        height: number(0.2, 10),
        offset: list(2, -5, 5),
        opacity: number(0, 1),
        flip: { type: 'boolean' },
        fit: { type: 'boolean' },
        store: { type: 'boolean' },
      },
      ['view'],
    ),
    false,
    async ({ view, fit = false, store = false, ...rest }) => {
      await S.overlayReady;
      let result = await S.setOverlay(view, rest);
      if (fit) {
        S.fitOverlay(view);
        result = await S.setOverlay(view, {});
      }
      if (store) S.storeOverlay(view);
      return result;
    },
  );
  tool(
    'capture_views',
    'Save a PNG of the views to artifacts/screenshots/studio/<name>.png. `region` is all, persp, front, side or top.',
    object({
      name: { type: 'string', pattern: '^[a-z0-9][a-z0-9._-]{0,80}$', maxLength: 80 },
      region: { type: 'string', enum: ['all', 'persp', 'front', 'side', 'top'] },
    }),
    false,
    ({ name, region = 'all' }) => S.capture.still({ region, file: name }),
  );
  tool(
    'preview_save',
    'Show the JSON diffs a save would write to cast-tuning.json and studio-tuning.json, without writing.',
    object(),
    true,
    async () => {
      const previews = await S.previewSave();
      return Object.fromEntries(
        Object.entries(previews).map(([name, p]) => [
          name,
          { file: p.file, changed: p.changed, after: p.after },
        ]),
      );
    },
  );

  const api = {
    list: () =>
      definitions.map(({ name, description, inputSchema, annotations }) => ({
        name,
        description,
        inputSchema,
        annotations,
      })),
    invoke(name, input = {}) {
      const definition = definitions.find((d) => d.name === name);
      if (!definition)
        return {
          isError: true,
          content: [
            {
              type: 'text',
              text: JSON.stringify({ source, error: `Unknown studio tool: ${name}` }),
            },
          ],
        };
      return definition.execute(input);
    },
    mode: 'page-fallback',
  };
  environment.mapleStudioWebMCP = api;
  const context =
    typeof environment.document?.modelContext?.registerTool === 'function'
      ? environment.document.modelContext
      : typeof environment.navigator?.modelContext?.registerTool === 'function'
        ? environment.navigator.modelContext
        : null;
  if (context)
    (async () => {
      try {
        for (const definition of definitions) await context.registerTool(definition);
        api.mode = 'native';
      } catch (error) {
        api.error = String(error?.message ?? error);
      }
    })();
  return api;
}
