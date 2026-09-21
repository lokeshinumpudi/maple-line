---
name: maple-browser-graphics
description: Improve Maple Line Three.js graphics and frame pacing, including foliage shimmer, detail levels, materials, lighting, shadows, water, shader hooks, and WebGPU feasibility. Use for rendering quality or performance work in this game. Do not use for HUD layout alone or procedural placement without a rendering issue.
---

# Maple browser graphics

Resolve the repository root three directories above this skill. Read [Maple Line development](../maple-line-dev/SKILL.md), then the [graphics codebase map](../../../docs/graphics-research/codebase-map.md). Verify installed Three.js and current source before using APIs from a tutorial. The research baseline is r180 WebGLRenderer, not a promise about future versions.

## Workflow

1. Identify the artifact: edge shimmer, popping, incorrect color, stale capture, shadow issue, or frame-time spike. Capture it in the relevant camera while stationary and moving.
2. Read the corresponding [rendering recipe](../../../docs/graphics-research/rendering-techniques.md) and its original reference. Check API behavior against the installed package; older books explain techniques, not current Three.js configuration.
3. Record a baseline using the [experiment protocol](../../../docs/GRAPHICS-RESEARCH.md#how-to-evaluate-an-experiment). Keep camera, weather, speed, viewport, and physical resolution comparable. CPU frame timing is not GPU timing; draw counts do not describe overdraw or memory bytes.
4. Change one variable or one material family. Preserve the game's silhouettes and restrained motion. Do not add a new render pass merely because an example includes it.
5. Inspect the main view and affected reflection, refraction, and shadow passes. Test relevant weather, reverse travel, camera switches, and distance transitions. Check browser errors and resource ownership.
6. Run project checks and report observed visual improvement and measured cost. Keep unmeasured performance claims out of docs and completion reports.

## Compatibility and ownership

- The renderer already has adaptive resolution, culling, instancing, and limited capture refresh. Inspect these systems before proposing replacements.
- Alpha-to-coverage needs multisampling in the pass being evaluated. Inspect offscreen targets separately; keep a usable cutout fallback.
- Preserve wind in visible and shadow shaders, instance scaling, and conservative bounds when changing foliage.
- Chain existing shader hooks and program cache keys. Use uniforms for weather/time values. Changing uniforms must not force new programs every frame.
- Preserve linear lighting, texture color-space intent, and one final display conversion. Do not paste obsolete `encoding` APIs from older articles.
- Add detail levels to batches with explicit transitions and bounds. Avoid thousands of new independently updated scene nodes.
- Dispose only resources owned by the retired feature/chunk. Keep shared materials and geometry alive while used elsewhere.
- A WebGPU request requires a separately pinned parity prototype: existing custom GLSL and `onBeforeCompile` code need a node-material/TSL port. Do not promise a speedup from the renderer name.

Use [maple-procedural-worlds](../maple-procedural-worlds/SKILL.md) for region composition, seed contracts, and scenery placement. Add newly verified techniques to the [reading record](../../../docs/graphics-research/sources.md), including version limits and sections actually read.
