package de.schlecht.towerdefense.zell

/* ======================================================================
   HANDGEBAUTE LEVEL (identisch zur Web-Version)
   ====================================================================== */

val Z_SANDBOX_LEVEL = ZLevel(
    name = "Testlabor",
    desc = "Alle fünf Zelltypen auf beiden Seiten. Du steuerst ALLE Parteien – keine KI, kein Spielende.",
    tag = "Sandbox",
    sandbox = true,
    width = 1000f, height = 640f,
    cells = listOf(
        ZCellSpec("L1", "normal", "player", 150f, 130f, 30f, 3),
        ZCellSpec("L2", "healer", "player", 110f, 300f, 30f, 2),
        ZCellSpec("L3", "attacker", "player", 150f, 470f, 30f, 2),
        ZCellSpec("L4", "factory", "player", 270f, 210f, 15f, 0),
        ZCellSpec("L5", "bunker", "player", 270f, 400f, 40f, 1),
        ZCellSpec("M1", "normal", "neutral", 500f, 140f, 15f, 2),
        ZCellSpec("M2", "bunker", "neutral", 500f, 320f, 25f, 1),
        ZCellSpec("M3", "normal", "neutral", 500f, 500f, 15f, 3),
        ZCellSpec("R1", "normal", "enemy", 850f, 130f, 30f, 3),
        ZCellSpec("R2", "healer", "enemy", 890f, 300f, 30f, 2),
        ZCellSpec("R3", "attacker", "enemy", 850f, 470f, 30f, 2),
        ZCellSpec("R4", "factory", "enemy", 730f, 210f, 15f, 0),
        ZCellSpec("R5", "bunker", "enemy", 730f, 400f, 40f, 1),
    ),
)

private fun profiles(vararg pairs: Pair<String, String>): Map<String, ZProfile> =
    pairs.associate { (owner, name) -> owner to Z_AI_PROFILES.getValue(name) }

val Z_CAMPAIGN_HANDBUILT: Map<Int, ZLevel> = mapOf(
    1 to ZLevel(
        name = "Level 1 – Erstkontakt",
        desc = "Sanfter Einstieg: nur normale Zellen, eine zögerliche KI. Erobere alle roten Zellen.",
        tag = "Kampagne", sandbox = false,
        width = 1000f, height = 640f,
        ai = profiles("enemy" to "easy"),
        cells = listOf(
            ZCellSpec("P0", "normal", "player", 160f, 320f, 30f, 3),
            ZCellSpec("P1", "normal", "player", 300f, 480f, 12f, 1),
            ZCellSpec("N0", "normal", "neutral", 500f, 190f, 10f, 2),
            ZCellSpec("N1", "normal", "neutral", 520f, 450f, 14f, 1),
            ZCellSpec("E0", "normal", "enemy", 840f, 320f, 30f, 3),
            ZCellSpec("E1", "normal", "enemy", 700f, 160f, 12f, 1),
        ),
    ),
    10 to ZLevel(
        name = "Level 10 – Die Festung",
        desc = "Boss: Ein Bunker-Wall schützt das rote Hinterland. Angreifer-Zellen knacken Bunker am schnellsten.",
        tag = "Kampagne", sandbox = false,
        width = 1100f, height = 700f,
        ai = profiles("enemy" to "medium"),
        cells = listOf(
            ZCellSpec("P0", "normal", "player", 150f, 350f, 35f, 3),
            ZCellSpec("P1", "factory", "player", 260f, 500f, 15f, 0),
            ZCellSpec("P2", "healer", "player", 240f, 200f, 18f, 2),
            ZCellSpec("N0", "attacker", "neutral", 470f, 350f, 18f, 2),
            ZCellSpec("N1", "normal", "neutral", 520f, 120f, 12f, 1),
            ZCellSpec("N2", "normal", "neutral", 520f, 580f, 12f, 1),
            ZCellSpec("B0", "bunker", "enemy", 720f, 190f, 35f, 1),
            ZCellSpec("B1", "bunker", "enemy", 700f, 350f, 40f, 1),
            ZCellSpec("B2", "bunker", "enemy", 720f, 510f, 35f, 1),
            ZCellSpec("E0", "factory", "enemy", 900f, 250f, 18f, 0),
            ZCellSpec("E1", "healer", "enemy", 930f, 430f, 25f, 2),
            ZCellSpec("E2", "normal", "enemy", 990f, 340f, 30f, 3),
        ),
    ),
    50 to ZLevel(
        name = "Level 50 – Endkampf",
        desc = "Finale: Drei harte KIs an drei Ecken, umkämpfte Heiler und ein Bunker im Zentrum. Alles oder nichts.",
        tag = "Kampagne", sandbox = false,
        width = 1350f, height = 860f,
        ai = profiles("enemy" to "hard", "enemy2" to "hard", "enemy3" to "hard"),
        cells = listOf(
            ZCellSpec("P0", "normal", "player", 200f, 700f, 40f, 3),
            ZCellSpec("P1", "factory", "player", 330f, 760f, 15f, 0),
            ZCellSpec("P2", "healer", "player", 150f, 560f, 20f, 2),
            ZCellSpec("P3", "attacker", "player", 340f, 600f, 15f, 2),
            ZCellSpec("E0", "normal", "enemy", 1150f, 160f, 40f, 3),
            ZCellSpec("E1", "factory", "enemy", 1020f, 100f, 15f, 0),
            ZCellSpec("E2", "healer", "enemy", 1200f, 300f, 20f, 2),
            ZCellSpec("E3", "attacker", "enemy", 1010f, 240f, 15f, 2),
            ZCellSpec("F0", "normal", "enemy2", 200f, 160f, 40f, 3),
            ZCellSpec("F1", "factory", "enemy2", 330f, 100f, 15f, 0),
            ZCellSpec("F2", "healer", "enemy2", 150f, 300f, 20f, 2),
            ZCellSpec("F3", "attacker", "enemy2", 340f, 240f, 15f, 2),
            ZCellSpec("G0", "normal", "enemy3", 1150f, 700f, 40f, 3),
            ZCellSpec("G1", "factory", "enemy3", 1020f, 760f, 15f, 0),
            ZCellSpec("G2", "healer", "enemy3", 1200f, 560f, 20f, 2),
            ZCellSpec("G3", "attacker", "enemy3", 1010f, 620f, 15f, 2),
            ZCellSpec("N0", "bunker", "neutral", 675f, 430f, 30f, 1),
            ZCellSpec("N1", "healer", "neutral", 675f, 250f, 18f, 2),
            ZCellSpec("N2", "healer", "neutral", 675f, 610f, 18f, 2),
            ZCellSpec("N3", "normal", "neutral", 480f, 430f, 15f, 3),
            ZCellSpec("N4", "normal", "neutral", 870f, 430f, 15f, 3),
        ),
    ),
)
