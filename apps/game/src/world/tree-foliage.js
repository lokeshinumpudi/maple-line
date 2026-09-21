/** Crossed clusters with individual leaf silhouettes, shared by every broadleaf tree. */
export function createLeafClusterGeometry(THREE) {
  const positions = [],
    normals = [],
    uvs = [];
  const corners = [
    [-1, -1],
    [1, -1],
    [1, 1],
    [-1, 1],
  ];
  for (let plane = 0; plane < 4; plane++) {
    const angle = (plane * Math.PI) / 3;
    for (const i of [0, 1, 2, 0, 2, 3]) {
      const [x, y] = corners[i];
      const point = plane === 3 ? [x, y * 0.25, y] : [x * Math.cos(angle), y, x * Math.sin(angle)];
      positions.push(...point);
      const n = new THREE.Vector3(point[0], point[1] + 0.65, point[2]).normalize();
      normals.push(n.x, n.y, n.z);
      uvs.push((x + 1) / 2, (y + 1) / 2);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.computeBoundingSphere();
  return geometry;
}

export function createLeafClusterTexture(THREE) {
  const size = 128,
    data = new Uint8Array(size * size * 4);
  // Color bleed into empty texels prevents dark fringes during bilinear/mipmap filtering.
  for (let i = 0; i < data.length; i += 4) data[i] = data[i + 1] = data[i + 2] = 225;
  let seed = 9231;
  const random = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  for (let leaf = 0; leaf < 105; leaf++) {
    const a = random() * Math.PI * 2,
      r = Math.sqrt(random()) * 46;
    const cx = 64 + Math.cos(a) * r,
      cy = 64 + Math.sin(a) * r;
    const angle = random() * Math.PI,
      cs = Math.cos(angle),
      sn = Math.sin(angle);
    const length = 5 + random() * 7,
      width = 2.5 + random() * 3,
      tint = 175 + Math.floor(random() * 80);
    for (
      let y = Math.max(0, Math.floor(cy - length));
      y < Math.min(size, Math.ceil(cy + length));
      y++
    ) {
      for (
        let x = Math.max(0, Math.floor(cx - length));
        x < Math.min(size, Math.ceil(cx + length));
        x++
      ) {
        const dx = x - cx,
          dy = y - cy,
          u = dx * cs + dy * sn,
          v = -dx * sn + dy * cs;
        const shape = (u / length) ** 2 + (v / width) ** 2;
        if (shape > 1) continue;
        const i = (y * size + x) * 4,
          vein = Math.abs(v) < 0.45 ? 12 : 0;
        data[i] = data[i + 1] = data[i + 2] = Math.min(255, tint + vein);
        data[i + 3] = Math.max(data[i + 3], Math.round(255 * Math.min(1, (1 - shape) * width)));
      }
    }
  }
  const texture = new THREE.DataTexture(data, size, size);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.needsUpdate = true;
  return texture;
}
