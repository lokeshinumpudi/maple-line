# Maple Line: Japanese countryside world plan

## Direction

Build a railway journey with the density of activity that makes a city game feel inhabited: people going somewhere, roads with traffic, stations with routines, changing weather, and recognizable districts. Keep the player focused on driving the train. GTA is a reference for world activity and continuity; this project does not promise GTA's simulation scope or fidelity.

The visual target is an illustrated, geographically coherent Japan: layered mountain silhouettes, dark cedar groves, gold and rust deciduous foliage, weathered village roofs, rice paddies, concrete river defenses, overhead railway equipment, and a city visible long before arrival. Preserve bold shapes and restrained outlines. Improve composition, materials, and scale before adding more objects.

## Current implementation

The prototype has village/field/shrine/city landmarks, a steel railway bridge, a three-car train, clear/rain/snow controls, surface snow, dusk windows, clustered ground flora, and a bending river with visible shallows. River water uses a 512 × 512 planar scene reflection plus a separate refraction capture. Driver view stays ahead of the carriage shell. Scenic mode passes the station and repeats the same finite route with terminal dwell/reversal; optional Auto drive defaults to 45 km/h, with 28/36/45 km/h targets selected by the enabled AI director. The station challenge remains separate.

Village residents follow local errands, while commuters approach the station, wait, and board through aligned open doors. Door controls, emergency braking, HUD visibility, and the active four-mode camera rig—including Orbit—are wired into the UI. The optional Jev director selects bounded autopilot pace and station activity; one live rainy-station request returned cautious/shelter. It does not control manual driving or override interlocks. Native WebMCP discovery listed all seven tools in isolated Chrome for Testing; the existing Chrome Agent session uses the labelled page-local fallback.

The original valley also has 11 trout schools, grazing/alerting sika deer, and woodland birds that fly from branch perches and return in rain/dusk. Wildlife follows bounded deterministic paths; it is not a food chain or general animal navigation system. River normal layers now move downstream in coordinates aligned to the bends, preserving the existing reflection and refraction passes. Water remains a flat surface rather than a fluid simulation.

Foliage is grouped spatially for visibility and nearby shadows, but the entire route is still generated at startup. Snow changes this route rather than loading a separate mountain region. Longer services, route streaming, traffic, multi-station timetables, and saves below remain planned work. No measured frame-rate target is claimed.

The workspace is `/Users/lokeshinumpudi/Desktop/maple-line`, using pnpm and Turborepo. `apps/game` is the `@maple-line/game` package; its modules live in `apps/game/src/` and tests in `apps/game/tests/`. `apps/director` hosts the local AI SDK 7 Jev evaluation service. `pnpm dev` starts both apps, with the game on port 4173 and director on port 4175. Run `pnpm dev`, `pnpm test`, or `pnpm check` at the workspace root. `pnpm build` writes `apps/game/dist/`; `pnpm build:readable` writes `apps/game/dist-readable/`. Documentation and evidence remain in root `docs/` and `artifacts/`. See [AI director](AI-DIRECTOR.md) for data flow and limits and the [local development skill](../.agents/skills/maple-line-dev/SKILL.md) for source workflow.

## Historical baseline before the art pass

The original prototype had one approximately 1.6 km track curve in a procedural autumn valley, a simple river shader, instanced trees and rocks, three train cars, overhead wires, one station, daylight/dusk controls, sound, and a station-stop challenge. It drew the entire route at startup, and reaching or missing the destination ended the attempt.

At that point, the river animated highlights without reflecting nearby objects. Pedestrians, rain, snow, city landmarks, and a continuous round trip had not yet been added. This paragraph records the starting point, not present capabilities. The remaining sections describe proposed work and acceptance targets unless explicitly identified as implemented above.

## Next route slice (planned)

Deliver a continuous 10–15 minute service with three visually different places: an autumn gorge, an inhabited riverside village, and the edge of a regional city. Use a route authored for scenic reveals, with procedural forest and rocks filling the space between landmarks. The exact route length should follow actual driving tests and station dwell times.

The slice must support starting, driving, stopping, boarding, departing, passing a stop, and continuing to the next destination. A missed station costs service score rather than ending the world. A free-drive option removes scoring. Complete the service at a terminal, then offer the next service without reloading the renderer.

First-pass visual deliverables:

- A river bend with readable shallows, foam around rocks, and a visible viaduct.
- One village station with a tiled roof, benches, vending machines, bicycles, platform markings, and 8–16 visible passengers.
- A distant skyline that gains detail as the train approaches, followed by warehouses, apartment blocks, road crossings, and an elevated approach.
- One intentional weather state per route section, with a gradual blend where sections meet.
- Driver, follow, and scenic cameras that preserve a useful view at every supported speed.

Snow country follows this slice. Introduce it over a mountain pass and through a tunnel into a new watershed; avoid placing summer paddies immediately beside deep snow without altitude or seasonal explanation.

## Route and streaming architecture

### Route data owns the world

The current modules are separated into `apps/game/src/{camera,simulation,state,world,train,agent,ui}/`, with setup and frame-loop wiring in `apps/game/src/main.js`. Add route data and chunk generation as the next extraction, rather than rebuilding the existing module split. Use route distance in metres as the shared coordinate for train position, station events, speed restrictions, scenery activation, and saves.

A route section records its ID, distance interval, spline controls, elevation, biome blend, terrain profile, station references, and authored landmark placements. A chunk records route version, section ID, chunk index, seed, and generated bounds. Random choices must derive from the chunk seed; adding a tree in one chunk must not rearrange the whole route.

Use 200 m chunks as an initial tuning value. Keep about 1,200 m ahead and 600 m behind loaded, plus separate distant silhouettes. Load farther ahead at higher speeds and around upcoming viewpoints. Turn generation into small scheduled steps; add workers later if measured generation time causes missed frames. Queue forward chunks first and retain a small reuse pool. Shared assets need reference tracking so unloading one chunk cannot dispose another chunk's geometry or material.

Route-distance sampling must return position, forward, up, and right consistently. Rails, ballast, catenary, train wheels, station alignment, and camera anchors use that frame. Chunk ends share boundary samples and terrain heights. Test continuity on curves and grades, including the first and final metre of each chunk.

Use high-detail scenery near the track, coarse geometry farther away, and distant mountain/city silhouettes beyond that. Keep silhouettes stable while detail fades in. Do not replace an entire skyline visibly at one distance threshold.

For longer routes, retain global route distance in simulation and shift the local render origin in coarse steps. Translate train, cameras, lights, particles, and loaded chunks together. Defer this until route size or observed precision warrants it; it is unnecessary for the initial short service.

### Author the views; generate the infill

Author station layouts, bridges, tunnels, village centers, shrines, waterfalls, skyline shapes, and the sequence of scenic reveals. Reserve unobstructed view corridors before spawning trees. Position foreground branches selectively rather than filling every slope at equal density.

Generate tree clusters, bushes, stones, field rows, minor houses, and background buildings from biome rules. Use exclusion volumes for track clearance, station sight lines, roads, rivers, and camera paths. Forest clusters need clearings, age/height variation, edge shrubs, and species groups; random independent tree positions alone look artificial.

## Journey and biome sequence

| Section           | Main view                                    | Near-track detail                                          | Transition                                                    |
| ----------------- | -------------------------------------------- | ---------------------------------------------------------- | ------------------------------------------------------------- |
| Autumn gorge      | Turquoise river and overlapping cliffs       | Mixed cedar/maple forest, moss, rock cuts, retaining walls | Valley opens; slopes reduce and fields appear                 |
| Rural basin       | Village roofs and paddies reflecting the sky | Irrigation channels, farm tracks, homes, utility poles     | More road crossings and buildings per kilometre               |
| Regional city     | Skyline beyond river bridges                 | Apartments, factories, traffic, platforms                  | Elevated track brings the distant skyline into the near field |
| Mountain approach | Forest ridges and reservoir                  | Cedar groves, galleries protecting track, tunnel portals   | Climb gradually; cloud base falls and vegetation thins        |
| Snow country      | Snow-covered peaks and steaming settlement   | Snowbanks, dark conifers, warm station windows             | Tunnel or pass gives a clear geographic reveal                |

This is a fictional route inspired by Japanese countryside. Landmarks can borrow construction patterns and landscape characteristics without pretending the route is an accurate map of a real railway.

## People and activity

Use a small shared library of stylized bodies with varied clothing and silhouettes. Start with platform waypoint paths and simple states: arrive, wait, walk to door, board, and leave. Synchronize boarding to train stopped, doors open, and correct platform side. Only animate visible or nearby people. Maintain passenger counts and the next schedule event for unloaded stations rather than simulating invisible walkers.

The current local population already uses authored paths and door-state checks. Expanding it into the next route slice needs no free-roaming navigation mesh. Station paths, crosswalk paths, and sidewalk loops are sufficient. Keep feet on authored surfaces and avoid pedestrians spawning in the player's immediate view. Rain adds umbrellas and shelter-seeking behavior; snow changes clothing and walking cadence. These variations follow the basic station simulation, not before it.

Add road traffic as vehicles following lanes, with stops at crossings. Crossing barriers and road vehicles must obey the same train-approach event. Distant traffic may use cheaper moving shapes and lights. Farm activity, laundry, smoke, and lit interiors add life without requiring a simulated person for every house.

## Water, reflections, and weather

### Water

Give water a coherent riverbed shape, slow/fast flow zones, opaque depth color, bank shallows, foam near obstacles, and a reflection contribution. A river should read from both the driver view and an elevated scenic camera. Keep reflective paddies and reservoir water distinct from fast river water.

The current river already has a limited-resolution planar scene reflection and a refraction pass. Add a quality setting that can fall back to sky/environment reflections and stylized highlights on lower-power devices; that fallback would omit local reflected objects. Reflect only relevant terrain, train, and skyline; exclude UI, particles, and the reflection surface itself. Update less often than the main scene when movement allows it, and fade distant reflected detail. Avoid creating a separate reflection render for every stream and puddle.

Planar reflections are appropriate for a shared flat water surface and add another scene render. Curving rivers with varying elevation need section-specific treatment. Do not promise physically accurate reflections for every surface. Screen-space reflections are a later experiment, with documented off-screen omissions and a fallback to environment reflection.

### Rain and snow

Render precipitation in a bounded volume around the camera, not over the entire route. Anchor particles in world space and recycle them outside the volume so train motion does not make rain travel with the cab. Driver mode must mask precipitation inside the vehicle. Add windshield droplets and a wiper only after the cab has a proper window opening and stable view.

Rain adjusts sky, fog, sun intensity, surface roughness, water disturbance, and audio together. Wet rails and roads can be reflective without making every ground surface mirror-like. Snow needs accumulation masks on upward surfaces, roofs, platform edges, trees, and distant terrain; particles alone do not create snow country. Never whiten windows, moving wheels, or sheltered platform floors indiscriminately.

Blend weather intensity over approximately 30–90 seconds as a tunable art choice. Keep weather phase separate from game physics time. Pause freezes the simulation; screenshot/photo mode may expose a separate presentation control later. Driving grip and braking changes are a separate gameplay decision and require retuning the stop challenge before enabling them.

## Rendering targets and measurement

These are initial targets for profiling, not measured performance claims.

| Tier               | Target                                   | Starting limits                                                                                                                               |
| ------------------ | ---------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| Desktop balanced   | 60 fps at a defined 1080p test viewport  | Pixel ratio capped around 1.5; about 250 main-view draw calls; 1 million visible triangles; 2K near-train shadow map; environment reflections |
| Desktop high       | 60 fps where measured hardware allows it | Optional half-resolution water reflection; denser foreground detail; longer shadow and scenery range                                          |
| Mobile/lower power | 30 fps at reduced internal resolution    | Pixel ratio near 1; about 120 main-view draw calls; 350k visible triangles; 1K shadows or simplified shadows; reduced particles and NPCs      |

Profile the same saved camera position and weather preset on named devices. Record frame-time median and 95th percentile, draw calls, triangles, shader compilation pauses, chunk generation spikes, and available memory indicators. Reflection and shadow passes add work beyond main-view draw calls. Use renderer counters and browser performance traces; do not infer GPU memory directly from asset counts.

Budget visible NPCs at 16 for the first slice, then raise only after profiling. Use shared geometry/materials and instances for trees, sleepers, catenary, roof modules, and repeated buildings. Cap shadow-casting detail around the train. Particle count, vegetation density, shadow quality, reflection resolution, and render scale should have explicit quality controls. Preserve useful railway landmarks and safety signals even on the lowest tier.

Long-run acceptance: drive for 30 minutes across repeating load/unload cycles and confirm loaded chunk counts and resource counts reach a stable range. Avoid a rising object count, unbounded caches, or a hitch at every chunk boundary.

## Cameras and visual QA

The original driver-view fault came from putting a smoothed camera close to opaque train geometry: at speed, its position could lag into the carriage. The current view uses a rigid anchor ahead of the shell. Preserve that clearance while adding a finished cab with real window openings, thin framing, and a dashboard below the horizon.

Apply rigid positional tracking in driver mode. Smooth orientation cautiously and independently, retaining a visible track ahead on bends and grades. Avoid routing camera transitions through opaque train walls; snap or use a validated transition path. Scenic cameras must check terrain clearance, forest obstruction, and the direction of the next landmark. Follow view needs a clear view of the train and route, not a fixed offset that intersects a slope.

Review all three cameras at rest, maximum speed, acceleration, braking, bends, platform approaches, tunnels, bridges, rain, snow, and day/night. Include narrow phone and wide desktop viewports. The driver must see track, signals, and a braking reference throughout the journey. Capture representative screenshots and short motion recordings; a single still at rest will miss camera lag.

## Persistence and service continuity

Persist locally: save schema version, route version/seed, global route distance, train speed, control positions, service index, next station, elapsed timetable time, weather state, selected camera, quality settings, and completed stops. Save at stations and periodically at a modest interval. Resume paused with an explicit continue action so reloading cannot put the player into an unseen moving train.

Restore deterministic scenery from seed and chunk coordinates rather than storing every tree. Store only simulation changes that matter: completed boarding, missed stops, passenger totals, and route/service progress. Handle unsupported save versions with a clear restart option. Do not require accounts or a backend for this scope.

## Delivery order and gates

1. **Camera and art refinement.** Preserve the repaired driver visibility under motion; continue improving tree silhouettes, cliff colors, river depth, train proportions, lighting, and composition. Gate: driver motion verified at top speed and all cameras checked in daylight/dusk.
2. **Continuous service.** Add route/station data, station dwell/departure, several stops, and free-drive behavior. Gate: a complete service and a deliberately missed station both continue correctly.
3. **Chunked route slice.** Add stable seeds, chunk boundaries, shared assets, distant scenery, village and city transitions. Gate: 30-minute drive with bounded scene resources and no visible terrain/track seams.
4. **Inhabited stations and weather.** Add passenger paths, coordinated crossing traffic, rain, wet surfaces, and audio. Gate: boarding follows door state; particles stay outside the cab; weather quality tiers remain usable on the test devices.
5. **Snow route and reflection tier.** Add mountain elevation, tunnel/pass reveal, snow accumulation, winter station assets, and selected calm-water reflections. Gate: winter scenery reads without precipitation, reflections have a fallback, and the full route remains playable.
6. **Depth after evidence.** Expand timetables, varied services, discoverable stops, photo mode, more local activity, and longer routes based on actual play sessions. Walking around, enterable buildings, multiplayer, and general vehicle physics are separate projects, not implied requirements for a scenic railway game.

Each phase should end in a runnable build and visible evidence. Maintain a short feature-status list so present capability stays distinct from future plans.
