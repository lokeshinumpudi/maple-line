import { createWetlandWaterProfile, wetlandSection } from '../simulation/wetland-profile.js';

/** Authored wetland branch, generation 2. All coordinates are world coordinates.
 * The caller owns the immutable running curve, terrain and main-line infrastructure.
 * This module owns every resource it creates; its fixed 300 m region never rerolls.
 */
export function createWetlandRoute({ THREE, scene, branchCurve, terrain, railPoint }) {
  const length = branchCurve.getLength();
  if (!Number.isFinite(length) || length <= 0)
    throw new Error('Wetland branch requires a finite curve');
  const root = new THREE.Group();
  root.name = 'wetland / branch railway and reed pools';
  const approach = new THREE.Group();
  approach.name = 'wetland / approach route indicator';
  scene.add(root, approach);
  const box = new THREE.BoxGeometry(1, 1, 1);
  const materials = [
    new THREE.MeshStandardMaterial({ roughness: 0.88 }),
    new THREE.MeshStandardMaterial({ color: '#778583', metalness: 0.65, roughness: 0.36 }),
    new THREE.MeshStandardMaterial({ color: '#364e4a', metalness: 0.35, roughness: 0.54 }),
    new THREE.MeshStandardMaterial({
      color: '#3b887f',
      roughness: 0.24,
      metalness: 0.12,
      transparent: true,
      opacity: 0.86,
      depthWrite: false,
    }),
    new THREE.MeshBasicMaterial({ color: '#e3d9b2' }),
  ];
  const geometries = new Set([box]),
    textures = new Set(),
    meshes = [];
  const identity = new THREE.Quaternion(),
    vertical = new THREE.Vector3(0, 1, 0);
  const pose = new THREE.Object3D();
  const samples = [],
    props = [],
    supportRecords = [],
    sleeperRecords = [];
  const startZ = branchCurve.getPointAt(0).z,
    endZ = branchCurve.getPointAt(1).z;
  const lowZ = Math.min(startZ, endZ),
    highZ = Math.max(startZ, endZ);
  const mainSamples = [];
  for (let z = lowZ - 15; z <= highZ + 15; z += 2) mainSamples.push(railPoint(z));
  function frame(t) {
    const point = branchCurve.getPointAt(t);
    const tangent = branchCurve.getTangentAt(t).normalize();
    const normal = new THREE.Vector3(tangent.z, 0, -tangent.x).normalize();
    const up = new THREE.Vector3().crossVectors(tangent, normal).normalize();
    return {
      point,
      normal,
      up,
      rotation: new THREE.Quaternion().setFromRotationMatrix(
        new THREE.Matrix4().makeBasis(normal, up, tangent),
      ),
    };
  }
  const segments = Math.ceil(length / 0.65);
  for (let i = 0; i <= segments; i++) samples.push(frame(i / segments));
  function clearance(point) {
    let nearest = Infinity;
    for (const p of mainSamples)
      nearest = Math.min(nearest, Math.hypot(p.x - point.x, p.z - point.z));
    for (const f of samples)
      nearest = Math.min(nearest, Math.hypot(f.point.x - point.x, f.point.z - point.z));
    return nearest;
  }
  function part(position, scale, colour, rotation = identity) {
    return { position, scale: new THREE.Vector3(...scale), colour, rotation };
  }
  function batch(
    name,
    parts,
    parent = root,
    material = materials[0],
    shadow = false,
    geometry = box,
  ) {
    if (!parts.length) return null;
    const mesh = new THREE.InstancedMesh(geometry, material, parts.length);
    mesh.name = `wetland / ${name}`;
    parts.forEach((item, index) => {
      pose.position.copy(item.position);
      pose.scale.copy(item.scale);
      pose.quaternion.copy(item.rotation);
      pose.updateMatrix();
      mesh.setMatrixAt(index, pose.matrix);
      mesh.setColorAt(index, new THREE.Color(item.colour));
    });
    mesh.instanceMatrix.needsUpdate = true;
    mesh.instanceColor.needsUpdate = true;
    mesh.computeBoundingSphere();
    mesh.castShadow = shadow;
    mesh.receiveShadow = true;
    parent.add(mesh);
    meshes.push(mesh);
    return mesh;
  }
  function beam(parts, a, b, width, height, colour) {
    const delta = b.clone().sub(a),
      span = delta.length();
    if (span < 0.001) return;
    parts.push(
      part(
        a.clone().add(b).multiplyScalar(0.5),
        [width, height, span],
        colour,
        new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), delta.normalize()),
      ),
    );
  }
  // Ring centres lie on the supplied curve rather than a second fitted spline.
  function tube(name, lateral, lift, radius, material) {
    const vertices = [],
      indices = [];
    samples.forEach((f, i) => {
      const p = f.point.clone().addScaledVector(f.normal, lateral).addScaledVector(vertical, lift);
      for (let j = 0; j < 4; j++) {
        const angle = (j * Math.PI) / 2;
        const v = p
          .clone()
          .addScaledVector(f.normal, Math.cos(angle) * radius)
          .addScaledVector(f.up, Math.sin(angle) * radius);
        vertices.push(v.x, v.y, v.z);
        if (i < segments) {
          const a = i * 4 + j,
            b = i * 4 + ((j + 1) % 4);
          indices.push(a, b, a + 4, b, b + 4, a + 4);
        }
      }
    });
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    geo.setIndex(indices);
    geo.computeVertexNormals();
    geo.computeBoundingSphere();
    geometries.add(geo);
    const mesh = new THREE.Mesh(geo, material);
    mesh.name = `wetland / ${name}`;
    root.add(mesh);
    meshes.push(mesh);
  }
  tube('left running rail', -0.96, 0, 0.065, materials[1]);
  tube('right running rail', 0.96, 0, 0.065, materials[1]);
  tube('contact wire 7.35 metres above rail', 0, 7.35, 0.025, materials[2]);
  const sleepers = [],
    deck = [],
    piers = [],
    equipment = [];
  const sleeperCount = Math.floor(length / 0.75);
  for (let i = 1; i < sleeperCount; i++) {
    const t = i / sleeperCount,
      f = frame(t);
    sleepers.push(
      part(f.point.clone().addScaledVector(f.up, -0.12), [2.6, 0.17, 0.22], '#655342', f.rotation),
    );
    sleeperRecords.push({ t, position: f.point.toArray() });
  }
  // Narrow longitudinal timbers support the route only where ground falls away.
  for (let d = 2; d < length - 2; d += 2) {
    const f = frame(d / length),
      ground = terrain(f.point.x, f.point.z);
    if (!Number.isFinite(ground) || ground >= f.point.y - 0.45) continue;
    deck.push(
      part(f.point.clone().addScaledVector(f.up, -0.36), [3.05, 0.23, 2.1], '#7c725d', f.rotation),
    );
    if (Math.floor(d / 2) % 5) continue;
    for (const side of [-1, 1]) {
      const p = f.point.clone().addScaledVector(f.normal, side * 1.04);
      const bed = terrain(p.x, p.z),
        top = p.y - 0.49;
      if (!Number.isFinite(bed) || bed >= top) continue;
      piers.push(
        part(new THREE.Vector3(p.x, (bed + top) / 2, p.z), [0.24, top - bed, 0.3], '#605e4d'),
      );
      supportRecords.push({ x: p.x, z: p.z, bottom: bed, top });
    }
  }
  for (let d = 22; d < length - 12; d += 37) {
    const f = frame(d / length),
      p = f.point.clone().addScaledVector(f.normal, -4.3);
    if (clearance(p) < 3.5) continue;
    const ground = terrain(p.x, p.z);
    if (!Number.isFinite(ground)) continue;
    const top = f.point.y + 8.15;
    beam(
      equipment,
      new THREE.Vector3(p.x, Math.min(ground, f.point.y - 0.25), p.z),
      new THREE.Vector3(p.x, top, p.z),
      0.14,
      0.14,
      '#596965',
    );
    beam(
      equipment,
      new THREE.Vector3(p.x, top - 0.4, p.z),
      f.point.clone().addScaledVector(vertical, 7.35),
      0.1,
      0.1,
      '#596965',
    );
    props.push({
      id: `mast-${Math.round(d)}`,
      kind: 'catenary',
      position: p.toArray(),
      clearance: clearance(p),
    });
  }
  batch('timber sleepers', sleepers);
  batch('narrow maintenance deck', deck, root, materials[0], true);
  batch('timber support piles', piers, root, materials[0], true);
  batch('catenary masts and cantilevers', equipment);
  const waterProfile = createWetlandWaterProfile(railPoint);
  const reeds = [],
    markers = [],
    publicWorks = [],
    shrubs = [];
  const waterVertices = [],
    waterIndices = [],
    mudVertices = [],
    mudIndices = [];
  const random = (n) => {
    const v = Math.sin(n * 127.1 + 7143.91) * 43758.5453;
    return v - Math.floor(v);
  };
  const meshFrom = (name, vertices, indices, material) => {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    geo.setIndex(indices);
    geo.computeVertexNormals();
    geo.computeBoundingSphere();
    geometries.add(geo);
    const mesh = new THREE.Mesh(geo, material);
    mesh.name = `wetland / ${name}`;
    root.add(mesh);
    meshes.push(mesh);
    return mesh;
  };
  const rows = 70;
  for (let row = 0; row <= rows; row++) {
    const z = waterProfile.centerZ - waterProfile.halfLength + row;
    const section = wetlandSection(z, waterProfile);
    for (const side of [-1, 1])
      waterVertices.push(section.centerX + side * section.halfWidth, waterProfile.waterY, z);
    if (row < rows) {
      const a = row * 2;
      waterIndices.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
    }
    for (const side of [-1, 1]) {
      const index = mudVertices.length / 3;
      for (const extra of [-0.15, 2.3]) {
        const x = section.centerX + side * (section.halfWidth + extra);
        mudVertices.push(x, terrain(x, z) + 0.035, z);
      }
      if (row < rows) {
        if (side === -1)
          mudIndices.push(index, index + 1, index + 4, index + 1, index + 5, index + 4);
        else mudIndices.push(index, index + 4, index + 1, index + 1, index + 4, index + 5);
      }
    }
    if (row < 5 || row > rows - 5 || row % 2) continue;
    for (const side of [-1, 1]) {
      if (random(row + side * 4) < 0.2) continue;
      const x = section.centerX + side * (section.halfWidth + 0.85 + random(row * 31) * 0.7);
      const y = terrain(x, z),
        p = new THREE.Vector3(x, y, z);
      if (!Number.isFinite(y) || clearance(p) < 4) continue;
      for (let j = 0; j < 5; j++) {
        const dx = (random(row * 11 + j) - 0.5) * 0.85,
          dz = (random(row * 17 + j) - 0.5) * 0.8;
        const h = 0.85 + random(row * 27 + j) * 0.8,
          base = terrain(x + dx, z + dz);
        reeds.push(
          part(
            new THREE.Vector3(x + dx, base + h / 2, z + dz),
            [0.055, h, 0.055],
            j % 3 ? '#8c985f' : '#b5a96e',
            new THREE.Quaternion().setFromAxisAngle(
              new THREE.Vector3(0, 0, 1),
              (random(row + j) - 0.5) * 0.2,
            ),
          ),
        );
        if (j % 2)
          reeds.push(
            part(new THREE.Vector3(x + dx, base + h, z + dz), [0.085, 0.2, 0.08], '#756448'),
          );
      }
    }
  }
  meshFrom('continuous wetland channel', waterVertices, waterIndices, materials[3]);
  const mudMaterial = new THREE.MeshStandardMaterial({ color: '#8f8867', roughness: 0.94 });
  materials.push(mudMaterial);
  meshFrom('irregular muddy channel banks', mudVertices, mudIndices, mudMaterial);
  const middle = wetlandSection(waterProfile.centerZ, waterProfile);
  const bankPoint = (x, z) => new THREE.Vector3(x, terrain(x, z), z);
  const nearBank = bankPoint(middle.centerX + middle.halfWidth + 2, waterProfile.centerZ);
  const farBank = bankPoint(middle.centerX - middle.halfWidth - 2, waterProfile.centerZ);
  const deckY = Math.max(nearBank.y, farBank.y, waterProfile.waterY + 0.25) + 0.35;
  const deckStart = nearBank.clone().setY(deckY),
    deckEnd = farBank.clone().setY(deckY);
  const plankCount = Math.ceil(deckStart.distanceTo(deckEnd) / 0.31);
  for (let i = 0; i <= plankCount; i++) {
    const p = deckStart.clone().lerp(deckEnd, i / plankCount);
    beam(
      publicWorks,
      p.clone().add(new THREE.Vector3(0, 0, -0.78)),
      p.clone().add(new THREE.Vector3(0, 0, 0.78)),
      0.29,
      0.13,
      i % 3 ? '#97846a' : '#b49a76',
    );
  }
  for (const side of [-1, 1]) {
    const a = deckStart.clone().add(new THREE.Vector3(0, 0, side * 0.77)),
      b = deckEnd.clone().add(new THREE.Vector3(0, 0, side * 0.77));
    beam(
      publicWorks,
      a.clone().addScaledVector(vertical, 1.02),
      b.clone().addScaledVector(vertical, 1.02),
      0.07,
      0.075,
      '#706b56',
    );
    for (let i = 0; i <= 8; i++) {
      const p = a.clone().lerp(b, i / 8);
      beam(
        publicWorks,
        p.clone().setY(terrain(p.x, p.z)),
        p.clone().addScaledVector(vertical, 1.06),
        0.1,
        0.1,
        '#6e6853',
      );
    }
  }
  const nearPath = bankPoint(nearBank.x + 2.8, nearBank.z - 1.5);
  const farPath = bankPoint(farBank.x - 2.8, farBank.z + 2);
  const benchPoint = bankPoint(farBank.x - 3.7, farBank.z + 5.2);
  for (const [a, b] of [
    [nearPath.clone().addScaledVector(vertical, 0.06), deckStart],
    [deckEnd, farPath.clone().addScaledVector(vertical, 0.06)],
    [
      farPath.clone().addScaledVector(vertical, 0.06),
      benchPoint.clone().addScaledVector(vertical, 0.06),
    ],
  ])
    beam(publicWorks, a, b, 1.5, 0.12, '#b6a888');
  publicWorks.push(
    part(benchPoint.clone().addScaledVector(vertical, 0.5), [1.75, 0.11, 0.5], '#b29367'),
  );
  publicWorks.push(
    part(benchPoint.clone().add(new THREE.Vector3(0, 0.91, 0.22)), [1.75, 0.39, 0.08], '#a58a60'),
  );
  for (const side of [-1, 1])
    publicWorks.push(
      part(
        benchPoint.clone().add(new THREE.Vector3(side * 0.65, 0.24, 0)),
        [0.12, 0.48, 0.42],
        '#676b59',
      ),
    );
  const landmarks = {
    footbridge: {
      nearBank: deckStart.toArray(),
      farBank: deckEnd.toArray(),
      width: 1.56,
      length: deckStart.distanceTo(deckEnd),
    },
    channel: {
      center: [waterProfile.centerX, waterProfile.waterY, waterProfile.centerZ],
      length: 70,
      width: middle.halfWidth * 2,
      waterY: waterProfile.waterY,
    },
    continuingPath: [deckEnd.toArray(), farPath.toArray(), benchPoint.toArray()],
    waitingBench: benchPoint.toArray(),
  };
  props.push({
    id: 'public-footbridge',
    kind: 'footbridge',
    position: deckStart.clone().lerp(deckEnd, 0.5).toArray(),
    clearance: clearance(nearBank),
  });
  props.push({
    id: 'waiting-bench',
    kind: 'bench',
    position: benchPoint.toArray(),
    clearance: clearance(benchPoint),
  });
  for (let i = 0; i < 5; i++) {
    const z = waterProfile.centerZ - 25 + i * 12,
      section = wetlandSection(z, waterProfile),
      side = i % 2 ? 1 : -1;
    const p = bankPoint(section.centerX + side * (section.halfWidth + 3.6), z);
    if (clearance(p) < 4) continue;
    reeds.push(part(p.clone().addScaledVector(vertical, 0.46), [0.15, 0.92, 0.15], '#6e6852'));
    for (let j = 0; j < 3; j++)
      shrubs.push(
        part(
          p
            .clone()
            .add(
              new THREE.Vector3((j - 1) * 0.65, 0.95 + random(i + j) * 0.35, Math.sin(j * 3) * 0.4),
            ),
          [0.8, 0.8 + random(j + i) * 0.3, 0.8],
          i % 2 ? '#657950' : '#81915b',
        ),
      );
    props.push({
      id: `bank-shrub-${i}`,
      kind: 'shrub',
      position: p.toArray(),
      clearance: clearance(p),
    });
  }
  const shrubGeometry = new THREE.IcosahedronGeometry(1, 1);
  geometries.add(shrubGeometry);
  batch('bank shrub crowns', shrubs, root, materials[0], true, shrubGeometry);
  for (const p of [nearPath, benchPoint.clone().add(new THREE.Vector3(-1.3, 0, -1.6))]) {
    markers.push(part(p.clone().addScaledVector(vertical, 0.55), [0.09, 1.1, 0.09], '#72624c'));
    markers.push(part(p.clone().addScaledVector(vertical, 0.97), [0.55, 0.25, 0.075], '#e0c998'));
  }
  batch('public footbridge path and waiting bench', publicWorks, root, materials[0], true);
  batch('reed stems and seed heads', reeds);
  batch('small wetland viewing markers', markers);
  const anchor = railPoint(2250),
    tangent = railPoint(2251).sub(railPoint(2249)).normalize();
  const normal = new THREE.Vector3(tangent.z, 0, -tangent.x).normalize();
  const boardPosition = anchor.clone().addScaledVector(normal, 4.4);
  const bed = terrain(boardPosition.x, boardPosition.z);
  boardPosition.y = Number.isFinite(bed) ? bed : anchor.y - 0.5;
  const yaw = new THREE.Quaternion().setFromAxisAngle(vertical, Math.atan2(tangent.x, tangent.z));
  batch(
    'route indicator post and board',
    [
      part(boardPosition.clone().addScaledVector(vertical, 1.55), [0.13, 3.1, 0.13], '#626858'),
      part(boardPosition.clone().addScaledVector(vertical, 2.42), [1.8, 0.8, 0.13], '#244941', yaw),
      part(boardPosition.clone().addScaledVector(vertical, 3.1), [0.32, 0.4, 0.17], '#34483e', yaw),
    ],
    approach,
  );
  const lampPosition = boardPosition
    .clone()
    .addScaledVector(vertical, 3.1)
    .addScaledVector(tangent, -0.105);
  batch(
    'route selection lamp',
    [part(lampPosition, [0.13, 0.15, 0.025], '#ffffff', yaw)],
    approach,
    materials[4],
  );
  if (globalThis.document?.createElement) {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 192;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.fillStyle = '#244941';
      ctx.fillRect(0, 0, 512, 192);
      ctx.fillStyle = '#f0e3bc';
      ctx.textAlign = 'center';
      ctx.font = 'bold 35px sans-serif';
      ctx.fillText('WETLAND BRANCH', 256, 67);
      ctx.font = '25px sans-serif';
      ctx.fillText('← Marsh view   ·   Main line ↑', 256, 120);
      ctx.font = '19px sans-serif';
      ctx.fillText('SELECT ROUTE WHILE STOPPED', 256, 160);
      const texture = new THREE.CanvasTexture(canvas);
      texture.colorSpace = THREE.SRGBColorSpace;
      textures.add(texture);
      const material = new THREE.MeshBasicMaterial({ map: texture });
      materials.push(material);
      const geo = new THREE.PlaneGeometry(1.73, 0.72);
      geometries.add(geo);
      const face = new THREE.Mesh(geo, material);
      face.name = 'wetland / approach route board lettering';
      face.position
        .copy(boardPosition)
        .addScaledVector(vertical, 2.42)
        .addScaledVector(tangent, -0.076);
      face.quaternion
        .copy(yaw)
        .multiply(new THREE.Quaternion().setFromAxisAngle(vertical, Math.PI));
      approach.add(face);
      meshes.push(face);
    }
  }
  let selectedRoute = 'direct',
    disposed = false;
  function update({ selectedRoute: selection, position } = {}) {
    if (disposed) return;
    if (selection === 'main') selection = 'direct';
    if (selection === 'direct' || selection === 'wetland') {
      if (selection !== selectedRoute) {
        selectedRoute = selection;
        materials[4].color.set(selection === 'wetland' ? '#e7b56b' : '#e3d9b2');
      }
    }
    const z = Array.isArray(position) ? position[2] : position?.z;
    if (Number.isFinite(z)) {
      root.visible = z >= lowZ - 700 && z <= highZ + 700;
      approach.visible = Math.abs(z - 2250) < 700;
    }
  }
  function getState() {
    return {
      id: 'wetland',
      generation: 2,
      selectedRoute,
      visible: root.visible && !disposed,
      startZ,
      endZ,
      length,
      contactHeight: 7.35,
      waterProfile: { ...waterProfile },
      landmarks: landmarks ? structuredClone(landmarks) : null,
      drawCalls: meshes.length,
      sleeperCount: sleepers.length,
      deckWidth: 3.05,
      supportCount: piers.length,
      props: props.map((p) => ({ ...p, position: [...p.position] })),
      supports: supportRecords.map((p) => ({ ...p })),
      sleepers: sleeperRecords.map((p) => ({ ...p, position: [...p.position] })),
      approach: {
        z: 2250,
        position: boardPosition.toArray(),
        indicator: selectedRoute === 'wetland' ? 'amber' : 'ivory',
        indicatesClearance: false,
      },
    };
  }
  function dispose() {
    if (disposed) return;
    disposed = true;
    root.removeFromParent();
    approach.removeFromParent();
    for (const mesh of meshes) if (mesh.isInstancedMesh) mesh.dispose();
    for (const geometry of geometries) geometry.dispose();
    for (const material of materials) material.dispose();
    for (const texture of textures) texture.dispose();
  }
  return { update, getState, dispose };
}
