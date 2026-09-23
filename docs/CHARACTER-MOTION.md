# Character motion

How the Momiji cast (Mr. Sato, Riko, Mr. Ishida) move and hold things. It applies to both model kinds the game loads: the VRM figures (default) and the Blender GLBs (`?cast=blender`). The instanced crowd is not affected.

The population simulation still decides where each person goes. The code described here only decides how the body gets there and what its hands, feet and head do on the way.

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
- **Pocket:** Riko's phone only appears while she checks it (`pocketed` in `MOMIJI_CAST`).
- **Grip:** a hand holding something closes. Rigs with finger bones curl them; the Blender figures, which have none, use `grip-l` and `grip-r` shape keys.

## Walking and turning

A steering layer sits between the simulation position and the drawn body:

- The body only moves forward along its heading, so it can never step backward.
- Turns ease in and out (turn rate 3.4 rad/s walking, angular acceleration limited). A turn of more than 60° from near standstill stops the body and turns it on the spot. The Blender figures play a `turn` clip (small steps) for this.
- Acceleration and braking are limited; arrival brakes early enough not to overshoot.
- A low-passed copy of the simulation position decides when a standing body sets off (more than 22 cm away) and closes the last centimetres slowly. Frame-to-frame jitter cannot make a standing person shuffle.
- Jumps of more than 3.5 m (Places, alighting at a door) teleport the body. Seated and boarding people follow the simulation exactly.

The walk and hurry clips play at the body's real speed divided by the model's own foot speed (`walkSpeed`, `hurrySpeed` from the model). Walk and hurry blend in step. Cross-fades are eased and their length depends on the pair: 0.35 s between gaits, 0.4 s setting off, 0.5 s stopping, 0.7 s into or out of sitting.

## Feet, head and idle life

- **Feet:** while walking, the foot that is moving least over the ground is pinned where it landed until the other foot has landed. Standing, both feet are pinned. Leg IK holds them, and the hips drop when a pinned foot would be out of reach.
- **Look-at:** the head and neck turn toward someone talking nearby, the person this character is talking to, the camera when a director portrait frames them, or the train when the mind says so (within 140 m). Turns are limited to 1.2 rad either side (0.6 while walking), split 40% neck and 60% head, and eased in and out. VRM eyes follow the same point.
- **Idle life:** breathing lifts the chest and shoulders, the hips sway slowly over one leg and back, and the head drifts. Periods and phases are random per person, so two people never move in step.

## The back-and-forth fix

Two simulation rules walked Momiji passengers back and forth in director mode and episodes:

- When doors closed on a passenger walking to them, the passenger turned straight round. They now stop and watch for 2.5 s first (`missed-door`), and board if the doors reopen.
- A mind or director that changed its mind about shelter moved waiting passengers to the canopy and back again. A shelter decision now holds for 6 s, and a walk to the canopy is finished before turning back.

## Measured change

Momiji, both people walking to the canopy and back, 30 s at 30 fps on a virtual clock:

| Build                | Foot slide (slowest heel or toe, share of distance walked) | Largest heading change in one frame |
| -------------------- | ---------------------------------------------------------- | ----------------------------------- |
| Before, Blender cast | 32%                                                        | 180°                                |
| After, Blender cast  | 9–10%                                                      | 6.5°                                |
| After, VRM cast      | 9–11%                                                      | 4.6°                                |

Standing still, foot slide went to zero. The rest of the walking slide happens when weight passes from one foot to the other: the current walk clips have no real double-support phase.

## Limits

- Haru and Emi in the campaign (`narrative/story-cast.js`) are a separate instanced-box figure system. None of this applies to them yet; their recorder, notebook and spanner are still fixed to the body.
- The Blender figures have no finger bones and paddle-shaped hands; the grip is a shape key, not a real fist.
- The cradle pose and grip points are tuned for these three people. A new cast member needs its own `PROP_GRIPS` entries or props with extras.
- The VRM clip set has no `turn` clip, so VRM figures turn on the spot in their idle pose (feet stay planted).
