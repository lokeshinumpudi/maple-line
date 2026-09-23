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
 * Cross-fades with eased weights and per-pair durations. Walk and hurry stay in step when
 * they blend (the incoming gait starts at the same phase), each loop starts at a random
 * phase the first time so two people never breathe in sync, and timeScale changes are
 * smoothed instead of jumping.
 */
export function createClipBlender(THREE, mixer, actions, { random = Math.random } = {}) {
  let current = null;
  let currentName = null;
  let targetScale = 1;
  const fades = new Map();
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
      const fadingIn = fades.has(next) && next.isRunning();
      next.setLoop(once ? THREE.LoopOnce : THREE.LoopRepeat, Infinity);
      next.clampWhenFinished = once;
      if (!fadingIn) {
        next.reset();
        if (current && GAITS.has(currentName) && GAITS.has(nextName)) {
          const phase = current.time / current.getClip().duration;
          next.time = phase * next.getClip().duration;
        } else if (!once && !started.has(nextName)) {
          next.time = random() * next.getClip().duration;
        }
        next.setEffectiveWeight(0);
        next.timeScale = once ? 1 : timeScale;
      }
      started.add(nextName);
      next.play();
      if (!current || duration <= 0) {
        for (const action of fades.keys()) if (action !== next) action.stop();
        fades.clear();
        next.setEffectiveWeight(1);
      } else {
        // Everything fading re-targets from its present weight: in for next, out for others.
        for (const [action, fade] of fades) {
          fade.from = action.getEffectiveWeight();
          fade.to = action === next ? 1 : 0;
          fade.t = 0;
          fade.duration = duration;
        }
        for (const action of [next, current])
          if (!fades.has(action))
            fades.set(action, {
              from: action.getEffectiveWeight(),
              to: action === next ? 1 : 0,
              t: 0,
              duration,
            });
      }
      current = next;
      currentName = nextName;
    },
    update(dt) {
      if (current && current.loop !== THREE.LoopOnce)
        current.timeScale += (targetScale - current.timeScale) * (1 - Math.exp(-dt * 8));
      for (const [action, fade] of fades) {
        fade.t += dt;
        const k = smoothstep(fade.t / fade.duration);
        action.setEffectiveWeight(fade.from + (fade.to - fade.from) * k);
        if (fade.t >= fade.duration) {
          fades.delete(action);
          if (fade.to === 0) action.stop();
        }
      }
      mixer.update(dt);
    },
    get fading() {
      return fades.size;
    },
  };
}

const approach = (value, target, rate, dt) => value + (target - value) * (1 - Math.exp(-dt * rate));

/**
 * Per-frame procedural layers on a resolved skeleton, applied after the mixer: additive
 * life, look-at, hand holds (grip curl, cradles and second-hand IK) and foot planting.
 * `heightScale` is the figure's height over 1.7 m, for offsets authored in metres.
 * Call resetPose() before the mixer each frame so the layers never accumulate.
 */
export function createCharacterRig(
  THREE,
  root,
  { bones, sockets = {}, props = [], face = null, random = Math.random, heightScale = 1 },
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
  const rest = new Map();
  root.traverse((node) => {
    if (node.isBone) rest.set(node, { q: node.quaternion.clone(), p: node.position.clone() });
  });
  // Bind-pose axes in each bone's own frame (the model faces +Z, up is +Y, left is +X).
  root.updateMatrixWorld(true);
  const rootBind = root.getWorldQuaternion(new THREE.Quaternion()).invert();
  const bindWorld = (bone) => rootBind.clone().multiply(bone.getWorldQuaternion(new THREE.Quaternion()));
  const localAxis = (bone, x, y, z) =>
    bone ? new THREE.Vector3(x, y, z).applyQuaternion(bindWorld(bone).invert()) : null;
  const chestForward = localAxis(bones.chest, 0, 0, 1);
  const chestUp = localAxis(bones.chest, 0, 1, 0);
  const headForward = localAxis(bones.head, 0, 0, 1);
  const bindSocket = {};
  for (const side of ['L', 'R'])
    if (bones[`hand${side}`] && sockets[side])
      bindSocket[side] = bindWorld(bones[`hand${side}`]).multiply(sockets[side].quaternion);
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
  const look = { yaw: 0, pitch: 0, weight: 0 };
  const feet = { L: { lock: null, weight: 0 }, R: { lock: null, weight: 0 } };
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

  function resetPose() {
    for (const [bone, r] of rest) {
      bone.quaternion.copy(r.q);
      bone.position.copy(r.p);
    }
  }

  function life(dt, idle, breath) {
    time += dt;
    const b = Math.sin((time / breathPeriod) * Math.PI * 2 + phase[0]);
    const w = Math.sin((time / shiftPeriod) * Math.PI * 2 + phase[1]);
    // Breathing: the chest lifts and the shoulders rise a little on each breath.
    rotateAbout(bones.chest, axes.x, -0.014 * b * breath);
    rotateAbout(bones.shoulderL, axes.z, 0.012 * b * breath);
    rotateAbout(bones.shoulderR, axes.z, -0.012 * b * breath);
    if (!(idle > 0.001)) return;
    // Weight shift: the hips sway over one leg and back, the spine counters so the head
    // stays over the feet, and foot planting keeps the feet where they are.
    moveBoneWorld(bones.hips, axes.x.clone().multiplyScalar(w * 0.02 * heightScale * idle));
    rotateAbout(bones.hips, axes.z, 0.035 * w * idle);
    rotateAbout(bones.spine, axes.z, -0.025 * w * idle);
    rotateAbout(bones.chest, axes.z, -0.014 * w * idle);
    // Small head and shoulder drift on incommensurate periods, so it never repeats in sync.
    const yaw = 0.03 * Math.sin(time * 0.37 + phase[2]) + 0.012 * Math.sin(time * 0.91 + phase[3]);
    const nod = 0.02 * Math.sin(time * 0.29 + phase[4]);
    rotateAbout(bones.head, axes.y, yaw * idle);
    rotateAbout(bones.head, axes.x, nod * idle);
    rotateAbout(bones.shoulderL, axes.x, 0.014 * Math.sin(time * 0.53 + phase[5]) * idle);
    rotateAbout(bones.shoulderR, axes.x, 0.014 * Math.sin(time * 0.47 + phase[2]) * idle);
  }

  function lookAt(dt, target, { maxYaw, maxPitch, strength }) {
    const head = bones.head;
    const chest = bones.chest;
    if (!head || !chest) return;
    const want = target ? strength : 0;
    look.weight = approach(look.weight, want, want > look.weight ? 3.5 : 2.2, dt);
    if (look.weight < 0.003) return;
    chest.getWorldQuaternion(s.q3);
    const up = s.b.copy(chestUp).applyQuaternion(s.q3).normalize();
    const fwd = s.a.copy(chestForward).applyQuaternion(s.q3);
    fwd.addScaledVector(up, -fwd.dot(up)).normalize();
    const left = s.c.crossVectors(up, fwd).normalize();
    if (target) {
      const eye = head.getWorldPosition(s.d);
      const to = s.e.subVectors(target, eye).normalize();
      const yaw = Math.max(-maxYaw, Math.min(maxYaw, Math.atan2(to.dot(left), to.dot(fwd))));
      const pitch = Math.max(-maxPitch, Math.min(maxPitch, Math.asin(Math.max(-1, Math.min(1, to.dot(up))))));
      // Smooth the angles, so a new target swings the head across instead of snapping.
      const fresh = look.weight < 0.06;
      look.yaw = fresh ? yaw : approach(look.yaw, yaw, 4, dt);
      look.pitch = fresh ? pitch : approach(look.pitch, pitch, 4, dt);
    }
    const desired = new THREE.Vector3()
      .copy(fwd)
      .multiplyScalar(Math.cos(look.yaw))
      .addScaledVector(left, Math.sin(look.yaw))
      .multiplyScalar(Math.cos(look.pitch))
      .addScaledVector(up, Math.sin(look.pitch))
      .normalize();
    // The neck takes 40% of the turn and the head the rest.
    for (const [bone, share] of [
      [bones.neck, 0.4],
      [head, 1],
    ]) {
      if (!bone) continue;
      head.getWorldQuaternion(s.q3);
      const current = new THREE.Vector3().copy(headForward).applyQuaternion(s.q3);
      const delta = new THREE.Quaternion().setFromUnitVectors(current, desired);
      delta.slerp(new THREE.Quaternion(), 1 - share * look.weight);
      rotateBoneWorld(bone, delta, s);
    }
  }

  /** Move a hand so its socket matches a world matrix: arm IK, then the wrist turns. */
  function reachSocket(side, socketWorld, weight) {
    const hand = bones[`hand${side}`];
    const socket = sockets[side];
    const upper = bones[`upperArm${side}`];
    const lower = bones[`lowerArm${side}`];
    if (!hand || !socket || !upper || !lower || !(weight > 0.002)) return;
    tmpMatrix.compose(socket.position, socket.quaternion, socket.scale).invert();
    const handWorld = new THREE.Matrix4().multiplyMatrices(socketWorld, tmpMatrix);
    const target = new THREE.Vector3().setFromMatrixPosition(handWorld);
    // Elbows bend out to the side and back.
    const pole = lower
      .getWorldPosition(v())
      .addScaledVector(axes.x, side === 'L' ? 0.3 : -0.3)
      .addScaledVector(axes.z, -0.25);
    applyTwoBoneIK(THREE, upper, lower, hand, target, pole, weight, s);
    tmpQ.setFromRotationMatrix(handWorld);
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
    prop.node.updateMatrixWorld(true);
    reachSocket(prop.other, new THREE.Matrix4().multiplyMatrices(prop.node.matrixWorld, gripMatrix(grip)), weight);
    holds[prop.other] = Math.max(holds[prop.other], weight);
  }

  function handsAndProps(dt, cradle, twoHand) {
    for (const prop of props) {
      if (!prop.node.visible) continue;
      holds[prop.side] = 1;
      if (prop.cradle && bindSocket[prop.side]) {
        // Cradle: brought up to the chest and steadied with the other hand while still.
        const w = approach(cradles.get(prop) ?? 0, cradle ? 1 : 0, cradle ? 2.4 : 4, dt);
        cradles.set(prop, w);
        if (w > 0.002) {
          const at = prop.cradle.at;
          const place = new THREE.Vector3(at[0], at[1], at[2])
            .multiplyScalar(heightScale)
            .applyMatrix4(root.matrixWorld);
          const turn = new THREE.Quaternion().setFromAxisAngle(axes.y, prop.cradle.turn ?? 0);
          const orient = turn.multiply(rootQ).multiply(bindSocket[prop.side]);
          reachSocket(prop.side, new THREE.Matrix4().compose(place, orient, ONE), w);
          if (prop.cradle.grip2) secondHand(prop, prop.cradle.grip2, w);
        }
      }
      if (prop.hold === 'two' && prop.grip2 && twoHand) {
        const w = approach(second.get(prop) ?? 0, 1, 6, dt);
        second.set(prop, w);
        secondHand(prop, prop.grip2, w);
      }
    }
  }

  function curlFingers(dt) {
    for (const side of ['L', 'R']) {
      grips[side] = approach(grips[side], holds[side] > 0.5 ? 1 : 0.3, 10, dt);
      holds[side] = 0;
      const index = face?.morphTargetDictionary?.[`grip-${side.toLowerCase()}`];
      if (index !== undefined) face.morphTargetInfluences[index] = grips[side];
      // Rigs with finger bones: roll each finger chain about the palm's across axis.
      const socket = sockets[side];
      if (!socket) continue;
      const across = new THREE.Vector3(1, 0, 0).applyQuaternion(socket.getWorldQuaternion(s.q3));
      for (const finger of FINGERS) {
        let bone = bones[`${finger}${side}`];
        const angle = (finger === 'thumb' ? 0.3 : 0.55) * grips[side];
        for (let depth = 0; bone && depth < 3; depth++) {
          rotateAbout(bone, across, angle);
          bone = bone.children.find((child) => child.isBone);
        }
      }
    }
  }

  let stance = null;
  let pelvisDrop = 0;
  /**
   * The lower foot carries the weight: it is pulled to the floor and pinned where it landed
   * until the other foot takes over, so it cannot slide or hover. Standing still, both feet
   * are pinned. The hips drop when a pinned foot would otherwise be out of the leg's reach.
   */
  function plantFeet(dt, enabled, groundY, moving) {
    const legs = [];
    for (const side of ['L', 'R']) {
      const foot = bones[`foot${side}`];
      const upper = bones[`upperLeg${side}`];
      const lower = bones[`lowerLeg${side}`];
      if (!foot || !upper || !lower || footRest[side] === undefined) return;
      legs.push({ side, foot, upper, lower, position: foot.getWorldPosition(v()) });
    }
    const [left, right] = legs;
    const floorOf = (leg) => groundY + footRest[leg.side];
    const height = (leg) => leg.position.y - floorOf(leg);
    // Hysteresis: the other foot takes the weight once it is clearly the lower one.
    const margin = 0.012 * heightScale;
    if (!stance || height(stance === 'L' ? right : left) < height(stance === 'L' ? left : right) - margin)
      stance = height(left) <= height(right) ? 'L' : 'R';
    for (const leg of legs) {
      const f = feet[leg.side];
      const floor = floorOf(leg);
      const lift = height(leg);
      // Standing, both feet bear weight; walking, the stance foot does, until it lifts.
      const bearing =
        enabled && (moving ? leg.side === stance : lift < 0.06 * heightScale);
      if (bearing && !f.lock) f.lock = leg.position.clone();
      if (f.lock && Math.hypot(f.lock.x - leg.position.x, f.lock.z - leg.position.z) > 0.25 * heightScale) {
        // Left a stride behind (a stop, a snap): plant again rather than stretch the leg.
        f.lock.copy(leg.position);
        f.weight = Math.min(f.weight, 0.3);
      }
      f.weight = approach(f.weight, bearing ? 1 : 0, bearing ? 16 : 8, dt);
      if (!bearing && f.weight < 0.02) f.lock = null;
      leg.target = leg.position.clone();
      if (f.lock) {
        f.lock.y = floor;
        leg.target.lerp(f.lock, f.weight);
      }
      if (enabled) leg.target.y = Math.max(leg.target.y, floor);
    }
    // Pelvis: lower the hips just enough for every planted foot to reach its target.
    let drop = 0;
    for (const leg of legs) {
      if (!feet[leg.side].lock) continue;
      const hip = leg.upper.getWorldPosition(v());
      const reach = legLength[leg.side] * 0.995;
      const flat = Math.hypot(hip.x - leg.target.x, hip.z - leg.target.z);
      if (flat >= reach) continue;
      const need = hip.y - leg.target.y - Math.sqrt(reach * reach - flat * flat);
      drop = Math.max(drop, need * feet[leg.side].weight);
    }
    pelvisDrop = approach(pelvisDrop, enabled ? Math.min(drop, 0.12 * heightScale) : 0, 18, dt);
    if (pelvisDrop > 1e-4) moveBoneWorld(bones.hips, s.a.set(0, -pelvisDrop, 0));
    for (const leg of legs) {
      const now = leg.foot.getWorldPosition(v());
      if (leg.target.distanceToSquared(now) < 1e-8) continue;
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
     */
    apply(dt, o = {}) {
      root.updateMatrixWorld(true);
      root.getWorldQuaternion(rootQ);
      axes.x.set(1, 0, 0).applyQuaternion(rootQ);
      axes.y.set(0, 1, 0).applyQuaternion(rootQ);
      axes.z.set(0, 0, 1).applyQuaternion(rootQ);
      life(dt, o.idle ?? 0, o.breath ?? 1);
      lookAt(dt, o.lookTarget ?? null, {
        strength: o.lookStrength ?? 1,
        maxYaw: o.maxYaw ?? 1.2,
        maxPitch: o.maxPitch ?? 0.45,
      });
      handsAndProps(dt, Boolean(o.cradle), o.twoHand !== false);
      curlFingers(dt);
      plantFeet(dt, Boolean(o.planted), o.groundY ?? root.position.y, Boolean(o.moving));
    },
    getState() {
      const round = (x) => Number(x.toFixed(2));
      return {
        look: { yaw: round(look.yaw), pitch: round(look.pitch), weight: round(look.weight) },
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
