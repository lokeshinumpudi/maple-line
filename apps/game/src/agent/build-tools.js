/** Declarative development tools. No source evaluation or arbitrary network/file access. */
export function registerBuildTools({ tool, builder, storage, sampleRoute, art, performance }) {
  const object = (properties, required = []) => ({
    type: 'object',
    properties,
    required,
    additionalProperties: false,
  });
  const number = (minimum, maximum) => ({ type: 'number', minimum, maximum });
  const integer = (minimum, maximum) => ({ type: 'integer', minimum, maximum });
  const array = (items, minItems, maxItems) => ({ type: 'array', items, minItems, maxItems });
  const triple = (min, max) => array(number(min, max), 3, 3);
  const id = { type: 'string', pattern: '^[A-Za-z][A-Za-z0-9_-]{0,63}$' };
  const color = { type: 'string', pattern: '^#[0-9a-fA-F]{6}$' };
  const kind = { type: 'string', enum: Object.keys(builder.catalog().prefabs) };
  const bounds = object(
    {
      minX: number(-50000, 50000),
      maxX: number(-50000, 50000),
      minZ: number(-50000, 50000),
      maxZ: number(-50000, 50000),
    },
    ['minX', 'maxX', 'minZ', 'maxZ'],
  );
  const fields = {
    position: triple(-50000, 50000),
    rotation: triple(-Math.PI * 2, Math.PI * 2),
    scale: triple(0.05, 10),
    color,
    groundSnap: { type: 'boolean' },
  };
  const entity = object({ id, kind, ...fields }, ['id', 'kind', 'position']);
  const operation = {
    oneOf: [
      object({ type: { const: 'place', type: 'string' }, entity }, ['type', 'entity']),
      object(
        {
          type: { const: 'update', type: 'string' },
          id,
          patch: { ...object(fields), minProperties: 1 },
        },
        ['type', 'id', 'patch'],
      ),
      object({ type: { const: 'remove', type: 'string' }, id }, ['type', 'id']),
      object(
        {
          type: { const: 'scatter', type: 'string' },
          idPrefix: id,
          kind,
          seed: integer(0, 4294967295),
          count: integer(1, 200),
          bounds,
          scaleRange: array(number(0.05, 10), 2, 2),
          color,
        },
        ['type', 'idPrefix', 'kind', 'seed', 'count', 'bounds'],
      ),
    ],
  };
  const layout = object(
    { version: { type: 'integer', const: 1 }, entities: array(entity, 0, 1000) },
    ['version', 'entities'],
  );
  const slot = { type: 'string', pattern: '^[a-z][a-z0-9-]{0,39}$' };
  const prefix = 'maple-line:authored-layout:';
  const slots = () => {
    const results = [];
    for (let i = 0; i < storage.length; i++) {
      const key = storage.key(i);
      if (key?.startsWith(prefix)) {
        try {
          const value = JSON.parse(storage.getItem(key));
          results.push({
            slot: key.slice(prefix.length),
            savedAt: value.savedAt,
            entityCount: value.layout.entities.length,
          });
        } catch {
          /* An unrelated or damaged entry is not a layout. */
        }
      }
    }
    return results.slice(0, 20);
  };
  if (performance)
    tool(
      'measure_game_performance',
      'Measure live rendering for 1–10 seconds without changing gameplay. Reports observed FPS, median/p95 frame and CPU times, frames over20ms, all-pass draw/triangle averages, resolution, camera and route context. CPU timing is not GPU timing.',
      object({ durationSeconds: number(1, 10) }),
      true,
      async ({ durationSeconds = 3 }) => performance.measure(durationSeconds),
    );
  tool(
    'get_build_catalog',
    'Read authored scenery prefabs, units, limits, current edit history and art settings. Tools edit a separate visual layer; track collision and base terrain are unchanged.',
    object({}),
    true,
    () => ({ ...builder.catalog(), state: builder.getState(), art: art.getState() }),
  );
  tool(
    'inspect_level',
    'Read authored entities by stable ID or rectangular region. Paged results contain full transforms and colors; use offsets to inspect larger layouts.',
    object({ id, bounds, offset: integer(0, 1000), limit: integer(1, 100) }),
    true,
    (input) => builder.inspect(input),
  );
  tool(
    'edit_level',
    'Apply an atomic, undoable batch of place/update/remove/scatter operations. Use sample_route first for ground and track positions. Scatter is deterministic from its seed and snaps to terrain; meters/radians.',
    object(
      {
        label: { type: 'string', minLength: 1, maxLength: 120 },
        operations: array(operation, 1, 100),
      },
      ['label', 'operations'],
    ),
    false,
    (input) => builder.applyBatch(input),
  );
  tool(
    'undo_level',
    'Undo the last authored-layer batch or import, leaving the base game intact.',
    object({}),
    false,
    () => builder.undo(),
  );
  tool('redo_level', 'Redo the last undone authored-layer edit.', object({}), false, () =>
    builder.redo(),
  );
  tool(
    'export_level',
    'Export a page of the version 1 layout. Fetch successive offsets until all entities are collected; imports accept the assembled version and entities.',
    object({ offset: integer(0, 1000), limit: integer(1, 100) }),
    true,
    (input) => ({ version: 1, ...builder.inspect(input) }),
  );
  tool(
    'import_level',
    'Replace the authored layer with a validated version 1 layout. The complete replacement is undoable. This does not replace the base world.',
    object({ layout }, ['layout']),
    false,
    (input) => builder.importLayout(input.layout),
  );
  tool(
    'save_level',
    'Save authored scenery in a named slot in this browser origin. Persists across reloads, not across browsers or into source files. Use export_level to transfer a layout.',
    object({ slot }, ['slot']),
    false,
    ({ slot }) => {
      if (!storage.getItem(prefix + slot) && slots().length >= 20)
        throw new Error('The 20 local save slots are full. Reuse a slot.');
      const data = { savedAt: new Date().toISOString(), layout: builder.exportLayout() };
      storage.setItem(prefix + slot, JSON.stringify(data));
      return { slot, savedAt: data.savedAt, entityCount: data.layout.entities.length };
    },
  );
  tool(
    'list_levels',
    'List up to 20 named layout saves in the current browser origin.',
    object({}),
    true,
    () => slots(),
  );
  tool(
    'load_level',
    'Load a saved browser-local authored layout. Replaces current authored scenery and can be undone.',
    object({ slot }, ['slot']),
    false,
    ({ slot }) => {
      const raw = storage.getItem(prefix + slot);
      if (!raw) throw new Error('No saved layout in that slot.');
      return builder.importLayout(JSON.parse(raw).layout);
    },
  );
  tool(
    'sample_route',
    'Sample railway position, terrain height, tunnel state, altitude and nearby stops at route Z coordinates before composing a level. Returned track positions help keep placed scenery clear of the rails.',
    object({ positions: array(number(-700, 24000), 1, 50) }, ['positions']),
    true,
    ({ positions }) => positions.map(sampleRoute),
  );
  tool(
    'set_art_direction',
    'Override development lighting: exposure, sun intensity/color, ambient intensity, and fog density. Empty settings resets weather-driven lighting. This is temporary and does not save source.',
    object(
      {
        settings: object({
          exposure: number(0.4, 2),
          sunIntensity: number(0, 5),
          ambientIntensity: number(0.2, 3),
          fogDensity: number(0.0001, 0.012),
          sunColor: color,
        }),
      },
      ['settings'],
    ),
    false,
    ({ settings }) => art.set(settings),
  );
}

export function createArtDirection({ renderer, scene, sun, hemi }) {
  let settings = {};
  return {
    set(next) {
      settings = { ...next };
      return this.getState();
    },
    getState() {
      return {
        overrides: { ...settings },
        current: {
          exposure: renderer.toneMappingExposure,
          sunIntensity: sun.intensity,
          ambientIntensity: hemi.intensity,
          fogDensity: scene.fog?.density,
          sunColor: `#${sun.color.getHexString()}`,
        },
      };
    },
    apply() {
      if (settings.exposure !== undefined) renderer.toneMappingExposure = settings.exposure;
      if (settings.sunIntensity !== undefined) sun.intensity = settings.sunIntensity;
      if (settings.ambientIntensity !== undefined) hemi.intensity = settings.ambientIntensity;
      if (settings.fogDensity !== undefined) scene.fog.density = settings.fogDensity;
      if (settings.sunColor !== undefined) sun.color.set(settings.sunColor);
    },
  };
}
