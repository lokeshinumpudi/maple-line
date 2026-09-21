import * as THREE from 'three';

/** Small ground-contact ripples near the train, all in one instanced batch. */
export function createRainImpacts({ scene, heightAt }) {
  const geometry = new THREE.RingGeometry(0.72, 1, 12);
  geometry.rotateX(-Math.PI / 2);
  const material = new THREE.MeshBasicMaterial({
    color: '#c8e0df',
    transparent: true,
    opacity: 0.25,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const mesh = new THREE.InstancedMesh(geometry, material, 96);
  mesh.name = 'Rain / ground impact rings';
  mesh.visible = false;
  mesh.frustumCulled = false;
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  scene.add(mesh);
  const dummy = new THREE.Object3D();
  let time = 0;
  const seeds = Array.from({ length: 96 }, (_, i) => ({
    x: Math.sin(i * 127.1) * 29,
    z: Math.sin(i * 311.7) * 44,
    phase: (i * 0.61803398875) % 1,
  }));
  return {
    update(dt, { weather, position, inTunnel = false }) {
      time += Math.max(0, dt);
      mesh.visible = weather === 'rain' && !inTunnel;
      if (!mesh.visible) return;
      for (let i = 0; i < seeds.length; i++) {
        const p = seeds[i],
          phase = (p.phase + time * 1.6) % 1;
        const x = position.x + p.x,
          z = position.z + p.z;
        dummy.position.set(x, heightAt(x, z) + 0.025, z);
        dummy.scale.setScalar(phase < 0.78 ? 0.035 + phase * 0.28 : 0.0001);
        dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);
      }
      mesh.instanceMatrix.needsUpdate = true;
    },
    dispose() {
      scene.remove(mesh);
      mesh.dispose();
      geometry.dispose();
      material.dispose();
    },
  };
}
