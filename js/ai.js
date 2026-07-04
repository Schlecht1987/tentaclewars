"use strict";

/* ======================================================================
   GEGNER-KI
   Läuft pro KI-Fraktion mit eigenem Takt und Schwierigkeitsprofil
   (aiStates in game.js). Mehrere KI-Fraktionen bekämpfen sich dabei
   auch gegenseitig ("alles, was nicht mir gehört, ist ein Ziel").
   ====================================================================== */

function effDamagePerUnit(srcCell, targetCell) {
  let dmg = typeOf(srcCell).attack;
  if (targetCell.type === "bunker") dmg = bunkerReduced(dmg);
  return dmg;
}

function aiThink(owner, profile) {
  let budget = profile.commandsPerTick;
  const noise = () => (Math.random() * 2 - 1) * profile.targetNoise;

  const sources = cells
    .filter(c => c.owner === owner && Math.floor(c.units) >= profile.minUnits)
    .sort((a, b) => b.units - a.units);

  // 1) Stärkste Zellen mit freiem Slot fahren Tentakel aus:
  //    Ziel = schwächste, möglichst nahe fremde Zelle, der sie schaden
  //    können. targetNoise verwackelt die Bewertung (leichte KI zielt
  //    schlechter), 0 = perfekte Zielwahl.
  for (const src of sources) {
    if (budget <= 0) return;
    const out = outgoing(src);
    if (out.length >= maxSlots(src)) continue;

    const targets = cells.filter(c =>
      c !== src && c.owner !== owner &&
      !out.some(t => t.dst === c) &&
      effDamagePerUnit(src, c) > 0);
    if (targets.length) {
      const scored = targets
        .map(c => ({ c, s: c.units + Math.hypot(c.x - src.x, c.y - src.y) * 0.05 + noise() }))
        .sort((a, b) => a.s - b.s);
      if (tryCommand(src, scored[0].c)) budget--;
    }
  }
  if (budget <= 0) return;

  // 2) Fallback: stärkste Zelle verstärkt die schwächste eigene Zelle
  for (const src of sources) {
    if (budget <= 0) return;
    const out = outgoing(src);
    if (out.length >= maxSlots(src)) continue;
    const own = cells.filter(c =>
      c !== src && c.owner === owner && c.units < src.units - 8 &&
      !out.some(t => t.dst === c) &&
      // Einbahn-Regel: keine Gegen-Tentakel zu einer Zelle, die schon zu uns verbindet
      !tentacles.some(t => !t.dead && t.src === c && t.dst === src &&
        (t.mode === "grow" || t.mode === "flow")));
    if (own.length) {
      own.sort((a, b) => a.units - b.units);
      if (tryCommand(src, own[0])) budget--;
    }
  }
}
