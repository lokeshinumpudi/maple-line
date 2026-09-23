const PLATFORM_OFFSET = 6.55;
const GUEST_OFFSET = 3.6;
const GUESTS = [
  {
    id: 'nao',
    name: 'Nao',
    beatId: 'momiji-bread',
    z: 525,
    height: 1.6,
    coat: '#aa7251',
    hair: '#413831',
    props: ['bakery apron', 'bread crate'],
  },
  {
    id: 'jun',
    name: 'Jun',
    beatId: 'sakuragawa-water',
    z: 1500,
    height: 1.73,
    coat: '#61735b',
    hair: '#48433a',
    props: ['field hat', 'muddy boots'],
  },
  {
    id: 'endo',
    name: 'Mr. Endo',
    beatId: 'kawasemi-lunch',
    z: 3100,
    height: 1.63,
    coat: '#79756c',
    hair: '#bab7a9',
    props: ['folded private letter'],
  },
  {
    id: 'fumi',
    name: 'Fumi',
    beatId: 'aonuma-fumi',
    z: 4700,
    height: 1.62,
    coat: '#485f66',
    hair: '#b5b7af',
    props: ['work jacket', 'grease rag', 'workbench'],
  },
  {
    id: 'mika',
    name: 'Mika',
    beatId: 'yukihara-scaffolding',
    z: 12800,
    height: 1.64,
    coat: '#77775e',
    hair: '#504136',
    props: ['wool scarf', 'café apron', 'cup'],
  },
];

/** Scene-specific residents. All geometry is shared across three instanced batches. */
export function createStoryGuests({ THREE, scene, railPoint, terrainHeight }) {
  const root = new THREE.Group();
  root.name = 'narrativecast / village guests';
  root.visible = false;
  scene.add(root);
  const geometries = {
    round: new THREE.SphereGeometry(1, 12, 8),
    cylinder: new THREE.CylinderGeometry(0.9, 1, 1, 10),
    box: new THREE.BoxGeometry(1, 1, 1),
  };
  const material = new THREE.MeshStandardMaterial({ roughness: 0.88 });
  material.name = 'narrativecast / guest clothes and work props';
  const designs = new Map();
  const skin = '#c49779';
  for (const guest of GUESTS) {
    const shapes = { round: [], cylinder: [], box: [] };
    const factor = guest.height / 1.65;
    function part(kind, color, x, y, z, sx, sy, sz, moving = y > 0.7, tilt = 0) {
      shapes[kind].push({
        color: new THREE.Color(color),
        position: new THREE.Vector3(x, y, z).multiplyScalar(factor),
        scale: new THREE.Vector3(sx, sy, sz).multiplyScalar(factor),
        rotation: new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), tilt),
        moving,
      });
    }
    const cloth = guest.coat;
    for (const side of [-1, 1]) {
      part('cylinder', '#45494a', side * 0.105, 0.36, 0, 0.078, 0.54, 0.09, false);
      part('round', '#393a33', side * 0.105, 0.067, 0.055, 0.09, 0.067, 0.15, false);
      part('round', cloth, side * 0.22, 1.17, 0, 0.09, 0.12, 0.1);
      part('cylinder', cloth, side * 0.23, 1.035, 0.03, 0.07, 0.25, 0.08, true, side * 0.1);
      part('round', cloth, side * 0.185, 0.975, 0.15, 0.07, 0.07, 0.14);
      part('round', skin, side * 0.13, 1.015, 0.27, 0.055, 0.05, 0.066);
    }
    part('cylinder', cloth, 0, 0.99, 0, 0.225, 0.57, 0.145);
    part('box', '#d5cab1', 0, 1.23, 0.14, 0.09, 0.13, 0.018);
    for (let y = 0.85; y <= 1.16; y += 0.095)
      part('round', '#b6a283', 0.018, y, 0.155, 0.011, 0.011, 0.007);
    part('cylinder', skin, 0, 1.32, 0, 0.056, 0.12, 0.056);
    part('round', skin, 0, 1.46, 0.012, 0.134, 0.173, 0.126);
    part('round', guest.hair, 0, 1.555, -0.04, 0.14, 0.09, 0.12);
    for (const side of [-1, 1]) {
      part('round', guest.hair, side * 0.12, 1.495, -0.035, 0.028, 0.072, 0.07);
      part('round', skin, side * 0.132, 1.45, 0, 0.025, 0.038, 0.025);
      part('round', '#403a33', side * 0.05, 1.48, 0.13, 0.009, 0.008, 0.005);
      part('box', guest.hair, side * 0.05, 1.508, 0.122, 0.034, 0.008, 0.009);
    }
    part('round', skin, 0, 1.443, 0.14, 0.029, 0.034, 0.03);
    part('round', '#885c4c', 0, 1.398, 0.13, 0.03, 0.005, 0.005);
    if (guest.id === 'nao' || guest.id === 'mika') {
      const apron = guest.id === 'nao' ? '#e0ceb0' : '#b8c2ad';
      part('box', apron, 0, 0.91, 0.16, 0.35, 0.58, 0.03);
      part('box', apron, 0, 1.2, 0.16, 0.22, 0.18, 0.03);
      for (const side of [-1, 1]) part('box', apron, side * 0.09, 1.28, 0.09, 0.026, 0.14, 0.045);
      part('box', '#ac9c80', 0, 0.88, 0.18, 0.22, 0.13, 0.016);
      part('round', guest.hair, 0, 1.53, -0.16, 0.066, 0.065, 0.065);
    }
    if (guest.id === 'nao') {
      // A slatted crate beside her feet; its bread is separate rounded geometry.
      part('box', '#9d784f', 0.69, 0.05, 0, 0.52, 0.1, 0.4, false);
      for (const side of [-1, 1]) {
        for (const y of [0.14, 0.27])
          part('box', '#ad875b', 0.69, y, side * 0.19, 0.54, 0.085, 0.035, false);
        part('box', '#ad875b', 0.69 + side * 0.25, 0.18, 0, 0.035, 0.28, 0.4, false);
      }
      for (const x of [0.56, 0.8]) part('round', '#cba46a', x, 0.23, 0, 0.1, 0.12, 0.16, false);
    } else if (guest.id === 'jun') {
      part('cylinder', '#b7a47a', 0, 1.6, 0, 0.24, 0.035, 0.22);
      part('cylinder', '#b7a47a', 0, 1.67, -0.01, 0.14, 0.13, 0.13);
      part('cylinder', '#6b7057', 0, 1.623, -0.01, 0.143, 0.034, 0.133);
      for (const side of [-1, 1]) {
        part('cylinder', '#464f3f', side * 0.105, 0.21, 0, 0.084, 0.25, 0.095, false);
        part('round', '#80765c', side * 0.105, 0.07, 0.16, 0.077, 0.036, 0.055, false);
      }
    } else if (guest.id === 'endo') {
      // Folded toward his chest: no medical information is printed or exposed.
      part('box', '#ddd4bc', 0, 1.03, 0.255, 0.19, 0.14, 0.018);
      part('box', '#bdbaa7', 0, 1.03, 0.266, 0.004, 0.13, 0.005);
      for (const side of [-1, 1]) {
        part('box', '#777a72', side * 0.053, 1.48, 0.14, 0.065, 0.037, 0.006);
        part('box', '#c7b199', side * 0.053, 1.48, 0.145, 0.053, 0.026, 0.006);
      }
      part('box', '#777a72', 0, 1.48, 0.14, 0.025, 0.006, 0.006);
    } else if (guest.id === 'fumi') {
      part('box', '#30464b', -0.12, 1.09, 0.16, 0.12, 0.11, 0.02);
      part('round', '#354749', 0.13, 0.86, 0.16, 0.055, 0.04, 0.008);
      part('box', '#969182', 0, 1.03, 0.3, 0.18, 0.11, 0.032);
      part('box', '#485854', -0.035, 1.02, 0.32, 0.06, 0.04, 0.006);
      // Small portable repair bench beside her, clear of the two protagonists.
      part('box', '#94704d', -0.73, 0.79, 0.12, 0.62, 0.09, 0.45, false);
      for (const x of [-0.97, -0.49])
        for (const z of [-0.04, 0.28]) part('box', '#55635d', x, 0.38, z, 0.05, 0.76, 0.05, false);
      part('box', '#596967', -0.7, 0.89, 0.13, 0.16, 0.11, 0.14, false);
    } else if (guest.id === 'mika') {
      part('round', '#b17a59', 0, 1.31, 0.012, 0.14, 0.075, 0.15);
      part('box', '#bd8b65', -0.09, 1.14, 0.19, 0.08, 0.27, 0.035);
      for (const y of [1.07, 1.14, 1.21])
        part('box', '#cdaa83', -0.09, y, 0.2, 0.084, 0.015, 0.011);
      part('cylinder', '#e5decb', 0, 1.06, 0.3, 0.075, 0.11, 0.075);
      part('cylinder', '#5a4434', 0, 1.119, 0.3, 0.06, 0.003, 0.06);
    }
    designs.set(guest.id, shapes);
  }
  const dummy = new THREE.Object3D();
  const batches = Object.fromEntries(
    Object.entries(geometries).map(([kind, geometry]) => {
      const capacity = Math.max(...[...designs.values()].map((design) => design[kind].length));
      const mesh = new THREE.InstancedMesh(geometry, material, capacity);
      mesh.name = `narrativecast / guest ${kind} details`;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.count = 0;
      root.add(mesh);
      return [kind, mesh];
    }),
  );
  let current = null,
    foot = null,
    elapsed = 0,
    lastPose = -Infinity;
  let previousPosition = null,
    hiddenReason = 'no-dialogue',
    disposed = false;
  function pose(recolor = false) {
    for (const [kind, batch] of Object.entries(batches)) {
      const parts = designs.get(current.id)[kind];
      batch.count = parts.length;
      parts.forEach((part, index) => {
        dummy.position.copy(part.position);
        // Two millimetres of breathing; hands hold their authored work pose.
        if (part.moving) dummy.position.y += Math.sin(elapsed * 1.25) * 0.002;
        dummy.scale.copy(part.scale);
        dummy.quaternion.copy(part.rotation);
        dummy.updateMatrix();
        batch.setMatrixAt(index, dummy.matrix);
        if (recolor) batch.setColorAt(index, part.color);
      });
      batch.instanceMatrix.needsUpdate = true;
      if (recolor) {
        batch.instanceColor.needsUpdate = true;
        batch.computeBoundingSphere();
        batch.boundingSphere.radius += 0.01;
      }
    }
    lastPose = elapsed;
  }
  function place(guest) {
    const z = guest.z + GUEST_OFFSET;
    const center = railPoint(z);
    const tangent = railPoint(z + 1)
      .clone()
      .sub(railPoint(z - 1));
    const yaw = Math.atan2(tangent.x, tangent.z);
    const position = center
      .clone()
      .add(
        new THREE.Vector3(Math.cos(yaw) * PLATFORM_OFFSET, 0.6, -Math.sin(yaw) * PLATFORM_OFFSET),
      );
    const samples = [];
    for (const dx of [-0.4, 0, 0.4])
      for (const dz of [-0.4, 0, 0.4])
        samples.push(terrainHeight(position.x + dx, position.z + dz));
    if (
      ![...position.toArray(), ...samples].every(Number.isFinite) ||
      Math.max(...samples) > position.y + 0.03 ||
      Math.min(...samples) < position.y - 2 ||
      Math.max(...samples) - Math.min(...samples) > 0.65
    )
      return false;
    root.position.copy(position);
    root.rotation.y = yaw + Math.PI / 2;
    foot = position.toArray();
    current = guest;
    pose(true);
    return true;
  }
  function update({ storyState, trainPosition, trainSpeed = 0, dt = 0 } = {}) {
    if (disposed) return;
    const beat = storyState?.enabled && storyState.activeBeat;
    const guest = beat && GUESTS.find((item) => item.beatId === beat.id && item.z === beat.z);
    const point = Array.isArray(trainPosition)
      ? new THREE.Vector3(...trainPosition)
      : trainPosition;
    const validPoint = point && [point.x, point.y, point.z].every(Number.isFinite);
    const moved = validPoint && previousPosition && previousPosition.distanceTo(point) > 0.005;
    if (validPoint) previousPosition = point.clone();
    root.visible = false;
    if (!beat) hiddenReason = 'no-dialogue';
    else if (!guest) hiddenReason = 'no-authored-guest';
    else if (!validPoint || Math.abs(point.z - guest.z) > 18) hiddenReason = 'train-away';
    else if (!Number.isFinite(trainSpeed) || Math.abs(trainSpeed) > 0.05 || moved)
      hiddenReason = 'train-moving';
    else if (current?.id !== guest.id && !place(guest)) hiddenReason = 'unsafe-ground';
    else {
      root.visible = true;
      hiddenReason = null;
      elapsed += Math.max(0, Math.min(Number.isFinite(dt) ? dt : 0, 0.1));
      // Every frame that time moves, so a guest does not step against the story camera.
      if (elapsed - lastPose >= 1e-4) pose();
    }
  }
  function getState() {
    const focus = root.visible
      ? foot.map((v, axis) => v + (axis === 1 ? current.height * 0.85 : 0))
      : null;
    return {
      visible: root.visible,
      hiddenReason,
      beatId: root.visible ? current.beatId : null,
      characters: root.visible
        ? [
            {
              id: current.id,
              name: current.name,
              height: current.height,
              headFocus: focus,
              facing: [Math.sin(root.rotation.y), 0, Math.cos(root.rotation.y)],
            },
          ]
        : [],
      feet: root.visible ? [{ id: current.id, position: [...foot] }] : [],
      focusPoint: focus,
      props: root.visible ? [...current.props] : [],
      renderBatches: Object.keys(batches).length,
      detailInstances: root.visible
        ? Object.values(batches).reduce((sum, batch) => sum + batch.count, 0)
        : 0,
      stationOffset: PLATFORM_OFFSET,
      longitudinalOffset: GUEST_OFFSET,
    };
  }
  function dispose() {
    if (disposed) return;
    disposed = true;
    root.visible = false;
    root.removeFromParent();
    hiddenReason = 'disposed';
    for (const batch of Object.values(batches)) batch.dispose();
    for (const geometry of Object.values(geometries)) geometry.dispose();
    material.dispose();
  }
  return { update, getState, dispose };
}
