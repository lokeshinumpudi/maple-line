import { TRAIN_CLEARANCE } from '../train/consist.js';
import { createPassingLoopCurve } from './passing-loop.js';

const ENDPOINTS = [410, 640];
const BLADE_LENGTH = 16;
const THROAT_RADIUS = 20;
const PLAYER_HALF_FOOTPRINT = TRAIN_CLEARANCE + 15;
const THROW_SECONDS = 1.2;
const SETTLE_SECONDS = 0.2;
const EPSILON = 1e-6;

/** Visual interlocking for the existing Momiji loop; it does not reroute train physics. */
export function createRailwayPoints({ THREE, scene, railPoint }) {
  if (!THREE || !scene?.isObject3D || typeof railPoint !== 'function')
    throw new TypeError('Railway points require Three.js, a scene and a rail sampler.');
  const root = new THREE.Group();
  root.name = 'railway / Momiji working points';
  const geometry = new THREE.BoxGeometry(1, 1, 1);
  const structure = new THREE.MeshStandardMaterial({ roughness: 0.78 });
  const steel = new THREE.MeshStandardMaterial({
    color: '#9da6a3',
    roughness: 0.36,
    metalness: 0.65,
  });
  const indicatorMaterial = new THREE.MeshStandardMaterial({ color: '#f0dfad', roughness: 0.65 });
  const up = new THREE.Vector3(0, 1, 0);
  const axis = new THREE.Vector3(0, 0, 1);
  const pose = new THREE.Object3D();
  const curve = createPassingLoopCurve({ THREE, railPoint });
  const parts = [];
  let disposed = false;
  let requestedRoute = 'main';
  function vector(value) {
    return Array.isArray(value) && value.length === 3 && value.every(Number.isFinite)
      ? new THREE.Vector3(...value)
      : null;
  }
  function mainFrame(z) {
    const point = railPoint(z);
    const forward = railPoint(z + 0.1)
      .sub(railPoint(z - 0.1))
      .normalize();
    const normal = new THREE.Vector3(forward.z, 0, -forward.x).normalize();
    return { point, forward, normal };
  }
  function loopFrame(z) {
    // Invert the authored curve's monotonic route coordinate rather than inventing a second branch.
    let low = 0,
      high = 1;
    for (let i = 0; i < 24; i++) {
      const middle = (low + high) / 2;
      if (curve.getPoint(middle).z < z) low = middle;
      else high = middle;
    }
    const t = (low + high) / 2;
    const point = curve.getPoint(t);
    const tangent = curve.getTangent(t).normalize();
    return { point, normal: new THREE.Vector3(tangent.z, 0, -tangent.x).normalize() };
  }
  function mesh(name, material) {
    const object = new THREE.Mesh(geometry, material);
    object.name = `points / ${name}`;
    object.castShadow = true;
    root.add(object);
    return object;
  }
  function rod(object, from, to, width, height = width) {
    object.position.copy(from).add(to).multiplyScalar(0.5);
    const tangent = to.clone().sub(from);
    object.scale.set(width, height, tangent.length());
    object.quaternion.setFromUnitVectors(axis, tangent.normalize());
  }
  function staticPart(frame, x, y, z, sx, sy, sz, color) {
    const rotation = new THREE.Quaternion().setFromRotationMatrix(
      new THREE.Matrix4().makeBasis(
        frame.normal,
        new THREE.Vector3().crossVectors(frame.forward, frame.normal),
        frame.forward,
      ),
    );
    parts.push({
      position: frame.point
        .clone()
        .addScaledVector(frame.normal, x)
        .addScaledVector(up, y)
        .addScaledVector(frame.forward, z),
      rotation,
      scale: new THREE.Vector3(sx, sy, sz),
      color,
    });
  }
  const turnouts = ENDPOINTS.map((z, index) => {
    const frame = mainFrame(z);
    const interior = index === 0 ? 1 : -1;
    const tail = mainFrame(z + interior * BLADE_LENGTH);
    const branch = loopFrame(z + interior * BLADE_LENGTH);
    const blades = [-1, 1].map((side) => ({
      object: mesh(`${z} movable ${side < 0 ? 'left' : 'right'} blade`, steel),
      tip: frame.point
        .clone()
        .addScaledVector(frame.normal, side * 0.96)
        .addScaledVector(up, 0.11),
      main: tail.point
        .clone()
        .addScaledVector(tail.normal, side * 0.96)
        .addScaledVector(up, 0.11),
      loop: branch.point
        .clone()
        .addScaledVector(branch.normal, side * 0.96)
        .addScaledVector(up, 0.11),
    }));
    staticPart(frame, 2.9, 0.12, 0, 1.2, 0.22, 1.4, '#565e59');
    staticPart(frame, 3.15, 0.42, 0, 0.36, 0.55, 0.6, '#3d4c49');
    staticPart(frame, 3.15, 1.3, 0, 0.09, 1.35, 0.09, '#8a948e');
    for (const offset of [2, 5, 8, 11, 14])
      staticPart(mainFrame(z + offset * interior), 0, 0.02, 0, 2.7, 0.08, 0.26, '#504638');
    const lever = mesh(`${z} linked point lever`, indicatorMaterial);
    const indicator = mesh(`${z} route indicator`, indicatorMaterial);
    const linkage = mesh(`${z} blade linkage`, steel);
    const pivot = frame.point.clone().addScaledVector(frame.normal, 2.95).addScaledVector(up, 0.42);
    const indicatorPivot = frame.point
      .clone()
      .addScaledVector(frame.normal, 3.15)
      .addScaledVector(up, 2.04);
    return {
      z,
      frame,
      blades,
      lever,
      indicator,
      linkage,
      pivot,
      indicatorPivot,
      alignment: 0,
      settled: SETTLE_SECONDS,
      occupiedBy: [],
      moving: false,
    };
  });
  const staticMesh = new THREE.InstancedMesh(geometry, structure, parts.length);
  staticMesh.name = 'points / shared bases, sleepers and route posts';
  staticMesh.castShadow = true;
  staticMesh.receiveShadow = true;
  parts.forEach((part, index) => {
    pose.position.copy(part.position);
    pose.quaternion.copy(part.rotation);
    pose.scale.copy(part.scale);
    pose.updateMatrix();
    staticMesh.setMatrixAt(index, pose.matrix);
    staticMesh.setColorAt(index, new THREE.Color(part.color));
  });
  staticMesh.instanceMatrix.needsUpdate = true;
  staticMesh.instanceColor.needsUpdate = true;
  staticMesh.computeBoundingSphere();
  root.add(staticMesh);
  scene.add(root);
  function render(turnout) {
    const value = turnout.alignment;
    for (const blade of turnout.blades)
      rod(blade.object, blade.tip, blade.main.clone().lerp(blade.loop, value), 0.085, 0.11);
    const tip = turnout.pivot
      .clone()
      .addScaledVector(turnout.frame.normal, 0.54 - value * 1.08)
      .addScaledVector(up, 0.65);
    rod(turnout.lever, turnout.pivot, tip, 0.075);
    turnout.indicator.position.copy(turnout.indicatorPivot);
    turnout.indicator.scale.set(0.13, 0.15, 0.75);
    const direction = turnout.frame.forward
      .clone()
      .addScaledVector(turnout.frame.normal, -value * 0.85)
      .normalize();
    turnout.indicator.quaternion.setFromUnitVectors(axis, direction);
    const tie = turnout.frame.point
      .clone()
      .addScaledVector(up, 0.08)
      .addScaledVector(turnout.frame.forward, turnout.z === 410 ? 1.4 : -1.4)
      .addScaledVector(turnout.frame.normal, -value * 0.18);
    rod(
      turnout.linkage,
      tie.clone().addScaledVector(turnout.frame.normal, -1.1),
      turnout.pivot.clone().setY(tie.y),
      0.05,
    );
  }
  turnouts.forEach(render);
  function getState() {
    const aligned = (value) =>
      !disposed &&
      turnouts.every((t) => Math.abs(t.alignment - value) < EPSILON && t.settled >= SETTLE_SECONDS);
    return {
      requestedRoute,
      mainAligned: aligned(0),
      loopAligned: aligned(1),
      moving: !disposed && turnouts.some((t) => t.moving),
      locked: !disposed && turnouts.some((t) => t.occupiedBy.length > 0),
      disposed,
      throwSeconds: THROW_SECONDS,
      settleSeconds: SETTLE_SECONDS,
      renderBatches: root.children.length,
      turnouts: turnouts.map((t) => ({
        z: t.z,
        alignment: t.alignment,
        route:
          Math.abs(t.alignment) < EPSILON
            ? 'main'
            : Math.abs(t.alignment - 1) < EPSILON
              ? 'loop'
              : 'moving',
        occupied: t.occupiedBy.length > 0,
        locked: t.occupiedBy.length > 0,
        occupiedBy: [...t.occupiedBy],
        moving: t.moving,
        settled: t.settled >= SETTLE_SECONDS,
      })),
    };
  }
  function update({ dt = 0, dutyState, trainZ, trainSpeed, passingState } = {}) {
    if (disposed) return getState();
    if (!Number.isFinite(dt) || dt < 0)
      throw new TypeError('Point dt must be finite and nonnegative.');
    const step = Math.min(dt, 0.1);
    requestedRoute =
      dutyState?.active !== false &&
      (dutyState?.phase === 'passing' ||
        (dutyState?.phase === 'routing' && dutyState.route === 'freight'))
        ? 'loop'
        : 'main';
    const target = requestedRoute === 'loop' ? 1 : 0;
    for (const turnout of turnouts) {
      const occupiedBy = [];
      if (!Number.isFinite(trainZ) || !Number.isFinite(trainSpeed))
        occupiedBy.push('unknown-player');
      else if (Math.abs(trainZ - turnout.z) <= THROAT_RADIUS + PLAYER_HALF_FOOTPRINT)
        occupiedBy.push('player');
      for (const [index, car] of (passingState?.cars ?? []).entries()) {
        if (!car.visible) continue;
        const position = vector(car.position);
        if (!position || Math.abs(position.z - turnout.z) <= THROAT_RADIUS + 6)
          occupiedBy.push(`passing-car-${index + 1}`);
      }
      turnout.occupiedBy = occupiedBy;
      const delta = target - turnout.alignment;
      turnout.moving = Math.abs(delta) > EPSILON && occupiedBy.length === 0;
      if (turnout.moving) {
        turnout.alignment += Math.sign(delta) * Math.min(Math.abs(delta), step / THROW_SECONDS);
        if (Math.abs(turnout.alignment - target) < EPSILON) turnout.alignment = target;
        turnout.settled = 0;
        render(turnout);
      } else if (Math.abs(delta) <= EPSILON)
        turnout.settled = Math.min(SETTLE_SECONDS, turnout.settled + step);
      else turnout.settled = 0;
    }
    return getState();
  }
  function dispose() {
    if (disposed) return;
    disposed = true;
    root.removeFromParent();
    staticMesh.dispose();
    geometry.dispose();
    structure.dispose();
    steel.dispose();
    indicatorMaterial.dispose();
  }
  return { update, getState, dispose };
}
