# Procedural world recipes

Read the [codebase map](codebase-map.md) first. These recipes are proposed Maple Line adaptations of the [reading record](sources.md), not existing features unless stated otherwise.

## 1. Shared region fields

Use a small set of world-coordinate fields for broad variation: moisture, exposure, forest density, and clearing preference. Combine them with existing elevation/slope queries; do not replace railway terrain with an unrelated height function. Low-frequency noise establishes regional variation; smaller variation can affect color or undergrowth. [Red Blob's terrain article](https://www.redblobgames.com/maps/terrain-from-noise/) and [the Book of Shaders fBm chapter](https://thebookofshaders.com/13/) supply the underlying ideas.

Proposed data flow:

```text
world seed + generation version + world position
    → region fields
    → route / river / station / authored clearing constraints
    → accepted placements and species / size / color choices
    → shared geometry and material batches
```

Evaluate exclusion rules first. Then use region fields to choose probabilities rather than hard color bands. Ground tint, tree species, and understory should respond to the same regional inputs. Avoid correlating every property: a damp grove can still contain variation in age and orientation.

**First slice:** one adjacent pair of forest chunks, with one clearing and a river exclusion. Check continuity by sampling positions on both sides of their boundary. No terrain displacement is needed for this experiment.

## 2. Determinism that survives edits and streaming

Current chunks already have a seeded random stream. For new generators, derive independent streams from a world seed, a documented generation version, a spatial cell identifier, and a feature namespace. Adding a bird must not reroll all trees merely because it consumed an earlier random number.

This is a proposed project contract, not an existing helper API. Choose a stable integer hash, fixed coordinate quantization, and stable iteration order. Avoid wall-clock time, frame rate, platform-dependent object ordering, and camera position in persistent placement decisions. Camera position may choose which data is resident, not what the place contains.

For spacing across chunks, a halo alone is insufficient if two samplers make independent choices. One bounded approach is world-cell candidates with stable priorities: generate neighboring candidates within the maximum interaction radius, reject conflicting candidates by the same priority rule, and emit each winner only from its owning cell. An alternative is a precomputed regional sample set partitioned into chunks. Document the chosen ownership rule.

**Checks:** generate A then B and B then A; reverse travel; unload and revisit; regenerate from the same seed. Compare stable placement records, not GPU object identities. A deliberate algorithm change increments the generation version.

## 3. Groves with minimum trunk spacing

Start from forest-density fields and a few grove centers, then sample trunks within those regions. Keep open areas open. [Bridson's paper](https://www.cs.ubc.ca/~rbridson/docs/bridson-siggraph07-poissondisk.pdf) gives a practical minimum-distance sampler; using it uniformly over the whole valley would produce a different visual pattern from clustered woods.

Use a small set of spacing classes initially. Variable-radius spacing needs an explicit pairwise exclusion rule; do not assume the fixed-radius algorithm handles it unchanged. Reject track, platform, river, and steep unsupported placements before emitting batches. Bound candidate attempts so a narrow valid area cannot stall chunk creation.

**First slice:** compare existing placement and clustered placement at the same tree count and identical lighting. Evaluate the view from the cab as well as from above. Reject results that hide railway signals or make every grove a circular island.

## 4. Shape grammars with bounded output

[PCG book chapter 5](https://www.pcgbook.com/chapter05.pdf) introduces rewriting systems for structural variation. For Maple Line, begin with a small grammar for trunk → branch tiers → crown clusters, or building footprint → roof family → porch/window arrangement. Set recursion depth, minimum segment size, total vertices, and allowed proportions explicitly.

Generate a small catalog once, then instance those variants. Choose among variants using the placement seed, with constrained scale and color variation. A unique geometry and material per tree would defeat the existing batching design.

Keep art direction in the rules: distinguish conifer from broadleaf silhouette; make roof pitch and eaves consistent within one village family. A grammar does not establish architectural or botanical accuracy. Use appropriate visual references before claiming a specific real-world species or building tradition.

**Checks:** no zero-length branches, NaN transforms, unsupported building bases, unbounded recursion, or exploding batch counts. Inspect multiple seeds for repeated silhouettes and outliers.

## 5. Generator evaluation

Our proposed evaluation combines validity, repeatability, appearance, and cost. It is not a summary of the PCG book's unread evaluation chapter.

Use a fixed seed set plus deliberately difficult cases: narrow land beside a river, station approaches, steep slopes, chunk borders, and very low/high density. Record accepted count, rejected count by constraint, generation time, resulting batches, and resource counts. Check repeated regeneration and chunk traversal for allocation growth.

Judge variation in a contact sheet at the same camera poses. Ask whether different seeds produce distinct but recognizable places, whether clearings and waterways remain legible, and whether rare outliers violate the intended style. Do not optimize only for the number of unique outputs.

Keep generation work out of the frame loop where possible. Measure before moving it to a worker: workers can prepare serializable positions and buffers, while main-thread scene attachment and GPU upload still need a budget. Requests need a generation ID so stale results cannot replace a newer world.
