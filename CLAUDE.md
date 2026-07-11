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

Classic grid tower defense: enemies walk a fixed path across a 24×16 tile grid; the player builds and upgrades towers on free tiles to survive 30 waves. German UI, DOM sidebar + canvas playfield. Mobile: sidebar stacks under the scaling canvas below 1240px width (media query in `style.css`); taps work via click events.

### File map (relative to `games/towerdefense/`)

Script order: `js/config.js → js/enemies.js → js/towers.js → js/game.js` (classic script tags, shared globals, no modules).

- **`index.html`** — header with stats (💰 gold, ❤️ lives, 🌊 wave, 💀 kills) + 🏠 hub link, `<canvas id="game">` (fixed 960×640, scaled via CSS), sidebar (`#shop`, upgrade/sell tool buttons, `#selection` panel, wave panel with auto-mode checkbox, `#stats-panel`, speed buttons 1×/2×/3×), `#overlay` (win/lose + restart).
- **`style.css`** — dark theme, sidebar/shop/button styles, `.hidden`, overlay, mobile media query.
- **`js/config.js`** — `CONFIG` (tileSize 40, 24×16 grid, startGold 100, startLives 20, totalWaves 30, waveBonusBase), `PATH_WAYPOINTS` (grid waypoints of the fixed enemy path), `TOWER_TYPES` (arrow/cannon/frost/sniper/booster with per-level stats incl. `upgradeCost`; booster levels have `buff`+`range` instead of damage), `ENEMY_TYPES` (runner/soldier/tank/swift/boss), `buildWave(n)` (wave composition; HP scales ×1.16^(n−1) exponentially, gold linear, speed up to +50%; bosses every 10th wave).
- **`js/enemies.js`** — `PATH_PIXELS` (waypoints → pixel centers), `Enemy` (waypoint walking, `takeDamage` — counts non-overkill damage into `state.damageDealt` —, `applySlow` (strongest slow wins, duration refreshes), `progress()` for "frontmost" targeting, HP bar draw), `WaveSpawner` (time-sorted spawn queue built from `buildWave`, 1.5s pause between groups).
- **`js/towers.js`** — `Tower` (grid placement, level/upgrade/`invested`/`sellValue` = 50% of invested, targets frontmost enemy in range, boosters don't shoot: `isBooster`), `Projectile` (homing; on hit: splash damage in radius and/or slow), `Explosion` (visual only).
- **`js/game.js`** — `pathTiles` (blocked build tiles derived from waypoints), `state` + `resetState()`, shop build-out and all UI wiring (place/upgrade/sell via selection panel or click tools, Escape/right-click cancels), `startNextWave`/auto-wave, `update(dt)` (spawner → enemies → booster buff pass [strongest booster wins, no stacking] → towers → projectiles → effects; gold/lives/kill accounting; wave bonus = `waveBonusBase + wave*3`; win after wave 30, lose at 0 lives), rendering (grid, path, placement preview with range circle), `loop()` (dt clamped to 50ms; speed setting runs `update` 1–3× per frame).

### Rules / invariants

- Towers can only be built on tiles that are inside the grid, not on `pathTiles`, and not occupied.
- Booster buffs are computed fresh every frame (`buffMult` reset to 1, then max over boosters in range — strongest wins, no stacking); DPS-relevant damage is `stats.damage * buffMult`, applied when the projectile is created.
- `damageDealt` counts actual HP removed (no overkill).
- No persistence yet (no localStorage); one hardcoded map/path.
