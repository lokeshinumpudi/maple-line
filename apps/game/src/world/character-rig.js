import {
  FINGERS,
  GAITS,
  applyTwoBoneIK,
  fadeFor,
  rotateBoneWorld,
  setBoneWorldQuaternion,
  smoothstep,
} from './character-motion.js';

/**
 * Cross-fades between clips. Each playing clip's weight follows a critically damped spring
 * toward 1 (the current clip) or 0, all with the same stiffness, and the weights are
 * normalised to sum to 1. A fade that is re-targeted halfway (a quick change of mind)
 * carries on from its present weight and speed, so it never kicks. The stiffness comes from
 * the clip pair's fade length (fadeFor). Walk and hurry stay in step when they blend (the
 * incoming gait starts at the same phase), each loop starts at a random phase the first time
 * so two people never breathe in sync, and timeScale changes are smoothed.
 */
export function createClipBlender(
  THREE,
  mixer,
  actions,
  { random = Math.random, drive = true } = {},
) {
  let current = null;
  let currentName = null;
  let targetScale = 1;
  let omega = 10;
  /** action -> { x, v }: its weight spring. */
  const weights = new Map();
  const started = new Set();
  return {
    get name() {
      return currentName;
    },
    play(name, timeScale = 1, once = false) {
      const nextName = actions.has(name) ? name : 'idle';
      const next = actions.get(nextName);
      if (!next) return;
      targetScale = timeScale;
      if (next === current) return;
      const duration = fadeFor(currentName, nextName);
      const live = weights.has(next) && next.isRunning();
      next.setLoop(once ? THREE.LoopOnce : THREE.LoopRepeat, Infinity);
      next.clampWhenFinished = once;
      if (!live) {
        next.reset();
        if (current && GAITS.has(currentName) && GAITS.has(nextName)) {
          const phase = current.time / current.getClip().duration;
          next.time = phase * next.getClip().duration;
        } else if (!once && !started.has(nextName)) {
          next.time = random() * next.getClip().duration;
        }
        next.timeScale = once ? 1 : timeScale;
        weights.set(next, { x: 0, v: 0 });
      }
      started.add(nextName);
      next.play();
      if (!current || duration <= 0) {
        for (const action of weights.keys()) if (action !== next) action.stop();
        weights.clear();
        weights.set(next, { x: 1, v: 0 });
        next.setEffectiveWeight(1);
      } else {
        // Critically damped: about 95% of the way after `duration`.
        omega = 4.7 / duration;
      }
      current = next;
      currentName = nextName;
    },
    update(dt) {
      if (current && current.loop !== THREE.LoopOnce)
        current.timeScale += (targetScale - current.timeScale) * (1 - Math.exp(-dt * 8));
      for (const [action, w] of weights) {
        spring(w, action === current ? 1 : 0, omega, dt);
        if (action !== current && w.x < 0.002 && Math.abs(w.v) < 0.05) {
          weights.delete(action);
          action.stop();
        }
      }
      let total = 0;
      for (const w of weights.values()) total += Math.max(0, w.x);
      for (const [action, w] of weights)
        action.setEffectiveWeight(
          total > 0 ? Math.max(0, w.x) / total : action === current ? 1 : 0,
        );
      // A VRM runs its mixer inside its own update, so the blender only sets weights.
      if (drive) mixer.update(dt);
    },
    get fading() {
      return Math.max(0, weights.size - 1);
    },
    /** Effective weights of the playing clips, by action (for tests and measurement). */
    weights() {
      return [...weights.keys()].map((action) => action.getEffectiveWeight());
    },
    /** The current clip's playback time and speed (for measurement). */
    get time() {
      return current ? { t: current.time, scale: current.timeScale } : null;
    },
  };
}

const approach = (value, target, rate, dt) => value + (target - value) * (1 - Math.exp(-dt * rate));

/**
 * A critically damped spring toward `target` (exact step, stable at any dt). Unlike a
 * first-order `approach`, its velocity is continuous, so a target that jumps or a layer that
 * switches on does not kick the bones it drives. `omega` is the natural frequency (1/s).
 */
export function spring(state, target, omega, dt) {
  const x = state.x - target;
  const decay = Math.exp(-omega * dt);
  const push = (state.v + omega * x) * dt;
  state.v = (state.v - omega * push) * decay;
  state.x = target + (x + push) * decay;
  return state.x;
}
const springState = (x = 0) => ({ x, v: 0 });

/** Layers the rig applies; all on by default. Switched off one by one for measurement. */
export const RIG_LAYERS = Object.freeze(['life', 'look', 'hands', 'grip', 'feet']);

/**
 * Per-frame procedural layers on a resolved skeleton, applied after the mixer: additive
 * life, look-at, hand holds (grip curl, cradles and second-hand IK) and foot planting.
 * `heightScale` is the figure's height over 1.7 m, for offsets authored in metres.
 * Call resetPose() before the mixer each frame so the layers never accumulate: it puts back
 * the pose the clips made last frame (captured at the start of apply()).
 *
 * `bones` are the canonical bones the layers write (a VRM's normalized bones); `raw` are the
 * rendered joints the hand sockets hang from (a VRM's skinned bones, or the same bones on a
 * plain glTF rig). Positions agree between the two; orientations differ by a fixed offset.
 */
export function createCharacterRig(
  THREE,
  root,
  {
    bones,
    raw = bones,
    sockets = {},
    props = [],
    face = null,
    random = Math.random,
    heightScale = 1,
  },
) {
  const s = {
    a: new THREE.Vector3(),
    b: new THREE.Vector3(),
    c: new THREE.Vector3(),
    d: new THREE.Vector3(),
    e: new THREE.Vector3(),
    q: new THREE.Quaternion(),
    q2: new THREE.Quaternion(),
    q3: new THREE.Quaternion(),
  };
  const v = () => new THREE.Vector3();
  const ONE = new THREE.Vector3(1, 1, 1);
  const chest = bones.upperChest ?? bones.chest;
  const rest = new Map();
  for (const bone of new Set(Object.values(bones)))
    rest.set(bone, { q: bone.quaternion.clone(), p: bone.position.clone() });
  // Bind-pose axes in each bone's own frame (the model faces +Z, up is +Y, left is +X).
  root.updateMatrixWorld(true);
  const rootBind = root.getWorldQuaternion(new THREE.Quaternion()).invert();
  const bindWorld = (bone) =>
    rootBind.clone().multiply(bone.getWorldQuaternion(new THREE.Quaternion()));
  const localAxis = (bone, x, y, z) =>
    bone ? new THREE.Vector3(x, y, z).applyQuaternion(bindWorld(bone).invert()) : null;
  const chestForward = localAxis(chest, 0, 0, 1);
  const chestUp = localAxis(chest, 0, 1, 0);
  const headForward = localAxis(bones.head, 0, 0, 1);
  // Driven hand -> rendered hand orientation, fixed at bind (identity on a plain rig).
  const handOffset = {};
  for (const side of ['L', 'R']) {
    const driven = bones[`hand${side}`];
    const shown = raw[`hand${side}`];
    if (driven && shown) handOffset[side] = bindWorld(driven).invert().multiply(bindWorld(shown));
  }
  // A socket as it sits in a hanging hand (fingers down, palm to the body), relative to the
  // body: cradles are authored in this frame so they mean the same thing on any rig.
  const hangingSocket = {};
  for (const [side, medial] of [
    ['L', -1],
    ['R', 1],
  ]) {
    const along = new THREE.Vector3(0, -1, 0);
    const normal = new THREE.Vector3(medial, 0, 0);
    const across = new THREE.Vector3().crossVectors(along, normal);
    hangingSocket[side] = new THREE.Quaternion().setFromRotationMatrix(
      new THREE.Matrix4().makeBasis(across, along, normal),
    );
  }
  const footRest = {};
  const legLength = {};
  for (const side of ['L', 'R']) {
    const foot = bones[`foot${side}`];
    const upper = bones[`upperLeg${side}`];
    const lower = bones[`lowerLeg${side}`];
    if (!foot || !upper || !lower) continue;
    const ankle = foot.getWorldPosition(v());
    const knee = lower.getWorldPosition(v());
    footRest[side] = ankle.y - root.getWorldPosition(v()).y;
    legLength[side] = upper.getWorldPosition(v()).distanceTo(knee) + knee.distanceTo(ankle);
  }

  const phase = Array.from({ length: 6 }, () => random() * Math.PI * 2);
  const breathPeriod = 3.6 + random() * 1.2;
  const shiftPeriod = 9 + random() * 5;
  let time = random() * 20;
  // Look-at: springs on yaw, pitch and weight; `aim` is the target angle pair, which only
  // moves when the wanted angle leaves a small dead zone (a speaker's head bob is ignored).
  const look = {
    yaw: springState(),
    pitch: springState(),
    weight: springState(),
    aim: null,
  };
  const feet = {
    L: { lock: null, weight: 0, ramp: 0, release: 0 },
    R: { lock: null, weight: 0, ramp: 0, release: 0 },
  };
  const holds = { L: 0, R: 0 };
  const grips = { L: 0.3, R: 0.3 };
  const second = new Map();
  const cradles = new Map();
  const rootQ = new THREE.Quaternion();
  const axes = { x: v(), y: v(), z: v() };
  const tmpMatrix = new THREE.Matrix4();
  const tmpQ = new THREE.Quaternion();

  const rotateAbout = (bone, worldAxis, angle) => {
    if (!bone || !angle) return;
    s.q.setFromAxisAngle(worldAxis, angle);
    rotateBoneWorld(bone, s.q, s);
  };

  /** Translate a bone by a world-space offset, whatever its parent's scale or rotation. */
  function moveBoneWorld(bone, offset) {
    if (!bone?.parent) return;
    const world = bone.getWorldPosition(v()).add(offset);
    bone.position.copy(bone.parent.worldToLocal(world));
    bone.updateMatrixWorld(true);
  }

  // The pose the clips produced last frame, before these layers. three.js only writes a
  // bone when its mixed value changes, so a clip holding a bone still (a single key, or a
  // settled cross-fade) does not write it again: restoring the rest pose here would leave
  // that bone at rest. Restoring the clips' own last pose keeps it where the clip put it.
  const clipPose = new Map();
  for (const [bone, r] of rest) clipPose.set(bone, { q: r.q.clone(), p: r.p.clone() });
  function resetPose() {
    for (const [bone, pose] of clipPose) {
      bone.quaternion.copy(pose.q);
      bone.position.copy(pose.p);
    }
  }
  function capturePose() {
    for (const [bone, pose] of clipPose) {
      pose.q.copy(bone.quaternion);
      pose.p.copy(bone.position);
    }
  }

  function life(dt, idle, breath) {
    time += dt;
    const b = Math.sin((time / breathPeriod) * Math.PI * 2 + phase[0]);
    const w = Math.sin((time / shiftPeriod) * Math.PI * 2 + phase[1]);
    // Breathing: the chest lifts and the shoulders rise a little on each breath.
    rotateAbout(chest, axes.x, -0.014 * b * breath);
    rotateAbout(bones.shoulderL, axes.z, 0.012 * b * breath);
    rotateAbout(bones.shoulderR, axes.z, -0.012 * b * breath);
    if (!(idle > 0.001)) return;
    // Weight shift: the hips sway over one leg and back, the spine counters so the head
    // stays over the feet, and foot planting keeps the feet where they are.
    moveBoneWorld(bones.hips, axes.x.clone().multiplyScalar(w * 0.02 * heightScale * idle));
    rotateAbout(bones.hips, axes.z, 0.035 * w * idle);
    rotateAbout(bones.spine, axes.z, -0.025 * w * idle);
    rotateAbout(chest, axes.z, -0.014 * w * idle);
    // Small head and shoulder drift on incommensurate periods, so it never repeats in sync.
    const yaw = 0.03 * Math.sin(time * 0.37 + phase[2]) + 0.012 * Math.sin(time * 0.91 + phase[3]);
    const nod = 0.02 * Math.sin(time * 0.29 + phase[4]);
    rotateAbout(bones.head, axes.y, yaw * idle);
    rotateAbout(bones.head, axes.x, nod * idle);
    rotateAbout(bones.shoulderL, axes.x, 0.014 * Math.sin(time * 0.53 + phase[5]) * idle);
    rotateAbout(bones.shoulderR, axes.x, 0.014 * Math.sin(time * 0.47 + phase[2]) * idle);
  }

  /** Angles smaller than this (radians) do not move the look target. */
  const LOOK_DEAD_ZONE = 0.05;
  function lookAt(dt, target, { maxYaw, maxPitch, strength }) {
    const head = bones.head;
    if (!head || !chest) return;
    const want = target ? strength : 0;
    const weight = Math.min(1, Math.max(0, spring(look.weight, want, 4, dt)));
    if (weight < 0.003 && !target) {
      look.aim = null;
      return;
    }
    chest.getWorldQuaternion(s.q3);
    const up = s.b.copy(chestUp).applyQuaternion(s.q3).normalize();
    const fwd = s.a.copy(chestForward).applyQuaternion(s.q3);
    fwd.addScaledVector(up, -fwd.dot(up)).normalize();
    const left = s.c.crossVectors(up, fwd).normalize();
    if (target) {
      const eye = head.getWorldPosition(s.d);
      const to = s.e.subVectors(target, eye).normalize();
      const yaw = Math.max(-maxYaw, Math.min(maxYaw, Math.atan2(to.dot(left), to.dot(fwd))));
      const pitch = Math.max(
        -maxPitch,
        Math.min(maxPitch, Math.asin(Math.max(-1, Math.min(1, to.dot(up))))),
      );
      if (!look.aim || weight < 0.02) {
        // Starting from nothing: aim straight at the target; the weight eases it in.
        look.aim = { yaw, pitch };
        if (weight < 0.02) {
          look.yaw.x = yaw;
          look.pitch.x = pitch;
          look.yaw.v = look.pitch.v = 0;
        }
      } else if (Math.hypot(yaw - look.aim.yaw, pitch - look.aim.pitch) > LOOK_DEAD_ZONE) {
        look.aim.yaw = yaw;
        look.aim.pitch = pitch;
      }
    }
    if (look.aim) {
      spring(look.yaw, look.aim.yaw, 5, dt);
      spring(look.pitch, look.aim.pitch, 5, dt);
    }
    if (weight < 0.003) return;
    const yaw = look.yaw.x;
    const pitch = look.pitch.x;
    const desired = new THREE.Vector3()
      .copy(fwd)
      .multiplyScalar(Math.cos(yaw))
      .addScaledVector(left, Math.sin(yaw))
      .multiplyScalar(Math.cos(pitch))
      .addScaledVector(up, Math.sin(pitch))
      .normalize();
    // Only the neck and head: the neck takes 40% of the turn and the head the rest.
    for (const [bone, share] of [
      [bones.neck, 0.4],
      [head, 1],
    ]) {
      if (!bone) continue;
      head.getWorldQuaternion(s.q3);
      const current = new THREE.Vector3().copy(headForward).applyQuaternion(s.q3);
      const delta = new THREE.Quaternion().setFromUnitVectors(current, desired);
      delta.slerp(new THREE.Quaternion(), 1 - share * weight);
      rotateBoneWorld(bone, delta, s);
    }
  }

  /**
   * A socket's world matrix from the driven hand as it is now (the rendered joints of a VRM
   * only catch up in vrm.update(), after these layers).
   */
  function socketWorld(side) {
    const hand = bones[`hand${side}`];
    const socket = sockets[side];
    const q = hand.getWorldQuaternion(new THREE.Quaternion()).multiply(handOffset[side]);
    const shown = new THREE.Matrix4().compose(hand.getWorldPosition(v()), q, ONE);
    return shown.multiply(tmpMatrix.compose(socket.position, socket.quaternion, socket.scale));
  }

  /** Move a hand so its socket matches a world matrix: arm IK, then the wrist turns. */
  function reachSocket(side, target_, weight) {
    const hand = bones[`hand${side}`];
    const socket = sockets[side];
    const upper = bones[`upperArm${side}`];
    const lower = bones[`lowerArm${side}`];
    if (!hand || !socket || !upper || !lower || !handOffset[side] || !(weight > 0.002)) return;
    tmpMatrix.compose(socket.position, socket.quaternion, socket.scale).invert();
    const handWorld = new THREE.Matrix4().multiplyMatrices(target_, tmpMatrix);
    const target = new THREE.Vector3().setFromMatrixPosition(handWorld);
    // Elbows bend out to the side and back.
    const pole = lower
      .getWorldPosition(v())
      .addScaledVector(axes.x, side === 'L' ? 0.3 : -0.3)
      .addScaledVector(axes.z, -0.25);
    applyTwoBoneIK(THREE, upper, lower, hand, target, pole, weight, s);
    // The target is for the rendered hand; the driven bone differs by the fixed offset.
    tmpQ.setFromRotationMatrix(handWorld).multiply(s.q.copy(handOffset[side]).invert());
    setBoneWorldQuaternion(hand, tmpQ, weight, s);
  }

  const gripCache = new Map();
  function gripMatrix(grip) {
    if (gripCache.has(grip)) return gripCache.get(grip);
    const matrix = new THREE.Matrix4().compose(
      new THREE.Vector3(grip[0], grip[1], grip[2]),
      new THREE.Quaternion(grip[3] ?? 0, grip[4] ?? 0, grip[5] ?? 0, grip[6] ?? 1).normalize(),
      ONE,
    );
    gripCache.set(grip, matrix);
    return matrix;
  }

  function secondHand(prop, grip, weight) {
    const propWorld = socketWorld(prop.side).multiply(
      new THREE.Matrix4().compose(prop.node.position, prop.node.quaternion, prop.node.scale),
    );
    reachSocket(prop.other, propWorld.multiply(gripMatrix(grip)), weight);
    holds[prop.other] = Math.max(holds[prop.other], weight);
  }

  const cradleSprings = new Map();
  const secondSprings = new Map();
  /**
   * Holds. `cradle` brings cradle props up to the chest with both hands (arm IK toward a
   * point fixed to the body, so the arms stay still while the legs walk). `twoHand` lets the
   * second hand reach a two-hand prop's grip. Weights follow springs, so a hold eases in and
   * out without a kick.
   */
  function handsAndProps(dt, cradle, twoHand) {
    for (const prop of props) {
      if (!prop.node.visible) continue;
      holds[prop.side] = 1;
      if (prop.cradle && sockets[prop.side]) {
        const cradleState = cradleSprings.get(prop) ?? springState();
        cradleSprings.set(prop, cradleState);
        const w = Math.min(1, Math.max(0, spring(cradleState, cradle ? 1 : 0, 3.5, dt)));
        cradles.set(prop, w);
        if (w > 0.002) {
          const at = prop.cradle.at;
          const place = new THREE.Vector3(at[0], at[1], at[2])
            .multiplyScalar(heightScale)
            .applyMatrix4(root.matrixWorld);
          const turn = new THREE.Quaternion().setFromAxisAngle(axes.y, prop.cradle.turn ?? 0);
          const orient = turn.multiply(rootQ).multiply(hangingSocket[prop.side]);
          reachSocket(prop.side, new THREE.Matrix4().compose(place, orient, ONE), w);
          if (prop.cradle.grip2) secondHand(prop, prop.cradle.grip2, w);
        }
      }
      if (prop.hold === 'two' && prop.grip2) {
        const state = secondSprings.get(prop) ?? springState();
        secondSprings.set(prop, state);
        const w = Math.min(1, Math.max(0, spring(state, twoHand ? 1 : 0, 5, dt)));
        second.set(prop, w);
        if (w > 0.002) secondHand(prop, prop.grip2, w);
      }
    }
  }

  /** Rotation of a bone away from its rest orientation, in radians. */
  const bentBy = (bone) => {
    const r = rest.get(bone);
    return r ? 2 * Math.acos(Math.min(1, Math.abs(r.q.dot(bone.quaternion)))) : 0;
  };
  /**
   * Grip: a holding hand closes. Clips with finger tracks (UAL) already curl or relax the
   * fingers, so each joint is only topped up to the grip's angle, never bent past it: a fist
   * in the clip stays a fist, and a flat hand from a clip without fingers relaxes a little.
   */
  function curlFingers(dt) {
    for (const side of ['L', 'R']) {
      grips[side] = approach(grips[side], holds[side] > 0.5 ? 1 : 0.3, 10, dt);
      holds[side] = 0;
      const index = face?.morphTargetDictionary?.[`grip-${side.toLowerCase()}`];
      if (index !== undefined) face.morphTargetInfluences[index] = grips[side];
      // Rigs with finger bones: roll each finger chain about the palm's across axis.
      if (!sockets[side] || !handOffset[side]) continue;
      const across = new THREE.Vector3(1, 0, 0).applyQuaternion(
        new THREE.Quaternion().setFromRotationMatrix(socketWorld(side)),
      );
      for (const finger of FINGERS) {
        const angle = (finger === 'thumb' ? 0.3 : 0.55) * grips[side];
        for (let joint = 1; joint <= 3; joint++) {
          const bone = bones[`${finger}${side}${joint}`];
          if (!bone) continue;
          const more = angle - bentBy(bone);
          if (more > 0.002) rotateAbout(bone, across, more);
        }
      }
    }
  }

  /**
   * Soft IK reach: distances up to 94% of the leg pass through; beyond that they approach
   * 99.5% of the leg exponentially instead of reaching full stretch.
   */
  const softReach = (distance, length) => {
    const start = length * 0.94;
    const span = length * 0.995 - start;
    if (distance <= start) return distance;
    return start + span * (1 - Math.exp(-(distance - start) / span));
  };
  let stance = null;
  let pelvisDrop = 0;
  const pelvis = springState();
  /** Seconds a foot takes to plant fully or to let go; eased with smoothstep. */
  const PLANT_SECONDS = 0.12;
  const LIFT_SECONDS = 0.2;
  /**
   * Walking, the stance foot (the one the animation moves least over the ground) is pinned
   * where it landed and stays pinned until the other foot is clearly the slower one, so one
   * foot is always planted: no skating through toe-off and heel-strike. Standing, both feet
   * are pinned. The hips drop when a pinned foot would be out of the leg's reach.
   */
  function plantFeet(dt, enabled, groundY, moving) {
    const legs = [];
    for (const side of ['L', 'R']) {
      const foot = bones[`foot${side}`];
      const upper = bones[`upperLeg${side}`];
      const lower = bones[`lowerLeg${side}`];
      if (!foot || !upper || !lower || footRest[side] === undefined) return;
      const position = foot.getWorldPosition(v());
      const f = feet[side];
      const speed = f.previous
        ? Math.hypot(position.x - f.previous.x, position.z - f.previous.z) / Math.max(dt, 1e-3)
        : 0;
      f.previous = position.clone();
      legs.push({ side, foot, upper, lower, position, speed, f });
    }
    const floorOf = (leg) => groundY + footRest[leg.side];
    const lift = (leg) => leg.position.y - floorOf(leg);
    const bySide = { L: legs[0], R: legs[1] };
    if (moving) {
      const slower = legs[0].speed <= legs[1].speed ? legs[0] : legs[1];
      if (!stance) stance = slower.side;
      const other = bySide[stance === 'L' ? 'R' : 'L'];
      // Hand over only once the other foot has clearly landed.
      if (other.speed < bySide[stance].speed * 0.6 && lift(other) < 0.08 * heightScale)
        stance = other.side;
    } else stance = null;
    for (const leg of legs) {
      const { f } = leg;
      const floor = floorOf(leg);
      const bearing = enabled && (moving ? leg.side === stance : lift(leg) < 0.06 * heightScale);
      f.release = Math.max(0, f.release - dt);
      if (
        f.lock &&
        !f.release &&
        Math.hypot(f.lock.x - leg.position.x, f.lock.z - leg.position.z) > 0.3 * heightScale
      ) {
        // Left far behind (a turn on the spot, a stop): let the foot go smoothly and plant
        // it again where the animation has it, instead of snapping it across.
        f.release = LIFT_SECONDS;
      }
      const planting = bearing && !f.release;
      leg.planting = planting;
      if (planting && !f.lock) f.lock = leg.position.clone();
      // A linear ramp shaped by smoothstep: the weight starts and ends with zero velocity.
      f.ramp = Math.min(
        1,
        Math.max(0, f.ramp + (planting ? dt / PLANT_SECONDS : -dt / LIFT_SECONDS)),
      );
      f.weight = smoothstep(f.ramp);
      if (!planting && f.ramp <= 0) f.lock = null;
      leg.target = leg.position.clone();
      if (f.lock) {
        // Keep the animation's heel lift; pin only where the foot is on the ground.
        f.lock.y = Math.max(floor, leg.position.y);
        leg.target.lerp(f.lock, f.weight);
      }
      if (enabled) leg.target.y = Math.max(leg.target.y, floor);
    }
    // Pelvis: lower the hips just enough for every bearing foot to reach its target. A foot
    // that is letting go never pulls the hips down: it is let off its lock instead (below).
    let drop = 0;
    for (const leg of legs) {
      if (!leg.f.lock || !leg.planting) continue;
      const hip = leg.upper.getWorldPosition(v());
      const reach = legLength[leg.side] * 0.995;
      const flat = Math.hypot(hip.x - leg.target.x, hip.z - leg.target.z);
      if (flat >= reach) continue;
      const need = hip.y - leg.target.y - Math.sqrt(reach * reach - flat * flat);
      drop = Math.max(drop, need * leg.f.weight);
    }
    // A stiff spring: fast enough that a planted foot does not slide, without a kick.
    const need = enabled ? Math.min(drop, 0.12 * heightScale) : 0;
    pelvisDrop = Math.max(0, spring(pelvis, need, need > pelvisDrop ? 30 : 10, dt));
    if (pelvisDrop > 1e-4) moveBoneWorld(bones.hips, s.a.set(0, -pelvisDrop, 0));
    for (const leg of legs) {
      const now = leg.foot.getWorldPosition(v());
      if (leg.target.distanceToSquared(now) < 1e-8) continue;
      // Soft reach: a target near or past full stretch is eased back toward the hip, so the
      // knee never snaps straight (the solver is unstable at full extension).
      const hip = leg.upper.getWorldPosition(v());
      const toTarget = s.b.subVectors(leg.target, hip);
      const distance = toTarget.length();
      const eased = softReach(distance, legLength[leg.side]);
      if (eased < distance) leg.target.copy(hip).addScaledVector(toTarget, eased / distance);
      const keep = leg.foot.getWorldQuaternion(new THREE.Quaternion());
      const knee = leg.lower.getWorldPosition(v()).addScaledVector(axes.z, 0.4);
      applyTwoBoneIK(THREE, leg.upper, leg.lower, leg.foot, leg.target, knee, 1, s);
      setBoneWorldQuaternion(leg.foot, keep, 1, s);
    }
  }

  return {
    resetPose,
    /**
     * Apply the procedural layers after mixer.update().
     * @param {number} dt
     * @param {object} [o]
     * @param {number} [o.idle] 0..1 idle life (weight shift and head drift)
     * @param {number} [o.breath] 0..1 breathing
     * @param {import('three').Vector3|null} [o.lookTarget] world point to look at
     * @param {number} [o.lookStrength] 0..1
     * @param {number} [o.maxYaw] radians either side of the chest
     * @param {boolean} [o.planted] plant the feet on groundY
     * @param {boolean} [o.moving] walking: only the stance foot is pinned
     * @param {number} [o.groundY]
     * @param {boolean} [o.cradle] bring cradle props up in both hands
     * @param {Partial<Record<string, boolean>>} [o.layers] switch layers off (RIG_LAYERS)
     */
    apply(dt, o = {}) {
      capturePose();
      root.updateMatrixWorld(true);
      root.getWorldQuaternion(rootQ);
      axes.x.set(1, 0, 0).applyQuaternion(rootQ);
      axes.y.set(0, 1, 0).applyQuaternion(rootQ);
      axes.z.set(0, 0, 1).applyQuaternion(rootQ);
      const on = (layer) => o.layers?.[layer] !== false;
      if (on('life')) life(dt, o.idle ?? 0, o.breath ?? 1);
      if (on('look'))
        lookAt(dt, o.lookTarget ?? null, {
          strength: o.lookStrength ?? 1,
          maxYaw: o.maxYaw ?? 1.2,
          maxPitch: o.maxPitch ?? 0.45,
        });
      if (on('hands')) handsAndProps(dt, Boolean(o.cradle), o.twoHand !== false);
      if (on('grip')) curlFingers(dt);
      if (on('feet'))
        plantFeet(dt, Boolean(o.planted), o.groundY ?? root.position.y, Boolean(o.moving));
    },
    getState() {
      const round = (x) => Number(x.toFixed(2));
      return {
        look: {
          yaw: round(look.yaw.x),
          pitch: round(look.pitch.x),
          weight: round(Math.max(0, look.weight.x)),
        },
        feet: {
          stance,
          pelvisDrop: round(pelvisDrop),
          L: { planted: Boolean(feet.L.lock), weight: round(feet.L.weight) },
          R: { planted: Boolean(feet.R.lock), weight: round(feet.R.weight) },
        },
        grips: { L: round(grips.L), R: round(grips.R) },
        props: props.map((prop) => ({
          name: prop.name,
          hand: prop.side,
          hold: prop.hold,
          visible: prop.node.visible,
          cradle: round(cradles.get(prop) ?? 0),
          secondHand: round(second.get(prop) ?? 0),
        })),
      };
    },
  };
}
