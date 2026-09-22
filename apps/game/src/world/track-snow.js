/** Snow occupies ballast shoulders and the space between rails, leaving running heads clear. */
export function snowDepth(lateral, z, amount) {
  const x = Math.abs(lateral);
  const shoulder = Math.exp(-(((x - 1.8) / 0.53) ** 2)) * 0.29;
  const centre = Math.exp(-((x / 0.56) ** 2)) * 0.16;
  const groove = Math.min(1, Math.abs(x - 0.96) / 0.22);
  return (shoulder + centre) * groove * (0.86 + 0.14 * Math.sin(z * 0.17)) * amount;
}

export function createTrackSnow({ THREE, scene, railPoint, isCovered = () => false }) {
  const offsets = [
    -2.7, -2.3, -1.8, -1.35, -1.18, -0.96, -0.74, -0.4, 0, 0.4, 0.74, 0.96, 1.18, 1.35, 1.8, 2.3,
    2.7,
  ];
  const rows = 241,
    step = 3;
  const positions = new Float32Array(rows * offsets.length * 3);
  const indices = [];
  for (let row = 0; row < rows - 1; row++)
    for (let col = 0; col < offsets.length - 1; col++) {
      const a = row * offsets.length + col,
        b = a + offsets.length;
      indices.push(a, b, a + 1, a + 1, b, b + 1);
    }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    'position',
    new THREE.BufferAttribute(positions, 3).setUsage(THREE.DynamicDrawUsage),
  );
  geometry.setIndex(indices);
  const material = new THREE.MeshStandardMaterial({ color: '#e5eced', roughness: 0.98 });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = 'Snow · accumulated track drifts';
  mesh.receiveShadow = true;
  mesh.visible = false;
  scene.add(mesh);
  let amount = 0,
    previousStart = NaN,
    previousAmount = -1;
  return {
    update(dt, { z, weather }) {
      const target = weather === 'snow' ? 1 : 0;
      amount += (target - amount) * (1 - Math.exp(-Math.max(0, dt) / (target ? 10 : 35)));
      const start = Math.floor(z / step) * step - 360;
      const alpine = railPoint(z).y > 337;
      mesh.visible = amount > 0.01 || alpine;
      if (!mesh.visible || (start === previousStart && Math.abs(amount - previousAmount) < 0.015))
        return;
      previousStart = start;
      previousAmount = amount;
      const activeRows = [];
      for (let row = 0; row < rows; row++) {
        const zz = start + row * step,
          p = railPoint(zz),
          next = railPoint(zz + 0.2);
        const yaw = Math.atan2(next.x - p.x, next.z - p.z);
        const localAmount = isCovered(zz)
          ? 0
          : Math.max(amount, THREE.MathUtils.smoothstep(p.y, 325, 350));
        activeRows.push(localAmount > 0.01);
        for (let col = 0; col < offsets.length; col++) {
          const lateral = offsets[col],
            i = (row * offsets.length + col) * 3;
          positions[i] = p.x + lateral * Math.cos(yaw);
          // Below sleepers in clear weather, up to 25 cm above them in drifts.
          positions[i + 1] = p.y - 0.6 + snowDepth(lateral, zz, localAmount) + 0.54 * localAmount;
          positions[i + 2] = zz - lateral * Math.sin(yaw);
        }
      }
      const visibleIndices = [];
      for (let row = 0; row < rows - 1; row++)
        if (activeRows[row] && activeRows[row + 1])
          visibleIndices.push(
            ...indices.slice(row * (offsets.length - 1) * 6, (row + 1) * (offsets.length - 1) * 6),
          );
      geometry.setIndex(visibleIndices);
      geometry.attributes.position.needsUpdate = true;
      geometry.computeVertexNormals();
      geometry.computeBoundingSphere();
    },
    dispose() {
      scene.remove(mesh);
      geometry.dispose();
      material.dispose();
    },
  };
}
