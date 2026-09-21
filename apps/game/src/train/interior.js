/** Car-local furnishings and passengers; shared instance batches keep each coat one draw. */
export function createCarInterior({
  THREE,
  car,
  index,
  paints,
  material,
  geometry,
  boxGeometry,
  box,
  cylinder,
}) {
  const upholstery = material(`Interior ${index} / cushion piping`, '#a1aa83', { roughness: 0.95 });
  const wood = material(`Interior ${index} / oak trim`, '#9b7751', { roughness: 0.8 });
  const dark = material(`Interior ${index} / instrument panel`, '#263c3c', { roughness: 0.76 });
  const face = material(`Interior ${index} / skin`, '#d1a580', { roughness: 0.96 });
  const hair = material(`Interior ${index} / hair and shoes`, '#35332e', { roughness: 1 });
  const coats = ['#617b85', '#b17b53', '#73765b'].map((color, i) =>
    material(`Interior ${index} / coat ${i}`, color, { roughness: 1 }),
  );
  const headGeo = geometry(new THREE.SphereGeometry(1, 10, 8), 'Interior / rounded heads');
  const ringGeo = geometry(new THREE.TorusGeometry(0.09, 0.012, 5, 12), 'Interior / hand straps');
  for (const side of [-1, 1]) {
    box(wood, side * 1.385, 2.17, 0, 0.06, 0.075, 7.7, false);
    box(paints.steel, side * 1.07, 1.25, 0, 0.45, 0.22, 6.7);
    box(paints.bright, side * 1.03, 3.02, 0, 0.035, 0.035, 7.1, false);
    for (const z of [-3.25, -2.15, -1.05, 0.05, 1.15, 2.25, 3.25]) {
      box(upholstery, side * 1.055, 1.595, z, 0.55, 0.025, 0.026, false);
      box(paints.bright, side * 1.16, 3.07, z, 0.49, 0.026, 0.026, false);
    }
    for (const z of [-3.48, 3.48]) {
      box(wood, side * 1.08, 1.88, z, 0.58, 0.07, 0.07);
      cylinder(paints.bright, side * 0.8, 1.6, z, 0.02, 0.55, 'y', false);
    }
    box(paints.bright, side * 1.22, 3.05, 0, 0.46, 0.035, 6.8, false);
    for (const z of [-2.2, 1.2]) {
      box(wood, side * 1.21, 3.16, z, 0.32, 0.19, 0.48, false);
      box(paints.rubber, side * 1.21, 3.265, z, 0.2, 0.025, 0.04, false);
    }
  }
  // Floor seams, ceiling vents and route diagram above each vestibule.
  for (const x of [-0.6, 0, 0.6]) box(wood, x, 1.099, 0, 0.012, 0.005, 11.9, false);
  for (const z of [-4.0, 0, 4.0]) {
    box(paints.bright, 0, 3.245, z, 0.5, 0.015, 0.42, false);
    for (let i = 0; i < 6; i++)
      box(dark, 0, 3.233, z - 0.17 + i * 0.065, 0.42, 0.009, 0.015, false);
  }
  for (const end of [-1, 1]) {
    box(wood, 0, 3.0, end * 3.85, 2.85, 0.29, 0.06, false);
    box(paints.cream, 0, 3.0, end * 3.81, 1.5, 0.22, 0.015, false);
    box(paints.seat, 0, 3.0, end * 3.795, 1.26, 0.018, 0.008, false);
    for (let i = 0; i < 8; i++)
      box(paints.red, -0.59 + i * 0.17, 3.0, end * 3.78, 0.035, 0.055, 0.01, false);
  }
  const strapMesh = new THREE.InstancedMesh(ringGeo, paints.interior, 12);
  strapMesh.name = 'Interior / swinging hand straps';
  strapMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  strapMesh.frustumCulled = false;
  car.add(strapMesh);
  for (const side of [-1, 1])
    for (let i = 0; i < 6; i++)
      box(paints.bright, side * 0.72, 2.98, -2.8 + i * 1.12, 0.022, 0.39, 0.024, false);

  const needles = [];
  if (index !== 1) {
    const end = index === 0 ? 1 : -1;
    // Desk leaves the standing driver's sight line through the actual windscreen.
    box(dark, -0.76, 1.61, end * 5.75, 1.26, 1.02, 0.62);
    box(paints.steel, -0.76, 2.17, end * 5.58, 1.3, 0.09, 0.87);
    for (const [x, kind] of [
      [-1.02, 'speed'],
      [-0.52, 'power'],
    ]) {
      cylinder(paints.rubber, x, 2.224, end * 5.67, 0.19, 0.015, 'y', false);
      cylinder(paints.cream, x, 2.235, end * 5.67, 0.163, 0.01, 'y', false);
      for (let i = 0; i < 9; i++) {
        const angle = -2.3 + i * 0.575;
        box(
          dark,
          x + Math.sin(angle) * 0.137,
          2.244,
          end * 5.67 + Math.cos(angle) * 0.137,
          0.015,
          0.01,
          0.018,
          false,
        );
      }
      const needle = new THREE.Mesh(boxGeometry, paints.red);
      needle.name = `Cab / live ${kind} gauge`;
      const pivot = new THREE.Group();
      pivot.position.set(x, 2.256, end * 5.67);
      needle.position.z = 0.065;
      needle.scale.set(0.014, 0.012, 0.13);
      pivot.add(needle);
      car.add(pivot);
      needles.push({ pivot, kind });
    }
    for (const x of [-1.19, -1.02, -0.85])
      cylinder(paints.doorWarning, x, 2.23, end * 5.35, 0.035, 0.025, 'y', false);
    cylinder(paints.rubber, -0.28, 2.23, end * 5.36, 0.09, 0.06, 'y', false);
    const lever = new THREE.Group();
    lever.name = 'Cab / working brake handle';
    lever.position.set(-0.28, 2.28, end * 5.36);
    const handle = new THREE.Mesh(boxGeometry, paints.bright);
    handle.position.z = 0.085;
    handle.scale.set(0.055, 0.045, 0.2);
    lever.add(handle);
    car.add(lever);
    needles.push({ pivot: lever, kind: 'brake' });
    box(paints.seat, -0.78, 1.58, end * 4.69, 0.56, 0.18, 0.48);
    box(paints.seat, -0.78, 1.9, end * 4.45, 0.57, 0.64, 0.09);
  }
  // Through passengers stay aboard; named local riders follow the population simulation.
  const slots = Array.from({ length: 7 }, (_, i) => ({
    side: i % 2 ? 1 : -1,
    z: -2.65 + Math.floor(i / 2) * 1.67,
    id:
      i < 4
        ? `through-${index}-${i}`
        : [
            'returning-1',
            'returning-2',
            'returning-3',
            'commuter-1',
            'commuter-2',
            'commuter-3',
            'commuter-4',
            'commuter-5',
            'commuter-6',
          ][index * 3 + i - 4],
    visible: i < 4,
  }));
  const batches = new Map();
  const dummy = new THREE.Object3D();
  function instance(geo, mat, x, y, z, sx, sy, sz, rotation = 0) {
    const key = `${geo.uuid}:${mat.uuid}`;
    if (!batches.has(key)) {
      const mesh = new THREE.InstancedMesh(geo, mat, 100);
      mesh.name = `Interior / passengers / ${mat.name}`;
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.frustumCulled = false;
      car.add(mesh);
      batches.set(key, { mesh, count: 0 });
    }
    const batch = batches.get(key);
    dummy.position.set(x, y, z);
    dummy.scale.set(sx, sy, sz);
    dummy.rotation.set(0, rotation, 0);
    dummy.updateMatrix();
    batch.mesh.setMatrixAt(batch.count++, dummy.matrix);
  }
  let time = 0;
  function update({ dt = 0, speed = 0, power = 0, brake = 0, passengers = [], cabinOn = false }) {
    time += Math.max(0, dt);
    // A little material fill keeps faces readable inside a lit carriage without extra lights.
    for (const mat of [paints.interior, ...coats, face]) {
      mat.emissive.copy(mat.color);
      mat.emissiveIntensity = cabinOn ? 0.24 : 0.08;
    }
    for (const batch of batches.values()) batch.count = 0;
    for (let i = 0; i < slots.length; i++) {
      const p = slots[i];
      p.visible =
        i < 4 || passengers.some((person) => person.id === p.id && person.state === 'riding');
      if (!p.visible) continue;
      const sway = Math.sin(time * 2.2 + i) * Math.min(Math.abs(speed) * 0.001, 0.015);
      const x = p.side * 1.01,
        z = p.z,
        inward = -p.side;
      instance(boxGeometry, coats[i % 3], x, 1.92, z + sway, 0.31, 0.62, 0.4);
      instance(headGeo, face, x + inward * 0.025, 2.4, z + sway, 0.145, 0.185, 0.145);
      instance(headGeo, hair, x - inward * 0.015, 2.51, z + sway, 0.146, 0.095, 0.148);
      instance(headGeo, face, x + inward * 0.158, 2.4, z + sway, 0.035, 0.041, 0.04);
      for (const side of [-1, 1]) {
        instance(
          headGeo,
          hair,
          x + inward * 0.139,
          2.43,
          z + side * 0.062 + sway,
          0.012,
          0.014,
          0.014,
        );
        instance(boxGeometry, dark, x + inward * 0.14, 1.63, z + side * 0.12, 0.46, 0.15, 0.14);
        instance(boxGeometry, dark, x + inward * 0.34, 1.38, z + side * 0.12, 0.14, 0.47, 0.15);
        instance(boxGeometry, hair, x + inward * 0.39, 1.16, z + side * 0.12, 0.25, 0.1, 0.17);
        instance(
          boxGeometry,
          coats[i % 3],
          x + inward * 0.07,
          1.92,
          z + side * 0.24 + sway,
          0.15,
          0.45,
          0.13,
        );
        instance(
          headGeo,
          face,
          x + inward * 0.17,
          1.72,
          z + side * 0.24 + sway,
          0.085,
          0.06,
          0.065,
        );
      }
      if (i % 2 === 0)
        instance(boxGeometry, wood, x + inward * 0.21, 1.73, z, 0.26, 0.055, 0.3); // book on lap
      else instance(boxGeometry, wood, x, 1.27, z + 0.4, 0.3, 0.33, 0.24); // bag beneath bench
    }
    for (const { mesh, count } of batches.values()) {
      mesh.count = count;
      mesh.instanceMatrix.needsUpdate = true;
    }
    let slot = 0;
    for (const side of [-1, 1])
      for (let i = 0; i < 6; i++) {
        dummy.position.set(side * 0.72, 2.7, -2.8 + i * 1.12);
        dummy.scale.set(1, 1, 1);
        dummy.rotation.set(
          Math.sin(time * 2.1 + i * 0.2) * Math.min(Math.abs(speed) * 0.012, 0.12),
          0,
          0,
        );
        dummy.updateMatrix();
        strapMesh.setMatrixAt(slot++, dummy.matrix);
      }
    strapMesh.instanceMatrix.needsUpdate = true;
    for (const { pivot, kind } of needles)
      pivot.rotation.y =
        kind === 'speed'
          ? -2.3 + Math.min((Math.abs(speed) * 3.6) / 120, 1) * 4.6
          : kind === 'power'
            ? -2.3 + power * 4.6
            : brake * 1.5;
  }
  update({});
  return {
    update,
    state: () => ({
      carIndex: index,
      seated: slots.filter((p) => p.visible).length,
      passengerIds: slots.filter((p) => p.visible).map((p) => p.id),
      gauges: needles.map(({ kind, pivot }) => ({ kind, angle: pivot.rotation.y })),
    }),
  };
}
