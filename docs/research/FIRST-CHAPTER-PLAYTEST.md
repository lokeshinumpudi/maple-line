# First chapter: player-flow audit

21 September 2026. **Evidence: current source and project documents only. No browser session or human playtest was performed for this audit.** The priorities below are verified implementation gaps; judgments about their effect on attention or enjoyment are hypotheses to test.

Read the indie-game-direction skill’s Maple Line and playtesting references. Its Maple Line reference records an earlier README snapshot: current `narrative/story-engine.js` now saves story choices, memories and completed tasks. Duty-save integration is now in progress through `narrative/story-session.js` and the host; recovery behavior still needs the player-only reload pass. Do not repeat the earlier blanket statement that all game persistence is absent.

## Intended experience and ordinary player path

The player is Haru: operate a local service and check what its timetable means after passengers leave the train. The intended change is from confidence in an operating plan to curiosity about an unfinished passenger trip. Enjoyment should come from looking closely, carrying out a small useful action, and seeing an answer change the scene. This is a hypothesis, not a reported player response.

The present first chapter contains three stopped scenes: the timetable at z−440, the borrowed spanner at z−120, and Nao’s bread at Momiji z525. Their initial dialogue contains 96, 89 and 92 words respectively, before replies. Two scenes offer two replies; none declares an object task. The first required prop task is later at Aonuma.

The normal path is: **Begin Haru’s story → choose a reply → Continue → ride 320m → Continue → ride 645m → choose Nao reply → Continue → passenger-service check → open doors → boarding dwell → close doors → request line → passing train → depart.** Start/resume selects automatic riding; “Drive yourself” exposes manual controls. The visible “Continue to next memory” button can skip travel. For the first playtest, leave that button unused so the ordinary travel intervals and stop cues can be evaluated. Do not use developer tools, scene inspectors, agent actions, state injection or route jumps. A second pass can separately verify the player-facing shortcut’s stated rules.

### Direction decisions

| Pillar                              | Supports                                            | Rules out                                                                | Observable test signal                                                             |
| ----------------------------------- | --------------------------------------------------- | ------------------------------------------------------------------------ | ---------------------------------------------------------------------------------- |
| A complete trip matters             | Inspect the onward connection and its owner         | Treat the train’s arrival as the whole answer                            | Player explains the missed bus without being prompted with the times               |
| Useful actions have visible results | A labelled crate, a corrected note, a checked route | Rewarding a button that changes only explanatory text                    | Player points to what changed after their action                                   |
| A quiet ride remains controllable   | Optional auto drive and unhurried reading           | Timers that punish dialogue reading or force a new objective immediately | Player can resume their chosen driving mode and describe what they want to do next |

## Prioritized verified gaps

### Resolved in follow-up — The clinic delivery had no player decision

**Correction after checking the new guest module:** `narrative/story-guests.js` already gives Nao a slatted crate at her feet. The earlier audit missed this module and incorrectly described all third-crate geometry as absent. `world/story-levels.js` now tracks three logical crates and supplies a tagged, persistent clinic crate at the guest's crate position after her scene ends. The ordinary two crates leave on passenger-service completion; the clinic crate remains pending. The two renderers avoid drawing duplicate crate bodies during her conversation.

`inspect-clinic-crate` and `load-bread` are still unconnected metadata, not player actions. The chapter has no delivery task, option, recipient or receipt.

**Consequence inferred:** the player can see the evidence but cannot yet investigate or resolve Nao's specific problem. The operational checklist may feel detached from it.

**Smallest remaining change:** connect inspection and a recorded delivery plan. Retain the clinic crate until explicit valid dispatch. Do not treat the existing passenger/freight choice as this decision.

### Resolved in follow-up — The text and passing train disagreed about clearance

Nao’s dialogue says the opposing local enters the loop and Haru watches its tail clear. In `main.js`, `passingLoop.update` receives `active: dutyState.active || dutyState.completed`. `station-duties.js` becomes active only after the Momiji beat is completed. Passing progress starts when the later “Request the line” action is selected. Thus the stated clearance occurs before the rendered event is eligible.

**Consequence inferred:** the player can reasonably think the line has already cleared when the next task asks them to wait for it.

**Smallest change:** either change the dialogue to an approaching/waiting train, or make the passing event part of the scene and reuse its authoritative state for departure. Do not stage a second identical pass to satisfy the checklist.

### Updated finding — Nao is now a named guest; player visibility still needs testing

`narrative/story-guests.js` defines Nao for `momiji-bread`, with an apron, bread crate and scene-specific placement. `main.js` creates and updates the guest module. The earlier claim that no Nao actor existed was incorrect because it examined only `story-cast.js` and the generic population. The parent reports separate guest/camera browser checks; this audit did not perform those checks.

The bakery dispatch area remains 24–46m beyond the station center, while Nao and the pending clinic crate are staged near the conversation. The remaining player test is whether someone notices the third crate, understands its difference, and can find a relevant action without help. Do not list actor creation as unfinished work.

### P2 — Early player decisions change memories, but not the train-side situation

Both opening replies store different text memories and then continue to the same next beat. The spanner scene has only Continue. First-chapter completion does not require inspecting the conflicting times, handling the spanner or checking Nao’s delivery. This is verified in the three beat records and the engine’s completion conditions.

**Consequence inferred:** a player seeking a game may learn that reading and advancing is the primary activity before discovering any consequential station interaction. This does not prove the dialogue is too long or that players dislike it.

**Smallest change:** one evidence-finding action in the opening and one object action at Momiji. Keep the spanner scene brief; do not add a puzzle merely to increase interaction count.

### P2 — Timed boarding still does not prove every visible passenger is aboard

`station-duties.js` accepts three seconds with fully open doors; it does not wait for the physical population's boarding completion. Exact animation timing needs runtime observation. Use actual boarding events or describe the timed check without claiming every person has boarded.

**Duty-save status: integration in progress.** The new `narrative/story-session.js` imports a saved duty checkpoint, records duty transitions into the narrative save, and deliberately restarts incomplete boarding/passing timers. It also handles older stories already beyond Momiji. Do not keep the earlier blanket claim that duty progress has no save path. The host integration and player-only reload pass must verify that completed service and crate visibility restore together, with no newly trusted signal clearance.

### P2 — Control ownership needs a player-only test

`story-host.js` start/resume sets `manualControls:false` and autopilot true. Station dialogue owns pause and speed; normal release consults the current manual preference. In `simple-hud.js`, opening Options calls `showModal()` without a time policy. Global shortcuts are suppressed while a dialog is open, but the train simulation continues unless already paused. These are source facts; whether the cues are understandable is untested.

**Smallest change:** explicitly declare whether Options pauses the ride and show that state. Preserve a player’s selected driving preference across resume unless they explicitly choose a different start mode. In the test, check focus, speed and input both before and after every menu.

## Three distinct adventures tied to the current story

These are proposed additions, not implemented features. Build the first and third before expanding the map. The second should remain short and establish a later payoff.

### 1. The missing two minutes — inspect and infer

**Prerequisite:** opening scene, train safely held. **Notice:** a folded draft beside Emi’s recorder has the train arrival and village bus printed on separate columns. **Intention:** answer her question about getting home. **Action:** open the paper, select the arrival and onward departure, then mark the unmatched connection. Both pointer and keyboard selection must work. Incorrect pairs receive a specific explanation and another attempt; no score or countdown.

**World change:** a visible pencil box remains around 17:42 and 17:40; `connection.aonuma.checked` is saved. Haru’s recorded endorsement remains part of the story. Finding a defect does not magically approve a new bus time. **Feedback:** Emi asks who can authorize a change, leading into the trip’s questions. **New possibility:** the notebook retains a short question to ask at the next suitable stop.

**Framing/audio:** show the actual paper at a readable scale, with a captions-only equivalent. A quiet paper sound is optional. Escape returns to the held scene; no reading time passes as a missed-service penalty.

**Acceptance:** a new player can explain the two-minute mismatch without being told the answer; wrong selection is recoverable; reload preserves the annotation; returning to the paper does not duplicate a fact; Continue requires the check but never requires audio.

### 2. Keiko’s note — handle and remember

**Prerequisite:** z−120 spanner scene. **Notice:** the spanner and a note lie with the lunch bag. **Intention:** return the loan without losing the second instruction. **Action:** inspect the note, identify Fumi as the owner, and put the spanner into a labelled return pocket. Read the second line before choosing a reminder to ask Keiko about Saturday.

**World change:** the tool moves from the lunch bag to Haru’s return pocket; a saved inventory fact names Fumi. The note remains available. **Feedback:** Emi checks that he has kept both instructions. **New possibility:** the existing Aonuma return task consumes that inventory fact and places the same tool on the workbench. No repair minigame or magical bench repair is added.

**Framing/audio:** a short hands-and-bag inspection, then return to the train view. Do not claim a phone call has occurred; this action sets a reminder, not consent from Keiko. If closed early, the items remain where the player left them and the scene offers a clear resume action.

**Acceptance:** tool ownership is one authoritative state; retry cannot produce a second spanner; Aonuma accepts only the carried tool; reload midway has a defined location; the player can recall the Saturday instruction without another exposition block. Test whether this adds interest; remove the pocket selection if it only adds a redundant click.

### 3. Nao’s third crate — negotiate, dispatch and operate

**Prerequisite:** Momiji stop, existing dialogue. **Notice:** two ordinary crates and a clinic-labelled third crate with its own delivery tag. **Intention:** carry out a workable plan rather than repeat a story about Nao’s mother. **Action:** inspect the clinic tag, ask Nao about her stated alternatives, and choose which proposal to record: confirmed later clinic delivery or shared road van. Where confirmation is missing, mark “pending” and keep the crate on the shelf. Then perform the existing passenger boarding and single-line departure sequence.

**World change:** only crates assigned to this train move aboard; the clinic crate remains or moves according to an explicit accepted arrangement. A ledger records destination, responsibility and status. A later stop or return visit shows the receiver’s handoff or the pending crate, rather than awarding a delivery from a conversation choice alone. **Feedback:** Nao checks the label; the signal changes after the actual local passes. **New possibility:** a return acknowledgment depends on the recorded delivery, not whichever reply sounds kinder.

**Framing/audio:** first show Nao and the third crate; during departure show the signal and passing local; let the player reclaim Scenic/Driver view. No countdown while reading. An unconfirmed plan is a valid visible state, not a game-over failure.

**Acceptance:** exactly three identifiable crates at introduction; the clinic crate is inspectable; two choices produce distinguishable valid states; no unsupported claim of transport approval; departure remains blocked by doors/clearance; visible passing train and text share one event; service and cargo state survive reload; on return a player can point to what changed and why.

## Player-only test script

Use a fresh story slot through the normal menu. Record build, device, viewport, input, weather, sound/narration and reduced-motion settings. Do not coach the timetable answer or explain the intended emotion.

1. Quiet first pass: start the story, reach Momiji and depart without location shortcuts. Observe attempted actions, hesitation, voluntary inspection, skipped reading, camera changes and use of manual driving. Do not infer boredom or attachment from inactivity alone.
2. Ask: “What were you trying to do?”, “What changed because of you?”, “Why was Nao concerned?”, “What do you expect to happen with the third crate?”, “What was in Keiko’s note?” Record wording before interpretation.
3. Control pass: sound off, keyboard only. Switch to manual on the first travel leg, open/close Options, pause/resume, change camera, inspect notebook, and attempt ordinary recovery if a stop is missed. No console recovery. Record any point requiring help.
4. Persistence pass: reload after a reply, during open-door boarding, after clearance and after dispatch. Verify the declared story/service/cargo rules. Test the visible travel shortcut separately; it must not bypass unfinished duties.
5. Capture the work area, signal and doorway during the exact action. Static promotional shots and automated tests do not establish that players saw the required information.

A useful first-slice result is a player who understands the missed connection, performs a visible act at Momiji, and can describe its consequence. Whether the ride feels calm, the characters matter, or the tasks are enjoyable remains a question for actual play.

## Follow-up implementation

The parent subsequently changed the Momiji opening to “We must wait here for the opposing local. I check the signal.” Its voice clip was regenerated. The later player-operated passing sequence now agrees with the spoken scene. Station duties now save inside the same story checkpoint; interrupted clearance is discarded on reload, completed dispatch remains complete, and older saves beyond Momiji retain their position. Preference persistence is separate and does not automatically enable audio. These changes need the accompanying runtime reload checks; they do not establish player enjoyment.

The clinic proposal is now implemented: inspect the label after Nao’s reply, then record a later clinic handoff or shared van as awaiting confirmation. Its saved fact and tag colour distinguish the outcomes. The remaining open item is the later actual agreement/handoff, not the proposal action. Visible point blades and route levers now gate loop admission and departure; the new Kawasemi excursion branch now supports a player-selected direct or wetland path. Both paths have been driven through native browser tools, with separate unvoiced route notes and a fresh approach checkpoint on mid-branch resume. An independent player-only session remains open. Main now holds simulation time while Options is open and preserves manual driving preference across story resume. Those fixes should be retained in a fresh player-only playtest.
