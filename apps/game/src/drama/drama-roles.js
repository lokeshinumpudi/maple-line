/**
 * Fixed named roles: people who always look the same wherever they appear, so the crowd
 * kit can dress a matching figure and episodes can cast them by id. `model` is the VRM that
 * plays the part now (asset-src/characters/vrm-cast profiles of the same name); `look` is
 * the brief the crowd kit dresses to.
 */
export const FIXED_ROLES = Object.freeze({
  riko: {
    name: 'Riko',
    entity: 'commuter-2',
    model: 'models/characters/vrm/riko.vrm',
    look: 'Girl of 17: dark bob, red hair clip, navy sailor uniform, red neckerchief, canvas bag.',
  },
  fusae: {
    name: 'Grandma Fusae',
    entity: 'fusae',
    model: 'models/characters/vrm/fusae.vrm',
    look: 'Woman of 80: grey hair in a bun, round glasses, patterned knitted cardigan, blue dress.',
  },
  aoi: {
    name: 'Aoi',
    entity: 'aoi',
    model: 'models/characters/vrm/aoi.vrm',
    look: 'Bus driver of 24: ponytail, teal and cream uniform jacket, cream shirt, peaked cap.',
  },
});

/**
 * Hero models for the staged roles that have no simulated person behind them. They are
 * drawn only while an episode stands them on a stage mark (drama-stage.js).
 */
export const STAGED_CAST = Object.freeze(
  ['fusae', 'aoi'].map((id) =>
    Object.freeze({ personId: FIXED_ROLES[id].entity, vrm: FIXED_ROLES[id].model, path: null }),
  ),
);
