"use strict";

/* ======================================================================
   SPIELZUSTAND
   ====================================================================== */

const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");
const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const coarsePointer = window.matchMedia("(pointer: coarse)").matches;

let LEVEL = null;     // aktuell aktives Level (wird von ui.js/main.js gesetzt)

let cells = [];
let tentacles = [];   // aktive Tentakel und abgetrennte Stücke
let stars = [];       // dekorativer Hintergrund

let selected = null;    // ausgewählte eigene Zelle
let dragSource = null;  // Zelle, von der aus gerade gezogen wird
let hovered = null;
let pointerWorld = { x: 0, y: 0 };

let cutting = false;      // Spieler zieht gerade eine Schnittlinie
let cutLast = null;       // letzter Punkt der Schnittlinie
let cutStart = null;      // Startpunkt der Schnittlinie
let cutArmed = false;     // Schnitt erst nach kurzer Zugstrecke "scharf"
let cutTrail = [];        // Schnittspur (visuell, verblasst)
let slashes = [];         // kurze Schnitt-Markierungen (auch für KI-Schnitte)

let aiStates = [];   // pro KI-Fraktion: { owner, profile, timer }
let gameOver = false;
let inMenu = true;   // Level-Auswahl sichtbar, Spiel pausiert
let lastTime = 0;

let view = { scale: 1, offX: 0, offY: 0 };

/* ======================================================================
   INITIALISIERUNG
   ====================================================================== */

function resetGame() {
  // tierMax (Ausbau-Obergrenze) und ein evtl. schon in der Levelvorlage
  // gesetztes tier werden über den Spread übernommen; chargeOwner/tier
  // starten frisch.
  cells = LEVEL.cells.map(c => ({ ...c, flash: 0, denyFlash: 0, boost: 0, tier: 0, chargeOwner: null }));
  tentacles = [];
  slashes = []; cutTrail = [];
  selected = null; dragSource = null; hovered = null;
  cutting = false; cutLast = null; cutStart = null; cutArmed = false;
  gameOver = false;

  // KI-Zustände: eine pro Fraktion, die im Level Zellen besitzt.
  // Zufällige Start-Phase, damit mehrere KIs nicht im Gleichtakt handeln.
  aiStates = [];
  if (!LEVEL.sandbox) {
    for (const f of AI_FACTIONS) {
      if (LEVEL.cells.some(c => c.owner === f)) {
        const profile = aiProfileFor(LEVEL, f);
        aiStates.push({ owner: f, profile, timer: Math.random() * profile.interval });
      }
    }
  }

  document.getElementById("overlay").classList.remove("show");
}

// Deterministische Pseudozufallszahlen für den Sternenhintergrund
function makeStars() {
  stars = [];
  let seed = 42;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  for (let i = 0; i < 70; i++) {
    stars.push({ x: rnd() * LEVEL.width, y: rnd() * LEVEL.height, r: 0.6 + rnd() * 1.3, a: 0.04 + rnd() * 0.1 });
  }
}

function resize() {
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.round(window.innerWidth * dpr);
  canvas.height = Math.round(window.innerHeight * dpr);
  canvas.style.width = window.innerWidth + "px";
  canvas.style.height = window.innerHeight + "px";

  // Auf kleinen Bildschirmen (Handy quer) sind HUD/Legende ausgeblendet
  // bzw. kompakt – dann reicht weniger Rand für mehr Spielfläche. Unten ist
  // dort (Legende + Hinweiszeile per CSS ausgeblendet, siehe styles.css)
  // fast nichts mehr zu reservieren, oben bleibt die HUD-Zeile bestehen –
  // daher asymmetrisch statt oben=unten, sonst verschenken wir Spielfläche.
  const small = window.innerHeight < 500;
  const padTop = small ? 30 : 70;
  const padBottom = small ? 10 : 70;
  const side = window.innerWidth < 700 ? 12 : 20;
  const availW = window.innerWidth - side * 2;
  const availH = window.innerHeight - padTop - padBottom;
  view.scale = Math.min(availW / LEVEL.width, availH / LEVEL.height);
  view.offX = (window.innerWidth - LEVEL.width * view.scale) / 2;
  view.offY = padTop + (availH - LEVEL.height * view.scale) / 2;
}

/* ======================================================================
   TENTAKEL-LOGIK
   ======================================================================
   Eine Tentakel ist ein Segment [tail, head] entlang der Linie von
   Zellrand zu Zellrand. Die enthaltene "Masse" ist (head - tail) / lengthPerUnit.

   Modi:
     grow    – Spitze wächst zum Ziel, Wachstum kostet die Quellzelle Punkte
     flow    – angedockt: überträgt kontinuierlich Punkte (Angriff/Heilung)
     retract – zieht sich zur Quelle zurück, Masse fließt der Quelle wieder zu
     free    – abgetrenntes Stück ohne Quelle: gleitet zum Ziel und gibt
               seine Masse dort als Angriff/Heilung ab
   ====================================================================== */

function typeOf(cell) { return CELL_TYPES[cell.type]; }

/* --- Zell-Ausbau (Stufen) --------------------------------------------
   Eine ausbaubare Zelle (tierMax > 0) steigt anhand ihres aktuellen
   Vorrats stufenweise auf und ab (mit Hysterese, siehe CONFIG.tierUp/
   tierDown). Die aktuelle Stufe liegt in cell.tier; Kapazität, Produktion
   und Radius werden daraus abgeleitet, damit sich der Ausbau sauber durch
   die gesamte Simulation und das Rendering zieht. Zellen ohne tierMax
   verhalten sich exakt wie bisher (Typ-Werte, Stufe 0). */
function updateTier(cell) {
  const tm = cell.tierMax || 0;
  if (!tm) { cell.tier = 0; return; }
  let tier = cell.tier || 0;
  while (tier < tm && cell.units >= CONFIG.tierUp[tier]) tier++;
  while (tier > 0 && cell.units < CONFIG.tierDown[tier - 1]) tier--;
  cell.tier = tier;
}

function cellMax(cell) {
  const base = typeOf(cell).max;
  if (!cell.tierMax) return base;
  const cap = CONFIG.tierMaxUnits[cell.tier || 0];
  return cap == null ? base : Math.max(base, cap);
}

function cellProd(cell) {
  const base = typeOf(cell).prod;
  return cell.tierMax ? base * CONFIG.tierProdMul[cell.tier || 0] : base;
}

function cellRadius(cell) {
  const base = typeOf(cell).radius;
  return cell.tierMax ? base + CONFIG.tierRadiusAdd[cell.tier || 0] : base;
}

// Darf der Spieler Einheiten dieses Besitzers befehligen?
// (im Testlabor: ALLE Parteien außer Neutral)
function commandableOwner(owner) {
  return owner === "player" || (LEVEL.sandbox && owner !== "neutral");
}

function controllable(cell) {
  return commandableOwner(cell.owner);
}

function maxSlots(cell) {
  return Math.min(CONFIG.slotMax,
    CONFIG.slotBase + Math.floor(Math.floor(cell.units) / CONFIG.slotStep));
}

// Aktive (mit der Quelle verbundene) Tentakel einer Zelle
function outgoing(cell) {
  return tentacles.filter(t => !t.dead && t.src === cell && (t.mode === "grow" || t.mode === "flow"));
}

// Kann die Zelle Überschuss weiterleiten? (mind. eine aktive Tentakel)
function hasActiveOut(cell) {
  return tentacles.some(t => !t.dead && t.src === cell && (t.mode === "grow" || t.mode === "flow"));
}

// Punkte einer Zelle gutschreiben; was über das Maximum hinausgeht, wandert
// in den Überschuss-Puffer (sofern die Zelle Tentakel zum Weiterleiten hat)
function creditUnits(cell, amount) {
  const max = cellMax(cell);
  const room = max - cell.units;
  if (amount <= room) {
    cell.units += amount;
  } else {
    cell.units = max;
    if (hasActiveOut(cell)) {
      cell.boost = Math.min(CONFIG.overflowBuffer, cell.boost + (amount - room));
    }
  }
}

function makeTentacle(src, dst) {
  const dx = dst.x - src.x, dy = dst.y - src.y;
  const d = Math.hypot(dx, dy);
  const ux = dx / d, uy = dy / d;
  // Pfad von Zellrand zu Zellrand (aktuelle, ggf. ausgebaute Radien)
  const p0 = { x: src.x + ux * cellRadius(src), y: src.y + uy * cellRadius(src) };
  const p1 = { x: dst.x - ux * (cellRadius(dst) + 3), y: dst.y - uy * (cellRadius(dst) + 3) };
  const len = Math.hypot(p1.x - p0.x, p1.y - p0.y);
  return {
    src, dst,
    owner: src.owner,
    attack: typeOf(src).attack,  // Werte der sendenden Zelle einfrieren
    heal: typeOf(src).heal,
    p0, p1, ux, uy, len,
    tail: 0, head: 0,
    mode: "grow",
    phase: Math.random() * 10,   // Versatz für die Wellen-Animation
    boostGlow: 0,                // > 0, solange gerade Überschuss durchgeleitet wird (visuell)
    clashGlow: 0,                // > 0, solange die Spitze im Duell steht (visuell)
    pipeline: [],                // unterwegs befindliche Punkte-Pakete (siehe applyMass/update)
    rate: 0,                     // geglätteter Durchsatz (Wert/Sek.) – treibt die Fluss-Geschwindigkeit
    dotSpeed: CONFIG.flowDotSpeed,// aktuelle Fluss-/Ankunftsgeschwindigkeit (skaliert mit rate)
    dead: false
  };
}

function pointAt(t, L) {
  return { x: t.p0.x + t.ux * L, y: t.p0.y + t.uy * L };
}

// Spieler-/KI-Befehl: Tentakel zu dst ausfahren – oder vorhandene einziehen (Toggle)
function tryCommand(src, dst) {
  const existing = tentacles.find(t => !t.dead && t.src === src && t.dst === dst &&
    (t.mode === "grow" || t.mode === "flow"));
  if (existing) { existing.mode = "retract"; return true; }

  // Befreundete Zellen: immer nur EINE Verbindungsrichtung gleichzeitig.
  // (Gegnerische Zellen dürfen aufeinander losgehen – die Tentakel treffen
  // sich dann in der Mitte und ringen miteinander.)
  if (dst.owner === src.owner) {
    const back = tentacles.find(t => !t.dead && t.src === dst && t.dst === src &&
      (t.mode === "grow" || t.mode === "flow"));
    if (back) { src.denyFlash = 0.45; return false; }
  }

  if (outgoing(src).length >= maxSlots(src) || src.units < 2) {
    src.denyFlash = 0.45; // rotes Aufblinken: kein Slot frei / zu wenige Punkte
    return false;
  }
  tentacles.push(makeTentacle(src, dst));
  src.flash = 0.3;
  return true;
}

// Bunker-Verteidigung wirkt nicht als harte Grenze, sondern skaliert den
// Schaden pro übertragenem Punkt herunter (abhängig von der Höhe der
// Verteidigung) – ein Bunker ist dadurch für schwache Angreifer (Wert <=
// Verteidigung) nicht komplett unverwundbar, nur entsprechend langsamer zu
// knacken. Bei bunkerDefense=1 halbiert das z.B. den Schaden; für Angreifer-
// Zellen (Angriff 2) bleibt der bisherige Wert (2 / 2^1 = 1) unverändert.
function bunkerReduced(attack) {
  return attack / Math.pow(2, CONFIG.bunkerDefense);
}

// Masse trifft auf die Zielzelle (kontinuierlich oder von freien Stücken)
function applyMass(t, mass) {
  const dst = t.dst;
  if (mass <= 0) return;
  if (dst.owner === t.owner) {
    creditUnits(dst, mass * t.heal); // Überschuss wird ggf. weitergeleitet
  } else {
    let per = t.attack;
    if (dst.type === "bunker") per = bunkerReduced(per);
    damageCell(dst, mass * per, t.owner);
  }
}

// Schaden an einer Zelle anwenden.
//   Eigene/gegnerische Zellen: Fällt der Vorrat unter 0, wird die Zelle
//   SOFORT erobert – ihre noch ausgefahrenen Tentakel ziehen sich danach
//   automatisch ein und füllen den Vorrat für den NEUEN Besitzer auf.
//   NEUTRALE Zellen: direkt AUFLADEN, keine Garnison-Phase (siehe captureCharge).
function damageCell(cell, dmg, byOwner) {
  if (cell.owner === "neutral") { captureCharge(cell, dmg, byOwner); return; }
  cell.units -= dmg;
  if (cell.units < 0) captureCell(cell, byOwner);
}

// Neutrale Zelle: Schaden zählt ab dem ERSTEN Treffer direkt als Ladung für
// den Angreifer – die anfängliche Garnison (cell.units aus der Levelvorlage)
// muss nicht erst auf 0 gebracht werden. Das verhindert weiterhin die alte
// Killtick-Zufälligkeit (siehe chargeOwner), ohne eine separate Verteidigungs-
// phase vorzuschalten:
//   chargeOwner == null: erster Angreifer überhaupt – Ladung beginnt bei 0.
//   chargeOwner == byOwner: für den aktuellen Halter weiter aufladen.
//   chargeOwner != byOwner: ein Konkurrent trägt die Fremdladung ab; erst
//     wenn sie auf 0 sinkt, übernimmt er selbst die Ladung. Das gelingt nur,
//     wenn er mehr Angriff/Sek. liefert als der bisherige Halter.
function captureCharge(cell, dmg, byOwner) {
  if (cell.chargeOwner == null) {
    cell.chargeOwner = byOwner;
    cell.units = dmg;
  } else if (cell.chargeOwner === byOwner) {
    cell.units += dmg;
  } else {
    cell.units -= dmg;
    if (cell.units <= 0) {
      cell.chargeOwner = byOwner;
      cell.units = -cell.units;
    }
  }
  if (cell.chargeOwner === byOwner && cell.units >= CONFIG.captureCharge) {
    captureCell(cell, byOwner, CONFIG.captureCharge);
  }
}

// Gegen-Tentakel zwischen denselben zwei Zellen (andere Besitzer, aktiv)
function findOpposing(t) {
  return tentacles.find(o => !o.dead && o !== t && o.src === t.dst && o.dst === t.src &&
    o.owner !== t.owner && (o.mode === "grow" || o.mode === "flow")) || null;
}

// Position der gegnerischen Spitze, projiziert auf die eigene Achse
function opposingTipL(t, o) {
  const tip = pointAt(o, o.head);
  return (tip.x - t.p0.x) * t.ux + (tip.y - t.p0.y) * t.uy;
}

// Nachschub für ein Tentakel-Duell: gedeckelt durch transferRate, gespeist
// aus dem VORRAT der Quellzelle (Puffer zuerst). Duelle sind Abnutzungs-
// kämpfe: wer besseren Nachschub hat – höhere Produktion, Heiler-
// Verstärkung, größere Reserven – setzt sich durch. Beide Zähler sinken
// dabei sichtbar ("Punkte gegeneinander schießen").
function battleFeed(t, dt) {
  const c = t.src;
  const want = CONFIG.transferRate * dt;
  const fromBoost = Math.min(c.boost, want);
  const fromUnits = Math.min(Math.max(0, c.units), want - fromBoost);
  c.boost -= fromBoost;
  c.units -= fromUnits;
  if (fromBoost > 0.0001) t.boostGlow = 0.35;
  return fromBoost + fromUnits;
}

function captureCell(cell, newOwner, startUnits) {
  cell.owner = newOwner;
  cell.units = startUnits != null ? startUnits
    : Math.min(cellMax(cell), Math.max(0, -cell.units));
  cell.boost = 0;
  cell.chargeOwner = null; // Ladungszustand einer eroberten Neutralen zurücksetzen
  // Ausgefahrene Tentakel der eroberten Zelle ziehen sich automatisch ein.
  // Ihre zurückfließende Masse landet in der Zelle – und zählt damit für
  // den NEUEN Besitzer (die Beute des Eroberers).
  for (const t of tentacles) {
    if (!t.dead && t.src === cell && (t.mode === "grow" || t.mode === "flow")) {
      t.mode = "retract";
    }
  }
  if (selected === cell && !controllable(cell)) selected = null;
}

// Tentakel bei Länge L durchtrennen: hinteres Stück fließt zurück,
// vorderes Stück fließt zum Ziel weiter.
function cutTentacle(t, L) {
  const margin = 6; // nicht unmittelbar an den Enden schneiden
  if (t.dead || L < t.tail + margin || L > t.head - margin) return false;

  // Vorderes Stück [L, head] wird ein freies Stück Richtung Ziel –
  // es übernimmt bereits unterwegs befindliche Punkte-Pakete, die weiter
  // auf ihr Ziel zufließen.
  tentacles.push({ ...t, tail: L, head: t.head, mode: "free", dead: false });

  // Hinteres Stück [tail, L]: bekommt eine eigene, leere Pipeline –
  // sonst würden Pakete doppelt ausgeliefert (gleiche Array-Referenz).
  t.head = L;
  t.pipeline = [];
  if (t.mode !== "free") t.mode = "retract"; // hing an der Quelle -> zurückziehen
  return true;
}

// Schnittlinie (Wischen) gegen die Tentakel testen.
// Es können NUR EIGENE Tentakel geschnitten werden – gegnerische sind tabu.
function performCut(a, b, color) {
  let hit = false;
  for (const t of [...tentacles]) {
    // nur befehligbare (im Testlabor: alle Parteien) Tentakel sind schneidbar
    if (t.dead || t.head - t.tail < 8) continue;
    if (!commandableOwner(t.owner)) continue;
    const q0 = pointAt(t, t.tail), q1 = pointAt(t, t.head);
    const u = segIntersect(a, b, q0, q1);
    if (u === null) continue;
    const L = t.tail + (t.head - t.tail) * u;
    if (cutTentacle(t, L)) {
      hit = true;
      const p = pointAt(t, L);
      // kleine Schnitt-Markierung senkrecht zur Tentakel
      slashes.push({
        x1: p.x - t.uy * 20, y1: p.y + t.ux * 20,
        x2: p.x + t.uy * 20, y2: p.y - t.ux * 20,
        age: 0, color
      });
    }
  }
  return hit;
}

// Schnittpunkt zweier Strecken; liefert den Parameter u entlang q0->q1 (oder null)
function segIntersect(p0, p1, q0, q1) {
  const rX = p1.x - p0.x, rY = p1.y - p0.y;
  const sX = q1.x - q0.x, sY = q1.y - q0.y;
  const den = rX * sY - rY * sX;
  if (Math.abs(den) < 1e-9) return null;
  const qpX = q0.x - p0.x, qpY = q0.y - p0.y;
  const tt = (qpX * sY - qpY * sX) / den;  // entlang p
  const uu = (qpX * rY - qpY * rX) / den;  // entlang q
  return (tt >= 0 && tt <= 1 && uu >= 0 && uu <= 1) ? uu : null;
}

/* ======================================================================
   SPIEL-UPDATE
   ====================================================================== */

function update(dt) {
  if (inMenu) return; // Level-Auswahl offen: Spiel pausiert

  // Produktion – bei vollen Zellen wandert der Überschuss in den Puffer.
  // Zuvor die Ausbaustufe anhand des aktuellen Vorrats aktualisieren, damit
  // Produktion/Kapazität dieses Ticks schon die passende Stufe verwenden.
  for (const c of cells) {
    updateTier(c);
    if (c.owner !== "neutral" || CONFIG.neutralProduces) {
      creditUnits(c, cellProd(c) * dt);
    }
    if (c.flash > 0) c.flash -= dt;
    if (c.denyFlash > 0) c.denyFlash -= dt;
  }

  // Tentakel-Duelle erkennen: gegnerische Tentakel zwischen denselben zwei
  // Zellen laufen im selben Korridor. Berühren sich ihre Spitzen, ringen sie
  // miteinander, statt aneinander vorbeizuwachsen.
  for (const t of tentacles) { t._opp = null; t._clash = null; }
  for (const t of tentacles) {
    if (t.dead || (t.mode !== "grow" && t.mode !== "flow") || t._opp) continue;
    const o = findOpposing(t);
    if (!o) continue;
    t._opp = o; o._opp = t;
    if (opposingTipL(t, o) - t.head <= 3) { t._clash = o; o._clash = t; }
  }

  // Überschuss-Verteilung vorbereiten: Puffer und Produktions-Budget einer
  // Zelle werden gleichmäßig auf ihre aktiven Kanäle aufgeteilt
  // (angedockte Tentakel + Tentakel im Duell)
  for (const c of cells) c._flowOut = 0;
  for (const t of tentacles) {
    if (!t.dead && (t.mode === "flow" || t._clash)) t.src._flowOut++;
    if (t.boostGlow > 0) t.boostGlow -= dt;
    if (t.clashGlow > 0) t.clashGlow -= dt;
  }
  for (const c of cells) {
    c._boostShare = c._flowOut > 0 ? c.boost / c._flowOut : 0;
    // Produktions-Budget für den GRUNDFLUSS: eine Zelle darf über ihre
    // Tentakel nie mehr fest angesammelte Punkte verlieren, als sie in
    // diesem Tick produziert – die Produktion wird gleichmäßig auf alle
    // angedockten Tentakel aufgeteilt. Der Vorrat bleibt dadurch stabil;
    // nur das Ausfahren (grow) und der Überschuss-Puffer dürfen ihn senken.
    c._flowBudget = c._flowOut > 0 ? (cellProd(c) * dt) / c._flowOut : 0;
  }

  // Duelle austragen: beide Seiten speisen Kraft aus Produktion und
  // Überschuss-Puffer; die stärkere Seite (Angriffswert zählt!) drückt die
  // Spitze der schwächeren zurück. Gleichstand = Patt an der Front.
  const fought = new Set();
  for (const t of tentacles) {
    if (t.dead || !t._clash || fought.has(t)) continue;
    const o = t._clash;
    if (o.dead || fought.has(o)) continue;
    fought.add(t); fought.add(o);

    // Kraft beider Seiten: Nachschub × Angriffswert, plus Heimvorteil.
    // Der Heimvorteil drückt die Front Richtung Korridor-MITTE – nahe der
    // eigenen Zelle kämpft es sich leichter. ABER: er zählt nur für Zellen mit
    // echtem gespeichertem Vorrat. Eine LEERE Zelle (Vorrat ~0, egal ob sie
    // ihre Produktion nur durchreicht) kann keine Front halten – sonst blockiert
    // ihr 1px-Stummel einen versorgten Angreifer dauerhaft und die 0-Zelle wird
    // nie erobert. Der Vorrat wird VOR battleFeed abgegriffen (das darunter
    // Vorrat verbraucht), damit die Prüfung den Zustand zu Beginn des Duells sieht.
    const reserveT = t.src.units + t.src.boost;
    const reserveO = o.src.units + o.src.boost;
    const homeAdv = (x, reserve) =>
      reserve > CONFIG.clashHoldMin ? CONFIG.clashHomefield * (0.5 - x.head / x.len) * dt : 0;
    let net = battleFeed(t, dt) * t.attack + homeAdv(t, reserveT)
            - battleFeed(o, dt) * o.attack - homeAdv(o, reserveO);

    // Patt-Auflösung bei ZWEI erschöpften Zellen: Sind beide "leer"
    // (Reserve <= clashHoldMin), liefert battleFeed nur noch winziges,
    // schwankendes Produktions-Rauschen (~±0.01) – net pendelt um 0, die Front
    // zittert ewig um die Mitte und KEINE Zelle wird je erobert (der beobachtete
    // Bug: beide Zellen dauerhaft bei ~0). In diesem Zustand kann ohnehin keine
    // Seite eine Front halten (homeAdv ist für beide schon 0), also entscheidet
    // die Nähe zum Andocken: die Tentakel mit kürzerer Restdistanz (len-head)
    // erhält einen klaren Vorstoß, der das Rauschen dominiert. Da der Verlierer
    // immer Boden räumt (siehe unten), entfernt er sich dadurch nur weiter ->
    // selbstverstärkend, das Duell löst sich auf und der Sieger dockt an und
    // erobert. Greift NUR wenn BEIDE erschöpft sind – ein realer Nachschub-
    // Vorteil (mind. eine versorgte Zelle) bleibt unangetastet.
    if (reserveT <= CONFIG.clashHoldMin && reserveO <= CONFIG.clashHoldMin) {
      const remT = t.len - t.head, remO = o.len - o.head;
      if (Math.abs(remT - remO) > 0.5) {
        net = (remT < remO ? 1 : -1) * (CONFIG.clashBreak / CONFIG.lengthPerUnit) * dt;
      }
    }

    if (net !== 0) {
      const winner = net > 0 ? t : o;
      const loser  = net > 0 ? o : t;
      // Der Verlierer WEICHT immer (räumt Boden); der Gewinner rückt getrennt
      // davon nach, soweit Platz UND Substanz reichen. Diese ENTKOPPLUNG ist der
      // Kern des Fixes: früher zog ein einziger Vorstoß-Wert Verlierer und
      // Gewinner gemeinsam, gedeckelt durch (a) freien Korridor vor dem Gewinner
      // und (b) dessen Vorrat. Ein Angreifer, der sein Ziel schon erreicht hatte
      // (head == len → kein Platz) ODER dessen Quelle leer war, konnte damit den
      // letzten 1px-Stummel des Gegners NICHT wegdrücken – zwei erschöpfte Zellen
      // froren dauerhaft ein, die angegriffene 0-Zelle wurde nie erobert.
      // Jetzt: Rückzug immer (an den battleFeed-gedeckelten Netto-Vorteil
      // gekoppelt), Nachrücken kostet wie bisher Vorrat – kann der Gewinner es
      // sich nicht leisten, bleibt eine Lücke, die zum Andocken/Töten reicht.
      const retreat = Math.min(
        Math.abs(net) * CONFIG.lengthPerUnit,
        loser.head - loser.tail);
      if (retreat > 0) {
        loser.head = Math.max(loser.tail, loser.head - retreat);
        const room = Math.min(retreat, winner.len - winner.head);
        if (room > 0) {
          const affordable = Math.min(room,
            Math.max(0, winner.src.units + winner.src.boost) * CONFIG.lengthPerUnit);
          if (affordable > 0) {
            const cost = affordable / CONFIG.lengthPerUnit;
            const fromBoost = Math.min(winner.src.boost, cost);
            winner.src.boost -= fromBoost;
            winner.src.units -= (cost - fromBoost);
            winner.head += affordable;
          }
        }
        if (loser.mode === "flow") loser.mode = "grow"; // vom Ziel weggedrückt
        if (loser.head - loser.tail < 0.5) loser.dead = true; // Tentakel zerstört
      }
    }
    t.clashGlow = o.clashGlow = 0.25;
  }

  // Pipeline-Auslieferung: Punkte-Pakete, die zuvor auf den Weg geschickt
  // wurden, treffen nach ihrer Laufzeit an der Zielzelle ein und wirken
  // erst DANN (Heilung/Schaden) – unabhängig vom aktuellen Modus der
  // Tentakel, damit bereits unterwegs befindliche Pakete auch nach einem
  // Einziehen/Durchschneiden noch ankommen.
  for (const t of tentacles) {
    if (!t.pipeline.length) continue;
    for (const p of t.pipeline) p.remaining -= dt;
    while (t.pipeline.length && t.pipeline[0].remaining <= 0) {
      applyMass(t, t.pipeline.shift().amount);
    }
  }

  // Tentakel
  for (const t of tentacles) {
    if (t.dead) continue;

    if (t.mode === "grow") {
      if (!t._clash) {
        // Wachstum kostet Punkte; Überschuss-Puffer wird zuerst angezapft.
        // Vor einer gegnerischen Spitze wird gestoppt (dort beginnt das Duell).
        let limit = t.len - t.head;
        if (t._opp) limit = Math.min(limit, Math.max(0, opposingTipL(t, t._opp) - t.head - 2));
        const want = Math.min(CONFIG.tentacleSpeed * dt, limit);
        const cost = want / CONFIG.lengthPerUnit;
        if (want > 0 && t.src.units + t.src.boost >= cost) {
          const fromBoost = Math.min(t.src.boost, cost);
          t.src.boost -= fromBoost;
          t.src.units -= (cost - fromBoost);
          t.head += want;
        }
        if (t.head >= t.len - 0.001) t.mode = "flow"; // angedockt!
      }

    } else if (t.mode === "flow" && t._clash) {
      // Angedockt, aber im Duell: alle Energie geht in den Kampf (kein Transfer)

    } else if (t.mode === "flow") {
      // Kontinuierliche Übertragung, sowohl bei HEILUNG als auch bei einem
      // unbeantworteten ANGRIFF: gedeckelt durch die eigene Produktion
      // (+ Überschuss-Puffer) – der Vorrat einer Zelle sinkt dadurch nicht.
      // Nur in einem echten Tentakel-Duell (siehe oben, battleFeed) wird
      // tatsächlich Vorrat verkämpft; einseitiges Angreifen/Unterstützen
      // kostet nie mehr als die frische Produktion.
      // Die übertragene Masse wird NICHT sofort beim Ziel wirksam, sondern
      // fließt sichtbar die Tentakel entlang und wirkt erst beim Eintreffen
      // (siehe Pipeline-Auslieferung weiter unten).
      const dst = t.dst;
      const want = CONFIG.transferRate * dt;
      const hostile = dst.owner !== t.owner;
      let per = t.attack;
      if (hostile && dst.type === "bunker") per = bunkerReduced(per);

      let total = 0;
      if (!hostile || per > 0) {
        const base = Math.min(want, t.src._flowBudget, Math.max(0, t.src.units));
        // Puffer-Durchleitung ratenbegrenzt (gleichmäßiger Strom statt
        // schlagartiger Entladung des ganzen Puffers in einem Tick)
        const share = Math.min(t.src.boost, t.src._boostShare, want);
        total = base + share;

        if (!hostile && !hasActiveOut(dst)) {
          // Heilen: Ziel voll und ohne eigene Tentakel? Dann nur bis zum
          // Maximum pumpen (nichts verschwenden). Kann das Ziel weiterleiten,
          // fließt der Rest in dessen Überschuss-Puffer.
          const room = cellMax(dst) - dst.units;
          total = Math.min(total, room / t.heal);
        }

        if (total > 0) {
          const fromBoost = Math.min(share, total);
          t.src.boost -= fromBoost;
          t.src.units -= (total - fromBoost);
          if (fromBoost > 0.0001) t.boostGlow = 0.35;
          // Laufzeit bis zum Ziel = Länge / Fluss-Geschwindigkeit (t.dotSpeed).
          // travel merkt sich die Anfangslaufzeit, damit die Animation die
          // "Front" exakt abbilden kann, auch wenn dotSpeed später variiert.
          t.pipeline.push({ amount: total, remaining: t.len / t.dotSpeed, travel: t.len / t.dotSpeed });
        }
      }

      // Fluss-Geschwindigkeit an den TATSÄCHLICHEN Durchsatz koppeln, damit
      // die Animation widerspiegelt, wie viel Angriff/Heilung pro Sekunde
      // gerade fließt: value/Sek. = übertragene Masse × Wert pro Punkt.
      // Geglättet (EMA), damit die Punkte nicht zappeln; nie langsamer als
      // die Basisgeschwindigkeit, stärkere Ströme sichtbar schneller.
      const value = hostile ? per : t.heal;
      const inst = (total / dt) * value;
      t.rate += (inst - t.rate) * Math.min(1, dt * 6);
      t.dotSpeed = CONFIG.flowDotSpeed * (1 + Math.min(1.5, t.rate / 3));

    } else if (t.mode === "retract") {
      // Einziehen: Masse fließt zur Quelle zurück (Überschuss wird weitergeleitet)
      const d = Math.min(CONFIG.retractSpeed * dt, t.head - t.tail);
      t.head -= d;
      creditUnits(t.src, d / CONFIG.lengthPerUnit);
      if (t.head - t.tail < 0.5) t.dead = true;

    } else if (t.mode === "free") {
      // Abgetrenntes Stück: gleitet zum Ziel, dann wird die Masse abgegeben
      const sp = CONFIG.retractSpeed * dt;
      if (t.head < t.len) {
        const d = Math.min(sp, t.len - t.head);
        t.head += d; t.tail += d;
      } else {
        const d = Math.min(sp, t.len - t.tail);
        t.tail += d;
        applyMass(t, d / CONFIG.lengthPerUnit);
        if (t.len - t.tail < 0.5) t.dead = true;
      }
    }
  }
  // Tentakel mit noch ausstehender Pipeline erst entfernen, wenn auch die
  // letzten unterwegs befindlichen Punkte-Pakete ausgeliefert wurden.
  tentacles = tentacles.filter(t => !t.dead || t.pipeline.length);

  // Effekte altern lassen
  for (const s of slashes) s.age += dt;
  slashes = slashes.filter(s => s.age < 0.8);
  const nowMs = performance.now();
  cutTrail = cutTrail.filter(p => nowMs - p.t < 350);

  // KI-Fraktionen takten, jede mit eigenem Intervall und Profil
  // (im Testlabor steuert der Spieler alle Seiten selbst)
  if (!gameOver && !LEVEL.sandbox) {
    for (const s of aiStates) {
      if (!cells.some(c => c.owner === s.owner)) continue; // Fraktion ausgelöscht
      s.timer += dt;
      if (s.timer >= s.profile.interval) {
        s.timer = 0;
        aiThink(s.owner, s.profile);
      }
    }
  }

  checkVictory();
}

/* ======================================================================
   SIEG / NIEDERLAGE
   ====================================================================== */

function checkVictory() {
  if (gameOver || LEVEL.sandbox) return; // im Testlabor gibt es kein Spielende
  // Eine Seite lebt, solange sie Zellen hat oder noch Tentakel-Masse unterwegs ist
  const alive = owner =>
    cells.some(c => c.owner === owner) ||
    tentacles.some(t => !t.dead && t.owner === owner && t.head - t.tail > 1);

  const playerAlive = alive("player");
  const anyAiAlive = aiStates.some(s => alive(s.owner));
  if (playerAlive && anyAiAlive) return;

  gameOver = true;
  showGameEnd(playerAlive); // Overlay-Inhalt und Kampagnen-Fortschritt: ui.js
}

/* ======================================================================
   EINGABE (Maus & Touch über Pointer-Events)
   ====================================================================== */

function toWorld(e) {
  return {
    x: (e.clientX - view.offX) / view.scale,
    y: (e.clientY - view.offY) / view.scale
  };
}

// Toleranz in Weltkoordinaten so bemessen, dass sie auf dem Bildschirm
// (nach Multiplikation mit view.scale) unabhängig vom Zoom-Level immer
// gleich groß bleibt – sonst werden Zellen auf kleinen/verkleinerten
// Handy-Ansichten (view.scale klein) fast untreffbar. Auf Touch-Geräten
// (Finger statt Mauszeiger) etwas großzügiger als mit der Maus.
function pickCell(w) {
  const slop = (coarsePointer ? 26 : 14) / view.scale;
  let best = null, bestD = Infinity;
  for (const c of cells) {
    const r = cellRadius(c) + slop;
    const d = Math.hypot(w.x - c.x, w.y - c.y);
    if (d <= r && d < bestD) { best = c; bestD = d; }
  }
  return best;
}

canvas.addEventListener("pointerdown", e => {
  if (gameOver || inMenu) return;
  const w = toWorld(e);
  pointerWorld = w;
  const cell = pickCell(w);

  // Klick-Klick: Auswahl vorhanden + anderes Ziel angeklickt -> Tentakel-Befehl
  if (selected && cell && cell !== selected) {
    tryCommand(selected, cell);
    selected = null;
    return;
  }
  if (cell && controllable(cell)) {
    // Eigene Zelle: auswählen und ggf. Drag starten
    selected = cell;
    dragSource = cell;
    canvas.setPointerCapture(e.pointerId);
  } else if (!cell) {
    // Freie Fläche: Schnittmodus starten (scharf erst nach kurzer Zugstrecke,
    // damit ein einfacher Klick mit Wacklern nichts zerschneidet)
    selected = null;
    cutting = true;
    cutStart = w;
    cutArmed = false;
    cutLast = w;
    cutTrail.push({ x: w.x, y: w.y, t: performance.now() });
    canvas.setPointerCapture(e.pointerId);
  } else {
    selected = null;
  }
});

canvas.addEventListener("pointermove", e => {
  const w = toWorld(e);
  pointerWorld = w;
  hovered = pickCell(w);
  canvas.style.cursor = hovered ? "pointer" : "crosshair";

  if (cutting && cutLast && !gameOver) {
    if (!cutArmed && Math.hypot(w.x - cutStart.x, w.y - cutStart.y) > 12) cutArmed = true;
    if (cutArmed) performCut(cutLast, w, "#eaf2fa");
    cutLast = w;
    cutTrail.push({ x: w.x, y: w.y, t: performance.now() });
  }
});

canvas.addEventListener("pointerup", e => {
  if (dragSource) {
    const cell = pickCell(toWorld(e));
    if (cell && cell !== dragSource) {
      tryCommand(dragSource, cell);
      selected = null;
    }
    dragSource = null;
  }
  cutting = false;
  cutLast = null;
  cutArmed = false;
});

canvas.addEventListener("pointercancel", () => { dragSource = null; cutting = false; cutLast = null; cutArmed = false; });
canvas.addEventListener("contextmenu", e => { e.preventDefault(); selected = null; dragSource = null; });
window.addEventListener("keydown", e => { if (e.key === "Escape") { selected = null; dragSource = null; } });

/* ======================================================================
   RENDERING
   ====================================================================== */

function hexToRgba(hex, a) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

// Umriss eines Zelltyps als Pfad (für Füllung UND Kontur)
function shapePath(c2, type, x, y, r) {
  c2.beginPath();
  if (type === "bunker") {
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 - Math.PI / 2;
      const px = x + Math.cos(a) * r, py = y + Math.sin(a) * r;
      i === 0 ? c2.moveTo(px, py) : c2.lineTo(px, py);
    }
    c2.closePath();
  } else if (type === "attacker") {
    const spikes = 10;
    for (let i = 0; i < spikes * 2; i++) {
      const a = (i / (spikes * 2)) * Math.PI * 2 - Math.PI / 2;
      const rr = (i % 2 === 0) ? r * 1.16 : r * 0.86;
      const px = x + Math.cos(a) * rr, py = y + Math.sin(a) * rr;
      i === 0 ? c2.moveTo(px, py) : c2.lineTo(px, py);
    }
    c2.closePath();
  } else if (type === "factory") {
    const teeth = 8, ri = r * 0.8;
    const step = (Math.PI * 2) / teeth;
    const w = step * 0.27;
    for (let i = 0; i < teeth; i++) {
      const a = i * step;
      c2.arc(x, y, r, a - w, a + w);
      c2.arc(x, y, ri, a + w, a + step - w);
    }
    c2.closePath();
  } else {
    c2.arc(x, y, r, 0, Math.PI * 2);
  }
}

function drawHealerBadge(c2, x, y, r, color) {
  const bx = x, by = y - r, br = 7;
  c2.beginPath();
  c2.arc(bx, by, br, 0, Math.PI * 2);
  c2.fillStyle = "#0a111c";
  c2.fill();
  c2.strokeStyle = color;
  c2.lineWidth = 1.5;
  c2.stroke();
  c2.beginPath();
  c2.moveTo(bx - 3.5, by); c2.lineTo(bx + 3.5, by);
  c2.moveTo(bx, by - 3.5); c2.lineTo(bx, by + 3.5);
  c2.stroke();
}

function drawCellShape(c2, type, x, y, r, color, glow) {
  c2.save();
  if (glow) { c2.shadowColor = color; c2.shadowBlur = 16; }
  shapePath(c2, type, x, y, r);
  const grad = c2.createRadialGradient(x, y, r * 0.2, x, y, r);
  grad.addColorStop(0, "rgba(16,26,42,.95)");
  grad.addColorStop(1, hexToRgba(color, 0.22));
  c2.fillStyle = grad;
  c2.fill();
  c2.strokeStyle = color;
  c2.lineWidth = 2.5;
  c2.stroke();
  c2.restore();
  if (type === "bunker") {
    shapePath(c2, type, x, y, r - 5);
    c2.strokeStyle = hexToRgba(color, 0.5);
    c2.lineWidth = 1.5;
    c2.stroke();
  }
  if (type === "healer") drawHealerBadge(c2, x, y, r, color);
}

// Tentakel als leicht wellige Linie mit Spitze und Fluss-Punkten
function drawTentacle(t, now) {
  const seg = t.head - t.tail;
  if (seg < 1) return;
  const color = OWNER_COLOR[t.owner];
  const nx = -t.uy, ny = t.ux; // senkrecht zur Flugrichtung

  // Wellenversatz: an den Enden der GESAMT-Linie verankert
  const wob = L => reducedMotion ? 0 :
    Math.sin(L * 0.045 + now / 300 + t.phase) * 5 * Math.sin(Math.PI * L / t.len);

  ctx.save();
  ctx.shadowColor = color;
  ctx.shadowBlur = 6;
  ctx.strokeStyle = hexToRgba(color, 0.85);
  ctx.lineWidth = 3;
  ctx.lineCap = "round";
  ctx.beginPath();
  const steps = Math.max(6, Math.round(seg / 12));
  for (let i = 0; i <= steps; i++) {
    const L = t.tail + seg * (i / steps);
    const o = wob(L);
    const px = t.p0.x + t.ux * L + nx * o;
    const py = t.p0.y + t.uy * L + ny * o;
    i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
  }
  ctx.stroke();

  // Spitze (Wachstums- bzw. Vorderende)
  const ho = wob(t.head);
  const tipX = t.p0.x + t.ux * t.head + nx * ho;
  const tipY = t.p0.y + t.uy * t.head + ny * ho;
  ctx.beginPath();
  ctx.arc(tipX, tipY, 4.2, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
  ctx.restore();

  // Duell-Funken: weiß glühende Spitze, solange zwei Tentakel ringen
  if (t.clashGlow > 0) {
    const a = Math.min(1, t.clashGlow / 0.25);
    const flicker = reducedMotion ? 1 : 0.75 + 0.25 * Math.sin(now / 30 + t.phase * 7);
    ctx.save();
    ctx.shadowColor = "#ffffff";
    ctx.shadowBlur = 14;
    ctx.beginPath();
    ctx.arc(tipX, tipY, (3 + 3 * a) * flicker, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(255,255,255,${0.85 * a})`;
    ctx.fill();
    ctx.restore();
  }

  // Fluss-Punkte für Rückzug/freies Stück/Duell-Front: hier gibt es keine
  // Pipeline (die Masse IST die Länge des Segments), daher weiterhin ein
  // gleichmäßiger dekorativer Strom über die sichtbare Länge.
  // Wird gerade Überschuss durchgeleitet, fließt ein zweiter, dichterer Strom.
  if (!reducedMotion && (t.mode === "retract" || t.mode === "free" || t.clashGlow > 0)) {
    const dir = t.mode === "retract" ? -1 : 1;
    const boosted = t.boostGlow > 0;
    const spacing = 26;
    const shift = (now / 1000 * CONFIG.flowDotSpeed * (boosted ? 1.5 : 1)) % spacing;
    ctx.fillStyle = hexToRgba("#ffffff", boosted ? 0.95 : 0.8);
    for (let L = t.tail + (dir === 1 ? shift : spacing - shift); L < t.head; L += spacing) {
      const o = wob(L);
      ctx.beginPath();
      ctx.arc(t.p0.x + t.ux * L + nx * o, t.p0.y + t.uy * L + ny * o, boosted ? 2.1 : 1.7, 0, Math.PI * 2);
      ctx.fill();
      if (boosted) { // versetzter Zweitstrom als "Verstärkt"-Signal
        const L2 = L + spacing / 2;
        if (L2 < t.head) {
          const o2 = wob(L2);
          ctx.beginPath();
          ctx.arc(t.p0.x + t.ux * L2 + nx * o2, t.p0.y + t.uy * L2 + ny * o2, 1.5, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }
  }

  // Fluss-Punkte für angedockte, tatsächlich übertragende Tentakel: Es wird
  // JEDEN Frame ein neues Punkte-Paket in die Pipeline gelegt (bei 60 FPS
  // ~60 Pakete/Sekunde) – ein Punkt PRO Paket würde also zu einer
  // durchgehenden Fläche verschmelzen. Stattdessen zeigt das älteste Paket
  // (t.pipeline[0], am nächsten an der Zustellung) nur die aktuelle
  // "Front" des Flusses an; sichtbare, klar getrennte Punkte werden im
  // gewohnten Abstand von der Quelle bis zu dieser Front gezeichnet – die
  // Front wächst dabei genauso schnell, wie die echten Pakete unterwegs
  // sind, und erreicht das Ziel nicht sofort über die ganze Strecke.
  if (!reducedMotion && t.pipeline.length) {
    const lead = t.pipeline[0];
    const travelTime = lead.travel || (t.len / CONFIG.flowDotSpeed);
    const boosted = t.boostGlow > 0;
    const leadFrac = 1 - Math.max(0, Math.min(1, lead.remaining / travelTime));
    const leadL = t.tail + leadFrac * (t.head - t.tail);
    const spacing = 26;
    // Punkt-Geschwindigkeit = tatsächliche Fluss-Geschwindigkeit der Tentakel
    const dotSpeed = (t.dotSpeed || CONFIG.flowDotSpeed) * (boosted ? 1.5 : 1);
    const shift = (now / 1000 * dotSpeed) % spacing;
    ctx.fillStyle = hexToRgba("#ffffff", boosted ? 0.95 : 0.8);
    for (let L = t.tail + shift; L < leadL; L += spacing) {
      const o = wob(L);
      ctx.beginPath();
      ctx.arc(t.p0.x + t.ux * L + nx * o, t.p0.y + t.uy * L + ny * o, boosted ? 2.1 : 1.7, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

function draw(now) {
  const dpr = window.devicePixelRatio || 1;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);

  // Hintergrund-Vignette
  const vg = ctx.createRadialGradient(
    window.innerWidth / 2, window.innerHeight / 2, 100,
    window.innerWidth / 2, window.innerHeight / 2, Math.max(window.innerWidth, window.innerHeight) * 0.7
  );
  vg.addColorStop(0, "#0d1626");
  vg.addColorStop(1, "#080e18");
  ctx.fillStyle = vg;
  ctx.fillRect(0, 0, window.innerWidth, window.innerHeight);

  // In Weltkoordinaten wechseln
  ctx.setTransform(view.scale * dpr, 0, 0, view.scale * dpr, view.offX * dpr, view.offY * dpr);

  // Dekorative Hintergrundpunkte
  for (const s of stars) {
    ctx.beginPath();
    ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(160,190,220,${s.a})`;
    ctx.fill();
  }

  // Tentakel (unter den Zellen)
  for (const t of tentacles) drawTentacle(t, now);

  // Drag-Vorschau: gestrichelte Linie + Kosten (Farbe = Besitzer der Quelle)
  if (dragSource) {
    let tx = pointerWorld.x, ty = pointerWorld.y, snap = false;
    if (hovered && hovered !== dragSource) { tx = hovered.x; ty = hovered.y; snap = true; }
    ctx.save();
    ctx.setLineDash([6, 6]);
    ctx.lineWidth = snap ? 3 : 2;
    ctx.strokeStyle = hexToRgba(OWNER_COLOR[dragSource.owner], snap ? 0.9 : 0.5);
    ctx.beginPath();
    ctx.moveTo(dragSource.x, dragSource.y);
    ctx.lineTo(tx, ty);
    ctx.stroke();
    ctx.restore();

    // Voraussichtliche Wachstumskosten anzeigen
    const d = Math.hypot(tx - dragSource.x, ty - dragSource.y) - cellRadius(dragSource)
      - (snap ? cellRadius(hovered) : 0);
    if (d > 20) {
      const cost = Math.ceil(d / CONFIG.lengthPerUnit);
      ctx.font = '600 13px "Segoe UI", system-ui, sans-serif';
      ctx.textAlign = "center";
      ctx.fillStyle = hexToRgba("#eaf2fa", 0.9);
      ctx.fillText(`−${cost}`, (dragSource.x + tx) / 2, (dragSource.y + ty) / 2 - 10);
    }
  }

  // Schnittspur des Spielers (verblassend)
  const nowMs = performance.now();
  if (cutTrail.length > 1) {
    ctx.save();
    ctx.lineCap = "round";
    for (let i = 1; i < cutTrail.length; i++) {
      const a = 1 - (nowMs - cutTrail[i].t) / 350;
      if (a <= 0) continue;
      ctx.strokeStyle = `rgba(234,242,250,${a * 0.7})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(cutTrail[i - 1].x, cutTrail[i - 1].y);
      ctx.lineTo(cutTrail[i].x, cutTrail[i].y);
      ctx.stroke();
    }
    ctx.restore();
  }

  // Schnitt-Markierungen: Strich + expandierender Ring, damit Schnitte
  // (besonders die der KI!) klar als Aktion erkennbar sind
  for (const s of slashes) {
    const a = Math.max(0, 1 - s.age / 0.8);
    ctx.strokeStyle = hexToRgba(s.color, a);
    ctx.lineWidth = 3.5;
    ctx.beginPath();
    ctx.moveTo(s.x1, s.y1);
    ctx.lineTo(s.x2, s.y2);
    ctx.stroke();
    const mx = (s.x1 + s.x2) / 2, my = (s.y1 + s.y2) / 2;
    ctx.beginPath();
    ctx.arc(mx, my, 6 + s.age * 50, 0, Math.PI * 2);
    ctx.lineWidth = 2;
    ctx.strokeStyle = hexToRgba(s.color, a * 0.6);
    ctx.stroke();
  }

  // Zellen
  for (const c of cells) {
    const color = OWNER_COLOR[c.owner];
    const r = cellRadius(c);          // aktueller (ggf. ausgebauter) Radius
    // Wird eine neutrale Zelle gerade aufgeladen, füllt sich der Ring in der
    // Farbe des Eroberers bis captureCharge – sonst normaler Füllstand.
    const charging = c.owner === "neutral" && c.chargeOwner;
    const ringColor = charging ? OWNER_COLOR[c.chargeOwner] : color;
    const frac = charging
      ? Math.max(0, Math.min(1, c.units / CONFIG.captureCharge))
      : Math.max(0, Math.min(1, c.units / cellMax(c)));

    drawCellShape(ctx, c.type, c.x, c.y, r, color, true);

    // Ausbaustufe: kleine Ringe direkt am Zellrand als Rang-Anzeige
    if (c.tier > 0) {
      for (let s = 0; s < c.tier; s++) {
        ctx.beginPath();
        ctx.arc(c.x, c.y, r + 2 + s * 2.4, 0, Math.PI * 2);
        ctx.strokeStyle = hexToRgba(color, 0.28);
        ctx.lineWidth = 1.4;
        ctx.stroke();
      }
    }

    // Füllstands- bzw. Lade-Ring
    ctx.beginPath();
    ctx.arc(c.x, c.y, r + 7, -Math.PI / 2, -Math.PI / 2 + frac * Math.PI * 2);
    ctx.strokeStyle = hexToRgba(ringColor, charging ? 0.9 : 0.55);
    ctx.lineWidth = charging ? 4 : 3;
    ctx.stroke();

    // Ladezustand einer umkämpften Neutralen zusätzlich mit rotierendem
    // Strichring in der Farbe des Eroberers markieren (klar sichtbar, wer
    // sie gerade übernimmt).
    if (charging) {
      ctx.save();
      ctx.setLineDash([4, 6]);
      if (!reducedMotion) ctx.lineDashOffset = -(now / 60) % 20;
      ctx.beginPath();
      ctx.arc(c.x, c.y, r + 12, 0, Math.PI * 2);
      ctx.strokeStyle = hexToRgba(ringColor, 0.7);
      ctx.lineWidth = 1.6;
      ctx.stroke();
      ctx.restore();
    }

    // Auswahl-Ring
    if (c === selected) {
      ctx.save();
      ctx.setLineDash([5, 5]);
      if (!reducedMotion) ctx.lineDashOffset = -(now / 40) % 10;
      ctx.beginPath();
      ctx.arc(c.x, c.y, r + 13, 0, Math.PI * 2);
      ctx.strokeStyle = color; // Auswahlring in Besitzerfarbe (Testlabor: alle Parteien)
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.restore();
    }

    // Sende-Blitz (kurz aufleuchtender Ring beim Ausfahren)
    if (c.flash > 0) {
      const k = 1 - c.flash / 0.3;
      ctx.beginPath();
      ctx.arc(c.x, c.y, r + 8 + k * 14, 0, Math.PI * 2);
      ctx.strokeStyle = hexToRgba(color, 0.5 * (1 - k));
      ctx.lineWidth = 2;
      ctx.stroke();
    }
    // Abgelehnt-Blitz (kein Slot frei / zu wenige Punkte)
    if (c.denyFlash > 0) {
      ctx.beginPath();
      ctx.arc(c.x, c.y, r + 10, 0, Math.PI * 2);
      ctx.strokeStyle = hexToRgba("#ff5964", Math.min(1, c.denyFlash * 2.2));
      ctx.lineWidth = 3;
      ctx.stroke();
    }

    // Punkte-Zähler
    ctx.font = `700 ${Math.round(r * 0.62)}px "Segoe UI", system-ui, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = "#eaf2fa";
    // nie negativ anzeigen (während des Not-Einzugs kann der Wert intern < 0 sein)
    ctx.fillText(String(Math.max(0, Math.floor(c.units))), c.x, c.y + 1);

    // Tentakel-Slots als kleine Punkte unter befehligbaren Zellen
    if (controllable(c)) {
      const total = maxSlots(c);
      const used = outgoing(c).length;
      const y = c.y + r + 16;
      const x0 = c.x - ((total - 1) * 9) / 2;
      for (let i = 0; i < total; i++) {
        ctx.beginPath();
        ctx.arc(x0 + i * 9, y, 2.6, 0, Math.PI * 2);
        if (i < used) {
          ctx.fillStyle = color;
          ctx.fill();
        } else {
          ctx.strokeStyle = hexToRgba(color, 0.45);
          ctx.lineWidth = 1.2;
          ctx.stroke();
        }
      }
    }
  }
}

/* ======================================================================
   HAUPTSCHLEIFE
   ====================================================================== */

function frame(now) {
  const dt = Math.min(0.05, (now - lastTime) / 1000 || 0);
  lastTime = now;
  update(dt);
  draw(now);
  updateHud();
  requestAnimationFrame(frame);
}
