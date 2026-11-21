# SOLARA BAY 3D — v6

[![make.fun bounty](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![rank](https://make.fun/badge/gta6-01/salikamarlisa3-cell/gta6-01-v6s/rank.svg)](https://make.fun/bounty/gta6-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![reward](https://make.fun/badge/gta6-01/salikamarlisa3-cell/gta6-01-v6s/reward.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)

An original 3D open-world crime game for the make.fun "Make GTA 6" bounty (gta6-01), built with three.js and fully offline static files. A procedural island city, 10 story missions, a 5-star VBPD wanted system with a helicopter air unit, roadblocks and PIT units, a weapon wheel with 4 guns, gun and garage shops, respect ranks, exploding cars, drivable boats, in-car radio, a crew with callable abilities, street races, day-night cycle and weather — all running from game/index.html with no network requests.

## Run

Serve the game/ directory statically, or run the entrypoint (node main.ts) to produce the judged output (game copy, screenshots, dossier.json).

## Controls

- **WASD** move / drive · **mouse** camera (click the game to pointer-lock) · **Shift** sprint
- **F** enter/exit a car or boat · **E** interact (shops, safehouse) · **left mouse** fire
- **Q / Tab** hold for the weapon wheel, **1–5** quick-select weapons · **R** radio (in a car)
- **6** call Rico (backup driver) · **7** call Zara (shooter) · **M** mute · **P** pause

## As built (verified in this session)

SOLARA BAY 3D: 10 story missions, 5-star VBPD helicopter air unit, roadblocks and PIT, weapon wheel with 4 guns, shops, respect ranks, exploding cars, boats, radio, crew, races — the title is the feature list, and every item on it is implemented in `game/src/` as its own module (world, traffic, police, airunit, missions, combat, weapons, shops, progression, crew, races, vehicles, boats, carjack, explosions, radio, pedestrians, audio, hud, save, weather, player, input, render).

Verification performed before hand-in, all against the real running game in a headless browser:

- The built-in self-test (`game/index.html?test=1`) passes end to end with zero console errors: world spawn (127 building colliders, 57 pedestrians), story mission 1 completes with its cash payout, respect rises on completion, a witnessed car theft raises the wanted level, dispatch spawns at three stars, hiding bleeds stars back off, a cornered player is BUSTED, lethal damage is WASTED, the gun shop sells the SMG (respect-gated) and the weapon wheel switches to it, the helicopter joins at four stars, a boat can be boarded and driven on open water, a wrecked car catches fire and explodes, the radio changes station behind the wheel, carjacking an occupied car drags its driver out, and the save writes and reads back — with `?test=verify` confirming the same save survives a full page reload.
- The entrypoint is deterministic: two runs of `node main.ts` produce byte-identical `dossier.json`.
- The four screenshots in `screenshots/` are unedited renders of the staged scenes (`?shot=cover|drive|chase|night&seed=1`) at 1280×720: a golden-hour marina vista, live traffic with the radio on, a five-star chase under the helicopter's searchlight with a roadblock ahead, and a night mission scene at the casino.
- An adaptive quality governor keeps the game playable on weak GPUs: it steps pixel ratio, shadows and particle counts down when the frame rate drops, and restores them when headroom returns.
