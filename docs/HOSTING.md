# Hosting Maple Line

## Two publishing destinations

This is a standing user preference: maintain an internal Signal edition and a public personal edition. Both use the personal GitHub source; choosing Signal hosting does not switch GitHub ownership to the work account.

| Target   | Game                                                        | Guide                                                               | Publishing path                                                                                                         |
| -------- | ----------------------------------------------------------- | ------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Internal | `https://signal-ship.internal.loophealth.com/s/maple-line/` | `https://signal-ship.internal.loophealth.com/s/maple-line-runbook/` | Signal Ship platform, existing-site file patches                                                                        |
| Personal | `https://lokeshinumpudi.com/maple-line/`                    | `https://lokeshinumpudi.com/maple-line-runbook/`                    | Personal GitHub `lokeshinumpudi/maple-line` and `lokeshinumpudi/website`, hosted through their existing Vercel projects |

Use `github-personal` for personal repository pushes. Credits and game/guide backlinks follow the build target; external source citations keep their original destinations. Preserve existing Signal assets and site data when publishing updates.

The browser game and Jev server deploy independently. The root Vercel project builds the client with `pnpm build:public`; set `VITE_DIRECTOR_URL` to the server's HTTPS origin. The client uses `/maple-line/` as its base path. The personal website can proxy `/maple-line` and `/maple-line/:path*` to that client without changing its homepage.

`node scripts/export-director.mjs <directory>` exports the server and its two shared packages into a standalone repository. Its Vercel Fluid function serves `/api/director/*`. Set `AI_GATEWAY_API_KEY`, optional `SARVAM_API_KEY`, and comma-separated `ALLOWED_ORIGINS` on the server project. Credentials must never enter `VITE_` variables. The local development server remains bound to loopback.

Hosted requests retain JSON validation, body limits, deadlines, and per-instance evaluation cooldowns. CORS is not user authentication or a global spending limit. Vercel narration caches live under `/tmp` and may disappear between instances.

## Signal build

`pnpm build:ship` produces the static site in `apps/game/dist-ship`. The browser selects `typesafe-ai/jev` and calls browser `signal.evaluate` directly through the authenticated Signal gateway. It validates the coverage and five scenery settings, adds a deterministic seed, and applies the result in the current session. The browser has no provider key. Requests have a 45-second local deadline. Cancellation ends the local wait and late responses are discarded. The current Signal SDK does not forward AbortSignal, so cancelling cannot stop provider work already sent.

The request contains `model: 'typesafe-ai/jev'`, `state: { description }`, and six typed choice questions shared with the local director. The response contains `answers` with a `type` and `choice` for each setting. The game rejects missing answers, incorrect answer types and values outside its scenery choices. Jev must use the evaluation endpoint; `signal.llm` is for chat models.

The game no longer calls the `world-builder` agent, starts a Function runtime, or waits for a database record. Existing server functions and saved records remain available; the build still bundles the legacy function for maintenance. New browser generations are not saved to the Signal database. Signal builds use local sightseeing routines and text-only story presentation; Jev and Sarvam keys are not included. Saved Jev presets remain available as an explicitly labelled fallback.

On 22 September 2026, the evaluation build passed `pnpm check`, director type checking and `pnpm build:ship`. A browser test using the published Signal SDK and a mocked evaluation response reached an active world with exactly one evaluation request and no page errors. The game and existing runbook were published on Signal on 22 September 2026. A live browser request returned HTTP 200 from `ai/evaluate` with model `typesafe-ai/jev` and activated the snowy world in 6.73 seconds, with no page errors. This measures one request, not a latency guarantee.

Build success does not verify hosting, model access, or the browser's WebGL support. Test a generated world and the published game on each target after deploying.

## Runbook

The [Maple Line Runbook](https://signal-ship.internal.loophealth.com/s/maple-line-runbook/) is a separate Signal site. The game links to it without downloading its images or lessons at startup. In the Signal build, the guide links back to the Signal game, and both “Built by Loki” credits link to `https://signal.internal.loophealth.com`.

Run `pnpm build:runbook` to build `artifacts/runbook-site`. The authored guide lives in `runbook/`; its 37 chapters include 2560 × 1440 game captures, plain-English explanations, autoplay SVG experiments, optional code and practice sections, individual copyable skills and a downloadable skill collection. `skills-pack.json` contains the ZIP payload because Signal static hosting does not accept ZIP files directly.

Publish only `index.html`, `ship.json`, `assets/`, `game/`, `skills/`, `skills.json`, `skills-pack.json` and `all-skills.md`. Do not include hidden files, local environment files or Vercel project metadata. Use file patches for subsequent Signal updates so existing cloud assets remain intact.

### Personal website copy

The public runbook is served at [lokeshinumpudi.com/maple-line-runbook](https://lokeshinumpudi.com/maple-line-runbook). Build it with `pnpm build:runbook --personal`; the result is `artifacts/runbook-personal`. This edition links to `https://lokeshinumpudi.com/maple-line/` for the game and `https://lokeshinumpudi.com` for the author, with an explicit asset base for the nested route. The default build still targets Signal.

Copy `index.html`, `assets/`, `game/`, `skills/`, `skills.json`, `skills-pack.json` and `all-skills.md` into `public/maple-line-runbook/` in the personal website repository (`lokeshinumpudi/website`). Its Vercel rewrite serves `index.html` at `/maple-line-runbook`. Publish through the existing `personal-website` Vercel project, verify a preview, then promote the verified deployment. Check chapter navigation, image loading, individual skills, the ZIP download and the game link.

Runbook explanations live in `runbook/concepts.json`; interactions live in `runbook/interactive.js`. A short introduction leads into the live experiment; reference captures and the simplified diagram remain available in disclosures Playback pauses when hidden or paused by the reader. Reduced motion disables automatic playback. `runbook/captures/subjects.json` maps image features to dedicated captures and their highlights. Capture images at native 2560 × 1440 render resolution; do not enlarge low-resolution source images.

Each of the 37 chapters includes longer explanations of how the concept works, how to read the pictured scene, and what mistakes to avoid. These appear after the experiment and are included in the downloadable skills. Experiments offer Play/Pause and discrete example settings. Reduced motion keeps automatic playback off. The live game loads automatically when its section enters view with its own camera, weather, lighting, place and train controls.

Game builds select credit and field-guide destinations at build time: `--mode ship` keeps the Signal URLs; `--mode public` uses `https://lokeshinumpudi.com` and `https://lokeshinumpudi.com/maple-line-runbook/`. Public links are absolute so they also work when the game is opened on its Vercel deployment domain. Third-party documentation and source citations retain their original destinations.

The agent-tools chapter is authored in `runbook/agent-tools-lesson.json` with its plain-English reading in `concepts.json`. It covers the development-only WebMCP registry, world exploration and performance measurement; its diagram never connects the guide to a live game. The layout uses the available desktop width, switches long explanations to columns above 1800 px, and uses a chapter drawer, fixed Previous/Next navigation and 44 px controls on narrow screens.

See [Embed SDK](EMBED-SDK.md) for the live game configuration API and its limits. Runbook builds include the matching static embed, with storage disabled and no director network calls.

Chapter layout: short introduction; explanatory reading beside a bounded Live/Diagram panel on desktop; captured-scene, Code and Question/Skill sections below. Mobile places the live panel before the longer reading. MCP chapter workflows show tool requests, evidence, next actions and verification.
