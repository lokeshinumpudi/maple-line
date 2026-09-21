import { TRAIN_CLEARANCE } from '../train/consist.js';
const DURATION = 1.6;
const smoothstep = (value) => value * value * (3 - 2 * value);

/** Overlay after the gameplay rig. Call restoreBaseCamera before its next update. */
export function createStoryCinematics({
  THREE,
  camera,
  railPoint,
  terrainHeight,
  reducedMotion = false,
}) {
  if (
    !THREE ||
    !camera?.isCamera ||
    typeof railPoint !== 'function' ||
    typeof terrainHeight !== 'function'
  ) {
    throw new TypeError(
      'Story cinematics requires a camera, rail sampler, and world terrain sampler.',
    );
  }
  const up = new THREE.Vector3(0, 1, 0);
  const baseEye = camera.position.clone();
  const baseRotation = camera.quaternion.clone();
  const outputEye = baseEye.clone();
  const outputRotation = baseRotation.clone();
  const originEye = baseEye.clone();
  const originRotation = baseRotation.clone();
  const targetEye = baseEye.clone();
  const targetLook = new THREE.Vector3();
  const lookMatrix = new THREE.Matrix4();
  const targetRotation = new THREE.Quaternion();
  const sample = new THREE.Vector3();
  let phase = 'gameplay';
  let elapsed = 0;
  let blend = 0;
  let activeId = null;
  let activeSceneKey = null;
  let focusedTask = null;
  let subject = 'train';
  let reason = null;
  let initialized = false;
  let needsRestore = false;
  let previousTrain = null;
  let travelCuts = 0;
  let disposed = false;
  let terrainLift = 0;

  function vector(value) {
    const v = Array.isArray(value) ? new THREE.Vector3(...value) : value?.clone?.();
    return v && [v.x, v.y, v.z].every(Number.isFinite) ? v : null;
  }
  function ground(position) {
    const height = terrainHeight(position.x, position.z);
    return Number.isFinite(height) ? height : -Infinity;
  }
  function clearTerrain(eye, look) {
    const original = eye.y;
    // The framing target may sit below the subject to leave room for dialogue.
    // Test sight lines to the visible surface, not that virtual point underground.
    const sightTarget = look.clone();
    sightTarget.y = Math.max(sightTarget.y, ground(sightTarget) + 0.35);
    eye.y = Math.max(eye.y, ground(eye) + 1);
    for (let i = 1; i <= 32; i++) {
      const fraction = i / 32;
      sample.lerpVectors(sightTarget, eye, fraction);
      const needed = ground(sample) + 0.35;
      if (sample.y < needed)
        eye.y = Math.max(eye.y, sightTarget.y + (needed - sightTarget.y) / fraction);
    }
    return Math.max(0, eye.y - original);
  }
  function clearTrain(eye, train, forward, side, direction) {
    // Three 12 m carriages, 13.5 m apart. Keep the transition eye outside their shell.
    const delta = eye.clone().sub(train);
    const along = delta.dot(forward) * direction;
    const across = delta.dot(side);
    if (
      along > -TRAIN_CLEARANCE &&
      along < 6.8 &&
      Math.abs(across) < 2.2 &&
      eye.y < train.y + 5.8
    ) {
      eye.y = train.y + 5.8;
    }
  }
  function composition(train, cast, beat, forward, side, wildlife, dialogueFraction, task) {
    if (task) {
      subject = 'task';
      const look = task.position.clone();
      const track = vector(railPoint(look.z));
      if (!track) throw new TypeError('Rail sampler must return finite positions.');
      const acrossTrack = look.clone().sub(track).dot(side);
      // Near-track props must be viewed from the platform's outer edge, never across the roof.
      // Distant workbenches and boards keep their established front-facing composition.
      const cameraSide = Math.abs(acrossTrack) <= 10 ? (acrossTrack < 0 ? -1 : 1) : -1;
      const eye = look
        .clone()
        .addScaledVector(side, cameraSide * 5)
        .addScaledVector(forward, 3);
      eye.y += 2;
      const panelFraction = Math.max(0, Math.min(0.65, dialogueFraction));
      const panelWeight = Math.min(1, panelFraction / 0.35);
      // The prop is the subject: keep it above even the expanded response/task card.
      look.y -= (0.8 + Math.max(0, panelFraction - 0.35) * 4) * panelWeight;
      clearTerrain(eye, look);
      return { eye, look };
    }
    const feet = cast?.visible
      ? (cast.feet ?? [])
          .map((item) => ({ ...item, point: vector(item.position) }))
          .filter((item) => item.point)
      : [];
    if (feet.length) {
      subject = 'cast';
      const look = feet
        .reduce((sum, item) => sum.add(item.point), new THREE.Vector3())
        .multiplyScalar(1 / feet.length);
      const castSide = look.clone().sub(train).dot(side) < 0 ? -1 : 1;
      const speaker = feet.find((item) =>
        String(item.id)
          .toLowerCase()
          .includes(String(beat.speaker ?? '').toLowerCase()),
      );
      if (speaker) look.lerp(speaker.point, 0.16);
      if (wildlife?.visible && wildlife.pose) {
        const animal = vector([wildlife.pose.x, wildlife.pose.y, wildlife.pose.z]);
        if (animal && animal.distanceTo(look) < 5) {
          look.lerp(animal, cast.stageType === 'platform' ? 0.65 : 0.25);
          subject = 'cast-and-wildlife';
        }
      }
      look.y += 1.25;
      const eye = look
        .clone()
        .addScaledVector(
          side,
          castSide *
            (subject === 'cast-and-wildlife' ? (cast.stageType === 'platform' ? 12 : 8.2) : 5.8),
        )
        .addScaledVector(forward, subject === 'cast-and-wildlife' ? 4.3 : 3.1);
      eye.y += subject === 'cast-and-wildlife' ? 3.5 : 1.25;
      // Compose faces in the upper third, leaving the lower frame for dialogue.
      // With the card put away, return attention to the figures rather than empty UI space.
      const panelWeight = Math.max(0, Math.min(1, dialogueFraction / 0.35));
      look.y -=
        subject === 'cast-and-wildlife'
          ? (2.6 + Math.max(0, Math.min(0.65, dialogueFraction) - 0.3) * 5) * panelWeight
          : 0.9 * panelWeight;
      clearTerrain(eye, look);
      return { eye, look };
    }
    subject = 'train';
    const look = train.clone().addScaledVector(forward, -8).addScaledVector(up, 2.8);
    const preferred = baseEye.clone().sub(train).dot(side) < 0 ? -1 : 1;
    const candidates = [preferred, -preferred].map((sign) => {
      const eye = train
        .clone()
        .addScaledVector(side, sign * 48)
        .addScaledVector(forward, -28);
      eye.y += 27;
      const lift = clearTerrain(eye, look);
      return { eye, look, cost: lift + (sign === preferred ? 0 : 8) };
    });
    return candidates.reduce((best, next) => (best.cost <= next.cost ? best : next));
  }
  const getState = () => ({
    phase,
    blend,
    ready: phase === 'gameplay' || phase === 'conversation' || disposed,
    duration: DURATION,
    elapsed,
    beatId: activeId,
    sceneKey: activeSceneKey,
    taskId: focusedTask?.id ?? null,
    subject,
    reason,
    terrainLift,
    travelCuts,
    position: camera.position.toArray(),
    target: targetLook.toArray(),
    reducedMotion: Boolean(typeof reducedMotion === 'function' ? reducedMotion() : reducedMotion),
  });
  return {
    update({
      dt = 0,
      storyState,
      castState,
      wildlifeState,
      taskFocus,
      dialogueFraction = 0.35,
      trainPosition,
      baseCameraPosition,
      baseCameraQuaternion,
      inTunnel = false,
      trainDirection = 1,
    } = {}) {
      if (disposed) return getState();
      if (!Number.isFinite(dt) || dt < 0)
        throw new TypeError('Cinematic dt must be finite and nonnegative.');
      let requestedTask = null;
      if (taskFocus != null) {
        const position =
          Array.isArray(taskFocus.position) && taskFocus.position.length === 3
            ? vector(taskFocus.position)
            : null;
        if (typeof taskFocus.id !== 'string' || !taskFocus.id || !position)
          throw new TypeError(
            'Cinematic task focus needs an ID and a finite three-coordinate position.',
          );
        requestedTask = { id: taskFocus.id, position };
      }
      const train = vector(trainPosition);
      if (!train) throw new TypeError('Cinematic train position must be finite.');
      const basePosition = vector(baseCameraPosition ?? camera.position);
      const baseQuaternion = baseCameraQuaternion ?? camera.quaternion;
      if (
        !basePosition ||
        ![baseQuaternion?.x, baseQuaternion?.y, baseQuaternion?.z, baseQuaternion?.w].every(
          Number.isFinite,
        )
      ) {
        throw new TypeError('Cinematic base camera pose must be finite.');
      }
      baseEye.copy(basePosition);
      baseRotation.copy(baseQuaternion).normalize();
      const teleported = previousTrain !== null && previousTrain.distanceTo(train) > 150;
      previousTrain = train.clone();
      if (teleported) {
        // Explicit travel already positioned the gameplay camera at its new destination.
        // Begin the local composition there rather than flying across the whole route.
        initialized = false;
        needsRestore = false;
        activeId = null;
        activeSceneKey = null;
        focusedTask = null;
        phase = 'gameplay';
        blend = 0;
        elapsed = 0;
        travelCuts++;
      }
      const step = Math.min(dt, 0.1);
      const instant = Boolean(
        typeof reducedMotion === 'function' ? reducedMotion() : reducedMotion,
      );
      const beat =
        storyState?.enabled &&
        storyState.status === 'dialogue' &&
        storyState.activeBeat?.delivery !== 'rolling'
          ? storyState.activeBeat
          : null;
      if (inTunnel) {
        // An exterior blend inside a mountain would put the eye through its shell.
        phase = 'gameplay';
        blend = 0;
        elapsed = 0;
        activeId = null;
        activeSceneKey = null;
        focusedTask = null;
        reason = 'tunnel-driver';
        camera.position.copy(baseEye);
        camera.quaternion.copy(baseRotation);
        outputEye.copy(baseEye);
        outputRotation.copy(baseRotation);
        initialized = true;
        needsRestore = false;
        camera.updateMatrixWorld(true);
        return getState();
      }
      reason = teleported ? 'travel-cut' : null;
      const ahead = vector(railPoint(train.z + 1));
      const behind = vector(railPoint(train.z - 1));
      if (!ahead || !behind) throw new TypeError('Rail sampler must return finite positions.');
      const forward = ahead.sub(behind).setY(0).normalize();
      if (forward.lengthSq() < 0.01) forward.set(0, 0, 1);
      const side = new THREE.Vector3().crossVectors(up, forward).normalize();
      if (!beat || focusedTask?.beatId !== beat.id) focusedTask = null;
      if (
        beat?.task?.required &&
        requestedTask?.id === beat.task.id &&
        (beat.phase === 'response' || !beat.choices?.length)
      ) {
        focusedTask = { ...requestedTask, beatId: beat.id };
      }
      // Keep the prop framed after its completed flag changes, until this scene ends.
      const sceneKey = beat
        ? `${beat.id}:${focusedTask ? `task:${focusedTask.id}` : 'cast'}`
        : null;
      const enter = Boolean(beat && sceneKey !== activeSceneKey);
      const leave = Boolean(!beat && activeSceneKey);
      if (enter || leave) {
        originEye.copy(initialized ? outputEye : baseEye);
        originRotation.copy(initialized ? outputRotation : baseRotation);
        elapsed = 0;
        phase = enter ? 'entering' : 'leaving';
      }
      if (beat) {
        const desired = composition(
          train,
          castState,
          beat,
          forward,
          side,
          wildlifeState,
          dialogueFraction,
          focusedTask,
        );
        if (enter || instant) {
          targetEye.copy(desired.eye);
          targetLook.copy(desired.look);
        } else {
          const follow = 1 - Math.exp(-step * 1.8);
          targetEye.lerp(desired.eye, follow);
          targetLook.lerp(desired.look, follow);
        }
        activeId = beat.id;
        activeSceneKey = sceneKey;
        clearTerrain(targetEye, targetLook);
        clearTrain(targetEye, train, forward, side, trainDirection === -1 ? -1 : 1);
        lookMatrix.lookAt(targetEye, targetLook, up);
        targetRotation.setFromRotationMatrix(lookMatrix);
      } else {
        activeId = null;
        activeSceneKey = null;
      }
      if (phase === 'entering' || phase === 'leaving') {
        elapsed = instant ? DURATION : Math.min(DURATION, elapsed + step);
        const amount = smoothstep(elapsed / DURATION);
        const entering = phase === 'entering';
        blend = entering ? amount : 1 - amount;
        camera.position.lerpVectors(originEye, entering ? targetEye : baseEye, amount);
        camera.quaternion.slerpQuaternions(
          originRotation,
          entering ? targetRotation : baseRotation,
          amount,
        );
        if (elapsed >= DURATION) phase = entering ? 'conversation' : 'gameplay';
      } else if (phase === 'conversation') {
        blend = 1;
        camera.position.copy(targetEye);
        camera.quaternion.copy(targetRotation);
      } else {
        blend = 0;
        camera.position.copy(baseEye);
        camera.quaternion.copy(baseRotation);
      }
      terrainLift = 0;
      if (blend > 0) {
        // Check the interpolated eye too: safe endpoints alone do not clear a ridge.
        const originalY = camera.position.y;
        camera.position.y = Math.max(camera.position.y, ground(camera.position) + 1);
        clearTrain(camera.position, train, forward, side, trainDirection === -1 ? -1 : 1);
        clearTerrain(camera.position, targetLook);
        terrainLift = Math.max(0, camera.position.y - originalY);
      }
      outputEye.copy(camera.position);
      outputRotation.copy(camera.quaternion);
      initialized = true;
      needsRestore = blend > 0;
      camera.updateMatrixWorld(true);
      return getState();
    },
    restoreBaseCamera() {
      if (!disposed && needsRestore) {
        camera.position.copy(baseEye);
        camera.quaternion.copy(baseRotation);
        camera.updateMatrixWorld(true);
        needsRestore = false;
      }
    },
    getState,
    dispose() {
      if (disposed) return;
      if (needsRestore) {
        camera.position.copy(baseEye);
        camera.quaternion.copy(baseRotation);
        camera.updateMatrixWorld(true);
      }
      disposed = true;
      needsRestore = false;
      phase = 'disposed';
      blend = 0;
      activeId = null;
      activeSceneKey = null;
      focusedTask = null;
    },
  };
}
