# Procedural worlds and browser graphics

Research date: 2026-09-21. This is a working technique library for Maple Line, based on selected book chapters, original author articles, official documentation, and the installed Three.js source. It does not claim full-book coverage or measured improvements to the game.

## Use the research

- [Procedural world skill](../.agents/skills/maple-procedural-worlds/SKILL.md): region masks, deterministic placement, vegetation clusters, reusable shape grammars, and chunk boundaries.
- [Browser graphics skill](../.agents/skills/maple-browser-graphics/SKILL.md): foliage edges, materials, lighting, water, shader changes, detail levels, and performance diagnosis.
- [Reading record](graphics-research/sources.md): sources, sections examined, compatibility limits, and further reading.
- [World techniques](graphics-research/world-techniques.md) and [rendering techniques](graphics-research/rendering-techniques.md): implementation recipes with failure cases.
- [Codebase map](graphics-research/codebase-map.md): what the game already implements and where to work.

The design target is a readable, stylized countryside seen from a moving train. Preserve distinct tree silhouettes, village shapes, quiet water, and clear railway views. More fine detail is useful only when it survives motion and the available screen resolution.

## First experiments

The first [presentation pass](graphics-research/presentation-pass.md) now implements terrain color transitions, clustered density fields, shared atmosphere/reflection palettes, leaf texture filtering, and dusk motes. The table below remains the original research queue; its other experiments are still proposals.

These are proposals, not completed features. The order reflects fit with the inspected code and expected scope; it is not a benchmark result. Recheck the codebase map before starting because other work is changing the game.

| Order | Experiment                                               | Why this is a candidate                                                                            | Completion evidence                                                                                                                                                  |
| ----- | -------------------------------------------------------- | -------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1     | Stabilize foliage edges                                  | Leaves already use mipmapped cutouts; alpha-to-coverage is not enabled in the inspected materials. | Moving A/B captures show fewer crawling edges without thin/disappearing crowns; check direct view, water captures, shadows, and frame time.                          |
| 2     | Diagnose chunk-entry stalls                              | Regional chunks are bounded and seeded, but missing chunks are built synchronously.                | Time generation, upload, and first visible frame separately. If generation causes a spike, prepare one neighboring chunk ahead with cancellation and a memory bound. |
| 3     | Give one forest region structured clearings and clusters | A shared spatial description can relate tree placement to water, slopes, and open views.           | Same seed returns the same forest after unload/reload; no track/river intrusions or border seams; silhouettes remain readable.                                       |
| 4     | Add two vegetation detail levels                         | Current batching and culling provide an integration point.                                         | Matching distant crown mass, no rapid switching in reverse or camera changes, fewer submitted triangles without extra frame-time spikes.                             |
| 5     | Match environment reflections to weather                 | The inspected environment texture is generated once; atmosphere changes its intensity.             | Rain and dusk reflections agree with visible sky colors; transitions do not repeatedly compile shaders or allocate targets.                                          |
| 6     | Expand a small tree/building shape catalog               | Reusing a few generated variants can add identity while retaining instancing.                      | Multiple seeds produce recognizable families with bounded mesh/material counts and valid platform/track clearances.                                                  |
| 7     | Tune material detail and water capture timing            | Surface filtering, wet roughness, reflection, and refraction already exist.                        | Close and distant views retain material identity; camera turns do not expose stale reflections; added work has measured cost.                                        |

For the first visual implementation, start with experiment 1 in one forest view. Do not combine it with new lighting, different tree counts, and resolution changes; those would prevent attribution of the result.

## How to evaluate an experiment

Record the baseline before changing a feature. Use the same route position, direction, camera, speed, weather, time of day, season, seed, browser, and viewport. Capture a stationary view for composition and a moving segment for shimmer, popping, and capture lag.

Use the existing `measure_game_performance` tool for three comparable five-second runs after warmup. Record physical canvas dimensions and adaptive quality at the beginning and end. If quality changes, compare at a controlled resolution in a local experiment as well as with normal adaptation enabled. A faster result at fewer pixels is a quality tradeoff, not evidence of a cheaper shader at equal quality.

Record frame interval median/p95/max, CPU timing, all-pass calls/triangles, and texture/geometry counts. CPU submission timing is not GPU execution time. Resource counts are not memory bytes. A 60 fps target allows approximately 16.67 ms per displayed frame; it is a target, not a measured result. Inspect a browser performance trace when frame pacing and CPU measurements disagree. Keep GPU timer instrumentation optional and check support before adding it.

Choose relevant cases from this matrix instead of running every combination for every edit:

| Change                            | Required views and transitions                                                                                  |
| --------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| Vegetation / detail levels        | Forest near and far, Scenic and Driver, forward and reverse, clear and precipitation, chunk boundary and return |
| Material / lighting               | Village roof and plaster, train paint/glass, snow summit, clear → rain → dusk, pause/resume                     |
| Water                             | River bend and bridge, shallow bank and deep channel, fast camera turn, train reflection, clear and rain        |
| Streaming / generation            | Several adjacent chunks, teleport, reversal, unload/revisit, repeated seed, rapid change cancellation           |
| Renderer or shader infrastructure | All above plus shadow silhouettes, fog, snow, instancing, resize, context errors, disposal                      |

Save before/after screenshots and performance records under `artifacts/`. Describe the artifact reduced, the observed cost, and any remaining failure. Keep an experiment only when the intended visual improvement is visible and its frame-time/resource tradeoff is acceptable. Establish a per-experiment regression allowance from the baseline before tuning; do not invent a universal hardware budget.

## Later study

WebGPU/TSL deserves an isolated parity prototype after the WebGL improvements. It is not a one-line renderer replacement: Maple Line has custom shader hooks and water shaders. Volumetric clouds, screen-space ambient occlusion, erosion, and volumetric terrain are separate experiments with extra passes, generation costs, or architectural changes. None is a prerequisite for the work above.

Extend the reading record when a new question arises. Record the section actually read, the applicable renderer/version, and an experiment that could disprove the proposed benefit. Do not turn untested ideas into claims about implemented game behavior.
