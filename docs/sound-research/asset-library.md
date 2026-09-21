# Collected audio and editing status

Open the [listening page](../../assets/audio-library/index.html) to play 13 short auditions. The [manifest](../../assets/audio-library/manifest.json) records creators, source and licence URLs, acquisition date, hashes, media properties, measured audition levels and editing parameters. Sources and auditions are local. The game loads its original four recordings plus three separate short edits described in the [integration record](game-integration.md).

## New collection

| ID               | Intended use                           | Provenance and editorial limit                                                                                                                      |
| ---------------- | -------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `train-interior` | Rolling and carriage texture reference | Vlatko Blažek, CC BY 4.0. Open window, unknown train type and speed; public HQ preview, not original 96 kHz WAV. Requested creator credit retained. |
| `air-brake`      | Pneumatic release reference            | totalcult, CC0. Platform ambience around a stationary train; individual releases still need locating and trimming.                                  |
| `train-door`     | Door mechanism and timing reference    | Joseph SARDIN & Axeline T., CC0. French TER door sequence includes beeps. Isolate mechanism before matching game animation.                         |
| `train-horn`     | Distant train cue                      | Joseph SARDIN, CC0. Stationary construction train about 150 m away. Do not describe as a close Japanese horn.                                       |
| `train-pass`     | Passing-service reference              | Joseph SARDIN & Axeline T., CC0. Eight-car TER with recorded motion; no additional Doppler until a scene-specific design is chosen.                 |
| `forest-wind`    | Foliage bed candidate                  | Joseph SARDIN, CC0. Rambouillet, France; geography and possible incidental wildlife remain relevant.                                                |
| `grass-wind`     | Meadow exposure candidate              | Joseph SARDIN, CC0. Wind in tall grass; separate from tree rustle.                                                                                  |
| `river-detail`   | Close flowing-water candidate          | Joseph SARDIN, CC0. Small Stream #4, ORTF stereo; specific location unstated. Additional detail for nearby water.                                   |
| `rain-roof`      | Sheltered roof texture                 | Joseph SARDIN, CC0. Recorded in a road vehicle, useful for material comparison.                                                                     |
| `rain-glass`     | Rain on a window                       | Joseph SARDIN, CC0. Road-vehicle windshield, not an actual train cab.                                                                               |
| `cicadas-tokyo`  | Summer evening ambience                | xserra, CC BY 4.0. Recordist specifies Tokyo park, 18 August 2013. Species not identified; source is a public HQ preview.                           |
| `snow-steps`     | Crust-snow footstep editing            | xo9rh11o3w, formerly niwki, CC0. Walking on snow frozen to ice; public HQ preview. Not a snowfall bed.                                              |
| `outdoor-people` | Outdoor crowd reference                | Joseph SARDIN, CC0. About 100 French speakers. Not ready for a Japanese platform; a low-pass filter alone cannot establish suitability.             |

All 13 source candidates have `listening_review: pending` and `loop_ready: false`. Tree rustle, roof rain and cicadas also have separate gameplay edits with the same pending listening status; the audition files themselves are not copied into gameplay. The acquisition and technical checks do not certify subjective sound quality, speech content or final suitability. The retained full recordings allow later selection beyond the initial short audition. For one-shot candidates, the audition may contain multiple actions or context; it is not automatically an isolated playable effect.

## Preparation and verification

The source files are unchanged publisher MP3 downloads or Freesound HQ MP3 previews. Auditions use a documented start offset and at most 24 seconds, constant gain, short edge fades, 48 kHz stereo and 192 kbit/s MP3 encoding. Mono sources are upmixed only for consistent audition playback; future positional effects should use deliberate mono edits.

Preparation measures the selected segment and chooses the smallest gain allowed by a −24 LUFS reference, −4 dBTP peak guard and maximum +12 dB boost. This preserves dynamics and may leave a transient-rich clip quieter than the reference. Each encoded audition is measured again. These are preview settings, not the game's final mix targets. No denoising, species relabelling, time stretching or loop certification was performed.

Run:

```sh
python3 .agents/skills/maple-sound-engineering/scripts/audit_library.py \
  --output assets/audio-library/verification.json
```

This checks source/audition hashes, required metadata, decoding and audition true-peak headroom. It fails for a changed file rather than silently replacing its recorded hash. FFmpeg and ffprobe must be on PATH. It does not download anything, update credits or modify the audio.

Recorded checks on 21 September 2026: all 26 source and audition files passed hash and full-file decoding checks; all 13 auditions passed the peak-headroom guard. A deliberately changed manifest hash was rejected. The [browser check](../../assets/audio-library/browser-verification.json) verified that all 13 previews start and advance in dedicated Chrome Agent 153 with no media or page errors. Playback checks ran at zero volume and do not replace a listening review. The Codex in-app browser rendered the page but crashed when playback started.

To reproduce an audition, use the manifest's `edit` start, duration and filter chain with the listed output encoding. Keep future edits separate, record their new hashes and re-audition. Promote only selected approved edits into `apps/game/public/audio/`; update `recordings.js`, runtime gain and player-facing credits together.

## Existing game recordings

The existing forest, river, rain and people files remain in `apps/game/public/audio/`, with [player-facing credits](../../apps/game/public/audio/credits.html). Their sources are Thimras' park ambience (CC0), erxer1's flowing water (CC BY 3.0), Ylmir's rain (CC0) and Breviceps' room crowd (CC0). This collection does not duplicate or replace those four files.

## Future acquisition brief

Prioritize a coherent electric-train recording set over a large unrelated pack. Request microphone perspective, train type, speed/load, surface, door state, sample format, take identifiers and release rights. Capture steady states long enough to edit loops, plus separate transitions. Keep raw originals and avoid automatic recording gain when dynamics are part of the intended sound.

For Japan-specific detail, source identified local birds by season and location, and obtain background conversation recorded for this purpose. A familiar station chime can be a protected composition or sound logo; create an original cue instead of assuming a field recording's upload licence settles those rights. The collection deliberately omits railway jingles and commercial songs.

The first water candidate, [Watercourse 5.2](https://bigsoundbank.com/watercourse-5-2-s3137.html), was not retained: measured peaks were high relative to its background level across several excerpts. Small Stream #4 offered a more even starting point for this collection. This is a measurement-based selection, not a completed listening review.
