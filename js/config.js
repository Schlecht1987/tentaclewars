"use strict";

/* ======================================================================
   KONFIGURATION – hier Werte anpassen
   ====================================================================== */

// Neben dem Namen (HUD/Menü) angezeigte Versionsnummer – bei jedem Release
// zusammen mit der CACHE-Version in sw.js hochzählen, damit Nutzer (und wir
// bei Fehlerberichten) erkennen können, ob ihr Client schon aktualisiert hat.
const APP_VERSION = "18";

const CONFIG = {
  // --- Ansicht ---
  mobileZoom: 1.18,  // zusätzlicher Zoomfaktor auf Touch-Geräten (coarsePointer):
                      // Spielfeld wird über die reine "alles reinpassen"-Größe
                      // hinaus vergrößert (Ränder werden leicht angeschnitten),
                      // damit Zellen auf kleinen Handy-Bildschirmen größer wirken.
  maxDpr: 2,          // Obergrenze für devicePixelRatio bei der Canvas-Auflösung –
                      // ungedeckelt zeichnen 3x-Handys 9x so viele Pixel/Frame wie
                      // ein 1x-Display; das kostet auf schwacher Mobile-Hardware
                      // spürbar Bildrate, ohne sichtbar mehr Schärfe zu bringen.
  glowOnMobile: false, // ctx.shadowBlur-Leuchteffekte (Zellen/Tentakel) sind auf
                       // Mobile-Canvas2D-Rasterizern teuer; auf Touch-Geräten
                       // (coarsePointer) standardmäßig aus.

  // --- Simulation ---
  simTickRate: 30,     // feste Simulationsrate (Hz), unabhängig von der
                       // Bildwiederholrate: frame() akkumuliert echte Zeit und
                       // ruft update() in festen SIM_DT-Schritten auf; draw()
                       // läuft weiter mit voller Framerate und interpoliert
                       // Tentakel-Positionen zwischen zwei Sim-Schritten, damit
                       // die Animation trotz selteneren Rechnens flüssig bleibt.

  // --- Tentakel ---
  tentacleSpeed:  55,   // Wachstums-Geschwindigkeit der Tentakelspitze (Welt-Pixel/Sek.) – bewusst langsam
  retractSpeed:   130,  // Geschwindigkeit beim Einziehen bzw. von abgetrennten Stücken
  lengthPerUnit:  22,   // Pixel Tentakel pro Punkt: Wachstum KOSTET Punkte (lange Tentakel = teuer)
  transferRate:   20,    // max. Punkte/Sek. pro angedockter Tentakel.
                         // HEILUNG ist zusätzlich auf die Produktion der Quelle
                         // gedeckelt (Unterstützen kostet nie Vorrat).
                         // ANGRIFFE und DUELLE zapfen dagegen den VORRAT mit
                         // voller Rate an – gespeicherte Punkte werden in
                         // Schaden umgemünzt, guter Nachschub entscheidet.
  flowDotSpeed:   80,   // rein visuell: Geschwindigkeit der Fluss-Punkte auf der Tentakel
  // Gestufte (statt stufenlose) Fluss-Punkt-Geschwindigkeit je nach Durchsatz
  // (t.rate, Wert/Sek.) – rein kosmetisch, betrifft NICHT transferRate/die
  // tatsächliche Balance. max = obere Durchsatz-Grenze der Stufe, mul =
  // Vielfaches von flowDotSpeed in dieser Stufe.
  flowSpeedTiers: [
    { max: 1.5, mul: 1 },        // langsam
    { max: 3.5, mul: 1.6 },      // mittel
    { max: Infinity, mul: 2.5 }, // schnell
  ],
  pipelineBatchTicks: 3, // je Tentakel wird nicht mehr JEDEN Sim-Tick ein eigenes
                         // Punkte-Paket in die Pipeline gelegt, sondern über so
                         // viele Ticks aufsummiert und dann als ein Paket
                         // eingereiht – spart Push/Shift-Overhead, ohne die
                         // sichtbare "Front" (siehe drawTentacle) zu verändern.

  // Überschuss-Durchleitung: Ist eine Zelle voll, verfallen eingehende Heilung
  // und eigene Produktion nicht, sondern landen in einem Puffer und werden
  // ZUSÄTZLICH durch die eigenen Tentakel weitergeleitet (Symbiose-Ketten:
  // Heiler -> Angreifer -> Feind). So groß darf der Puffer werden:
  overflowBuffer: 12,

  // --- Tentakel-Slots: wie viele Tentakel eine Zelle gleichzeitig ausfahren darf ---
  slotBase: 1,          // Grundausstattung
  slotStep: 25,         // pro slotStep AKTUELLE Punkte ein zusätzlicher Slot ...
  slotMax:  4,          // ... bis maximal so viele

  // --- Sonstiges ---
  bunkerDefense:   1,    // Bunker senkt den Schaden JEDES ankommenden Punkts um diesen Wert
  neutralProduces: false,// Sollen auch neutrale Zellen produzieren?

  // --- Neutrale Zellen: Eroberung durch AUFLADEN statt "auf 0 bringen" ---
  // Eine neutrale Zelle wird NICHT mehr im Moment des Nullpunkts erobert
  // (das führte zu einem Wettlauf: wessen Tentakel den Tick zuerst hatte,
  // schnappte die Zelle weg). Stattdessen bricht ein Angreifer erst die
  // Garnison (Vorrat auf 0) und lädt die Zelle danach mit EIGENEN Punkten
  // AUF; erst bei captureCharge Punkten wechselt sie den Besitzer. Ein
  // Konkurrent muss die bereits geladenen Punkte zuerst wieder abtragen –
  // das gelingt nur mit mehr Angriff pro Sekunde als der aktuelle Halter.
  captureCharge: 15,

  // --- Zell-Ausbau: Zellen wachsen stufenweise, wenn sie viel Vorrat halten ---
  // Erreicht eine Zelle tierUp[i] Punkte, steigt sie auf Stufe i+1: etwas
  // größerer Radius, höhere Produktion und mehr Kapazität. Sie schrumpft
  // erst wieder, wenn sie unter tierDown[i] fällt (20-Punkte-Hysterese –
  // kein Zittern an der Grenze; z.B. Stufe 3 bleibt bis unter 100). Wie hoch
  // eine Zelle steigen kann, legt ihr Feld `tierMax` fest (0 = baut nie aus).
  // In den festen Leveln steht tierMax pro Zelle, in generierten Karten wird
  // es deterministisch aus dem Seed verteilt – nicht jede Zelle erreicht 120.
  tierUp:        [40, 80, 120],       // Vorrats-Schwellen zum Aufstieg
  tierDown:      [20, 60, 100],       // Vorrats-Schwellen zum Abstieg (je 20 darunter)
  tierMaxUnits:  [null, 90, 130, 170],// Kapazität ab Stufe 1 (Stufe 0 = Typ-Max)
  tierProdMul:   [1, 1.25, 1.5, 1.8], // Produktions-Faktor je Stufe
  tierRadiusAdd: [0, 4, 8, 13]       // Radius-Zuschlag (Pixel) je Stufe
};

// Die fünf Zelltypen. attack/heal gelten PRO ÜBERTRAGENEM PUNKT und hängen
// an der SENDENDEN Zelle; die Bunker-Verteidigung an der empfangenden.
const CELL_TYPES = {
  normal:   { label: "Normal",    prod: 1.0, max: 50,  attack: 1, heal: 1, radius: 26 },
  healer:   { label: "Heiler",    prod: 1.0, max: 50,  attack: 1, heal: 2, radius: 26 },
  attacker: { label: "Angreifer", prod: 1.0, max: 50,  attack: 2, heal: 1, radius: 25 },
  factory:  { label: "Fabrik",    prod: 2.0, max: 25,  attack: 1, heal: 1, radius: 22 },
  bunker:   { label: "Bunker",    prod: 0.5, max: 100, attack: 1, heal: 1, radius: 33 }
};

// Besitzer-Farben (müssen zu den CSS-Tokens in styles.css passen)
const OWNER_COLOR = {
  player:  "#4fc1ff",
  enemy:   "#ff5964",
  enemy2:  "#ffb347",
  enemy3:  "#b06bff",
  neutral: "#8593a1"
};

// Alle möglichen KI-Fraktionen, in der Reihenfolge, in der sie bei
// mehreren Gegnern vergeben werden. Ein Level enthält eine Fraktion,
// sobald ihm Zellen mit diesem owner gehören.
const AI_FACTIONS = ["enemy", "enemy2", "enemy3"];

// Anzeigenamen der Fraktionen (HUD-Tooltips, Beschreibungen)
const OWNER_LABEL = {
  player: "Spieler", enemy: "KI Rot", enemy2: "KI Bernstein", enemy3: "KI Violett", neutral: "Neutral"
};

// --- KI-Schwierigkeitsprofile ---
// interval:        Sekunden zwischen zwei KI-Aktionen
// minUnits:        KI fährt erst Tentakel aus, wenn die Quellzelle so viele Punkte hat
// commandsPerTick: wie viele Befehle die KI pro Aktion geben darf
// targetNoise:     zufälliger Bewertungs-Jitter bei der Zielwahl (0 = perfekt)
const AI_PROFILES = {
  easy:   { interval: 4.5, minUnits: 18, commandsPerTick: 1, targetNoise: 8 },
  medium: { interval: 3.0, minUnits: 12, commandsPerTick: 1, targetNoise: 3 },
  hard:   { interval: 2.0, minUnits: 8,  commandsPerTick: 2, targetNoise: 0 }
};

// Profil einer Fraktion in einem Level auflösen: Level können pro Fraktion
// einen Profil-Namen ("easy"/"medium"/"hard") oder ein Inline-Objekt angeben.
function aiProfileFor(level, owner) {
  const p = level.ai && level.ai[owner];
  if (typeof p === "string") return AI_PROFILES[p] || AI_PROFILES.medium;
  return p || AI_PROFILES.medium;
}
