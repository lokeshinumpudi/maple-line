# Scenery presentation pass

Implemented 2026-09-21 from the [world](world-techniques.md) and [rendering](rendering-techniques.md) recipes. This pass retains Three.js r180 WebGLRenderer.

## Changes

- Terrain colors now use smoothed vertex normals and world-coordinate moisture/grove fields. Meadow, moss, rock, shore and regional snow colors blend continuously. Track and terrain positions are unchanged.
- Forest acceptance uses a seeded spatial density field in the default valley, Jev-generated valley, and regional chunks. Candidate attempts stay bounded. Existing railway, river, station, bridge and tunnel exclusions remain in place. This creates density variation; it does not implement minimum-distance trunk sampling or new detail levels.
- Visible sky and material reflections use one palette source for clear, rain, snow and dusk. Six small environments are generated during setup and reused on weather changes. The visible atmosphere interpolates; environment selection changes discretely. No per-frame PMREM generation or new postprocessing pass is added.
- Leaf textures have softened shape edges and color in transparent texels for filtering. Alpha-to-coverage was tried and rejected after distant foliage appeared too pale in the browser; regular alpha-tested rendering remains active.
- Golden dusk motes use one point batch with a capacity of 140. Placements are world-anchored above dry ground, away from the track, and regenerated into the same buffers when travelling. They are limited to clear, non-winter evenings in the original valley. This is an artistic effect, not a species simulation.

## Validation

New automated checks cover continuous seeded fields across positive/negative boundaries, query-order independence, matching colors at shared terrain vertices without position changes, and mote clearance, pause, buffer reuse and disposal. Existing forest and wind tests cover railway/river clearances, repeatability, depth/shadow deformation, and disposal; regional tests cover bounded streaming and tunnel geometry.

The [browser verification record](../../artifacts/localhost/game-control/dream-presentation-verification.md) covers clear, rain, snow, dusk, world creation, and desktop/mobile driving controls. Final screenshots are saved under `artifacts/screenshots`. Visual checks include the settled weather transition.

Early Chrome Agent observations were affected by changing tabs/viewports and concurrent development reloads; they do not support a before/after speedup claim. The final Codex browser check used a 1280 × 800 viewport, with the adaptive renderer selecting a 896 × 560 canvas. No comparable frame-rate benchmark was completed. The pass does not claim a universal frame rate or implement the research queue's chunk preparation and vegetation detail levels.
