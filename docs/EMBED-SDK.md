# Embed Maple Line

The runbook automatically loads the real Three.js game when its experiment comes into view. The SDK mounts an iframe with a small scene configuration API. It shares the game source and existing camera, weather, daylight and travel actions. It is not a separate game engine package or a public WebMCP endpoint.

Run `pnpm build:runbook --personal` for the public guide, or `pnpm build:runbook` for Signal. Each build creates a matching static game under `game/` and the SDK at `assets/maple-embed.js`. Publish those folders with the guide. The live game is the default experiment and loads as its section enters the viewport. The same panel switches between the live game and its simplified diagram. The first load downloads and initializes the game renderer; keep the teaching diagram available if WebGL or loading fails.

```js
import { mountMapleLine } from './assets/maple-embed.js';

const scene = mountMapleLine(document.querySelector('#scene'), {
  src: './game/index.html',
  config: {
    location: 'bridge',
    camera: 'follow',
    weather: 'clear',
    timeOfDay: 'daylight',
    paused: true,
  },
  onState(state) {
    console.log(state);
  },
});
await scene.ready;
await scene.configure({ weather: 'rain' });
await scene.configure({ paused: false });
console.log(await scene.snapshot());
await scene.setVisible(false);
scene.dispose();
```

Give the iframe container a height or aspect ratio. The runbook supplies responsive styling. Hosts should call `setVisible(false)` when the scene leaves the viewport and `dispose()` when removing it. The game also suspends drawing while its document is hidden. `paused` stops train travel; visibility suspension stops the rendering loop's work. These are different controls.

| Configuration | Accepted values                                             |
| ------------- | ----------------------------------------------------------- |
| `camera`      | `scenic`, `follow`, `cab`, `passenger`, `vista`             |
| `location`    | `gorge`, `terraces`, `station`, `bridge`, `summit`, `tokyo` |
| `weather`     | `clear`, `rain`, `snow`                                     |
| `timeOfDay`   | `daylight`, `dusk`                                          |
| `paused`      | `true`, `false`                                             |

The snapshot reports camera, weather, daylight, pause state, approximate speed and route Z, and latest-frame draw and triangle counts. Counts are not a timing benchmark. The development game has separate performance and world exploration tools, explained in chapter 37.

Messages require the parent window and the same origin as the game. Inputs are validated before configuration runs; unsupported fields and commands return errors. The bridge does not expose arbitrary code execution, scene mutation or the development inspector. It disables remote director requests and audio, and passes no storage adapter to preferences or story state. Embedded experiments do not read or replace the player's saved preferences and story progress.

This API controls views, scene conditions, wireframe, shadows, lens angle, exposure, fog density and the roughness of opaque train materials. Mesh construction, story actions and arbitrary object edits remain outside its contract. The schematic examples illustrate those concepts separately. Public builds send credits and field-guide links to `lokeshinumpudi.com`; internal builds retain Signal links.

Chapter presets live in `runbook/live-presets.json`. Every chapter has a relevant scene and labeled comparison controls. Architecture, audio and save chapters describe the limits of their visual reference rather than claiming to change those systems. Scenic mode supports mouse drag and wheel zoom; touch supports orbit and pinch. Cab and passenger views support looking around.

| Visual override | Accepted values                            |
| --------------- | ------------------------------------------ |
| `wireframe`     | boolean                                    |
| `shadows`       | boolean                                    |
| `fov`           | 35–90 degrees, or `null` for the game lens |
| `exposure`      | 0.5–1.8, or `null` for game lighting       |
| `roughness`     | 0–1, or `null` for the train materials     |
| `fogDensity`    | 0–0.015, or `null` for game weather        |

The snapshot also reports these overrides and camera position. A chapter switch resets previous visual overrides before applying its own preset. No measurement claims should be inferred from the embed's drawing counters; use the development performance tool for a timed sample.

## Inspection settings and future building tools

The embed configuration is shared by the runbook and other same-origin clients. `focus` selects `route`, `train`, `water`, `bridge`, `terrain`, `forest`, or `station`. In scenic view, the camera frames that subject and keeps mouse orbit and zoom available. Changing a surface setting preserves the user's camera angle.

`surface` selects `materials`, `clay` (plain gray shapes), `wireframe` (triangle edges), or `normals` (colors showing surface direction). `isolation: "subject"` hides unrelated objects until the next configuration restores them. These are temporary inspection settings, not edits to saved objects.

Water has independent `waterReflection` and `waterFoam` strengths from 0 to 1, plus `waterRipples`, `waterDepth`, and `waterSpeed` from 0 to 3. Defaults are 1. Water motion can run while the train stays paused. The water chapter builds the rendered result from riverbed, depth color, reflections, and moving ripples.

A future level editor can use this same inspection client alongside the existing [authored level tools](LEVEL-BUILDING.md). Those tools already own stable object IDs, validated edit batches, undo/redo, and browser-local saves. Keep editor commands separate from view configuration: inspecting a plain bridge should never overwrite its materials or save a level. The public embed currently exposes inspection only; it does not expose development authoring tools.

Additional inspection controls:

- `windStrength`: 0–3 or `null` for weather-driven strength. Changes the existing vegetation shader; forest inspection keeps its clock running while train travel is paused.
- `textureDetail`: boolean. Changes generated surface-color detail on the original valley ground, rocks and tree trunks. Other world systems own separate detail uniforms. It does not edit UVs or normal maps.
- `sceneryDistance`: 120–1,200 metres or `null` for the 720 m valley default. Changes original valley scenery visibility; extended-route chunk loading is separate.
- `await scene.inspect(x, y)`: casts a ray through normalized screen coordinates (both −1 to 1, default center). Returns state with a `selection` result containing the nearest visible mesh, hit position, distance and optional instance ID. It does not modify that object.

State snapshots include original valley batch visibility, extended-route loaded chunk IDs and the frame budget's current timing summary. They are session observations, not controlled performance comparisons.
