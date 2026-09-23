// Shared by the visible atmosphere and the cached material reflections.
export const ATMOSPHERE_PROFILES = {
  clear: {
    fog: '#ccd2c1',
    sky: '#8ab5be',
    horizon: '#f4dfbe',
    sun: '#ffe4ba',
    ground: '#82917b',
    sunPower: 2.5,
    ambient: 1.85,
    density: 0.0031,
    exposure: 1.12,
  },
  rain: {
    fog: '#a4babc',
    sky: '#718d9f',
    horizon: '#c4cdcb',
    sun: '#d2e0e6',
    ground: '#657e78',
    sunPower: 0.65,
    ambient: 1.95,
    density: 0.0051,
    exposure: 1.09,
  },
  snow: {
    fog: '#d8e3e4',
    sky: '#a3bdcd',
    horizon: '#f1e7da',
    sun: '#f0ede4',
    ground: '#9daeb0',
    sunPower: 1.35,
    ambient: 2.1,
    density: 0.0038,
    exposure: 1.12,
  },
};
// Storms darken the rain profile. Kept out of ATMOSPHERE_PROFILES so the cached
// reflection environments stay at their existing set.
export const STORM_PROFILE = {
  fog: '#6d7a7d',
  sky: '#39464f',
  horizon: '#76827f',
  cloud: '#57636a',
  sun: '#a8b8c0',
  ground: '#46524f',
  sunPower: 0.22,
  ambient: 1.25,
  density: 0.0074,
  exposure: 1.02,
};
// Low valley mist and far haze. density is the height-fog density at the valley floor;
// falloff is per metre of height; haze blends distant ground toward the sky horizon.
export const HEIGHT_FOG = {
  clear: { density: 0.0017, falloff: 0.06, haze: 0.32, scatter: 0.3 },
  rain: { density: 0.0048, falloff: 0.04, haze: 0.45, scatter: 0.05 },
  snow: { density: 0.0034, falloff: 0.045, haze: 0.45, scatter: 0.15 },
  storm: { density: 0.0085, falloff: 0.03, haze: 0.55, scatter: 0 },
  dusk: { density: 0.0028, falloff: 0.05, haze: 0.35, scatter: 0.2 },
};
export const DUSK_COLORS = {
  fog: '#a09eaf',
  sky: '#526789',
  horizon: '#efb6a0',
  sun: '#ffd0aa',
  cloud: '#c4adb9',
};
