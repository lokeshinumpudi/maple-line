/**
 * Character motion that works on any humanoid skeleton: hand sockets that props attach to,
 * analytic two-bone IK, a steering layer between the simulation and the drawn body,
 * stride-matched playback and clip-pair cross-fades. The per-frame layers that use these
 * (look-at, foot planting, holds, idle life) are in character-rig.js.
 *
 * Nothing here knows about Maple Line's cast. Bones are canonical names from
 * characters/humanoid-bones.js (hips, upperArmL, handR, footL, indexL1, ...), so a rig plugs in
 * by naming its joints there: a glTF `boneMap` extra, a table, or a known convention.
 */

/** Finger chains curled by the grip, by canonical root name (thumbL1, indexR1, ...). */
export const FINGERS = Object.freeze(['thumb', 'index', 'middle', 'ring', 'little']);

/** Palm centre along the hand, as a fraction of forearm length (build.py uses the same). */
export const PALM_FRACTION = 0.3;

// ---- small math helpers (THREE passed in, so this module has no import side effects) ----

export function makeScratch(THREE) {
  return {
    a: new THREE.Vector3(),
    b: new THREE.Vector3(),
    c: new THREE.Vector3(),
    d: new THREE.Vector3(),
    e: new THREE.Vector3(),
    q: new THREE.Quaternion(),
    q2: new THREE.Quaternion(),
    q3: new THREE.Quaternion(),
    m: new THREE.Matrix4(),
  };
}

/**
 * Analytic two-bone IK on positions. Given the chain root, joint and end and a target,
 * returns where the joint and end must go so the end reaches the target (or points at it,
 * fully stretched, when out of reach). The joint bends toward `pole`. Pure: inputs are not
 * modified. Lengths are preserved.
 */
export function solveTwoBone(THREE, root, joint, end, target, pole) {
  const upper = root.distanceTo(joint);
  const lower = joint.distanceTo(end);
  const toTarget = new THREE.Vector3().subVectors(target, root);
  let reach = toTarget.length();
  const direction =
    reach > 1e-6
      ? toTarget.clone().divideScalar(reach)
      : new THREE.Vector3().subVectors(end, root).normalize();
  const reached = reach <= upper + lower && reach >= Math.abs(upper - lower);
  reach = Math.min(upper + lower - 1e-5, Math.max(Math.abs(upper - lower) + 1e-5, reach));
  // Bend direction: the pole, then the current joint, projected off the reach direction.
  const bend = new THREE.Vector3();
  for (const hint of [pole, joint]) {
    if (!hint) continue;
    bend.subVectors(hint, root);
    bend.addScaledVector(direction, -bend.dot(direction));
    if (bend.lengthSq() > 1e-10) break;
  }
  if (bend.lengthSq() <= 1e-10) {
    // No usable hint: any direction perpendicular to the reach.
    bend.set(direction.y, -direction.x, 0);
    if (bend.lengthSq() <= 1e-10) bend.set(0, direction.z, -direction.y);
  }
  bend.normalize();
  const cos = (upper * upper + reach * reach - lower * lower) / (2 * upper * reach);
  const angle = Math.acos(Math.min(1, Math.max(-1, cos)));
  const jointOut = root
    .clone()
    .addScaledVector(direction, Math.cos(angle) * upper)
    .addScaledVector(bend, Math.sin(angle) * upper);
  const endOut = root.clone().addScaledVector(direction, reach);
  return { joint: jointOut, end: endOut, reached, reach };
}

/** Rotate a bone so its world orientation changes by `delta` (a world-space rotation). */
export function rotateBoneWorld(bone, delta, s) {
  bone.getWorldQuaternion(s.q2);
  s.q2.premultiply(delta);
  bone.parent.getWorldQuaternion(s.q3).invert();
  bone.quaternion.copy(s.q3.multiply(s.q2));
  bone.updateMatrixWorld(true);
}

/** Set a bone's world orientation, blended by weight from its current one. */
export function setBoneWorldQuaternion(bone, world, weight, s) {
  bone.parent.getWorldQuaternion(s.q3).invert();
  s.q2.copy(s.q3).multiply(world);
  bone.quaternion.slerp(s.q2, weight);
  bone.updateMatrixWorld(true);
}

/**
 * Two-bone IK on real bones: rotate `upper` and `lower` so `end` reaches `target` (world),
 * blended by `weight`. Twist from the animation is kept; only swing is added. A partial
 * weight blends the two bones' rotations from the animated pose to the solved one, so the
 * effect fades to nothing as the weight does (blending the target instead would still
 * re-bend the elbow into the pole's plane at a tiny weight, and pop when the IK stops).
 */
export function applyTwoBoneIK(THREE, upper, lower, end, target, pole, weight = 1, s = null) {
  if (!(weight > 0)) return null;
  s ??= makeScratch(THREE);
  const before = weight < 1 ? [upper.quaternion.clone(), lower.quaternion.clone()] : null;
  const a = upper.getWorldPosition(new THREE.Vector3());
  const b = lower.getWorldPosition(new THREE.Vector3());
  const c = end.getWorldPosition(new THREE.Vector3());
  const solved = solveTwoBone(THREE, a, b, c, target, pole);
  s.a.subVectors(b, a).normalize();
  s.b.subVectors(solved.joint, a).normalize();
  s.q.setFromUnitVectors(s.a, s.b);
  rotateBoneWorld(upper, s.q, s);
  lower.getWorldPosition(b);
  end.getWorldPosition(c);
  s.a.subVectors(c, b).normalize();
  s.b.subVectors(solved.end, b).normalize();
  s.q.setFromUnitVectors(s.a, s.b);
  rotateBoneWorld(lower, s.q, s);
  if (before) {
    upper.quaternion.copy(before[0].slerp(upper.quaternion, weight));
    lower.quaternion.copy(before[1].slerp(lower.quaternion, weight));
    upper.updateMatrixWorld(true);
  }
  return solved;
}

// ---- bind pose, sockets and props ---------------------------------------------------------

/** Bind-pose world matrices by bone, from the skinned meshes' inverse bind matrices. */
function bindMatrices(THREE, root) {
  const out = new Map();
  root.updateMatrixWorld(true);
  root.traverse((node) => {
    if (!node.isSkinnedMesh) return;
    node.skeleton.bones.forEach((bone, i) => {
      if (out.has(bone)) return;
      out.set(
        bone,
        new THREE.Matrix4()
          .copy(node.bindMatrix)
          .multiply(node.skeleton.boneInverses[i].clone().invert()),
      );
    });
  });
  return out;
}

/**
 * The canonical hand socket frame (in the model's bind space): origin at the palm centre,
 * +Y from wrist to fingers, +Z out of the palm (toward the body for hanging arms, down in a
 * T-pose), +X = Y x Z. Characters face +Z with their left side at +X.
 */
export function handSocketFrame(THREE, { wrist, elbow, side, fingers = null, palmNormal = null }) {
  const along = new THREE.Vector3()
    .subVectors(fingers ?? wrist, fingers ? wrist : elbow)
    .normalize();
  const forearm = wrist.distanceTo(elbow);
  const normal = palmNormal
    ? new THREE.Vector3(...palmNormal)
    : new THREE.Vector3(side === 'L' ? -1 : 1, -1, 0);
  normal.addScaledVector(along, -normal.dot(along)).normalize();
  const across = new THREE.Vector3().crossVectors(along, normal);
  const origin = wrist.clone().addScaledVector(along, PALM_FRACTION * forearm);
  return new THREE.Matrix4().makeBasis(across, along, normal).setPosition(origin);
}

/**
 * Add a socket Object3D under each hand bone (named socket.hand.L / .R). Existing nodes
 * named that way (an authored socket) are kept. Returns { L, R } sockets.
 */
export function createHandSockets(THREE, root, bones, { palmNormals = {} } = {}) {
  const bind = bindMatrices(THREE, root);
  const position = (bone) =>
    new THREE.Vector3().setFromMatrixPosition(bind.get(bone) ?? bone.matrixWorld);
  const sockets = {};
  for (const side of ['L', 'R']) {
    const hand = bones[`hand${side}`];
    const elbow = bones[`lowerArm${side}`];
    if (!hand || !elbow) continue;
    const name = `socket.hand.${side}`;
    let socket = hand.children.find((child) => child.name === name);
    if (!socket) {
      const finger = bones[`middle${side}1`] ?? bones[`index${side}1`] ?? null;
      const frame = handSocketFrame(THREE, {
        wrist: position(hand),
        elbow: position(elbow),
        side,
        fingers: finger ? position(finger) : null,
        palmNormal: palmNormals[side] ?? null,
      });
      const handBind = bind.get(hand) ?? hand.matrixWorld.clone();
      socket = new THREE.Object3D();
      socket.name = name;
      new THREE.Matrix4()
        .copy(handBind)
        .invert()
        .multiply(frame)
        .decompose(socket.position, socket.quaternion, socket.scale);
      hand.add(socket);
    }
    sockets[side] = socket;
  }
  return sockets;
}

/**
 * Default grips for props that carry no extras of their own: which hand, one or two hands,
 * an offset in socket space and, for two hands, where the second palm goes (in prop space).
 */
export const PROP_GRIPS = Object.freeze({
  phone: { hand: 'right', hold: 'one' },
  radio: {
    hand: 'left',
    hold: 'one',
    // Cradled at the chest with both hands while standing still: the left hand keeps the
    // handle, the right palm comes up under the case (prop space, metres).
    cradle: { at: [0.02, 1.06, 0.3], turn: -1.2, grip2: [0, 0.16, 0.05, 0.7071, 0, 0, 0.7071] },
  },
  newspaper: { hand: 'right', hold: 'two' },
});

/**
 * Attach every prop node (userData.prop, or a name in PROP_GRIPS) to its hand socket.
 * Props exported by build.py are already in socket space, so the default offset is zero.
 * `overrides` (by prop name, from characters/cast-tuning.json) win over the prop's extras.
 */
export function attachProps(THREE, root, sockets, grips = PROP_GRIPS, overrides = {}) {
  const props = [];
  const nodes = [];
  root.traverse((node) => {
    if (node.isSkinnedMesh) return; // skinned props follow their own bones
    if (node.userData?.prop || (grips[node.name] && node.isMesh)) nodes.push(node);
  });
  for (const node of nodes) {
    const name = node.userData.prop ?? node.name;
    const spec = { ...grips[name], ...node.userData, ...overrides[name] };
    const side = spec.hand === 'left' ? 'L' : 'R';
    const socket = sockets[side];
    if (!socket) continue;
    socket.add(node);
    const offset = spec.offset ?? [0, 0, 0];
    node.position.set(offset[0], offset[1], offset[2]);
    if (spec.rotation) node.quaternion.set(...spec.rotation);
    else node.quaternion.identity();
    node.scale.setScalar(1);
    node.frustumCulled = false;
    const grip2 = spec.grip2 ?? null;
    props.push({
      name,
      node,
      side,
      other: side === 'L' ? 'R' : 'L',
      hold: spec.hold ?? (grip2 ? 'two' : 'one'),
      grip2,
      cradle: spec.cradle ?? grips[name]?.cradle ?? null,
    });
  }
  return props;
}

// ---- steering: simulation position to drawn position --------------------------------------

const wrap = (angle) => Math.atan2(Math.sin(angle), Math.cos(angle));

export const STEERING_DEFAULTS = Object.freeze({
  maxSpeed: 2.1, // m/s, catching up when the simulation runs ahead
  accel: 1.8, // m/s^2
  decel: 2.6,
  followTime: 0.45, // s: how far behind the simulation the body trails at a steady walk
  deadZone: 0.06, // m: closer than this and not moving, the body stays put
  startRadius: 0.22, // m: a resting body only sets off again beyond this
  settleRate: 0.12, // m/s: invisible creep that closes the last few centimetres at rest
  turnRate: 3.4, // rad/s while walking
  turnAccel: 14, // rad/s^2, so turns ease in and out instead of snapping
  turnInPlaceAngle: Math.PI / 3, // above this, a slow body stops and turns on the spot
  turnInPlaceRate: 2.4,
  faceTolerance: 0.35, // rad: standing people re-face only past this
  snapDistance: 3.5, // m: jumps (Places, alighting at a door) teleport the body
  filterTime: 0.25, // s: low-pass on the simulation position for rest and creep decisions
  lead: 0.4, // s: steer toward where the target will be this far ahead
});

/**
 * A steering layer that turns a noisy, possibly jumpy simulation position into believable
 * motion: the body only moves along its heading, turns at a limited rate with eased angular
 * velocity, stops and turns on the spot for large turns, accelerates within limits, ignores
 * sub-centimetre jitter and never walks backward. Pure JS: no THREE.
 */
export function createSteering(options = {}) {
  const o = { ...STEERING_DEFAULTS, ...options };
  const state = {
    x: 0,
    y: 0,
    z: 0,
    heading: 0,
    speed: 0,
    turnVelocity: 0,
    turning: false,
    resting: true,
    initialized: false,
  };
  // A low-passed copy of the simulation position: rest, start and creep decisions use it,
  // so frame-to-frame jitter cannot set a standing body off or drag it about.
  const filtered = { x: 0, z: 0 };
  let lastFiltered = null;
  const targetVelocity = { x: 0, z: 0 };
  function snap(target) {
    state.x = target.x;
    state.y = target.y ?? 0;
    state.z = target.z;
    state.heading = target.heading ?? state.heading;
    state.speed = 0;
    state.turnVelocity = 0;
    state.turning = false;
    state.resting = !target.moving;
    state.initialized = true;
    targetVelocity.x = targetVelocity.z = 0;
    filtered.x = target.x;
    filtered.z = target.z;
    lastFiltered = { ...filtered };
  }
  function turnToward(goal, dt, rate) {
    const error = wrap(goal - state.heading);
    // Eased angular velocity: accelerate toward the rate that would close the error, and
    // brake early enough (v^2 = 2 a d) not to overshoot.
    const brake = Math.sqrt(2 * o.turnAccel * Math.abs(error));
    const want = Math.sign(error) * Math.min(rate, brake, Math.abs(error) / Math.max(dt, 1e-3));
    const dv = want - state.turnVelocity;
    state.turnVelocity += Math.sign(dv) * Math.min(Math.abs(dv), o.turnAccel * dt);
    const step = state.turnVelocity * dt;
    state.heading = wrap(state.heading + (Math.abs(step) > Math.abs(error) ? error : step));
    return error;
  }
  return {
    state,
    options: o,
    snap,
    /**
     * @param {number} dt seconds
     * @param {{x:number, y?:number, z:number, heading?:number, moving?:boolean, hold?:boolean}} target
     *   the simulation's pose; `hold` pins the body (seated, boarding).
     */
    update(dt, target) {
      if (!state.initialized || !(dt > 0)) {
        if (!state.initialized) snap(target);
        return state;
      }
      const dx = target.x - state.x;
      const dz = target.z - state.z;
      const distance = Math.hypot(dx, dz);
      if (distance > o.snapDistance || target.hold) {
        if (target.hold) {
          // Seated or stepping through a door: follow exactly, but still turn smoothly.
          state.x = target.x;
          state.z = target.z;
          state.y = target.y ?? state.y;
          state.speed = 0;
          if (Number.isFinite(target.heading)) turnToward(target.heading, dt, o.turnInPlaceRate);
          state.turning = Math.abs(state.turnVelocity) > 0.5;
          filtered.x = target.x;
          filtered.z = target.z;
          lastFiltered = { ...filtered };
          return state;
        }
        snap(target);
        return state;
      }
      // Filtered position and its velocity (feed-forward speed for a walking target).
      const k = 1 - Math.exp(-dt / o.filterTime);
      filtered.x += (target.x - filtered.x) * k;
      filtered.z += (target.z - filtered.z) * k;
      if (lastFiltered) {
        const kv = 1 - Math.exp(-dt * 4);
        targetVelocity.x += ((filtered.x - lastFiltered.x) / dt - targetVelocity.x) * kv;
        targetVelocity.z += ((filtered.z - lastFiltered.z) / dt - targetVelocity.z) * kv;
      }
      lastFiltered = { ...filtered };
      const targetSpeed = Math.min(o.maxSpeed, Math.hypot(targetVelocity.x, targetVelocity.z));
      const moving = Boolean(target.moving);
      const fx = filtered.x - state.x;
      const fz = filtered.z - state.z;
      const settled = Math.hypot(fx, fz);

      // Rest with hysteresis: sim jitter inside the start radius never sets the body off.
      if (state.resting && (settled > o.startRadius || (moving && distance > o.deadZone * 2)))
        state.resting = false;
      if (!state.resting && !moving && distance < o.deadZone && state.speed < 0.15)
        state.resting = true;

      let desiredSpeed = 0;
      let goal = state.heading;
      if (!state.resting) {
        // Steer at a point a little ahead of the filtered target, so sampling noise and
        // corners in the route become gentle arcs instead of heading flicker.
        const lead = moving ? o.lead : 0;
        goal = Math.atan2(fx + targetVelocity.x * lead, fz + targetVelocity.z * lead);
        // Arrive: speed that reaches the target in followTime, plus the target's own speed.
        desiredSpeed = Math.min(
          o.maxSpeed,
          (moving ? targetSpeed : 0) + Math.max(0, settled - o.deadZone) / o.followTime,
        );
        if (!moving) desiredSpeed = Math.min(desiredSpeed, Math.sqrt(2 * o.decel * settled));
      } else if (Number.isFinite(target.heading)) {
        goal = target.heading;
      }
      const error = wrap(goal - state.heading);
      // Large turns from (nearly) still: stop and turn on the spot.
      if (!state.turning && Math.abs(error) > o.turnInPlaceAngle && state.speed < 0.45)
        state.turning = true;
      if (state.turning && Math.abs(error) < 0.2) state.turning = false;
      if (state.resting && Math.abs(error) < o.faceTolerance && Math.abs(state.turnVelocity) < 0.05)
        goal = state.heading; // close enough; do not fidget
      const rate = state.turning || state.resting ? o.turnInPlaceRate : o.turnRate;
      turnToward(goal, dt, rate);
      // Walk only forward; slow through sharp turns (cos of the remaining error).
      const along = state.turning ? 0 : Math.max(0, Math.cos(wrap(goal - state.heading)));
      const want = desiredSpeed * along;
      const dv = want - state.speed;
      state.speed += Math.sign(dv) * Math.min(Math.abs(dv), (dv > 0 ? o.accel : o.decel) * dt);
      state.speed = Math.max(0, state.speed);
      state.x += Math.sin(state.heading) * state.speed * dt;
      state.z += Math.cos(state.heading) * state.speed * dt;
      if (state.resting && settled > o.deadZone && settled < o.startRadius) {
        // Close the last centimetres invisibly so the body ends where the simulation is.
        const creep = Math.min(settled - o.deadZone, o.settleRate * dt) / settled;
        state.x += fx * creep;
        state.z += fz * creep;
      }
      if (Number.isFinite(target.y)) state.y += (target.y - state.y) * (1 - Math.exp(-dt * 10));
      return state;
    },
  };
}

// ---- playback -----------------------------------------------------------------------------

/** Clip timeScale that makes the feet travel at the body's actual speed. */
export function strideTimeScale(speed, clipSpeed, { min = 0.3, max = 1.6 } = {}) {
  if (!(clipSpeed > 0)) return 1;
  return Math.min(max, Math.max(min, speed / clipSpeed));
}

/** Gait clips: they blend in step. Walk variants (walk-formal, walk-carry) count too. */
const GAITS = new Set(['walk', 'hurry', 'walk-formal', 'walk-carry']);
const GESTURES = new Set([
  'wave',
  'check-phone',
  'chat',
  'stretch',
  'watch-train',
  'shelter',
  'nod-yes',
  'shake-no',
  'eat',
]);
/** Cross-fade seconds for a clip pair: short between gaits, long into and out of sitting. */
export function fadeFor(from, to) {
  if (!from || from === to) return 0;
  if (to === 'board') return 0.25;
  // Sitting down and standing up are one-shots whose ends match the poses either side.
  if (to === 'sit-enter' || to === 'sit-exit') return 0.3;
  if (from === 'sit-enter' && to === 'sit') return 0.2;
  if (from === 'sit-exit') return 0.3;
  if (to === 'sit' || from === 'sit') return 0.7;
  if (GAITS.has(from) && GAITS.has(to)) return 0.35;
  if (to === 'turn' || from === 'turn') return 0.3;
  if (GAITS.has(to)) return 0.4; // setting off
  if (GAITS.has(from)) return 0.5; // coming to a stop
  if (GESTURES.has(to)) return 0.55;
  if (GESTURES.has(from)) return 0.65;
  return 0.45;
}
export const smoothstep = (x) => {
  const t = Math.min(1, Math.max(0, x));
  return t * t * (3 - 2 * t);
};
export { GAITS };
