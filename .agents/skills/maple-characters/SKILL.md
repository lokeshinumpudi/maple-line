---
name: maple-characters
description: Build, rig, animate and review Maple Line's VRM characters. Covers the concept-to-VRM Blender build, retargeted clips, the Character Studio, motion layers, seated contact, face expressions, lip sync and lighting faces. Use when a character looks wrong, moves badly, sinks into a surface, needs a new clip or expression, or a new cast member is needed. Do not use for procedural crowds of boxes (retired), terrain, or shader-only work (use maple-browser-graphics).
---

# Maple Line characters

Resolve the repository root three directories above this skill. Read [Maple Line development](../maple-line-dev/SKILL.md) first. The long-form lessons behind this skill are runbook chapters 38–57 (build with the `build:runbook` script in `package.json`); the docs below are the current reference.

| Need                                       | Read                                                                                 |
| ------------------------------------------ | ------------------------------------------------------------------------------------ |
| Clips, retargeting, motion layers, jitter  | `docs/CHARACTER-MOTION.md`                                                           |
| The studio's panels, URL parameters, tools | `docs/CHARACTER-STUDIO.md`                                                           |
| Building a character from painted views    | the README in `asset-src/characters/concept-cast/`                                   |
| Retinting or re-exporting a built VRM      | the header comment of each script in `asset-src/characters/vrm-cast/`                |
| Look, palette, skin and outline rules      | `docs/ART-DIRECTION.md`, and search `apps/game/src/characters/` for `CHARACTER_TONE` |
| Blender MCP setup and asset conventions    | [Maple Blender assets](../maple-blender-assets/SKILL.md)                             |

## What the cast is

Every person on screen is a VRM 1.0 file: a glTF model with the standard humanoid skeleton, MToon toon materials, face expressions and spring bones. That standard is why the cast looks and moves better than the retired box-and-tube figures: one set of motion-capture clips (Quaternius UAL, CC0, retargeted once into a `.vrma` file) plays on every body, and the house MToon tone gives every character the same outline, shaded side and rim.

- **Hero cast and staged roles** (the drama episodes): search `apps/game/src/world/` for `MOMIJI_CAST` and `STAGED_CAST`. Cast ids can differ from story names; `riko` is Meera and `fusae` is Ammamma. Check the drama roles module before renaming anything.
- **Crowd kit**: instanced animated townsfolk that share the same clips. Search `apps/game/src/characters/crowd/`.
- **Clip file**: search `apps/game/public/models/characters/vrm/` for `.vrma`. List the clips in the studio rather than copying a list here.

## Build a new character

1. Get three painted views (front, side, back) of one character on plain paper, same pose and scale. Generated concept art is fine as a modelling reference; record provenance in the third-party record under `asset-src/`.
2. Write the character's settings JSON next to the existing ones in `asset-src/characters/concept-cast/`: height, face landmarks, masks for bags or hands the sheet cut off, hair, jewellery, stoop and stance. Copy the closest existing character and change it; the README's settings table explains every key.
3. Run the concept-cast build headless in Blender (command in its README; about three minutes), then the shared VRM writer in `vrm-cast/`. Use `--render` into the scratchpad and look at the orthographic renders over the painted views and the face close-ups per expression.
4. Open the result in the Character Studio with the concept overlay on (below). Every clip in the library must play without stretched sleeves, skirts through thighs, or feet joined together.
5. Add the character to the cast list and pick a cast id the drama roles already use, or add one.

Lessons that cost a round each:

- **Smoothing can close gaps.** The blur that rounds the carved body closed a 1.5 cm gap between the shoes into a bar that stretched as she walked, although the matte was clean. Look between the feet and under the arms after any change to smoothing or remeshing; the build now cuts the body on the centre plane below the hips.
- **Region rules fix heat weights.** Blender's automatic weights let an arm drag the side of the blouse and a leg pull the other leg. The rig step zeroes weights by region: each arm only moves its own sleeve, each leg only its own side, the head is rigid.
- **Hips at 0.545 of the height.** The game reads a VRM's height back from its hips; a rig with the hips elsewhere comes out the wrong size in the scene.
- **Flat skin, not projected paint.** Projected paint carries pencil lines, seams and blotches onto legs and hands. Skin is one even colour; clothes keep the projected paint.
- **Colour fixes do not need a rebuild.** `retint.mjs` in `vrm-cast/` changes a material's base and shade colour in place (for example `--color mouth=#3a0e10 --shade mouth=#230708`, which made mouths visible on brown skin). Rebuilding with the concept-cast build must carry the same colour, or the fix is lost on the next build.

## Inspect and tune in the Character Studio

Start the game dev server (`dev` script in `package.json`; a worktree uses its own port with `--strictPort`) and open `/character-studio.html?character=vrm/<id>&clip=<clip>&t=<seconds>`. The URL opens a paused frame, so a person and an agent can look at the same moment. The studio imports the game's own character modules; never copy code into it, or its numbers stop describing the game.

- **Four views** with the concept overlay: the fastest check that a build still matches its art.
- **Motion layers**: breathing and idle life, look-at, arm IK, grip curl, foot IK and planting, steering. Switch one off to see what it adds. The rule is that a layer must not fight the clip.
- **Measure jitter**: RMS angular acceleration per joint group plus foot slide, over N seconds on the studio's own clock. A layer is acceptable when jitter with it on stays within about 10% of it off. Idle arms went from 751 to about 3 rad/s² once the fighting layer was found this way.
- **Face, grip, prop sockets**: expressions, grip curl per hand and where a prop sits. Grips save to the cast tuning JSON in `apps/game/src/characters/`.
- **Page tools**: the studio exposes its controls on `window` and as page WebMCP tools (search the studio folder for `mapleStudioWebMCP`). Use them to measure and export instead of clicking.

Export a still or MP4 from the studio for review, and give numbers with every claim (jitter before and after, foot slide, triangle count from the build report).

## Performance: face, voice and contact

- **Expressions**: VRM presets (blink, happy, relaxed, surprised, aa/ih/ou/ee/oh, look directions). Episode beats set a mood and emotion per line; search `apps/game/src/drama/` for `emotion:` to see how lines drive them.
- **Lip sync** is driven by the voice audio, not a syllable timer. The voice script stores a 60 Hz mouth curve per clip (loudness with 30 ms attack and 80 ms release, and a vowel class from the sound's brightness); its `--mouth-only` flag rebuilds curves from existing WAVs without new voice calls. Renders read the curve from the voice manifest; live play measures it through an AnalyserNode. Search `vrm-expressions.js` for `createMouthDriver` for the smoothing (a new vowel must hold 50 ms; below 0.05 open the mouth is shut). Check a render frame by frame: shut in every pause over 0.3 s, open on stressed syllables, no flicker. First confirm the mouth can be seen at all at phone size.
- **Seated contact**: a seated figure is placed by the hips. The train cushion top is 0.5 m; seated drama marks rest the hips at 0.62 m and keep the seat point near the cushion's front edge (moving it back put the shins into the bench). While a scene uses a seat it renews a short seat reservation each frame, and the car hides crowd riders within 1.2 m. Search `apps/game/src/train/` for `reserveSeat` and `main.js` for `CAR_SEAT_HEIGHT`. Check from a low side angle; the dialogue camera hides a sunk thigh, which is why this fix took three rounds.
- **Faces at night**: characters get a soft warm key from their nearest lamp and a cool rim, lamp light on character materials is capped at night, and materials keep only part of each light's colour so skin stays brown. Judge by sampling face pixels (about 80–120 of 255 in night close-ups, hue still brown), not by the feel of the frame. See [browser graphics](../maple-browser-graphics/SKILL.md) for the light pools and halos.

## Verify

Run the `format` and `check` scripts from `package.json`. Character tests live in `apps/game/tests/` (search for `hero-pose`, `vrm-`, `lip`); a test that loads a textured VRM in Node needs the GLTF texture stub those tests already use. For visible changes, capture before and after from the same camera, including the angle the problem was reported from, and render a short episode clip when the change affects the drama cast. Report what was measured and what was only looked at.

## Known gaps (check before promising)

Read the "Known gaps" section of the concept-cast README; at the time of writing it lists cap-like hair, flat side profiles, mitten hands and thighs showing through a skirt in a deep sit. Arjun still uses an adult commuter model, not a concept-cast build.
