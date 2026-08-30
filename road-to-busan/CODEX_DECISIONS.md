# Road to Busan — Codex decision log

This is a living record of material game-design decisions explored and made with Codex. It is intended to support the optional “Codex utilization process” submission for OpenAI Game Builders Seoul.

## Core concept

- **Working title:** Road to Busan.
- **Player objective:** reach Busan; efficiency and speed are secondary pressures.
- **Scope decision:** build a polished, playable browser prototype rather than a publish-scale driving game. The submission must open directly from a public web link.
- **View:** first-person driver perspective. The road occupies the top of the screen; dashboard controls and mirrors support the lower portion.

## Core play model

- **Turn model:** retain the turn-based design rather than converting the prototype to real time. Each decision has a five-second limit, giving the game driving tension while keeping NPC behavior legible to players and judges.
- **Input model:** seven actions with number shortcuts: speed up, speed down, left blinker, right blinker, lane left, lane right, and do nothing.
- **Road model:** the simulation uses an invisible lane-and-cell grid. One car occupies one cell by default; vehicles at 80 km/h cross two cells and at 100 km/h cross three.
- **Resolution rule:** player and NPC plans resolve simultaneously. Cars reserve lane-change corridors; every crossed cell is checked, so fast cars cannot jump through other cars. An NPC that enters or crosses the player’s cell ends the run.
- **Rear-safety exception:** an NPC approaching from behind automatically brakes at the final safe rear cell rather than colliding with the player. Front and lateral path conflicts remain crash risks.
- **Player position:** the player remains at the fixed driver position while the grid/traffic moves around them.

## NPC language

- **Blue:** normal/slow traffic.
- **Yellow and red:** lower-threat behaviors; yellow can brake, red can cut in.
- **Green and purple:** high-threat behaviors; green is fast, purple can change lane without signalling.
- **Signals:** red brake lights communicate braking. Yellow lamps communicate the intended left/right lane change; purple is intentionally the exception when it changes without a blinker.
- **Safety constraint:** NPC cars reserve target paths so two NPCs never overlap.
- **Random spawn/behavior pass:** traffic color, lane, row, and rear approach are now randomized every run. Current per-turn primary-behavior probabilities are Blue indicated lane change **8%**, Yellow hard brake **25%**, Red cut-in **22%**, Green indicated fast lane change **14%** (while always speeding), and Purple unsignaled lane change **32%**. Spawn weighting is Blue 34%, Yellow 24%, Red 18%, Green 14%, Purple 10%.

## Readability and presentation

- **Visual progression:** the original 2D grid prototype became a 3D first-person road while retaining the grid simulation underneath.
- **World motion:** scenery and route roads move toward the fixed driver viewpoint on every resolved turn, with the visual distance scaled to the player’s grid movement.
- **NPC scale:** cars get larger as they approach but remain centred on their logical road cell.
- **Mirrors:** side mirrors are now real off-axis, rear-facing cameras rendering the same 3D road world as the forward view. They sit at side-mirror height beside the car’s middle/rear section—not above or ahead of the car—so their view is level along the car’s side. A mirror-only player-car body is visible to those cameras, preserving the outside-edge composition while automatically synchronizing road width, grid, scenery, exits, NPCs, and lane changes.
- **Mirror lane transition:** the mirror camera rig and the visible edge of the player car now follow the same eased lane position, preventing a one-frame jump when the player changes lanes.
- **Player signal:** selecting Left or Right Blinker maintains that signal until the player’s next choice. The matching side mirror pulses yellow, giving the player an in-cockpit confirmation without adding a third-person player-car view.
- **NPC lane-change order:** NPCs now reveal their lane-change plan with the correctly directed blinker before the grid moves. After a short signal beat, player and NPC movement still resolve simultaneously; purple cars intentionally perform their planned diagonal change without signaling.
- **Crash review:** when a run ends in a crash, the fail screen automatically plays a smooth, continuous top-down replay. It records the player lane, active grid width, visible NPC cells, and a marked collision frame; cars interpolate between turns at a driving cadence, while the scrubber supports manual review of any turn.
- **Mirror grid:** side mirrors visibly project the same lane-and-cell system used by the main road, helping players judge the exact rear position of a nearby NPC.
- **Rear-safety rule:** an NPC beginning behind the driver may pressure the player, but it must brake at the last safe rear cell if its movement would cross the player’s simultaneous corridor. Only front and lateral conflicts can end the run.
- **Debugging:** an in-game NPC reaction log shows planned reactions/resolutions for design review and presentation.
- **Run history:** the main menu includes a device-local leaderboard. Each completed or failed run saves its phase progress, duration, remaining energy, end reason, and an expandable list of player choices, allowing playtest review without a server.

## Energy and route structure

- **Energy:** the run starts at 80%. At the current prototype costs, 60/80/100 km/h uses 2/4/8% per turn. Slowing down regenerates 1%. Highway charging exits restore 30%.
- **Target duration:** approximately five minutes for a complete successful run.
- **Phase 1 — City 1:** 10 turns, 3 lanes. Introduces colored car behavior.
- **Phase 2 — City 2:** 12 turns, 3 lanes. Highway entrance appears at turns 6 and 12; the turn-12 entrance is mandatory.
- **Phase 3 — Highway:** 20 turns, 5 lanes. Charging exits at turns 6, 12, and 18; the Busan exit at turn 20 is mandatory.
- **Phase 4 — Busan:** 10 turns, 4 lanes. Traffic becomes more reckless, then the successful run ends in Busan.
- **Phase readability:** City 1 uses a high-building skyline; City 2 mixes buildings and trees; Highway uses trees only; Busan adds seagulls in the sky.
- **Route readability:** highway entrances/exits and charging stops appear as a physical adjacent-side exit road with a matching sign, rather than only as HUD text.
- **Exit-lane rule:** route sides are randomized per route event. Two turns before each route opportunity, one extra lane opens on that adjacent side; it connects to the route road and is reserved from NPC traffic. The player uses that exterior lane and its matching outward lane-change key to take an exit. At Highway turn 18, the charger lane and the newly introduced turn-20 Busan lane are always on opposite sides.
- **Failure feedback:** crashes and missed mandatory route points open a dedicated fail screen with the exact reason and a restart action.

## Still intentionally open

- These first-pass per-color probabilities are ready for playtest balancing; changes should be recorded here when committed.
- Art, mirror polish, and pacing remain prototype-level iteration work rather than final production assets.
