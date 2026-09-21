# Tokyo passage and Harumi transit frontage

Implemented 2026-09-21. The fictional city passage occupies route z = 22500–23100 before Harumi. At 45 km/h the 600 m section takes about 48 seconds. Places includes a featured Tokyo neon passage card; the agent location alias is `tokyo`.

## Research read

- [CDPR art directors Jakub Knapik and Kacper Niepokólczycki, interviewed by 80 Level](https://80.lv/articles/interview-how-cyberpunk-2077-s-night-city-was-built-almost-entirely-by-hand), 18 September 2026. Read the architecture, density, composition, and first-person scale sections. They describe different periods of architecture, deliberate color/detail groups, negative space, and familiar objects that establish scale. Their account distinguishes hand-authored locations from procedural starting points.
- [Treehouse Ninjas’ production account](https://www.treehouseninjas.com/project-cyberpunk2077.html). Read the environment-and-lighting workflow and multi-angle narrative-space discussion. The studio describes taking over 130 locations from draft art to lighting, with gameplay and day/night requirements considered together.
- [CDPR’s Update 2.1 notes](https://www.cyberpunk.net/en/news/49597/update-2-1-patch-notes). Read the metro feature description: players can ride the train and observe the city, alongside fast travel. This supports treating the passing view as an experience in its own right.
- [Jakub Knapik’s GDC lighting session](https://www.gdcvault.com/play/1027959/Advanced-Graphics-Summit-Cyberpunk-2077). Read the public session abstract only, which describes lighting choices driven by a dynamic day/weather cycle. The full talk was not reviewed.

## Application in Maple Line

These are our adaptations, not claims about CDPR’s implementation:

| Area            | Applied change                                                                                                                                                                                                                                                      |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Architecture    | Thirty lower shop buildings and fifteen rear towers; varied heights expose parts of the skyline. Service pipes, vent grilles, shutters, balconies, rooftop equipment and newer signs occupy different facade zones.                                                 |
| Color and light | Cyan, pink and amber signs form separate groups. Dark wall panels retain resting areas. Original Japanese shop signs use generated textures. Soft ground color comes from bounded transparent decals; rain changes asphalt roughness.                               |
| Street activity | Fifty-four cars and six buses use separated lanes. Ninety pedestrians walk with arm/leg motion; thirty pause beside shops with phones. Bags, different body heights and rain umbrellas distinguish silhouettes. These are decorative routines.                      |
| Station         | Harumi has a graphite canopy and flat station roof, cyan platform trim, magenta concourse edge, bilingual numbered wayfinding, ticket machines, an entrance concourse and ten waiting figures with luggage. The existing platform and story position stay in place. |
| Composition     | The railway corridor and platform walking lane remain open. Short foreground shops leave the train visible from Scenic; taller structures form the far background.                                                                                                  |

The game uses stylized procedural geometry and WebGL. Ground light decals approximate spill; they do not implement global illumination, ray-traced reflections, or Cyberpunk’s material and asset pipeline. Crowds do not navigate a city transport network, and ticket machines are scenery. No new story dialogue is added.

## Placement and resource contract

`world/tokyo-passage.js` uses seed 7319, generation version 2, and world metres. Fifteen fixed 40 m cells belong to the existing regional chunk containing their centre. The two owning chunks load through `extended-route.js`; there is no second streaming system. Static placement is independent of visit order. A world activity clock keeps the two sets of traffic synchronized after unload/revisit. Pause and open game menus stop that clock.

A shared city field makes a street shelf that follows the rail height, preserving the rail grade, and excludes trees inside the district. It fades over 40 m at the ends and from 105–150 m laterally. Harumi’s existing station terrace remains outside that field. Road and walking loops stay clear of the railway; equal traffic spacing prevents a bus catching another vehicle. Loops wrap at the ends of the district rather than modeling junctions or destinations.

Each owning chunk has at most 21 batches, four shared geometries, eleven materials and seven small generated textures. Dry weather hides the umbrella batches. Paused frames update the weather presentation without rewriting unchanged instance transforms. Disposal releases instance buffers, geometry, material and textures exactly once. No extra render pass or shadow-casting light is added.

## Verification

Five focused tests cover cell ownership/repeatability, terrain and station preservation, motion/pause/clearance, synchronized revisits, disposal, and the station’s clear boarding path. Browser captures and observations are stored in `artifacts/screenshots` and `artifacts/localhost/game-control`.

The early before image is a composition reference only. Concurrent train changes and a move from Chrome Agent to a dedicated Chrome for Testing session prevent treating the initial timing as a controlled cost comparison. Final observed timing is recorded separately; it is browser frame/CPU timing, not GPU timing or a hardware-independent performance promise.

Three warmed five-second moving samples at 1440 × 1000 physical pixels, Scenic, clear dusk, each beginning at z = 22700, observed 60.00 FPS and 16.8 ms p95 frame intervals. CPU p95 was 2.2–2.3 ms. All-pass draws averaged 377.6–379.0, with 295 geometries and 31 textures at the end of each sample. These counts include the rest of the loaded game. The snapshot used the concurrently updated five-car train and its automatic acceleration after a 45 km/h initial speed. No runtime exceptions were captured. The isolated preview reported an unrelated missing favicon and origin-rejected optional director requests; the local fallback continued.

The final `pnpm check` passed lint, production builds, formatting, and all 377 game tests. Rain pause-state comparison passed, the featured Places card reached z = 22520, and Driver traversal crossed the district chunk boundary. Screenshots include the city in clear dusk and rain, Driver view, and Harumi’s station frontage. After the timing samples, the ground decals were aligned to the road grade and station sign/apron placement was refined; these changes received focused tests and a further browser inspection.
