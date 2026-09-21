# HUD, places and driving controls

Updated 21 September 2026.

## Player flow

The header keeps Places, Sound and Settings available on both the welcome screen and the running game. The existing notebook stays beside them. Places opens seven illustrated cards for the gorge, terraces, Aonuma lake, valley bridge, summit, Minato harbour and Tokyo. On mobile, Controls reveals the header; Places and Sound remain beside Settings while it is open. Every stop and viewpoint is available below the cards. Create a world also lives in this panel; the welcome screen retains its direct Create a world entry.

Destination choices use the existing location action, so unfinished station work can still block travel. Choosing a destination closes the picker. Escape closes it and restores focus to Places. The dialog pauses simulation and sound through the existing presentation state.

Settings has three keyboard-navigable tabs: Atmosphere, Train & ride, and Controls. Weather, daylight, volume and sound credits belong in Atmosphere. Ride mode, background life, lights, wipers and session actions belong in Train & ride. Camera selection remains on the ride dock.

## Sound

Sound is on by default, with Play train & nature sounds checked on the welcome screen. Start riding, Begin story and Resume story request audio from their click when checked. The browser waits for that gesture before playing; the header reflects the enabled preference before playback begins. Unchecking it leaves the ride silent. Sound on/off stays visible on the main HUD, so players can enable it without opening a dialog that pauses the mix. The volume slider is saved as a bounded preference; audio activation itself still requires a new gesture after reload. Muting also updates the welcome choice so restarting does not undo that choice within the session.

## Driving

Drive yourself reveals a controller with B5–B1, Coast and P1–P5. Taking over from auto-drive selects Coast. The slider and keyboard use the same requested power/brake path. Demand never applies both together; doors and emergency braking retain their interlocks.

The applied-effort meter shows actual traction or braking rather than instantly mirroring the lever. Movement feedback distinguishes traction building, acceleration, steady motion and braking. The full-service-brake distance estimate uses speed, weather adhesion and slope, with a short response allowance. It omits future changes in grade and grip and is labelled as an estimate.

Up/down move one notch, X coasts, E controls emergency braking and Space pauses. X, E and Space also work while the lever has focus; native Home/End and arrow keys adjust the slider. The existing physics owns momentum and speed. This HUD change does not set speed directly or change the train's physics constants.

## Verification

The browser record is [hud-driving-sound-check.json](../artifacts/localhost/game-control/hud-driving-sound-check.json). It checks seven decoded recordings and nonzero output after Start riding, zero output after mute and at zero volume, controller positions and applied effort, Aonuma travel, settings tabs, Escape focus, mobile overflow and page errors. Tests run in an isolated context attached to Chrome Agent on port 9229, against the production preview.

Screenshots cover [Places on desktop](../artifacts/screenshots/places-picker-desktop.png), [Places on mobile](../artifacts/screenshots/places-picker-mobile.png), [driving on mobile](../artifacts/screenshots/driving-hud-mobile.png) and [Settings](../artifacts/screenshots/settings-desktop.png). The focused automated tests cover notch exclusivity, retained momentum, braking estimates and volume validation.

The production build and browser checks succeed. One verification run passed all 369 game tests, including the new controller and volume tests. A subsequent full check during concurrent edits failed city ownership and wildlife tests, plus formatting of a generated evidence file. The final HUD browser check and 11 focused controller/preference tests passed. Listening comfort on speakers and headphones remains a separate review.

Places images are captured from their actual route positions and stored in `apps/game/public/images/places`. Capture locations are recorded in `artifacts/localhost/game-control/places-captures.json`. Manual driving uses one lever; the duplicate Brake/Coast/Power button row has been removed.
