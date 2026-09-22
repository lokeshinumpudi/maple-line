/** Transverse river below Takabashi, shared by its bed and visible surface. */
export function bridgeRiverProfile(x, originX, bridgeZ, railHeight) {
  const lateral = x - originX;
  return {
    z: bridgeZ + Math.sin(lateral * 0.009) * 8,
    halfWidth: 6.5 + Math.sin(lateral * 0.027) * 1.2,
    waterY: railHeight - 80,
    reach: Math.max(0, Math.min(1, (550 - Math.abs(lateral)) / 70)),
  };
}
export function carveBridgeRiver(height, x, z, originX, bridgeZ, railHeight) {
  const river = bridgeRiverProfile(x, originX, bridgeZ, railHeight);
  const distance = Math.abs(z - river.z);
  const t = Math.max(0, Math.min(1, (distance - river.halfWidth) / 65));
  const bed = river.waterY - 1.3 + 1.3 * (distance / river.halfWidth) ** 2;
  return height + (Math.min(height, bed) - height) * river.reach * (1 - t * t * (3 - 2 * t));
}
