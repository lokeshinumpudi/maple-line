---
name: maple-sound-engineering
description: Research, source, design and verify Maple Line railway audio, including train mechanics, regional ambience, weather, spatial mixing and narration ducking. Use for sound assets or Web Audio changes in this game.
---

# Maple sound engineering

Resolve the workspace root three directories above this folder. Use [Maple Line development](../maple-line-dev/SKILL.md) for project commands. Start with the [sound research and implementation audit](../../../docs/SOUND-RESEARCH.md); it separates inspected code from proposed work. For DSP, scheduling or acoustic decisions, read the relevant section of the [engineering recipes](../../../docs/sound-research/engineering.md) and its original source.

## Follow the scene

Describe the intended audible change and the physical event that controls it. A motor follows power and speed; rail impacts follow distance and axle spacing; footsteps follow actual walking; a door sound follows observed door movement. AI decisions must not schedule braking, rail impacts or door events.

Preserve gesture-based activation from the Sound button or the checked start-screen sound choice, failed-recording fallback, bounded transients and disposal. `audio/sound-model.js` computes serializable mix targets; `audio/soundscape.js` owns audio nodes; `audio/recordings.js` owns shipped recording URLs and loop preparation; `main.js` supplies simulation, listener and region state. Keep Three.js objects out of the audio model and store.

Check these Maple-specific traps before adding layers:

- The current river distance model covers only the original valley. Add region emitters before promising water sound across the whole route.
- The current cab/tunnel treatment and camera listener are approximations. Do not apply camera-cut velocities to Doppler or silence the entire exterior because the train alone entered a tunnel.
- The 25 Hz update chooses targets; schedule rhythmic events on audio time. Crossings now carry fractions and play one update late at separate audio timestamps. Updates over 120 ms discard missed impacts. Preserve cancellation on teleport, reversal, pause and resume; do not mistake this short presentation delay for a timer-driven lookahead scheduler.
- `setTargetAtTime` takes a time constant, not a completed fade duration. Mute now reaches exactly zero in 180 ms; cancel its pending ramp before restoring sound. Make disposal tails explicit.
- Narration currently plays outside the soundscape graph. Use actual `maple:narration-state` playback events, including cancellation and inter-turn silence; read [narration ownership](../../../docs/NARRATION.md) before changing voices. A soundscape compressor does not limit the combined narration and effects output.
- Existing recordings are general ambience. Tokyo provenance supports the collected cicada recording's location, not a species identification. Snow footsteps are frozen crust, not falling snow.

## Source and prepare audio

Inspect the [local audition library](../../../assets/audio-library/index.html), [manifest](../../../assets/audio-library/manifest.json) and [asset notes](../../../docs/sound-research/asset-library.md) before downloading duplicates. Full candidates remain outside the game bundle. Three short environmental edits now ship locally; see the [integration record](../../../docs/sound-research/game-integration.md) for their pending listening review and reproducible preparation script.

Keep a primary source page, creator, exact licence version/link, download URL, acquisition date, file hash, actual format, edit recipe and intended role. Public MP3 previews are lossy sources; converting them to WAV does not recover a master. Preserve requested attribution. Do not infer a licence from a search snippet or another upload. Prefer CC0 or CC BY for this library; keep unresolved rights or geography visible in the candidate notes.

Preserve the acquired file. Produce separate auditions with documented trims and gain. Listen for speech, music, mic wind, clicks, compression artifacts and repetition. Distinguish steady beds, discrete actions and recordings with motion already present. Audition a loop seam repeatedly and in mono before marking it ready. Do not promote the full library into `public/`; ship selected edits and update `public/audio/credits.html` together.

Run the local audit after asset changes:

```sh
python3 .agents/skills/maple-sound-engineering/scripts/audit_library.py
```

It requires `ffmpeg` and `ffprobe`, validates hashes and decodes files, and measures auditions. It cannot establish perceptual quality or legal ownership. Use `--output /absolute/path/report.json` to retain results; it does not rewrite the manifest or source files.

## Verify the audible result

Compare a reproducible scene before and after at the same volume, speed, camera and weather. Use the [scenario matrix](../../../docs/sound-research/engineering.md#verification) for affected behavior. Check silence after mute, failed fetch/decode, narration interruptions, hidden-tab resume, reverse travel, tunnel portals and camera changes when relevant.

Measure the final mix as well as individual clips: finite samples, sample and true peaks, LUFS over an identified capture, transient counts and decoded memory. A compressor is not proof against clipping, and a small MP3 is not small decoded PCM. Preserve quiet regions; do not normalize every sound to the same perceived foreground level.

Run the project checks for source changes and inspect the dedicated browser for runtime changes. Report measured results separately from headphone/speaker listening and browser coverage. Mark unperformed listening or platform tests explicitly. Update the research only with newly verified findings; do not convert tuning suggestions into universal requirements.
