const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
const smooth = (value) => {
  const t = clamp(value, 0, 1);
  return t * t * (3 - 2 * t);
};

/** One shared world-space footprint for water, excavated terrain and public footbridge. */
export function createWetlandWaterProfile(railPoint) {
  const rail = railPoint(2610);
  return Object.freeze({
    centerX: rail.x - 30,
    centerZ: 2610,
    waterY: rail.y - 1.45,
    halfLength: 35,
    bankBlend: 6.5,
    depth: 1.25,
  });
}

export function wetlandSection(z, profile) {
  const t = (z - profile.centerZ) / profile.halfLength;
  if (Math.abs(t) > 1) return null;
  return {
    centerX: profile.centerX + Math.sin(t * 3.3) * 1.65 + Math.sin(t * 7.1) * 0.35,
    halfWidth:
      (7.15 + Math.sin(t * 5.1 + 0.65) * 1.25 + Math.sin(t * 11.3) * 0.45) *
      Math.sqrt(Math.max(0, 1 - t * t)),
    waterY: profile.waterY,
  };
}

function bankSample(x, z, profile) {
  if (
    Math.abs(z - profile.centerZ) > profile.halfLength + profile.bankBlend ||
    Math.abs(x - profile.centerX) > 19
  )
    return null;
  const section = wetlandSection(z, profile);
  let distance;
  if (section) distance = Math.abs(x - section.centerX) - section.halfWidth;
  else {
    const endZ = profile.centerZ + Math.sign(z - profile.centerZ) * profile.halfLength;
    distance = Math.hypot(x - wetlandSection(endZ, profile).centerX, z - endZ);
  }
  if (distance >= profile.bankBlend) return null;
  const depth =
    distance < 0 && section?.halfWidth > 0
      ? profile.depth * smooth(-distance / section.halfWidth)
      : 0;
  return {
    height: profile.waterY - 0.28 - depth + Math.max(0, distance) * 0.34,
    weight: 1 - smooth((distance - 2.5) / (profile.bankBlend - 2.5)),
  };
}

/** Authored bed/bank elevation; null outside the bounded cut. Use the blend helper on terrain. */
export function wetlandBedHeight(x, z, profile) {
  return bankSample(x, z, profile)?.height ?? null;
}

export function wetlandTerrainHeight(x, z, baseHeight, profile) {
  const bank = bankSample(x, z, profile);
  return bank ? baseHeight + (bank.height - baseHeight) * bank.weight : baseHeight;
}
