/** Local rail excursions. Existing station, bridge and tunnel anchors remain unchanged. */
export const SCENIC_BENDS = Object.freeze(
  [
    { id: 'cedar-river-sweep', start: 3250, end: 4550, amplitude: 56 },
    { id: 'orchard-return', start: 6600, end: 7850, amplitude: -48 },
    { id: 'forest-contour', start: 8200, end: 9450, amplitude: 52 },
    { id: 'terraced-valley', start: 16200, end: 17450, amplitude: -58 },
    { id: 'harbour-approach', start: 19500, end: 20950, amplitude: 54 },
  ].map((bend) => Object.freeze(bend)),
);

export function scenicAlignmentOffset(z) {
  if (!Number.isFinite(z)) return 0;
  const bend = SCENIC_BENDS.find((candidate) => z > candidate.start && z < candidate.end);
  if (!bend) return 0;
  const t = (z - bend.start) / (bend.end - bend.start);
  // Triple roots at both ends preserve position, tangent and curvature at joins.
  const envelope = t * (1 - t);
  return bend.amplitude * 64 * envelope * envelope * envelope;
}

export function scenicAlignmentSpeedLimit(z) {
  if (!Number.isFinite(z)) return Infinity;
  return SCENIC_BENDS.some((bend) => z >= bend.start - 150 && z <= bend.end + 150) ? 80 : Infinity;
}
