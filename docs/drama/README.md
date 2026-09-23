# Writing episodes

Maple Line can perform short dramas inside the running game. An episode is data: a cast, scenes and beats. The game stages it with the same systems a player uses — the director camera, the NPC minds, auto drive, doors, weather and time of day — so a writer or an agent can work on story without touching code.

The first series is [_The 17:42_](THE-1742.md). Tomorrow Grandma Fusae moves to a care home in the city; tonight she wants to hear Grandpa's old radio one last time, at home up the valley. Riko has it, freshly repaired. The last bus up the hill leaves Aonuma at 17:40, and Riko's train gets in at 17:42. Mr. Sato, on the same train, asks his daughter Aoi, who drives that bus, to wait. The series stays on the passenger side of the timetable problem in Haru's campaign and does not use or change the campaign's characters, dialogue or saves.

The story is written to read with the sound off: every key time is on screen as words (the timetable insert, captions, the clock), and the want is set up in two plain on-screen lines before anyone speaks.

To watch, open **Places** and choose an episode under **Watch a short drama**. Pausing the ride pauses the episode.

## How an episode is built

| Part  | What it holds                                                                                                                                                                                                                                                                                                                                                                                                  |
| ----- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Cast  | Named parts with a short note and an optional `voice` (a part in the shared voice cast). Parts are not tied to a figure until a scene casts them.                                                                                                                                                                                                                                                              |
| Scene | A heading, optional scene settings (`location` with an `offset` in metres, `timeOfDay`, `weather`, `speedKmh`, `clock` as `HH:MM` for the station clocks), an optional `stopAt` station where auto drive stops the train at the platform or `holdAt` level crossing where it stops short of the road, `actors` mapping parts to characters in the world, and optional `marks` that stand parts on stage marks. |
| Beat  | One shot, optional place card (`caption`, `subtitle`), an on-screen `line`, `dialogue`, a minimum `hold`, an optional `waitFor` (`stopped` or `doors-closed`), and timed `cues`.                                                                                                                                                                                                                               |
| Line  | A cast part (or a free `speaker` label) and text up to 160 characters; `phone: true` sets it in italics; optional `emotion` (a delivery such as `dry`) and `translations` (`{ "te-IN": "…" }`).                                                                                                                                                                                                                |
| Cue   | Seconds `after` the beat starts and one action: an acting note (`direct` with mood, intent and hold), `doors`, a world `event`, `weather`, `release` to let the train leave, `bus` (`{ state: 'wait' \| 'leave' \| 'arrive' }`) for the Aonuma village bus, or `move` (`{ cast, to: mark, pace: 'walk' \| 'run' }`).                                                                                           |

Shot subjects can be a cast part (`{ "cast": "riko" }`), a level crossing (`{ "crossing": "sakuragawa-farm-road" }`) or a prop (`{ "prop": "momiji-timetable" }`, usually with an `insert` shot) as well as the director's own subjects. Props are listed in `apps/game/src/drama/drama-props.js`: the Momiji and Aonuma timetables and clocks, the bus from the platform end, its front door, and a wide of the stop from behind. Dialogue is timed to reading speed (about 180 words a minute, 1.8–7 seconds a line), so a beat lasts as long as its lines need. The runner waits for the train only where a beat says so, and gives up after 45 seconds with a note in the log.

### Stage marks and fixed roles

Casting uses characters the world already simulates, and a scene can take one of them off the simulation with `marks` (`apps/game/src/drama/drama-stage.js`). A mark is a door of the front car (placed there means aboard and hidden until a `move` steps them out; arriving there boards), a seat in the front car (seated, moving with the train), a station-local spot, or a spot at the bus (the doorway, or aboard). The person's model follows the staged figure the way it follows a simulated one, so Riko is the Momiji student `commuter-2` in every episode: she boards the front car at Momiji, sits in it in Episode 2 and steps off it at Aonuma in Episode 3.

`apps/game/src/drama/drama-roles.js` lists fixed named roles with the look each should wear: `riko`, `fusae` (grey bun, round glasses, patterned cardigan, blue dress) and `aoi` (young bus driver, teal and cream uniform and cap, ponytail). Fusae and Aoi have no simulated person; their VRMs are built from profiles of the same names in `asset-src/characters/vrm-cast` and are drawn only while an episode stands them on a mark. A crowd kit that dresses named roles can map these ids.

Unstaged parts are played by the simulated people. Momiji has commuters, residents and a newspaper reader; each regional station has eight residents (for example `aonuma-resident-5`, the kiosk vendor). Regional residents exist only while their station area is loaded, so cast them in scenes set at that station. If a cast figure is not on screen when its shot starts, the runner uses a platform or orbit shot instead and writes that in the log.

## Working with the tools

Agents use WebMCP tools on the running development build:

1. `get_drama_catalog` lists every allowed value: stations, places, crossings, characters currently in the world with their roles, shot types, moods, intents, events, times of day and limits.
2. `get_episode_script` returns an existing episode as data to copy or as a screenplay to read.
3. `validate_episode` checks a draft and returns its planned length and screenplay, or the first problem with its exact path (for example `episode.scenes[0].beats[2].cues[1].direct.mood must be one of: …`).
4. `play_episode` performs a draft once, or a saved or built-in episode by id. `get_episode_state` reports the scene, beat, what the runner is waiting for, and a log of substitutions.
5. `save_episode` keeps a draft in this browser's library (24 episodes, 64 KB each); `list_episodes` shows built-in and saved episodes.
6. `get_episode_share_link` returns a link that opens an episode for someone else. It validates the episode first.

A useful loop is: read the catalog, write a scene, validate, play it, read the log and look at the frame, then adjust. The director tools (`direct_shot`, `play_sequence`) and NPC tools (`direct_npc`, `get_npc_minds`) remain available for trying a single shot or acting note before writing it into a beat.

## Staging patterns

- **An arrival:** give the scene a `stopAt`, put the train a few hundred metres back with `location` and a negative `offset`, show a `platform` shot with `waitFor: "stopped"`, then open doors in the next beat.
- **A departure:** close doors in a cue, add a beat with `waitFor: "doors-closed"`, then `release` in the next beat and cut to a `trackside` shot.
- **Weather turning:** a `weather` cue changes the sky over about half a second; follow it with a `rain-start` event so characters react and shelter.
- **Close shots:** a portrait puts the person's eyes on the upper third of the frame, from the side their face points, with room in front of the face. It tests sightlines to the head and chest against buildings, shelters, benches, the train and other people. If the planned angle is blocked it tries nearby angles (15–90° round, higher, lower, closer) and writes the move in the log.
- **Conversations:** when a line is spoken by a cast member on screen, the camera cuts to that speaker as the line starts, even in a beat whose shot is a window or platform shot. When the camera was on the listener, the reverse is over the listener's shoulder, and every shot of the pair stays on the same side of the line between them. It crosses that line only when no angle on its side is clear, and the log says so. A beat's portrait can name the listener with `"partner": { "cast": "sato" }` and choose `"framing": "single"`, `"ots"` or `"two"` (both people in frame). Over-the-shoulder and two-shots need the pair within 7.5 m; otherwise a single is used. A speaker who is not on screen (aboard the train, say) keeps the beat's shot.

## Sharing an episode

Someone who gets a link should land in the story and then keep playing. At the end of an episode (or after **Skip**) the panel offers **Drive from here**, **Watch again** and **Share**. **Take the controls** during an episode does the same handover straight away: the episode stops, the train stays where it is and keeps running on auto drive, and the camera moves from Director to Follow.

| Episode             | Link                                                                             |
| ------------------- | -------------------------------------------------------------------------------- |
| Built-in            | `?episode=<id>`, for example `?episode=the-1742-e2-the-crossing`                 |
| Custom, any edition | `#ep=1.<payload>`: the episode JSON, deflated and base64url-encoded, in the link |
| Custom, Signal      | `?watch=<id>`: a short link to a copy kept in the Signal site store              |

A built-in episode that an author has changed but kept the id of is shared as a custom episode, so the recipient sees the changed version.

The link payload lives after `#`, so browsers do not send it to the server. The three built-in episodes compress to 1.5–2 KB of link text. Links are capped at 12,000 characters; a longer episode cannot be shared as a link.

### Shared episodes are untrusted

Whatever arrives from a link or the site store is treated as someone else's data:

- The payload must match `1.` plus base64url characters and fit the 12,000-character cap before it is decoded.
- Decompression stops at 64 KB, so a short link cannot inflate into a huge document. Text must be valid UTF-8 and JSON.
- The result goes through the same `normalizeEpisode` validator as agent drafts. Unknown keys, unknown cue types, unknown places or stops, bad character ids and text over the limits are all rejected, and `__proto__` is refused as an unknown key.
- Every string is shown with `textContent`. Markup in a line appears as plain characters.
- A link that fails any check is removed from the address bar, a notice says what went wrong, and the ride starts normally.

### Where custom episodes are stored

`apps/game/src/share/episode-store.js` defines one adapter shape (`kind`, `save(episode)`, `load(link)`, `handles(link)`). `createEpisodeSharing` tries adapters in order when saving and validates everything it loads.

- **URL adapter** (every edition). No server. The episode travels inside the link.
- **Signal adapter** (Signal build only, when `signal.db` exists). It uses the Signal Ship site database: `signal.db('shared-episodes').get/set`, about 900 KB per value, with per-collection rules in `ship.json`. The key is a SHA-256 hash of the episode, so sharing the same episode twice gives the same link. The build adds `"shared-episodes": { "read": "any", "write": "author" }`: anyone who can open the site can read, and only the person who first shared an episode can overwrite it. Each write records the sharer's Loop email (`updatedBy`), and anyone with site access can list the collection. The rule takes effect when the site is next published. The live write path has not been tested against the Signal gateway; the unit tests use a stand-in for `signal.db`. If the store is unreachable, sharing falls back to the URL adapter. Signal sites sit behind Loop sign-in, so `?watch=` links only work for Loop users.
- **Public site** (`lokeshinumpudi.com/maple-line/`) uses the URL adapter only. A `?watch=` link there shows a notice. No hosted store is set up.

A hosted store for the public site would need:

- A small server function (for example a Vercel Function) with `POST /api/episodes`, which validates with `normalizeEpisode` and returns an id, and `GET /api/episodes/:id`.
- Storage: Vercel Blob (one JSON object per id) or Upstash Redis (a key per id with a TTL).
- Server-side size caps (64 KB) and per-IP rate limits. There are no user accounts, so there is also no one to review abuse.
- Content-hash ids, so repeat shares do not create new objects.
- A takedown path.
- A third adapter in `episode-store.js` placed before the URL adapter, with the URL adapter kept as the fallback.

## Keeping the script in step

Built-in episodes live in `apps/game/src/drama/series/`. The readable script is generated from the same data:

```sh
pnpm --filter @maple-line/game drama:script
```

A test fails if a line the game plays is missing from the committed script.

## Voices and languages

Episode lines can be spoken by Sarvam voices, in English or ten Indian languages. In **Places → Watch a short drama**, pick a **Language** and leave **Voices (Sarvam)** on. The choice is saved with the other preferences; the language is shared with Haru's story narration.

Lines are written in English. For another language the director translates each line with Sarvam, keeps the translation on disk beside the audio, and the subtitle shows the translated text. Speaker names, captions and scene headings stay as written. A hand-written translation in the episode wins over the machine one:

```js
{ cast: 'riko', text: 'Front car.', emotion: 'dry', translations: { 'te-IN': 'ముందు బోగీ.' } }
```

Use `lineTranslations` on a beat for its on-screen `line`. Machine translation gets names right, but it misreads idioms and clock times: "Seventeen forty-two in" became inches, and "front car" became a motor car. Every line of _The 17:42_ now has a hand-written Telugu version (`translations`, `lineTranslations`, and `endCard.lineTranslations` for the closing line); the lines a native speaker should still check are listed at the end of [the script](THE-1742.md).

A cast id that matches a part in the voice cast (`packages/voice-score`) is voiced by that part; `voice` on the cast entry picks another part. Lines with only a `speaker` label stay subtitles. The 17:42 cast:

| Part       | Sarvam speaker (bulbul:v3) | Base pace | Casting intent                |
| ---------- | -------------------------- | --------- | ----------------------------- |
| Riko       | `ishita`                   | 1.05      | Female, 17, a little quick    |
| Mr. Sato   | `varun`                    | 0.98      | Mid-life male, even           |
| Mr. Ishida | `anand`                    | 0.88      | Male, slowed for an older man |
| Fusae      | `rupali`                   | 0.93      | Female, 80, slower and warm   |
| Aoi        | `shreya`                   | 1.04      | Female, 24, bright bus driver |

Sarvam does not publish ages or genders for its speakers; these were chosen by name and not auditioned against each other. Every part uses a different speaker from the campaign cast. `emotion` changes pace and the pause after a line (`anxious`, `dry` and `tired` were added for the drama); it does not change the voice.

While a line is spoken the runner holds the beat until the clip ends, instead of the reading-time estimate, and the train and ambient sound duck. The next lines are prepared two beats ahead, and the first beat waits under the title card (up to four extra seconds) for its audio. A line whose audio is not ready within four seconds is shown without it, and the log says so. Pausing the ride pauses the line.

When the director is offline, has no `SARVAM_API_KEY`, or the build has no director (Signal and static builds), the episode plays exactly as before with subtitles, and a small label says why: _Director offline · subtitles only_ or _No Sarvam key on the director · subtitles only_. Hand-written translations still show offline. `get_episode_state` reports the same status under `voice`, and `play_episode` takes optional `language` and `voice` arguments.

### Voice clips for videos

```sh
pnpm voice:episode --episode the-1742-1 --lang te-IN
pnpm voice:episode --episode the-1742-1 --lang te-IN --list   # lines and characters, no requests
```

`--episode` takes an id, `the-1742-<n>` or a number; `--file draft.json` voices a draft. The script runs the director's narration code in-process with the root `.env`, so it shares the disk cache with the game: lines already heard in the game cost nothing, and a re-run only fills gaps. Output goes to `artifacts/voice/<episode>/<language>/` (ignored by git): one WAV per line (24 kHz mono, named like `momiji-platform-2-1-riko.wav`) and `manifest.json`.

The manifest is the video renderer's audio manifest, with details alongside:

```json
{
  "version": 1,
  "kind": "maple-line-episode-voice",
  "episode": "the-1742-e1-two-minutes",
  "language": "te-IN",
  "model": "bulbul:v3",
  "clips": [{ "line": "momiji-platform/2/1", "file": "momiji-platform-2-1-riko.wav" }],
  "lines": [
    {
      "line": "momiji-platform/2/1",
      "cast": "riko",
      "speaker": "ishita",
      "emotion": "anxious",
      "durationMs": 4128,
      "text": "రైలు ఐదు నలభై రెండుకి వస్తుంది. …",
      "sourceText": "Seventeen forty-two in. Seventeen forty out.",
      "textSource": "authored",
      "plannedStartMs": 12500
    }
  ],
  "captions": { "momiji-platform/1": "…", "end": "…" },
  "plan": {
    "beats": [{ "beat": "momiji-platform/1", "startMs": 0, "plannedMs": 11500, "lines": [] }]
  }
}
```

Line ids are `<scene id>/<beat number>/<line number>`, both counted from 1, the same ids the renderer's timeline uses. `clips` holds only `line` and `file` (paths relative to the manifest), so `pnpm render:episode --episode the-1742-1 --audio artifacts/voice/the-1742-e1-two-minutes/te-IN/manifest.json` can place each clip at the time its line appears. `textSource` is `original`, `authored` or `machine`. `plan` is an estimate that ignores waits for the train; the render timeline has the real times. For a render to hold each line for its clip and show translated subtitles, give the runner `createManifestVoice(manifest)` from `apps/game/src/drama/voice-manifest.js` as its voice host.

### Sarvam limits and cost

Checked against Sarvam's documentation on 23 September 2026:

- **Text to speech** (`bulbul:v3`): up to 2,500 characters a request, 11 languages (`en-IN` and ten Indian languages), about 37 speakers, `pace` 0.5–2.0, `temperature` 0.01–2.0 (default 0.6, left at the default here). `pitch` and `loudness` exist only on `bulbul:v2`. Sample rates 8–48 kHz; we use 24 kHz WAV. There is no emotion control. Romanised Indian-language text sounds worse than native script, which is why translations are kept in native script.
- **Translation**: `sarvam-translate:v1` (used here) takes up to 2,000 characters, 22 languages, formal register only. `mayura:v1` takes 1,000 characters and offers colloquial and code-mixed modes. In a test on five lines of this script, Mayura's colloquial mode mixed English words into Telugu and turned "Grandma" into "aunt", so the formal model stays. `speaker_gender` is sent from the voice cast so verbs agree with the speaker.
- **Rate limits** (Starter plan): 30 requests a minute for `bulbul:v3`, 60 for translation. The director runs at most two requests at once; the script retries a 429 up to four times with growing waits.
- **Cost** (published pay-as-you-go prices): speech ₹30 per 10,000 characters, translation ₹50 per 10,000 characters. Episode 1 is 347 English characters: about ₹1 in English, about ₹3 in Telugu (the translated text is longer and is also translated). All three episodes (1,327 English characters) in one Indian language cost roughly ₹12.
- **bulbul:v4-flash** uses per-language styled speakers such as `kavitha_te_conversation`. It was not open to this account. Start the director with `SARVAM_VOICE_MODEL=bulbul:v4-flash` once it is; parts with a confirmed v4 speaker for that language switch, and the rest keep their v3 voice. The v4 settings have not been heard.

## Sharing an episode as a video

`pnpm render:episode --episode the-1742-1 --aspect 9:16` renders an episode to an MP4 for phones, with a poster image and a timeline of when each line is spoken. The timeline's line ids (`momiji-platform/2/1`) are what an audio manifest uses to place voice lines. [Episode videos](../VIDEO.md) covers the options, render mode and the manifest format.

## Limits

- Mr. Sato (`commuter-1`), Riko (`commuter-2`), Mr. Ishida (`reader-1`) and the staged Fusae and Aoi have character models with faces; their mouths move on their lines. Everyone else is still a low-poly figure without a face. The radio has no sound of its own in a video; its static and music are an on-screen line. The [Blender asset skill](../../.agents/skills/maple-blender-assets/SKILL.md) covers adding more.
- Voices need the local director and a Sarvam key; everywhere else dialogue is subtitles. Haru's campaign keeps its own narration. The jaw of a modelled figure moves for the length of the line, not in step with the words. A rendered video carries voice clips through an audio manifest.
- Voice casting and the Telugu translations have been checked by reading, not by a listening review.
- Stage marks are fixed places; people walk straight lines between a mark's `via` points and do not avoid each other.
- A portrait re-checks its view four times a second while it holds. After two blocked checks in a row it looks for a clearer angle and eases the camera there over about a second; it then waits 1.5 s before it may move again, so it does not flick between two angles. A figure's body heading stands in for where the face points, so a character who turns only their head can still be filmed at an angle.
- The episode tools, like the other WebMCP tools, are registered only in development builds. The Places entry works in every build.
- Places lists only the built-in series. A custom episode reaches players through an agent's `play_episode` (development builds) or a shared link. Links work in every build.
