# Express train tuning

Implemented on 2026-09-21 after the request for faster running, quicker acceleration and matching electric-train sound.

Open-line automatic cruise is 120 km/h, story travel is 100 km/h, and the physical top speed is 160 km/h. The director's cautious, relaxed and cruise targets are 60, 90 and 120 km/h. Its input accepts speeds through 160 km/h and no longer treats every speed above 60 as a reason to slow down. Local bridge, tunnel, mountain and wetland restrictions remain. Automatic driving anticipates distant restrictions without the former 1,000 m cutoff, including snow on descending track.

Full-power traction is 1.65 m/s² before resistance and grade, with a 0.25-second actuator time constant. Service and emergency brake strengths are 1.4 and 2.1 m/s² before adhesion. On level dry track, the simulation reaches 60 km/h in 10.83 seconds and 120 km/h in 22.68 seconds. Braking from 60 km/h takes approximately 95 m dry, 119 m in rain and 151 m in snow. These are game tuning measurements, not real railway operating guidance.

The synthesized motor body and triangle-wave traction tone rise with speed. Actual power controls traction loudness, so coasting removes the drive tone while leaving rolling sound. Air rush grows through the full speed range and is quieter inside. Axle impacts retain distance-based timing in either direction; the discontinuity allowance covers a normal 120 ms update at top speed. Per-car impact strength decays geometrically, including the fourth and fifth carriages.

## Verification

- `pnpm check`: all 13 tasks passed, including 369 game tests and 23 director tests. The existing large JavaScript chunk warning remains.
- Tests cover acceleration/top speed, weather and emergency braking, station stops from 120 km/h in snow, downhill bridge approaches in both directions and three weather conditions, repeated terminal reversals, door interlocks, speed-sensitive sound and axle timing at 160 km/h.
- Dedicated Chrome Agent ran the train above 110 km/h with the live audio context running, the 120 km/h limit displayed, and motor, rolling and air-rush mix targets present.
- A 24-second stereo 48 kHz OfflineAudioContext render exercised a speed sweep, coasting, tunnel, braking and mute. Every sample was finite. Sample peak was −16.95 dBFS, FFmpeg true peak was −16.9 dBFS, and integrated loudness was −27.2 LUFS. Output after 22.3 seconds was exactly zero following mute at 22 seconds.

The [sound preview](../artifacts/audio/express-train-preview.wav) uses the procedural graph without environmental recordings or narration. Its 12-second speed sweep tests the sound range; it does not represent the measured acceleration time. Random noise makes each render differ slightly. It is not a headphone listening study or a combined narration loudness measurement. No claim is made that the sound reproduces a particular Shinkansen or other named train.
