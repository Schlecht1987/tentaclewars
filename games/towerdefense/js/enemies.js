// Gegner-Logik: Bewegung entlang des Pfads, Schaden, Slow-Effekte

// Pfad in Pixel-Wegpunkte umrechnen (Mitte der Kacheln) – wird pro Level neu gesetzt
let PATH_PIXELS = [];
function computePathPixels(waypoints) {
  PATH_PIXELS = waypoints.map(([c, r]) => ({
    x: c * CONFIG.tileSize + CONFIG.tileSize / 2,
    y: r * CONFIG.tileSize + CONFIG.tileSize / 2,
  }));
}

class Enemy {
  constructor(typeKey, wave) {
    const t = ENEMY_TYPES[typeKey];
    this.type = typeKey;
    this.maxHp = Math.round(t.hp * wave.hpScale);
    this.hp = this.maxHp;
    this.speed = t.speed * wave.speedScale;
    this.gold = Math.round(t.gold * wave.goldScale);
    this.color = t.color;
    this.size = t.size;

    this.waypointIndex = 1;
    this.x = PATH_PIXELS[0].x;
    this.y = PATH_PIXELS[0].y;
    this.dead = false;      // getötet
    this.reachedEnd = false;
    this.slowFactor = 1;
    this.slowTimer = 0;
  }

  applySlow(factor, duration) {
    // stärkster Slow gewinnt, Dauer wird aufgefrischt
    this.slowFactor = Math.min(this.slowFactor, 1 - factor);
    this.slowTimer = Math.max(this.slowTimer, duration);
  }

  takeDamage(dmg) {
    // Statistik: nur tatsächlich abgezogene HP zählen (kein Overkill)
    state.damageDealt += Math.min(Math.max(this.hp, 0), dmg);
    this.hp -= dmg;
    if (this.hp <= 0) this.dead = true;
  }

  update(dt) {
    if (this.slowTimer > 0) {
      this.slowTimer -= dt;
      if (this.slowTimer <= 0) this.slowFactor = 1;
    }

    let remaining = this.speed * this.slowFactor * dt;
    while (remaining > 0 && this.waypointIndex < PATH_PIXELS.length) {
      const wp = PATH_PIXELS[this.waypointIndex];
      const dx = wp.x - this.x;
      const dy = wp.y - this.y;
      const dist = Math.hypot(dx, dy);
      if (dist <= remaining) {
        this.x = wp.x;
        this.y = wp.y;
        this.waypointIndex++;
        remaining -= dist;
      } else {
        this.x += (dx / dist) * remaining;
        this.y += (dy / dist) * remaining;
        remaining = 0;
      }
    }
    if (this.waypointIndex >= PATH_PIXELS.length) this.reachedEnd = true;
  }

  // Fortschritt entlang des Pfads – für Zielpriorität "vorderster Gegner"
  progress() {
    return this.waypointIndex * 10000 - Math.hypot(
      PATH_PIXELS[Math.min(this.waypointIndex, PATH_PIXELS.length - 1)].x - this.x,
      PATH_PIXELS[Math.min(this.waypointIndex, PATH_PIXELS.length - 1)].y - this.y
    );
  }

  draw(ctx) {
    // Körper
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
    ctx.fillStyle = this.color;
    ctx.fill();
    ctx.strokeStyle = "rgba(0,0,0,.4)";
    ctx.lineWidth = 2;
    ctx.stroke();

    // Slow-Anzeige
    if (this.slowTimer > 0) {
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.size + 3, 0, Math.PI * 2);
      ctx.strokeStyle = "rgba(140,220,255,.8)";
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    // HP-Balken
    const w = this.size * 2;
    const ratio = Math.max(0, this.hp / this.maxHp);
    ctx.fillStyle = "rgba(0,0,0,.5)";
    ctx.fillRect(this.x - w / 2, this.y - this.size - 9, w, 4);
    ctx.fillStyle = ratio > 0.5 ? "#6ad06a" : ratio > 0.25 ? "#e0c05a" : "#e05a5a";
    ctx.fillRect(this.x - w / 2, this.y - this.size - 9, w * ratio, 4);
  }
}

// Steuert das Spawnen einer Welle
class WaveSpawner {
  constructor(waveNumber) {
    this.queue = [];
    const wave = buildWave(waveNumber, state.levelDef.hpMul);
    let t = 0;
    for (const g of wave.groups) {
      for (let i = 0; i < g.count; i++) {
        this.queue.push({ time: t, type: g.type });
        t += g.interval;
      }
      t += 1.5; // Pause zwischen Gruppen
    }
    this.queue.sort((a, b) => a.time - b.time);
    this.wave = wave;
    this.elapsed = 0;
    this.index = 0;
  }

  update(dt, enemies) {
    this.elapsed += dt;
    while (this.index < this.queue.length && this.queue[this.index].time <= this.elapsed) {
      enemies.push(new Enemy(this.queue[this.index].type, this.wave));
      this.index++;
    }
  }

  get finished() {
    return this.index >= this.queue.length;
  }
}
