package de.schlecht.towerdefense

import kotlin.math.PI
import kotlin.math.atan2
import kotlin.math.hypot
import kotlin.math.max
import kotlin.math.min
import kotlin.math.roundToInt

// ---- Pixel-Wegpunkte (Mitte der Kacheln) ----
data class PointF2(val x: Float, val y: Float)

private fun computePathPixels(waypoints: List<Pair<Int, Int>>) = waypoints.map { (c, r) ->
    PointF2(c * Config.TILE + Config.TILE / 2, r * Config.TILE + Config.TILE / 2)
}

// Pfad-Kacheln (blockiert fürs Bauen)
private fun buildPathTiles(waypoints: List<Pair<Int, Int>>): Set<Pair<Int, Int>> = buildSet {
    for (i in 0 until waypoints.size - 1) {
        var (c1, r1) = waypoints[i]
        val (c2, r2) = waypoints[i + 1]
        val dc = Integer.signum(c2 - c1)
        val dr = Integer.signum(r2 - r1)
        add(c1 to r1)
        while (c1 != c2 || r1 != r2) {
            c1 += dc; r1 += dr
            add(c1 to r1)
        }
    }
}

class Enemy(val type: String, wave: Wave, private val engine: GameEngine) {
    private val def = ENEMY_TYPES.getValue(type)
    private val path = engine.pathPixels
    val maxHp = (def.hp * wave.hpScale).roundToInt().toFloat()
    var hp = maxHp
    val speed = def.speed * wave.speedScale
    val gold = (def.gold * wave.goldScale).roundToInt()
    val color = def.color
    val size = def.size

    var waypointIndex = 1
    var x = path[0].x
    var y = path[0].y
    var dead = false
    var reachedEnd = false
    var slowFactor = 1f
    var slowTimer = 0f
    var stunTimer = 0f
    var stunImmuneTimer = 0f // nach einer Betäubung kurz immun (Tuning.stunImmunity)

    fun applySlow(factor: Float, duration: Float) {
        slowFactor = min(slowFactor, 1f - factor)
        slowTimer = max(slowTimer, duration)
    }

    fun applyStun(duration: Float) {
        // bereits betäubt oder noch immun: wirkungslos (keine Dauer-Stun-Ketten)
        if (stunTimer > 0 || stunImmuneTimer > 0) return
        stunTimer = duration
    }

    fun takeDamage(dmg: Float) {
        engine.damageDealt += min(max(hp, 0f), dmg)
        hp -= dmg
        if (hp <= 0) dead = true
    }

    fun update(dt: Float) {
        if (slowTimer > 0) {
            slowTimer -= dt
            if (slowTimer <= 0) slowFactor = 1f
        }
        if (stunImmuneTimer > 0) stunImmuneTimer -= dt
        if (stunTimer > 0) {
            stunTimer -= dt
            if (stunTimer <= 0) stunImmuneTimer = Tuning.stunImmunity
            return // betäubt: steht still
        }

        var remaining = speed * slowFactor * dt
        while (remaining > 0 && waypointIndex < path.size) {
            val wp = path[waypointIndex]
            val dx = wp.x - x
            val dy = wp.y - y
            val dist = hypot(dx, dy)
            if (dist <= remaining) {
                x = wp.x; y = wp.y
                waypointIndex++
                remaining -= dist
            } else {
                x += dx / dist * remaining
                y += dy / dist * remaining
                remaining = 0f
            }
        }
        if (waypointIndex >= path.size) reachedEnd = true
    }

    // Fortschritt entlang des Pfads – für Zielpriorität "vorderster Gegner"
    fun progress(): Float {
        val wp = path[min(waypointIndex, path.size - 1)]
        return waypointIndex * 10000f - hypot(wp.x - x, wp.y - y)
    }
}

class Tower(val type: String, val col: Int, val row: Int) {
    val def = towerType(type)
    val x = col * Config.TILE + Config.TILE / 2
    val y = row * Config.TILE + Config.TILE / 2
    var level = 0
    var cooldown = 0f
    var buffMult = 1f  // wird pro Frame von Verstärker-Türmen gesetzt
    var rateMult = 1f  // wird pro Frame von Taktgeber-Türmen gesetzt
    var shots = 0      // für kritische Treffer (Scharfschütze)
    var invested = def.cost
    /** Richtung, in die der Turmaufsatz zeigt (Radiant, 0 = rechts). */
    var aimAngle = (-PI / 2).toFloat()

    val stats get() = def.levels[level]
    val isBooster get() = stats.buff != null || stats.rateBuff != null
    val maxLevel get() = level >= def.levels.size - 1
    val upgradeCost get() = if (maxLevel) 0 else def.levels[level + 1].upgradeCost
    val sellValue get() = invested / 2

    fun upgrade() {
        invested += upgradeCost
        level++
    }

    fun update(dt: Float, enemies: List<Enemy>, projectiles: MutableList<Projectile>) {
        if (isBooster) return
        cooldown -= dt

        // Ziel auch während des Nachladens suchen, damit sich der Aufsatz mitdreht
        var target: Enemy? = null
        var best = Float.NEGATIVE_INFINITY
        for (e in enemies) {
            if (e.dead || e.reachedEnd) continue
            if (hypot(e.x - x, e.y - y) <= stats.range) {
                val p = e.progress()
                if (p > best) { best = p; target = e }
            }
        }
        val t = target ?: return
        aimAngle = atan2(t.y - y, t.x - x)
        if (cooldown > 0) return

        // Kritische Treffer: jeder critEvery-te Schuss macht critMult-fachen Schaden
        shots++
        val crit = stats.critEvery > 0 && shots % stats.critEvery == 0
        val dmgMult = if (crit) stats.critMult else 1f

        if (stats.targets <= 1) {
            projectiles.add(Projectile(this, t, dmgMult))
        } else {
            // Mehrfachschuss: vorderste Gegner in Reichweite
            val inRange = enemies.filter {
                !it.dead && !it.reachedEnd && hypot(it.x - x, it.y - y) <= stats.range
            }.sortedByDescending { it.progress() }
            for (e in inRange.take(stats.targets)) projectiles.add(Projectile(this, e, dmgMult))
        }
        cooldown = stats.fireRate / rateMult
    }
}

class Projectile(tower: Tower, val target: Enemy, dmgMult: Float = 1f) {
    var x = tower.x
    var y = tower.y
    val stats = tower.stats
    val damage = (tower.stats.damage * tower.buffMult * dmgMult * Tuning.towerDmgMul).roundToInt().toFloat()
    val crit = dmgMult > 1f
    val proj = tower.def.projectile!!
    var done = false

    fun update(dt: Float, enemies: List<Enemy>, effects: MutableList<Explosion>) {
        if (target.dead || target.reachedEnd) { done = true; return }
        val dx = target.x - x
        val dy = target.y - y
        val dist = hypot(dx, dy)
        val step = proj.speed * dt
        if (dist <= step) {
            hit(enemies, effects)
            done = true
        } else {
            x += dx / dist * step
            y += dy / dist * step
        }
    }

    private fun hit(enemies: List<Enemy>, effects: MutableList<Explosion>) {
        val splash = stats.splash
        if (splash != null) {
            // Flächenwirkung: Schaden + ggf. Slow (Frostbombe) / Betäubung an alle im Radius
            for (e in enemies) {
                if (e.dead || e.reachedEnd) continue
                if (hypot(e.x - target.x, e.y - target.y) <= splash) {
                    e.takeDamage(damage)
                    stats.slow?.let { e.applySlow(it, stats.slowDuration) }
                    if (stats.stun > 0) e.applyStun(stats.stun)
                }
            }
            effects.add(Explosion(target.x, target.y, splash))
        } else {
            target.takeDamage(damage)
            stats.slow?.let { target.applySlow(it, stats.slowDuration) }
            if (stats.stun > 0) target.applyStun(stats.stun)
        }
    }
}

class Explosion(val x: Float, val y: Float, val radius: Float) {
    val life = 0.3f
    var t = 0f
    fun update(dt: Float) { t += dt }
    val done get() = t >= life
}

class WaveSpawner(waveNumber: Int, private val engine: GameEngine) {
    data class Entry(val time: Float, val type: String)

    val wave = buildWave(waveNumber, engine.level.hpMul)
    val queue: List<Entry>
    var elapsed = 0f
    var index = 0

    init {
        val q = mutableListOf<Entry>()
        var t = 0f
        for (g in wave.groups) {
            repeat(g.count) {
                q.add(Entry(t, g.type))
                t += g.interval
            }
            t += 1.5f // Pause zwischen Gruppen
        }
        queue = q.sortedBy { it.time }
    }

    fun update(dt: Float, enemies: MutableList<Enemy>) {
        elapsed += dt
        while (index < queue.size && queue[index].time <= elapsed) {
            enemies.add(Enemy(queue[index].type, wave, engine))
            index++
        }
    }

    val finished get() = index >= queue.size
}

// Hält die Engine über Activity-Neustarts (Bildschirmdrehung) hinweg am Leben
object GameHolder {
    val engine = GameEngine()
}

// ---- Spiel-Engine: kompletter Zustand + Simulation ----
class GameEngine {
    var levelIndex = 0
        private set
    var level: LevelDef = LEVELS[0]
        private set
    var pathPixels: List<PointF2> = computePathPixels(level.waypoints)
        private set
    var pathTiles: Set<Pair<Int, Int>> = buildPathTiles(level.waypoints)
        private set

    var gold = 0
    var lives = 0
    var wave = 0
    var kills = 0
    val enemies = mutableListOf<Enemy>()
    val towers = mutableListOf<Tower>()
    val projectiles = mutableListOf<Projectile>()
    val effects = mutableListOf<Explosion>()
    var spawner: WaveSpawner? = null
    var placingType: String? = null
    var tool: String? = null // "upgrade" | "sell" | null – Antipp-Werkzeug
    var selectedTower: Tower? = null
    var speed = 1
    var autoWave = false
    var damageDealt = 0f
    var gameOver = false
    var victory = false
    var inMenu = true // Levelauswahl offen → Simulation pausiert

    val totalWaves get() = level.waves

    // UI muss aktualisiert werden (Gold/Leben/Welle geändert)
    var dirty = true

    init {
        reset()
    }

    /** Level laden und Spielzustand zurücksetzen (auch für Neustart des aktuellen Levels). */
    fun loadLevel(index: Int) {
        levelIndex = index
        level = LEVELS[index]
        pathPixels = computePathPixels(level.waypoints)
        pathTiles = buildPathTiles(level.waypoints)
        reset()
        inMenu = false
    }

    fun reset() {
        gold = level.startGold + Tuning.startGoldBonus.roundToInt()
        lives = level.startLives
        wave = 0; kills = 0
        enemies.clear(); towers.clear(); projectiles.clear(); effects.clear()
        spawner = null; placingType = null; tool = null; selectedTower = null
        speed = 1; autoWave = false
        damageDealt = 0f; gameOver = false; victory = false
        dirty = true
    }

    val waveActive: Boolean
        get() = spawner.let { it != null && (!it.finished || enemies.isNotEmpty()) }

    fun canBuild(col: Int, row: Int): Boolean {
        if (col < 0 || row < 0 || col >= Config.COLS || row >= Config.ROWS) return false
        if ((col to row) in pathTiles) return false
        return towers.none { it.col == col && it.row == row }
    }

    fun towerAt(col: Int, row: Int) = towers.firstOrNull { it.col == col && it.row == row }

    fun tryPlace(col: Int, row: Int): Boolean {
        val key = placingType ?: return false
        val cost = towerType(key).cost
        if (!canBuild(col, row) || gold < cost) return false
        gold -= cost
        towers.add(Tower(key, col, row))
        if (gold < cost) placingType = null
        dirty = true
        return true
    }

    /** Antipp-Werkzeug (Upgrade/Verkauf) auf die Kachel anwenden. */
    fun applyTool(col: Int, row: Int) {
        val tw = towerAt(col, row) ?: return
        when (tool) {
            "upgrade" -> tryUpgrade(tw)
            "sell" -> sell(tw)
        }
    }

    fun tryUpgrade(t: Tower): Boolean {
        if (t.maxLevel || gold < t.upgradeCost) return false
        gold -= t.upgradeCost
        t.upgrade()
        dirty = true
        return true
    }

    fun sell(t: Tower) {
        gold += t.sellValue
        towers.remove(t)
        if (selectedTower === t) selectedTower = null
        dirty = true
    }

    fun startNextWave() {
        if (gameOver || spawner != null || wave >= totalWaves) return
        wave++
        spawner = WaveSpawner(wave, this)
        dirty = true
    }

    fun update(dt: Float) {
        if (inMenu || gameOver) return

        spawner?.update(dt, enemies)
        for (e in enemies) e.update(dt)

        // Verstärker-/Taktgeber-Buffs (je Buff-Art gewinnt der stärkste, stapelt nicht)
        for (t in towers) { t.buffMult = 1f; t.rateMult = 1f }
        for (b in towers) {
            if (!b.isBooster) continue
            for (t in towers) {
                if (t.isBooster) continue
                if (hypot(t.x - b.x, t.y - b.y) <= b.stats.range) {
                    b.stats.buff?.let { t.buffMult = max(t.buffMult, 1f + it) }
                    b.stats.rateBuff?.let { t.rateMult = max(t.rateMult, 1f + it) }
                }
            }
        }

        for (t in towers) t.update(dt, enemies, projectiles)
        for (p in projectiles) p.update(dt, enemies, effects)
        for (fx in effects) fx.update(dt)

        // Tote / durchgekommene Gegner
        val it = enemies.iterator()
        while (it.hasNext()) {
            val e = it.next()
            if (e.dead) {
                gold += e.gold; kills++; dirty = true
                it.remove()
            } else if (e.reachedEnd) {
                lives--; dirty = true
                it.remove()
            }
        }
        projectiles.removeAll { it.done }
        effects.removeAll { it.done }

        // Welle geschafft?
        val sp = spawner
        if (sp != null && sp.finished && enemies.isEmpty()) {
            gold += Tuning.waveBonusBase.roundToInt() + wave * 3
            spawner = null
            dirty = true
            if (wave >= totalWaves) {
                gameOver = true; victory = true
            } else if (autoWave) {
                startNextWave()
            }
        }

        if (lives <= 0 && !gameOver) {
            lives = 0
            gameOver = true; victory = false
            dirty = true
        }
    }
}
