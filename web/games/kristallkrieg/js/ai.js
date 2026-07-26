"use strict";

/* ======================================================================
   KRISTALLKRIEG – Gegner-KI
   Tick-basiert: baut früh Wirtschaft auf, kontert danach die
   dominante Spielereinheit auf der bedrohtesten Lane – je nach
   Schwierigkeit mehr oder weniger treffsicher.
   ====================================================================== */

const COUNTERED_BY = { sword: "lancer", archer: "sword", lancer: "archer" };

function aiThink(dt, state) {
  const diff = DIFFICULTIES[state.difficulty];
  state.aiTimer -= dt;
  if (state.aiTimer > 0) return;
  state.aiTimer = diff.interval * (0.7 + Math.random() * 0.6);

  /* Lagebild pro Lane: Spielerdruck und eigene Präsenz */
  const pressure = [0, 0, 0], own = [0, 0, 0];
  const typeCount = { sword: 0, archer: 0, lancer: 0, healer: 0, siege: 0 };
  let playerUnits = 0;
  for (const u of state.units) {
    if (u.dead) continue;
    if (u.owner === "player") {
      pressure[u.lane] += UNIT_TYPES[u.type].cost;
      typeCount[u.type]++;
      playerUnits++;
    } else {
      own[u.lane] += UNIT_TYPES[u.type].cost;
    }
  }

  /* 1) Wirtschaft: früh Sammler bauen, solange kein akuter Druck herrscht */
  const collCost = CONFIG.collectorBaseCost + CONFIG.collectorCostStep * state.aiCollectors;
  const threatened = pressure[0] + pressure[1] + pressure[2] > own[0] + own[1] + own[2] + 60;
  if (state.aiCollectors < diff.ecoTarget && state.aiCrystals >= collCost && !threatened) {
    state.aiCrystals -= collCost;
    state.aiCollectors++;
    return;
  }

  /* 2) Lane wählen: bedrohteste Lane verteidigen, sonst schwächste Spieler-Lane pushen */
  let lane;
  const deficit = pressure.map((p, i) => p - own[i]);
  const maxDef = Math.max(...deficit);
  if (maxDef > 0 && Math.random() < diff.smart) {
    lane = deficit.indexOf(maxDef);
  } else {
    const minP = Math.min(...pressure);
    const open = [0, 1, 2].filter(i => pressure[i] === minP);
    lane = open[Math.floor(Math.random() * open.length)];
  }

  /* 3) Einheit wählen */
  let typeKey = null;
  if (Math.random() < diff.smart) {
    // dominanten Spielertyp kontern
    let domType = null, domN = 0;
    for (const k of ["sword", "archer", "lancer"]) {
      if (typeCount[k] > domN) { domN = typeCount[k]; domType = k; }
    }
    if (domType && domN > 0) typeKey = COUNTERED_BY[domType];
  }
  if (!typeKey) {
    const pool = ["sword", "sword", "archer", "lancer"];
    typeKey = pool[Math.floor(Math.random() * pool.length)];
  }
  // gelegentlich Support/Belagerung, wenn genug Geld da ist
  if (state.aiCrystals > 130 && Math.random() < 0.25) typeKey = "siege";
  else if (state.aiCrystals > 100 && Math.random() < 0.2) typeKey = "healer";

  const cost = UNIT_TYPES[typeKey].cost;
  if (state.aiCrystals >= cost) {
    state.aiCrystals -= cost;
    spawnUnit("enemy", typeKey, lane);
  }
}
