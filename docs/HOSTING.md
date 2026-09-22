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

`pnpm build:ship` produces the static site in `apps/game/dist-ship` and bundles `ship/generate-world.mjs` into `artifacts/ship/generate-world.mjs`. Publish the static site, register the bundle as the `generate-world` Ship Function, and register a `world-builder` agent whose `generate_world` tool calls that function. The browser sends a request ID and prompt through the agent, then reads the matching `generations` database record.

The function uses `signal.llm`, validates bounded scenery settings, and saves the generation using `signal.db`. Browser database writes are disabled. Reusing a request ID returns the saved result. Signal builds use local sightseeing routines and text-only story presentation; Jev and Sarvam keys are not included. Saved Jev presets remain available as an explicitly labelled fallback.

Build success does not verify hosting, model access, or the browser's WebGL support. Test a generated world and the published game on each target after deploying.

## Runbook

The [Maple Line Runbook](https://signal-ship.internal.loophealth.com/s/maple-line-runbook/) is a separate Signal site. The game links to it without downloading its images or lessons at startup. The guide links back to the Signal game, and both “Built by Loki” credits link to `https://signal.internal.loophealth.com`.

Run `pnpm build:runbook` to build `artifacts/runbook-site`. The authored guide lives in `runbook/`; its 36 chapters include game captures, interactive SVG diagrams, individual copyable skills and a downloadable skill collection. `skills-pack.json` contains the ZIP payload because Signal static hosting does not accept ZIP files directly.

Publish only `index.html`, `ship.json`, `assets/`, `skills/`, `skills.json`, `skills-pack.json` and `all-skills.md`. Do not include hidden files, local environment files or Vercel project metadata. Use file patches for subsequent Signal updates so existing cloud assets remain intact.
