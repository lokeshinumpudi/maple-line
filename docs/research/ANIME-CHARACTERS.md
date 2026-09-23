# Anime characters

Decision, 23 September 2026: the boxy Blender figures give way to stylized anime characters. They load as VRM files through `@pixiv/three-vrm`, with MToon toon shading, spring-bone hair and clothes, and VRM expressions for blinks, smiles and mouth shapes. The look is warm slice-of-life countryside, not action anime.

This page covers four things: what is built now, the art direction, how each character will be made, and the budgets. It ends with the exact list of downloads that still need approval. Planned work is marked as planned. It is not evidence of implemented behaviour.

## Status

| Part                                                                                   | State                                                                                          |
| -------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| VRM loading, MToon house tone, spring bones, expressions and visemes in `hero-cast.js` | Built. Momiji's Mr. Sato, Riko and Mr. Ishida load as VRMs.                                    |
| Canonical humanoid bone map for IK, foot planting and look-at                          | Built (`apps/game/src/characters/humanoid-bones.js`).                                          |
| Shared clip set retargeted offline to VRM Animation (`.vrma`)                          | Built, from the Blender cast's own clips. Quaternius UAL clips are not downloaded yet (below). |
| Test VRMs for the three Momiji people                                                  | Built by our own script (`asset-src/characters/vrm-cast/build.py`). No outside assets.         |
| Final cast from VRoid samples edited with the VRM Add-on for Blender                   | Planned. Waits on the approvals listed below.                                                  |
| Route-story cast (Haru, Emi, Nao, Fumi, Jun, Yuta, Mika, Keiko)                        | Planned. The story cast still uses `story-cast.js` figures.                                    |

The test VRMs are for checking the pipeline. They are not the final art. They show the right shading, outlines, eyes, hair motion and expressions in the game's light. Their bodies are simple: smooth tubes, clothes as colour regions, no textures.

## Art direction

**Tone.** Quiet, late-afternoon, lived-in. People are ordinary commuters, growers and shopkeepers. Faces are readable at platform distance (5 to 15 m) and expressive in director close-ups.

**Proportions.** Heads are a little larger than life, so faces read on a phone. The eye size also tells you the age.

| Group                               | Head-to-height | Eyes                                | Build                                        |
| ----------------------------------- | -------------- | ----------------------------------- | -------------------------------------------- |
| Teenagers (Riko, Emi)               | 1 : 6.5        | Large, tall irises, two highlights  | Slim, narrow shoulders                       |
| Adults (Sato, Nao, Yuta, Jun, Mika) | 1 : 7          | Medium; a narrower lid line for men | Shoulders 1.15 to 1.2 times a teenager's     |
| Elders (Ishida, Haru, Keiko, Fumi)  | 1 : 7          | Smaller irises, a softer upper lid  | A stoop of 5 to 10 degrees set per character |

**Shading.** The MToon house tone is in `characters/mtoon-tone.js`:

- **Shadows:** a two-tone step. The shaded side leans warm lavender and never drops below 42 percent of the lit colour. ACES tone mapping deepens darks, so shadows are kept light.
- **Outlines:** 1.2 to 3.2 mm in world units at 1.6 m tall, drawn in a darkened copy of the surface colour. Outlines are off on mobile, because each one is a second draw of the mesh.
- **Rim light:** weak and warm, like evening sun, not a halo.
- **Brightness:** lit colours are scaled by 0.62. The game's sun, sky light and exposure give a surface about 1.6 times its base colour, which would otherwise clip skin and white shirts to white.

**Palette per character.** Colours follow each person's role in the story. Hex values are the authored (display) colours.

| Character       | Role                                                      | Hair                       | Main colours                                            | Accent and props                        |
| --------------- | --------------------------------------------------------- | -------------------------- | ------------------------------------------------------- | --------------------------------------- |
| Riko, 17        | Student taking her grandmother's repaired radio to Aonuma | Black ponytail, side locks | Navy blazer `#2c3552`, skirt `#3f4660`, shirt `#f4f1ea` | Red ribbon `#c0303a`, radio in a box    |
| Mr. Sato, 44    | Office commuter, nine years on the 16:58                  | Short black, side part     | Charcoal suit `#3a4150`, white shirt                    | Navy tie `#2f4f7a`, shoulder bag, phone |
| Mr. Ishida, 70s | Reads the paper on the Momiji bench every evening         | Thin grey, swept back      | Brown cardigan `#8a6a4a`, grey trousers `#5a5854`       | Glasses, newspaper                      |
| Haru Morita, 60 | Local train driver, the campaign's narrator               | Short grey at the sides    | Railway uniform navy, cap                               | White gloves, notebook, a spanner       |
| Emi, 17         | Records the service for the village radio                 | Dark bob with a clip       | Cardigan over a school blouse, warm oatmeal and teal    | Recorder and headphones                 |
| Nao             | Runs the Momiji bakery                                    | Tied back under a scarf    | Flour-white apron over mustard                          | Bread crates, a clinic label            |
| Fumi            | Bicycle mechanic at Aonuma                                | Grey, short, practical     | Work jacket in faded denim                              | Grease on the thumb, the 13 mm spanner  |
| Jun             | Grower sharing irrigation work                            | Short, sun-bleached        | Olive work wear, rubber boots with dried mud            | Towel round the neck                    |
| Yuta            | Hinoki woodworker sending furniture parcels               | Dark, tied back            | Indigo work jacket, canvas apron                        | Pencil behind the ear, parcel tape      |
| Mika            | Runs the summit café                                      | Long, low ponytail         | Cream knit, brick-red apron                             | Paper bags of Nao's bread               |
| Keiko, 61       | Potter, Haru's wife                                       | Grey bob                   | Clay-stained smock in slate blue                        | Car keys, an apron pocket of tools      |

## How each character is made

The final cast starts from pixiv's CC0 VRoid sample avatars. It is edited in Blender with the VRM Add-on for Blender, then goes through the same build step as the test figures. Every step is a script or a recorded list of edits, so an agent can rebuild a character.

1. **Pick a base.** Use one of the four CC0 β VRoid samples (see the approval list). Choose the body by build (slim teenager, adult, elder) and ignore their outfits.
2. **Import in Blender 5.2** with the VRM Add-on. The samples are VRM 0.x. Export as VRM 1.0, so bones, expressions and springs use the names `hero-cast` expects.
3. **Swap the hair.** Replace it with hair meshes from the other samples, or with strands modelled in the style of `build.py` (a scalp shell plus tapered strands). Put spring chains on bangs, side locks, ponytails and skirt hems. Add colliders on the head, neck, chest and upper arms.
4. **Change the outfit.** Recolour the texture atlas regions to the palette above. Keep one atlas per character.
5. **Add accessories** as separate meshes skinned to one bone: glasses and a newspaper for Ishida, a ribbon for Riko, a tie and bag for Sato. A newspaper or phone that shows only in some clips is its own node, named as `hero-cast` expects (`newspaper`).
6. **Age the face.** Adjust the eye shape keys and brows for age. Elders get a smaller iris and softer upper lid, and a posture stoop in the scene extras (`posture.stoop`, degrees).
7. **Reduce to budget.** Remove body faces hidden under clothes. Decimate hair and clothes. Bake the atlas at 1024 px and compress it (KTX2). Merge materials.
8. **Check in the lab and the game.** Run the character lab (`/character-lab.html` on the dev server; add `?compare=1` to see the Blender GLBs beside them). Then take director portraits at Momiji at daylight and sunset.

Clips do not come with the avatars. `asset-src/characters/vrm-cast/retarget.mjs` turns a humanoid glTF's clips into one `.vrma` file. It has rig maps for the Blender cast and for Quaternius UAL. When UAL is downloaded:

- Run `retarget.mjs --source <ual.glb> --rig ual`.
- Check the bone names it prints against the `ual` map.
- Keep the `hero-cast` clip names: `idle`, `walk`, `hurry`, `sit`, `board`, `wave`, `check-phone`, `watch-train`, `shelter`, `chat` and `stretch`.

## Budgets

Measure with `measure_game_performance` on a phone before and after adding a character.

| Tier                               | Triangles | Textures                      | Materials (draws)        | Spring joints | File     |
| ---------------------------------- | --------- | ----------------------------- | ------------------------ | ------------- | -------- |
| Hero, desktop (director close-ups) | ≤ 20,000  | One 1024² atlas, KTX2 or WebP | ≤ 8 (≤ 16 with outlines) | ≤ 40          | ≤ 2 MB   |
| Hero, mobile (same file, runtime)  | same      | 512² mip used                 | outlines off: ≤ 8        | ≤ 20 active   | same     |
| Background resident                | ≤ 3,000   | Shared palette texture        | 1                        | 0             | ≤ 150 KB |
| Shared clip set (`.vrma`)          | n/a       | n/a                           | n/a                      | n/a           | ≤ 200 KB |

The test VRMs today:

| Character  | Triangles | Materials | File size |
| ---------- | --------- | --------- | --------- |
| Riko       | 12,417    | 20        | 368 KB    |
| Mr. Sato   | 8,962     | 19        | 306 KB    |
| Mr. Ishida | 8,493     | 21        | 306 KB    |

The shared clips are 120 KB. Triangles are within budget. Materials are not: each face decal colour is its own flat material. The next build should draw the face and clothes from one small palette texture, which brings each figure down to three or four draws.

The VRoid samples are 26,706 to 34,395 triangles and 14 to 18 MB each. They must be cut down before use.

## Files awaiting approval

Nothing below has been downloaded. Sizes come from GitHub API metadata, VRoid Hub's API or the vendor page, on 23 September 2026. Re-read each licence page on the day you download.

### VRoid CC0 sample avatars (β Ver AvatarSample 1–4)

pixiv's FAQ lists these as CC0: https://vroid.pixiv.help/hc/en-us/articles/4402614652569. Each also has its own CC0 page. Downloading needs a VRoid Hub login. They are VRM 0.x files exported with UniVRM 0.44.

| File (model)                           | Page                                                                            | Bytes      | Triangles | Licence text                                            |
| -------------------------------------- | ------------------------------------------------------------------------------- | ---------- | --------- | ------------------------------------------------------- |
| β Ver AvatarSample_1 (Sendagaya Shibu) | https://hub.vroid.com/characters/675572020956181239/models/4479743608263344465  | 16,851,352 | 34,395    | https://vroid.pixiv.help/hc/en-us/articles/360012381793 |
| β Ver AvatarSample_2 (Vivi)            | https://hub.vroid.com/characters/945152946522067123/models/1622417912888236740  | 17,936,516 | 26,706    | https://vroid.pixiv.help/hc/en-us/articles/360014900273 |
| β Ver AvatarSample_3 (Vita)            | https://hub.vroid.com/characters/6193066630030526355/models/3525604181073039892 | 14,198,800 | 27,002    | https://vroid.pixiv.help/hc/en-us/articles/360014900113 |
| β Ver AvatarSample_4 (Victoria Rubin)  | https://hub.vroid.com/characters/2792872861023597723/models/5013769147837660446 | 15,321,932 | 29,800    | https://vroid.pixiv.help/hc/en-us/articles/360014900233 |

**Verdict: needs a decision.** The FAQ and the per-model pages say CC0. The licence stored inside each file (the VRM meta) says `licenseName: "Other"`. It points to VRoid Hub terms that allow commercial use and redistribution without credit, but that is not CC0. Decide which source counts before approving. If approved, record the FAQ page, the model page and the embedded meta in `asset-src/THIRD_PARTY.md`.

Rejected:

- **AvatarSample_A, B and C** (VRoid Studio stable) and **VRoidPreset_A–Z.** The same FAQ says they are not CC0 ("copyright is not waived").
- **The unofficial mirror** https://github.com/madjin/vrm-samples. It has no repository licence, and its copies differ in size from VRoid Hub's.
- **`VRM1_Constraint_Twist_Sample.vrm`** in pixiv/three-vrm's examples (10,776,032 bytes). It uses the VRM Public License 1.0: https://github.com/vrm-c/vrm-specification/blob/master/samples/VRM1_Constraint_Twist_Sample/README.md.

### VRM Add-on for Blender (saturday06)

| File                                        | URL                                                                                                                    | Bytes     | Licence                                                                                         | Verdict                |
| ------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- | --------- | ----------------------------------------------------------------------------------------------- | ---------------------- |
| `VRM_Addon_for_Blender-Extension-4_7_2.zip` | https://github.com/saturday06/VRM-Addon-for-Blender/releases/download/v4.7.2/VRM_Addon_for_Blender-Extension-4_7_2.zip | 1,643,935 | "MIT OR GPL-3.0-or-later": `LICENSE_MAIN.txt` and `LICENSE_(OPTION1)_MIT.txt` in the repository | Fits (taken under MIT) |

Version 4.7.2 supports Blender 4.2 up to, but not including, 5.3, so Blender 5.2 is fine. It is also listed at https://extensions.blender.org/add-ons/vrm/. The add-on is a build tool. It is not shipped to players.

### Approved but not yet downloaded: Quaternius Universal Animation Library

These packs are approved (CC0: https://quaternius.com/faq.html and the pack pages). The automatic download was blocked in the agent session, because itch.io serves free downloads through a per-session form. A person needs to download them, or allow the agent to.

| File                                          | Page                                                     | Size (page, rounded) |
| --------------------------------------------- | -------------------------------------------------------- | -------------------- |
| `Universal Animation Library [Standard].zip`  | https://quaternius.itch.io/universal-animation-library   | 15 MB                |
| `Universal Animation Library 2[Standard].zip` | https://quaternius.itch.io/universal-animation-library-2 | 17 MB                |

Only the free Standard files are wanted. The Pro and Source files are paid, so they are out of scope.

## Next steps

1. Decide on the VRoid licence question and approve the files above. Download UAL 1 and 2.
2. Retarget UAL clips with `retarget.mjs --rig ual`. Replace `cast-clips.vrma` once the walk measures within 5 percent of the residents' pace.
3. Build Riko from an approved sample, following the steps above. Compare her with the test figure in the lab and at Momiji.
4. Move face decals and clothing colours onto one palette texture per character, to meet the draw budget.
5. Extend VRM figures to the route-story cast, one chapter at a time. The IK and look-at module uses the canonical bone map, so the story cast needs no extra motion code.
