# Reading record

Checked 2026-09-21. Notes are original summaries; linked books remain with their authors/publishers. Only the sections described below were examined. Technique adaptations for Maple Line are our proposals, not claims made by the authors.

## Books and papers

### The Book of Shaders — Patricio Gonzalez Vivo and Jen Lowe

[Chapter 13: Fractal Brownian Motion](https://thebookofshaders.com/13/). Read the explanation and examples of octaves, amplitude/frequency progression, turbulence, ridges, and domain warping. Combining scales can produce structure; adding octaves alone does not make an environment believable. Use these ideas for low-frequency region variation before adding surface detail. The examples teach GLSL concepts, not Maple Line material integration.

### Procedural Content Generation in Games — Shaker, Togelius, and Nelson, editors (2016)

[Author-hosted book](https://www.pcgbook.com/) and [chapter 5, Grammars and L-systems](https://www.pcgbook.com/chapter05.pdf). Read the opening sections through bracketed L-systems, covering rewriting rules and their geometric interpretation. This suggests a bounded family of branch or building arrangements. A grammar describes structure; it still needs placement constraints and a rendering budget. Later PDF fetches timed out. Chapters 4 and 12 remain on the reading queue; their content is not treated as reviewed evidence here.

### GPU Gems — Mark Finch, chapter 1 (2004)

[Effective Water Simulation from Physical Models](https://developer.nvidia.com/gpugems/gpugems/part-i-natural-effects/chapter-1-effective-water-simulation-physical-models). Examined the separation of large geometric waves from finer surface-normal variation and wave parameter choices. Maple Line's river needs restrained ripples and readable flow, not ocean-scale displacement. This is historical GPU technique literature; its implementation is not Three.js code.

### GPU Gems 3 — Tiago Sousa, chapter 16 (2007)

[Vegetation Procedural Animation and Shading in Crysis](https://developer.nvidia.com/gpugems/gpugems3/part-iii-rendering/chapter-16-vegetation-procedural-animation-and-shading-crysis). Examined main bending versus detail bending, spatial variation, stiffness attributes, and foliage shading. Maple Line already has anchored wind and matching shadow deformation. The next application is species-specific response and crown readability, not adding another wind system. Preserve the game's restrained motion instead of copying Crysis amplitudes or its rendering architecture.

### Physically Based Rendering, fourth edition — Pharr, Jakob, and Humphreys (2023)

[Texture Sampling and Antialiasing, §10.1](https://www.pbr-book.org/4ed/Textures_and_Materials/Texture_Sampling_and_Antialiasing) and [Image Texture, mipmap discussion in §10.4](https://www.pbr-book.org/4ed/Textures_and_Materials/Image_Texture). Examined texture footprints and filtered image lookup. A moving train makes subpixel detail especially conspicuous: resolve large forms and filter fine patterns instead of trying to retain every mark at every distance. The book uses an offline renderer; adopt the sampling principles, not its execution model.

### Robert Bridson — Fast Poisson Disk Sampling in Arbitrary Dimensions (2007)

[One-page SIGGRAPH sketch](https://www.cs.ubc.ca/~rbridson/docs/bridson-siggraph07-poissondisk.pdf). Read the algorithm and analysis: minimum spacing, a background grid, an active sample list, and bounded candidate attempts. Useful for separating trunks within a grove. It does not automatically create natural forest density or solve independently generated chunk boundaries. Those are additional design problems described in our world recipes.

## Original articles

### Amit Patel — Red Blob Games

[Making maps with noise functions](https://www.redblobgames.com/maps/terrain-from-noise/). Examined elevation noise, octaves, redistribution, and separate moisture/elevation inputs to biome selection. The useful adaptation is a few shared region fields rather than unrelated random decisions for each object. Railway and river exclusions must override those fields. This article is a map-generation explanation, not a ready-made terrain engine.

### Don McCurdy — color management

[Color management in three.js](https://www.donmccurdy.com/2020/06/17/color-management-in-threejs/) explains why lighting should operate on linear values and why color and data textures differ. Read with the maintainer's [r152 update](https://discourse.threejs.org/t/updates-to-color-management-in-three-js-r152/50791): the older post uses retired `encoding` names. Maple Line r180 uses `colorSpace` and `outputColorSpace`. Do not copy the older post's configuration verbatim or add a second display conversion to compensate for lighting.

## API and browser references

### Three.js, checked against installed r180

The installed package is `three@0.180.0`. Current online documentation can describe a newer release. The following installed implementations were inspected for the features used in the recipes; check them again when upgrading.

| Reference                                                            | Examined capability                                    | Pinned implementation                                                                               |
| -------------------------------------------------------------------- | ------------------------------------------------------ | --------------------------------------------------------------------------------------------------- |
| [Material](https://threejs.org/docs/pages/Material.html)             | Alpha-to-coverage, shader hooks, program cache keys    | [r180 Material.js](https://github.com/mrdoob/three.js/blob/r180/src/materials/Material.js)          |
| [InstancedMesh](https://threejs.org/docs/pages/InstancedMesh.html)   | Shared draws, instance updates, bounds                 | [r180 InstancedMesh.js](https://github.com/mrdoob/three.js/blob/r180/src/objects/InstancedMesh.js)  |
| [LOD](https://threejs.org/docs/pages/LOD.html)                       | Distance levels and hysteresis                         | [r180 LOD.js](https://github.com/mrdoob/three.js/blob/r180/src/objects/LOD.js)                      |
| [PMREMGenerator](https://threejs.org/docs/pages/PMREMGenerator.html) | Environment prefiltering and equirectangular input     | [r180 PMREMGenerator.js](https://github.com/mrdoob/three.js/blob/r180/src/extras/PMREMGenerator.js) |
| [Color](https://threejs.org/docs/pages/Color.html)                   | Linear working values and automatic hex/CSS conversion | [r180 Color.js](https://github.com/mrdoob/three.js/blob/r180/src/math/Color.js)                     |

[WebGPURenderer migration guidance](https://threejs.org/manual/pages/webgpurenderer) was read for migration boundaries: custom `ShaderMaterial`, `RawShaderMaterial`, and `onBeforeCompile` workflows need node-material/TSL equivalents; the WebGL postprocessing chain is also not interchangeable. Treat current guidance as research for a separately pinned prototype, not proof that newer APIs exist in r180.

### MDN — WebGL best practices

[Browser graphics guidance](https://developer.mozilla.org/en-US/docs/Web/API/WebGL_API/WebGL_best_practices). Examined batching, back-buffer size, optional extensions, memory budgeting, blocking queries, shader compilation, and mipmaps. Browser/GPU synchronization and offscreen work can dominate costs that scene triangle counts miss. Maple Line already has a physical-pixel cap; further optimization needs evidence from the active passes. Avoid synchronous GPU readback inside a normal frame loop.

## Reading queue, not completed research

- PCG book chapters 4 and 12: terrain and generator evaluation. PDF retrieval was unreliable in this session.
- [GPU Gems 3 chapter 1](https://developer.nvidia.com/gpugems/gpugems3/part-i-geometry/chapter-1-generating-complex-procedural-terrains-using-gpu): introductory overview only. Density-field terrain is a different representation, not a patch for the present railway terrain.
- [Inigo Quilez: domain warping](https://iquilezles.org/articles/warp/): fetch failed. Domain-warping notes above rely on the Book of Shaders section instead.
- [Three.js Journey: Performance tips](https://threejs-journey.com/lessons/performance-tips): course page located; full lesson not treated as read. No purchase is needed to use this library.
- [Three.js Shading Language](https://github.com/mrdoob/three.js/wiki/Three.js-Shading-Language): reference located for a future port; no TSL implementation has been validated here.

## Train and lake application, 21 September 2026

Rechecked the InstancedMesh and GPU Gems water references above for the carriage and lake work. Passenger parts and straps update instance matrices; lake time changes through shader uniforms without recompiling programs. Lake water uses small normal and color variations on a level surface. The waterfall material scrolls streaks through UVs; it is an authored visual approximation. These hooks were exercised with the installed Three.js r180 WebGLRenderer. Ownership and streamed disposal are covered by the lake tests; browser evidence and its measurement limits are recorded in [Train interiors and regional lakes](../TRAIN-AND-LAKES.md).

## Cyberpunk city production references — 2026-09-21

Read CDPR’s art-director interview, Treehouse Ninjas’ environment-and-lighting production account, and the official metro update notes. The public GDC lighting abstract was also consulted; the full talk was not reviewed. Links, reading scope, and the implemented adaptations are recorded in [Tokyo passage and Harumi transit frontage](tokyo-passage.md). These are art-direction references for the bounded browser scene, not evidence of matching Cyberpunk’s renderer or asset fidelity.
