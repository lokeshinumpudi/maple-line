/** Browser and renderer facts an agent can read. Absent APIs stay null. */
const SHADOW_TYPES = { 0: 'basic', 1: 'pcf', 2: 'pcf-soft', 3: 'vsm' };

function finite(value) {
  return Number.isFinite(value) ? value : null;
}

function text(value, max = 160) {
  return typeof value === 'string' && value.length ? value.slice(0, max) : null;
}

function media(matchMedia, query) {
  try {
    const result = matchMedia?.(query);
    return typeof result?.matches === 'boolean' ? result.matches : null;
  } catch {
    return null;
  }
}

function drawingBuffer(renderer) {
  if (typeof renderer?.getDrawingBufferSize !== 'function') return null;
  const target = { x: 0, y: 0 };
  const size = renderer.getDrawingBufferSize(target) ?? target;
  const width = finite(size.width) ?? finite(size.x);
  const height = finite(size.height) ?? finite(size.y);
  if (width === null || height === null) return null;
  return { width, height };
}

function gpu(renderer) {
  const gl = renderer?.getContext?.();
  const capabilities = renderer?.capabilities;
  if (!gl?.getParameter && !capabilities) return null;
  const debug = gl?.getExtension?.('WEBGL_debug_renderer_info');
  const unmasked = (token) =>
    debug && gl.getParameter ? text(gl.getParameter(debug[token])) : null;
  return {
    vendor: unmasked('UNMASKED_VENDOR_WEBGL'),
    renderer: unmasked('UNMASKED_RENDERER_WEBGL'),
    isWebGL2: capabilities ? Boolean(capabilities.isWebGL2) : null,
    maxTextureSize: finite(capabilities?.maxTextureSize),
    maxCubeMapSize: finite(capabilities?.maxCubemapSize),
    maxAnisotropy: finite(capabilities?.maxAnisotropy),
    maxSamples: finite(capabilities?.maxSamples),
    maxAttributes: finite(capabilities?.maxAttributes),
    maxVertexUniforms: finite(capabilities?.maxVertexUniforms),
    maxFragmentUniforms: finite(capabilities?.maxFragmentUniforms),
    samples:
      gl?.SAMPLES !== undefined && gl.getParameter ? finite(gl.getParameter(gl.SAMPLES)) : null,
  };
}

function jsHeap(perf) {
  const heap = perf?.memory;
  if (!heap || !Number.isFinite(heap.usedJSHeapSize)) return null;
  return {
    usedBytes: heap.usedJSHeapSize,
    totalBytes: finite(heap.totalJSHeapSize),
    limitBytes: finite(heap.jsHeapSizeLimit),
  };
}

async function originStorage(nav) {
  if (typeof nav?.storage?.estimate !== 'function') return null;
  try {
    const estimate = await nav.storage.estimate();
    return {
      usageBytes: finite(estimate?.usage),
      quotaBytes: finite(estimate?.quota),
    };
  } catch {
    return null;
  }
}

function platform(nav) {
  const data = nav?.userAgentData;
  if (!data) return null;
  const brands = Array.isArray(data.brands)
    ? data.brands.slice(0, 6).map((brand) => ({
        brand: text(brand?.brand, 40),
        version: text(brand?.version, 24),
      }))
    : null;
  return {
    mobile: typeof data.mobile === 'boolean' ? data.mobile : null,
    platform: text(data.platform, 40),
    brands,
  };
}

/**
 * One snapshot of the machine and the live renderer.
 * deviceMemoryGb is a browser bucket. jsHeap is the JS heap where the browser exposes it.
 * Geometry and texture fields are object counts, not bytes. The GPU name is the unmasked WebGL renderer.
 */
export async function collectRuntimeProfile({
  renderer = null,
  sun = null,
  rendering = null,
  navigator: nav = globalThis.navigator,
  screen: display = globalThis.screen,
  performance: perf = globalThis.performance,
  matchMedia = globalThis.matchMedia?.bind(globalThis),
  viewportWidth = globalThis.innerWidth,
  viewportHeight = globalThis.innerHeight,
  devicePixelRatio = globalThis.devicePixelRatio,
} = {}) {
  const shadowType = renderer?.shadowMap?.type;
  const info = renderer?.info;
  return {
    cpu: {
      logicalProcessors: finite(nav?.hardwareConcurrency),
      deviceMemoryGb: finite(nav?.deviceMemory),
    },
    memory: {
      jsHeap: jsHeap(perf),
      originStorage: await originStorage(nav),
      geometries: finite(info?.memory?.geometries),
      textures: finite(info?.memory?.textures),
    },
    display: {
      viewportWidth: finite(viewportWidth),
      viewportHeight: finite(viewportHeight),
      screenWidth: finite(display?.width),
      screenHeight: finite(display?.height),
      devicePixelRatio: finite(devicePixelRatio),
      colorDepth: finite(display?.colorDepth),
      pointerCoarse: media(matchMedia, '(pointer: coarse)'),
      anyHover: media(matchMedia, '(any-hover: hover)'),
      reducedMotion: media(matchMedia, '(prefers-reduced-motion: reduce)'),
    },
    platform: platform(nav),
    gpu: gpu(renderer),
    renderer: renderer
      ? {
          drawingBuffer: drawingBuffer(renderer),
          pixelRatio: finite(renderer.getPixelRatio?.()),
          shadow: {
            enabled: Boolean(renderer.shadowMap?.enabled),
            type: SHADOW_TYPES[shadowType] ?? null,
            mapWidth: finite(sun?.shadow?.mapSize?.width),
            mapHeight: finite(sun?.shadow?.mapSize?.height),
          },
          programs: Array.isArray(info?.programs) ? info.programs.length : null,
        }
      : null,
    rendering,
    notes: [
      'deviceMemoryGb is a coarse bucket, not installed RAM.',
      'jsHeap is the JavaScript heap when the browser exposes it, not GPU memory.',
      'geometries and textures are live object counts, not byte sizes.',
      'Frame CPU time from measure_game_performance is submission time, not GPU time.',
    ],
  };
}
