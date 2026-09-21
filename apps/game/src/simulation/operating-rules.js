import { SCENIC_BENDS } from './scenic-alignment.js';
// Fictional operating speeds for this route, not a real railway's rule book.
export const ROUTE_RESTRICTIONS = Object.freeze([
  ...SCENIC_BENDS.map((bend) => ({
    id: bend.id,
    start: bend.start - 150,
    end: bend.end + 150,
    limitKmh: 80,
    reason: 'Scenic curves',
  })),
  { id: 'momiji-loop', start: 410, end: 650, limitKmh: 25, reason: 'Momiji passing loop' },
  { id: 'valley-bridge', start: 6173.8, end: 6326.2, limitKmh: 25, reason: 'Valley bridge' },
  { id: 'ishikura-tunnel', start: 11400, end: 11760, limitKmh: 35, reason: 'Ishikura tunnel' },
  { id: 'snow-country', start: 12000, end: 13900, limitKmh: 30, reason: 'Mountain section' },
]);

/** Anticipation limits automatic driving without taking control away from manual driving. */
export function operatingEnvelope(z, { direction = 1, weather = 'clear', grade = 0 } = {}) {
  if (!Number.isFinite(z) || !Number.isFinite(grade))
    throw new TypeError('A finite route pose is required.');
  const sign = direction === -1 ? -1 : 1;
  const grip = weather === 'snow' ? 0.6 : weather === 'rain' ? 0.78 : 1;
  const deceleration = Math.max(0.08, 0.42 * grip + 9.81 * grade * sign);
  const current = ROUTE_RESTRICTIONS.find((r) => z >= r.start && z <= r.end);
  const limitKmh = current?.limitKmh ?? 120;
  let autopilotKmh = Math.min(120, limitKmh);
  let reason = current?.reason ?? 'Open line';
  for (const restriction of ROUTE_RESTRICTIONS) {
    const distance = sign > 0 ? restriction.start - z : z - restriction.end;
    if (distance < 0) continue;
    const target =
      Math.sqrt((restriction.limitKmh / 3.6) ** 2 + 2 * deceleration * Math.max(0, distance - 35)) *
      3.6;
    if (target < autopilotKmh) {
      autopilotKmh = target;
      reason = `${restriction.reason} ahead`;
    }
  }
  return { limitKmh, autopilotKmh, reason };
}
