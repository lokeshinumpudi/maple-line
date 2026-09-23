# Sarvam character voices

Haru’s notebook has an optional **Read aloud** control. English is the default; Telugu, Hindi, Tamil, Bengali, Marathi, Gujarati, Kannada, Malayalam, Punjabi and Odia are also supported. Japanese and Urdu remain unavailable. Displayed story text stays in English.

The root gitignored `.env` holds `SARVAM_API_KEY`. Restart the director after changing it. Keys stay on the local server; they are never sent to the browser. Development and preview proxy `/api/director/narration` to port 4175.

## Performance score

`apps/game/src/narrative/story-voice.js` assigns every quotation in the 18 story scenes and their reply branches to a character. It splits paragraphs into spoken turns, preserving the story words and associating each turn with its displayed paragraph. The reading underline and voice status follow the current turn. Prose keeps the scene’s first-person narrator, Haru or Emi, including choice responses and later callbacks.

`packages/voice-score` is shared by the game and director. It assigns stable Bulbul v3 speakers to Haru, Emi, Nao, Jun, Fumi, Yuta, Mika, Keiko, Haru’s son and the narrator. Scene direction includes warm, playful, curious, reflective, vulnerable and reassuring delivery. Direction adjusts synthesis pace and inter-turn silence; it never changes a character’s assigned voice. The bridge’s listening branch includes an eight-second pause for the scenery and environmental sound.

These are synthetic performances. Bulbul v3’s documented REST API has speaker and pace controls, but no explicit emotion control; v3 also does not support pitch or loudness parameters. Emotion labels in the score describe authored timing intent, not guaranteed emotional acting. Voice casting and pronunciation still need listening review, particularly after translation. Source: [Sarvam REST API](https://docs.sarvam.ai/api-reference/text-to-speech/convert).

## Preparing audio

When voice is enabled, playback starts as soon as the first turn is ready. One background browser request prepares the remaining turns and possible replies. Travel prepares the approaching scene. Speculation is bounded to the current or approaching scene, in the selected language. It does not choose replies or advance the story.

To prepare the whole English campaign and both branches in advance while the director is running:

```sh
pnpm narration:prepare
```

Use `pnpm narration:prepare --list` to inspect the clip and character counts without generation. Use `--language=te-IN` for another supported language, or `--beat=the-recorder` for one scene. This command makes paid provider requests for missing clips. It retries rate limits up to four times with increasing waits, then stops on failure; rerunning reuses completed audio. It checks quotation casting before making paid requests. English is sent directly to TTS. Other languages are translated with `sarvam-translate:v1` before each spoken part is synthesized.

The local server stores WAV clips in `.cache/narration/`, excluded from version control. A 256 MB disk limit evicts the oldest written audio. Memory retains at most 128 clips within 32 MB; the player has its own equivalent memory limit. Disk write failures leave live playback available and appear in status. Cached files survive browser and director restarts. Cache identity includes source text, language, character, delivery, provider model, translation model, voice revision, speaker, pace and sample rate. Change `VOICE_REVISION` after revising casting or pronunciation behavior.

The server admits at most 32 outstanding unique clips and runs two provider chains concurrently. Queued playback precedes queued speculation. Identical requests share synthesis. Cancelling one listener does not interrupt another listener using that clip; abandoning the last listener cancels its provider work. Each active provider chain has a 30-second deadline. Cache hits do not require a provider call. These measures reduce waiting; uncached generation and browser autoplay can still delay speech. This is prepared clip playback, not a streaming speech connection.

## Drama episodes

The drama episodes use the same routes, cache and cast package, with six more parts (Riko, Mr. Sato, Mr. Ishida, Fusae, Mrs. Hara and Mr. Tanabe) and three more deliveries (`anxious`, `dry`, `tired`). Unlike the story, an episode shows translated subtitles: the game asks `/api/director/narration/translate` for each line, then voices the translated text. See [episode voices](drama/README.md#voices-and-languages) for casting, the language picker, the offline fallback, the video clip script and Sarvam's limits and prices.

## Playback and boundaries

Each request contains one spoken part, language, character, emotion and priority. The server validates these against catalogs, limits text to 1–1600 characters, and retains the existing 4096-byte body and loopback origin restrictions. Provider failure details and keys never appear in responses. `GET /api/director/narration/status` reports the cast, delivery catalog, queue activity and cache counters.

Reply changes, language changes, notebook dialogs, leaving the story and switching voice off stop playback, queued browser work and pause timers. Stale responses cannot begin playback. Cached clips remain reusable. Browser autoplay rejection offers **Play narration**, provider failures offer **Retry narration**, and completed scenes offer **Listen again**. Audio emits `maple:narration-state` for the existing environmental sound mix. Between spoken turns it releases the mix so environmental sound remains audible.

The static game build still needs this local backend. There is no deployed narration service, streaming synthesis, voice cloning, generated dialogue, or word-level lip synchronization. Wildlife field-note panels are separate from the main scored dialogue; choice callbacks and the optional wildlife broadcast sentence are included in preparation.

## Verification

Automated tests cover every authored quotation’s casting, preservation of story words, branch lookahead, changing speaker within a paragraph, translation routing, voice/delivery cache identity, shared requests, cancellation, queue priority, persistent cache reuse, provider timeouts, validation, origin restrictions, stale playback rejection, autoplay retry, prepared playback, language isolation and cancellation during timed silence. Live generation and browser playback checks are recorded separately from subjective listening quality.

The 21 September 2026 check prepared all 207 English clips for the current script. Repeating the complete batch produced 207 cache hits and zero new synthesis requests ([cache evidence](../artifacts/localhost/narration-engine/cache-reuse.json)). A muted browser playback check completed Haru → pause → Emi ([sequence evidence](../artifacts/localhost/narration-engine/browser-sequence.json)); the actual story panel also played the revised Fumi scene with the current-speaker status and paragraph underline ([screenshot](../artifacts/screenshots/character-voice-engine.png)). These checks verify generation, scheduling and playback, not subjective acting or pronunciation.
