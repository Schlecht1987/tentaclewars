"use strict";

/* ======================================================================
   SPIELZUSTAND
   ====================================================================== */

const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");
const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const coarsePointer = window.matchMedia("(pointer: coarse)").matches;
const portraitQuery = window.matchMedia("(orientation: portrait)");
const glowEnabled = !coarsePointer || CONFIG.glowOnMobile;

// Aktueller DPR, gedeckelt (siehe CONFIG.maxDpr) – zentrale Stelle statt
// window.devicePixelRatio an mehreren Orten einzeln zu lesen/klemmen.
function currentDpr() { return Math.min(window.devicePixelRatio || 1, CONFIG.maxDpr); }

// Entfernt Elemente, die `keep` nicht erfüllen, IN PLACE (reihenfolgeerhaltend)
// statt arr.filter(...), das jeden Aufruf ein neues Array alloziert – bei
// jeden-Tick-Aufrufen (Tentakel/Slashes/CutTrail) spart das GC-Druck.
function compactInPlace(arr, keep) {
  let w = 0;
  for (let i = 0; i < arr.length; i++) {
    if (keep(arr[i])) arr[w++] = arr[i];
  }
  arr.length = w;
}

// Vorab gerenderter Hintergrund (Vignette + Sterne): hängt nur von
// Viewport-Größe/-Orientierung ab, nicht vom Simulationszustand – wird daher
// nur bei resize() (Größe/Drehung ändert sich) neu gezeichnet und in draw()
// jeden Frame nur noch geblittet, statt Gradient+70 Sterne neu zu berechnen.
const bgCanvas = document.createElement("canvas");
const bgCtx = bgCanvas.getContext("2d");

// Hochformat: Das Spielfeld ist querformatig angelegt (LEVEL.width > height).
// Ist der sichtbare Viewport hochkant, wird das Feld IM Canvas um 90° gedreht
// gezeichnet, damit es einen aufrecht gehaltenen (Handy-)Bildschirm
// formatfüllend nutzt statt winzig verkleinert in der Mitte zu liegen. Die
// Drehung steckt allein in der View-Transform (draw()) bzw. deren Umkehrung
// (toWorld()); HUD, Menüs und Canvas bleiben normal ausgerichtet - kein
// DOM-Dreh, kein Umschalter. resize() setzt view.portrait entsprechend.
function isPortraitView() {
  return portraitQuery.matches;
}

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
let paused = false;  // manuelle Pause (⏸-Knopf/Leertaste) – hält NUR die Simulation an,
                      // Eingaben werden währenddessen ignoriert (siehe pointerdown/frame())
let lastTime = 0;
let simAccumulator = 0; // Sekunden seit dem letzten abgeschlossenen Sim-Schritt (fixed-timestep, siehe frame())

let debugMode = false;  // Balance-Debug-Anzeige (Toggle über 📊-Knopf / F8)
let fpsSmooth = 0;      // geglättete Render-Bildrate (rAF-Callbacks/Sek.) – die
                        // Simulation läuft seit der Fixed-Timestep-Entkopplung
                        // separat mit fester Rate (CONFIG.simTickRate, siehe frame())
let updateMsSmooth = 0; // geglättete Dauer der Sim-Schritte pro Frame (ms) – für Balance-Anzeige/Blackbox
let drawMsSmooth = 0;   // geglättete Dauer von draw() pro Frame (ms) – für Balance-Anzeige/Blackbox

let view = { scale: 1, offX: 0, offY: 0, portrait: false };

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
  paused = false;
  zkBlackboxReset();

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
  updatePauseButton();
}

// Manuelle Pause: hält nur die Simulation an (siehe frame()), Eingaben werden
// währenddessen ignoriert (siehe pointerdown). Kein Effekt im Menü/nach Spielende.
function togglePause() {
  if (gameOver || inMenu) return;
  paused = !paused;
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
  const dpr = currentDpr();
  const vw = window.innerWidth;
  const vh = window.innerHeight;

  canvas.width = Math.round(vw * dpr);
  canvas.height = Math.round(vh * dpr);
  canvas.style.width = vw + "px";
  canvas.style.height = vh + "px";

  // Auf kleinen/hochkanten Bildschirmen sind Legende + Hinweiszeile per
  // CSS-Media-Query ausgeblendet (max-width:700px / max-height:520px) – dann
  // reicht unten fast kein Rand mehr. Oben bleibt die HUD-Zeile bestehen;
  // daher asymmetrisch statt oben=unten, sonst verschenken wir Spielfläche.
  // Hochformat: schmale Breite -> die HUD-Zeile bricht um (siehe styles.css),
  // deshalb oben mehr Platz reservieren.
  const portrait = isPortraitView();
  let padTop, padBottom;
  if (portrait) { padTop = 64; padBottom = 12; }
  else if (vw <= 700 || vh <= 520) { padTop = 40; padBottom = 12; }
  else { padTop = 70; padBottom = 70; }
  const side = vw < 700 ? 12 : 20;
  const availW = vw - side * 2;
  const availH = vh - padTop - padBottom;

  // Hochformat: Das Feld wird um 90° gedreht gezeichnet (siehe draw()), damit
  // das Querformat-Feld einen hochkanten Bildschirm füllt. Fürs Einpassen
  // liegen dann Feldbreite/-höhe an vertauschten Bildschirmachsen: die lange
  // Feldbreite senkrecht, die kurze Feldhöhe waagerecht.
  view.portrait = portrait;
  const fieldW = portrait ? LEVEL.height : LEVEL.width;
  const fieldH = portrait ? LEVEL.width : LEVEL.height;

  view.scale = Math.min(availW / fieldW, availH / fieldH);
  // Auf Touch-Geräten wirken die Zellen bei reiner "alles reinpassen"-Skalierung
  // recht klein (viel ungenutzter Rand durch Seitenverhältnis-Unterschiede).
  // Zusätzlicher Zoom vergrößert alles gleichmäßig um den Mittelpunkt herum;
  // der Rand des Spielfelds darf dafür leicht über den sichtbaren Bereich hinausragen.
  if (coarsePointer) view.scale *= CONFIG.mobileZoom;
  // offX/offY = obere linke Ecke der (ggf. gedrehten) Feld-Bounding-Box auf
  // dem Bildschirm, in beiden Modi einheitlich.
  view.offX = (vw - fieldW * view.scale) / 2;
  view.offY = padTop + (availH - fieldH * view.scale) / 2;

  renderBackground();
}

// Setzt die Canvas-Transform von Welt- auf Bildschirmkoordinaten (inkl. DPR).
// Querformat: reine Skalierung + Verschiebung. Hochformat: zusätzlich 90° im
// Uhrzeigersinn gedreht, sodass die Welt-x-Achse (lang) senkrecht verläuft.
// Umkehrung dazu steht in toWorld(). c2 wahlweise ein anderer Kontext (z.B.
// bgCtx beim Vorab-Rendern des Hintergrunds) statt des sichtbaren Canvas.
function applyWorldTransform(dpr, c2 = ctx) {
  const s = view.scale * dpr;
  if (view.portrait) {
    c2.setTransform(0, s, -s, 0, (view.offX + LEVEL.height * view.scale) * dpr, view.offY * dpr);
  } else {
    c2.setTransform(s, 0, 0, s, view.offX * dpr, view.offY * dpr);
  }
}

// Zeichnet Vignette + dekorative Sterne einmalig auf ein Offscreen-Canvas.
// Beides hängt nur von Viewport-Größe/-Orientierung (view.*, canvas.width/
// height) und den (bei Levelstart neu erzeugten) Sternen ab, nicht vom
// Simulationszustand – draw() muss das daher nicht mehr jeden Frame neu
// berechnen, sondern blittet nur noch dieses Bild.
function renderBackground() {
  const dpr = currentDpr();
  bgCanvas.width = canvas.width;
  bgCanvas.height = canvas.height;
  const vw = canvas.width / dpr, vh = canvas.height / dpr;
  bgCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
  bgCtx.clearRect(0, 0, vw, vh);

  const vg = bgCtx.createRadialGradient(
    vw / 2, vh / 2, 100,
    vw / 2, vh / 2, Math.max(vw, vh) * 0.7
  );
  vg.addColorStop(0, "#0d1626");
  vg.addColorStop(1, "#080e18");
  bgCtx.fillStyle = vg;
  bgCtx.fillRect(0, 0, vw, vh);

  applyWorldTransform(dpr, bgCtx);
  for (const s of stars) {
    bgCtx.beginPath();
    bgCtx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
    bgCtx.fillStyle = `rgba(160,190,220,${s.a})`;
    bgCtx.fill();
  }
}

// Zeichnet in einem bildschirm-aufrechten lokalen Koordinatensystem, dessen
// Ursprung am Weltpunkt (wx,wy) liegt. Im Hochformat ist die gesamte Welt um
// 90° gedreht (siehe applyWorldTransform) - Text/Ziffern und "über/unter der
// Zelle"-Layouts würden dadurch mitkippen. Hier wird die Drehung lokal
// zurückgenommen, sodass der Callback in Bildschirmachsen (x rechts, y unten)
// zeichnet: Beschriftungen bleiben aufrecht und richtig positioniert. Im
// Querformat ist es eine reine Verschiebung. ctx wird gespeichert/wiederhergestellt.
function drawUpright(wx, wy, cb) {
  ctx.save();
  ctx.translate(wx, wy);
  if (view.portrait) ctx.rotate(-Math.PI / 2);
  cb();
  ctx.restore();
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

// Punkte einer Zelle gutschreiben; was über das Maximum hinausgeht, wandert
// IMMER in den Überschuss-Puffer (gedeckelt bei CONFIG.overflowBuffer) statt
// verworfen zu werden – auch wenn die Zelle gerade (noch) keine aktive
// Tentakel hat. Erst sobald eine Tentakel aktiv ist, wird der Puffer über
// _boostShare gleichmäßig auf alle aktiven Kanäle verteilt (siehe update()).
function creditUnits(cell, amount) {
  const max = cellMax(cell);
  const room = max - cell.units;
  if (amount <= room) {
    cell.units += amount;
  } else {
    cell.units = max;
    cell.boost = Math.min(CONFIG.overflowBuffer, cell.boost + (amount - room));
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
    prevTail: 0, prevHead: 0,    // Sim-Zustand vor dem letzten update()-Schritt
                                 // (siehe snapshotPrevState) – fürs interpolierte Zeichnen
    mode: "grow",
    phase: Math.random() * 10,   // Versatz für die Wellen-Animation
    boostGlow: 0,                // > 0, solange gerade Überschuss durchgeleitet wird (visuell)
    clashGlow: 0,                // > 0, solange die Spitze im Duell steht (visuell)
    pipeline: [],                // unterwegs befindliche Punkte-Pakete (siehe applyMass/update)
    pendingPush: 0,              // noch nicht als Paket eingereihte, akkumulierte Fluss-Masse
    pendingTicks: 0,             // Sim-Ticks seit dem letzten Pipeline-Paket (siehe CONFIG.pipelineBatchTicks)
    rate: 0,                     // geglätteter Durchsatz (Wert/Sek.) – treibt die Fluss-Geschwindigkeit
    dotSpeed: CONFIG.flowDotSpeed,// aktuelle Fluss-/Ankunftsgeschwindigkeit (gestuft nach rate)
    dead: false
  };
}

// Für den fixed-timestep-Sim-Schritt: vor jedem update()-Aufruf den
// aktuellen head/tail als "vorherigen" Zustand sichern, damit draw()
// zwischen zwei Sim-Schritten interpolieren kann (siehe frame()).
function snapshotPrevState() {
  for (const t of tentacles) {
    t.prevHead = t.head;
    t.prevTail = t.tail;
  }
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
  // sich dann in der Mitte und ringen miteinander.) Fährt der Spieler in
  // diesem Fall die Gegenrichtung an (z.B. weil dst gerade von src geheilt
  // wird und jetzt umgekehrt Unterstützung braucht), wird die bestehende
  // Verbindung eingezogen statt den Befehl abzulehnen – die Einbahn-Regel
  // bleibt gewahrt, der Nutzer muss aber nicht erst manuell trennen.
  if (dst.owner === src.owner) {
    const back = tentacles.find(t => !t.dead && t.src === dst && t.dst === src &&
      (t.mode === "grow" || t.mode === "flow"));
    if (back) back.mode = "retract";
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

// Rein visuelle Fluss-Punkt-Geschwindigkeit, gestuft statt stufenlos nach
// Durchsatz (t.rate) – siehe CONFIG.flowSpeedTiers. Betrifft NICHT
// CONFIG.transferRate/die tatsächliche Balance.
function flowDotSpeedForRate(rate) {
  for (const tier of CONFIG.flowSpeedTiers) {
    if (rate < tier.max) return CONFIG.flowDotSpeed * tier.mul;
  }
  return CONFIG.flowDotSpeed;
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

// Nachschub für ein Tentakel-Duell: genau wie ein einseitiger Fluss auf die
// Produktion der Quelle gedeckelt (_flowBudget/_boostShare, siehe oben) – die
// SENDENDE Zelle verliert dadurch nie mehr als ihre laufende Produktion. Die
// gespeiste Kraft trifft aber, mit dem Angriffswert multipliziert, DIREKT
// die gegnerische Zelle (siehe Duell-Auflösung in update()) und zehrt DEREN
// gespeicherten Vorrat auf – wer schwächer produziert, wird über die Zeit
// leergekämpft und verliert die Zelle. Wird eine Seite zusätzlich von einer
// dritten Zelle versorgt (Heiler-Kette, Überschuss-Durchleitung), erhöht das
// ihren Puffer-Anteil (_boostShare) – sie speist mehr als die Produktion
// allein hergibt und gewinnt die Abnutzung schneller.
function battleFeed(t, dt) {
  const c = t.src;
  const want = CONFIG.transferRate * dt;
  const fromBoost = Math.min(c.boost, c._boostShare, want);
  const fromUnits = Math.min(c._flowBudget, Math.max(0, c.units), Math.max(0, want - fromBoost));
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

  // War die Tentakel noch nicht angedockt (mode "grow", Spitze noch unterwegs
  // zum Ziel), gibt es noch keine committete Masse beim Ziel – das
  // durchtrennte Vorderstück soll dann NICHT weiter zum Gegner fliegen und
  // dort Schaden/Heilung abliefern, sondern die ganze Tentakel fährt einfach
  // ein, so als hätte man sie regulär zurückgezogen.
  if (t.mode === "grow") {
    t.mode = "retract";
    return true;
  }

  // Vorderes Stück [L, head] wird ein freies Stück Richtung Ziel –
  // es übernimmt bereits unterwegs befindliche Punkte-Pakete, die weiter
  // auf ihr Ziel zufließen. prevTail/prevHead = eigener aktueller Stand
  // (kein Sprung beim ersten interpolierten Zeichnen); pendingPush bleibt
  // beim hinteren Stück (das ihn eingesammelt hat), sonst würde die noch
  // nicht eingereihte Masse doppelt gezählt.
  tentacles.push({
    ...t, tail: L, head: t.head, prevTail: L, prevHead: t.head,
    mode: "free", dead: false, pendingPush: 0, pendingTicks: 0
  });

  // Hinteres Stück [tail, L]: bekommt eine eigene, leere Pipeline –
  // sonst würden Pakete doppelt ausgeliefert (gleiche Array-Referenz).
  t.head = L;
  t.prevHead = Math.min(t.prevHead, L);
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
  // Zellen laufen im selben Korridor. Sobald beide Richtungen aktiv sind,
  // gilt sofort ein Duell (kein Warten auf Spitzen-Kontakt mehr) – die Front
  // steht fest in der Korridor-Mitte (siehe Wachstum weiter unten).
  // Index src->dst einmal pro Tick aufbauen (O(n)) statt für jede Tentakel
  // linear über alle anderen zu scannen (O(n²) bei vielen Tentakeln).
  for (const t of tentacles) { t._opp = null; t._clash = null; }
  const activeByRoute = new Map();
  for (const t of tentacles) {
    if (t.dead || (t.mode !== "grow" && t.mode !== "flow")) continue;
    activeByRoute.set(t.src.id + "|" + t.dst.id, t);
  }
  for (const t of tentacles) {
    if (t.dead || (t.mode !== "grow" && t.mode !== "flow") || t._opp) continue;
    const o = activeByRoute.get(t.dst.id + "|" + t.src.id);
    if (!o || o.owner === t.owner) continue;
    t._opp = o; o._opp = t;
    t._clash = o; o._clash = t;
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

  // Duelle austragen: die Front steht fest in der Korridor-Mitte (kein
  // Vor-/Zurückweichen mehr, siehe Wachstum weiter unten). Beide Seiten
  // speisen wie gehabt nur aus ihrem produktionsgedeckelten Budget
  // (battleFeed/_flowBudget/_boostShare) – die eigene Quelle verliert dadurch
  // nie mehr als ihre laufende Produktion. Die gespeiste Kraft trifft jetzt
  // aber DIREKT die gegnerische Quellzelle (dieselbe Verbindung, andere
  // Richtung: t.dst === o.src und o.dst === t.src) statt nur eine
  // Frontposition zu verschieben. Fällt der Vorrat einer Seite unter 0, wird
  // sie sofort erobert (damageCell -> captureCell) – ihre Tentakel (inkl. des
  // laufenden Duells) ziehen sich danach automatisch zum neuen Besitzer
  // zurück und liefern die transportierte Masse ab.
  const fought = new Set();
  for (const t of tentacles) {
    if (t.dead || !t._clash || fought.has(t)) continue;
    const o = t._clash;
    if (o.dead || fought.has(o)) continue;
    fought.add(t); fought.add(o);

    const dmgT = battleFeed(t, dt) * t.attack;
    const dmgO = battleFeed(o, dt) * o.attack;
    if (dmgT > 0) damageCell(t.dst, dmgT, t.owner);
    if (dmgO > 0 && !o.dead) damageCell(o.dst, dmgO, o.owner);

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

    // Noch nicht als Paket eingereihte, aufsummierte Fluss-Masse (siehe
    // CONFIG.pipelineBatchTicks unten) spätestens hier ausliefern, sobald
    // die Tentakel den Flow-Modus verlässt (Rückzug/Abtrennung/Eroberung) –
    // sonst würde angesammelte Masse nie in die Pipeline gelangen.
    if (t.mode !== "flow" && t.pendingPush > 0) {
      t.pipeline.push({ amount: t.pendingPush, remaining: t.len / t.dotSpeed, travel: t.len / t.dotSpeed });
      t.pendingPush = 0; t.pendingTicks = 0;
    }

    // Duell vorbei (Gegenseite eingezogen/erobert), aber die Tentakel war an
    // der Korridor-Mitte "angedockt" (mode flow bei halber Länge): wieder in
    // den Wachstums-Modus wechseln und bis zum echten Ziel weiterwachsen –
    // sonst bliebe sie für immer mitten im Feld stehen.
    if (t.mode === "flow" && !t._clash && t.head < t.len - 0.001) t.mode = "grow";

    if (t.mode === "grow") {
      // Wachstum kostet Punkte; Überschuss-Puffer wird zuerst angezapft.
      // Im Duell (_clash) ist das Wachstumsziel nur die KORRIDOR-MITTE statt
      // des vollen Ziels – die Front steht dort fest, kein Vor-/Zurückweichen
      // mehr (siehe Duell-Auflösung weiter oben).
      const target = t._clash ? Math.min(t.len, t.len / 2) : t.len;
      const limit = target - t.head;
      if (limit > 0) {
        const want = Math.min(CONFIG.tentacleSpeed * dt, limit);
        const cost = want / CONFIG.lengthPerUnit;
        if (want > 0 && t.src.units + t.src.boost >= cost) {
          const fromBoost = Math.min(t.src.boost, cost);
          t.src.boost -= fromBoost;
          t.src.units -= (cost - fromBoost);
          t.head += want;
        }
      }
      if (t.head >= target - 0.001) t.mode = "flow"; // angedockt bzw. Front erreicht!

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

        if (!hostile) {
          // Heilen: nie mehr schicken, als das Ziel aufnehmen ODER puffern
          // kann (Kapazität + noch freier Überschuss-Puffer) – alles
          // darüber hinaus würde creditUnits ohnehin verwerfen.
          const room = (cellMax(dst) - dst.units) + Math.max(0, CONFIG.overflowBuffer - dst.boost);
          total = Math.min(total, room / t.heal);
        }

        if (total > 0) {
          const fromBoost = Math.min(share, total);
          t.src.boost -= fromBoost;
          t.src.units -= (total - fromBoost);
          if (fromBoost > 0.0001) t.boostGlow = 0.35;
          // Statt jeden Sim-Tick ein eigenes Paket in die Pipeline zu legen
          // (bei simTickRate=30 immer noch ~30/Sek.), wird über
          // CONFIG.pipelineBatchTicks Ticks aufsummiert und dann als EIN
          // Paket eingereiht – spart Push/Shift-Overhead. Laufzeit bis zum
          // Ziel = Länge / Fluss-Geschwindigkeit (t.dotSpeed); travel merkt
          // sich die Anfangslaufzeit, damit die Animation die "Front" exakt
          // abbilden kann, auch wenn dotSpeed später variiert.
          t.pendingPush += total;
          t.pendingTicks++;
          if (t.pendingTicks >= CONFIG.pipelineBatchTicks) {
            t.pipeline.push({ amount: t.pendingPush, remaining: t.len / t.dotSpeed, travel: t.len / t.dotSpeed });
            t.pendingPush = 0; t.pendingTicks = 0;
          }
        }
      }

      // Fluss-Geschwindigkeit an den TATSÄCHLICHEN Durchsatz koppeln, damit
      // die Animation widerspiegelt, wie viel Angriff/Heilung pro Sekunde
      // gerade fließt: value/Sek. = übertragene Masse × Wert pro Punkt.
      // Geglättet (EMA), damit die Punkte nicht zappeln; nie langsamer als
      // die Basisgeschwindigkeit, stärkere Ströme sichtbar schneller in
      // festen Stufen statt stufenlos (siehe CONFIG.flowSpeedTiers).
      const value = hostile ? per : t.heal;
      const inst = (total / dt) * value;
      t.rate += (inst - t.rate) * Math.min(1, dt * 6);
      t.dotSpeed = flowDotSpeedForRate(t.rate);

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
  // In-place statt .filter(), um bei hoher Tentakelzahl nicht jeden Tick ein
  // neues Array zu allozieren (GC-Druck auf schwacher Mobile-Hardware).
  compactInPlace(tentacles, t => !t.dead || t.pipeline.length);

  // Effekte altern lassen
  for (const s of slashes) s.age += dt;
  compactInPlace(slashes, s => s.age < 0.8);
  const nowMs = performance.now();
  compactInPlace(cutTrail, p => nowMs - p.t < 350);

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
  // Der Canvas liegt fest im normalen Viewport (kein DOM-Dreh), daher sind
  // e.clientX/Y direkt Bildschirmkoordinaten. Im Hochformat wird das Feld in
  // der View-Transform um 90° gedreht gezeichnet (siehe applyWorldTransform);
  // hier die exakte Umkehrung, damit Zeigerpicking zum Gezeichneten passt.
  const cx = e.clientX, cy = e.clientY;
  if (view.portrait) {
    return {
      x: (cy - view.offY) / view.scale,
      y: (view.offX + LEVEL.height * view.scale - cx) / view.scale
    };
  }
  return {
    x: (cx - view.offX) / view.scale,
    y: (cy - view.offY) / view.scale
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
  if (gameOver || inMenu || paused) return;
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
    if (!paused) {
      const cell = pickCell(toWorld(e));
      if (cell && cell !== dragSource) {
        tryCommand(dragSource, cell);
        selected = null;
      }
    }
    dragSource = null;
  }
  cutting = false;
  cutLast = null;
  cutArmed = false;
});

canvas.addEventListener("pointercancel", () => { dragSource = null; cutting = false; cutLast = null; cutArmed = false; });
canvas.addEventListener("contextmenu", e => { e.preventDefault(); selected = null; dragSource = null; });
window.addEventListener("keydown", e => {
  if (e.key === "Escape") { selected = null; dragSource = null; }
  if (e.key === "F8") { e.preventDefault(); toggleDebugMode(); }
  if (e.key === " " && !inMenu && !gameOver) {
    const tag = document.activeElement && document.activeElement.tagName;
    if (tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA" || tag === "BUTTON") return;
    e.preventDefault();
    togglePause();
    updatePauseButton();
  }
});

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

// Tentakel als leicht wellige Linie mit Spitze und Fluss-Punkten.
// alpha (0..1): Fortschritt seit dem letzten abgeschlossenen Sim-Schritt
// (siehe frame()) – head/tail werden zwischen dem vorherigen und dem
// aktuellen Sim-Zustand interpoliert, damit die Bewegung trotz fester,
// niedrigerer Simulationsrate (CONFIG.simTickRate) flüssig aussieht.
function drawTentacle(t, now, alpha) {
  const head = t.prevHead + (t.head - t.prevHead) * alpha;
  const tail = t.prevTail + (t.tail - t.prevTail) * alpha;
  const seg = head - tail;
  if (seg < 1) return;
  const color = OWNER_COLOR[t.owner];
  const nx = -t.uy, ny = t.ux; // senkrecht zur Flugrichtung

  // Wellenversatz: an den Enden der GESAMT-Linie verankert
  const wob = L => reducedMotion ? 0 :
    Math.sin(L * 0.045 + now / 300 + t.phase) * 5 * Math.sin(Math.PI * L / t.len);

  ctx.save();
  if (glowEnabled) { ctx.shadowColor = color; ctx.shadowBlur = 6; }
  ctx.strokeStyle = hexToRgba(color, 0.85);
  ctx.lineWidth = 3;
  ctx.lineCap = "round";
  ctx.beginPath();
  const steps = Math.max(6, Math.round(seg / 12));
  for (let i = 0; i <= steps; i++) {
    const L = tail + seg * (i / steps);
    const o = wob(L);
    const px = t.p0.x + t.ux * L + nx * o;
    const py = t.p0.y + t.uy * L + ny * o;
    i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
  }
  ctx.stroke();

  // Spitze (Wachstums- bzw. Vorderende)
  const ho = wob(head);
  const tipX = t.p0.x + t.ux * head + nx * ho;
  const tipY = t.p0.y + t.uy * head + ny * ho;
  ctx.beginPath();
  ctx.arc(tipX, tipY, 4.2, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
  ctx.restore();

  // Balance-Debug: Durchsatz (Wert/Sek.) einer angedockten, aktiv
  // übertragenden Tentakel neben der Spitze einblenden.
  if (debugMode && t.mode === "flow" && t.rate > 0.05) {
    drawUpright(tipX, tipY, () => {
      ctx.font = '600 10px "Consolas", "SF Mono", monospace';
      ctx.textAlign = "center";
      ctx.fillStyle = hexToRgba("#eaf2fa", 0.8);
      ctx.fillText(`${t.rate.toFixed(1)}/s`, 0, -10);
    });
  }

  // Duell-Funken: weiß glühende Spitze, solange zwei Tentakel ringen
  if (t.clashGlow > 0) {
    const a = Math.min(1, t.clashGlow / 0.25);
    const flicker = reducedMotion ? 1 : 0.75 + 0.25 * Math.sin(now / 30 + t.phase * 7);
    ctx.save();
    if (glowEnabled) { ctx.shadowColor = "#ffffff"; ctx.shadowBlur = 14; }
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
    for (let L = tail + (dir === 1 ? shift : spacing - shift); L < head; L += spacing) {
      const o = wob(L);
      ctx.beginPath();
      ctx.arc(t.p0.x + t.ux * L + nx * o, t.p0.y + t.uy * L + ny * o, boosted ? 2.1 : 1.7, 0, Math.PI * 2);
      ctx.fill();
      if (boosted) { // versetzter Zweitstrom als "Verstärkt"-Signal
        const L2 = L + spacing / 2;
        if (L2 < head) {
          const o2 = wob(L2);
          ctx.beginPath();
          ctx.arc(t.p0.x + t.ux * L2 + nx * o2, t.p0.y + t.uy * L2 + ny * o2, 1.5, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }
  }

  // Fluss-Punkte für angedockte, tatsächlich übertragende Tentakel: Punkte-
  // Pakete werden in der Pipeline seltener als jeden Sim-Tick gebündelt
  // (siehe CONFIG.pipelineBatchTicks in update()). Das älteste Paket
  // (t.pipeline[0], am nächsten an der Zustellung) zeigt trotzdem weiterhin
  // nur die aktuelle "Front" des Flusses an; sichtbare, klar getrennte
  // Punkte werden im gewohnten Abstand von der Quelle bis zu dieser Front
  // gezeichnet – die Front wächst dabei genauso schnell, wie die echten
  // Pakete unterwegs sind, und erreicht das Ziel nicht sofort über die
  // ganze Strecke.
  if (!reducedMotion && t.pipeline.length) {
    const lead = t.pipeline[0];
    const travelTime = lead.travel || (t.len / CONFIG.flowDotSpeed);
    const boosted = t.boostGlow > 0;
    const leadFrac = 1 - Math.max(0, Math.min(1, lead.remaining / travelTime));
    const leadL = tail + leadFrac * (head - tail);
    const spacing = 26;
    // Punkt-Geschwindigkeit = tatsächliche Fluss-Geschwindigkeit der Tentakel
    const dotSpeed = (t.dotSpeed || CONFIG.flowDotSpeed) * (boosted ? 1.5 : 1);
    const shift = (now / 1000 * dotSpeed) % spacing;
    ctx.fillStyle = hexToRgba("#ffffff", boosted ? 0.95 : 0.8);
    for (let L = tail + shift; L < leadL; L += spacing) {
      const o = wob(L);
      ctx.beginPath();
      ctx.arc(t.p0.x + t.ux * L + nx * o, t.p0.y + t.uy * L + ny * o, boosted ? 2.1 : 1.7, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

function draw(now, alpha) {
  const dpr = currentDpr();

  // Vorgerenderten Hintergrund (Vignette + Sterne, siehe renderBackground())
  // blitten statt jeden Frame neu zu zeichnen.
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bgCanvas, 0, 0);

  // In Weltkoordinaten wechseln (im Hochformat um 90° gedreht)
  applyWorldTransform(dpr);

  // Tentakel (unter den Zellen)
  for (const t of tentacles) drawTentacle(t, now, alpha);

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
      drawUpright((dragSource.x + tx) / 2, (dragSource.y + ty) / 2, () => {
        ctx.font = '600 13px "Segoe UI", system-ui, sans-serif';
        ctx.textAlign = "center";
        ctx.fillStyle = hexToRgba("#eaf2fa", 0.9);
        ctx.fillText(`−${cost}`, 0, -10);
      });
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

    drawCellShape(ctx, c.type, c.x, c.y, r, color, glowEnabled);

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

    // Punkte-Zähler (im Hochformat aufrecht, siehe drawUpright)
    drawUpright(c.x, c.y, () => {
      ctx.font = `700 ${Math.round(r * 0.62)}px "Segoe UI", system-ui, sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillStyle = "#eaf2fa";
      // nie negativ anzeigen (während des Not-Einzugs kann der Wert intern < 0 sein)
      ctx.fillText(String(Math.max(0, Math.floor(c.units))), 0, 1);
    });

    // Balance-Debug: Produktion/Sek. und Kapazität dezent über der Zelle
    if (debugMode) {
      drawUpright(c.x, c.y, () => {
        ctx.font = '600 10px "Consolas", "SF Mono", monospace';
        ctx.textAlign = "center";
        ctx.fillStyle = hexToRgba("#eaf2fa", 0.55);
        ctx.fillText(`+${cellProd(c).toFixed(1)}/s · ${cellMax(c)}`, 0, -r - 9);
      });
    }

    // Tentakel-Slots als kleine Punkte unter befehligbaren Zellen
    // (im Hochformat aufrecht als waagerechte Reihe, siehe drawUpright)
    if (controllable(c)) {
      const total = maxSlots(c);
      const used = outgoing(c).length;
      const y = r + 16;
      const x0 = -((total - 1) * 9) / 2;
      drawUpright(c.x, c.y, () => {
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
      });
    }
  }

  // Pause-Overlay: in Bildschirmkoordinaten (nicht Welt-Transform), damit
  // Text/Abdunklung unabhängig von Zoom/Hochformat-Drehung immer gleich sitzt.
  if (paused) {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const vw = canvas.width / dpr, vh = canvas.height / dpr;
    ctx.fillStyle = "rgba(10,17,28,.45)";
    ctx.fillRect(0, 0, vw, vh);
    ctx.font = '700 28px "Segoe UI", system-ui, sans-serif';
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = "#eaf2fa";
    ctx.fillText("PAUSIERT", vw / 2, vh / 2);
  }
}

/* ======================================================================
   HAUPTSCHLEIFE
   ====================================================================== */

const SIM_MAX_STEPS_PER_FRAME = 5; // verhindert eine "Spiral of Death" nach Tab-Wechsel/Sperrbildschirm

// Simulation und Rendering sind entkoppelt: update() läuft mit fester Rate
// (CONFIG.simTickRate), unabhängig davon, wie schnell rAF tatsächlich feuert.
// draw() läuft weiterhin bei jedem rAF-Callback und interpoliert Tentakel-
// Positionen zwischen dem vorherigen und dem aktuellen Sim-Schritt (alpha),
// damit die Animation trotz selteneren Rechnens flüssig bleibt.
function frame(now) {
  const simDt = 1 / CONFIG.simTickRate;
  // Größerer Spike-Guard als früher ok: die while-Schleife unten begrenzt
  // ohnehin, wie viele Sim-Schritte ein einzelner Frame nachholen darf.
  const frameDt = Math.min(0.25, (now - lastTime) / 1000 || 0);
  lastTime = now;

  // Manuelle Pause: Simulation komplett anhalten, aber weiter zeichnen
  // (eingefrorener letzter Zustand) statt Sim-Schritte nachzuholen.
  let alpha = 1;
  if (!paused) {
    simAccumulator += frameDt;
    let steps = 0;
    const tUpd0 = performance.now();
    while (simAccumulator >= simDt && steps < SIM_MAX_STEPS_PER_FRAME) {
      snapshotPrevState();
      update(simDt);
      simAccumulator -= simDt;
      steps++;
    }
    // Sind wir wegen des Schritt-Limits zurückgefallen, nicht ewig nachlaufen
    // lassen (sonst häufen sich nach einer Slow-Phase immer mehr Sim-Schritte an).
    if (steps === SIM_MAX_STEPS_PER_FRAME) simAccumulator = 0;
    if (steps > 0) {
      const updMs = performance.now() - tUpd0;
      updateMsSmooth += (updMs - updateMsSmooth) * Math.min(1, frameDt * 4);
    }
    alpha = Math.max(0, Math.min(1, simAccumulator / simDt));
  }

  const tDraw0 = performance.now();
  draw(now, alpha);
  const drawMs = performance.now() - tDraw0;
  drawMsSmooth += (drawMs - drawMsSmooth) * Math.min(1, frameDt * 4);

  updateHud();
  if (frameDt > 0) fpsSmooth += (1 / frameDt - fpsSmooth) * Math.min(1, frameDt * 4);
  if (debugMode) {
    updateDebugPanel();
    // Während der Pause NICHT weiter aufzeichnen: sonst würden die (jetzt
    // eingefrorenen, aber identischen) Frames laufend nachrücken und genau
    // den Moment kurz vor dem Pausieren – meist der interessante Moment,
    // wenn man wegen eines Bugs pausiert hat – aus dem 10s-Fenster verdrängen.
    if (!paused) zkBlackboxTick();
  }
  requestAnimationFrame(frame);
}
