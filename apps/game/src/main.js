import { SUN_PHASES } from './rendering/sun-phases.js';
import { createTrackSnow } from './world/track-snow.js';
import { TERRAIN_LATERAL_SAMPLES, naturalValleyTerrain } from './world/terrain-surface.js';
import { createEmbedVisuals } from './embed/visuals.js';
import { installEmbedBridge } from './embed/bridge.js';
import { createStableSunShadow } from './rendering/stable-sun-shadow.js';
import { sceneSoundContext } from './audio/scene-context.js';
import { createRegionalRailTraffic } from './world/regional-rail-traffic.js';
import { TOKYO_PASSAGE } from './world/tokyo-passage.js';
import { drivingAction } from './ui/driving-input.js';
import { fetchShipWorld } from './agent/ship-world-client.js';
import { CAR_SPACING } from './train/consist.js';
import { createOpeningSequence } from './presentation/opening-sequence.js';
import './presentation/opening-sequence.css';
import { createRouteNetwork, branchOffsetAtZ } from './simulation/route-network.js';
import {
  createRouteChoice,
  nearestScheduledStop,
  protectRouteStop,
} from './simulation/route-choice.js';
import { mountRouteChoicePanel } from './ui/route-choice-panel.js';
import { createWetlandRoute } from './world/wetland-route.js';
import { lakeVista } from './world/lake-scenery.js';
import { createEveningMotes } from './world/evening-motes.js';
import { paintTerrain } from './rendering/terrain-palette.js';
import { inForestGrove } from './world/scenery-fields.js';
import { createRainImpacts } from './world/rain-impacts.js';
import { createPowerFlow } from './train/power-flow.js';
import { campaign } from './narrative/story-data.js';
import { createStoryEngine } from './narrative/story-engine.js';
import { wildlifeEncounters, wildlifeBroadcast } from './narrative/wildlife-encounters.js';
import { createStoryWildlife } from './world/story-wildlife.js';
import { createStoryHost } from './narrative/story-host.js';
import { connectStorySession } from './narrative/story-session.js';
import { createStoryCast } from './narrative/story-cast.js';
import { createStoryGuests } from './narrative/story-guests.js';
import { createStoryCinematics } from './narrative/story-cinematics.js';
import { mountStoryPanel } from './narrative/story-panel.js';
import { createStationDuties } from './simulation/station-duties.js';
import { createPassingLoop } from './world/passing-loop.js';
import { createRailwayPoints } from './world/railway-points.js';
import { createStoryLevels } from './world/story-levels.js';
import { performLevelTask, performClinicDeliveryAction } from './narrative/story-level-tools.js';
import { mountStationDutiesPanel } from './ui/station-duties-panel.js';
import { createSkyReflections } from './rendering/sky-reflections.js';
import { createSurfaceDetail, smoothTerrainNormals } from './rendering/surface-detail.js';
import { createCedarGeometry, createWeatheredRockGeometry } from './world/nature-geometry.js';
import { createFrameBudget } from './rendering/frame-budget.js';
import { createFilmPipeline } from './rendering/film-pipeline.js';
import { createDirector } from './camera/director.js';
import { registerDirectorTools } from './agent/director-tools.js';
import { mountFilmCaptions } from './ui/film-captions.js';
import { createLevelCrossings } from './world/level-crossings.js';
import { createCrossingBell } from './audio/crossing-bell.js';
import { createNpcMinds } from './simulation/npc-minds.js';
import { createEpisodeRunner } from './drama/episode-runner.js';
import { THE_1742 } from './drama/series/the-1742.js';
import { registerDramaTools, createEpisodeLibrary } from './agent/drama-tools.js';
import { installEpisodePicker } from './ui/episode-picker.js';
import { mountEpisodeHandoff } from './ui/episode-handoff.js';
import { normalizeEpisode } from './drama/episode-schema.js';
import { parseDeepLink, buildDeepLink, withoutDeepLink } from './share/deep-link.js';
import {
  createEpisodeSharing,
  createUrlEpisodeStore,
  createSignalEpisodeStore,
} from './share/episode-store.js';
import { shareLink } from './share/share-link.js';
import { createModelLoader, createGltfLoader } from './rendering/model-loader.js';
import { createHeroCast, MOMIJI_CAST } from './world/hero-cast.js';
import { createStationModules } from './world/station-modules.js';
import { createMindsClient, mindRegion } from './agent/minds-client.js';
import { registerMindTools } from './agent/mind-tools.js';
import { PLACE_LINES } from './presentation/place-lines.js';
import { createWorldAuthoring } from './agent/world-authoring.js';
import { createArtDirection } from './agent/build-tools.js';
import * as THREE from 'three';
import { advanceDrive, stationOutcome } from './simulation/physics.js';
import { createSoundscape } from './audio/soundscape.js';
import { sourcePan } from './audio/sound-model.js';
import { createCameraRig } from './camera/camera-rig.js';
import { createRiverWater } from './world/river-water.js';
import { riverProfile, riverBedHeight } from './world/river-profile.js';
import { addRiverDetails } from './world/river-details.js';
import { addWorldDetails, worldClearings } from './world/world-details.js';
import { createAtmosphere } from './world/atmosphere.js';
import { updateJourney } from './simulation/journey.js';
import { operatingEnvelope } from './simulation/operating-rules.js';
import { installSceneInspector } from './agent/scene-inspector.js';
import { createTrain } from './train/train.js';
import { addFloraDetail } from './world/flora-detail.js';
import { addRailwayBridge } from './world/railway-bridge.js';
import { createGameStore } from './state/game-store.js';
import { attachPreferenceStorage } from './state/preference-storage.js';
import { registerGameWebMCP } from './agent/webmcp.js';
import { networkToolsExtension } from './agent/network-tools.js';
import {
  createCharacterGrab,
  installGrabPointer,
  registerGrabTools,
} from './agent/character-grab.js';
import './ui/character-grab.css';
import { createRailNetwork } from './simulation/rail-network.js';
import { createBusiness } from './simulation/business.js';
import { createMissions } from './simulation/missions.js';
import { mountNetworkPanel, renderMissionChip } from './ui/network-panel.js';
import './ui/network-panel.css';
import { createDirectorClient, directorCruiseSpeed, regionAt } from './agent/ai-director.js';
import { createCanopyGrid } from './world/canopy-grid.js';
import { createLeafClusterGeometry, createLeafClusterTexture } from './world/tree-foliage.js';
import { createWindField } from './world/wind.js';
import { createWindCues } from './world/wind-cues.js';
import { addWildlife } from './world/wildlife.js';
import { createProceduralWorld } from './world/procedural-world.js';
import { createWorldBuilder } from './agent/world-builder.js';
import { installWorldBuilderPanel } from './ui/world-builder-panel.js';
import { installSimpleHUD } from './ui/simple-hud.js';
import { driveNotch, notchDemand, notchLabel, drivingFeedback } from './ui/driving-feedback.js';
import {
  ROUTE_END_Z,
  additionalStops,
  landmarks,
  routeCenter,
  routeElevation,
  scenicTerrain,
  createExtendedWorld,
} from './world/extended-route.js';
import { distanceAtZ, nextStop, recordStationVisit } from './simulation/stops.js';
const $ = (id) => document.getElementById(id);
const scene = new THREE.Scene();
scene.name = 'Maple Line world';
scene.background = new THREE.Color('#abc9cd');
scene.fog = new THREE.FogExp2('#abc9cd', 0.0028);
const mobilePlay =
  matchMedia('(pointer: coarse)').matches && Math.min(innerWidth, innerHeight) < 820;
let renderer;
try {
  renderer = new THREE.WebGLRenderer({
    canvas: $('world'),
    antialias: !mobilePlay,
    powerPreference: mobilePlay ? 'low-power' : 'high-performance',
  });
} catch {
  $('loading').textContent = 'This valley needs a browser with WebGL enabled.';
  throw new Error('WebGL unavailable');
}
const frameBudget = createFrameBudget({
  renderer,
  devicePixelRatio,
  ...(mobilePlay ? { pixelBudget: 700000, maxPixelRatio: 1 } : {}),
});
frameBudget.resize(innerWidth, innerHeight);
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.autoUpdate = false;
renderer.shadowMap.needsUpdate = true;
renderer.info.autoReset = false;
renderer.shadowMap.type = mobilePlay ? THREE.PCFShadowMap : THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.22;
const skyReflections = createSkyReflections(renderer, scene);
if (import.meta.hot) import.meta.hot.dispose(() => skyReflections.dispose());
let authoredWorld,
  artDirection,
  storyHost,
  storyCast,
  storyGuests,
  storyCinematics,
  passingLoop,
  railwayPoints,
  storyLevels,
  routeChoice,
  routePanel,
  networkPanel,
  missionChip,
  characterGrab;
const camera = new THREE.PerspectiveCamera(48, innerWidth / innerHeight, 0.5, 1800);
const hemi = new THREE.HemisphereLight('#dce8db', '#646544', 2.25);
scene.add(hemi);
const sun = new THREE.DirectionalLight('#ffddb0', 3.1);
sun.position.set(-120, 170, -80);
sun.castShadow = true;
sun.shadow.mapSize.set(mobilePlay ? 1024 : 2048, mobilePlay ? 1024 : 2048);
Object.assign(sun.shadow.camera, {
  left: -110,
  right: 110,
  top: 110,
  bottom: -110,
  near: 1,
  far: 500,
});
sun.shadow.bias = -0.001;
sun.shadow.normalBias = 0.4;
scene.add(sun, sun.target);
const stableSunShadow = createStableSunShadow();
// Linear HDR scene target with bloom, sun shafts, focus and grade; 'off' is the plain render.
const filmPipeline = createFilmPipeline({ renderer, scene, camera, quality: 'off' });
const filmQuality = (preference) =>
  preference === 'auto' ? (mobilePlay ? 'off' : 'full') : preference;
const filmCaptions = mountFilmCaptions();
let forcedLetterbox = 0;
if (import.meta.hot)
  import.meta.hot.dispose(() => {
    filmPipeline.dispose();
    filmCaptions.dispose();
  });
let seed = 431;
function random() {
  seed = (seed * 1664525 + 1013904223) >>> 0;
  return seed / 4294967296;
}
const range = (a, b) => a + random() * (b - a);
const inClearing = (u, z) =>
  (z > -510 && z < -410 && u > 34 && u < 75) ||
  worldClearings.some((r) => z >= r.minZ && z <= r.maxZ && u >= r.minU && u <= r.maxU);
const center = routeCenter;
const railU = (z) =>
  z > 130 && z < 430 ? 28 - 85 * Math.sin(((z - 130) / 300) * Math.PI) ** 2 : 28;
const railPoint = (z) => new THREE.Vector3(center(z) + railU(z), routeElevation(z), z);

function terrain(u, z) {
  if (z > 790) return scenicTerrain(center(z) + u, z);
  const height = naturalValleyTerrain(u, z);
  if (z > 145 && z < 415) {
    const separation = Math.abs(u - railU(z));
    return THREE.MathUtils.lerp(
      Math.min(height, -0.8),
      height,
      THREE.MathUtils.smoothstep(separation, 3, 9),
    );
  }
  return height;
}
const surfaceDetail = createSurfaceDetail();
const materials = {};
function mat(color) {
  return (materials[color] ??= new THREE.MeshStandardMaterial({
    color,
    flatShading: true,
    roughness: 1,
  }));
}
function mesh(geometry, color, parent = scene) {
  const m = new THREE.Mesh(geometry, typeof color === 'string' ? mat(color) : color);
  m.castShadow = true;
  m.receiveShadow = true;
  parent.add(m);
  return m;
}
const boxGeo = new THREE.BoxGeometry(1, 1, 1);
function box(parent, color, x, y, z, sx, sy, sz) {
  const m = mesh(boxGeo, color, parent);
  m.position.set(x, y, z);
  m.scale.set(sx, sy, sz);
  return m;
}
// A continuous valley cross section leaves a level railway shelf above the river.
const verts = [];
// Consistent sample count/order: inner right-bank samples never pass the fixed railway shelf.
function section() {
  return TERRAIN_LATERAL_SAMPLES.map((offset) => offset + 28);
}

function face(a, b, c) {
  for (const v of [a, b, c]) verts.push(v.x, v.y, v.z);
}
for (let z = -2050; z < 790;) {
  const next = Math.min(790, z + (z < -850 ? 40 : 4)),
    us = section(z),
    vs = section(next);
  for (let i = 0; i < us.length - 1; i++) {
    const a = new THREE.Vector3(center(z) + us[i], terrain(us[i], z), z),
      b = new THREE.Vector3(center(z) + us[i + 1], terrain(us[i + 1], z), z),
      c = new THREE.Vector3(center(next) + vs[i], terrain(vs[i], next), next),
      d = new THREE.Vector3(center(next) + vs[i + 1], terrain(vs[i + 1], next), next);
    face(a, c, b);
    face(b, c, d);
  }
  z = next;
}
const groundGeo = new THREE.BufferGeometry();
groundGeo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
smoothTerrainNormals(groundGeo);
paintTerrain(groundGeo, {
  bankDistance: (x, z) => {
    const river = riverProfile(z);
    return Math.abs(x - center(z) - river.offset) - river.halfWidth;
  },
});
const ground = mesh(
  groundGeo,
  new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 }),
);
const riverWater = createRiverWater({
  scene,
  renderer,
  camera,
  center,
  riverProfile,
  riverBedHeight,
});
const water = riverWater.mesh,
  waterMat = riverWater.material;
water.name = 'river';
ground.name = 'terrain-valley';
sun.name = 'sun';
hemi.name = 'sky-ambient';
const riverDetails = addRiverDetails({ THREE, scene, center, riverProfile, riverBedHeight });

function instances(geo, count, color) {
  const m = new THREE.InstancedMesh(geo, mat(color), count);
  m.castShadow = true;
  m.receiveShadow = true;
  scene.add(m);
  return m;
}
const dummy = new THREE.Object3D();
function place(m, i, x, y, z, sx, sy, sz, rotation = 0, tint) {
  dummy.position.set(x, y, z);
  dummy.scale.set(sx, sy, sz);
  dummy.rotation.set(0, rotation, 0);
  dummy.updateMatrix();
  m.setMatrixAt(i, dummy.matrix);
  if (tint) m.setColorAt(i, new THREE.Color(tint));
}
const treeCount = 5600,
  trunks = instances(new THREE.CylinderGeometry(0.28, 0.48, 1, 5), treeCount, '#675035'),
  leaves = instances(createLeafClusterGeometry(THREE), treeCount * 5, '#ffffff'),
  pines = instances(createCedarGeometry(), treeCount * 3, '#ffffff');
const canopy = createCanopyGrid();
let activeCanopy = canopy;
let generatedWorld = null;
leaves.material = new THREE.MeshStandardMaterial({
  color: '#ffffff',
  map: createLeafClusterTexture(THREE),
  alphaTest: 0.45,
  side: THREE.DoubleSide,
  roughness: 1,
});
const branches = instances(new THREE.CylinderGeometry(0.1, 0.25, 1, 5), treeCount * 3, '#675035');
let branchCount = 0;
function branchBetween(from, to) {
  const delta = to.clone().sub(from);
  dummy.position.copy(from).add(to).multiplyScalar(0.5);
  dummy.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), delta.clone().normalize());
  dummy.scale.set(1, delta.length(), 1);
  dummy.updateMatrix();
  branches.setMatrixAt(branchCount++, dummy.matrix);
}
const autumn = [
  '#c7a844',
  '#d8b94e',
  '#b57b36',
  '#d88f3e',
  '#b6aa48',
  '#819346',
  '#728346',
  '#496d3b',
  '#cf6935',
];
let ti = 0,
  li = 0,
  pi = 0;
for (let i = 0; i < treeCount; i++) {
  const z = range(-820, 820),
    u = range(-190, 190);
  if (
    Math.abs(u - railU(z)) < 9 ||
    (riverBedHeight(u, z) !== null && riverBedHeight(u, z) < 3) ||
    inClearing(u, z) ||
    !inForestGrove(center(z) + u, z) ||
    Math.abs(u) < 21 ||
    (u > 18 && u < 43) ||
    (z > 460 && z < 580 && u > 20 && u < 58)
  )
    continue;
  const x = center(z) + u,
    y = terrain(u, z),
    h = range(5, 12),
    r = range(2.5, 5.2),
    isPine = random() < 0.26;
  canopy.add(x, z, r * 1.4 + 1, y + (isPine ? h * 1.31 : h * 0.71 + r * 1.34));
  place(trunks, ti++, x, y + h * 0.35, z, 1, h * 0.7, 1);
  if (isPine) {
    for (let k = 0; k < 3; k++)
      place(
        pines,
        pi++,
        x,
        y + h * (0.48 + k * 0.25),
        z,
        r * (1 - k * 0.23),
        h * 0.65,
        r * (1 - k * 0.23),
        range(0, 6),
        ['#315134', '#3d6036', '#4f703c'][k],
      );
  } else {
    const tint = autumn[Math.floor(random() * autumn.length)];
    const angle = range(0, 6.28);
    for (let fork = 0; fork < 3; fork++) {
      const a = angle + (fork * Math.PI * 2) / 3;
      branchBetween(
        new THREE.Vector3(x, y + h * 0.43, z),
        new THREE.Vector3(x + Math.cos(a) * r * 0.62, y + h * 0.78, z + Math.sin(a) * r * 0.62),
      );
    }
    for (let k = 0; k < 5; k++) {
      const a = angle + k * 1.57;
      const spread = k === 0 ? 0 : r * 0.58;
      place(
        leaves,
        li++,
        x + Math.cos(a) * spread,
        y + h * 0.71 + (k === 0 ? r * 0.65 : 0),
        z + Math.sin(a) * spread,
        r * 0.72,
        r * 0.67,
        r * 0.76,
        range(0, 6),
        tint,
      );
    }
  }
}
branches.count = branchCount;
trunks.count = ti;
leaves.count = li;
pines.count = pi;
const rocks = instances(createWeatheredRockGeometry(), 850, '#ffffff');
for (let i = 0; i < 850; i++) {
  const z = range(-820, 820),
    u = range(-135, 135);
  if (
    Math.abs(u - railU(z)) < 6 ||
    (riverBedHeight(u, z) !== null && riverBedHeight(u, z) < 3) ||
    inClearing(u, z) ||
    (u > 21 && u < 39)
  ) {
    place(rocks, i, 0, -100, 0, 1, 1, 1);
    continue;
  }
  const s = range(0.7, 4.7);
  place(
    rocks,
    i,
    center(z) + u,
    terrain(u, z) + s * 0.2,
    z,
    s,
    s * range(0.7, 1.7),
    s * 0.8,
    range(0, 6),
    ['#b6b294', '#8c9583', '#c2b999'][i % 3],
  );
}
const coreTrackPoints = [];
for (let z = -790; z <= 790; z += 10) coreTrackPoints.push(railPoint(z));
const trackPoints = [];
for (let z = -790; z <= ROUTE_END_Z; z += 10) trackPoints.push(railPoint(z));
const baseTrack = new THREE.CatmullRomCurve3(trackPoints);
baseTrack.arcLengthDivisions = trackPoints.length * 4;
baseTrack.updateArcLengths();
const track = createRouteNetwork({ THREE, baseTrack });
let trackLength = track.getLength();
const coreTrack = new THREE.CatmullRomCurve3(coreTrackPoints);
let worldDetails = addWorldDetails({ THREE, scene, center, terrain, track, riverProfile });
addRailwayBridge({ scene, railPoint, terrain, center });
const flora = addFloraDetail({
  THREE,
  scene,
  center,
  terrain,
  riverProfile,
  worldClearings: [
    ...worldClearings,
    { minZ: 130, maxZ: 430, minU: -72, maxU: 36 },
    { minZ: -510, maxZ: -410, minU: 34, maxU: 75 },
  ],
});
const atmosphere = createAtmosphere({ THREE, scene, camera, renderer, sun, hemi, waterMat });
const wildlife = addWildlife({
  THREE,
  scene,
  center,
  terrain,
  riverProfile,
  waterY: -0.4,
  isHabitatClear(x, z, radius) {
    const u = x - center(z);
    if (
      worldClearings.some(
        (r) =>
          z + radius >= r.minZ &&
          z - radius <= r.maxZ &&
          u + radius >= r.minU &&
          u - radius <= r.maxU,
      )
    )
      return false;
    return [
      [0, 0],
      [radius, 0],
      [-radius, 0],
      [0, radius],
      [0, -radius],
    ].every(([dx, dz]) => activeCanopy.heightAt(x + dx, z + dz) === -Infinity);
  },
});
const wind = createWindField({ THREE });
const windCues = createWindCues({ THREE, scene });
const snowCoverage = { value: 0 };
for (const object of [ground, leaves, pines, rocks]) {
  object.material = object.material.clone();
  object.material.onBeforeCompile = (shader) => {
    shader.uniforms.snowCoverage = snowCoverage;
    shader.vertexShader =
      'varying float snowFacing;\n' +
      shader.vertexShader.replace(
        '#include <beginnormal_vertex>',
        '#include <beginnormal_vertex>\nsnowFacing = normal.y;',
      );
    shader.fragmentShader =
      'uniform float snowCoverage; varying float snowFacing;\n' +
      shader.fragmentShader.replace(
        '#include <color_fragment>',
        '#include <color_fragment>\ndiffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.83,0.9,0.92), snowCoverage * smoothstep(-0.1,0.55,snowFacing));',
      );
  };
}
surfaceDetail.apply(ground.material, 'terrain');
surfaceDetail.apply(rocks.material, 'stone');
surfaceDetail.apply(trunks.material, 'timber');
wind.apply(leaves, { amplitude: 0.48, flutter: 0.06 });
wind.apply(pines, { amplitude: 0.32, anchorMin: -0.5, anchorMax: 0.5, flutter: 0.04 });
wind.apply(trunks, { amplitude: 0.008, anchorMin: -0.5, anchorMax: 0.5, flutter: 0 });
const openingSequence = createOpeningSequence({
  THREE,
  camera,
  terrainHeight: (x, z) => terrain(x - center(z), z),
  foliageHeight: (x, z) => activeCanopy.heightAt(x, z),
  reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches,
});
for (const material of [leaves.material, pines.material, ground.material])
  openingSequence.tintMaterial(material);
const trackSnow = createTrackSnow({
  THREE,
  scene,
  railPoint,
  isCovered: (z) =>
    isTunnel(z) ||
    z < -790 ||
    z > ROUTE_END_Z ||
    Math.abs(z - landmarks.bridgeZ) < landmarks.bridgeSpan / 2,
});
const extendedWorld = createExtendedWorld({ THREE, scene, railPoint, center, wind });
// Road crossings whose lamps, arms and queued cars react to the approaching train.
const levelCrossings = createLevelCrossings({
  THREE,
  scene,
  railPoint,
  center,
  terrainAt: (x, z) => scenicTerrain(x, z),
});
if (import.meta.hot) import.meta.hot.dispose(() => levelCrossings.dispose());
const regionalTraffic = createRegionalRailTraffic({
  THREE,
  scene,
  railPoint,
  terrainHeight: (x, z) => terrain(x - center(z), z),
});
const wetlandRoute = createWetlandRoute({
  THREE,
  scene,
  branchCurve: track.getBranchCurve('wetland'),
  railPoint,
  terrain: (x, z) => terrain(x - center(z), z),
});
function tube(points, radius, color) {
  const curve = new THREE.CatmullRomCurve3(points);
  return mesh(new THREE.TubeGeometry(curve, points.length * 2, radius, 5, false), color);
}
// Bound rail geometry per chunk so distant kilometres leave every render pass.
const railChunks = [];
for (let begin = 0; begin < trackPoints.length - 1; begin += 24) {
  const points = trackPoints.slice(begin, Math.min(trackPoints.length, begin + 25));
  for (const dx of [-0.96, 0.96]) {
    const rail = tube(
      points.map((p, i) => {
        const tangent = points[Math.min(i + 1, points.length - 1)]
          .clone()
          .sub(points[Math.max(0, i - 1)]);
        const side = new THREE.Vector3(tangent.z, 0, -tangent.x).normalize();
        return p
          .clone()
          .addScaledVector(side, dx)
          .add(new THREE.Vector3(0, 0.22, 0));
      }),
      0.095,
      '#686a61',
    );
    rail.material.metalness = 0.72;
    rail.material.roughness = 0.3;
    rail.name = `Rail / ${Math.round(points[0].z)} / ${dx}`;
    railChunks.push({ mesh: rail, z: (points[0].z + points[points.length - 1].z) / 2 });
  }
}
// The ballast is a ribbon rather than hundreds of overlapping cubes.
const ballastVerts = [],
  ballastIndices = [];
coreTrackPoints.forEach((p, i) => {
  ballastVerts.push(p.x - 2.6, 4.35, p.z, p.x + 2.6, 4.35, p.z);
  if (i < coreTrackPoints.length - 1 && (p.z < 145 || p.z >= 415)) {
    const k = i * 2;
    ballastIndices.push(k, k + 2, k + 1, k + 1, k + 2, k + 3);
  }
});
const bg = new THREE.BufferGeometry();
bg.setAttribute('position', new THREE.Float32BufferAttribute(ballastVerts, 3));
bg.setIndex(ballastIndices);
bg.computeVertexNormals();
const ballast = mesh(bg, surfaceDetail.apply(mat('#8a8470'), 'ballast'));
ballast.name = 'Railway / crushed stone ballast';
const railClips = instances(boxGeo, 2000, '#646f68');
railClips.name = 'Railway / sleeper fasteners';
railClips.material.metalness = 0.6;
railClips.material.roughness = 0.42;
const sleepers = instances(boxGeo, 1000, '#574e39');
surfaceDetail.apply(sleepers.material, 'timber');
for (let i = 0; i < 1000; i++) {
  const t = i / 999,
    p = coreTrack.getPointAt(t),
    v = coreTrack.getTangentAt(t);
  const yaw = Math.atan2(v.x, v.z);
  place(sleepers, i, p.x, p.y - 0.06, p.z, 2.8, 0.2, 0.27, yaw);
  for (const side of [-1, 1])
    place(
      railClips,
      i * 2 + (side > 0 ? 1 : 0),
      p.x + side * Math.cos(yaw) * 1.12,
      p.y + 0.065,
      p.z - side * Math.sin(yaw) * 1.12,
      0.2,
      0.07,
      0.16,
      yaw,
    );
}
const poles = instances(boxGeo, 54, '#514d3c'),
  arms = instances(boxGeo, 54, '#514d3c');
const wires = [];
for (let i = 0; i < 54; i++) {
  const z = -790 + i * 29.5,
    x = center(z) + railU(z) + 3.6;
  place(poles, i, x, 9.05, z, 0.19, 9.5, 0.19);
  place(arms, i, x - 1.9, 13.5, z, 4, 0.14, 0.14);
  wires.push(new THREE.Vector3(center(z) + railU(z), 12.1, z));
}
const contactWire = tube(wires, 0.035, '#514d3c');
contactWire.name = 'Railway contact wire · 12.1m';
const messenger = [],
  drops = [];
for (let z = -790; z <= 773.5; z += 3) {
  const span = (z + 790) % 29.5,
    y = 13.42 - 0.62 * Math.sin((span / 29.5) * Math.PI);
  messenger.push(new THREE.Vector3(center(z) + railU(z), y, z));
  if (Math.round((z + 790) / 3) % 2 === 0)
    drops.push(
      new THREE.Vector3(center(z) + railU(z), 12.1, z),
      new THREE.Vector3(center(z) + railU(z), y, z),
    );
}
const messengerWire = tube(messenger, 0.025, '#514d3c');
messengerWire.name = 'Catenary messenger cable';
const droppers = new THREE.LineSegments(
  new THREE.BufferGeometry().setFromPoints(drops),
  new THREE.LineBasicMaterial({ color: '#55594c' }),
);
droppers.name = 'Contact wire suspension droppers';
scene.add(droppers);
const insulators = instances(new THREE.CylinderGeometry(0.14, 0.14, 0.32, 6), 54, '#d4cfb2');
for (let i = 0; i < 54; i++) {
  const z = -790 + i * 29.5;
  place(insulators, i, center(z) + railU(z), 13.3, z, 1, 1, 1);
}
insulators.name = 'Catenary ceramic insulators';

// Station and platform, deliberately legible from both side and driver views.
const stationZ = 525,
  stationX = center(stationZ) + 28;
const station = new THREE.Group();
scene.add(station);
station.name = 'station-momiji';
station.position.set(stationX, 4.25, stationZ);
station.rotation.y = Math.atan2(center(stationZ + 1) - center(stationZ), 1);
box(station, '#c1b699', 5, 0.55, -13, 5, 1.1, 56);
box(station, '#e7c871', 2.65, 1.13, -13, 0.25, 0.06, 56);
box(station, '#eee1bd', 8, 3, -15, 5, 4, 11);
box(station, '#514a3a', 8, 5.15, -15, 6, 0.35, 12.5);
for (const z of [-19, -11]) {
  box(station, '#3e655f', 5.46, 3.1, z, 0.06, 1.5, 2);
  box(station, '#6b5036', 8, 2.1, z, 1, 2.8, 0.1);
}
for (const z of [-35, -22, -9, 4]) {
  box(station, '#634e35', 3.5, 3.1, z, 0.15, 4.1, 0.15);
}
box(station, '#55614e', 4, 5.15, -15, 4, 0.3, 45);
function sign(text, x, y, z, parent = scene, width = 6) {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#173e36';
  ctx.fillRect(0, 0, 512, 128);
  ctx.strokeStyle = '#ddc68e';
  ctx.lineWidth = 5;
  ctx.strokeRect(6, 6, 500, 116);
  ctx.fillStyle = '#fff4d0';
  ctx.font = '500 45px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(text, 256, 80);
  const m = mesh(
    new THREE.PlaneGeometry(width, width / 4),
    new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(canvas), side: THREE.DoubleSide }),
    parent,
  );
  m.position.set(x, y, z);
  return m;
}
sign('MOMIJI  もみじ', 4, 4.4, 8, station, 5).rotation.y = -Math.PI / 2;
box(station, '#e5ca77', 0, 1.1, 0, 2.5, 0.1, 1);
sign('STOP', -2, 2.9, 0, station, 2);
const trainModel = createTrain({ THREE, scene, track, trackLength, wireHeight: 12.1 });
const train = trainModel.cars;
// The same distance parameter drives every carriage, preserving spacing on curves.
const startT = distanceAtZ(track, trackLength, -460) / trackLength;
const stopDistance = distanceAtZ(track, trackLength, stationZ);
const routeStops = [
  { id: 'momiji', name: 'Momiji', japanese: 'もみじ', z: stationZ, theme: 'riverside' },
  ...additionalStops,
].map((stop) => ({ ...stop, distance: distanceAtZ(track, trackLength, stop.z) }));
// The regional network is simulated on a map only; missions are played on the Maple Line.
// Stop distances are read live, so the Kawasemi loop moves the mission platforms too.
const railNetwork = createRailNetwork({ mapleStops: routeStops });
const business = createBusiness({ network: railNetwork });
const missionBoard = createMissions({ network: railNetwork, business });
// Missions count loading where the door interlock allows the doors to open.
const missionStopAt = () => alignedPlatformStop() ?? null;
const regionalOptions = document.createElement('optgroup');
regionalOptions.label = 'Regional stations';
for (const stop of additionalStops)
  regionalOptions.append(new Option(`${stop.name} · ${stop.theme}`, String(stop.z)));
$('location').append(regionalOptions);
const viewpointOptions = document.createElement('optgroup');
viewpointOptions.label = 'Views along the line';
for (const [name, z] of [
  ['Kawasemi route board', 2250],
  ['500 ft valley bridge', landmarks.bridgeZ],
  ['Inside the mountain', (landmarks.tunnelStartZ + landmarks.tunnelEndZ) / 2],
  ['Snow-country summit', landmarks.summitZ],
  ['Tokyo neon passage', landmarks.tokyoZ],
  ['Aonuma waterfall lookout', 4660],
  ['Hoshimi twin falls', 14360],
])
  viewpointOptions.append(new Option(name, String(z)));
$('location').append(viewpointOptions);
function nearestUpcomingStop() {
  return nextStop(routeStops, state.distance, state.direction);
}
function weatherAt(position) {
  return weather === 'clear' && position.y > 337 ? 'snow' : weather;
}
function isTunnel(z) {
  return z >= landmarks.tunnelStartZ && z <= landmarks.tunnelEndZ;
}
const embedded = import.meta.env.MODE.endsWith('-embed');
let embedSuspended = false;
let embedVisuals;
let embedLocation = null;
const gameStore = createGameStore(startT * trackLength);
const preferenceStorage = attachPreferenceStorage({
  gameStore,
  storage: embedded ? null : undefined,
});
let state = gameStore.getState().drive;
let { mode, view, dusk, sound, weather } = gameStore.getState().preferences;
filmPipeline.setQuality(filmQuality(gameStore.getState().preferences.filmLook));
let crossingBell;
let audioCtx,
  soundscape,
  audioElapsed = 0,
  narrationPlaying = false,
  hudDirty = true,
  hudElapsed = 0;
gameStore.subscribe(
  (value) => value.drive,
  (next) => {
    state = next;
    syncServiceControls();
    hudDirty = true;
  },
);
gameStore.subscribe(
  (value) => value.preferences,
  (next) => {
    ({ mode, view, dusk, sound, weather } = next);
    filmPipeline.setQuality(filmQuality(next.filmLook));
    if ($('film-look')) $('film-look').value = next.filmLook;
    document.body.classList.toggle('hud-hidden', !next.hudVisible);
    $('restore-hud').hidden = next.hudVisible;
    if ($('camera-view')) $('camera-view').value = view;
    hudDirty = true;
  },
);
const changeDrive = (recipe) => gameStore.updateDrive(recipe);
const directorButton = document.createElement('button');
directorButton.id = 'ai-director';
directorButton.textContent = 'AI life · ready';
directorButton.title =
  'Jev chooses travel pace for auto drive and local activities. Manual driving stays yours.';
document.querySelector('.explore-bar').append(directorButton);
const fetchDirector = (path, options) =>
  fetch(`${document.documentElement.dataset.directorUrl ?? ''}${path}`, options);
const director = createDirectorClient({
  offline: ['signal', 'static'].includes(document.documentElement.dataset.hosting),
  fetcher: fetchDirector,
  getContext: () =>
    state.started && !state.done
      ? {
          weather: weatherAt(train[0].position),
          speedKmh: state.speed * 3.6,
          remainingToStation:
            ((nearestUpcomingStop()?.distance ?? state.distance) - state.distance) *
            state.direction,
          region: regionAt(
            track.getPointAt(THREE.MathUtils.clamp(state.distance / trackLength, 0, 1)).z,
          ),
          paused: state.paused || Boolean(document.querySelector('dialog[open]')),
        }
      : null,
  onDecision: (decision) => gameStore.updateDirector(decision),
  onStatus: (status) => gameStore.updateDirector({ status }),
});
// Every background character carries a mood, needs and an intent. Local rules run each
// frame; AI life also sends a few salient characters to Jev for bounded mood/intent picks.
const minds = createNpcMinds({ seed: gameStore.getState().worldBuilder.active?.plan.seed ?? 1 });
const mindsClient = createMindsClient({
  minds,
  offline: ['signal', 'static'].includes(document.documentElement.dataset.hosting),
  fetcher: fetchDirector,
  getContext: () =>
    state.started && !state.done
      ? {
          paused: state.paused || Boolean(document.querySelector('dialog[open]')),
          camera: camera.position,
        }
      : null,
  onStatus: (status) => {
    directorButton.dataset.minds = status;
  },
});
mindsClient.setEnabled(gameStore.getState().director.enabled);
// Blender-built assets (asset-src/). Missing files keep the procedural figure and station.
const gltfLoader = createGltfLoader();
const modelLoader = createModelLoader({
  load: (path) => gltfLoader.then((load) => load(path)),
  onError: (path) => controlMessage(`${path} could not load; showing the simple version.`),
});
// worldDetails is replaced when a generated valley is built, so resolve it each call.
const heroWorld = {
  setStandIn: (id, enabled) => worldDetails.setStandIn?.(id, enabled),
  figureOf: (id) => worldDetails.figureOf?.(id) ?? null,
};
const heroCasts = MOMIJI_CAST.map((member) =>
  createHeroCast({ THREE, scene, loader: modelLoader, worldDetails: heroWorld, minds, ...member }),
);
const stationModules = createStationModules({ THREE, loader: modelLoader, parent: station });
if (import.meta.hot)
  import.meta.hot.dispose(() => {
    for (const hero of heroCasts) hero.dispose();
    stationModules.dispose();
  });
if (import.meta.hot) import.meta.hot.dispose(() => mindsClient.dispose());
directorButton.onclick = () => {
  const enabled = !gameStore.getState().director.enabled;
  gameStore.updateDirector({ enabled });
  director.setEnabled(enabled);
  mindsClient.setEnabled(enabled);
};
gameStore.subscribe(
  (value) => value.director,
  (next) => {
    const label = {
      thinking: 'deciding',
      jev: 'Jev',
      fallback: 'local',
      offline: 'offline',
      idle: 'ready',
      off: 'off',
    }[next.status];
    directorButton.textContent = `AI life · ${label}`;
    directorButton.setAttribute('aria-pressed', String(next.enabled));
  },
);
function activeDirectorDecision() {
  const decision = gameStore.getState().director;
  return decision.enabled && Date.now() - decision.decidedAt < 60000 ? decision : null;
}
if (import.meta.hot) import.meta.hot.dispose(() => director.dispose());
function setDrive(power, brake) {
  if (state.done) return;
  if (state.emergency) {
    controlMessage('Stop, then press E to release the emergency brake.');
    return;
  }
  if ((state.doorsOpen || state.doorsClosing) && power > 0) {
    controlMessage('Close the doors before applying power.');
    return;
  }
  changeDrive((next) => {
    next.autopilot = false;
    next.emergency = false;
    next.power = THREE.MathUtils.clamp(power, 0, 1);
    next.brake = THREE.MathUtils.clamp(brake, 0, 1);
  });
  if ($('autopilot')) $('autopilot').textContent = 'Auto drive';
  return true;
}
function activateRideSound() {
  const enabled = $('start-with-sound').checked;
  if (enabled !== sound || (enabled && audioCtx?.state !== 'running')) void setSound(enabled);
}
function start() {
  activateRideSound();
  changeDrive((next) => {
    next.started = true;
    next.paused = false;
  });
  document.body.classList.add('playing');
  $('welcome').hidden = true;
  $('pause').textContent = 'Pause';
  setDrive(gameStore.getState().preferences.manualControls ? 0 : 0.4, 0);
  if (!gameStore.getState().preferences.manualControls && mode === 'explore')
    changeDrive((next) => {
      next.autopilot = true;
    });
}
function reset({ preserveRoute = false } = {}) {
  if (updateStationDuties().active) {
    controlMessage('Finish the station duties, or leave Haru’s story before restarting.');
    return false;
  }
  gameStore.resetDrive();
  if (!preserveRoute && routeChoice) resetRouteChoice();
  $('result').hidden = true;
  start();
  updateCamera(1, true);
}
$('start').onclick = start;
$('restart').onclick = reset;
$('again').onclick = reset;
function setController(value) {
  const demand = notchDemand(value);
  const previous = driveNotch(state);
  gameStore.setPreferences({ manualControls: true });
  if (setDrive(demand.power, demand.brake) && previous !== driveNotch(state))
    soundscape?.controlNotch();
  $('drive-lever').value = driveNotch(state);
}
$('drive-lever').oninput = () => setController(Number($('drive-lever').value));
$('drive-lever').onkeydown = (event) => {
  if (event.ctrlKey || event.metaKey || event.altKey) return;
  if (event.repeat && !['KeyW', 'KeyS'].includes(event.code)) return;
  if (!['KeyW', 'KeyS', 'KeyA', 'KeyX', 'KeyD', 'KeyE', 'Space'].includes(event.code)) return;
  event.preventDefault();
  if (event.code === 'KeyW') setController(driveNotch(state) + 1);
  if (event.code === 'KeyS') setController(driveNotch(state) - 1);
  if (event.code === 'KeyA' || event.code === 'KeyX') setController(0);
  if (event.code === 'KeyD') toggleDoors();
  if (event.code === 'KeyE') toggleEmergency();
  if (event.code === 'Space') pause();
};
function pause() {
  if (!state.started || state.done) return;
  changeDrive((next) => {
    next.paused = !next.paused;
  });
  $('pause').textContent = state.paused ? 'Resume' : 'Pause';
}
$('pause').onclick = pause;
let controlStatusTimer;
function controlMessage(message) {
  clearTimeout(controlStatusTimer);
  $('control-status').textContent = message;
  $('control-status').hidden = false;
  controlStatusTimer = setTimeout(() => {
    $('control-status').hidden = true;
  }, 3200);
}
function platformDoorAligned() {
  return Boolean(alignedPlatformStop());
}
/** The stop whose platform lines up with any car door, using the door interlock's spans. */
function alignedPlatformStop() {
  return routeStops.find((stop) => {
    const span = stop.id === 'momiji' ? [-40, 13] : [-26, 26];
    for (let car = 0; car < train.length; car++) {
      const t = THREE.MathUtils.clamp(
        (state.distance - state.direction * car * CAR_SPACING) / trackLength,
        0,
        1,
      );
      const position = track.getPointAt(t),
        forward = track.getTangentAt(t).multiplyScalar(state.direction);
      for (const offset of [-4.59, 4.59]) {
        const z = position.z + forward.z * offset;
        if (z - stop.z >= span[0] && z - stop.z <= span[1]) return true;
      }
    }
    return false;
  });
}
function syncServiceControls() {
  const label = state.doorsClosing ? 'Closing…' : state.doorsOpen ? 'Close doors' : 'Doors';
  $('doors').disabled = state.doorsClosing;
  if ($('doors').dataset.open !== `${state.doorsOpen}:${state.doorsClosing}`) {
    $('doors').innerHTML = `${label} <kbd>D</kbd>`;
    $('doors').dataset.open = `${state.doorsOpen}:${state.doorsClosing}`;
    $('doors').setAttribute('aria-pressed', String(state.doorsOpen));
  }
  const emergencyLabel = state.emergency ? 'Release brake' : 'Emergency';
  if ($('emergency').dataset.active !== String(state.emergency)) {
    $('emergency').innerHTML = `${emergencyLabel} <kbd>E</kbd>`;
    $('emergency').dataset.active = String(state.emergency);
    $('emergency').setAttribute('aria-pressed', String(state.emergency));
  }
}
function toggleDoors() {
  if (!state.started || state.done || state.doorsClosing) return;
  if (!state.doorsOpen && (Math.abs(state.speed) >= 0.2 || !platformDoorAligned())) {
    controlMessage('Stop alongside a station platform to open the doors.');
    return;
  }
  changeDrive((next) => {
    next.doorsClosing = next.doorsOpen;
    next.doorsOpen = !next.doorsOpen;
    next.autopilot = false;
    next.power = 0;
    next.brake = 1;
  });
  $('autopilot').textContent = 'Auto drive';
  controlMessage(
    state.doorsOpen
      ? 'Platform doors open. Passengers may board.'
      : 'Doors closing. Power returns when they are shut.',
  );
}
function toggleEmergency() {
  if (!state.started || state.done) return;
  if (state.emergency && Math.abs(state.speed) >= 0.2) {
    controlMessage('Emergency brake stays applied until the train stops.');
    return;
  }
  changeDrive((next) => {
    next.emergency = !next.emergency;
    next.autopilot = false;
    next.power = 0;
    next.brake = 1;
  });
  $('autopilot').textContent = 'Auto drive';
  controlMessage(
    state.emergency
      ? 'Emergency brake applied.'
      : 'Emergency released. Service brake remains applied.',
  );
}
function toggleHUD() {
  gameStore.setPreferences({ hudVisible: !gameStore.getState().preferences.hudVisible });
}
$('doors').onclick = toggleDoors;
$('emergency').onclick = toggleEmergency;
$('hide-hud').onclick = toggleHUD;
$('restore-hud').onclick = toggleHUD;
function selectCamera(value) {
  gameStore.setPreferences({ view: value });
  if (view === 'scenic') controlMessage('Drag to look around the train. Scroll to zoom.');
  if (['cab', 'passenger'].includes(view)) controlMessage('Drag to look around inside the train.');
  if (view === 'director')
    controlMessage(
      'Director: the camera cuts between shots on its own. Pick another view to take over.',
    );
  updateCamera(1, true);
}
$('camera-view').onchange = () => selectCamera($('camera-view').value);
const daylight = document.createElement('button');
daylight.textContent = 'Dusk';
daylight.id = 'daylight';
daylight.onclick = () => {
  gameStore.setPreferences({ dusk: !dusk });
  daylight.textContent = dusk ? 'Daylight' : 'Dusk';
  atmosphere.setDusk(dusk);
  document.querySelector('.tag').textContent = dusk ? 'BLUE HOUR · 18:24' : 'AFTERNOON · 16:42';
};
document.querySelector('.top-actions').prepend(daylight);
const sunPhaseControl = document.createElement('select');
sunPhaseControl.id = 'sun-phase';
sunPhaseControl.setAttribute('aria-label', 'Time of day');
for (const [value, phase] of Object.entries(SUN_PHASES)) {
  const option = document.createElement('option');
  option.value = value;
  option.textContent = phase.label;
  sunPhaseControl.append(option);
}
sunPhaseControl.onchange = () => {
  const value = sunPhaseControl.value;
  gameStore.setPreferences({
    dusk: value === 'dusk',
    sunPhase: value === 'dusk' ? 'daylight' : value,
  });
};
daylight.hidden = true;
daylight.after(sunPhaseControl);
$('weather').onchange = () => {
  gameStore.setPreferences({ weather: $('weather').value });
  atmosphere.setWeather(weather);
};

const onNarrationState = (event) => {
  narrationPlaying = Boolean(event.detail?.playing);
};
window.addEventListener('maple:narration-state', onNarrationState);
if (import.meta.hot)
  import.meta.hot.dispose(() =>
    window.removeEventListener('maple:narration-state', onNarrationState),
  );

const soundCredits = document.createElement('a');
soundCredits.href = './audio/credits.html';
soundCredits.target = '_blank';
soundCredits.rel = 'noopener';
soundCredits.textContent = 'Sound credits';
soundCredits.className = 'sound-credits';
document.querySelector('.top-actions').append(soundCredits);

async function setSound(enabled) {
  const button = $('sound');
  if (button.disabled) return;
  button.disabled = true;
  button.textContent = enabled ? 'Starting sound…' : 'Sound off';
  try {
    if (enabled && !audioCtx) {
      audioCtx = new AudioContext();
      soundscape = createSoundscape(audioCtx);
      crossingBell = createCrossingBell(audioCtx);
    }
    if (enabled) await audioCtx.resume();
    gameStore.setPreferences({ sound: enabled });
    if (enabled) void soundscape.loadRecordings();
  } catch {
    gameStore.setPreferences({ sound: false });
    controlMessage('Sound could not start. Tap Sound to try again.');
  } finally {
    syncSoundControls();
    button.disabled = false;
  }
}
function syncSoundControls() {
  const button = $('sound');
  button.textContent = sound ? 'Sound on' : 'Sound off';
  button.setAttribute('aria-label', sound ? 'Disable sound' : 'Enable sound');
  button.setAttribute('aria-pressed', String(sound));
  button.title = sound && !audioCtx ? 'Sound starts when you begin your ride.' : '';
  $('start-with-sound').checked = sound;
}
syncSoundControls();
$('sound').onclick = () => void setSound(!sound);
$('start-with-sound').onchange = () => void setSound($('start-with-sound').checked);
$('sound-volume').value = gameStore.getState().preferences.soundVolume * 100;
$('sound-volume-value').textContent = `${$('sound-volume').value}%`;
$('sound-volume').oninput = () => {
  gameStore.setPreferences({ soundVolume: Number($('sound-volume').value) / 100 });
  $('sound-volume-value').textContent = `${$('sound-volume').value}%`;
};
if (import.meta.hot)
  import.meta.hot.dispose(() => {
    soundscape?.dispose();
    crossingBell?.dispose();
    void audioCtx?.close();
  });
window.addEventListener('keydown', (e) => {
  const beat = storyHost?.engine.getState().activeBeat;
  const action = drivingAction(e, {
    menuOpen: !!document.querySelector('dialog[open], [popover]:popover-open'),
    dialogue: !!beat && beat.delivery !== 'rolling',
  });
  if (!action) return;
  e.preventDefault();
  if (action === 'power') setController(driveNotch(state) + 1);
  if (action === 'brake') setController(driveNotch(state) - 1);
  if (action === 'coast') setController(0);
  if (action === 'pause') pause();
  if (action === 'restart') reset();
  if (action === 'doors') toggleDoors();
  if (action === 'emergency') toggleEmergency();
  if (action === 'hud') toggleHUD();
  if (action === 'camera') {
    const views = ['scenic', 'follow', 'cab', 'passenger', 'vista', 'director'];
    selectCamera(views[(views.indexOf(view) + 1) % views.length]);
  }
});
document.addEventListener('visibilitychange', () => {
  if (document.hidden && state.started && !state.paused && !state.done) pause();
});
const cameraRig = createCameraRig({
  THREE,
  camera,
  track,
  trackLength,
  terrain,
  center,
  domElement: renderer.domElement,
  colliders: station.children,
  cameraObstacles: () => extendedWorld.cameraObstacles(),
  vistaAt: (z) => lakeVista(z, center, routeElevation),
  foliageHeight: (x, z) => Math.max(activeCanopy.heightAt(x, z), extendedWorld.foliageHeight(x, z)),
});
const filmDirector = createDirector({
  THREE,
  camera,
  track,
  getTrackLength: () => track.getLength?.() ?? trackLength,
  groundAt: (x, z) => terrain(x - center(z), z),
  canopyAt: (x, z) => Math.max(activeCanopy.heightAt(x, z), extendedWorld.foliageHeight(x, z)),
  resolveSubject(subject) {
    if (subject.person) {
      const person = worldDetails
        .getPopulationState()
        .people.find((item) => item.id === subject.person && item.visible);
      if (person) return [person.position.x, person.position.y, person.position.z];
      return mindStandingPoint(subject.person);
    }
    if (subject.stop) {
      const stop = routeStops.find((item) => item.id === subject.stop);
      return stop
        ? railPoint(stop.z)
            .add(new THREE.Vector3(0, 1.5, 0))
            .toArray()
        : null;
    }
    return null;
  },
  onSet(set) {
    if (set.location !== undefined) {
      const z =
        typeof set.location === 'number'
          ? set.location
          : (routeStops.find((stop) => stop.id === set.location)?.z ??
            directorLocations[set.location]);
      if (Number.isFinite(z)) jumpTo(z);
    }
    if (set.weather && set.weather !== weather) {
      $('weather').value = set.weather;
      $('weather').dispatchEvent(new Event('change'));
    }
    if (set.timeOfDay)
      gameStore.setPreferences({
        dusk: set.timeOfDay === 'dusk',
        sunPhase: set.timeOfDay === 'dusk' ? 'daylight' : set.timeOfDay,
      });
    if (set.speedKmh !== undefined)
      changeDrive((next) => {
        next.speed = set.speedKmh / 3.6;
      });
  },
  onCaption: (caption) => filmCaptions.show(caption),
  obstructed(from, to) {
    directorRay.set(from, directorDirection.subVectors(to, from).normalize());
    directorRay.far = Math.max(0.2, from.distanceTo(to) - 0.8);
    return directorRay.intersectObjects(shotObstacles(to), false).length > 0;
  },
});
/** Where a character tracked by the minds stands: platform or ground height plus the body lift. */
function mindStandingPoint(id) {
  const place = minds.positionOf(id);
  if (!place?.visible) return null;
  const base = place.platform ? railPoint(place.z).y : terrain(place.x - center(place.z), place.z);
  return [place.x, base + 0.62, place.z];
}
// Buildings, shelters and benches near a shot's subject. Terrain and instanced trees are
// handled by the height checks; the list is rebuilt only when the subject moves along the line.
let obstacleCache = { z: NaN, meshes: [] };
function shotObstacles(point) {
  if (Math.abs(point.z - obstacleCache.z) < 20) return obstacleCache.meshes;
  const meshes = [];
  const sphere = new THREE.Sphere();
  const collect = (object) =>
    object.traverseVisible((node) => {
      // Small instanced batches (benches, shelters, people) block a view; forests do not.
      if (!node.isMesh || node.name === 'Mountain and valley terrain') return;
      if (node.isInstancedMesh && node.count > 300) return;
      if (node.isInstancedMesh) {
        if (!node.boundingSphere) node.computeBoundingSphere();
        sphere.copy(node.boundingSphere).applyMatrix4(node.matrixWorld);
      } else {
        if (!node.geometry.boundingSphere) node.geometry.computeBoundingSphere();
        sphere.copy(node.geometry.boundingSphere).applyMatrix4(node.matrixWorld);
      }
      if (sphere.center.distanceTo(point) < sphere.radius + 40) meshes.push(node);
    });
  collect(station);
  const regional = scene.getObjectByName('Regional railway / streamed countryside');
  if (regional && point.z > 700) collect(regional);
  obstacleCache = { z: point.z, meshes };
  return meshes;
}
const directorRay = new THREE.Raycaster();
const directorDirection = new THREE.Vector3();
const directorLocations = {
  gorge: -520,
  terraces: -380,
  village: -195,
  shrine: 95,
  station: 490,
  city: 675,
  tokyo: landmarks.tokyoZ,
  bridge: landmarks.bridgeZ,
  tunnel: (landmarks.tunnelStartZ + landmarks.tunnelEndZ) / 2,
  summit: landmarks.summitZ,
};
// Short dramas: episodes are data played through the director, captions, minds and drive.
let episodeStopDistance = null;
const ensureAutoDrive = () => {
  if (!state.autopilot && !state.doorsOpen && !state.doorsClosing && !state.emergency)
    $('autopilot').click();
};
/** Place, weather and time of day from an episode scene or a place link. */
function applySceneSettings(set) {
  if (set.location !== undefined) {
    const base =
      routeStops.find((stop) => stop.id === set.location)?.z ?? directorLocations[set.location];
    if (Number.isFinite(base)) jumpTo(base + (set.offset ?? 0));
  }
  if (set.weather && set.weather !== weather) {
    $('weather').value = set.weather;
    $('weather').dispatchEvent(new Event('change'));
  }
  if (set.timeOfDay)
    gameStore.setPreferences({
      dusk: set.timeOfDay === 'dusk',
      sunPhase: set.timeOfDay === 'dusk' ? 'daylight' : set.timeOfDay,
    });
}
const episodeRunner = createEpisodeRunner(
  {
    setScene(set) {
      applySceneSettings(set);
      if (set.speedKmh !== undefined)
        changeDrive((next) => {
          next.speed = set.speedKmh / 3.6;
        });
      ensureAutoDrive();
    },
    setStop(id) {
      episodeStopDistance = routeStops.find((stop) => stop.id === id)?.distance ?? null;
      if (id === null && episodeRunner.playing) ensureAutoDrive();
    },
    cut: (shot) => filmDirector.cut(shot),
    say(line) {
      if (line.entity) heroCasts.find((hero) => hero.personId === line.entity)?.talk(line.seconds);
      filmCaptions.show({ kind: 'dialogue', ...line });
    },
    card: (caption) => filmCaptions.show(caption),
    direct: (entity, note) => minds.setDirective(entity, note),
    event: (type) => minds.observe({ type }),
    weather(value) {
      $('weather').value = value;
      $('weather').dispatchEvent(new Event('change'));
    },
    doors(action) {
      if ((action === 'open') === state.doorsOpen) return true;
      toggleDoors();
      return (action === 'open') === state.doorsOpen;
    },
    // At rest, below the 0.2 m/s door interlock, so a door cue after arrival is accepted.
    isStopped: () => Math.abs(state.speed) < 0.05,
    doorsClosed: () => !state.doorsOpen && !state.doorsClosing,
    resolve(subject) {
      if (subject.crossing) {
        const crossing = levelCrossings
          .getState()
          .crossings.find((item) => item.id === subject.crossing);
        return crossing ? { point: crossing.position } : null;
      }
      const person = worldDetails
        .getPopulationState()
        .people.find((item) => item.id === subject.entity);
      if (person) return person.visible ? { person: person.id } : null;
      // Regional residents are tracked live through the minds, so walking actors stay in frame.
      return mindStandingPoint(subject.entity) ? { person: subject.entity } : null;
    },
    // Offer the end panel once the closing card has had its moment.
    ended: () =>
      setTimeout(() => {
        if (episodeRunner.getState().status === 'ended') showEpisodeEnd();
      }, 5200),
  },
  {
    stops: routeStops.map((stop) => stop.id),
    crossings: levelCrossings.getState().crossings.map((item) => item.id),
  },
);
const episodeLibrary = createEpisodeLibrary(embedded ? null : globalThis.localStorage);
const validateEpisode = (data) =>
  normalizeEpisode(data, {
    stops: routeStops.map((stop) => stop.id),
    crossings: levelCrossings.getState().crossings.map((item) => item.id),
  });
// Custom episodes travel in the link itself everywhere; the Signal edition can also keep
// them in its site store for a short ?watch= link. Everything loaded is validated again.
const episodeSharing = createEpisodeSharing({
  stores: [
    document.documentElement.dataset.hosting === 'signal' ? createSignalEpisodeStore() : null,
    createUrlEpisodeStore(),
  ],
  validate: validateEpisode,
});
const episodeHeading = (episode) =>
  [episode.series, episode.title].filter(Boolean).join(' · ') || episode.title;
async function episodeLinkFor(episode) {
  const clean = validateEpisode(episode);
  const builtIn = THE_1742.episodes.find((item) => item.id === clean.id);
  const link =
    builtIn && JSON.stringify(validateEpisode(builtIn)) === JSON.stringify(clean)
      ? { kind: 'episode', id: clean.id }
      : await episodeSharing.save(clean);
  return { url: buildDeepLink(location.href, link), via: link.kind };
}
function watchEpisode(source) {
  if (!state.started) start();
  if (state.paused) pause();
  if (view !== 'director') selectCamera('director');
  const result = episodeRunner.play(source);
  episodeHandoff?.showPlaying({ title: episodeHeading(episodeRunner.current()) });
  return result;
}
function showEpisodeEnd({ skipped = false } = {}) {
  const episode = episodeRunner.current();
  if (episode) episodeHandoff?.showEnded({ title: episodeHeading(episode), skipped });
}
/** The viewer takes over where the episode left the train: same place, still running. */
function handOffToPlayer() {
  if (episodeRunner.playing) episodeRunner.stop();
  episodeHandoff?.hide();
  filmCaptions.hide();
  if (view === 'director') selectCamera('follow');
  if (state.paused) pause();
  ensureAutoDrive();
  const stop = nearestUpcomingStop();
  episodeHandoff?.toast(
    `Your turn${stop ? `. Next stop: ${stop.name}` : ''}. Press W or S (or move the lever) to drive yourself, D for the doors, C to change the camera.`,
    { seconds: 10 },
  );
}
async function shareCurrentEpisode() {
  const episode = episodeRunner.current();
  if (!episode || !episodeHandoff) return;
  episodeHandoff.shareBusy(true);
  try {
    const { url } = await episodeLinkFor(episode);
    const result = await shareLink({
      url,
      title: `Maple Line · ${episode.title}`,
      text: episode.logline ?? 'A short drama on the Maple Line.',
    });
    episodeHandoff.shareStatus(result, url);
  } catch (error) {
    episodeHandoff.shareStatus('error', error.message);
  } finally {
    episodeHandoff.shareBusy(false);
  }
}
const episodeHandoff = embedded
  ? null
  : mountEpisodeHandoff({
      actions: {
        skip() {
          episodeRunner.stop();
          filmCaptions.hide();
          showEpisodeEnd({ skipped: true });
        },
        takeControls: handOffToPlayer,
        drive: handOffToPlayer,
        watchAgain() {
          const episode = episodeRunner.current();
          if (!episode) return;
          try {
            watchEpisode(episode);
          } catch (error) {
            controlMessage(error.message);
          }
        },
        share: () => void shareCurrentEpisode(),
      },
    });
function updateCamera(dt, snap = false) {
  storyCinematics?.restoreBaseCamera();
  cameraRig.update({
    dt,
    distance: state.distance,
    direction: state.direction,
    // The director overlays its own pose; the rig keeps a valid follow pose beneath it.
    view: view === 'director' ? 'follow' : view,
    snap,
    focusPose: embedded ? embedVisuals?.focusPose() : null,
    inTunnel: isTunnel(
      track.getPointAt(THREE.MathUtils.clamp(state.distance / trackLength, 0, 1)).z,
    ),
  });
  const position = track.getPointAt(
    THREE.MathUtils.clamp(state.distance / trackLength, 0.001, 0.995),
  );
  stableSunShadow.setOffset(
    SUN_PHASES[dusk ? 'dusk' : gameStore.getState().preferences.sunPhase].offset,
  );
  stableSunShadow.apply(sun, position, renderer.shadowMap);
  document.body.classList.toggle('film-mode', Boolean(filmDirector.getState().active));
  directorLook = filmDirector.update({
    dt,
    enabled: view === 'director' && !storyHost?.engine.getState().activeBeat,
    distance: state.distance,
    direction: state.direction,
    speed: state.speed,
    inTunnel: isTunnel(position.z),
    ...directorContext(),
  });
}
let directorLook = null;
const sunDirection = new THREE.Vector3();
/** Filmable places near the train: stop, bridge, tunnel portal and the current place card. */
function directorContext() {
  const ahead = (distance) => (distance - state.distance) * state.direction;
  const stop = routeStops.reduce(
    (best, candidate) =>
      Math.abs(ahead(candidate.distance)) < Math.abs(ahead(best?.distance ?? Infinity))
        ? candidate
        : best,
    null,
  );
  const stopNear = stop && Math.abs(ahead(stop.distance)) < 260 ? stop : null;
  const bridgeDistance = distanceAtZ(track, trackLength, landmarks.bridgeZ);
  const portalDistance = distanceAtZ(
    track,
    trackLength,
    state.direction > 0 ? landmarks.tunnelStartZ : landmarks.tunnelEndZ,
  );
  // Episodes write their own place cards; the automatic ones would talk over them.
  const placeStop =
    !episodeRunner.playing && stop && ahead(stop.distance) < 520 && ahead(stop.distance) > -120
      ? stop
      : null;
  const clock = dusk ? '18:24' : '16:42';
  return {
    stop: stopNear ? { id: stopNear.id, distance: stopNear.distance } : null,
    bridge: Math.abs(ahead(bridgeDistance)) < 600 ? { distance: bridgeDistance } : null,
    tunnelAhead:
      ahead(portalDistance) > 0 && ahead(portalDistance) < 600
        ? { distance: ahead(portalDistance) }
        : null,
    place: placeStop
      ? {
          id: placeStop.id,
          title: placeStop.name,
          native: placeStop.japanese,
          subtitle: `${placeStop.theme} · ${clock}`,
          line: PLACE_LINES[placeStop.id] ?? null,
        }
      : null,
  };
}
function finish(success) {
  setDrive(0, 1);
  changeDrive((next) => {
    next.done = true;
  });
  $('result').hidden = false;
  $('result-title').textContent = success ? 'Welcome to Momiji.' : 'A little past the platform.';
  const error = Math.abs(stopDistance - state.distance);
  $('result-body').textContent = success
    ? `Stopped ${error.toFixed(1)} m from the marker in ${Math.round(state.elapsed)} seconds. ${state.penalty < 2 ? 'You kept within the speed limit.' : 'Try the next journey with less time above the speed limit.'}`
    : 'Brake earlier on the approach. At 60 km/h, allow roughly 160 m for a comfortable stop.';
}
const tripStats = document.createElement('p');
tripStats.className = 'trip-stats';
document.querySelector('.journey').append(tripStats);
function updateHUD() {
  const position = track.getPointAt(THREE.MathUtils.clamp(state.distance / trackLength, 0, 1));
  const upcoming = nearestUpcomingStop();
  const remaining =
    ((mode === 'challenge' ? stopDistance : (upcoming?.distance ?? trackLength)) - state.distance) *
    state.direction;
  const closest = routeStops.reduce(
    (best, stop) => (Math.abs(stop.z - position.z) < Math.abs(best.z - position.z) ? stop : best),
    routeStops[0],
  );
  const region =
    position.z > 790
      ? `${closest.name} · ${closest.theme}`
      : position.z < -470
        ? 'The autumn gorge'
        : position.z < -285
          ? 'The rice terraces'
          : position.z < -85
            ? 'Yuzuki village'
            : position.z < 185
              ? 'The cedar shrine'
              : position.z < 600
                ? 'Momiji riverside'
                : 'The city beyond';
  document.querySelector('.journey h2').textContent = isTunnel(position.z)
    ? 'Inside Ishikura Mountain'
    : position.z >= TOKYO_PASSAGE.start && position.z <= TOKYO_PASSAGE.end
      ? 'Tokyo neon passage'
      : region;
  document.querySelector('.journey>.eyebrow').textContent =
    mode === 'explore' ? 'REGIONAL RAILWAY / 15 STOPS' : 'LOCAL SERVICE / 03';
  document.querySelector('.destination small').textContent = 'NEXT STOP';
  document.querySelector('.destination strong').textContent =
    mode === 'challenge' ? 'Momiji Station' : (upcoming?.name ?? 'End of the line');
  $('speed').textContent = Math.round(state.speed * 3.6);
  const localLimit = Math.min(
    operatingEnvelope(position.z).limitKmh,
    routeChoice?.getState().limitKmh ?? Infinity,
  );
  document.querySelector('.limit b').textContent = localLimit;
  const overspeed = state.speed * 3.6 > localLimit + 0.5;
  $('speedometer').classList.toggle('is-overspeed', overspeed);
  $('overspeed-cue').hidden = !overspeed;
  $('speed-limit-marker').setAttribute('transform', `rotate(${(localLimit / 160) * 180} 50 50)`);
  $('speed-dial-fill').style.strokeDashoffset =
    100 - THREE.MathUtils.clamp(((state.speed * 3.6) / 160) * 100, 0, 100);
  $('distance').textContent =
    Math.abs(remaining) > 1000
      ? `${(Math.abs(remaining) / 1000).toFixed(1)} km`
      : `${Math.round(Math.abs(remaining))} m`;
  $('progress').style.width =
    `${THREE.MathUtils.clamp((state.distance / trackLength) * 100, 0, 100)}%`;
  const braking = state.brake > 0;
  $('drive-state').textContent = state.emergency
    ? 'EMERGENCY'
    : state.doorsOpen
      ? 'DOORS OPEN'
      : state.autopilot
        ? 'AUTO DRIVE'
        : braking
          ? 'BRAKING'
          : state.power > 0
            ? 'POWER'
            : 'COASTING';
  const applied = Math.round(
    (state.actualBrake > 0.02 ? state.actualBrake : state.actualPower) * 100,
  );
  $('power-value').textContent = `${applied}% applied`;
  $('power-bar').style.width = `${applied}%`;
  $('power-bar').style.background = state.actualBrake > 0.02 ? '#e49572' : '#ecc879';
  const tangent = track.getTangentAt(THREE.MathUtils.clamp(state.distance / trackLength, 0, 1));
  const grade = (tangent.y / Math.hypot(tangent.x, tangent.z)) * 100 * state.direction;
  const notch = driveNotch(state);
  $('drive-notch').textContent = state.emergency ? 'Emergency' : notchLabel(notch);
  $('drive-lever').value = notch;
  $('drive-lever').setAttribute('aria-valuetext', notchLabel(notch));
  const feedback = drivingFeedback(state, { grade: grade / 100, weather: weatherAt(position) });
  $('motion-feedback').textContent = feedback.motion;
  $('stopping-guide').textContent =
    feedback.stoppingMetres === null
      ? 'Five power notches · coast · five brake notches'
      : `Full brake estimate ~${feedback.stoppingMetres} m · allow extra room`;
  tripStats.textContent = `${state.visitedStops.length}/${routeStops.length} stops visited · ${Math.round(position.y)} m elevation · ${grade >= 0 ? '+' : ''}${grade.toFixed(1)}% grade`;
  $('instruction').textContent = state.paused
    ? 'Paused. Take in the view.'
    : state.doorsOpen
      ? 'Passengers may board. Close the doors before departure.'
      : mode === 'challenge'
        ? remaining < 18 && state.speed < 0.5
          ? 'Stop here to finish the journey.'
          : remaining < 230
            ? 'Station ahead. Ease off and brake.'
            : 'Follow the river. Find your rhythm.'
        : remaining < 230 && remaining >= -12
          ? 'Station ahead. Stop for two seconds to record a visit; D opens doors.'
          : state.autopilot
            ? 'Scenic auto-drive. Brake manually to stop at a station.'
            : 'Follow the line through the mountains. Stop and explore each station.';
}
$('mode').onchange = () => {
  gameStore.setPreferences({ mode: $('mode').value });
  reset();
};
$('autopilot').onclick = () => {
  if (state.doorsOpen || state.doorsClosing) {
    controlMessage('Wait until the doors are closed before starting Auto drive.');
    return;
  }
  if (state.emergency) {
    controlMessage('Press E after stopping to release the emergency brake.');
    return;
  }
  if (!state.started) start();
  if (state.done) reset();
  if (mode !== 'explore') {
    gameStore.setPreferences({ mode: 'explore' });
    $('mode').value = 'explore';
    reset();
  }
  changeDrive((next) => {
    next.autopilot = !next.autopilot;
  });
  $('autopilot').textContent = state.autopilot ? 'Manual drive' : 'Auto drive';
};
function jumpTo(z) {
  if (updateStationDuties().active) {
    controlMessage('Finish the station duties, or leave Haru’s story before changing location.');
    return false;
  }
  routeChoice?.invalidateTraversal();
  const visitedStops = [...state.visitedStops];
  gameStore.setPreferences({ mode: 'explore' });
  $('mode').value = 'explore';
  const distance = distanceAtZ(track, trackLength, z);
  // A jump still takes network time: the trip at the Maple Line's 120 km/h limit.
  // Otherwise missions and connections could be finished with the clock standing still.
  if (state.started) railNetwork.tick(Math.abs(distance - state.distance) / (120 / 3.6) / 60);
  reset({ preserveRoute: true });
  changeDrive((next) => {
    next.distance = distance;
    next.visitedStops = visitedStops;
  });
  setDrive(0, 0);
  if (!gameStore.getState().preferences.manualControls)
    changeDrive((next) => {
      next.autopilot = true;
    });
  extendedWorld.update(0, {
    position: track.getPointAt(state.distance / trackLength),
    weather,
    dusk,
  });
  updateCamera(1, true);
}
$('location').onchange = () => {
  if ($('location').value !== '') {
    const z = Number($('location').value);
    if (jumpTo(z) !== false && [4660, 14360].includes(z)) selectCamera('vista');
  }
};

const nextPaint = () =>
  new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
const worldBuilder = createWorldBuilder({
  offline: document.documentElement.dataset.hosting === 'static',
  fetcher: document.documentElement.dataset.hosting === 'signal' ? fetchShipWorld : fetchDirector,
  timeoutMs: document.documentElement.dataset.hosting === 'signal' ? 45000 : 20000,
  onBuildError: (error) => {
    if (import.meta.env.DEV) console.error('World build failed:', error);
  },
  getState: () => gameStore.getState().worldBuilder,
  update: (patch) => gameStore.updateWorldBuilder(patch),
  async prepareWorld(plan) {
    await nextPaint();
    const next = createProceduralWorld({
      plan,
      center,
      terrain,
      railU,
      riverBedHeight,
      riverProfile,
      snowCoverage,
    });
    try {
      await renderer.compileAsync(next.root, camera, scene);
    } catch (error) {
      next.dispose();
      throw error;
    }
    return {
      dispose: () => next.dispose(),
      activate() {
        const previous = generatedWorld;
        const previousDetails = worldDetails;
        const previousCanopy = activeCanopy;
        const previousPreferences = { weather, dusk };
        try {
          scene.add(next.root);
          generatedWorld = next;
          worldDetails = next.details;
          activeCanopy = next.canopy;
          gameStore.setPreferences({ weather: plan.weather, dusk: plan.time === 'dusk' });
          $('weather').value = weather;
          atmosphere.setWeather(weather);
          atmosphere.setDusk(dusk);
          daylight.textContent = dusk ? 'Daylight' : 'Dusk';
          document.querySelector('.tag').textContent = dusk
            ? 'BLUE HOUR · 18:24'
            : 'AFTERNOON · 16:42';
          updateCamera(1, true);
        } catch (error) {
          scene.remove(next.root);
          generatedWorld = previous;
          worldDetails = previousDetails;
          activeCanopy = previousCanopy;
          gameStore.setPreferences(previousPreferences);
          $('weather').value = previousPreferences.weather;
          atmosphere.setWeather(previousPreferences.weather);
          atmosphere.setDusk(previousPreferences.dusk);
          daylight.textContent = previousPreferences.dusk ? 'Daylight' : 'Dusk';
          document.querySelector('.tag').textContent = previousPreferences.dusk
            ? 'BLUE HOUR · 18:24'
            : 'AFTERNOON · 16:42';
          throw error;
        }
        gameStore.updateDirector({ decidedAt: 0 });
        if (previous) previous.dispose();
        else previousDetails.dispose();
      },
    };
  },
});
const unsubscribeWorldPanel = installWorldBuilderPanel({
  store: gameStore,
  builder: worldBuilder,
  onExplore: (plan) => {
    storyHost?.engine.suspend();
    jumpTo(plan.settlement === 'city' ? 675 : -195);
    controlMessage('Your world is active. Enjoy the view.');
  },
});
if (import.meta.hot)
  import.meta.hot.dispose(() => {
    worldBuilder.dispose();
    unsubscribeWorldPanel();
    generatedWorld?.dispose();
  });

const rainImpacts = createRainImpacts({
  scene,
  heightAt: (x, z) => Math.max(-0.37, terrain(x - center(z), z)),
});
const eveningMotes = createEveningMotes({
  scene,
  renderer,
  center,
  terrain,
  railU,
  riverBedHeight,
});
const selectedRailPoint = (z) => {
  const point = railPoint(z);
  if (track.getState().selectedRoute === 'wetland') point.x += branchOffsetAtZ(z);
  return point;
};
const powerFlow = createPowerFlow({ scene, railPoint: selectedRailPoint, cars: train });
if (import.meta.hot)
  import.meta.hot.dispose(() => {
    eveningMotes.dispose();
    powerFlow.dispose();
    surfaceDetail.dispose();
    rainImpacts.dispose();
  });
let last = performance.now(),
  missionChipRenderedAt = 0,
  hold = 0;
document.addEventListener('visibilitychange', () => {
  last = performance.now();
});
let reflectionElapsed = 1,
  mindsStop = null,
  mindsStopAge = 0;
function frame(now) {
  requestAnimationFrame(frame);
  if (embedded && (embedSuspended || document.hidden)) {
    last = now;
    return;
  }
  const cpuStart = performance.now();
  const intervalMs = now - last;
  renderer.info.reset();
  // The first RAF timestamp can precede setup completion in a busy frame.
  const presentationDt = Math.max(0, (now - last) / 1000);
  const realDt = Math.min(presentationDt, 0.05);
  last = now;
  const menuOpen = Boolean(document.querySelector('dialog[open]'));
  gameStore.updatePresentation({ menuOpen });
  // Hold simulation time without changing a player's pause choice or story stop.
  // Keep sampling real time so closing a dialog never catches up missed simulation.
  const dt = menuOpen ? 0 : realDt;
  const opening = openingSequence.update(presentationDt, {
    started: state.started,
    suspended: menuOpen || document.hidden,
  });
  const frameT = THREE.MathUtils.clamp(state.distance / trackLength, 0, 1);
  const routePosition = track.getPointAt(frameT),
    routeTangent = track.getTangentAt(frameT);
  const grade = routeTangent.y / Math.max(0.001, Math.hypot(routeTangent.x, routeTangent.z));
  const localWeather = opening.active ? opening.weather : weatherAt(routePosition);
  const operation = operatingEnvelope(routePosition.z, {
    direction: state.direction,
    weather: localWeather,
    grade,
  });
  storyHost?.update({
    z: routePosition.z,
    speed: state.speed,
    paused: state.paused || menuOpen,
    started: state.started,
  });
  railwayPoints?.update({
    dt: document.hidden || state.paused ? 0 : dt,
    dutyState: stationDuties.getState(),
    trainZ: routePosition.z,
    trainSpeed: state.speed,
    passingState: passingLoop?.getState(),
  });
  const dutyState = updateStationDuties(document.hidden ? 0 : dt);
  const routeState = routeChoice.getState();
  const routeStop = mode === 'explore' ? routeChoice.stopDistance() : undefined;
  wetlandRoute.update({
    selectedRoute: routeState.selectedRoute,
    trainZ: routePosition.z,
    position: routePosition,
    confirmed: routeState.confirmed,
  });
  routePanel?.update();
  if (dutyState.active && (state.speed !== 0 || state.autopilot || state.power !== 0)) {
    changeDrive((drive) => {
      drive.speed = 0;
      drive.power = 0;
      drive.actualPower = 0;
      drive.brake = 1;
      drive.autopilot = false;
    });
  }
  passingLoop?.update({
    dt,
    active: dutyState.active || dutyState.completed,
    progress: dutyState.passingProgress,
    canDepart: dutyState.active ? dutyState.canDepart : railwayPoints.getState().mainAligned,
  });
  if (atmosphere.weather !== localWeather) atmosphere.setWeather(localWeather);
  regionalTraffic.update(state.started && !state.paused && !menuOpen ? dt : 0, {
    position: routePosition,
  });
  extendedWorld.update(state.paused ? 0 : dt, {
    minds,
    position: routePosition,
    distance: state.distance,
    weather: localWeather,
    dusk,
    doorsOpen: state.doorsOpen,
    speed: state.speed,
  });
  if (state.started && !state.paused && !menuOpen && !state.done && !dutyState.active) {
    let reversed = false;
    changeDrive((next) => {
      const previousDistance = next.distance;
      if (mode === 'explore') {
        reversed = updateJourney(next, dt, {
          trackLength,
          stationDistance: stopDistance,
          weather: localWeather,
          grade,
          cruiseSpeedKmh: Math.min(
            operation.autopilotKmh,
            routeState.limitKmh ?? Infinity,
            storyHost?.engine.getState().enabled
              ? 100
              : directorCruiseSpeed(activeDirectorDecision()?.pace),
          ),
          speedLimitKmh: Math.min(operation.limitKmh, routeState.limitKmh ?? Infinity),
          scheduledStopDistance: nearestScheduledStop(
            next.distance,
            next.direction,
            storyHost?.scheduledStopDistance(),
            episodeStopDistance,
            routeStop,
          ),
        }).reversed;
      } else
        advanceDrive(next, dt, {
          weather: localWeather,
          grade: grade * next.direction,
          speedLimitKmh: operation.limitKmh,
        });
      protectRouteStop(next, previousDistance, routeStop);
      routeChoice.recordMovement({
        previousDistance,
        distance: next.distance,
        direction: next.direction,
        dt,
      });
      recordStationVisit(next, dt, routeStops);
    });
    if (reversed) updateCamera(1, true);
    if (mode === 'challenge') {
      const outcome = stationOutcome(state, stopDistance);
      hold = outcome === 'stopped' ? hold + dt : 0;
      if (hold > 1.3) finish(true);
      else if (outcome === 'missed') finish(false);
    }
  }

  for (let i = 0; i < train.length; i++) {
    const t = THREE.MathUtils.clamp(
      (state.distance - state.direction * i * CAR_SPACING) / trackLength,
      0,
      1,
    );
    train[i].position.copy(track.getPointAt(t));
    const v = track.getTangentAt(t).multiplyScalar(state.direction);
    train[i].rotation.set(-Math.asin(v.y), Math.atan2(v.x, v.z), 0, 'YXZ');
  }
  const crossingDirection = Math.sign(routeTangent.z * state.direction) || 1;
  const carHalf = CAR_SPACING / 2;
  levelCrossings.update(dt, {
    trainFront: train[0].position.z + crossingDirection * carHalf,
    trainRear: train[train.length - 1].position.z - crossingDirection * carHalf,
    speed: Math.abs(state.speed),
    direction: crossingDirection,
    cameraPosition: camera.position,
    dusk,
    weather: localWeather,
    paused: state.paused || menuOpen,
  });
  if (!state.paused) waterMat.uniforms.time.value += dt * (weather === 'rain' ? 1.8 : 1);
  waterMat.uniforms.distortionScale.value = weather === 'rain' ? 3.1 : 1.6;
  episodeRunner.update(dt);
  characterGrab?.update({ viewportAspect: camera.aspect });
  // One game minute per real minute of riding; dialogs and pause hold the clock.
  const networkDt = state.started && !state.paused ? dt : 0;
  if (networkDt > 0) railNetwork.tick(networkDt / 60);
  missionBoard.update({
    dtSeconds: networkDt,
    gameMinutes: railNetwork.now(),
    distance: state.distance,
    speedMps: state.speed,
    doorsOpen: state.doorsOpen,
    stopAt: missionStopAt,
  });
  networkPanel?.update({ playerDistance: state.distance });
  if (missionChip && now - missionChipRenderedAt > 250) {
    missionChipRenderedAt = now;
    renderMissionChip(missionChip, missionBoard.getState());
  }
  updateCamera(dt);
  storyLevels?.update({
    position: train[0].position,
    storyState: storyEngine.getState(),
    dutiesState: stationDuties.getState(),
  });
  storyCast?.update({
    dt,
    storyState: storyHost?.engine.getState(),
    trainPosition: train[0].position,
    trainSpeed: state.speed,
  });
  storyGuests?.update({
    dt,
    storyState: storyEngine.getState(),
    trainPosition: train[0].position,
    trainSpeed: state.speed,
  });
  const castFrame = storyCast.getState();
  const guestFrame = storyGuests.getState();
  const conversationCast = guestFrame.visible
    ? { ...castFrame, feet: [...castFrame.feet, ...guestFrame.feet] }
    : castFrame;
  const storyVisitor = storyWildlife.update({
    dt,
    storyState: storyEngine.getState(),
    castState: storyCast.getState(),
    season: gameStore.getState().worldBuilder.active?.plan.season ?? 'autumn',
    seed: gameStore.getState().worldBuilder.active?.plan.seed ?? 1,
    weather: localWeather,
    trainSpeed: state.speed,
  });
  storyEngine.setNearbyWildlife(storyVisitor.visible ? storyVisitor : null);
  if (storyCinematics) {
    const task = storyEngine.getState().activeBeat?.task;
    const taskObject =
      task &&
      storyLevels
        .getState()
        .levels.flatMap((level) => level.interactions)
        .find((item) => item.action === task.id);
    const presentation = storyCinematics.update({
      dt,
      storyState: storyEngine.getState(),
      castState: conversationCast,
      wildlifeState: storyVisitor,
      taskFocus: taskObject ? { id: task.id, position: taskObject.position } : null,
      dialogueFraction: storyPanel.getOccupiedHeight() / window.innerHeight,
      trainPosition: train[0].position,
      inTunnel: isTunnel(train[0].position.z),
      trainDirection: state.direction,
    });
    storyPanel.setPresentation?.({
      pending: Boolean(storyEngine.getState().activeBeat) && !presentation.ready,
    });
  }
  openingSequence.applyCamera(train[0].position, train[train.length - 1].position);
  trackSnow.update(dt, { z: camera.position.z, weather });
  const sunPhase = dusk ? 'dusk' : gameStore.getState().preferences.sunPhase;
  atmosphere.setSunPhase(sunPhase);
  sunPhaseControl.value = sunPhase;
  document.querySelector('.tag').textContent = SUN_PHASES[sunPhase].label.toUpperCase();
  atmosphere.update(dt, camera.position);
  skyReflections.update(localWeather, sunPhase);
  eveningMotes.update(dt, {
    position: train[0].position,
    dusk,
    weather: localWeather,
    paused: state.paused,
    inTunnel: isTunnel(routePosition.z),
    season: gameStore.getState().worldBuilder.active?.plan.season ?? 'autumn',
  });
  surfaceDetail.update(dt, localWeather);
  rainImpacts.update(state.paused ? 0 : dt, {
    weather: localWeather,
    position: train[0].position,
    inTunnel: isTunnel(routePosition.z),
  });
  artDirection?.apply();
  wind.update(state.paused && !(embedded && embedVisuals?.focus() === 'forest') ? 0 : dt, {
    weather: localWeather,
  });
  windCues.update(state.paused ? 0 : dt, {
    cameraPosition: camera.position,
    weather: localWeather,
    altitude: routePosition.y,
    inTunnel: isTunnel(routePosition.z),
    region: routePosition.z > 21000 ? 'city' : 'forest',
    windSpeedMps: wind.getState().speedMps,
  });
  wildlife.update(state.paused ? 0 : dt, {
    encounter: storyVisitor,
    opening,
    season: opening.active
      ? opening.season
      : (gameStore.getState().worldBuilder.active?.plan.season ?? 'autumn'),
    cameraPosition: camera.position,
    weather,
    dusk,
    trainPosition: train[0].position,
  });
  snowCoverage.value = THREE.MathUtils.lerp(
    snowCoverage.value,
    opening.active ? opening.snow : weather === 'snow' ? 1 : 0,
    1 - Math.exp(-dt * 0.8),
  );
  worldDetails.update(state.paused ? 0 : dt, {
    weather,
    dusk,
    trainPosition: train[0].position.toArray(),
    speed: state.speed,
    doorsOpen: state.doorsOpen,
    travelDirection: state.direction,
    distance: state.distance,
    elapsed: state.elapsed,
    stationActivity: activeDirectorDecision()?.stationActivity ?? 'commute',
    minds,
  });
  for (const hero of heroCasts) hero.update(state.paused ? 0 : dt, { paused: state.paused });
  mindsStop ??= nearestUpcomingStop();
  mindsStopAge += realDt;
  if (mindsStopAge > 0.5) {
    mindsStop = nearestUpcomingStop();
    mindsStopAge = 0;
  }
  minds.tick(state.paused ? 0 : dt, {
    weather: localWeather,
    dusk,
    region: mindRegion(routePosition.z, additionalStops),
    trainSpeed: state.speed,
    doorsOpen: state.doorsOpen,
    remainingToStation:
      ((mindsStop?.distance ?? state.distance) - state.distance) * state.direction,
    trainPosition: train[0].position,
    cameraPosition: camera.position,
  });
  if (!['interpreting', 'building'].includes(gameStore.getState().worldBuilder.status)) {
    void director.tick();
    void mindsClient.tick();
  }
  generatedWorld?.update(state.paused ? 0 : dt, {
    cameraPosition: camera.position,
    trainPosition: train[0].position,
    weather,
  });
  trainModel.update(state.paused ? 0 : dt, {
    inTunnel: isTunnel(routePosition.z),
    distance: state.distance,
    speed: state.speed,
    direction: state.direction,
    leadCar: 0,
    wheelDirection: 1,
    passengers: worldDetails.getPopulationState().people,
    brake: state.actualBrake,
    weather: localWeather,
    lights: gameStore.getState().preferences.trainLights,
    wipers: gameStore.getState().preferences.trainWipers,
    power: state.actualPower,
    emergency: state.emergency,
    dusk,
    doorsOpen: state.doorsOpen,
  });
  if (state.doorsClosing && trainModel.getDoorState().openFraction === 0) {
    changeDrive((next) => {
      next.doorsClosing = false;
    });
    controlMessage('Doors closed. Ready to depart.');
  }
  powerFlow.update(state.paused ? 0 : dt, {
    power: state.actualPower,
    direction: state.direction,
    enabled: gameStore.getState().preferences.powerFlow,
    emergency: state.emergency,
    doorsOpen: state.doorsOpen,
    doorFraction: trainModel.getDoorState().openFraction,
  });
  flora.update(state.paused ? 0 : dt, { position: camera.position, weather, dusk });
  hudElapsed += realDt;
  if (hudDirty && hudElapsed > 0.08) {
    updateHUD();
    hudDirty = false;
    hudElapsed = 0;
  }
  audioElapsed += realDt;
  if (soundscape && audioElapsed >= 0.04) {
    audioElapsed = 0;
    const listener = camera.position;
    const right = { x: camera.matrixWorld.elements[0], z: camera.matrixWorld.elements[2] };
    const activePlan = gameStore.getState().worldBuilder.active?.plan;
    const sceneSound = sceneSoundContext({
      listener,
      z: routePosition.z,
      season: activePlan?.season ?? 'autumn',
      forest: activePlan?.forest,
      weather: localWeather,
    });
    const riverSource = {
      x: sceneSound.riverSource[0],
      y: sceneSound.riverSource[1],
      z: sceneSound.riverSource[2],
    };
    const separation = (point) =>
      Math.hypot(listener.x - point.x, listener.y - point.y, listener.z - point.z);
    let peopleSource = null,
      peopleDistance = Infinity,
      walkingDistance = Infinity;
    const considerPerson = (point) => {
      const distance = separation(point);
      if (distance < peopleDistance) {
        peopleSource = point;
        peopleDistance = distance;
      }
    };
    // Original-valley voices follow visible residents instead of an empty station marker.
    for (const person of worldDetails.getPopulationState().people) {
      if (person.visible && person.state !== 'onboard') {
        considerPerson(person.position);
        if (person.walking)
          walkingDistance = Math.min(walkingDistance, separation(person.position));
      }
    }
    // Regional platforms have their own small crowds, outside the original population model.
    for (const stop of additionalStops) {
      if (Math.abs(stop.z - listener.z) < 200) {
        const point = railPoint(stop.z);
        considerPerson({ x: point.x + 7, y: point.y + 1.6, z: point.z });
      }
    }
    const activeStoryBeat = storyHost?.engine.getState().activeBeat;
    const storyActive = Boolean(activeStoryBeat);
    soundscape.update({
      enabled: sound,
      volume: gameStore.getState().preferences.soundVolume,
      active:
        state.started &&
        (!state.paused || storyActive) &&
        !menuOpen &&
        !state.done &&
        !document.hidden,
      ambientOnly: storyActive && activeStoryBeat.delivery !== 'rolling',
      narrationPlaying,
      speed: state.speed,
      power: state.actualPower,
      brake: state.actualBrake,
      distance: state.distance,
      direction: state.direction,
      doorsOpen: state.doorsOpen,
      emergency: state.emergency,
      wipersOn: trainModel.getSystemsState().wipersOn,
      weather: localWeather,
      dusk,
      view: view === 'passenger' ? 'cab' : view,
      season: sceneSound.forest.season,
      inTunnel: isTunnel(routePosition.z),
      onBridge: Math.abs(routePosition.z - landmarks.bridgeZ) < landmarks.bridgeSpan / 2,
      trainDistance: separation(train[0].position),
      trainPan: sourcePan(listener, right, train[0].position),
      riverDistance: sceneSound.riverDistance,
      riverIntensity: sceneSound.riverIntensity,
      riverPan: sourcePan(listener, right, riverSource),
      peopleDistance,
      walkingDistance,
      peoplePan: peopleSource ? sourcePan(listener, right, peopleSource) : 0,
      forest: sceneSound.forest.density,
      wind: wind.getState().speedMps,
    });
    const bellSource = levelCrossings.getState().nearestBell;
    crossingBell?.update({
      ringing: Boolean(bellSource),
      distance: bellSource?.distance ?? Infinity,
      pan: bellSource
        ? sourcePan(listener, right, { x: bellSource.position[0], z: bellSource.position[2] })
        : 0,
      // Closed cab and carriage windows muffle the bell.
      volume:
        gameStore.getState().preferences.soundVolume *
        0.75 *
        (['cab', 'passenger'].includes(view) ? 0.35 : 1),
      active: sound && state.started && !state.paused && !menuOpen && !document.hidden,
    });
  }
  for (const chunk of sceneryChunks) {
    chunk.mesh.visible =
      !(generatedWorld && chunk.forest) &&
      Math.abs(chunk.z - camera.position.z) < (embedVisuals?.sceneryDistance() ?? 720);
    chunk.mesh.castShadow = chunk.casts;
  }
  for (const chunk of railChunks) chunk.mesh.visible = Math.abs(chunk.z - camera.position.z) < 1200;
  reflectionElapsed += dt;
  // Train, foliage and light transforms must share the shadow image’s frame.
  renderer.shadowMap.needsUpdate = true;
  riverDetails.update(state.paused ? 0 : dt);
  embedVisuals?.apply(dt);
  riverWater.mesh.visible = camera.position.z < 1400;
  if (riverWater.mesh.visible) {
    riverWater.capture({ refreshReflection: reflectionElapsed >= 0.05 });
    if (reflectionElapsed >= 0.05) reflectionElapsed = 0;
  }
  if (directorLook) filmPipeline.setLook(directorLook);
  else filmPipeline.setLook({ letterbox: forcedLetterbox, dofMaxBlur: 0 });
  filmCaptions.setBar(
    (filmPipeline.getState().letterbox *
      Math.min(0.3, Math.max(0, 1 - innerWidth / innerHeight / 2.39)) *
      innerHeight) /
      2,
    // Without the finish pass the page draws the bars.
    { drawBars: filmPipeline.quality === 'off' },
  );
  sunDirection.copy(sun.position).sub(sun.target.position).normalize();
  filmPipeline.render({
    dt: realDt,
    weather: localWeather,
    dusk,
    inTunnel: isTunnel(routePosition.z),
    sunDirection,
    sunColor: sun.color,
    neon: dusk && Math.abs(routePosition.z - landmarks.tokyoZ) < 900,
  });
  const resized = frameBudget.record({
    intervalMs,
    cpuMs: performance.now() - cpuStart,
    calls: renderer.info.render.calls,
    triangles: renderer.info.render.triangles,
    active: !document.hidden,
  });
  if (resized) riverWater.resize();
}
const sceneryChunks = [];
for (const source of [trunks, branches, leaves, pines, rocks]) {
  const groups = new Map(),
    matrix = new THREE.Matrix4(),
    color = new THREE.Color();
  for (let i = 0; i < source.count; i++) {
    source.getMatrixAt(i, matrix);
    const bucket = Math.floor(matrix.elements[14] / 120);
    if (!groups.has(bucket)) groups.set(bucket, []);
    groups.get(bucket).push(i);
  }
  for (const [bucket, indices] of groups) {
    const chunk = new THREE.InstancedMesh(source.geometry, source.material, indices.length);
    indices.forEach((sourceIndex, i) => {
      source.getMatrixAt(sourceIndex, matrix);
      chunk.setMatrixAt(i, matrix);
      if (source.instanceColor) {
        source.getColorAt(sourceIndex, color);
        chunk.setColorAt(i, color);
      }
    });
    chunk.castShadow = source.castShadow;
    chunk.receiveShadow = source.receiveShadow;
    chunk.computeBoundingSphere();
    wind.copyToChunk(source, chunk);
    scene.add(chunk);
    sceneryChunks.push({
      mesh: chunk,
      z: (bucket + 0.5) * 120,
      casts: source.castShadow,
      forest: source !== rocks,
    });
  }
  scene.remove(source);
}
storyCast = createStoryCast({
  THREE,
  scene,
  railPoint,
  terrainHeight: (x, z) => terrain(x - center(z), z),
});
storyGuests = createStoryGuests({
  THREE,
  scene,
  railPoint,
  terrainHeight: (x, z) => terrain(x - center(z), z),
});
/** Everyone a grab can find: Momiji people, loaded regional residents, and story figures. */
function grabbableCharacters() {
  const list = [];
  for (const person of worldDetails.getPopulationState?.().people ?? []) {
    if (!person.visible) continue;
    const figure = worldDetails.figureOf?.(person.id);
    const at = figure?.position ?? person.position;
    list.push({
      id: person.id,
      kind: 'momiji',
      name: person.role,
      position: [at.x, at.y, at.z],
      heading: figure?.heading,
      height: person.pose === 'reading' ? 1.3 : 1.7,
    });
  }
  for (const station of extendedWorld.getResidents())
    for (const resident of station.residents)
      if (resident.world)
        list.push({
          id: resident.id,
          kind: 'regional',
          name: resident.role,
          position: resident.world,
          heading: resident.worldHeading,
          height: resident.seated ? 1.3 : 1.7,
          station: station.station,
        });
  for (const [kind, host, focus] of [
    ['story-cast', storyCast, 0.9],
    ['story-guest', storyGuests, 0.85],
  ]) {
    const figures = host?.getState();
    if (!figures?.visible) continue;
    for (const figure of figures.characters)
      if (figure.headFocus)
        list.push({
          id: figure.id,
          kind,
          name: figure.name,
          position: [
            figure.headFocus[0],
            figure.headFocus[1] - figure.height * focus,
            figure.headFocus[2],
          ],
          heading: Math.atan2(figure.facing[0], figure.facing[2]),
          height: figure.height,
          beatId: figures.beatId,
        });
  }
  return list;
}
/** The simulation, mind, model, episode and story details behind one grabbed character. */
function describeCharacter(character) {
  const mind = minds.getState().entities.find((entity) => entity.id === character.id);
  const person =
    character.kind === 'momiji'
      ? worldDetails.getPopulationState?.().people.find((item) => item.id === character.id)
      : null;
  const resident =
    character.kind === 'regional'
      ? extendedWorld
          .getResidents()
          .flatMap((station) => station.residents)
          .find((item) => item.id === character.id)
      : null;
  const episode = episodeRunner.getState();
  const parts = Object.entries(episode.scene?.actors ?? {})
    .filter(([, entity]) => entity === character.id)
    .map(([part]) => part);
  const story = storyEngine.getState();
  return {
    station: character.station ?? (person ? 'momiji' : null),
    state: person?.state ?? resident?.activity ?? (character.beatId ? 'in a story scene' : null),
    simulation: person
      ? {
          role: person.role,
          state: person.state,
          destination: person.destination,
          walking: person.walking,
          pose: person.pose,
        }
      : resident
        ? {
            role: resident.role,
            activity: resident.activity,
            walking: resident.walking,
            seated: resident.seated,
            frame: resident.frame ?? 'station',
          }
        : null,
    mind: mind
      ? {
          mood: mind.mood,
          intent: mind.intent,
          source: mind.source,
          expiresIn: mind.expiresIn,
          needs: mind.needs,
          persona: mind.persona,
        }
      : null,
    model: heroCasts.find((hero) => hero.personId === character.id)?.getState() ?? null,
    episode:
      parts.length && episode.status === 'playing'
        ? { title: episode.episode?.title, scene: episode.scene?.id, parts }
        : null,
    story: character.beatId
      ? { beatId: character.beatId, activeBeat: story.activeBeat?.id ?? null }
      : null,
    camera: { view, position: camera.position.toArray().map((v) => Number(v.toFixed(2))) },
  };
}
characterGrab = createCharacterGrab({
  THREE,
  camera,
  listCharacters: grabbableCharacters,
  describe: describeCharacter,
});
storyCinematics = createStoryCinematics({
  THREE,
  camera,
  railPoint,
  terrainHeight: (x, z) => terrain(x - center(z), z),
  reducedMotion: () => window.matchMedia('(prefers-reduced-motion: reduce)').matches,
});
passingLoop = createPassingLoop({
  THREE,
  scene,
  railPoint,
  terrainHeight: (x, z) => terrain(x - center(z), z),
});
storyLevels = createStoryLevels({
  THREE,
  scene,
  railPoint,
  terrainHeight: (x, z) => terrain(x - center(z), z),
});
railwayPoints = createRailwayPoints({ THREE, scene, railPoint });
const stationDuties = createStationDuties();
const storyEngine = createStoryEngine({
  campaign,
  encounters: wildlifeEncounters,
  wildlifeBroadcast,
  storage: embedded ? null : undefined,
});
const storySession = connectStorySession({ engine: storyEngine, duties: stationDuties });
const storyWildlife = createStoryWildlife({
  encounters: wildlifeEncounters,
  railPoint,
  terrainHeight: (x, z) => terrain(x - center(z), z),
  habitatAllowed: (x, z) => {
    if (isTunnel(z)) return false;
    if (z < -790 || z > 790) return true;
    const river = riverProfile(z);
    return Math.abs(x - center(z) - river.offset) > river.halfWidth + 2;
  },
});
function updateStationDuties(dt = 0) {
  const story = storyEngine.getState();
  return stationDuties.update({
    dt,
    z: track.getPointAt(THREE.MathUtils.clamp(state.distance / trackLength, 0, 1)).z,
    speed: state.speed,
    doorsOpen: state.doorsOpen,
    doorFraction: trainModel.getDoorState().openFraction,
    pointsState: railwayPoints?.getState(),
    storyEnabled: story.enabled,
    storyBeatId: story.nextBeat?.id,
    storyCompletedIds: story.seenIds,
    paused: state.paused,
  });
}
function railwayAction(action) {
  updateStationDuties();
  const result = stationDuties.act(action);
  if (!result.ok) return result;
  if (result.effect === 'open-doors' && !state.doorsOpen) toggleDoors();
  if (result.effect === 'close-doors' && state.doorsOpen) toggleDoors();
  if (result.effect === 'depart') {
    soundscape?.horn?.();
    minds.observe({ type: 'horn' });
    changeDrive((drive) => {
      drive.paused = false;
      drive.brake = 0;
      drive.actualBrake = 0;
      drive.autopilot = !gameStore.getState().preferences.manualControls;
    });
    controlMessage('Line clear. On to Sakuragawa.');
  }
  return result;
}
function performStoryTask(taskId) {
  const result = performLevelTask({
    taskId,
    engine: storyEngine,
    levels: storyLevels,
    position: train[0].position,
    speed: state.speed,
  });
  if (!result.ok) controlMessage(result.message);
  return result;
}
function planClinicDelivery(action) {
  const result = performClinicDeliveryAction({
    action,
    engine: storyEngine,
    levels: storyLevels,
    position: train[0].position,
    speed: state.speed,
  });
  if (!result.ok) controlMessage(result.message);
  return result;
}
function startStory() {
  activateRideSound();
  storyHost.start();
  resetRouteChoice();
}
function travelStory(z) {
  if (updateStationDuties().active) {
    controlMessage('Finish the station duties before continuing along the line.');
    return false;
  }
  const here = train[0].position.z;
  if (
    z === 3100 &&
    storyEngine.getState().status === 'travelling' &&
    storyEngine.nextDestination()?.z === z
  ) {
    if (here < 2460 && !routeChoice.getState().confirmed) {
      jumpTo(2250);
      return true;
    }
    if (here < 2825 && !routeChoice.getState().traversed) {
      controlMessage(
        'Drive the selected route to Kawasemi. The next conversation waits beyond the junction.',
      );
      return false;
    }
  }
  return storyHost.travel(z);
}
storyHost = createStoryHost({
  engine: storyEngine,
  stationDuties,
  gameStore,
  jumpTo,
  zToDistance: (z) => distanceAtZ(track, trackLength, z),
  resumePosition: (z) => (z >= 2420 && z <= 2825 && !routeChoice.getState().confirmed ? 2250 : z),
});
routeChoice = createRouteChoice({
  network: track,
  getDrive: () => state,
  getZ: () => track.getPointAt(THREE.MathUtils.clamp(state.distance / trackLength, 0, 1)).z,
  isBlocked: () =>
    Boolean(storyEngine.getState().activeBeat || stationDuties.getState().active || !state.started),
});
function resetRouteChoice() {
  const result = routeChoice.reset();
  if (!result.ok) return;
  trackLength = track.getLength();
  storyHost?.invalidateRoute();
  for (const stop of routeStops) stop.distance = track.distanceAtZ(stop.z);
  changeDrive((drive) => {
    drive.distance = result.distance;
  });
}
function chooseRoute(route) {
  const result = routeChoice.choose(route);
  if (!result.ok) {
    controlMessage(result.message);
    return result;
  }
  trackLength = track.getLength();
  storyHost.invalidateRoute();
  for (const stop of routeStops) stop.distance = track.distanceAtZ(stop.z);
  changeDrive((drive) => {
    drive.distance = result.distance;
    drive.brake = 0;
    drive.actualBrake = 0;
    drive.paused = false;
    drive.autopilot = !gameStore.getState().preferences.manualControls;
  });
  updateCamera(0, true);
  controlMessage(
    route === 'wetland'
      ? 'Wetland route confirmed. 20 km/h through the loop.'
      : 'Direct route confirmed. Continue to Kawasemi.',
  );
  return result;
}
if (import.meta.env.DEV)
  window.__mapleDebug = () => ({
    state: { ...state },
    view,
    mode,
    weather,
    camera: camera.position.toArray(),
    train: train[0].position.toArray(),
    tangent: track
      .getTangentAt(THREE.MathUtils.clamp(state.distance / trackLength, 0, 1))
      .multiplyScalar(state.direction)
      .toArray(),
    render: { calls: renderer.info.render.calls, triangles: renderer.info.render.triangles },
    objects: scene.children.length,
    worldBuilder: gameStore.snapshot().worldBuilder,
    generatedTrees: generatedWorld?.treeCount ?? null,
    trainSystems: trainModel.getSystemsState(),
    powerFlow: powerFlow.getState(),
  });
if (import.meta.env.DEV) {
  const choices = (value, allowed) => {
    if (!allowed.includes(value)) throw new TypeError(`Expected one of: ${allowed.join(', ')}`);
    return value;
  };
  const number = (value, min, max) => {
    if (!Number.isFinite(value) || value < min || value > max)
      throw new TypeError(`Expected a number from ${min} to ${max}`);
    return value;
  };
  const bool = (value) => {
    if (typeof value !== 'boolean') throw new TypeError('Expected boolean');
    return value;
  };
  const actions = {
    camera(value) {
      choices(value, ['scenic', 'follow', 'cab', 'passenger', 'vista', 'director', 'orbit']);
      selectCamera(value);
    },
    weather(value) {
      $('weather').value = choices(value, ['clear', 'rain', 'snow']);
      $('weather').dispatchEvent(new Event('change'));
    },
    timeOfDay(value) {
      choices(value, Object.keys(SUN_PHASES));
      gameStore.setPreferences({
        dusk: value === 'dusk',
        sunPhase: value === 'dusk' ? 'daylight' : value,
      });
    },
    location(value) {
      const locations = {
        gorge: -520,
        terraces: -380,
        village: -195,
        shrine: 95,
        station: 490,
        city: 675,
        tokyo: landmarks.tokyoZ,
        bridge: landmarks.bridgeZ,
        tunnel: (landmarks.tunnelStartZ + landmarks.tunnelEndZ) / 2,
        summit: landmarks.summitZ,
        ...Object.fromEntries(additionalStops.map((stop) => [stop.id, stop.z])),
      };
      const z = typeof value === 'string' ? locations[value] : value;
      number(z, -700, ROUTE_END_Z);
      jumpTo(z);
    },
    drive(value) {
      if (!value || typeof value !== 'object') throw new TypeError('Expected drive object');
      for (const key of Object.keys(value))
        if (!['power', 'brake', 'speedKmh'].includes(key))
          throw new TypeError(`Unknown drive field ${key}`);
      const power = number(value.power ?? state.power, 0, 1),
        brake = number(value.brake ?? state.brake, 0, 1);
      if (value.speedKmh !== undefined) number(value.speedKmh, 0, 160);
      if (!state.started) start();
      // Same path as the lever: manual driving shows the controller, so a player can see
      // and change a notch an agent left behind instead of riding a hidden P5.
      gameStore.setPreferences({ manualControls: true });
      setDrive(power, brake);
      if (value.speedKmh !== undefined)
        changeDrive((next) => {
          next.speed = value.speedKmh / 3.6;
        });
    },
    pause(value) {
      bool(value);
      if (!state.started) start();
      if (state.paused !== value) pause();
    },
    autopilot(value) {
      bool(value);
      if (state.autopilot !== value) $('autopilot').click();
    },
    mode(value) {
      $('mode').value = choices(value, ['explore', 'challenge']);
      $('mode').dispatchEvent(new Event('change'));
    },
  };
  authoredWorld = createWorldAuthoring({
    THREE,
    scene,
    terrainHeight: (x, z) => terrain(x - center(z), z),
  });
  artDirection = createArtDirection({ renderer, scene, sun, hemi });
  const inspector = installSceneInspector({
    THREE,
    scene,
    renderer,
    camera,
    train,
    getState: () => ({
      ...gameStore.snapshot(),
      view,
      mode,
      weather,
      dusk,
      trainSystems: trainModel.getSystemsState(),
      trainDoors: trainModel.getDoorState(),
      powerFlow: powerFlow.getState(),
      population: worldDetails.getPopulationState?.(),
      wildlife: wildlife.getState(),
      wind: wind.getState(),
      windCues: windCues.getState(),
      eveningMotes: eveningMotes.getState(),
      story: storyHost?.engine.getState(),
      savedPreferences: preferenceStorage.getState(),
      storyCast: storyCast?.getState(),
      storyGuests: storyGuests?.getState(),
      storyCinematics: storyCinematics?.getState(),
      storyWildlife: storyWildlife.getState(),
      stationDuties: stationDuties.getState(),
      routeChoice: routeChoice.getState(),
      wetlandRoute: wetlandRoute.getState(),
      operatingRules: operatingEnvelope(train[0].position.z, {
        direction: state.direction,
        weather: weatherAt(train[0].position),
      }),
      passingLoop: passingLoop?.getState(),
      railwayPoints: railwayPoints?.getState(),
      storyLevels: storyLevels?.getState(),
      opening: openingSequence.getState(),
      performance: frameBudget.getState(),
      authoredWorld: authoredWorld.getState(),
      artDirection: artDirection.getState(),
      regionalWorld: extendedWorld.getState(),
      regionalTraffic: regionalTraffic.getState(),
      stops: routeStops,
      nextStop: nearestUpcomingStop(),
      altitude: train[0].position.y,
      doors: trainModel.getDoorState?.(),
      cameraRig: cameraRig.state(),
      audio: soundscape?.state() ?? { context: 'not-started' },
      routeLength: trackLength,
      riverAtTrain: riverProfile(train[0].position.z),
      driverClearance: camera.position
        .clone()
        .sub(train[0].position)
        .dot(
          track
            .getTangentAt(THREE.MathUtils.clamp(state.distance / trackLength, 0, 1))
            .multiplyScalar(state.direction),
        ),
      water: { surfaceHeight: -0.4, reflectionSize: 512, bedRefraction: true },
    }),
    actions,
  });
  const webmcp = registerGameWebMCP({
    inspector,
    extensions: [
      networkToolsExtension({ network: railNetwork, missions: missionBoard, business }),
      ({ tool }) => registerGrabTools({ tool, grabber: characterGrab }),
      ({ tool }) =>
        registerDramaTools({
          tool,
          runner: episodeRunner,
          series: [THE_1742],
          library: episodeLibrary,
          play: watchEpisode,
          linkFor: episodeLinkFor,
          catalog: () => ({
            stops: routeStops.map((stop) => ({
              id: stop.id,
              name: stop.name,
              theme: stop.theme,
              z: stop.z,
            })),
            places: Object.keys(directorLocations),
            crossings: levelCrossings
              .getState()
              .crossings.map((item) => ({ id: item.id, name: item.name, z: item.z })),
            characters: minds.getState().entities.map((entity) => ({
              id: entity.id,
              role: entity.role,
              visible: entity.visible,
              platform: entity.platform,
              mood: entity.mood,
            })),
          }),
        }),
      ({ tool }) => registerMindTools({ tool, minds, client: mindsClient }),
      ({ tool }) =>
        registerDirectorTools({
          tool,
          director: filmDirector,
          activate: () => {
            if (!state.started) start();
            if (view !== 'director') selectCamera('director');
          },
          film: {
            getState: () => ({
              ...filmPipeline.getState(),
              preference: gameStore.getState().preferences.filmLook,
            }),
            setPreference: (value) =>
              gameStore.setPreferences({ filmLook: value === 'full' ? 'full' : value }),
            setLetterbox: (value) => {
              forcedLetterbox = value;
            },
          },
          getContext: () => ({
            ...directorContext(),
            models: {
              heroes: heroCasts.map((hero) => hero.getState()),
              modules: stationModules.getState(),
              files: modelLoader.getState(),
            },
            people: worldDetails
              .getPopulationState()
              .people.filter((person) => person.visible && person.state !== 'onboard')
              .slice(0, 24)
              .map((person) => ({ id: person.id, role: person.role, state: person.state })),
          }),
        }),
    ],
    getGameState: () => inspector.snapshot().game,
    actions,
    railway: { duties: stationDuties, act: railwayAction },
    routes: { getState: () => routeChoice.getState(), choose: chooseRoute },
    storyLevels: {
      levels: storyLevels,
      performTask: performStoryTask,
      performDeliveryAction: planClinicDelivery,
    },
    story: {
      engine: storyEngine,
      actions: {
        start: startStory,
        resume: () => storyHost.resume(),
        travel: travelStory,
        exit: () => storyHost.exit(),
      },
    },
    building: {
      builder: authoredWorld,
      storage: window.localStorage,
      performance: {
        measure: async (seconds) => ({
          start: { camera: cameraRig.state(), position: train[0].position.toArray() },
          ...(await frameBudget.measure(seconds)),
          end: { camera: cameraRig.state(), position: train[0].position.toArray() },
          memory: { ...renderer.info.memory },
        }),
      },
      art: artDirection,
      sampleRoute: (z) => {
        const point = selectedRailPoint(z);
        return {
          z,
          trackPosition: point.toArray(),
          terrainAtTrack: terrain(point.x - center(z), z),
          inTunnel: isTunnel(z),
          groundSamples: [-45, -20, 20, 45].map((offset) => ({
            position: [point.x + offset, terrain(point.x + offset - center(z), z), z],
            offsetFromTrack: offset,
          })),
          nearbyStops: routeStops
            .filter((stop) => Math.abs(stop.z - z) < 800)
            .map((stop) => ({ id: stop.id, name: stop.name, z: stop.z })),
        };
      },
    },
  });
  if (import.meta.hot)
    import.meta.hot.dispose(() => {
      webmcp.dispose();
      authoredWorld.dispose();
      windCues.dispose();
    });
  const panel = document.createElement('aside');
  panel.id = 'scene-inspector';
  panel.hidden = true;
  panel.setAttribute('aria-label', 'Local scene inspector');
  const heading = document.createElement('strong');
  heading.textContent = 'Local scene inspector';
  const controls = document.createElement('div'),
    refresh = document.createElement('button'),
    download = document.createElement('button'),
    close = document.createElement('button'),
    output = document.createElement('pre');
  refresh.textContent = 'Refresh';
  download.textContent = 'Save snapshot';
  close.textContent = 'Close';
  controls.append(refresh, download, close);
  panel.append(heading, controls, output);
  document.body.append(panel);
  const refreshSnapshot = () => {
    const snapshot = inspector.snapshot();
    output.textContent = JSON.stringify(
      {
        game: snapshot.game,
        camera: snapshot.camera,
        renderer: snapshot.renderer,
        audit: inspector.audit(),
        entities: snapshot.scene.entities.map((e) => ({ name: e.name, id: e.id, type: e.type })),
      },
      null,
      2,
    );
  };
  refresh.onclick = refreshSnapshot;
  close.onclick = () => (panel.hidden = true);
  download.onclick = () => {
    const a = document.createElement('a'),
      url = URL.createObjectURL(
        new Blob([JSON.stringify(inspector.snapshot(), null, 2)], { type: 'application/json' }),
      );
    a.href = url;
    a.download = 'maple-world-snapshot.json';
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const removeGrabPointer = installGrabPointer({
    domElement: renderer.domElement,
    grabber: characterGrab,
  });
  if (import.meta.hot) import.meta.hot.dispose(removeGrabPointer);
  const inspectButton = document.createElement('button');
  inspectButton.id = 'inspect-world';
  inspectButton.textContent = 'Inspect world';
  inspectButton.onclick = () => {
    panel.hidden = !panel.hidden;
    if (!panel.hidden) refreshSnapshot();
  };
  document.querySelector('footer').insertBefore(inspectButton, $('restart'));
  window.addEventListener('keydown', (event) => {
    if (
      document.querySelector('dialog[open]') ||
      (event.target instanceof Element &&
        event.target.closest('input, select, textarea, [contenteditable="true"]'))
    )
      return;
    if (event.code === 'KeyI' && !event.repeat) inspectButton.click();
  });
}
$('camera-view').value = view;
$('weather').value = weather;
daylight.textContent = dusk ? 'Daylight' : 'Dusk';
atmosphere.setDusk(dusk);
atmosphere.setWeather(weather);
document.querySelector('.tag').textContent = dusk ? 'BLUE HOUR · 18:24' : 'AFTERNOON · 16:42';
document.body.classList.toggle('hud-hidden', !gameStore.getState().preferences.hudVisible);
$('restore-hud').hidden = gameStore.getState().preferences.hudVisible;
const unsubscribeSimpleHUD = installSimpleHUD({ store: gameStore });
routePanel = mountRouteChoicePanel({ routeChoice, onChoose: chooseRoute });
networkPanel = mountNetworkPanel({
  network: railNetwork,
  missions: missionBoard,
  business,
  onJumpToStop: (id) => {
    const stop = routeStops.find((item) => item.id === id);
    if (stop) jumpTo(stop.z);
  },
});
document.querySelector('.simple-header-actions')?.prepend(networkPanel.trigger);
missionChip = document.createElement('button');
missionChip.type = 'button';
missionChip.id = 'mission-chip';
missionChip.className = 'mission-chip';
missionChip.title = 'Open the mission board';
missionChip.hidden = true;
missionChip.onclick = () => networkPanel.open();
document.querySelector('.ride-controls')?.append(missionChip);
const dutyPanel = mountStationDutiesPanel({ duties: stationDuties, onAction: railwayAction });
const storyPanel = mountStoryPanel({
  fetchDirector,
  gameStore,
  engine: storyEngine,
  onStart: startStory,
  onResume: () => {
    activateRideSound();
    storyHost.resume();
  },
  onTravel: travelStory,
  onTask: performStoryTask,
  onDeliveryAction: planClinicDelivery,
  onExit: () => storyHost.exit(),
});
if (import.meta.hot)
  import.meta.hot.dispose(() => {
    openingSequence.dispose();
    storyPanel.dispose();
    dutyPanel.dispose();
    routePanel.dispose();
    wetlandRoute.dispose();
    regionalTraffic.dispose();
    preferenceStorage.dispose();
    storySession.dispose();
    stationDuties.dispose();
    passingLoop?.dispose();
    railwayPoints?.dispose();
    storyLevels?.dispose();
    storyHost.dispose();
    storyCast.dispose();
    storyGuests.dispose();
    storyCinematics.dispose();
  });
if (import.meta.hot) import.meta.hot.dispose(unsubscribeSimpleHUD);
window.addEventListener('resize', () => {
  frameBudget.resize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
  riverWater.resize();
});
// In Director mode the HUD fades out and returns while the pointer or keys are active.
let filmPointerTimer = 0;
const wakeFilmHUD = () => {
  document.body.classList.add('film-pointer');
  clearTimeout(filmPointerTimer);
  filmPointerTimer = setTimeout(() => document.body.classList.remove('film-pointer'), 2600);
};
window.addEventListener('pointermove', wakeFilmHUD, { passive: true });
window.addEventListener('pointerdown', wakeFilmHUD, { passive: true });
window.addEventListener('keydown', wakeFilmHUD);
installEpisodePicker({
  dialog: document.getElementById('places-picker'),
  series: THE_1742,
  onPlay: (episode) => {
    try {
      watchEpisode(episode);
    } catch (error) {
      controlMessage(error.message);
    }
  },
});
// Deep links: ?episode=, ?scene=, ?watch= and #ep= open the game somewhere specific.
// The welcome card turns into the invitation, so one tap (which also allows sound) starts it.
function inviteFromWelcome({ eyebrow, title, body, action, run }) {
  const welcome = $('welcome');
  const label = welcome.querySelector('.eyebrow');
  label.lastChild.textContent = ` ${eyebrow}`;
  welcome.querySelector('h2').textContent = title;
  welcome.querySelector(':scope > p').textContent = body;
  welcome.querySelector('.welcome-note').textContent =
    'Opened from a link. Take the controls whenever you like.';
  const arrow = document.createElement('span');
  arrow.setAttribute('aria-hidden', 'true');
  arrow.textContent = '↗';
  $('start').replaceChildren(`${action} `, arrow);
  $('start').disabled = false;
  $('start').onclick = () => {
    try {
      run();
    } catch (error) {
      if (!state.started) start();
      episodeHandoff.toast(error.message);
    }
  };
}
const placeTitle = (set) => {
  const stop = routeStops.find((item) => item.id === set.location);
  if (stop) return `${stop.name} station`;
  const names = { city: 'the valley town', tokyo: 'the Tokyo neon passage' };
  return names[set.location] ?? `the ${set.location}`;
};
function forgetDeepLink(notice) {
  history.replaceState(history.state, '', withoutDeepLink(location.href));
  if (notice) episodeHandoff.toast(notice, { seconds: 9 });
}
function openDeepLink() {
  const { link, notice } = parseDeepLink(location.href, {
    episodeIds: THE_1742.episodes.map((episode) => episode.id),
    stops: routeStops.map((stop) => stop.id),
  });
  if (notice) forgetDeepLink(notice);
  if (!link) return;
  if (link.kind === 'episode') {
    const episode = THE_1742.episodes.find((item) => item.id === link.id);
    inviteFromWelcome({
      eyebrow: 'AN EPISODE FOR YOU',
      title: episodeHeading(episode),
      body: episode.logline ?? THE_1742.logline,
      action: 'Watch the episode',
      run: () => watchEpisode(episode),
    });
    return;
  }
  if (link.kind === 'scene') {
    const details = [link.set.timeOfDay, link.set.weather].filter(Boolean).join(' · ');
    const title = placeTitle(link.set);
    inviteFromWelcome({
      eyebrow: 'A PLACE ON THE LINE',
      title: title[0].toUpperCase() + title.slice(1),
      body: details ? `Someone sent you here: ${details}.` : 'Someone sent you here.',
      action: 'Start here',
      run() {
        start();
        applySceneSettings(link.set);
        if (link.camera) selectCamera(link.camera);
      },
    });
    return;
  }
  // A shared custom episode: untrusted data, decoded and validated before anything plays.
  const startLabel = [...$('start').childNodes].map((node) => node.cloneNode(true));
  $('start').textContent = 'Opening the shared episode…';
  $('start').disabled = true;
  const timeout = new Promise((_, reject) =>
    setTimeout(() => reject(new Error('The shared episode took too long to load.')), 10000),
  );
  Promise.race([episodeSharing.load(link), timeout])
    .then((episode) =>
      inviteFromWelcome({
        eyebrow: 'A SHARED EPISODE',
        title: episodeHeading(episode),
        body: episode.logline ?? 'A short drama written for the Maple Line.',
        action: 'Watch the episode',
        run: () => watchEpisode(episode),
      }),
    )
    .catch((error) => {
      $('start').replaceChildren(...startLabel);
      $('start').disabled = false;
      forgetDeepLink(`${error.message} The ride starts normally.`);
    });
}
if (!embedded) openDeepLink();
$('film-look').value = gameStore.getState().preferences.filmLook;
$('film-look').onchange = () => gameStore.setPreferences({ filmLook: $('film-look').value });
if (embedded) {
  embedVisuals = createEmbedVisuals({
    THREE,
    scene,
    camera,
    renderer,
    train,
    riverWater,
    center,
    riverProfile,
    railPoint,
    terrain,
    station,
    wind,
    surfaceDetail,
    forestSource: trunks,
  });
  document.body.classList.add('embedded-game');
  gameStore.setPreferences({ sound: false, narrationEnabled: false, hudVisible: false });
  gameStore.updateDirector({ enabled: false });
  director.setEnabled(false);
  mindsClient.setEnabled(false);
  $('start-with-sound').checked = false;
  start();
  changeDrive((drive) => {
    drive.paused = true;
  });
  const locations = {
    gorge: -520,
    terraces: -380,
    station: 490,
    bridge: landmarks.bridgeZ,
    summit: landmarks.summitZ,
    tokyo: landmarks.tokyoZ,
  };
  const inspectionRay = new THREE.Raycaster();
  const disposeEmbed = installEmbedBridge({
    inspect(x, y) {
      inspectionRay.setFromCamera(new THREE.Vector2(x, y), camera);
      const hit = inspectionRay.intersectObjects(scene.children, true).find(({ object }) => {
        for (let parent = object; parent; parent = parent.parent) if (!parent.visible) return false;
        return object.isMesh;
      });
      if (!hit) return { hit: false };
      return {
        hit: true,
        name: hit.object.name || hit.object.type,
        instanceId: hit.instanceId ?? null,
        distanceMetres: Math.round(hit.distance * 100) / 100,
        point: hit.point.toArray().map((v) => Math.round(v * 100) / 100),
      };
    },
    configure(config) {
      const paused = config.paused ?? state.paused;
      embedVisuals.configure(config);
      if (config.location !== undefined) {
        jumpTo(locations[config.location]);
        embedLocation = config.location;
      }
      if (config.camera !== undefined) selectCamera(config.camera);
      if (config.weather !== undefined) {
        $('weather').value = config.weather;
        $('weather').dispatchEvent(new Event('change'));
      }
      if (config.timeOfDay !== undefined)
        gameStore.setPreferences({
          dusk: config.timeOfDay === 'dusk',
          sunPhase: config.timeOfDay === 'dusk' ? 'daylight' : config.timeOfDay,
        });
      changeDrive((drive) => {
        drive.paused = paused;
      });
      updateCamera(
        0,
        ['focus', 'camera', 'location'].some((key) => Object.hasOwn(config, key)),
      );
    },
    snapshot: () => ({
      camera: view,
      visual: embedVisuals.snapshot(),
      inspection: {
        visibleSceneryBatches: sceneryChunks.filter((chunk) => chunk.mesh.visible).length,
        totalSceneryBatches: sceneryChunks.length,
        regionalWorld: (() => {
          const world = extendedWorld.getState();
          return {
            loadedChunks: world.loadedChunks,
            totalChunks: world.totalChunks,
            totalBuilt: world.totalBuilt,
            positionZ: world.positionZ,
          };
        })(),
        frameTiming: frameBudget.getState(),
      },
      location: embedLocation,
      cameraPosition: camera.position.toArray().map((value) => Math.round(value * 100) / 100),
      weather,
      timeOfDay: dusk ? 'dusk' : gameStore.getState().preferences.sunPhase,
      paused: state.paused,
      speedKmh: Math.round(state.speed * 3.6),
      routeZ: Math.round(train[0].position.z),
      drawCalls: renderer.info.render.calls,
      triangles: renderer.info.render.triangles,
      note: 'Latest rendered frame counts; not a performance benchmark.',
    }),
    suspend(value) {
      embedSuspended = value;
    },
  });
  window.addEventListener('pagehide', disposeEmbed, { once: true });
}
updateCamera(1, true);
$('loading').hidden = true;
requestAnimationFrame(frame);
