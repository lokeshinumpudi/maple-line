# Agent level building

Run `pnpm dev` and attach an agent browser to `http://127.0.0.1:4173/`. Native WebMCP exposes 20 tools in supported browsers. The same tools work through `window.mapleWebMCP.invoke(name, arguments)` when native discovery is unavailable. These development tools require no manual snapshot or JSON transfer from the player.

The authored layer adds visual scenery to the existing railway. It does not replace terrain, change rails or bridges, introduce collision physics, or modify source files. The separate Jev prompt-to-world interface remains available.

## Read before editing

1. `get_world_state` reads camera, train, weather, loaded route chunks, population, wildlife, performance and authored counts.
2. `sample_route` with `{"positions":[95,6250,11580,12800]}` gives rail position, sampled ground either side, tunnel state and nearby stations. Distances are metres; Z is the route coordinate, not travelled arc length.
3. `get_build_catalog` lists seven prefabs, limits and art settings. `inspect_level` filters authored entities by ID or rectangular bounds. Base objects remain accessible through `find_objects`, `inspect_object` and `pick_world`.

## Compose scenery

Use `edit_level` for one atomic batch. An invalid operation leaves the whole batch unapplied. Every entity has a stable ID; rotations use radians. `groundSnap` sets its base to terrain height. Scenery does not automatically avoid water or rails; inspect the sampled terrain and keep the track clear.

```json
{
  "label": "Shrine hillside grove",
  "operations": [
    {
      "type": "scatter",
      "idPrefix": "shrine-maple",
      "kind": "broadleaf-tree",
      "seed": 72,
      "count": 16,
      "bounds": { "minX": 75, "maxX": 90, "minZ": 80, "maxZ": 110 },
      "scaleRange": [0.6, 1.1],
      "color": "#c39849"
    },
    {
      "type": "place",
      "entity": {
        "id": "shrine-gate",
        "kind": "torii",
        "position": [71, 0, 95],
        "rotation": [0, 1.57, 0],
        "groundSnap": true
      }
    }
  ]
}
```

Other kinds are `cedar`, `rock`, `grass-patch`, `lantern`, and `bench`. Update with `{"type":"update","id":"shrine-gate","patch":{"color":"#a54834"}}`; remove with `{"type":"remove","id":"shrine-gate"}`. Use `undo_level` and `redo_level` to move through 20 history entries. Limits: 100 operations per batch, 200 entities per scatter, 1,000 entities in the authored layer. Shared instanced batches group matching prefab materials.

`set_art_direction` accepts `{"settings":{"exposure":1.1,"sunIntensity":2.8,"ambientIntensity":1.8,"fogDensity":0.0025,"sunColor":"#ffe2b4"}}`. Empty settings restores weather-driven lighting. These overrides are temporary and separate from saved scenery.

## Save and transfer

`save_level` with `{"slot":"shrine-study"}` saves in this browser origin's local storage. `list_levels` lists up to 20 slots; `load_level` restores one and can be undone. Saves survive reloads but are not automatically loaded and are not shared with another browser.

`export_level` pages through full entity records with `offset` and `limit` (maximum 100). Collect all pages into `{"version":1,"entities":[...]}`. An agent can save that result in the repository using its filesystem tools, then use `import_level` with `{"layout":...}` later. Import validates the complete layout before replacing the authored layer. Neither the player nor the agent needs to copy snapshots manually through chat.

## Measure the result

Invoke `measure_game_performance` with `{"durationSeconds":5}` before and after a change. It accepts 1–10 seconds and returns:

- Observed average FPS, median/p95/max frame interval and frames over 20 ms.
- Median/p95 CPU frame time. This is submission time, not GPU execution time.
- Mean draw calls and triangles across all main, shadow, reflection and refraction passes.
- Physical render pixels, pixel ratio and adaptive resolution scale.
- Start/end camera and train positions, plus renderer geometry/texture counts.

Compare the same view, weather, window size and movement after shader compilation settles. Hidden-tab samples are excluded, but visible long frames remain in the report. A backgrounded browser can yield too few samples. The 60 fps target is a goal, not a guarantee.

The renderer caps its normal physical pixel count at two million and can reduce that budget to 49% after sustained missed frames. It recovers gradually. Shadows and river reflections update at most 20 times per second; refraction remains current with the camera. Rail meshes are split into spatial sections so distant track can leave all render passes.

Use screenshots as well as timings. These tools do not judge composition, tree silhouettes, camera obstructions, or whether a placement makes visual sense.
