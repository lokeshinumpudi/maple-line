import * as THREE from 'three';
export function addRailwayBridge({ scene, railPoint, terrain, center }) {
  const group = new THREE.Group();
  group.name = 'Kawasemi railway river bridge';
  scene.add(group);
  const geometry = new THREE.BoxGeometry(1, 1, 1),
    palette = {
      steel: new THREE.MeshStandardMaterial({ color: '#4b625a', roughness: 0.65, metalness: 0.45 }),
      edge: new THREE.MeshStandardMaterial({ color: '#8d4737', roughness: 0.7, metalness: 0.35 }),
      pier: new THREE.MeshStandardMaterial({ color: '#a8a78f', roughness: 0.95 }),
    };
  const batches = new Map(),
    dummy = new THREE.Object3D();
  function beam(a, b, width, height, material) {
    const delta = b.clone().sub(a);
    dummy.position.copy(a).add(b).multiplyScalar(0.5);
    dummy.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), delta.clone().normalize());
    dummy.scale.set(width, height, delta.length() + 0.08);
    dummy.updateMatrix();
    if (!batches.has(material)) batches.set(material, []);
    batches.get(material).push(dummy.matrix.clone());
  }
  for (let z = 145; z < 415; z += 9) {
    const a = railPoint(z),
      b = railPoint(Math.min(z + 9, 415)),
      tangent = b.clone().sub(a).normalize(),
      side = new THREE.Vector3(tangent.z, 0, -tangent.x);
    beam(
      a.clone().add(new THREE.Vector3(0, -0.5, 0)),
      b.clone().add(new THREE.Vector3(0, -0.5, 0)),
      4.7,
      0.35,
      palette.steel,
    );
    for (const sign of [-1, 1]) {
      const lowA = a.clone().addScaledVector(side, sign * 2.05),
        lowB = b.clone().addScaledVector(side, sign * 2.05);
      lowA.y -= 1.2;
      lowB.y -= 1.2;
      const highA = lowA.clone().add(new THREE.Vector3(0, 2.4, 0)),
        highB = lowB.clone().add(new THREE.Vector3(0, 2.4, 0));
      beam(lowA, lowB, 0.22, 0.25, palette.edge);
      beam(highA, highB, 0.15, 0.17, palette.edge);
      beam(lowA, highA, 0.16, 0.16, palette.edge);
      beam(lowA, highB, 0.13, 0.15, palette.edge);
      beam(highA, lowB, 0.13, 0.15, palette.edge);
    }
    if ((z - 145) % 27 === 0) {
      const p = railPoint(z),
        bed = terrain(p.x - center(p.z), p.z);
      beam(
        new THREE.Vector3(p.x, bed - 0.7, p.z),
        new THREE.Vector3(p.x, p.y - 1.4, p.z),
        1.5,
        2.8,
        palette.pier,
      );
    }
  }
  for (const [material, matrices] of batches) {
    const mesh = new THREE.InstancedMesh(geometry, material, matrices.length);
    matrices.forEach((m, i) => mesh.setMatrixAt(i, m));
    mesh.name =
      material === palette.pier
        ? 'Bridge concrete piers'
        : material === palette.edge
          ? 'Bridge steel trusses'
          : 'Bridge deck beams';
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
  }
  return { root: group };
}
