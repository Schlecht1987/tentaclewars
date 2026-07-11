// Hauptspiel: Zustand, Eingabe, UI und Render-Loop

const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");

// ---- Pfad-Kacheln berechnen (blockiert fürs Bauen) – pro Level neu ----
let pathTiles = new Set();
function buildPathTiles(waypoints) {
  pathTiles = new Set();
  for (let i = 0; i < waypoints.length - 1; i++) {
    let [c1, r1] = waypoints[i];
    const [c2, r2] = waypoints[i + 1];
    const dc = Math.sign(c2 - c1);
    const dr = Math.sign(r2 - r1);
    pathTiles.add(`${c1},${r1}`);
    while (c1 !== c2 || r1 !== r2) {
      c1 += dc;
      r1 += dr;
      pathTiles.add(`${c1},${r1}`);
    }
  }
}

// ---- Kampagnen-Fortschritt (localStorage) ----
const PROGRESS_KEY = "towerdefense.progress.v1";

function loadProgress() {
  try {
    const p = JSON.parse(localStorage.getItem(PROGRESS_KEY));
    if (p && p.v === 1) return { normal: p.normal || [], hardcore: p.hardcore || [] };
  } catch (e) { /* privater Modus o. Ä. */ }
  return { normal: [], hardcore: [] };
}

function markCompleted(index, hardcore) {
  const p = loadProgress();
  const list = hardcore ? p.hardcore : p.normal;
  if (!list.includes(index)) list.push(index);
  try {
    localStorage.setItem(PROGRESS_KEY, JSON.stringify({ v: 1, normal: p.normal, hardcore: p.hardcore }));
  } catch (e) { /* ignorieren */ }
}

function isUnlocked(index, hardcore, p) {
  if (hardcore && !hardcoreUnlocked(p)) return false;
  if (index === 0) return true;
  return (hardcore ? p.hardcore : p.normal).includes(index - 1);
}

function hardcoreUnlocked(p) {
  return LEVELS.every((_, i) => p.normal.includes(i));
}

// ---- Spielzustand ----
const state = {};
state.levelIndex = 0;
state.levelDef = LEVELS[0];
state.hardcore = false;

function resetState() {
  const lv = state.levelDef;
  state.gold = lv.startGold;
  state.lives = state.hardcore ? 1 : lv.startLives;
  state.totalWaves = lv.waves;
  state.wave = 0;
  state.kills = 0;
  state.enemies = [];
  state.towers = [];
  state.projectiles = [];
  state.effects = [];
  state.spawner = null;
  state.placingType = null;   // Turmtyp, der gerade platziert wird
  state.tool = null;          // "upgrade" | "sell" | null – Klick-Werkzeug
  state.selectedTower = null;
  state.speed = state.hardcore ? 3 : 1;
  state.autoWave = state.hardcore; // Hardcore: Wellen starten automatisch nacheinander
  state.damageDealt = 0;
  state.gameOver = false;
  state.hoverTile = null;
}

// ---- UI-Elemente ----
const ui = {
  gold: document.getElementById("gold"),
  lives: document.getElementById("lives"),
  wave: document.getElementById("wave"),
  kills: document.getElementById("kills"),
  shop: document.getElementById("shop"),
  selection: document.getElementById("selection"),
  selInfo: document.getElementById("sel-info"),
  btnUpgrade: document.getElementById("btn-upgrade"),
  btnSell: document.getElementById("btn-sell"),
  toolUpgrade: document.getElementById("tool-upgrade"),
  toolSell: document.getElementById("tool-sell"),
  btnStart: document.getElementById("btn-start"),
  chkAuto: document.getElementById("chk-auto"),
  waveInfo: document.getElementById("wave-info"),
  statsContent: document.getElementById("stats-content"),
  overlay: document.getElementById("overlay"),
  overlayTitle: document.getElementById("overlay-title"),
  overlayText: document.getElementById("overlay-text"),
  btnRestart: document.getElementById("btn-restart"),
  btnNext: document.getElementById("btn-next"),
  btnMenu: document.getElementById("btn-menu"),
  menu: document.getElementById("menu"),
  levelGrid: document.getElementById("level-grid"),
  levelGridHc: document.getElementById("level-grid-hc"),
  hcSub: document.getElementById("hc-sub"),
  levelName: document.getElementById("level-name"),
};

// Shop aufbauen
for (const [key, t] of Object.entries(TOWER_TYPES)) {
  const btn = document.createElement("button");
  btn.className = "shop-item";
  btn.dataset.type = key;
  const lv = t.levels[0];
  const statLine = lv.buff !== undefined
    ? `Buff: +${Math.round(lv.buff * 100)} % Schaden · Radius ${lv.range}`
    : lv.rateBuff !== undefined
    ? `Buff: +${Math.round(lv.rateBuff * 100)} % Tempo · Radius ${lv.range}`
    : `Schaden: ${lv.damage} · ${(1 / lv.fireRate).toFixed(1)} Schuss/s · ${(lv.damage / lv.fireRate).toFixed(0)} DPS`;
  btn.innerHTML =
    `<span class="cost">${t.cost} 💰</span><span class="name">${t.icon} ${t.name}</span>` +
    `<div class="desc">${t.desc}</div>` +
    `<div class="desc">${statLine}</div>`;
  btn.addEventListener("click", () => {
    if (state.gold < t.cost) return;
    state.placingType = state.placingType === key ? null : key;
    state.tool = null;
    state.selectedTower = null;
    updateUI();
  });
  ui.shop.appendChild(btn);
}

function updateUI() {
  ui.gold.textContent = state.gold;
  ui.lives.textContent = state.lives;
  ui.wave.textContent = `${state.wave}/${state.totalWaves}`;
  ui.levelName.textContent = `– Level ${state.levelIndex + 1}: ${state.levelDef.name}${state.hardcore ? " 💀" : ""}`;
  ui.kills.textContent = state.kills;

  for (const el of ui.shop.children) {
    const t = TOWER_TYPES[el.dataset.type];
    el.classList.toggle("selected", state.placingType === el.dataset.type);
    el.classList.toggle("unaffordable", state.gold < t.cost);
  }

  ui.toolUpgrade.classList.toggle("active", state.tool === "upgrade");
  ui.toolSell.classList.toggle("active", state.tool === "sell");

  const tw = state.selectedTower;
  if (tw) {
    ui.selection.classList.remove("hidden");
    const s = tw.stats;
    ui.selInfo.innerHTML =
      `<b>${tw.def.icon} ${tw.def.name}</b> (Level ${tw.level + 1})<br>` +
      (s.buff !== undefined
        ? `Buff: +${Math.round(s.buff * 100)} % Schaden<br>Radius: ${s.range}`
        : s.rateBuff !== undefined
        ? `Buff: +${Math.round(s.rateBuff * 100)} % Angriffstempo<br>Radius: ${s.range}`
        : `Schaden: ${s.damage}` +
          (tw.buffMult > 1 ? ` <span style="color:#e0d05a">(×${tw.buffMult.toFixed(2)} ⚡)</span>` : "") +
          `<br>Reichweite: ${s.range}<br>` +
          `Feuerrate: ${(1 / s.fireRate).toFixed(1)}/s` +
          (tw.rateMult > 1 ? ` <span style="color:#5ad08a">(×${tw.rateMult.toFixed(2)} ⏩)</span>` : "")) +
      (s.targets > 1 ? `<br>Ziele: ${s.targets >= 999 ? "alle in Reichweite" : "bis zu " + s.targets}` : "") +
      (s.splash ? `<br>Fläche: ${s.splash}` : "") +
      (s.slow ? `<br>Slow: ${Math.round(s.slow * 100)} %` : "") +
      (s.stun ? `<br>Betäubung: ${s.stun} s` : "") +
      (s.critEvery ? `<br>Krit: jeder ${s.critEvery}. Schuss ×${s.critMult}` : "");
    if (tw.maxLevel) {
      ui.btnUpgrade.textContent = "Max. Level";
      ui.btnUpgrade.disabled = true;
    } else {
      ui.btnUpgrade.textContent = `Upgrade (${tw.upgradeCost} 💰)`;
      ui.btnUpgrade.disabled = state.gold < tw.upgradeCost;
    }
    ui.btnSell.textContent = `Verkaufen (+${tw.sellValue} 💰)`;
  } else {
    ui.selection.classList.add("hidden");
  }

  const waveActive = state.spawner && (!state.spawner.finished || state.enemies.length > 0);
  const allDone = state.wave >= state.totalWaves && !waveActive;
  ui.btnStart.disabled = !!waveActive || allDone || state.gameOver;
  ui.btnStart.textContent = waveActive ? `Welle ${state.wave} läuft…`
    : allDone ? "Alle Wellen geschafft!"
    : `Welle ${state.wave + 1}/${state.totalWaves} starten ▶`;
  ui.waveInfo.textContent = waveActive
    ? `Gegner übrig: ${state.enemies.length + (state.spawner.queue.length - state.spawner.index)}`
    : state.wave > 0 ? "Bereit für die nächste Welle." : "Baue Türme und starte die erste Welle!";

  updateStats();
}

function updateStats() {
  // Türme: Anzahl, investiertes Gold, theoretische Gesamt-DPS
  const towerCounts = {};
  let invested = 0;
  let dps = 0;
  for (const t of state.towers) {
    towerCounts[t.type] = (towerCounts[t.type] || 0) + 1;
    invested += t.invested;
    if (!t.isBooster) dps += (t.stats.damage * t.buffMult) / (t.stats.fireRate / t.rateMult);
  }

  let html = `<div class="sec">Türme (${state.towers.length})</div>`;
  if (state.towers.length === 0) {
    html += `noch keine gebaut`;
  } else {
    for (const [key, count] of Object.entries(towerCounts)) {
      const t = TOWER_TYPES[key];
      html += `${t.icon} ${t.name}: <span class="val">${count}×</span><br>`;
    }
    html += `Gesamt-DPS: <span class="val">${Math.round(dps)}</span><br>`;
    html += `Investiert: <span class="val">${invested} 💰</span>`;
  }

  html += `<div class="sec">Kampf</div>`;
  html += `Verursachter Schaden: <span class="val">${Math.round(state.damageDealt)}</span><br>`;
  html += `Kills: <span class="val">${state.kills}</span>`;

  // Vorschau: Gegner-HP der nächsten Welle
  if (state.wave < state.totalWaves) {
    const next = buildWave(state.wave + 1, state.levelDef.hpMul);
    html += `<div class="sec">Nächste Welle (${state.wave + 1}/${state.totalWaves})</div>`;
    for (const g of next.groups) {
      const e = ENEMY_TYPES[g.type];
      html += `${g.count}× ${e.name}: <span class="val">${Math.round(e.hp * next.hpScale)} HP</span><br>`;
    }
  }

  ui.statsContent.innerHTML = html;
}

// ---- Eingabe ----
function tileFromEvent(ev) {
  const rect = canvas.getBoundingClientRect();
  const x = (ev.clientX - rect.left) * (canvas.width / rect.width);
  const y = (ev.clientY - rect.top) * (canvas.height / rect.height);
  return {
    col: Math.floor(x / CONFIG.tileSize),
    row: Math.floor(y / CONFIG.tileSize),
  };
}

function canBuild(col, row) {
  if (col < 0 || row < 0 || col >= CONFIG.cols || row >= CONFIG.rows) return false;
  if (pathTiles.has(`${col},${row}`)) return false;
  return !state.towers.some(t => t.col === col && t.row === row);
}

canvas.addEventListener("mousemove", ev => {
  state.hoverTile = tileFromEvent(ev);
});
canvas.addEventListener("mouseleave", () => { state.hoverTile = null; });

canvas.addEventListener("click", ev => {
  if (state.gameOver) return;
  const { col, row } = tileFromEvent(ev);

  if (state.placingType) {
    const cost = TOWER_TYPES[state.placingType].cost;
    if (canBuild(col, row) && state.gold >= cost) {
      state.gold -= cost;
      state.towers.push(new Tower(state.placingType, col, row));
      if (state.gold < cost) state.placingType = null; // kein Geld mehr für weitere
    }
  } else if (state.tool) {
    const tw = state.towers.find(t => t.col === col && t.row === row);
    if (tw) {
      if (state.tool === "upgrade" && !tw.maxLevel && state.gold >= tw.upgradeCost) {
        state.gold -= tw.upgradeCost;
        tw.upgrade();
      } else if (state.tool === "sell") {
        state.gold += tw.sellValue;
        state.towers = state.towers.filter(t => t !== tw);
        if (state.selectedTower === tw) state.selectedTower = null;
      }
    }
  } else {
    state.selectedTower = state.towers.find(t => t.col === col && t.row === row) || null;
  }
  updateUI();
});

// Werkzeug-Buttons: Klick-Modus zum Upgraden/Verkaufen direkt auf der Karte
function toggleTool(name) {
  state.tool = state.tool === name ? null : name;
  state.placingType = null;
  state.selectedTower = null;
  updateUI();
}
ui.toolUpgrade.addEventListener("click", () => toggleTool("upgrade"));
ui.toolSell.addEventListener("click", () => toggleTool("sell"));

// Rechtsklick / Escape bricht Platzierung ab
canvas.addEventListener("contextmenu", ev => {
  ev.preventDefault();
  state.placingType = null;
  state.tool = null;
  state.selectedTower = null;
  updateUI();
});
window.addEventListener("keydown", ev => {
  if (ev.key === "Escape") {
    state.placingType = null;
    state.tool = null;
    state.selectedTower = null;
    updateUI();
  }
});

ui.btnUpgrade.addEventListener("click", () => {
  const tw = state.selectedTower;
  if (tw && !tw.maxLevel && state.gold >= tw.upgradeCost) {
    state.gold -= tw.upgradeCost;
    tw.upgrade();
    updateUI();
  }
});

ui.btnSell.addEventListener("click", () => {
  const tw = state.selectedTower;
  if (tw) {
    state.gold += tw.sellValue;
    state.towers = state.towers.filter(t => t !== tw);
    state.selectedTower = null;
    updateUI();
  }
});

function startNextWave() {
  if (state.gameOver || state.spawner || state.wave >= state.totalWaves) return;
  state.wave++;
  state.spawner = new WaveSpawner(state.wave);
  updateUI();
}

ui.btnStart.addEventListener("click", startNextWave);

ui.chkAuto.addEventListener("change", () => {
  if (state.hardcore) { ui.chkAuto.checked = true; return; } // im Hardcore fest an
  state.autoWave = ui.chkAuto.checked;
  // Direkt loslegen, wenn gerade keine Welle läuft
  if (state.autoWave) startNextWave();
});

document.querySelectorAll(".speed-btn").forEach(btn => {
  btn.addEventListener("click", () => {
    if (state.hardcore) return; // im Hardcore fest 3×
    state.speed = Number(btn.dataset.speed);
    document.querySelectorAll(".speed-btn").forEach(b => b.classList.toggle("active", b === btn));
  });
});

// Bedienelemente an Normal-/Hardcore-Modus anpassen
function applyModeUI() {
  ui.chkAuto.checked = state.autoWave;
  ui.chkAuto.disabled = state.hardcore;
  document.querySelectorAll(".speed-btn").forEach(b => {
    b.classList.toggle("active", Number(b.dataset.speed) === state.speed);
    b.disabled = state.hardcore;
  });
}

// ---- Levelauswahl / Kampagne ----
function loadLevel(index, hardcore) {
  state.levelIndex = index;
  state.levelDef = LEVELS[index];
  state.hardcore = hardcore;
  computePathPixels(state.levelDef.waypoints);
  buildPathTiles(state.levelDef.waypoints);
  resetState();
  applyModeUI();
  ui.overlay.classList.add("hidden");
  ui.menu.classList.add("hidden");
  updateUI();
}

function showMenu() {
  state.gameOver = true; // Simulation anhalten, solange das Menü offen ist
  ui.overlay.classList.add("hidden");
  buildMenu();
  ui.menu.classList.remove("hidden");
}

function buildMenu() {
  const p = loadProgress();

  const makeTile = (i, hardcore) => {
    const lv = LEVELS[i];
    const done = (hardcore ? p.hardcore : p.normal).includes(i);
    const open = isUnlocked(i, hardcore, p);
    const btn = document.createElement("button");
    btn.className = "level-tile" + (done ? " done" : "") + (open ? "" : " locked") + (hardcore ? " hc" : "");
    btn.disabled = !open;
    btn.innerHTML =
      `<span class="lv-num">${done ? "✔" : open ? i + 1 : "🔒"}</span>` +
      `<span class="lv-name">${lv.name}</span>` +
      `<span class="lv-meta">${lv.waves} Wellen · ${hardcore ? "1 Leben" : lv.startLives + " Leben"}</span>` +
      `<span class="lv-desc">${lv.desc}</span>`;
    if (open) btn.addEventListener("click", () => loadLevel(i, hardcore));
    return btn;
  };

  ui.levelGrid.innerHTML = "";
  LEVELS.forEach((_, i) => ui.levelGrid.appendChild(makeTile(i, false)));

  ui.levelGridHc.innerHTML = "";
  if (hardcoreUnlocked(p)) {
    ui.hcSub.textContent = "1 Leben, Wellen starten automatisch, fest 3× Geschwindigkeit. Viel Glück.";
    LEVELS.forEach((_, i) => ui.levelGridHc.appendChild(makeTile(i, true)));
  } else {
    ui.hcSub.textContent = `🔒 Wird freigeschaltet, wenn alle 10 Kampagnen-Level geschafft sind (${p.normal.length}/10).`;
  }
}

ui.btnRestart.addEventListener("click", () => {
  loadLevel(state.levelIndex, state.hardcore);
});

ui.btnNext.addEventListener("click", () => {
  loadLevel(state.levelIndex + 1, state.hardcore);
});

ui.btnMenu.addEventListener("click", showMenu);

// ---- Update-Logik ----
function update(dt) {
  if (state.gameOver) return;

  if (state.spawner) state.spawner.update(dt, state.enemies);

  for (const e of state.enemies) e.update(dt);

  // Verstärker-/Taktgeber-Buffs berechnen (je Buff-Art gewinnt der stärkste, stapelt nicht)
  for (const t of state.towers) { t.buffMult = 1; t.rateMult = 1; }
  for (const b of state.towers) {
    if (!b.isBooster) continue;
    for (const t of state.towers) {
      if (t.isBooster) continue;
      if (Math.hypot(t.x - b.x, t.y - b.y) <= b.stats.range) {
        if (b.stats.buff) t.buffMult = Math.max(t.buffMult, 1 + b.stats.buff);
        if (b.stats.rateBuff) t.rateMult = Math.max(t.rateMult, 1 + b.stats.rateBuff);
      }
    }
  }

  for (const t of state.towers) t.update(dt, state.enemies, state.projectiles);
  for (const p of state.projectiles) p.update(dt, state.enemies, state.effects);
  for (const fx of state.effects) fx.update(dt);

  // Tote / durchgekommene Gegner verarbeiten
  let changed = false;
  state.enemies = state.enemies.filter(e => {
    if (e.dead) {
      state.gold += e.gold;
      state.kills++;
      changed = true;
      return false;
    }
    if (e.reachedEnd) {
      state.lives--;
      changed = true;
      return false;
    }
    return true;
  });

  state.projectiles = state.projectiles.filter(p => !p.done);
  state.effects = state.effects.filter(fx => !fx.done);

  // Welle geschafft?
  if (state.spawner && state.spawner.finished && state.enemies.length === 0) {
    state.gold += CONFIG.waveBonusBase + state.wave * 3;
    state.spawner = null;
    changed = true;

    if (state.wave >= state.totalWaves && state.lives > 0) {
      // Sieg!
      state.gameOver = true;
      const wasHcLocked = !hardcoreUnlocked(loadProgress());
      markCompleted(state.levelIndex, state.hardcore);
      const lastLevel = state.levelIndex >= LEVELS.length - 1;
      ui.overlayTitle.textContent = state.hardcore ? "💀🏆 Hardcore geschafft!" : "🏆 Gewonnen!";
      let text = `„${state.levelDef.name}" überstanden – alle ${state.totalWaves} Wellen, mit ${state.lives} Leben und ${state.kills} Kills!`;
      if (lastLevel) {
        text += state.hardcore
          ? " Du hast die komplette Hardcore-Kampagne bezwungen – Respekt!"
          : wasHcLocked && hardcoreUnlocked(loadProgress())
            ? " Kampagne komplett – der 💀 Hardcore-Modus ist jetzt freigeschaltet!"
            : " Kampagne komplett!";
      }
      ui.overlayText.textContent = text;
      ui.btnNext.classList.toggle("hidden", lastLevel);
      ui.overlay.classList.remove("hidden");
    } else if (state.autoWave) {
      startNextWave();
    }
  }

  if (state.lives <= 0 && !state.gameOver) {
    state.lives = 0;
    state.gameOver = true;
    ui.overlayTitle.textContent = "💀 Game Over";
    ui.overlayText.textContent = `Du hast ${state.wave} Welle(n) erreicht und ${state.kills} Gegner besiegt.` +
      (state.hardcore ? " Hardcore kennt keine Gnade – nur 1 Leben." : "");
    ui.btnNext.classList.add("hidden");
    ui.overlay.classList.remove("hidden");
  }

  if (changed) updateUI();
}

// ---- Rendering ----
function drawMap() {
  const s = CONFIG.tileSize;

  // Gitter
  ctx.strokeStyle = "rgba(255,255,255,.04)";
  ctx.lineWidth = 1;
  for (let c = 0; c <= CONFIG.cols; c++) {
    ctx.beginPath();
    ctx.moveTo(c * s, 0);
    ctx.lineTo(c * s, CONFIG.rows * s);
    ctx.stroke();
  }
  for (let r = 0; r <= CONFIG.rows; r++) {
    ctx.beginPath();
    ctx.moveTo(0, r * s);
    ctx.lineTo(CONFIG.cols * s, r * s);
    ctx.stroke();
  }

  // Pfad
  ctx.fillStyle = "#4a4234";
  for (const key of pathTiles) {
    const [c, r] = key.split(",").map(Number);
    ctx.fillRect(c * s, r * s, s, s);
  }

  // Start- und Zielmarkierung
  const start = PATH_PIXELS[0];
  const end = PATH_PIXELS[PATH_PIXELS.length - 1];
  ctx.font = "20px sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("🚪", Math.max(start.x, 14), start.y);
  ctx.fillText("🏰", Math.min(end.x, CONFIG.cols * s - 14), end.y);
}

function drawPlacementPreview() {
  if (!state.placingType || !state.hoverTile) return;
  const { col, row } = state.hoverTile;
  const s = CONFIG.tileSize;
  const ok = canBuild(col, row);
  const t = TOWER_TYPES[state.placingType];

  const cx = col * s + s / 2;
  const cy = row * s + s / 2;

  // Reichweiten-Vorschau
  ctx.beginPath();
  ctx.arc(cx, cy, t.levels[0].range, 0, Math.PI * 2);
  ctx.fillStyle = ok ? "rgba(120,220,120,.08)" : "rgba(220,120,120,.08)";
  ctx.fill();

  ctx.fillStyle = ok ? "rgba(120,220,120,.35)" : "rgba(220,120,120,.35)";
  ctx.fillRect(col * s, row * s, s, s);

  ctx.beginPath();
  ctx.arc(cx, cy, s / 2 - 8, 0, Math.PI * 2);
  ctx.fillStyle = t.color;
  ctx.globalAlpha = 0.7;
  ctx.fill();
  ctx.globalAlpha = 1;
}

function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawMap();
  for (const t of state.towers) t.draw(ctx, t === state.selectedTower);
  for (const e of state.enemies) e.draw(ctx);
  for (const p of state.projectiles) p.draw(ctx);
  for (const fx of state.effects) fx.draw(ctx);
  drawPlacementPreview();
}

// ---- Loop ----
let lastTime = performance.now();
function loop(now) {
  let dt = (now - lastTime) / 1000;
  lastTime = now;
  dt = Math.min(dt, 0.05); // große Sprünge (Tab-Wechsel) begrenzen

  // Bei höherer Geschwindigkeit mehrfach simulieren
  for (let i = 0; i < state.speed; i++) update(dt);

  draw();
  requestAnimationFrame(loop);
}

// ---- Start: erstes freies Level vorbereiten, Menü zeigen ----
{
  const p = loadProgress();
  let start = LEVELS.findIndex((_, i) => !p.normal.includes(i) && isUnlocked(i, false, p));
  if (start < 0) start = 0;
  loadLevel(start, false);
  showMenu();
}
requestAnimationFrame(loop);
