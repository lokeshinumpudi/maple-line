import * as THREE from 'three';

const RING_COUNT = 96;
const LIFE = 1 / 1.6;
const RECYCLE_RADIUS = 72;
const HEIGHT_EPS = 0.45;
const MIN_NORMAL_Y = 0.62;
const LIFT = 0.025;
const HIDDEN_SCALE = 0.0001;

/** Small ground-contact ripples near the train, all in one instanced batch. */
export function createRainImpacts({ scene, heightAt }) {
  const geometry = new THREE.RingGeometry(0.72, 1, 12);
  geometry.rotateX(-Math.PI / 2);
  const material = new THREE.MeshBasicMaterial({
    color: '#c8e0df',
    transparent: true,
    opacity: 0.14,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const mesh = new THREE.InstancedMesh(geometry, material, RING_COUNT);
  mesh.name = 'Rain / ground impact rings';
  mesh.visible = false;
  mesh.frustumCulled = false;
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  scene.add(mesh);
  const dummy = new THREE.Object3D();
  const normal = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0);
  const rings = Array.from({ length: RING_COUNT }, (_, i) => ({
    ox: Math.sin(i * 127.1) * 29,
    oz: Math.sin(i * 311.7) * 44,
    phase: (i * 0.61803398875) % 1,
    x: 0,
    y: 0,
    z: 0,
    nx: 0,
    ny: 1,
    nz: 0,
    age: ((i * 0.61803398875) % 1) * LIFE * 0.45,
    steep: false,
    placed: false,
  }));

  function sampleNormal(x, z) {
    const hL = heightAt(x - HEIGHT_EPS, z);
    const hR = heightAt(x + HEIGHT_EPS, z);
    const hD = heightAt(x, z - HEIGHT_EPS);
    const hU = heightAt(x, z + HEIGHT_EPS);
    normal.set(hL - hR, 2 * HEIGHT_EPS, hD - hU);
    const len = normal.length();
    if (len < 1e-8 || !Number.isFinite(len)) normal.copy(up);
    else normal.multiplyScalar(1 / len);
  }

  function spawn(ring, position) {
    ring.x = position.x + ring.ox;
    ring.z = position.z + ring.oz;
    ring.y = heightAt(ring.x, ring.z) + LIFT;
    sampleNormal(ring.x, ring.z);
    ring.nx = normal.x;
    ring.ny = normal.y;
    ring.nz = normal.z;
    ring.steep = !Number.isFinite(normal.y) || normal.y < MIN_NORMAL_Y;
    ring.placed = true;
  }

  function writeRing(i, ring, scale) {
    dummy.position.set(ring.x, ring.y, ring.z);
    dummy.scale.setScalar(scale);
    normal.set(ring.nx, ring.ny, ring.nz);
    dummy.quaternion.setFromUnitVectors(up, normal);
    dummy.updateMatrix();
    mesh.setMatrixAt(i, dummy.matrix);
  }

  return {
    update(dt, { weather, position, inTunnel = false }) {
      const step = Math.max(0, dt);
      mesh.visible = weather === 'rain' && !inTunnel;
      if (!mesh.visible) return;
      for (let i = 0; i < RING_COUNT; i++) {
        const ring = rings[i];
        if (!ring.placed) spawn(ring, position);
        else {
          ring.age += step;
          const far = Math.hypot(ring.x - position.x, ring.z - position.z) > RECYCLE_RADIUS;
          if (far || ring.age >= LIFE) {
            ring.age = far ? ring.phase * LIFE * 0.45 : ring.age % LIFE;
            spawn(ring, position);
          }
        }
        const phase = ring.age / LIFE;
        const scale = ring.steep || phase >= 0.78 ? HIDDEN_SCALE : 0.035 + phase * 0.28;
        writeRing(i, ring, scale);
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
