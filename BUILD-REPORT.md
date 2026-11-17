# Build Report — Cayo Verde (gta6-01 rebuild)

An original open-world crime game, built from the requirements under a live
make.fun recording. Every file under `game/` was authored in the recorded
session; nothing was copied from any earlier build.

## The game

Dani Vega drives for the fixer Sal Marín on Cayo Verde, a procedural island
city (9×9 road grid, beach and pier south, causeway north, all generated
from one seed). Five story missions: First Fare, Repo Run, Hot Delivery,
The Ledger, Last Bridge Out. Systems:

- On foot (walk, sprint, jump) and driving (throttle/brake/reverse,
  handbrake, steering that bites with speed, damage and smoke).
- Traffic cars looping the blocks, pedestrians on the sidewalks, stealable
  parked and driven cars, a spray shop that repaints and clears wanted.
- Wanted level 0–5: cruiser pursuit with line-of-sight sighting, foot cops,
  bust meter, evasion by breaking sight, five-star finale.
- Combat: melee and pistol (raycast with wall occlusion), armed guards,
  health, wasted/busted flows, hospital respawn.
- Ten sun medallions, cash pickups, HUD with canvas minimap, start/pause/
  controls screens, localStorage save/resume, synthesized WebAudio (engine,
  siren, shots, music pad, jingles), particles and camera shake.
- `?shot=cover|chase|mission|menu&seed=N` stages real sim states for
  screenshots; `?seed=N` rebuilds the city deterministically.

## Files

- `game/index.html`, `game/style.css`, 17 ES modules under `game/src/`
  (19 source files, 143,801 bytes), three.js r160 vendored as
  `game/vendor/three.module.min.js` (670,681 bytes, the only vendored file).
- No build step, no network requests: every import resolves inside `game/`.
- `main.ts` hands in `game/` + `screenshots/` + `dossier.json` via the
  vendored `buildDossier`; `vendor/makefun-game.ts` is byte-identical to
  the kit's copy.

## Verification (headless Chromium, SwiftShader)

- Scripted play-through, 39 checks: menu, walk, steal, lot exit, open-road
  acceleration, exit, mission 1 end to end, pistol/melee, pause/resume,
  cruiser + foot-cop response, line-of-sight open/blocked, spray repaint,
  medallion, busted, wasted, mission 2 end to end, raycast guard shot,
  mission 5 finale, free roam, 10 s soak — 39/39 pass, 0 page/console
  errors. (One threshold was corrected mid-test: the slowest car style, a
  van, tops out at ~14.5 m/s by design; a focused probe confirmed the
  acceleration curve is correct.)
- Determinism: two `MAKEFUN_OUTPUT_DIR` runs of `main.ts` byte-identical;
  dossier 649,811 bytes.
- Gate replica (kit helpers): game_files, references, screenshots,
  dossier_matches — all pass. Screenshots: 4 real renders, 1280×720 JPEG,
  85–104 KiB each, visually inspected.

## Bugs found and fixed during testing

- A race between the starter cleanup and the first write deleted `rng.js`;
  the boot probe caught the 404 and the file was rewritten.
- Parking lots on road centrelines (garage, plaza) blocked traffic and
  pointed stolen cars at buildings; lots moved inside their blocks.
- The gold mission car spawned exactly on top of a parked car, making the
  repo job a coin flip; its spawn moved 8 m clear of the parked row.
- Pointer-lock clicks suppressed every pistol shot; the grace now keys off
  actual lock acquisition.
- Police sight was distance-only, making evasion near-impossible; cruisers
  and cops now need line of sight past buildings.
- The HUD bled through the start menu at 25% opacity; it is hidden behind
  the start/complete screens.
