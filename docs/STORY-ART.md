# Story artwork

The project uses two original generated illustrations created with the built-in image-generation tool. The tool did not expose a model selector, so these assets are not labelled as a verified GPT Image 2.5 output. These are raster illustrations and modelling references, not rigged 3D meshes.

- `apps/game/public/story/haru-emi.png`: welcome artwork and CSS-cropped dialogue portraits. Haru and Emi sit on a rural station bench with a notebook, spanner, and field recorder.
- `apps/game/public/story/character-reference.png`: lazily loaded character study, with front/back views and prop details.

The local procedural character models are authored in `apps/game/src/narrative/story-cast.js`; they follow the wardrobe and props in the artwork. Their current stylized geometry does not reproduce the illustration’s painterly face detail.

## Welcome illustration prompt

Original warm hand-painted gouache illustration with coloured-pencil detail and paper grain. A horizontal 3:2 frame, with cream negative space on the left third. On the right, Haru Morita, an active Japanese man aged sixty with salt-and-pepper hair, a navy railway cap and work jacket, and a tan shoulder satchel, sits on a rural autumn station bench beside his seventeen-year-old granddaughter Emi. She has a dark bob, a rust jacket, and a handheld field recorder. Haru holds a worn notebook and an old spanner. A cream-and-maroon local train and autumn village scenery sit softly in the background. Human warmth, ordinary useful clothing, no lettering, logos, or watermark.

## Character reference prompt

Use the welcome illustration as the exact character identity and material-style reference. Create an original character design reference sheet, warm hand-painted gouache and coloured pencil on ivory paper, matching faces and clothing. Wide 1536×1024 composition. Upper two thirds: four complete standing figures at equal scale—Haru front three-quarter, Haru back three-quarter, Emi front three-quarter, Emi back three-quarter—with clear separation and every foot in frame. Haru is sixty, active, with salt-and-pepper hair, a weathered face, navy work jacket with brass buttons and matching cap, slate trousers, scuffed brown leather shoes, tan canvas shoulder satchel, small dark cloth notebook, and old spanner. Emi is seventeen, with a dark chin-length bob and loose wisps, rust cotton jacket over a cream cable-knit sweater, loose charcoal trousers, practical canvas sneakers, khaki canvas bag, and handheld stereo field recorder. Natural proportions, fully clothed, no chibi. Lower third: detailed prop vignettes of the open notebook, worn spanner, recorder, satchel, and two paper railway tickets without readable text. Pale warm paper, gentle grounding shadows, no scenery, labels, lettering, or watermark. Preserve the faces and human warmth. This is a visual reference for later 3D modelling; do not depict wireframes or claim mesh output.
