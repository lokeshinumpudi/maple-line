# Maple Line

A Three.js railway game set in fictional Japanese countryside. Drive a five-car train along about 24.9 km of track with 15 stops, from an autumn gorge through villages, forests, a 152.4 m (500 ft) valley bridge, a mountain tunnel, snow country, terraces and a harbour skyline. The terrain, train, buildings, plants, people, and water textures are generated in code.

The workspace lives at `/Users/lokeshinumpudi/Desktop/maple-line`. It uses pnpm workspaces and Turborepo, with the browser game in `apps/game` and the optional Jev director in `apps/director`. The Signal Ship build calls `signal.evaluate` from the browser with `typesafe-ai/jev`; local development uses the Jev director. Both use the same typed scenery questions and validate the returned settings.

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

The same controls are available on screen. The Camera menu in the ride controls offers Scenic, Follow, Driver, Inside the train, and Lake & valley views. Drag inside the cab or passenger carriage to look around. Lake & valley frames nearby lakes; Places → Every stop & viewpoint includes Aonuma waterfall lookout and Hoshimi twin falls. Scenic starts with automatic wide framing; drag to look around and scroll to zoom. Switch away and back to Scenic to restore its automatic framing. Open platform doors after stopping to let passengers alight and board; close them before applying power. Weather can be set to clear skies, rain, storm, or snow; the time button switches daylight and dusk. Sound is on by default and starts with the ride or story button gesture. The welcome screen’s **Play train & nature sounds** checkbox starts audio with your Start riding click; uncheck it for a silent ride. **Sound on/off** stays on the main HUD, and Settings → Atmosphere contains a saved game-volume slider. Tree rustle follows wind, summer cicadas quieten in rain and snow, and roof rain follows the interior view. Distant train sound fades with camera distance. Rail impacts use the audio clock with one update of delay; updates delayed by more than 120 ms discard missed impacts. Recorded forest, river, rain and distant crowd ambience is mixed with speed-linked traction, wheel rumble and axle clicks, brake air, doors and cab wipers. Turning the camera changes the direction of nearby sounds. Closed cab doors muffle the outdoors; open doors let it through. Bridges add low rumble and tunnels add reverberation. Snow quiets the forest and adds soft wind; summer dusk adds insects. Pause and mute fade the mix out; story conversations retain environmental sound with the train quiet. Narration lowers the background mix and restores it gradually when speech ends. Seven local recordings (about 2.5 MB total) load only after sound is enabled, with procedural fallback if loading fails. [Sound credits](apps/game/public/audio/credits.html) are also available from Settings → Atmosphere.

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

## Film look, director camera and staging tools

**Settings → Weather & sound → Film look** adds a finish pass: 4× MSAA, bloom on bright values, sun shafts through open sky, depth of field for director shots, and a colour grade. The default grade is warm and muted; sunrise and sunset, rain, rain at night, storms and snow each shift it. At night bloom picks up lamps and lit windows. Automatic chooses it on desktop and keeps phones on the plain render. **Camera → Director · film** cuts between thirteen shot types (trackside passes, long-lens telephoto, drone pull-backs, chase, bogie-level, cab, window, platform, under-bridge and portrait shots) in a 2.39:1 frame, with a place card and a one-line narration at each stop. The HUD fades until the pointer moves. Agents can cut to shots, play scripted sequences with captions and scene settings, and give background characters acting notes through WebMCP. See [film director and agent staging tools](DIRECTOR.md).

**Places → Watch a short drama** plays episodes of _The 17:42_, a three-part companion series staged with the director, NPC acting notes, auto drive, doors and weather. Grandma Fusae moves to a care home tomorrow and wants to hear Grandpa's radio at home tonight; Riko's train gets in two minutes after the last bus up the hill. Aonuma has a bus bay behind the kiosk end of the platform with a Blender-built cream and teal village bus (headlights, lit windows, folding front door, a few rows of seats), a shelter and a lane out to the village street. Momiji and Aonuma have readable timetable boards and station clocks whose hands follow the scene time. Episodes are data that agents can write, validate and play through WebMCP; see [writing episodes](drama/README.md). `pnpm render:episode` renders an episode to a phone-ready MP4 (16:9 or 9:16) with a poster and a line timeline for voice clips; see [episode videos](VIDEO.md). With the local director and a Sarvam key, each part has its own voice in English or ten Indian languages, with translated subtitles; otherwise episodes play with labelled subtitles. `pnpm voice:episode` writes the clips and an audio manifest for video renders.

While an episode plays, a small bar offers **Skip** and **Take the controls**. When an episode ends or is skipped, a panel offers **Drive from here**, **Watch again** and **Share**. Taking over keeps the train where the story left it, still on auto drive, switches to the follow camera and shows how to drive. Share uses the system share sheet when the browser has one; otherwise it copies the link, or shows it to copy by hand.

Links open the game somewhere specific. The welcome card turns into an invitation, and one tap starts it (that tap also allows sound):

| Link                               | Opens                                                                                                                                                                                                            |
| ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `?episode=the-1742-e1-two-minutes` | A built-in episode                                                                                                                                                                                               |
| `?scene=station/-380/sunset/rain`  | A place: a stop id or `gorge`, `terraces`, `village`, `shrine`, `station`, `city`, `tokyo`, `bridge`, `tunnel`, `summit`, then optional offset in metres (−2000 to 2000), time, weather and camera, in any order |
| `#ep=1.<payload>`                  | A custom episode carried inside the link                                                                                                                                                                         |
| `?watch=<id>`                      | A custom episode kept in the Signal site store (Signal edition only)                                                                                                                                             |

Links are built on the page's own address, so they work at `/`, `/maple-line/` and `/s/maple-line/`. A link the game cannot use is removed from the address bar, a short notice explains why, and the ride starts normally. Embedded runbook scenes ignore links.

Three Momiji people are anime-style VRM characters: Mr. Sato the office commuter, Riko the student with her grandmother's radio, and Mr. Ishida, who reads the paper on the bench. They are drawn with MToon toon shading and outlines (`@pixiv/three-vrm`), Riko's hair sways on spring bones, and VRM expressions give blinks, a smile that follows mood, and vowel mouth shapes while an episode line is on screen. Their clips come from the Quaternius Universal Animation Library (CC0), retargeted offline: walk (a formal walk for Mr. Sato, a carrying walk for Riko), hurry, sitting down, sitting and standing up, board, idle, wave, check-phone, watch-train, shelter, chat and stretch follow the simulation and the NPC mind, and acting notes can add a nod, a head shake and eating. Riko is built in Blender from the approved concept art (a painted texture, anime face decals and hair locks; `asset-src/characters/concept-cast/`). Mr. Sato and Mr. Ishida are still pipeline test figures built by our own Blender script; the planned cast is described in [anime characters](research/ANIME-CHARACTERS.md). If a VRM fails to load, the simple instanced figure stays in its place. They walk through a steering layer (no backward steps, eased turns, turning on the spot for large turns, jitter ignored while standing) with stride-matched clips and planted feet, hold their phone, radio or paper in hand sockets (the paper and Riko's radio with both hands), breathe and shift their weight, and look at a speaker, the train or the camera in a portrait. See [character motion](CHARACTER-MOTION.md). A timber station shelter stands on the Momiji platform. The five-car train is built in Blender: rounded body ends and cantrail, rubber window gaskets, a black cab mask with lamp housings, bellows gangways, bogies with air springs and axle boxes, turning wheelsets and a single-arm pantograph, with separate paint, glass, metal and rubber materials and baked ambient occlusion; if its file is missing the procedural train is used (`?train=procedural` compares). All models are made by build scripts in `asset-src/`. See [asset sources](../asset-src/README.md).

**Network** beside Places opens a schematic map of five other fictional lines with timetabled trains, a mission board and a company ledger. Missions (passengers, freight, express mail, connections) are played on the Maple Line: stop at the platform with the doors open to load and unload. An eight-step campaign unlocks the other lines. Only the Maple Line is drawn in 3D. See [regional network and missions](NETWORK-AND-MISSIONS.md).

Seven level crossings between Sakuragawa and Minato have warning lamps, a procedural two-tone bell, lowering arms and small cars. Cars make the legally required stop at the line, queue while the arms are down and cross once they rise. Crossings stay closed until the whole train has cleared.

Background characters carry a persona, mood, needs and an intent chosen by local rules with seeded randomness. With AI life on, a few characters near the camera are sent to Jev at most once every 25 seconds for a bounded mood and intent choice; an agent's acting note overrides both for a set time. Minds can delay a waiting passenger by at most two seconds and never block boarding. See the NPC minds section of [AI director](AI-DIRECTOR.md).

## Current world and rendering

The scenery presentation pass replaces abrupt grass/cliff color boundaries with continuous meadow, moss and stone tones, without changing terrain heights. Seeded region fields create groves and gaps in the original valley, generated worlds and regional forests. Daylight, rain, snow and dusk share their palettes with six cached reflection environments. A small pool of golden motes appears above dry ground on clear, non-winter evenings in the original valley; it fades out in precipitation and tunnels, and its motion stops while paused. Leaf textures include edge filtering and color bleed to reduce dark fringes. See the [implementation record](docs/graphics-research/presentation-pass.md) for scope and validation.

Live and saved Jev valleys use branching broadleaf trees with layered crowns, grove-related color and height, and separated trunks. Seasonal grass and flower/seed-head patches follow the ground along woodland margins. The version 2 generator preserves railway, river and landmark clearances; saved seeds reproduce the revised scenery. See the [generated valley pass](docs/graphics-research/generated-valley-pass.md) for scope and verification.

The fidelity pass adds world-space ground and stone texture, roof tile seams, timber grain, house gutters, irregular boulders and layered cedar branches. The same cedar and house materials are used when Jev builds a valley. Wet surfaces develop darker, reflective patches, and rain produces small ground-impact rings. A generated sky environment supplies reflections and part of the sky fill on every standard material; its strength follows weather and time of day. The hemisphere fill is lower and the sun stronger than before, so sunlit and shaded faces separate.

**Settings → Train & ride → Train systems** offers automatic/on/off headlights and wipers, plus a switch for electrical-flow traces. Automatic lamps turn on in rain, snow, dusk and tunnels; passenger windows glow at dusk and in tunnels. Wipers sweep in wet weather. The light traces illustrate traction power along the wire; they are not an electrical-network simulation. Doors open into modelled vestibules, amber warning lamps mark the opening, and power stays locked until the closing animation finishes. Wheel rotation follows distance travelled and ignores viewpoint jumps.

The river has asymmetric bends, variable widths, visible shallows, a shaped riverbed, and banks. Its water combines a planar scene reflection with a separate refraction capture, wave normals generated in code and moved downstream along each bend, Fresnel, sun glints, depth tint, broken bank foam and rain rings. The reflection is 1024 × 1024 on High, 512 × 512 on Medium, and the sky colour on Low. This is a flat water surface with visual motion, not a fluid simulation. Lakes, the ravine river, paddies and the harbour inlet share the same wave normals and rain rings, but reflect the cached sky environment rather than nearby objects. Nothing leaves a wake yet.

Forests include branching maples with cutout leaf clusters, conifers, rocks, grass, ferns, moss patches, and fallen timber. Broadleaf crowns near the camera are drawn as about thirty small leaf cards each, lit through from behind by a low sun; further trees keep the cheaper clusters, and each tree switches at a slightly different distance so there is no visible edge. A cherry avenue lines the railway near Sakuragawa, and spring valleys made with **Create a world** draw blossom cards. Maple leaves drift through the autumn valley and petals fall near Sakuragawa. A slow breeze moves foliage by centimetres. Rain changes sky, fog, light, precipitation, and selected material roughness. Valley mist gathers near the river, distant hills fade into the horizon colour, and a low sun lights the haze around it. The mountain route climbs to roughly 399 m of game elevation, with grades up to 4%, automatic snow at the summit, and a descent back into foliage. Snow also changes surface coverage and falling particles. Dusk changes lighting and building windows. The sky includes procedural clouds and distant ridge silhouettes.

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

The train has transparent windows, sliding doors, turning wheelsets, bogies, pantographs and working wipers. Inside are upholstered benches, luggage racks, bags, hand straps that sway with movement, and seated passengers. Twenty through passengers remain aboard; nine local passenger seats follow the existing boarding and alighting simulation. The driver sits behind the windscreen above a desk with speed, traction and brake indicators. Cab and passenger cameras remain attached to their carriage on grades and in reverse. Entering a tunnel selects Driver from exterior views and restores the exterior view on exit; the passenger view stays inside.

**Tokyo neon passage** adds a 600 m city section before Harumi, about 18 seconds at 120 km/h. Choose **Places → Tokyo neon passage** for a quick visit; dusk brings out the cyan, pink and amber signs. Thirty shop buildings and fifteen towers line separate roads with 54 cars, six buses and 120 walking pedestrians. Japanese signs, window grids, crosswalks, street lamps, balconies, service pipes and rooftop equipment fill the streets. Thirty pedestrians stop by shops with phones; others walk with bags, and rain brings out umbrellas. Rain also lowers road roughness. Harumi has a matching transit canopy, lit wayfinding, ticket machines and a concourse with waiting commuters. Traffic and crowds are decorative loops, pause with the ride, and load with the existing regional chunks. This is a fictional Tokyo-inspired district. The railway and Harumi story stop keep their existing positions. See the [city implementation record](docs/graphics-research/tokyo-passage.md).

Aonuma has a stepped waterfall, cedar islands and reed banks. Hoshimi has twin alpine cascades and snow-capped rocks. Both have animated water, impact ripples, coves and timber landings; Minato has a shaped tidal inlet. Lakes share their shoreline field with the terrain and load and release with the existing regional chunks. Water motion is a visual shader effect, not a fluid simulation.

Village residents follow local errand routes. Commuters approach the station, wait, and board through aligned open train doors; arriving passengers alight. At each regional stop except Harumi, the station vendor and one neighbour walk the paved lane and garden path between their doorways and the forecourt. Rain and snow keep those two at the doorway instead of the open lane. Door interlocks prevent traction with doors open. The active camera rig supports all five camera modes; older Orbit agent requests select Scenic. This is a small local population simulation, not a city-wide transport model.

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

The development inspector can read scene state, find objects, raycast the current view, and apply reversible local object edits. Alt-click a character to grab their position, state, mind and last 4 seconds of motion; agents use `grab_character` and `get_grabbed_characters` (see [director tools](DIRECTOR.md)). WebMCP registers game, story, railway-duty, scene-task, and building tools when a supported browser provides `document.modelContext` or the older `navigator.modelContext`.

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

Automated tests cover driving/braking, station outcomes, repeated terminal reversals, camera clearance, river bank continuity, fish containment, deer reactions, bird return paths, train geometry and doors, population routines, store behavior, inspector edits/undo, WebMCP argument validation/lifecycle, director validation, fallbacks, and request limits, and deep-link parsing, shared-episode encoding, size caps and hostile payloads. They do not establish visual quality or frame rate on a particular device.

The operating profile anticipates slower bridge, tunnel, passing-loop, and mountain sections. These are fictional game limits; the physics model is not railway operating instruction. See [physics and story](docs/research/PHYSICS-AND-STORY.md).

The original valley remains allocated. The regional world maintains up to five nearby 600 m chunks, while spatial groups restrict visible vegetation, rails, and nearby shadow casters. Rendering targets 60 fps with a two-million-pixel budget, adaptive resolution, and 20 Hz shadow/reflection updates. Adaptive resolution steps 0.1 at a time, only after three slow seconds in a row (or 20 healthy ones to step up), at least 8 s apart, and holds a level for two minutes if it bounced straight back; in Director mode a step waits up to 3 s for a cut. `node scripts/flicker-probe.mjs` measures frame-to-frame flicker per scenario and `node scripts/frame-probe.mjs` measures live frame times and resolution changes (outputs in `artifacts/screenshots/flicker/`). Reflection and refraction still add render passes; use the live performance tool to measure the active view. **Settings → Weather & sound → Scenery detail** picks High, Medium or Low. Automatic starts phones on Low (no reflection or refraction pass, sparser rain, no leaf cards) and desktops on High, and steps down one level after several seconds of slow frames. `get_world_state` reports the active tier under `graphics`. Weather changes remain viewable while paused, including atmospheric precipitation.

A timetable for the player's own train and saved driving sessions remain future work. Regional station visitors currently use simpler arrival/waiting routines; the original Momiji station has the detailed boarding and local-resident simulation. See the [world plan](docs/WORLD-PLAN.md) for proposed phases; its historical baseline and roadmap are not a list of completed features.

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

## Deployment

The [hosting guide](docs/HOSTING.md) covers the separate Vercel client and Jev server and the Signal Ship build. The standalone backend source is published at [maple-line-server](https://github.com/lokeshinumpudi/maple-line-server). Local development still runs both apps from this workspace.

The [illustrated runbook](https://signal-ship.internal.loophealth.com/s/maple-line-runbook/) covers 49 concepts with live game inspections, interactive diagrams and copyable agent skills. Its [embed SDK](docs/EMBED-SDK.md) provides same-origin scene configuration, focused cameras, reversible rendering controls and read-only ray inspection. The runbook defaults to the embedded game and shares one container with the diagram. Saved level authoring remains separate.

## Storms and night rain

**Storm** is heavy rain: braking, wipers, sound and residents treat it as rain. It adds a darker sky and grade, lower cloud, thicker fog, wind gusts that bend the trees, and lightning every 5–16 seconds. A strike brightens the clouds toward its direction, lights the valley for a moment and is followed by thunder after the time sound takes to travel that far. Rain falls as camera-facing streaks drawn in one batch, and splash crowns jump up where drops land near the camera. Rain at night turns the sky dark blue-grey, and lamps get soft halos that thin out in fog. Storms can be chosen from the weather menu, `set_game_control`, the director's scene settings and episode `weather` cues. The thunder mix has not yet been checked on speakers or headphones.

## Material and weather detailing

Exterior train paint gains rain sheen while cabin fittings and paper stay dry. Porous timber, ballast and plaster darken without sharing the paint's gloss; drying takes longer than wetting. These finishes use the existing sky environments, not reflections of nearby objects. Rain impacts remain fixed on sampled terrain and align to its slope; roof interception, puddles and drainage are still absent.

The five-car service has two furnished cabs and passenger activities including newspapers, books and looking through windows. Regional building sides have windows, sills and eave supports within existing lot bounds. Directional shadows use light-space texel snapping. On desktop the 2048 map covers a 150 m square centred a little ahead of the train along the camera view (7.3 cm texels); phones keep a 1024 map over 220 m.

Audio now locates the authored regional lakes, marsh and gorge river, with quieter water levels for still water and a gradual forest-to-city mix. It reuses existing recordings; this does not establish distinct lake or harbour recordings. The next art goals and verification requirements are in [art direction](docs/ART-DIRECTION.md).
