# LUMENFALL — Neon Survivor

An original top-down 2D arena survival game for the make.fun
**best-game-01** bounty ("Make the best game", $1,000). Written in vanilla
JavaScript ES modules on a `<canvas>`, with all art and sound generated in
code — no libraries, no assets to download, no network requests at all.

## The game

The dark is full of teeth. Your light is loaded. You are Lumin, the last
lantern-keeper of a neon arena, and the swarm wants your glow.

- **Survive 10 waves** of drifters, skitters, spitters and brutes. Waves 5
  and 10 bring bosses — the Warden, then the Hollow Star. Defeat the Hollow
  Star to win.
- **Weapons fire on their own.** Collect glowing XP shards, level up, and
  pick 1 of 3 cards: five weapons (Pulse Blaster, Orbit Blades, Nova Burst,
  Chain Lightning, Frost Field) and six stat boosts. Builds stack to level 5.
- **Combo multiplier** for quick kills, elite foes with 5× shards, dash with
  i-frames, screen shake, hit-stop, particles, floating damage numbers and a
  generative synth soundtrack (WebAudio, mutable with `M`).
- **Complete game:** title screen with a live attract mode, how-to-play,
  pause, level-up choices, boss banners, victory and game-over screens with
  run stats, restart, and a best score kept in `localStorage`.

## Controls

| Input | Action |
|---|---|
| WASD / Arrow keys | Move |
| Space | Dash (brief invulnerability, 2.2 s cooldown) — also confirms on menus |
| Shift | Dash, too |
| Mouse | Menus, level-up cards, buttons |
| 1 / 2 / 3 | Pick a level-up card |
| P / Esc | Pause / resume |
| M | Mute / unmute |
| R | Restart the run |
| H | How to play (title screen) |

## Run it locally

```sh
node serve.ts            # serves game/ on http://localhost:8080
```

Open http://localhost:8080 in a desktop browser. No build step, no install.

`?seed=N` fixes the random pattern. `?debug=1` starts a boosted run at
wave 9 (a testing shortcut). `?fps=1` shows a frame-rate counter.
`?shot=start|play|levelup|end&seed=N` stages a screenshot scene (see below).

## How the entry is built

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
```

`main.ts` (Node 22+, standard library only) copies `game/` and
`screenshots/` into the output directory and writes `dossier.json` with the
vendored `vendor/makefun-game.ts` `buildDossier` library — the same library
the bounty scorer runs.

## Screenshots

The four screenshots in `screenshots/` are real frames of the game, staged
deterministically by `game/src/shots.js` (`?shot=…&seed=7`) and captured in
headless Chromium:

1. `1-start.jpg` — title screen over the live attract mode
2. `2-play.jpg` — mid-fight on wave 2, blades and bolts flying
3. `3-levelup.jpg` — the level-up card choice
4. `4-end.jpg` — game over

See `tests/` for the capture and playtest harnesses and `BUILD-REPORT.md`
for the test results.

## Layout

```
main.ts                 entry program: copies game/ + screenshots/, writes dossier.json
serve.ts                tiny static server for local play (node serve.ts)
vendor/makefun-game.ts  make.fun's dossier library (vendored, unmodified)
game/index.html         the page: one canvas, one module script
game/src/config.js      tuning numbers, colours, wave plans, XP curve
game/src/random.js      seeded RNG (mulberry32)
game/src/input.js       keyboard / mouse / touch
game/src/audio.js       synthesised WebAudio SFX + generative music
game/src/player.js      the player: movement, dash, damage
game/src/enemies.js     enemy kinds, spawning, movement behaviour
game/src/weapons.js     the five weapons and their per-level stats
game/src/upgrades.js   level-up cards and their effects
game/src/particles.js   pooled particles and floating damage numbers
game/src/world.js       the simulation: waves, combat, XP, combo, bosses
game/src/render.js      all canvas drawing: field, HUD, screens
game/src/ui.js          overlay layouts and button hit-testing
game/src/shots.js       deterministic screenshot staging
game/src/main.js        boot, fixed-step loop, screen flow
screenshots/            1-start, 2-play, 3-levelup, 4-end
tests/                  CDP screenshot + playtest harnesses (dev-only)
```

## Licence

MIT — see `LICENSE`.
