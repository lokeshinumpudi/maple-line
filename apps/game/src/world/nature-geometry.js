import * as THREE from 'three';

/** Irregular branch-tier silhouette; shared by instanced cedar crowns. */
export function createCedarGeometry() {
  const segments = 10,
    rings = 6,
    vertices = [],
    indices = [];
  for (let ring = 0; ring <= rings; ring++) {
    const t = ring / rings;
    for (let s = 0; s < segments; s++) {
      const a = (s / segments) * Math.PI * 2;
      const lobes = 1 + Math.sin(a * 5 + ring * 0.7) * 0.12 + Math.sin(a * 3 - ring) * 0.09;
      const radius = (1 - t) * lobes * (ring % 2 ? 0.76 : 1);
      vertices.push(
        Math.cos(a) * radius,
        t - 0.5 + (t === 1 ? 0 : Math.sin(a * 4) * 0.022),
        Math.sin(a) * radius,
      );
    }
  }
  for (let r = 0; r < rings; r++)
    for (let s = 0; s < segments; s++) {
      const a = r * segments + s,
        b = r * segments + ((s + 1) % segments),
        c = a + segments,
        d = b + segments;
      indices.push(a, c, b, b, c, d);
    }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  g.setIndex(indices);
  g.computeVertexNormals();
  g.name = 'Cedar / layered branch silhouette';
  return g;
}

export function createWeatheredRockGeometry() {
  const g = new THREE.IcosahedronGeometry(1, 2),
    p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i),
      y = p.getY(i),
      z = p.getZ(i);
    const r = 1 + Math.sin(x * 7 + z * 3) * 0.1 + Math.sin(y * 9 - x * 4) * 0.06;
    p.setXYZ(i, x * r, y * r * 0.82, z * r);
  }
  g.computeVertexNormals();
  g.name = 'Stone / weathered irregular boulder';
  return g;
}
