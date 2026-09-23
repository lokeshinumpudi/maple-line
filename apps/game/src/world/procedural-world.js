import { inForestGrove, sceneryFields, sceneryHash } from './scenery-fields.js';
import { createMeadowLayout, createMeadowGeometry } from './seasonal-meadow.js';

import { createCedarGeometry } from './nature-geometry.js';
import * as THREE from 'three';
import { validateWorldSpec } from '@maple-line/world-spec';
import { createCanopyGrid } from './canopy-grid.js';
import { createWindField } from './wind.js';
import { addWorldDetails, worldClearings } from './world-details.js';
import { createLeafClusterGeometry, createLeafClusterTexture } from './tree-foliage.js';

export const SCENERY_GENERATION_VERSION = 2;

const PALETTES = {
  spring: ['#eaa1be', '#f1bed2', '#db8da9', '#f4cad7', '#8baf64'],
  summer: ['#558641', '#719c47', '#427740', '#91ad55', '#638d45'],
  autumn: ['#c7a844', '#d8b94e', '#b57b36', '#d88f3e', '#b6aa48', '#819346', '#cf6935'],
  winter: ['#46634e', '#56755b', '#315441'],
};

/** Deterministic placement; the render builder and invariant tests use these same trees. */
export function createForestLayout({
  plan: raw,
  terrain,
  railU,
  riverBedHeight,
  center = () => 0,
}) {
  const plan = validateWorldSpec(raw);
  let seed = plan.seed;
  const random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  const trees = [];
  const occupied = new Map();
  const spacing = 3.2;
  const attempts = { sparse: 2200, balanced: 5600, dense: 8200 }[plan.forest];
  for (let i = 0; i < attempts; i++) {
    const z = -820 + random() * 1640;
    const u = -190 + random() * 380;
    const bed = riverBedHeight(u, z);
    if (
      Math.abs(u - railU(z)) < 9 ||
      !inForestGrove(center(z) + u, z, plan.seed) ||
      (bed !== null && bed < 3) ||
      Math.abs(u) < 21 ||
      (u > 18 && u < 43) ||
      (z > 460 && z < 580 && u > 20 && u < 58) ||
      worldClearings.some(
        (r) => z >= r.minZ - 4 && z <= r.maxZ + 4 && u >= r.minU - 5 && u <= r.maxU + 5,
      )
    )
      continue;
    const x = center(z) + u;
    const cx = Math.floor(x / spacing),
      cz = Math.floor(z / spacing);
    let crowded = false;
    for (let dx = -1; dx <= 1; dx++)
      for (let dz = -1; dz <= 1; dz++) {
        for (const other of occupied.get(`${cx + dx}:${cz + dz}`) ?? []) {
          if ((x - other.x) ** 2 + (z - other.z) ** 2 < spacing ** 2) crowded = true;
        }
      }
    if (crowded) continue;
    const key = `${cx}:${cz}`;
    if (!occupied.has(key)) occupied.set(key, []);
    occupied.get(key).push({ x, z });
    const fields = sceneryFields(x, z, plan.seed);
    // Independent appearance samples: adding branches never rerolls trunk sites.
    const age = sceneryHash(i, 17, plan.seed);
    const palette = PALETTES[plan.season];
    const paletteIndex = Math.min(
      palette.length - 1,
      Math.floor((fields.moisture * 0.76 + sceneryHash(i, 29, plan.seed) * 0.24) * palette.length),
    );
    trees.push({
      id: `tree-${i}`,
      u,
      z,
      y: terrain(u, z),
      height: 6 + age * 6 + fields.grove * 2,
      radius: 2.8 + age * 1.9,
      pine:
        sceneryHash(i, 41, plan.seed) <
        (plan.season === 'winter' ? 0.94 : 0.08 + fields.moisture * 0.18),
      tint: palette[paletteIndex],
      angle: sceneryHash(i, 67, plan.seed) * Math.PI * 2,
    });
  }
  return trees;
}

/** Build off-scene. The caller swaps this root only after every part is ready. */
export function createProceduralWorld({
  plan,
  center,
  terrain,
  railU,
  riverBedHeight,
  riverProfile,
  snowCoverage,
  cardCanopy = null,
}) {
  const root = new THREE.Group();
  root.name = 'Player-created valley';
  root.userData.generationVersion = SCENERY_GENERATION_VERSION;
  const canopy = createCanopyGrid();
  const wind = createWindField({ THREE });
  const geometries = [
    new THREE.CylinderGeometry(0.28, 0.48, 1, 5, 1, true),
    createLeafClusterGeometry(THREE),
    createCedarGeometry(),
    createMeadowGeometry(THREE),
  ];
  const materials = geometries.map(
    (_, i) =>
      new THREE.MeshStandardMaterial({
        color: i ? '#ffffff' : '#675035',
        flatShading: false,
        roughness: 1,
      }),
  );
  materials[3].vertexColors = true;
  materials[3].side = THREE.DoubleSide;
  const leafTexture = createLeafClusterTexture(THREE);
  materials[1].map = leafTexture;
  materials[1].alphaTest = 0.45;
  materials[1].side = THREE.DoubleSide;
  for (const material of materials.slice(1)) {
    material.onBeforeCompile = (shader) => {
      shader.uniforms.snowCoverage = snowCoverage;
      shader.vertexShader =
        'varying float snowFacing;\n' +
        shader.vertexShader.replace(
          '#include <beginnormal_vertex>',
          '#include <beginnormal_vertex>\nsnowFacing = normal.y;',
        );
      shader.fragmentShader =
        'uniform float snowCoverage; varying float snowFacing;\n' +
        shader.fragmentShader.replace(
          '#include <color_fragment>',
          '#include <color_fragment>\ndiffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.83,0.9,0.92), snowCoverage * 0.88 * smoothstep(0.15,0.85,snowFacing));',
        );
    };
  }
  const buckets = new Map();
  const trees = createForestLayout({ plan, terrain, railU, riverBedHeight, center });
  for (const tree of trees) {
    const bucket = Math.floor(tree.z / 120);
    if (!buckets.has(bucket)) buckets.set(bucket, []);
    buckets.get(bucket).push(tree);
  }
  const dummy = new THREE.Object3D();
  const color = new THREE.Color();
  const chunks = [];
  const crownBatches = [];
  let details;
  let disposed = false;
  function dispose() {
    if (disposed) return;
    disposed = true;
    root.removeFromParent();
    for (const mesh of crownBatches) cardCanopy?.unregister(mesh);
    details?.dispose();
    wind.dispose();
    for (const chunk of chunks) chunk.mesh.dispose();
    for (const geometry of geometries) geometry.dispose();
    for (const material of materials) material.dispose();
    leafTexture.dispose();
    root.clear();
  }
  try {
    for (const [bucket, group] of buckets) {
      const pineCount = group.filter((tree) => tree.pine).length;
      const counts = [
        group.length + (group.length - pineCount) * 4,
        (group.length - pineCount) * 7,
        pineCount * 3,
      ];
      const meshes = counts.map((count, i) => {
        const mesh = new THREE.InstancedMesh(geometries[i], materials[i], count);
        mesh.name = `Generated ${['trunks', 'leaves', 'pines'][i]} / ${bucket}`;
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        root.add(mesh);
        chunks.push({ mesh, z: (bucket + 0.5) * 120 });
        return mesh;
      });
      const indices = [0, 0, 0];
      function place(kind, x, y, z, sx, sy, sz, angle, tint, tilt = 0) {
        dummy.position.set(x, y, z);
        dummy.scale.set(sx, sy, sz);
        dummy.rotation.set(0, angle, tilt);
        dummy.updateMatrix();
        meshes[kind].setMatrixAt(indices[kind], dummy.matrix);
        if (kind) meshes[kind].setColorAt(indices[kind], color.set(tint));
        indices[kind]++;
      }
      for (const tree of group) {
        const { z, y, height: h, radius: r, angle } = tree;
        const x = center(z) + tree.u;
        canopy.add(x, z, r * 1.65 + 1, y + (tree.pine ? h * 1.31 : h * 0.78 + r * 0.9));
        const trunkHeight = h * (tree.pine ? 0.7 : 0.56);
        place(0, x, y + trunkHeight / 2, z, h / 10, trunkHeight, h / 10, angle, '#675035');
        if (tree.pine) {
          for (let k = 0; k < 3; k++)
            place(
              2,
              x,
              y + h * (0.48 + k * 0.25),
              z,
              r * (1 - k * 0.23),
              h * 0.65,
              r * (1 - k * 0.23),
              angle,
              ['#315134', '#3d6036', '#4f703c'][k],
            );
        } else {
          for (let k = 0; k < 4; k++) {
            const a = angle + k * 2.399;
            const reach = r * 0.7;
            const rise = h * (0.2 + k * 0.025);
            place(
              0,
              x + (Math.cos(a) * reach) / 2,
              y + h * 0.42 + rise / 2,
              z + (Math.sin(a) * reach) / 2,
              0.36,
              Math.hypot(reach, rise),
              0.36,
              -a,
              '#675035',
              -Math.atan2(reach, rise),
            );
          }
          for (let k = 0; k < 7; k++) {
            const a = angle + k * 2.399;
            const upper = k >= 4;
            const spread = r * (upper ? 0.32 : 0.7);
            const tint = color
              .set(tree.tint)
              .multiplyScalar(upper ? 1.08 : 0.82 + k * 0.035)
              .getHex();
            place(
              1,
              x + Math.cos(a) * spread,
              y + h * (upper ? 0.78 : 0.62),
              z + Math.sin(a) * spread,
              r * (upper ? 0.8 : 0.88),
              r * (upper ? 0.72 : 0.62),
              r * 0.83,
              a,
              tint,
            );
          }
        }
      }
      meshes.forEach((mesh, i) => {
        mesh.computeBoundingSphere();
        wind.apply(mesh, {
          amplitude: [0.12, 0.85, 0.6][i],
          anchorMin: i === 1 ? -1.2 : -0.5,
          anchorMax: i === 1 ? -0.3 : 0.5,
        });
        // Near crowns get leaf cards; spring worlds get blossom cards.
        if (i === 1 && cardCanopy) {
          cardCanopy.register(mesh, {
            kind: plan.season === 'spring' ? 'blossom' : 'leaf',
            wind,
          });
          crownBatches.push(mesh);
        }
      });
    }
    const meadow = createMeadowLayout({ plan, terrain, railU, riverBedHeight, center });
    const meadowBuckets = new Map();
    for (const patch of meadow) {
      const bucket = Math.floor(patch.z / 120);
      if (!meadowBuckets.has(bucket)) meadowBuckets.set(bucket, []);
      meadowBuckets.get(bucket).push(patch);
    }
    const up = new THREE.Vector3(0, 1, 0);
    const groundNormal = new THREE.Vector3();
    const patchRotation = new THREE.Quaternion();
    for (const [bucket, patches] of meadowBuckets) {
      const mesh = new THREE.InstancedMesh(geometries[3], materials[3], patches.length);
      mesh.name = `Generated seasonal meadow / ${bucket}`;
      mesh.receiveShadow = true;
      for (const [i, patch] of patches.entries()) {
        dummy.position.set(center(patch.z) + patch.u, patch.y, patch.z);
        groundNormal.fromArray(patch.normal).normalize();
        dummy.quaternion.setFromUnitVectors(up, groundNormal);
        patchRotation.setFromAxisAngle(up, patch.angle);
        dummy.quaternion.multiply(patchRotation);
        dummy.scale.set(patch.scale, patch.height, patch.scale);
        dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);
        mesh.setColorAt(i, color.set(patch.tint));
      }
      root.add(mesh);
      chunks.push({ mesh, z: (bucket + 0.5) * 120, meadow: true });
      mesh.computeBoundingSphere();
      wind.apply(mesh, { amplitude: 0.12, anchorMin: 0, anchorMax: 0.8 });
    }
    details = addWorldDetails({
      THREE,
      scene: root,
      center,
      terrain,
      riverProfile,
      worldSeed: plan.seed,
      settlement: plan.settlement,
    });
  } catch (error) {
    dispose();
    throw error;
  }
  return {
    root,
    canopy,
    details,
    treeCount: trees.length,
    update(dt, { cameraPosition, trainPosition, weather }) {
      wind.update(dt, { weather });
      for (const chunk of chunks) {
        chunk.mesh.visible = Math.abs(chunk.z - cameraPosition.z) < 720;
        chunk.mesh.castShadow = !chunk.meadow && Math.abs(chunk.z - trainPosition.z) < 180;
      }
    },
    dispose,
  };
}
