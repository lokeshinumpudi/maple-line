# Before Kawasemi: route choice and room to listen

Research checked **21 September 2026**. This note proposes an original scene for the fictional Maple Line branch at **z 2460–2760**, before `kawasemi-lunch` at **3100**. It does not change the existing campaign or voice score. The recommendations and draft below are not evidence that a feature has been implemented.

The current script has a useful present-day question: Haru can quote a train arrival but has not checked the rest of a passenger’s trip. The branch should make that gap visible through play. It should not interrupt driving with another long speech about the past.

## Five primary sources and their limits

### 1. Let movement interrupt optional conversation

[Jon Ingold, inkle, “Autocut!”](https://www.inklestudios.com/highland/2023/05/11/autocut-for-responsive), **11 May 2023**, describes how _A Highland Song_ lets players leave conversations. A world trigger redirects the script to an appropriate exit; the narrative still tracks seen and skipped material.

**Recommendation for this game:** Brief moving observations should yield to driving demands and remain available in the notebook. Leaving their trigger area must not strand the train, erase progress or require restarting a conversation. This is an adaptation of a developer’s design account, not a result measured in Maple Line.

### 2. Short exchanges need deliberate rhythm, not repeated clicks

[inkle, “Pacing dialogue”](https://medium.com/@inklestudios/pacing-dialogue-5bd5a99bfc20), **18 June 2026**, explains its move from prose to short conversational turns. The account stresses varied line lengths, subtext and rereading. It also identifies a tradeoff: dividing dialogue into many small bubbles is costly if every bubble demands a click.

**Recommendation:** Keep the route decision to one compact card. During motion, deliver one small exchange at a time without a Continue gate. Offer replay and a persistent transcript. Treat this as authored timing to test, not a requirement to copy inkle’s interface or replace our story engine.

### 3. A wetland railway can provide a view unavailable from a road

[JR Hokkaido, “Kushiro Shitsugen Norokko Train”](https://www.jrhokkaido.co.jp/global/english/travel/tour-train/tour-train03.html), operator page checked **21 September 2026**, describes leisurely travel between Kushiro and Toro, wetland views and possible wildlife sightings from the train. It also links a location-based audio guide for local Senmo Line trains. The page announces Norokko’s end of operation in **FY2026**; it must not be presented as an indefinitely available service.

**Recommendation:** Make the loop useful as a different viewing position: reeds briefly hide the footpath, then the turn reveals its connection to a road. A possible bird sighting can be incidental. Do not promise wildlife, duplicate a real route, or take this page as evidence that drivers may choose branches themselves.

### 4. Wetlands are lived-in places; consideration includes local work

[Japan Ministry of the Environment, national-park visitor manners](https://www.env.go.jp/nature/nationalparks/about/manner/), undated page checked **21 September 2026**, asks visitors to remain on designated paths, avoid feeding wildlife, plan for access and conditions, and avoid interfering with local farming, forestry, fishing, private property and residents. Its safe-driving advice addresses collision risk; it is not a railway operating manual.

**Recommendation:** Keep the player on the railway. Show a signed public footbridge and ordinary access paths, with private work areas outside them. Do not reward feeding birds, making noise to flush them into view or driving fast to provoke reactions. This does not mean suppressing a railway horn required by the game’s operating rules.

### 5. A meander has consequences for water and neighbouring land

[MLIT Hokkaido Regional Development Bureau, “Restoring straightened rivers to meandering courses”](https://www.hkd.mlit.go.jp/ks/tisui/qgmend0000002jtz.html), undated conservation proposal checked **21 September 2026**, recommends restoring former bends in the Kushiro basin and examining effects on adjacent agricultural land. Its Kayanuma pilot timetable is historical proposal text, not a current project-status report.

**Recommendation:** Give the wetland an irregular channel, shallow reed margins and connected drainage paths rather than one decorative strip of water. A footbridge should cross a channel for a visible reason. Keep fields and floodplain legible as related spaces; do not imply that adding curves alone creates a physically verified wetland simulation.

The earlier [railway-life research](JAPANESE-RAILWAY-LIFE.md) supplies the municipal connection and shelter examples that informed the existing campaign. In particular, Nanto’s historical 08:40/08:44 connection illustrates why the trip beyond a station matters. Those historical times are not the times of this fictional scene.

## Operating fiction, stated before the choice

**Maple Line-specific fiction:** This departure is a published local excursion service with two pre-planned paths and a permitted arrival window at Kawasemi. Passengers were told about the optional circuit before boarding. The dispatcher, not Haru, sets and authorises the selected path. This is an explicit game arrangement, not a claim about ordinary Japanese passenger operation.

The player requests a route while there is still room to hold before the approach signal. The request is locked before the leading vehicle enters the points. A pending request is not authority to proceed. The displayed route becomes confirmed only after the dispatcher and route-lock state actually allow it. If those states are not implemented, label the selection “Excursion planning” and withhold any narration claiming clearance.

Both paths rejoin before Kawasemi. The slower path cannot be offered if it would knowingly break an already confirmed passenger connection or another train’s authority. The scene must not reward recovering its extra time through speeding. Show the actual estimated difference calculated from route length and permitted speed; do not invent a fixed number of minutes in the script.

## Original compact scene draft

**Title:** Beyond the platform

**Introductory copy:**

Haru: “Today’s excursion can use either path. We request one; dispatch gives us the road.”

A passenger has asked Emi whether the path from Kawasemi’s bus stop has a seat along it. Haru knows the station bench. He has never needed the other one.

Emi: “Direct gives us time to ask at the desk. The loop lets us see the footbridge.”

The passenger is an ordinary traveller with a question, not a medical emergency or a test of Haru’s kindness. This request is authored scene setup, not a claim that the player has already interviewed or recorded someone.

| Request button               | Preview consequence                                                                           | Copy after the request is actually authorised                                                            |
| ---------------------------- | --------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| **Request the direct route** | Reach Kawasemi sooner; use the platform interval to check the onward stop and return service. | “Direct confirmed. We’ll ask about both directions,” Haru says. Emi leaves two spaces in the notebook.   |
| **Request the wetland loop** | Take the slower authorised circuit; look at the public footbridge and the road beyond it.     | “Loop confirmed. The arrival window still holds,” Haru says. Emi puts the recorder down so she can look. |

**Pending request:** Waiting for dispatch. The approach signal still governs departure.

**If unavailable:** The wetland path is unavailable for this departure. The direct route remains a request until authorised.

No choice is labelled the caring one. Arriving sooner creates time to ask; taking the loop reveals a physical part of the question. Neither route answers every part of the passenger’s trip.

## Route-specific moving observations

Each route has two brief observations. These are new optional text, separate from the canonical voiced campaign. Do not send them through the current voice score until they have explicit casting and recorded/prepared audio.

**Direct, once clear of the entry points:**

Emi: “The timetable gives the bus stop a name.”

Haru: “It doesn’t show where she waits.”

**Direct, before the rejoin approach needs attention:**

Haru leaves a line under the return time: _Seat? Shelter?_ Emi adds a question mark beside the stop’s name.

**Wetland loop, when the public footbridge is visible:**

Emi: “There’s the bridge. The road is still beyond those reeds.”

Haru: “I used to call this the short walk.”

**Wetland loop, after the curve reveals the path:**

The bench appears on the far side of the channel. Emi lowers the recorder. Neither of them says how far it feels to someone else.

The wetland lines require the corresponding bridge, reeds, continuous public path and far-side bench to exist in the visible shot. Without them, use silence and a notebook prompt rather than describing absent scenery.

## What changes through play

Save a small route fact after authorisation and a separate traversal fact after the complete train has cleared the selected path. A camera visit or teleport cannot count as a completed drive. Save which observations were actually presented; do not mark a recording captured merely because a line appeared.

On the direct route, the arrival note asks the desk about the outward **and return** service and the waiting place. On the loop, the note records the observed footbridge and bench, but still asks about the return service. Both need confirmation from the passenger or transport desk. This gives the branch a practical consequence without declaring somebody’s access problem solved.

At Kawasemi, keep the existing `kawasemi-lunch` spoken text unchanged. Add an optional, unvoiced notebook line based on the route fact, or a small arrival-task prompt next to the existing conversation. Do not add a second mandatory story beat at z3100 or make a new route erase a saved canonical choice.

Haru’s change is observable: he stops treating a station arrival as the end of his responsibility, asks about an entire trip and admits what he cannot infer from the cab. He remains a capable driver. Emi contributes a question and a viewing position; she does not diagnose a stranger’s needs from a distance.

## Space for driving and sound

These are starting values for playtesting, not findings from the sources:

- Allow roughly **8–12 seconds** of train and water sound after route confirmation before any optional observation. Do not stack it over a pending campaign voice cue.
- Put one observation near the middle of the selected path, after the turnout is behind the train. Offer the second only if there is another quiet interval; otherwise retain it as an unread notebook entry.
- Suppress or pause optional speech during signal approach, active braking demands, a warning or a manual control interaction. Safety audio remains audible. Never queue a pile of missed lines for the moment braking ends.
- Use one or two short captions with replay, optional read-aloud and no timeout that prevents reading. Pausing captions must not release a red signal or freeze a moving train solely to finish a sentence.
- After the curve opens the view, let the player look. Do not put a lesson, bird call, collectible notification and new instruction into the same few seconds.

## Level acceptance checks

1. The request/confirmed distinction matches actual dispatch state, and route changes are locked before the train occupies the switch.
2. The whole train uses one authorised path without carriage cuts, points changing beneath it or another service entering its occupied section.
3. At least one wetland shot shows the channel, public footbridge, continuing path and far-side bench together. The camera stays outside the train and terrain.
4. Direct and loop produce distinct honest arrival notes. Neither promises a bus will wait, a passenger was interviewed, or a clip was recorded unless that event occurred.
5. Pausing or skipping moving narration leaves driving usable, retains the transcript and does not replay the branch on reversing.
6. A player can explain what was learned about the passenger’s trip. If they remember only a prettier route, improve the visible connection between bridge, path, waiting place and the later question.
