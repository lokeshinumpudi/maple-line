/** Route z increases monotonically even when the railway bends sideways. */
export function distanceAtZ(track, trackLength, z) {
  let low = 0;
  let high = 1;
  for (let i = 0; i < 26; i++) {
    const middle = (low + high) / 2;
    if (track.getPointAt(middle).z < z) low = middle;
    else high = middle;
  }
  return ((low + high) / 2) * trackLength;
}

export function nextStop(stops, distance, direction = 1) {
  const candidates = stops.filter((stop) => (stop.distance - distance) * direction >= -12);
  candidates.sort((a, b) => (a.distance - b.distance) * direction);
  return candidates[0] ?? null;
}

export function recordStationVisit(state, dt, stops) {
  state.visitedStops ??= [];
  const stop = stops.find((stop) => Math.abs(stop.distance - state.distance) < 25);
  if (!stop || state.speed > 0.2) {
    state.stopHoldId = null;
    state.stopHoldSeconds = 0;
    return;
  }
  if (state.stopHoldId !== stop.id) {
    state.stopHoldId = stop.id;
    state.stopHoldSeconds = 0;
  }
  state.stopHoldSeconds += dt;
  if (state.stopHoldSeconds >= 2 && !state.visitedStops.includes(stop.id)) {
    state.visitedStops = [...state.visitedStops, stop.id];
  }
}
