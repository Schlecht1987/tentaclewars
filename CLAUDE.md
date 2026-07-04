# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Zellkrieg – a browser-based real-time strategy game in the style of *Tentacle Wars* / *Galcon*, written in German. HTML + Canvas + vanilla JavaScript, no build step, no dependencies, no external libraries. Ships as an installable PWA (manifest + service worker) with a 50-level campaign, a configurable random-game generator (1–3 AI factions), and a sandbox.

## Running / testing

There is no build system. Canonical dev workflow: serve the repo root with a static server (`npx serve .` or VS Code Live Server) and open `index.html` via http. Opening `index.html` directly via double-click (file://) also works for quick play, but: the service worker does not register on file://, and file:// has its own localStorage origin, so campaign progress does not transfer between the two.

There are no automated tests — verify changes manually in-browser (see the `run` skill for driving the app). During development beware the service worker's cache-first behavior hiding your edits: in DevTools → Application → Service Workers enable "Update on reload" / "Bypass for network". For releases, bump the `CACHE` version constant in `sw.js`.

## Changelog

This project keeps `CHANGELOG.md` at the repo root, following the [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) format (`Added`/`Changed`/`Deprecated`/`Removed`/`Fixed`/`Security` sections under `[Unreleased]` or a version heading). Whenever you change game logic/mechanics, add an entry to `CHANGELOG.md` under `[Unreleased]` describing the change — and update `README.md` if the change affects documented rules or mechanics (see "Core game rules" below).

## File map

Classic `<script src>` tags (NOT ES modules — those would break file:// via CORS). `index.html` loads the scripts in dependency order:
`config.js → rng.js → levels.js → mapgen.js → campaign.js → ai.js → game.js → ui.js → debug.js → main.js`.
**Rule: no top-level code that executes another file's symbols, except in `js/main.js`** (the single bootstrap). Declaring globals and functions is fine anywhere; calling across files at load time is not.

- **`index.html`** — head (viewport, theme-color, manifest/icon links), DOM (canvas, HUD `#factionChips`, hint, `#levelSelect` with `#campaignGrid`, `#randomSetup` form, legend, `#overlay`), script tags.
- **`styles.css`** — all CSS: color tokens per faction (`--player`, `--enemy`, `--enemy2`, `--enemy3`, `--neutral`), menu/grid/pill styles, safe-area insets, and the small-screen media query (`max-width: 700px` / `max-height: 520px` hides legend + hint).
- **`js/config.js`** — `CONFIG` (all balance numbers), `CELL_TYPES` (the five cell types), `OWNER_COLOR` (must match the CSS tokens), `AI_FACTIONS` (`["enemy","enemy2","enemy3"]`), `OWNER_LABEL`, `AI_PROFILES` (easy/medium/hard: `{ interval, minUnits, commandsPerTick, targetNoise }`), `aiProfileFor(level, owner)`.
- **`js/rng.js`** — `mulberry32(seed)` plus `rngInt`/`rngPick`/`rngWeighted`. All map generation randomness MUST go through a passed-in rng, never `Math.random()`, or determinism breaks.
- **`js/levels.js`** — hand-built levels: `SANDBOX_LEVEL` (Testlabor) and `CAMPAIGN_HANDBUILT` (keyed by campaign level number; currently 1, 10, 50).
- **`js/mapgen.js`** — `generateMap(params, rng)` produces a LEVELS-shaped object (symmetric mode: mirrored for 2 factions / rotational for 3–4, provably fair; random mode: rejection sampling with relaxing min distances; playability check adds a neutral bridge cell if a faction can't reach anything). `generateRandomLevel(settings)` maps the random-game settings to generateMap params.
- **`js/campaign.js`** — `campaignDifficulty(n)` (difficulty ramp for level n of 50), `generateCampaignLevel(n)` (hand-built override or deterministic generation from `mulberry32(CAMPAIGN_SEED ^ Math.imul(n, 2654435761))`), progress API (`loadProgress`/`markCompleted`/`isUnlocked`/`isCompleted`).
- **`js/ai.js`** — `aiThink(owner, profile)`: per-faction AI; strongest own cell attacks weakest reachable damageable target (anything not owned by `owner` — AI factions fight each other too), else reinforces its own front; up to `profile.commandsPerTick` commands per tick, `targetNoise` jitters target scoring.
- **`js/game.js`** — game state (`LEVEL`, `cells`, `tentacles`, `aiStates`, `inMenu`, `gameOver`, `view`), `resetGame()` (also builds one `aiStates` entry per AI faction present, with random timer phase), `resize()` (DPR-aware letterboxing, smaller padding on small screens), the full simulation `update(dt)` (tentacle grow/flow/retract/free, duels, pipeline delivery, per-faction AI ticking), `checkVictory()` (lose if player dead, win if all AI factions from `aiStates` dead; delegates overlay to `showGameEnd` in ui.js), pointer input, all canvas rendering, `frame()` main loop.
- **`js/ui.js`** — `startLevel(levelObj, ref)` where `ref` is `{kind:"campaign",n} | {kind:"random",settings} | {kind:"sandbox"}` (drives progress + the overlay's next button), `showLevelMenu`, `buildCampaignGrid` (50 tiles: locked/open/done), random-game form (settings persisted), `buildHud`/`updateHud` (one chip per faction), `showGameEnd`, `buildLegend`, `initUi()` (all event wiring; called once from main.js).
- **`js/debug.js`** — diagnostics only, no game-logic side effects. `zkSnapshot()` builds a plain-object snapshot of the current frame (cells with derived max/prod/radius/slots, tentacles by cell id incl. mode/head/tail/pipeline mass, aiStates, view, ownerSummary, CONFIG/CELL_TYPES) and `zkAnomalies()` flags heuristically-inconsistent state (NaN/negative units, unknown owner, orphaned/over-length tentacles, one-way-rule violation, un-triggered neutral capture, …). Export via 🐞 HUD button / **F9** (download `.txt`), **Shift+F9** (clipboard), or console `zkDebug()`/`zkDownload()`/`zkCopy()`/`zkRecord(seconds)` (timeline for time-dependent bugs). Reads game.js/config globals at call time only; top level just registers a keydown + button listener (browser APIs, so it respects the no-cross-file-execution-at-load rule).
- **`js/main.js`** — bootstrap (sets `LEVEL`, wires resize, starts the loop, opens the menu) + service-worker registration (http(s) only).
- **`manifest.webmanifest`, `sw.js`, `icons/`** — PWA install/offline. `sw.js` precaches all static files cache-first; `CACHE` version must be bumped per release. Icons are generated by `node tools/gen-icons.mjs` (dependency-free; only rerun when the icon design changes — PNGs are committed).

## Level schema

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

## Campaign determinism (IMPORTANT)

Generated campaign level n is a pure function of `CAMPAIGN_SEED`, n, and the mapgen algorithm. **Never change `generateMap`'s sampling order/logic or `campaignDifficulty`'s mapping for shipped levels without bumping `CAMPAIGN_SEED`** — otherwise all 50 maps silently change under players' feet. Hand-built exceptions go in `CAMPAIGN_HANDBUILT` instead.

## localStorage keys

- `zellkrieg.progress.v1` — `{ v: 1, completed: [levelNumbers], lastPlayed: n }`
- `zellkrieg.randomSettings.v1` — last used random-game settings incl. seed

All access is try/catch-wrapped (private mode). file:// and localhost are separate origins.

## Core game rules (needed to reason about changes correctly)

- Attack/heal values belong to the **sending** cell; bunker defense reduction belongs to the **receiving** cell. Bunker defense (`bunkerReduced()`) scales damage-per-point down (currently halves it via `attack / 2^bunkerDefense`) rather than subtracting a flat amount — so a bunker is never fully immune to weak attackers (attack ≤ defense), just much slower to crack than for an `attacker`-type cell.
- Growing a tentacle costs points from the source cell (`lengthPerUnit` points per pixel) — distance is the natural limiter, not a cooldown.
- Healing AND an unanswered (non-duel) attack are both capped at the source cell's production budget (`_flowBudget`) — the source's stored reserve never drops from one-sided flows. Only an actual **tentacle duel** (two opposing tentacles between the same two cells) drains stored reserve, via `battleFeed`, at the full `transferRate`. In the clash resolution the loser always yields ground (decoupled from whether the winner can afford to advance — otherwise two depleted cells froze the front forever and an attacked 0-unit cell was never captured), and the home-field bias (`clashHomefield`) only applies to a cell whose stored reserve exceeds `CONFIG.clashHoldMin` — an **empty cell cannot hold a front**, so a supplied attacker breaks through. When *both* clashing cells are exhausted (reserve ≤ `clashHoldMin`), `net` is only production noise (~0) and neither home-field applies, which previously left the front frozen at two 0-unit cells forever — so a tie-breaker kicks in: the tentacle with the shorter remaining distance to its target (`len - head`) gets a small, self-reinforcing advance (`CONFIG.clashBreak` px/s) that always resolves the duel into a capture. It fires *only* when both are empty, so real supply advantages are untouched.
- Transferred mass is not applied instantly: each docked (`flow`) tentacle queues sent amounts into `t.pipeline` (`{ amount, remaining, travel }`) and only calls `applyMass` once `remaining` (= `t.len / t.dotSpeed`, stored as `travel`) counts down to 0 — mass visibly travels the tentacle before it heals/damages the target. `t.dotSpeed` scales with the tentacle's smoothed throughput (`t.rate` = mass/sec × per-point value), so stronger flows visibly move — and arrive — faster, but never slower than `CONFIG.flowDotSpeed`. The draw derives the flow-dot front from `t.pipeline[0]` using its own `travel` so the mapping stays exact even as `dotSpeed` drifts. Pipelines are processed independently of the tentacle's current mode so in-flight packets still arrive after a retract/cut; a dead tentacle is only removed once its pipeline is empty. `cutTentacle` gives the newly split-off piece its own empty pipeline array (the original object keeps the shared reference) to avoid double delivery. `drawTentacle` does NOT render one dot per `t.pipeline` entry (a new entry is queued every frame — at 60fps that's ~60/s, close enough together to visually merge into a solid white blob). Instead it derives a "front" position from `t.pipeline[0]` (the oldest/soonest-to-arrive packet) and draws the usual fixed-spacing dot stream from the source edge up to that front — so dots stay visually distinct while the front still advances at the real transfer speed and only reaches the target once the first packet actually would. The older fixed-spacing dot stream is used as-is for `retract`/`free`/duel-front visuals, where the segment length already *is* the physical mass.
- A cell may run `slotBase + floor(units / slotStep)` tentacles simultaneously, capped at `slotMax`.
- Between two friendly cells only one connection direction can be active at a time (one-way rule).
- Full cells forward incoming heal + own production through their outgoing tentacles instead of wasting it (overflow/symbiosis chains).
- Capturing an **owned** cell (units < 0) auto-retracts its outgoing tentacles back to the new owner as captured mass.
- **Neutral cells are captured by charging, not by hitting 0** (`captureCharge`, `damageCell` → `captureCharge()`). Damage counts as charge for the attacker from the very first hit — the cell's starting garrison (`units` from the level template) does not need to be broken first. Only at `CONFIG.captureCharge` points does ownership flip. A rival must first drain the existing charge (tracked by `cell.chargeOwner`) before loading their own — so out-damaging the current holder is required. This removes the old "whoever lands the killing tick steals it" race without gating the charge behind a separate defense phase.
- **Cell tiers / growth** (`cell.tierMax` 0–3, `cell.tier`, `updateTier`, `cellMax`/`cellProd`/`cellRadius`): a cell with `tierMax > 0` grows in steps at `CONFIG.tierUp` (40/80/120) and shrinks at `CONFIG.tierDown` (20/60/100, a 20-pt hysteresis), gaining capacity/production/radius per `CONFIG.tierMaxUnits`/`tierProdMul`/`tierRadiusAdd`. Cells with `tierMax === 0` behave exactly as before (type max/prod/radius). All sim/render code reads capacity/production/radius through the `cellMax`/`cellProd`/`cellRadius` helpers, never `typeOf(c).max/.prod/.radius` directly. `tierMax` is per-cell level data: hand-built levels set it explicitly; `mapgen` assigns it deterministically (symmetric siblings share one draw → fair). Adding those rng draws is why `CAMPAIGN_SEED` was bumped.
- Multi-faction: every owner comparison in the simulation is generic (`owner !== t.owner` etc.); only `"player"`, `"neutral"`, and the `AI_FACTIONS` list carry special meaning. AI factions treat ALL other owners (including other AIs) as targets. Victory = player alive and every faction in `aiStates` dead; defeat = player dead (checked via cells + in-flight tentacle mass).
