import { TRAIN_SPAN } from '../train/consist.js';
export const WETLAND_BRANCH = Object.freeze({ startZ: 2460, endZ: 2760, maxOffset: 12 });
const ROUTE_IDS = ['direct', 'wetland'];
const CAR_OVERHANG = 6.3;
const SWITCH_CLEARANCE = 10;
const MAX_SELECTION_SPEED = 0.1;

/** Signed world-X offset; fixed world Z preserves the station/terrain coordinate contract. */
export function branchOffsetAtZ(z, branch = WETLAND_BRANCH) {
  if (!Number.isFinite(z)) throw new RangeError('Branch position must be finite.');
  if (z <= branch.startZ || z >= branch.endZ) return 0;
  const fraction = (z - branch.startZ) / (branch.endZ - branch.startZ);
  // Position, first derivative and second derivative all meet the direct track at each join.
  return -branch.maxOffset * Math.sin(Math.PI * fraction) ** 4;
}

/** Two paths share the exact original track outside a bounded, left-hand wetland branch. */
export function createRouteNetwork({ THREE, baseTrack, branch = WETLAND_BRANCH }) {
  if (!THREE?.Curve || !baseTrack?.getPointAt || !baseTrack?.getTangentAt || !baseTrack?.getLength)
    throw new TypeError(
      'Route network requires Three.js and a base curve with arc-length sampling.',
    );
  const baseLength = baseTrack.getLength();
  const config = {
    startZ: branch.startZ ?? WETLAND_BRANCH.startZ,
    endZ: branch.endZ ?? WETLAND_BRANCH.endZ,
    maxOffset: branch.maxOffset ?? branch.offset ?? WETLAND_BRANCH.maxOffset,
  };
  const finitePoint = (point) => point && [point.x, point.y, point.z].every(Number.isFinite);
  const start = baseTrack.getPointAt(0),
    end = baseTrack.getPointAt(1);
  if (!Number.isFinite(baseLength) || baseLength <= 0 || !finitePoint(start) || !finitePoint(end))
    throw new RangeError('The base route must have finite positions and positive physical length.');
  if (
    !Object.values(config).every(Number.isFinite) ||
    config.startZ <= start.z ||
    config.endZ >= end.z ||
    config.endZ <= config.startZ ||
    config.maxOffset <= 0 ||
    config.maxOffset > 50
  )
    throw new RangeError(
      'The branch must lie inside the base route and have an offset above zero and at most 50 metres.',
    );
  // Check the supplied curve once. Z inversion must never silently accept a loop or reversed route.
  const checks = Math.max(256, Math.min(20000, Math.ceil(baseLength / 5)));
  let previousZ = start.z;
  for (let i = 1; i <= checks; i++) {
    const point = baseTrack.getPointAt(i / checks);
    if (!finitePoint(point) || point.z <= previousZ)
      throw new RangeError('Route-network base Z must increase monotonically.');
    previousZ = point.z;
  }
  function baseDistanceAtZ(z) {
    if (!Number.isFinite(z)) throw new RangeError('Route Z must be finite.');
    if (z <= start.z) return 0;
    if (z >= end.z) return baseLength;
    let low = 0,
      high = 1;
    for (let i = 0; i < 44; i++) {
      const middle = (low + high) / 2;
      if (baseTrack.getPointAt(middle).z < z) low = middle;
      else high = middle;
    }
    return ((low + high) / 2) * baseLength;
  }
  const baseStartDistance = baseDistanceAtZ(config.startZ);
  const baseEndDistance = baseDistanceAtZ(config.endZ);
  const baseBranchLength = baseEndDistance - baseStartDistance;
  class WetlandCurve extends THREE.Curve {
    getPoint(t, target = new THREE.Vector3()) {
      const fraction = Math.max(0, Math.min(1, t));
      baseTrack.getPointAt((baseStartDistance + fraction * baseBranchLength) / baseLength, target);
      target.x += branchOffsetAtZ(target.z, config);
      return target;
    }
    getTangent(t, target = new THREE.Vector3()) {
      if (t <= 0) return baseTrack.getTangentAt(baseStartDistance / baseLength, target);
      if (t >= 1) return baseTrack.getTangentAt(baseEndDistance / baseLength, target);
      const delta = 1e-5;
      return target
        .copy(this.getPoint(Math.min(1, t + delta)))
        .sub(this.getPoint(Math.max(0, t - delta)))
        .normalize();
    }
  }
  const wetland = new WetlandCurve();
  wetland.arcLengthDivisions = Math.max(512, Math.min(20000, Math.ceil(baseBranchLength / 0.25)));
  wetland.updateArcLengths();
  const branchLength = wetland.getLength();
  const extraLength = branchLength - baseBranchLength;
  let selectedRoute = 'direct';
  function requireRoute(id) {
    if (!ROUTE_IDS.includes(id)) throw new RangeError('Unknown route; use direct or wetland.');
  }
  function lengthFor(id) {
    requireRoute(id);
    return baseLength + (id === 'wetland' ? extraLength : 0);
  }
  function distanceAtZ(z, routeId = selectedRoute) {
    requireRoute(routeId);
    const baseDistance = baseDistanceAtZ(z);
    if (routeId === 'direct' || z <= config.startZ) return baseDistance;
    if (z >= config.endZ) return baseDistance + extraLength;
    let low = 0,
      high = 1;
    for (let i = 0; i < 44; i++) {
      const middle = (low + high) / 2;
      if (wetland.getPointAt(middle).z < z) low = middle;
      else high = middle;
    }
    return baseStartDistance + ((low + high) / 2) * branchLength;
  }
  function baseDistanceToSelectedDistance(distance) {
    if (!Number.isFinite(distance) || distance < 0 || distance > baseLength)
      throw new RangeError('Base distance must lie on the base route.');
    if (selectedRoute === 'direct' || distance <= baseStartDistance) return distance;
    if (distance >= baseEndDistance) return distance + extraLength;
    return distanceAtZ(baseTrack.getPointAt(distance / baseLength).z);
  }
  function sampleRoute(u, target, tangent) {
    if (!Number.isFinite(u)) throw new RangeError('Route fraction must be finite.');
    const distance = Math.max(0, Math.min(1, u)) * lengthFor(selectedRoute);
    const method = tangent ? 'getTangentAt' : 'getPointAt';
    if (selectedRoute === 'direct' || distance <= baseStartDistance)
      return baseTrack[method](distance / baseLength, target);
    if (distance >= baseStartDistance + branchLength)
      return baseTrack[method]((distance - extraLength) / baseLength, target);
    return wetland[method]((distance - baseStartDistance) / branchLength, target);
  }
  // A Curve-compatible selected track lets existing train/camera/render consumers keep one reference.
  class SelectedTrack extends THREE.Curve {
    getPointAt(u, target = new THREE.Vector3()) {
      return sampleRoute(u, target, false);
    }
    getPoint(t, target) {
      return this.getPointAt(t, target);
    }
    getTangentAt(u, target = new THREE.Vector3()) {
      return sampleRoute(u, target, true);
    }
    getTangent(t, target) {
      return this.getTangentAt(t, target);
    }
    getLength() {
      return lengthFor(selectedRoute);
    }
    getLengths(divisions = this.arcLengthDivisions) {
      return Array.from({ length: divisions + 1 }, (_, i) => (i / divisions) * this.getLength());
    }
  }
  const track = new SelectedTrack();
  function getState() {
    return {
      selectedRoute,
      length: track.getLength(),
      baseLength,
      branch: {
        ...config,
        startDistance: baseStartDistance,
        endDistance:
          selectedRoute === 'wetland' ? baseStartDistance + branchLength : baseEndDistance,
        baseStartDistance,
        baseEndDistance,
        baseBranchLength,
        branchLength,
        extraLength,
      },
      selectionRules: {
        maxSpeed: MAX_SELECTION_SPEED,
        carriageOverhang: CAR_OVERHANG,
        switchClearance: SWITCH_CLEARANCE,
      },
    };
  }
  function selectRoute(id, { distance, direction = 1, trainSpan = TRAIN_SPAN, speed = 0 } = {}) {
    const reject = (reason) => ({
      ok: false,
      reason,
      routeId: selectedRoute,
      length: track.getLength(),
    });
    if (!ROUTE_IDS.includes(id)) return reject('unknown-route');
    if (
      !Number.isFinite(distance) ||
      distance < 0 ||
      distance > track.getLength() ||
      ![1, -1].includes(direction) ||
      !Number.isFinite(trainSpan) ||
      trainSpan < 0 ||
      trainSpan > baseLength ||
      !Number.isFinite(speed) ||
      speed < 0
    )
      return reject('invalid-train-state');
    if (id === selectedRoute)
      return {
        ok: true,
        changed: false,
        distance,
        routeId: selectedRoute,
        length: track.getLength(),
      };
    if (speed > MAX_SELECTION_SPEED) return reject('train-moving');
    const tail = distance - direction * trainSpan;
    if (tail < 0 || tail > track.getLength()) return reject('invalid-train-state');
    const first = Math.min(distance, tail) - CAR_OVERHANG;
    const last = Math.max(distance, tail) + CAR_OVERHANG;
    const branchEndDistance = getState().branch.endDistance;
    if (
      last >= baseStartDistance - SWITCH_CLEARANCE &&
      first <= branchEndDistance + SWITCH_CLEARANCE
    )
      return reject('turnout-occupied');
    // Both routes are identical here. Arc-length remapping also preserves every following carriage.
    const z = track.getPointAt(distance / track.getLength()).z;
    const nextDistance = distanceAtZ(z, id);
    selectedRoute = id;
    return {
      ok: true,
      changed: true,
      distance: nextDistance,
      routeId: selectedRoute,
      length: track.getLength(),
    };
  }
  Object.assign(track, {
    track,
    selectRoute,
    distanceAtZ,
    baseDistanceAtZ,
    baseDistanceToSelectedDistance,
    getState,
    getBranchCurve(id = 'wetland') {
      if (id !== 'wetland') throw new RangeError('The optional branch curve is wetland.');
      return wetland;
    },
  });
  return track;
}
