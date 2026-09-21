// River-bed details sit on the same height function used by the water and banks.
export function addRiverDetails({ THREE, scene, center, riverProfile, riverBedHeight }) {
  const root = new THREE.Group();
  root.name = 'River gravel, outcrops and reeds';
  scene.add(root);
  const chunks = new Map(),
    geometries = [],
    materials = [];
  let seed = 68293;
  const random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  const between = (a, b) => a + (b - a) * random();
  const surface = -0.4;
  const pebbleGeometry = new THREE.IcosahedronGeometry(1, 1),
    rockGeometry = new THREE.DodecahedronGeometry(1, 0);
  // A thin bent blade has thickness in both viewing directions without billboard transparency.
  const bladeGeometry = new THREE.BufferGeometry();
  bladeGeometry.setAttribute(
    'position',
    new THREE.Float32BufferAttribute(
      [-0.055, 0, 0, 0.055, 0, 0, 0.12, 1, 0, 0, 0, -0.045, 0, 0, 0.045, 0.12, 1, 0],
      3,
    ),
  );
  bladeGeometry.computeVertexNormals();
  geometries.push(pebbleGeometry, rockGeometry, bladeGeometry);
  const gravelMaterial = new THREE.MeshStandardMaterial({
    color: '#ffffff',
    roughness: 0.96,
    flatShading: true,
  });
  const rockMaterial = new THREE.MeshStandardMaterial({
    color: '#ffffff',
    roughness: 0.91,
    flatShading: true,
  });
  const reedMaterial = new THREE.MeshStandardMaterial({
    color: '#ffffff',
    roughness: 1,
    side: THREE.DoubleSide,
  });
  materials.push(gravelMaterial, rockMaterial, reedMaterial);
  const dummy = new THREE.Object3D(),
    tint = new THREE.Color();
  function add(kind, geometry, material, u, y, z, sx, sy, sz, color, rotation = 0) {
    if (!Number.isFinite(y) || u + Math.max(sx, sz) >= 21) return;
    const chunkIndex = Math.floor((z + 850) / 100),
      key = `${kind}:${chunkIndex}`;
    if (!chunks.has(key)) chunks.set(key, { kind, geometry, material, items: [] });
    dummy.position.set(center(z) + u, y, z);
    dummy.rotation.set(
      kind === 'gravel' ? between(-0.25, 0.25) : 0,
      rotation,
      kind === 'gravel' ? between(-0.2, 0.2) : 0,
    );
    dummy.scale.set(sx, sy, sz);
    dummy.updateMatrix();
    chunks.get(key).items.push({ matrix: dummy.matrix.clone(), color });
  }
  // Irregular shoals leave the deepest current mostly open. Each cluster follows the bend.
  const gravelColors = ['#adb0a4', '#c4bfa9', '#939d94', '#b3b4a5', '#d0c8b1', '#879991'];
  for (let cluster = 0; cluster < 64; cluster++) {
    const clusterZ = between(-833, 833),
      side = random() < 0.5 ? -1 : 1,
      bankFraction = between(0.25, 0.9),
      spread = between(3, 12);
    for (let i = 0; i < 29; i++) {
      const z = THREE.MathUtils.clamp(clusterZ + between(-spread, spread), -842, 842),
        profile = riverProfile(z);
      const u =
          profile.offset +
          side *
            profile.halfWidth *
            THREE.MathUtils.clamp(bankFraction + between(-0.18, 0.18), 0.12, 0.98),
        bed = riverBedHeight(u, z);
      if (bed == null || bed > surface - 0.03) continue;
      const size = between(0.09, 0.43) * (random() < 0.12 ? 1.65 : 1),
        height = size * between(0.3, 0.55);
      add(
        'gravel',
        pebbleGeometry,
        gravelMaterial,
        u,
        bed + height * 0.47,
        z,
        size,
        height,
        size * between(0.65, 1.25),
        gravelColors[Math.floor(random() * gravelColors.length)],
        between(0, Math.PI * 2),
      );
    }
  }
  // Larger smooth rock groups break the water only where the sampled bed is shallow.
  const rockColors = ['#8d9990', '#a0a69a', '#b4b6a5', '#7c8e85'];
  for (let cluster = 0; cluster < 65; cluster++) {
    const z0 = between(-830, 830),
      side = random() < 0.5 ? -1 : 1;
    for (let i = 0; i < 1 + Math.floor(random() * 3); i++) {
      const z = z0 + between(-3.5, 3.5),
        profile = riverProfile(z),
        u = profile.offset + side * profile.halfWidth * between(0.8, 1.035),
        bed = riverBedHeight(u, z);
      if (bed == null || bed < -2 || bed > 1.1) continue;
      const radius = between(0.45, 1.55),
        height = radius * between(0.55, 0.95);
      add(
        'outcrop',
        rockGeometry,
        rockMaterial,
        u,
        bed + height * 0.48,
        z,
        radius,
        height,
        radius * between(0.75, 1.35),
        rockColors[Math.floor(random() * rockColors.length)],
        between(0, Math.PI * 2),
      );
    }
  }
  // Reeds grow in scattered clumps at wet margins, never across the track shelf.
  const reedColors = ['#6f8050', '#839065', '#9a9c6b', '#5d7956'];
  for (let cluster = 0; cluster < 150; cluster++) {
    const z0 = between(-830, 830),
      side = random() < 0.5 ? -1 : 1,
      p = riverProfile(z0),
      fraction = between(0.93, 1.09);
    const u0 = p.offset + side * p.halfWidth * fraction;
    for (let i = 0; i < 5; i++) {
      const z = z0 + between(-0.75, 0.75),
        profile = riverProfile(z),
        u = u0 + (profile.offset - p.offset) + between(-0.6, 0.6),
        bed = riverBedHeight(u, z);
      if (bed == null || bed < surface - 0.32 || bed > surface + 1.05) continue;
      add(
        'reeds',
        bladeGeometry,
        reedMaterial,
        u,
        bed,
        z,
        between(0.7, 1.3),
        between(0.45, 1.2),
        1,
        reedColors[Math.floor(random() * reedColors.length)],
        between(0, Math.PI * 2),
      );
    }
  }
  for (const { kind, geometry, material, items } of chunks.values()) {
    const mesh = new THREE.InstancedMesh(geometry, material, items.length);
    mesh.name = `River ${kind}`;
    for (let i = 0; i < items.length; i++) {
      mesh.setMatrixAt(i, items[i].matrix);
      mesh.setColorAt(i, tint.set(items[i].color));
    }
    mesh.castShadow = kind === 'outcrop';
    mesh.receiveShadow = kind !== 'gravel';
    mesh.computeBoundingSphere();
    root.add(mesh);
  }
  return {
    root,
    update() {},
    dispose() {
      scene.remove(root);
      for (const geometry of geometries) geometry.dispose();
      for (const material of materials) material.dispose();
    },
  };
}
