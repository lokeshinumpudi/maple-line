# Maple Line

A Three.js railway game set in fictional Japanese countryside. Drive a five-car train along about 24.9 km of track with 15 stops, from an autumn gorge through villages, forests, a 152.4 m (500 ft) valley bridge, a mountain tunnel, snow country, terraces and a harbour skyline. The terrain, train, buildings, plants, people, and water textures are generated in code.

The workspace lives at `/Users/lokeshinumpudi/Desktop/maple-line`. It uses pnpm workspaces and Turborepo, with the browser game in `apps/game` and the optional Jev director in `apps/director`. It has no Signal service or production-data connections.

## Run locally

Use Node.js 22.12 or newer and pnpm 10.33.3, as specified in the root package configuration. Run commands from the workspace root.

```sh
cd /Users/lokeshinumpudi/Desktop/maple-line
pnpm install
pnpm dev
```

Open [Maple Line](http://127.0.0.1:4173/). A browser with WebGL support is required. `pnpm dev` starts the game on port 4173 and the local director on port 4175; Vite proxies `/api/director` to it. To enable live Jev decisions, set `AI_GATEWAY_API_KEY` in the root `.env`. The key stays on the server. Without it, the director uses labelled local rules. See [AI director](docs/AI-DIRECTOR.md).

| Command               | Purpose                                                          |
| --------------------- | ---------------------------------------------------------------- |
| `pnpm dev`            | Start Vite at `http://127.0.0.1:4173`                            |
| `pnpm build`          | Create the production build in `apps/game/dist/`                 |
| `pnpm build:readable` | Create an unminified build in `apps/game/dist-readable/`         |
| `pnpm preview`        | Serve the production build at `http://127.0.0.1:4174`            |
| `pnpm test`           | Run the automated tests                                          |
| `pnpm lint`           | Check the game source, tests, and Vite configuration with Oxlint |
| `pnpm format`         | Format the app and root documentation/configuration              |
| `pnpm format:check`   | Check formatting without editing files                           |
| `pnpm check`          | Run lint, tests, production build, and formatting checks         |

These root commands run through Turborepo. Both build modes include source maps. Run `pnpm build` before `pnpm preview`; development-only inspector and WebMCP tools are available through `pnpm dev`.

## Play

**Scenic round trip** is the default. The train continues past the station, slows at each terminal, waits for three seconds, and changes direction. It repeats the same finite route. **Auto drive** targets 120 km/h on the open line; manual driving can reach 160 km/h. With **AI life** enabled, the director may select 60, 90, or 120 km/h. Story travel targets 100 km/h between conversations. Bridge, tunnel, mountain and wetland limits still apply, with earlier braking for slower sections and scheduled stops. Manual power or braking returns control to the player.

**Station challenge** scores a stop near the Momiji marker and ends the attempt if the train passes it too far. Rain and snow reduce braking adhesion, so allow more stopping distance. **Places** on the main HUD opens six illustrated destination cards and a list of every stop and viewpoint. It is available on the welcome screen and while riding. Selecting a destination moves to it through the existing route action; unfinished station duties still block travel. Passenger mode resumes automatic driving there; manual mode stays stopped.

| Input          | Action                                                  |
| -------------- | ------------------------------------------------------- |
| W / S or ↑ / ↓ | Move one notch toward power / braking                   |
| A / X          | Coast                                                   |
| Space          | Pause or resume                                         |
| C              | Cycle the five camera views                             |
| D              | Open/close doors while stopped alongside the platform   |
| E              | Toggle emergency braking                                |
| H              | Hide/show the HUD; the restore button remains available |
| R              | Restart                                                 |

The same controls are available on screen. The Camera menu in the ride controls offers Scenic, Follow, Driver, Inside the train, and Lake & valley views. Drag inside the cab or passenger carriage to look around. Lake & valley frames nearby lakes; Places → Every stop & viewpoint includes Aonuma waterfall lookout and Hoshimi twin falls. Scenic starts with automatic wide framing; drag to look around and scroll to zoom. Switch away and back to Scenic to restore its automatic framing. Open platform doors after stopping to let passengers alight and board; close them before applying power. Weather can be set to clear skies, rain, or snow; the time button switches daylight and dusk. Sound is on by default and starts with the ride or story button gesture. The welcome screen’s **Play train & nature sounds** checkbox starts audio with your Start riding click; uncheck it for a silent ride. **Sound on/off** stays on the main HUD, and Settings → Atmosphere contains a saved game-volume slider. Tree rustle follows wind, summer cicadas quieten in rain and snow, and roof rain follows the interior view. Distant train sound fades with camera distance. Rail impacts use the audio clock with one update of delay; updates delayed by more than 120 ms discard missed impacts. Recorded forest, river, rain and distant crowd ambience is mixed with speed-linked traction, wheel rumble and axle clicks, brake air, doors and cab wipers. Turning the camera changes the direction of nearby sounds. Closed cab doors muffle the outdoors; open doors let it through. Bridges add low rumble and tunnels add reverberation. Snow quiets the forest and adds soft wind; summer dusk adds insects. Pause and mute fade the mix out; story conversations retain environmental sound with the train quiet. Narration lowers the background mix and restores it gradually when speech ends. Seven local recordings (about 2.5 MB total) load only after sound is enabled, with procedural fallback if loading fails. [Sound credits](apps/game/public/audio/credits.html) are also available from Settings → Atmosphere.

The welcome screen opens onto the valley with **Start riding** and **Create a world**. The bottom HUD separates location and next-stop distance, a compact pause/camera/control strip, and a live speedometer. Choose **Drive yourself** to reveal an eleven-position controller: B5–B1, Coast, and P1–P5. Drag the lever or use ↑/↓ to move one notch; X selects Coast. Taking over from auto-drive selects coast. The applied-power/brake meter follows the actuator response, while the motion cue and full-brake distance estimate reflect momentum, weather and slope. The distance is an estimate, not a guaranteed stopping point. Door and emergency interlocks remain active. **Sit back** returns to auto-drive. On phones, the HUD starts folded into one faded **Controls** pill. Tap it or the scene to reveal a compact speedometer, pause and camera bar; **Hide** folds it away immediately, and it fades after 3.5 seconds of inactivity. Open menus and active inputs remain visible. Settings includes shortcuts to Places, the notebook, sound, and manual driving. Manual driving uses a compact touch panel: tap Brake/Power for one notch or hold to repeat; the lever, Coast, Doors and Emergency remain available. W/S and the arrow keys also repeat notches when held; A/X coasts and D operates platform doors. **Create a world** on the welcome screen and **Places → Create a world** during a ride open the same dialog, with descriptions, progress, proposed settings, and retries kept in place. Poetic presets and **Surprise me** offer 24 shuffled scene descriptions; the surprise collection does not repeat until every description has appeared.

The speedometer uses a fixed 0–90 km/h scale and shows the current local limit beneath the dial. A short tick marks that limit on the arc. Exceeding it by more than 0.5 km/h turns the readout coral and shows **Slow down**; this includes the lower bridge, tunnel, mountain and wetland-branch limits. The cue does not apply the brakes for the player.

Camera and Settings dropdowns use the game's dark green menus, with a check beside the selected value. Arrow keys, Home/End and typing move through choices; Enter selects, Escape cancels, and clicking outside dismisses. Places has its own scrollable destination panel; smaller choice menus open above the bottom HUD when needed. Settings groups controls into Atmosphere, Train & ride, and Controls tabs, with arrow-key navigation between tabs.

Jev chooses tree season, forest density, settlement size, weather and time from each description. The game builds the original valley scenery and reports when it is active. Extra requested features require accepting the supported settings. The client bundles 24 captured Jev worlds: **New world → Saved Jev worlds** builds them without the director. Failed live requests use an exact saved description or ask the player to review a suggested preset. Saved results are labelled separately from live generation. See [Jev world builder](docs/WORLD-BUILDER.md) for the contract and limits.

Character narration reads Haru’s notebook using separate voices for each speaker, authored delivery pace and pauses, and a reading underline. It prepares nearby dialogue and possible replies while playing, and reuses audio from a local disk cache. `pnpm narration:prepare` prepares all English story branches in advance. See [Sarvam character voices](docs/NARRATION.md) for casting, languages, cache limits and the limits of emotion control.

**Take in the view** puts the conversation card aside without choosing a reply, completing a task, or leaving Haru’s story. The camera recenters the characters; **Return to conversation** or Escape restores the same text. Stopped conversations remain stopped, while bridge and tunnel conversations keep their moving-train behavior. Reading stops until you choose **Play narration** again.

Places, Settings, notebook, and world-builder dialogs hold simulation time and fade the background mix while open. Closing a dialog preserves a manual pause and resumes a running ride without catching up elapsed time. Space activates a focused button without also toggling the train’s pause. See [game direction implementation](docs/GAME-DIRECTION.md) for the design intent and verification limits.

## Kawasemi excursion route

Before Kawasemi, stop at the route board and request the direct track or the wetland loop. Both paths are pre-authorised for this fictional excursion and rejoin before the existing Kawasemi conversation. The direct path leaves more time to ask about the bus; the loop reveals a footbridge and waiting bench beyond the station. Haru’s new optional text concerns the part of a passenger’s trip his timetable leaves out. These route notes are unvoiced; the prepared campaign narration stays intact.

The branch is driven: all five carriages, cameras, station distances and traction traces follow the selected path. Selection requires a stopped train, shut doors, released emergency brake and no active conversation. The loop has a 20 km/h limit; automatic driving slows for it. A manual overrun cannot pass the unconfirmed route board. Completion requires continuous travel until the whole train clears the branch; a viewpoint jump does not count. Restart clears this ride’s selection. Route notes and selection are session-only. Resuming a story saved inside the branch returns to the approach board for a fresh route request.

For a quick visit, choose **Places → Every stop & viewpoint → Kawasemi route board**. The 70 m wetland channel, its bed, banks and footbridge share one shape. Its water uses a transparent material and the existing environment; it has no separate reflection capture or fluid simulation. The reusable track adapter and agent controls are described in [railway adventures](docs/RAILWAY-ADVENTURES.md); the original scene and five primary sources are in [route-choice research](docs/research/ROUTE-CHOICE-AND-VOICE.md).

The express tuning reaches 60 km/h in about 11 seconds and 120 km/h in about 23 seconds at full power on level, dry track. A synthesized electric traction tone follows power and speed; coasting leaves wheel texture and air rush. The speedometer covers 0–160 km/h. These are fictional game settings and synthesized sounds, not a reproduction of a specific Japanese train. See [express tuning and audio checks](docs/EXPRESS-TRAIN.md).

## Current world and rendering

The scenery presentation pass replaces abrupt grass/cliff color boundaries with continuous meadow, moss and stone tones, without changing terrain heights. Seeded region fields create groves and gaps in the original valley, generated worlds and regional forests. Daylight, rain, snow and dusk share their palettes with six cached reflection environments. A small pool of golden motes appears above dry ground on clear, non-winter evenings in the original valley; it fades out in precipitation and tunnels, and its motion stops while paused. Leaf textures include edge filtering and color bleed to reduce dark fringes. See the [implementation record](docs/graphics-research/presentation-pass.md) for scope and validation.

Live and saved Jev valleys use branching broadleaf trees with layered crowns, grove-related color and height, and separated trunks. Seasonal grass and flower/seed-head patches follow the ground along woodland margins. The version 2 generator preserves railway, river and landmark clearances; saved seeds reproduce the revised scenery. See the [generated valley pass](docs/graphics-research/generated-valley-pass.md) for scope and verification.

The fidelity pass adds world-space ground and stone texture, roof tile seams, timber grain, house gutters, irregular boulders and layered cedar branches. The same cedar and house materials are used when Jev builds a valley. Wet surfaces develop darker, reflective patches, and rain produces small ground-impact rings. A generated sky environment supplies reflections on train glazing and metal; its strength follows weather and time of day.

**Settings → Train & ride → Train systems** offers automatic/on/off headlights and wipers, plus a switch for electrical-flow traces. Automatic lamps turn on in rain, snow, dusk and tunnels; passenger windows glow at dusk and in tunnels. Wipers sweep in wet weather. The light traces illustrate traction power along the wire; they are not an electrical-network simulation. Doors open into modelled vestibules, amber warning lamps mark the opening, and power stays locked until the closing animation finishes. Wheel rotation follows distance travelled and ignores viewpoint jumps.

The river has asymmetric bends, variable widths, visible shallows, a shaped riverbed, and banks. Its water combines one 512 × 512 planar scene reflection with a separate refraction capture, downstream-moving surface normals aligned to each bend, depth tint, and bank foam. This is a flat water surface with visual motion, not a fluid simulation. Paddies use a simpler material; other surfaces do not have equivalent scene reflections.

Forests include branching maples with cutout leaf clusters, conifers, rocks, grass, ferns, moss patches, and fallen timber. A slow breeze moves foliage by centimetres; sparse drifting leaves provide a visible wind cue. Rain changes sky, fog, light, precipitation, and selected material roughness. The mountain route climbs to roughly 399 m of game elevation, with grades up to 4%, automatic snow at the summit, and a descent back into foliage. Snow also changes surface coverage and falling particles. Dusk changes lighting and building windows. The sky includes procedural clouds and distant ridge silhouettes.

The original valley has a 20-species wildlife catalog, with 77 fish in 11 schools, 18 birds, and seasonal bank animals. The active world's season chooses the cast; weather alone does not change species. The original valley defaults to autumn.

| Season | River fish        | Birds                               | Bank animals                                  |
| ------ | ----------------- | ----------------------------------- | --------------------------------------------- |
| Spring | Yamame and medaka | Japanese white-eyes and kingfishers | 8 hares, 6 Japanese squirrels, 6 sika deer    |
| Summer | Ayu and koi       | Barn swallows and kingfishers       | 6 tanuki, 6 pond turtles, 4 sika deer         |
| Autumn | Oikawa and koi    | Varied tits and mandarin ducks      | 6 wild boar, 12 sika deer                     |
| Winter | Iwana and yamame  | Long-tailed tits and mandarin ducks | 6 red foxes, 6 Japanese macaques, 4 sika deer |

Models use smooth surfaces, layered coat colors, shaped muzzles, eye highlights, articulated legs, paws and claws. Deer have flank spots and autumn/winter antlers; foxes have pale tail tips, squirrels have curved tails, boar have tusks, macaques have pink faces, and turtles have shell plates. Birds have beaks, layered flight feathers, feet and species-specific tails. Fish have eyes, gill lines, fin rays, forked tails and colored markings. These are procedural stylized models, not scanned animals.

Fish stay inside the riverbed and swim more slowly and deeper in winter. Mandarin ducks swim on the river; other birds return to perches in precipitation and at dusk. Hares hop, bank animals forage or rest, and nearby trains make them alert. Rain and snow shelter the bank animals. The cast is a scenic seasonal selection, not a migration model. The renderer retains 69 model batches and two perch batches, with at most 27 active batches for ambient wildlife; buffers are reused across season changes. Ambient wildlife occupies the original valley.

Haru and Emi can also notice seasonal wildlife at five story stops: the opening recorder conversation, Sakuragawa, Hinoki, Yukihara and Akane. Expand **Nearby** in the conversation to **Wait quietly with Haru** or **Record with Emi**. The animal settles and resumes small foraging movements; an authored exchange and species/season field note are saved in Haru’s notebook. A recording adds a callback during Emi’s radio programme. These actions are optional and do not advance or block the main conversation. Encounters require stationary characters and safe ground outside the railway. Rain hides visitors; winter foxes, hares and macaques can remain resting in snow. One visitor at a time shares the existing animal meshes, including beyond the original valley, with one extra instance reserved per species and no extra model batches. Existing story saves remain compatible.

The train has transparent windows with open frames, sliding doors, rotating wheel spokes, bogies, pantographs and working wipers. Inside are upholstered benches, luggage racks, bags, hand straps that sway with movement, and seated passengers. Twenty through passengers remain aboard; nine local passenger seats follow the existing boarding and alighting simulation. The driver sits behind the windscreen above a desk with speed, traction and brake indicators. Cab and passenger cameras remain attached to their carriage on grades and in reverse. Entering a tunnel selects Driver from exterior views and restores the exterior view on exit; the passenger view stays inside.

**Tokyo neon passage** adds a 600 m city section before Harumi, about 18 seconds at 120 km/h. Choose **Places → Tokyo neon passage** for a quick visit; dusk brings out the cyan, pink and amber signs. Thirty shop buildings and fifteen towers line separate roads with 54 cars, six buses and 120 walking pedestrians. Japanese signs, window grids, crosswalks, street lamps, balconies, service pipes and rooftop equipment fill the streets. Thirty pedestrians stop by shops with phones; others walk with bags, and rain brings out umbrellas. Rain also lowers road roughness. Harumi has a matching transit canopy, lit wayfinding, ticket machines and a concourse with waiting commuters. Traffic and crowds are decorative loops, pause with the ride, and load with the existing regional chunks. This is a fictional Tokyo-inspired district. The railway and Harumi story stop keep their existing positions. See the [city implementation record](docs/graphics-research/tokyo-passage.md).

Aonuma has a stepped waterfall, cedar islands and reed banks. Hoshimi has twin alpine cascades and snow-capped rocks. Both have animated water, impact ripples, coves and timber landings; Minato has a shaped tidal inlet. Lakes share their shoreline field with the terrain and load and release with the existing regional chunks. Water motion is a visual shader effect, not a fluid simulation.

Village residents follow local errand routes. Commuters approach the station, wait, and board through aligned open train doors; arriving passengers alight. Door interlocks prevent traction with doors open. The active camera rig supports all five camera modes; older Orbit agent requests select Scenic. This is a small local population simulation, not a city-wide transport model.

**AI life** requests a bounded Jev decision about sightseeing pace and station activity every 20 seconds while enabled and playing. It can change the autopilot target, shelter behavior, and leisure dwell times. Decisions expire after 60 seconds; the director does not control manual driving or bypass braking and door rules. A live Jev request has returned a validated cautious/shelter decision for a rainy station scene.

Zustand holds the shared driving state, director state, and display preferences. UI controls and agent actions use the same state and action paths. Haru’s story saves choices, memories, and narrative position in browser storage. Station-duty checkpoints share the story save; an interrupted signal clearance must be requested again. Free-driving sessions and excursion-route selections are not persisted.

## Haru’s story

Choose **Begin Haru’s story** on the welcome screen, or open **Haru’s notebook** while riding. _The Things We Carried_ follows Haru Morita, sixty, and his granddaughter Emi as they record the lives of people along the line. Eighteen conversations across five chapters include choices, replies, and a notebook of memories. Progress is saved on this browser; restarting the story requires confirmation.

The notebook links each memory to its conversation, chosen reply, and completed prop action. A current page reminds you of an unfinished reply or task. Between conversations, a memory receipt opens the notebook. Clinic proposals remain labelled as awaiting confirmation. Existing saves supply this context without a restart.

The revised script follows Haru’s support for a winter timetable that misses a village-bus connection. Emi, Keiko, and people along the line challenge the assumptions behind his endorsement. Fourteen callback definitions allow later scenes to remember earlier replies; two endings differ in how Haru corrects his public account.

The camera moves from the railway toward Haru and Emi during stopped conversations, then back to gameplay. Bridge and tunnel dialogue continues while the train moves and leaves driving controls available. Dialogue waits for the view to settle, supports reduced motion and optional synthetic reading, and leaves the world visible. The two in-world figures carry an animated notebook, borrowed spanner, recorder, and shoulder bags. Their illustration and character study are available in the notebook. These are stylized procedural models, not meshes generated by an image tool.

After Momiji’s conversation, complete the first station duty: check the passenger service, open the actual train doors for boarding, close them, request the line, wait for a blue local to pass on the siding, and explicitly depart. Power and the story travel shortcut cannot bypass that duty. The service check does not yet operate a branching route for the player’s train. Duty progress restarts on page reload.

Between memories, drive manually or leave automatic driving on. The **Continue to next memory** shortcut skips distance only after the conversation and any active station task are finished. Fumi’s Aonuma workshop and Minato’s village-bus board have required prop actions: return the spanner and pin a proposed connection correction. These actions change visible scene objects and persist with the story save. Momiji has a bakery dispatch area with crates and a draft notice. Most other stops still have conversations and scenery rather than a station-duty campaign. See the [story bible](docs/STORY-BIBLE.md), [character designs](docs/CHARACTERS.md), [railway adventures](docs/RAILWAY-ADVENTURES.md), [art provenance](docs/STORY-ART.md), and [commercial release gates](docs/COMMERCIAL-PLAN.md).

## Agent access

The development inspector can read scene state, find objects, raycast the current view, and apply reversible local object edits. WebMCP registers game, story, railway-duty, scene-task, and building tools when a supported browser provides `document.modelContext` or the older `navigator.modelContext`.

Native WebMCP discovery listed the game and building tools in an isolated Chrome for Testing session with the testing feature enabled. The existing Chrome Agent session on port 9229 currently uses the labelled page-local fallback, `window.mapleWebMCP`; that fallback does not make tools appear in native `webmcp list`. No remote server or manual snapshot copying is required for an agent with access to the local page.

The [level-building toolkit](docs/LEVEL-BUILDING.md) adds deterministic prefab placement/scatter, grouped edits, undo/redo, paged layout import/export, browser-local save slots, terrain sampling, lighting overrides, and live performance measurement. Authored scenery is a visual layer; it does not change track geometry or collision physics.

For development, read the local [Maple Line skill](.agents/skills/maple-line-dev/SKILL.md). See [WebMCP integration](docs/WEBMCP.md), [scene inspector](docs/INSPECTOR.md), and the [evaluation record](artifacts/localhost/game-control/eval-report.md) for tool scope and verification evidence.

## Project layout

The [procedural world and graphics research library](docs/GRAPHICS-RESEARCH.md) collects selected book chapters, original articles, source-checked Three.js techniques, and project skills. Its experiments are proposed work, not implemented features.

The [sound engineering research](docs/SOUND-RESEARCH.md) covers train mechanics, environmental acoustics, timing, narration mixing and browser audio costs. The [local listening library](assets/audio-library/index.html) contains 13 additional recordings with previews and licence records; three now have short gameplay edits for tree rustle, sheltered roof rain and summer cicadas, alongside the original four recordings. Full sources and listening previews remain outside the game bundle. Headphone and speaker review of the new edits remains pending. Use the [Maple sound engineering skill](.agents/skills/maple-sound-engineering/SKILL.md) for audio changes and sourcing.

```text
apps/game/                 @maple-line/game
  index.html               Page entry
  vite.config.js           Local ports and build modes
  package.json             App dependencies and tasks
  src/
    main.js                Application setup, frame loop, and UI wiring
    camera/                Camera anchoring and the newer camera rig
    simulation/            Driving physics, round trips, population routines
    state/                 Shared Zustand game store
    narrative/             Campaign, saves, characters, cinematics, story and duty tools
    world/                 Weather, flora, river, bridge, and world details
    train/                 Train geometry and animation
    agent/                 Scene inspector and WebMCP tools
    ui/                    Styles
  tests/                   Automated tests
  dist/                    Generated production build
  dist-readable/           Generated unminified build
apps/director/             @maple-line/director: local Jev evaluation service
  src/                     HTTP server, validation, and evaluator
  tests/                   Director unit and HTTP tests
docs/                      World plan, agent tools, and AI director documentation
artifacts/
  screenshots/             Captured game views
  localhost/game-control/  WebMCP manifest and evaluation artifacts
package.json               Root commands and tool versions
pnpm-workspace.yaml        Workspace package discovery
turbo.json                 Task dependencies and caching
```

## Verification and limits

Automated tests cover driving/braking, station outcomes, repeated terminal reversals, camera clearance, river bank continuity, fish containment, deer reactions, bird return paths, train geometry and doors, population routines, store behavior, inspector edits/undo, WebMCP argument validation/lifecycle, and director validation, fallbacks, and request limits. They do not establish visual quality or frame rate on a particular device.

The operating profile anticipates slower bridge, tunnel, passing-loop, and mountain sections. These are fictional game limits; the physics model is not railway operating instruction. See [physics and story](docs/research/PHYSICS-AND-STORY.md).

The original valley remains allocated. The regional world maintains up to five nearby 600 m chunks, while spatial groups restrict visible vegetation, rails, and nearby shadow casters. Rendering targets 60 fps with a two-million-pixel budget, adaptive resolution, and 20 Hz shadow/reflection updates. Reflection and refraction still add render passes; use the live performance tool to measure the active view. Weather changes remain viewable while paused, including atmospheric precipitation.

Traffic crossings, full multi-station timetables, and saved driving sessions remain future work. Regional station visitors currently use simpler arrival/waiting routines; the original Momiji station has the detailed boarding and local-resident simulation. See the [world plan](docs/WORLD-PLAN.md) for proposed phases; its historical baseline and roadmap are not a list of completed features.

Google Fonts supplies optional UI fonts with system fallbacks. Three.js and Zustand are bundled locally.

## Story narration

Choose **Read aloud** in Haru’s story to hear Sarvam narration. English is the default; the language picker offers ten Indian languages, including Telugu and Hindi. Other languages are translated before speech generation; displayed story text remains English. Japanese and Urdu speech are currently unavailable in Sarvam. Voice stops when the player advances, opens the notebook, switches language, or leaves the story. Add `SARVAM_API_KEY` to the root private `.env` and restart the director. See [narration setup and limits](docs/NARRATION.md).

### Returning to the game

The story checkpoint includes Momiji station work. Resume restores unfinished work at Momiji, with doors closed and a fresh clearance request after an interrupted passing train. Completed dispatch does not repeat. Existing stories beyond that station migrate without being sent back. Camera, weather, daylight, HUD, driving mode, narration language, train lights and wipers are saved separately. Sound and read-aloud still require a new user gesture.

### Nao’s clinic delivery

At Momiji, inspect the clinic label and record either a proposed later clinic handoff or a shared van. The plan and tag colour are saved; neither option claims approval or delivery. Station route controls now move visible switch blades and levers. The passing train waits for loop alignment, and your departure waits for the main points to settle. Occupied switch areas lock blade movement. The freight branch is not yet player-drivable.

The opening cycles through four seasonal shots: a riverside spring view, a summer rear-quarter shot, an autumn view from the opposite bank, and a high winter valley overview. Each features a different animal cast. Camera sightlines account for terrain and tree canopies, and the five-car train remains the subject. Starting the ride fades back to the selected gameplay camera; reduced motion keeps a fixed autumn view.

Created by **loki**. Inspired by watching Japanese countryside train rides.

Regional scenery now includes eight seeded village lots around rural stops, six roof/building families, connected access streets, rice paddies and vegetable plots, and varied station residents with repeatable routines. Five bounded rail excursions change the valley views with 80 km/h restrictions. Regional mountain fields add coherent ridges outside the railway corridor; generation uses seed 2719 and preserves rail, water and station clearances.

A separate 700 m rural railway between route z1550–2250 carries an alternating green local and blue parcels service. These are scheduled background trains on their own track, with a halt and end depots. Tokyo spans 2.36 km with suburban approaches, deeper street blocks and a denser centre. Lakes have dry cove paths, boathouses, moorings and local fishing or alpine props. This is still a stylized fictional route, with bounded resident routines and traffic rather than a full city simulation.
