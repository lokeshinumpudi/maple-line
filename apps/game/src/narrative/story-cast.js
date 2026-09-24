const STATION_Z = new Set([
  525, 1500, 3100, 4700, 8000, 9600, 12800, 14400, 16000, 17600, 19300, 21200, 23300,
]);
const TRACKSIDE_Z = new Set([-440, -120]);
const PLATFORM_OFFSET = 6.55;
const PLATFORM_HEIGHT = 0.6;

/** Two authored station figures; the host supplies train speed in metres per second. */
export function createStoryCast({ THREE, scene, railPoint, terrainHeight }) {
  const root = new THREE.Group();
  root.name = 'narrativecast / Haru and Emi';
  root.visible = false;
  scene.add(root);

  const geometries = {
    round: new THREE.SphereGeometry(1, 12, 8),
    cylinder: new THREE.CylinderGeometry(0.86, 1, 1, 8),
    box: new THREE.BoxGeometry(1, 1, 1),
  };
  const material = new THREE.MeshStandardMaterial({ roughness: 0.87 });
  material.name = 'narrativecast / cloth, skin and leather';
  const shapes = { round: [], cylinder: [], box: [] };
  const dummy = new THREE.Object3D();
  const axisY = new THREE.Vector3(0, 1, 0);
  const colours = {
    skin: '#c69575',
    haru: '#3d4d60',
    emi: '#a3573c',
    trousers: '#3f4547',
    shoes: '#363130',
    hair: '#443832',
    grey: '#a5a49b',
    leather: '#786047',
    linen: '#d6ccae',
    recorder: '#41464a',
  };
  const people = [
    { id: 'haru', name: 'Haru Morita', height: 1.65, z: -0.8, facing: Math.PI / 2 - 0.15 },
    { id: 'emi', name: 'Emi', height: 1.5, z: 0.8, facing: Math.PI / 2 + 0.15 },
  ];

  function figure(person) {
    const factor = person.height / 1.65;
    const rotation = new THREE.Quaternion().setFromAxisAngle(axisY, person.facing);
    function part(kind, colour, x, y, z, sx, sy, sz, tilt = 0, joint) {
      const point = new THREE.Vector3(x, y, z).multiplyScalar(factor).applyQuaternion(rotation);
      point.z += person.z;
      const pose = new THREE.Quaternion()
        .setFromAxisAngle(new THREE.Vector3(0, 0, 1), tilt)
        .premultiply(rotation);
      shapes[kind].push({
        point,
        rotation: pose,
        scale: new THREE.Vector3(sx, sy, sz).multiplyScalar(factor),
        colour,
        person: person.id,
        joint: joint ?? (y < 0.66 ? 'fixed' : y > 1.3 ? 'head' : 'body'),
        pivot: new THREE.Vector3(0, 1.31 * factor, 0).add(new THREE.Vector3(0, 0, person.z)),
        headAxis: axisY.clone(),
        wristAxis: new THREE.Vector3(1, 0, 0).applyQuaternion(rotation),
        factor,
      });
    }
    const coat = colours[person.id];
    for (const side of [-1, 1]) {
      part('cylinder', colours.trousers, side * 0.1, 0.36, 0, 0.075, 0.54, 0.085);
      part('round', colours.shoes, side * 0.1, 0.065, 0.065, 0.09, 0.065, 0.15);
      part('round', coat, side * 0.21, 1.17, 0, 0.09, 0.12, 0.1);
      part('cylinder', coat, side * 0.24, 1.02, 0.025, 0.065, 0.25, 0.075, side * 0.12);
      part('round', coat, side * 0.225, 0.925, 0.075, 0.075, 0.065, 0.09);
      part('round', coat, side * 0.195, 0.957, 0.18, 0.065, 0.072, 0.15, 0, 'wrist');
      part('round', colours.linen, side * 0.17, 0.98, 0.29, 0.058, 0.055, 0.037, 0, 'wrist');
      part(
        'round',
        colours.skin,
        side * (person.id === 'haru' ? 0.155 : 0.085),
        1.01,
        0.325,
        0.056,
        0.05,
        0.066,
        0,
        'wrist',
      );
      part(
        'round',
        colours.skin,
        side * (person.id === 'haru' ? 0.119 : 0.055),
        1.035,
        0.347,
        0.023,
        0.039,
        0.025,
        0,
        'wrist',
      );
    }
    part('cylinder', coat, 0, 0.98, 0, 0.225, 0.59, 0.145);
    part('box', colours.linen, 0, 1.19, 0.132, 0.105, 0.21, 0.031);
    for (const side of [-1, 1]) {
      part('box', coat, side * 0.066, 1.24, 0.157, 0.085, 0.13, 0.025, side * 0.35);
      part('box', coat, side * 0.13, 1.08, 0.15, 0.12, 0.125, 0.03);
      part('box', colours.trousers, side * 0.13, 1.127, 0.17, 0.125, 0.011, 0.012);
      part('round', '#aa9675', side * 0.13, 1.098, 0.173, 0.012, 0.012, 0.005);
      part('box', '#667075', side * 0.172, 0.85, 0.134, 0.007, 0.17, 0.01);
    }
    part('box', colours.trousers, 0, 1.0, 0.151, 0.012, 0.44, 0.01);
    for (let y = 0.84; y <= 1.19; y += 0.105)
      part('round', '#a99b80', 0.017, y, 0.16, 0.011, 0.011, 0.006);
    part('cylinder', colours.skin, 0, 1.31, 0, 0.055, 0.12, 0.055);
    part('round', colours.skin, 0, 1.455, 0.015, 0.135, 0.175, 0.125);
    part('round', colours.skin, 0, 1.44, 0.135, 0.031, 0.035, 0.033);
    for (const side of [-1, 1]) {
      part('round', colours.skin, side * 0.133, 1.445, 0, 0.025, 0.039, 0.025);
      part('round', '#eee0c9', side * 0.052, 1.478, 0.127, 0.018, 0.009, 0.007);
      part('round', colours.hair, side * 0.052, 1.478, 0.133, 0.007, 0.008, 0.004);
      part(
        'box',
        person.id === 'haru' ? '#6b6054' : colours.hair,
        side * 0.052,
        1.51,
        0.123,
        0.041,
        0.009,
        0.008,
        side * 0.08,
      );
      part('round', '#ba8468', side * 0.072, 1.418, 0.106, 0.043, 0.04, 0.021);
      if (person.id === 'haru') {
        part('box', '#a3745d', side * 0.085, 1.455, 0.112, 0.023, 0.004, 0.004, side * 0.17);
        part('box', '#ad7f65', side * 0.064, 1.425, 0.125, 0.022, 0.004, 0.004, -side * 0.3);
        part('round', colours.grey, side * 0.123, 1.493, -0.032, 0.026, 0.066, 0.047);
      }
    }
    part('round', '#855c4d', 0, 1.392, 0.127, 0.035, 0.005, 0.006);
    part('round', colours.skin, 0, 1.365, 0.09, 0.056, 0.044, 0.04);
    if (person.id === 'haru') {
      part('round', colours.grey, 0, 1.515, -0.065, 0.13, 0.095, 0.08);
      part('round', colours.trousers, 0, 1.596, -0.005, 0.15, 0.054, 0.135);
      part('box', colours.trousers, 0, 1.59, 0.115, 0.26, 0.022, 0.13);
      part('box', '#ac9565', 0, 1.605, 0.124, 0.23, 0.009, 0.008);
      part('round', '#b7a174', 0, 1.629, 0.12, 0.021, 0.021, 0.009);
      part('box', '#cfb87e', 0, 1.629, 0.131, 0.007, 0.022, 0.004);
      part('box', colours.leather, -0.215, 0.82, -0.02, 0.16, 0.25, 0.23);
      part('box', colours.leather, 0, 1.05, 0.152, 0.04, 0.53, 0.019, -0.59);
      part('box', '#9f8a64', -0.223, 0.845, 0.101, 0.168, 0.09, 0.02);
      part('box', '#c4b38c', -0.215, 0.83, 0.117, 0.041, 0.037, 0.012);
      // Worn notebook held open; both covers and the page block are actual geometry.
      for (const side of [-1, 1]) {
        part(
          'box',
          '#564631',
          -0.08 + side * 0.069,
          1.047,
          0.363,
          0.136,
          0.016,
          0.19,
          side * 0.1,
          'wrist',
        );
        part(
          'box',
          '#d1c09a',
          -0.08 + side * 0.066,
          1.06,
          0.363,
          0.127,
          0.008,
          0.178,
          side * 0.1,
          'wrist',
        );
        for (let line = 0; line < 4; line++)
          part(
            'box',
            '#99896c',
            -0.08 + side * 0.066,
            1.067,
            0.318 + line * 0.025,
            0.085,
            0.002,
            0.002,
            0,
            'wrist',
          );
      }
      // Open-ended spanner: a shaft and two separated jaws, no filled fake opening.
      part('box', '#9baba9', 0.17, 1.13, 0.338, 0.021, 0.2, 0.014, -0.1, 'wrist');
      part('box', '#bac5bd', 0.18, 1.23, 0.338, 0.055, 0.018, 0.018, 0, 'wrist');
      for (const side of [-1, 1])
        part(
          'box',
          '#bac5bd',
          0.18 + side * 0.024,
          1.252,
          0.338,
          0.013,
          0.045,
          0.018,
          side * 0.12,
          'wrist',
        );
      for (const detail of shapes.box.slice(-4)) detail.prop = 'spanner';
    } else {
      part('round', colours.hair, 0, 1.53, -0.045, 0.145, 0.12, 0.125);
      part('round', colours.hair, 0, 1.38, -0.1, 0.125, 0.16, 0.075);
      for (let strand = 0; strand < 5; strand++) {
        const x = -0.085 + strand * 0.043;
        part(
          'round',
          strand % 2 ? '#504036' : colours.hair,
          x,
          1.555 - Math.abs(x) * 0.3,
          0.066,
          0.035,
          0.077,
          0.038,
        );
      }
      for (let rib = -2; rib <= 2; rib++)
        part('box', '#bbaa8e', rib * 0.018, 1.197, 0.151, 0.004, 0.13, 0.004);
      part('box', colours.leather, 0.18, 1.04, 0.14, 0.035, 0.48, 0.019, 0.14);
      part('box', '#68715b', 0.14, 0.88, -0.14, 0.23, 0.36, 0.14);
      part('box', colours.recorder, 0, 1.066, 0.353, 0.13, 0.2, 0.063, 0, 'wrist');
      part('box', '#93a5a4', 0, 1.1, 0.388, 0.085, 0.051, 0.006, 0, 'wrist');
      for (const side of [-1, 1]) {
        part('round', '#a8aba3', side * 0.035, 1.183, 0.353, 0.027, 0.035, 0.024, 0, 'wrist');
        part('round', '#b8baad', side * 0.027, 1.039, 0.388, 0.012, 0.012, 0.005, 0, 'wrist');
      }
      part('round', '#a54237', 0, 1.011, 0.389, 0.008, 0.008, 0.005, 0, 'wrist');
    }
  }
  people.forEach(figure);
  const batches = [];
  for (const [kind, parts] of Object.entries(shapes)) {
    const batch = new THREE.InstancedMesh(geometries[kind], material, parts.length);
    batch.name = `narrativecast / ${kind} details`;
    batch.castShadow = true;
    batch.receiveShadow = true;
    batch.userData.characters = ['Haru Morita', 'Emi'];
    root.add(batch);
    batches.push({ batch, parts });
  }
  let currentBeat = null;
  let previousPosition = null;
  let feet = [];
  let hiddenReason = 'no-dialogue';
  let disposed = false;
  let animationTime = 0;
  let lastRenderedTime = -Infinity;
  let stageType = null;
  let activeZ = 0;
  let offsets = new Map();
  // People drawn by the crowd kit's hero-level figures instead (narrative/story-crowd.js).
  const standIns = new Set();
  const motion = new THREE.Quaternion();

  function place(z) {
    activeZ = z;
    stageType = STATION_Z.has(z) ? 'platform' : 'trackside';
    const p = railPoint(z);
    const ahead = railPoint(z + 1);
    const behind = railPoint(z - 1);
    const yaw = Math.atan2(ahead.x - behind.x, ahead.z - behind.z);
    const normal = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw));
    root.position.copy(p).addScaledVector(normal, PLATFORM_OFFSET);
    root.position.y = p.y + PLATFORM_HEIGHT;
    root.rotation.y = yaw;
    const rotation = new THREE.Quaternion().setFromAxisAngle(axisY, yaw);
    offsets = new Map();
    feet = [];
    for (const person of people) {
      const foot = new THREE.Vector3(0, 0, person.z).applyQuaternion(rotation).add(root.position);
      const ground = terrainHeight(foot.x, foot.z);
      // These station decks are built 0.6 m above their local rail reference.
      const platformY =
        stageType === 'platform' ? railPoint(z + person.z).y + PLATFORM_HEIGHT : ground;
      const samples = [ground];
      for (const dx of [-0.25, 0.25])
        for (const dz of [-0.25, 0.25]) samples.push(terrainHeight(foot.x + dx, foot.z + dz));
      if (
        !samples.every(Number.isFinite) ||
        Math.max(...samples) - Math.min(...samples) > (stageType === 'platform' ? 0.65 : 0.12) ||
        (stageType === 'trackside' && Math.abs(ground - railPoint(foot.z).y) > 1.5) ||
        ground > platformY + 0.03 ||
        ground < platformY - 2
      )
        return false;
      foot.y = platformY;
      feet.push({ id: person.id, position: foot.toArray() });
      offsets.set(person.id, platformY - root.position.y);
    }
    renderPose(animationTime, true);
    return true;
  }

  let spannerReturned = false;
  function renderPose(time, updateColours = false) {
    for (const { batch, parts } of batches) {
      for (let i = 0; i < parts.length; i++) {
        const part = parts[i];
        dummy.position.copy(part.point);
        dummy.quaternion.copy(part.rotation);
        const phase = part.person === 'haru' ? 0 : 1.7;
        if (part.joint !== 'fixed') {
          const angle =
            part.joint === 'head'
              ? Math.sin(time * 0.45 + phase) * 0.026
              : part.joint === 'wrist'
                ? Math.sin(time * 0.7 + phase) * 0.018
                : 0;
          motion.setFromAxisAngle(part.joint === 'head' ? part.headAxis : part.wristAxis, angle);
          dummy.position.sub(part.pivot).applyQuaternion(motion).add(part.pivot);
          dummy.quaternion.premultiply(motion);
          dummy.position.y += Math.sin(time * 1.35 + phase) * 0.003 * part.factor;
        }
        dummy.position.y += offsets.get(part.person);
        dummy.scale.copy(part.scale);
        if (part.prop === 'spanner' && (activeZ > 4700 || spannerReturned))
          dummy.scale.setScalar(0);
        if (standIns.has(part.person)) dummy.scale.setScalar(0);
        dummy.updateMatrix();
        batch.setMatrixAt(i, dummy.matrix);
        if (updateColours) batch.setColorAt(i, new THREE.Color(part.colour));
      }
      batch.instanceMatrix.needsUpdate = true;
      if (updateColours) {
        batch.instanceColor.needsUpdate = true;
        batch.computeBoundingSphere();
        batch.boundingSphere.radius += 0.05;
      }
    }
    lastRenderedTime = time;
  }

  function update({ storyState, trainPosition, trainSpeed = 0, dt = 0, elapsed } = {}) {
    if (disposed) return;
    spannerReturned = storyState?.completedTasks?.includes('return-spanner') ?? false;
    const beat = storyState?.enabled && storyState.activeBeat;
    const point = Array.isArray(trainPosition)
      ? new THREE.Vector3(...trainPosition)
      : trainPosition;
    const moved = previousPosition && point && previousPosition.distanceTo(point) > 0.005;
    if (point && [point.x, point.y, point.z].every(Number.isFinite))
      previousPosition = point.clone();
    root.visible = false;
    if (!beat) hiddenReason = 'no-dialogue';
    else if (!STATION_Z.has(beat.z) && !TRACKSIDE_Z.has(beat.z)) hiddenReason = 'not-a-station';
    else if (!point || !Number.isFinite(point.z) || Math.abs(point.z - beat.z) > 18)
      hiddenReason = 'train-away';
    else if (!Number.isFinite(trainSpeed) || Math.abs(trainSpeed) > 0.05 || moved)
      hiddenReason = 'train-moving';
    else if (currentBeat !== beat.id && !place(beat.z)) hiddenReason = 'unsafe-ground';
    else {
      currentBeat = beat.id;
      root.visible = true;
      hiddenReason = null;
      animationTime = Number.isFinite(elapsed)
        ? Math.max(0, elapsed)
        : animationTime + Math.max(0, Math.min(Number.isFinite(dt) ? dt : 0, 0.1));
      // Every frame that time moves, so the cast does not step against the story camera.
      if (Math.abs(animationTime - lastRenderedTime) >= 1e-4) renderPose(animationTime);
    }
  }

  function getState() {
    return {
      visible: root.visible,
      beatId: root.visible ? currentBeat : null,
      hiddenReason,
      characters: people.map(({ id, name, height, facing }, index) => ({
        id,
        name,
        height,
        headFocus: root.visible
          ? feet[index].position.map((v, axis) => v + (axis === 1 ? height * 0.9 : 0))
          : null,
        facing: [Math.sin(root.rotation.y + facing), 0, Math.cos(root.rotation.y + facing)],
      })),
      focusPoint: root.visible
        ? [
            (feet[0].position[0] + feet[1].position[0]) / 2,
            (feet[0].position[1] + feet[1].position[1]) / 2 + 1.13,
            (feet[0].position[2] + feet[1].position[2]) / 2,
          ]
        : null,
      stageType: root.visible ? stageType : null,
      animationTime,
      props: root.visible
        ? ['notebook', 'recorder', ...(activeZ <= 4700 && !spannerReturned ? ['spanner'] : [])]
        : [],
      detailInstances: batches.reduce((sum, { parts }) => sum + parts.length, 0),
      feet: root.visible ? feet.map((foot) => ({ ...foot, position: [...foot.position] })) : [],
      renderBatches: batches.length,
      stationOffset: PLATFORM_OFFSET,
    };
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    root.removeFromParent();
    root.visible = false;
    hiddenReason = 'disposed';
    for (const geometry of Object.values(geometries)) geometry.dispose();
    material.dispose();
    for (const { batch } of batches) batch.dispose();
  }
  /** Hide one person's figure while a loaded model stands in for them. */
  function setStandIn(id, enabled) {
    if (enabled === standIns.has(id)) return;
    if (enabled) standIns.add(id);
    else standIns.delete(id);
    if (offsets.size) renderPose(animationTime);
  }
  return { update, getState, dispose, setStandIn };
}
