# Story level audit

Inspected 21 September 2026. This is a code-based implementation audit and a proposed level plan, not a claim that the proposed interactions exist. The final story conflict and script remain the writer’s decision.

## What a level needs to express

Haru’s age and notebook alone do not create a playable conflict. A useful working hypothesis is that he measures his worth by being the person who knows what to do. Emi and the people along the line need him to listen, accept help, and keep a promise that cannot be fulfilled by another railway anecdote. If the rewritten story selects a different conflict, preserve the structure below: put the player’s habitual action in tension with a named person’s present need, then show what changed.

A level should have one place, one person doing a job, one object the player can identify, one decision or skilled action, and an observable consequence. Dialogue can establish or reflect on that action. It should not substitute for it. A return visit should reveal a changed arrangement of people and objects before explaining the change in text.

## What exists in the code

| Surface                               | Existing behavior                                                                                                                                                              | Limit relevant to story levels                                                                                                                                            |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `world/extended-route.js`             | Fourteen additional stops between Sakuragawa at z1500 and Harumi at z23300; route ends at z24000. 152.4m bridge at z6250; tunnel z11400–11760; summit rail elevation 399.15 m. | A single fixed route. Theme names and different roofs do not make fourteen authored levels.                                                                               |
| Streaming                             | 600m chunks; current chunk plus two on either side loaded. Groups hidden beyond roughly 1,650 m. Canopy queries use loaded chunks.                                             | Chunk visitors are recreated when chunks rebuild. Their arrival/waiting animation is not a persistent resident life or quest.                                             |
| `simulation/population.js`            | Momiji commuters arrive, queue, approach doors, board; residents use defined home/shop/garden paths and dwell.                                                                 | Core population uses Momiji-specific coordinates and service cycles. Extended stations do not share its full boarding model.                                              |
| `narrative/story-cast.js`             | Haru and Emi models, props, small gestures, scene placement; cinematic camera integration exists.                                                                              | A presentation cast, not free-roaming actors with inventory, workstations, or player-controlled movement. Station positions are explicitly listed.                        |
| `narrative/story-engine.js`           | Ordered beats, replies, memories, local save validation, arrival gating and field notes.                                                                                       | Progress is a linear prefix ordered by z. It cannot author a return-trip scene sequence or arbitrary quest dependencies simply by adding more beats.                      |
| `narrative/story-host.js`             | Holds the train for conversation, prepares/resumes travel, exposes a scheduled stop.                                                                                           | `prepare()` sets forward direction; coordinates are clamped to the fixed route. Its location shortcut is not a walk or a physical branch traversal.                       |
| `simulation/station-duties.js`        | Momiji passenger-service check, actual door effects, boarding dwell, passing-train wait, departure.                                                                            | Session-only. Three-second boarding requirement is independent of whether every physical commuter has boarded. Passenger/freight choice does not move points.             |
| `world/passing-loop.js`               | Visible local on a separate siding, coordinated with duty progress.                                                                                                            | No general rail-block occupancy, junction interlocking, or route assignment for the player.                                                                               |
| `simulation/physics.js`, `journey.js` | Longitudinal train dynamics, grade/weather adhesion, brake response, door traction lock, terminal reversal and scheduled stops.                                                | No rigid-body train simulation, walking controller, platform collision world, or general interlocking authority. Terminal reversal is not a authored return-story system. |
| `agent/world-authoring.js`            | Seven visual prefabs; validated transforms; instanced drawing; atomic batches; import/export; undo/redo.                                                                       | Explicitly visual only. No interaction component, path, trigger, collision clearance, rail connection, or quest reference. Every commit rebuilds the authored layer.      |
| `agent/world-builder.js`              | Validated world-setting proposals, cancellation and activation lifecycle.                                                                                                      | Changes world settings; cannot turn a prose request into authored interactive levels.                                                                                     |
| Inspector and WebMCP                  | Scene inspection, raycasts, measurements, and validated duty/story actions.                                                                                                    | A render-object name is not a saved gameplay entity ID. Tools must not award progress by mutating meshes or saves.                                                        |

All positions in this document are current route coordinates, not real Japanese geography. The line is a fictional regional railway.

## First playable slice: Momiji, outward and homeward

Build one station with a consequence that survives a reload before building another biome. Keep the present railway geometry. The player's camera moves to a work area while the train remains securely stopped; a walking controller is optional later, not a prerequisite disguised as completed work.

**Scene bounds:** z465–575, existing platform, bakery delivery entrance and service bench. Reserve the track corridor and door approaches. Provide three named interaction anchors: platform crate shelf, dispatch desk, damaged bench. Every anchor needs a visible object, a readable camera composition, and a keyboard-selectable equivalent to pointing at it.

**Residents:** Nao carries bread to the shelf, a station attendant checks dispatch, and a waiting passenger uses the bench after repair. Give each person a current task and a route ending at a real surface. They should not all stare at Haru or stand idle in a line.

**Action loop:** inspect the service card → ask Nao which crate is for the mountain café → accept/load the tagged crate → board and check doors → request the line → wait for the visible local → depart. An incorrect crate selection produces specific feedback and permits correction. Merely opening a panel must never mark a delivery complete.

**Conflict beat:** Haru assumes he knows the usual delivery; Nao has changed the arrangement. The player can read/ask and act on that information. If dialogue offers stubbornness, it must affect what happens next without permanently trapping the story. Avoid a moral score attached to the option the writer prefers.

**Return consequence:** the accepted crate is gone from Momiji and present at its destination; the used shelf is cleared; the passenger occupies the repaired bench only if that work happened. Nao’s next task and greeting reflect the actual delivery outcome. Show at least two changes in the world before opening a recap.

**Acceptance:** the same parcel cannot be loaded twice; delivered state survives reload and chunk eviction; departing with an unsafe door state is rejected by the shared action layer; the story shortcut cannot bypass an active task; free exploration can suspend the story without corrupting it.

## Candidate later scenes for the rewritten arc

These are design options, not approved plot or implemented features. Choose three to five consequential places; let the other stops remain quiet travel rather than manufacturing a task at every platform.

| Place and existing location                | People and work                                                         | Player verb                                            | Consequence and required scene assets                                                                                                                                   |
| ------------------------------------------ | ----------------------------------------------------------------------- | ------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Momiji z525                                | Nao preparing a changed delivery; attendant receiving the service       | Inspect, ask, load, board, request                     | Persistent crate ownership; tagged shelf, delivery cart, occupied dispatch desk                                                                                         |
| Sakuragawa z1500                           | Café worker making room for the crate; customers moving seats           | Unload, place, listen                                  | Café hatch opens and the bread appears on a counter; hands and package align during transfer                                                                            |
| Takabashi z6400, bridge approach6250       | Emi trying to record an interval without Haru explaining it             | Coast, hold speed, choose when to record               | A retained sound/memory from actual driving; no invented recording when audio was never captured/generated; wind shelter and safe stopping/viewing point off the bridge |
| Hinoki z8000                               | Younger maintainer diagnosing a familiar problem                        | Observe, hand over a tool, accept clearance            | Work finishes using the maintainer’s method; changed indicator and worker pose. Do not reward guessing with unauthorized movement on an occupied route                  |
| Yukihara z12800                            | Snow crew clearing a pedestrian approach; someone waiting under shelter | Wait, request assistance, choose a safe platform route | A usable platform path and relocated workers; authored walk surfaces, snow state and tool rack. Railway points remain decorative until an actual junction exists        |
| Harumi z23300 or an authored homeward stop | A family member preparing an event Haru has promised to attend          | Plan departure, choose a return stop, arrive           | Event preparation advances through persistent states; family activity remains visible on arrival. Slow reading never consumes the arrival window                        |
| Momiji return                              | The same residents finishing their day                                  | Recognize, return an item, take a seat                 | Modified props and routines prove the outward decisions mattered. Different staging and light are supplementary; a tint change alone is not consequence                 |

## Required module boundaries

### Saved quests and world facts

Add `simulation/quest-engine.js`, independent of rendering and linear narration. Use stable IDs for quests, actors and props. Suggested state: `{version, campaignRevision, quests, inventory, worldFacts, returnPhase, actionSequence}`. Persist only logical facts and checkpoints, not mesh references or every animation frame.

Commands such as `inspect-item`, `accept-delivery`, `load-parcel`, `deliver-parcel`, `request-work`, and `acknowledge-clearance` validate prerequisites and return events. The renderer consumes facts such as `bread.momiji.loaded` and `bench.momiji.repaired`. Repeat commands are idempotent. Loading a save reconstructs the same world state without replaying rewards or voice.

Add `narrative/campaign-flow.js` for beat dependencies, leg/direction, completion facts and optional scenes. Keep `story-engine.js` as the dialogue/choice executor while migrating its ordered-prefix assumption explicitly. Do not silently reinterpret old saved beat indices under a rewritten campaign. Preserve an incompatible save until the player chooses to start the new story, or write and test a versioned migration.

Add `world/level-runtime.js` to mount authored scene manifests into streaming chunks and apply quest facts on every mount. Example data: `{id, bounds, anchors, actors, props, paths, interactions, cameras, variants}`. Logical state survives chunk disposal. Assets and listeners do not. Editor exports may reference approved component types but may not include executable scripts.

### Actions, train permissions and walking

Add `simulation/action-authority.js` as the one validator called by UI, keyboard, autopilot and WebMCP. Inputs are intent, current train state, scene state and world facts. Return `{ok, reason, events, effects}`; the host applies effects once. Retain existing engine guards as defense against malformed calls.

For a platform interaction require the correct stop, sufficiently low measured speed, an available surface/interaction anchor, and any required door state. Loading must verify the specific parcel and destination. Movement requests must respect dialogue hold, open/closing doors, active duties, occupancy and route authority. A hidden or disabled button is not enforcement.

A later walking mode needs walkable surfaces, steps/ramps, capsule collision and train-door transfer points. Do not permit a free camera to stand in for a walking character. The initial slice can use explicit station work views with honest labels such as “Inspect the delivery shelf.”

### Physical branches and return travel

Only build a player-operated junction when its story value is clear. Add `simulation/route-graph.js` with nodes, directed rail edges, lengths, splines, speed limits and platform references. A train position becomes `{edgeId, s, direction, routePlan}`; trailing cars follow the traversed edge history across a junction.

Add `simulation/interlocking.js` with block occupancy, points state, route locks and clearance. An occupied or locked switch cannot move. A signal clears only when the reserved route is continuous and protected. Persist intentions/checkpoints, then recompute safe occupancy and locks from restored train positions; do not trust a saved green signal.

Migrate rail sampling, camera look-ahead, station distance, grade, catenary placement, AI paths and inspectors to the graph together. Until then, service selection remains a manifest check and the fixed-route terminal reversal is the only physical return mechanism. For a first return-story slice, use the existing same-track reversal plus leg-aware scene scheduling; a graph is unnecessary unless the player selects a branch.

## Asset and performance budgets

These are proposed acceptance budgets, not current benchmark results. Measure the existing scene before adding the slice, at the same viewport, camera and settings.

| Budget             | First station slice target                                                                                                                                                                                                    |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Authored area      | One 120 m station area, at most 3 interactive anchors and3 named quest actors                                                                                                                                                 |
| Visible population | Reuse existing station actors; at most 8 detailed people in the near shot, with distant people as simpler instances                                                                                                           |
| Added draw work    | At most 60 additional draw calls including shadow/reflection passes at the reference shot; measure total calls, not just primary-scene meshes                                                                                 |
| Added geometry     | At most 100k submitted triangles across all passes at the reference shot; use instancing/shared materials for repeated props                                                                                                  |
| Lighting           | Reuse sun/ambient setup; emissive lamps. No new per-prop shadow-casting point lights                                                                                                                                          |
| Streaming          | Preserve bounded active chunks; no actor/save reset on unload. After three return visits, resource counts settle at the same bound                                                                                            |
| Simulation         | Quest and permission checks event-driven; nearby actor paths updated at 10–20 Hz with render interpolation; remote residents stored as logical schedules                                                                      |
| Assets             | Shared prop atlas up to 1024² for first slice; no full character-sheet image in the running world; optional notebook art loads on demand                                                                                      |
| Timing             | Target 60 fps at the existing 2M physical-pixel cap, investigate a slice-induced p95 increase over 3 ms. Record hardware, viewport, weather and camera. If baseline already misses target, reduce scene cost before expanding |
| UI                 | One compact objective card, one optional inspected-object view; no stacked quest/dialogue/driver panels. Keyboard alternatives and reduced-motion transitions required                                                        |

`rendering/frame-budget.js` already reports frame intervals, CPU time, pixels, draw calls and triangles. Its CPU measurement is not GPU time. Water and shadow passes are included in draw totals. Compare both rainy exterior and platform conversation shots; a quiet indoor-looking shot is insufficient evidence.

## Build order and test gates

1. Freeze the story conflict, the outcome of the Momiji task and the changed return scene. Name the actors and prop IDs before modeling.
2. Add quest facts and action validation with headless tests: unavailable actions, double delivery, story suspension, malformed input, restore/migration and no-reward replay.
3. Author the station anchors and tagged parcel. Render at platform scale; verify door and path clearance and camera views before adding decorative clutter.
4. Bind visible transfers and actor routines to validated facts. Test save/reload at every transfer phase; define a single committed ownership point.
5. Add a same-track homeward visit and verify persistent changes after chunk unload/reload. Only then generalize the template to the café or maintenance scene.
6. Measure the slice, including rain, shadows and reflections. Add one cinematic for a consequential action; avoid a cutscene for every button.
7. Add route graph/interlocking only if an approved level needs a physical switch. Test trailing-car continuity, occupancy and reversing through points before narrative decoration.

The useful expansion is deeper use of a few places. Additional forests, skyline towers or random pedestrians cannot supply the conflict, memory or return consequence that the player’s actions must create.
