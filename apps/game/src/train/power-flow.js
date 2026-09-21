import * as THREE from 'three';

/** Optional diagram-like current markers. They illustrate traction, not AC electron motion. */
export function createPowerFlow({ scene, railPoint, cars }) {
  const geometry = new THREE.SphereGeometry(0.11, 6, 4);
  const material = new THREE.MeshBasicMaterial({
    color: '#aee8ff',
    transparent: true,
    opacity: 0.8,
    toneMapped: false,
    depthWrite: false,
  });
  const mesh = new THREE.InstancedMesh(geometry, material, 36);
  mesh.name = 'Catenary / traction power flow visualization';
  mesh.frustumCulled = false;
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  scene.add(mesh);
  const dummy = new THREE.Object3D();
  let elapsed = 0,
    lastLoad = 0;
  return {
    update(
      dt,
      {
        power = 0,
        enabled = true,
        emergency = false,
        doorsOpen = false,
        doorFraction = 0,
        direction = 1,
      } = {},
    ) {
      elapsed += Math.max(0, dt);
      lastLoad =
        enabled && !emergency && !doorsOpen && doorFraction <= 0.001
          ? THREE.MathUtils.clamp(power, 0, 1)
          : 0;
      mesh.visible = lastLoad > 0.03;
      if (!mesh.visible) return;
      material.opacity = 0.32 + lastLoad * 0.58;
      for (let i = 0; i < 36; i++) {
        const car = cars[Math.floor(i / 18)];
        const offset = (72 + (i % 18) * 4 - ((elapsed * (8 + lastLoad * 16)) % 72)) % 72;
        const p = railPoint(car.position.z + direction * offset);
        dummy.position.set(p.x, p.y + 7.35, p.z);
        dummy.scale.setScalar(0.9 + lastLoad * 0.9);
        dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);
      }
      mesh.instanceMatrix.needsUpdate = true;
    },
    getState: () => ({ visible: mesh.visible, traction: lastLoad, kind: 'illustrative' }),
    dispose() {
      scene.remove(mesh);
      mesh.dispose();
      geometry.dispose();
      material.dispose();
    },
  };
}
