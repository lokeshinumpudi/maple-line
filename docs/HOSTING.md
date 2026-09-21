# Hosting Maple Line

The browser game and Jev server deploy independently. The root Vercel project builds the client with `pnpm build:public`; set `VITE_DIRECTOR_URL` to the server's HTTPS origin. The client uses `/maple-line/` as its base path. The personal website can proxy `/maple-line` and `/maple-line/:path*` to that client without changing its homepage.

`node scripts/export-director.mjs <directory>` exports the server and its two shared packages into a standalone repository. Its Vercel Fluid function serves `/api/director/*`. Set `AI_GATEWAY_API_KEY`, optional `SARVAM_API_KEY`, and comma-separated `ALLOWED_ORIGINS` on the server project. Credentials must never enter `VITE_` variables. The local development server remains bound to loopback.

Hosted requests retain JSON validation, body limits, deadlines, and per-instance evaluation cooldowns. CORS is not user authentication or a global spending limit. Vercel narration caches live under `/tmp` and may disappear between instances.

## Signal build

`pnpm build:ship` produces the static site in `apps/game/dist-ship` and bundles `ship/generate-world.mjs` into `artifacts/ship/generate-world.mjs`. Publish the static site, register the bundle as the `generate-world` Ship Function, and register a `world-builder` agent whose `generate_world` tool calls that function. The browser sends a request ID and prompt through the agent, then reads the matching `generations` database record.

The function uses `signal.llm`, validates bounded scenery settings, and saves the generation using `signal.db`. Browser database writes are disabled. Reusing a request ID returns the saved result. Signal builds use local sightseeing routines and text-only story presentation; Jev and Sarvam keys are not included. Saved Jev presets remain available as an explicitly labelled fallback.

Build success does not verify hosting, model access, or the browser's WebGL support. Test a generated world and the published game on each target after deploying.
