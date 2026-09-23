/**
 * Retarget preview: a GLB (or VRM) with another skeleton stands beside the loaded VRM and
 * copies its pose every frame through the canonical bone map (humanoid-bones.js
 * humanoidRigFor: a table, glTF extras, Mixamo/Unreal/UAL/MPFB/Rigify names, structure).
 *
 * VRM normalized bones rest at identity in a T-pose, so a normalized bone's world rotation
 * is its change from the T-pose. The target first turns each bone from its own rest (an A-pose
 * is fine) to the T-pose direction the VRM has for the same bone, then takes the VRM's change
 * on top: world = vrmDelta * align * targetRest. Hips travel scales by hips height.
 * This is a preview for choosing bases (docs/CHARACTER-STUDIO.md), not an offline retarget.
 */
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { CANONICAL_TO_VRM, VRM_TO_CANONICAL, humanoidRigFor } from '../humanoid-bones.js';
import { h, section, select } from './dom.js';

const FINGERS = ['thumb', 'index', 'middle', 'ring', 'little'];
/** Canonical bone -> the child that gives its direction. */
const CHILD = {
  hips: 'spine',
  spine: 'chest',
  chest: 'upperChest',
  upperChest: 'neck',
  neck: 'head',
};
for (const s of ['L', 'R']) {
  Object.assign(CHILD, {
    [`shoulder${s}`]: `upperArm${s}`,
    [`upperArm${s}`]: `lowerArm${s}`,
    [`lowerArm${s}`]: `hand${s}`,
    [`hand${s}`]: `middle${s}1`,
    [`upperLeg${s}`]: `lowerLeg${s}`,
    [`lowerLeg${s}`]: `foot${s}`,
    [`foot${s}`]: `toes${s}`,
  });
  for (const f of FINGERS) {
    CHILD[`${f}${s}1`] = `${f}${s}2`;
    CHILD[`${f}${s}2`] = `${f}${s}3`;
  }
}
/** Parents first, so each bone's parent is final before its local rotation is solved. */
const ORDER = [
  'hips',
  'spine',
  'chest',
  'upperChest',
  'neck',
  'head',
  ...['L', 'R'].flatMap((s) => [
    `shoulder${s}`,
    `upperArm${s}`,
    `lowerArm${s}`,
    `hand${s}`,
    ...FINGERS.flatMap((f) => [1, 2, 3].map((i) => `${f}${s}${i}`)),
    `upperLeg${s}`,
    `lowerLeg${s}`,
    `foot${s}`,
    `toes${s}`,
  ]),
];

/** VRM normalized rest positions in root space (rest rotations are identity). */
function vrmRestPositions(vrm) {
  const rest = vrm.humanoid.normalizedRestPose;
  const out = {};
  const nodeName = new Map();
  for (const name of Object.values(CANONICAL_TO_VRM)) {
    const node = vrm.humanoid.getNormalizedBoneNode(name);
    if (node) nodeName.set(node, name);
  }
  const worldOf = (node) => {
    const name = nodeName.get(node);
    if (!name) return new THREE.Vector3();
    const local = new THREE.Vector3(...(rest[name]?.position ?? [0, 0, 0]));
    return local.add(worldOf(node.parent));
  };
  for (const [node, name] of nodeName) out[VRM_TO_CANONICAL[name]] = worldOf(node);
  return out;
}

export function buildRetargetPanel(S, root) {
  const table = h('div', {
    class: 'mono',
    style: 'white-space:pre;font-size:11px;max-height:160px;overflow:auto',
  });
  const status = h('div', { class: 'note' });
  const file = h('input', { type: 'file', accept: '.glb,.gltf,.vrm' });
  const pathSelect = h('select');
  const turn = select(
    [
      ['0', 'faces +Z'],
      ['90', 'turn 90°'],
      ['180', 'turn 180°'],
      ['270', 'turn 270°'],
    ],
    '0',
    () => current && prepare(current.scene, current.name, current.mapping),
  );
  let current = null; // { reference, turnGroup, scene, rig, rest, align, hipsScale }

  const loader = new GLTFLoader();
  loader.setMeshoptDecoder(MeshoptDecoder);

  function clear() {
    current?.reference.removeFromParent();
    current = null;
    table.textContent = '';
  }

  function prepare(scene, name, mapping = null) {
    current?.reference.removeFromParent();
    const reference = new THREE.Group();
    reference.name = `retarget ${name}`;
    const turnGroup = new THREE.Group();
    turnGroup.rotation.y = THREE.MathUtils.degToRad(Number(turn.value));
    reference.add(turnGroup);
    turnGroup.add(scene);
    scene.traverse((node) => {
      if (node.isMesh) {
        node.frustumCulled = false;
        node.castShadow = true;
      }
      // Hand props in the file are not attached to sockets here: hide them.
      if (node.userData?.prop) node.visible = false;
    });
    S.stage.add(reference);
    reference.updateMatrixWorld(true);
    const rig = humanoidRigFor(scene, mapping);
    const refInverse = reference.getWorldQuaternion(new THREE.Quaternion()).invert();
    const rest = {};
    for (const [canonical, bone] of Object.entries(rig.bones))
      rest[canonical] = {
        q: refInverse.clone().multiply(bone.getWorldQuaternion(new THREE.Quaternion())),
        p: reference.worldToLocal(bone.getWorldPosition(new THREE.Vector3())),
      };
    const vrm = S.loaded?.internals.actor?.vrm;
    const vrmRest = vrm ? vrmRestPositions(vrm) : {};
    // align: turn the target's rest bone direction onto the VRM T-pose direction.
    const align = {};
    for (const canonical of ORDER) {
      const child = CHILD[canonical];
      const a = rest[canonical];
      const b = child && rest[child];
      const va = vrmRest[canonical];
      const vb = child && vrmRest[child];
      if (a && b && va && vb) {
        const from = b.p.clone().sub(a.p).normalize();
        const to = vb.clone().sub(va).normalize();
        align[canonical] = new THREE.Quaternion().setFromUnitVectors(from, to);
      }
    }
    // Bones without a child direction (hands without fingers, heads) inherit the parent's.
    const parentOf = (canonical) =>
      Object.entries(CHILD).find(([, child]) => child === canonical)?.[0];
    for (const canonical of ORDER) {
      if (align[canonical] || !rest[canonical]) continue;
      let parent = parentOf(canonical);
      while (parent && !align[parent]) parent = parentOf(parent);
      align[canonical] = parent ? align[parent].clone() : new THREE.Quaternion();
    }
    const hipsHeight = rest.hips?.p.y ?? 1;
    const vrmHips = vrmRest.hips?.y ?? S.loaded?.internals.hipsHeight ?? 1;
    current = {
      reference,
      turnGroup,
      scene,
      rig,
      rest,
      align,
      name,
      mapping,
      hipsScale: hipsHeight / vrmHips,
    };
    const rows = ORDER.filter(
      (c) => rig.bones[c] || ['hips', 'head', 'handL', 'handR', 'footL', 'footR'].includes(c),
    ).map(
      (c) =>
        `${c.padEnd(11)} ${rig.bones[c] ? `${rig.bones[c].name} (${rig.source?.[c] ?? rig.kind})` : 'missing'}`,
    );
    table.textContent = rows.join('\n');
    status.textContent = rig.missing.length
      ? `${name}: missing ${rig.missing.join(', ')}; those bones keep their rest pose.`
      : `${name}: ${Object.keys(rig.bones).length} canonical bones mapped. Hips scale ${current.hipsScale.toFixed(2)}.`;
    if (!vrm) status.textContent += ' Load a VRM on the left to drive it.';
  }

  async function loadBuffer(buffer, name) {
    const isVrm = /\.vrm$/i.test(name);
    let mapping = null;
    const parser = new GLTFLoader();
    parser.setMeshoptDecoder(MeshoptDecoder);
    if (isVrm) {
      const m = await S.vrmLoader.modules();
      parser.register((p) => new m.VRMLoaderPlugin(p));
    }
    const gltf = await parser.parseAsync(buffer, '');
    let scene = gltf.scene;
    const vrm = gltf.userData.vrm;
    if (vrm) {
      // A VRM names its humanoid in the file: map canonical -> its raw joint names.
      mapping = {};
      for (const [canonical, vrmName] of Object.entries(CANONICAL_TO_VRM)) {
        const node = vrm.humanoid.getRawBoneNode(vrmName);
        if (node) mapping[canonical] = node.name;
      }
      scene = vrm.scene;
    }
    prepare(scene, name, mapping);
  }

  file.addEventListener('change', async () => {
    const chosen = file.files?.[0];
    if (!chosen) return;
    try {
      await loadBuffer(await chosen.arrayBuffer(), chosen.name);
    } catch (error) {
      status.textContent = `${chosen.name} did not load: ${error.message}`;
    }
  });

  S.loadRetarget = async (path) => {
    const response = await fetch(`/${path}`);
    if (!response.ok) throw new Error(`${path}: HTTP ${response.status}`);
    await loadBuffer(await response.arrayBuffer(), path.split('/').pop());
    return { mapped: Object.keys(current.rig.bones), missing: current.rig.missing };
  };

  const q = new THREE.Quaternion();
  const q2 = new THREE.Quaternion();
  S.on('frame', () => {
    const L = S.loaded;
    const vrm = L?.internals.actor?.vrm;
    if (!current || !vrm) return;
    const sourceRoot = L.internals.root;
    const { reference, rig, rest, align } = current;
    reference.position
      .copy(sourceRoot.position)
      .add(new THREE.Vector3(0.9, 0, 0).applyQuaternion(sourceRoot.quaternion));
    reference.quaternion.copy(sourceRoot.quaternion);
    reference.updateMatrixWorld(true);
    const sourceInverse = sourceRoot.getWorldQuaternion(new THREE.Quaternion()).invert();
    const referenceQ = reference.getWorldQuaternion(new THREE.Quaternion());
    for (const canonical of ORDER) {
      const bone = rig.bones[canonical];
      const source = L.internals.humanoid.bones[canonical];
      if (!bone || !source || !rest[canonical]) continue;
      // The VRM bone's change from its T-pose, in its root's frame.
      const delta = sourceInverse.clone().multiply(source.getWorldQuaternion(q));
      const world = referenceQ
        .clone()
        .multiply(delta)
        .multiply(align[canonical])
        .multiply(rest[canonical].q);
      bone.parent.getWorldQuaternion(q2).invert();
      bone.quaternion.copy(q2.multiply(world));
      if (canonical === 'hips') {
        const hips = sourceRoot.worldToLocal(source.getWorldPosition(new THREE.Vector3()));
        const target = reference.localToWorld(hips.multiplyScalar(current.hipsScale));
        bone.position.copy(bone.parent.worldToLocal(target));
      }
      bone.updateMatrixWorld(true);
    }
  });
  S.on('character', () => current && prepare(current.scene, current.name, current.mapping));
  S.on('ready', () => {
    const options = (S.assets?.characters ?? []).map((c) => c.path);
    pathSelect.replaceChildren(
      h('option', { value: '' }, 'a model from the list…'),
      ...options.map((p) => h('option', { value: p }, p.replace('models/characters/', ''))),
    );
  });
  pathSelect.addEventListener(
    'change',
    () =>
      pathSelect.value &&
      S.loadRetarget(pathSelect.value).catch((e) => (status.textContent = e.message)),
  );

  root.append(
    section(
      'Retarget preview',
      {},
      h(
        'div',
        { class: 'note' },
        "Load a GLB with another skeleton (Mixamo, UE mannequin, UAL, a VRM) to see the VRM clips on it through the canonical bone map. It stands 0.9 m to the body's left.",
      ),
      file,
      pathSelect,
      h('div', { class: 'row' }, turn, h('button', { onclick: clear }, 'Remove')),
      status,
      table,
    ),
  );
}
