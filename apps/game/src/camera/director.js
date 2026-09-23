import { CAR_SPACING, CAR_COUNT } from '../train/consist.js';
import { cabPose, interiorPose } from './camera.js';
import {
  bearing,
  composeAim,
  createFramingMonitor,
  faceVisible,
  lineSide,
  placeView,
  searchView,
  thirds,
} from './shot-framing.js';

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
  'insert',
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
  insert: 'close',
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
  insert: 5,
};
const APERTURE = { deep: 0, normal: 4, shallow: 9 };
const INTERIOR = new Set(['cab', 'window']);
const PERSON_SUBJECT = new Set(['portrait', 'orbit']);
/** A seated passenger's head closer than this may not appear in a window shot. */
const WINDOW_FACE_RANGE = 3.2;

/** How much of a landscape frame's width a tall frame keeps, by framing and shot scale. */
const PORTRAIT_WIDTH = {
  wide: { wide: 1.5, medium: 1.5, close: 1.5 },
  // Vertical video: a standing person already fits a tall frame, so close shots stay close.
  subject: { wide: 1.4, medium: 1.2, close: 0.95 },
};

/**
 * Vertical field of view for a full-frame focal length, widened on portrait screens.
 * framing 'wide' (the game on a phone) keeps most of the landscape width in every
 * shot; 'subject' (vertical video renders) widens close shots much less.
 */
export function lensToFov(lensMm, aspect = 16 / 9, { framing = 'wide', scale = 'medium' } = {}) {
  const vertical = 2 * Math.atan(12 / lensMm);
  if (aspect >= 1.2) return (vertical * 180) / Math.PI;
  const width = (PORTRAIT_WIDTH[framing] ?? PORTRAIT_WIDTH.wide)[scale] ?? 1.5;
  const widened = 2 * Math.atan((Math.tan(vertical / 2) * width) / Math.max(aspect, 0.3));
  return Math.min(75, (widened * 180) / Math.PI);
}

/** Portrait framings: one face, over the listener's shoulder, or both people. */
const FRAMINGS = ['single', 'ots', 'two'];

function validSubject(s, trainParts) {
  return (
    (trainParts && ['lead', 'middle', 'rear'].includes(s)) ||
    (s && typeof s === 'object' && typeof s.person === 'string' && s.person.length <= 48) ||
    (trainParts &&
      s &&
      typeof s === 'object' &&
      typeof s.prop === 'string' &&
      s.prop.length <= 48) ||
    (trainParts &&
      s &&
      typeof s === 'object' &&
      typeof s.stop === 'string' &&
      s.stop.length <= 48) ||
    (s &&
      typeof s === 'object' &&
      Array.isArray(s.point) &&
      s.point.length === 3 &&
      s.point.every(Number.isFinite))
  );
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
    if (!validSubject(spec.subject, true))
      throw new TypeError(
        'subject must be lead, middle, rear, {person: id}, {stop: id}, {prop: id} or {point: [x, y, z]}.',
      );
    shot.subject = typeof spec.subject === 'string' ? spec.subject : structuredClone(spec.subject);
  }
  if (spec.partner !== undefined) {
    if (!validSubject(spec.partner, false))
      throw new TypeError('partner must be {person: id} or {point: [x, y, z]}.');
    shot.partner = structuredClone(spec.partner);
  }
  if (spec.framing !== undefined) {
    if (!FRAMINGS.includes(spec.framing))
      throw new TypeError(`framing must be one of: ${FRAMINGS.join(', ')}.`);
    shot.framing = spec.framing;
  }
  if (PERSON_SUBJECT.has(shot.type) && shot.type === 'portrait' && typeof shot.subject !== 'object')
    throw new TypeError('A portrait needs a person, stop or point subject.');
  if (shot.type === 'insert' && typeof shot.subject !== 'object')
    throw new TypeError('An insert needs a prop, person or point subject.');
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
      if (key === 'weather' && ['clear', 'rain', 'snow', 'storm'].includes(value))
        set.weather = value;
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
  // World positions of the seated passengers' heads in the car a window shot films.
  interiorHeads = () => [],
  onSet = () => {},
  onCaption = () => {},
  // Framing substitutions (a blocked angle replaced, a line crossed), for the episode log.
  onNote = () => {},
  seed = 1907,
  portraitFraming = 'wide',
}) {
  if (!(portraitFraming in PORTRAIT_WIDTH))
    throw new TypeError('portraitFraming must be wide or subject.');
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
    if (!resolved) return trainPoint(midD());
    return new THREE.Vector3(...(Array.isArray(resolved) ? resolved : resolved.point));
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

  // ---- people: faces, lines of action and clear sightlines ----

  /**
   * Where a person's face is. resolveSubject may answer [x, y, z] (the figure's feet) or
   * { point, head, heading } with the head bone and body heading. Points and stops keep
   * the old aim, 1.25 m above the point.
   */
  function personPose(subject) {
    if (!subject || typeof subject !== 'object') return null;
    const data = Array.isArray(subject.point)
      ? { point: subject.point, aimLift: 1.25 }
      : resolveSubject(subject);
    if (!data) return null;
    const value = Array.isArray(data) ? { point: data } : data;
    const feet = new THREE.Vector3(...value.point);
    const eyes = value.head
      ? new THREE.Vector3(...value.head).addScaledVector(up, 0.06)
      : feet.clone().addScaledVector(up, value.aimLift ?? (subject.person ? 1.4 : 1.25));
    // A figure's heading turns it about y from facing +z, so its forward is (sin h, cos h).
    const facing = Number.isFinite(value.heading)
      ? Math.atan2(Math.cos(value.heading), Math.sin(value.heading))
      : null;
    return {
      id: subject.person ?? null,
      feet,
      eyes,
      chest: eyes.clone().addScaledVector(up, value.head ? -0.42 : -0.35),
      facing,
      // Somewhere tight (a seat in a carriage): the camera stands no further than this.
      reach: Number.isFinite(value.reach) ? value.reach : null,
    };
  }
  const flatDistance = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
  /** Terrain only: a few samples along the sightline must stay above the ground. */
  function terrainClear(from, to) {
    for (let i = 1; i < 8; i++) {
      tmp.lerpVectors(from, to, i / 8);
      if (tmp.y < ground(tmp) + 0.15) return false;
    }
    return true;
  }
  /** Share of the weighted target points a camera at `from` can see. */
  function sightScore(from, targets, ignore) {
    if (from.y < ground(from) + 0.5) return 0;
    let seen = 0,
      total = 0;
    for (const { point, weight } of targets) {
      total += weight;
      if (
        terrainClear(from, point) &&
        !obstructed(from, point, { people: true, train: true, ignore })
      )
        seen += weight;
    }
    return total ? seen / total : 0;
  }
  // The side of the last dialogue line of action, so a conversation keeps its screen sides.
  let axis = null;
  const pairKey = (a, b) => [a.id ?? 'point', b.id ?? 'point'].sort().join('|');
  /** Side sign relative to the line from `speaker` to `partner`, stored per pair. */
  const storedSide = (speaker, partner) => {
    if (!axis || axis.key !== pairKey(speaker, partner)) return null;
    return (speaker.id ?? 'point') <= (partner.id ?? 'point') ? axis.side : -axis.side;
  };
  const rememberSide = (speaker, partner, side) => {
    const first = (speaker.id ?? 'point') <= (partner.id ?? 'point');
    axis = { key: pairKey(speaker, partner), side: first ? side : -side };
  };

  /**
   * Plans a person shot: the framing's base viewpoint, its targets, the 180° line, then the
   * clearest nearby viewpoint. Stored on the shot so the held shot can re-check it.
   */
  function planPerson(next, spec) {
    const speaker =
      personPose(spec.subject) ??
      (() => {
        const point = subjectPoint(spec.subject);
        return {
          id: null,
          feet: point,
          eyes: point.clone().addScaledVector(up, 1.25),
          chest: point.clone(),
          facing: null,
        };
      })();
    const partner = spec.partner ? personPose(spec.partner) : null;
    const separation = partner ? flatDistance(speaker.eyes, partner.eyes) : 0;
    let framing = spec.framing ?? 'single';
    if (framing !== 'single' && (!partner || separation < 0.5 || separation > 7.5)) {
      if (partner) onNote(`${framing} framing needs two people within 7.5 m; using a single`);
      framing = 'single';
    }
    const rail = railNearZ(speaker.feet.z);
    // Without a partner, people on platforms face the railway: the line runs along their look.
    const lineAngle = partner
      ? bearing(speaker.eyes, partner.eyes)
      : (speaker.facing ?? bearing(speaker.feet, rail));
    let lensMm =
      spec.lens ??
      (framing === 'ots'
        ? THREE.MathUtils.clamp(38 + separation * 7, 50, 85)
        : framing === 'two'
          ? 35
          : 50);
    const vfov =
      (lensToFov(lensMm, camera.aspect, { framing: portraitFraming, scale: 'close' }) * Math.PI) /
      180;
    const baseFor = (side) => {
      if (framing === 'ots') {
        // Behind the listener, just off the shoulder on the camera's side of the line.
        const back = partner.eyes
          .clone()
          .add(new THREE.Vector3(Math.cos(lineAngle), 0, Math.sin(lineAngle)).multiplyScalar(0.95))
          .add(
            new THREE.Vector3(
              Math.cos(lineAngle + (side * Math.PI) / 2),
              0,
              Math.sin(lineAngle + (side * Math.PI) / 2),
            ).multiplyScalar(0.55),
          );
        return {
          angle: bearing(speaker.eyes, back),
          reach: flatDistance(speaker.eyes, back),
          rise: partner.eyes.y - speaker.eyes.y + 0.1,
        };
      }
      if (framing === 'two') {
        const width = separation + 1.4;
        const reach = Math.min(
          speaker.reach ?? Infinity,
          THREE.MathUtils.clamp(
            width / 2 / Math.tan(Math.atan(Math.tan(vfov / 2) * camera.aspect)),
            2.5,
            14,
          ),
        );
        return { angle: lineAngle + (side * Math.PI) / 2, reach, rise: 0.1 };
      }
      // A single is a front three-quarter view: 35° off the way the face points, on the
      // wanted side of the line when either turn allows it.
      let angle = lineAngle + side * 0.55;
      if (speaker.facing !== null) {
        const turns = [0.6, -0.6].map((turn) => speaker.facing + turn);
        angle = turns.reduce((best, next) =>
          Math.sin(next - lineAngle) * side > Math.sin(best - lineAngle) * side ? next : best,
        );
      }
      // A tall frame is narrow: stand closer so the face is not lost in the height.
      const reach = spec.distance ?? speaker.reach ?? (camera.aspect < 1 ? 2.5 : 3.2);
      return { angle, reach, rise: spec.height ?? 0.05 };
    };
    // Side of the line: an authored side, then the conversation's side, then whichever
    // side shows more of the face, then a coin toss.
    let side = spec.side ? sideSign(spec, 1) : partner ? storedSide(speaker, partner) : null;
    if (side === null && speaker.facing !== null) {
      const front = (s) => Math.cos(baseFor(s).angle - speaker.facing);
      side = front(1) >= front(-1) ? 1 : -1;
    }
    side ??= next.sign;
    const pivot =
      framing === 'two' ? speaker.eyes.clone().lerp(partner.eyes, 0.5) : speaker.eyes.clone();
    const targets =
      framing === 'two'
        ? [
            { point: speaker.eyes, weight: 0.45 },
            { point: partner.eyes, weight: 0.35 },
            { point: speaker.chest, weight: 0.2 },
          ]
        : [
            { point: speaker.eyes, weight: 0.6 },
            { point: speaker.chest, weight: 0.4 },
          ];
    const ignore = speaker.id ? [speaker.id] : [];
    const score = (view) =>
      sightScore(new THREE.Vector3().copy(placeView(pivot, view)), targets, ignore);
    // Dialogue needs the face: never the back of the speaker's head.
    const accept = (view) =>
      view.rise > -0.7 &&
      view.rise < 2.4 &&
      view.reach > 0.9 &&
      (framing === 'two' || faceVisible(speaker.facing, view.angle));
    let base = baseFor(side);
    // Over a shoulder the speaker is turned away from: film them as a single instead.
    if (framing === 'ots' && !faceVisible(speaker.facing, base.angle, (80 * Math.PI) / 180)) {
      onNote(
        `ots of ${speaker.id ?? 'the subject'}: turned away from the listener; using a single`,
      );
      framing = 'single';
      lensMm = spec.lens ?? 50;
      base = baseFor(side);
    }
    const found = searchView({ base, score, accept, lineAngle, side });
    const chosenSide = lineSide(lineAngle, found.view.angle);
    if (partner) rememberSide(speaker, partner, chosenSide);
    const who = speaker.id ?? 'the subject';
    if (found.flipped)
      onNote(`${framing} of ${who}: no clear angle on this side; crossed the line`);
    else if (found.fallback)
      onNote(
        `${framing} of ${who}: no fully clear angle; best view ${Math.round(found.score * 100)}% clear`,
      );
    else if (found.view.cost > 0.01)
      onNote(
        `${framing} of ${who}: planned angle blocked; moved ${describeMove(base, found.view)}`,
      );
    next.person = {
      framing,
      who,
      lens: lensMm,
      accept,
      ignore,
      pivot,
      view: found.view,
      base,
      side: chosenSide,
      lineAngle,
      score: found.score,
      monitor: createFramingMonitor(),
      substitutions: found.view.cost > 0.01 || found.flipped ? 1 : 0,
    };
    return true;
  }
  function describeMove(from, to) {
    const parts = [];
    const turn = Math.round(
      (THREE.MathUtils.euclideanModulo(to.angle - from.angle + Math.PI, 2 * Math.PI) - Math.PI) *
        57.3,
    );
    if (Math.abs(turn) >= 5) parts.push(`${Math.abs(turn)}° round`);
    if (Math.abs(to.rise - from.rise) > 0.1) parts.push(to.rise > from.rise ? 'up' : 'down');
    if (to.reach < from.reach * 0.9) parts.push('in');
    if (to.reach > from.reach * 1.1) parts.push('back');
    return parts.join(', ') || 'slightly';
  }
  /** Live pivot and targets for a held person shot (people move). */
  function personLive(spec, framing) {
    const speaker = personPose(spec.subject);
    if (!speaker) return null;
    const partner = spec.partner ? personPose(spec.partner) : null;
    const two = framing === 'two' && partner;
    return {
      speaker,
      partner,
      pivot: two ? speaker.eyes.clone().lerp(partner.eyes, 0.5) : speaker.eyes.clone(),
      targets: two
        ? [
            { point: speaker.eyes, weight: 0.45 },
            { point: partner.eyes, weight: 0.35 },
            { point: speaker.chest, weight: 0.2 },
          ]
        : [
            { point: speaker.eyes, weight: 0.6 },
            { point: speaker.chest, weight: 0.4 },
          ],
    };
  }

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
      // Shelter posts and roofs stand along the platform: step along it, sideways and up
      // before giving up on the shot.
      for (const sign of [next.sign, -next.sign])
        for (const [ahead, lateral, height] of [
          [38, 5.2, 2.6],
          [32, 5.2, 2.6],
          [44, 5.2, 2.6],
          [38, 4.2, 2.6],
          [38, 6.4, 3.2],
          [30, 4.4, 3.4],
        ]) {
          const { p, side } = frameAt(stop.distance + ctx.direction * ahead);
          const candidate = p.clone().addScaledVector(side, sign * lateral);
          candidate.y = p.y + height;
          if (blocked(candidate, trainPoint(leadD())) < 0.25) {
            if (ahead !== 38 || lateral !== 5.2 || sign !== next.sign)
              onNote(
                `platform: first position blocked; moved to ${ahead} m along, ${lateral} m out`,
              );
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
    if (next.type === 'portrait') return planPerson(next, spec);
    if (next.type === 'window') return planWindow(next);
    return true;
  }

  // ---- window shots: never a seated passenger's face filling the frame ----

  const probe = new THREE.PerspectiveCamera();
  const headPoint = new THREE.Vector3();
  /** How far inside WINDOW_FACE_RANGE the nearest passenger face in frame sits; 0 when none. */
  function windowCrowding(yaw, lensMm) {
    const view = interiorPose(
      track,
      ctx.distance,
      getTrackLength(),
      ctx.direction,
      true,
      yaw,
      -0.05,
    );
    probe.fov = lensToFov(lensMm, camera.aspect, { framing: portraitFraming, scale: 'close' });
    probe.aspect = camera.aspect;
    probe.near = 0.05;
    probe.far = 100;
    probe.position.copy(view.eye);
    probe.lookAt(view.target);
    probe.updateProjectionMatrix();
    probe.updateMatrixWorld(true);
    let worst = 0;
    for (const head of interiorHeads() ?? []) {
      headPoint.set(head[0] ?? head.x, head[1] ?? head.y, head[2] ?? head.z);
      const range = headPoint.distanceTo(view.eye);
      if (range >= WINDOW_FACE_RANGE) continue;
      headPoint.project(probe);
      if (headPoint.z < 1 && Math.abs(headPoint.x) < 1.25 && Math.abs(headPoint.y) < 1.25)
        worst = Math.max(worst, WINDOW_FACE_RANGE - range);
    }
    return worst;
  }
  /** Picks a window bearing with no passenger face closer than WINDOW_FACE_RANGE in frame. */
  function windowYaw(sign, lensMm, preferred) {
    const signs = [sign, -sign];
    const yaws = [preferred];
    for (const s of signs) for (const y of [1.2, 1.35, 1.05, 1.5, 0.85]) yaws.push(s * y);
    let best = null;
    for (const yaw of yaws) {
      const crowding = windowCrowding(yaw, lensMm);
      if (crowding === 0) return { yaw, clear: true };
      if (!best || crowding < best.crowding) best = { yaw, crowding };
    }
    return { yaw: best.yaw, clear: false };
  }
  function planWindow(next) {
    const lensMm = next.spec.lens ?? 30;
    const preferred = next.sign * (1.15 + rand() * 0.25);
    const { yaw, clear } = windowYaw(next.sign, lensMm, preferred);
    if (!clear)
      onNote('window: a passenger face is within 3.2 m at every angle; using the least crowded');
    else if (yaw !== preferred)
      onNote('window: a passenger sat close to the lens; turned to a clear window');
    next.yaw = yaw;
    next.yawNow = yaw;
    next.windowCheck = 0;
    return true;
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
    // Someone seated in a moving carriage: aim without operator lag, or the lag at line speed
    // leaves the lens pointing metres behind them.
    let rigid = false;
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
        // Riders board while the shot holds: re-check twice a second and turn away smoothly.
        shot.windowCheck = (shot.windowCheck ?? 0) + dt;
        if (shot.windowCheck > 0.5) {
          shot.windowCheck = 0;
          const lensMm = spec.lens ?? 30;
          if (windowCrowding(shot.yaw, lensMm) > 0) {
            const next = windowYaw(shot.yaw >= 0 ? 1 : -1, lensMm, shot.yaw);
            if (next.yaw !== shot.yaw) {
              shot.yaw = next.yaw;
              onNote('window: a passenger came into frame close to the lens; turned away');
            }
          }
        }
        shot.yawNow = THREE.MathUtils.damp(
          shot.yawNow ?? shot.yaw ?? 1.2,
          shot.yaw ?? 1.2,
          2.2,
          dt,
        );
        const view = interiorPose(
          track,
          ctx.distance,
          getTrackLength(),
          ctx.direction,
          true,
          shot.yawNow ?? shot.yaw ?? 1.2,
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
      case 'portrait': {
        const person = shot.person;
        const live = personLive(spec, person.framing);
        if (live) person.pivot = live.pivot;
        const pivot = person.pivot ?? personPose(spec.subject)?.eyes ?? subjectPoint(spec.subject);
        // A slow drift round the chosen bearing, turning away from the line of action.
        const drift = t * 0.008 * person.side;
        const placed = placeView(pivot, { ...person.view, angle: person.view.angle + drift });
        eye.set(placed.x, placed.y, placed.z);
        if (person.blend) {
          person.blend.t += dt;
          const u = THREE.MathUtils.clamp(person.blend.t / person.blend.duration, 0, 1);
          eye.lerpVectors(person.blend.from, eye, u * u * (3 - 2 * u));
          if (u >= 1) person.blend = null;
        }
        lift(eye, 0.9);
        rigid = Boolean(live?.speaker.reach);
        if (live && person.monitor.due(dt)) {
          person.score = sightScore(eye, live.targets, person.ignore);
          if (person.monitor.report(person.score)) {
            // Blocked for two checks in a row: search again round the planned bearing.
            const found = searchView({
              base: person.base,
              lineAngle: person.lineAngle,
              side: person.side,
              accept: person.accept,
              score: (view) =>
                sightScore(
                  new THREE.Vector3().copy(placeView(live.pivot, view)),
                  live.targets,
                  person.ignore,
                ),
            });
            if (person.monitor.better(person.score, found.score)) {
              person.blend = { from: eye.clone(), t: 0, duration: 0.9 };
              person.view = { ...found.view, angle: found.view.angle - drift };
              person.score = found.score;
              person.substitutions++;
              onNote(
                `${person.framing} of ${person.who}: view blocked while holding; moved ${describeMove(person.base, found.view)}${found.flipped ? ' across the line' : ''}`,
              );
            }
            // Either way, rest before the next search so the choice cannot flicker.
            person.monitor.switched();
          }
        }
        desiredLens = person.lens;
        const vfov =
          (lensToFov(person.lens, camera.aspect, { framing: portraitFraming, scale: 'close' }) *
            Math.PI) /
          180;
        const face = live?.speaker.eyes ?? pivot;
        const toFace = Math.hypot(face.x - eye.x, face.z - eye.z) || 1;
        // The camera's screen-right direction on the ground.
        const rightX = -(face.z - eye.z) / toFace,
          rightZ = (face.x - eye.x) / toFace;
        const screenSide = (point) => {
          const along =
            ((point.x - eye.x) * rightX + (point.z - eye.z) * rightZ) /
            (Math.hypot(point.x - eye.x, point.z - eye.z) || 1);
          return Math.abs(along) < 0.05 ? 0 : Math.sign(along);
        };
        const tall = camera.aspect < 1;
        let target = face;
        let offsets;
        if (person.framing === 'two') {
          target = pivot;
          offsets = { nx: 0, ny: tall ? 0.3 : 0.26 };
        } else if (person.framing === 'ots' && live?.partner) {
          // The listener's shoulder fills one side; the speaker sits on the other third.
          offsets = { nx: -screenSide(live.partner.eyes) * (tall ? 0.12 : 0.28), ny: 0.3 };
        } else {
          const facing = live?.speaker.facing ?? null;
          let look = 0;
          if (facing !== null) {
            const along = Math.cos(facing) * rightX + Math.sin(facing) * rightZ;
            look = Math.abs(along) < 0.25 ? 0 : Math.sign(along);
          } else if (live?.partner) look = screenSide(live.partner.eyes);
          offsets = thirds(camera.aspect, look);
        }
        const composed = composeAim(eye, target, { ...offsets, vfov, aspect: camera.aspect });
        aim.set(composed.x, composed.y, composed.z);
        aperture = APERTURE[spec.aperture ?? 'shallow'];
        handheld = 0.0025;
        break;
      }
      case 'insert': {
        // A still, square-on close of a prop: the resolver names where the camera stands
        // (`eye`); otherwise it stands `distance` metres back along the current view.
        const data = Array.isArray(spec.subject.point) ? null : resolveSubject(spec.subject);
        const target = subjectPoint(spec.subject);
        if (data && Array.isArray(data.eye)) eye.set(...data.eye);
        else if (t === 0 || !shot.insertEye) {
          tmp.copy(camera.position).sub(target).setY(0).normalize();
          eye.copy(target).addScaledVector(tmp, spec.distance ?? 2.2);
        } else eye.copy(shot.insertEye);
        shot.insertEye = eye.clone();
        // A slow push in keeps a held insert alive.
        eye.lerp(target, Math.min(0.12, t * 0.012));
        aim.copy(target);
        desiredLens = spec.lens ?? data?.lens ?? 40;
        aperture = APERTURE[spec.aperture ?? 'normal'];
        focus = eye.distanceTo(target);
        handheld = 0.0008;
        break;
      }
      case 'orbit': {
        const subject = subjectPoint(spec.subject ?? 'middle');
        const personal = typeof spec.subject === 'object';
        const look = personal ? subject.clone().addScaledVector(up, 1.25) : subject;
        const around = frameAt(midD());
        const radius = spec.distance ?? 18;
        const angle = shot.phase + t * 0.12 * shot.sign;
        eye
          .copy(look)
          .addScaledVector(around.side, Math.cos(angle) * radius)
          .addScaledVector(around.f, Math.sin(angle) * radius);
        eye.y = look.y + (spec.height ?? 6);
        lift(eye, 1.2);
        aim.copy(look);
        desiredLens = spec.lens ?? 35;
        aperture = APERTURE[spec.aperture ?? 'normal'];
        handheld = 0.002;
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
      if (rigid) smoothAim.copy(aim);
      else {
        smoothAim.x = THREE.MathUtils.damp(smoothAim.x, aim.x, 7, dt);
        smoothAim.y = THREE.MathUtils.damp(smoothAim.y, aim.y, 7, dt);
        smoothAim.z = THREE.MathUtils.damp(smoothAim.z, aim.z, 7, dt);
      }
      lens = THREE.MathUtils.damp(lens, desiredLens, 2.5, dt);
    }
    camera.position.copy(eye);
    camera.lookAt(smoothAim);
    const fov = lensToFov(lens, camera.aspect, {
      framing: portraitFraming,
      scale: SCALE[shot.type],
    });
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
              partner: shot.spec.partner ?? null,
              framing: shot.person
                ? {
                    kind: shot.person.framing,
                    clear: Number(shot.person.score.toFixed(2)),
                    side: shot.person.side,
                    substitutions: shot.person.substitutions,
                    view: {
                      angle: Number(shot.person.view.angle.toFixed(3)),
                      reach: Number(shot.person.view.reach.toFixed(2)),
                      rise: Number(shot.person.view.rise.toFixed(2)),
                    },
                  }
                : null,
            }
          : null,
        history: history.map((item) => ({ ...item })),
        shotTypes: [...SHOT_TYPES],
      };
    },
  };
  return api;
}
