package de.schlecht.towerdefense.zell

import kotlin.math.abs
import kotlin.math.hypot
import kotlin.math.max
import kotlin.math.min
import kotlin.math.pow
import kotlin.random.Random

/* ======================================================================
   ZELLKRIEG – Simulation. Direkte Portierung der Web-Version:
   Zellen produzieren Punkte, Tentakel übertragen sie (Heilung/Angriff),
   Duelle zehren Vorräte, Neutrale werden per Aufladen erobert.
   ====================================================================== */

class ZCell(spec: ZCellSpec) {
    val id = spec.id
    val type = spec.type
    var owner = spec.owner
    val x = spec.x
    val y = spec.y
    var units = spec.units
    val tierMax = spec.tierMax
    var tier = 0
    var boost = 0f              // Überschuss-Puffer (Symbiose)
    var chargeOwner: String? = null
    var flash = 0f
    var denyFlash = 0f

    // pro Tick berechnete Verteilungswerte
    var flowOut = 0
    var boostShare = 0f
    var flowBudget = 0f

    val def get() = Z_CELL_TYPES.getValue(type)
}

enum class TMode { GROW, FLOW, RETRACT, FREE }

class Packet(val amount: Float, var remaining: Float, val travel: Float)

class ZTentacle(val src: ZCell, val dst: ZCell) {
    var owner = src.owner
    val attack = src.def.attack   // Werte der sendenden Zelle einfrieren
    val heal = src.def.heal
    var p0x = 0f; var p0y = 0f
    var p1x = 0f; var p1y = 0f
    var ux = 0f; var uy = 0f
    var len = 0f
    var tail = 0f; var head = 0f
    var prevTail = 0f; var prevHead = 0f
    var mode = TMode.GROW
    val phase = Random.nextFloat() * 10f
    var boostGlow = 0f
    var clashGlow = 0f
    var pipeline = ArrayDeque<Packet>()
    var pendingPush = 0f
    var pendingTicks = 0
    var rate = 0f
    var dotSpeed = ZK.FLOW_DOT_SPEED
    var dead = false
    var clash: ZTentacle? = null
    var opp: ZTentacle? = null

    init {
        val dx = dst.x - src.x
        val dy = dst.y - src.y
        val d = hypot(dx, dy)
        ux = dx / d; uy = dy / d
        p0x = src.x + ux * cellRadiusOf(src)
        p0y = src.y + uy * cellRadiusOf(src)
        p1x = dst.x - ux * (cellRadiusOf(dst) + 3f)
        p1y = dst.y - uy * (cellRadiusOf(dst) + 3f)
        len = hypot(p1x - p0x, p1y - p0y)
    }

    /** Kopie für ein abgetrenntes Vorderstück [cutAt, head]. */
    fun splitFront(cutAt: Float): ZTentacle {
        val f = ZTentacle(src, dst)
        f.owner = owner
        f.p0x = p0x; f.p0y = p0y; f.p1x = p1x; f.p1y = p1y
        f.ux = ux; f.uy = uy; f.len = len
        f.tail = cutAt; f.head = head
        f.prevTail = cutAt; f.prevHead = head
        f.mode = TMode.FREE
        f.pipeline = ArrayDeque(pipeline) // übernimmt unterwegs befindliche Pakete
        f.pendingPush = 0f; f.pendingTicks = 0
        f.rate = rate; f.dotSpeed = dotSpeed
        return f
    }
}

fun cellRadiusOf(cell: ZCell): Float {
    val base = cell.def.radius
    return if (cell.tierMax > 0) base + ZK.TIER_RADIUS_ADD[cell.tier] else base
}

fun cellMaxOf(cell: ZCell): Float {
    val base = cell.def.max
    if (cell.tierMax == 0) return base
    val cap = ZK.TIER_MAX_UNITS[cell.tier]
    return if (cap < 0) base else max(base, cap)
}

fun cellProdOf(cell: ZCell): Float {
    val base = cell.def.prod
    return if (cell.tierMax > 0) base * ZK.TIER_PROD_MUL[cell.tier] else base
}

class AiState(val owner: String, val profile: ZProfile) {
    var timer = Random.nextFloat() * profile.interval
}

class Slash(val x1: Float, val y1: Float, val x2: Float, val y2: Float, val color: Int) {
    var age = 0f
}

class ZellEngine {
    var level: ZLevel = Z_SANDBOX_LEVEL
        private set
    val cells = mutableListOf<ZCell>()
    val tentacles = mutableListOf<ZTentacle>()
    val slashes = mutableListOf<Slash>()
    var aiStates = mutableListOf<AiState>()
    var selected: ZCell? = null
    var gameOver = false
    var playerWon = false
    var inMenu = true
    var paused = false

    /** Wird nach Spielende einmal aufgerufen (true = Sieg). */
    var onGameEnd: ((Boolean) -> Unit)? = null

    fun loadLevel(lv: ZLevel) {
        level = lv
        reset()
        inMenu = false
    }

    fun reset() {
        cells.clear()
        cells.addAll(level.cells.map { ZCell(it) })
        tentacles.clear()
        slashes.clear()
        selected = null
        gameOver = false
        playerWon = false
        paused = false
        aiStates = mutableListOf()
        if (!level.sandbox) {
            for (f in Z_AI_FACTIONS) {
                if (level.cells.any { it.owner == f }) {
                    aiStates.add(AiState(f, zProfileFor(level, f)))
                }
            }
        }
    }

    // ---- Regeln / Abfragen ----

    fun commandableOwner(owner: String) =
        owner == "player" || (level.sandbox && owner != "neutral")

    fun controllable(cell: ZCell) = commandableOwner(cell.owner)

    fun maxSlots(cell: ZCell) = min(
        ZK.SLOT_MAX,
        ZK.SLOT_BASE + cell.units.toInt() / ZK.SLOT_STEP,
    )

    fun outgoing(cell: ZCell) = tentacles.filter {
        !it.dead && it.src === cell && (it.mode == TMode.GROW || it.mode == TMode.FLOW)
    }

    fun outgoingCount(cell: ZCell): Int {
        var n = 0
        for (t in tentacles) {
            if (!t.dead && t.src === cell && (t.mode == TMode.GROW || t.mode == TMode.FLOW)) n++
        }
        return n
    }

    private fun creditUnits(cell: ZCell, amount: Float) {
        val maxU = cellMaxOf(cell)
        val room = maxU - cell.units
        if (amount <= room) {
            cell.units += amount
        } else {
            cell.units = maxU
            cell.boost = min(ZK.OVERFLOW_BUFFER, cell.boost + (amount - room))
        }
    }

    private fun bunkerReduced(attack: Float) = attack / 2f.pow(ZK.BUNKER_DEFENSE)

    private fun flowDotSpeedForRate(rate: Float): Float {
        for ((maxRate, mul) in ZK.FLOW_SPEED_TIERS) {
            if (rate < maxRate) return ZK.FLOW_DOT_SPEED * mul
        }
        return ZK.FLOW_DOT_SPEED
    }

    // ---- Befehle ----

    /** Tentakel zu dst ausfahren – oder vorhandene einziehen (Toggle). */
    fun tryCommand(src: ZCell, dst: ZCell): Boolean {
        val existing = tentacles.firstOrNull {
            !it.dead && it.src === src && it.dst === dst &&
                (it.mode == TMode.GROW || it.mode == TMode.FLOW)
        }
        if (existing != null) { existing.mode = TMode.RETRACT; return true }

        // Einbahn-Regel zwischen befreundeten Zellen
        if (dst.owner == src.owner) {
            tentacles.firstOrNull {
                !it.dead && it.src === dst && it.dst === src &&
                    (it.mode == TMode.GROW || it.mode == TMode.FLOW)
            }?.mode = TMode.RETRACT
        }

        if (outgoingCount(src) >= maxSlots(src) || src.units < 2) {
            src.denyFlash = 0.45f
            return false
        }
        tentacles.add(ZTentacle(src, dst))
        src.flash = 0.3f
        return true
    }

    private fun applyMass(t: ZTentacle, mass: Float) {
        if (mass <= 0) return
        val dst = t.dst
        if (dst.owner == t.owner) {
            creditUnits(dst, mass * t.heal)
        } else {
            var per = t.attack
            if (dst.type == "bunker") per = bunkerReduced(per)
            damageCell(dst, mass * per, t.owner)
        }
    }

    private fun damageCell(cell: ZCell, dmg: Float, byOwner: String) {
        if (cell.owner == "neutral") { captureCharge(cell, dmg, byOwner); return }
        cell.units -= dmg
        if (cell.units < 0) captureCell(cell, byOwner, null)
    }

    private fun captureCharge(cell: ZCell, dmg: Float, byOwner: String) {
        val holder = cell.chargeOwner
        if (holder == null) {
            cell.chargeOwner = byOwner
            cell.units = dmg
        } else if (holder == byOwner) {
            cell.units += dmg
        } else {
            cell.units -= dmg
            if (cell.units <= 0) {
                cell.chargeOwner = byOwner
                cell.units = -cell.units
            }
        }
        if (cell.chargeOwner == byOwner && cell.units >= ZK.CAPTURE_CHARGE) {
            captureCell(cell, byOwner, ZK.CAPTURE_CHARGE)
        }
    }

    private fun captureCell(cell: ZCell, newOwner: String, startUnits: Float?) {
        cell.owner = newOwner
        cell.units = startUnits ?: min(cellMaxOf(cell), max(0f, -cell.units))
        cell.boost = 0f
        cell.chargeOwner = null
        for (t in tentacles) {
            if (!t.dead && t.src === cell && (t.mode == TMode.GROW || t.mode == TMode.FLOW)) {
                t.mode = TMode.RETRACT
            }
        }
        if (selected === cell && !controllable(cell)) selected = null
    }

    private fun battleFeed(t: ZTentacle, dt: Float): Float {
        val c = t.src
        val want = ZK.TRANSFER_RATE * dt
        val fromBoost = min(min(c.boost, c.boostShare), want)
        val fromUnits = min(min(c.flowBudget, max(0f, c.units)), max(0f, want - fromBoost))
        c.boost -= fromBoost
        c.units -= fromUnits
        if (fromBoost > 0.0001f) t.boostGlow = 0.35f
        return fromBoost + fromUnits
    }

    // ---- Schneiden ----

    /** Tentakel bei Länge L durchtrennen. */
    fun cutTentacle(t: ZTentacle, L: Float): Boolean {
        val margin = 6f
        if (t.dead || L < t.tail + margin || L > t.head - margin) return false

        // Noch nicht angedockt und kein Duell: einfach einziehen
        if (t.mode == TMode.GROW && t.clash == null) {
            t.mode = TMode.RETRACT
            return true
        }

        tentacles.add(t.splitFront(L))

        // Hinteres Stück: eigene leere Pipeline, zurückziehen
        t.head = L
        t.prevHead = min(t.prevHead, L)
        t.pipeline = ArrayDeque()
        if (t.mode != TMode.FREE) t.mode = TMode.RETRACT
        return true
    }

    /** Schnittlinie gegen alle befehligbaren Tentakel testen. */
    fun performCut(ax: Float, ay: Float, bx: Float, by: Float, color: Int): Boolean {
        var hit = false
        for (t in tentacles.toList()) {
            if (t.dead || t.head - t.tail < 8) continue
            if (!commandableOwner(t.owner)) continue
            val q0x = t.p0x + t.ux * t.tail
            val q0y = t.p0y + t.uy * t.tail
            val q1x = t.p0x + t.ux * t.head
            val q1y = t.p0y + t.uy * t.head
            val u = segIntersect(ax, ay, bx, by, q0x, q0y, q1x, q1y) ?: continue
            val L = t.tail + (t.head - t.tail) * u
            if (cutTentacle(t, L)) {
                hit = true
                val px = t.p0x + t.ux * L
                val py = t.p0y + t.uy * L
                slashes.add(Slash(
                    px - t.uy * 20, py + t.ux * 20,
                    px + t.uy * 20, py - t.ux * 20, color,
                ))
            }
        }
        return hit
    }

    private fun segIntersect(
        p0x: Float, p0y: Float, p1x: Float, p1y: Float,
        q0x: Float, q0y: Float, q1x: Float, q1y: Float,
    ): Float? {
        val rX = p1x - p0x; val rY = p1y - p0y
        val sX = q1x - q0x; val sY = q1y - q0y
        val den = rX * sY - rY * sX
        if (abs(den) < 1e-9f) return null
        val qpX = q0x - p0x; val qpY = q0y - p0y
        val tt = (qpX * sY - qpY * sX) / den
        val uu = (qpX * rY - qpY * rX) / den
        return if (tt in 0f..1f && uu in 0f..1f) uu else null
    }

    // ---- Update ----

    fun snapshotPrevState() {
        for (t in tentacles) {
            t.prevHead = t.head
            t.prevTail = t.tail
        }
    }

    fun update(dt: Float) {
        if (inMenu) return

        // Produktion + Ausbaustufen
        for (c in cells) {
            updateTier(c)
            if (c.owner != "neutral" || ZK.NEUTRAL_PRODUCES) {
                creditUnits(c, cellProdOf(c) * dt)
            }
            if (c.flash > 0) c.flash -= dt
            if (c.denyFlash > 0) c.denyFlash -= dt
        }

        // Duelle erkennen: Route-Index src->dst
        for (t in tentacles) { t.opp = null; t.clash = null }
        val activeByRoute = HashMap<Long, ZTentacle>()
        for (t in tentacles) {
            if (t.dead || (t.mode != TMode.GROW && t.mode != TMode.FLOW)) continue
            activeByRoute[routeKey(t.src, t.dst)] = t
        }
        for (t in tentacles) {
            if (t.dead || (t.mode != TMode.GROW && t.mode != TMode.FLOW) || t.opp != null) continue
            val o = activeByRoute[routeKey(t.dst, t.src)] ?: continue
            if (o.owner == t.owner) continue
            t.opp = o; o.opp = t
            t.clash = o; o.clash = t
        }

        // Überschuss-Verteilung vorbereiten
        for (c in cells) c.flowOut = 0
        for (t in tentacles) {
            if (!t.dead && (t.mode == TMode.FLOW || t.clash != null)) t.src.flowOut++
            if (t.boostGlow > 0) t.boostGlow -= dt
            if (t.clashGlow > 0) t.clashGlow -= dt
        }
        for (c in cells) {
            c.boostShare = if (c.flowOut > 0) c.boost / c.flowOut else 0f
            c.flowBudget = if (c.flowOut > 0) cellProdOf(c) * dt / c.flowOut else 0f
        }

        // Duelle austragen
        val fought = HashSet<ZTentacle>()
        for (t in tentacles) {
            val o = t.clash ?: continue
            if (t.dead || fought.contains(t)) continue
            if (o.dead || fought.contains(o)) continue
            fought.add(t); fought.add(o)

            val dmgT = battleFeed(t, dt) * t.attack
            val dmgO = battleFeed(o, dt) * o.attack
            if (dmgT > 0) damageCell(t.dst, dmgT, t.owner)
            if (dmgO > 0 && !o.dead) damageCell(o.dst, dmgO, o.owner)

            t.clashGlow = 0.25f; o.clashGlow = 0.25f
        }

        // Pipeline-Auslieferung
        for (t in tentacles) {
            if (t.pipeline.isEmpty()) continue
            for (p in t.pipeline) p.remaining -= dt
            while (t.pipeline.isNotEmpty() && t.pipeline.first().remaining <= 0) {
                applyMass(t, t.pipeline.removeFirst().amount)
            }
        }

        // Tentakel
        for (t in tentacles) {
            if (t.dead) continue

            // Aufgesammelte Fluss-Masse ausliefern, sobald der Flow-Modus endet
            if (t.mode != TMode.FLOW && t.pendingPush > 0) {
                val travel = t.len / t.dotSpeed
                t.pipeline.add(Packet(t.pendingPush, travel, travel))
                t.pendingPush = 0f; t.pendingTicks = 0
            }

            // Duell vorbei, aber an der Korridor-Mitte angedockt: weiterwachsen
            if (t.mode == TMode.FLOW && t.clash == null && t.head < t.len - 0.001f) {
                t.mode = TMode.GROW
            }

            when {
                t.mode == TMode.GROW -> {
                    val target = if (t.clash != null) min(t.len, t.len / 2) else t.len
                    val limit = target - t.head
                    if (limit > 0) {
                        val want = min(ZK.TENTACLE_SPEED * dt, limit)
                        val cost = want / ZK.LENGTH_PER_UNIT
                        if (want > 0 && t.src.units + t.src.boost >= cost) {
                            val fromBoost = min(t.src.boost, cost)
                            t.src.boost -= fromBoost
                            t.src.units -= (cost - fromBoost)
                            t.head += want
                        }
                    }
                    if (t.head >= target - 0.001f) t.mode = TMode.FLOW
                }

                t.mode == TMode.FLOW && t.clash != null -> {
                    // Im Duell: Spitze zieht sich ggf. auf die Korridor-Mitte zurück
                    val front = min(t.len, t.len / 2)
                    if (t.head > front + 0.001f) {
                        val d = min(ZK.RETRACT_SPEED * dt, t.head - front)
                        t.head -= d
                        creditUnits(t.src, d / ZK.LENGTH_PER_UNIT)
                    }
                }

                t.mode == TMode.FLOW -> {
                    // Kontinuierliche Übertragung (produktionsgedeckelt)
                    val dst = t.dst
                    val want = ZK.TRANSFER_RATE * dt
                    val hostile = dst.owner != t.owner
                    var per = t.attack
                    if (hostile && dst.type == "bunker") per = bunkerReduced(per)

                    var total = 0f
                    if (!hostile || per > 0) {
                        val base = min(min(want, t.src.flowBudget), max(0f, t.src.units))
                        val share = min(min(t.src.boost, t.src.boostShare), want)
                        total = base + share

                        if (!hostile) {
                            val room = (cellMaxOf(dst) - dst.units) +
                                max(0f, ZK.OVERFLOW_BUFFER - dst.boost)
                            total = min(total, room / t.heal)
                        }

                        if (total > 0) {
                            val fromBoost = min(share, total)
                            t.src.boost -= fromBoost
                            t.src.units -= (total - fromBoost)
                            if (fromBoost > 0.0001f) t.boostGlow = 0.35f
                            t.pendingPush += total
                            t.pendingTicks++
                            if (t.pendingTicks >= ZK.PIPELINE_BATCH_TICKS) {
                                val travel = t.len / t.dotSpeed
                                t.pipeline.add(Packet(t.pendingPush, travel, travel))
                                t.pendingPush = 0f; t.pendingTicks = 0
                            }
                        }
                    }

                    val value = if (hostile) per else t.heal
                    val inst = (total / dt) * value
                    t.rate += (inst - t.rate) * min(1f, dt * 6)
                    t.dotSpeed = flowDotSpeedForRate(t.rate)
                }

                t.mode == TMode.RETRACT -> {
                    val d = min(ZK.RETRACT_SPEED * dt, t.head - t.tail)
                    t.head -= d
                    creditUnits(t.src, d / ZK.LENGTH_PER_UNIT)
                    if (t.head - t.tail < 0.5f) t.dead = true
                }

                t.mode == TMode.FREE -> {
                    val sp = ZK.RETRACT_SPEED * dt
                    if (t.head < t.len) {
                        val d = min(sp, t.len - t.head)
                        t.head += d; t.tail += d
                    } else {
                        val d = min(sp, t.len - t.tail)
                        t.tail += d
                        applyMass(t, d / ZK.LENGTH_PER_UNIT)
                        if (t.len - t.tail < 0.5f) t.dead = true
                    }
                }
            }
        }
        tentacles.removeAll { it.dead && it.pipeline.isEmpty() }

        for (s in slashes) s.age += dt
        slashes.removeAll { it.age >= 0.8f }

        // KI-Fraktionen takten
        if (!gameOver && !level.sandbox) {
            for (s in aiStates) {
                if (cells.none { it.owner == s.owner }) continue
                s.timer += dt
                if (s.timer >= s.profile.interval) {
                    s.timer = 0f
                    aiThink(s.owner, s.profile)
                }
            }
        }

        checkVictory()
    }

    private fun routeKey(a: ZCell, b: ZCell): Long =
        (cells.indexOf(a).toLong() shl 32) or (cells.indexOf(b).toLong() and 0xFFFFFFFFL)

    private fun updateTier(cell: ZCell) {
        val tm = cell.tierMax
        if (tm == 0) { cell.tier = 0; return }
        var tier = cell.tier
        while (tier < tm && cell.units >= ZK.TIER_UP[tier]) tier++
        while (tier > 0 && cell.units < ZK.TIER_DOWN[tier - 1]) tier--
        cell.tier = tier
    }

    private fun checkVictory() {
        if (gameOver || level.sandbox) return
        fun alive(owner: String) =
            cells.any { it.owner == owner } ||
                tentacles.any { !it.dead && it.owner == owner && it.head - it.tail > 1 }

        val playerAlive = alive("player")
        val anyAiAlive = aiStates.any { alive(it.owner) }
        if (playerAlive && anyAiAlive) return

        gameOver = true
        playerWon = playerAlive
        onGameEnd?.invoke(playerAlive)
    }

    // ---- KI ----

    private fun effDamagePerUnit(src: ZCell, target: ZCell): Float {
        var dmg = src.def.attack
        if (target.type == "bunker") dmg = bunkerReduced(dmg)
        return dmg
    }

    private fun aiThink(owner: String, profile: ZProfile) {
        var budget = profile.commandsPerTick
        fun noise() = (Random.nextFloat() * 2 - 1) * profile.targetNoise

        // 0) Bestehende Tentakel überdenken
        for (t in tentacles.toList()) {
            if (budget <= 0) return
            if (t.dead || t.owner != owner || t.mode != TMode.FLOW || t.src.owner != owner) continue
            val src = t.src
            val dst = t.dst

            if (dst.owner == owner) {
                if (dst.units >= cellMaxOf(dst) - 1 && dst.boost >= ZK.OVERFLOW_BUFFER - 1) {
                    t.mode = TMode.RETRACT; budget--
                }
                continue
            }

            val per = effDamagePerUnit(src, dst)
            val massPts = max(0f, t.head - t.tail - 14f) / ZK.LENGTH_PER_UNIT
            val finishes = if (dst.owner == "neutral") {
                dst.chargeOwner == owner && dst.units + massPts * per >= ZK.CAPTURE_CHARGE + 1
            } else {
                massPts * per >= dst.units + 2
            }
            if (per > 0 && finishes && cutTentacle(t, t.tail + 7)) { budget--; continue }

            val soloAttack = tentacles.none {
                it !== t && !it.dead && it.owner == owner && it.dst === dst &&
                    (it.mode == TMode.GROW || it.mode == TMode.FLOW)
            }
            val losingDuel = t.clash != null && src.units < profile.minUnits && dst.units > src.units
            val hopeless = t.clash == null && soloAttack && dst.owner != "neutral" &&
                cellProdOf(src) * per < cellProdOf(dst) * 0.7f
            if (losingDuel || hopeless) { t.mode = TMode.RETRACT; budget-- }
        }
        if (budget <= 0) return

        val sources = cells
            .filter { it.owner == owner && it.units.toInt() >= profile.minUnits }
            .sortedByDescending { it.units }

        // 1) Stärkste Zellen mit freiem Slot greifen die schwächste nahe fremde Zelle an
        for (src in sources) {
            if (budget <= 0) return
            val out = outgoing(src)
            if (out.size >= maxSlots(src)) continue

            val targets = cells.filter { c ->
                c !== src && c.owner != owner &&
                    out.none { it.dst === c } &&
                    effDamagePerUnit(src, c) > 0
            }
            if (targets.isNotEmpty()) {
                val best = targets.minBy {
                    it.units + hypot(it.x - src.x, it.y - src.y) * 0.05f + noise()
                }
                if (tryCommand(src, best)) budget--
            }
        }
        if (budget <= 0) return

        // 2) Fallback: stärkste Zelle verstärkt die schwächste eigene Zelle
        for (src in sources) {
            if (budget <= 0) return
            val out = outgoing(src)
            if (out.size >= maxSlots(src)) continue
            val own = cells.filter { c ->
                c !== src && c.owner == owner && c.units < src.units - 8 &&
                    out.none { it.dst === c } &&
                    tentacles.none {
                        !it.dead && it.src === c && it.dst === src &&
                            (it.mode == TMode.GROW || it.mode == TMode.FLOW)
                    }
            }
            if (own.isNotEmpty()) {
                if (tryCommand(src, own.minBy { it.units })) budget--
            }
        }
    }
}

/** Hält die Engine über Activity-Neustarts hinweg am Leben. */
object ZellHolder {
    val engine = ZellEngine()
}
