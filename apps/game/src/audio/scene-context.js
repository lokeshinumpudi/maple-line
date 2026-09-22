/**
 * Scene-aware sound context. Pure functions over the authored route, river, wetland and lake
 * definitions plus a listener position. No Three.js objects and no scene reads: positions are
 * plain [x, y, z] arrays so the result can sit in the store or a test fixture.
 *
 * Water emitters are only the bodies the world actually builds:
 * - the original valley river (river-profile.js, z -900..1350 as main.js already clamps),
 * - the Kawasemi wetland channel (wetland-profile.js, a still marsh cut),
 * - the Takabashi gorge river 77 m under the bridge span (extended-route.js),
 * - the three regional lakes and the Minato tidal inlet (lake-scenery.js).
 * Terrain cliffs and mountain ravines carry no water and produce no emitter, so a high shelf
 * next to a dry drop is not mistaken for a shoreline.
 */
import { riverProfile } from '../world/river-profile.js';
import { landmarks, routeCenter, routeElevation, ROUTE_START_Z } from '../world/extended-route.js';
import { regionalLakes, lakeRadius } from '../world/lake-scenery.js';
import { createWetlandWaterProfile, wetlandSection } from '../simulation/wetland-profile.js';
import { regionalVariation } from '../world/region-variation.js';

const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
const RAIL_OFFSET = 28; // extended route rail sits 28 m right of routeCenter (see main.js railPoint)

/** Matches the original-valley clamp in main.js; the river mesh stops rendering past 1400. */
export const VALLEY_RIVER_EXTENT = Object.freeze({ minZ: -900, maxZ: 1350, waterY: -0.4 });
export const GORGE_RIVER = Object.freeze({
  z: landmarks.bridgeZ,
  halfLength: 285, // 570 m box along x
  halfWidth: 6.5, // 13 m box along z
  dropBelowDeck: 77,
});

/**
 * Relative loudness of each water kind at zero distance, feeding soundMix.riverIntensity.
 * Rivers keep the existing level (1). Still lakes and a marsh lap rather than rush; the tidal
 * inlet sits between. These are mix decisions, not measured recordings.
 */
export const WATER_INTENSITY = Object.freeze({
  river: 1,
  gorge: 0.9,
  lake: 0.3,
  coast: 0.45,
  wetland: 0.12,
});

/** Same first-order roll-off soundMix applies to river distance; documented approximation. */
export const WATER_ROLLOFF_METRES = 60;
export const waterAttenuation = (distance) =>
  Number.isFinite(distance) ? Math.exp(-Math.max(0, distance) / WATER_ROLLOFF_METRES) : 0;

const wetland = createWetlandWaterProfile((z) => ({
  x: routeCenter(z) + RAIL_OFFSET,
  y: routeElevation(z),
}));

const distanceTo = (listener, point) =>
  Math.hypot(listener[0] - point[0], listener[1] - point[1], listener[2] - point[2]);

function valleyRiverEmitter(listener) {
  const z = clamp(listener[2], VALLEY_RIVER_EXTENT.minZ, VALLEY_RIVER_EXTENT.maxZ);
  const river = riverProfile(z);
  const riverX = routeCenter(z) + river.offset;
  const point = [
    clamp(listener[0], riverX - river.halfWidth, riverX + river.halfWidth),
    VALLEY_RIVER_EXTENT.waterY,
    z,
  ];
  return { id: 'valley-river', kind: 'river', point };
}

function wetlandEmitter(listener) {
  const z = clamp(
    listener[2],
    wetland.centerZ - wetland.halfLength,
    wetland.centerZ + wetland.halfLength,
  );
  const section = wetlandSection(z, wetland);
  const centerX = section?.centerX ?? wetland.centerX;
  const halfWidth = section?.halfWidth ?? 0;
  const point = [clamp(listener[0], centerX - halfWidth, centerX + halfWidth), wetland.waterY, z];
  return { id: 'kawasemi-wetland', kind: 'wetland', point };
}

function gorgeRiverEmitter(listener) {
  const railX = routeCenter(GORGE_RIVER.z) + RAIL_OFFSET;
  const point = [
    clamp(listener[0], railX - GORGE_RIVER.halfLength, railX + GORGE_RIVER.halfLength),
    routeElevation(GORGE_RIVER.z) - GORGE_RIVER.dropBelowDeck,
    clamp(
      listener[2],
      GORGE_RIVER.z - GORGE_RIVER.halfWidth,
      GORGE_RIVER.z + GORGE_RIVER.halfWidth,
    ),
  ];
  return { id: 'takabashi-gorge', kind: 'gorge', point };
}

/**
 * Nearest shoreline approximation: scale the listener's offset from the lake centre back to the
 * scalloped shoreline radius. Exact for circles, a few metres off on the elliptical coves.
 * Over the water the emitter sits directly beneath the listener.
 */
function lakeEmitter(lake, listener) {
  const cx = routeCenter(lake.z) + lake.u;
  const waterY = routeElevation(lake.z) - lake.drop;
  const radius = lakeRadius(lake, listener[0], listener[2], routeCenter);
  const point =
    radius <= 1
      ? [listener[0], waterY, listener[2]]
      : [cx + (listener[0] - cx) / radius, waterY, lake.z + (listener[2] - lake.z) / radius];
  return { id: lake.id, kind: lake.coast ? 'coast' : 'lake', point, overWater: radius <= 1 };
}

/** All authored water emitters with distance from the listener; nearest audible first. */
export function waterEmitters(listener) {
  const at = toVector(listener);
  const emitters = [
    valleyRiverEmitter(at),
    wetlandEmitter(at),
    gorgeRiverEmitter(at),
    ...regionalLakes.map((lake) => lakeEmitter(lake, at)),
  ].map((emitter) => {
    const distance = distanceTo(at, emitter.point);
    const intensity = WATER_INTENSITY[emitter.kind];
    return {
      ...emitter,
      intensity,
      distance,
      level: intensity * waterAttenuation(distance),
      point: emitter.point.map((v) => Math.round(v * 100) / 100),
    };
  });
  return emitters.sort((a, b) => b.level - a.level);
}

/**
 * Forest context from the authored region field and the active world plan.
 * The authored city field gradually thins forest sound to 0.15; elsewhere use the plan tier.
 * Snowbound highlands report a winter soundscape even on an autumn plan, because main.js already
 * paints snow weather above 337 m and soundMix already treats snow weather as winter.
 */
export function forestContext({ z = 0, season = 'autumn', forest = 'balanced', weather } = {}) {
  const region = regionalVariation(z);
  const planDensity = { sparse: 0.4, balanced: 0.75, dense: 1 }[forest] ?? 0.8;
  const density = Math.max(0.15, planDensity * (1 - region.city * 0.85));
  const snowbound = region.snow > 0.5 || weather === 'snow';
  return {
    density: Math.round(clamp(density, 0, 1) * 1000) / 1000,
    season: snowbound && season !== 'winter' ? 'winter' : season,
    plannedSeason: season,
    snowbound,
    wetness: Math.round(region.wetness * 1000) / 1000,
    region: region.id,
    originalValley: z <= ROUTE_START_Z,
  };
}

/**
 * Serializable scene sound context. `riverDistance`/`riverIntensity`/`riverSource` are the
 * dominant emitter and drop straight into the existing soundscape input. `waterLevel` sums all
 * emitters, capped, so a boundary between two bodies cannot exceed one river's loudness.
 */
export function sceneSoundContext({ listener, z, season, forest, weather } = {}) {
  const at = toVector(listener);
  const emitters = waterEmitters(at);
  const [dominant] = emitters;
  const waterLevel = Math.min(
    1,
    emitters.reduce((sum, e) => sum + e.level, 0),
  );
  return {
    listener: at,
    emitters,
    water: dominant,
    riverDistance: dominant.distance,
    riverIntensity: dominant.intensity,
    riverSource: dominant.point,
    waterLevel,
    forest: forestContext({ z: z ?? at[2], season, forest, weather }),
  };
}

function toVector(listener) {
  if (Array.isArray(listener))
    return [Number(listener[0]) || 0, Number(listener[1]) || 0, Number(listener[2]) || 0];
  if (listener && typeof listener === 'object')
    return [Number(listener.x) || 0, Number(listener.y) || 0, Number(listener.z) || 0];
  return [0, 0, 0];
}

/** Listener positions on the rail for repeatable audio checks (driver eye ~3 m above rail). */
const railListener = (z, lateral = 0) => [
  routeCenter(z) + (z > ROUTE_START_Z ? RAIL_OFFSET : 20) + lateral,
  routeElevation(z) + 3,
  z,
];
export const ROUTE_FIXTURES = Object.freeze({
  originalValley: Object.freeze({ z: 200, listener: railListener(200), expect: 'valley-river' }),
  wetNear: Object.freeze({ z: 2610, listener: railListener(2610), expect: 'kawasemi-wetland' }),
  dryFar: Object.freeze({ z: 9600, listener: railListener(9600), expect: null }),
  lakeAndHarbour: Object.freeze({ z: 21200, listener: railListener(21200), expect: 'minato' }),
});
