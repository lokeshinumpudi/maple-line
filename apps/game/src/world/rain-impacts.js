import * as THREE from 'three';

const RING_COUNT = 96;
const LIFE = 1 / 1.6;
const RECYCLE_RADIUS = 72;
const HEIGHT_EPS = 0.45;
const MIN_NORMAL_Y = 0.62;
const LIFT = 0.025;
const HIDDEN_SCALE = 0.0001;

/**
 * Small ground-contact ripples near the observer, all in one instanced batch, with a
 * second batch of tiny splash crowns that jump up at the moment of impact.
 * count is set by the graphics tier; the default keeps the original 96 rings.
 */
export function createRainImpacts({ scene, heightAt, count = RING_COUNT }) {
  const geometry = new THREE.RingGeometry(0.72, 1, 12);
  geometry.rotateX(-Math.PI / 2);
  const material = new THREE.MeshBasicMaterial({
    color: '#c8e0df',
    transparent: true,
    opacity: 0.14,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const mesh = new THREE.InstancedMesh(geometry, material, count);
  mesh.name = 'Rain / ground impact rings';
  mesh.visible = false;
  mesh.frustumCulled = false;
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  scene.add(mesh);
  // A splash crown: a short open cone with a jagged rim, drawn only for the first
  // fifth of each ring's life.
  const crownGeometry = new THREE.CylinderGeometry(1, 0.35, 1, 7, 1, true);
  crownGeometry.translate(0, 0.5, 0);
  const crownMaterial = new THREE.MeshBasicMaterial({
    color: '#dbe8ea',
    transparent: true,
    opacity: 0.32,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const crowns = new THREE.InstancedMesh(crownGeometry, crownMaterial, count);
  crowns.name = 'Rain / splash crowns';
  crowns.visible = false;
  crowns.frustumCulled = false;
  crowns.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  scene.add(crowns);
  const dummy = new THREE.Object3D();
  const normal = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0);
  const spread = Math.sqrt(count / RING_COUNT);
  const rings = Array.from({ length: count }, (_, i) => ({
    ox: Math.sin(i * 127.1) * 29 * Math.min(1.25, spread),
    oz: Math.sin(i * 311.7) * 44 * Math.min(1.25, spread),
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

  function writeRing(i, ring, scale, phase) {
    dummy.position.set(ring.x, ring.y, ring.z);
    dummy.scale.setScalar(scale);
    normal.set(ring.nx, ring.ny, ring.nz);
    dummy.quaternion.setFromUnitVectors(up, normal);
    dummy.updateMatrix();
    mesh.setMatrixAt(i, dummy.matrix);
    const splash = scale > HIDDEN_SCALE && phase < 0.2 ? Math.sin((phase / 0.2) * Math.PI) : 0;
    dummy.scale.set(
      Math.max(HIDDEN_SCALE, 0.02 + phase * 0.25),
      Math.max(HIDDEN_SCALE, splash * 0.07),
      Math.max(HIDDEN_SCALE, 0.02 + phase * 0.25),
    );
    dummy.updateMatrix();
    crowns.setMatrixAt(i, dummy.matrix);
  }

  return {
    update(dt, { weather, position, inTunnel = false, storm = 0 }) {
      // Storm drops land harder, so rings run through their life faster.
      const step = Math.max(0, dt) * (1 + storm * 0.5);
      mesh.visible = weather === 'rain' && !inTunnel;
      crowns.visible = mesh.visible;
      if (!mesh.visible) return;
      for (let i = 0; i < count; i++) {
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
        writeRing(i, ring, scale, phase);
      }
      mesh.instanceMatrix.needsUpdate = true;
      crowns.instanceMatrix.needsUpdate = true;
    },
    dispose() {
      scene.remove(mesh, crowns);
      mesh.dispose();
      crowns.dispose();
      geometry.dispose();
      crownGeometry.dispose();
      material.dispose();
      crownMaterial.dispose();
    },
  };
}
