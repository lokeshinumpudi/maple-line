# Character motion

How the Momiji cast (Mr. Sato, Riko, Mr. Ishida) move and hold things. It applies to both model kinds the game loads: the VRM figures (default) and the Blender GLBs (`?cast=blender`). The instanced crowd is not affected.

The population simulation still decides where each person goes. The code described here only decides how the body gets there and what its hands, feet and head do on the way.

## Clips

The VRM figures play the Quaternius Universal Animation Library (UAL 1 and 2, CC0), retargeted offline into one file, `models/characters/vrm/cast-clips.vrma` (350 KB, 17 clips). The Blender GLBs keep their own clips inside the GLB; those clips are no longer used on VRMs. Provenance is in [third-party files](../asset-src/THIRD_PARTY.md).

| Game clip                | UAL source                                                                | Notes                                                   |
| ------------------------ | ------------------------------------------------------------------------- | ------------------------------------------------------- |
| idle                     | `Idle_Loop`                                                               |                                                         |
| chat                     | `Idle_Talking_Loop`                                                       |                                                         |
| walk                     | `Walk_Loop`                                                               | 0.98 m/s for the 1.8 m mannequin, scaled by hips height |
| walk-formal              | `Walk_Formal_Loop`                                                        | Mr. Sato's walk                                         |
| walk-carry               | `Walk_Loop` legs, `Walk_Carry_Loop` arms (in step)                        | Riko walking with the radio; no arm swing               |
| hurry                    | `Walk_Loop` at 1.4 times the cadence, half of `Jog_Fwd_Loop`'s upper body | `Jog_Fwd_Loop` alone is a 5.4 m/s run                   |
| sit, sit-enter, sit-exit | `Sitting_Idle_Loop`, `Sitting_Enter`, `Sitting_Exit`                      | The transitions play once                               |
| check-phone              | `Idle_TalkingPhone_Loop`                                                  |                                                         |
| watch-train, shelter     | `Idle_FoldArms_Loop`                                                      | shelter is an alias: no extra bytes                     |
| board                    | `Interact`                                                                | A reach for the door button                             |
| wave                     | `Idle_Loop` with the calling arm of `Idle_Rail_Call`, forearm swung       | UAL has no wave                                         |
| stretch                  | `Idle_Loop` with the arms of `Pistol_Aim_Up`, eased in and out            |                                                         |
| nod-yes, shake-no, eat   | `Yes`, `Idle_No_Loop`, `Consume`                                          | Acting notes only (below)                               |

`asset-src/characters/vrm-cast/retarget.mjs` builds the file. It reads the UAL packs from `--ual <folder>`, `$MAPLE_UAL_DIR` or `~/Downloads/maple-assets/quaternius`; nothing from the packs is committed except the output. The mannequin's rest is a T-pose, so the rest correction is the identity: its rest body counts as the VRM's rest body. Finger joints are mapped and kept, root motion is dropped (the `_Standard` files have none), walking speeds come from the `_RM` files' root travel, and the seat height is measured on the mannequin's skinned body in `Sitting_Idle_Loop`. Keys are sampled at 30 fps, and every key is stored in the previous key's hemisphere (a key and its negation are the same rotation, but interpolating across a sign flip turns the long way round). Finger tracks get one (1, 2, 1) smoothing pass, because UAL keys some finger closes within a frame (`Consume` snapped at 1,391 rad/s²). Keys are then dropped where linear interpolation stays within 0.25° (0.6° on fingers, 1.5 mm on the hips).

At load, `smoothQuaternionTracks` (`character-motion.js`) swaps each clip's linear quaternion interpolation for a monotone cubic through the same keys. Linear interpolation steps the angular velocity at every key, which a 60 Hz frame reads as an acceleration spike; the cubic has continuous velocity, never overshoots a key, and keeps a hold exactly still. Loops take their end tangents across the seam. This roughly halved the jitter figure of every clip, layers on or off.

Acting notes (`direct_npc`, an episode's `direct` cue) may also ask for `nod-yes`, `shake-no` and `eat` (`GESTURE_INTENTS` in `simulation/npc-minds.js`). Local rules and Jev never choose them, and a character showing one is reported to Jev as lingering. The UAL farm clips (`Farm_Harvest`, `Farm_PlantSeed`, `Farm_Watering`) are not built yet; they suit residents working fields, who are still instanced figures.

## Where the code lives

| File                                         | What it does                                                                                                                            |
| -------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/game/src/characters/humanoid-bones.js` | The one canonical bone vocabulary. Maps VRM humanoid bones, the Blender cast's joints, and any other rig (see below) to the same names. |
| `apps/game/src/world/character-motion.js`    | Two-bone IK, hand sockets and prop attachment, the steering layer, stride-matched playback and cross-fade lengths.                      |
| `apps/game/src/world/character-rig.js`       | The per-frame layers: breathing and weight shift, look-at, hand holds, grip curl and foot planting. Also the clip blender.              |
| `apps/game/src/world/hero-cast.js`           | Puts it together for each cast member. Its public calls (`update`, `talk`, `getState`) are unchanged.                                   |

## Canonical bones

Motion code only asks for these names:

- Body: `hips`, `spine`, `chest`, `upperChest`, `neck`, `head`
- Each side (`L`, `R`): `shoulder`, `upperArm`, `lowerArm`, `hand`, `upperLeg`, `lowerLeg`, `foot`, `toes`, `eye`
- Fingers (optional): `thumbL1`–`3`, `indexL1`–`3`, `middleL1`–`3`, `ringL1`–`3`, `littleL1`–`3`, and the same for `R`

IK, look-at and planting need the ones listed in `REQUIRED_CANONICAL`. Shoulders, toes and fingers are used when present. The bone the shoulders hang from counts as the chest for breathing and look-at (`upperChest` if the rig has one).

### Adding a new rig

A new skeleton plugs in by naming its joints. `humanoidRigFor(root, mapping)` tries, in order:

1. a `mapping` table passed in code (`{ hips: 'pelvis', handL: 'hand_l', … }`);
2. a `boneMap` object in any node's glTF extras (the Blender build writes one on its armature);
3. the Blender cast's joint names;
4. common conventions: Mixamo (`mixamorig:LeftForeArm`), Unreal and Quaternius UAL (`upperarm_l`, `spine_03`), MPFB/MakeHuman (`upperarm01.L`), Rigify (`DEF-thigh.L`);
5. structure: a hand's parent is the lower arm, its parent the upper arm, and the same for legs.

VRM files need none of this; `vrmHumanoidRig` reads their humanoid table. For a VRM the layers write the normalized bones, and three-vrm copies the result to the skin in `vrm.update()`. `vrm-actor.js` calls the layers through its `afterPose` hook, after the clips and posture and before that copy.

## Hands and props

Each hand gets a socket, `socket.hand.L` or `socket.hand.R`, made at load from the bind pose:

- origin at the palm centre, 0.3 forearm lengths past the wrist;
- +Y along the fingers, +Z out of the palm (toward the body when the arm hangs, down in a T-pose), +X = Y × Z.

The Blender build uses the same rule, so its props are stored in socket space. Phone, radio and the reader's paper are separate nodes with extras (`prop`, `hand`, `hold`, and `grip2` for a second hand). The character GLB includes them, and `models/characters/props/<cast>.glb` has them alone (2–6 KB) so the VRM figures hold the same props. A prop is attached to its socket, so it moves with the hand.

- **One hand:** Sato's phone (right), Riko's radio (left, by its handle).
- **Two hands:** the reader's paper is held by the right hand; the left hand reaches its `grip2` point by arm IK.
- **Cradle:** while standing still, Riko brings the radio up in front of her with both hands, and lets it down again to walk. The pose is defined in `PROP_GRIPS` in `character-motion.js`.
- **Tuned grips:** `characters/cast-tuning.json`, written by the [character studio](CHARACTER-STUDIO.md), overrides a model's grips (offset, rotation, hand, hold, second-hand point, cradle). Riko's radio is turned 90° in her hand so it hangs from its handle in `walk-carry`; `cradle.rotation` turns the cradling hand back so the cradle keeps its look.
- **Pocket:** Riko's phone only appears while she checks it (`pocketed` in `MOMIJI_CAST`).
- **Grip:** a hand holding something closes on it. The grip owns a hand's fingers only while that hand holds a prop: it blends from the clip's fingers to a fixed grip pose (0.55 rad a joint, 0.3 on the thumb, about the palm's across axis) along a critically damped spring, about 0.25 s, and back again when the prop goes. An empty hand keeps the UAL finger motion. The earlier rule topped every joint of both hands up to a minimum bend, which kinked the finger curves each time a clip's finger crossed it (250–470 rad/s² in sit-enter, sit-exit and check-phone). The Blender figures, which have no finger bones, use `grip-l` and `grip-r` shape keys.
- **Carry:** Riko walks with `walk-carry`, whose arms stay in front without a swing. The radio stays in her left hand and no arm IK runs while she walks; standing, she cradles it again. While she carries it, watch-train, shelter and stretch play as the idle under the cradle (`carry` in `MOMIJI_CAST`): the folded arms and the arms overhead wanted the same hands and pushed the radio out while blending.
- **Cradle release:** the cradle comes up gently (3.5 rad/s spring) but lets go in about 0.6 s, so a clip that takes the hands next (board) is not fought for a second and a half.

## Walking and turning

A steering layer sits between the simulation position and the drawn body:

- The body only moves forward along its heading, so it can never step backward.
- Turns ease in and out (turn rate 3.4 rad/s walking, angular acceleration limited). A turn of more than 60° from near standstill stops the body and turns it on the spot. The Blender figures play a `turn` clip (small steps) for this.
- Acceleration and braking are limited; arrival brakes early enough not to overshoot.
- A low-passed copy of the simulation position decides when a standing body sets off (more than 22 cm away) and closes the last centimetres slowly. Frame-to-frame jitter cannot make a standing person shuffle.
- Jumps of more than 3.5 m (Places, alighting at a door) teleport the body. Seated and boarding people follow the simulation exactly.

The walk and hurry clips play at the body's real speed divided by the model's own foot speed (`walkSpeed`, `hurrySpeed`, and a speed for each walk variant). Walk and hurry blend in step. The switch to hurry sits at the midpoint of the model's two speeds, but never below 1.35 m/s (`HURRY_FROM`), with 0.1 m/s of hysteresis either side. UAL's walk is slow for these figures (0.9 m/s for Riko, 0.95 for Mr. Ishida, 1.0 for Mr. Sato), so the midpoint alone put Mr. Ishida into the hurry at the residents' ordinary 1.05–1.3 m/s. The walk plays up to 1.7 times its authored cadence, which covers every figure up to the boundary.

Cross-fades: each playing clip's weight follows a critically damped spring toward 1 (the current clip) or 0, all with one stiffness, and the weights are normalised to sum to 1. A fade that changes direction halfway carries on from its present weight and speed instead of restarting. The stiffness comes from the pair's fade length: 0.35 s between gaits, 0.4 s setting off, 0.5 s stopping, 0.7 s into or out of the sit loop, 0.3 s into sit-enter and sit-exit. A mind's intent must hold 1.5 s before the body changes gesture.

Sitting down plays `sit-enter` once and then the sit loop; standing up plays `sit-exit` while the body waits on the spot, then walks on. The UAL sitting pose puts the pelvis 0.31 m behind the figure origin (for Riko's size), so a seated body moves forward by that much, and lifts to the bench height as its hips go down. `sit-exit` ends standing over the feet, still 0.31 m in front of the seat, so the steering body is moved there when it ends (the drawn root does not move) and stays there until the simulation moves the person on. Easing the root back onto the seat point instead dragged both planted feet 0.17–0.27 m across the ground in the next gesture. The steering layer also forgets the walk that led to a hold (seated, boarding), so a stale velocity does not lead the body off when it stands up.

## Feet, head and idle life

- **Feet:** while walking, the foot that is moving least over the ground is pinned where it landed until the other foot has landed. Standing, both feet are pinned. Leg IK holds them, and the hips drop (on a stiff spring) when a bearing foot would be out of reach. A foot plants over 0.12 s and lets go over 0.2 s, both eased. A foot left more than 0.3 m behind (a turn on the spot, a clip that steps) is let go smoothly and planted again, instead of snapping across; the farther it has to go, the longer the release (at most 0.6 m/s, up to 0.6 s). A foot that lands again before its last plant has let go (hurrying steps outrun the 0.2 s release) is pinned where it is drawn, not pulled back to the lock a stride behind. Standing, a planted foot also keeps the orientation it landed with, so the IK's small leg corrections do not rock the ankle. Targets near full leg stretch are eased back toward the hip (soft IK), because the solver is unstable when the knee is straight.
- **Look-at:** the head and neck turn toward someone talking nearby, the person this character is talking to, the camera when a director portrait frames them, or the train when the mind says so (within 140 m). Turns are limited to 1.2 rad either side (0.6 while walking), split 40% neck and 60% head. Yaw, pitch and weight follow critically damped springs, and the aim only moves when the wanted direction leaves a 0.05 rad dead zone, so a speaker's head bob does not shake the listener's head. Look-at owns only the neck and head. VRM eyes follow the same point.
- **Arm IK** blends the two joint rotations by its weight (not the target position), so an IK hold that fades out moves the arm less and less and never pops when it stops.
- **Idle life:** breathing lifts the chest and shoulders, the hips sway slowly over one leg and back, and the head drifts. Periods and phases are random per person, so two people never move in step.
- **Posture:** Mr. Ishida's stoop (9°, `posture` in the VRM's scene extras) is taken off before the mixer and added again after it. three.js only writes a bone whose mixed value changed, and the rig puts back last frame's pose before the mixer, so a bone a clip held still was stooped again every frame: his neck spun in `eat` (neck and head 247 rad/s² against 15 on Riko and Mr. Sato).

## The back-and-forth fix

Two simulation rules walked Momiji passengers back and forth in director mode and episodes:

- When doors closed on a passenger walking to them, the passenger turned straight round. They now stop and watch for 2.5 s first (`missed-door`), and board if the doors reopen.
- A mind or director that changed its mind about shelter moved waiting passengers to the canopy and back again. A shelter decision now holds for 6 s, and a walk to the canopy is finished before turning back.

## Measured change

Momiji, both people walking to the canopy and back, 30 s at 30 fps on a virtual clock:

| Build                         | Foot slide (slowest heel or toe, share of distance walked) | Largest heading change in one frame |
| ----------------------------- | ---------------------------------------------------------- | ----------------------------------- |
| Before, Blender cast          | 32%                                                        | 180°                                |
| After, Blender cast           | 9–10%                                                      | 6.5°                                |
| VRM cast, Blender-made clips  | 10.6–10.8%                                                 | 4.6°                                |
| VRM cast, UAL clips           | 2.4–4.8% (Sato, Riko)                                      | 4.6°                                |
| VRM cast, UAL, feet layer off | 12–15%                                                     |                                     |

Jitter: root-mean-square angular acceleration of each rendered joint's local rotation, rad/s², 60 fps, 5 s standing and 12 s walking, averaged over bone groups. One fresh session per condition, so layers off and on see the same events. Riko first, then Mr. Sato.

| Scenario | Bones         | Blender clips, layers on | UAL, layers off | UAL, layers on |
| -------- | ------------- | ------------------------ | --------------- | -------------- |
| Idle     | Arms          | 751 / 1,253              | 2.5 / 2.3       | 2.7 / 2.1      |
| Idle     | Legs          | 2.2 / 6.1                | 2.1 / 2.4       | 2.1 / 1.9      |
| Walk     | Arms          | 1,299 / 1,191            | 1.7 / 5.8       | 1.8 / 5.7      |
| Walk     | Legs          | 421 / 391                | 77 / 72         | 53 / 39        |
| Walk     | Neck and head | 33 / 30                  | 4.9 / 2.7       | 4.9 / 2.7      |
| Sit      | Legs          | 2,357 / 1,580            | 0 / 0           | 0 / 0          |

The Blender-made clips shook the arms and head even with every layer off; that was most of the unsteady look. Two layer faults added to it: the rig reset each bone to its rest pose before the clips ran, and three.js does not rewrite a bone whose mixed value has not changed, so bones held still by a clip dropped to the rest pose after a cross-fade settled; and foot IK stretched the leg straight when a releasing foot stayed pinned behind the body. The rig now restores the clips' own last pose instead, and a releasing foot never pulls the hips. The first fault is also what showed Riko and Mr. Sato in a T-pose, and Mr. Ishida standing at the bench, in episode renders; `tests/hero-pose.test.js` runs the hero update at the render step and checks that the arms hang and that seated Mr. Ishida's hips are at the bench. With the UAL clips, every bone group is within 10% of the layers-off value except Riko's hands (0.8 to 1.7 walking, 0 to 1.9 standing): the radio cradle and grip, well under 2 rad/s². Foot IK lowers leg jitter while walking, because the planted foot no longer slides.

The measurement scripts are kept with the captures (`artifacts/screenshots/ual/motion.mjs`, not committed): they switch layers through the hero's development `setDebug({ layers })` and read bones through `window.__mapleHeroes`.

### Motion audit

The [character studio](CHARACTER-STUDIO.md)'s `measure_jitter` on every VRM clip, 3 people × 18 clips: every clip with all layers on (steering included), then every clip with all of them off, in the studio's clip order. Loops are sampled for 2 s, one-shots over their own length. The same metric as above (rendered joints, 60 Hz), with the studio's 1.5 s settle before each clip. The scripts and full JSON are in `artifacts/screenshots/motion-polish/` (not committed).

| Case                              | Before, on | Before, off | After, on | After, off |
| --------------------------------- | ---------- | ----------- | --------- | ---------- |
| check-phone legs (Riko, Sato)     | 14.7, 12.3 | 1.4         | 0.5, 0.4  | 0.5        |
| check-phone foot slide in 2 s (m) | 0.17–0.27  | 0.03        | 0.002     | 0.02       |
| eat neck and head (Mr. Ishida)    | 246.9      | 246.8       | 10.4      | 10.4       |
| hurry legs (Mr. Sato, Mr. Ishida) | 103.6, 81  | 109.7       | 62.5, 63  | 92.5       |
| board legs (Riko)                 | 2.6        | 2.4         | 1.0       | 1.1        |
| idle legs (Mr. Sato)              | 2.6        | 2.3         | 0.8       | 1.0        |
| walk legs (Riko)                  | 38.2       | 57.4        | 35.0      | 47.5       |
| largest finger joint, sit-enter   | 365        |             | 117       |            |
| largest finger joint, check-phone | 179        |             | 55        |            |

After the change every bone group with layers on is within 10% of layers off, or lower, for all 54 clip and person pairs. check-phone's large figures came from the clip before it in the audit, `sit-exit`: the root eased back 0.31 m onto the seat point while both feet were planted. Mr. Ishida's `eat` was the stoop re-added every frame. Hurry's extra leg jitter was feet re-planting on a stale lock at a quick cadence.

Joints still over 60 rad/s² in standing clips are in the clips themselves (the same with layers off): chat's gesturing right arm (82), board's reach (86), wave's forearm swing (121), shake-no's head (129), nod-yes's left forearm (101) and step (102, 263 with the feet layer off), and eat's hand closing on the food (436 on the fingers). These are the gestures, not layer faults. `tests/hero-pose.test.js` guards the two worst faults: the stoop in `eat` and the feet after standing up, and checks that every rotation track in the clip file stays in one hemisphere.

## Limits

- Haru and Emi in the campaign (`narrative/story-cast.js`) are a separate instanced-box figure system. None of this applies to them yet; their recorder, notebook and spanner are still fixed to the body.
- The Blender figures have no finger bones and paddle-shaped hands; the grip is a shape key, not a real fist.
- The cradle pose and grip points are tuned for these three people. A new cast member needs its own `PROP_GRIPS` entries or props with extras.
- The VRM clip set has no `turn` clip, so VRM figures turn on the spot in their idle pose; a foot left behind lets go and plants again.
- UAL's walk is slower (0.9–1.0 m/s for these figures) than the residents' 1.05–1.29 m/s, so walks play up to 1.7 times faster than authored before the hurry takes over. The hurry clip is a quicker walk with a forward lean, not a run.
- Carrying the radio, Riko shows watch-train, shelter and stretch as the cradled idle: she does not fold her arms or stretch while she holds it.
- `wave` and `stretch` are spliced from other clips; the stretch keeps the hands in front of the face rather than overhead (Mr. Sato and Mr. Ishida).
- Sitting down still eases the root forward onto the seat while `sit-enter` plays, with the feet unplanted, so the feet move forward about 0.3 m as the person sits.
- The studio clip corrections (`studio-tuning.json`) are empty, so none are baked into the clip file yet.
- Only Mr. Ishida sits in the simulation. Sitting down and standing up were checked on him in the game (standing up) and in tests (both).
