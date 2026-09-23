# Regional network and missions

Maple Line sits inside a small fictional rail network. You still drive only the Maple Line. The network adds a map with other lines, timetabled trains you do not drive, a company ledger, and missions you complete by stopping at Maple Line platforms.

**Only the Maple Line is rendered in 3D.** The other five lines are simulated on the schematic map in the Network dialog. You cannot drive onto them, and their trains never appear in the 3D world.

## Status

The modules, tests, dialog and agent tools exist as standalone files. They are not yet wired into `main.js`, so the Network button and HUD chip do not appear in the running game until someone adds the integration described at the end of this page. Browser behavior of the dialog has not been checked in the running game.

| File                                         | What it does                                             |
| -------------------------------------------- | -------------------------------------------------------- |
| `apps/game/src/simulation/rail-network.js`   | Lines, stations, timetables, dispatcher, route planner   |
| `apps/game/src/simulation/business.js`       | Cargo demand, prices, company ledger                     |
| `apps/game/src/simulation/missions.js`       | Mission lifecycle, campaign, save and load               |
| `apps/game/src/ui/network-panel.js` + `.css` | Network dialog (map, mission board, ledger) and HUD chip |
| `apps/game/src/agent/network-tools.js`       | WebMCP tools                                             |

All three simulation modules are plain JavaScript with no Three.js or DOM, so they run under `node --test`.

## The network

Five fictional prefectures and six lines. Stations on the Maple Line come from the game's own stop list, so their order and distances match the 3D route.

| Line                          | Track  | Power    | Limit    | Junction with the Maple Line                                                    |
| ----------------------------- | ------ | -------- | -------- | ------------------------------------------------------------------------------- |
| Maple Line (driven, 3D)       | single | electric | 120 km/h | —                                                                               |
| Kagami Lake Branch            | single | diesel   | 60 km/h  | Aonuma                                                                          |
| Takane Mountain Line          | single | electric | 70 km/h  | Yukihara; crosses into Kitagawa Prefecture                                      |
| Shiokaze Coastal Freight Line | single | diesel   | 85 km/h  | Minato                                                                          |
| Miyako Intercity Trunk        | double | electric | 160 km/h | Harumi                                                                          |
| Hamanaka Link Line            | single | electric | 110 km/h | none; joins Kamome Yard to Asahigaoka, closing a loop through Minato and Harumi |

Prefectures: Momiji (the valley end of the Maple Line and the lake branch), Takane (the mountains), Kitagawa (beyond the mountain border), Shiokaze (the coast) and Miyako Metropolis (the city end of the trunk).

Every station has a population and industries. An industry has a supply rate and a demand rate in units per game hour. The cargo types are rice, timber, fish, tea, stone, goods, mail and tourists (passengers).

## Game clock

The network uses game minutes. Minute 0 is 00:00 on day 1, and a fresh network starts at 06:00. The simulation advances in fixed 0.25-minute steps, so one `tick(10)` gives the same state as ten `tick(1)` calls. The suggested rate is one game minute per real minute of unpaused riding, which keeps the Maple Line drive and the map on the same scale.

## AI trains and the dispatcher

Seven service patterns run in both directions: a limited express and a local on the trunk, a local on the lake branch, a local and a timber freight on the mountain line, a coastal freight, and a rapid that runs the loop from Harumi to Minato. AI trains never use Maple Line track.

Each single-track section between two stations is one block. A train may enter a block only when no other train holds it. If the block is taken, the train waits at the station and the wait is counted as delay. Higher-priority trains (limited, then rapid, local, freight) get the block first when two are waiting. Double track has no block limit. Stations are assumed to have enough platforms for any number of waiting trains, which is why the dispatcher cannot deadlock. A small seeded random extra dwell (0 to 0.5 minutes) makes days differ slightly; the same seed always gives the same result.

## Route planner

`planRoute(from, to)` finds the fastest path by time. Time on each section is length divided by the line's speed limit, plus 0.5 minutes per station and 5 minutes for each change of line. With `unlockedOnly`, locked lines are skipped.

## Business and prices

Every 30 game minutes, each industry with supply may create a demand entry to a station that wants the same cargo. Higher supply makes this more likely. Entries last two hours. The pool holds at most 12 entries.

Price in yen:

```
units × (base + perKm × km) × urgency × (1 + 0.002 × reputation)
```

Rounded to 10 yen and kept between ¥500 and ¥250,000. Urgency is 1.0 (standard), 1.25 (priority) or 1.6 (urgent). Reputation is the company's standing in the destination prefecture, from 0 to 100.

| Cargo      | Base | Per km | Unit      |
| ---------- | ---- | ------ | --------- |
| Rice       | 400  | 38     | tonne     |
| Timber     | 350  | 30     | tonne     |
| Fresh fish | 500  | 55     | tonne     |
| Tea        | 450  | 45     | tonne     |
| Stone      | 300  | 22     | tonne     |
| Goods      | 420  | 40     | tonne     |
| Mail       | 120  | 16     | bag       |
| Passengers | 90   | 9      | passenger |

The company starts with ¥20,000, 10 reputation in Momiji Prefecture and none elsewhere. Capacity is 320 seats (five cars of 64) and one freight wagon of 20 tonnes. Penalties never take money below zero.

## Missions

Missions are always played on the Maple Line. A demand entry that starts or ends off the map becomes a mission for its Maple Line leg, for example Minato to Hinoki for fish landed at Isohama.

| Type       | What you do                                                                     | Load / unload |
| ---------- | ------------------------------------------------------------------------------- | ------------- |
| Passenger  | Board passengers at A and set them down at B before the deadline                | 6 s / 6 s     |
| Freight    | Load at A, unload at B, one freight mission at a time                           | 20 s / 15 s   |
| Express    | Reach B by the deadline; arriving more than 10 minutes early lowers punctuality | 4 s / 4 s     |
| Connection | Reach a junction before a named off-map train leaves                            | 6 s / 5 s     |

Loading and unloading count only while the train is stopped (0.1 m/s or less) within 26 m of the right platform with the doors open. If the doors close, the train moves or it is the wrong platform, the count starts again from zero. The missions module only reads distance, speed, doors and the clock; it never changes speed, doors or power.

Lifecycle: offered → accepted → loading → in-transit → unloading → completed or failed.

- **Deadline.** Set when you accept: the distance from your train to A plus A to B at 45 km/h, plus slack (15 minutes for passengers, 20 for freight, 5 for express, 10 for connections) and the handling time.
- **Connection.** When you accept, the mission picks the first matching departure from the junction that you can plausibly reach. It fails as soon as the network reports that train has left. A train held by the dispatcher can still be caught after its timetabled minute; a 30-minute backstop deadline applies.
- **Rewards.** Money goes to the ledger and reputation rises in the destination prefecture (2 to 4 points, 5 for campaign missions). Express rewards scale with punctuality (60 to 100).
- **Failure.** 30% of the reward as a penalty and 3 reputation. Abandoning an accepted mission costs half the penalty. Declining an offered non-campaign mission is free.
- **Limits.** At most three active missions and four generated offers. Offers expire after 90 game minutes.

New contracts come only from unlocked prefectures and routes on unlocked lines. At the start only Momiji Prefecture and the Maple Line are open.

## Campaign

Eight missions in order. Each completed step offers the next one and may unlock lines, prefectures or flags. A failed step is offered again.

| Step | Mission                                      | Unlocks                                   |
| ---- | -------------------------------------------- | ----------------------------------------- |
| 1    | Passengers, Momiji → Aonuma                  | Kagami Lake Branch                        |
| 2    | 12 t timber, Hinoki → Ishikura               | Takane Mountain Line, Takane Prefecture   |
| 3    | Express mail, Ishikura → Hoshimi             | express contracts                         |
| 4    | Connection at Yukihara for the Mountain Line | Kitagawa Prefecture                       |
| 5    | 10 t fish, Minato → Akane                    | Coastal Freight Line, Shiokaze Prefecture |
| 6    | 120 passengers, Tanada → Harumi              | city contracts                            |
| 7    | Connection at Harumi for the trunk to Miyako | Intercity Trunk, Miyako Metropolis        |
| 8    | Express mail, Momiji → Harumi                | Hamanaka Link Line, network complete      |

## Saving

Missions, campaign step, unlocks, ledger and the game clock are saved in browser local storage under `maple-line.missions.v1`. A save is checked field by field when loaded: unknown stations, lines or statuses, bad numbers, more than three active missions, or a save larger than 64 KB are rejected and the game starts fresh. Saving happens on accept, abandon and every 10 seconds while something changed. Storage errors are ignored. AI train positions are not saved; on load the network rebuilds them by running the timetable forward from two hours before the saved time.

## Agent tools

`registerNetworkTools` adds six WebMCP tools through the same validated `tool()` as the route tools:

| Tool                 | Effect                                                  |
| -------------------- | ------------------------------------------------------- |
| `get_network_state`  | Read clock, lines, unlocks, AI trains, blocks and stats |
| `get_missions`       | Read offers, active missions, campaign and unlocks      |
| `accept_mission`     | Accept an offer by id (same action as the dialog)       |
| `abandon_mission`    | Abandon an active mission or decline an offer           |
| `plan_network_route` | Fastest route between two stations                      |
| `get_company_ledger` | Read money, reputation, capacity and recent entries     |

None of these tools drive the train. Loading still needs the train stopped at the platform with doors open.

## Integrating into the game

`main.js` needs to create the three modules after `routeStops` exists, advance the clock in `frame()` while the ride runs, pass drive state to `missions.update`, mount the dialog and register the tools through the `extensions` option of `registerGameWebMCP`. Use `routeStops` (not `additionalStops`) so Momiji is included and distances follow the selected Kawasemi route.

## Limits

- The Maple Line has no AI trains, and the player's train does not occupy blocks in the network model.
- Timetables repeat every day; there are no disruptions, breakdowns or weather effects off the map.
- The mission board does not know which way the train is heading, so a mission behind you needs a turnaround at a terminal or a Places jump.
- Station capacity is unlimited, which is simpler than a real single-track railway.
- Tests cover the network, business and missions logic and the tool validation. The dialog has no automated test and has not been checked in a browser.
