/**
 * Development page (crowd-lab.html): the crowd kit in the character lab's light, driven by
 * the real crowd module and a stand-in source. Not part of the production build.
 *
 *   n=12            people in the row
 *   tier=near|mid   force every person to one detail level (default: by distance)
 *   role=commuter   role for everyone (default: a mix)
 *   named=haru,emi  named roles (NAMED_LOOKS) at the front of the row
 *   clip=idle       intent for everyone (walk makes them walk on the spot)
 *   weather=rain    look variation for the weather
 *   hero=1          add the Riko hero VRM at the left for comparison
 *   seated=1        everyone sits (bench height 0.45 m)
 *   view=full|face|wide
 */
import * as THREE from 'three';
import { createVrmLoader } from '../vrm-loader.js';
import { createVrmActor } from '../vrm-actor.js';
import { createCrowd } from './crowd.js';
import { VRM_CLIPS } from '../../world/hero-cast.js';
import { createGltfLoader, createModelLoader } from '../../rendering/model-loader.js';

const params = new URLSearchParams(location.search);
const count = Number(params.get('n') ?? 12);
const forced = params.get('tier');
const roles = (
  params.get('role') ??
  'commuter,student,elder,farmer,shopkeeper,staff,child,tourist,vendor,worker,neighbour,shopper'
).split(',');
const named = (params.get('named') ?? '').split(',').filter(Boolean);
const view = params.get('view') ?? 'full';
const seated = params.get('seated') === '1';
const walking = params.get('clip') === 'walk';

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(2, devicePixelRatio));
renderer.setSize(innerWidth, innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.22;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color('#abc9cd');
scene.fog = new THREE.FogExp2('#abc9cd', 0.0028);
scene.add(new THREE.HemisphereLight('#dce8db', '#646544', 2.25));
const sun = new THREE.DirectionalLight('#ffddb0', 3.1);
sun.position.set(-12, 17, 8);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -12, right: 12, top: 6, bottom: -6, near: 1, far: 60 });
sun.shadow.bias = -0.0005;
sun.shadow.normalBias = 0.02;
scene.add(sun, sun.target);
const platform = new THREE.Mesh(
  new THREE.BoxGeometry(40, 0.2, 8),
  new THREE.MeshStandardMaterial({ color: '#b9b2a4', roughness: 0.9 }),
);
platform.position.y = -0.1;
platform.receiveShadow = true;
scene.add(platform);

const camera = new THREE.PerspectiveCamera(
  view === 'face' ? 20 : 30,
  innerWidth / innerHeight,
  0.05,
  400,
);
const spacing = 0.85;
const people = [];
const ids = named.map((role) => `named:${role}`);
for (let i = 0; ids.length < count; i++) ids.push(`lab-${i}`);
ids.forEach((id, i) => {
  const role = id.startsWith('named:') ? 'neighbour' : roles[i % roles.length];
  people.push({
    id,
    source: 'lab',
    role,
    named: id.startsWith('named:') ? id.slice(6) : null,
    position: { x: (i - (ids.length - 1) / 2) * spacing, y: 0, z: 0 },
    heading: 0,
    walking,
    pose: seated ? 'seated' : 'standing',
    state: '',
    activity: seated ? ['phone', 'reading', 'doze', 'window'][i % 4] : null,
    seatHeight: 0.45,
    intent: params.get('clip') && !walking ? params.get('clip') : null,
    visible: true,
    priority: forced === 'near' ? 1 : 0,
  });
});
const vrmLoader = createVrmLoader();
const modelLoader = createModelLoader({
  load: (path) => createGltfLoader().then((load) => load(path)),
});
const crowd = createCrowd({ THREE, scene, vrmLoader, propLoader: modelLoader, tier: 'high' });
crowd.addSource({ id: 'lab', collect: (push) => people.forEach((p) => push(p)) });
if (forced === 'mid') crowd.setTier('high');

if (params.get('hero') === '1') {
  const [loaded, clipSet] = await Promise.all([
    vrmLoader.vrm('models/characters/vrm/riko.vrm'),
    vrmLoader.animations(VRM_CLIPS),
  ]);
  const actor = createVrmActor({ THREE, vrm: loaded.vrm, m: loaded.m, clipSet });
  actor.root.position.x = people[0].position.x - spacing;
  actor.actions.get('idle')?.play();
  scene.add(actor.root);
  window.crowdLabHero = actor;
}

const width = ids.length * spacing;
function frame() {
  if (view === 'face') {
    camera.position.set(people[0].position.x + 0.1, 1.45, 1.1);
    camera.lookAt(people[0].position.x, 1.4, 0);
  } else if (view === 'wide') {
    camera.position.set(0, 3, 30);
    camera.lookAt(0, 0.8, 0);
  } else {
    camera.position.set(0, 1.0, 2.4 + width * 0.95);
    camera.lookAt(0, 0.8, 0);
  }
}
frame();
// Walkers stay on the spot: the source moves them along a small loop only for speed.
let elapsed = 0;
const clock = new THREE.Clock();
function tick() {
  const dt = Math.min(0.05, clock.getDelta());
  elapsed += dt;
  if (walking)
    for (const p of people) {
      p.position.z = Math.sin(elapsed * 0.5) * 0.001 + elapsed * 1.1 - Math.floor(elapsed * 1.1);
      p.heading = 0;
    }
  // `tier=mid`: put the camera far away for the crowd's distances, then render from close.
  const stand = new THREE.Vector3();
  if (forced === 'mid') {
    stand.copy(camera.position);
    camera.position.set(0, 1, 40);
    camera.updateMatrixWorld();
  }
  crowd.update(dt, {
    camera,
    weather: params.get('weather') ?? 'clear',
    season: params.get('season') ?? 'autumn',
    hero: { camera },
  });
  if (forced === 'mid') {
    camera.position.copy(stand);
    camera.updateMatrixWorld();
  }
  window.crowdLabHero?.mixer.update(dt);
  window.crowdLabHero?.vrm.update(dt);
  renderer.render(scene, camera);
  requestAnimationFrame(tick);
}
tick();
addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});
window.crowdLab = { crowd, scene, camera, renderer, people, THREE };
