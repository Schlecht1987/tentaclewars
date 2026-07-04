"use strict";

/* ======================================================================
   UI: Levelauswahl (Kampagne/Extras), Zufallsspiel-Formular, HUD,
   Legende und Sieg/Niederlage-Overlay.
   ====================================================================== */

// Woher stammt das laufende Level? Steuert Fortschritt & "Weiter"-Knopf.
//   { kind: "campaign", n }                       – Kampagnen-Level n
//   { kind: "random", settings }                  – Zufallsspiel
//   { kind: "sandbox" }                           – Testlabor
let currentRef = null;

let hudCounters = []; // { el, owner } – von buildHud befüllt, updateHud liest

const HINT_BASE =
  "Von eigener Zelle zu einem Ziel ziehen: Tentakel ausfahren (kostet Punkte) · " +
  "Ziel erneut anklicken: Tentakel einziehen · Auf freier Fläche über eine EIGENE Tentakel wischen: durchschneiden";

/* ---------------------------------------------------------------------
   Level starten
   --------------------------------------------------------------------- */

function startLevel(levelObj, ref) {
  LEVEL = levelObj;
  currentRef = ref;
  makeStars();
  resize();
  resetGame();
  buildHud();
  document.getElementById("hint").textContent =
    (LEVEL.sandbox ? "TESTLABOR – du steuerst ALLE Parteien. " : "") + HINT_BASE;
  inMenu = false;
  document.getElementById("levelSelect").classList.add("hidden");
  document.getElementById("randomSetup").classList.add("hidden");
}

function showLevelMenu() {
  inMenu = true;
  document.getElementById("overlay").classList.remove("show");
  document.getElementById("randomSetup").classList.add("hidden");
  buildCampaignGrid(); // Zustände (offen/geschafft) immer frisch anzeigen
  document.getElementById("levelSelect").classList.remove("hidden");
}

/* ---------------------------------------------------------------------
   Kampagnen-Gitter (50 Kacheln: gesperrt / offen / geschafft)
   --------------------------------------------------------------------- */

function buildCampaignGrid() {
  const grid = document.getElementById("campaignGrid");
  grid.innerHTML = "";
  const progress = loadProgress();
  const done = n => progress.completed.includes(n);
  for (let n = 1; n <= CAMPAIGN_SIZE; n++) {
    const tile = document.createElement("button");
    tile.type = "button";
    tile.className = "campaign-tile";
    tile.textContent = n;
    const unlocked = n === 1 || done(n - 1);
    if (done(n)) {
      tile.classList.add("done");
      tile.title = `Level ${n} – geschafft`;
    } else if (unlocked) {
      tile.classList.add("open");
      tile.title = `Level ${n}`;
    } else {
      tile.classList.add("locked");
      tile.disabled = true;
      tile.title = `Level ${n} – gesperrt (schaffe erst Level ${n - 1})`;
    }
    if (unlocked || done(n)) {
      tile.addEventListener("click", () => {
        startLevel(generateCampaignLevel(n), { kind: "campaign", n });
      });
    }
    grid.appendChild(tile);
  }
}

/* ---------------------------------------------------------------------
   Zufallsspiel-Formular
   --------------------------------------------------------------------- */

const RANDOM_SETTINGS_KEY = "zellkrieg.randomSettings.v1";

const RANDOM_OPTION_ROWS = [
  { key: "aiCount",    label: "Gegner",        values: [[1, "1 KI"], [2, "2 KIs"], [3, "3 KIs"]] },
  { key: "difficulty", label: "Schwierigkeit", values: [["easy", "Leicht"], ["medium", "Mittel"], ["hard", "Schwer"]] },
  { key: "mapSize",    label: "Kartengröße",   values: [["small", "Klein"], ["medium", "Mittel"], ["large", "Groß"]] },
  { key: "density",    label: "Zelldichte",    values: [["low", "Wenig"], ["normal", "Normal"], ["high", "Viel"]] },
  { key: "cellMix",    label: "Zelltypen",     values: [["normalOnly", "Nur Normal"], ["standard", "Standard"], ["all", "Alle fünf"]] },
  { key: "fairness",   label: "Fairness",      values: [["symmetric", "Symmetrisch"], ["random", "Zufällig"], ["handicap", "Handicap"]] }
];

let randomSettings = null; // wird in initUi() geladen

function defaultRandomSettings() {
  return {
    aiCount: 1, difficulty: "medium", mapSize: "medium",
    density: "normal", cellMix: "all", fairness: "symmetric",
    seed: newSeed()
  };
}

function newSeed() {
  return Math.floor(Math.random() * 0xFFFFFF);
}

function loadRandomSettings() {
  try {
    const raw = localStorage.getItem(RANDOM_SETTINGS_KEY);
    if (raw) {
      const s = JSON.parse(raw);
      if (s && typeof s === "object") return Object.assign(defaultRandomSettings(), s);
    }
  } catch (e) { /* ohne Persistenz weiter */ }
  return defaultRandomSettings();
}

function saveRandomSettings() {
  try { localStorage.setItem(RANDOM_SETTINGS_KEY, JSON.stringify(randomSettings)); } catch (e) { /* s.o. */ }
}

function buildRandomForm() {
  const wrap = document.getElementById("randomOptions");
  wrap.innerHTML = "";
  for (const row of RANDOM_OPTION_ROWS) {
    const rowEl = document.createElement("div");
    rowEl.className = "option-row";
    const label = document.createElement("span");
    label.className = "option-label";
    label.textContent = row.label;
    rowEl.appendChild(label);
    const pills = document.createElement("div");
    pills.className = "option-pills";
    for (const [value, text] of row.values) {
      const pill = document.createElement("button");
      pill.type = "button";
      pill.className = "pill" + (randomSettings[row.key] === value ? " active" : "");
      pill.textContent = text;
      pill.addEventListener("click", () => {
        randomSettings[row.key] = value;
        saveRandomSettings();
        for (const p of pills.children) p.classList.remove("active");
        pill.classList.add("active");
      });
      pills.appendChild(pill);
    }
    rowEl.appendChild(pills);
    wrap.appendChild(rowEl);
  }
  updateSeedLabel();
}

function updateSeedLabel() {
  document.getElementById("seedLabel").textContent = "Karte #" + randomSettings.seed;
}

function showRandomSetup() {
  inMenu = true;
  document.getElementById("levelSelect").classList.add("hidden");
  buildRandomForm();
  document.getElementById("randomSetup").classList.remove("hidden");
}

function startRandomGame() {
  saveRandomSettings();
  const settings = { ...randomSettings };
  startLevel(generateRandomLevel(settings), { kind: "random", settings });
}

/* ---------------------------------------------------------------------
   HUD: ein Chip pro Fraktion im laufenden Level
   --------------------------------------------------------------------- */

function buildHud() {
  const wrap = document.getElementById("factionChips");
  wrap.innerHTML = "";
  hudCounters = [];
  const owners = ["player", ...AI_FACTIONS.filter(f => LEVEL.cells.some(c => c.owner === f))];
  for (const owner of owners) {
    const chip = document.createElement("span");
    chip.className = "chip";
    chip.title = OWNER_LABEL[owner] || owner;
    const dot = document.createElement("i");
    dot.style.background = OWNER_COLOR[owner];
    dot.style.boxShadow = `0 0 8px ${OWNER_COLOR[owner]}`;
    chip.appendChild(dot);
    const count = document.createElement("span");
    count.textContent = "0";
    chip.appendChild(count);
    wrap.appendChild(chip);
    hudCounters.push({ el: count, owner });
  }
}

function updateHud() {
  for (const { el, owner } of hudCounters) {
    el.textContent = cells.filter(c => c.owner === owner).length;
  }
}

/* ---------------------------------------------------------------------
   Balance-Debug-Anzeige (Toggle: 📊-Knopf im HUD / Taste F8)
   Zeigt zusätzlich zur normalen Anzeige Produktionsraten pro Zelle,
   Durchsatz pro Tentakel (siehe game.js draw/drawTentacle) sowie eine
   kleine Gesamt-Übersicht (Ticks/Sek., Zellen/Vorrat/Produktion je
   Fraktion) unten links – rein informativ, keine Spiellogik.
   --------------------------------------------------------------------- */

function toggleDebugMode() {
  debugMode = !debugMode;
  document.getElementById("debugPanel").classList.toggle("hidden", !debugMode);
  document.getElementById("btnBalance").classList.toggle("active", debugMode);
  if (debugMode) updateDebugPanel();
}

/* ---------------------------------------------------------------------
   Hochformat-Umschalter (🔄-Knopf im HUD, nur auf Touch-Geräten sichtbar)
   Wechselt zwischen "gedreht" (Spielfeld füllt den Bildschirm, Kopf schräg
   halten - Standard) und "normal" (kein Dreh-Trick, Spielfeld bleibt klein
   und zentriert wie am Desktop). Einstellung wird gespeichert.
   --------------------------------------------------------------------- */
function updateRotateButton() {
  document.getElementById("btnRotate").classList.toggle("active", !rotatePreference);
}

function toggleRotatePreference() {
  setRotatePreference(!rotatePreference);
  updateRotateButton();
}

function updateDebugPanel() {
  const panel = document.getElementById("debugPanel");
  const owners = ["player", ...AI_FACTIONS.filter(f => cells.some(c => c.owner === f))];
  const lines = [`${fpsSmooth.toFixed(0)} Ticks/s  ·  ${cells.length} Zellen  ·  ${tentacles.length} Tentakel`];
  for (const owner of owners) {
    const oc = cells.filter(c => c.owner === owner);
    if (!oc.length) continue;
    const units = oc.reduce((s, c) => s + Math.max(0, c.units), 0);
    const prod = oc.reduce((s, c) => s + cellProd(c), 0);
    lines.push(`${OWNER_LABEL[owner] || owner}: ${oc.length} Zellen · ${units.toFixed(0)} Vorrat · +${prod.toFixed(1)}/s`);
  }
  panel.textContent = lines.join("\n");
}

/* ---------------------------------------------------------------------
   Sieg / Niederlage (Overlay-Inhalt; ausgelöst von checkVictory in game.js)
   --------------------------------------------------------------------- */

function showGameEnd(playerWon) {
  const title = document.getElementById("overlayTitle");
  const text = document.getElementById("overlayText");
  const next = document.getElementById("overlayNext");
  next.classList.add("hidden");

  if (playerWon) {
    title.textContent = "Sieg";
    title.style.color = OWNER_COLOR.player;
    text.textContent = "Alle gegnerischen Zellen wurden erobert.";
    if (currentRef && currentRef.kind === "campaign") {
      markCompleted(currentRef.n);
      if (currentRef.n < CAMPAIGN_SIZE) {
        next.textContent = "Nächstes Level";
        next.classList.remove("hidden");
        text.textContent = `Level ${currentRef.n} geschafft – Level ${currentRef.n + 1} ist freigeschaltet.`;
      } else {
        text.textContent = "Level 50 geschafft – die Kampagne ist besiegt!";
      }
    } else if (currentRef && currentRef.kind === "random") {
      next.textContent = "Neue Karte";
      next.classList.remove("hidden");
    }
  } else {
    title.textContent = "Niederlage";
    title.style.color = OWNER_COLOR.enemy;
    text.textContent = "Deine letzte Zelle ist gefallen.";
  }
  document.getElementById("overlay").classList.add("show");
}

function onOverlayNext() {
  if (!currentRef) return;
  if (currentRef.kind === "campaign" && currentRef.n < CAMPAIGN_SIZE) {
    const n = currentRef.n + 1;
    startLevel(generateCampaignLevel(n), { kind: "campaign", n });
  } else if (currentRef.kind === "random") {
    randomSettings.seed = newSeed();
    saveRandomSettings();
    startRandomGame();
  }
  document.getElementById("overlay").classList.remove("show");
}

/* ---------------------------------------------------------------------
   Legende (Zelltypen-Erklärung unten)
   --------------------------------------------------------------------- */

function buildLegend() {
  const legend = document.getElementById("legend");
  const dpr = window.devicePixelRatio || 1;
  const info = {
    normal:   "Produktion 1/s · Max 50",
    healer:   "Heilung +2",
    attacker: "Angriff −2",
    factory:  "Produktion 2/s · Max 25",
    bunker:   "Max 100 · Schaden −1 pro Punkt"
  };
  for (const key of Object.keys(CELL_TYPES)) {
    const item = document.createElement("div");
    item.className = "legend-item";
    const cv = document.createElement("canvas");
    const size = 30;
    cv.width = size * dpr; cv.height = size * dpr;
    cv.style.width = size + "px"; cv.style.height = size + "px";
    const c2 = cv.getContext("2d");
    c2.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawCellShape(c2, key, size / 2, size / 2 + (key === "healer" ? 2 : 0), key === "healer" ? 8.5 : 10, "#8593a1", false);
    item.appendChild(cv);
    const label = document.createElement("span");
    label.innerHTML = `<strong style="color:var(--text)">${CELL_TYPES[key].label}</strong> &middot; ${info[key]}`;
    item.appendChild(label);
    legend.appendChild(item);
  }
}

/* ---------------------------------------------------------------------
   Verdrahtung (von main.js einmalig aufgerufen)
   --------------------------------------------------------------------- */

function initUi() {
  randomSettings = loadRandomSettings();

  document.getElementById("restart").addEventListener("click", resetGame);
  document.getElementById("overlayRestart").addEventListener("click", resetGame);
  document.getElementById("btnLevels").addEventListener("click", showLevelMenu);
  document.getElementById("btnBalance").addEventListener("click", toggleDebugMode);
  if (coarsePointer) {
    document.getElementById("btnRotate").addEventListener("click", toggleRotatePreference);
    updateRotateButton();
  } else {
    document.getElementById("btnRotate").remove(); // nur für Touch-Geräte relevant
  }
  document.getElementById("overlayMenu").addEventListener("click", showLevelMenu);
  document.getElementById("overlayNext").addEventListener("click", onOverlayNext);

  document.getElementById("btnSandbox").addEventListener("click", () => {
    startLevel(JSON.parse(JSON.stringify(SANDBOX_LEVEL)), { kind: "sandbox" });
  });
  document.getElementById("btnRandom").addEventListener("click", showRandomSetup);
  document.getElementById("btnRandomBack").addEventListener("click", showLevelMenu);
  document.getElementById("btnRandomStart").addEventListener("click", startRandomGame);
  document.getElementById("btnReroll").addEventListener("click", () => {
    randomSettings.seed = newSeed();
    saveRandomSettings();
    updateSeedLabel();
  });

  buildCampaignGrid();
}
