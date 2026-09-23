import { Vector3 } from 'three';

export const SUN_SHADOW_OFFSET = Object.freeze({ x: -90, y: 160, z: -65 });
export const SUN_SHADOW_FRUSTUM = 220;
export const SUN_SHADOW_MAP = 2048;

function finiteVec(v) {
  return Number.isFinite(v.x) && Number.isFinite(v.y) && Number.isFinite(v.z);
}

/** Light-space texel snap for the directional sun. Basis matches Three r180 lookAt (up = +Y). */
export function createStableSunShadow({
  offset = SUN_SHADOW_OFFSET,
  frustumSize = SUN_SHADOW_FRUSTUM,
  mapSize = SUN_SHADOW_MAP,
} = {}) {
  const texelSize = frustumSize / mapSize;
  const offsetVec = new Vector3(offset.x, offset.y, offset.z);
  const worldUp = new Vector3(0, 1, 0);
  const zCam = new Vector3();
  const xCam = new Vector3();
  const yCam = new Vector3();
  function computeBasis() {
    zCam.copy(offsetVec);
    if (zCam.lengthSq() === 0) zCam.set(0, 1, 0);
    zCam.normalize();
    xCam.crossVectors(worldUp, zCam);
    if (xCam.lengthSq() < 1e-12) xCam.set(1, 0, 0).cross(zCam);
    xCam.normalize();
    yCam.crossVectors(zCam, xCam).normalize();
  }
  computeBasis();
  const snapped = new Vector3();
  const previousFocus = new Vector3(Number.NaN, Number.NaN, Number.NaN);

  function snapTo(worldTarget, out) {
    const lx = Math.round(worldTarget.dot(xCam) / texelSize) * texelSize;
    const ly = Math.round(worldTarget.dot(yCam) / texelSize) * texelSize;
    const lz = worldTarget.dot(zCam);
    out.copy(xCam).multiplyScalar(lx).addScaledVector(yCam, ly).addScaledVector(zCam, lz);
    return out;
  }

  return {
    texelSize,
    frustumSize,
    basis: { x: xCam, y: yCam, z: zCam },
    offset: offsetVec,
    /** Moves the sun (for example low and warm at dusk). Returns true when it changed. */
    setOffset(next) {
      if (!finiteVec(next)) return false;
      if (offsetVec.distanceToSquared(next) < 1e-6) return false;
      offsetVec.set(next.x, next.y, next.z);
      computeBasis();
      previousFocus.set(Number.NaN, Number.NaN, Number.NaN);
      return true;
    },
    snap(worldTarget, out = snapped) {
      return snapTo(worldTarget, out);
    },
    apply(light, worldTarget, shadowMap) {
      if (!finiteVec(worldTarget)) return false;
      snapTo(worldTarget, snapped);
      const hadPrevious = finiteVec(previousFocus);
      const jumped = hadPrevious && worldTarget.distanceTo(previousFocus) > frustumSize;
      previousFocus.copy(worldTarget);
      light.target.position.copy(snapped);
      light.position.copy(snapped).add(offsetVec);
      light.target.updateMatrixWorld();
      if (jumped && shadowMap) shadowMap.needsUpdate = true;
      return jumped;
    },
  };
}
