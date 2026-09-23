# Film director and agent staging tools

Maple Line has a film camera that cuts between shots on its own, and a set of WebMCP tools that let an agent script short episodes: pick shots, move the train to a place, change weather and time, give background characters acting notes, and put captions and narration on screen. The player can still drive; the director only moves the camera.

## Film look

`rendering/film-pipeline.js` renders the scene into a half-float target and finishes it in one pass. **Settings → Weather & sound → Film look** picks the quality:

| Quality             | What it does                                                                                                                                            |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Cinematic (`full`)  | 4× MSAA scene target, bloom on bright values (sun, lamps, glare), sun shafts through open sky, depth of field for director shots, grade and lens finish |
| Graded (`lite`)     | Grade, vignette and film grain; no MSAA, bloom, shafts or depth of field                                                                                |
| Off                 | The original direct render                                                                                                                              |
| Automatic (default) | Cinematic on desktop, Off on phones                                                                                                                     |

Tone mapping moved from the renderer into the finish pass. It uses the same ACES fit and exposure, so colours match the plain render before grading. Grades are per weather plus one for dusk and ease over about half a second. Sun shafts use the sky depth mask, so hills and trees block them; rain and tunnels turn them off.

Measured in the Chrome Agent session at 1291 × 828 CSS pixels (pixel ratio 1.37, about 2 M physical pixels), scenic view at Sakuragawa: both Off and Cinematic held the display's 120 fps (p95 frame interval 9.7 ms, 480 samples each). This is frame pacing on one Mac, not GPU timing, and it was not measured on phones.

## Director camera

Choose **Camera → Director · film**, press **C** until it comes round, or let an agent start it. The HUD fades while the director is in charge and comes back when the pointer moves or a key is pressed. The frame is 2.39:1.

`camera/director.js` runs after the gameplay rig and replaces the camera pose only while it is active. Each shot sets its own position, lens (full-frame focal length), focus distance and aperture, and follows the subject with a slight lag and small handheld drift.

| Shot           | Description                                                                     |
| -------------- | ------------------------------------------------------------------------------- |
| `trackside`    | Planted beside the line ahead of the train; holds until the last car has passed |
| `telephoto`    | 70–300 mm from 170–290 m away (further turns white in the valley haze)          |
| `drone`        | Starts low behind the train and rises into a wide pull-back                     |
| `helicopter`   | Slow orbit around the middle car                                                |
| `chase`        | Ahead of the train, looking back at the cab                                     |
| `wheels`       | Low beside the bogies with shallow focus                                        |
| `cab`          | Driver's seat                                                                   |
| `window`       | Passenger seat looking out of the side window                                   |
| `platform`     | At the nearest stop, looking along the platform                                 |
| `bridge-low`   | From the valley floor below the Takabashi bridge                                |
| `establishing` | High wide of the place, used for place cards                                    |
| `portrait`     | A person's face on the thirds; finds a clear sightline and keeps it (see below) |
| `orbit`        | Circles any subject                                                             |

The automatic editor avoids repeating a shot type or staying at one scale (wide, medium, close). Near a stop it prefers platform and window shots; near the bridge it prefers bridge-low and telephoto; before the tunnel it plants a trackside shot at the portal; in the tunnel it stays inside. Entering a new stop area shows an establishing shot with a place card and a one-line narration from `presentation/place-lines.js`. A shot is rejected when terrain, tree crowns or station buildings block the view; the editor tries another. A platform shot steps along the platform, sideways and up before it gives up.

### Framing people

`camera/shot-framing.js` holds the geometry; the director supplies the sightline test. A portrait aims at the head bone of a VRM or Blender cast model (`findHeadNode` in `characters/humanoid-bones.js`), or 1.5 m above a figure's feet (1.1 m when seated). It puts the eyes on the upper third and leaves look room on the side the face points (a narrower offset in 9:16 renders, where the portrait also stands closer, 2.5 m instead of 3.2 m).

When the shot is planned, rays run from the camera to the eyes and chest, and back again so a camera standing just behind a wall is caught. Buildings, shelters, benches, the train's cars and other people (as upright capsules) block; glass, wires, leaves and weather particles do not, and the ray stops short of the subject's own body. If the planned angle is blocked the director tries angles 15–90° round, higher, lower, closer and further, cheapest change first, and keeps the first fully clear one. It stays on its side of the 180° line (the line between two speakers, or the way a lone subject faces) and crosses only when nothing on its side is clear. A view that would show the back of the speaker's head is never chosen.

While a portrait holds, the view is checked every 0.25 s. Two blocked checks in a row allow a new search; a new angle must be clearly better, the camera eases to it over 0.9 s, and then it rests for 1.5 s. Every substitution is written to the episode log with the prefix `camera:`.

Portraits take an optional `partner` (the listener) and `framing`: `single`, `ots` (over the listener's shoulder, a longer lens) or `two` (both faces). Consecutive shots of the same pair keep the same side of the line. An over-the-shoulder shot of someone turned away from the listener becomes a single.

A `window` shot turns to another window, or the other side of the car, when a seated passenger's head would be closer than 3.2 m in frame; it re-checks twice a second as riders board.

Story conversations keep their own camera: the director pauses while a conversation beat is active.

## Agent tools

These register through `registerGameWebMCP({ extensions })` in development builds, next to the existing game tools. Arguments are validated against the schemas in `agent/director-tools.js` and `camera/director.js` before anything moves.

| Tool                        | Purpose                                                                                             |
| --------------------------- | --------------------------------------------------------------------------------------------------- |
| `get_director_state`        | Active shot, lens, queue, recent history, film look, nearby stop/bridge/tunnel and visible people   |
| `direct_shot`               | Cut to one shot now; the editor continues afterwards                                                |
| `play_sequence`             | 1–40 shots with an optional title card; each shot can carry `caption`, `subtitle`, `line` and `set` |
| `stop_sequence`             | Clear queued shots                                                                                  |
| `set_film_look`             | Change quality, or force letterbox bars outside the director                                        |
| `get_npc_minds`             | Persona, mood, needs, intent and source (`local`, `jev`, `directed`) for background characters      |
| `direct_npc`                | Give one character an acting note (`mood`, `intent`) for 1–300 seconds                              |
| `cue_npc_event`             | Tell characters something happened (rain, a late train, a horn)                                     |
| `grab_character`            | Grab the character at a screen point (NDC) or by id; see below                                      |
| `list_grabbable_characters` | Visible characters with their screen centre, nearest first                                          |
| `get_grabbed_characters`    | Recent grabs, including characters a person Alt-clicked                                             |
| `get_world_state` …         | Existing game, story, route, duty and level-building tools                                          |

`set` accepts `weather`, `timeOfDay` (`daylight`, `sunrise`, `sunset`, `dusk`), `location` (a place id or route z) and `speedKmh`. It runs through the same actions as the UI, including Places travel for location jumps, and the cut fades through black. Unfinished station duties block location jumps here, as they block Places.

Caption text is set with `textContent` and limited to 160 characters. Captions are data, never markup.

### Example: a three-shot scene

```json
{
  "title": "The Late Bus",
  "shots": [
    {
      "type": "establishing",
      "set": { "location": "station", "timeOfDay": "dusk" },
      "caption": "Momiji",
      "line": "The last bus left at 18:05."
    },
    {
      "type": "portrait",
      "subject": { "person": "commuter-3" },
      "duration": 8,
      "line": "She checks the timetable again. The bus is not on it."
    },
    { "type": "trackside", "aperture": "shallow" }
  ]
}
```

Before the portrait, `direct_npc` with `{ "entityId": "commuter-3", "mood": "anxious", "intent": "check-phone", "holdSeconds": 60 }` gives the character the matching behaviour. Use `get_director_state` to find visible people.

### Grabbing a character

In a development build, **Alt-click** (Option-click on a Mac) a person in the game to grab them. A card shows who they are, what they are doing and how far they moved, and the record is kept for agents. An agent grabs the same way with `grab_character` (x and y in normalized device coordinates, as `pick_world` uses, or an id) and reads grabs with `get_grabbed_characters`.

A record holds the id, kind (`momiji`, `regional`, `story-cast`, `story-guest`), position and heading, the simulation state, the NPC mind (mood, intent, source, needs), the Blender model's clip, the episode part the person plays, the story beat for Haru and Emi, and the camera. Its `motion` summary covers the last 4 seconds, sampled 10 times a second: path length, net displacement, speed and the number of direction reversals. A figure that paces or jitters shows up as many reversals with a small net displacement, and `path` lists the samples.

## Episodes

For whole scenes with a cast, dialogue and train staging, write an episode instead of a shot list. See [writing episodes](drama/README.md).

## Limits

- Three Momiji people (`commuter-1`, `commuter-2`, `reader-1`) have Blender models with blinks, smiles and a talking jaw. Everyone else is a low-poly figure without a face. A portrait of Mr. Ishida from the front shows his newspaper, not his face.
- Narration lines are on-screen text. They are not voiced; Haru's story keeps its own narration.
- The director tools are registered only in development builds, like the other WebMCP tools.
- Train-subject shots (trackside, platform and so on) check scenery, not people. Portraits check scenery, the train and people. Instanced forests are handled by height checks only.
- Sun shafts need the sun inside or just outside the frame; many shots face away from it.
