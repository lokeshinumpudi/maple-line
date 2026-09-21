---
name: maple-procedural-worlds
description: Design and improve Maple Line procedural scenery, region masks, seeded vegetation placement, shape grammars, and chunk generation. Use for more natural forests, regional variety, repeatable worlds, generation seams, or chunk creation stalls. Do not use for HUD-only changes or unrelated games.
---

# Maple procedural worlds

Resolve the repository root three directories above this skill. Read [Maple Line development](../maple-line-dev/SKILL.md), the root README, and the [graphics codebase map](../../../docs/graphics-research/codebase-map.md). Treat that map as a dated observation and verify the current implementation.

## Workflow

1. Name the visible problem and the affected region. Distinguish original-valley generation, regional chunks, and authored level placements. Read only the relevant modules.
2. Read the matching [world recipe](../../../docs/graphics-research/world-techniques.md) and its linked original source. Shared fields fit region coherence; constrained sampling fits placement; bounded grammars fit shape variation. Do not add noise layers without a specific spatial purpose.
3. State the world seed, generation version, coordinate convention, exclusion rules, and resource ownership. Existing rail grade, stations, tunnels, and river profile are constraints. Decorative generation must not move them.
4. Implement one bounded region or adjacent chunk pair. Preserve stable placement identity and independent randomness for new feature families. Define cross-boundary ownership before adding a sampler.
5. Keep catalog geometry/materials shared and placement output serializable. If generation stalls, measure CPU assembly, upload, and first-use rendering separately before adding workers or pooling.
6. Validate difficult seeds, traversal order, unload/revisit, river/rail clearance, bounded attempts, and resource counts. Use the [experiment protocol](../../../docs/GRAPHICS-RESEARCH.md#how-to-evaluate-an-experiment) for moving views and frame time.

## Decisions that prevent regressions

- Do not implement a second streaming system: inspect `world/extended-route.js` first.
- A neighboring halo does not by itself ensure deterministic spacing. Use common candidates and conflict ownership, or partition a shared regional result.
- Give density, species, scale, and material variation related but distinct inputs. Uniform minimum spacing alone does not produce groves.
- Bound grammar recursion, candidate attempts, generated vertices, and material variants.
- Keep asynchronous generation cancellable and reject stale generations. Camera motion selects residency; it must not reroll permanent placements.
- Preserve authored IDs and undo/redo, and keep Jev transformation state separate from rendering objects.

Run the project's required formatting/checks and inspect rendered changes in the dedicated browser. Report the visible result, deterministic checks, cost observations, and limitations. Update research claims only when verified; proposals remain proposals.

Use [maple-browser-graphics](../maple-browser-graphics/SKILL.md) when the problem is leaf shimmer, material response, lighting, draw cost, or shader behavior rather than placement.
