---
name: maple-story-video
description: Write, voice, dub, render and cut Maple Line drama episodes and trailers. Covers episode scripts, dialogue that reads with the sound off, Sarvam voices in Indian languages, dubbing with captions in another language, deterministic episode renders and trailer edits from those renders. Use when changing The 17:42 or another episode, making a video to share, or reviewing a render. Do not use for character modelling or motion (use maple-characters) or the older Haru and Emi notebook story (see maple-line-dev).
---

# Maple Line story videos

Resolve the repository root three directories above this skill. Read [Maple Line development](../maple-line-dev/SKILL.md) first. Current references: `docs/VIDEO.md` (render script), `docs/NARRATION.md` and `docs/drama/README.md` (voices and languages), `docs/drama/` (series notes), `docs/STORY-BIBLE.md`. Runbook chapters 43–46 and 52–57 hold the longer lessons.

## Where an episode lives

- **Scripts**: one module per series in `apps/game/src/drama/series/`. A series has episodes; an episode has scenes; a scene has beats; a beat has a shot, acting cues (mood, intent) and dialogue lines. Search the series module for `say(` and `narrate(` to see the line helpers and which translations they carry.
- **Runner and stage**: the episode runner, drama stage marks, roles, props and screenplay helpers sit beside it in `apps/game/src/drama/`. Line ids are `scene/beat/line`; voice clips, captions and timelines all key on them.
- **Cast**: the drama cast ids map to VRM characters (see [maple-characters](../maple-characters/SKILL.md)). A story name and a cast id can differ.

## Write scenes people can follow

The first version of The 17:42 was narrator one-liners with a timetable sum as the conflict. Viewers called it confusing. What fixed it:

- Give each character one want, and put one real obstacle in the way.
- Each line answers the line before it and moves the plan on. A beat holds a line and its reply.
- Narration only sets place and time; a character's advice does the job a narrator line used to.
- End on something small that pays off the want.
- Write for what the models show. A character meant as a grandfather read as a young man, so the story changed to fit the model.
- Test with the sound off, on someone who has not read the script. The captions must carry the story.
- Story videos end on the story: title, one line and where to play. Tools, agents and tech credits go in the post or a blog, never in the video.

## Voices and languages

- Voices come from Sarvam (`bulbul:v3`, 11 Indian languages) through the director server; the key stays in the root `.env`, never in browser code or a commit. Check the provider's current model list before assuming a newer model is available to this account.
- Hand-written translations beat machine ones. The series module carries Telugu and Hindi next to each English line; add a language the same way and make the build fail on a missing line rather than falling back to English.
- `voice:episode` (a `package.json` script) generates clips and writes a voice manifest per episode and language, including the lip-sync mouth curve. Its `--mouth-only` flag rebuilds mouth curves from existing clips with no new voice calls. Each run costs money for missing clips; list first, then generate.
- **Dubbing**: to hear one language and read another, render with `--subtitles source` (in code, `createManifestVoice(manifest, { subtitles: 'source' })`). Every language has its own timings: the same line started at 27.7 s in English and 31.2 s in Hindi, and the Hindi trailer from the same shots runs 102.9 s against 91.5 s. Recompute anything cut from a dubbed render from that render's timeline.

## Render an episode

`render:episode` (a `package.json` script; `--help` lists options) plays the episode in a headless browser on a fixed clock and writes an MP4, a poster and a timeline JSON under `media/renders/<language>/`, which git ignores. In render mode the game only advances when the script steps it, so anything on screen that animates over time must use the frame `dt`, never wall-clock timers or CSS transitions.

Quality rules learned from grainy trailers:

- Skin noise had three causes at once: the film-grain shader, a lossy JPEG per frame, and a low bitrate cap. Render mode turns grain off, frames are PNG, and the master is CRF 18 capped at 12 Mbit/s. Make share copies from the master (CRF about 21, capped near 5 Mbit/s) instead of rendering twice.
- A render can fail without stopping a batch (a network drop once left only a silent video stream). Check every output's date, duration and audio stream before using it, and retry once in scripts.

## Cut a trailer

Trailers are HyperFrames projects kept outside the repository (the user's videos folder). Use the `general-video` HyperFrames workflow for the edit itself.

1. Pick shots that start and end on lines, using the episode timelines. Write the cut list in one place and derive the dubbed version from its own timelines.
2. Pre-cut each shot into its own short file at high quality before assembly. Loading many seeks into full-length episodes made the editor time out.
3. Place video on two tracks and sound on two, with short fades, then a designed end card (title, one line, the play link).
4. Run the project check, render the master, make a share copy, and build a contact sheet with one frame per shot. Look at the sheet before sending: an old costume or a missing shot shows at once.

## Verify

Run the `format` and `check` scripts from `package.json` after code changes. For a changed episode, render it, watch it muted once, and step through the lines that changed. Report durations, file sizes and what was watched; say which translations have not had a native speaker's review.
