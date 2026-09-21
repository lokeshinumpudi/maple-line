# First gameplay integration

Three short edits now play in the local game: tree rustle, sheltered roof rain and summer cicadas. They add 803,518 compressed bytes. The full 13-recording collection and its auditions remain outside the game bundle. These edits have technical checks; headphone/speaker listening and subjective loop review remain pending. This is not release approval or a claim of authentic Japanese train acoustics.

## Behavior

- Tree rustle follows forest density and wind strength. Winter reduces the level.
- Roof rain uses the train bus in Driver and Inside the train views. It stops in tunnels and clear weather. Its source was recorded in a road vehicle; it supplies a roof texture rather than a matched carriage recording.
- Tokyo cicadas replace the simple insect tone during clear summer conditions, with a lower daytime level than dusk. They stop in rain, snow, tunnels and areas with no forest. The source identifies a Tokyo location, not a species.
- Scenic train attenuation now falls toward zero with camera distance, allowing nearby nature to remain audible. Interior perspectives retain the train.
- Rail crossings retain their fractional position within each update. Their paired mechanical voices start at separate audio-clock offsets, with one update of presentation delay. Intervals over 120 ms discard missed impacts. Queued future rail events are cancelled on reversal, teleport, stop, significant brake changes and ambient-only story mode. Pause/mute clears history. This is not a timer-driven lookahead scheduler and does not promise uninterrupted rhythm during long stalls.
- Mute reaches exact zero with a 180 ms ramp. Restoring sound cancels the pending mute ramp before fading up. Narration ducking retains its existing behavior.

## Preparation and provenance

Run `python3 .agents/skills/maple-sound-engineering/scripts/prepare_game_beds.py` from the workspace root. It checks each source hash against the collection, trims and filters a mono excerpt, calculates a constant gain with headroom, encodes 44.1 kHz MP3 at 128 kbit/s, and measures the result. It requires FFmpeg and writes only these three assets and their manifest.

[Field recording metadata](../../apps/game/public/audio/field-recordings.json) contains exact source, licence, edit, hash, size and measurement records. [Player-facing credits](../../apps/game/public/audio/credits.html) name Joseph SARDIN's CC0 tree/roof recordings and xserra's CC BY 4.0 Tokyo cicadas, with changes and source links. Original source files remain unchanged.

`recordings.js` owns the 0.65-second overlap after browser decoding. The prepared files have only 10 ms edge fades, so they are not crossfaded twice. New retained mono buffers occupy about 9.2 MB at a 48 kHz playback context, excluding temporary decoder allocations. All seven recordings load only after Sound activation; successful buffers are reused, failures retain procedural fallback and can retry on a subsequent activation. Inactive loops still run at zero gain.

## Verification

Focused tests cover seasonal/weather gating, interior rain, attenuation, fractional axle offsets in both directions, queued event cancellation, delayed frames, teleport/pause history, finite mute endpoint, failed loads and successful-buffer reuse. The offline browser capture measures finite samples, peak level and exact silence after mute. Live browser checks cover activation and decoded recording state. The [offline render report](../../artifacts/localhost/game-control/field-sound-render-report.json) records all seven buffers ready, 44,923,348 retained PCM bytes at 44.1 kHz, no invalid samples, a 0.07534 sample peak and exact zero after the mute tail. The [16-second preview](../../artifacts/audio/maple-line-field-sound-preview.mp3) follows forest → summer → carriage rain → train → snow → mute. Its encoded output measures −38.10 LUFS and −22.72 dBTP. This quiet effects/ambience capture contains no narration and is not a final combined-programme loudness assessment.

The [live report](../../artifacts/localhost/game-control/field-sound-live-report.json) passed all six checks: seven recordings ready, interior roof rain, pause, resume, rain/insect suppression in snow, and final paused silence. The live context retained 48,896,160 bytes of decoded recordings. `pnpm check` passed all 13 tasks, including 332 game tests; the production build and formatting check also passed separately.

A technical pass cannot establish natural loop seams, voice intelligibility or fatigue on headphones. The train interior, air-release, door, horn, snow-footstep and crowd candidates are still references. They have not been promoted automatically into event sounds. Regional water emitters, a shared narration output bus, animation-phase wipers, inactive-loop suspension and separate mix controls remain future work.
