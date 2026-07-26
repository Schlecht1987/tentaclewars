package de.schlecht.towerdefense.zell

import kotlin.math.PI
import kotlin.math.cos
import kotlin.math.hypot
import kotlin.math.max
import kotlin.math.min
import kotlin.math.roundToInt
import kotlin.math.sin
import kotlin.math.sqrt

/* ======================================================================
   KARTEN-GENERATOR + KAMPAGNE (deterministisch, identisch zur Web-Version)
   ====================================================================== */

// Gewichtung der Zelltypen für Nicht-Heimatzellen (Reihenfolge relevant!)
private val MAPGEN_TYPE_WEIGHTS = listOf(
    "normal" to 3, "factory" to 2, "healer" to 2, "bunker" to 1, "attacker" to 1,
)

private val MAPGEN_ID_PREFIX = mapOf(
    "player" to "P", "enemy" to "E", "enemy2" to "F", "enemy3" to "G", "neutral" to "N",
)

private data class GenParams(
    val width: Float, val height: Float,
    val aiFactions: List<String>,
    val cellsPerFaction: Int,
    val neutralCells: Int,
    val allowedTypes: List<String>,
    val symmetric: Boolean,
    val startUnitsPlayer: Float,
    val startUnitsAi: Float,
    val minDist: Float = 110f,
    val margin: Float = 100f,
)

private class PlacedCell(
    val x: Float, val y: Float, val type: String,
    val owner: String, val units: Float, val tierMax: Int,
)

// Ausbau-Obergrenze (tierMax) einer generierten Zelle deterministisch würfeln
private fun rollTierMax(rng: Mulberry, type: String): Int {
    if (type == "factory") return 0
    if (type == "bunker") return if (rng.next() < 0.5) 1 else 0
    val r = rng.next()
    return when {
        r < 0.15 -> 0
        r < 0.50 -> 1
        r < 0.82 -> 2
        else -> 3
    }
}

private fun generateMap(p: GenParams, rng: Mulberry): ZLevel {
    val factions = listOf("player") + p.aiFactions
    val placed = mutableListOf<PlacedCell>()
    val cx = p.width / 2
    val cy = p.height / 2

    // Effektiver Mindestabstand: skaliert mit der verfügbaren Fläche pro Zelle
    val totalCells = factions.size * p.cellsPerFaction + p.neutralCells
    val spread = max(
        p.minDist,
        0.66f * sqrt(((p.width - p.margin * 2) * (p.height - p.margin * 2)) / max(1, totalCells)),
    )

    val weights = MAPGEN_TYPE_WEIGHTS.filter { (t, _) -> t in p.allowedTypes }
        .ifEmpty { listOf("normal" to 1) }

    fun inBounds(x: Float, y: Float) =
        x >= p.margin && x <= p.width - p.margin && y >= p.margin && y <= p.height - p.margin

    fun farEnough(x: Float, y: Float, dist: Float) =
        placed.all { hypot(it.x - x, it.y - y) >= dist }

    fun pushCell(x: Float, y: Float, type: String, owner: String, units: Float, tierMax: Int) {
        placed.add(PlacedCell(x.roundToInt().toFloat(), y.roundToInt().toFloat(), type, owner, units, tierMax))
    }

    fun neutralUnitsFor(type: String): Float =
        (if (type == "bunker") rng.int(20, 30) else rng.int(8, 25)).toFloat()

    if (p.symmetric) {
        // k Fraktionen teilen sich die Karte rotations- (k>2) bzw. spiegelsymmetrisch (k=2)
        val k = factions.size
        val transforms = mutableListOf<(Float, Float) -> Pair<Float, Float>>()
        if (k == 2) {
            transforms.add { x, y -> x to y }
            transforms.add { x, y -> (p.width - x) to y }
        } else {
            for (i in 0 until k) {
                val a = (PI * 2 * i / k)
                val cosA = cos(a).toFloat()
                val sinA = sin(a).toFloat()
                transforms.add { x, y ->
                    (cx + (x - cx) * cosA - (y - cy) * sinA) to (cy + (x - cx) * sinA + (y - cy) * cosA)
                }
            }
        }

        val ringR = min(p.width, p.height) * 0.36f
        val anchorX = if (k == 2) p.width * 0.16f else cx - ringR
        val anchorY = if (k == 2) p.height * 0.5f else cy

        fun placeSymmetric(
            sample: () -> Pair<Float, Float>, type: String,
            owners: List<String>, unitsFn: (Int) -> Float,
        ): Boolean {
            for (attempt in 0 until 220) {
                val relax = 1 - 0.4f * (attempt / 220f)
                val (sx, sy) = sample()
                val pts = transforms.map { it(sx, sy) }
                if (!pts.all { (x, y) -> inBounds(x, y) }) continue
                var ok = true
                for (i in pts.indices) {
                    if (!ok) break
                    if (!farEnough(pts[i].first, pts[i].second, spread * relax)) { ok = false; break }
                    for (j in i + 1 until pts.size) {
                        if (hypot(pts[i].first - pts[j].first, pts[i].second - pts[j].second) < spread * relax) {
                            ok = false; break
                        }
                    }
                }
                if (!ok) continue
                val tierMax = rollTierMax(rng, type)
                for (i in pts.indices) {
                    pushCell(pts[i].first, pts[i].second, type, owners[i], unitsFn(i), tierMax)
                }
                return true
            }
            return false
        }

        val neutralOwners = factions.map { "neutral" }

        // 1) Heimatzellen
        val anchorJitterY = if (k == 2) p.height * 0.42f else 40f
        placeSymmetric(
            {
                (anchorX + (rng.next().toFloat() - 0.5f) * 40f) to
                    (anchorY + (rng.next().toFloat() - 0.5f) * anchorJitterY)
            },
            "normal", factions,
        ) { i -> if (factions[i] == "player") p.startUnitsPlayer else p.startUnitsAi }

        // 2) Rest des Fraktions-Clusters
        for (n in 1 until p.cellsPerFaction) {
            val type = rng.weighted(weights)
            val units = rng.int(8, 16).toFloat()
            placeSymmetric(
                {
                    val a = rng.next() * PI * 2
                    val r = spread * (1 + rng.next().toFloat() * 0.9f)
                    (anchorX + cos(a).toFloat() * r) to (anchorY + sin(a).toFloat() * r)
                },
                type, factions,
            ) { units }
        }

        // 3) Sektor-Neutrale (zwischen Heimat und Mitte)
        val sectorNeutrals = p.neutralCells / k
        for (n in 0 until sectorNeutrals) {
            val type = rng.weighted(weights)
            val units = neutralUnitsFor(type)
            placeSymmetric(
                {
                    val f = 0.35f + rng.next().toFloat() * 0.45f
                    (anchorX + (cx - anchorX) * f + (rng.next().toFloat() - 0.5f) * spread * 2) to
                        (anchorY + (cy - anchorY) * f + (rng.next().toFloat() - 0.5f) * spread * 2)
                },
                type, neutralOwners,
            ) { units }
        }

        // 4) Rest-Neutrale einzeln in der umkämpften Mitte
        val rest = p.neutralCells - sectorNeutrals * k
        for (n in 0 until rest) {
            val type = rng.weighted(weights)
            for (attempt in 0 until 200) {
                val relax = 1 - 0.4f * (attempt / 200f)
                val x = cx + (rng.next().toFloat() - 0.5f) * p.width * 0.55f
                val y = cy + (rng.next().toFloat() - 0.5f) * p.height * 0.55f
                if (inBounds(x, y) && farEnough(x, y, spread * relax)) {
                    pushCell(x, y, type, "neutral", neutralUnitsFor(type), rollTierMax(rng, type))
                    break
                }
            }
        }
    } else {
        // Asymmetrische Karte
        val diag = hypot(p.width, p.height)
        val homes = mutableListOf<PlacedCell>()
        for (f in factions) {
            var need = diag * 0.45f
            for (attempt in 0 until 400) {
                if (attempt > 0 && attempt % 50 == 0) need *= 0.9f
                val x = p.margin + rng.next().toFloat() * (p.width - p.margin * 2)
                val y = p.margin + rng.next().toFloat() * (p.height - p.margin * 2)
                if (!farEnough(x, y, spread)) continue
                if (homes.all { hypot(it.x - x, it.y - y) >= need }) {
                    val units = if (f == "player") p.startUnitsPlayer else p.startUnitsAi
                    pushCell(x, y, "normal", f, units, rollTierMax(rng, "normal"))
                    homes.add(placed.last())
                    break
                }
            }
        }

        for (h in homes) {
            for (n in 1 until p.cellsPerFaction) {
                val type = rng.weighted(weights)
                for (attempt in 0 until 200) {
                    val relax = 1 - 0.4f * (attempt / 200f)
                    val a = rng.next() * PI * 2
                    val r = spread * (0.9f + rng.next().toFloat() * 0.9f)
                    val x = h.x + cos(a).toFloat() * r
                    val y = h.y + sin(a).toFloat() * r
                    if (!inBounds(x, y) || !farEnough(x, y, spread * relax)) continue
                    val dOwn = hypot(x - h.x, y - h.y)
                    if (homes.any { it !== h && hypot(x - it.x, y - it.y) < dOwn }) continue
                    pushCell(x, y, type, h.owner, rng.int(8, 16).toFloat(), rollTierMax(rng, type))
                    break
                }
            }
        }

        for (n in 0 until p.neutralCells) {
            val type = rng.weighted(weights)
            for (attempt in 0 until 200) {
                val relax = 1 - 0.4f * (attempt / 200f)
                val x = p.margin + rng.next().toFloat() * (p.width - p.margin * 2)
                val y = p.margin + rng.next().toFloat() * (p.height - p.margin * 2)
                if (inBounds(x, y) && farEnough(x, y, spread * relax)) {
                    pushCell(x, y, type, "neutral", neutralUnitsFor(type), rollTierMax(rng, type))
                    break
                }
            }
        }
    }

    // Spielbarkeits-Check: jede Fraktion muss eine fremde Zelle erreichen können
    for (f in factions) {
        val own = placed.filter { it.owner == f }
        if (own.isEmpty()) continue
        val strongest = own.maxBy { it.units }
        val reach = strongest.units * ZK.LENGTH_PER_UNIT * 0.8f
        val reachable = placed.any {
            it.owner != f && hypot(it.x - strongest.x, it.y - strongest.y) <= reach
        }
        if (!reachable) {
            val d = hypot(cx - strongest.x, cy - strongest.y).takeIf { it > 0 } ?: 1f
            val step = min(reach * 0.85f, d)
            pushCell(
                strongest.x + (cx - strongest.x) / d * step,
                strongest.y + (cy - strongest.y) / d * step,
                "normal", "neutral", rng.int(8, 14).toFloat(), rollTierMax(rng, "normal"),
            )
        }
    }

    // IDs vergeben
    val counters = mutableMapOf<String, Int>()
    val cells = placed.map { c ->
        val pre = MAPGEN_ID_PREFIX[c.owner] ?: "X"
        val i = counters.getOrDefault(pre, 0)
        counters[pre] = i + 1
        ZCellSpec("$pre$i", c.type, c.owner, c.x, c.y, c.units, c.tierMax)
    }

    return ZLevel(
        name = "Generierte Karte", desc = "", tag = "Generiert", sandbox = false,
        width = p.width, height = p.height, cells = cells,
    )
}

/* ======================================================================
   KAMPAGNE – 50 Level, deterministisch aus der Levelnummer
   ====================================================================== */

const val Z_CAMPAIGN_SIZE = 50
private const val CAMPAIGN_SEED = 0xC0FFE4

private fun lerp(a: Float, b: Float, t: Float) = a + (b - a) * t

private class CampaignDiff(
    val profile: ZProfile, val aiCount: Int,
    val width: Float, val height: Float,
    val cellsPerFaction: Int, val neutralCells: Int,
    val allowedTypes: List<String>, val symmetric: Boolean, val aiUnits: Float,
)

private fun campaignDifficulty(n: Int): CampaignDiff {
    val t = (n - 1) / (Z_CAMPAIGN_SIZE - 1).toFloat()
    val types = mutableListOf("normal")
    if (n >= 3) types.add("factory")
    if (n >= 6) types.add("healer")
    if (n >= 9) types.add("bunker")
    if (n >= 12) types.add("attacker")
    return CampaignDiff(
        profile = ZProfile(
            interval = lerp(5.5f, 1.6f, t),
            minUnits = lerp(20f, 8f, t).roundToInt(),
            commandsPerTick = if (n >= 40) 2 else 1,
            targetNoise = lerp(10f, 0f, t),
        ),
        aiCount = if (n <= 16) 1 else if (n <= 36) 2 else 3,
        width = lerp(900f, 1200f, t).roundToInt().toFloat(),
        height = lerp(580f, 760f, t).roundToInt().toFloat(),
        cellsPerFaction = if (n <= 8) 2 else if (n <= 30) 3 else 4,
        neutralCells = lerp(2f, 7f, t).roundToInt(),
        allowedTypes = types,
        symmetric = !(n >= 15 && n % 5 == 0),
        aiUnits = lerp(22f, 40f, t).roundToInt().toFloat(),
    )
}

fun generateCampaignLevel(n: Int): ZLevel {
    Z_CAMPAIGN_HANDBUILT[n]?.let { return it }
    val d = campaignDifficulty(n)
    // Math.imul(n, 2654435761) der Web-Version = Int-Multiplikation mit Überlauf
    val rng = Mulberry(CAMPAIGN_SEED xor (n * 0x9E3779B1.toInt()))
    val map = generateMap(
        GenParams(
            width = d.width, height = d.height,
            aiFactions = Z_AI_FACTIONS.take(d.aiCount),
            cellsPerFaction = d.cellsPerFaction,
            neutralCells = d.neutralCells,
            allowedTypes = d.allowedTypes,
            symmetric = d.symmetric,
            startUnitsPlayer = 30f, startUnitsAi = d.aiUnits,
        ),
        rng,
    )
    return map.copy(
        name = "Level $n",
        tag = "Kampagne",
        desc = if (d.aiCount == 1) "Ein KI-Gegner. Erobere alle gegnerischen Zellen."
        else "${d.aiCount} KI-Gegner, die auch einander bekämpfen. Erobere alle gegnerischen Zellen.",
        ai = Z_AI_FACTIONS.take(d.aiCount).associateWith { d.profile },
    )
}

/* ======================================================================
   ZUFALLSSPIEL
   ====================================================================== */

data class ZRandomSettings(
    var aiCount: Int = 1,
    var difficulty: String = "medium",
    var mapSize: String = "medium",
    var density: String = "normal",
    var cellMix: String = "all",
    var fairness: String = "symmetric",
    var seed: Int = 0,
)

private class MapSize(val width: Float, val height: Float, val factor: Float)

private val RANDOM_MAP_SIZES = mapOf(
    "small" to MapSize(900f, 580f, 0.8f),
    "medium" to MapSize(1100f, 700f, 1.0f),
    "large" to MapSize(1350f, 860f, 1.3f),
)
private val RANDOM_DENSITY = mapOf("low" to 3, "normal" to 6, "high" to 10)
private val RANDOM_CELL_MIX = mapOf(
    "normalOnly" to listOf("normal"),
    "standard" to listOf("normal", "factory", "healer"),
    "all" to listOf("normal", "factory", "healer", "bunker", "attacker"),
)

fun generateRandomLevel(s: ZRandomSettings): ZLevel {
    val rng = Mulberry(s.seed)
    val size = RANDOM_MAP_SIZES[s.mapSize] ?: RANDOM_MAP_SIZES.getValue("medium")
    val aiFactions = Z_AI_FACTIONS.take(s.aiCount)
    val handicap = s.fairness == "handicap"

    val map = generateMap(
        GenParams(
            width = size.width, height = size.height,
            aiFactions = aiFactions,
            cellsPerFaction = 3,
            neutralCells = ((RANDOM_DENSITY[s.density] ?: 6) * size.factor).roundToInt(),
            allowedTypes = RANDOM_CELL_MIX[s.cellMix] ?: RANDOM_CELL_MIX.getValue("all"),
            symmetric = s.fairness == "symmetric",
            startUnitsPlayer = 30f, startUnitsAi = if (handicap) 45f else 30f,
        ),
        rng,
    )
    val profile = Z_AI_PROFILES[s.difficulty] ?: Z_AI_PROFILES.getValue("medium")
    return map.copy(
        name = "Zufallskarte #${s.seed}",
        tag = "Zufall",
        desc = "${s.aiCount} KI-Gegner (${s.difficulty}), Karte ${s.mapSize}, Fairness: ${s.fairness}.",
        ai = aiFactions.associateWith { profile },
    )
}
