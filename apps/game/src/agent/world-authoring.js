import { createLeafClusterGeometry, createLeafClusterTexture } from '../world/tree-foliage.js';

export const PREFABS = Object.freeze({
  'broadleaf-tree': {
    color: '#a9a649',
    description: 'Branching maple with cutout leaf clusters, about 9 m tall.',
  },
  cedar: { color: '#37654b', description: 'Layered cedar with a visible trunk, about 12 m tall.' },
  rock: { color: '#818b83', description: 'Faceted boulder, about 2 m across.' },
  'grass-patch': { color: '#829c59', description: 'A 3 m patch of crossed grass blades.' },
  lantern: { color: '#d4bb7d', description: 'Stone lantern with an emissive warm chamber.' },
  bench: { color: '#8c6848', description: 'Wooden station bench, about 2.5 m wide.' },
  torii: { color: '#aa4232', description: 'Shrine gate, about 6 m wide and 5 m tall.' },
});
const clone = (value) => structuredClone(value);
const finite = (n, min, max) => typeof n === 'number' && Number.isFinite(n) && n >= min && n <= max;
const record = (value) =>
  value &&
  typeof value === 'object' &&
  !Array.isArray(value) &&
  [Object.prototype, null].includes(Object.getPrototypeOf(value));
function keys(value, allowed) {
  if (!record(value) || Object.keys(value).some((key) => !allowed.includes(key)))
    throw new TypeError('Unknown or invalid object fields.');
}
function id(value) {
  if (typeof value !== 'string' || !/^[A-Za-z][A-Za-z0-9_-]{0,63}$/.test(value))
    throw new TypeError('Invalid entity ID.');
  return value;
}
function triple(value, min, max) {
  if (!Array.isArray(value) || value.length !== 3 || !value.every((n) => finite(n, min, max)))
    throw new TypeError('Invalid three-component transform.');
  return [...value];
}
function bounds(value) {
  keys(value, ['minX', 'maxX', 'minZ', 'maxZ']);
  if (
    !['minX', 'maxX', 'minZ', 'maxZ'].every((k) => finite(value[k], -50000, 50000)) ||
    value.minX > value.maxX ||
    value.minZ > value.maxZ
  )
    throw new TypeError('Invalid region bounds.');
  return value;
}
export function createWorldAuthoring({ THREE, scene, terrainHeight }) {
  let entities = [],
    revision = 0,
    disposed = false;
  const past = [],
    future = [];
  let layer = new THREE.Group();
  layer.name = 'Authored scenery';
  scene.add(layer);
  function assertLive() {
    if (disposed) throw new Error('World authoring disposed.');
  }
  function normalize(value) {
    keys(value, ['id', 'kind', 'position', 'rotation', 'scale', 'color', 'groundSnap']);
    id(value.id);
    if (!Object.hasOwn(PREFABS, value.kind)) throw new TypeError('Unknown prefab kind.');
    const position = triple(value.position, -50000, 50000);
    if (!finite(position[1], -2000, 10000)) throw new TypeError('Invalid elevation.');
    if (value.groundSnap !== undefined && typeof value.groundSnap !== 'boolean')
      throw new TypeError('groundSnap must be boolean.');
    if (value.groundSnap) {
      position[1] = terrainHeight(position[0], position[2]);
      if (!finite(position[1], -2000, 10000))
        throw new TypeError('Terrain unavailable at this position.');
    }
    const color = value.color ?? PREFABS[value.kind].color;
    if (typeof color !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(color))
      throw new TypeError('Use a six-digit hex color.');
    return {
      id: value.id,
      kind: value.kind,
      position,
      rotation: triple(value.rotation ?? [0, 0, 0], -Math.PI * 2, Math.PI * 2),
      scale: triple(value.scale ?? [1, 1, 1], 0.05, 10),
      color: color.toLowerCase(),
    };
  }
  function disposeLayer(root) {
    const geometries = new Set(),
      materials = new Set(),
      textures = new Set();
    root.traverse((o) => {
      if (o.geometry) geometries.add(o.geometry);
      if (o.material) materials.add(o.material);
    });
    materials.forEach((m) => {
      if (m.map) textures.add(m.map);
      m.dispose();
    });
    geometries.forEach((g) => g.dispose());
    textures.forEach((t) => t.dispose());
  }
  function render(next) {
    const root = new THREE.Group();
    root.name = 'Authored scenery';
    const groups = new Map();
    for (const entity of next) {
      const key = entity.kind + entity.color;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(entity);
    }
    const box = new THREE.BoxGeometry(1, 1, 1),
      trunk = new THREE.CylinderGeometry(0.13, 0.23, 1, 7),
      cone = new THREE.ConeGeometry(1, 1, 11),
      rock = new THREE.IcosahedronGeometry(1, 1),
      leaf = createLeafClusterGeometry(THREE),
      texture = createLeafClusterTexture(THREE);
    const wood = new THREE.MeshStandardMaterial({ color: '#66513d', roughness: 0.95 });
    const stem = new THREE.MeshStandardMaterial({ color: '#6e7469', roughness: 0.8 });
    const glow = new THREE.MeshStandardMaterial({
      color: '#ffe5a4',
      emissive: '#ffb64d',
      emissiveIntensity: 0.65,
    });
    const dummy = new THREE.Object3D(),
      entityMatrix = new THREE.Matrix4(),
      componentMatrix = new THREE.Matrix4();
    for (const members of groups.values()) {
      const { kind, color } = members[0],
        paint = new THREE.MeshStandardMaterial({ color, roughness: kind === 'rock' ? 0.73 : 0.93 });
      const foliage = new THREE.MeshStandardMaterial({
        color,
        map: texture,
        alphaTest: 0.45,
        side: THREE.DoubleSide,
        roughness: 1,
      });
      const parts = [];
      const add = (geometry, material, position, scale, rotation = [0, 0, 0]) =>
        parts.push({ geometry, material, position, scale, rotation });
      if (kind === 'broadleaf-tree') {
        add(trunk, wood, [0, 3, 0], [1, 6, 1]);
        for (let i = 0; i < 5; i++) {
          const a = i * 2.4,
            x = Math.cos(a) * 1.7,
            z = Math.sin(a) * 1.7;
          add(
            trunk,
            wood,
            [x * 0.45, 5.4, z * 0.45],
            [0.55, 3, 0.55],
            [Math.sin(a) * 0.65, 0, -Math.cos(a) * 0.65],
          );
          add(leaf, foliage, [x, 6.2 + (i % 2) * 1.6, z], [2.35, 2.2, 2.35], [0, a, 0]);
        }
      } else if (kind === 'cedar') {
        add(trunk, wood, [0, 5, 0], [1.1, 10, 1.1]);
        for (let i = 0; i < 6; i++)
          add(
            cone,
            paint,
            [0, 3.3 + i * 1.45, 0],
            [3.2 - i * 0.44, 3.8, 3.2 - i * 0.44],
            [0, i * 0.51, 0],
          );
      } else if (kind === 'rock') add(rock, paint, [0, 0.6, 0], [1.4, 0.9, 1.1], [0.2, 0.5, 0.3]);
      else if (kind === 'grass-patch') {
        const g = new THREE.BufferGeometry();
        g.setAttribute(
          'position',
          new THREE.Float32BufferAttribute(
            [-0.1, 0, 0, 0.1, 0, 0, 0.07, 0.65, 0, 0, 0, -0.1, 0, 0, 0.1, 0.02, 0.55, 0.04],
            3,
          ),
        );
        g.computeVertexNormals();
        paint.side = THREE.DoubleSide;
        for (let i = 0; i < 12; i++)
          add(
            g,
            paint,
            [Math.sin(i * 9.3) * 1.4, 0, Math.cos(i * 7.1) * 1.4],
            [1, 0.7 + (i % 4) * 0.2, 1],
            [0, i, 0],
          );
      } else if (kind === 'bench') {
        add(box, paint, [0, 0.65, 0], [2.5, 0.16, 0.65]);
        add(box, paint, [0, 1.15, 0.28], [2.5, 0.65, 0.12]);
        for (const x of [-0.95, 0.95]) add(box, stem, [x, 0.3, 0], [0.15, 0.6, 0.5]);
      } else if (kind === 'torii') {
        for (const x of [-2.1, 2.1]) add(trunk, paint, [x, 2.3, 0], [2, 4.6, 2]);
        add(box, paint, [0, 4.75, 0], [6.2, 0.38, 0.65]);
        add(box, paint, [0, 3.7, 0], [5.4, 0.25, 0.32]);
        add(box, wood, [0, 5, 0], [6.5, 0.2, 0.7]);
      } else if (kind === 'lantern') {
        add(box, stem, [0, 0.15, 0], [0.9, 0.3, 0.9]);
        add(trunk, stem, [0, 0.95, 0], [1.6, 1.6, 1.6]);
        add(box, glow, [0, 1.9, 0], [0.55, 0.5, 0.55]);
        add(cone, stem, [0, 2.3, 0], [0.8, 0.4, 0.8]);
      }
      for (const part of parts) {
        const mesh = new THREE.InstancedMesh(part.geometry, part.material, members.length);
        mesh.name = `Authored / ${kind} / ${root.children.length}`;
        mesh.userData.authoredIds = members.map((e) => e.id);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        dummy.position.fromArray(part.position);
        dummy.rotation.set(...part.rotation);
        dummy.scale.fromArray(part.scale);
        dummy.updateMatrix();
        componentMatrix.copy(dummy.matrix);
        members.forEach((e, i) => {
          dummy.position.fromArray(e.position);
          dummy.rotation.set(...e.rotation);
          dummy.scale.fromArray(e.scale);
          dummy.updateMatrix();
          entityMatrix.copy(dummy.matrix).multiply(componentMatrix);
          mesh.setMatrixAt(i, entityMatrix);
        });
        mesh.computeBoundingSphere();
        root.add(mesh);
      }
      if (!parts.some((p) => p.material === paint)) paint.dispose();
      if (!parts.some((p) => p.material === foliage)) foliage.dispose();
    }
    // Resources unused by this particular layout are not in the traversal.
    const usedG = new Set(),
      usedM = new Set();
    root.traverse((o) => {
      if (o.geometry) usedG.add(o.geometry);
      if (o.material) usedM.add(o.material);
    });
    for (const g of [box, trunk, cone, rock, leaf]) if (!usedG.has(g)) g.dispose();
    for (const m of [wood, stem, glow]) if (!usedM.has(m)) m.dispose();
    if (![...usedM].some((m) => m.map === texture)) texture.dispose();
    return root;
  }
  function commit(next, label, history = true) {
    assertLive();
    if (next.length > 1000) throw new RangeError('Authored layer is limited to 1000 entities.');
    const nextLayer = render(next);
    if (history) {
      past.push({ entities: clone(entities), label });
      if (past.length > 20) past.shift();
      future.length = 0;
    }
    scene.remove(layer);
    disposeLayer(layer);
    layer = nextLayer;
    scene.add(layer);
    entities = clone(next);
    revision++;
    return api.getState();
  }
  const api = {
    catalog: () => ({
      prefabs: PREFABS,
      limits: { entities: 1000, batchOperations: 100, scatter: 200, history: 20 },
      units: 'metres; rotations in radians',
      note: 'Scenery is visual; placing objects does not change track geometry or collision physics.',
    }),
    getState: () => ({
      revision,
      entityCount: entities.length,
      undoCount: past.length,
      redoCount: future.length,
      drawBatches: layer.children.length,
    }),
    inspect(options = {}) {
      keys(options, ['id', 'bounds', 'offset', 'limit']);
      let found = entities;
      if (options.id !== undefined) found = found.filter((e) => e.id === id(options.id));
      if (options.bounds) {
        const b = bounds(options.bounds);
        found = found.filter(
          (e) =>
            e.position[0] >= b.minX &&
            e.position[0] <= b.maxX &&
            e.position[2] >= b.minZ &&
            e.position[2] <= b.maxZ,
        );
      }
      const offset = options.offset ?? 0,
        limit = options.limit ?? 50;
      if (
        !Number.isInteger(offset) ||
        !finite(offset, 0, 1000) ||
        !Number.isInteger(limit) ||
        !finite(limit, 1, 200)
      )
        throw new TypeError('Invalid page.');
      return {
        total: found.length,
        offset,
        limit,
        entities: clone(found.slice(offset, offset + limit)),
      };
    },
    applyBatch(input) {
      assertLive();
      keys(input, ['label', 'operations']);
      if (
        typeof input.label !== 'string' ||
        !input.label.trim() ||
        input.label.length > 120 ||
        !Array.isArray(input.operations) ||
        input.operations.length < 1 ||
        input.operations.length > 100
      )
        throw new TypeError('Use a label and 1–100 operations.');
      const map = new Map(entities.map((e) => [e.id, clone(e)]));
      const place = (e) => {
        const n = normalize(e);
        if (map.has(n.id)) throw new Error(`Duplicate ID: ${n.id}`);
        map.set(n.id, n);
        if (map.size > 1000) throw new RangeError('Entity limit exceeded.');
      };
      for (const op of input.operations) {
        if (op.type === 'place') {
          keys(op, ['type', 'entity']);
          place(op.entity);
        } else if (op.type === 'update') {
          keys(op, ['type', 'id', 'patch']);
          id(op.id);
          if (!map.has(op.id)) throw new Error(`Unknown entity: ${op.id}`);
          keys(op.patch, ['position', 'rotation', 'scale', 'color', 'groundSnap']);
          map.set(op.id, normalize({ ...map.get(op.id), ...op.patch }));
        } else if (op.type === 'remove') {
          keys(op, ['type', 'id']);
          if (!map.delete(id(op.id))) throw new Error(`Unknown entity: ${op.id}`);
        } else if (op.type === 'scatter') {
          keys(op, ['type', 'idPrefix', 'kind', 'seed', 'count', 'bounds', 'scaleRange', 'color']);
          id(op.idPrefix);
          if (
            op.idPrefix.length > 59 ||
            !Number.isInteger(op.seed) ||
            !finite(op.seed, 0, 4294967295) ||
            !Number.isInteger(op.count) ||
            !finite(op.count, 1, 200)
          )
            throw new TypeError('Invalid scatter parameters.');
          const b = bounds(op.bounds),
            range = op.scaleRange ?? [0.8, 1.2];
          if (
            !Array.isArray(range) ||
            range.length !== 2 ||
            !range.every((v) => finite(v, 0.05, 10)) ||
            range[0] > range[1]
          )
            throw new TypeError('Invalid scale range.');
          let seed = op.seed;
          const random = () => {
            seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
            return seed / 4294967296;
          };
          for (let i = 0; i < op.count; i++) {
            const x = b.minX + random() * (b.maxX - b.minX),
              z = b.minZ + random() * (b.maxZ - b.minZ),
              s = range[0] + random() * (range[1] - range[0]);
            place({
              id: `${op.idPrefix}-${i + 1}`,
              kind: op.kind,
              position: [x, 0, z],
              rotation: [0, random() * Math.PI * 2, 0],
              scale: [s, s, s],
              color: op.color,
              groundSnap: true,
            });
          }
        } else throw new TypeError('Unknown build operation.');
      }
      return commit([...map.values()], input.label);
    },
    undo() {
      assertLive();
      if (!past.length) return false;
      const step = past[past.length - 1],
        current = clone(entities);
      commit(step.entities, step.label, false);
      past.pop();
      future.push({ entities: current, label: step.label });
      return api.getState();
    },
    redo() {
      assertLive();
      if (!future.length) return false;
      const step = future[future.length - 1],
        current = clone(entities);
      commit(step.entities, step.label, false);
      future.pop();
      past.push({ entities: current, label: step.label });
      return api.getState();
    },
    exportLayout() {
      return { version: 1, entities: clone(entities) };
    },
    importLayout(layout) {
      keys(layout, ['version', 'entities']);
      if (layout.version !== 1 || !Array.isArray(layout.entities) || layout.entities.length > 1000)
        throw new TypeError('Invalid layout.');
      const next = layout.entities.map(normalize);
      if (new Set(next.map((e) => e.id)).size !== next.length)
        throw new TypeError('Duplicate IDs in layout.');
      return commit(next, 'Import layout');
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      scene.remove(layer);
      disposeLayer(layer);
      entities = [];
      past.length = future.length = 0;
    },
  };
  api.state = api.getState;
  return api;
}
