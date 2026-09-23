/**
 * Development page (character-lab.html) for looking at the VRM cast under the game's own
 * renderer settings and Momiji evening light, without driving to the station. Not part of
 * the production build. Query parameters:
 *
 *   cast=riko,sato,ishida   who stands in the row (default: all three)
 *   clip=idle               clip to play (any hero-cast clip name)
 *   expr=happy:1,aa:0.6     VRM expressions to hold
 *   view=full|face|three    camera framing
 *   compare=1               add the older Blender GLB of each person beside them
 *   t=1.2                   seconds into the clip, then freeze (for stills)
 */
import * as THREE from 'three';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { createVrmLoader } from './vrm-loader.js';
import { createVrmActor } from './vrm-actor.js';
import { MOMIJI_CAST, VRM_CLIPS } from '../world/hero-cast.js';
import { createGltfLoader } from '../rendering/model-loader.js';

const params = new URLSearchParams(location.search);
const names = (params.get('cast') ?? 'riko,sato,ishida').split(',');
const clipName = params.get('clip') ?? 'idle';
const view = params.get('view') ?? 'full';
const freezeAt = params.has('t') ? Number(params.get('t')) : null;
const expressions = Object.fromEntries(
  (params.get('expr') ?? '')
    .split(',')
    .filter(Boolean)
    .map((pair) => {
      const [name, value] = pair.split(':');
      return [name, Number(value ?? 1)];
    }),
);
const info = document.getElementById('info');

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
// The game's daytime lights (main.js).
scene.add(new THREE.HemisphereLight('#dce8db', '#646544', 2.25));
const sun = new THREE.DirectionalLight('#ffddb0', 3.1);
sun.position.set(-12, 17, 8);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -4, right: 4, top: 4, bottom: -4, near: 1, far: 60 });
sun.shadow.bias = -0.0005;
sun.shadow.normalBias = 0.02;
scene.add(sun, sun.target);
const platform = new THREE.Mesh(
  new THREE.BoxGeometry(12, 0.2, 5),
  new THREE.MeshStandardMaterial({ color: '#b9b2a4', roughness: 0.9 }),
);
platform.position.y = -0.1;
platform.receiveShadow = true;
scene.add(platform);

const camera = new THREE.PerspectiveCamera(
  view === 'face' ? 22 : 30,
  innerWidth / innerHeight,
  0.05,
  200,
);
const spacing = 0.9;
const loader = createVrmLoader();
const actors = [];
const mixers = [];

async function addVrm(name, x) {
  const member = MOMIJI_CAST.find((m) => m.vrm.endsWith(`/${name}.vrm`));
  const [loaded, clipSet] = await Promise.all([
    loader.vrm(member.vrm),
    loader.animations(VRM_CLIPS),
  ]);
  if (!loaded) return null;
  const actor = createVrmActor({ THREE, vrm: loaded.vrm, m: loaded.m, clipSet });
  actor.root.position.x = x;
  scene.add(actor.root);
  const action = actor.actions.get(clipName) ?? actor.actions.get('idle');
  action?.play();
  const paper = actor.root.getObjectByName('newspaper');
  if (paper) paper.visible = clipName === 'sit';
  actors.push({ name, actor, heightY: actor.hipsHeight / 0.545 });
  return actor;
}

async function addGlb(member, x) {
  const load = await createGltfLoader();
  const gltf = await load(member.path);
  const root = SkeletonUtils.clone(gltf.scene);
  root.position.x = x;
  root.traverse((node) => {
    if (node.isMesh) {
      node.castShadow = true;
      node.frustumCulled = false;
    }
  });
  const paper = root.getObjectByName('newspaper');
  if (paper) paper.visible = clipName === 'sit';
  scene.add(root);
  const mixer = new THREE.AnimationMixer(root);
  const clip = gltf.animations.find((c) => c.name === clipName) ?? gltf.animations[0];
  mixer.clipAction(clip).play();
  mixers.push(mixer);
}

const compare = params.get('compare') === '1';
const slots = compare ? names.length * 2 : names.length;
const start = -((slots - 1) * spacing) / 2;
await Promise.all(
  names.map(async (name, i) => {
    const x = start + (compare ? i * 2 : i) * spacing;
    await addVrm(name, x);
    if (compare) {
      const member = MOMIJI_CAST.find((m) => m.vrm.endsWith(`/${name}.vrm`));
      await addGlb(member, x + spacing);
    }
  }),
);

function frame() {
  const tallest = Math.max(1.6, ...actors.map((a) => a.heightY));
  const width = slots * spacing;
  if (view === 'face') {
    const first = actors[0];
    const head = first.actor.vrm.humanoid
      .getNormalizedBoneNode('head')
      .getWorldPosition(new THREE.Vector3());
    camera.position.set(head.x + 0.12, head.y + 0.06, 0.95);
    camera.lookAt(head.x, head.y + 0.07, head.z);
  } else if (view === 'three') {
    camera.position.set(width * 0.45 + 1.2, tallest * 0.75, 3.6 + width * 0.5);
    camera.lookAt(0, tallest * 0.5, 0);
  } else {
    camera.position.set(0, tallest * 0.58, 2.6 + width * 0.9);
    camera.lookAt(0, tallest * 0.5, 0);
  }
}
frame();

let elapsed = 0;
const clock = new THREE.Clock();
function tick() {
  const dt = Math.min(0.05, clock.getDelta());
  const step = freezeAt === null ? dt : Math.max(0, Math.min(dt, freezeAt - elapsed));
  elapsed += step;
  for (const { actor } of actors) {
    for (const [name, value] of Object.entries(expressions))
      actor.vrm.expressionManager?.setValue(name, value);
    // hero-cast drives blink/smile through the face adapter; the lab holds values directly.
    actor.mixer.update(step);
    actor.vrm.update(step);
  }
  for (const mixer of mixers) mixer.update(step);
  renderer.render(scene, camera);
  requestAnimationFrame(tick);
}
tick();
info.textContent = `${names.join(', ')} · ${clipName} · ${view}${compare ? ' · with Blender GLBs' : ''}`;
addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});
window.characterLab = { scene, camera, renderer, actors, THREE };
