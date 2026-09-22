/** Fixed, inspectable lighting views. Sun direction is shared by sky, water and shadows. */
export const SUN_PHASES = Object.freeze({
  daylight: { label: 'Afternoon', offset: [-90, 160, -65], warmth: 0, power: 1 },
  sunrise: { label: 'Sunrise', offset: [175, 38, -60], warmth: 0.85, power: 0.75 },
  sunset: { label: 'Sunset', offset: [-175, 32, 60], warmth: 1, power: 0.7 },
  dusk: { label: 'Blue hour', offset: [-170, 22, 65], warmth: 0, power: 0.28 },
});
