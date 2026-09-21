const ACTIONS = new Set([
  'camera',
  'weather',
  'timeOfDay',
  'location',
  'drive',
  'pause',
  'autopilot',
  'mode',
]);
const PATCH_KEYS = new Set(['position', 'rotation', 'scale', 'visible', 'material']);
const MATERIAL_KEYS = new Set(['color', 'roughness', 'metalness']);
const round = (value) =>
  Number.isFinite(value) ? Math.round(value * 10000) / 10000 : String(value);
const vector = (value) => value.toArray().map(round);

function compact(value, depth = 0) {
  if (value == null || typeof value === 'boolean' || typeof value === 'number') return value;
  if (typeof value === 'string') return value.slice(0, 400);
  if (depth > 4) return '[nested]';
  if (Array.isArray(value)) return value.slice(0, 80).map((item) => compact(item, depth + 1));
  if (typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value)
        .slice(0, 80)
        .filter(([, item]) => typeof item !== 'function')
        .map(([key, item]) => [key, compact(item, depth + 1)]),
    );
  return String(value);
}

/** Local developer inspection API. Parent must install only in development. */
export function installSceneInspector({
  THREE,
  scene,
  renderer,
  camera,
  train = [],
  getState = () => ({}),
  actions = {},
}) {
  const history = [];
  const objects = () => {
    const list = [];
    scene.traverse((object) => list.push(object));
    return list;
  };
  const bounds = (object) => {
    const box = new THREE.Box3().setFromObject(object);
    return box.isEmpty() ? null : { min: vector(box.min), max: vector(box.max) };
  };
  const materialInfo = (material) => ({
    type: material.type,
    name: material.name || undefined,
    color: material.color ? `#${material.color.getHexString()}` : undefined,
    roughness: material.roughness,
    metalness: material.metalness,
    opacity: material.opacity,
    transparent: material.transparent,
    depthTest: material.depthTest,
    depthWrite: material.depthWrite,
    side: material.side,
    polygonOffset: material.polygonOffset,
    polygonOffsetFactor: material.polygonOffsetFactor,
    polygonOffsetUnits: material.polygonOffsetUnits,
  });
  const summarize = (object, detail = false) => {
    const summary = {
      id: object.id,
      uuid: object.uuid,
      name: object.name || null,
      type: object.type,
      visible: object.visible,
      position: vector(object.position),
      rotation: vector(object.rotation),
      scale: vector(object.scale),
      childCount: object.children.length,
    };
    if (detail) {
      summary.worldPosition = vector(object.getWorldPosition(new THREE.Vector3()));
      summary.bounds = bounds(object);
      if (object.geometry)
        summary.geometry = {
          type: object.geometry.type,
          vertices: object.geometry.attributes.position?.count ?? 0,
          indices: object.geometry.index?.count ?? 0,
          instances: object.isInstancedMesh ? object.count : undefined,
        };
      if (object.material)
        summary.material = Array.isArray(object.material)
          ? object.material.map(materialInfo)
          : materialInfo(object.material);
    }
    if (object.isLight)
      summary.light = {
        color: `#${object.color.getHexString()}`,
        intensity: object.intensity,
        castShadow: object.castShadow,
        distance: object.distance,
        decay: object.decay,
      };
    return summary;
  };
  const resolve = (query) => {
    if (typeof query !== 'string' && typeof query !== 'number')
      throw new TypeError('Use an object UUID, numeric ID, or exact unique name.');
    const list = objects();
    const byId = list.find((object) => object.uuid === query || object.id === query);
    if (byId) return byId;
    const named = list.filter((object) => object.name && object.name === query);
    if (named.length !== 1)
      throw new Error(
        named.length ? `Name is ambiguous: ${query}. Use a UUID.` : `Object not found: ${query}`,
      );
    return named[0];
  };
  const refresh = () => {
    scene.updateMatrixWorld(true);
    camera.updateMatrixWorld(true);
  };
  const finite = (value, low, high, label) => {
    if (typeof value !== 'number' || !Number.isFinite(value) || value < low || value > high)
      throw new TypeError(`${label} must be a finite number from ${low} to ${high}.`);
  };
  const triple = (value, low, high, label) => {
    if (!Array.isArray(value) || value.length !== 3)
      throw new TypeError(`${label} needs [x, y, z].`);
    value.forEach((n) => finite(n, low, high, label));
  };
  const api = {
    version: 1,
    snapshot() {
      refresh();
      const all = objects();
      const entities = all.filter(
        (object) => object.name || object.isLight || train.includes(object),
      );
      return {
        version: 1,
        game: compact(getState()),
        camera: {
          position: vector(camera.getWorldPosition(new THREE.Vector3())),
          quaternion: vector(camera.getWorldQuaternion(new THREE.Quaternion())),
          fov: camera.fov,
          near: camera.near,
          far: camera.far,
          aspect: camera.aspect,
        },
        renderer: {
          render: compact(renderer.info?.render ?? {}),
          memory: compact(renderer.info?.memory ?? {}),
          programs: renderer.info?.programs?.length ?? 0,
          pixelRatio: renderer.getPixelRatio?.() ?? null,
        },
        scene: {
          objects: all.length,
          namedEntities: entities.length,
          truncated: entities.length > 150,
          entities: entities.slice(0, 150).map((object) => summarize(object, true)),
        },
        availableActions: [...ACTIONS].filter((action) => typeof actions[action] === 'function'),
        undoCount: history.length,
      };
    },
    find(query = '') {
      const term = String(query).toLowerCase();
      return objects()
        .filter((object) =>
          [object.name, object.uuid, String(object.id), object.type].some((value) =>
            value.toLowerCase().includes(term),
          ),
        )
        .slice(0, 150)
        .map((object) => summarize(object));
    },
    inspect(query) {
      refresh();
      return summarize(resolve(query), true);
    },
    raycast(ndcX, ndcY) {
      finite(ndcX, -1, 1, 'ndcX');
      finite(ndcY, -1, 1, 'ndcY');
      refresh();
      const ray = new THREE.Raycaster();
      ray.setFromCamera(new THREE.Vector2(ndcX, ndcY), camera);
      return ray
        .intersectObjects(scene.children, true)
        .filter((hit) => {
          for (let object = hit.object; object; object = object.parent)
            if (!object.visible) return false;
          return true;
        })
        .slice(0, 20)
        .map((hit) => ({
          uuid: hit.object.uuid,
          name: hit.object.name || null,
          id: hit.object.id,
          instanceId: hit.instanceId,
          distance: round(hit.distance),
          point: vector(hit.point),
          faceIndex: hit.faceIndex,
        }));
    },
    set(action, payload) {
      if (!ACTIONS.has(action)) throw new Error(`Unknown action: ${action}`);
      if (typeof actions[action] !== 'function')
        throw new Error(`Action is unavailable: ${action}`);
      return actions[action](payload);
    },
    patchObject(query, patch) {
      const object = resolve(query);
      if (!patch || typeof patch !== 'object' || Array.isArray(patch))
        throw new TypeError('Patch must be an object.');
      for (const key of Object.keys(patch))
        if (!PATCH_KEYS.has(key)) throw new Error(`Unsupported patch field: ${key}`);
      if ('position' in patch) triple(patch.position, -1e7, 1e7, 'position');
      if ('rotation' in patch) triple(patch.rotation, -Math.PI * 100, Math.PI * 100, 'rotation');
      if ('scale' in patch) triple(patch.scale, 0.001, 1e4, 'scale');
      if ('visible' in patch && typeof patch.visible !== 'boolean')
        throw new TypeError('visible must be boolean.');
      if ('material' in patch) {
        if (!object.material) throw new TypeError('This object has no material.');
        if (!patch.material || typeof patch.material !== 'object' || Array.isArray(patch.material))
          throw new TypeError('material must be an object.');
        const materials = Array.isArray(object.material) ? object.material : [object.material];
        for (const [key, value] of Object.entries(patch.material)) {
          if (!MATERIAL_KEYS.has(key)) throw new Error(`Unsupported material field: ${key}`);
          if (materials.some((material) => !(key in material)))
            throw new TypeError(`Material does not support ${key}.`);
          if (key === 'color') {
            if (typeof value !== 'string' || !/^#[0-9a-f]{6}$/i.test(value))
              throw new TypeError('color must be a six-digit hex string.');
          } else finite(value, 0, 1, key);
        }
      }
      const previous = {
        object,
        position: object.position.clone(),
        rotation: object.rotation.clone(),
        scale: object.scale.clone(),
        visible: object.visible,
        material: object.material,
        clones: [],
      };
      if (patch.position) object.position.fromArray(patch.position);
      if (patch.rotation) object.rotation.set(...patch.rotation);
      if (patch.scale) object.scale.fromArray(patch.scale);
      if ('visible' in patch) object.visible = patch.visible;
      if (patch.material) {
        const clone = (source) => {
          const copy = source.clone();
          previous.clones.push(copy);
          for (const [key, value] of Object.entries(patch.material)) {
            if (key === 'color') copy.color.set(value);
            else copy[key] = value;
          }
          copy.needsUpdate = true;
          return copy;
        };
        object.material = Array.isArray(object.material)
          ? object.material.map(clone)
          : clone(object.material);
      }
      object.updateMatrix();
      history.push(previous);
      refresh();
      return summarize(object, true);
    },
    undo() {
      const previous = history.pop();
      if (!previous) return false;
      const { object } = previous;
      object.position.copy(previous.position);
      object.rotation.copy(previous.rotation);
      object.scale.copy(previous.scale);
      object.visible = previous.visible;
      object.material = previous.material;
      previous.clones.forEach((material) => material.dispose());
      object.updateMatrix();
      refresh();
      return summarize(object, true);
    },
    audit() {
      refresh();
      const all = objects();
      const eye = camera.getWorldPosition(new THREE.Vector3());
      const nonFiniteTransforms = all
        .filter((object) => !object.matrixWorld.elements.every(Number.isFinite))
        .slice(0, 30)
        .map((object) => ({ uuid: object.uuid, name: object.name }));
      const cameraWithinTrainBounds = train
        .filter((object) => new THREE.Box3().setFromObject(object).containsPoint(eye))
        .map((object) => ({ uuid: object.uuid, name: object.name }));
      const depthWarnings = [];
      for (const object of all) {
        if (!object.material) continue;
        for (const material of Array.isArray(object.material)
          ? object.material
          : [object.material]) {
          if (
            !material.depthTest ||
            (material.transparent && material.depthWrite) ||
            material.polygonOffset
          )
            depthWarnings.push({
              uuid: object.uuid,
              name: object.name,
              material: materialInfo(material),
            });
        }
      }
      return {
        nonFiniteTransforms,
        cameraWithinTrainBounds,
        depthWarnings: depthWarnings.slice(0, 50),
        depthWarningsTruncated: depthWarnings.length > 50,
        notes: [
          'Train bounds are a coarse obstruction warning, not proof of a blocked windshield.',
          'Depth flags are diagnostic clues. This audit does not prove or exclude coplanar z-fighting.',
          'Use raycast(0, 0) to inspect what occupies the centre of the active camera view.',
        ],
      };
    },
  };
  if (typeof window !== 'undefined') window.mapleWorld = api;
  return api;
}
