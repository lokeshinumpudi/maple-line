# Source control and publishing branches

Maintain one personal source repository: `lokeshinumpudi/maple-line`.
Use the personal GitHub account and the `github-personal` SSH host for pushes.
Signal hosting does not require a work GitHub repository.

| Branch           | Purpose                                   | Destination                              |
| ---------------- | ----------------------------------------- | ---------------------------------------- |
| `main`           | Shared game, embed SDK and runbook source | Common base for both editions            |
| `story/signal`   | Source selected for the internal edition  | Signal Ship game and runbook             |
| `story/personal` | Source selected for the public edition    | Personal Vercel game and website runbook |

Implement shared fixes on a short-lived `story/<change>` branch and merge the reviewed source into `main`. Merge `main` into each publishing branch when preparing that edition. Keep target-specific URLs in build configuration so fixes can be shared without changing links by hand.

A publishing branch records selected source, not proof that a deployment succeeded. Record the deployed commit and verification results when publishing. Creating or pushing these branches does not publish to Signal.

For Signal, build the game with `pnpm build:ship` and the guide with `pnpm build:runbook`. Update existing sites through file patches without deleting cloud assets.

For personal publishing, build the game with `pnpm build:public` and the guide with `pnpm build:runbook --personal`. Commit the generated personal guide to `lokeshinumpudi/website` on `master`; that existing repository owns the personal site. Follow the preview and production verification steps in [Hosting](HOSTING.md).

Commit authored source before publishing. Exclude credentials, local environment files, dependencies and generated game build directories. Use separate worktrees when checking out publishing branches so unfinished work is preserved.

The publishing branches were initialized from committed shared history on 22 September 2026. Existing uncommitted game and runbook changes were not included automatically; they need their own reviewed source commits before being selected for a release.
