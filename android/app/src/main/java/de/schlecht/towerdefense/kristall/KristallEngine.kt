package de.schlecht.towerdefense.kristall

import kotlin.math.abs
import kotlin.math.hypot
import kotlin.math.max
import kotlin.math.min
import kotlin.random.Random

/* ======================================================================
   KRISTALLKRIEG – Simulation: Einheiten, Wachtürme, Festungen, KI.
   Direkte Portierung der Web-Version.
   ====================================================================== */

class Fighter(val owner: String, val type: String, val lane: Int) {
    val def = kkUnitType(type)
    val dir = if (owner == "player") 1f else -1f
    var x = if (owner == "player") KK.PLAYER_SPAWN_X else KK.ENEMY_SPAWN_X
    val yOff = (Random.nextFloat() * 2 - 1) * 16f // leichte Streuung gegen exaktes Stapeln
    var hp = def.hp
    val maxHp = def.hp
    var cooldown = Random.nextFloat() * 0.3f
    var dead = false

    val y get() = KK.LANE_YS[lane] + yOff
}

class Watchtower(val lane: Int) {
    val x = KK.TOWER_X
    val y = KK.LANE_YS[lane]
    var owner = "neutral"
    var charge = 0f
    var chargeOwner: String? = null
    var cooldown = 0f
}

class HitEffect(
    val x1: Float, val y1: Float, val x2: Float, val y2: Float,
    val max: Float, val color: Int, val ranged: Boolean,
) {
    var t = max
}

class KristallEngine {
    var difficulty = KK_DIFFICULTIES[1]
    var crystals = KK.START_CRYSTALS
    var aiCrystals = KK.START_CRYSTALS
    var collectors = 0
    var aiCollectors = 0
    var playerBaseHp = KK.BASE_HP
    var enemyBaseHp = KK.BASE_HP
    val units = mutableListOf<Fighter>()
    val towers = mutableListOf(Watchtower(0), Watchtower(1), Watchtower(2))
    val effects = mutableListOf<HitEffect>()
    var time = 0f
    private var aiTimer = 2f
    private var playerGunCd = 0f
    private var enemyGunCd = 0f
    var speed = 1
    var gameOver = true // true solange Menü/Overlay offen ist
    var ended = false   // echtes Spielende (Festung zerstört) – nicht nur Menü-Pause
    var victory = false
    var selectedType: String? = null

    fun reset(diff: KkDifficulty) {
        difficulty = diff
        crystals = KK.START_CRYSTALS
        aiCrystals = KK.START_CRYSTALS
        collectors = 0; aiCollectors = 0
        playerBaseHp = KK.BASE_HP; enemyBaseHp = KK.BASE_HP
        units.clear(); effects.clear()
        towers.clear(); towers.addAll(listOf(Watchtower(0), Watchtower(1), Watchtower(2)))
        time = 0f; aiTimer = 2f
        playerGunCd = 0f; enemyGunCd = 0f
        speed = 1
        gameOver = false; ended = false; victory = false
        selectedType = null
    }

    fun collectorCost() = KK.COLLECTOR_BASE_COST + KK.COLLECTOR_COST_STEP * collectors

    fun ownedTowers(owner: String) = towers.count { it.owner == owner }

    fun playerIncome() = KK.BASE_INCOME + KK.COLLECTOR_INCOME * collectors +
        KK.TOWER_INCOME * ownedTowers("player")

    fun spawnUnit(owner: String, typeKey: String, lane: Int) {
        if (units.count { !it.dead && it.owner == owner } >= KK.MAX_UNITS_PER_SIDE) return
        units.add(Fighter(owner, typeKey, lane))
    }

    fun tryBuyUnit(lane: Int): Boolean {
        val key = selectedType ?: return false
        val t = kkUnitType(key)
        if (crystals < t.cost) return false
        crystals -= t.cost
        spawnUnit("player", key, lane)
        return true
    }

    fun tryBuyCollector(): Boolean {
        val cost = collectorCost()
        if (collectors >= KK.COLLECTOR_MAX || crystals < cost) return false
        crystals -= cost
        collectors++
        return true
    }

    fun update(dt: Float) {
        if (gameOver) return
        time += dt

        // Einkommen
        crystals += playerIncome() * dt
        aiCrystals += (KK.BASE_INCOME + KK.COLLECTOR_INCOME * aiCollectors +
            KK.TOWER_INCOME * ownedTowers("enemy")) * difficulty.incomeMul * dt

        aiThink(dt)

        for (u in units) if (!u.dead) updateUnit(u, dt)
        for (tw in towers) updateTower(tw, dt)
        updateBaseGuns(dt)
        units.removeAll { it.dead }

        for (fx in effects) fx.t -= dt
        effects.removeAll { it.t <= 0 }

        // Sieg / Niederlage
        if (enemyBaseHp <= 0) { gameOver = true; ended = true; victory = true }
        else if (playerBaseHp <= 0) { gameOver = true; ended = true; victory = false }
    }

    // ---- Einheiten ----

    private fun counterMult(attackerType: String, targetType: String) =
        kkUnitType(attackerType).counters[targetType] ?: 1f

    /** Nächste angreifbare gegnerische Einheit in derselben Bahn, vor der Einheit. */
    private fun findTarget(u: Fighter): Fighter? {
        var best: Fighter? = null
        var bestDist = Float.MAX_VALUE
        for (o in units) {
            if (o.dead || o.owner == u.owner || o.lane != u.lane) continue
            val ahead = (o.x - u.x) * u.dir
            if (ahead < -14f) continue // hinter uns: ignorieren
            val d = abs(o.x - u.x)
            if (d <= u.def.range + 6f && d < bestDist) { best = o; bestDist = d }
        }
        return best
    }

    /** Blockiert eine eigene Einheit direkt vor uns den Weg? */
    private fun isBlocked(u: Fighter): Boolean {
        for (o in units) {
            if (o === u || o.dead || o.owner != u.owner || o.lane != u.lane) continue
            val gap = (o.x - u.x) * u.dir
            if (gap > 0 && gap < KK.UNIT_SPACING) return true
        }
        return false
    }

    private fun updateUnit(u: Fighter, dt: Float) {
        val t = u.def
        u.cooldown = max(0f, u.cooldown - dt)

        // Heiler: bewegt sich mit, heilt alle verwundeten Verbündeten in Reichweite
        if (t.heal > 0) {
            for (o in units) {
                if (o.dead || o.owner != u.owner || o === u) continue
                if (o.hp < o.maxHp && abs(o.x - u.x) <= t.range && o.lane == u.lane) {
                    o.hp = min(o.maxHp, o.hp + t.heal * dt)
                }
            }
            if (!isBlocked(u)) u.x += u.dir * t.speed * dt
            return
        }

        // Ziel suchen: Einheit, sonst Basis in Reichweite
        val target = findTarget(u)
        val baseEdge = if (u.owner == "player") KK.ENEMY_BASE_EDGE else KK.PLAYER_BASE_EDGE
        val baseInRange = (baseEdge - u.x) * u.dir <= t.range

        if (target != null) {
            if (u.cooldown <= 0) {
                u.cooldown = t.atkInterval
                val dmg = t.dmg * counterMult(u.type, target.type) * t.vsUnit
                target.hp -= dmg
                addHitEffect(u, target.x, target.y)
                if (target.hp <= 0) target.dead = true
            }
        } else if (baseInRange) {
            if (u.cooldown <= 0) {
                u.cooldown = t.atkInterval
                val dmg = t.dmg * t.vsBase
                if (u.owner == "player") enemyBaseHp -= dmg else playerBaseHp -= dmg
                addHitEffect(u, baseEdge, u.y)
            }
        } else if (!isBlocked(u)) {
            u.x += u.dir * t.speed * dt
        }
    }

    private fun addHitEffect(u: Fighter, tx: Float, ty: Float) {
        val ranged = u.def.range > 40f
        effects.add(HitEffect(
            u.x, u.y, tx, ty,
            if (ranged) 0.18f else 0.12f,
            if (u.owner == "player") KK.COLOR_PLAYER else KK.COLOR_ENEMY,
            ranged,
        ))
    }

    /** Beide Festungen schießen selbst auf den nächsten Angreifer in Reichweite. */
    private fun updateBaseGuns(dt: Float) {
        playerGunCd = max(0f, playerGunCd - dt)
        enemyGunCd = max(0f, enemyGunCd - dt)
        for (side in listOf("player", "enemy")) {
            if (side == "player" && playerGunCd > 0) continue
            if (side == "enemy" && enemyGunCd > 0) continue
            val edge = if (side == "player") KK.PLAYER_BASE_EDGE else KK.ENEMY_BASE_EDGE
            var best: Fighter? = null
            var bestDist = Float.MAX_VALUE
            for (u in units) {
                if (u.dead || u.owner == side) continue
                val d = abs(u.x - edge)
                if (d <= KK.BASE_GUN_RANGE && d < bestDist) { best = u; bestDist = d }
            }
            val b = best ?: continue
            if (side == "player") playerGunCd = KK.BASE_GUN_INTERVAL else enemyGunCd = KK.BASE_GUN_INTERVAL
            b.hp -= KK.BASE_GUN_DMG
            if (b.hp <= 0) b.dead = true
            effects.add(HitEffect(
                edge, KK.HEIGHT / 2 - 60, b.x, b.y, 0.15f,
                if (side == "player") KK.COLOR_PLAYER else KK.COLOR_ENEMY, true,
            ))
        }
    }

    // ---- Wachtürme ----

    private fun updateTower(tw: Watchtower, dt: Float) {
        var nPlayer = 0
        var nEnemy = 0
        for (u in units) {
            if (u.dead || u.lane != tw.lane) continue
            if (abs(u.x - tw.x) <= KK.TOWER_CAPTURE_RADIUS) {
                if (u.owner == "player") nPlayer++ else nEnemy++
            }
        }

        // Eroberung: nur wenn genau eine Seite präsent ist
        val side = when {
            nPlayer > 0 && nEnemy == 0 -> "player"
            nEnemy > 0 && nPlayer == 0 -> "enemy"
            else -> null
        }
        if (side != null && side != tw.owner) {
            val n = if (side == "player") nPlayer else nEnemy
            val rate = KK.TOWER_CAPTURE_RATE * min(n, 3) * dt
            if (tw.chargeOwner != null && tw.chargeOwner != side) {
                tw.charge -= rate // fremde Ladung erst abbauen
                if (tw.charge <= 0) { tw.charge = 0f; tw.chargeOwner = null }
            } else if (tw.owner != "neutral") {
                tw.chargeOwner = side
                tw.charge += rate // besetzten Turm neutralisieren
                if (tw.charge >= KK.TOWER_CAPTURE_NEED) {
                    tw.owner = "neutral"; tw.charge = 0f; tw.chargeOwner = null
                }
            } else {
                tw.chargeOwner = side
                tw.charge += rate
                if (tw.charge >= KK.TOWER_CAPTURE_NEED) {
                    tw.owner = side; tw.charge = 0f; tw.chargeOwner = null
                }
            }
        }

        // Schießen
        if (tw.owner == "neutral") return
        tw.cooldown = max(0f, tw.cooldown - dt)
        if (tw.cooldown > 0) return
        var best: Fighter? = null
        var bestDist = Float.MAX_VALUE
        for (u in units) {
            if (u.dead || u.owner == tw.owner) continue
            val d = hypot(u.x - tw.x, u.y - tw.y)
            if (d <= KK.TOWER_RANGE && d < bestDist) { best = u; bestDist = d }
        }
        val b = best ?: return
        tw.cooldown = KK.TOWER_ATK_INTERVAL
        b.hp -= KK.TOWER_DMG
        if (b.hp <= 0) b.dead = true
        effects.add(HitEffect(
            tw.x, tw.y - 20, b.x, b.y, 0.15f,
            if (tw.owner == "player") KK.COLOR_PLAYER else KK.COLOR_ENEMY, true,
        ))
    }

    // ---- KI ----

    private val counteredBy = mapOf("sword" to "lancer", "archer" to "sword", "lancer" to "archer")

    private fun aiThink(dt: Float) {
        val diff = difficulty
        aiTimer -= dt
        if (aiTimer > 0) return
        aiTimer = diff.interval * (0.7f + Random.nextFloat() * 0.6f)

        // Lagebild pro Bahn: Spielerdruck und eigene Präsenz
        val pressure = floatArrayOf(0f, 0f, 0f)
        val own = floatArrayOf(0f, 0f, 0f)
        val typeCount = mutableMapOf<String, Int>()
        for (u in units) {
            if (u.dead) continue
            if (u.owner == "player") {
                pressure[u.lane] += u.def.cost
                typeCount[u.type] = (typeCount[u.type] ?: 0) + 1
            } else {
                own[u.lane] += u.def.cost
            }
        }

        // 1) Wirtschaft: früh Sammler bauen, solange kein akuter Druck herrscht
        val collCost = KK.COLLECTOR_BASE_COST + KK.COLLECTOR_COST_STEP * aiCollectors
        val threatened = pressure.sum() > own.sum() + 60
        if (aiCollectors < diff.ecoTarget && aiCrystals >= collCost && !threatened) {
            aiCrystals -= collCost
            aiCollectors++
            return
        }

        // 2) Bahn wählen: bedrohteste verteidigen, sonst schwächste Spieler-Bahn pushen
        val deficit = FloatArray(3) { pressure[it] - own[it] }
        val maxDef = deficit.max()
        val lane: Int
        if (maxDef > 0 && Random.nextFloat() < diff.smart) {
            lane = deficit.indexOfFirst { it == maxDef }
        } else {
            val minP = pressure.min()
            val open = (0..2).filter { pressure[it] == minP }
            lane = open[Random.nextInt(open.size)]
        }

        // 3) Einheit wählen
        var typeKey: String? = null
        if (Random.nextFloat() < diff.smart) {
            // dominanten Spielertyp kontern
            var domType: String? = null
            var domN = 0
            for (k in listOf("sword", "archer", "lancer")) {
                val c = typeCount[k] ?: 0
                if (c > domN) { domN = c; domType = k }
            }
            if (domType != null && domN > 0) typeKey = counteredBy[domType]
        }
        if (typeKey == null) {
            val pool = listOf("sword", "sword", "archer", "lancer")
            typeKey = pool[Random.nextInt(pool.size)]
        }
        // gelegentlich Support/Belagerung, wenn genug Geld da ist
        if (aiCrystals > 130 && Random.nextFloat() < 0.25f) typeKey = "siege"
        else if (aiCrystals > 100 && Random.nextFloat() < 0.2f) typeKey = "healer"

        val cost = kkUnitType(typeKey).cost
        if (aiCrystals >= cost) {
            aiCrystals -= cost
            spawnUnit("enemy", typeKey, lane)
        }
    }
}

/** Hält die Engine über Activity-Neustarts hinweg am Leben. */
object KristallHolder {
    val engine = KristallEngine()
}
