# Jev world builder

Players describe a valley, then Jev selects a validated world plan. The game prepares the scenery and activates it without reloading. Open **Create a world** on the welcome screen or **New world** during a ride. **Surprise me** fills the input from 24 shuffled descriptions; submitting it tries live Jev, with a bundled saved plan when the service is unavailable.

## What changes

| Setting        | Supported choices                                                |
| -------------- | ---------------------------------------------------------------- |
| Tree season    | Pink blossom, green summer, gold/orange autumn, evergreen winter |
| Forest density | Open, mixed, dense                                               |
| Settlement     | Low village rooftops, small town, taller skyline                 |
| Weather        | Clear, rain, snow                                                |
| Light          | Daylight, dusk                                                   |

The forest and settlement changes affect the original valley. Regional scenery farther along the route retains its existing design. Weather and time use the existing atmosphere system, including local mountain weather. Terrain, track, river layout, stations, wildlife, and train geometry remain authored game systems. Rain and snow continue to affect braking through the existing local physics.

This is a bounded procedural builder. Jev selects settings; seeded code places scenery. It does not generate executable code, arbitrary meshes, new tracks, or new physical laws. The same validated plan and seed reproduce scenery; a new model evaluation of the same prompt can select different settings.

## Player flow

1. Enter 3–600 characters or choose a suggestion.
2. **Interpret** requests five choices and a supported/partial/unsupported classification from Jev.
3. **Build** prepares trees and settlement scenery away from the active scene and compiles their materials.
4. **Active** starts an automatic ride near the village or city outlook and shows an activation notice. Reopen **New world** to review the actual settings and world identifier.

An explicit extra feature, such as a castle, requires accepting the displayed supported settings. An unsupported central setting, such as an alien planet, leaves the current world in place. Cancelling and invalid model answers retain the active world. Connection failures use the bundled fallback described below. Reloading resets active generated scenery; bundled presets remain available, but personal generated worlds are not persisted.

The default HUD shows speed, pause, camera and **Drive yourself**. Detailed driving controls appear when requested. **Options** contains viewpoints, weather, sound, AI life, restart and help. Visiting a viewpoint retains automatic driving in passenger mode.

## Bundled Jev worlds

The client ships 24 captured `typesafe-ai/jev` plans, one for every current invitation. This is a curated set covering the existing seasons, density, rooftops, weather and daylight choices, not a popularity ranking. `apps/game/src/world/presets/jev-worlds.json` records each original prompt, plan, seed, model and capture time. Plans are validated when loaded and built by the existing seeded scene generator. No model or API key ships in the client.

**Saved Jev worlds** in the world dialog lets players choose and build a preset directly, making no server request. If a live request fails because of a disconnected server, timeout, 404/static-host response, 5xx, or exhausted busy retry, an identical saved prompt builds its captured plan automatically. Other prompts receive a word-overlap suggestion and must accept the displayed settings or choose another saved world. The matcher does not infer negation, invent settings or claim that unsupported requests have been fulfilled. Even an alien-world prompt requires review of the actual valley preset.

Saved results use `source: "jev-preset"` and a **Saved Jev world** label; live results retain `source: "jev"`. Approximate suggestions preserve the current world until accepted. Cancelled requests, stale responses, failed preparation and invalid provider plans cannot activate a fallback behind the player's back. The catalog is included in the production bundle, so removing the director server does not remove these worlds. The game files must still be loaded/served; this is not a service-worker offline installation or an audio fallback.

To capture additional/current invitations, run `node scripts/capture-world-presets.mjs` with the local director and its Jev key configured. This spends provider requests, validates supported results, observes cooldown, writes each successful capture and skips already saved prompts on subsequent runs. Review catalog changes before shipping them. No usage statistics are collected to rank the collection.

## Contract and lifecycle

`packages/world-spec` is shared by the browser and server. Its `WorldSpec` type and runtime validator allow exactly five enum fields plus a 32-bit seed. Both sides validate the plan. The server hashes the normalized prompt for the seed; Jev cannot add fields or return code for execution.

`POST /api/director/world` accepts exactly `{ "prompt": "…" }` and returns `{ source: "jev", coverage, plan }`. The server uses AI SDK's `experimental_evaluate` with `typesafe-ai/jev`. The root `.env` must provide `AI_GATEWAY_API_KEY`; it stays on the server. Missing credentials or provider failures return 503, and concurrent/cooldown requests return 429. Public hosting, authentication and per-user quotas are not included.

World creation shares one provider slot with AI life. A world request waits for an existing background evaluation; subsequent background requests use their labelled local fallback while world creation is waiting or running. The world request has an eight-second server deadline including that wait and a five-second cooldown. The client has a 20-second deadline and retries 429 once after five seconds. If a provider ignores cancellation, its slot stays held until it settles.

Zustand owns the request status, proposal and active plan. Three.js resources stay outside it. Request generations prevent late or cancelled responses from replacing a newer world. Replaced generated meshes, materials, textures and instance buffers are disposed.

## Verification

Run `pnpm check` from the workspace root. Tests cover strict plan/request validation, bounded provider choices, queued world priority, cancellation, deadlines, stale scene disposal, partial acceptance, failed requests retaining active state, seeded placement and rail/river clearance. Browser prompt trials are recorded in [world-builder-eval.md](../artifacts/localhost/game-control/world-builder-eval.md).
