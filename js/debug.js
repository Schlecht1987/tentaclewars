"use strict";

/* ======================================================================
   DEBUG-EXPORT
   ----------------------------------------------------------------------
   Werkzeug, um den kompletten Spielzustand in dem Moment zu erfassen, in
   dem etwas falsch läuft – zum Weitergeben (Datei oder Zwischenablage).

   Bedienung im Spiel:
     • Knopf "🐞" oben im HUD           → lädt einen JSON-Schnappschuss herunter
     • Taste  F9                        → lädt einen JSON-Schnappschuss herunter
     • Taste  Shift+F9                  → kopiert den Schnappschuss in die Zwischenablage

   Bedienung in der Browser-Konsole (F12):
     • zkDebug()        – Schnappschuss in die Konsole legen + Zwischenablage + zurückgeben
     • zkDownload()     – Schnappschuss als Datei herunterladen
     • zkCopy()         – Schnappschuss in die Zwischenablage kopieren
     • zkRecord(6)      – 6 Sekunden lang aufzeichnen (alle 200 ms) und als Zeitleiste herunterladen

   Dieses Modul deklariert nur Funktionen/Handler; es führt beim Laden keine
   dateiübergreifende Logik aus (siehe CLAUDE.md).
   ====================================================================== */

// Auf 2 Nachkommastellen runden, NaN/Infinity als String erhalten (damit die
// Auffälligkeit im Export sichtbar bleibt statt zu null zu werden).
function zkRound(v) {
  if (typeof v !== "number") return v;
  if (!isFinite(v)) return String(v); // "NaN" / "Infinity" / "-Infinity"
  return Math.round(v * 100) / 100;
}

const ZK_KNOWN_OWNERS = ["player", "enemy", "enemy2", "enemy3", "neutral"];

// Eindeutige, stabile Zell-IDs (aus dem Level, sonst Index) für Verweise.
function zkCellIndex() {
  const map = new Map();
  cells.forEach((c, i) => map.set(c, c.id != null ? c.id : i));
  return map;
}

// Kompakte Fraktions-Übersicht: Zellen, Summe Vorrat, Tentakel je Besitzer.
function zkOwnerSummary() {
  const sum = {};
  const bump = (o, key, val) => {
    if (!sum[o]) sum[o] = { cells: 0, units: 0, tentacles: 0, inFlight: 0 };
    sum[o][key] += val;
  };
  for (const c of cells) {
    if (!sum[c.owner]) bump(c.owner, "cells", 0);
    bump(c.owner, "cells", 1);
    bump(c.owner, "units", isFinite(c.units) ? c.units : 0);
  }
  for (const t of tentacles) {
    if (t.dead) continue;
    bump(t.owner, "tentacles", 1);
    bump(t.owner, "inFlight", t.head - t.tail);
  }
  for (const o of Object.keys(sum)) {
    sum[o].units = zkRound(sum[o].units);
    sum[o].inFlight = zkRound(sum[o].inFlight);
  }
  return sum;
}

// Heuristische Auffälligkeiten: klar inkonsistente Zustände markieren, damit
// beim Lesen des Schnappschusses sofort auffällt, was schieflaufen KÖNNTE.
// Das sind Hinweise, kein Beweis für einen Bug – aber ein guter Startpunkt.
function zkAnomalies() {
  const out = [];
  const id = zkCellIndex();
  const cap = (typeof CONFIG !== "undefined" && CONFIG.captureCharge) || Infinity;

  for (const c of cells) {
    const ref = `Zelle #${id.get(c)} (${c.type}/${c.owner})`;
    if (!isFinite(c.units)) out.push(`${ref}: units ist ${c.units}`);
    if (isFinite(c.units) && c.units < -0.5) out.push(`${ref}: units bleibt negativ (${zkRound(c.units)})`);
    if (isFinite(c.boost) && c.boost < -0.01) out.push(`${ref}: boost negativ (${zkRound(c.boost)})`);
    if (!ZK_KNOWN_OWNERS.includes(c.owner)) out.push(`${ref}: unbekannter Besitzer "${c.owner}"`);
    if (c.owner !== "neutral" && c.chargeOwner) out.push(`${ref}: chargeOwner gesetzt, obwohl nicht neutral`);
    if (c.owner === "neutral" && c.chargeOwner && isFinite(c.units) && c.units >= cap)
      out.push(`${ref}: neutral aber bereits voll geladen (${zkRound(c.units)}/${cap}) – Eroberung nicht ausgelöst?`);
    const tm = c.tierMax || 0;
    if ((c.tier || 0) > tm) out.push(`${ref}: tier ${c.tier} > tierMax ${tm}`);
    const used = outgoing(c).length, cap = maxSlots(c);
    if (used > cap) out.push(`${ref}: führt ${used} Tentakel, erlaubt sind nur ${cap} (Slot-Limit überschritten)`);
  }

  for (const t of tentacles) {
    const ref = `Tentakel ${id.has(t.src) ? "#" + id.get(t.src) : "?"}→${id.has(t.dst) ? "#" + id.get(t.dst) : "?"} (${t.owner}/${t.mode})`;
    if (!cells.includes(t.src)) out.push(`${ref}: Quelle nicht mehr im Spiel`);
    if (!cells.includes(t.dst)) out.push(`${ref}: Ziel nicht mehr im Spiel`);
    if (t.head < t.tail - 0.01) out.push(`${ref}: head < tail (${zkRound(t.head)} < ${zkRound(t.tail)})`);
    if (t.head > t.len + 0.5) out.push(`${ref}: head über Länge hinaus (${zkRound(t.head)} > ${zkRound(t.len)})`);
    if (!isFinite(t.head) || !isFinite(t.tail)) out.push(`${ref}: head/tail nicht endlich`);
    if (t.src && t.owner !== t.src.owner && !t.dead)
      out.push(`${ref}: Besitzer weicht von Quelle (${t.src.owner}) ab`);
    const pmass = t.pipeline.reduce((s, p) => s + (p.amount || 0), 0);
    if (pmass > 500) out.push(`${ref}: sehr viel Masse in der Pipeline (${zkRound(pmass)})`);
  }

  // Einbahn-Regel: zwischen zwei befreundeten Zellen sollte nur EINE Richtung
  // aktiv sein.
  for (const t of tentacles) {
    if (t.dead || (t.mode !== "grow" && t.mode !== "flow")) continue;
    if (t.dst.owner !== t.owner) continue;
    const back = tentacles.find(o => !o.dead && o.src === t.dst && o.dst === t.src &&
      (o.mode === "grow" || o.mode === "flow"));
    if (back && id.get(t.src) < id.get(t.dst))
      out.push(`Einbahn-Regel verletzt: befreundete #${id.get(t.src)} ↔ #${id.get(t.dst)} fließen in beide Richtungen`);
  }

  if (tentacles.length > 200) out.push(`Sehr viele Tentakel aktiv (${tentacles.length}) – evtl. werden tote nicht entfernt`);
  return out;
}

// Vollständiger Schnappschuss des aktuellen Frames als schlichtes Objekt.
function zkSnapshot() {
  const id = zkCellIndex();
  const cur = typeof currentRef !== "undefined" ? currentRef : null;
  return {
    meta: {
      app: "Zellkrieg",
      generated: new Date().toISOString(),
      userAgent: navigator.userAgent,
      protocol: location.protocol,
      viewport: { w: window.innerWidth, h: window.innerHeight, dpr: window.devicePixelRatio || 1 },
      reducedMotion: typeof reducedMotion !== "undefined" ? reducedMotion : null
    },
    state: {
      inMenu: typeof inMenu !== "undefined" ? inMenu : null,
      gameOver: typeof gameOver !== "undefined" ? gameOver : null,
      ref: cur,
      selected: selected ? id.get(selected) : null,
      dragSource: dragSource ? id.get(dragSource) : null
    },
    level: LEVEL ? {
      name: LEVEL.name, tag: LEVEL.tag, desc: LEVEL.desc,
      sandbox: !!LEVEL.sandbox, width: LEVEL.width, height: LEVEL.height,
      ai: LEVEL.ai || null
    } : null,
    view: { ...view },
    ownerSummary: zkOwnerSummary(),
    aiStates: aiStates.map(s => ({ owner: s.owner, timer: zkRound(s.timer), profile: s.profile })),
    cells: cells.map(c => ({
      id: id.get(c), type: c.type, owner: c.owner,
      units: zkRound(c.units),
      tier: c.tier || 0, tierMax: c.tierMax || 0,
      boost: zkRound(c.boost),
      chargeOwner: c.chargeOwner || null,
      x: Math.round(c.x), y: Math.round(c.y),
      max: zkRound(cellMax(c)), prod: zkRound(cellProd(c)), radius: zkRound(cellRadius(c)),
      slotsUsed: outgoing(c).length, slotsMax: maxSlots(c)
    })),
    tentacles: tentacles.map(t => ({
      src: id.has(t.src) ? id.get(t.src) : null,
      dst: id.has(t.dst) ? id.get(t.dst) : null,
      owner: t.owner, mode: t.mode, dead: !!t.dead,
      tail: zkRound(t.tail), head: zkRound(t.head), len: zkRound(t.len),
      attack: t.attack, heal: t.heal,
      rate: zkRound(t.rate), dotSpeed: zkRound(t.dotSpeed),
      pipelineCount: t.pipeline.length,
      pipelineMass: zkRound(t.pipeline.reduce((s, p) => s + (p.amount || 0), 0)),
      opposing: !!t._opp, clashing: !!t._clash
    })),
    anomalies: zkAnomalies(),
    config: typeof CONFIG !== "undefined" ? CONFIG : null,
    cellTypes: typeof CELL_TYPES !== "undefined" ? CELL_TYPES : null
  };
}

// Menschlich lesbare Kurzfassung (steht ganz oben im Export, damit man ohne
// JSON-Parser schon das Wichtigste sieht).
function zkTextSummary(snap) {
  const L = [];
  L.push(`Zellkrieg-Debug – ${snap.meta.generated}`);
  if (snap.level) L.push(`Level: ${snap.level.name}${snap.level.sandbox ? " (Sandbox)" : ""}  ${snap.state.ref ? JSON.stringify(snap.state.ref) : ""}`);
  L.push(`Zustand: ${snap.state.inMenu ? "im Menü" : "läuft"}${snap.state.gameOver ? ", Spiel vorbei" : ""}`);
  L.push("Fraktionen:");
  for (const [o, s] of Object.entries(snap.ownerSummary)) {
    L.push(`  ${o}: ${s.cells} Zellen, ${s.units} Vorrat, ${s.tentacles} Tentakel (${s.inFlight}px unterwegs)`);
  }
  if (snap.anomalies.length) {
    L.push(`Auffälligkeiten (${snap.anomalies.length}):`);
    for (const a of snap.anomalies) L.push(`  ⚠ ${a}`);
  } else {
    L.push("Auffälligkeiten: keine automatisch erkannt");
  }
  return L.join("\n");
}

function zkText() {
  const snap = zkSnapshot();
  return zkTextSummary(snap) + "\n\n--- Vollständiger Zustand (JSON) ---\n" + JSON.stringify(snap, null, 2);
}

// Als Datei herunterladen (zuverlässigster Weg zum Teilen).
function zkDownload() {
  const text = zkText();
  const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const blob = new Blob([text], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `zellkrieg-debug-${stamp}.txt`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
  console.log("[Zellkrieg] Debug-Datei heruntergeladen:", a.download);
  return a.download;
}

// In die Zwischenablage kopieren (nur über https/localhost zuverlässig).
function zkCopy() {
  const text = zkText();
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(
      () => console.log("[Zellkrieg] Debug-Zustand in die Zwischenablage kopiert (einfach einfügen)."),
      () => { console.warn("[Zellkrieg] Kopieren fehlgeschlagen – lade stattdessen als Datei herunter."); zkDownload(); }
    );
  } else {
    console.warn("[Zellkrieg] Zwischenablage nicht verfügbar – lade stattdessen als Datei herunter.");
    zkDownload();
  }
  return text;
}

// Konsolen-Komfort: Kurzfassung ausgeben, ganzes Objekt zurückgeben, kopieren.
function zkDebug() {
  const snap = zkSnapshot();
  console.log("%c[Zellkrieg] Debug-Schnappschuss", "font-weight:bold");
  console.log(zkTextSummary(snap));
  console.log(snap);
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(zkTextSummary(snap) + "\n\n" + JSON.stringify(snap, null, 2))
      .then(() => console.log("[Zellkrieg] (auch in die Zwischenablage kopiert)"), () => {});
  }
  return snap;
}

// Zeitleiste aufzeichnen: für Bugs, die sich ERST ÜBER DIE ZEIT zeigen.
let zkRecTimer = null;
function zkRecord(seconds = 6, stepMs = 200) {
  if (zkRecTimer) { console.warn("[Zellkrieg] Aufzeichnung läuft bereits."); return; }
  const frames = [];
  const t0 = performance.now();
  console.log(`[Zellkrieg] Zeichne ${seconds}s auf (alle ${stepMs}ms)…`);
  zkRecTimer = setInterval(() => {
    frames.push({ t: Math.round(performance.now() - t0), snap: zkSnapshot() });
    if (performance.now() - t0 >= seconds * 1000) {
      clearInterval(zkRecTimer);
      zkRecTimer = null;
      const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
      const blob = new Blob([JSON.stringify({ app: "Zellkrieg", kind: "timeline", frames }, null, 2)],
        { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = `zellkrieg-timeline-${stamp}.json`;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
      console.log(`[Zellkrieg] Zeitleiste mit ${frames.length} Frames heruntergeladen: ${a.download}`);
    }
  }, stepMs);
}

/* --- Verdrahtung (Browser-APIs; kein dateiübergreifender Aufruf beim Laden) --- */

window.addEventListener("keydown", e => {
  if (e.key === "F9") {
    e.preventDefault();
    e.shiftKey ? zkCopy() : zkDownload();
  }
});

// HUD-Knopf, falls vorhanden (index.html), sonst still ignorieren.
(function () {
  const btn = document.getElementById("btnDebug");
  if (btn) btn.addEventListener("click", zkDownload);
})();

console.log("[Zellkrieg] Debug bereit: F9 = Datei · Shift+F9 = kopieren · Konsole: zkDebug(), zkDownload(), zkRecord(6)");
