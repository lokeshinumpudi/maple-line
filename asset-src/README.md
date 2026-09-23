# Asset sources

Python build scripts that make Maple Line's hand-made 3D assets in Blender. Each script builds one asset from data, writes a JSON report and exports a GLB into `apps/game/public/models/`. The scripts are the source of truth; `.blend` files are not kept.

| Asset           | Script                              | Output                                         | Report                                 |
| --------------- | ----------------------------------- | ---------------------------------------------- | -------------------------------------- |
| Hero commuter   | `characters/commuter-hero/build.py` | `models/characters/commuter-hero.glb` (131 KB) | `characters/commuter-hero/report.json` |
| Station shelter | `modules/station-shelter/build.py`  | `models/modules/station-shelter.glb` (29 KB)   | `modules/station-shelter/report.json`  |

Shared helpers live in `lib/maple_assets.py`: empty-scene reset, vertex-colour material, deterministic ray-cast ambient occlusion, GLB export settings and review renders.

## Build

Blender 5.2 or newer. From the repository root:

```sh
blender -b --factory-startup --python-exit-code 1 --python asset-src/characters/commuter-hero/build.py
blender -b --factory-startup --python-exit-code 1 --python asset-src/modules/station-shelter/build.py
```

Add `-- --render <folder>` to write review renders (front, three-quarter, side, face, one per clip and one per face shape for the character; platform, cab distance and LOD1 for the shelter). Keep renders in a scratch folder, not the repository. Agents can run the same files through the Blender MCP with `execute_blender_code`; see the [Blender asset skill](../.agents/skills/maple-blender-assets/SKILL.md).

Commit the script, report and GLB together. `apps/game/tests/blender-assets.test.js` reads the GLBs and reports and fails if a clip, face shape, bone, detail level or budget drifts. Two builds of the hero give identical reports.

## What the hero contains

- 2,295 triangles, one vertex-colour material, 24 deform bones with Mixamo-style names plus `eye-l` and `eye-r`, 1.71 m tall, feet on the ground, facing +Z in three.js.
- Face shapes `blink-l`, `blink-r`, `jaw-open`, `smile`. New shape keys start at 1.0 in Blender 5.2, so the script sets them to 0; otherwise the model loads with closed eyes.
- In-place clips `idle` (4 s), `walk` (1.2 s, feet move at 1.148 m/s against the 1.15 m/s walking speed), `wave` (2 s), `check-phone` (3 s). Every loop closes exactly.
- In the game it stands in for commuter-1 at Momiji (Mr. Sato in _The 17:42_). The simulation still moves the person; the model follows, picks clips from walking speed and the NPC mind's intent, blinks every few seconds, smiles with a cheerful or content mood and moves its jaw while an episode line for that character is on screen.

## What the shelter contains

- LOD0 900 triangles, LOD1 84 triangles, one material, baked ambient occlusion in vertex colour, a `socket.bench-seat-1` empty, and `kind`/`lod` extras that the game reads.
- Placed at the Momiji platform end by `apps/game/src/world/station-modules.js`, switching to LOD1 beyond 70 m.

## Provenance

Both assets are made entirely by these scripts: no downloaded meshes, textures, rigs or motion data. Record the source and licence here for any future asset that uses outside material, following [character sources](../docs/research/CHARACTER-SOURCES.md).
