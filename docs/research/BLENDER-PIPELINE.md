# Blender pipeline for characters and world modules

Research note, September 2026. This is a proposal. Nothing here is implemented yet. It answers one question: how agents should build characters, rigs, animation clips and world modules in Blender for Maple Line, and how those files get into the Three.js game.

Terrain, trees, track and placement stay procedural in code. Blender makes hand-shaped things (people, station shelters, houses, shrine gates, crossing gear, carriage interiors) and exports them as GLB. The game code still decides where they go.

Claims marked **(unverified)** come from search summaries, memory or project guesses. They were not confirmed against a primary source or the local install. Everything else was checked against the page, the installed Blender 5.2.2, the local `blender_mcp` clone, or `three@0.180.0` in `node_modules`.

## Short answer

1. **Characters:** a Python builder script makes a stylized low-poly body and head from a parameter table (height, build, age, clothing colours). Because the script creates every vertex, it also knows which vertices belong to the eyelids, jaw and mouth, and which limb each ring belongs to. It can then write face shape keys and skin weights without a person. MPFB2 is the fallback if scripted faces do not hold up in director portraits.
2. **Rig:** one small game skeleton (about 25 to 50 deform bones) built from a bone table, with Mixamo-style bone names so outside clips can be mapped later. No constraints and no control bones in the exported file. Rigify is only for a person polishing animation in the Blender window, and it gets baked down to the game skeleton before export.
3. **Animation:** one Blender action per clip, keyed by script, stashed to NLA, exported with `export_animation_mode='ACTIONS'`. Clips stay in place. Game code moves the figure along its path, as `regional-residents.js` already does.
4. **Export:** GLB, +Y up, meshopt compression using `EXT_meshopt_compression`. Three.js r180 can decode EXT but has no handler for the newer KHR variant. Use one material per character, with vertex colour or a small atlas. Leave Draco out. Leave KTX2 out until texture memory is measured.
5. **Crowds:** Three.js r180 cannot skin an `InstancedMesh` or a `BatchedMesh`. Use real `SkinnedMesh` for a handful of hero figures only. For the crowd, keep the current instanced approach but feed it Blender-made body-part meshes and pose data sampled from the same clips. Vertex animation textures or a baked bone texture are the next step if that looks too stiff.
6. **World modules:** one GLB per kit module. Each module carries named LOD meshes, empties for sockets, and custom properties as glTF extras. Modules share one trim/palette material. The existing placement functions keep emitting instance descriptions, and a registry swaps the procedural box geometry for the module geometry by name. The current procedural buildings stay as the far LOD and as the fallback when a file is missing.
7. **Agents:** build scripts in the repo are the source of truth. Run them headless (`blender -b --factory-startup --python …`) or through the MCP `execute_blender_code` tool. Each run writes a JSON report and review renders. A person judges look, portrait quality and animation feel, and handles anything that needs an account, a purchase or an install.

## What exists today

- `apps/game` depends on `three` 0.180.0. No module imports `GLTFLoader`, and there are no `.glb` files under `apps/game`.
- Station residents (`world/regional-residents.js`) are drawn as two `InstancedMesh` batches per station: 256 boxes and 64 low spheres, one material. Poses are computed on the CPU each frame, including arm cues for `wave` and `check-phone`. The walking speed for errands is 1.15 m/s.
- Story characters (`docs/CHARACTERS.md`) are procedural figures sharing three instanced batches and one material. They have a 3 mm breathing motion and fixed feet.
- NPC minds (`simulation/npc-minds.js`) export `INTENTS`: `continue, linger, chat, hurry, shelter, watch-train, wave, sit, check-phone, stretch`. None of these is `idle`, `walk` or `board`. See the clip mapping below.
- Regional buildings (`world/regional-architecture.js`) emit plain instance descriptions into chunk batches. Kinds are `tile-home`, `farmhouse`, `shopfront`, `storehouse`, `snow-lodge` and `harbour-shed`. The authoring layer (`agent/world-authoring.js`) has prefabs including `torii`, `bench` and `lantern`.
- The skill `.agents/skills/maple-blender-assets/SKILL.md` already sets conventions: metres, +Y-up export, origin at the ground contact point, budgets (hero about 8,000 triangles, crowd about 1,500, props about 2,000, textures up to 1024 px or 512 px for crowd), Principled BSDF only, clip names after intents, and exports under `apps/game/public/`. This document builds on those rules and does not replace them.
- `measure_game_performance` (in `agent/build-tools.js`) samples 1 to 10 seconds. It reports observed FPS, median and p95 frame and CPU times, frames over 20 ms, all-pass draw calls and triangles. `get_runtime_profile` reads the device limits first.

## Versions checked

| Item                                 | Version or state                                                                                                                           | How checked                        |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------- |
| Blender                              | 5.2.2, at `~/Applications/Blender.app`, also on `PATH` via Homebrew                                                                        | local `Info.plist`                 |
| glTF importer/exporter (bundled)     | `io_scene_gltf2` 5.2.40, ships `libbf_intern_meshopt_bridge` and `libbf_intern_draco_bridge`                                               | local add-on folder                |
| Rigify (bundled)                     | in `5.2/scripts/addons_core/rigify`, operator `pose.rigify_generate`, function `generate.generate_rig(context, metarig)`                   | local source                       |
| Blender Lab MCP                      | clone at `~/blender_mcp`, configured as MCP server `blender`. Needs Blender 5.1 or newer                                                   | local `readme_tools.rst`, lab page |
| Three.js                             | 0.180.0                                                                                                                                    | `node_modules`                     |
| MPFB2                                | v2.0.17 (2026-07-22). Needs Blender 4.2 or newer. Code GPL-3.0, assets CC0. Not installed here. Blender 5.2 compatibility **(unverified)** | GitHub API, repo licence files     |
| OpenVAT                              | 1.1.0, Blender 4.2+ with 5.0 support, GPL-3.0                                                                                              | repo README                        |
| `@three.ez/instanced-mesh`           | 0.3.16, peer `three >=0.159.0`, MIT                                                                                                        | npm registry                       |
| GameRig (Rigify for games)           | last push 2026-02, GPL-2.0. Blender 5.2 support **(unverified)**                                                                           | GitHub API                         |
| Rokoko Studio Live plugin (official) | last push 2026-05, LGPL-3.0. A community fork claims Blender 5.x retarget fixes **(unverified)**                                           | GitHub API                         |

## 1. Characters

### Options

| Approach                                                 | Scriptable headless                                                                                                                                                                                                                                                                                         | Fit for Maple Line                                                                                                                                                                                                                                            | Licence                                                                                                                                                |
| -------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Own `bpy`/`bmesh` builder (loops, Skin modifier, mirror) | Yes. Plain data API. The Skin modifier turns a vertex/edge skeleton with radii into a quad surface and can create a matching armature ("Create Armature: each edge becomes a bone").                                                                                                                        | Best match for the flat, low-poly art style. Topology is known, so shape keys and weights can be written by script. The weak point is faces: they need careful design to read in close portraits.                                                             | Ours.                                                                                                                                                  |
| MPFB2 (MakeHuman for Blender)                            | Yes, through its service layer: `HumanService.create_human(...)`, `add_builtin_rig(basemesh, "game_engine" \| "mixamo" \| "cmu_mb" \| "rigify.human" …)`, `deserialize_from_json_file`, and `FaceService.load_targets(...)` for 22 Microsoft visemes, 15 Meta visemes or 52 ARKit face units as shape keys. | Realistic proportions and ready face shapes, which helps portraits. It needs an extension install plus the separate "makehuman system assets" pack. The base mesh is heavy and realistic, so it needs a proxy or decimation, and restyling for the flat look. | Code GPL-3.0 (runs only in Blender and is not shipped). Assets CC0.                                                                                    |
| Human Generator                                          | Python add-on, paid.                                                                                                                                                                                                                                                                                        | Realistic and heavy. Not the art style.                                                                                                                                                                                                                       | Game use needs the Commercial licence. Sharing model files (their example is `.fbx`) is not allowed. A public GLB fetched by a browser is a grey area. |
| Mixamo characters and auto-rigger                        | No. Web tool behind an Adobe login. Agents must not sign in.                                                                                                                                                                                                                                                | Generic look.                                                                                                                                                                                                                                                 | Royalty-free inside a project. No redistribution of raw files **(search summary only; Adobe page blocked direct fetch)**.                              |

**Recommendation:** start with our own builder. The deciding reason is not only style. A script that creates the mesh ring by ring can also name the eyelid, lip and jaw vertex sets, and assign each ring to a bone. That turns shape keys and weights into deterministic code. With MPFB or a sculpted mesh, both need a person or fragile heuristics. Keep MPFB2 as a documented fallback for the hero head if portrait review rejects the scripted face. Installing it is an extension install plus an asset-pack download, so a person has to approve it.

### Mesh and topology rules

- Build in quads. Put three edge loops around each bending joint (shoulder, elbow, wrist, hip, knee, ankle) and one loop each side of the neck. Spend the remaining loops on silhouette (jacket hem, cap brim, bag), not on flat torso areas. This is standard deformation practice; the numbers are a starting point **(unverified; tune against renders)**.
- Mirror modifier for symmetry, applied before weights and shape keys are written, so vertex indices are final.
- Keep clothing as part of the body mesh, not as separate layered meshes. Remove hidden body faces under clothes. Layered meshes cost draw calls and poke through when the rig bends.
- Budgets: hero up to about 8,000 triangles, split roughly 3,000 head and hands and 5,000 body and clothes; crowd up to about 1,500 (skill values). The exporter turns quads into triangles and splits vertices at UV seams and hard edges, so vertex counts after export are higher than in Blender (manual, "Meshes"). Report both.
- One material per character. Colour comes from vertex colour (matches the current flat style) or a 256 to 512 px palette/atlas. Per-person variety comes from vertex-colour sets or a colour index attribute, not extra materials, per ART-DIRECTION item 6.

### Faces

- **Hero head (portraits):** about 12 shape keys. `blink-l`, `blink-r`, `jaw-open`, the five Japanese vowels `mouth-a`, `mouth-i`, `mouth-u`, `mouth-e`, `mouth-o`, then `smile`, `frown`, `brow-up`, `brow-down`. The builder writes each key as offsets on named vertex sets. Eyes are separate small meshes parented to `eye-l`/`eye-r` deform bones, so gaze is a bone rotation, not a morph.
- **Crowd heads:** no shape keys. Eyes and mouth are vertex-colour marks, or a small atlas cell chosen in code.
- **Export:** the Blender exporter writes shape keys as glTF morph targets, with options for normals, sparse accessors and shape-key animation (`export_morph`, `export_morph_normal`, `export_try_sparse_sk`, `export_morph_animation`). Three.js exposes them through `mesh.morphTargetDictionary` and `morphTargetInfluences`, and `AnimationMixer` plays morph tracks.
- **Not usable yet:** swapping face textures through glTF animation (`KHR_animation_pointer`). The Blender exporter can write it (`export_pointer_animation`), but the r180 `GLTFLoader` has no handler for it (checked in the `EXTENSIONS` table). Any texture-swap face has to be driven by game code.
- Morph data costs GPU memory for every vertex of the mesh that carries it. If the hero body and head are one mesh, every body vertex pays for 12 face morphs. Splitting the head into its own mesh with the same material costs one extra draw call and saves that memory. Measure both before choosing.

## 2. Rigging

### Game skeleton

- Build the armature from a bone table (name, head, tail, roll, parent) in the builder. Use Mixamo-style names without the `mixamorig:` prefix: `Hips, Spine, Spine1, Spine2, Neck, Head, LeftShoulder, LeftArm, LeftForeArm, LeftHand, LeftUpLeg, LeftLeg, LeftFoot, LeftToeBase` plus right side, plus `eye-l`/`eye-r` for heroes. That keeps a direct name map to Mixamo, MPFB's `mixamo` rig and, with a table, CMU/BVH clips. Mixamo naming is from common knowledge of the format **(unverified against an Adobe document)**.
- Every exported bone is a deform bone. No IK, no constraints, no drivers in the exported file. Crowd rigs can drop fingers, toes and neck detail to about 20 bones. Heroes can have a thumb and one finger group per hand.
- One root bone (`Hips`, or a `root` at the ground if root motion is ever needed). The exporter's "Remove Armature Object" only works when there is one root bone (manual).

### Weights

- **Default:** the builder writes weights itself. Each ring belongs to one bone, and rings next to a joint get a two-bone blend. Deterministic, and never hits the bone-heat failure.
- **Fallback:** Automatic Weights (`bpy.ops.object.parent_set(type='ARMATURE_AUTO')`), which uses the "bone heat" algorithm (manual, Armature Deform Parent). Needs the mesh and armature selected with the armature active, so it is context-sensitive in scripts. Bone heat fails on non-manifold or overlapping geometry, which is another reason to avoid layered clothing. The error message wording is from memory **(unverified)**.
- Voxel Heat Diffuse Skinning is a paid add-on and not needed for meshes this simple.
- Export with 4 influences (`export_influence_nb=4`, the default). The manual warns that other values may display wrongly in many viewers.

### Rigify and Auto-Rig Pro

- Rigify can be driven from Python. Add a metarig (`object.armature_human_metarig_add` or the basic human), fit its bones, then call `pose.rigify_generate`. Its poll only checks that the active object is a metarig, and its execute calls `generate.generate_rig(context, metarig)` (read from the bundled 5.2 source). A full headless generate run was not tried here **(unverified end to end)**.
- Rigify's deform bones are split across per-module chains, and the exporter's "deformation bones only" still let control bones through in a reported case (glTF-Blender-IO issue #2115). GameRig exists to put Rigify's deform bones into one hierarchy. For Maple Line, use Rigify only as a control rig that drives the game skeleton through Copy Transforms, then bake the action onto the game skeleton before export. The game file never contains Rigify.
- Auto-Rig Pro (paid) has a game-engine export with Humanoid and Universal types, root-motion transfer, shape-key animation and a GLTF path. Its documented operator is `bpy.ops.arp.arp_export_fbx_panel`. Not needed while the skeleton is this small.

## 3. Animation

### Clips and intents

The game needs locomotion clips chosen by speed, plus activity clips chosen by intent. `continue` is an intent in code but not a clip. `board` is a scripted action, not an intent.

| Clip          | Loop | Driven by                         | Notes                                                                                                                        |
| ------------- | ---- | --------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `idle`        | yes  | speed 0, `continue` while stopped | Breathing of about 3 mm, matching the current figures.                                                                       |
| `walk`        | yes  | speed near 1.15 m/s               | Stride length × cadence must equal 1.15 m/s so feet do not slide. Use `timeScale` for small speed changes.                   |
| `hurry`       | yes  | intent `hurry`                    | Speed is a design value to agree with `npc-minds.js` **(no speed defined there today)**.                                     |
| `linger`      | yes  | intent                            | Weight shift, looking around.                                                                                                |
| `chat`        | yes  | intent                            | Upper body only if layered over `idle`.                                                                                      |
| `wave`        | no   | intent                            | Right arm. Can be additive over idle or walk.                                                                                |
| `sit`         | yes  | intent                            | Needs a bench socket height. Current benches are about 2.5 m wide.                                                           |
| `check-phone` | yes  | intent                            | Phone prop parented to a hand bone or a named socket.                                                                        |
| `stretch`     | no   | intent                            |                                                                                                                              |
| `watch-train` | yes  | intent                            | Head turn toward the train is better done in code (a head bone offset) than baked into the clip.                             |
| `shelter`     | yes  | intent                            | Hunched, hand over head or umbrella.                                                                                         |
| `board`       | no   | drama cue or door event           | Step up about 0.6 m to the platform deck and into the car. Has root travel, so it is the one clip that may need root motion. |

### Keying by script (Blender 5.x)

- Blender 5.0 removed the legacy Action API (`action.fcurves`, `action.groups`, `action.id_root`). Code written for 4.3 or older breaks. Current code either uses `pose_bone.keyframe_insert(...)`, which creates the action, slot and channels, or the channelbag API (`bpy_extras.anim_utils.action_ensure_channelbag_for_slot(action, slot)`, `channelbag.fcurves.ensure(...)`), per the 5.0 Python API notes.
- Pattern per clip: create an action named after the clip, assign it to the armature, key poses with `keyframe_insert` on quaternion rotations at 30 fps, make the last key equal the first for loops, then push the action to an NLA track named after the clip. Agents should confirm signatures with the MCP `get_python_api_docs` tool before writing code, not from memory.
- Poses come from a small pose table per clip (bone → rotation at key frames) plus simple curves for secondary motion. Scripted clips look mechanical at first. Plan a human polish pass in the Blender window for hero clips, or bring in motion capture.

### Outside motion sources

- **CMU motion capture:** BVH files, free to include in commercial products; the data itself may not be resold (search summaries quoting the CMU licence; the CMU site failed certificate checks here). Blender imports BVH with the bundled `io_anim_bvh` add-on. MPFB has a `cmu_mb` rig that matches it.
- **Mixamo:** needs a person with an Adobe account to download FBX files. The raw-file redistribution rule makes shipping Mixamo clips in a public web GLB a question to settle first.
- **Retargeting in Blender:** Blender 5.0 to 5.2 release notes list no built-in retargeting tool. Options are the Rokoko plugin (free), the "Retarget" extension on extensions.blender.org (GPL, Blender 5.0+, presets for Mixamo and others, community-made, not Blender Studio), or a small script that copies world-space rotations bone by bone with a name map. The script is enough if the skeleton keeps Mixamo-style names.
- **Retargeting in Three.js:** `SkeletonUtils.retargetClip(target, source, clip, options)` exists in r180 (`examples/jsm/utils/SkeletonUtils.js`). Options include a `names` map, `hip`, `scale`, `fps` and `trim`. Prefer retargeting in Blender at build time so the shipped file already matches, and keep `retargetClip` for experiments.

### Root motion

Keep clips in place: zero the hips' horizontal translation. Game code already moves people along polylines at a set speed, and `AnimationMixer` has no root-motion extraction. `board` is the exception. Either split it into in-place parts with code-driven travel, or read the hips' track in code.

## 4. Export and runtime

### Exporter settings (Blender 5.2, `bpy.ops.export_scene.gltf`)

The option names below are copied from the current API reference. Defaults that already match are left out.

```python
bpy.ops.export_scene.gltf(
    filepath=out_path,              # apps/game/public/models/characters/<name>.glb
    export_format='GLB',
    use_selection=True,             # export only the asset's collection, selected by the script
    export_yup=True,
    export_apply=True,              # apply modifiers (mirror, bevel, etc.)
    export_extras=True,             # custom properties -> glTF extras -> Object3D.userData
    export_animation_mode='ACTIONS',
    export_anim_single_armature=True,
    export_reset_pose_bones=True,
    export_force_sampling=True,
    export_frame_step=1,
    export_anim_slide_to_zero=True,
    export_optimize_animation_size=True,
    export_def_bones=True,
    export_influence_nb=4,
    export_morph=True, export_morph_normal=True, export_morph_animation=True,
    export_try_sparse_sk=True,
    export_meshopt_compression_enable=True,
    export_meshopt_extension='EXT_meshopt_compression',   # r180 GLTFLoader has no KHR_meshopt handler
    export_image_format='WEBP',     # or 'AUTO'; r180 supports EXT_texture_webp
    export_materials='EXPORT',
)
```

- Animation modes (manual): **Actions** exports each action on its own NLA track or the active action as a separate glTF animation. Since 4.4 (slotted actions), tracks merge by action, not by name. **Active Actions merged** makes one animation. **NLA Tracks** makes one per track. **Scene** bakes what the viewport shows. Only Actions and Active Actions merged handle unsampled animation.
- "Export Deformation Bones only" also bakes animation for the deform bones, which is what lets a control rig drive the export.
- The exporter drops node-based procedural textures. Bake them to images or vertex colour first.
- Meshopt is built in (bridge library in the add-on folder). KTX2 needs `gltfpack`, which is a separate binary set in the add-on preferences (`gltfpack_path_ui`). That would be an install, so not now.

### Loading in Three.js r180

- `GLTFLoader` supports `EXT_meshopt_compression` (needs `setMeshoptDecoder` first), `KHR_draco_mesh_compression` (needs a `DRACOLoader` with hosted decoder files), `KHR_texture_basisu` (needs a `KTX2Loader` with the transcoder path and `detectSupport(renderer)`), `EXT_texture_webp`, `KHR_mesh_quantization` and `EXT_mesh_gpu_instancing`. Extras become `userData`. All checked in the r180 source.
- Use meshopt. `meshopt_decoder.module.js` is a JS module that Vite bundles, so no extra files need hosting under `/s/maple-line/` or `/maple-line/`. Draco and Basis both need `.wasm` files served from the right base path.
- URLs must use `import.meta.env.BASE_URL`. The Vite base is `/`, `./` or `/maple-line/` depending on mode.
- The loader module the skill asks for: cache by URL, report failures to the HUD, keep the procedural figure or building when the file is missing or fails. Use `SkeletonUtils.clone` for each additional skinned hero so the bones are cloned correctly.
- One `AnimationMixer` per hero. `clipAction(clip).play()`, `crossFadeTo` between intents (0.2 to 0.4 s), `timeScale` to match walking speed. Throttle mixer updates for figures far from the camera.

### Crowds on phones

What r180 can and cannot do (checked in source):

- `SkinnedMesh`: one draw call per material, plus one per shadow pass if it casts shadows. Bone matrices go in a texture, so bone count is not limited by uniforms.
- `InstancedMesh`: no skinning. It does support per-instance morph weights (`setMorphAt`).
- `BatchedMesh`: no skinning and no morph support in r180.
- `LOD`: distance-based object switching, built in.

Proposed tiers:

| Tier          | Who                                                  | How                                                                                                                                                                                                                                                                                                                                                                                                                                          | Cost notes                                                                                                                                                                                                                                                                            |
| ------------- | ---------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A. Hero       | Haru, Emi, the current drama cast, portrait subjects | `SkinnedMesh`, `AnimationMixer`, face morphs.                                                                                                                                                                                                                                                                                                                                                                                                | Aim for at most about 6 at once. Each adds 1 to 2 draw calls plus shadows.                                                                                                                                                                                                            |
| B. Near crowd | Station residents, commuters                         | Keep the present instanced batches. Replace the boxes with Blender-made rigid body-part meshes (head, torso, upper and lower arms and legs, about 11 parts) cut from the crowd character. Each frame, sample the exported clips in JS to get each bone's matrix, and write part matrices into the instanced batches, as the code does now with hand-built angles. Joints are hidden by overlapping sleeves and trousers.                     | Same draw calls as now, one per part mesh or one if parts are merged into a single instanced geometry with a part index. CPU: about 60 people × 11 parts of matrix math per frame, similar to today's figures.                                                                        |
| C. Upgrade    | If B looks too stiff                                 | Vertex animation texture (VAT): bake each clip's vertex positions per frame from Blender into a float texture, play it in a shader on one `InstancedMesh` with per-instance clip, phase and colour. OpenVAT or a small in-repo `bpy` baker can write it. Or a bone-matrix texture per clip with a custom skinning shader, or `@three.ez/instanced-mesh`, which lists skinning (how it evaluates bones was not documented on the pages read). | VAT for a 1,000-vertex figure × about 400 frames (11 clips) is 400,000 texels: about 3.2 MB at RGBA16F for positions, same again for normals unless packed. A bone texture for 30 bones × 400 frames at 64 bytes per matrix is about 0.8 MB. Estimates from arithmetic, not measured. |
| D. Far        | Distant platforms                                    | The current box figures, or none.                                                                                                                                                                                                                                                                                                                                                                                                            | Already paid for.                                                                                                                                                                                                                                                                     |

Budgets should be deltas measured with `measure_game_performance`, not guessed from outside articles. The game already records frame p95, CPU p95, draw calls and triangles. Real phone numbers need a real phone. Browser device emulation does not change the GPU.

## 5. World modules

### Kit

Modules below are named after what the game already places:

- **Station:** shelter (posts, roof, back wall, bench), platform edge segments (1 m and 4 m), fence and railing segments, name board, small station building with ticket window, lamp post. Benches are 2.5 m wide in the prefab list, and the platform deck sits 0.6 m above the rail reference (`CHARACTERS.md`).
- **Houses:** wall bays, engawa (veranda) segments, sliding-door bays, gable and hip roof pieces in tile and tin, eaves, drainpipes, a storehouse body. Build on a 1.82 m grid (one ken, the traditional Japanese bay width) so pieces line up **(ken value from general knowledge, unverified)**. The profiles in `addRegionalBuilding` (for example a `tile-home` of 8 × 4.1 × 7 m with a 1.8 m roof rise) give target sizes.
- **Shrine:** torii (the prefab is about 6 m wide and 5 m tall), stone lantern, fox statue plinth, rope and paper streamers as a single alpha-tested strip.
- **Level crossing:** warning post with twin lamps and X sign, barrier arm with a named pivot empty so code can rotate it, road-surface plate. `world/level-crossings.js` owns the logic.
- **Train interior:** one car interior module (long bench seats, grab poles, strap rails, luggage racks, window frames) that respects `train/interior.js` sightlines and the five-car layout. Straps are repeated geometry, so export them with `EXT_mesh_gpu_instancing`, which Blender writes for linked duplicates under one parent and r180 loads as `InstancedMesh`.

### How to build them with scripts

- Plain `bmesh` and primitive operators plus modifiers (Array, Mirror, Bevel, Solidify) cover most kit pieces and are easy for agents to change.
- Geometry Nodes can be created from Python: node groups through `bpy.data.node_groups.new(..., 'GeometryNodeTree')`, sockets through the node-tree interface API, and modifier inputs set on the modifier. Use them for parametric pieces such as roof tile rows, fence runs and bay counts, then export with Apply Modifiers so the output is plain meshes. The exporter's "Geometry Nodes Instances" option is marked experimental in the manual, so do not rely on it.
- **Baking:** bake ambient occlusion into the active colour attribute with Cycles (bake target `VERTEX_COLORS` exists in the 5.x API). It keeps the flat vertex-colour look and needs no texture. `bpy.ops.object.bake` needs the right selection and active object, so run it as a separate headless step with a long timeout.
- **Textures:** one shared 1024 px trim sheet for timber, plaster, tile edge and metal strips, plus a 256 px palette for flat colours. Trim sheets let many modules share one material and cut draw calls. Suggested texel density is 256 to 512 px per metre for these modules, below the 512 px/m background figure often given for PC games, because phones use the same files **(guideline figures from a search summary of trim-sheet articles; tune by portrait and cab-view review)**. The free Texel Density Checker add-on can measure it but is optional.
- **LODs:** LOD0 hand-built. LOD1 by script with the Decimate modifier (collapse) or by leaving out small parts. The existing procedural box buildings become the far LOD.

### Merging with procedural placement

- **One GLB per module family:** for example `models/buildings/tile-home.glb` containing nodes `tile-home.lod0`, `tile-home.lod1`, and empties `socket.door`, `socket.lamp`, `socket.bench-seat-1`. Custom properties go out as glTF extras (`kind`, `footprintW`, `footprintD`, `clearance`), so JS can check a module against the procedural footprint before using it.
- **Origin** at the footprint centre on the ground. Front faces Blender −Y (+Z in Three.js), as the skill says.
- **Registry in JS:** `kind → { url, lod0, lod1 }`. The chunk batching code keeps receiving the same instance descriptions from `addRegionalBuilding`. When a module has loaded, the batch uses its geometry and the shared trim/palette material. When it has not, the batch uses today's boxes. That keeps railway clearances, seeds and shared batches unchanged (ART-DIRECTION item 5).
- **Colour variety** stays per instance (`setColorAt` or a colour attribute), not per material.

## 6. Agent workflow through the Blender MCP

### Tools that exist

From `~/blender_mcp/readme_tools.rst`: `execute_blender_code` (live Blender) and `execute_blender_code_for_cli` (opens a `.blend` in background Blender), blend-file summaries (each with a `_for_cli` variant), `get_objects_summary`, `get_object_detail_summary`, `get_python_api_docs`, `search_api_docs`, `search_manual_docs`, `render_thumbnail_to_path`, `render_viewport_to_path`, window and area screenshots, and view-jump tools. The screenshot and jump tools need a Blender window.

Facts from the MCP source:

- Socket requests time out after 300 s and CLI runs after 120 s.
- Background mode rejects deferred results. Code must finish synchronously and put its return value in a variable named `result`.
- `render_thumbnail_to_path` writes to `bpy.app.tempdir/blender_mcp/<basename>` and ignores the folder you pass. Copy the file out afterwards.
- The thumbnail tool lowers EEVEE samples only when the engine is `BLENDER_EEVEE_NEXT`. Blender 5.0 renamed the engine to `BLENDER_EEVEE`, so on 5.2 that override is skipped and thumbnails render at full EEVEE samples.
- The Blender Lab page warns that the server runs model-written code with no guards. Only run build scripts from this repo.

### Headless versus a person

| Agents can do headless                                                                                                                         | Needs a person                                                                                                                                        |
| ---------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| Run build scripts: meshes, modifiers, vertex colours, materials, armature from a table, scripted weights, shape keys, keyed clips, NLA, export | Judge whether a face reads, whether a walk feels right, whether a module fits the art direction. Agents can prepare comparisons but not decide taste. |
| Write a JSON report (triangles, vertices, materials, bones, clip names and lengths, bounding box, loop check)                                  | Sculpting, hand weight-paint fixes, animation polish with a control rig                                                                               |
| Render fixed review views with Workbench or EEVEE and copy them to the scratchpad                                                              | Installing extensions or asset packs (MPFB2, OpenVAT, gltfpack), buying add-ons, downloading from sites that need an account (Mixamo, Superhive)      |
| Load the GLB in the dev game and use WebMCP (`find_objects`, `inspect_object`, a `portrait` shot, `measure_game_performance`)                  | Testing on a real phone                                                                                                                               |

### Rules that keep runs repeatable

- **One entry point per asset**, runnable two ways: `blender -b --factory-startup --python-exit-code 1 --python asset-src/characters/<name>/build.py -- --out <glb> --report <json>` (the canonical run, no user prefs or add-ons), or through MCP with `execute_blender_code` running the same file for step-by-step work in a live session. Long bakes go through the command line from Bash, where timeouts can exceed 120 s.
- **Start from an empty scene** created by the script. Seed every random choice from the asset id. Iterate collections sorted by name. Never depend on whatever is selected or active before the run.
- **Prefer the data API over operators.** Operators read context and fail with `poll() failed, context is incorrect` when the active area, object or mode is wrong (API gotchas page). When an operator is needed, set active object, selection and mode explicitly, or use `bpy.context.temp_override(...)`. Flush `bmesh` edits back to the mesh. Update the depsgraph before reading evaluated data.
- **Diff the JSON report, not the GLB bytes.** The GLB records the exporter version, and byte identity across Blender versions is not guaranteed **(unverified)**. Commit the report beside the GLB and build script, so a change in triangles or clip length shows up in review.
- **Review renders:** a fixed camera set per asset (front, three-quarter, side, face close-up at portrait framing, and for modules the cab-window distance), with the same light each time. Put them in the scratchpad, not the repo. Then check in the game at daylight and dusk, since the game's lighting decides the result.
- **Remove scratch files:** delete scratch `.blend` saves and renders when finished. The skill notes that disk space on the development Mac is limited.

## Recommended pipeline: characters

1. **Define:** add a parameter file for the character (height, build, age, palette indices, props, clip list) next to its build script.
2. **Build mesh:** the shared builder library makes body and head rings, applies mirror, assigns vertex colours, and names vertex sets (eyelids, lips, jaw, hands).
3. **Build rig:** create the game skeleton from the bone table, then write weights from ring-to-bone ownership.
4. **Faces:** write the shape keys as offsets on the named vertex sets (heroes only).
5. **Animate:** key one action per clip from pose tables, check that loops close, push each action to an NLA track named after the clip.
6. **Check:** build the JSON report, run the automated checks (budgets, names, loop closure, foot speed), and render the review views.
7. **Export:** GLB with the settings above, into `apps/game/public/models/characters/`.
8. **Load:** the loader module caches the file and makes a `SkinnedMesh` plus mixer for tier A, or extracts part meshes and clip data for tier B. The NPC intent picks the clip.
9. **Verify in game:** portrait and platform shots at daylight and dusk, `measure_game_performance` before and after at the same camera, weather and viewport.
10. **Record provenance** and commit the script, report and GLB together.

## Recommended pipeline: world modules

1. Pick the module from the kit list. Read its procedural counterpart for footprint, clearances and placement rules.
2. The build script makes LOD0 from primitives, modifiers and Geometry Nodes where they help, then UVs to the shared trim sheet or vertex colours only.
3. Bake AO to vertex colour. Make LOD1. Add socket empties and extras.
4. Write the JSON report and review renders at cab-window distance and platform distance.
5. Export one GLB per module family with meshopt.
6. Add a registry entry in JS. The placement code is unchanged. Fallback is the current geometry.
7. Check in game from cab, passenger and exterior views in both directions, then measure and record provenance.

## First milestone

**Scope:** one hero character with four clips, and one station shelter module, both loaded at Momiji in the dev build.

- Character: a stylized commuter built by script, about 1.65 m tall, one material, the game skeleton (no more than about 30 deform bones plus the two eye bones), four face shape keys (`blink-l`, `blink-r`, `jaw-open`, `smile`), and clips `idle`, `walk`, `wave`, `check-phone`.
- Shelter: posts, roof, back wall and bench, with a LOD1 mesh, one `socket.bench-seat-1` empty, vertex colours plus baked AO, sized for the Momiji platform (0.6 m deck).
- Code: one small loader module (URL cache, meshopt decoder, HUD error, procedural fallback), one tier-A hero placed through an existing drama or director subject, and the shelter swapped in at one station by kind.

**Acceptance checks.** The numbers are proposals to confirm with the person. Budgets come from the skill; the performance limits need agreement.

| Check                 | Target                                                                                                                                                                                                                       | How                                                                          |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| Character triangles   | at most 8,000 in total. Report exported vertex count as well.                                                                                                                                                                | JSON report, then `inspect_object` in game                                   |
| Shelter triangles     | LOD0 at most 2,000 (prop budget), LOD1 at most 600                                                                                                                                                                           | JSON report                                                                  |
| Materials and draws   | 1 material each. Hero adds at most 2 draw calls plus its shadow draw.                                                                                                                                                        | report, then the draw count from `measure_game_performance`                  |
| File sizes            | character GLB at most 600 KB, shelter GLB at most 150 KB, both with meshopt **(proposed targets)**                                                                                                                           | `ls -l`                                                                      |
| Clip contract         | exactly `idle`, `walk`, `wave`, `check-phone` in the GLB. Loop clips close within 0.5° per bone between first and last frame. The walk's foot travel per cycle matches 1.15 m/s within 5%.                                   | build script assertions, clip names read by the loader test                  |
| Orientation and scale | feet at y = 0, faces +Z, height within 2 cm of the parameter                                                                                                                                                                 | report bounding box, `inspect_object`                                        |
| Fallback              | with the GLB missing, the game shows the procedural figure and shelter and reports one HUD status line, with no uncaught errors                                                                                              | loader unit test, console check in the dedicated browser                     |
| Visual                | a portrait shot reads as a face at daylight and dusk. The shelter sits on the deck with no gap or clipping from the cab and platform views.                                                                                  | WebMCP portrait and platform shots, reviewed by a person                     |
| Performance           | same station, camera, weather, time and viewport as the baseline. 5 s samples, after `get_runtime_profile`. p95 frame time grows by no more than 1 ms on the dev Mac, and a phone sample is taken once a phone is available. | `measure_game_performance` before and after, both results recorded in the PR |
| Repeatable            | running the build script twice gives identical JSON reports                                                                                                                                                                  | run it twice, diff                                                           |
| Checks                | `pnpm check` passes                                                                                                                                                                                                          | root script                                                                  |

**Out of scope for milestone 1:** crowd tier B, VAT, MPFB2, Rigify, mocap, KTX2, the remaining eight clips, and other kit modules.

## Risks and unknowns

- **Scripted faces may not hold up in portraits.** This is the largest art risk. Fallback: MPFB2 head with a subset of its ARKit or viseme keys, restyled. That needs a person to approve an extension install and asset download, and a check that MPFB 2.0.17 runs on Blender 5.2.
- **Scripted animation can look mechanical.** Plan a person's polish pass or CMU clips for hero walks. Retargeting CMU onto our skeleton was not tested.
- **Licences for outside motion or characters.** Mixamo and Human Generator both restrict distributing raw files. Whether a GLB served to browsers counts as that is not settled, so avoid both until someone decides.
- **Rigify headless generation** was read in source but not run. Not needed until a person wants a control rig.
- **Tier B joints** may show gaps at elbows and knees in close shots. Heroes are skinned, and crowd close-ups should be rare, but check in portrait review.
- **Morph memory** on phones is not measured. Decide single mesh versus separate head after measuring.
- **Crowd frame cost** on real phones is unknown until someone tests one. Emulation is not evidence.
- **MCP limits:** the 120 s CLI timeout, no deferred results in background mode, and the thumbnail path and EEVEE engine-name details above. Bakes and big exports should run from the command line.
- **Blender API churn:** 5.0 removed the legacy Action API and renamed the EEVEE engine id. Scripts need a Blender version check at the top, and agents should look up the API with the MCP doc tools, not from memory.
- **Determinism of the GLB bytes** across Blender versions is unverified. Compare reports instead.
- **Folder name** `asset-src/` is a proposal. The skill asks for an asset-source folder at the repo root. Check that nothing exists before creating it.

## Sources

Legend: **[read]** page or file read directly. **[local]** checked in the installed Blender 5.2.2, the `~/blender_mcp` clone, or `node_modules/three@0.180.0`. **[summary]** only seen through a search summary; treat as unverified.

Blender

- [read] glTF 2.0 add-on, Blender 5.2 LTS manual: https://docs.blender.org/manual/en/latest/addons/scene_gltf2.html
- [read] Export Scene operators (`bpy.ops.export_scene.gltf` signature): https://docs.blender.org/api/current/bpy.ops.export_scene.html
- [read] Blender 5.0 Python API release notes (legacy Action API removed, `BLENDER_EEVEE` rename, channelbag helpers): https://developer.blender.org/docs/release_notes/5.0/python_api/
- [read] Blender 5.2 LTS animation and rigging notes: https://developer.blender.org/docs/release_notes/5.2/animation_rigging/
- [summary] Blender 5.0 and 5.1 animation and rigging notes: https://developer.blender.org/docs/release_notes/5.0/animation_rigging/ , https://developer.blender.org/docs/release_notes/5.1/animation_rigging/
- [read] Armature Deform Parent (automatic weights, bone heat): https://docs.blender.org/manual/en/latest/animation/armatures/skinning/parenting.html
- [read] Skin modifier (Create Armature): https://docs.blender.org/manual/en/latest/modeling/modifiers/generate/skin.html
- [read] Command-line arguments (`--online-mode`, `--command`, `--factory-startup`, `--python-exit-code`): https://docs.blender.org/manual/en/latest/advanced/command_line/arguments.html
- [read] Operator gotchas (poll failures, `temp_override`): https://docs.blender.org/api/current/info_gotchas_operators.html
- [read] Bake target items (`VERTEX_COLORS`): https://docs.blender.org/api/current/bpy_types_enum_items/bake_target_items.html
- [read] Rigify basics, 5.2 manual: https://docs.blender.org/manual/en/latest/addons/rigify/basics.html
- [read] Rigify add-on API (developer docs): https://developer.blender.org/docs/features/animation/rigify/
- Referenced for API lookups, not read in full: https://docs.blender.org/api/current/bpy.types.Context.html , https://docs.blender.org/api/current/bpy_extras.anim_utils.html , https://docs.blender.org/api/current/bpy.types.GeometryNodeTree.html , https://docs.blender.org/api/current/bpy.types.NodeTreeInterface.html , https://docs.blender.org/manual/en/latest/animation/shape_keys/index.html
- [local] Bundled Rigify source: `Blender.app/Contents/Resources/5.2/scripts/addons_core/rigify/ui.py`, `generate.py`
- [local] Bundled glTF add-on 5.2.40, meshopt and Draco bridges, `gltfpack_path_ui` preference: `…/addons_core/io_scene_gltf2/`

Blender MCP

- [read] Blender Lab MCP server page (Blender 5.1+, security warning): https://www.blender.org/lab/mcp-server/
- [local] `~/blender_mcp/readme.md`, `readme_tools.rst`, `mcp/blmcp/tools/*.py`, `tools_helpers/blender_cli.py`, `connection.py`, `data/prompts.yml`
- [summary] Project home and wiki (direct fetch returned 403): https://projects.blender.org/lab/blender_mcp , https://projects.blender.org/lab/blender_mcp/wiki/Home

Three.js r180

- [local] `three@0.180.0`: `examples/jsm/loaders/GLTFLoader.js` (extension table, `setMeshoptDecoder`, `setKTX2Loader`, extras to `userData`), `examples/jsm/utils/SkeletonUtils.js`, `src/objects/InstancedMesh.js` (`setMorphAt`), `src/objects/BatchedMesh.js`, `examples/jsm/libs/meshopt_decoder.module.js`, `libs/basis/`, `libs/draco/`
- [read] SkeletonUtils docs: https://threejs.org/docs/pages/module-SkeletonUtils.html
- [read] KTX2Loader docs: https://threejs.org/docs/pages/KTX2Loader.html
- [read] BatchedMesh docs: https://threejs.org/docs/pages/BatchedMesh.html
- Referenced, not read in full: https://threejs.org/docs/pages/GLTFLoader.html , https://threejs.org/docs/pages/AnimationMixer.html , https://threejs.org/docs/pages/InstancedMesh.html , https://threejs.org/docs/pages/LOD.html , https://threejs.org/docs/pages/DRACOLoader.html , https://threejs.org/examples/webgl_animation_skinning_blending.html

Characters, rigs and animation tools

- [read] MPFB2 repository, docs and licences: https://github.com/makehumancommunity/mpfb2 , https://github.com/makehumancommunity/mpfb2/blob/master/docs/services/humanservice.md , https://github.com/makehumancommunity/mpfb2/blob/master/docs/services/faceservice.md , rig list under `src/mpfb/data/rigs/standard` (via GitHub API)
- [read] MPFB getting started (Blender 4.2+, system asset pack): https://static.makehumancommunity.org/mpfb/docs/getting_started.html
- [read] Human Generator licence FAQ: https://help.humgen3d.com/license
- [summary] Mixamo FAQ (royalty-free use, no raw-file redistribution; direct fetch returned 403): https://helpx.adobe.com/creative-cloud/faq/mixamo-faq.html
- [summary] CMU motion capture licence wording: https://mocap.cs.cmu.edu/ , https://www.re3data.org/repository/r3d100012183
- [read] Auto-Rig Pro game engine export docs: https://lucky3d.fr/auto-rig-pro/doc/ge_export_doc.html
- [summary] glTF-Blender-IO issue #2115 (deform-only export lets Rigify control bones through): https://github.com/KhronosGroup/glTF-Blender-IO/issues/2115
- [summary] GameRig: https://github.com/Arminando/GameRig
- [read] Retarget extension page: https://extensions.blender.org/add-ons/retarget/
- [read] Rokoko Studio Live plugin README: https://github.com/Rokoko/rokoko-studio-live-blender
- [summary] Community fork claiming Blender 5.x fixes: https://github.com/abaqDev/Rokoko-Blender-Addon

Crowds and VAT

- [read] OpenVAT README: https://github.com/sharpen3d/openvat
- [summary] Three.js-oriented VAT add-on: https://github.com/flement/VAT-blender-addon
- [read] InstancedMesh2 (`@three.ez/instanced-mesh`) README and docs landing page: https://github.com/agargaro/instanced-mesh , https://agargaro.github.io/instanced-mesh/
- [summary] Three.js forum threads on instancing skinned meshes: https://discourse.threejs.org/t/instance-animated-skinned-mesh/48489 , https://discourse.threejs.org/t/how-to-batch-skinned-mesh/30348

World modules

- [summary] Trim sheets and texel density: https://3dtexel.com/trim-sheets-texture-atlases-the-game-environment-workflow/ , https://www.beyondextent.com/articles/balancing-modularity-and-uniqueness-in-environment-art , https://polycount.com/discussion/194677/texel-density-vs-trim-sheet
- [summary] Intel, modular concepts for game assets (PDF): https://www.intel.com/content/dam/develop/external/us/en/documents/modularityforgames.pdf
- Referenced, not read: Texel Density Checker add-on https://github.com/mrven/Blender-Texel-Density-Checker , meshoptimizer and gltfpack https://github.com/zeux/meshoptimizer , glTF Transform https://gltf-transform.dev/

Repository files read

- `AGENTS.md`, `docs/ART-DIRECTION.md`, `docs/GAME.md`, `docs/CHARACTERS.md`, `docs/drama/README.md`, `.agents/skills/maple-blender-assets/SKILL.md`, `apps/game/src/world/regional-residents.js`, `apps/game/src/world/regional-architecture.js`, `apps/game/src/train/train.js`, `apps/game/src/simulation/npc-minds.js`, `apps/game/src/agent/build-tools.js`, `apps/game/src/agent/world-authoring.js`, `apps/game/vite.config.js`, `apps/game/package.json`
