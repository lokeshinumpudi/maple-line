# Asset sources

Build scripts that make Maple Line's hand-made 3D assets, mostly in Blender. Each script builds one asset from data, writes a JSON report and exports a GLB or VRM into `apps/game/public/models/`. The scripts are the source of truth; `.blend` files are not kept.

| Asset                       | Script                                                       | Output                                                  | Report                                      |
| --------------------------- | ------------------------------------------------------------ | ------------------------------------------------------- | ------------------------------------------- |
| Riko (commuter-2)           | `characters/concept-cast/build.py` + `vrm-cast/make-vrm.mjs` | `models/characters/vrm/riko.vrm` (499 KB)               | `characters/concept-cast/riko.report.json`  |
| Riko's radio and phone      | `characters/concept-cast/props.py`                           | `models/characters/props/riko.glb` (48 KB)              | `characters/concept-cast/props.report.json` |
| Mr. Sato, Mr. Ishida (test) | `characters/vrm-cast/build.py` + `make-vrm.mjs`              | `models/characters/vrm/{sato,ishida}.vrm` (300 KB each) | `characters/vrm-cast/<cast>.report.json`    |
| Shared VRM clips            | `characters/vrm-cast/retarget.mjs`                           | `models/characters/vrm/cast-clips.vrma` (350 KB)        | `characters/vrm-cast/clips.report.json`     |
| Station shelter             | `modules/station-shelter/build.py`                           | `models/modules/station-shelter.glb` (29 KB)            | `modules/station-shelter/report.json`       |
| Momiji EMU (five cars)      | `vehicles/momiji-emu/build.py`                               | `models/vehicles/momiji-emu.glb` (517 KB)               | `vehicles/momiji-emu/report.json`           |

Shared helpers live in `lib/`: `maple_assets.py` (empty-scene reset, vertex-colour material, deterministic ray-cast ambient occlusion, GLB export settings and review renders) and `glb.mjs` (reading and writing GLB files in Node).

## Build

Blender 5.2 or newer. From the repository root:

```sh
blender -b --factory-startup --python-exit-code 1 --python asset-src/modules/station-shelter/build.py
blender -b --factory-startup --python-exit-code 1 --python asset-src/vehicles/momiji-emu/build.py
```

The character builds are described below and in [concept cast](characters/concept-cast/README.md). Add `-- --render <folder>` to write review renders. Keep renders in a scratch folder, not the repository. Agents can run the same files through the Blender MCP with `execute_blender_code`; see the [Blender asset skill](../.agents/skills/maple-blender-assets/SKILL.md).

Commit the script, reports and output files together. `apps/game/tests/blender-assets.test.js` and `vrm-cast.test.js` read the models and reports and fail if a clip, expression, bone, gait value, detail level or budget drifts.

## VRM cast (anime style)

The game draws Momiji's three people as VRM 1.0 characters (see [anime characters](../docs/research/ANIME-CHARACTERS.md)). Riko is built from approved concept art in `characters/concept-cast/`. Mr. Sato and Mr. Ishida are still pipeline test figures from `characters/vrm-cast/`:

```sh
blender -b --factory-startup --python-exit-code 1 --python asset-src/characters/vrm-cast/build.py -- --cast all
node asset-src/characters/vrm-cast/make-vrm.mjs sato ishida
node asset-src/characters/vrm-cast/retarget.mjs
```

1. **`build.py` (Blender).** Builds each profile: a VRM humanoid skeleton in T-pose, a skin-modifier body, clothes as material regions, a face of layered decals with VRM expression shape keys, and strand hair with spring-bone chains. It writes a GLB and a sidecar (`<cast>.vrm.json`) into `characters/vrm-cast/build/`, which git ignores.
2. **`make-vrm.mjs`.** Adds VRMC_vrm (meta, humanoid, expressions, look-at), VRMC_springBone and VRMC_materials_mtoon from the sidecar. Geometry stays as Blender exported it, meshopt included. The concept cast uses the same step with `--from`.
3. **`retarget.mjs`.** Turns Quaternius UAL 1 and 2 clips into one VRM Animation file. Rest-pose differences are corrected, and stride and seat height are measured per unit of hips height, so the game can scale them to each character.

The dev server serves `/character-lab.html` for close looks under the game's light (`?view=face`, `?clip=walk`, `?expr=happy:1`) and `/character-studio.html` for tuning ([character studio](../docs/CHARACTER-STUDIO.md)). If a VRM fails to load, the game keeps the simple instanced figure for that person.

## Retired: the Blender GLB cast

Until September 2026 `characters/momiji-cast/build.py` built low-poly Blender GLBs of the three people (`commuter-hero.glb`, `student-riko.glb`, `reader-ishida.glb`), shown with `?cast=blender` or used when a VRM failed. The VRM cast replaced them and the files were removed. The script and its reports stay in git history (last changed in commit `69c81a5`).

That script also wrote `models/characters/props/sato.glb` (phone) and `props/ishida.glb` (newspaper), which the VRMs still hold in their hand sockets. They are kept as committed files. To change them, restore the script with `git show 69c81a5:asset-src/characters/momiji-cast/build.py` or build new props beside the character that owns them, as `concept-cast/props.py` does for Riko.

## What the shelter contains

- LOD0 900 triangles, LOD1 84 triangles, one material, baked ambient occlusion in vertex colour, a `socket.bench-seat-1` empty, and `kind`/`lod` extras that the game reads.
- Placed at the Momiji platform end by `apps/game/src/world/station-modules.js`, switching to LOD1 beyond 70 m.

## What the train contains

- Five parts in one GLB, in the game's car frame (cab at +Z, origin on the track line at the car centre, railhead at y 0.315): `car-cab`, `car-middle`, `door-leaf`, `wheelset` and `pantograph`. The body nodes carry the layout the game reads as extras: door centres, leaf offset and slide, axle positions, wheel centre and radius, skin and windscreen planes.
- Dimensions match the procedural train so cameras, doors, station stops and couplings line up: 12.4 m bodies 13.5 m apart, doors at ±4.59 m sliding 0.64 m, bogies at ±4.18 m with 1.72 m wheelbase, 0.46 m wheels on a 0.775 m centre, roof at 3.77 m, pantograph shoes at the contact height passed with `--contact-height` (default 7.35 m, the game's 12.1 m wire minus 4.75 m rail).
- Triangles: cab body 16,852, middle body 16,324, door leaf 386 (16 per car), wheelset 1,252 (4 per car), pantograph 512 (two cars). Eight materials: paint (clear coat 0.3), roof, metal, bright metal, rubber, glass, lining and sign. Colour and ambient occlusion are in the `Col` attribute.
- In the game (`apps/game/src/train/train.js`, `attachModel`) the procedural train is built first and stays in place until the file loads, so it is also the fallback when the file is missing. Door leaves and wheelsets are instanced per car and animated by the existing door and wheel code.

## Provenance

The meshes, rigs and textures here are made by these scripts. The VRM clips are retargeted from Quaternius UAL (CC0), and Riko's painted views are generated concept art. Outside files are recorded with licence, source, size and SHA-256 in [THIRD_PARTY.md](THIRD_PARTY.md), following [character sources](../docs/research/CHARACTER-SOURCES.md).
