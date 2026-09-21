# Generated valley scenery, version 2

Implemented 2026-09-21 in `procedural-world.js` and `seasonal-meadow.js`. Applies to the original valley when a live or saved Jev plan is activated. The saved model responses stay unchanged; this updates how their plans are rendered. Regional streaming and authored scenery use their existing generators.

## Visible changes

Generated broadleaf trees have four branch forks and seven overlapping crown clusters, with darker lower clusters and lighter upper clusters. Trunk thickness follows height. Spring has a stronger pink palette; grove moisture influences color families and conifer probability, while a separate sample varies age. A 3.2 m minimum trunk separation removes nearly coincident trees. Crowns can overlap.

Seasonal meadow patches add tapered grass blades and small open flower or seed heads along grove margins. Spring, summer, autumn and winter use separate palettes. Patches follow the local terrain normal, avoid sharp changes in grade, and keep their footprint outside the railway, river and landmark exclusions. Snow tint now favors upward-facing tree surfaces and retains some underlying color.

## Generation and ownership

- `SCENERY_GENERATION_VERSION = 2`; each generated root records this version. A saved seed reproduces version 2, but its tree positions differ from version 1.
- Coordinates are metres: `z` follows the original valley, `u` is relative to `center(z)`, and world `x = center(z) + u`. Terrain heights and railway geometry do not change.
- Tree candidates retain bounded attempts: 2,200 sparse, 5,600 balanced, 8,200 dense. Appearance hashes do not consume placement randomness. Lower-density layouts are prefixes of the same accepted candidate sequence.
- Meadow candidates have a separate seed namespace and 5,000 bounded attempts. Ground samples hold world X fixed when measuring the slope along Z; this matters where the river center bends.
- All placements are prepared together, then grouped into 120 m rendering buckets. There is one owner for spacing and no independently generated neighbor boundary.
- Branches share the trunk geometry and draw batch. Cylinder ends hidden in soil or crowns are open to avoid unused cap triangles. Meadows add one shared geometry and at most 14 batches. The existing root owns disposal, wind bindings, and distance culling; individual plants do not add per-frame updates.

The field composition follows the existing project recipe and [Red Blob Games’ original discussion of biome fields and tree placement](https://www.redblobgames.com/maps/terrain-from-noise/). No new noise library or terrain displacement was added.

## Verification

All 24 saved plans were assembled and disposed with both generator versions using identical synthetic terrain. Counts and assembly observations are in `artifacts/localhost/game-control/jev-beauty-catalog-cost.json`. These are CPU assembly and geometry counts, not GPU timings or real-terrain frame costs.

Automated checks cover all saved seeds, trunk spacing in winding coordinates, density subsets, repeatability, independent meadow randomness, rail/river/landmark clearance, slope alignment, cliff rejection and disposal of instanced buffers.

Browser inspection covered spring daylight, winter snow at dusk, autumn dusk and summer rain, plus a moving Driver view. Before/after screenshots are under `artifacts/screenshots/jev-*-before.png` and `jev-*-after.png`. No runtime errors were reported in the inspected preview.

Three five-second stationary samples were saved before and after, plus a moving sample. The shared workspace changed camera framing and other scenery between builds, and physical resolution also differed. Those samples establish that the scenes ran, but do not establish a performance improvement or regression attributable to this pass. Reverse traversal was not separately exercised. This is a forest and meadow pass; buildings, lighting, water and the extended route retain their existing designs.
