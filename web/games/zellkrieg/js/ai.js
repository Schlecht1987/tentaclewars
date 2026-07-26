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

  // 0) Bestehende Tentakel überdenken – die KI klebt sonst für immer an
  //    ihrer ersten Entscheidung, weil belegte Slots nie wieder frei werden:
  //    a) Abtrenn-Trick: Reicht die in der Tentakel gebundene Masse aus, um
  //       das Ziel zu übernehmen, wird nahe der Quelle geschnitten – das
  //       vordere Stück fliegt weiter und erledigt den Rest, der Slot ist
  //       sofort wieder frei für eine neue Entscheidung.
  //    b) Fertige Verstärkung (Ziel + Puffer randvoll) einziehen.
  //    c) Aussichtslose Kämpfe abbrechen: ein Duell, das die eigene Quelle
  //       ausblutet, oder ein einseitiger Solo-Angriff, der langsamer
  //       schadet, als das Ziel produziert.
  for (const t of [...tentacles]) {
    if (budget <= 0) return;
    if (t.dead || t.owner !== owner || t.mode !== "flow" || t.src.owner !== owner) continue;
    const src = t.src, dst = t.dst;

    if (dst.owner === owner) {
      if (dst.units >= cellMax(dst) - 1 && dst.boost >= CONFIG.overflowBuffer - 1) {
        t.mode = "retract"; budget--;
      }
      continue;
    }

    const per = effDamagePerUnit(src, dst);
    // Masse, die beim Schnitt nahe der Quelle als freies Stück beim Ziel
    // ankäme (Schnittabstand + Sicherheitsmarge bereits abgezogen)
    const massPts = Math.max(0, t.head - t.tail - 14) / CONFIG.lengthPerUnit;
    const finishes = dst.owner === "neutral"
      ? (dst.chargeOwner === owner && dst.units + massPts * per >= CONFIG.captureCharge + 1)
      : (massPts * per >= dst.units + 2);
    if (per > 0 && finishes && cutTentacle(t, t.tail + 7)) { budget--; continue; }

    const soloAttack = !tentacles.some(o => o !== t && !o.dead && o.owner === owner &&
      o.dst === dst && (o.mode === "grow" || o.mode === "flow"));
    const losingDuel = t._clash && src.units < profile.minUnits && dst.units > src.units;
    const hopeless = !t._clash && soloAttack && dst.owner !== "neutral" &&
      cellProd(src) * per < cellProd(dst) * 0.7;
    if (losingDuel || hopeless) { t.mode = "retract"; budget--; }
  }
  if (budget <= 0) return;

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
