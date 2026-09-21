# Railway adventures

The story gives Haru a reason to travel. Railway duties give the player something to do between conversations. A task should involve a visible person, object, train, or weather condition, and finish with a consequence the player can see.

## Playable now: Momiji’s passenger service

After the third conversation, Nao’s bread and the passengers need to reach the mountain villages. The player checks the passenger service, opens the actual animated train doors, allows three seconds of fully open boarding time, closes the doors, and asks for the line. A blue local passes on the adjacent loop for twelve seconds. The departure signal stays red until the local has cleared; the player then explicitly departs.

Selecting the freight service prompts a correction. It does not fail the whole story. Movement is held during the task, including attempts to apply power. The story shortcut cannot bypass it. The physical boarding population remains the original Momiji simulation; the three-second requirement is a game dwell, not a claim that every simulated pedestrian has reached a seat.

The route card currently checks the correct service. It does **not** switch the player onto a separate branching railway. The passing train does use a separate rendered siding whose movement and rails share a curve. The separate Kawasemi excursion branch below provides two physical player paths, whole-train route locks and route-aware cameras. General junction networks with competing-service occupancy remain outside its scope.

Duty progress shares the story checkpoint. Reloading restores unfinished work at Momiji with closed doors; partial boarding restarts its dwell, and interrupted or green clearance requires a fresh passing-train wait. Completed dispatch remains complete. The free-exploration mode does not impose the task.

## Next adventures to build

| Adventure                  | Player action                                                                            | Visible consequence                                                                              |
| -------------------------- | ---------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| The late connection        | Select a platform route at a signal box, verify the points, approach at restricted speed | A waiting passenger catches the connection; the chosen track is physically different             |
| Emi’s bridge recording     | Coast onto the bridge, keep the horn quiet, and hold a steady speed                      | The recorder fills with wheel and river sound; a new audio memory enters the notebook            |
| Nao’s bread run            | Load a crate at Momiji and unload it at the mountain café                                | The café opens; Nao hears what people thought of her new recipe                                  |
| A satchel left behind      | Inspect a lost bag’s ticket and return it at the matching village                        | Its owner changes their evening plans and tells Haru a story                                     |
| Snow at the points         | Stop at a protected marker, request an inspection, wait for a worker’s clearance         | A visible worker clears the switch; the signal changes only after the route is safe              |
| The last market train      | Choose whether to hold for a running stallholder                                         | A short delay affects the next meeting, without ending the game                                  |
| Lantern deliveries         | Match parcels to villages using names and small clues                                    | Lanterns appear in homes along the evening return trip                                           |
| A crossing blocked by deer | Brake gently and wait without sounding the horn repeatedly                               | The herd crosses and disperses; Emi adds a quiet observation                                     |
| Fumi’s borrowed tool       | Find the workshop, return the spanner, help repair a station bench                       | The repaired bench remains in the world and its owner uses it                                    |
| A concert this time        | Plan the return service and manage station dwell                                         | Haru arrives for a family performance; no repeated regret cutscene replaces the player’s actions |

These are proposed adventures, not completed features. Start with one physical junction and one parcel interaction before expanding the list. Share their interaction rules with WebMCP so agents can inspect occupancy, request actions, and test rejection conditions without inventing world state.

## Pacing

Alternate a short conversation, a stretch of controllable travel, and a small task. Keep scenery visible while choosing replies. Offer automatic driving for players who want to listen, and manual controls for players who want braking and stop accuracy. Optional travel shortcuts should skip empty distance, never unfinished choices or an active safety task. Avoid timers that punish slow readers.

## Clinic proposal and visible points

Momiji now requires inspecting the clinic crate after Nao’s reply, then recording a proposed 10:00 clinic handoff or a shared road van. Both remain awaiting confirmation. The chosen tag colour and proposal persist; the crate is not awarded as delivered. The player can use the task buttons, and agents use `plan_clinic_delivery` with the same gates.

The two loop throats have animated point blades, linked levers and route indicators. Selecting freight requests the loop alignment; passenger requests the main alignment. The opposing train’s wait cannot progress before the loop points settle, and departure cannot proceed until the points return to the main line. Player-train and visible passing-car footprints lock movement in an occupied throat. Main state exposes this through `railwayPoints`. This is a local visual and permission model; the player still drives the existing main route, so a drivable branching route and general interlocking remain unfinished.

## Playable route: Beyond the platform

The approach board at z2250 offers direct and wetland tracks. The physical branch runs z2460–2760 and rejoins before Kawasemi at z3100. It is an explicit fictional excursion arrangement. Selection resolves locally once the train is stopped, the doors are shut, no conversation is active, and the entire train is clear of the branch. This is not a network dispatcher or a simulation of competing services on this new branch.

`simulation/route-network.js` is a reusable two-path adapter. It retains the original curve outside the branch, measures the offset curve’s own arc length, preserves carriage positions at safe selection points and rejects changes through occupied points. The same curve supplies branch rails and carriage motion. `route-choice.js` stores current permission and traversal in Zustand. Root integration remaps stops, invalidates the story’s cached stopping target, and supplies current length to the camera. Manual control retains the local speed limit and route-board protection. The optional task does not replace the existing Momiji passing-train duty.

`narrative/route-choice-data.js` supplies the original unvoiced introduction, consequences and arrival questions. A completed drive exposes optional route notes. Selection is not proof of traversal or of a conversation with a passenger. The notes do not claim a bus connection is approved, a recording was made, or a passenger’s access problem was solved. Session-only route progress does not alter existing campaign saves.

`world/wetland-route.js` shares geometry with the driving curve and water shape with `simulation/wetland-profile.js`. The regional terrain is sampled more closely only near the channel. The footbridge, continuing path and bench can be seen together. New water has no additional reflection render pass. The original river retains its existing reflection/refraction renderer.

Agent tools `get_route_state` and `choose_route` use the same state and gates as the buttons. `sample_route` follows the selected path. The scene inspector exposes water profile, landmarks, branch length and traversal status. A new branch still requires authored code and terrain validation; visual `edit_level` patches cannot create a driveable route graph.
