"use strict";

/* ======================================================================
   KRISTALLKRIEG – Spielzustand, Simulation, Rendering, UI
   ====================================================================== */

const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");

/* ------------------------- Fortschritt (localStorage) ---------------- */

const PROGRESS_KEY = "kristallkrieg.progress.v1";

function loadProgress() {
  try {
    const p = JSON.parse(localStorage.getItem(PROGRESS_KEY));
    if (p && p.v === 1) return p;
  } catch (e) { /* private mode etc. */ }
  return { v: 1, wins: { leicht: 0, mittel: 0, schwer: 0 } };
}

function saveProgress(p) {
  try { localStorage.setItem(PROGRESS_KEY, JSON.stringify(p)); } catch (e) { }
}

/* ------------------------- Zustand ----------------------------------- */

let state = null;

function resetState(diffKey) {
  state = {
    difficulty: diffKey,
    crystals: CONFIG.startCrystals,
    aiCrystals: CONFIG.startCrystals,
    collectors: 0,
    aiCollectors: 0,
    playerBaseHp: CONFIG.baseHp,
    enemyBaseHp: CONFIG.baseHp,
    units: [],
    towers: [makeTower(0), makeTower(1), makeTower(2)],
    effects: [],
    time: 0,
    aiTimer: 2,
    speed: 1,
    gameOver: true,       // true solange Menü/Overlay offen ist
    selectedType: null
  };
}

function spawnUnit(owner, typeKey, lane) {
  let n = 0;
  for (const u of state.units) if (!u.dead && u.owner === owner) n++;
  if (n >= CONFIG.maxUnitsPerSide) return;
  state.units.push(makeUnit(owner, typeKey, lane));
}

function collectorCost() {
  return CONFIG.collectorBaseCost + CONFIG.collectorCostStep * state.collectors;
}

/* ------------------------- Simulation -------------------------------- */

function ownedTowers(owner) {
  let n = 0;
  for (const tw of state.towers) if (tw.owner === owner) n++;
  return n;
}

function update(dt) {
  state.time += dt;

  /* Einkommen */
  const diff = DIFFICULTIES[state.difficulty];
  state.crystals += (CONFIG.baseIncome + CONFIG.collectorIncome * state.collectors
    + CONFIG.towerIncome * ownedTowers("player")) * dt;
  state.aiCrystals += (CONFIG.baseIncome + CONFIG.collectorIncome * state.aiCollectors
    + CONFIG.towerIncome * ownedTowers("enemy")) * diff.incomeMul * dt;

  aiThink(dt, state);

  for (const u of state.units) if (!u.dead) updateUnit(u, dt, state);
  for (const tw of state.towers) updateTower(tw, dt, state);
  updateBaseGuns(dt, state);
  state.units = state.units.filter(u => !u.dead);

  for (const fx of state.effects) fx.t -= dt;
  state.effects = state.effects.filter(fx => fx.t > 0);

  /* Sieg / Niederlage */
  if (state.enemyBaseHp <= 0) endGame(true);
  else if (state.playerBaseHp <= 0) endGame(false);
}

/* ------------------------- Rendering --------------------------------- */

function drawBase(x, hp, color, mirror) {
  const w = 56, h = 120;
  const bx = mirror ? x - w : x;
  ctx.fillStyle = "rgba(255,255,255,.05)";
  ctx.fillRect(bx, CONFIG.height / 2 - h / 2, w, h);
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.strokeRect(bx, CONFIG.height / 2 - h / 2, w, h);
  ctx.font = "34px serif";
  ctx.textAlign = "center";
  ctx.fillText("🏰", bx + w / 2, CONFIG.height / 2 + 12);
  // HP-Balken
  const frac = Math.max(0, hp / CONFIG.baseHp);
  ctx.fillStyle = "rgba(0,0,0,.5)";
  ctx.fillRect(bx, CONFIG.height / 2 - h / 2 - 14, w, 8);
  ctx.fillStyle = frac > 0.3 ? color : "#ff5a4b";
  ctx.fillRect(bx, CONFIG.height / 2 - h / 2 - 14, w * frac, 8);
}

function drawUnit(u) {
  const t = UNIT_TYPES[u.type];
  const y = unitY(u);
  const color = u.owner === "player" ? "#5ad0c0" : "#ff7a6b";
  ctx.beginPath();
  ctx.arc(u.x, y, 13, 0, Math.PI * 2);
  ctx.fillStyle = u.owner === "player" ? "rgba(90,208,192,.18)" : "rgba(255,122,107,.18)";
  ctx.fill();
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.font = "15px serif";
  ctx.textAlign = "center";
  ctx.fillText(t.icon, u.x, y + 5);
  // HP-Balken
  const frac = u.hp / u.maxHp;
  if (frac < 1) {
    ctx.fillStyle = "rgba(0,0,0,.5)";
    ctx.fillRect(u.x - 12, y - 22, 24, 4);
    ctx.fillStyle = frac > 0.4 ? "#7ee08a" : "#ffb04b";
    ctx.fillRect(u.x - 12, y - 22, 24 * frac, 4);
  }
}

function drawTower(tw) {
  const color = tw.owner === "player" ? "#5ad0c0"
    : tw.owner === "enemy" ? "#ff7a6b" : "#8a97ad";
  ctx.beginPath();
  ctx.arc(tw.x, tw.y, 20, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(255,255,255,.05)";
  ctx.fill();
  ctx.strokeStyle = color;
  ctx.lineWidth = 2.5;
  ctx.stroke();
  ctx.font = "20px serif";
  ctx.textAlign = "center";
  ctx.fillText("🗼", tw.x, tw.y + 7);
  // Eroberungs-Fortschritt
  if (tw.charge > 0 && tw.chargeOwner) {
    const cc = tw.chargeOwner === "player" ? "#5ad0c0" : "#ff7a6b";
    ctx.beginPath();
    ctx.arc(tw.x, tw.y, 26, -Math.PI / 2,
      -Math.PI / 2 + Math.PI * 2 * (tw.charge / CONFIG.towerCaptureNeed));
    ctx.strokeStyle = cc;
    ctx.lineWidth = 3;
    ctx.stroke();
  }
}

function render() {
  ctx.clearRect(0, 0, CONFIG.width, CONFIG.height);

  // Lanes
  for (let i = 0; i < 3; i++) {
    const y = CONFIG.laneYs[i];
    ctx.fillStyle = state.selectedType !== null && state.hoverLane === i
      ? "rgba(90,208,192,.09)" : "rgba(255,255,255,.03)";
    ctx.fillRect(60, y - 42, CONFIG.width - 120, 84);
    ctx.strokeStyle = "rgba(255,255,255,.07)";
    ctx.lineWidth = 1;
    ctx.strokeRect(60, y - 42, CONFIG.width - 120, 84);
  }

  drawBase(6, state.playerBaseHp, "#5ad0c0", false);
  drawBase(CONFIG.width - 6, state.enemyBaseHp, "#ff7a6b", true);

  for (const tw of state.towers) drawTower(tw);
  for (const u of state.units) drawUnit(u);

  // Treffer-Effekte
  for (const fx of state.effects) {
    ctx.globalAlpha = Math.max(0, fx.t / fx.max);
    ctx.strokeStyle = fx.color;
    ctx.lineWidth = fx.ranged ? 1.5 : 2.5;
    ctx.beginPath();
    if (fx.ranged) {
      ctx.moveTo(fx.x1, fx.y1);
      ctx.lineTo(fx.x2, fx.y2);
    } else {
      ctx.arc(fx.x2, fx.y2, 8, 0, Math.PI * 2);
    }
    ctx.stroke();
    ctx.globalAlpha = 1;
  }
}

/* ------------------------- HUD / DOM-UI ------------------------------ */

const elCrystals = document.getElementById("crystals");
const elIncome = document.getElementById("income");
const elHpP = document.getElementById("hp-player");
const elHpE = document.getElementById("hp-enemy");
const shopEl = document.getElementById("shop");
const btnCollector = document.getElementById("btn-collector");
const hintEl = document.getElementById("hint");

function buildShop() {
  shopEl.innerHTML = "";
  for (const key of UNIT_ORDER) {
    const t = UNIT_TYPES[key];
    const b = document.createElement("button");
    b.className = "card";
    b.dataset.type = key;
    b.title = t.desc;
    b.innerHTML = `<span class="card-icon">${t.icon}</span><span class="card-name">${t.name}</span><span class="card-cost">💎 ${t.cost}</span>`;
    b.addEventListener("click", () => {
      if (state.selectedType === key) state.selectedType = null;
      else state.selectedType = key;
      updateHud();
    });
    shopEl.appendChild(b);
  }
}

btnCollector.addEventListener("click", () => {
  if (state.gameOver) return;
  const cost = collectorCost();
  if (state.collectors < CONFIG.collectorMax && state.crystals >= cost) {
    state.crystals -= cost;
    state.collectors++;
    updateHud();
  }
});

function updateHud() {
  elCrystals.textContent = Math.floor(state.crystals);
  const inc = CONFIG.baseIncome + CONFIG.collectorIncome * state.collectors
    + CONFIG.towerIncome * ownedTowers("player");
  elIncome.textContent = "+" + inc + "/s";
  elHpP.textContent = Math.max(0, Math.ceil(state.playerBaseHp));
  elHpE.textContent = Math.max(0, Math.ceil(state.enemyBaseHp));

  for (const b of shopEl.children) {
    const t = UNIT_TYPES[b.dataset.type];
    b.classList.toggle("selected", state.selectedType === b.dataset.type);
    b.classList.toggle("disabled", state.crystals < t.cost);
  }
  if (state.collectors >= CONFIG.collectorMax) {
    btnCollector.textContent = "⛏️ Sammler (max)";
    btnCollector.classList.add("disabled");
  } else {
    btnCollector.textContent = `⛏️ Sammler bauen – 💎 ${collectorCost()} (+${CONFIG.collectorIncome}/s) · ${state.collectors}/${CONFIG.collectorMax}`;
    btnCollector.classList.toggle("disabled", state.crystals < collectorCost());
  }
  hintEl.textContent = state.selectedType
    ? `${UNIT_TYPES[state.selectedType].icon} ${UNIT_TYPES[state.selectedType].name} gewählt – tippe auf eine Bahn zum Aufstellen (nochmal antippen = abwählen).`
    : "Einheit unten wählen, dann auf eine der drei Bahnen tippen. Wachtürme erobern lohnt sich: sie schießen für dich und bringen +1 💎/s.";
}

/* ------------------------- Eingabe ----------------------------------- */

function canvasPos(e) {
  const r = canvas.getBoundingClientRect();
  return {
    x: (e.clientX - r.left) * (CONFIG.width / r.width),
    y: (e.clientY - r.top) * (CONFIG.height / r.height)
  };
}

function laneAt(y) {
  let best = -1, bestD = Infinity;
  for (let i = 0; i < 3; i++) {
    const d = Math.abs(y - CONFIG.laneYs[i]);
    if (d < bestD) { bestD = d; best = i; }
  }
  return bestD <= CONFIG.laneTapRadius ? best : -1;
}

canvas.addEventListener("pointermove", e => {
  const p = canvasPos(e);
  state.hoverLane = laneAt(p.y);
});

canvas.addEventListener("click", e => {
  if (state.gameOver || !state.selectedType) return;
  const p = canvasPos(e);
  const lane = laneAt(p.y);
  if (lane < 0) return;
  const t = UNIT_TYPES[state.selectedType];
  if (state.crystals >= t.cost) {
    state.crystals -= t.cost;
    spawnUnit("player", state.selectedType, lane);
    updateHud();
  }
});

window.addEventListener("keydown", e => {
  if (e.key === "Escape") { state.selectedType = null; updateHud(); }
  const n = parseInt(e.key, 10);
  if (n >= 1 && n <= UNIT_ORDER.length) {
    state.selectedType = state.selectedType === UNIT_ORDER[n - 1] ? null : UNIT_ORDER[n - 1];
    updateHud();
  }
});

/* ------------------------- Tempo ------------------------------------- */

document.querySelectorAll(".speed-btn").forEach(b => {
  b.addEventListener("click", () => {
    state.speed = parseInt(b.dataset.speed, 10);
    document.querySelectorAll(".speed-btn").forEach(x =>
      x.classList.toggle("active", x === b));
  });
});

/* ------------------------- Menü / Overlay ---------------------------- */

const menuEl = document.getElementById("menu");
const overlayEl = document.getElementById("overlay");

function buildMenu() {
  const grid = document.getElementById("diff-grid");
  grid.innerHTML = "";
  const prog = loadProgress();
  for (const key of Object.keys(DIFFICULTIES)) {
    const d = DIFFICULTIES[key];
    const b = document.createElement("button");
    b.className = "diff-tile";
    const wins = prog.wins[key] || 0;
    b.innerHTML = `<b>${d.name}</b><span>${wins > 0 ? "🏆 " + wins + "× gewonnen" : "noch nicht bezwungen"}</span>`;
    b.addEventListener("click", () => startGame(key));
    grid.appendChild(b);
  }
}

function showMenu() {
  if (state) state.gameOver = true;
  buildMenu();
  overlayEl.classList.add("hidden");
  menuEl.classList.remove("hidden");
}

function startGame(diffKey) {
  resetState(diffKey);
  state.gameOver = false;
  document.getElementById("diff-name").textContent = "– " + DIFFICULTIES[diffKey].name;
  menuEl.classList.add("hidden");
  overlayEl.classList.add("hidden");
  updateHud();
}

function endGame(won) {
  if (state.gameOver) return;
  state.gameOver = true;
  if (won) {
    const prog = loadProgress();
    prog.wins[state.difficulty] = (prog.wins[state.difficulty] || 0) + 1;
    saveProgress(prog);
  }
  document.getElementById("overlay-title").textContent = won ? "🏆 Sieg!" : "💥 Niederlage";
  document.getElementById("overlay-text").textContent = won
    ? `Die gegnerische Festung ist gefallen (${DIFFICULTIES[state.difficulty].name}, ${Math.floor(state.time)} s).`
    : "Deine Festung wurde zerstört. Versuch es mit mehr Wirtschaft – oder besseren Kontern.";
  overlayEl.classList.remove("hidden");
}

document.getElementById("btn-restart").addEventListener("click", () => startGame(state.difficulty));
document.getElementById("btn-menu").addEventListener("click", showMenu);

/* ------------------------- Hauptschleife ----------------------------- */

let lastTime = performance.now();

function loop(now) {
  const dt = Math.min(0.05, (now - lastTime) / 1000);
  lastTime = now;
  if (!state.gameOver) {
    for (let i = 0; i < state.speed; i++) update(dt);
    updateHud();
  }
  render();
  requestAnimationFrame(loop);
}

/* ------------------------- Boot -------------------------------------- */

resetState("mittel");
buildShop();
updateHud();
showMenu();
requestAnimationFrame(loop);

if ("serviceWorker" in navigator && location.protocol.startsWith("http")) {
  navigator.serviceWorker.register("../../sw.js").catch(function () { });
}
