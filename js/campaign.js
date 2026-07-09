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
const CAMPAIGN_SEED = 0xC0FFE3;

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
      interval: lerp(4.5, 1.8, t),
      minUnits: Math.round(lerp(18, 8, t)),
      commandsPerTick: n >= 35 ? 2 : 1,
      targetNoise: lerp(8, 0, t)
    },
    aiCount: n <= 14 ? 1 : (n <= 34 ? 2 : 3),
    width: Math.round(lerp(1000, 1350, t)),
    height: Math.round(lerp(640, 860, t)),
    cellsPerFaction: n <= 5 ? 2 : (n <= 20 ? 3 : 4),
    neutralCells: Math.round(lerp(3, 9, t)),
    allowedTypes: types,
    symmetric: n % 3 !== 0, // jedes dritte Level: bewusst asymmetrische Karte
    aiUnits: Math.round(lerp(24, 38, t))
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
