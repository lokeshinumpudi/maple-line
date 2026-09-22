# World review through moving camera shots

The trailer is used to expose game defects before editing the final video. Captures use the actual game renderer; camera paths call the game's exterior clearance helper. The runbook video records its real controls and embedded game.

## September 2026 fixes

- Original and regional terrain share cross-section samples and the same height at their boundary. The lateral ground now extends 1,600 metres either side of the railway. Ground continues before the opening valley and beyond the terminal, covering wide views.
- Broad, gentler valley margins replace the original constant steep bank. Regional mountain contributions fade around bridges and tunnels instead of switching off at a hard boundary. Track elevation, grades and stop locations are unchanged.
- Inspection cameras check terrain clearance. Loaded rural and Tokyo building volumes prevent exterior cameras from sitting inside their walls. The same helper supports cinematic capture paths.
- Wildlife uses a bounded, deterministic search for dry, gentle, unobstructed banks. Tree crowns and authored building/field clearings exclude spawning. Walking proposals must stay inside valid habitat. Inspection state reports whether each deer has a valid habitat.
- Mammal legs reach their bodies without raising their feet above the ground plane.
- Timber boards, stone, roof tiles and facade panels receive procedural surface relief. Tokyo buildings have side/rear window frames, panes and sills. This uses shared geometry/material batches rather than a unique downloaded texture for every building. The city batch cap increases from 21 to 22 for its facade material.
- Wind moves crowns farther and gusts cycle in about 13 seconds. Trunk movement stays small. Visible, depth and shadow passes share wind values, with expanded culling bounds.

## Repeatable checks

Record the river valley, bridge, wildlife bank, passenger compartment, snow station, Tokyo street and lake lookout. Inspect the beginning, middle and end of each moving shot. Reject terrain cutaways, cameras inside objects, unsupported wildlife, floating facade pieces and abrupt path corrections. Keep wildlife within its wider habitat rather than filling the frame with an animal's face.

Unit coverage includes terrain seam agreement, continuous landmark height transitions, camera clearance, building volumes, habitat exclusions, wind shader parity and resource ownership. Full project checks and browser inspection remain required after source changes. A 30 fps capture is not a claim that every device runs the game at that rate.

Capture scripts and review frames are local artifacts under `artifacts/launch-videos/`; they are not shipped with the game. The route remains a fictional, stylized Japanese railway rather than a geographic reconstruction.

## Shadow, snow and daylight follow-up

The moving train and wind now refresh the shadow image every rendered frame. The former 20 Hz refresh left moving casters behind their visible positions. Original-valley foliage no longer switches its shadow casting off at a separate 180 m boundary; the shadow camera handles its visibility.

Station districts use 2 m ground sections to resolve terrace edges. Rural foundations match building footprints and extend below sampled ground, replacing oversized shallow slabs.

Track snow uses a bounded mesh around the camera. Its raised shoulders and centre leave grooves around the steel running heads. Accumulation and melting take time; permanent alpine cover comes from elevation. Tunnels and the main viaduct are excluded. This is a visual snow layer, not a snow physics simulation, and does not yet accumulate on every building or train roof.

The Time of day selector offers afternoon, sunrise, sunset and blue hour. The sky, sun, water and cached environment use matching directions. The embed and agent controls accept the same four values. These are selectable lighting views, not an automatic astronomical day cycle.

Desktop verification: dedicated Chrome Agent, 1920 × 1080 CSS viewport with the normal two-million-pixel cap. Five-second samples at Sakuragawa, 12 m/s, clear weather, matched cab/passenger/follow views compared the former 20 Hz cadence with per-frame shadows. All six samples averaged about 60 fps; this measures this desktop browser only. Raw frame/CPU timings and draw counts are saved in `artifacts/launch-videos/shadow-performance.json`; CPU time is not GPU time. No runtime exceptions were reported during these samples. The updated project passed all 13 check tasks, including 479 game tests.

The bridge review removed village lots and paths from the ravine. Its river now shares a curved profile with the carved bed; nearby trees respect the riverbanks. The former flat water box was only visible as a small rectangle where it intersected the ground.
