# Maple Line sound research

Research date: 21 September 2026. Scope: the existing browser railway game, its environmental recordings and optional spoken story. The initial pass added research, a project skill and a local audition library. The subsequent [game integration](sound-research/game-integration.md) adds three short environmental edits and changes rail timing, attenuation and mute behavior. The source audit below records the baseline; it is not the current implementation checklist.

The next audible improvement should come from **train texture and context**, followed by **regional ambience and a clearer narration mix**. The game already has reactive procedural audio; adding more simultaneous noise would conceal the quiet details that make each stop different.

## Read or listen

- [Engineering recipes and verification](sound-research/engineering.md): train layering, scheduling, spatial sound, weather, loop editing, mix targets and performance.
- [Audio library](../assets/audio-library/index.html): local players for each short audition, with full source recordings available separately.
- [Asset notes](sound-research/asset-library.md) and [machine-readable manifest](../assets/audio-library/manifest.json): provenance, licences, edits, measured file properties and remaining review.
- [Reading record](sound-research/sources.md): primary references, sections read and limits of their application.
- [Maple sound engineering skill](../.agents/skills/maple-sound-engineering/SKILL.md): instructions for subsequent audio work.

## Baseline code inspection before integration

This is a source inspection, not a new listening certification. Recheck the named modules before implementing changes; the game is under active development.

| Owner                                              | Implemented behavior                                                                                                                      | Limit found in this inspection                                                                                                                       |
| -------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/game/src/audio/sound-model.js`               | Speed/power/brake mix; cab filtering; train, water and people attenuation; rain/snow/season targets; narration duck                       | Artistic gain curves, not measured acoustic propagation. Exterior train gain retains a 0.18 floor at arbitrary distance.                             |
| `apps/game/src/audio/soundscape.js`                | 13 procedural loops, four optional recorded loops; rail/door/brake/wiper/bird/footstep events; stereo panning; train reverb; compressor   | Train motion remains synthetic. Every enabled loop continues running even at zero gain. A 48-source transient cap drops new events without priority. |
| `apps/game/src/audio/recordings.js`                | Four local MP3s; 0.65 s PCM overlap at loop boundaries                                                                                    | Loop edits are shared across different material; a click-free splice can still repeat recognizably or swell.                                         |
| `apps/game/src/main.js`                            | Audio control updates at approximately 25 Hz; camera listener; nearby people; river distance; local weather; gesture start; sound credits | River source is clamped to z −900…1350. No route-wide acoustic zone graph. Train tunnel state also changes the listener's exterior mix.              |
| `apps/game/src/narrative/` and `docs/NARRATION.md` | Separate optional narration playback; actual speech events lower environmental sound                                                      | Narration is outside the soundscape compressor and master. There is no single measured final mix bus for both.                                       |
| `apps/game/public/audio/`                          | Forest, river, rain and people, about 1.7 MB compressed                                                                                   | Forest source is Australian; people source is a generic indoor crowd. Neither establishes Japanese species or local conversation.                    |

The existing tests cover mix targets, rail-event counts, pan direction and PCM boundary handling. Earlier offline and live checks are in `artifacts/localhost/game-control/sound-render-report.json` and `sound-live-report.json`. Those reports cover their recorded revision and scenarios; this research does not establish that the latest combined game has passed another listening review.

## Findings that change the design

**Separate rolling from traction.** A Japanese conventional-rail study attributes rolling noise to wheel/rail roughness exciting vibration, with track and vehicle characteristics affecting the result. That supports separate rolling, rail-impact and motor layers rather than one engine loop. The paper is acoustic evidence, not a sound signature for Maple's fictional train. [Toshiki Kitagawa, RTRI, 2009](https://www.jstage.jst.go.jp/article/rtriqr/50/1/50_1_32/_article).

**Keep rhythm independent of graphics.** Distance-based rail crossings are already the right control input, but their sounds currently begin together at the next update. Use audio-clock scheduling to spread them at their actual offsets. A short lookahead must remain cancellable during a stop or reversal. [Chris Wilson's scheduling explanation](https://web.dev/articles/audio-scheduling).

**Make winter quieter through context.** Fresh porous snow absorbs sound; an icy surface can reflect it. The collected frozen-crust footsteps therefore serve walking events, while snowfall should mainly change exposure, wind and the surrounding mix. A continuous crunchy snow loop would misrepresent the scene. [NSIDC, Snow and sound](https://nsidc.org/learn/parts-cryosphere/snow/science-snow#snow-and-sound).

**Keep broad ambience separate from point sounds.** A stereo forest bed establishes the setting; a particular bird or door can have a source position. Existing left/right panning cannot establish reliable height or front/back location. Try a small number of mono HRTF emitters only where localization helps, then compare speakers and headphones. [FMOD spatialization discussion](https://www.fmod.com/docs/2.03/studio/advanced-topics.html#spatialization-options).

**Measure memory after decoding.** AudioBuffer uses 32-bit float PCM. A proposed 30-second stereo clip at 48 kHz occupies 11.52 MB before graph and temporary-buffer overhead, regardless of MP3 size. Thirteen such clips would be about 150 MB. Load a small region set, share buffers, and retain the current synthetic fallback. [W3C AudioBuffer definition](https://www.w3.org/TR/2021/REC-webaudio-20210617/#AudioBuffer).

**Give players control over speech and surroundings.** Separate effects/ambience/voice levels, a mono option and retained text cues are useful next controls inside the existing Options panel. They are proposals, not current settings. [Xbox accessibility audio guidance](https://learn.microsoft.com/en-us/xbox/accessibility/xbox-accessibility-guidelines/105).

## Recommended implementation order

| Order | Work                                                                                      | Observable acceptance condition                                                                                                                |
| ----- | ----------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| 1     | Audition and edit train rolling/rattle, air releases and door mechanism candidates        | Stationary, coast, powered acceleration and braking remain audibly distinct. No voices or foreign warning sequence accidentally enters a loop. |
| 2     | Schedule axle impacts on audio time and synchronize wipers/doors to their animation phase | Rhythm remains regular with a delayed visual frame; pause, teleport and reversal produce no stale impact burst.                                |
| 3     | Add route-owned water/forest/platform emitters and soft zone boundaries                   | Water follows visible regional rivers; empty platforms do not speak; wind/rain respond to shelter.                                             |
| 4     | Split ambience, train, alerts and voice gain ownership; refine speech ducking             | Voice stays understandable without removing every train cue. The bridge's authored eight-second listening pause restores the environment.      |
| 5     | Add summer cicadas and surface-specific footsteps from selected edits                     | Seasonal insects do not play in snow or tunnels; footsteps require an actual moving person on the matching surface.                            |
| 6     | Profile inactive loops and decoded-memory cache; consider selective HRTF                  | Report source counts, PCM memory and observed browser behavior before and after. No middleware migration is assumed.                           |

## Collection policy and remaining gaps

The library contains 13 new recordings with 13 short auditions. Eleven are CC0; two are CC BY 4.0 and carry attribution. Publisher MP3 downloads and Freesound public HQ previews are identified separately. A preview is not a lossless master. Three candidates have gameplay edits; all still need human listening before release. Other candidates still need event or loop editing.

The collected Tokyo cicadas have a recordist-specified location and date. The European train recordings are texture/reference candidates, not authentic Japanese rolling-stock captures. Intelligible French crowd speech, station jingles and recorded pass-by motion need particular care. No railway sound logo or commercially released music was collected.

Still missing: a matched Japanese electric-train set recorded at known speeds/load states; isolated near-field door opening/closing without beeps; clean bogie impacts; identified Japanese bird calls with usable licences; consented Japanese background conversation; and a measured tunnel impulse response appropriate to the game. These gaps should guide the next recording or sourcing session rather than be hidden with arbitrary pitch changes.
