# Maple Line game tools

In development, `apps/game/src/agent/webmcp.js` registers seven tools when the browser provides the WebMCP interface. They read the live state and call the same control actions as the UI. A supported agent can inspect the world, change weather/cameras, pick visible objects, and try reversible object edits without asking the player to copy a snapshot.

| Tool                 | Effect                                                           |
| -------------------- | ---------------------------------------------------------------- |
| `get_world_state`    | Compact game state, camera, render counters, object counts       |
| `find_objects`       | Search names, IDs, UUIDs and object types                        |
| `inspect_object`     | Transform, bounds, geometry and material details                 |
| `pick_world`         | Camera raycast using normalized coordinates                      |
| `set_game_control`   | Camera, weather, time, location, drive, pause, autopilot or mode |
| `patch_world_object` | Temporary local transform, visibility or material edit           |
| `undo_world_patch`   | Revert the last object patch                                     |

## Integration

The app is `@maple-line/game` in the pnpm/Turborepo workspace. Start it from `/Users/lokeshinumpudi/Desktop/maple-line` with `pnpm dev`; the inspector and tool registration are development-only. The following imports are relative to `apps/game/src/main.js`.

```js
import { registerGameWebMCP } from './agent/webmcp.js';
const tools = registerGameWebMCP({
  inspector,
  getGameState: () => gameStore.snapshot(),
  actions,
});
await tools.ready;
// Call tools.dispose() before replacing the registry or leaving the document.
```

Pass the public game state; the module strips functions and common secret field names, but it is not intended to sanitize an arbitrary application store. Do not put credentials into the game store. Tool output includes the page origin and labels object names as data. Input validation runs inside each executor; schemas and metadata alone do not authorize an action.

## Native support and fallback

Native discovery listed all seven tools in an isolated, headless Google Chrome for Testing session on port 9333 with `--enable-blink-features=WebMCPTesting`. The existing Chrome Agent session on port 9229 exposes the page-local fallback only. See the [evaluation record](../artifacts/localhost/game-control/eval-report.md) for invocation and UI verification results; discovery alone does not establish that a control changed.

The module prefers `document.modelContext.registerTool`, and supports the older `navigator.modelContext.registerTool`. Modern registrations are removed with an `AbortSignal`; older ones use `unregisterTool`. These differences follow the [Chrome imperative API documentation](https://developer.chrome.com/docs/ai/webmcp/imperative-api), updated September 11, 2026.

`window.mapleWebMCP.supported` is true only after all tools register with a browser-provided interface. `mode` is `native-document`, `native-navigator`, `registering`, `page-fallback`, or `disposed`. `ready` resolves the final startup mode and errors. Do not treat a page-defined replacement for `modelContext` as proof of browser support.

For a dedicated testing browser, [Chrome documents the WebMCP testing flag](https://developer.chrome.com/docs/ai/webmcp). Chromium's `WebMCPTesting` runtime feature implies `WebMCP`; the command-line setting is `--enable-blink-features=WebMCPTesting`. The DevTools UI can also use `--enable-features=DevToolsWebMCPSupport`. Use a dedicated testing session; the native verification session used port 9333 and Chrome Agent uses port 9229. Leave everyday Chrome alone.

```sh
agent-browser --cdp 9333 webmcp list
agent-browser --cdp 9333 webmcp invoke get_world_state --params '{}'
agent-browser --cdp 9333 webmcp invoke set_game_control --params '{"action":"weather","value":"snow"}'
agent-browser --cdp 9333 webmcp invoke set_game_control --params '{"action":"camera","value":"cab"}'
agent-browser --cdp 9333 webmcp invoke pick_world --params '{"x":0,"y":0}'
```

When the browser API is missing or rejects registration, the same validated tools remain accessible through the page-local facade:

```sh
agent-browser --cdp 9229 eval 'await window.mapleWebMCP.invoke("get_world_state", {})'
```

That fallback does **not** make tools visible to native `webmcp list`; it requires an agent with page evaluation access. The module does not forge a native API, create a remote MCP server, or automatically connect a cloud chatbot to the page.

## Scope and verification

Object patches affect the current game session and have explicit undo. Story choices, object tasks and station duty checkpoints persist in browser storage; named level saves and selected preferences also survive reload. Game controls can be changed again, but restoring a control value does not undo completed story actions. There are no network, filesystem, account, or arbitrary-code execution tools. Returned scene names may contain untrusted text; tool definitions are fixed.

Run `pnpm test` from the workspace root for the test suite through Turborepo. To run only this module, use `pnpm --filter @maple-line/game exec node --test tests/webmcp.test.js`. The test source is `apps/game/tests/webmcp.test.js`. The tests cover both registration APIs, native callbacks, malformed arguments, cancelled calls, cleanup, fallback behavior, and a contaminated object-name fixture. Browser evidence belongs in `artifacts/localhost/game-control/eval-report.md`; unit tests do not establish native browser availability or visual results.

The game-control schema exposes Scenic, Follow, Driver, and Orbit cameras. Door, emergency-brake, HUD, and AI-life controls are available in the player UI but do not currently have distinct WebMCP actions. Read their current state through `get_world_state` where included in the store snapshot. The optional [Jev director](AI-DIRECTOR.md) is a separate bounded decision service, not a WebMCP client.

The local [Maple Line development skill](../.agents/skills/maple-line-dev/SKILL.md) describes source locations, inspection, and verification.

`plan_clinic_delivery` accepts `inspect`, `later-clinic` or `shared-van` at the pending Momiji task after its reply. Inspection must precede a proposal. Both proposals remain unconfirmed, preserve the clinic crate, and use the same station/speed/object gates as the UI. `get_story_levels` exposes the chosen plan and tag state; `get_world_state` includes live point alignment and occupancy through `railwayPoints`.

### Excursion route tools

- `get_route_state({})`: returns selected physical path, confirmation, current approach board, action availability, speed limit, measured branch distances and continuous-traversal status.
- `choose_route({ route: "direct" | "wetland" })`: uses the UI’s stopped-train request. Stop at z2250 outbound or z2950 inbound, close the doors, release emergency braking and finish any conversation. Changes inside the occupied branch are rejected. The action changes actual rail sampling; it is not a visual object patch.

Use `set_game_control` to visit the board for inspection, then drive through the branch to verify traversal. Teleporting into or across the branch must not mark it complete. `sample_route` reports the selected physical path. Route permission and notes are session state, not saved campaign facts.
