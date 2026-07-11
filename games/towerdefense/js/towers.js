// Turm- und Projektil-Logik

class Tower {
  constructor(typeKey, col, row) {
    this.type = typeKey;
    this.col = col;
    this.row = row;
    this.x = col * CONFIG.tileSize + CONFIG.tileSize / 2;
    this.y = row * CONFIG.tileSize + CONFIG.tileSize / 2;
    this.level = 0;
    this.cooldown = 0;
    this.buffMult = 1; // wird pro Frame von Verstärker-Türmen gesetzt
    this.invested = TOWER_TYPES[typeKey].cost; // für Verkaufswert
  }

  get isBooster() { return this.stats.buff !== undefined; }

  get def() { return TOWER_TYPES[this.type]; }
  get stats() { return this.def.levels[this.level]; }
  get maxLevel() { return this.level >= this.def.levels.length - 1; }
  get upgradeCost() {
    return this.maxLevel ? null : this.def.levels[this.level + 1].upgradeCost;
  }
  get sellValue() { return Math.floor(this.invested * 0.5); }

  upgrade() {
    this.invested += this.upgradeCost;
    this.level++;
  }

  update(dt, enemies, projectiles) {
    if (this.isBooster) return;
    this.cooldown -= dt;
    if (this.cooldown > 0) return;

    // Ziel: vorderster Gegner in Reichweite
    let target = null;
    let best = -Infinity;
    for (const e of enemies) {
      if (e.dead || e.reachedEnd) continue;
      const d = Math.hypot(e.x - this.x, e.y - this.y);
      if (d <= this.stats.range) {
        const p = e.progress();
        if (p > best) { best = p; target = e; }
      }
    }
    if (!target) return;

    projectiles.push(new Projectile(this, target));
    this.cooldown = this.stats.fireRate;
  }

  draw(ctx, isSelected) {
    const s = CONFIG.tileSize;
    const px = this.col * s;
    const py = this.row * s;

    // Reichweite bei Auswahl
    if (isSelected) {
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.stats.range, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(255,255,255,.06)";
      ctx.fill();
      ctx.strokeStyle = "rgba(255,255,255,.3)";
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    // Sockel
    ctx.fillStyle = "#3a4155";
    ctx.fillRect(px + 4, py + 4, s - 8, s - 8);

    // Turmkörper
    ctx.beginPath();
    ctx.arc(this.x, this.y, s / 2 - 8, 0, Math.PI * 2);
    ctx.fillStyle = this.def.color;
    ctx.fill();
    ctx.strokeStyle = "rgba(0,0,0,.4)";
    ctx.lineWidth = 2;
    ctx.stroke();

    // Verstärker: dezente Aura anzeigen
    if (this.isBooster) {
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.stats.range, 0, Math.PI * 2);
      ctx.strokeStyle = "rgba(224,208,90,.25)";
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.fillStyle = "#3a3410";
      ctx.font = "13px sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("⚡", this.x, this.y);
    }

    // Level-Punkte
    ctx.fillStyle = "#ffd75e";
    for (let i = 0; i <= this.level; i++) {
      ctx.beginPath();
      ctx.arc(px + 9 + i * 8, py + s - 8, 2.5, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

class Projectile {
  constructor(tower, target) {
    this.x = tower.x;
    this.y = tower.y;
    this.target = target;
    this.stats = tower.stats;
    this.damage = Math.round(tower.stats.damage * tower.buffMult);
    this.proj = tower.def.projectile;
    this.done = false;
  }

  update(dt, enemies, effects) {
    if (this.target.dead || this.target.reachedEnd) {
      this.done = true;
      return;
    }
    const dx = this.target.x - this.x;
    const dy = this.target.y - this.y;
    const dist = Math.hypot(dx, dy);
    const step = this.proj.speed * dt;

    if (dist <= step) {
      this.hit(enemies, effects);
      this.done = true;
    } else {
      this.x += (dx / dist) * step;
      this.y += (dy / dist) * step;
    }
  }

  hit(enemies, effects) {
    if (this.stats.splash) {
      // Flächenschaden
      for (const e of enemies) {
        if (e.dead || e.reachedEnd) continue;
        if (Math.hypot(e.x - this.target.x, e.y - this.target.y) <= this.stats.splash) {
          e.takeDamage(this.damage);
        }
      }
      effects.push(new Explosion(this.target.x, this.target.y, this.stats.splash));
    } else {
      this.target.takeDamage(this.damage);
    }
    if (this.stats.slow) {
      this.target.applySlow(this.stats.slow, this.stats.slowDuration);
    }
  }

  draw(ctx) {
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.proj.size, 0, Math.PI * 2);
    ctx.fillStyle = this.proj.color;
    ctx.fill();
  }
}

class Explosion {
  constructor(x, y, radius) {
    this.x = x;
    this.y = y;
    this.radius = radius;
    this.life = 0.3;
    this.t = 0;
  }
  update(dt) { this.t += dt; }
  get done() { return this.t >= this.life; }
  draw(ctx) {
    const p = this.t / this.life;
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.radius * p, 0, Math.PI * 2);
    ctx.strokeStyle = `rgba(255,180,70,${1 - p})`;
    ctx.lineWidth = 3;
    ctx.stroke();
  }
}
