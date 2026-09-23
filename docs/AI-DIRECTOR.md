# Jev sightseeing director

The optional local director uses Vercel AI SDK **7.0.107** and the Gateway evaluation model **`typesafe-ai/jev`**. For AI life, Jev selects two finite game preferences: sightseeing pace and background station activity. This is an evaluation request through `experimental_evaluate`, not a chat completion or a general-purpose game agent.

The model ID and evaluation type were checked against the Gateway model catalog. The SDK API and result shape follow the documentation bundled at `ai/docs/03-ai-sdk-core/32-evaluation.mdx`. The evaluation API is experimental, so the SDK is pinned.

The same server also accepts player descriptions for the [Jev world builder](WORLD-BUILDER.md), which selects five scenery settings and reports request coverage. World creation has a separate contract. The browser ships 24 captured Jev plans as an explicitly labelled fallback when the world service is unavailable; it does not run Jev locally.

## Running locally

The director package lives in `apps/director`. From the workspace root, `pnpm dev` starts both the game on port 4173 and director on port 4175 through Turborepo. To run only the director:

```sh
pnpm --filter @maple-line/director dev
```

It listens on `127.0.0.1:4175`. `DIRECTOR_PORT` may select another local port. The package commands load the root `.env` if present. Set `AI_GATEWAY_API_KEY` there; keep it server-only, never under a `VITE_` variable. No credential is returned by the API or included in provider error responses. The director does not copy credentials from other projects.

Without a Gateway key, decisions use deterministic local rules and return `source: "fallback"`. Provider failures, unsupported answers, deadlines, paused journeys, an occupied evaluation slot, or cooldown also return an explicitly labeled fallback. A configured key alone does not prove a provider request succeeded: only a decision response with `source: "jev"` indicates a validated Jev answer.

The browser uses a Vite proxy from `/api/director` to `http://127.0.0.1:4175`. Direct CORS access permits loopback game origins on ports 4173 and 4174. The server binds to loopback and rejects other Host values. The Vercel adapter uses configured public origins and `/tmp` narration caching. It does not provide user authentication; see [hosting](HOSTING.md).

## Contract

`GET /api/director/status` reports configuration, model, current inflight state, cooldown duration, and remaining cooldown. It never returns the key. The `world` field reports world creation inflight state and remaining cooldown. Its `source` field describes the configured route, not a historical model result.

`POST /api/director/decide` accepts exactly these fields:

```json
{
  "weather": "clear",
  "speedKmh": 42,
  "remainingToStation": 600,
  "region": "gorge",
  "paused": false
}
```

Weather is `clear`, `rain`, or `snow`. Speed must be finite and between 0 and 160 km/h. Remaining station distance must be finite and between -5,000 and 5,000 metres. Region is `gorge`, `terraces`, `village`, `shrine`, `bridge`, `station`, or `city`. Paused is a boolean. Extra fields, arbitrary prompts, scripts, and scene object data are rejected.

The response is:

```json
{
  "source": "jev",
  "reason": "Jev selected these bounded sightseeing and station activity choices.",
  "decision": {
    "pace": "relaxed",
    "stationActivity": "stroll"
  }
}
```

Pace is `relaxed`, `cruise`, or `cautious`. Station activity is `commute`, `shelter`, or `stroll`. Response reasons are fixed application strings, not model-generated instructions. SDK choice validation is followed by a second application whitelist check before returning a decision.

The client maps `cautious`, `relaxed`, and `cruise` to autopilot targets of 60, 90, and 120 km/h. Station activity changes shelter behavior and leisure dwell times. Manual driving remains under player control. Player controls, emergency braking, terminal protection, and door interlocks remain deterministic game code. The backend has no action to alter them. The model receives only the five synthetic game-state values shown above; no screenshots, personal data, credentials, or unrelated project records are part of the request.

## Player integration

The **AI life** button enables or disables the director. While enabled and playing, `apps/game/src/agent/ai-director.js` requests a decision at most once every 20 seconds, without awaiting it in the render loop. It discards answers if the player paused, disabled the director, or changed weather/region while the request was pending. The client aborts requests after 10 seconds; the server has a shorter provider deadline.

The accepted decision and source label live in Zustand. The app stops applying a decision after 60 seconds and returns to the standard target/routines. The UI distinguishes live Jev answers, local fallback, disabled state, and an offline server. Requests send only the five synthetic game-state fields in the contract.

## NPC minds

Background characters have local minds in `apps/game/src/simulation/npc-minds.js`. Each character gets seeded persona traits (warmth, patience, curiosity, sociability, energy), an emotion (valence −1 to 1, arousal 0 to 1, and a named mood), and needs (rest, social, and comfort are satisfaction from 0 to 1; urgency is 0 to 1). Weather, dusk, the train's approach and doors, crowds, chats, and horn or fast-pass startles change them. A local rule set picks an intent with seeded softmax sampling: the same seed and inputs give the same result. An intent is held for at least six seconds.

`POST /api/director/minds` lets Jev choose a mood and an intent for up to six characters. It accepts exactly:

```json
{
  "context": {
    "weather": "rain",
    "dusk": false,
    "region": "station",
    "trainPhase": "approaching",
    "crowd": 4
  },
  "entities": [
    {
      "id": "commuter-2",
      "role": "student",
      "mood": "curious",
      "intent": "watch-train",
      "valence": 0.21,
      "arousal": 0.58,
      "needs": { "rest": 0.7, "social": 0.4, "urgency": 0.55, "comfort": 0.35 }
    }
  ]
}
```

Weather is `clear`, `rain`, or `snow`. Dusk is a boolean. Region is one of the seven decision regions or a regional stop theme (`farmland`, `wetland`, `lakeside`, `cedar`, `forest`, `mountain`, `snow`, `alpine-lake`, `birch`, `autumn`, `harbour`). Train phase is `away`, `approaching`, `stopped`, or `departing`. Crowd is an integer from 0 to 20. There are one to six entities with unique ids of 1–24 characters from `a-z`, `0-9`, and `-`. Role is `commuter`, `student`, `shopper`, `resident`, `visitor`, `worker`, `shopkeeper`, `gardener`, `elder`, `reader`, `vendor`, `neighbour`, or `traveller`. Mood is `content`, `cheerful`, `wistful`, `anxious`, `impatient`, `curious`, `tired`, `irritated`, or `shy`. Intent is `continue`, `linger`, `chat`, `hurry`, `shelter`, `watch-train`, `wave`, `sit`, `check-phone`, or `stretch`. Numbers must be finite and in range. Extra fields at any level are rejected.

The response is `{ "source": "jev" | "fallback", "reason": "…", "entities": [{ "id", "mood", "intent" }] }`. Jev answers one typed mood question and one typed intent question per entity; the server checks each answer against the whitelists again. Reasons are fixed application strings. A fallback returns simple deterministic choices, and the browser does not apply them.

The minds route uses the lowest priority on the shared evaluation slot. It runs only when no AI-life or world request is active or waiting, and a later AI-life or world request cancels it and waits for the provider to settle. It has its own 20-second cooldown and six-second deadline. A refused slot does not start the cooldown. `GET /api/director/status` reports `minds.inflight`, `minds.cooldownMs`, and `minds.retryAfterMs`.

In the browser, `apps/game/src/agent/minds-client.js` sends one request at most every 25 seconds, only while AI life is on, with a 10-second deadline and one request at a time. It picks the most salient visible characters: near the camera, recently changed mood, or requested by an agent. It discards the whole answer if weather, dusk, region, or train phase changed while waiting, and drops any character that despawned or respawned. Accepted choices hold for 45 seconds of game time and are labelled `source: "jev"`; other choices are `local`. The Signal and static builds report `offline` and keep local minds running.

Agents can steer characters through `setDirective(id, { mood, intent, holdSeconds })`. A directive holds for 1–300 seconds of game time, wins over Jev and local choices, and is labelled `directed`. `apps/game/src/agent/mind-tools.js` exposes read and direction tools through the validated WebMCP executor. Minds change visible behaviour only: walking speed within 0.6–1.4×, short pauses, shelter, and facing. A mind can delay a waiting passenger's walk to an open door by at most two seconds. It never slows platform passengers while a train is being served and never stops boarding. It has no action for doors, signals, or the train.

## Request limits

The process permits one provider evaluation at a time. AI life has a minimum 15 seconds between decision evaluation starts. World requests wait for an active AI-life evaluation and take priority over subsequent background requests; they have their own five-second cooldown and eight-second deadline. An AI-life model request has a five-second deadline and disables SDK retries. If a provider ignores cancellation, its slot stays occupied until it settles; later requests receive local fallback rather than launching overlapping calls.

The HTTP body limit is 4,096 bytes, with a two-second body-read deadline. Validation failures use HTTP 400, unsupported content types 415, excessive bodies 413, and disallowed origins/hosts 403. Provider unavailability and cooldown return HTTP 200 with `source: "fallback"` so the game can continue. Callers should request at a deliberate cadence, inspect the source label, and avoid sending on every render frame.

## Verification

```sh
pnpm --filter @maple-line/director test
pnpm --filter @maple-line/director typecheck
pnpm --filter @maple-line/director lint
```

Tests inject the evaluator and verify fallback behavior, strict input validation (including the minds contract), typed questions, allowed answer extraction, provider-error redaction, cooldown, concurrent-request limits, timeout cancellation, paused behavior, and HTTP constraints. Source code is checked using TypeScript `checkJs`; tests do not spend provider credits.

A live smoke test succeeded: a rainy station request returned `source: "jev"` with `pace: "cautious"` and `stationActivity: "shelter"`. This verifies one provider request, not sustained availability. An HTTP 200 with `source: "fallback"` confirms continuity but does not prove live model access.

See the [local development skill](../.agents/skills/maple-line-dev/SKILL.md) for workspace commands and browser verification. The production game build does not start the director. Deploy its separate Vercel function and set the client server origin as described in [hosting](HOSTING.md).
