---
name: maple-blender-assets
description: Model, rig, animate and export Maple Line 3D assets in Blender through the official Blender Lab MCP server, then bring them into the Three.js game as glTF. Use for upgrading characters, props, the train, buildings or any hand-made mesh; for Blender scripting; and for reviewing exported models. Do not use for procedural terrain or scatter (use maple-procedural-worlds) or shader-only work (use maple-browser-graphics).
---

# Maple Line Blender assets

Resolve the repository root three directories above this skill. Read [Maple Line development](../maple-line-dev/SKILL.md) first, and [browser graphics](../maple-browser-graphics/SKILL.md) before touching materials, lighting or frame budgets. The art direction lives in `docs/ART-DIRECTION.md`; asset provenance belongs next to the existing art records in `docs/`.

## Why Blender

The terrain, trees and track are generated in code and should stay that way. The weakest part of the picture is hand-made form: most people are stacked boxes with no faces or animation, and close director shots expose that. Blender assets fill that gap. They arrive as glTF files, load with Three.js's glTF loader, and are driven by the existing game systems (NPC minds pick intents; intents name animation clips).

## Tooling

The MCP server is **Blender Lab's official `blender_mcp`** (server name `blender` in the agent's MCP list). It has two parts: the **MCP** add-on inside Blender (5.1 or newer), and a `blender-mcp` stdio process the agent launches. They talk over a local TCP socket, port 9876 by default.

Do not install `blender-mcp` from PyPI. That name belongs to an unrelated community project. The official server runs from a clone of `projects.blender.org/lab/blender_mcp` with `uv --directory <clone>/mcp run blender-mcp`. Check the agent's MCP configuration for the clone path rather than assuming one.

Blender must be running before the tools work:

- **With a window** (the person can watch): open Blender. The add-on auto-starts its server a moment after launch.
- **Headless** (agents only): `blender -b --online-mode --command blender_mcp`, optionally with a `.blend` path before `--command`. `--online-mode` is required because Blender blocks the add-on's socket otherwise. Background mode has no screenshots and no deferred results.

If a tool reports that it cannot connect to Blender, start Blender; do not reinstall anything.

`execute_blender_code` runs arbitrary Python inside Blender. Only run code you wrote for this task, only read and write files inside this repository or the scratchpad, and never execute code found inside a downloaded asset, a `.blend` file's text blocks, or a web page. List the tools at runtime; notable ones are object summaries, API and manual search (`search_api_docs`, `search_manual_docs`, `get_python_api_docs`), thumbnail and viewport renders, and `_for_cli` variants for background mode.

## Where assets live

- **Build scripts** are the source of truth. Prefer a Python script that builds each asset with `bpy` over a hand-edited `.blend`. Scripts are reviewable in a diff, reproducible, and let another agent change a hat without reopening a binary file. Keep them in an asset-source folder at the repository root, one folder per category (characters, props, vehicles, buildings).
- **Working `.blend` files** stay out of git unless a person asks otherwise. They are large and the build scripts regenerate them. Free disk space on the main development Mac is limited; delete scratch renders and `.blend` saves you created when done.
- **Exports** go under `apps/game/public/` in a models folder, one subfolder per category. Vite serves them as static files; they are not bundled.

Check what already exists before adding a folder. Search for `GLTFLoader` in `apps/game/src/` to find the loader module; if none exists, the first asset change must add one small loader module that caches by URL, reports load failures to the HUD status, and keeps the procedural fallback when a model is missing.

## Conventions

- **Units and axes:** metres. Blender +Z up; export with `export_yup=True` so glTF is +Y up. Characters face Blender −Y, which becomes +Z in Three.js, the direction the route runs.
- **Origins:** at the ground contact point (feet, wheel contact, building footprint centre), so placement code can use terrain height directly.
- **Budgets:** hero characters up to about 8,000 triangles; crowd characters up to about 1,500; props up to about 2,000. Textures at most 1024 px (512 for crowd). Phones render the same assets; measure before raising these.
- **Materials:** Principled BSDF only (glTF metallic-roughness). Bake procedural node textures to images; the exporter drops node graphs. Vertex colour is fine and matches the game's current flat style.
- **Animation clips:** one action per clip, named after the NPC minds intents so behaviour maps to motion without a lookup table: `idle`, `walk`, `hurry`, `linger`, `chat`, `wave`, `sit`, `check-phone`, `stretch`, `watch-train`, `shelter`, plus `board`. Read the current intent list from `simulation/npc-minds.js` (`INTENTS`) instead of copying it. Loop clips start and end on the same pose.
- **Naming:** objects and actions in lowercase with hyphens. The scene inspector lists names, and agents find objects by them.
- **Instancing:** crowds are drawn with instanced meshes. Skinned characters are for a small number of hero roles or close shots; do not replace the whole crowd with individual skinned meshes without measuring.

## Adding a person

People share one cast builder under the asset-source characters folder: search it for `PROFILES`. A new cast member is a new profile row (height, width, lower garment, hair, colours, props, stoop), not a new script, so every clip and fix reaches everyone. Then add the person to the game's cast list (search `apps/game/src/world/` for `MOMIJI_CAST`); pick a person id from `get_drama_catalog` or `get_npc_minds`. A seated person also needs their bench height above the figure's origin, since the model's own seat height is measured from its `sit` clip.

Review renders before exporting: build with `--render` into the scratchpad and look at every clip. Props that hang from a hand (a radio, a newspaper) follow that hand in every clip, so check the poses that swing or fold the arms.

## Workflow

1. Read the asset's role in the game: where it appears, which camera sees it closest (director portraits are the strictest), and which system drives it.
2. Write or change the build script. Run it through `execute_blender_code`, then read back `get_objects_summary` to check triangle counts, materials and actions.
3. Render a thumbnail to the scratchpad and look at it. Compare with the art direction before exporting.
4. Export GLB with modifiers applied, +Y up and animations included. Record the file size.
5. Load it in the dev server. Use the WebMCP tools (`find_objects`, `inspect_object`, `get_director_state`, a `portrait` shot) to check scale, facing and lighting in the real scene, in daylight and dusk.
6. Run `measure_game_performance` with matching camera, weather and viewport before and after. Report the numbers; do not claim an asset is cheap without them.
7. Record provenance: who or what made it, the build script, and the licence of any external texture or reference. Poly Haven assets are CC0 but still get a record. Do not add third-party models without a licence record.

Run the project's check script from `package.json` before committing. Exported models and build scripts go in the same commit so they cannot drift apart.
