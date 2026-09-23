# Third-party files

Every outside file that Maple Line's assets or asset pipeline use, with its licence, source, size and SHA-256. Only CC0 and MIT material is accepted (see [character sources](../docs/research/CHARACTER-SOURCES.md) and [anime characters](../docs/research/ANIME-CHARACTERS.md)). Add a row when a file is downloaded. Keep a copy of the licence text as it read on the download day.

## Runtime libraries (npm)

Installed with pnpm into `apps/game` on 23 September 2026. The lockfile pins them with sha512 integrity. The SHA-256 below is of the registry tarball. Licence text: the `LICENSE` file inside each package, and https://github.com/pixiv/three-vrm/blob/dev/LICENSE.

| Package                                                   | Version | Licence | Tarball                                                                                                                                         | Bytes   | SHA-256                                                            |
| --------------------------------------------------------- | ------- | ------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | ------- | ------------------------------------------------------------------ |
| `@pixiv/three-vrm`                                        | 3.5.5   | MIT     | https://registry.npmjs.org/@pixiv/three-vrm/-/three-vrm-3.5.5.tgz                                                                               | 576,823 | `6f0102f987bc8abc9b9e78ef5b3259ea9f0dc51e30bf51d32aea6218394ea755` |
| `@pixiv/three-vrm-animation`                              | 3.5.5   | MIT     | https://registry.npmjs.org/@pixiv/three-vrm-animation/-/three-vrm-animation-3.5.5.tgz                                                           | 202,499 | `da61ce647c42876e803654156e9fb3a75ff50d8f5c31a43ae2b902114876f2ec` |
| `@pixiv/three-vrm-core`                                   | 3.5.5   | MIT     | https://registry.npmjs.org/@pixiv/three-vrm-core/-/three-vrm-core-3.5.5.tgz                                                                     | 234,320 | `7127a7113ccf72129d1fae9788c0d791552d7413f0eff9bec0dda16570fd64ed` |
| `@pixiv/three-vrm-materials-mtoon`                        | 3.5.5   | MIT     | https://registry.npmjs.org/@pixiv/three-vrm-materials-mtoon/-/three-vrm-materials-mtoon-3.5.5.tgz                                               | 164,459 | `48bf161c898cb78c9a24d314c82cdeae43d151700db4983f8af427936f6e44fb` |
| `@pixiv/three-vrm-materials-hdr-emissive-multiplier`      | 3.5.5   | MIT     | https://registry.npmjs.org/@pixiv/three-vrm-materials-hdr-emissive-multiplier/-/three-vrm-materials-hdr-emissive-multiplier-3.5.5.tgz           | 7,225   | `52ec9487285d5e12457601a85a8b470a7ef86033ec6574a9f8be45f49b13268a` |
| `@pixiv/three-vrm-materials-v0compat`                     | 3.5.5   | MIT     | https://registry.npmjs.org/@pixiv/three-vrm-materials-v0compat/-/three-vrm-materials-v0compat-3.5.5.tgz                                         | 35,259  | `2b1dc129a1ee287be07b393254a4134408cb89b3338cf812ca8f0936b212d89a` |
| `@pixiv/three-vrm-node-constraint`                        | 3.5.5   | MIT     | https://registry.npmjs.org/@pixiv/three-vrm-node-constraint/-/three-vrm-node-constraint-3.5.5.tgz                                               | 39,841  | `fea03f6b91cb6639de6198ddd4541e7cf23a800ffa9b2df564786785b403dc63` |
| `@pixiv/three-vrm-springbone`                             | 3.5.5   | MIT     | https://registry.npmjs.org/@pixiv/three-vrm-springbone/-/three-vrm-springbone-3.5.5.tgz                                                         | 99,145  | `cd37ef42dec1e2e9126052d05f2b985a6b3353e3cd03359a9c6f0129f6badfd9` |
| `@pixiv/types-vrm-0.0`                                    | 3.5.5   | MIT     | https://registry.npmjs.org/@pixiv/types-vrm-0.0/-/types-vrm-0.0-3.5.5.tgz                                                                       | 4,777   | `543096b10fcad0d79809b34693e8e960dac2b71476301c9b34178bd8481ffe30` |
| `@pixiv/types-vrmc-materials-hdr-emissive-multiplier-1.0` | 3.5.5   | MIT     | https://registry.npmjs.org/@pixiv/types-vrmc-materials-hdr-emissive-multiplier-1.0/-/types-vrmc-materials-hdr-emissive-multiplier-1.0-3.5.5.tgz | 1,596   | `7dcabe2e7cfda467d038290a4cfea0f005513189db2789785ab0f108fb564539` |
| `@pixiv/types-vrmc-materials-mtoon-1.0`                   | 3.5.5   | MIT     | https://registry.npmjs.org/@pixiv/types-vrmc-materials-mtoon-1.0/-/types-vrmc-materials-mtoon-1.0-3.5.5.tgz                                     | 2,336   | `4d1a4cfbe4bb64880e66ecf0efb3ddc8c9c815ff5bc4ea841727380f30e5dcc9` |
| `@pixiv/types-vrmc-node-constraint-1.0`                   | 3.5.5   | MIT     | https://registry.npmjs.org/@pixiv/types-vrmc-node-constraint-1.0/-/types-vrmc-node-constraint-1.0-3.5.5.tgz                                     | 2,063   | `8dea2a9329075a274a7acd6c96957cf07bee1a46066d7efd40d6d115b2c31b5b` |
| `@pixiv/types-vrmc-springbone-1.0`                        | 3.5.5   | MIT     | https://registry.npmjs.org/@pixiv/types-vrmc-springbone-1.0/-/types-vrmc-springbone-1.0-3.5.5.tgz                                               | 2,522   | `3b989402a2a5eecb8443caf3baa4b2433561a496f2c4c888966360c2330f773e` |
| `@pixiv/types-vrmc-springbone-extended-collider-1.0`      | 3.5.5   | MIT     | https://registry.npmjs.org/@pixiv/types-vrmc-springbone-extended-collider-1.0/-/types-vrmc-springbone-extended-collider-1.0-3.5.5.tgz           | 2,108   | `1266a570f747f6cd2395b176810508fd2c66d59a979da83cc6eb04b68d077f33` |
| `@pixiv/types-vrmc-vrm-1.0`                               | 3.5.5   | MIT     | https://registry.npmjs.org/@pixiv/types-vrmc-vrm-1.0/-/types-vrmc-vrm-1.0-3.5.5.tgz                                                             | 4,571   | `330fb026e39b765f164ac5e1dbabde62e4359e1cf102373f9405317a500a7a60` |
| `@pixiv/types-vrmc-vrm-animation-1.0`                     | 3.5.5   | MIT     | https://registry.npmjs.org/@pixiv/types-vrmc-vrm-animation-1.0/-/types-vrmc-vrm-animation-1.0-3.5.5.tgz                                         | 2,255   | `d1bfd948153ef9b6a3b81a6102829546e9a039c8264d14c23fc4977a4e017407` |

## Generated concept art

The Riko VRM (`apps/game/public/models/characters/vrm/riko.vrm`) and her radio prop are built by `asset-src/characters/concept-cast/` from concept art that the project owner generated with the image model `openai/gpt-image-2.5-flare` through the Vercel AI Gateway on 23 September 2026. The owner approved the look and cut the turnaround sheet into front, side and back views, each padded to a square 1024 × 1024 on the paper colour. The build uses the images as silhouettes and as paint projected onto the meshes; it downloads nothing. No other image generation was used: the face, hair and rig are drawn by the Blender scripts.

The committed copies are JPEG (quality 90 for the views, 80 for the sheets) under `asset-src/characters/concept-cast/ref/`.

| File              | What it is                                             | Source file (SHA-256 of the PNG)                                                                 | Bytes   | SHA-256                                                            |
| ----------------- | ------------------------------------------------------ | ------------------------------------------------------------------------------------------------ | ------- | ------------------------------------------------------------------ |
| `riko-front.jpg`  | Front view cut from the turnaround sheet               | `views/riko-gpt25flare-front.png`                                                                | 157,014 | `57caf16096f27afa60756c720f951c3932590568c2b666250e1995d03f9ab90b` |
| `riko-side.jpg`   | Side view (her left side)                              | `views/riko-gpt25flare-side.png`                                                                 | 139,703 | `51702ffc68687def7b7bb580e7677a3a588c528d7801aba468958c68fa0e1746` |
| `riko-back.jpg`   | Back view                                              | `views/riko-gpt25flare-back.png`                                                                 | 148,206 | `53079cc8b9e60a70ace1f52438656d852c873018f49d347d7e65e39a52d5f7aa` |
| `riko-sheet.jpg`  | The whole turnaround sheet, scaled to 1024 px wide     | `riko-gpt25flare.png` (`7f3aae9d9020a3d0a987a498d243a7221b4d09e8fc17f38559fe42b2cad65425`)       | 130,366 | `e765b08999be20be7c3ff09025d9ea3a5b52d641630997e9fa58a4fb43f4df87` |
| `radio-sheet.jpg` | The radio prop sheet, scaled to 1024 px wide           | `c-radio.png` (`5b59d075e4bfe598014d1bef274364e92ecf2b616946034a31d0e68bbf047b8a`)               | 153,866 | `2da1249b9de3bd87e7ea167f121e374aa1c07b492f14020bd1e1035b88e1f650` |

Prompts, as sent (model `openai/gpt-image-2.5-flare`, size `1536x1024`, one image each):

- Riko turnaround sheet: "Character turnaround sheet for a cozy slice-of-life anime film in the Japanese countryside, warm hand-painted Ghibli-like feel, cute stylized proportions (head about 1/5 of height, large expressive eyes, soft rounded shapes). Same character three times in neutral A-pose: front, side, back; full body; plain warm paper background; no text. Character: Riko, 17, short dark bob with a red hair clip, navy sailor school uniform with red ribbon, pleated skirt, white knee socks, brown loafers, canvas shoulder bag."
- Radio sheet: "Prop design sheet for a cozy anime film: an old 1960s Japanese transistor radio in warm cream and wood with a round speaker grille, tuning dial and leather carry strap, shown from front, side, back and top, plain warm paper background, no text."

## Models, textures and motion

### Quaternius Universal Animation Library 1 and 2 [Standard]

Downloaded by hand on 23 September 2026 from the pack pages below and kept outside the repository (default folder `~/Downloads/maple-assets/quaternius`, or `$MAPLE_UAL_DIR`). Licence: CC0 1.0 Universal, as stated in each zip's `License.txt` (https://creativecommons.org/publicdomain/zero/1.0/) and on https://quaternius.com/faq.html. Credit is not required.

| File                          | Page                                                     | Bytes      | SHA-256                                                            |
| ----------------------------- | -------------------------------------------------------- | ---------- | ------------------------------------------------------------------ |
| `UAL1-Standard.zip`           | https://quaternius.itch.io/universal-animation-library   | 15,904,933 | `cc73fc4e495b82958207316596317a3f40b9fa38065bde1027937452da537724` |
| `UAL2-Standard.zip`           | https://quaternius.itch.io/universal-animation-library-2 | 18,735,003 | `4008ea208a604773a2b2177d965f0f5d3195498b5bf838c3f5785d68e95f2a68` |
| ↳ `UAL1_Standard.glb` (in 1)  | `Unreal-Godot/`, no root motion                          | 7,618,436  | `69591853d817488edaa8fd9bf8fc1d821eaeaf789f8627b3cd23b41c4ed67997` |
| ↳ `UAL1_Standard_RM.glb`      | `Unreal-Godot/`, root motion (stride speed only)         | 7,620,504  | `be684571ed655a1b892c2c07e6e2aeca053b606c442d34004adaf1d944090d01` |
| ↳ `UAL2_Standard.glb` (in 2)  | `Unreal-Godot/`, no root motion                          | 8,091,444  | `8cee20ab1bc55130092447e810e26df22dd2803eccc54f52137a7d54d7ab88a8` |
| ↳ `UAL2_Standard_RM.glb`      | `Unreal-Godot/`, root motion (stride speed only)         | 8,095,936  | `814eee878f82934992d3ea746c539df25e981487109c591f5efbb8dd03286f99` |

Neither the zips nor the library GLBs are committed. `asset-src/characters/vrm-cast/retarget.mjs` reads them and writes only the retargeted, trimmed clips to `apps/game/public/models/characters/vrm/cast-clips.vrma` (358,196 bytes, 17 clips, 30 fps, key-reduced, quaternions as 16-bit integers). `clips.report.json` beside the script records the GLB hashes of each build.

Clips used (UAL name → game name): UAL1 `Idle_Loop` → idle (and the base of wave and stretch), `Idle_Talking_Loop` → chat, `Walk_Loop` → walk (and the legs of walk-carry and hurry), `Walk_Formal_Loop` → walk-formal, `Jog_Fwd_Loop` → upper body of hurry, `Sitting_Idle_Loop` → sit, `Sitting_Enter` → sit-enter, `Sitting_Exit` → sit-exit, `Interact` → board, `Pistol_Aim_Up` → arms of stretch; UAL2 `Idle_TalkingPhone_Loop` → check-phone, `Idle_FoldArms_Loop` → watch-train and shelter, `Walk_Carry_Loop` → arms of walk-carry, `Idle_Rail_Call` → arm of wave, `Yes` → nod-yes, `Idle_No_Loop` → shake-no, `Consume` → eat. The `_RM` files give the ground speed of `Walk_Loop`, `Walk_Formal_Loop` and `Walk_Carry_Loop`.

### Our own

The VRM test cast (`apps/game/public/models/characters/vrm/*.vrm`) is made by our own scripts from the Blender cast. It contains no downloaded meshes, textures or rigs.

The next downloads are listed, with URLs, sizes and licence locations, under "Files awaiting approval" in [anime characters](../docs/research/ANIME-CHARACTERS.md).
