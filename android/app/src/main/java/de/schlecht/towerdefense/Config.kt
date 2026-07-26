package de.schlecht.towerdefense

import kotlin.math.floor
import kotlin.math.min
import kotlin.math.pow

// Zentrale Spiel-Konfiguration – Werte identisch zur Web-Version
object Config {
    const val TILE = 40f
    const val COLS = 24
    const val ROWS = 16
}

// ---- Balance-Stellschrauben (über den 🛠-Dialog live editierbar) ----
object Tuning {
    var hpGrowth = 1.17f     // Faktor, mit dem Gegner-HP pro Welle wachsen (exponentiell)
    var hpMulGlobal = 1f     // globaler Multiplikator auf alle Gegner-HP
    var goldGrowth = 0.07f   // Gold-Zuwachs pro Welle (linear, +7 %/Welle)
    var goldMulGlobal = 1f   // globaler Multiplikator auf Gegner-Gold
    var speedGrowth = 0.02f  // Tempo-Zuwachs der Gegner pro Welle
    var speedMax = 1.5f      // Obergrenze des Tempo-Zuwachses
    var waveBonusBase = 20f  // Gold-Bonus pro geschaffter Welle (+ Welle * 3)
    var towerDmgMul = 1f     // globaler Multiplikator auf allen Turmschaden
    var startGoldBonus = 0f  // zusätzliches Startgold (gilt ab Levelstart/Neustart)
    var stunImmunity = 5f    // Sekunden Betäubungs-Immunität nach einer Betäubung

    class Field(
        val key: String, val default: Float, val info: String,
        val get: () -> Float, val set: (Float) -> Unit,
    )

    val fields = listOf(
        Field("hpGrowth", 1.17f, "Exponentielles HP-Wachstum der Gegner pro Welle. 1.17 = +17 % pro Welle. Wichtigster Schwierigkeits-Regler fürs Lategame.", { hpGrowth }, { hpGrowth = it }),
        Field("hpMulGlobal", 1f, "Globaler Faktor auf alle Gegner-HP (zusätzlich zum Level-hpMul). 1 = normal, 1.2 = alle Gegner 20 % zäher.", { hpMulGlobal }, { hpMulGlobal = it }),
        Field("goldGrowth", 0.07f, "Wie stark das Gold pro Gegner mit jeder Welle steigt (linear). 0.07 = +7 % pro Welle.", { goldGrowth }, { goldGrowth = it }),
        Field("goldMulGlobal", 1f, "Globaler Faktor auf das Gold aller Gegner. 1 = normal, 0.8 = 20 % weniger Einkommen.", { goldMulGlobal }, { goldMulGlobal = it }),
        Field("speedGrowth", 0.02f, "Wie viel schneller die Gegner pro Welle werden. 0.02 = +2 % pro Welle (bis zur Obergrenze).", { speedGrowth }, { speedGrowth = it }),
        Field("speedMax", 1.5f, "Obergrenze des Tempo-Zuwachses. 1.5 = Gegner werden maximal 50 % schneller als ihr Grundtempo.", { speedMax }, { speedMax = it }),
        Field("waveBonusBase", 20f, "Gold-Grundbonus nach jeder geschafften Welle (dazu kommt Welle × 3).", { waveBonusBase }, { waveBonusBase = it }),
        Field("towerDmgMul", 1f, "Globaler Faktor auf den Schaden ALLER Türme. 1 = normal, 0.9 = alle Türme 10 % schwächer.", { towerDmgMul }, { towerDmgMul = it }),
        Field("startGoldBonus", 0f, "Zusätzliches Startgold, wird beim Levelstart/Neustart auf das Level-Startgold addiert (z. B. 100).", { startGoldBonus }, { startGoldBonus = it }),
        Field("stunImmunity", 5f, "Sekunden Betäubungs-Immunität nach einer Betäubung. Verhindert Dauer-Stun-Ketten. 0 = keine Immunität.", { stunImmunity }, { stunImmunity = it }),
    )

    fun reset() {
        for (f in fields) f.set(f.default)
    }
}

// ---- Kampagne: 10 Level mit eigener Karte + Schwierigkeit ----
// waypoints: Gitter-Wegpunkte (Spalte, Reihe), nur horizontale/vertikale Segmente.
// hpMul skaliert die Gegner-HP zusätzlich zur Wellen-Skalierung.
data class LevelDef(
    val name: String, val desc: String, val waves: Int,
    val startGold: Int, val startLives: Int, val hpMul: Float,
    val waypoints: List<Pair<Int, Int>>,
)

val LEVELS = listOf(
    LevelDef(
        "Grüne Wiese", "Langer Schlangenpfad – viel Zeit zum Schießen.",
        12, 200, 25, 0.75f,
        listOf(-1 to 2, 4 to 2, 4 to 13, 9 to 13, 9 to 4, 14 to 4, 14 to 13, 19 to 13, 19 to 4, 24 to 4),
    ),
    LevelDef(
        "Flusslauf", "Gemächliche Kurven durchs Tal.",
        14, 180, 20, 0.85f,
        listOf(-1 to 8, 5 to 8, 5 to 3, 11 to 3, 11 to 12, 17 to 12, 17 to 5, 24 to 5),
    ),
    LevelDef(
        "Die Spirale", "Der Pfad windet sich zur Burg in der Mitte.",
        16, 170, 20, 0.95f,
        listOf(-1 to 1, 21 to 1, 21 to 14, 3 to 14, 3 to 5, 17 to 5, 17 to 10, 8 to 10),
    ),
    LevelDef(
        "Altes Schlachtfeld", "Die klassische Karte – verschlungen und lang.",
        18, 160, 20, 1.0f,
        listOf(-1 to 3, 4 to 3, 4 to 9, 10 to 9, 10 to 2, 16 to 2, 16 to 12, 6 to 12, 6 to 14, 20 to 14, 20 to 6, 24 to 6),
    ),
    LevelDef(
        "Doppel-U", "Zwei weite Bögen – nutze die Innenseiten.",
        20, 160, 18, 1.05f,
        listOf(-1 to 4, 20 to 4, 20 to 8, 4 to 8, 4 to 12, 24 to 12),
    ),
    LevelDef(
        "Der Haken", "Nur eine Kehre – die Gegner sind schnell durch.",
        22, 150, 15, 1.1f,
        listOf(-1 to 13, 12 to 13, 12 to 2, 24 to 2),
    ),
    LevelDef(
        "S-Kurve", "Kurzes Stück Straße, harte Wellen.",
        24, 150, 15, 1.15f,
        listOf(-1 to 6, 8 to 6, 8 to 10, 16 to 10, 16 to 6, 24 to 6),
    ),
    LevelDef(
        "Die Treppe", "Stufe um Stufe hinab zur Festung.",
        26, 140, 12, 1.2f,
        listOf(-1 to 2, 5 to 2, 5 to 5, 10 to 5, 10 to 8, 15 to 8, 15 to 11, 20 to 11, 20 to 14, 24 to 14),
    ),
    LevelDef(
        "Schnellstraße", "Fast kein Umweg – jeder Schuss muss sitzen.",
        28, 140, 10, 1.3f,
        listOf(-1 to 7, 16 to 7, 16 to 9, 24 to 9),
    ),
    LevelDef(
        "Der letzte Wall", "Schnurgerade durch – das Finale.",
        30, 160, 10, 1.4f,
        listOf(-1 to 8, 24 to 8),
    ),
)

data class TowerLevel(
    val damage: Float = 0f,
    val range: Float = 0f,
    val fireRate: Float = 1f,        // Zeit zwischen Schüssen (s)
    val targets: Int = 1,            // max. gleichzeitige Ziele (999 = alle in Reichweite)
    val splash: Float? = null,
    val slow: Float? = null,
    val slowDuration: Float = 0f,
    val stun: Float = 0f,            // Betäubungsdauer (s) bei Treffern
    val critEvery: Int = 0,          // jeder n-te Schuss ist kritisch (0 = nie)
    val critMult: Float = 2f,
    val buff: Float? = null,         // Schadens-Buff (Verstärker)
    val rateBuff: Float? = null,     // Tempo-Buff (Taktgeber)
    val upgradeCost: Int = 0,
)

data class ProjectileDef(val speed: Float, val color: Int, val size: Float)

data class TowerType(
    val key: String,
    val name: String,
    val icon: String,
    val desc: String,
    val cost: Int,
    val color: Int,
    val levels: List<TowerLevel>,
    val projectile: ProjectileDef? = null,
)

val TOWER_TYPES = listOf(
    TowerType(
        "arrow", "Bogenschütze", "🏹",
        "Schnell, günstig – ab Lv. 2 Mehrfachschuss, ab Lv. 3 alle Ziele in Reichweite",
        50, 0xFF8AC06A.toInt(),
        listOf(
            TowerLevel(damage = 12f, range = 110f, fireRate = 0.5f, targets = 1),
            TowerLevel(damage = 15f, range = 125f, fireRate = 0.44f, targets = 3, upgradeCost = 70),
            TowerLevel(damage = 20f, range = 135f, fireRate = 0.4f, targets = 999, upgradeCost = 160),
            TowerLevel(damage = 32f, range = 150f, fireRate = 0.34f, targets = 999, upgradeCost = 300),
        ),
        ProjectileDef(420f, 0xFFD8F0C0.toInt(), 4f),
    ),
    TowerType(
        "cannon", "Kanone", "💣",
        "Flächenschaden, langsam – ab Lv. 3 betäubt die Explosion kurz",
        100, 0xFFC9924A.toInt(),
        listOf(
            TowerLevel(damage = 30f, range = 100f, fireRate = 1.4f, splash = 55f),
            TowerLevel(damage = 55f, range = 110f, fireRate = 1.25f, splash = 65f, upgradeCost = 110),
            TowerLevel(damage = 95f, range = 120f, fireRate = 1.1f, splash = 80f, stun = 0.4f, upgradeCost = 240),
        ),
        ProjectileDef(260f, 0xFFFFB347.toInt(), 6f),
    ),
    TowerType(
        "frost", "Frostturm", "❄️",
        "Verlangsamt Gegner – ab Lv. 3 Frostbombe (verlangsamt alle im Radius)",
        80, 0xFF6AB8D8.toInt(),
        listOf(
            TowerLevel(damage = 6f, range = 95f, fireRate = 0.8f, slow = 0.5f, slowDuration = 1.5f),
            TowerLevel(damage = 12f, range = 110f, fireRate = 0.7f, slow = 0.6f, slowDuration = 2.0f, upgradeCost = 90),
            TowerLevel(damage = 18f, range = 125f, fireRate = 1.0f, slow = 0.65f, slowDuration = 2.2f, splash = 60f, upgradeCost = 200),
        ),
        ProjectileDef(340f, 0xFFBFEAFF.toInt(), 5f),
    ),
    TowerType(
        "sniper", "Scharfschütze", "🎯",
        "Hoher Schaden, große Reichweite – ab Lv. 2 kritische Treffer",
        150, 0xFFB06AC0.toInt(),
        listOf(
            TowerLevel(damage = 90f, range = 220f, fireRate = 2.2f),
            TowerLevel(damage = 160f, range = 250f, fireRate = 2.0f, critEvery = 3, critMult = 2f, upgradeCost = 170),
            TowerLevel(damage = 260f, range = 280f, fireRate = 1.8f, critEvery = 2, critMult = 2f, upgradeCost = 340),
        ),
        ProjectileDef(700f, 0xFFF0C0FF.toInt(), 4f),
    ),
    TowerType(
        "booster", "Verstärker", "⚡",
        "Schießt nicht – erhöht den Schaden aller Türme in Reichweite",
        120, 0xFFE0D05A.toInt(),
        listOf(
            TowerLevel(buff = 0.3f, range = 90f),
            TowerLevel(buff = 0.5f, range = 105f, upgradeCost = 140),
            TowerLevel(buff = 0.75f, range = 120f, upgradeCost = 280),
        ),
    ),
    TowerType(
        "haste", "Taktgeber", "⏩",
        "Schießt nicht – erhöht die Angriffsgeschwindigkeit aller Türme in Reichweite",
        120, 0xFF5AD08A.toInt(),
        listOf(
            TowerLevel(rateBuff = 0.2f, range = 90f),
            TowerLevel(rateBuff = 0.35f, range = 105f, upgradeCost = 140),
            TowerLevel(rateBuff = 0.5f, range = 120f, upgradeCost = 280),
        ),
    ),
)

fun towerType(key: String) = TOWER_TYPES.first { it.key == key }

data class EnemyType(
    val name: String, val hp: Float, val speed: Float,
    val gold: Int, val color: Int, val size: Float,
)

val ENEMY_TYPES = mapOf(
    "runner" to EnemyType("Läufer", 45f, 90f, 4, 0xFFE2C05A.toInt(), 10f),
    "soldier" to EnemyType("Soldat", 110f, 60f, 7, 0xFFD06A5A.toInt(), 12f),
    "tank" to EnemyType("Panzer", 380f, 38f, 18, 0xFF8A6AD0.toInt(), 16f),
    "swift" to EnemyType("Flitzer", 65f, 145f, 8, 0xFF5AD0C0.toInt(), 9f),
    "boss" to EnemyType("Boss", 2000f, 30f, 100, 0xFFE05A8A.toInt(), 22f),
)

data class WaveGroup(val type: String, val count: Int, val interval: Float)
data class Wave(val groups: List<WaveGroup>, val hpScale: Float, val goldScale: Float, val speedScale: Float)

// Wellen-Generator: liefert für Wellennummer n die Zusammensetzung.
// hpMul: zusätzlicher Level-Multiplikator auf die Gegner-HP.
fun buildWave(n: Int, hpMul: Float): Wave {
    val groups = mutableListOf<WaveGroup>()
    // HP wächst exponentiell – Gold nur linear
    val hpScale = Tuning.hpGrowth.pow(n - 1) * hpMul * Tuning.hpMulGlobal
    val goldScale = (1f + (n - 1) * Tuning.goldGrowth) * Tuning.goldMulGlobal
    val speedScale = min(Tuning.speedMax, 1f + (n - 1) * Tuning.speedGrowth)

    groups.add(WaveGroup("runner", 6 + n * 2, 0.75f))
    if (n >= 3) groups.add(WaveGroup("soldier", 3 + n, 1.0f))
    if (n >= 5) groups.add(WaveGroup("swift", 4 + n, 0.45f))
    if (n >= 7) groups.add(WaveGroup("tank", 1 + floor(n / 2.0).toInt(), 1.8f))
    if (n % 10 == 0) groups.add(WaveGroup("boss", n / 10, 4.0f))

    return Wave(groups, hpScale, goldScale, speedScale)
}
