/**
 * Loads glTF models made by the Blender build scripts in asset-src/. Each URL is fetched
 * once; callers receive the parsed result or null. A failure is reported once through
 * onError and never throws into the render loop, so the procedural figure or building
 * stays in place when a file is missing.
 */
export function modelUrl(
  path,
  base = import.meta.env?.BASE_URL ?? '/',
  glbSuffix = import.meta.env?.VITE_VRM_AS_GLB === '1',
) {
  // Signal Ship skips .vrm and .vrma uploads; Signal builds store them as <file>.glb.
  const file = path.replace(/^\//, '');
  return `${base.endsWith('/') ? base : `${base}/`}${glbSuffix && /\.vrma?$/.test(file) ? `${file}.glb` : file}`;
}

export function createModelLoader({ load, onError = () => {} }) {
  const cache = new Map();
  const status = new Map();
  return {
    /** Resolves to the loaded glTF, or null when the file is missing or invalid. */
    get(path) {
      if (!cache.has(path)) {
        status.set(path, 'loading');
        cache.set(
          path,
          load(path).then(
            (gltf) => {
              status.set(path, 'ready');
              return gltf;
            },
            (error) => {
              status.set(path, 'failed');
              onError(path, error);
              return null;
            },
          ),
        );
      }
      return cache.get(path);
    },
    getState() {
      return Object.fromEntries(status);
    },
  };
}

/** Browser loader: GLTFLoader with the meshopt decoder the build scripts compress for. */
export async function createGltfLoader() {
  const [{ GLTFLoader }, { MeshoptDecoder }] = await Promise.all([
    import('three/addons/loaders/GLTFLoader.js'),
    import('three/addons/libs/meshopt_decoder.module.js'),
  ]);
  const loader = new GLTFLoader();
  loader.setMeshoptDecoder(MeshoptDecoder);
  return (path) => loader.loadAsync(modelUrl(path));
}
