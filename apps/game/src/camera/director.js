import { CAR_SPACING, CAR_COUNT } from '../train/consist.js';
import { cabPose, interiorPose } from './camera.js';

/**
 * Film director camera. Plans shots the way a railway documentary crew would:
 * trackside passes, long-lens compression, drone reveals, chase and cab shots,
 * with lens, focus and operator lag per shot. It runs after the gameplay rig and
 * overwrites the camera pose only while active; the rig restores its own pose on
 * the next frame. Agents can queue scripted shots; the automatic editor fills the
 * gaps. Shots never change the train, weather or story — `set` requests go to the
 * host through onSet, which uses the same actions as the UI.
 */
export const SHOT_TYPES = Object.freeze([
  'trackside',
  'telephoto',
  'drone',
  'helicopter',
  'chase',
  'wheels',
  'cab',
  'window',
  'platform',
  'bridge-low',
  'establishing',
  'portrait',
  'orbit',
]);
const SCALE = {
  telephoto: 'wide',
  helicopter: 'wide',
  establishing: 'wide',
  drone: 'wide',
  'bridge-low': 'wide',
  trackside: 'medium',
  chase: 'medium',
  platform: 'medium',
  orbit: 'medium',
  wheels: 'close',
  cab: 'close',
  window: 'close',
  portrait: 'close',
};
const DEFAULT_DURATION = {
  trackside: 14,
  telephoto: 9,
  drone: 10,
  helicopter: 12,
  chase: 8,
  wheels: 6,
  cab: 8,
  window: 8,
  platform: 10,
  'bridge-low': 10,
  establishing: 7,
  portrait: 5,
  orbit: 10,
};
const APERTURE = { deep: 0, normal: 4, shallow: 9 };
const INTERIOR = new Set(['cab', 'window']);
const PERSON_SUBJECT = new Set(['portrait', 'orbit']);

/** Vertical field of view for a full-frame focal length, widened on portrait screens. */
export function lensToFov(lensMm, aspect = 16 / 9) {
  const vertical = 2 * Math.atan(12 / lensMm);
  if (aspect >= 1.2) return (vertical * 180) / Math.PI;
  const widened = 2 * Math.atan((Math.tan(vertical / 2) * 1.5) / Math.max(aspect, 0.3));
  return Math.min(75, (widened * 180) / Math.PI);
}

/** Validates an agent or editor shot request; returns a normalized copy. */
export function normalizeShot(spec) {
  if (!spec || typeof spec !== 'object') throw new TypeError('Shot must be an object.');
  if (!SHOT_TYPES.includes(spec.type))
    throw new TypeError(`Shot type must be one of: ${SHOT_TYPES.join(', ')}`);
  const shot = { type: spec.type };
  const finite = (key, min, max) => {
    if (spec[key] === undefined) return;
    if (!Number.isFinite(spec[key]) || spec[key] < min || spec[key] > max)
      throw new TypeError(`${key} must be a number from ${min} to ${max}.`);
    shot[key] = spec[key];
  };
  finite('duration', 1.5, 60);
  finite('lens', 12, 600);
  finite('distance', 2, 800);
  finite('height', 0.3, 300);
  finite('anchorDistance', -1e6, 1e6);
  if (spec.side !== undefined) {
    if (!['left', 'right'].includes(spec.side)) throw new TypeError('side must be left or right.');
    shot.side = spec.side;
  }
  if (spec.aperture !== undefined) {
    if (!(spec.aperture in APERTURE))
      throw new TypeError('aperture must be deep, normal or shallow.');
    shot.aperture = spec.aperture;
  }
  if (spec.transition !== undefined) {
    if (!['cut', 'fade'].includes(spec.transition))
      throw new TypeError('transition must be cut or fade.');
    shot.transition = spec.transition;
  }
  if (spec.subject !== undefined) {
    const s = spec.subject;
    const ok =
      ['lead', 'middle', 'rear'].includes(s) ||
      (s && typeof s === 'object' && typeof s.person === 'string' && s.person.length <= 48) ||
      (s && typeof s === 'object' && typeof s.stop === 'string' && s.stop.length <= 48) ||
      (s &&
        typeof s === 'object' &&
        Array.isArray(s.point) &&
        s.point.length === 3 &&
        s.point.every(Number.isFinite));
    if (!ok)
      throw new TypeError(
        'subject must be lead, middle, rear, {person: id}, {stop: id} or {point: [x, y, z]}.',
      );
    shot.subject = typeof s === 'string' ? s : structuredClone(s);
  }
  if (PERSON_SUBJECT.has(shot.type) && shot.type === 'portrait' && typeof shot.subject !== 'object')
    throw new TypeError('A portrait needs a person, stop or point subject.');
  for (const key of ['caption', 'subtitle', 'line']) {
    if (spec[key] === undefined) continue;
    if (typeof spec[key] !== 'string' || spec[key].length > 160)
      throw new TypeError(`${key} must be text up to 160 characters.`);
    shot[key] = spec[key];
  }
  if (spec.set !== undefined) {
    if (!spec.set || typeof spec.set !== 'object') throw new TypeError('set must be an object.');
    const set = {};
    for (const [key, value] of Object.entries(spec.set)) {
      if (key === 'weather' && ['clear', 'rain', 'snow'].includes(value)) set.weather = value;
      else if (key === 'timeOfDay' && ['daylight', 'sunrise', 'sunset', 'dusk'].includes(value))
        set.timeOfDay = value;
      else if (key === 'location' && (typeof value === 'string' || Number.isFinite(value)))
        set.location = value;
      else if (key === 'speedKmh' && Number.isFinite(value) && value >= 0 && value <= 160)
        set.speedKmh = value;
      else throw new TypeError(`Unsupported set field ${key}.`);
    }
    shot.set = set;
  }
  return shot;
}

export function createDirector({
  THREE,
  camera,
  track,
  getTrackLength,
  groundAt,
  canopyAt = () => -Infinity,
  obstructed = () => false,
  resolveSubject = () => null,
  onSet = () => {},
  onCaption = () => {},
  seed = 1907,
}) {
  const up = new THREE.Vector3(0, 1, 0);
  const exteriorNear = camera.near;
  let random = seed >>> 0;
  const rand = () => {
    random = (Math.imul(random, 1664525) + 1013904223) >>> 0;
    return random / 4294967296;
  };
  const tmp = new THREE.Vector3();
  const eye = new THREE.Vector3();
  const aim = new THREE.Vector3();
  const smoothAim = new THREE.Vector3();
  let lens = 35;
  let shot = null;
  let queue = [];
  let sequence = null;
  let active = false;
  let elapsed = 0;
  let lastPlace = null;
  let pendingPlace = null;
  const history = [];
  let pendingLook = {};
  let ctx = { distance: 0, direction: 1, speed: 0 };

  function frameAt(distance) {
    const length = getTrackLength();
    const t = THREE.MathUtils.clamp(distance / length, 0.0005, 0.9995);
    const p = track.getPointAt(t);
    const f = track.getTangentAt(t).multiplyScalar(ctx.direction);
    f.y = 0;
    if (f.lengthSq() < 1e-6) f.set(0, 0, ctx.direction);
    f.normalize();
    const side = new THREE.Vector3().crossVectors(up, f).normalize();
    return { p, f, side };
  }
  const carDistance = (index) => ctx.distance - ctx.direction * CAR_SPACING * index;
  const leadD = () => carDistance(0);
  const rearD = () => carDistance(CAR_COUNT - 1);
  const midD = () => carDistance((CAR_COUNT - 1) / 2);
  /** Point on the train nearest to route distance d (lead before arrival, rear after). */
  function nearestTrainDistance(d) {
    const a = Math.min(leadD(), rearD()),
      b = Math.max(leadD(), rearD());
    return THREE.MathUtils.clamp(d, a, b);
  }
  /** Railway centre at a world z; the route's z increases along its length. */
  function railNearZ(z) {
    let low = 0,
      high = 1;
    for (let i = 0; i < 22; i++) {
      const middle = (low + high) / 2;
      if (track.getPointAt(middle).z < z) low = middle;
      else high = middle;
    }
    return track.getPointAt((low + high) / 2);
  }
  function trainPoint(distance, lift = 1.9) {
    return frameAt(distance).p.clone().addScaledVector(up, lift);
  }
  function subjectPoint(subject) {
    if (!subject || subject === 'lead') return trainPoint(leadD());
    if (subject === 'middle') return trainPoint(midD());
    if (subject === 'rear') return trainPoint(rearD());
    if (Array.isArray(subject.point)) return new THREE.Vector3(...subject.point);
    const resolved = resolveSubject(subject);
    return resolved ? new THREE.Vector3(...resolved) : trainPoint(midD());
  }
  const ground = (point) => {
    const y = groundAt(point.x, point.z);
    return Number.isFinite(y) ? y : -1e4;
  };
  const canopy = (point) => {
    const y = canopyAt(point.x, point.z);
    return Number.isFinite(y) ? y : -Infinity;
  };
  /** Fraction of the sightline hidden by terrain or tree crowns. */
  function blocked(from, to) {
    let hidden = 0;
    const samples = 18;
    for (let i = 1; i < samples; i++) {
      tmp.lerpVectors(from, to, i / samples);
      const nearEnds =
        Math.hypot(tmp.x - from.x, tmp.z - from.z) < 5 ||
        Math.hypot(tmp.x - to.x, tmp.z - to.z) < 7;
      if (tmp.y < ground(tmp) + 0.4 || (!nearEnds && tmp.y < canopy(tmp) - 0.5)) hidden++;
    }
    const fraction = hidden / (samples - 1);
    return fraction < 0.2 && obstructed(from, to) ? 1 : fraction;
  }
  function lift(point, clearance = 1.6, overCanopy = false) {
    point.y = Math.max(point.y, ground(point) + clearance);
    if (overCanopy) point.y = Math.max(point.y, canopy(point) + 3);
    return point;
  }
  const sideSign = (spec, fallback) =>
    spec.side === 'left' ? 1 : spec.side === 'right' ? -1 : fallback;

  /** Resolves anchors once, when a shot starts. Returns false when no clear view exists. */
  function prepare(next) {
    const spec = next.spec;
    const flip = rand() < 0.5 ? 1 : -1;
    next.sign = sideSign(spec, flip);
    next.phase = rand() * Math.PI * 2;
    const moving = ctx.speed > 0.5;
    if (next.type === 'trackside') {
      const ahead = Number.isFinite(spec.anchorDistance)
        ? spec.anchorDistance
        : leadD() + ctx.direction * THREE.MathUtils.clamp(ctx.speed * 4 + 45, 45, 240);
      next.anchorD = ahead;
      const attempts = spec.side ? [next.sign] : [next.sign, -next.sign];
      for (const sign of attempts)
        for (const offset of [spec.distance ?? 9, 13, 18]) {
          const { p, side } = frameAt(ahead);
          const candidate = p.clone().addScaledVector(side, sign * offset);
          candidate.y = Math.max(ground(candidate) + (spec.height ?? 1.7), p.y - 2.5);
          if (blocked(candidate, trainPoint(leadD())) < 0.2 || !moving) {
            next.anchor = candidate;
            next.sign = sign;
            return true;
          }
        }
      return false;
    }
    if (next.type === 'telephoto') {
      // Beyond about 250 m the valley haze turns a long lens white.
      const ahead = leadD() + ctx.direction * (moving ? 160 + rand() * 110 : 0);
      for (const sign of [next.sign, -next.sign])
        for (const lateral of [spec.distance ?? 80, 110, 55]) {
          const { p, side } = frameAt(ahead);
          const candidate = p.clone().addScaledVector(side, sign * lateral);
          candidate.y = ground(candidate) + (spec.height ?? 6 + rand() * 10);
          lift(candidate, 4, true);
          if (blocked(candidate, trainPoint(leadD())) < 0.15) {
            next.anchor = candidate;
            return true;
          }
        }
      return false;
    }
    if (next.type === 'platform') {
      const stop = ctx.stop;
      if (!stop) return false;
      const along = stop.distance + ctx.direction * 38;
      const { p, side } = frameAt(along);
      for (const sign of [next.sign, -next.sign]) {
        const candidate = p.clone().addScaledVector(side, sign * 5.2);
        candidate.y = p.y + 2.6;
        if (blocked(candidate, trainPoint(leadD())) < 0.25) {
          next.anchor = candidate;
          return true;
        }
      }
      return false;
    }
    if (next.type === 'bridge-low') {
      if (!ctx.bridge) return false;
      const { p, side, f } = frameAt(ctx.bridge.distance);
      const candidate = p
        .clone()
        .addScaledVector(side, next.sign * (spec.distance ?? 70))
        .addScaledVector(f, -25);
      candidate.y = ground(candidate) + (spec.height ?? 2);
      next.anchor = candidate;
      next.anchorD = ctx.bridge.distance;
      return blocked(candidate, p.clone().addScaledVector(up, 2)) < 0.35;
    }
    if (next.type === 'establishing') {
      const along = leadD() + ctx.direction * (moving ? 170 : 40);
      const { p, side } = frameAt(along);
      const candidate = p.clone().addScaledVector(side, next.sign * (spec.distance ?? 85));
      candidate.y = Math.max(ground(candidate) + 40, p.y + (spec.height ?? 42));
      lift(candidate, 30, true);
      next.anchor = candidate;
      next.anchorD = leadD() + ctx.direction * (moving ? 70 : 0);
      return true;
    }
    if (next.type === 'portrait') {
      // People on platforms and lanes face the railway, so start from the track side
      // for a three-quarter view, then work round; keep the first clear sightline.
      const subject = subjectPoint(spec.subject);
      const chest = subject.clone().addScaledVector(up, 1.25);
      const radius = spec.distance ?? 4.6;
      const { f, side } = frameAt(midD());
      const rail = railNearZ(subject.z).sub(subject);
      const facing = rail.lengthSq() > 1 ? Math.atan2(rail.dot(f), rail.dot(side)) : 0;
      const turn = spec.side === 'left' ? -1 : spec.side === 'right' ? 1 : next.sign;
      // A second pass stands further back and higher, over benches and low walls.
      for (const [reach, rise] of [
        [radius, spec.height ?? 0.25],
        [radius * 1.6, (spec.height ?? 0.25) + 1.6],
      ])
        for (const offset of [0.45, -0.45, 0.9, -0.9, 0, 1.4, -1.4, Math.PI]) {
          const angle = facing + offset * turn;
          const candidate = chest
            .clone()
            .addScaledVector(side, Math.cos(angle) * reach)
            .addScaledVector(f, Math.sin(angle) * reach);
          candidate.y = chest.y + rise;
          lift(candidate, 1.2);
          if (
            blocked(candidate, chest) < 0.2 &&
            !obstructed(chest, candidate) &&
            !obstructed(candidate, chest)
          ) {
            next.angle = angle;
            next.reach = reach;
            next.rise = rise;
            return true;
          }
        }
      next.angle = facing + 0.45 * turn;
      return true;
    }
    if (next.type === 'window') next.yaw = next.sign * (1.15 + rand() * 0.25);
    return !(INTERIOR.has(next.type) && false);
  }

  function start(spec, { scripted = false } = {}) {
    const next = {
      type: spec.type,
      spec,
      duration: spec.duration ?? DEFAULT_DURATION[spec.type],
      t: 0,
      scripted,
    };
    if (!prepare(next)) return false;
    shot = next;
    const fade = spec.transition === 'fade' || Boolean(spec.set);
    if (spec.set) onSet(spec.set);
    pendingLook = fade ? { cutToBlack: true } : {};
    if (spec.caption || spec.subtitle || spec.line)
      onCaption({
        kind: 'shot',
        title: spec.caption ?? null,
        subtitle: spec.subtitle ?? null,
        line: spec.line ?? null,
        seconds: Math.min(next.duration, 7),
      });
    history.unshift({ type: next.type, scripted, at: Number(elapsed.toFixed(1)) });
    history.length = Math.min(history.length, 10);
    shot.snap = true;
    return true;
  }

  function autoChoice() {
    const last = history[0]?.type;
    const lastScale = SCALE[last];
    if (ctx.inTunnel) return rand() < 0.7 ? 'cab' : 'window';
    if (pendingPlace) return 'establishing';
    if (ctx.tunnelAhead && ctx.tunnelAhead.distance < 420 && last !== 'trackside')
      return 'trackside';
    let pool;
    if (ctx.speed < 1.5 && ctx.stop)
      pool = { platform: 3, window: 2, helicopter: 1.5, establishing: 1, telephoto: 1 };
    else if (ctx.bridge && Math.abs(ctx.bridge.distance - leadD()) < 380)
      pool = { 'bridge-low': 4, telephoto: 2.5, helicopter: 2, drone: 1.5, chase: 1 };
    else if (ctx.speed < 1.5) pool = { helicopter: 2, window: 2, cab: 1, establishing: 1 };
    else
      pool = {
        trackside: 3,
        telephoto: 2,
        drone: 2,
        chase: 2,
        wheels: 1.5,
        cab: 1,
        window: 1,
        helicopter: 1.5,
      };
    const entries = Object.entries(pool).map(([type, weight]) => [
      type,
      type === last ? 0 : SCALE[type] === lastScale ? weight * 0.35 : weight,
    ]);
    const total = entries.reduce((sum, [, w]) => sum + w, 0);
    let pick = rand() * total;
    for (const [type, weight] of entries) {
      pick -= weight;
      if (pick <= 0) return type;
    }
    return entries[0][0];
  }

  function nextShot() {
    while (queue.length) {
      const spec = queue.shift();
      if (start(spec, { scripted: true })) return;
    }
    if (sequence) {
      if (sequence.loop) queue = sequence.shots.map((spec) => structuredClone(spec));
      else {
        onCaption({ kind: 'end', title: sequence.title });
        sequence = null;
      }
      if (queue.length) return nextShot();
    }
    for (let attempt = 0; attempt < 5; attempt++) {
      const type = autoChoice();
      const spec = { type };
      if (type === 'establishing' && pendingPlace) {
        spec.caption = pendingPlace.title;
        spec.subtitle = pendingPlace.subtitle;
        spec.line = pendingPlace.line;
        pendingPlace = null;
      }
      if (type === 'trackside' && ctx.tunnelAhead && ctx.tunnelAhead.distance < 420)
        spec.anchorDistance = leadD() + ctx.direction * (ctx.tunnelAhead.distance + 15);
      if (start(spec)) return;
    }
    start({ type: 'drone' });
  }

  function shotEnded() {
    if (!shot) return true;
    if (shot.t >= shot.duration) return true;
    if (shot.type === 'trackside' && ctx.speed > 0.5 && shot.t > 2) {
      const passed = (rearD() - shot.anchorD) * ctx.direction;
      if (passed > 25) return true;
    }
    if (INTERIOR.has(shot.type) && !ctx.inTunnel && !shot.scripted && history[0]?.type === 'cab')
      return shot.t >= shot.duration;
    if (ctx.inTunnel && !INTERIOR.has(shot.type) && !shot.scripted) return true;
    return false;
  }

  function pose(dt) {
    const spec = shot.spec;
    const t = shot.t;
    const u = THREE.MathUtils.clamp(t / shot.duration, 0, 1);
    const ease = u * u * (3 - 2 * u);
    let handheld = 0.0015;
    let desiredLens = spec.lens ?? 35;
    let aperture = APERTURE[spec.aperture ?? 'normal'];
    let focus = null;
    camera.near = INTERIOR.has(shot.type) ? 0.06 : exteriorNear;
    const mid = frameAt(midD());
    switch (shot.type) {
      case 'trackside': {
        eye.copy(shot.anchor);
        aim.copy(trainPoint(nearestTrainDistance(shot.anchorD), 1.8));
        const range = eye.distanceTo(aim);
        desiredLens = spec.lens ?? THREE.MathUtils.clamp(range * 0.9, 28, 160);
        handheld = 0.004;
        break;
      }
      case 'telephoto': {
        eye.copy(shot.anchor);
        aim.copy(trainPoint(nearestTrainDistance(midD()), 1.8));
        desiredLens = spec.lens ?? THREE.MathUtils.clamp(eye.distanceTo(aim) * 0.5, 70, 300);
        aperture = APERTURE[spec.aperture ?? 'shallow'] * 0.7;
        handheld = 0.0008;
        break;
      }
      case 'drone': {
        const back = THREE.MathUtils.lerp(18, spec.distance ?? 75, ease);
        eye
          .copy(mid.p)
          .addScaledVector(mid.f, -back)
          .addScaledVector(mid.side, shot.sign * THREE.MathUtils.lerp(8, 34, ease))
          .addScaledVector(up, THREE.MathUtils.lerp(6, spec.height ?? 48, ease));
        lift(eye, 3, true);
        aim.copy(mid.p).addScaledVector(mid.f, 12).addScaledVector(up, 2);
        desiredLens = spec.lens ?? 28;
        aperture = APERTURE[spec.aperture ?? 'deep'];
        handheld = 0.0025;
        break;
      }
      case 'helicopter': {
        const angle = shot.phase + t * 0.07 * shot.sign;
        const radius = spec.distance ?? 120;
        eye
          .copy(mid.p)
          .addScaledVector(mid.side, Math.cos(angle) * radius)
          .addScaledVector(mid.f, Math.sin(angle) * radius)
          .addScaledVector(up, spec.height ?? 55);
        lift(eye, 25, true);
        aim.copy(mid.p).addScaledVector(up, 2);
        desiredLens = spec.lens ?? 45;
        aperture = APERTURE[spec.aperture ?? 'deep'];
        handheld = 0.002;
        break;
      }
      case 'chase': {
        const lead = frameAt(leadD());
        eye
          .copy(lead.p)
          .addScaledVector(lead.f, spec.distance ?? 30)
          .addScaledVector(lead.side, shot.sign * 7)
          .addScaledVector(up, spec.height ?? 4.5);
        lift(eye, 2.5);
        aim.copy(lead.p).addScaledVector(up, 1.8).addScaledVector(lead.f, -6);
        desiredLens = spec.lens ?? 40;
        handheld = 0.003;
        break;
      }
      case 'wheels': {
        const car = frameAt(carDistance(1));
        const lead = frameAt(leadD());
        eye
          .copy(car.p)
          .addScaledVector(car.side, shot.sign * (spec.distance ?? 3.4))
          .addScaledVector(car.f, -3)
          .addScaledVector(up, spec.height ?? 0.85);
        aim.copy(lead.p).addScaledVector(lead.f, 8).addScaledVector(up, 1);
        desiredLens = spec.lens ?? 24;
        aperture = APERTURE[spec.aperture ?? 'shallow'] * 0.8;
        focus = 5;
        handheld = 0.006;
        break;
      }
      case 'cab': {
        const cab = cabPose(track, ctx.distance, getTrackLength(), ctx.direction);
        eye.copy(cab.eye);
        aim.copy(cab.target);
        desiredLens = spec.lens ?? 26;
        aperture = 0;
        handheld = 0.0012;
        break;
      }
      case 'window': {
        const view = interiorPose(
          track,
          ctx.distance,
          getTrackLength(),
          ctx.direction,
          true,
          shot.yaw ?? 1.2,
          -0.05,
        );
        eye.copy(view.eye);
        aim.copy(view.target);
        desiredLens = spec.lens ?? 30;
        aperture = 0;
        handheld = 0.0015;
        break;
      }
      case 'platform': {
        eye.copy(shot.anchor);
        aim.copy(trainPoint(nearestTrainDistance(ctx.stop?.distance ?? leadD()), 1.7));
        desiredLens = spec.lens ?? 35;
        handheld = 0.0035;
        break;
      }
      case 'bridge-low': {
        eye.copy(shot.anchor);
        aim.copy(trainPoint(nearestTrainDistance(shot.anchorD), 1.5));
        desiredLens = spec.lens ?? 26;
        aperture = APERTURE[spec.aperture ?? 'deep'];
        handheld = 0.0015;
        break;
      }
      case 'establishing': {
        eye.copy(shot.anchor).addScaledVector(up, t * 1.1);
        aim.copy(trainPoint(nearestTrainDistance(shot.anchorD), 1));
        desiredLens = spec.lens ?? 24;
        aperture = 0;
        handheld = 0.001;
        break;
      }
      case 'portrait':
      case 'orbit': {
        const subject = subjectPoint(spec.subject ?? 'middle');
        const personal = typeof spec.subject === 'object';
        const look = personal ? subject.clone().addScaledVector(up, 1.25) : subject;
        const around = frameAt(midD());
        const radius = shot.reach ?? spec.distance ?? (shot.type === 'portrait' ? 4.6 : 18);
        // Portraits drift slowly around their chosen clear bearing.
        const angle =
          shot.type === 'orbit' ? shot.phase + t * 0.12 * shot.sign : shot.angle + t * 0.015;
        eye
          .copy(look)
          .addScaledVector(around.side, Math.cos(angle) * radius)
          .addScaledVector(around.f, Math.sin(angle) * radius);
        eye.y = look.y + (shot.rise ?? spec.height ?? (shot.type === 'portrait' ? 0.25 : 6));
        lift(eye, 1.2);
        aim.copy(look);
        desiredLens = spec.lens ?? (shot.type === 'portrait' ? 50 : 35);
        aperture = APERTURE[spec.aperture ?? (shot.type === 'portrait' ? 'shallow' : 'normal')];
        handheld = shot.type === 'portrait' ? 0.003 : 0.002;
        break;
      }
    }
    const distance = eye.distanceTo(aim);
    // Operator noise: a few slow sines, scaled by distance so the angle stays small.
    const n = elapsed + shot.phase;
    const wobble = distance * handheld;
    tmp
      .crossVectors(up, aim.clone().sub(eye).normalize())
      .normalize()
      .multiplyScalar((Math.sin(n * 0.9) + Math.sin(n * 2.3) * 0.4) * wobble);
    aim.add(tmp).addScaledVector(up, (Math.sin(n * 1.3 + 1.7) + Math.sin(n * 3.1) * 0.3) * wobble);
    if (shot.snap) {
      smoothAim.copy(aim);
      lens = desiredLens;
      shot.snap = false;
    } else {
      // Operator lag: a camera person follows the subject a fraction behind.
      smoothAim.x = THREE.MathUtils.damp(smoothAim.x, aim.x, 7, dt);
      smoothAim.y = THREE.MathUtils.damp(smoothAim.y, aim.y, 7, dt);
      smoothAim.z = THREE.MathUtils.damp(smoothAim.z, aim.z, 7, dt);
      lens = THREE.MathUtils.damp(lens, desiredLens, 2.5, dt);
    }
    camera.position.copy(eye);
    camera.lookAt(smoothAim);
    const fov = lensToFov(lens, camera.aspect);
    if (
      Math.abs(camera.fov - fov) > 0.01 ||
      camera.near !== (INTERIOR.has(shot.type) ? 0.06 : exteriorNear)
    ) {
      camera.fov = fov;
    }
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld(true);
    const focusDistance = focus ?? camera.position.distanceTo(smoothAim);
    return {
      letterbox: 1,
      dofFocus: focusDistance,
      dofRange: Math.max(1.2, focusDistance * (lens > 70 ? 0.08 : 0.35)),
      dofMaxBlur: aperture,
      ...pendingLook,
    };
  }

  const api = {
    /**
     * context: { dt, distance, direction, speed, inTunnel, stop: {id, distance} | null,
     *   bridge: {distance} | null, tunnelAhead: {distance} | null,
     *   place: {id, title, subtitle, line} | null, enabled }
     * Returns the film look to apply, or null when the director is idle.
     */
    update(context) {
      const dt = Math.min(Math.max(context.dt ?? 0, 0), 0.1);
      ctx = context;
      const wanted = Boolean(context.enabled) || Boolean(sequence) || queue.length > 0;
      if (!wanted) {
        if (active) camera.near = exteriorNear;
        active = false;
        shot = null;
        return null;
      }
      if (!active) {
        active = true;
        shot = null;
        lastPlace = context.place?.id ?? null;
      }
      elapsed += dt;
      if (context.place && context.place.id !== lastPlace) {
        lastPlace = context.place.id;
        if (!sequence) pendingPlace = context.place;
      }
      if (shotEnded()) nextShot();
      shot.t += dt;
      const look = pose(dt);
      pendingLook = {};
      return look;
    },
    /** Cut to one shot now. The automatic editor resumes after it. */
    cut(spec) {
      const normalized = normalizeShot(spec);
      queue.unshift(normalized);
      if (active) nextShot();
      return api.getState();
    },
    /** Queue a scripted sequence; `title` opens it with a title card. */
    play({ title = null, shots, loop = false }) {
      if (!Array.isArray(shots) || !shots.length || shots.length > 40)
        throw new TypeError('A sequence needs 1–40 shots.');
      if (title !== null && (typeof title !== 'string' || title.length > 80))
        throw new TypeError('title must be text up to 80 characters.');
      const normalized = shots.map(normalizeShot);
      sequence = { title, shots: normalized, loop: Boolean(loop) };
      queue = normalized.map((spec) => structuredClone(spec));
      if (title) onCaption({ kind: 'title', title, seconds: 4.5 });
      pendingLook = { cutToBlack: true };
      shot = null;
      return api.getState();
    },
    stop() {
      queue = [];
      sequence = null;
      shot = null;
      return api.getState();
    },
    getState() {
      return {
        active,
        mode: sequence ? 'sequence' : 'auto',
        sequence: sequence
          ? { title: sequence.title, loop: sequence.loop, total: sequence.shots.length }
          : null,
        queued: queue.length,
        shot: shot
          ? {
              type: shot.type,
              scripted: shot.scripted,
              elapsed: Number(shot.t.toFixed(2)),
              duration: shot.duration,
              lensMm: Number(lens.toFixed(1)),
              subject: shot.spec.subject ?? null,
            }
          : null,
        history: history.map((item) => ({ ...item })),
        shotTypes: [...SHOT_TYPES],
      };
    },
  };
  return api;
}
