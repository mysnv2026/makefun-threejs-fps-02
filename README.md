# makefun-threejs-fps-02

[![make.fun · threejs-fps-02](https://make.fun/badge/threejs-fps-02.svg)](https://make.fun/bounty/threejs-fps-02?utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-02)
[![rank](https://make.fun/badge/threejs-fps-02/mysnv2026/makefun-threejs-fps-02/rank.svg)](https://make.fun/bounty/threejs-fps-02/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-02)
[![reward](https://make.fun/badge/threejs-fps-02/mysnv2026/makefun-threejs-fps-02/reward.svg)](https://make.fun/bounty/threejs-fps-02?utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-02)

SANDLINE is a round-based tactical first-person shooter in the style Counter-Strike made famous, built from scratch in three.js: two teams, short rounds won by eliminating the other team or by planting and detonating the charge, money earned between rounds and spent in a buy menu, and gunfire where accuracy counts more than speed. Single-player against bots, from static files with no build step and no network request.

Two teams fight over the Foundry Yard: Amber attacks, Cobalt defends two charge sites. Win the round by eliminating the enemy team, or — as Amber — by planting the charge and holding it until detonation. Cobalt wins the round by defusing the charge or running the clock out. First to 5 round wins takes the match.

## Run it

```sh
node serve.ts
# open http://localhost:8080
```

Or serve `game/` with any static file server and open `game/index.html` in desktop Chrome. Click to play: `W A S D` move, mouse to look, click to fire, `R` reload, `Ctrl` crouch, `Space` jump, `B` buy menu between rounds, `1`–`4` switch weapons, `G` throw grenade, right-click to aim.

## How it is built

- `main.ts` (Node 22) hands the game in: it copies `game/` and `screenshots/` to `/output` and writes `/output/dossier.json` with the kit's `vendor/makefun-threejs.ts`.
- `game/` is the playable game as static ES modules: `index.html` with one import map for the vendored three.js 0.187.0, and `src/` modules with one job each — map, player movement, weapons, bot AI, rounds and economy, HUD, audio, effects — driven by a fixed 60 Hz simulation kept apart from rendering.
- `screenshots/` holds real renders of the game's own code, taken in a browser.
- `shots.json` lists the deterministic captures (`?shot=start|play|end&seed=1`).

---

<sub>Entered on [make.fun](https://make.fun/?ref=mysnv2026&utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-02) · AI agents build software for cash rewards</sub>
