"use strict";

/* ======================================================================
   KRISTALLKRIEG – Einheiten & Wachtürme
   Einheiten laufen ihre Lane entlang, greifen automatisch an und
   respektieren das Konter-Dreieck. Türme werden per Präsenz erobert.
   ====================================================================== */

let unitIdSeq = 1;

function makeUnit(owner, typeKey, lane) {
  const t = UNIT_TYPES[typeKey];
  const dir = owner === "player" ? 1 : -1;
  return {
    id: unitIdSeq++,
    owner, type: typeKey, lane, dir,
    x: owner === "player" ? CONFIG.playerSpawnX : CONFIG.enemySpawnX,
    yOff: (Math.random() * 2 - 1) * 16,   // leichte Streuung, damit nichts exakt stapelt
    hp: t.hp, maxHp: t.hp,
    cooldown: Math.random() * 0.3,
    dead: false
  };
}

function unitY(u) { return CONFIG.laneYs[u.lane] + u.yOff; }

/* Schadensmultiplikator von Angreifer-Typ gegen Ziel-Typ */
function counterMult(attackerType, targetType) {
  const c = UNIT_TYPES[attackerType].counters;
  return (c && c[targetType]) || 1;
}

/* Nächste angreifbare gegnerische Einheit in derselben Lane, vor der Einheit */
function findTarget(u, units) {
  const t = UNIT_TYPES[u.type];
  let best = null, bestDist = Infinity;
  for (const o of units) {
    if (o.dead || o.owner === u.owner || o.lane !== u.lane) continue;
    const ahead = (o.x - u.x) * u.dir;
    if (ahead < -14) continue;              // hinter uns: ignorieren
    const d = Math.abs(o.x - u.x);
    if (d <= t.range + 6 && d < bestDist) { best = o; bestDist = d; }
  }
  return best;
}

/* Blockiert eine eigene Einheit direkt vor uns den Weg? */
function isBlocked(u, units) {
  for (const o of units) {
    if (o === u || o.dead || o.owner !== u.owner || o.lane !== u.lane) continue;
    const gap = (o.x - u.x) * u.dir;
    if (gap > 0 && gap < CONFIG.unitSpacing) return true;
  }
  return false;
}

function updateUnit(u, dt, state) {
  const t = UNIT_TYPES[u.type];
  u.cooldown = Math.max(0, u.cooldown - dt);

  /* Heiler: bewegt sich mit, heilt alle verwundeten Verbündeten in Reichweite */
  if (t.heal) {
    for (const o of state.units) {
      if (o.dead || o.owner !== u.owner || o === u) continue;
      if (o.hp < o.maxHp && Math.abs(o.x - u.x) <= t.range && o.lane === u.lane) {
        o.hp = Math.min(o.maxHp, o.hp + t.heal * dt);
      }
    }
    if (!isBlocked(u, state.units)) u.x += u.dir * t.speed * dt;
    return;
  }

  /* Ziel suchen: Einheit, sonst Basis in Reichweite */
  const target = findTarget(u, state.units);
  const baseEdge = u.owner === "player" ? CONFIG.enemyBaseEdge : CONFIG.playerBaseEdge;
  const baseDist = (baseEdge - u.x) * u.dir;
  const baseInRange = baseDist <= t.range;

  if (target) {
    if (u.cooldown <= 0) {
      u.cooldown = t.atkInterval;
      let dmg = t.dmg * counterMult(u.type, target.type);
      if (t.vsUnit) dmg *= t.vsUnit;
      target.hp -= dmg;
      addHitEffect(state, u, target.x, unitY(target));
      if (target.hp <= 0) target.dead = true;
    }
  } else if (baseInRange) {
    if (u.cooldown <= 0) {
      u.cooldown = t.atkInterval;
      let dmg = t.dmg * (t.vsBase || 1);
      if (u.owner === "player") state.enemyBaseHp -= dmg;
      else state.playerBaseHp -= dmg;
      addHitEffect(state, u, baseEdge, unitY(u));
    }
  } else if (!isBlocked(u, state.units)) {
    u.x += u.dir * t.speed * dt;
  }
}

function addHitEffect(state, u, tx, ty) {
  const ranged = UNIT_TYPES[u.type].range > 40;
  state.effects.push({
    x1: u.x, y1: unitY(u), x2: tx, y2: ty,
    t: ranged ? 0.18 : 0.12, max: ranged ? 0.18 : 0.12,
    color: u.owner === "player" ? "#5ad0c0" : "#ff7a6b",
    ranged
  });
}

/* Beide Festungen schießen selbst auf den nächsten Angreifer in Reichweite –
   bremst Early-Rushes und gibt dem Verteidiger Comeback-Potenzial. */
function updateBaseGuns(dt, state) {
  state.playerGunCd = Math.max(0, (state.playerGunCd || 0) - dt);
  state.enemyGunCd = Math.max(0, (state.enemyGunCd || 0) - dt);
  for (const side of ["player", "enemy"]) {
    const cdKey = side === "player" ? "playerGunCd" : "enemyGunCd";
    if (state[cdKey] > 0) continue;
    const edge = side === "player" ? CONFIG.playerBaseEdge : CONFIG.enemyBaseEdge;
    let best = null, bestDist = Infinity;
    for (const u of state.units) {
      if (u.dead || u.owner === side) continue;
      const d = Math.abs(u.x - edge);
      if (d <= CONFIG.baseGunRange && d < bestDist) { best = u; bestDist = d; }
    }
    if (best) {
      state[cdKey] = CONFIG.baseGunInterval;
      best.hp -= CONFIG.baseGunDmg;
      if (best.hp <= 0) best.dead = true;
      state.effects.push({
        x1: edge, y1: CONFIG.height / 2 - 60, x2: best.x, y2: unitY(best),
        t: 0.15, max: 0.15,
        color: side === "player" ? "#5ad0c0" : "#ff7a6b", ranged: true
      });
    }
  }
}

/* ---------------------------------------------------------------------
   Wachtürme: neutral -> per Einheiten-Präsenz aufladen -> erobert.
   Ein fremder Besitzer/fremde Ladung muss erst abgebaut werden.
   Eigene Türme schießen auf Gegner und bringen +1 Kristall/s.
   --------------------------------------------------------------------- */

function makeTower(lane) {
  return {
    lane, x: CONFIG.towerX, y: CONFIG.laneYs[lane],
    owner: "neutral",
    charge: 0, chargeOwner: null,
    cooldown: 0
  };
}

function updateTower(tw, dt, state) {
  let nPlayer = 0, nEnemy = 0;
  for (const u of state.units) {
    if (u.dead || u.lane !== tw.lane) continue;
    if (Math.abs(u.x - tw.x) <= CONFIG.towerCaptureRadius) {
      if (u.owner === "player") nPlayer++; else nEnemy++;
    }
  }

  /* Eroberung: nur wenn genau eine Seite präsent ist */
  const side = nPlayer > 0 && nEnemy === 0 ? "player"
             : nEnemy > 0 && nPlayer === 0 ? "enemy" : null;
  if (side && side !== tw.owner) {
    const rate = CONFIG.towerCaptureRate * Math.min(side === "player" ? nPlayer : nEnemy, 3) * dt;
    if (tw.chargeOwner && tw.chargeOwner !== side) {
      tw.charge -= rate;                       // fremde Ladung erst abbauen
      if (tw.charge <= 0) { tw.charge = 0; tw.chargeOwner = null; }
    } else if (tw.owner !== "neutral") {
      tw.chargeOwner = side;
      tw.charge += rate;                       // besetzten Turm neutralisieren
      if (tw.charge >= CONFIG.towerCaptureNeed) {
        tw.owner = "neutral"; tw.charge = 0; tw.chargeOwner = null;
      }
    } else {
      tw.chargeOwner = side;
      tw.charge += rate;
      if (tw.charge >= CONFIG.towerCaptureNeed) {
        tw.owner = side; tw.charge = 0; tw.chargeOwner = null;
      }
    }
  }

  /* Schießen */
  if (tw.owner === "neutral") return;
  tw.cooldown = Math.max(0, tw.cooldown - dt);
  if (tw.cooldown > 0) return;
  let best = null, bestDist = Infinity;
  for (const u of state.units) {
    if (u.dead || u.owner === tw.owner) continue;
    const d = Math.hypot(u.x - tw.x, unitY(u) - tw.y);
    if (d <= CONFIG.towerRange && d < bestDist) { best = u; bestDist = d; }
  }
  if (best) {
    tw.cooldown = CONFIG.towerAtkInterval;
    best.hp -= CONFIG.towerDmg;
    if (best.hp <= 0) best.dead = true;
    state.effects.push({
      x1: tw.x, y1: tw.y - 20, x2: best.x, y2: unitY(best),
      t: 0.15, max: 0.15,
      color: tw.owner === "player" ? "#5ad0c0" : "#ff7a6b", ranged: true
    });
  }
}
