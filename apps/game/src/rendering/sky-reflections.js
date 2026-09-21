import * as THREE from 'three';
import { ATMOSPHERE_PROFILES, DUSK_COLORS } from './atmosphere-palette.js';

/** Six small environments are prepared once; weather changes never allocate a target. */
export function createSkyReflections(renderer, scene) {
  const targets = new Map();
  const generator = new THREE.PMREMGenerator(renderer);
  const width = 128,
    height = 64;
  for (const [weather, profile] of Object.entries(ATMOSPHERE_PROFILES)) {
    for (const dusk of [false, true]) {
      const data = new Float32Array(width * height * 4);
      const sky = new THREE.Color(profile.sky).lerp(
        new THREE.Color(DUSK_COLORS.sky),
        dusk ? 0.8 : 0,
      );
      const horizon = new THREE.Color(profile.horizon).lerp(
        new THREE.Color(DUSK_COLORS.horizon),
        dusk ? 0.7 : 0,
      );
      const ground = new THREE.Color(profile.ground);
      const sunlight = new THREE.Color(profile.sun).lerp(
        new THREE.Color(DUSK_COLORS.sun),
        dusk ? 0.8 : 0,
      );
      const color = new THREE.Color();
      const direction = new THREE.Vector3(-90, 160, -65).normalize();
      for (let y = 0; y < height; y++) {
        const theta = (1 - y / (height - 1)) * Math.PI;
        const elevation = Math.cos(theta);
        for (let x = 0; x < width; x++) {
          const phi = (x / width - 0.5) * Math.PI * 2;
          color.copy(horizon).lerp(elevation > 0 ? sky : ground, Math.abs(elevation) ** 0.5);
          const dot =
            Math.sin(theta) * Math.cos(phi) * direction.x +
            elevation * direction.y +
            Math.sin(theta) * Math.sin(phi) * direction.z;
          const halo =
            Math.max(0, dot) ** 28 * (weather === 'clear' ? 0.8 : 0.08) * (dusk ? 0.4 : 1);
          const i = (y * width + x) * 4;
          data[i] = color.r + sunlight.r * halo;
          data[i + 1] = color.g + sunlight.g * halo;
          data[i + 2] = color.b + sunlight.b * halo;
          data[i + 3] = 1;
        }
      }
      const texture = new THREE.DataTexture(data, width, height, THREE.RGBAFormat, THREE.FloatType);
      texture.mapping = THREE.EquirectangularReflectionMapping;
      texture.needsUpdate = true;
      targets.set(`${weather}:${dusk}`, generator.fromEquirectangular(texture));
      texture.dispose();
    }
  }
  generator.dispose();
  let active = 'clear:false';
  let disposed = false;
  scene.environment = targets.get(active).texture;
  scene.environmentIntensity = 0.35;
  return {
    update(weather, dusk) {
      const key = `${weather}:${Boolean(dusk)}`;
      if (disposed || key === active || !targets.has(key)) return;
      active = key;
      scene.environment = targets.get(active).texture;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      if ([...targets.values()].some((target) => target.texture === scene.environment))
        scene.environment = null;
      for (const target of targets.values()) target.dispose();
      targets.clear();
    },
  };
}
