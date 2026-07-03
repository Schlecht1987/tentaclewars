# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Zellkrieg – a browser-based real-time strategy prototype in the style of *Tentacle Wars* / *Galcon*, written in German. The entire game is a single self-contained file: `zellkrieg.html` (HTML + Canvas + vanilla JavaScript, no build step, no dependencies, no external libraries).

## Running / testing

There is no build system. Open `zellkrieg.html` directly in a browser (double-click, or a local static server) to play and test changes. There are no automated tests — verify changes manually in-browser (see the `run` skill for driving the app if needed).

## Architecture

Everything lives in one `<script>` block inside `zellkrieg.html`. Key sections, top to bottom:

- **`CONFIG`** (~line 149) — all tunable numbers: tentacle grow/retract speed, cost per pixel of tentacle length (`lengthPerUnit`), transfer rate, tentacle-slot rules, bunker defense, home-field advantage in duels, AI cadence. Change gameplay balance here first.
- **`CELL_TYPES`** (~line 190) — the five cell types (`normal`, `healer`, `attacker`, `factory`, `bunker`) with production rate, max capacity, attack/heal-per-point, and render radius.
- **`LEVELS`** (~line 205) — level/map definitions, each an object with `name`, `desc`, `tag`, `sandbox` (true = both sides player-controlled, no AI, no win condition), and a `cells` array (id, type, owner, position in a virtual 1000×640 field, starting units). New entries automatically appear in the in-game level-select menu.
- **Simulation core**: `update(dt)` drives the whole game loop each frame — tentacle growth/retraction (`grow`/`flow`/`retract`/`free` modes), point transfer (`battleFeed`, `applyMass`), tentacle-vs-tentacle duels where opposing tentacles meet in a corridor (`findOpposing`, `battleFeed`, home-field bias), and capture logic (`captureCell`) when a cell's unit count drops below 0.
- **Player input**: pointer-event handlers (mouse + touch) translate drags into `tryCommand(src, dst)` (extend/retract a tentacle) or into cutting an existing tentacle by dragging across it (`performCut`, `segIntersect`).
- **Enemy AI**: `aiThink()`, called every `CONFIG.aiInterval` seconds — the strongest owned cell attacks the weakest reachable damageable target, otherwise reinforces its own front.
- **Rendering**: `draw(now)` and helpers (`drawCellShape`, `drawTentacle`, `shapePath`, `drawHealerBadge`) render cells, tentacles (with flow-dot animation and duel glow), and the drag-preview line onto the canvas. Coordinates are transformed between the virtual 1000×640 game field and actual canvas pixels via `view` (scale/offset) and `toWorld()`/`resize()`. `prefers-reduced-motion` disables decorative wobble/flicker animations.
- **Game flow**: `inMenu` gates the level-select overlay; `startLevel(index)` and `resetGame()` (re)initialize `cells`/`tentacles` from a `LEVELS` entry; `checkVictory()` ends the game when one side has no cells left (skipped in sandbox levels).

## Core game rules (needed to reason about changes correctly)

- Attack/heal values belong to the **sending** cell; bunker defense reduction belongs to the **receiving** cell.
- Growing a tentacle costs points from the source cell (`lengthPerUnit` points per pixel) — distance is the natural limiter, not a cooldown.
- Healing AND an unanswered (non-duel) attack are both capped at the source cell's production budget (`_flowBudget`) — the source's stored reserve never drops from one-sided flows. Only an actual **tentacle duel** (two opposing tentacles between the same two cells) drains stored reserve, via `battleFeed`, at the full `transferRate`.
- Transferred mass is not applied instantly: each docked (`flow`) tentacle queues sent amounts into `t.pipeline` (`{ amount, remaining }`) and only calls `applyMass` once `remaining` (= `t.len / CONFIG.flowDotSpeed`) counts down to 0 — mass visibly travels the tentacle before it heals/damages the target. Pipelines are processed independently of the tentacle's current mode so in-flight packets still arrive after a retract/cut; a dead tentacle is only removed once its pipeline is empty. `cutTentacle` gives the newly split-off piece its own empty pipeline array (the original object keeps the shared reference) to avoid double delivery.
- A cell may run `slotBase + floor(units / slotStep)` tentacles simultaneously, capped at `slotMax`.
- Between two friendly cells only one connection direction can be active at a time (one-way rule).
- Full cells forward incoming heal + own production through their outgoing tentacles instead of wasting it (overflow/symbiosis chains).
- Capturing a cell (units < 0) auto-retracts its outgoing tentacles back to the new owner as captured mass.
