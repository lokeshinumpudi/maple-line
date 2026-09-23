/**
 * VRM loading for the browser. three-vrm and its animation plugin load lazily on the first
 * VRM request, so the main bundle does not grow for players who never meet a VRM character.
 * Files are fetched once; each call parses a fresh VRM because a VRM instance owns its
 * spring-bone and expression state and cannot be shared or cloned between two people.
 * Meshopt-compressed VRMs decode through the same decoder the Blender GLBs use.
 */
import { modelUrl } from '../rendering/model-loader.js';

let modules = null;

function loadModules() {
  modules ??= Promise.all([
    import('three/addons/loaders/GLTFLoader.js'),
    import('three/addons/libs/meshopt_decoder.module.js'),
    import('@pixiv/three-vrm'),
    import('@pixiv/three-vrm-animation'),
  ]).then(([{ GLTFLoader }, { MeshoptDecoder }, vrm, vrma]) => ({
    GLTFLoader,
    MeshoptDecoder,
    ...vrm,
    ...vrma,
  }));
  return modules;
}

export function createVrmLoader({ fetchBytes = defaultFetch } = {}) {
  const bytes = new Map();
  const animations = new Map();
  const status = new Map();

  function getBytes(path) {
    if (!bytes.has(path)) bytes.set(path, fetchBytes(path));
    return bytes.get(path);
  }

  async function parse(path, register) {
    const m = await loadModules();
    const loader = new m.GLTFLoader();
    loader.setMeshoptDecoder(m.MeshoptDecoder);
    register(loader, m);
    const buffer = await getBytes(path);
    return { gltf: await loader.parseAsync(buffer.slice(0), modelUrl(path)), m };
  }

  return {
    /** Resolves to { vrm, m } for a new VRM instance, or null if the file cannot load. */
    async vrm(path) {
      status.set(path, 'loading');
      try {
        const { gltf, m } = await parse(path, (loader, mod) =>
          loader.register((parser) => new mod.VRMLoaderPlugin(parser)),
        );
        const vrm = gltf.userData.vrm;
        if (!vrm) throw new Error(`${path} has no VRM extension`);
        m.VRMUtils.removeUnnecessaryVertices(vrm.scene);
        m.VRMUtils.combineSkeletons(vrm.scene);
        status.set(path, 'ready');
        return { vrm, m, gltf };
      } catch (error) {
        status.set(path, 'failed');
        console.warn(`VRM ${path} could not load`, error);
        return null;
      }
    },
    /** Resolves to the VRMAnimation list and scene extras of a .vrma file, parsed once. */
    animations(path) {
      if (!animations.has(path)) {
        status.set(path, 'loading');
        animations.set(
          path,
          parse(path, (loader, mod) =>
            loader.register((parser) => new mod.VRMAnimationLoaderPlugin(parser)),
          ).then(
            ({ gltf }) => {
              status.set(path, 'ready');
              return {
                animations: gltf.userData.vrmAnimations ?? [],
                names: gltf.animations.map((clip) => clip.name),
                extras: gltf.scene.userData ?? {},
              };
            },
            (error) => {
              status.set(path, 'failed');
              console.warn(`VRM animation ${path} could not load`, error);
              return null;
            },
          ),
        );
      }
      return animations.get(path);
    },
    modules: loadModules,
    getState() {
      return Object.fromEntries(status);
    },
  };
}

async function defaultFetch(path) {
  const response = await fetch(modelUrl(path));
  if (!response.ok) throw new Error(`${path}: HTTP ${response.status}`);
  return response.arrayBuffer();
}
