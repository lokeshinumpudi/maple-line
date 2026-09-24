# Concept cast

Builds a game character from three painted views of approved concept art. Each character has a settings file, `<cast>.json`, and the build writes `apps/game/public/models/characters/vrm/<cast>.vrm`. Built so far:

- Riko (`riko.json`), the Momiji student. Her older test figure is retired.
- Ammamma, the Telugu grandmother (`fusae.json`, built from the `ammamma-*` views). The cast id stays `fusae`, the id of the staged drama role in `apps/game/src/drama/drama-roles.js`. Her VRM replaces the test figure from `vrm-cast/build.py`; do not rebuild `fusae` with that script.

Everything runs in Blender (5.2, `blender -b`) except the last step, which is the shared `make-vrm.mjs`:

```sh
blender -b --factory-startup --python-exit-code 1 \
  --python asset-src/characters/concept-cast/build.py -- --cast <riko|fusae> [--render <folder>]
node asset-src/characters/vrm-cast/make-vrm.mjs --from asset-src/characters/concept-cast/build <riko|fusae>
blender -b --factory-startup --python-exit-code 1 --python asset-src/characters/concept-cast/props.py
blender -b --factory-startup --python-exit-code 1 --python asset-src/characters/concept-cast/tests/run.py
```

The build takes about three minutes. `--render` writes orthographic renders over the painted views, face close-ups per expression and the hair masks, for checking a change. Intermediate files go to `build/` (ignored by git); `riko.report.json` records triangles, materials, springs and shape keys.

## Inputs

- `ref/riko-front.jpg`, `ref/riko-side.jpg`, `ref/riko-back.jpg`: the three views, each 1024 × 1024 on the paper colour. `ref/radio-sheet.jpg` paints the radio. Provenance and prompts are in [THIRD_PARTY.md](../../THIRD_PARTY.md).
- `ref/ammamma-*.jpg`, `ref/aoi-*.jpg`, `ref/ishida-*.jpg`, `ref/sato-*.jpg` and the `*-sheet.jpg` turnarounds: the other cast members' views (Aoi's come from `c-mika.png`). Only Ammamma is built from them so far; `fusae-*.jpg` are the earlier Japanese grandmother's views, kept for reference.
- `riko.json`: what the pixels cannot say on their own. The height (1.55 m); which half of the front and back views is free of her shoulder bag (that half is mirrored); polygons around the bag and strap in the side view and around the hair clip; a few rows (shoulder line, waist, skirt top, neck); face landmarks (chin, eye row and spacing, mouth, brow, ear); the arm's depth and the toe in the side view; and the colours for the drawn face.

### Settings for other characters

`fusae.json` (Ammamma) shows the options Riko does not need:

| Setting                            | What it does                                                                                                                        |
| ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `groundShadow`                     | A painted shadow under the feet counts as paper in the matte.                                                                       |
| `maskCuts`                         | Polygons cut out of a view's matte, such as the paper between feet set close together.                                              |
| `bagRow: null`, `mirrorRegions`    | No bag to mirror away; a hand the sheet cut off is painted from the other hand.                                                     |
| `neckerchief`                      | Riko only: strip the neckerchief from the side silhouette.                                                                          |
| `torsoLine`, `armpitMin`           | Where baggy sleeves lie against the body all the way down, the line between arm and body, drawn by hand.                            |
| `rows.hem`                         | The hem row, when a long dress over close feet hides the gap between the legs.                                                      |
| `hairMask`, `hairHalf`, `hairCuts` | Grey hair picked by saturation and hue; which half is mirrored; the bun cut out of the shell's outline.                             |
| `hair`                             | Lock count, spring chains, shell thickness and how much of the painted strokes stays.                                               |
| `bun`                              | A hair bun as its own mesh on a stiff three-joint spring chain, shaded in its painted grey.                                         |
| `hair.ringShift`                   | Moves the hair shell's widest part behind the ears, for hair pulled back into a bun.                                                |
| `jewellery`                        | Gold stud earrings and bangles; the studs ride on the head, the bangles on the lower arms.                                          |
| `head.front.bindi`                 | A small red bindi between the brows.                                                                                                |
| `rows.collar`                      | Where the painted neck ends above the neckline.                                                                                     |
| `headShape`, `head.front.hairline` | Skull depth behind the ears and under the hair; a bare forehead up to the hairline.                                                 |
| `glasses`                          | Round wire glasses as a separate mesh, rigid on the head.                                                                           |
| `face`                             | Eye size, iris, mouth width, the resting smile, blush, and age lines (a drawn nose, smile folds and crow's feet in `colors.lines`). |
| `skirt`                            | Pleat depth, how much the hem follows the thighs, and `legBlend`: an even split of both thighs so a saree hangs.                    |
| `posture.stoop`, `posture.stance`  | Degrees of stoop, and of the upper legs turning in to bring the feet together (`vrm-actor.js`).                                     |

## Steps

1. **Matte** (`matte.py`). The character is everything not reachable from the image border through paper-coloured pixels. Line art closes each shape, so skin and white socks stay in even though their colours are near the paper. Each view gets its own frame: head top and sole give the metres per pixel, and the lower legs give the body axis, because the painted views differ a little in height and offset. The back view mirrored matches the front with an IoU of 0.94.
2. **Shape** (`shape.py`, `build.py`). A plain visual hull from two views has box-shaped cross-sections, so each horizontal slice is instead a superellipse inside the front and side extents of each silhouette piece (torso, each leg). The neckerchief ends are cut out of the side silhouette so the chest is not pushed forward. Arms are spheres swept along the arm's centre line measured from the front view, with a 16 mm gap left between sleeve and blouse so the arm can lift. The legs under the skirt are grown from the legs at the hem. The 3 mm occupancy grid is blurred and meshed through an OpenVDB grid (Volume to Mesh). QuadriFlow is tried first; it shrank the thin limbs by about 10% on every attempt, so the build falls back to edge-collapse decimation (about 6,000 triangles).
3. **Head, hair, skirt** (`parts.py`). The head is a deformed sphere fitted to the face landmarks: flat face, full cheeks, a small chin, ears. The hair is a shell whose outline is cut by the dark-hair silhouettes of all three views, with 30 tapered locks laid over it so the fringe and the bob end in points instead of a cut edge. The skirt is lofted through the skirt silhouette with pleats deepening toward the hem. The hair clip is a small mesh placed where the side view paints it.
4. **Paint** (`bake.py`). Body, skirt and hair share one 1024² UV atlas. Cycles bakes each texel's position, normal and object, and, for each of four views, how much light a sun shining along that view gives it (facing times not-in-shadow). The views are then looked up orthographically and blended by those weights, with the bag and clip masked out. Hair texels take colour only from hair pixels and body texels never do; the neck and the shoe soles, which no view shows clearly, are painted flat.
5. **Face** (`face.py`). Layered decal polygons (eyes with two highlights, lashes, brows, mouth, blush, nose) laid just off the head, with one shape key per VRM expression: blink left and right, happy, relaxed, surprised, aa, ih, ou, ee, oh, and look up, down, left and right.
6. **Rig** (`rig.py`). The VRM humanoid skeleton (with fingers) is placed on measured landmarks: the arm line, the wrist where the painted run turns to skin, elbows at 47% of the arm, hips at 0.545 of the height (the game reads a VRM's height back from its hips), knees and ankles from the leg runs and the top of the shoes. The body gets Blender heat weights, then region rules: arm bones never move the blouse side, torso bones never move the sleeve, each leg owns its own side, the head is rigid. The skirt follows the hips and, toward the hem, the thighs (the front more than the back). Six spring chains swing the bob. The A-pose is posed out to the VRM T-pose and applied as the rest pose.
7. **Export**. A GLB with a JPEG atlas and a sidecar of humanoid bones, expressions, springs, colliders and MToon roles. `make-vrm.mjs` turns it into VRM 1.0 and uses the painted texture for the MToon shaded side as well.

## Budgets and results

Riko: about 13,600 triangles (body 6,000, hair 4,700, head 1,600, skirt 960, face 300) and a 0.5 MB VRM. The radio and phone (`props.py`) add 236 triangles and 50 KB.

Ammamma: see `fusae.report.json` for the triangles per mesh; about 12,600 triangles and a 0.46 MB VRM, 1.45 m tall with a 6 degree stoop and a 7 degree stance.

## Known gaps

Ammamma:

- Her hair is a painted shell with a bun; from the front it still reads a little like a cap, with no loose strands at the temples.
- The nose is drawn, not modelled; the side profile is flat.
- Seated, the saree hem forms a ring round the shins.

Riko:

- The body is decimated triangles, not quads (QuadriFlow shrank the arms).
- The painted clothes carry the painted light; under the game sun the navy reads darker and flatter than the art.
- The hair is dark brown with painted streaks rather than the art's soft near-black, and seen straight on the fringe sits a little like a cap.
- The face is decals on a smooth head; there is no painted nose or cheek shading, and the side profile is flat.
- Hands are mittens with finger bones inside, so a grip curls the whole hand.
- Thighs can show through the skirt in a deep sit.
