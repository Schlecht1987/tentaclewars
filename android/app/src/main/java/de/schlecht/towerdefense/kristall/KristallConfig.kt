package de.schlecht.towerdefense.kristall

/* ======================================================================
   KRISTALLKRIEG – Konfiguration (Werte identisch zur Web-Version)
   Konter-Dreieck: Schwertkämpfer > Bogenschütze > Lanzenreiter > Schwertkämpfer.
   ====================================================================== */

object KK {
    const val WIDTH = 960f
    const val HEIGHT = 540f
    val LANE_YS = floatArrayOf(120f, 270f, 420f) // Mittellinien der 3 Bahnen
    const val LANE_TAP_RADIUS = 80f
    const val PLAYER_SPAWN_X = 90f
    const val ENEMY_SPAWN_X = 870f
    const val PLAYER_BASE_EDGE = 62f  // x-Kante der Spielerbasis (Angriffsziel)
    const val ENEMY_BASE_EDGE = 898f
    const val BASE_HP = 900f
    const val BASE_GUN_RANGE = 180f   // Festungen verteidigen sich selbst
    const val BASE_GUN_DMG = 12f
    const val BASE_GUN_INTERVAL = 0.7f

    const val START_CRYSTALS = 60f
    const val BASE_INCOME = 3f        // Kristalle pro Sekunde Grundeinkommen
    const val COLLECTOR_INCOME = 2f   // pro Sammler zusätzlich
    const val COLLECTOR_MAX = 4
    const val COLLECTOR_BASE_COST = 60
    const val COLLECTOR_COST_STEP = 30 // Kosten = base + step * bereits gebaute

    const val TOWER_X = 480f          // Wachturm-Position (Bahn-Mitte)
    const val TOWER_CAPTURE_RADIUS = 85f
    const val TOWER_CAPTURE_NEED = 100f  // Ladung bis zur Eroberung
    const val TOWER_CAPTURE_RATE = 22f   // Ladung pro Sekunde und Einheit (max. 3 zählen)
    const val TOWER_RANGE = 150f
    const val TOWER_DMG = 9f
    const val TOWER_ATK_INTERVAL = 0.8f
    const val TOWER_INCOME = 1f       // Kristalle pro Sekunde je eigenem Turm

    const val UNIT_SPACING = 24f      // Mindestabstand zur vorderen eigenen Einheit
    const val MAX_UNITS_PER_SIDE = 60 // Sicherheitsdeckel

    const val COLOR_PLAYER = 0xFF5AD0C0.toInt()
    const val COLOR_ENEMY = 0xFFFF7A6B.toInt()
    const val COLOR_NEUTRAL = 0xFF8A97AD.toInt()
}

/** Einheitentyp. counters: Schadensmultiplikator gegen den jeweiligen Typ.
 *  vsBase/vsUnit: zusätzliche Multiplikatoren des Katapults. */
data class KUnitType(
    val key: String,
    val name: String,
    val icon: String,
    val cost: Int,
    val hp: Float,
    val dmg: Float,
    val atkInterval: Float,
    val range: Float,
    val speed: Float,
    val counters: Map<String, Float> = emptyMap(),
    val heal: Float = 0f,
    val vsBase: Float = 1f,
    val vsUnit: Float = 1f,
    val desc: String,
)

val KK_UNIT_TYPES = listOf(
    KUnitType(
        "sword", "Schwertkämpfer", "⚔️", 25,
        hp = 95f, dmg = 13f, atkInterval = 0.9f, range = 26f, speed = 46f,
        counters = mapOf("archer" to 2f),
        desc = "Solider Nahkämpfer. Stark gegen Bogenschützen.",
    ),
    KUnitType(
        "archer", "Bogenschütze", "🏹", 35,
        hp = 55f, dmg = 11f, atkInterval = 1.1f, range = 135f, speed = 42f,
        counters = mapOf("lancer" to 2f),
        desc = "Fernkampf. Stark gegen Lanzenreiter, schwach im Nahkampf.",
    ),
    KUnitType(
        "lancer", "Lanzenreiter", "🐴", 40,
        hp = 120f, dmg = 15f, atkInterval = 1.0f, range = 28f, speed = 75f,
        counters = mapOf("sword" to 2f),
        desc = "Schnell und robust. Stark gegen Schwertkämpfer.",
    ),
    KUnitType(
        "healer", "Heiler", "💚", 45,
        hp = 60f, dmg = 0f, atkInterval = 1f, range = 90f, speed = 40f,
        heal = 9f,
        desc = "Kämpft nicht, heilt Verbündete in der Nähe.",
    ),
    KUnitType(
        "siege", "Katapult", "🪨", 70,
        hp = 80f, dmg = 30f, atkInterval = 2.2f, range = 165f, speed = 30f,
        vsBase = 4f, vsUnit = 0.35f,
        desc = "Langsam. Enormer Schaden gegen die gegnerische Basis, kaum gegen Einheiten.",
    ),
)

fun kkUnitType(key: String) = KK_UNIT_TYPES.first { it.key == key }

/** KI-Schwierigkeit: Entscheidungstakt, Einkommens-Multiplikator,
 *  Konter-Wahrscheinlichkeit und Wirtschafts-Ziel. */
data class KkDifficulty(
    val key: String, val name: String,
    val interval: Float, val incomeMul: Float, val smart: Float, val ecoTarget: Int,
)

val KK_DIFFICULTIES = listOf(
    KkDifficulty("leicht", "Leicht", 3.0f, 0.7f, 0.25f, 2),
    KkDifficulty("mittel", "Mittel", 1.8f, 1.0f, 0.65f, 3),
    KkDifficulty("schwer", "Schwer", 1.2f, 1.15f, 0.9f, 4),
)
