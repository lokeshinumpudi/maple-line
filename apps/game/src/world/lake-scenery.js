import { applyWaterSurface } from '../rendering/water-surface.js';
/** The shoreline field is shared by terrain, water and bank dressing. */
export const regionalLakes = Object.freeze([
  {
    id: 'aonuma',
    name: 'Aonuma / cedar falls',
    z: 4700,
    u: -82,
    rx: 72,
    rz: 175,
    drop: 9,
    phase: 0.3,
    alpine: false,
  },
  {
    id: 'hoshimi',
    name: 'Hoshimi / twin falls',
    z: 14400,
    u: -94,
    rx: 86,
    rz: 155,
    drop: 13,
    phase: 1.7,
    alpine: true,
  },
  {
    id: 'minato',
    name: 'Minato / tidal inlet',
    z: 21200,
    u: -150,
    rx: 128,
    rz: 320,
    drop: 17,
    phase: 3.1,
    coast: true,
  },
]);
export function shorelineRadius(lake, angle) {
  return 1 + 0.1 * Math.sin(angle * 3 + lake.phase) + 0.055 * Math.cos(angle * 5 - lake.phase);
}
export function lakeRadius(lake, x, z, center) {
  const dx = (x - center(lake.z) - lake.u) / lake.rx,
    dz = (z - lake.z) / lake.rz;
  return Math.hypot(dx, dz) / shorelineRadius(lake, Math.atan2(dz, dx));
}
export function lakeVista(z, center, elevation) {
  const lake = regionalLakes.reduce((a, b) => (Math.abs(a.z - z) < Math.abs(b.z - z) ? a : b));
  if (Math.abs(lake.z - z) > 600) return null;
  const x = center(lake.z) + lake.u,
    y = elevation(lake.z) - lake.drop;
  return { eye: [x + 180, y + 112, lake.z - 190], target: [x - 12, y + 12, lake.z] };
}

/** Dry shoreline access is derived from the same water mask as the terrain. */
export function lakeShorePlan(lake, center, elevation, terrain) {
  const waterY = elevation(lake.z) - lake.drop;
  const point = (angle, radius) => {
    const r = shorelineRadius(lake, angle) * radius;
    const x = center(lake.z) + lake.u + Math.cos(angle) * lake.rx * r;
    const z = lake.z + Math.sin(angle) * lake.rz * r;
    return { x, y: terrain(x, z), z };
  };
  const safe = (p, margin = 0) =>
    p.y > waterY + 0.35 &&
    p.x + margin < center(p.z) + 18 &&
    lakeRadius(lake, p.x, p.z, center) > 1.075;
  const trail = [];
  for (let i = 0; i <= 32; i++) {
    const angle = -1.4 + (i / 32) * 0.8;
    for (let r = 1.16; r <= 1.65; r += 0.035) {
      const p = point(angle, r);
      if (safe(p, 1.2)) {
        trail.push({ ...p, y: p.y + 0.1, angle, radius: r });
        break;
      }
    }
  }
  let house = null;
  for (const angle of [-1.05, -1.15, -0.95]) {
    for (const radius of [1.3, 1.4, 1.5, 1.6]) {
      const p = point(angle, radius);
      const corners = [-3.5, 3.5].flatMap((dx) =>
        [-4.5, 4.5].map((dz) => ({ x: p.x + dx, z: p.z + dz, y: terrain(p.x + dx, p.z + dz) })),
      );
      if (corners.every((c) => safe(c, 1))) {
        house = { ...p, y: Math.max(...corners.map((c) => c.y)) + 0.2, angle, radius };
        break;
      }
    }
    if (house) break;
  }
  const jetty = house ? point(house.angle, 0.86) : null;
  if (jetty) jetty.y = waterY + 1.05;
  const boats = house
    ? [-0.045, 0.045].map((offset) => ({
        ...point(house.angle + offset, 0.8),
        y: waterY + 0.24,
        yaw: Math.PI / 2 - house.angle,
      }))
    : [];
  const reeds = [];
  for (let i = 0; i < 24; i++) {
    const p = point(-1.5 + (i % 8) * 0.055, 1.015 + Math.floor(i / 8) * 0.025);
    if (p.x < center(p.z) + 18) reeds.push({ ...p, y: Math.max(p.y, waterY - 0.18) });
  }
  const grove = [];
  for (let i = 0; i < 14; i++) {
    const p = point(-1.5 + i * 0.064, 1.5 + (i % 3) * 0.055);
    if (safe(p, 3) && (!house || Math.hypot(p.x - house.x, p.z - house.z) > 11)) grove.push(p);
  }
  return { waterY, trail, house, jetty, boats, reeds, grove };
}

/** Owned by the existing route chunk: no extra streamer, reflection pass or external assets. */
export function createLakeScenery({
  THREE,
  lake,
  group,
  center,
  elevation,
  terrain,
  item,
  box,
  crownGeo,
  m,
  ownedGeometries,
  ownedMaterials,
}) {
  const x = center(lake.z) + lake.u,
    y = elevation(lake.z) - lake.drop;
  const clock = { value: 0 };
  const keepGeo = (g) => (ownedGeometries.push(g), g);
  const mat = (name, color, extra = {}) => {
    const material = new THREE.MeshStandardMaterial({ color, roughness: 0.85, ...extra });
    material.name = `${lake.name} / ${name}`;
    ownedMaterials.push(material);
    return material;
  };
  const waterMat = mat(
    'rippling water',
    lake.alpine ? '#4e929b' : lake.coast ? '#527d86' : '#4f8b7c',
    { roughness: 0.27, metalness: 0.28, vertexColors: true },
  );
  waterMat.onBeforeCompile = (shader) => {
    shader.uniforms.lakeTime = clock;
    shader.vertexShader =
      'uniform float lakeTime; varying vec3 vLakePosition;\n' + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace(
      '#include <begin_vertex>',
      '#include <begin_vertex>\nvLakePosition = position;',
    );
    shader.fragmentShader =
      'uniform float lakeTime; varying vec3 vLakePosition;\n' + shader.fragmentShader;
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <normal_fragment_begin>',
      `#include <normal_fragment_begin>
      float ripple = sin(vLakePosition.x * 0.8 + vLakePosition.z * 0.47 + lakeTime * 1.5);
      normal = normalize(normal + vec3(ripple * 0.1, cos(vLakePosition.z * 0.9 - lakeTime) * 0.045, 0.0));`,
    );
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <color_fragment>',
      `#include <color_fragment>
      float shine = pow(0.5 + 0.5 * sin(vLakePosition.x * 0.37 + vLakePosition.z * 1.7 + lakeTime * 1.8), 18.0);
      diffuseColor.rgb *= 0.96 + 0.08 * shine;`,
    );
  };
  waterMat.customProgramCacheKey = () => 'regional-lake-ripples-v1';
  applyWaterSurface(THREE, waterMat, { scale: 0.8 });
  const cedarMat = mat('waterside cedars', lake.alpine ? '#5d7770' : '#526e50');
  const cedarGeo = keepGeo(new THREE.ConeGeometry(1, 1, 8));
  const shoreMat = mat('gravel shoreline', lake.alpine ? '#a8b6ae' : '#b1ac81', {
    vertexColors: true,
  });
  const makeSurface = (radii, heights, material, name) => {
    const positions = [],
      colors = [],
      indices = [],
      n = 128;
    for (let r = 0; r < radii.length; r++)
      for (let i = 0; i <= n; i++) {
        const angle = (i / n) * Math.PI * 2,
          radius = shorelineRadius(lake, angle) * radii[r];
        const xx = Math.cos(angle) * lake.rx * radius,
          zz = Math.sin(angle) * lake.rz * radius;
        const yy =
          heights[r] === null
            ? Math.max(y + 0.3, terrain(x + xx, lake.z + zz) + 0.08) - y
            : heights[r];
        positions.push(xx, yy, zz);
        const tint = r === radii.length - 1 ? 1.15 : 0.84 + r * 0.06;
        colors.push(tint, tint, tint);
        if (r && i) {
          const a = r * (n + 1) + i,
            b = a - n - 1;
          indices.push(a, a - 1, b, b, a - 1, b - 1);
        }
      }
    const geo = keepGeo(new THREE.BufferGeometry());
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geo.setIndex(indices);
    geo.computeVertexNormals();
    const mesh = new THREE.Mesh(geo, material);
    mesh.name = `${lake.name} / ${name}`;
    mesh.position.set(x, y, lake.z);
    mesh.receiveShadow = true;
    group.add(mesh);
    return mesh;
  };
  makeSurface([0, 0.45, 0.82, 1.04], [0, 0, 0, 0], waterMat, 'open water');
  makeSurface([0.97, 1.04, 1.14], [0.015, 0.24, null], shoreMat, 'scalloped beach and coves');
  // Stable angular samples keep the same rocks and reeds after a chunk reload.
  for (let i = 0; i < 72; i++) {
    const angle = i * 2.399963,
      radius = shorelineRadius(lake, angle) * (1.05 + (i % 4) * 0.025);
    const xx = x + Math.cos(angle) * lake.rx * radius,
      zz = lake.z + Math.sin(angle) * lake.rz * radius;
    const yy = Math.max(y + 0.2, terrain(xx, zz));
    const size = (lake.alpine ? 2.4 : 1.1) + (i % 5) * 0.55;
    item(crownGeo, m.stone, xx, yy + size * 0.24, zz, size * 1.5, size * 0.65, size, angle);
    if (!lake.alpine && !lake.coast && i % 2 === 0)
      for (let reed = 0; reed < 5; reed++) {
        const h = 1.0 + reed * 0.18;
        box(
          m.rice,
          xx + reed * 0.3,
          yy + h / 2,
          zz + Math.sin(reed) * 0.5,
          0.09,
          h,
          0.08,
          0,
          false,
        );
      }
  }
  // Low islands break up the open water, with alpine rocks or a cedar grove.
  for (const [dx, dz, size] of [
    [10, 44, 12],
    [-14, -65, lake.alpine ? 14 : 8],
  ]) {
    item(crownGeo, m.stone, x + dx, y - 0.4, lake.z + dz, size, 3.8, size * 1.4, 0.6);
    item(crownGeo, m.stone, x + dx - 2, y + 1.2, lake.z + dz, size * 0.55, 3.4, size * 0.65, 1);
    if (lake.alpine)
      item(crownGeo, m.snow, x + dx - 2, y + 3, lake.z + dz, size * 0.45, 1.25, size * 0.55);
    else if (!lake.coast)
      for (let i = 0; i < 3; i++) {
        box(m.trunk, x + dx + i * 2 - 2, y + 4, lake.z + dz, 0.45, 5, 0.45);
        item(cedarGeo, cedarMat, x + dx + i * 2 - 2, y + 6.5 + i, lake.z + dz, 2.3, 7, 2.3, i);
      }
  }
  const shore = lakeShorePlan(lake, center, elevation, terrain);
  const boardwalk = (a, b, width, material = m.timber) => {
    const distance = Math.hypot(b.x - a.x, b.z - a.z);
    const count = Math.max(1, Math.ceil(distance / 0.85));
    const yaw = Math.atan2(b.x - a.x, b.z - a.z);
    for (let i = 0; i < count; i++) {
      const t = (i + 0.5) / count,
        xx = a.x + (b.x - a.x) * t,
        zz = a.z + (b.z - a.z) * t;
      const ground = terrain(xx, zz);
      const top = Math.max(ground + 0.12, a.y + (b.y - a.y) * t);
      box(material, xx, top, zz, width, 0.18, distance / count + 0.04, yaw, false);
      if (material === m.timber && i % 5 === 0)
        box(
          m.timber,
          xx,
          (top + ground) / 2 - 0.2,
          zz,
          0.22,
          Math.max(0.4, top - ground + 0.4),
          0.22,
        );
    }
  };
  for (let i = 1; i < shore.trail.length; i++) {
    const a = shore.trail[i - 1],
      b = shore.trail[i];
    if (Math.hypot(a.x - b.x, a.z - b.z) < 12) boardwalk(a, b, 2, m.stone);
  }
  if (shore.house) {
    const h = shore.house;
    box(m.timber, h.x, h.y, h.z, 7, 0.3, 9);
    for (const dx of [-3, 3])
      for (const dz of [-4, 4]) {
        const ground = terrain(h.x + dx, h.z + dz);
        box(m.stone, h.x + dx, (ground + h.y) / 2, h.z + dz, 0.7, Math.max(0.3, h.y - ground), 0.7);
      }
    box(m.cream, h.x, h.y + 1.7, h.z, 6.4, 3.2, 8.4);
    box(m.roof, h.x, h.y + 3.45, h.z, 7.5, 0.4, 9.4);
    if (lake.alpine) {
      box(m.snow, h.x, h.y + 3.7, h.z, 7.3, 0.15, 9.2);
      // A sheltered rack keeps mountain visitors' long walking poles off the path.
      box(m.timber, h.x + 3.75, h.y + 0.65, h.z + 3, 0.25, 0.15, 2);
      for (let i = 0; i < 4; i++)
        box(m.timber, h.x + 3.75, h.y + 1.1, h.z + 2.4 + i * 0.4, 0.07, 1.9, 0.07);
    } else if (lake.coast) {
      // The inlet landing handles baskets from fishing boats instead of rental equipment.
      for (let i = 0; i < 5; i++)
        box(
          m.timber,
          h.x + 4.1 + (i % 2) * 0.7,
          h.y + 0.35 + Math.floor(i / 2) * 0.55,
          h.z + 2.8,
          0.62,
          0.5,
          0.8,
        );
      for (const dz of [-3, 3]) box(m.timber, h.x + 4.5, h.y + 1.9, h.z + dz, 0.16, 3.7, 0.16);
      box(m.timber, h.x + 4.5, h.y + 3.7, h.z, 0.16, 0.16, 6.2);
      for (let i = 0; i < 8; i++)
        box(m.timber, h.x + 4.5, h.y + 2.7, h.z - 2.5 + i * 0.7, 0.025, 1.6, 0.025, 0, false);
    }

    for (const dz of [-2.6, 2.6]) box(m.glass, h.x + 3.23, h.y + 2, h.z + dz, 0.08, 1.25, 1.8);
    box(m.timber, h.x + 3.24, h.y + 1.25, h.z, 0.1, 2.25, 1.3);
    const doorway = { x: h.x + 4.2, y: h.y + 0.16, z: h.z };
    const trailPoint = shore.trail.reduce(
      (best, p) =>
        !best ||
        Math.hypot(p.x - doorway.x, p.z - doorway.z) <
          Math.hypot(best.x - doorway.x, best.z - doorway.z)
          ? p
          : best,
      null,
    );
    if (trailPoint) boardwalk(doorway, trailPoint, 1.8);
    const aroundCorner = { x: doorway.x, y: h.y + 0.16, z: h.z - 5.5 };
    const watersideCorner = { x: h.x - 4.2, y: h.y + 0.16, z: h.z - 5.5 };
    boardwalk(doorway, aroundCorner, 1.8);
    boardwalk(aroundCorner, watersideCorner, 1.8);
    boardwalk(watersideCorner, shore.jetty, 1.8);
    box(m.timber, shore.jetty.x, shore.jetty.y, shore.jetty.z, 5, 0.22, 5);
    // Moored boats remain within the lake mask; raised gunwales and open seats read at rail distance.
    for (const boat of shore.boats) {
      const c = Math.cos(boat.yaw),
        s = Math.sin(boat.yaw);
      const boatBox = (dx, dy, dz, w, hh, d) =>
        box(
          m.timber,
          boat.x + c * dx + s * dz,
          boat.y + dy,
          boat.z - s * dx + c * dz,
          w,
          hh,
          d,
          boat.yaw,
          false,
        );
      boatBox(0, 0, 0, 1.65, 0.16, 4.5);
      for (const side of [-1, 1]) boatBox(side * 0.84, 0.25, 0, 0.16, 0.55, 4.4);
      for (const end of [-1, 1]) boatBox(0, 0.24, end * 2.12, 1.6, 0.5, 0.16);
      for (const seat of [-1, 0.65]) boatBox(0, 0.36, seat, 1.7, 0.14, 0.45);
      // Rope ends at a mooring post, never at an unrelated point on shore.
      const dx = shore.jetty.x - boat.x,
        dz = shore.jetty.z - boat.z,
        length = Math.hypot(dx, dz);
      box(
        m.timber,
        boat.x + dx / 2,
        shore.jetty.y - 0.28,
        boat.z + dz / 2,
        0.04,
        0.04,
        length,
        Math.atan2(dx, dz),
        false,
      );
    }
  }
  if (!lake.alpine)
    for (const p of shore.reeds)
      for (let i = 0; i < 4; i++) {
        const h = 0.85 + i * 0.17;
        box(
          m.rice,
          p.x + (i % 2) * 0.22,
          p.y + h / 2,
          p.z + Math.floor(i / 2) * 0.25,
          0.06,
          h,
          0.06,
          0,
          false,
        );
      }
  for (let i = 0; i < shore.grove.length; i++) {
    const p = shore.grove[i],
      height = 7 + (i % 4) * 1.8;
    box(m.trunk, p.x, p.y + height / 2, p.z, 0.42, height, 0.42);
    item(cedarGeo, cedarMat, p.x, p.y + height * 0.76, p.z, 2.6, height * 0.85, 2.6, i);
  }

  const falls = [];
  if (!lake.coast) {
    const cliffMat = mat('layered wet rock', lake.alpine ? '#788d91' : '#6c8075', {
      flatShading: true,
    });
    const flowMat = mat('falling water and foam', '#b8e3df', {
      roughness: 0.35,
      side: THREE.DoubleSide,
      emissive: '#7ea9aa',
      emissiveIntensity: 0.12,
    });
    flowMat.onBeforeCompile = (shader) => {
      shader.uniforms.fallTime = clock;
      shader.vertexShader = 'varying vec2 vFlowUv;\n' + shader.vertexShader;
      shader.vertexShader = shader.vertexShader.replace(
        '#include <begin_vertex>',
        '#include <begin_vertex>\nvFlowUv = uv;',
      );
      shader.fragmentShader =
        'uniform float fallTime; varying vec2 vFlowUv;\n' + shader.fragmentShader;
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        float threads = sin(vFlowUv.x * 97.0 + sin(vFlowUv.y * 18.0 + fallTime * 6.0));
        float drops = pow(0.5 + 0.5 * sin(vFlowUv.y * 55.0 + fallTime * 12.0 + vFlowUv.x * 11.0), 5.0);
        diffuseColor.rgb *= 0.68 + threads * 0.12 + drops * 0.55;`,
      );
    };
    flowMat.customProgramCacheKey = () => 'regional-falling-water-v1';
    const cliffX = x - lake.rx * 0.91,
      cliffZ = lake.z + 28,
      totalHeight = lake.alpine ? 58 : 40;
    for (let i = 0; i < 14; i++) {
      const xx = cliffX - 15 - (i % 3) * 8,
        zz = cliffZ + (i < 7 ? -1 : 1) * (35 + (i % 7) * 6);
      const ground = terrain(xx, zz),
        height = 10 + (i % 4) * 2;
      box(m.trunk, xx, ground + height / 2, zz, 0.7, height, 0.7);
      item(cedarGeo, cedarMat, xx, ground + height * 0.8, zz, 4.2, height, 4.2, i);
    }
    // A headwater pool feeds the upper lip of the stepped cascade.
    box(
      m.water,
      cliffX - 9,
      y + totalHeight + 0.1,
      cliffZ,
      21,
      0.3,
      lake.alpine ? 33 : 12,
      0,
      false,
    );
    for (let tier = 0; tier < 3; tier++) {
      const base = y + (tier * totalHeight) / 3;
      const frontX = cliffX - tier * 5;
      for (let column = -3; column <= 3; column++) {
        const h = totalHeight / 3 + 3 + Math.sin(column * 2 + tier) * 2;
        item(
          crownGeo,
          cliffMat,
          frontX - 15,
          base + h * 0.3,
          cliffZ + column * 9,
          23,
          h,
          9,
          column * 0.13,
        );
        if (lake.alpine && tier === 2)
          item(
            crownGeo,
            m.snow,
            frontX - 15,
            base + h * 0.98,
            cliffZ + column * 9,
            19,
            1.6,
            8,
            column * 0.13,
          );
      }
      for (const offset of lake.alpine ? [-12, 12] : [0]) {
        const width = lake.alpine ? 5.5 : 9;
        const geo = keepGeo(new THREE.PlaneGeometry(width, totalHeight / 3 + 1, 10, 12));
        const positions = geo.attributes.position;
        for (let i = 0; i < positions.count; i++)
          positions.setZ(i, Math.sin(positions.getX(i) * 2.5) * 0.18);
        geo.computeVertexNormals();
        const fall = new THREE.Mesh(geo, flowMat);
        fall.name = `${lake.name} / cascade ${tier + 1}`;
        fall.rotation.y = Math.PI / 2;
        fall.position.set(frontX + 10, base + totalHeight / 6 + 0.5, cliffZ + offset);
        group.add(fall);
        falls.push(fall);
        // Continuous water ledge connects each drop to the one below.
        box(flowMat, frontX + 12.5, base + 0.2, cliffZ + offset, 6, 0.3, width + 1, 0, false);
        item(
          crownGeo,
          flowMat,
          frontX + 11,
          base + 0.1,
          cliffZ + offset,
          6,
          0.45,
          width,
          0,
          undefined,
          false,
        );
      }
    }
    // Sparse foam rings at the foot; animated scale gives expanding impact ripples.
    const foamMat = mat('spray', '#deeee5', {
      transparent: true,
      opacity: 0.38,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const rings = new THREE.InstancedMesh(keepGeo(new THREE.RingGeometry(0.82, 1, 32)), foamMat, 8);
    rings.name = `${lake.name} / impact ripples`;
    rings.frustumCulled = false;
    group.add(rings);
    const dummy = new THREE.Object3D();
    return {
      update(dt) {
        clock.value += Math.max(0, dt);
        for (let i = 0; i < 8; i++) {
          const progress = (clock.value * 0.25 + i / 8) % 1;
          dummy.position.set(
            cliffX + 14 + progress * 8,
            y + 0.08 + i * 0.002,
            cliffZ + (lake.alpine ? (i % 2 ? 12 : -12) : 0),
          );
          dummy.rotation.set(-Math.PI / 2, 0, 0);
          dummy.scale.set(2 + progress * 8, 3 + progress * 10, 1);
          dummy.updateMatrix();
          rings.setMatrixAt(i, dummy.matrix);
        }
        rings.instanceMatrix.needsUpdate = true;
      },
      state: () => ({
        id: lake.id,
        cascades: falls.length,
        time: clock.value,
        shore: {
          trailPoints: shore.trail.length,
          boathouse: !!shore.house,
          boats: shore.boats.length,
        },
      }),
    };
  }
  return {
    update: (dt) => {
      clock.value += Math.max(0, dt);
    },
    state: () => ({
      id: lake.id,
      cascades: 0,
      time: clock.value,
      shore: {
        trailPoints: shore.trail.length,
        boathouse: !!shore.house,
        boats: shore.boats.length,
      },
    }),
  };
}
