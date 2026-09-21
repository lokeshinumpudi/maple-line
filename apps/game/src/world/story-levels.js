/** Authored station work areas. Metadata is inspectable; the host owns validated actions. */
export function createStoryLevels({ THREE, scene, railPoint, terrainHeight }) {
  const root = new THREE.Group();
  root.name = 'Story levels / station work areas';
  scene.add(root);
  const geometries = {
    box: new THREE.BoxGeometry(1, 1, 1),
    ring: new THREE.TorusGeometry(0.34, 0.035, 6, 20),
    rod: new THREE.CylinderGeometry(1, 1, 1, 8),
  };
  const colors = {
    wood: '#987650',
    cream: '#e6dbbe',
    teal: '#385c56',
    metal: '#647575',
    rubber: '#333e3d',
    red: '#a75543',
    paper: '#f5e9c9',
    stone: '#a09c87',
  };
  const materials = Object.fromEntries(
    Object.entries(colors).map(([key, color]) => [
      key,
      new THREE.MeshStandardMaterial({ color, roughness: 0.85 }),
    ]),
  );
  Object.entries(materials).forEach(([key, material]) => {
    material.name = `Story levels / ${key}`;
  });
  const textures = [],
    ownedMaterials = [],
    levels = [],
    dynamic = {};
  const dummy = new THREE.Object3D();
  let disposed = false,
    breadDispatched = false,
    spannerReturned = false,
    connectionAmended = false,
    clinicInspected = false,
    clinicProposal = null,
    clinicTagState = 'pending';
  function makeLevel(id, name, z) {
    const group = new THREE.Group();
    group.name = `${name} / authored story work area`;
    group.visible = false;
    root.add(group);
    const tangent = railPoint(z + 1)
      .clone()
      .sub(railPoint(z - 1));
    const yaw = Math.atan2(tangent.x, tangent.z);
    const point = (x, y, dz) => {
      const p = railPoint(z + dz).clone();
      return p.add(new THREE.Vector3(Math.cos(yaw) * x, y + 0.6, -Math.sin(yaw) * x));
    };
    const batches = new Map();
    function part(kind, mat, x, y, dz, sx, sy, sz, rotation = [0, 0, 0], target = group) {
      const key = `${target.uuid}:${kind}:${mat}`;
      if (!batches.has(key)) batches.set(key, { kind, mat, target, parts: [] });
      const p = point(x, y, dz);
      batches.get(key).parts.push({
        p,
        scale: [sx, sy, sz],
        rotation: [rotation[0], yaw + rotation[1], rotation[2]],
      });
    }
    const box = (mat, x, y, dz, w, h, d, target) =>
      part('box', mat, x, y, dz, w, h, d, [0, 0, 0], target);
    function beam(mat, from, to, thickness, target = group) {
      const a = point(...from),
        b = point(...to),
        mid = a.clone().add(b).multiplyScalar(0.5);
      const key = `${target.uuid}:beam:${mat}`;
      if (!batches.has(key)) batches.set(key, { kind: 'rod', mat, target, parts: [] });
      batches.get(key).parts.push({
        p: mid,
        scale: [thickness, a.distanceTo(b), thickness],
        quaternion: new THREE.Quaternion().setFromUnitVectors(
          new THREE.Vector3(0, 1, 0),
          b.clone().sub(a).normalize(),
        ),
      });
    }
    // Extend the existing platform beyond its shelter, sampling the same rail elevation.
    for (let dz = 24; dz <= 46; dz += 2) {
      const ground = point(11, 0, dz);
      const terrain = terrainHeight?.(ground.x, ground.z);
      const thickness = Number.isFinite(terrain)
        ? Math.max(0.25, Math.min(3, ground.y - terrain))
        : 0.6;
      box('stone', 11, -thickness / 2, dz, 12, thickness, 2.06);
      box('cream', 5.3, 0.045, dz, 0.18, 0.09, 2.06);
    }
    const interactions = [];
    function board(x, dz, heading, lines) {
      box('wood', x, 1.35, dz - 1.15, 0.14, 2.7, 0.14);
      box('wood', x, 1.35, dz + 1.15, 0.14, 2.7, 0.14);
      box('teal', x, 2.1, dz, 0.16, 1.35, 2.65);
      let face;
      if (typeof document !== 'undefined') {
        const canvas = document.createElement('canvas');
        canvas.width = 512;
        canvas.height = 256;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.fillStyle = '#eee4c8';
          ctx.fillRect(0, 0, 512, 256);
          ctx.fillStyle = '#34524a';
          ctx.font = 'bold 27px sans-serif';
          ctx.fillText(heading, 25, 47);
          ctx.fillStyle = '#6b7762';
          ctx.font = '20px sans-serif';
          lines.forEach((line, i) => ctx.fillText(line, 25, 94 + i * 38));
          const texture = new THREE.CanvasTexture(canvas);
          textures.push(texture);
          const material = new THREE.MeshStandardMaterial({ map: texture, roughness: 1 });
          ownedMaterials.push(material);
          face = new THREE.Mesh(geometries.box, material);
          face.name = `${name} / ${heading}`;
          face.position.copy(point(x - 0.091, 2.1, dz));
          face.rotation.y = yaw;
          face.scale.set(0.025, 1.2, 2.46);
          group.add(face);
        }
      }
      return face;
    }
    function crate(x, dz, target = group) {
      box('wood', x, 0.12, dz, 1.4, 0.16, 0.95, target);
      for (let i = 0; i < 3; i++) {
        box('wood', x, 0.28 + i * 0.17, dz - 0.43, 1.4, 0.11, 0.08, target);
        box('wood', x, 0.28 + i * 0.17, dz + 0.43, 1.4, 0.11, 0.08, target);
      }
      for (const side of [-1, 1]) box('wood', x + side * 0.64, 0.39, dz, 0.1, 0.62, 0.95, target);
      box('paper', x - 0.701, 0.42, dz, 0.026, 0.26, 0.48, target);
    }
    function bench(x, dz) {
      box('wood', x, 0.52, dz, 0.7, 0.13, 2.9);
      box('wood', x + 0.31, 0.92, dz, 0.13, 0.75, 2.9);
      for (const side of [-1, 1]) box('metal', x, 0.23, dz + side * 1.13, 0.53, 0.46, 0.12);
    }
    const level = {
      id,
      name,
      z,
      group,
      point,
      yaw,
      interactions,
      box,
      part,
      beam,
      board,
      crate,
      bench,
      batches,
    };
    levels.push(level);
    return level;
  }
  const momiji = makeLevel('momiji', 'Momiji bakery dispatch', 525);
  momiji.board(14.8, 29, 'WINTER SERVICE · DRAFT', [
    'Village connections',
    'Nao’s bakery dispatch',
    'Check the last connection',
  ]);
  momiji.bench(15.5, 40);
  momiji.box('wood', 10.3, 0.08, 36, 2.7, 0.16, 1.7);
  dynamic.bread = new THREE.Group();
  dynamic.bread.name = 'Momiji / Nao’s bread crates';
  momiji.group.add(dynamic.bread);
  momiji.crate(10.1, 35.6, dynamic.bread);
  momiji.crate(11.4, 36.4, dynamic.bread);
  // The guest renderer supplies this same crate during Nao's conversation.
  // Keep its unresolved clinic delivery in the world after the guest scene ends.
  dynamic.clinic = new THREE.Group();
  dynamic.clinic.name = 'Momiji / clinic crate awaiting a delivery plan';
  dynamic.clinic.userData.entityId = 'momiji:clinic-crate';
  momiji.group.add(dynamic.clinic);
  const clinicX = 6.55,
    clinicZ = 2.93;
  momiji.box('wood', clinicX, 0.05, clinicZ, 0.39, 0.1, 0.52, dynamic.clinic);
  for (const side of [-1, 1]) {
    for (const y of [0.14, 0.27])
      momiji.box('wood', clinicX + side * 0.185, y, clinicZ, 0.035, 0.085, 0.53, dynamic.clinic);
    momiji.box('wood', clinicX, 0.18, clinicZ + side * 0.245, 0.39, 0.28, 0.035, dynamic.clinic);
  }
  for (const dz of [-0.12, 0.12])
    momiji.box('cream', clinicX, 0.23, clinicZ + dz, 0.26, 0.19, 0.16, dynamic.clinic);
  // A distinct tag remains on the matching guest crate while she is present.
  momiji.box('paper', clinicX - 0.209, 0.2, clinicZ, 0.023, 0.14, 0.24);
  const clinicTagColors = {
    pending: '#a75543',
    inspected: '#bf973e',
    'later-clinic': '#48856a',
    'shared-van': '#557caa',
  };
  const clinicTagMaterial = materials.red.clone();
  clinicTagMaterial.name = 'Momiji / clinic delivery proposal tag';
  ownedMaterials.push(clinicTagMaterial);
  dynamic.clinicTag = new THREE.Mesh(geometries.box, clinicTagMaterial);
  dynamic.clinicTag.name = 'Momiji / clinic crate proposal stripe';
  dynamic.clinicTag.position.copy(momiji.point(clinicX - 0.224, 0.2, clinicZ - 0.072));
  dynamic.clinicTag.rotation.y = momiji.yaw;
  dynamic.clinicTag.scale.set(0.014, 0.115, 0.04);
  dynamic.clinicTag.userData.entityId = 'momiji:clinic-crate';
  momiji.group.add(dynamic.clinicTag);

  momiji.interactions.push(
    ...[
      ['timetable', 'Winter service draft', 'inspect-timetable', 14.8, 2.1, 29],
      ['bread', 'Nao’s bread crates', 'load-bread', 10.3, 0.4, 36],
      [
        'clinic-crate',
        'Clinic bread · delivery plan pending',
        'plan-clinic-delivery',
        clinicX,
        0.2,
        clinicZ,
      ],
      ['bench', 'The waiting bench', 'inspect-bench', 15.5, 0.6, 40],
    ].map(([key, label, action, x, y, z]) => ({
      id: `momiji:${key}`,
      label,
      action,
      position: momiji.point(x, y, z).toArray(),
      bounds: { radius: 1.6 },
      connected: false,
    })),
  );

  const aonuma = makeLevel('aonuma', 'Fumi’s bicycle workshop', 4700);
  aonuma.board(15.5, 28, 'FUMI · CYCLE REPAIRS', [
    'Punctures · brakes · small repairs',
    'Leave a note at the workbench',
  ]);
  aonuma.box('wood', 13.7, 1.02, 35.5, 1.2, 0.16, 3.2);
  for (const dz of [34.25, 36.75]) aonuma.box('metal', 13.7, 0.49, dz, 0.88, 0.98, 0.12);
  // Bicycle wheel planes and frame share a real ground contact, away from the railway.
  for (const dz of [39.4, 40.7])
    aonuma.part('ring', 'rubber', 10.7, 0.375, dz, 1, 1, 1, [0, Math.PI / 2, 0]);
  const bike = [
    [10.7, 0.375, 39.4],
    [10.7, 0.4, 40.05],
    [10.7, 0.96, 39.85],
    [10.7, 1.05, 40.55],
    [10.7, 0.375, 40.7],
  ];
  for (const [a, b] of [
    [0, 1],
    [0, 2],
    [1, 2],
    [1, 3],
    [2, 3],
    [3, 4],
  ])
    aonuma.beam('red', bike[a], bike[b], 0.035);
  aonuma.box('rubber', 10.7, 1.035, 39.84, 0.22, 0.08, 0.3);
  aonuma.beam('metal', [10.4, 1.1, 40.55], [11, 1.1, 40.55], 0.025);
  dynamic.spanner = new THREE.Group();
  dynamic.spanner.name = 'Aonuma / returned spanner';
  dynamic.spanner.visible = false;
  aonuma.group.add(dynamic.spanner);
  aonuma.box('metal', 13.58, 1.13, 35.5, 0.13, 0.055, 0.52, dynamic.spanner);
  for (const side of [-1, 1])
    aonuma.box('metal', 13.58 + side * 0.1, 1.13, 35.77, 0.08, 0.055, 0.17, dynamic.spanner);
  aonuma.interactions.push({
    id: 'aonuma:workbench',
    label: 'Fumi’s workbench',
    action: 'return-spanner',
    position: aonuma.point(13.7, 1.15, 35.5).toArray(),
    bounds: { radius: 1.6 },
    connected: false,
  });

  const minato = makeLevel('minato', 'Minato village connection', 21200);
  minato.board(14.8, 28, 'VILLAGE BUS CONNECTION', [
    'Winter transfer · draft',
    'Last train → village bus',
    'Please check before travelling',
  ]);
  for (const x of [9.3, 15.6])
    for (const z of [34, 42]) minato.box('metal', x, 1.7, z, 0.13, 3.4, 0.13);
  minato.box('teal', 12.45, 3.48, 38, 7.3, 0.2, 9.1);
  minato.bench(15.2, 38);
  minato.crate(10.5, 43.5);
  minato.box('metal', 8.5, 1.55, 32, 0.1, 3.1, 0.1);
  minato.box('cream', 8.5, 2.65, 32, 0.13, 0.72, 0.86);
  dynamic.correction = new THREE.Group();
  dynamic.correction.name = 'Minato / pinned connection correction';
  dynamic.correction.visible = false;
  minato.group.add(dynamic.correction);
  minato.box('paper', 14.685, 2.09, 28, 0.04, 0.88, 1.4, dynamic.correction);
  for (let row = 0; row < 4; row++)
    minato.box('red', 14.655, 2.35 - row * 0.16, 28, 0.018, 0.025, 0.93, dynamic.correction);
  for (const dz of [27.48, 28.52])
    minato.box('red', 14.647, 2.46, dz, 0.025, 0.05, 0.05, dynamic.correction);
  minato.interactions.push({
    id: 'minato:connection',
    label: 'Village bus connection board',
    action: 'amend-connection',
    position: minato.point(14.8, 2.1, 28).toArray(),
    bounds: { radius: 1.6 },
    connected: false,
  });

  for (const level of levels)
    for (const { kind, mat, target, parts } of level.batches.values()) {
      const mesh = new THREE.InstancedMesh(geometries[kind], materials[mat], parts.length);
      mesh.name = `${level.name} / ${mat} ${kind}`;
      mesh.userData.storyLevelId = level.id;
      parts.forEach((part, i) => {
        dummy.position.copy(part.p);
        dummy.scale.set(...part.scale);
        if (part.quaternion) dummy.quaternion.copy(part.quaternion);
        else dummy.rotation.set(...part.rotation);
        dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);
      });
      mesh.castShadow = mat !== 'paper';
      mesh.receiveShadow = true;
      mesh.computeBoundingSphere();
      target.add(mesh);
    }
  return {
    update({ position, storyState, dutiesState } = {}) {
      if (disposed) return;
      const z = Array.isArray(position) ? position[2] : position?.z;
      for (const level of levels)
        level.group.visible = Number.isFinite(z) && Math.abs(z - level.z) < 700;
      for (const level of levels)
        for (const interaction of level.interactions) {
          interaction.enabled = Boolean(
            storyState?.enabled &&
            storyState.activeBeat?.task?.id === interaction.action &&
            !storyState.activeBeat.task.completed &&
            Number.isFinite(z) &&
            Math.abs(z - level.z) <= 18,
          );
          interaction.connected = [
            'return-spanner',
            'amend-connection',
            'plan-clinic-delivery',
          ].includes(interaction.action);
        }
      clinicInspected = Boolean(storyState?.deliveryPlan?.inspected);
      clinicProposal = ['later-clinic', 'shared-van'].includes(storyState?.deliveryPlan?.proposal)
        ? storyState.deliveryPlan.proposal
        : null;
      const nextTagState = clinicProposal ?? (clinicInspected ? 'inspected' : 'pending');
      if (nextTagState !== clinicTagState) {
        clinicTagState = nextTagState;
        clinicTagMaterial.color.set(clinicTagColors[clinicTagState]);
      }
      const completed = new Set(storyState?.completedTasks ?? []);
      spannerReturned = completed.has('return-spanner');
      connectionAmended = completed.has('amend-connection');
      breadDispatched = Boolean(dutiesState?.completed);
      dynamic.spanner.visible = spannerReturned;
      dynamic.correction.visible = connectionAmended;
      dynamic.bread.visible = !breadDispatched;
      dynamic.clinic.visible = !(
        storyState?.enabled && storyState.activeBeat?.id === 'momiji-bread'
      );
    },
    getState() {
      return {
        disposed,
        breadDispatched,
        crates: [
          {
            id: 'momiji:bread-1',
            destination: 'passenger service',
            status: breadDispatched ? 'dispatched' : 'on-platform',
            visible: !breadDispatched,
          },
          {
            id: 'momiji:bread-2',
            destination: 'passenger service',
            status: breadDispatched ? 'dispatched' : 'on-platform',
            visible: !breadDispatched,
          },
          {
            id: 'momiji:clinic-crate',
            destination: 'clinic kiosk',
            inspected: clinicInspected,
            proposal: clinicProposal,
            status: clinicProposal ? 'awaiting-confirmation' : 'pending',
            tagState: clinicTagState,
            visible: true,
            representation: dynamic.clinic.visible ? 'station-prop' : 'nao-guest-prop',
          },
        ],
        spannerReturned,
        connectionAmended,
        levels: levels.map((level) => ({
          id: level.id,
          z: level.z,
          visible: level.group.visible,
          platformHeight: railPoint(level.z).y + 0.6,
          interactions: structuredClone(level.interactions),
        })),
        renderBatches: 1 + levels.reduce((sum, l) => sum + l.batches.size, 0),
      };
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      scene.remove(root);
      Object.values(geometries).forEach((g) => g.dispose());
      Object.values(materials).forEach((m) => m.dispose());
      ownedMaterials.forEach((m) => m.dispose());
      textures.forEach((t) => t.dispose());
    },
  };
}
