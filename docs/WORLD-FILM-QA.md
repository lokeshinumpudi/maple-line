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
