# Episode videos

A drama episode can be rendered to an MP4 that plays in WhatsApp, iMessage and the iPhone Photos app. The render script plays the episode in a headless browser one fixed frame at a time, so the video is smooth however slow the machine is, and writes the file, a poster image and a timeline of when each line is spoken.

```sh
pnpm render:episode --episode the-1742-1 --aspect 9:16
pnpm render:episode --episode the-1742-3 --aspect 9:16,16:9
pnpm render:episode --help
```

Outputs go to `media/renders/`, which git ignores:

| File                              | What it is                                                                         |
| --------------------------------- | ---------------------------------------------------------------------------------- |
| `<episode-id>-9x16.mp4`           | H.264 High, yuv420p (limited range), 30 fps, AAC stereo, `+faststart`.             |
| `<episode-id>-9x16-poster.jpg`    | A frame with the dialogue hidden and the series and episode title set over it.     |
| `<episode-id>-9x16.timeline.json` | Scene, beat and line start times, the audio clips that were mixed, the runner log. |

`--episode` takes an episode id (`the-1742-e1-two-minutes`), a short alias (`the-1742-1`) or a number. `--episode-file draft.json` renders a draft episode in the same format that `validate_episode` accepts.

## Options

| Option                          | Default                     | Notes                                                                                              |
| ------------------------------- | --------------------------- | -------------------------------------------------------------------------------------------------- |
| `--aspect`                      | `16:9`                      | `16:9` is 1920×1080; `9:16` is 1080×1920. Comma-separate to render both in one run.                |
| `--fps`                         | `30`                        | 24, 25, 30 or 60.                                                                                  |
| `--audio`                       | none (silent track)         | One sound file played from 0 s, or an audio manifest (below).                                      |
| `--poster-beat` / `--poster-at` | first portrait beat + 2.5 s | A beat id such as `momiji-platform/2`, or a video time in seconds.                                 |
| `--port` / `--url`              | `4373`                      | The script starts its own Vite server on this port; `--url` uses a server that is already running. |
| `--gl`                          | `metal` on macOS            | `swiftshader` (software WebGL, slow but works anywhere), `egl`, or `default`.                      |
| `--crf`                         | `22`                        | x264 quality; the bitrate is also capped at 6 Mbit/s so a 90-second episode stays near 60 MB.      |
| `--timeline-only`               | off                         | Simulates the episode and writes only the timeline JSON, for voice work.                           |

The game's own dev port (4173) is not used, so a render can run while `pnpm dev` is open.

## How it works

1. The page is opened with `?render=1&fps=30&aspect=9:16`. In render mode the game does not start its animation-frame loop. It disables the AI director and minds requests and sound, fixes the pixel ratio at one output pixel per CSS pixel (the adaptive resolution drop is off), uses the full film finish, and replaces `Math.random` with a seeded generator so repeated renders match.
2. `window.__mapleRender.step()` advances a render clock by exactly 1/fps seconds and runs one game frame with it. Train motion, people, weather, the director camera, the episode runner and caption timers all run from that frame time. Caption fades are set from the render clock each frame instead of CSS transitions, which would run on the wall clock and finish between two captured frames.
3. After each step the script captures the page with the Chrome DevTools screenshot command and pipes the JPEG to ffmpeg. A second ffmpeg pass mixes the audio clips (or silence) and copies the video stream.

Captions are captured as page composites, not drawn into the WebGL canvas. The screenshot contains exactly what a viewer of the game sees, using the same caption styles and fonts, and no second caption renderer has to be kept in step with the game. The cost is a screenshot per frame; on an Apple M4 Pro with Metal the whole loop runs at about 15–18 frames per second, so an 88-second episode took 114 s (16:9) and 156 s (9:16).

In render mode the page hides the HUD and uses caption sizes meant for a phone watching a 1080-pixel video. The vertical format also:

- drops the 2.39:1 letterbox, which would leave a small band of picture inside a 9:16 frame;
- raises subtitles above the bottom sixth of the frame, where messaging apps draw their controls;
- uses the director's `subject` portrait framing, which widens close shots much less than the phone game does, so a person stays large in a tall frame.

Instead of the in-game "end" card, a rendered video holds the last shot for 1.5 s, fades to black and shows a 5-second end card with the series title, episode, the next-episode line and the Maple Line credit.

## Timeline and audio manifest

The timeline JSON lists every beat and line with `t`, the time in seconds from the first video frame when that beat or line first appears on screen:

```json
{
  "version": 1,
  "kind": "maple-line-render-timeline",
  "episode": {
    "id": "the-1742-e1-two-minutes",
    "series": "The 17:42",
    "number": 1,
    "title": "Two Minutes"
  },
  "video": { "fps": 30, "width": 1080, "height": 1920, "frames": 2631, "durationSeconds": 87.7 },
  "scenes": [
    {
      "t": 0,
      "id": "momiji-platform",
      "heading": "EXT. MOMIJI STATION — SUNSET, 16:51",
      "index": 0
    }
  ],
  "beats": [
    {
      "t": 11.5,
      "id": "momiji-platform/2",
      "scene": "momiji-platform",
      "index": 1,
      "shot": "portrait"
    }
  ],
  "lines": [
    {
      "t": 12.533,
      "id": "momiji-platform/2/1",
      "scene": "momiji-platform",
      "beat": 2,
      "cast": "riko",
      "speaker": "Riko",
      "text": "Seventeen forty-two in. Seventeen forty out.",
      "seconds": 3.21,
      "phone": false
    }
  ],
  "endedAt": 81.167
}
```

Line ids are `<scene id>/<beat number>/<line number>`, both numbers counted from 1. They depend only on the episode data, so a voice file can be made for a line before any video exists. Times depend on how long the train takes to stop, so they are known only after a render (or a `--timeline-only` run).

An audio manifest places sound files on that timeline:

```json
{
  "version": 1,
  "clips": [
    { "line": "momiji-platform/2/1", "file": "voice/riko-01.wav" },
    { "line": "momiji-platform/3/2", "file": "voice/riko-02.wav", "offset": 0.1, "gain": 0.9 },
    { "t": 0, "file": "music/evening.wav", "gain": 0.35 }
  ]
}
```

- Each clip needs `file` and exactly one of `line` (a line id) or `t` (seconds from the first frame).
- `offset` (−60 to 60 s) moves the clip from that time; `gain` (0–4, default 1) scales its volume.
- `file` paths are relative to the manifest. Any format ffmpeg reads works; clips are resampled to 48 kHz stereo.
- A bare array of clips is accepted too: `[{ "t": 6.2, "file": "a.wav" }]`.
- A line clip whose line was not played is listed as a warning and skipped. A clip that starts after the video ends is skipped; a clip that runs past the end is cut off.

Clips are delayed to their start with ffmpeg `adelay`, mixed with `amix` without level normalization, and padded or trimmed to the video length. `apps/game/src/drama/render-timeline.js` holds the validation and filter-graph code with unit tests.

## Limits

- The capture needs a working WebGL context. On macOS headless Chromium uses the GPU through ANGLE Metal; `--gl swiftshader` works without a GPU but is many times slower.
- The game's own sound (train, ambience, crossing bells) is not recorded. Only the clips from `--audio` are in the video.
- Frames are captured as JPEG at quality 92 before H.264 encoding. That loss is well below what messaging apps apply when they recompress a video.
- A shot is still planned by the director camera and can be partly blocked by a shelter roof or a wall; the render shows the same frame the game would.
- Render mode and `window.__mapleRender` are available in any build opened with `?render=1`. They are for local capture only and change nothing in normal play.
