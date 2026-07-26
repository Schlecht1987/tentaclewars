package de.schlecht.towerdefense.zell

/* ======================================================================
   ZELLKRIEG – Konfiguration (Werte identisch zur Web-Version)
   ====================================================================== */

object ZK {
    // --- Simulation ---
    const val SIM_TICK_RATE = 30f     // feste Simulationsrate (Hz)

    // --- Tentakel ---
    const val TENTACLE_SPEED = 55f    // Wachstums-Geschwindigkeit der Spitze (Welt-Pixel/s)
    const val RETRACT_SPEED = 130f    // Einziehen bzw. abgetrennte Stücke
    const val LENGTH_PER_UNIT = 22f   // Pixel Tentakel pro Punkt: Wachstum KOSTET Punkte
    const val TRANSFER_RATE = 20f     // max. Punkte/s pro angedockter Tentakel
    const val FLOW_DOT_SPEED = 80f    // rein visuell: Fluss-Punkte auf der Tentakel
    const val PIPELINE_BATCH_TICKS = 3

    // Gestufte Fluss-Punkt-Geschwindigkeit je nach Durchsatz (rein kosmetisch)
    val FLOW_SPEED_TIERS = listOf(1.5f to 1f, 3.5f to 1.6f, Float.MAX_VALUE to 2.5f)

    const val OVERFLOW_BUFFER = 12f   // Überschuss-Puffer voller Zellen (Symbiose)

    // --- Tentakel-Slots ---
    const val SLOT_BASE = 1
    const val SLOT_STEP = 25
    const val SLOT_MAX = 4

    // --- Sonstiges ---
    const val BUNKER_DEFENSE = 1f     // Bunker halbiert Schaden pro Punkt (2^1)
    const val NEUTRAL_PRODUCES = false
    const val CAPTURE_CHARGE = 15f    // Aufladung bis zur Eroberung einer Neutralen

    // --- Zell-Ausbau (Stufen) ---
    val TIER_UP = floatArrayOf(40f, 80f, 120f)
    val TIER_DOWN = floatArrayOf(20f, 60f, 100f)
    val TIER_MAX_UNITS = floatArrayOf(-1f, 90f, 130f, 170f) // -1 = Typ-Max
    val TIER_PROD_MUL = floatArrayOf(1f, 1.25f, 1.5f, 1.8f)
    val TIER_RADIUS_ADD = floatArrayOf(0f, 4f, 8f, 13f)

    // --- Kamera ---
    const val MAX_ZOOM = 2.5f
    const val START_ZOOM = 1.35f // Start-Zoom auf die Heimatzelle (größere Darstellung);
                                 // herauszoomen bis 1 (ganze Karte) per Pinch möglich
}

data class ZCellType(
    val label: String, val prod: Float, val max: Float,
    val attack: Float, val heal: Float, val radius: Float,
)

val Z_CELL_TYPES = mapOf(
    "normal" to ZCellType("Normal", 1.0f, 50f, 1f, 1f, 26f),
    "healer" to ZCellType("Heiler", 1.0f, 50f, 1f, 2f, 26f),
    "attacker" to ZCellType("Angreifer", 1.0f, 50f, 2f, 1f, 25f),
    "factory" to ZCellType("Fabrik", 2.0f, 25f, 1f, 1f, 22f),
    "bunker" to ZCellType("Bunker", 0.5f, 100f, 1f, 1f, 33f),
)

// Besitzer-Farben
val Z_OWNER_COLOR = mapOf(
    "player" to 0xFF4FC1FF.toInt(),
    "enemy" to 0xFFFF5964.toInt(),
    "enemy2" to 0xFFFFB347.toInt(),
    "enemy3" to 0xFFB06BFF.toInt(),
    "neutral" to 0xFF8593A1.toInt(),
)

val Z_AI_FACTIONS = listOf("enemy", "enemy2", "enemy3")

val Z_OWNER_LABEL = mapOf(
    "player" to "Spieler", "enemy" to "KI Rot", "enemy2" to "KI Bernstein",
    "enemy3" to "KI Violett", "neutral" to "Neutral",
)

/** KI-Profil: Takt, Mindest-Vorrat, Befehle pro Zug, Ziel-Rauschen. */
data class ZProfile(
    val interval: Float, val minUnits: Int,
    val commandsPerTick: Int, val targetNoise: Float,
)

val Z_AI_PROFILES = mapOf(
    "easy" to ZProfile(4.5f, 18, 1, 8f),
    "medium" to ZProfile(3.0f, 12, 1, 3f),
    "hard" to ZProfile(2.0f, 8, 2, 0f),
)

/** Zell-Vorlage eines Levels. */
data class ZCellSpec(
    val id: String, val type: String, val owner: String,
    val x: Float, val y: Float, val units: Float, val tierMax: Int = 0,
)

/** Level-Definition (handgebaut oder generiert). */
data class ZLevel(
    val name: String,
    val desc: String,
    val tag: String,
    val sandbox: Boolean,
    val width: Float,
    val height: Float,
    val ai: Map<String, ZProfile> = emptyMap(),
    val cells: List<ZCellSpec>,
)

fun zProfileFor(level: ZLevel, owner: String): ZProfile =
    level.ai[owner] ?: Z_AI_PROFILES.getValue("medium")

/* ======================================================================
   DETERMINISTISCHER ZUFALL (mulberry32) – identisch zur Web-Version,
   damit Kampagnen-Level und Seeds reproduzierbar sind.
   ====================================================================== */

class Mulberry(seed: Int) {
    private var a = seed

    /** Liefert eine Zahl in [0, 1). */
    fun next(): Double {
        a += 0x6D2B79F5
        var t = (a xor (a ushr 15)) * (1 or a)
        t = (t + ((t xor (t ushr 7)) * (61 or t))) xor t
        return ((t xor (t ushr 14)).toLong() and 0xFFFFFFFFL).toDouble() / 4294967296.0
    }

    /** Ganzzahl in [min, max] (beide inklusive). */
    fun int(min: Int, max: Int) = min + (next() * (max - min + 1)).toInt()

    fun <T> pick(list: List<T>): T = list[(next() * list.size).toInt()]

    /** Gewichtete Auswahl (Reihenfolge der Einträge ist relevant!). */
    fun weighted(weights: List<Pair<String, Int>>): String {
        var total = 0
        for ((_, w) in weights) total += w
        var roll = next() * total
        for ((k, w) in weights) {
            roll -= w
            if (roll <= 0) return k
        }
        return weights.last().first
    }
}
