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

| Shot           | Description                                                                        |
| -------------- | ---------------------------------------------------------------------------------- |
| `trackside`    | Planted beside the line ahead of the train; holds until the last car has passed    |
| `telephoto`    | 70–420 mm from a few hundred metres away, compressing the train against the valley |
| `drone`        | Starts low behind the train and rises into a wide pull-back                        |
| `helicopter`   | Slow orbit around the middle car                                                   |
| `chase`        | Ahead of the train, looking back at the cab                                        |
| `wheels`       | Low beside the bogies with shallow focus                                           |
| `cab`          | Driver's seat                                                                      |
| `window`       | Passenger seat looking out of the side window                                      |
| `platform`     | At the nearest stop, looking along the platform                                    |
| `bridge-low`   | From the valley floor below the Takabashi bridge                                   |
| `establishing` | High wide of the place, used for place cards                                       |
| `portrait`     | Medium shot of a person or point; tries eight bearings for a clear line of sight   |
| `orbit`        | Circles any subject                                                                |

The automatic editor avoids repeating a shot type or staying at one scale (wide, medium, close). Near a stop it prefers platform and window shots; near the bridge it prefers bridge-low and telephoto; before the tunnel it plants a trackside shot at the portal; in the tunnel it stays inside. Entering a new stop area shows an establishing shot with a place card and a one-line narration from `presentation/place-lines.js`. A shot is rejected when terrain, tree crowns or Momiji station buildings block the view; the editor tries another. Obstruction from regional station buildings is not checked.

Story conversations keep their own camera: the director pauses while a conversation beat is active.

## Agent tools

These register through `registerGameWebMCP({ extensions })` in development builds, next to the existing game tools. Arguments are validated against the schemas in `agent/director-tools.js` and `camera/director.js` before anything moves.

| Tool                 | Purpose                                                                                             |
| -------------------- | --------------------------------------------------------------------------------------------------- |
| `get_director_state` | Active shot, lens, queue, recent history, film look, nearby stop/bridge/tunnel and visible people   |
| `direct_shot`        | Cut to one shot now; the editor continues afterwards                                                |
| `play_sequence`      | 1–40 shots with an optional title card; each shot can carry `caption`, `subtitle`, `line` and `set` |
| `stop_sequence`      | Clear queued shots                                                                                  |
| `set_film_look`      | Change quality, or force letterbox bars outside the director                                        |
| `get_npc_minds`      | Persona, mood, needs, intent and source (`local`, `jev`, `directed`) for background characters      |
| `direct_npc`         | Give one character an acting note (`mood`, `intent`) for 1–300 seconds                              |
| `cue_npc_event`      | Tell characters something happened (rain, a late train, a horn)                                     |
| `get_world_state` …  | Existing game, story, route, duty and level-building tools                                          |

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

## Limits

- Characters are the existing low-poly figures. Portraits frame them well but do not add facial animation.
- Narration lines are on-screen text. They are not voiced; Haru's story keeps its own narration.
- The director tools are registered only in development builds, like the other WebMCP tools.
- Only Momiji station buildings count as obstructions for shot planning.
- Sun shafts need the sun inside or just outside the frame; many shots face away from it.
