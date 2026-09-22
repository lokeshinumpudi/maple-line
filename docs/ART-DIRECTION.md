# Maple Line: material, weather and place direction

## Intent

An inhabited regional railway seen through Haru's lifetime of attention: maintained machinery, repaired timber, water collecting beside platforms, and small human activities that continue when the train leaves. The train's vermilion and ivory remain recognizable across weather. Detail should explain use, age, shelter or geology.

This document is a work brief, not a claim that these features are complete.

## What the current view is missing

The Momiji follow-camera inspection shows large pale green slopes, widely spaced vegetation, weak separation between distant and near surfaces, and repeated flat building elevations. These are composition problems as well as mesh problems. More triangles alone will not change them.

Existing systems include weather-dependent sky reflections, water reflection/refraction, surface noise, rain rings, regional residents and situational audio. Each needs to agree with its neighbours. Cached sky reflections do not reflect nearby buildings; rain rings do not establish puddles or drainage; a roof-rain track does not establish shelter detection.

## Scene targets

| Scene           | Colour and material                                                                                  | Water and motion                                                                                            | Sound and life                                                                                                 |
| --------------- | ---------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| Morning village | Warm ivory train sides; restrained vermilion; dark timber beneath eaves; shaded ground beneath trees | Quiet irrigation water, restrained leaves, laundry only in exposed yards                                    | Birds in vegetation, footsteps from actual walkers, an open platform beside a quieter closed cabin             |
| Rain at Momiji  | Porous surfaces darken; paint and stone gain different highlights; sheltered surfaces remain drier   | Ground-fixed impacts; pooling only on suitable level surfaces; gutters and drainage before decorative spray | Roof impacts inside the carriage; outdoor rain attenuated through closed doors; voices near occupied platforms |
| Snow ascent     | Cool skylight, warm windows, lower saturation at distance; snow remains matte except meltwater       | Reduced foliage motion, sheltered precipitation, later accumulation on upward surfaces                      | Quieter forest, distinct rail sound, cabin mechanics and intermittent exterior wind                            |
| Harbour dusk    | Warm practical lights against a cool sky; worn painted sheds; deliberate pools of brightness         | Reflections agree with visible light sources; water movement follows its basin                              | Waterfront ambience near water; station activity around the arriving service                                   |
| City approach   | Low-rise outskirts become connected blocks before the skyline; varied silhouettes and setbacks       | Street surfaces, drains, sheltered platforms; bounded traffic paths                                         | Urban activity grows with occupied blocks, with no countryside birds deep inside the centre                    |

## Work ownership and order

1. Train materials and cabin: correct five-car topology, preserve sightlines, wet exterior paint without wetting passengers or seats. No additional light or reflection pass.
2. Ground contact: stop rain rings sliding with the train; align them to terrain; reject steep slopes. Roof interception and true puddles require surface classification and remain a later task.
3. Sound context: use actual water sources and visible residents, distinguish the listener's enclosure from the train's tunnel position, preserve narration ducking and mute.
4. Shadow experiment: stabilize the existing directional shadow projection before increasing resolution. Compare contact, moving edges and bias in dry/rain/snow conditions.
5. Regional art: give buildings side elevations and inhabited edges; group vegetation by slope and moisture; add foreground/middle-distance/distant masses. Preserve railway clearances and shared batches.
6. Human detail: attached limb endpoints, readable seated poses and purposeful activity. Add no independent per-person materials.
7. Physics: fix demonstrated defects without retuning handling by intuition. Visual suspension must follow acceleration and remain separate from rail-constrained movement.

## Acceptance

Use the same station, camera, viewport, weather, daylight and physical resolution for comparisons. Wait for camera movement to settle before measuring. Inspect cab, passenger and exterior views, both travel directions, and a region change. Record animation-frame p95, CPU p95, all-pass draw count and triangles; CPU timing is not GPU timing. Keep the current adaptive-resolution controller, 2048-square shadow target and bounded capture refresh until measurements justify changes.

Automated tests establish invariants, not artistic quality. Review screenshots for material identity, grounded contact and composition. Audio requires a listening pass; a passing mixer test does not establish that a scene sounds convincing. Integrate isolated worker changes only after source review and tests. Keep the player's existing tab untouched during evaluation.
