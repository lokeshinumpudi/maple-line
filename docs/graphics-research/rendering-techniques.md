# Browser rendering recipes

Baseline: Three.js 0.180.0 and WebGLRenderer. Recheck [current source](codebase-map.md) before applying these proposed experiments. API evidence and book coverage are recorded in [sources](sources.md).

## 1. Foliage that holds together in motion

Existing leaves use alpha-tested, mipmapped crossed planes. Compare `alphaToCoverage` on the leaf material in a small A/B experiment. [Three.js Material](https://threejs.org/docs/pages/Material.html) documents its dependence on multisampling; requesting `antialias: true` does not prove every pass has samples. The existing offscreen water targets need separate inspection. Keep opaque cutouts as the fallback; do not add alpha blending and sorting problems without a reason.

Inspect crown thickness, gaps, silhouette, shadow shape, and reflected trees while moving. If leaves vanish at distance, examine alpha coverage through mip levels and the far representation. [PBRT's filtering discussion](https://www.pbr-book.org/4ed/Textures_and_Materials/Texture_Sampling_and_Antialiasing) explains why preserving unlimited high-frequency detail is not the objective. A stable crown mass can work better than individually flickering leaves.

Do not switch to alpha hashing merely to hide hard edges: its noise needs evaluation in this game's rendering pipeline. No temporal antialiasing system was established by the source audit.

## 2. Distance detail without destroying batches

Prototype near crown clusters and a simpler far crown using the same palette and comparable apparent volume. Use chunk/subregion batches, rather than one independently updated LOD object for every leaf. Measure both geometry savings and additional batch overhead.

[Three.js LOD](https://threejs.org/docs/pages/LOD.html) provides distance levels and hysteresis. Apply the same principle to grouped instanced levels if using a custom selector. Base transitions on the active camera, with explicit behavior for the water capture cameras. Preserve conservative bounds for wind and camera changes. Test repeated crossings of the threshold in both directions; hiding distant geometry must not remove it from a nearby reflected view unintentionally.

`InstancedMesh` shares geometry/material work, but its bounds describe the batch. After editing instance transforms, update the buffer and recompute affected bounds before culling. [InstancedMesh documentation](https://threejs.org/docs/pages/InstancedMesh.html) is the reference; the installed r180 implementation is linked in the source ledger.

## 3. Wind and believable foliage shading

Keep the existing wind module as the owner of deformation. Add species-specific stiffness or phase only where it changes the perceived motion. Main sway and small leaf response can differ, following the separation discussed in [GPU Gems 3 chapter 16](https://developer.nvidia.com/gpugems/gpugems3/part-iii-rendering/chapter-16-vegetation-procedural-animation-and-shading-crysis).

Any additional displacement must appear in depth/distance shadow materials and in expanded bounds. Check nonuniform instance scale. If evaluating backlit leaf tint or baked root darkening, inspect sunny and overcast views: fixed shading must not look like a second sun or remain excessively dark in snow.

## 4. Material identity before more noise

The game already applies triplanar surface variation, wet roughness, and filtered roof seams. Tune these in one material family at a time. Wood grain, plaster mottling, roof seams, and ballast should have different scales and responses. Repeated fine dark marks can make every surface look dirty.

Use color textures with the appropriate color space; keep roughness, normal, and packed data textures out of sRGB conversion. Work with linear lighting values and preserve one final output transform. Check the [r152 color-management changes](https://discourse.threejs.org/t/updates-to-color-management-in-three-js-r152/50791) when adapting older tutorials. The installed r180 names differ from older `encoding` examples.

Retain derivative filtering and distance fade for analytic patterns. Add bump/normal variation only after checking oblique and distant views for sparkling highlights. Vertex displacement changes silhouettes and shadow geometry; fragment normal variation does not.

## 5. Lighting, reflections, and weather

The current environment is generated once while weather changes intensity. Prototype a small cached set of sky palettes corresponding to existing weather/dusk states. [PMREMGenerator](https://threejs.org/docs/pages/PMREMGenerator.html) prefilters environment lighting for roughness. Build targets outside the normal frame loop, define their owner, and dispose them when that owner is retired.

Do not assume assigning a different environment map gives a smooth transition. First test whether a discrete update at a suitable transition point is acceptable; a true blend needs an explicit material/lighting approach and its own cost evaluation. Keep the visible sky, exposure, fog, and material reflections in agreement.

For shadow problems, distinguish inadequate texel density, depth bias artifacts, caster culling, and 20 Hz movement before increasing map size. Record a stationary and moving view. A larger map does not fix incorrect bias or stale updates.

## 6. Water: spatial detail versus stale captures

Keep the existing river profile and multipass water. Use large-scale shape for the river course and small normal variations for restrained ripples, informed by [GPU Gems chapter 1](https://developer.nvidia.com/gpugems/gpugems/part-i-natural-effects/chapter-1-effective-water-simulation-physical-models). Do not introduce large waves that cross the banks or separate the water from its depth model.

If reflections lag during a camera turn, test capture invalidation on a meaningful camera/scene change before raising target resolution. If reflections are blurry while stationary, inspect projection and resolution separately. Reflection, refraction, main rendering, and shadows have different costs. Change one refresh condition or target size at a time; preserve renderer/camera state after every capture.

## 7. Shader and renderer discipline

The game chains `onBeforeCompile` hooks. Preserve prior hooks and cache keys, keep frequently changing values in uniforms, and use a distinct program key when generated shader code differs. Recompiling on every weather/frame update is a failure. Check fog, instancing, shadows, and tone mapping after shader edits.

Use [MDN's WebGL guidance](https://developer.mozilla.org/en-US/docs/Web/API/WebGL_API/WebGL_best_practices) to distinguish CPU work, GPU work, synchronization, and resource pressure. Avoid per-frame blocking queries. Profile chunk assembly, first-use shader compilation, and uploads independently before selecting a remedy. Reuse shared resources with explicit ownership.

WebGPU is a separate port candidate. [Three.js migration guidance](https://threejs.org/manual/pages/webgpurenderer) identifies the node-material/TSL requirement for custom shaders. Start with one instanced windy tree and one water/material example in an isolated prototype pinned to a chosen version. Require parity for fog, snow, shadows, captures, color output, and measured frame pacing before considering a game-wide change.
