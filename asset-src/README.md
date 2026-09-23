# Asset sources

Python build scripts that make Maple Line's hand-made 3D assets in Blender. Each script builds one asset from data, writes a JSON report and exports a GLB into `apps/game/public/models/`. The scripts are the source of truth; `.blend` files are not kept.

| Asset                     | Script                             | Output                                         | Report                                    |
| ------------------------- | ---------------------------------- | ---------------------------------------------- | ----------------------------------------- |
| Mr. Sato (commuter-1)     | `characters/momiji-cast/build.py`  | `models/characters/commuter-hero.glb` (260 KB) | `characters/momiji-cast/sato.report.json`   |
| Riko (commuter-2)         | `characters/momiji-cast/build.py`  | `models/characters/student-riko.glb` (268 KB)  | `characters/momiji-cast/riko.report.json`   |
| Mr. Ishida (reader-1)     | `characters/momiji-cast/build.py`  | `models/characters/reader-ishida.glb` (274 KB) | `characters/momiji-cast/ishida.report.json` |
| Station shelter           | `modules/station-shelter/build.py` | `models/modules/station-shelter.glb` (29 KB)   | `modules/station-shelter/report.json`       |
| VRM test cast (all three) | `characters/vrm-cast/build.py` + `make-vrm.mjs` | `models/characters/vrm/{riko,sato,ishida}.vrm` (306–368 KB) | `characters/vrm-cast/<cast>.report.json` |
| Shared VRM clips          | `characters/vrm-cast/retarget.mjs` | `models/characters/vrm/cast-clips.vrma` (120 KB) | `characters/vrm-cast/clips.report.json`   |

## VRM cast (anime style)

The game draws Momiji's three people as VRM 1.0 characters (see [anime characters](../docs/research/ANIME-CHARACTERS.md)). The current VRMs are pipeline test figures. The build runs in three steps from the repository root:

```sh
blender -b --factory-startup --python-exit-code 1 --python asset-src/characters/vrm-cast/build.py -- --cast all
node asset-src/characters/vrm-cast/make-vrm.mjs riko sato ishida
node asset-src/characters/vrm-cast/retarget.mjs
```

1. **`build.py` (Blender).** Builds each profile: a VRM humanoid skeleton in T-pose, a skin-modifier body, clothes as material regions, a face of layered decals with VRM expression shape keys, and strand hair with spring-bone chains. It writes a GLB and a sidecar (`<cast>.vrm.json`) into `characters/vrm-cast/build/`, which git ignores.
2. **`make-vrm.mjs`.** Adds VRMC_vrm (meta, humanoid, expressions, look-at), VRMC_springBone and VRMC_materials_mtoon from the sidecar. Geometry stays as Blender exported it, meshopt included.
3. **`retarget.mjs`.** Turns a humanoid rig's clips into one VRM Animation file. Rest-pose differences (arms down against the VRM T-pose) are corrected. It measures stride and seat height per unit of hips height, so the game can scale them to each character. Its `ual` rig map is for Quaternius UAL once that is downloaded.

`apps/game/tests/vrm-cast.test.js` checks the humanoid bones, expressions, springs, MToon on every material, the clip set and gait. It also loads a VRM with three-vrm in Node and checks the idle pose. The dev server serves `/character-lab.html` for close looks under the game's light (`?view=face`, `?clip=walk`, `?expr=happy:1`, `?compare=1`).

Shared helpers live in `lib/maple_assets.py`: empty-scene reset, vertex-colour material, deterministic ray-cast ambient occlusion, GLB export settings and review renders.

## Build

Blender 5.2 or newer. From the repository root:

```sh
blender -b --factory-startup --python-exit-code 1 --python asset-src/characters/momiji-cast/build.py -- --cast all
blender -b --factory-startup --python-exit-code 1 --python asset-src/modules/station-shelter/build.py
```

Add `-- --render <folder>` to write review renders (front, three-quarter, side, face, one per clip and one per face shape for the character; platform, cab distance and LOD1 for the shelter). Keep renders in a scratch folder, not the repository. Agents can run the same files through the Blender MCP with `execute_blender_code`; see the [Blender asset skill](../.agents/skills/maple-blender-assets/SKILL.md).

Commit the script, reports and GLBs together. `apps/game/tests/blender-assets.test.js` reads the GLBs and reports and fails if a clip, face shape, bone, gait value, detail level or budget drifts. Two builds give byte-identical reports and GLBs.

## What the cast contains

One builder makes every cast member from a row in `PROFILES` (height, width, trousers or skirt, hair style, colours, props, stoop). They share one skeleton and one clip set, so a clip change reaches everyone.

| Cast       | Height | Triangles | Props                                               |
| ---------- | ------ | --------- | --------------------------------------------------- |
| Mr. Sato   | 1.71 m | 2,295     | shoulder bag, phone                                 |
| Riko       | 1.58 m | 2,543     | blazer, pleated skirt, school bag, phone, the radio |
| Mr. Ishida | 1.66 m | 2,403     | glasses, a stoop, a newspaper as its own mesh       |

- One vertex-colour material, 24 deform bones with Mixamo-style names plus `eye-l` and `eye-r`, feet on the ground, facing +Z in three.js.
- Face shapes `blink-l`, `blink-r`, `jaw-open`, `smile`. New shape keys start at 1.0 in Blender 5.2, so the script sets them to 0; otherwise the model loads with closed eyes.
- In-place clips named after the NPC minds' intents: `idle`, `walk`, `hurry`, `wave`, `check-phone`, `sit`, `watch-train`, `shelter`, `chat`, `stretch`, and `board` (a single step up, not a loop). Every loop closes exactly.
- The armature node's extras carry `walkSpeed`, `hurrySpeed` and `seatHeight`, measured from the built clips. The game uses them to match foot speed to the simulation and to put a seated figure on its bench.
- In the game (`apps/game/src/world/hero-cast.js`, `MOMIJI_CAST`) each model stands in for one Momiji person. The simulation still moves the person; the model follows, picks a clip from boarding, seating, speed and the NPC mind's intent, blinks every few seconds, smiles with a cheerful or content mood, and moves its jaw while an episode line for that character is on screen. Ishida's paper shows only while he sits.

## What the shelter contains

- LOD0 900 triangles, LOD1 84 triangles, one material, baked ambient occlusion in vertex colour, a `socket.bench-seat-1` empty, and `kind`/`lod` extras that the game reads.
- Placed at the Momiji platform end by `apps/game/src/world/station-modules.js`, switching to LOD1 beyond 70 m.

## Provenance

All assets here are made entirely by these scripts: no downloaded meshes, textures, rigs or motion data. The VRM clips are retargeted from the Blender cast's own clips. Outside files (the three-vrm libraries so far) are recorded with licence, source, size and SHA-256 in [THIRD_PARTY.md](THIRD_PARTY.md), following [character sources](../docs/research/CHARACTER-SOURCES.md).
