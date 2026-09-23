# Writing episodes

Maple Line can perform short dramas inside the running game. An episode is data: a cast, scenes and beats. The game stages it with the same systems a player uses — the director camera, the NPC minds, auto drive, doors, weather and time of day — so a writer or an agent can work on story without touching code.

The first series is [_The 17:42_](THE-1742.md): one evening train, three episodes, the two minutes between a train that arrives at 17:42 and a bus that leaves at 17:40. It stays on the passenger side of the timetable problem in Haru's campaign and does not use or change the campaign's characters, dialogue or saves.

To watch, open **Places** and choose an episode under **Watch a short drama**. Pausing the ride pauses the episode.

## How an episode is built

| Part  | What it holds                                                                                                                                                                                                                                         |
| ----- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Cast  | Named parts with a short note. Parts are not tied to a figure until a scene casts them.                                                                                                                                                               |
| Scene | A heading, optional scene settings (`location` with an `offset` in metres, `timeOfDay`, `weather`, `speedKmh`), an optional `stopAt` station where auto drive stops the train at the platform, and `actors` mapping parts to characters in the world. |
| Beat  | One shot, optional place card (`caption`, `subtitle`), an on-screen `line`, `dialogue`, a minimum `hold`, an optional `waitFor` (`stopped` or `doors-closed`), and timed `cues`.                                                                      |
| Line  | A cast part (or a free `speaker` label) and text up to 160 characters; `phone: true` sets it in italics.                                                                                                                                              |
| Cue   | Seconds `after` the beat starts and one action: an acting note (`direct` with mood, intent and hold), `doors`, a world `event`, `weather`, or `release` to let the train leave.                                                                       |

Shot subjects can be a cast part (`{ "cast": "riko" }`) or a level crossing (`{ "crossing": "sakuragawa-farm-road" }`) as well as the director's own subjects. Dialogue is timed to reading speed (about 180 words a minute, 1.8–7 seconds a line), so a beat lasts as long as its lines need. The runner waits for the train only where a beat says so, and gives up after 45 seconds with a note in the log.

Casting uses characters the world already simulates. Momiji has commuters, residents and a newspaper reader; each regional station has eight residents (for example `aonuma-resident-5`, the kiosk vendor). Regional residents exist only while their station area is loaded, so cast them in scenes set at that station. If a cast figure is not on screen when its shot starts, the runner uses a platform or orbit shot instead and writes that in the log.

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
- **Close shots:** portraits frame a person's chest from the side they face, try eight angles and then a higher, wider pass, and avoid walls, shelters and benches near the subject.

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

## Sharing an episode as a video

`pnpm render:episode --episode the-1742-1 --aspect 9:16` renders an episode to an MP4 for phones, with a poster image and a timeline of when each line is spoken. The timeline's line ids (`momiji-platform/2/1`) are what an audio manifest uses to place voice lines. [Episode videos](../VIDEO.md) covers the options, render mode and the manifest format.

## Limits

- Only Momiji's `commuter-1` (Mr. Sato), `commuter-2` (Riko in episode 1) and `reader-1` (Mr. Ishida) have Blender models with faces and a jaw that moves on their lines. Everyone else, including the Aonuma cast, is still a low-poly figure without a face. The [Blender asset skill](../../.agents/skills/maple-blender-assets/SKILL.md) covers adding more.
- Dialogue is subtitles. It is not voiced in the game; Haru's campaign keeps its own narration. A rendered video can carry voice clips through an audio manifest.
- A part may be played by different figures in different scenes (Riko is a Momiji student in episode 1 and a standing Aonuma resident in episode 3).
- Shots are planned when they start. A character who walks far can leave the frame; portraits follow them but do not re-plan the angle.
- The episode tools, like the other WebMCP tools, are registered only in development builds. The Places entry works in every build.
- Places lists only the built-in series. A custom episode reaches players through an agent's `play_episode` (development builds) or a shared link. Links work in every build.
