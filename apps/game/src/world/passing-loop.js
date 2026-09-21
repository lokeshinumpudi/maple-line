const STATION_Z = 525;
const HALF_LENGTH = 115;
const SEPARATION = 5.8;
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

/** The same branch curve drives rail geometry, sleepers, and both passing carriages. */
export function createPassingLoopCurve({ THREE, railPoint }) {
  const points = [];
  for (let z = STATION_Z - HALF_LENGTH; z <= STATION_Z + HALF_LENGTH; z += 2.5) {
    const tangent = railPoint(z + 0.1)
      .sub(railPoint(z - 0.1))
      .normalize();
    const normal = new THREE.Vector3(tangent.z, 0, -tangent.x).normalize();
    const approach = clamp((HALF_LENGTH - Math.abs(z - STATION_Z)) / 45, 0, 1);
    const smooth = approach * approach * (3 - 2 * approach);
    points.push(railPoint(z).addScaledVector(normal, -SEPARATION * smooth));
  }
  const curve = new THREE.CatmullRomCurve3(points, false, 'centripetal');
  curve.arcLengthDivisions = 1000;
  curve.updateArcLengths();
  return curve;
}

export function createPassingLoop({ THREE, scene, railPoint, terrainHeight }) {
  const root = new THREE.Group();
  root.name = 'railway / Momiji passing loop';
  scene.add(root);
  const curve = createPassingLoopCurve({ THREE, railPoint });
  const length = curve.getLength();
  const box = new THREE.BoxGeometry(1, 1, 1);
  const wheel = new THREE.CylinderGeometry(0.32, 0.32, 0.16, 10);
  wheel.rotateZ(Math.PI / 2);
  const round = new THREE.SphereGeometry(1, 8, 6);
  const material = new THREE.MeshStandardMaterial({ roughness: 0.79 });
  const steel = new THREE.MeshStandardMaterial({
    color: '#707b7a',
    roughness: 0.4,
    metalness: 0.55,
  });
  const signalMaterial = new THREE.MeshBasicMaterial();
  const geometries = new Set([box, wheel, round]);
  const materials = [material, steel, signalMaterial];
  const batches = [];
  const pose = new THREE.Object3D();
  const up = new THREE.Vector3(0, 1, 0);
  const turnAround = new THREE.Quaternion().setFromAxisAngle(up, Math.PI);

  function frame(distance) {
    const t = clamp(distance / length, 0, 1);
    const point = curve.getPointAt(t);
    const tangent = curve.getTangentAt(t).normalize();
    const normal = new THREE.Vector3(tangent.z, 0, -tangent.x).normalize();
    const rotation = new THREE.Quaternion().setFromRotationMatrix(
      new THREE.Matrix4().makeBasis(
        normal,
        new THREE.Vector3().crossVectors(tangent, normal),
        tangent,
      ),
    );
    return { point, tangent, normal, rotation };
  }
  function makeBatch(name, geometry, parts, parent = root, batchMaterial = material) {
    const mesh = new THREE.InstancedMesh(geometry, batchMaterial, parts.length);
    mesh.name = `passingloop / ${name}`;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      pose.position.copy(part.position);
      pose.quaternion.copy(part.rotation ?? new THREE.Quaternion());
      pose.scale.copy(part.scale);
      pose.updateMatrix();
      mesh.setMatrixAt(i, pose.matrix);
      mesh.setColorAt(i, new THREE.Color(part.colour ?? '#ffffff'));
    }
    mesh.instanceMatrix.needsUpdate = true;
    mesh.instanceColor.needsUpdate = true;
    mesh.computeBoundingSphere();
    parent.add(mesh);
    batches.push(mesh);
    return mesh;
  }
  const rails = [[], []];
  const sleepers = [],
    deck = [],
    supports = [];
  for (let distance = 0; distance <= length; distance += 0.75) {
    const f = frame(distance);
    for (let side = 0; side < 2; side++)
      rails[side].push(f.point.clone().addScaledVector(f.normal, side ? 0.96 : -0.96));
    sleepers.push({
      position: f.point.clone().add(new THREE.Vector3(0, -0.12, 0)),
      rotation: f.rotation,
      scale: new THREE.Vector3(2.6, 0.17, 0.21),
      colour: '#66543f',
    });
    if (distance % 3 < 0.75)
      deck.push({
        position: f.point.clone().add(new THREE.Vector3(0, -0.38, 0)),
        rotation: f.rotation,
        scale: new THREE.Vector3(3.5, 0.34, 3.12),
        colour: '#99917c',
      });
    if (distance % 12 < 0.75) {
      const ground = terrainHeight(f.point.x, f.point.z);
      if (Number.isFinite(ground) && ground < f.point.y - 0.5) {
        const height = f.point.y - 0.5 - ground;
        supports.push({
          position: new THREE.Vector3(f.point.x, ground + height / 2, f.point.z),
          rotation: f.rotation,
          scale: new THREE.Vector3(2.35, height, 0.8),
          colour: '#827f70',
        });
      }
    }
  }
  for (let side = 0; side < 2; side++) {
    rails[side].push(
      frame(length).point.addScaledVector(frame(length).normal, side ? 0.96 : -0.96),
    );
    const geometry = new THREE.TubeGeometry(
      new THREE.CatmullRomCurve3(rails[side]),
      rails[side].length,
      0.065,
      4,
      false,
    );
    geometries.add(geometry);
    const rail = new THREE.Mesh(geometry, steel);
    rail.name = `passingloop / ${side ? 'right' : 'left'} siding rail`;
    root.add(rail);
  }
  makeBatch('sleepers', box, sleepers);
  makeBatch('raised ballast deck', box, deck);
  if (supports.length) makeBatch('deck foundations', box, supports);

  const cars = [];
  for (let carIndex = 0; carIndex < 2; carIndex++) {
    const group = new THREE.Group();
    group.name = `passingloop / local train carriage ${carIndex + 1}`;
    group.visible = false;
    root.add(group);
    const body = [],
      wheels = [],
      lamps = [];
    const part = (colour, x, y, z, sx, sy, sz) =>
      body.push({
        colour,
        position: new THREE.Vector3(x, y, z),
        scale: new THREE.Vector3(sx, sy, sz),
      });
    part('#2b5f77', 0, 1.02, 0, 2.45, 1.16, 9.8);
    part('#e2d7b4', 0, 2.05, 0, 2.45, 0.9, 9.8);
    part('#869293', 0, 2.6, 0, 2.58, 0.23, 10);
    part('#d8bf83', 0, 1.56, 0, 2.48, 0.055, 9.81);
    part('#35464c', 0, 0.33, 0, 1.65, 0.26, 9.4);
    part('#657476', 0, 2.81, 0, 1.1, 0.25, 1.3);
    for (const side of [-1, 1]) {
      for (const z of [-3.8, -2.45, -1.1, 0.3, 1.65, 3.05, 4.05]) {
        part('#355461', side * 1.235, 2.04, z, 0.018, 0.58, z === 4.05 ? 0.48 : 0.97);
        part('#e5dcc2', side * 1.25, 2.04, z + 0.25, 0.014, 0.58, 0.027);
      }
      for (const z of [-3.2, 3.2]) {
        wheels.push({
          colour: '#303737',
          position: new THREE.Vector3(side * 0.97, 0.315, z - 0.6),
          scale: new THREE.Vector3(1, 1, 1),
        });
        wheels.push({
          colour: '#303737',
          position: new THREE.Vector3(side * 0.97, 0.315, z + 0.6),
          scale: new THREE.Vector3(1, 1, 1),
        });
      }
    }
    for (const end of [-1, 1]) {
      part('#334e58', 0, 2.03, end * 4.912, 1.94, 0.55, 0.02);
      part('#d8c89c', 0, 2.36, end * 4.93, 0.67, 0.12, 0.02);
      part('#343b3b', 0, 0.52, end * 5.11, 0.4, 0.23, 0.38);
      for (const side of [-1, 1])
        lamps.push({
          colour: end > 0 && carIndex === 0 ? '#fff1b9' : '#b25444',
          position: new THREE.Vector3(side * 0.84, 1.45, end * 4.94),
          scale: new THREE.Vector3(0.075, 0.075, 0.024),
        });
    }
    makeBatch(`carriage ${carIndex + 1} body and windows`, box, body, group);
    makeBatch(`carriage ${carIndex + 1} wheels`, wheel, wheels, group);
    makeBatch(`carriage ${carIndex + 1} marker lamps`, round, lamps, group, signalMaterial);
    cars.push({ group, distance: 0, tangent: new THREE.Vector3() });
  }
  const signalPoint = railPoint(548);
  const signalTangent = railPoint(549).sub(railPoint(547)).normalize();
  const normal = new THREE.Vector3(signalTangent.z, 0, -signalTangent.x).normalize();
  signalPoint.addScaledVector(normal, 2.1);
  makeBatch('main line signal mast', box, [
    {
      position: signalPoint.clone().add(new THREE.Vector3(0, 1.9, 0)),
      scale: new THREE.Vector3(0.13, 3.8, 0.13),
      colour: '#566060',
    },
    {
      position: signalPoint.clone().add(new THREE.Vector3(0, 3.55, 0)),
      scale: new THREE.Vector3(0.43, 0.8, 0.22),
      colour: '#343e3e',
    },
  ]);
  const signal = makeBatch(
    'main line stop and proceed lamps',
    round,
    [
      {
        position: signalPoint.clone().add(new THREE.Vector3(0, 3.76, -0.14)),
        scale: new THREE.Vector3(0.11, 0.11, 0.035),
        colour: '#492e2b',
      },
      {
        position: signalPoint.clone().add(new THREE.Vector3(0, 3.35, -0.14)),
        scale: new THREE.Vector3(0.11, 0.11, 0.035),
        colour: '#8dcd9b',
      },
    ],
    root,
    signalMaterial,
  );
  let active = false,
    progress = 0,
    signalState = 'green',
    disposed = false;
  function update(input = {}) {
    if (disposed) return;
    active = Boolean(input.active);
    progress = clamp(Number.isFinite(input.progress) ? input.progress : 0, 0, 1);
    const nextSignal = (active && progress < 1) || input.canDepart === false ? 'red' : 'green';
    if (nextSignal !== signalState) {
      signalState = nextSignal;
      signal.setColorAt(0, new THREE.Color(signalState === 'red' ? '#f46b4e' : '#492e2b'));
      signal.setColorAt(1, new THREE.Color(signalState === 'green' ? '#8dcd9b' : '#294637'));
      signal.instanceColor.needsUpdate = true;
    }
    for (let index = 0; index < cars.length; index++) {
      const car = cars[index];
      car.distance = (1 - progress) * (length + 22) + index * 10.65 - 11;
      car.group.visible = active && progress < 1 && car.distance >= 5 && car.distance <= length - 5;
      if (!car.group.visible) continue;
      const f = frame(car.distance);
      car.group.position.copy(f.point);
      car.group.quaternion.copy(f.rotation).multiply(turnAround);
      car.tangent.copy(f.tangent).negate();
    }
  }
  function getState() {
    return {
      active,
      progress,
      signal: signalState,
      stationZ: STATION_Z,
      separation: SEPARATION,
      trackLength: length,
      renderBatches: batches.length + 2,
      cars: cars.map(({ group, distance, tangent }) => ({
        visible: group.visible,
        position: group.position.toArray(),
        tangent: tangent.toArray(),
        distance,
      })),
    };
  }
  function dispose() {
    if (disposed) return;
    disposed = true;
    active = false;
    for (const car of cars) car.group.visible = false;
    root.removeFromParent();
    for (const geometry of geometries) geometry.dispose();
    for (const mat of materials) mat.dispose();
    for (const batch of batches) batch.dispose();
  }
  return { update, getState, dispose };
}
