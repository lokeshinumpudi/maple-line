// Shared by the visible atmosphere and the cached material reflections.
export const ATMOSPHERE_PROFILES = {
  clear: {
    fog: '#c6d5c9',
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
export const DUSK_COLORS = {
  fog: '#a09eaf',
  sky: '#526789',
  horizon: '#efb6a0',
  sun: '#ffd0aa',
  cloud: '#c4adb9',
};
