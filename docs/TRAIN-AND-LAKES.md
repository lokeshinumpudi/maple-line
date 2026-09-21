# Train interiors and regional lakes

The camera menu has **Inside the train** and **Lake & valley view**. Drag in Driver or Inside the train to look around. The camera stays attached to its carriage on grades, curves and reverse trips. Passenger view remains inside in tunnels; exterior views temporarily switch to Driver.

Options → Visit a location includes **Aonuma waterfall lookout** and **Hoshimi twin falls**. Selecting either also chooses the lake camera. Away from a lake, Lake & valley view looks across the valley. The existing driving controls operate the train; the dashboard needles display speed, traction and braking and are not clickable controls.

Carriage windows have actual openings in their body panels and transparent glazing. The interior contains benches, grab poles, swaying straps, overhead racks, bags and books. Twelve through passengers stay aboard. Nine additional seats show the named local population while its state is `riding`; they disappear when those people alight. Regional platform visitors still use their existing separate routines.

Aonuma has three cascade tiers, reeds and cedar islands. Hoshimi has two falls with three tiers each, snowy rocks and an alpine shoreline. Minato has an irregular tidal inlet. The terrain, water and shoreline dressing use the same radial field. Water and foam animate through material uniforms and bounded instances; this is a visual effect rather than hydrodynamic simulation. The existing five-chunk limit owns these resources and disposes them when the train leaves.

## Verification, 21 September 2026

- 49 focused tests pass, covering train openings and door movement, passenger state, dashboard response, camera anchors and lens restoration, terrain/shoreline agreement, pause, chunk disposal, preferences and agent controls.
- The final workspace check passes all 13 tasks: 321 tests (298 game and 23 director), lint, formatting and production build. Earlier story-test failures were resolved in the shared workspace during verification.
- Browser captures and control results are in `artifacts/localhost/screenshots` and `artifacts/localhost/game-control/train-lakes-browser.json`. Checked look-around, both waterfall settings, tunnel passenger view, moving rain wipers, and the actual camera/location menus. Menu evidence is in `artifacts/localhost/game-control/train-lakes-menu.json`.
- The initial headed-browser baseline at Aonuma used Scenic, clear daylight, a stopped train and a 1291 × 828 viewport at device scale 2. Its three-second sample reported 116.5 FPS with a 10.1 ms p95 frame interval. The Mac then locked, so final checks used a separate headless Chrome for Testing browser at the same viewport. The final three-second sample reported 120.0 FPS, 9.7 ms p95 frame interval, 1.9 ms p95 CPU time, and about 281 draws across all passes. Different browser modes prevent treating these as a before/after speed comparison. CPU timing is not GPU timing.
- The isolated verification server reported a missing favicon and a rejected director request from its alternate local origin. No JavaScript exception or shader error occurred in the completed rendering checks; the director used its existing fallback.

The implementation follows the installed Three.js r180 material and instance APIs. The [graphics reading record](graphics-research/sources.md) contains the primary references for instance updates, ownership, shader hooks and small water-normal variations.
