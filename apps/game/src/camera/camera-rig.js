import { TRAIN_SPAN } from '../train/consist.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { cabPose, interiorPose } from './camera.js';

/**
 * Camera modes: scenic (drag/zoom), follow, cab, passenger and valley vista.
 * Legacy orbit requests select scenic.
 * terrain(u,z) uses u = worldX - center(worldZ). Pass renderer.domElement as
 * domElement for mouse/touch orbit; without it orbit still has a valid pose.
 * colliders is an optional small set of static meshes, not forest instances.
 * foliageHeight(worldX, worldZ) optionally returns canopy top Y or -Infinity.
 * update runs once per frame; state() supplies compact inspector context.
 * Tunnels temporarily use the cab for exterior views; passenger views remain inside.
 */
export function createCameraRig({
  THREE,
  camera,
  track,
  trackLength,
  terrain,
  center,
  domElement,
  colliders = [],
  foliageHeight,
  vistaAt,
}) {
  const up = new THREE.Vector3(0, 1, 0);
  const look = new THREE.Vector3();
  const previousTarget = new THREE.Vector3();
  const worldEye = new THREE.Vector3();
  // Presentation overlays must not become the next simulation camera origin.
  const baseEye = camera.position.clone();
  const baseRotation = camera.quaternion.clone();
  const ray = new THREE.Raycaster();
  const staticColliders = colliders
    .filter((object) => object.isMesh && !object.isInstancedMesh)
    .slice(0, 64);
  const controls = domElement ? new OrbitControls(camera, domElement) : null;
  if (controls) {
    controls.enabled = false;
    controls.enablePan = false;
    controls.enableDamping = true;
    controls.dampingFactor = 0.085;
    controls.minDistance = 18;
    controls.maxDistance = 125;
    controls.minPolarAngle = 0.18;
    controls.maxPolarAngle = Math.PI * 0.47;
  }
  const exteriorNear = camera.near,
    exteriorFov = camera.fov;
  let insideYaw = -0.22,
    insidePitch = -0.06,
    dragging = null;
  const pointerDown = (event) => {
    if (!['passenger', 'cab'].includes(lastView) || event.button !== 0) return;
    dragging = { x: event.clientX, y: event.clientY, id: event.pointerId };
    domElement.setPointerCapture?.(event.pointerId);
  };
  const pointerMove = (event) => {
    if (!dragging) return;
    insideYaw -= (event.clientX - dragging.x) * 0.004;
    insidePitch = THREE.MathUtils.clamp(
      insidePitch + (event.clientY - dragging.y) * 0.004,
      -0.8,
      0.65,
    );
    dragging.x = event.clientX;
    dragging.y = event.clientY;
  };
  const pointerUp = () => {
    dragging = null;
  };
  domElement?.addEventListener('pointerdown', pointerDown);
  domElement?.addEventListener('pointermove', pointerMove);
  domElement?.addEventListener('pointerup', pointerUp);
  domElement?.addEventListener('pointercancel', pointerUp);
  let focusKey = null;
  const previousFocus = new THREE.Vector3();
  let manualOrbit = false;
  controls?.addEventListener('start', () => {
    manualOrbit = true;
  });
  let initialized = false;
  let lastView = null;
  let lastRequestedView = 'scenic';
  let automaticReason = null;
  let scenicBearingIndex = 0;
  let foliageOccluded = false;
  let lastDirection = 1;
  let elapsed = 0;
  let lastClearance = 0;
  let lastLift = 0;
  let lastFoliageClearance = null;

  const groundAt = (position) => {
    const y = terrain(position.x - center(position.z), position.z);
    return Number.isFinite(y) ? y : -10000;
  };
  const canopyAt = (position) => {
    const height = foliageHeight?.(position.x, position.z);
    return Number.isFinite(height) ? height : -Infinity;
  };
  const exteriorHeightAt = (position, subject) => {
    // Trees immediately alongside the train must not send the eye far into the sky.
    // Check horizontal distance so lifting the eye does not change the exclusion zone.
    const outsideCarriage = Math.hypot(position.x - subject.x, position.z - subject.z) >= 8;
    return Math.max(groundAt(position), outsideCarriage ? canopyAt(position) : -Infinity);
  };
  function clearTerrain(eye, subject, clearance = 2) {
    const result = eye.clone();
    result.y = Math.max(result.y, exteriorHeightAt(result, subject) + clearance);
    // Solve for the eye height that keeps each sightline sample above ground.
    // Sampling starts outside the immediate carriage; it is terrain, not a cab test.
    const sample = new THREE.Vector3();
    for (let i = 2; i <= 32; i++) {
      const t = i / 32;
      sample.lerpVectors(subject, result, t);
      const required = exteriorHeightAt(sample, subject) + clearance;
      if (sample.y < required)
        result.y = Math.max(result.y, subject.y + (required - subject.y) / t);
    }
    return result;
  }
  function bestExteriorEye(desired, subject) {
    let best = null;
    let cost = Infinity;
    // A nearer view often clears a steep valley wall with less altitude gain.
    for (const fraction of [1, 0.78, 0.56, 0.34, 0.2]) {
      const candidate = subject.clone().lerp(desired, fraction);
      candidate.y = desired.y;
      const cleared = clearTerrain(candidate, subject);
      const deviation = cleared.distanceTo(desired);
      const heightCost = Math.max(0, cleared.y - desired.y) * 1.8;
      if (deviation + heightCost < cost) {
        best = cleared;
        cost = deviation + heightCost;
      }
    }
    return best;
  }
  function clearScenic(eye, subject, includeCanopy = true) {
    const result = eye.clone();
    const canopyCeiling = subject.y + 62;
    result.y = Math.max(
      result.y,
      groundAt(result) + 2,
      includeCanopy ? canopyAt(result) + 2 : -Infinity,
    );
    const sample = new THREE.Vector3();
    for (let i = 2; i <= 32; i++) {
      const fraction = i / 32;
      sample.lerpVectors(subject, result, fraction);
      const groundRequired = subject.y + (groundAt(sample) + 2 - subject.y) / fraction;
      result.y = Math.max(result.y, groundRequired);
      if (includeCanopy && Math.hypot(sample.x - subject.x, sample.z - subject.z) >= 8) {
        const canopyRequired = subject.y + (canopyAt(sample) + 2 - subject.y) / fraction;
        // A coarse canopy cell next to the track must not collapse the wide shot
        // or demand an aircraft-height eye. Other bearings are considered first.
        result.y = Math.max(result.y, Math.min(canopyCeiling, canopyRequired));
      }
    }
    let occluded = 0;
    for (let i = 2; i <= 32; i++) {
      sample.lerpVectors(subject, result, i / 32);
      if (
        Math.hypot(sample.x - subject.x, sample.z - subject.z) >= 8 &&
        sample.y < canopyAt(sample) + 1.9
      )
        occluded++;
    }
    return { eye: result, occluded };
  }
  function wideScenicEye(position, subject, forward, side, direction) {
    const arc = Math.sin(elapsed * 0.035 + position.z * 0.001) * 0.14;
    const preferred = direction > 0 ? -2.55 : -0.59;
    const offsets = [0, -0.32, 0.32, -0.64, 0.64, -1.02, 1.02, Math.PI];
    const candidates = offsets.map((offset, index) => {
      const bearing = preferred + offset + arc;
      const eye = position
        .clone()
        .addScaledVector(side, Math.cos(bearing) * 96)
        .addScaledVector(forward, Math.sin(bearing) * 96);
      eye.y = position.y + 54 + Math.sin(elapsed * 0.025) * 2;
      const cleared = clearScenic(eye, subject);
      const lift = Math.max(0, cleared.eye.y - eye.y);
      return { ...cleared, index, cost: lift * 2 + cleared.occluded * 5 + Math.abs(offset) * 8 };
    });
    const best = candidates.reduce((a, b) => (a.cost <= b.cost ? a : b));
    const previous = candidates[scenicBearingIndex];
    // Keep the current side until another view has a substantial visibility gain.
    const selected = previous && previous.cost < best.cost + 12 ? previous : best;
    scenicBearingIndex = selected.index;
    foliageOccluded = selected.occluded > 0;
    return selected.eye;
  }
  function keepWide(eye, subject) {
    const horizontal = new THREE.Vector3(eye.x - subject.x, 0, eye.z - subject.z);
    if (horizontal.length() < 90) {
      if (horizontal.lengthSq() < 0.001) horizontal.set(-1, 0, 0);
      horizontal.setLength(90);
      eye.x = subject.x + horizontal.x;
      eye.z = subject.z + horizontal.z;
    }
    eye.y = Math.max(eye.y, subject.y + 42);
    return eye;
  }
  function clearStaticObjects(eye, subject, keepRange = false, includeCanopy = true) {
    if (!staticColliders.length) return eye;
    const delta = eye.clone().sub(subject);
    const distance = delta.length();
    ray.set(subject, delta.normalize());
    ray.near = 8;
    ray.far = distance;
    const visible = staticColliders.filter((object) => {
      for (let node = object; node; node = node.parent) if (!node.visible) return false;
      object.updateWorldMatrix(true, false);
      return true;
    });
    const hit = ray.intersectObjects(visible, false)[0];
    if (hit) {
      if (keepRange) {
        const roof = new THREE.Box3().setFromObject(hit.object).max.y;
        eye.y = Math.max(
          eye.y,
          subject.y + (roof + 3 - subject.y) / Math.max(0.08, hit.distance / distance),
        );
      } else eye.copy(subject).addScaledVector(delta, Math.max(8, hit.distance - 2));
    }
    return keepRange ? clearScenic(eye, subject, includeCanopy).eye : clearTerrain(eye, subject);
  }
  const api = {
    update({
      dt = 0,
      distance,
      direction = 1,
      view = 'scenic',
      time,
      snap = false,
      inTunnel = false,
      focusPose = null,
    }) {
      if (!Number.isFinite(dt) || dt < 0 || !Number.isFinite(distance))
        throw new TypeError('Camera dt and route distance must be finite; dt must be nonnegative.');
      if (initialized && !manualOrbit) {
        camera.position.copy(baseEye);
        camera.quaternion.copy(baseRotation);
      }
      const currentTrackLength = track.getLength?.() ?? trackLength;
      const requested = view === 'driver' ? 'cab' : view === 'orbit' ? 'scenic' : view;
      if (!['scenic', 'follow', 'cab', 'passenger', 'vista'].includes(requested))
        throw new Error(`Unknown camera mode: ${view}`);
      const mode = inTunnel && requested !== 'passenger' ? 'cab' : requested;
      automaticReason = mode !== requested ? 'tunnel' : null;
      lastRequestedView = requested;
      foliageOccluded = false;
      direction = direction === -1 ? -1 : 1;
      elapsed = Number.isFinite(time) ? time : elapsed + dt;
      const change = !initialized || lastView !== mode || lastDirection !== direction;
      const instant = snap || change;
      if (instant) {
        manualOrbit = false;
        dragging = null;
      }
      if (change) {
        insideYaw = mode === 'passenger' ? -0.22 : 0;
        insidePitch = mode === 'cab' ? -0.12 : -0.06;
      }
      const near = ['cab', 'passenger'].includes(mode) ? 0.06 : exteriorNear;
      const fov = ['cab', 'passenger'].includes(mode) ? 60 : exteriorFov;
      if (camera.fov !== fov) {
        camera.fov = fov;
        camera.updateProjectionMatrix();
      }
      if (camera.near !== near) {
        camera.near = near;
        camera.updateProjectionMatrix();
      }
      if (controls) controls.enabled = mode === 'scenic';
      if (mode === 'scenic' && focusPose) {
        const focus = new THREE.Vector3(...focusPose.target);
        if (focusKey !== focusPose.key || snap || !initialized) {
          camera.position.set(...focusPose.eye);
          if (controls) controls.target.copy(focus);
          else camera.lookAt(focus);
        } else {
          const delta = focus.clone().sub(previousFocus);
          camera.position.add(delta);
          controls?.target.add(delta);
        }
        if (controls) {
          controls.enablePan = true;
          controls.minDistance = focusPose.minDistance ?? 3;
          controls.maxDistance = focusPose.maxDistance ?? 600;
          controls.update(dt);
          look.copy(controls.target);
        } else look.copy(focus);
        camera.lookAt(look);
        camera.updateMatrixWorld(true);
        previousFocus.copy(focus);
        focusKey = focusPose.key;
        baseEye.copy(camera.position);
        baseRotation.copy(camera.quaternion);
        initialized = true;
        manualOrbit = true;
        lastView = mode;
        lastDirection = direction;
        return api.state();
      }
      if (focusKey !== null) {
        focusKey = null;
        if (controls) {
          controls.enablePan = false;
          controls.minDistance = 18;
          controls.maxDistance = 125;
        }
      }
      if (mode === 'cab' || mode === 'passenger') {
        const pose =
          mode === 'cab' && insideYaw === 0 && insidePitch === -0.12
            ? cabPose(track, distance, currentTrackLength, direction)
            : interiorPose(
                track,
                distance,
                currentTrackLength,
                direction,
                mode === 'passenger',
                insideYaw,
                insidePitch,
              );
        camera.position.copy(pose.eye);
        look.copy(pose.target);
        camera.lookAt(look);
        previousTarget.copy(pose.trainPosition);
        lastClearance = camera.position.y - groundAt(camera.position);
        lastLift = 0;
        lastFoliageClearance = null;
      } else {
        const t = THREE.MathUtils.clamp(distance / currentTrackLength, 0.001, 0.999);
        const position = track.getPointAt(t);
        const forward = track.getTangentAt(t).multiplyScalar(direction);
        const side = new THREE.Vector3().crossVectors(up, forward).normalize();
        const subject = position.clone().addScaledVector(up, 3);
        const target = subject.clone();
        const desired = position.clone();
        if (mode === 'vista') {
          const vista = vistaAt?.(position.z);
          if (vista) {
            desired.set(...vista.eye);
            target.set(...vista.target);
          } else {
            desired.addScaledVector(side, 42).addScaledVector(forward, -50);
            desired.y += 36;
            target.addScaledVector(side, -80);
          }
        } else if (mode === 'scenic') {
          desired.copy(wideScenicEye(position, subject, forward, side, direction));
          target.addScaledVector(forward, -TRAIN_SPAN / 2);
        } else if (mode === 'follow') {
          desired.addScaledVector(forward, -(TRAIN_SPAN + 24)).addScaledVector(side, -5);
          desired.y += 17;
          target.addScaledVector(forward, -TRAIN_SPAN / 2);
        } else {
          desired.addScaledVector(side, -45).addScaledVector(forward, -30);
          desired.y += 25;
        }
        let safe =
          mode === 'scenic' || mode === 'vista' ? desired : bestExteriorEye(desired, subject);
        if (mode === 'scenic' && manualOrbit && controls) {
          if (instant) camera.position.copy(safe);
          else camera.position.add(subject.clone().sub(previousTarget));
          controls.target.copy(subject);
          controls.update(dt);
          worldEye.copy(camera.position);
          // Preserve user orientation; a nearer orbit avoids extreme lifts in dense crowns.
          safe = clearStaticObjects(bestExteriorEye(worldEye, subject), subject);
          camera.position.copy(safe);
          look.copy(subject);
        } else {
          if (mode === 'scenic' && !instant)
            camera.position.add(subject.clone().sub(previousTarget));
          camera.position.lerp(safe, instant ? 1 : 1 - Math.exp(-dt * 2.8));
          // Check after interpolation too. Scenic keeps its wide range rather than
          // shortening the shot to get in front of the obstructing hillside.
          if (mode === 'scenic') {
            const corrected = clearScenic(keepWide(camera.position, subject), subject, instant);
            foliageOccluded = corrected.occluded > 0;
            camera.position.copy(clearStaticObjects(corrected.eye, subject, true, instant));
          } else if (mode === 'vista') {
            camera.position.y = Math.max(camera.position.y, groundAt(camera.position) + 5);
          } else
            camera.position.copy(
              clearStaticObjects(bestExteriorEye(camera.position, subject), subject),
            );
          look.lerp(target, instant ? 1 : 1 - Math.exp(-dt * 4));
          if (controls && mode === 'scenic') {
            controls.target.copy(look);
            // Pointer input starts from this target and the current automatic pose.
          }
        }
        camera.lookAt(look);
        previousTarget.copy(subject);
        lastClearance = camera.position.y - groundAt(camera.position);
        lastLift = Math.max(0, camera.position.y - desired.y);
        const canopy = canopyAt(camera.position);
        lastFoliageClearance = Number.isFinite(canopy) ? camera.position.y - canopy : null;
      }
      camera.updateMatrixWorld(true);
      baseEye.copy(camera.position);
      baseRotation.copy(camera.quaternion);
      initialized = true;
      lastView = mode;
      lastDirection = direction;
      return api.state();
    },
    state() {
      return {
        view: lastView,
        requestedView: lastRequestedView,
        automaticReason,
        foliageOccluded,
        direction: lastDirection,
        orbitEnabled: Boolean(controls?.enabled),
        manualOrbit,
        position: camera.position.toArray(),
        target: look.toArray(),
        terrainClearance: lastClearance,
        terrainLift: lastLift,
        foliageClearance: lastFoliageClearance,
        colliderCount: staticColliders.length,
      };
    },
    dispose() {
      controls?.dispose();
      domElement?.removeEventListener('pointerdown', pointerDown);
      domElement?.removeEventListener('pointermove', pointerMove);
      domElement?.removeEventListener('pointerup', pointerUp);
      domElement?.removeEventListener('pointercancel', pointerUp);
    },
  };
  return api;
}
