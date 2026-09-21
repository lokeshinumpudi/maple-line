# Maple Line project guidance

Maple Line is a standalone Three.js Japanese countryside railway game. Its optional Signal Ship build uses a site-scoped world-generation function and database; it has no connection to production application data. See docs/HOSTING.md for hosting targets.

Read [README.md](README.md) for current features and limits. For implementation or inspection work, use the local [Maple Line development skill](.agents/skills/maple-line-dev/SKILL.md). Detailed design plans live in [docs/WORLD-PLAN.md](docs/WORLD-PLAN.md); planned features are not evidence of implemented behavior.

## Working here

- Use pnpm from the workspace root. The version is pinned in `package.json`.
- `apps/game` owns the browser application and its tests. Root scripts delegate to Turborepo. Add shared packages only when there is a real second consumer.
- `apps/director` owns the AI SDK 7/Jev decision server. Its key stays in the root gitignored `.env`; Vite proxies calls from the game. Read `docs/AI-DIRECTOR.md` for the bounded decision contract and local fallback.
- Use `pnpm dev` for the local game at `http://127.0.0.1:4173`. Vite uses a strict port so it cannot silently open a different game address.
- Format with `pnpm format`; verify changes with `pnpm check`. For UI, rendering, or module-path changes, also load the game in a dedicated browser and inspect console errors and visible behavior.
- Do not edit generated `dist`, `dist-readable`, `.turbo`, or dependency directories. Source maps point back to authored modules.
- Keep runtime state in Zustand and update it through the store methods. Three.js objects stay outside the serializable store.
- Scene-inspector object patches are temporary. After confirming a visual change, apply it to source if the user wants it retained.
- Keep current status distinct from future world plans. Native WebMCP availability depends on the browser; the page fallback is not native tool discovery.

## Browser sessions

Use the dedicated Chrome Agent session on port 9229 when available. Leave everyday Chrome and port 9222 alone unless the user explicitly requests them. Select the game tab before running game commands; do not close unrelated tabs. The Codex in-app game tab can also be used through its supported browser tools.
