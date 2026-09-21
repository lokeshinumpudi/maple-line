import { WIND_DIRECTION } from './wind.js';

// A few world-space leaves reveal the breeze without turning it into rain.
// Parent provides altitude/region/tunnel state; snowfall uses its own particles.
export function createWindCues({ THREE, scene, count = 40, seed = 5317 }) {
  if (!Number.isInteger(count) || count < 32 || count > 60)
    throw new RangeError('Wind cues use a pool of 32–60 leaves.');
  const random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  const geometry = new THREE.BufferGeometry();
  const outline = [
    [0, 0.6],
    [0.2, 0.24],
    [0.52, 0.28],
    [0.32, -0.08],
    [0.4, -0.36],
    [0.08, -0.29],
    [0, -0.57],
    [-0.09, -0.29],
    [-0.42, -0.33],
    [-0.3, -0.07],
    [-0.5, 0.27],
    [-0.18, 0.22],
  ];
  const vertices = [];
  for (let i = 0; i < outline.length; i++) {
    const a = outline[i],
      b = outline[(i + 1) % outline.length];
    vertices.push(0, 0, 0.025, a[0], a[1], 0, b[0], b[1], 0);
  }
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  geometry.computeVertexNormals();
  const material = new THREE.MeshStandardMaterial({
    color: '#ffffff',
    roughness: 0.95,
    side: THREE.DoubleSide,
    flatShading: true,
  });
  const mesh = new THREE.InstancedMesh(geometry, material, count);
  mesh.name = 'Breeze / drifting autumn leaves';
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  mesh.frustumCulled = false;
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  const colors = ['#bd823b', '#b95830', '#dbaf55', '#92984a'];
  const particles = Array.from({ length: count }, (_, i) => {
    mesh.setColorAt(i, new THREE.Color(colors[i % colors.length]));
    return {
      position: new THREE.Vector3(),
      age: 0,
      lifetime: 18 + random() * 20,
      phase: random() * Math.PI * 2,
      size: 0.1 + random() * 0.095,
    };
  });
  const dummy = new THREE.Object3D();
  const anchor = new THREE.Vector3();
  const direction = new THREE.Vector3(WIND_DIRECTION.x, 0, WIND_DIRECTION.z).normalize();
  const crosswind = new THREE.Vector3(-direction.z, 0, direction.x);
  let initialized = false;
  let elapsed = 0;
  let visibleCount = 0;
  let speedMps = 0;
  function spawn(particle, camera, initial = false) {
    const downwind = initial ? -26 + random() * 52 : -24 + random() * 12;
    particle.position
      .copy(camera)
      .addScaledVector(direction, downwind)
      .addScaledVector(crosswind, -27 + random() * 54);
    particle.position.y += -9 + random() * 12;
    particle.age = initial ? random() * particle.lifetime : 0;
  }
  scene.add(mesh);
  mesh.visible = false;
  return {
    mesh,
    update(
      dt,
      {
        cameraPosition,
        weather = 'clear',
        altitude = cameraPosition?.y ?? 0,
        inTunnel = false,
        region = 'gorge',
        windSpeedMps = 2.8,
      } = {},
    ) {
      if (!Number.isFinite(dt) || dt < 0)
        throw new TypeError('Wind cue dt must be finite and nonnegative.');
      if (
        !cameraPosition ||
        ![cameraPosition.x, cameraPosition.y, cameraPosition.z].every(Number.isFinite)
      )
        throw new TypeError('Wind cues require a finite camera position.');
      const allowed =
        !inTunnel &&
        weather !== 'snow' &&
        altitude < 180 &&
        !['alpine', 'city', 'tunnel', 'snow'].includes(region);
      mesh.visible = allowed;
      visibleCount = allowed ? (weather === 'rain' ? Math.round(count * 0.6) : count) : 0;
      if (!allowed) {
        initialized = false;
        return;
      }
      const reset = !initialized || cameraPosition.distanceTo(anchor) > 75;
      if (reset) {
        particles.forEach((particle) => spawn(particle, cameraPosition, true));
        initialized = true;
      }
      anchor.copy(cameraPosition);
      elapsed += dt;
      // Leaves only inherit a fraction of ambient wind; flutter is local rotation.
      speedMps = Math.max(0.3, Math.min(1.1, windSpeedMps * 0.23));
      mesh.count = visibleCount;
      particles.forEach((particle, i) => {
        particle.age += dt;
        if (
          particle.age > particle.lifetime ||
          particle.position.distanceTo(cameraPosition) > 46 ||
          particle.position.y < cameraPosition.y - 15
        )
          spawn(particle, cameraPosition);
        particle.position.addScaledVector(direction, speedMps * dt);
        particle.position.addScaledVector(
          crosswind,
          Math.sin(elapsed * 0.6 + particle.phase) * 0.07 * dt,
        );
        particle.position.y -= (0.12 + 0.06 * Math.sin(particle.phase)) * dt;
        dummy.position.copy(particle.position);
        dummy.rotation.set(
          Math.sin(elapsed * 0.75 + particle.phase) * 0.7,
          elapsed * 0.35 + particle.phase,
          Math.sin(elapsed * 0.45 + particle.phase) * 0.6,
        );
        dummy.scale.setScalar(particle.size);
        dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);
      });
      mesh.instanceMatrix.needsUpdate = true;
    },
    getState() {
      return {
        visible: mesh.visible,
        count: visibleCount,
        pool: count,
        driftSpeedMps: speedMps,
        direction: { ...WIND_DIRECTION },
        elapsed,
      };
    },
    dispose() {
      scene.remove(mesh);
      geometry.dispose();
      material.dispose();
    },
  };
}
