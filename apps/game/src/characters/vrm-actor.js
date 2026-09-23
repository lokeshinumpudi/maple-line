/**
 * A loaded VRM made ready to act: MToon toned to the game, the shared clip set turned into
 * clips for this skeleton, gait scaled to its leg length, the hero-cast face adapter, a
 * posture offset (an elder's stoop) and the per-frame update order three-vrm needs:
 * mixer -> posture -> expressions -> vrm.update (humanoid copy, look-at, springs).
 */
import { toneVrm } from './mtoon-tone.js';
import { createVrmFace } from './vrm-expressions.js';
import { vrmHumanoidRig } from './humanoid-bones.js';

/** Fallback gait per unit of hips height (the Blender cast's measured values). */
export const DEFAULT_GAIT = Object.freeze({ walk: 1.233, hurry: 1.897, seat: 0.456 });

/** Foot speeds and seat height in metres for a character whose hips rest at `hipsHeight`. */
export function vrmGait(extras, hipsHeight) {
  const gait = extras?.gait ?? {};
  const walk = gait.walk?.footSpeedPerHipsHeight || DEFAULT_GAIT.walk;
  const hurry = gait.hurry?.footSpeedPerHipsHeight || DEFAULT_GAIT.hurry;
  const seat = gait.sit?.seatPerHipsHeight || DEFAULT_GAIT.seat;
  const r = (v) => Math.round(v * 1000) / 1000;
  return {
    walkSpeed: r(walk * hipsHeight),
    hurrySpeed: r(hurry * hipsHeight),
    seatHeight: r(seat * hipsHeight),
  };
}

/** Posture offsets (degrees of forward pitch) per normalized bone for a profile's stoop. */
export function postureOffsets(posture = {}) {
  const stoop = posture.stoop ?? 0;
  if (!stoop) return [];
  return [
    ['chest', stoop * 0.4],
    ['upperChest', stoop * 0.6],
    ['neck', stoop * 0.3],
    ['head', -stoop * 0.7],
  ];
}

export function createVrmActor({ THREE, vrm, m, clipSet, mobile = false }) {
  const hipsHeight = vrm.humanoid.normalizedRestPose.hips?.position?.[1] ?? 0.86;
  const height = hipsHeight / 0.545;
  toneVrm(vrm, { height, mobile });
  const root = vrm.scene;
  if (vrm.lookAt && m.VRMLookAtQuaternionProxy) {
    // Clip creation looks for this proxy; adding it here keeps clips free of warnings.
    const proxy = new m.VRMLookAtQuaternionProxy(vrm.lookAt);
    proxy.name = 'VRMLookAtQuaternionProxy';
    root.add(proxy);
  }
  const mixer = new THREE.AnimationMixer(root);
  const actions = new Map();
  if (clipSet) {
    clipSet.animations.forEach((animation, i) => {
      const clip = m.createVRMAnimationClip(animation, vrm);
      clip.name = clipSet.names[i] ?? `clip-${i}`;
      actions.set(clip.name, mixer.clipAction(clip));
    });
  }
  const gait = vrmGait(clipSet?.extras, hipsHeight);
  const scenePosture = vrm.scene.userData?.posture ?? {};
  const posture = postureOffsets(scenePosture).map(([bone, degrees]) => ({
    node: vrm.humanoid.getNormalizedBoneNode(bone),
    q: new THREE.Quaternion().setFromAxisAngle(
      new THREE.Vector3(1, 0, 0),
      THREE.MathUtils.degToRad(degrees),
    ),
  }));
  const face = createVrmFace(vrm.expressionManager);
  const rig = vrmHumanoidRig(vrm);
  let settled = false;

  return {
    root,
    vrm,
    mixer,
    actions,
    gait,
    face,
    rig,
    hipsHeight,
    /**
     * Advance clips, posture, face and springs. Call after the pose is chosen. `afterPose`
     * runs on the finished normalized pose, before it is copied to the skinned joints, so
     * procedural layers (look-at, IK, foot planting) are what the springs and skin see.
     */
    update(dt, { afterPose = null } = {}) {
      mixer.update(dt);
      // Clips set every bone each frame, so the stoop is added to a fresh pose each time.
      if (actions.size) for (const { node, q } of posture) node?.quaternion.multiply(q);
      if (afterPose) {
        root.updateMatrixWorld(true);
        afterPose();
      }
      face.flush();
      if (!settled) {
        // Springs start from the first animated pose, not from the T-pose.
        vrm.update(0);
        vrm.springBoneManager?.reset();
        settled = true;
      }
      vrm.update(dt);
    },
    /** After a teleport, restart the hair from the current pose instead of whipping it. */
    resetSprings() {
      vrm.update(0);
      vrm.springBoneManager?.reset();
    },
    dispose() {
      mixer.stopAllAction();
      m.VRMUtils.deepDispose(root);
    },
  };
}
