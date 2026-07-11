"use strict";

/* ======================================================================
   KAMPAGNE – 50 Level mit steigender Schwierigkeit
   Level werden deterministisch aus der Levelnummer generiert (gleiche
   Nummer -> immer dieselbe Karte); einzelne Schlüssel-Level sind
   handgebaut (CAMPAIGN_HANDBUILT in levels.js).
   WICHTIG: Das RNG-Mapping ausgelieferter Level nie ändern, ohne
   CAMPAIGN_SEED zu bumpen – sonst verändern sich alle 50 Karten.
   ====================================================================== */

const CAMPAIGN_SIZE = 50;
// Bump bei jeder Änderung an generateMap/campaignDifficulty (siehe Kommentar
// oben). v2: Zell-Ausbau (tierMax) eingeführt – zusätzliche rng-Ziehungen.
// v3: flächenskalierter Mindestabstand (spread) – Zellen nutzen die ganze Karte.
// v4: Mobile-Überarbeitung – kleinere Karten, weniger Zellen, größerer
//     Randabstand (margin 100), sanftere Anfangs-Schwierigkeit, Symmetrie
//     als Regel statt Ausnahme.
const CAMPAIGN_SEED = 0xC0FFE4;

function lerp(a, b, t) { return a + (b - a) * t; }

// Schwierigkeits-Parameter für Level n (1..50)
function campaignDifficulty(n) {
  const t = (n - 1) / (CAMPAIGN_SIZE - 1);
  const types = ["normal"];
  if (n >= 3)  types.push("factory");
  if (n >= 6)  types.push("healer");
  if (n >= 9)  types.push("bunker");
  if (n >= 12) types.push("attacker");
  return {
    profile: {
      // Anfangs sehr träge und "kurzsichtige" KI (großes Intervall, viel
      // Ziel-Rauschen), zum Ende hin schnell und präzise – so steigt die
      // gefühlte Schwierigkeit stetig von leicht bis schwer.
      interval: lerp(5.5, 1.6, t),
      minUnits: Math.round(lerp(20, 8, t)),
      commandsPerTick: n >= 40 ? 2 : 1,
      targetNoise: lerp(10, 0, t)
    },
    aiCount: n <= 16 ? 1 : (n <= 36 ? 2 : 3),
    // Bewusst kompakte Karten: weniger Fläche + weniger Zellen heißt auf dem
    // Handy größere Zellen und präzisere Schnitte. Die Schwierigkeit kommt
    // aus der KI-Stärke, nicht aus der Kartengröße.
    width: Math.round(lerp(900, 1200, t)),
    height: Math.round(lerp(580, 760, t)),
    cellsPerFaction: n <= 8 ? 2 : (n <= 30 ? 3 : 4),
    neutralCells: Math.round(lerp(2, 7, t)),
    allowedTypes: types,
    // Symmetrie ist die Regel (wirkt gestaltet und fair); nur ab Level 15
    // ist jedes fünfte Level bewusst asymmetrisch als Abwechslung.
    symmetric: !(n >= 15 && n % 5 === 0),
    aiUnits: Math.round(lerp(22, 40, t))
  };
}

// Level n erzeugen (handgebaut, falls vorhanden, sonst generiert).
// Liefert immer eine frische Kopie/Instanz.
function generateCampaignLevel(n) {
  if (CAMPAIGN_HANDBUILT[n]) {
    return JSON.parse(JSON.stringify(CAMPAIGN_HANDBUILT[n]));
  }
  const d = campaignDifficulty(n);
  const rng = mulberry32(CAMPAIGN_SEED ^ Math.imul(n, 2654435761));
  const map = generateMap({
    width: d.width, height: d.height,
    aiFactions: AI_FACTIONS.slice(0, d.aiCount),
    cellsPerFaction: d.cellsPerFaction,
    neutralCells: d.neutralCells,
    allowedTypes: d.allowedTypes,
    symmetric: d.symmetric,
    startUnits: { player: 30, ai: d.aiUnits }
  }, rng);

  map.name = "Level " + n;
  map.tag = "Kampagne";
  map.desc = d.aiCount === 1
    ? "Ein KI-Gegner. Erobere alle gegnerischen Zellen."
    : `${d.aiCount} KI-Gegner, die auch einander bekämpfen. Erobere alle gegnerischen Zellen.`;
  map.ai = {};
  for (const f of AI_FACTIONS.slice(0, d.aiCount)) map.ai[f] = d.profile;
  return map;
}

/* ======================================================================
   FORTSCHRITT (localStorage)
   Hinweis: file:// und http://localhost sind getrennte Origins – der
   Fortschritt wandert nicht zwischen beiden.
   ====================================================================== */

const PROGRESS_KEY = "zellkrieg.progress.v1";

function loadProgress() {
  try {
    const raw = localStorage.getItem(PROGRESS_KEY);
    if (raw) {
      const p = JSON.parse(raw);
      if (p && p.v === 1 && Array.isArray(p.completed)) return p;
    }
  } catch (e) { /* privater Modus / Speicher gesperrt: ohne Persistenz weiterspielen */ }
  return { v: 1, completed: [], lastPlayed: 1 };
}

function saveProgress(p) {
  try { localStorage.setItem(PROGRESS_KEY, JSON.stringify(p)); } catch (e) { /* s.o. */ }
}

function markCompleted(n) {
  const p = loadProgress();
  if (!p.completed.includes(n)) p.completed.push(n);
  p.lastPlayed = n;
  saveProgress(p);
}

function isCompleted(n) { return loadProgress().completed.includes(n); }
function isUnlocked(n)  { return n === 1 || loadProgress().completed.includes(n - 1); }
