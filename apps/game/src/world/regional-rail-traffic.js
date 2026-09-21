/** Separate rural railway. Its timetable never depends on player teleporting. */
export const REGIONAL_TRAFFIC = Object.freeze({
  startZ: 1550,
  endZ: 2250,
  separation: 8,
  cycle: 190,
  dwell: 14,
});
const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
const smooth = (t) => t * t * (3 - 2 * t);
export function sampleRegionalTraffic(seconds) {
  const phase = ((seconds % 190) + 190) % 190;
  const service = phase < 84 ? 'village-local' : phase >= 95 && phase < 179 ? 'blue-parcels' : null;
  if (!service) return { service: null, phase, progress: 0, stopped: false, direction: 1 };
  const t = phase - (service === 'blue-parcels' ? 95 : 0);
  const progress =
    t < 35 ? smooth(t / 35) * 0.5 : t <= 49 ? 0.5 : 0.5 + smooth((t - 49) / 35) * 0.5;
  return {
    service,
    phase,
    progress,
    stopped: t >= 35 && t <= 49,
    direction: service === 'village-local' ? 1 : -1,
  };
}
export function createRegionalTrafficCurve({ THREE, railPoint }) {
  const points = [];
  for (let z = 1550; z <= 2250; z += 5) {
    const tangent = railPoint(z + 0.1)
      .sub(railPoint(z - 0.1))
      .normalize();
    const normal = new THREE.Vector3(tangent.z, 0, -tangent.x).normalize();
    points.push(railPoint(z).addScaledVector(normal, -8));
  }
  const curve = new THREE.CatmullRomCurve3(points, false, 'centripetal');
  curve.arcLengthDivisions = 1400;
  curve.updateArcLengths();
  return curve;
}
export function createRegionalRailTraffic({ THREE, scene, railPoint, terrainHeight }) {
  const root = new THREE.Group();
  root.name = 'regional railway / village local and parcels';
  root.visible = false;
  scene.add(root);
  let elapsed = 0,
    disposed = false,
    built = false,
    length = 0,
    curve,
    box,
    material;
  const services = new Map(),
    batches = [],
    cars = [];
  const dummy = new THREE.Object3D();
  const color = new THREE.Color();
  const up = new THREE.Vector3(0, 1, 0);
  const flip = new THREE.Quaternion().setFromAxisAngle(up, Math.PI);
  function frame(distance) {
    const t = clamp(distance / length, 0, 1);
    const p = curve.getPointAt(t),
      tangent = curve.getTangentAt(t).normalize();
    const side = new THREE.Vector3(tangent.z, 0, -tangent.x).normalize();
    const q = new THREE.Quaternion().setFromRotationMatrix(
      new THREE.Matrix4().makeBasis(side, new THREE.Vector3().crossVectors(tangent, side), tangent),
    );
    return { p, q };
  }
  function batch(parts, parent, name) {
    const mesh = new THREE.InstancedMesh(box, material, parts.length);
    mesh.name = name;
    parts.forEach((p, i) => {
      dummy.position.set(...p.position);
      dummy.scale.set(...p.scale);
      dummy.quaternion.copy(p.rotation ?? new THREE.Quaternion());
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
      mesh.setColorAt(i, color.set(p.color));
    });
    mesh.instanceMatrix.needsUpdate = true;
    mesh.instanceColor.needsUpdate = true;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.computeBoundingSphere();
    parent.add(mesh);
    batches.push(mesh);
  }
  function build() {
    built = true;
    curve = createRegionalTrafficCurve({ THREE, railPoint });
    length = curve.getLength();
    box = new THREE.BoxGeometry(1, 1, 1);
    material = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.75 });
    const parts = [];
    const trackPart = (distance, offset, y, scale, color) => {
      const f = frame(distance);
      const p = new THREE.Vector3(offset, y, 0).applyQuaternion(f.q).add(f.p);
      parts.push({ position: p.toArray(), rotation: f.q, scale, color });
    };
    for (let d = 1; d < length; d += 2) {
      const span = Math.min(2.04, length - d);
      trackPart(d, 0, -0.49, [3.7, 0.46, span], '#77796d');
      trackPart(d, 0, -0.18, [2.55, 0.16, 0.25], '#544939');
      for (const side of [-1, 1]) trackPart(d, side * 0.74, -0.045, [0.085, 0.16, span], '#9aaba9');
      if (d % 10 < 2) {
        const p = frame(d).p;
        const ground = terrainHeight(p.x, p.z);
        const height = Math.max(0.15, p.y - 0.65 - ground);
        trackPart(d, 0, -0.65 - height / 2, [2.2, height, 0.65], '#77796d');
      }
    }
    for (const end of [0, 1]) {
      const depot = end ? length - 24 : 24;
      for (const side of [-1, 1]) trackPart(depot, side * 2.1, 2.5, [0.22, 5, 45], '#62706c');
      trackPart(depot, 0, 5.07, [4.7, 0.26, 45], '#4d5d60');
      trackPart(end ? length - 1 : 1, 0, 0.5, [2.5, 0.26, 0.3], '#b25442');
      for (const side of [-1, 1])
        trackPart(end ? length - 1 : 1, side * 0.8, 0.23, [0.2, 0.6, 0.8], '#434c49');
    }
    // A small halt makes the scheduled pause visible from the player's railway.
    trackPart(length / 2, -2.45, 0.05, [2.2, 1.1, 36], '#a19e8b');
    for (const d of [-10, 10]) {
      trackPart(length / 2 + d, -3, 1, [0.6, 0.18, 2.6], '#725a42');
      trackPart(length / 2 + d, -3.3, 1.35, [0.12, 0.65, 2.6], '#725a42');
    }
    batch(parts, root, 'regional railway / rails ballast depots and halt');
    for (const [id, count, paint] of [
      ['village-local', 3, '#42705e'],
      ['blue-parcels', 2, '#476a8e'],
    ]) {
      const group = new THREE.Group();
      group.name = id;
      root.add(group);
      group.visible = false;
      const serviceCars = [];
      for (let index = 0; index < count; index++) {
        const car = new THREE.Group();
        car.name = `${id} / carriage ${index + 1}`;
        group.add(car);
        const pieces = [];
        const add = (color, position, scale) => pieces.push({ color, position, scale });
        add(paint, [0, 1.2, 0], [2.55, 1.15, 11.8]);
        add('#e6dfba', [0, 2.25, 0], [2.55, 0.95, 11.8]);
        add('#657372', [0, 2.83, 0], [2.75, 0.22, 12]);
        add('#353e3d', [0, 0.54, 0], [2.1, 0.3, 11]);
        for (const side of [-1, 1]) {
          for (const z of [-4.2, -2.1, 0, 2.1, 4.2]) {
            add(
              id === 'blue-parcels' && Math.abs(z) < 3 ? paint : '#233f43',
              [side * 1.29, 2.24, z],
              [0.07, 0.68, 1.45],
            );
          }
          for (const z of [-3.8, 3.8]) add('#253333', [side * 1.08, 0.3, z], [0.24, 0.55, 1.5]);
          add('#233f43', [0, 2.2, side * 5.94], [1.9, 0.65, 0.08]);
          add('#e3cc88', [side * 0.84, 1.18, index === 0 ? 5.94 : -5.94], [0.2, 0.19, 0.08]);
        }
        batch(pieces, car, `${id} / shared box details ${index + 1}`);
        serviceCars.push(car);
      }
      services.set(id, { group, cars: serviceCars });
    }
  }
  function update(dt, { position } = {}) {
    if (disposed) return;
    if (Number.isFinite(dt) && dt > 0) elapsed += dt;
    const z = typeof position === 'number' ? position : position?.z;
    const near = Number.isFinite(z) && z > 550 && z < 3250;
    if (near && !built) build();
    root.visible = near && built;
    if (!built) return;
    const state = sampleRegionalTraffic(elapsed);
    cars.length = 0;
    for (const [id, service] of services) {
      service.group.visible = state.service === id;
      if (!service.group.visible) continue;
      const progress = state.direction > 0 ? state.progress : 1 - state.progress;
      const center = 24 + progress * (length - 48);
      service.cars.forEach((car, i) => {
        const distance = center + state.direction * ((service.cars.length - 1) / 2 - i) * 13;
        const f = frame(distance);
        car.position.copy(f.p);
        car.quaternion.copy(f.q);
        if (state.direction < 0) car.quaternion.multiply(flip);
        cars.push({ service: id, index: i, distance, position: f.p.toArray(), visible: near });
      });
    }
  }
  return {
    update,
    getState: () => ({
      ...sampleRegionalTraffic(elapsed),
      elapsed,
      built,
      visible: root.visible,
      disposed,
      trackLength: length,
      separation: 8,
      renderBatches: batches.length,
      cars: cars.map((c) => ({ ...c, position: [...c.position] })),
    }),
    dispose() {
      if (disposed) return;
      disposed = true;
      root.visible = false;
      root.removeFromParent();
      for (const mesh of batches) mesh.dispose();
      box?.dispose();
      material?.dispose();
      cars.length = 0;
    },
  };
}
