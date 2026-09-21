/** Deterministic presentation state shared by the train model and its tests. */
export function trainSystems({
  weather = 'clear',
  dusk = false,
  inTunnel = false,
  lights = 'auto',
  wipers = 'auto',
  power = 0,
  doorsOpen = false,
  doorFraction = 0,
  emergency = false,
  leadCar = 0,
} = {}) {
  const headlightOn =
    lights === 'on' || (lights === 'auto' && (dusk || inTunnel || weather !== 'clear'));
  return {
    headlightOn,
    cabinOn: dusk || inTunnel,
    wipersOn: wipers === 'on' || (wipers === 'auto' && weather !== 'clear'),
    traction:
      doorsOpen || doorFraction > 0.001 || emergency
        ? 0
        : Math.max(0, Math.min(1, Number.isFinite(power) ? power : 0)),
    leadCar,
  };
}
