import { TRAIN_SPAN, TRAIN_CLEARANCE } from '../train/consist.js';
import { createStore } from 'zustand/vanilla';

export const ROUTE_APPROACH_Z = 2250;
export const RETURN_APPROACH_Z = 2950;

/** A fictional pre-authorised excursion slot; physical points remain locked under a train. */
export function createRouteChoice({ network, getDrive, getZ, isBlocked = () => false }) {
  const store = createStore(() => ({
    confirmed: false,
    selectedRoute: 'direct',
    entered: false,
    traversed: false,
  }));
  let entryDirection = null;
  const distances = {};
  function refreshDistances() {
    for (const z of [2250, 2950, 2460, 2760]) distances[z] = network.distanceAtZ?.(z);
  }
  refreshDistances();
  function getState() {
    const drive = getDrive();
    const z = getZ();
    const marker = drive.direction === -1 ? RETURN_APPROACH_Z : ROUTE_APPROACH_Z;
    const near = Math.abs(z - marker) <= 24;
    const stopped = drive.speed <= 0.1;
    const blocked = isBlocked();
    const value = store.getState();
    return {
      ...value,
      approachZ: marker,
      near,
      stopped,
      available:
        near && stopped && !blocked && !drive.emergency && !drive.doorsOpen && !drive.doorsClosing,
      visible:
        !blocked &&
        (Math.abs(z - marker) < 190 ||
          (z >= 2460 && z <= 2760) ||
          (value.traversed && z > 2760 && z < 3075)),
      onBranch: z >= 2460 && z <= 2760,
      needsAuthority: !value.confirmed,
      limitKmh: value.selectedRoute === 'wetland' && z >= 2420 && z <= 2800 ? 20 : null,
      network: network.getState(),
    };
  }
  return {
    subscribe: store.subscribe,
    getState,
    stopDistance() {
      const current = getState();
      const z = getZ();
      const direction = getDrive().direction;
      if (current.confirmed || (current.approachZ - z) * direction < -24) return undefined;
      return distances[current.approachZ];
    },
    invalidateTraversal() {
      entryDirection = null;
      store.setState({ entered: false });
    },
    reset() {
      const result = network.selectRoute('direct', {
        ...getDrive(),
        speed: 0,
        trainSpan: TRAIN_SPAN,
      });
      if (!result.ok) return result;
      entryDirection = null;
      refreshDistances();
      store.setState({
        confirmed: false,
        selectedRoute: 'direct',
        entered: false,
        traversed: false,
      });
      return result;
    },
    recordMovement({ previousDistance, distance, direction, dt }) {
      const value = store.getState();
      if (!value.confirmed || value.traversed || !Number.isFinite(dt) || dt <= 0) return;
      if (entryDirection !== null && entryDirection !== direction) {
        entryDirection = null;
        store.setState({ entered: false });
      }
      const delta = (distance - previousDistance) * direction;
      if (!Number.isFinite(delta) || delta < 0 || delta > 30 * dt + 0.1) {
        store.setState({ entered: false });
        return;
      }
      const entry = distances[direction > 0 ? 2460 : 2760];
      const exit = distances[direction > 0 ? 2760 : 2460] + direction * TRAIN_CLEARANCE;
      if ((previousDistance - entry) * direction <= 0 && (distance - entry) * direction >= 0) {
        entryDirection = direction;
        store.setState({ entered: true });
      }
      if (store.getState().entered && (distance - exit) * direction >= 0)
        store.setState({ entered: false, traversed: true });
    },
    choose(route) {
      if (!['direct', 'wetland'].includes(route)) return { ok: false, message: 'Unknown route.' };
      if (!getState().available)
        return {
          ok: false,
          message: 'Stop at the route board, close the doors, and finish any conversation first.',
        };
      const result = network.selectRoute(route, { ...getDrive(), trainSpan: TRAIN_SPAN });
      if (!result.ok) return { ...result, message: result.reason };
      refreshDistances();
      store.setState({ selectedRoute: route, confirmed: true, entered: false, traversed: false });
      return result;
    },
  };
}

export function nearestScheduledStop(distance, direction, ...stops) {
  return stops
    .filter(Number.isFinite)
    .filter((stop) => (stop - distance) * direction >= -24)
    .sort((a, b) => (a - b) * direction)[0];
}

export function protectRouteStop(drive, previousDistance, stopDistance) {
  if (!Number.isFinite(stopDistance)) return;
  if (
    (previousDistance - stopDistance) * drive.direction <= 0 &&
    (drive.distance - stopDistance) * drive.direction >= 0
  ) {
    drive.distance = stopDistance;
    drive.speed = 0;
    drive.power = 0;
    drive.actualPower = 0;
    drive.brake = 1;
    drive.actualBrake = 1;
  }
}
