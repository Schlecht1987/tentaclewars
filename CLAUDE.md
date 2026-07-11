# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project: Spielhalle (games platform)

This repo is a **games platform** ("Spielhalle"), not a single game. The root `index.html` is the hub/launcher; each game lives self-contained in `games/<name>/` with its own `index.html`, CSS and `js/` files. Everything is HTML + Canvas + vanilla JavaScript, in German, with no build step, no dependencies, no external libraries. The whole platform ships as ONE installable PWA (shared `manifest.webmanifest` + `sw.js` at the repo root) that works on mobile and desktop.

**Rule: every game must have an up-to-date overview section in this file** (see "Games" below). When a game's mechanics, files, or structure change, update its section here AND add a `CHANGELOG.md` entry (and `README.md` if documented rules change).

### Platform structure

- **`index.html`** (root) — the hub: game cards linking to `games/<name>/`, inline CSS, registers `sw.js`. Add a card here when adding a game.
- **`manifest.webmanifest`** — one PWA manifest for the whole platform (`start_url`/`scope` = repo root). Game pages link to it with `../../manifest.webmanifest`.
- **`sw.js`** — one service worker, cache-first, precaches the hub AND all game files. **When adding/renaming game files, add them to `ASSETS`; bump `CACHE` every release.** Registered from the hub and from game pages via `../../sw.js` (scope = root either way).
- **`icons/`**, `tools/gen-icons.mjs` — shared platform icons (PNGs committed; only rerun the tool when the design changes).
- **`games/zellkrieg/`**, **`games/towerdefense/`** — the games (see below).
- Each game page links back to the hub (`href="../../"`).

### Running / testing

No build system. Serve the **repo root** with a static server (`npx serve .`) and open `index.html` via http; navigate to games from the hub. Opening files directly via file:// also works for quick play, but the service worker doesn't register and file:// has its own localStorage origin (progress doesn't transfer). No automated tests — verify manually in-browser. Beware the service worker's cache-first behavior hiding edits during development: DevTools → Application → Service Workers → "Update on reload" / "Bypass for network".

### Changelog

`CHANGELOG.md` at the repo root, [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) format, covers the platform and all games. Prefix entries with the game name (e.g. **Zellkrieg:** / **Tower Defense:** / **Plattform:**). Whenever you change game logic/mechanics, add an entry under `[Unreleased]` — and update `README.md` if the change affects documented rules.

### Adding a new game

1. Create `games/<name>/` with `index.html` (viewport + theme-color meta, `../../manifest.webmanifest` + icon links, back link to `../../`), its CSS and `js/`.
2. Add a game card to the root `index.html`.
3. Add all files to `sw.js` `ASSETS` and bump `CACHE`.
4. Add an overview section for the game to this file, a CHANGELOG entry, and a README section.
5. Mobile + desktop capable is a requirement (touch input, responsive layout).

---

## Game: Zellkrieg (`games/zellkrieg/`)

Real-time strategy in the style of *Tentacle Wars* / *Galcon*: 50-level campaign, configurable random-game generator (1–3 AI factions), sandbox. Fully touch- and desktop-capable (pinch-zoom camera, portrait rotation in the canvas transform).

### File map

Classic `<script src>` tags (NOT ES modules — those would break file:// via CORS). `index.html` loads the scripts in dependency order:
`config.js → rng.js → levels.js → mapgen.js → campaign.js → ai.js → game.js → ui.js → debug.js → main.js`.
**Rule: no top-level code that executes another file's symbols, except in `js/main.js`** (the single bootstrap). Declaring globals and functions is fine anywhere; calling across files at load time is not.

All paths below are relative to `games/zellkrieg/`.

- **`index.html`** — head (viewport, theme-color, manifest/icon links → `../../`), DOM: everything lives inside `#appRoot` (canvas, HUD `#factionChips`, hint, `#levelSelect` with `#campaignGrid` + back link to the platform hub, `#randomSetup` form, legend, `#overlay`, `#debugPanel`), script tags. `#appRoot` is a plain wrapper around the whole UI (no longer rotated — portrait handling lives entirely in the canvas view transform, see game.js below).
- **`styles.css`** — all CSS: color tokens per faction (`--player`, `--enemy`, `--enemy2`, `--enemy3`, `--neutral`), menu/grid/pill styles, safe-area insets, the small-screen media query (`max-width: 700px` / `max-height: 520px` hides legend + hint and lets `.hud-top`/`.status` wrap so the HUD row survives narrow portrait widths). No portrait-rotate CSS: portrait handling is done in the canvas view transform (see game.js), so the DOM is never rotated.
- **`js/config.js`** — `CONFIG` (all balance numbers), `CELL_TYPES` (the five cell types), `OWNER_COLOR` (must match the CSS tokens), `AI_FACTIONS` (`["enemy","enemy2","enemy3"]`), `OWNER_LABEL`, `AI_PROFILES` (easy/medium/hard: `{ interval, minUnits, commandsPerTick, targetNoise }`), `aiProfileFor(level, owner)`.
- **`js/rng.js`** — `mulberry32(seed)` plus `rngInt`/`rngPick`/`rngWeighted`. All map generation randomness MUST go through a passed-in rng, never `Math.random()`, or determinism breaks.
- **`js/levels.js`** — hand-built levels: `SANDBOX_LEVEL` (Testlabor) and `CAMPAIGN_HANDBUILT` (keyed by campaign level number; currently 1, 10, 50).
- **`js/mapgen.js`** — `generateMap(params, rng)` produces a LEVELS-shaped object (symmetric mode: mirrored for 2 factions / rotational for 3–4, provably fair; random mode: rejection sampling with relaxing min distances; playability check adds a neutral bridge cell if a faction can't reach anything). `generateRandomLevel(settings)` maps the random-game settings to generateMap params.
- **`js/campaign.js`** — `campaignDifficulty(n)` (difficulty ramp for level n of 50), `generateCampaignLevel(n)` (hand-built override or deterministic generation from `mulberry32(CAMPAIGN_SEED ^ Math.imul(n, 2654435761))`), progress API (`loadProgress`/`markCompleted`/`isUnlocked`/`isCompleted`).
- **`js/ai.js`** — `aiThink(owner, profile)`: per-faction AI; strongest own cell attacks weakest reachable damageable target (anything not owned by `owner` — AI factions fight each other too), else reinforces its own front; up to `profile.commandsPerTick` commands per tick, `targetNoise` jitters target scoring.
- **`js/game.js`** — game state (`LEVEL`, `cells`, `tentacles`, `aiStates`, `inMenu`, `gameOver`, `view`), `resetGame()` (also builds one `aiStates` entry per AI faction present, with random timer phase), `resize()` (DPR-aware letterboxing, smaller padding on small screens), the full simulation `update(dt)` (tentacle grow/flow/retract/free, duels, pipeline delivery, per-faction AI ticking), `checkVictory()` (lose if player dead, win if all AI factions from `aiStates` dead; delegates overlay to `showGameEnd` in ui.js), pointer input, all canvas rendering, `frame()` main loop. Portrait handling: `isPortraitView()` (viewport taller than wide) sets `view.portrait` in `resize()`; when true the field is drawn rotated 90° inside the canvas. `resize()` swaps `LEVEL.width`/`height` when fitting/letterboxing, `applyWorldTransform(dpr)` builds the world→screen matrix (plain scale in landscape, +90° clockwise rotation in portrait), and `toWorld()` inverts that same transform on `e.clientX/clientY`, so pointer picking still lines up with what's drawn. The DOM/canvas themselves are never rotated.
- **`js/ui.js`** — `startLevel(levelObj, ref)` where `ref` is `{kind:"campaign",n} | {kind:"random",settings} | {kind:"sandbox"}` (drives progress + the overlay's next button), `showLevelMenu`, `buildCampaignGrid` (50 tiles: locked/open/done), random-game form (settings persisted), `buildHud`/`updateHud` (one chip per faction), `showGameEnd`, `buildLegend`, `initUi()` (all event wiring; called once from main.js).
- **`js/debug.js`** — diagnostics only, no game-logic side effects. `zkSnapshot()` builds a plain-object snapshot of the current frame and `zkAnomalies()` flags heuristically-inconsistent state. Export via 🐞 HUD button / **F9** (download `.txt`), **Shift+F9** (clipboard), or console `zkDebug()`/`zkDownload()`/`zkCopy()`/`zkRecord(seconds)`.
- **`js/main.js`** — bootstrap (sets `LEVEL`, wires resize, starts the loop, opens the menu) + service-worker registration (`../../sw.js`, http(s) only).

### Level schema

```js
{
  name, desc, tag,
  sandbox: false,          // true = player controls ALL factions, no AI, no win/lose
  width: 1000, height: 640, // virtual field; view transform letterboxes it
  ai: { enemy: "medium", enemy2: { interval: 2, minUnits: 8, commandsPerTick: 2, targetNoise: 0 } },
  cells: [ { id, type, owner, x, y, units }, ... ]
}
```
`owner` ∈ `"player" | "enemy" | "enemy2" | "enemy3" | "neutral"`. A faction exists in a level iff it owns cells. `ai` is optional; missing factions default to `"medium"`.

### Campaign determinism (IMPORTANT)

Generated campaign level n is a pure function of `CAMPAIGN_SEED`, n, and the mapgen algorithm. **Never change `generateMap`'s sampling order/logic or `campaignDifficulty`'s mapping for shipped levels without bumping `CAMPAIGN_SEED`** — otherwise all 50 maps silently change under players' feet. Hand-built exceptions go in `CAMPAIGN_HANDBUILT` instead.

### localStorage keys

- `zellkrieg.progress.v1` — `{ v: 1, completed: [levelNumbers], lastPlayed: n }`
- `zellkrieg.randomSettings.v1` — last used random-game settings incl. seed

All access is try/catch-wrapped (private mode). file:// and localhost are separate origins.

### Core game rules (needed to reason about changes correctly)

- Attack/heal values belong to the **sending** cell; bunker defense reduction belongs to the **receiving** cell. Bunker defense (`bunkerReduced()`) scales damage-per-point down (currently halves it via `attack / 2^bunkerDefense`) rather than subtracting a flat amount — so a bunker is never fully immune to weak attackers, just much slower to crack.
- Growing a tentacle costs points from the source cell (`lengthPerUnit` points per pixel) — distance is the natural limiter, not a cooldown.
- Healing and an unanswered (non-duel) attack are capped at the source cell's production budget (`_flowBudget`/`_boostShare`, shared across a cell's active outgoing tentacles) — a cell's stored reserve never drains just from sending these. A **tentacle duel** (two opposing tentacles between the same two cells) is simpler and harsher: as soon as both directions are active it's a duel — no waiting for the tips to physically meet. The front is fixed at the corridor midpoint (`min(len, len/2)`, see the `grow`-mode target in `update()`) — it never advances or retreats. Each side still feeds `battleFeed` only from its own production budget, but that fed amount, scaled by `attack`, is applied as real damage directly to the *opposing* cell's stored reserve (`damageCell`) — not a tug-of-war over tentacle position. Whoever runs out of reserve first (`units < 0`) is captured immediately via the normal `damageCell` → `captureCell` path, which auto-retracts its tentacles to the new owner. Superior supply (higher own production, or being topped up via overflow/symbiosis forwarding, which raises `_boostShare`) lets a side out-damage the other.
- Transferred mass is not applied instantly: each docked (`flow`) tentacle queues sent amounts into `t.pipeline` (`{ amount, remaining, travel }`) and only calls `applyMass` once `remaining` counts down to 0 — mass visibly travels the tentacle before it heals/damages the target. `t.dotSpeed` scales with the tentacle's smoothed throughput (`t.rate`), never slower than `CONFIG.flowDotSpeed`. Pipelines are processed independently of the tentacle's current mode so in-flight packets still arrive after a retract/cut; a dead tentacle is only removed once its pipeline is empty. `cutTentacle` gives the newly split-off piece its own empty pipeline array to avoid double delivery. `drawTentacle` derives a "front" position from `t.pipeline[0]` and draws a fixed-spacing dot stream from the source edge up to that front; the plain fixed-spacing dot stream is used as-is for `retract`/`free`/duel-front visuals.
- A cell may run `slotBase + floor(units / slotStep)` tentacles simultaneously, capped at `slotMax`.
- Between two friendly cells only one connection direction can be active at a time (one-way rule).
- A full cell never wastes incoming heal/production: the excess always goes into `cell.boost` (capped at `CONFIG.overflowBuffer`). Once it has one or more active (`grow`/`flow`) outgoing tentacles, `boost` is split evenly across them (`_boostShare`) and forwarded — the overflow/symbiosis chain. A cell that sat full and buffering releases that stored `boost` in a short burst once a tentacle finally docks.
- Capturing an **owned** cell (units < 0) auto-retracts its outgoing tentacles back to the new owner as captured mass.
- **Neutral cells are captured by charging, not by hitting 0** (`captureCharge`, `damageCell` → `captureCharge()`). Damage counts as charge for the attacker from the very first hit. Only at `CONFIG.captureCharge` points does ownership flip. A rival must first drain the existing charge (tracked by `cell.chargeOwner`) before loading their own.
- **Cell tiers / growth** (`cell.tierMax` 0–3, `cell.tier`, `updateTier`, `cellMax`/`cellProd`/`cellRadius`): a cell with `tierMax > 0` grows in steps at `CONFIG.tierUp` (40/80/120) and shrinks at `CONFIG.tierDown` (20/60/100, hysteresis), gaining capacity/production/radius per `CONFIG.tierMaxUnits`/`tierProdMul`/`tierRadiusAdd`. All sim/render code reads capacity/production/radius through the `cellMax`/`cellProd`/`cellRadius` helpers, never `typeOf(c).max/.prod/.radius` directly. `tierMax` is per-cell level data: hand-built levels set it explicitly; `mapgen` assigns it deterministically (symmetric siblings share one draw → fair).
- Multi-faction: every owner comparison in the simulation is generic (`owner !== t.owner` etc.); only `"player"`, `"neutral"`, and the `AI_FACTIONS` list carry special meaning. AI factions treat ALL other owners (including other AIs) as targets. Victory = player alive and every faction in `aiStates` dead; defeat = player dead (checked via cells + in-flight tentacle mass).

---

## Game: Tower Defense (`games/towerdefense/`)

Classic grid tower defense with a **10-level campaign**: each level has its own path on the 24×16 tile grid and its own difficulty (waves 12→30, startGold/startLives per level, enemy-HP multiplier `hpMul` 0.8→1.4; later maps have shorter/straighter paths). Levels unlock sequentially; finishing all 10 unlocks **Hardcore mode** (same levels, 1 life, auto-wave forced on, speed locked to 3×), with its own sequential unlock chain. German UI, DOM sidebar + canvas playfield. Mobile: sidebar stacks under the scaling canvas below 1240px width (media query in `style.css`); taps work via click events.

### File map (relative to `games/towerdefense/`)

Script order: `js/config.js → js/enemies.js → js/towers.js → js/game.js` (classic script tags, shared globals, no modules).

- **`index.html`** — header with stats (💰 gold, ❤️ lives, 🌊 wave, 💀 kills) + 🏠 hub link + `#level-name`, `<canvas id="game">` (fixed 960×640, scaled via CSS), sidebar (`#shop` — compact icon tiles, 3 columns (6 on mobile), details only in the info box —, upgrade/sell tool buttons, `#selection` info box (collapsible via header, default open; shows the selected built tower with upgrade/sell buttons + `upgradePreviewHtml()` "old → new" diff of the next upgrade, or the shop-selected tower type via `towerInfoHtml()` without buttons), wave panel with auto-mode checkbox, `#stats-panel` (collapsible, default collapsed), speed buttons 1×/2×/3×, `#btn-dev` + `#dev-panel` (live balance tuning: number inputs for every `TUNING` key with `TUNING_INFO` hover tooltips, +500 gold cheat, reset-to-defaults)), `#overlay` (win/lose: next-level/restart/menu buttons), `#menu` (level select: `#level-grid` normal, `#level-grid-hc` hardcore, lock hint `#hc-sub`).
- **`style.css`** — dark theme, sidebar/shop/button styles, `.hidden`, overlay, level-select menu (`#menu`, `.level-tile` incl. `.done`/`.locked`/`.hc`), mobile media query.
- **`js/config.js`** — `CONFIG` (tileSize 40, 24×16 grid), `TUNING` (live-editable balance knobs: `hpGrowth` 1.17, `hpMulGlobal`, `goldGrowth` 0.07, `goldMulGlobal`, `speedGrowth`/`speedMax`, `waveBonusBase` 20, `towerDmgMul`, `startGoldBonus`, `stunImmunity` 2) + `TUNING_DEFAULTS` (reset copy) + `TUNING_INFO` (German tooltip texts; add one for every new TUNING key), `LEVELS` (the 10 campaign levels: `name`, `desc`, `waypoints` — axis-aligned grid waypoints —, `waves`, `startGold`, `startLives`, `hpMul`), `TOWER_TYPES` (arrow/cannon/frost/sniper/booster/haste with per-level stats incl. `upgradeCost`; booster levels have `buff`+`range`, haste levels `rateBuff`+`range` instead of damage; upgrade specials: arrow `targets` 1/3/999, cannon L3 `stun`, frost L3 `splash` = frost bomb, sniper L2+ `critEvery`/`critMult`), `ENEMY_TYPES` (runner/soldier/tank/swift/boss), `buildWave(n, hpMul)` (wave composition; HP scales ×1.16^(n−1)·hpMul, gold linear +8%/wave, speed up to +50%; bosses every 10th wave).
- **`js/enemies.js`** — `PATH_PIXELS` (mutable; `computePathPixels(waypoints)` rebuilds it per level), `Enemy` (waypoint walking, `takeDamage` — counts non-overkill damage into `state.damageDealt` —, `applySlow` (strongest slow wins, duration refreshes), `applyStun` (full stop; ignored while already stunned or during the `TUNING.stunImmunity` immunity window that starts when a stun ends), `progress()` for "frontmost" targeting, HP bar draw), `WaveSpawner` (time-sorted spawn queue built from `buildWave(n, state.levelDef.hpMul)`, 1.5s pause between groups).
- **`js/towers.js`** — `Tower` (grid placement, level/upgrade/`invested`/`sellValue` = 50% of invested; targets the `stats.targets || 1` frontmost enemies in range with one projectile each per shot; `shots` counter drives deterministic crits via `critEvery`/`critMult`; cooldown = `fireRate / rateMult`; aura towers don't shoot: `isBooster` = has `buff` or `rateBuff`), `Projectile` (homing, optional `dmgMult` for crits — crit shots draw bigger/golden; on hit: splash applies damage + slow + stun to everything in radius, otherwise single-target damage/slow/stun), `Explosion` (visual only).
- **`js/game.js`** — `pathTiles` (mutable; `buildPathTiles(waypoints)` per level), progress API (`loadProgress`/`markCompleted`/`isUnlocked`/`hardcoreUnlocked`, key `towerdefense.progress.v1`, try/catch-wrapped), `state` (+ `levelIndex`/`levelDef`/`hardcore`/`totalWaves`) + `resetState()` (hardcore: 1 life, autoWave on, speed 3), `loadLevel(index, hardcore)`, `showMenu()`/`buildMenu()` (level select; sets `gameOver` while menu is open to halt the sim), `applyModeUI()` (locks auto checkbox + speed buttons in hardcore), shop build-out and all UI wiring (place/upgrade/sell via selection panel or click tools, Escape/right-click cancels), `startNextWave`/auto-wave, `update(dt)` (spawner → enemies → booster buff pass [strongest booster wins, no stacking] → towers → projectiles → effects; gold/lives/kill accounting; wave bonus = `waveBonusBase + wave*3`; win after `state.totalWaves` waves and lives > 0 → `markCompleted`, lose at 0 lives), rendering (grid, path, placement preview with range circle), `loop()` (dt clamped to 50ms; speed setting runs `update` 1–3× per frame). Boot: loads the first uncompleted unlocked level, then shows the menu.

### Rules / invariants

- Towers can only be built on tiles that are inside the grid, not on `pathTiles`, and not occupied.
- Aura buffs are computed fresh every frame (`buffMult`/`rateMult` reset to 1, then max over auras in range — per buff kind the strongest wins, no stacking; damage and rate buffs combine independently); DPS-relevant damage is `stats.damage * buffMult`, applied when the projectile is created.
- `damageDealt` counts actual HP removed (no overkill).
- Level `waypoints` segments must be strictly horizontal or vertical (the `buildPathTiles` walk assumes it); start/end may lie one tile off-grid (col −1 / 24) or on-grid (e.g. the spiral ends mid-map).
- Hardcore is only reachable via the level-select (grid hidden behind `hardcoreUnlocked`); in hardcore the auto-wave checkbox and speed buttons are disabled and their listeners no-op.
- Persistence: `towerdefense.progress.v1` — `{ v: 1, normal: [levelIndices], hardcore: [levelIndices] }` (completed levels per mode).
