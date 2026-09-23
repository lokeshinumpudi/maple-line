/** Clustered ground flora. Geometry is instanced in 100 m route chunks. */
export function addFloraDetail({
  THREE,
  scene,
  center,
  terrain,
  riverProfile,
  worldClearings = [],
}) {
  const group = new THREE.Group();
  group.name = 'Flora · grass, ferns, moss and fallen timber';
  scene.add(group);
  let seed = 12937;
  const random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  const between = (a, b) => a + (b - a) * random();
  const uniforms = { time: { value: 0 }, wind: { value: 1 }, frost: { value: 0 } };
  const materials = [],
    geometries = [],
    chunks = [];
  const tint = new THREE.Color(),
    dummy = new THREE.Object3D();
  function material(color, wind = false, roughness = 0.94) {
    const m = new THREE.MeshStandardMaterial({ color, roughness, side: THREE.DoubleSide });
    m.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, uniforms);
      shader.vertexShader = shader.vertexShader
        .replace(
          '#include <common>',
          '#include <common>\nuniform float time;uniform float wind;varying float plantHeight;',
        )
        .replace(
          '#include <begin_vertex>',
          `#include <begin_vertex>\nplantHeight=position.y;${wind ? `float phase=instanceMatrix[3].x*.41+instanceMatrix[3].z*.27; transformed.x+=sin(time*1.9+phase)*pow(max(position.y,0.),1.6)*.10*wind;transformed.z+=cos(time*1.4+phase)*max(position.y,0.)*.055*wind;` : ''}`,
        );
      shader.fragmentShader = shader.fragmentShader
        .replace(
          '#include <common>',
          '#include <common>\nuniform float frost;varying float plantHeight;',
        )
        .replace(
          '#include <color_fragment>',
          '#include <color_fragment>\ndiffuseColor.rgb=mix(diffuseColor.rgb,vec3(.76,.83,.86),frost*smoothstep(.03,.35,plantHeight)*.88);',
        );
    };
    m.customProgramCacheKey = () => `flora-${wind ? 'wind' : 'still'}`;
    materials.push(m);
    return m;
  }
  const grassMat = material('#ffffff', true),
    fernMat = material('#ffffff', true),
    stoneMat = material('#b0b6a4', false, 0.95),
    mossMat = material('#789254'),
    barkMat = material('#68533d'),
    cutMat = material('#b6a077');
  function geometry(vertices) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    g.computeVertexNormals();
    geometries.push(g);
    return g;
  }
  const blades = [];
  for (let k = 0; k < 6; k++) {
    const angle = k * 2.399,
      dx = Math.cos(angle),
      dz = Math.sin(angle),
      h = 0.55 + (k % 3) * 0.19,
      w = 0.037;
    const left = [dx * 0.07 - dz * w, 0, dz * 0.07 + dx * w],
      right = [dx * 0.07 + dz * w, 0, dz * 0.07 - dx * w],
      ml = [dx * 0.16 - dz * w * 0.7, h * 0.52, dz * 0.16 + dx * w * 0.7],
      mr = [dx * 0.16 + dz * w * 0.7, h * 0.52, dz * 0.16 - dx * w * 0.7],
      tip = [dx * 0.34, h, dz * 0.34];
    blades.push(...left, ...right, ...ml, ...right, ...mr, ...ml, ...ml, ...mr, ...tip);
  }
  const grassGeo = geometry(blades),
    fronds = [];
  for (let arm = 0; arm < 7; arm++) {
    const angle = (arm * Math.PI * 2) / 7,
      dx = Math.cos(angle),
      dz = Math.sin(angle),
      len = 0.7 + (arm % 3) * 0.17;
    for (let j = 1; j <= 7; j++) {
      const t = j / 8,
        r = t * len,
        y = Math.sin(t * Math.PI * 0.8) * 0.48,
        w = (1 - t) * 0.24;
      for (const side of [-1, 1]) {
        const x = dx * r,
          z = dz * r;
        fronds.push(
          x,
          y,
          z,
          x + dx * 0.11 - dz * w * side,
          y + 0.025,
          z + dz * 0.11 + dx * w * side,
          x + dx * 0.18,
          y - 0.035,
          z + dz * 0.18,
        );
      }
    }
  }
  const fernGeo = geometry(fronds),
    rockGeo = new THREE.IcosahedronGeometry(1, 1),
    mossGeo = new THREE.IcosahedronGeometry(1, 0),
    logGeo = new THREE.CylinderGeometry(0.27, 0.38, 1, 9),
    endGeo = new THREE.CylinderGeometry(0.271, 0.271, 0.015, 9);
  geometries.push(rockGeo, mossGeo, logGeo, endGeo);
  const safe = (u, z) => {
    const r = riverProfile(z);
    return (
      z > -830 &&
      z < 830 &&
      (u < 20 || u > 39) &&
      Math.abs(u - r.offset) > r.halfWidth + 2.6 &&
      !worldClearings.some((c) => z >= c.minZ && z <= c.maxZ && u >= c.minU && u <= c.maxU) &&
      terrain(u, z) > 0.25
    );
  };
  const counts = { grass: 0, ferns: 0, rocks: 0, moss: 0, logs: 0 };
  function batch(parent, geo, mat, items, name, shadow = false) {
    if (!items.length) return;
    const m = new THREE.InstancedMesh(geo, mat, items.length);
    m.name = name;
    m.castShadow = shadow;
    m.receiveShadow = true;
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      dummy.position.set(item.x, item.y, item.z);
      dummy.rotation.set(item.rx || 0, item.ry || 0, item.rz || 0);
      dummy.scale.set(item.sx, item.sy, item.sz);
      dummy.updateMatrix();
      m.setMatrixAt(i, dummy.matrix);
      if (item.color) m.setColorAt(i, tint.set(item.color));
    }
    m.computeBoundingSphere();
    parent.add(m);
  }
  const greens = ['#6d7a40', '#86934f', '#a0a764', '#5a6c3c', '#b8ab6c'];
  for (let start = -850; start < 850; start += 100) {
    const chunk = new THREE.Group();
    chunk.name = `Forest floor ${start}–${start + 100}m`;
    chunk.userData.centerZ = start + 50;
    group.add(chunk);
    chunks.push(chunk);
    const grass = [],
      ferns = [],
      rocks = [],
      moss = [],
      logs = [],
      ends = [];
    for (let c = 0; c < 24; c++) {
      const z = between(start, start + 100),
        u = random() < 0.64 ? between(-72, 18) : between(40, 77);
      if (!safe(u, z)) continue;
      const clusterRadius = between(1.8, 4.8);
      for (let k = 0; k < between(9, 19); k++) {
        const a = random() * Math.PI * 2,
          r = Math.sqrt(random()) * clusterRadius,
          uz = u + Math.cos(a) * r,
          zz = z + Math.sin(a) * r;
        if (!safe(uz, zz)) continue;
        const scale = between(0.7, 1.55),
          item = {
            x: center(zz) + uz,
            y: terrain(uz, zz) + 0.015,
            z: zz,
            sx: scale,
            sy: scale * between(0.7, 1.3),
            sz: scale,
            ry: random() * 6.28,
            color: greens[Math.floor(random() * greens.length)],
          };
        if (k % 6 === 0) {
          ferns.push({ ...item, sx: scale * 0.9, sz: scale * 0.9, color: '#547144' });
        } else grass.push(item);
      }
      if (c % 2 === 0) {
        const s = between(0.45, 1.6),
          y = terrain(u, z),
          x = center(z) + u;
        rocks.push({
          x,
          y: y + s * 0.3,
          z,
          sx: s,
          sy: s * 0.66,
          sz: s * 0.85,
          ry: random() * 6.28,
        });
        moss.push({
          x: x - 0.07,
          y: y + s * 0.79,
          z: z + 0.04,
          sx: s * 0.87,
          sy: s * 0.13,
          sz: s * 0.7,
          ry: random() * 6.28,
        });
      }
      if (c % 7 === 0) {
        const length = between(2, 4.5),
          rotation = between(-0.65, 0.65),
          x = center(z) + u,
          y = terrain(u, z) + 0.32;
        logs.push({ x, y, z, sx: 1, sy: length, sz: 1, rx: Math.PI / 2, rz: -rotation });
        ends.push({
          x: x + Math.sin(rotation) * length * 0.5,
          y,
          z: z + Math.cos(rotation) * length * 0.5,
          sx: 1,
          sy: 1,
          sz: 1,
          rx: Math.PI / 2,
          rz: -rotation,
        });
      }
    }
    batch(chunk, grassGeo, grassMat, grass, 'Wind grass');
    batch(chunk, fernGeo, fernMat, ferns, 'Forest ferns');
    batch(chunk, rockGeo, stoneMat, rocks, 'Moss boulders', true);
    batch(chunk, mossGeo, mossMat, moss, 'Moss caps');
    batch(chunk, logGeo, barkMat, logs, 'Fallen trunks', true);
    batch(chunk, endGeo, cutMat, ends, 'Timber cross sections');
    counts.grass += grass.length;
    counts.ferns += ferns.length;
    counts.rocks += rocks.length;
    counts.moss += moss.length;
    counts.logs += logs.length;
  }
  group.userData.instanceCounts = counts;
  group.userData.maxVisibleMainDrawCalls = 42;
  function update(dt, { position, weather = 'clear' } = {}) {
    const blend = 1 - Math.exp(-Math.max(dt, 0) * 2);
    uniforms.time.value += Math.min(dt, 0.1);
    uniforms.wind.value = THREE.MathUtils.lerp(
      uniforms.wind.value,
      weather === 'rain' ? 2.3 : 0.75,
      blend,
    );
    uniforms.frost.value = THREE.MathUtils.lerp(
      uniforms.frost.value,
      weather === 'snow' ? 1 : 0,
      blend,
    );
    stoneMat.roughness = THREE.MathUtils.lerp(
      stoneMat.roughness,
      weather === 'rain' ? 0.28 : 0.95,
      blend,
    );
    barkMat.roughness = THREE.MathUtils.lerp(
      barkMat.roughness,
      weather === 'rain' ? 0.58 : 0.94,
      blend,
    );
    if (position)
      for (const chunk of chunks)
        chunk.visible = Math.abs(position.z - chunk.userData.centerZ) < 310;
  }
  return {
    update,
    counts,
    dispose() {
      scene.remove(group);
      for (const g of geometries) g.dispose();
      for (const m of materials) m.dispose();
    },
  };
}
