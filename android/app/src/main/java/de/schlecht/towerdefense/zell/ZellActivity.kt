package de.schlecht.towerdefense.zell

import android.annotation.SuppressLint
import android.content.Context
import android.graphics.Color
import android.os.Bundle
import android.view.Gravity
import android.view.View
import android.view.WindowManager
import android.widget.Button
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import androidx.appcompat.app.AlertDialog
import androidx.appcompat.app.AppCompatActivity
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat
import de.schlecht.towerdefense.R
import kotlin.random.Random

/** Woher stammt das laufende Level? Steuert Fortschritt & "Weiter"-Knopf. */
object ZellSession {
    var kind = "none" // "campaign" | "random" | "sandbox"
    var campaignN = 0
    var randomSettings = ZRandomSettings(seed = Random.nextInt(0xFFFFFF))
}

class ZellActivity : AppCompatActivity() {

    private lateinit var zkView: ZellView
    private lateinit var chips: LinearLayout
    private lateinit var hint: TextView
    private lateinit var btnPause: Button
    private lateinit var menuOverlay: ScrollView
    private lateinit var randomOverlay: ScrollView
    private lateinit var campaignGrid: LinearLayout
    private lateinit var randomOptions: LinearLayout
    private lateinit var seedLabel: TextView

    private val engine get() = zkView.engine
    private val chipViews = mutableListOf<Pair<TextView, String>>()
    private var endDialogShown = false

    private val hintText =
        "Ziehen: Tentakel ausfahren · Ziel erneut antippen: einziehen · über EIGENE Tentakel wischen: schneiden · 2 Finger: Karte bewegen/zoomen"

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_zell)

        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        WindowCompat.setDecorFitsSystemWindows(window, false)
        WindowInsetsControllerCompat(window, window.decorView).apply {
            hide(WindowInsetsCompat.Type.systemBars())
            systemBarsBehavior = WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
        }

        zkView = findViewById(R.id.zkView)
        chips = findViewById(R.id.zkChips)
        hint = findViewById(R.id.zkHint)
        btnPause = findViewById(R.id.zkPause)
        menuOverlay = findViewById(R.id.zkMenu)
        randomOverlay = findViewById(R.id.zkRandom)
        campaignGrid = findViewById(R.id.zkGrid)
        randomOptions = findViewById(R.id.zkRandomOptions)
        seedLabel = findViewById(R.id.zkSeedLabel)

        loadRandomSettings()

        btnPause.setOnClickListener {
            if (!engine.gameOver && !engine.inMenu) {
                engine.paused = !engine.paused
                btnPause.text = if (engine.paused) "▶" else "⏸"
            }
        }
        findViewById<Button>(R.id.zkRestart).setOnClickListener {
            if (!engine.inMenu) restartLevel()
        }
        findViewById<Button>(R.id.zkMenuBtn).setOnClickListener { showLevelMenu() }
        findViewById<Button>(R.id.zkRandomBtn).setOnClickListener { showRandomSetup() }
        findViewById<Button>(R.id.zkSandboxBtn).setOnClickListener {
            ZellSession.kind = "sandbox"
            startLevel(Z_SANDBOX_LEVEL)
        }
        findViewById<Button>(R.id.zkRandomBack).setOnClickListener { showLevelMenu() }
        findViewById<Button>(R.id.zkRandomStart).setOnClickListener { startRandomGame() }
        findViewById<Button>(R.id.zkResume).setOnClickListener {
            engine.inMenu = false
            menuOverlay.visibility = View.GONE
        }
        findViewById<Button>(R.id.zkReroll).setOnClickListener {
            ZellSession.randomSettings.seed = Random.nextInt(0xFFFFFF)
            saveRandomSettings()
            updateSeedLabel()
        }

        engine.onGameEnd = { won -> runOnUiThread { showGameEnd(won) } }
        zkView.onUiUpdate = { runOnUiThread { updateChips() } }

        hint.text = hintText
        if (engine.inMenu) showLevelMenu() else buildChips()
    }

    override fun onResume() { super.onResume(); zkView.start() }
    override fun onPause() { super.onPause(); zkView.stop() }

    // ---- Levels starten ----

    private fun startLevel(lv: ZLevel) {
        endDialogShown = false
        engine.loadLevel(lv)
        zkView.onLevelLoaded()
        buildChips()
        btnPause.text = "⏸"
        menuOverlay.visibility = View.GONE
        randomOverlay.visibility = View.GONE
        hint.text = (if (lv.sandbox) "TESTLABOR – du steuerst ALLE Parteien. " else "") + hintText
    }

    private fun restartLevel() {
        endDialogShown = false
        engine.reset()
        engine.inMenu = false
        zkView.onLevelLoaded()
        btnPause.text = "⏸"
        buildChips()
    }

    private fun startRandomGame() {
        saveRandomSettings()
        ZellSession.kind = "random"
        startLevel(generateRandomLevel(ZellSession.randomSettings.copy()))
    }

    // ---- Menüs ----

    private fun showLevelMenu() {
        engine.inMenu = true
        buildCampaignGrid()
        // "Weiter spielen" nur zeigen, wenn ein Spiel läuft
        findViewById<Button>(R.id.zkResume).visibility =
            if (engine.cells.isNotEmpty() && !engine.gameOver) View.VISIBLE else View.GONE
        randomOverlay.visibility = View.GONE
        menuOverlay.visibility = View.VISIBLE
    }

    private fun dp(v: Float) = (v * resources.displayMetrics.density).toInt()

    @SuppressLint("SetTextI18n")
    private fun buildCampaignGrid() {
        campaignGrid.removeAllViews()
        val completed = completedLevels()
        val cols = 10
        var row: LinearLayout? = null
        for (n in 1..Z_CAMPAIGN_SIZE) {
            if ((n - 1) % cols == 0) {
                row = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL }
                campaignGrid.addView(row)
            }
            val done = n in completed
            val unlocked = n == 1 || (n - 1) in completed
            val tile = TextView(this).apply {
                text = if (done) "✔" else "$n"
                gravity = Gravity.CENTER
                textSize = 13f
                setTextColor(when {
                    done -> 0xFF7EE08A.toInt()
                    unlocked -> 0xFFEAF2FA.toInt()
                    else -> 0xFF5A6478.toInt()
                })
                setBackgroundResource(R.drawable.bg_shop_item)
                alpha = if (unlocked || done) 1f else 0.4f
                layoutParams = LinearLayout.LayoutParams(dp(42f), dp(38f)).apply {
                    setMargins(dp(2f), dp(2f), dp(2f), dp(2f))
                }
                if (unlocked || done) {
                    setOnClickListener {
                        ZellSession.kind = "campaign"
                        ZellSession.campaignN = n
                        startLevel(generateCampaignLevel(n))
                    }
                }
            }
            row!!.addView(tile)
        }
    }

    private val optionRows = listOf(
        Triple("aiCount", "Gegner", listOf("1" to "1 KI", "2" to "2 KIs", "3" to "3 KIs")),
        Triple("difficulty", "Schwierigkeit", listOf("easy" to "Leicht", "medium" to "Mittel", "hard" to "Schwer")),
        Triple("mapSize", "Kartengröße", listOf("small" to "Klein", "medium" to "Mittel", "large" to "Groß")),
        Triple("density", "Zelldichte", listOf("low" to "Wenig", "normal" to "Normal", "high" to "Viel")),
        Triple("cellMix", "Zelltypen", listOf("normalOnly" to "Nur Normal", "standard" to "Standard", "all" to "Alle fünf")),
        Triple("fairness", "Fairness", listOf("symmetric" to "Symmetrisch", "random" to "Zufällig", "handicap" to "Handicap")),
    )

    private fun getSetting(key: String): String = with(ZellSession.randomSettings) {
        when (key) {
            "aiCount" -> aiCount.toString()
            "difficulty" -> difficulty
            "mapSize" -> mapSize
            "density" -> density
            "cellMix" -> cellMix
            else -> fairness
        }
    }

    private fun setSetting(key: String, value: String) = with(ZellSession.randomSettings) {
        when (key) {
            "aiCount" -> aiCount = value.toInt()
            "difficulty" -> difficulty = value
            "mapSize" -> mapSize = value
            "density" -> density = value
            "cellMix" -> cellMix = value
            else -> fairness = value
        }
    }

    private fun showRandomSetup() {
        engine.inMenu = true
        buildRandomForm()
        menuOverlay.visibility = View.GONE
        randomOverlay.visibility = View.VISIBLE
    }

    private fun buildRandomForm() {
        randomOptions.removeAllViews()
        for ((key, label, values) in optionRows) {
            val rowEl = LinearLayout(this).apply {
                orientation = LinearLayout.HORIZONTAL
                gravity = Gravity.CENTER_VERTICAL
                setPadding(0, dp(3f), 0, dp(3f))
            }
            rowEl.addView(TextView(this).apply {
                text = label
                setTextColor(0xFF8593A1.toInt())
                textSize = 12f
                layoutParams = LinearLayout.LayoutParams(dp(110f), LinearLayout.LayoutParams.WRAP_CONTENT)
            })
            val pillViews = mutableListOf<TextView>()
            for ((value, text) in values) {
                val pill = TextView(this).apply {
                    this.text = text
                    gravity = Gravity.CENTER
                    textSize = 12f
                    setTextColor(0xFFEAF2FA.toInt())
                    setBackgroundResource(R.drawable.bg_btn_toggle)
                    setPadding(dp(12f), dp(7f), dp(12f), dp(7f))
                    isSelected = getSetting(key) == value
                    layoutParams = LinearLayout.LayoutParams(
                        LinearLayout.LayoutParams.WRAP_CONTENT, LinearLayout.LayoutParams.WRAP_CONTENT,
                    ).apply { setMargins(dp(2f), 0, dp(2f), 0) }
                }
                pill.setOnClickListener {
                    setSetting(key, value)
                    saveRandomSettings()
                    for (p in pillViews) p.isSelected = false
                    pill.isSelected = true
                }
                pillViews.add(pill)
                rowEl.addView(pill)
            }
            randomOptions.addView(rowEl)
        }
        updateSeedLabel()
    }

    @SuppressLint("SetTextI18n")
    private fun updateSeedLabel() {
        seedLabel.text = "Karte #${ZellSession.randomSettings.seed}"
    }

    // ---- HUD ----

    private fun buildChips() {
        chips.removeAllViews()
        chipViews.clear()
        val owners = listOf("player") + Z_AI_FACTIONS.filter { f -> engine.level.cells.any { it.owner == f } }
        for (owner in owners) {
            val chip = TextView(this).apply {
                textSize = 12f
                setTextColor(Color.WHITE)
                setPadding(dp(4f), 0, dp(4f), 0)
            }
            chips.addView(chip)
            chipViews.add(chip to owner)
        }
        updateChips(force = true)
    }

    @SuppressLint("SetTextI18n")
    private fun updateChips(force: Boolean = false) {
        for ((chip, owner) in chipViews) {
            val n = engine.cells.count { it.owner == owner }
            val txt = "● $n"
            if (force || chip.text != txt) {
                chip.text = txt
                chip.setTextColor(Z_OWNER_COLOR[owner] ?: Color.WHITE)
            }
        }
    }

    // ---- Spielende ----

    private fun completedLevels(): Set<Int> =
        getSharedPreferences("towerdefense", Context.MODE_PRIVATE)
            .getStringSet("zell.completed", emptySet())!!
            .mapNotNull { it.toIntOrNull() }.toSet()

    private fun markCompleted(n: Int) {
        val prefs = getSharedPreferences("towerdefense", Context.MODE_PRIVATE)
        val done = completedLevels() + n
        prefs.edit()
            .putStringSet("zell.completed", done.map { it.toString() }.toSet())
            .putInt("zell.campaign.best", done.max())
            .apply()
    }

    private fun showGameEnd(won: Boolean) {
        if (endDialogShown) return
        endDialogShown = true
        val s = ZellSession
        var msg: String
        var nextLabel: String? = null
        if (won) {
            msg = "Alle gegnerischen Zellen wurden erobert."
            if (s.kind == "campaign") {
                markCompleted(s.campaignN)
                if (s.campaignN < Z_CAMPAIGN_SIZE) {
                    msg = "Level ${s.campaignN} geschafft – Level ${s.campaignN + 1} ist freigeschaltet."
                    nextLabel = "Nächstes Level"
                } else {
                    msg = "Level 50 geschafft – die Kampagne ist besiegt!"
                }
            } else if (s.kind == "random") {
                nextLabel = "Neue Karte"
            }
        } else {
            msg = "Deine letzte Zelle ist gefallen."
        }

        val b = AlertDialog.Builder(this)
            .setTitle(if (won) "🏆 Sieg" else "💀 Niederlage")
            .setMessage(msg)
            .setCancelable(false)
        if (nextLabel != null) {
            b.setPositiveButton(nextLabel) { _, _ ->
                if (s.kind == "campaign") {
                    s.campaignN++
                    startLevel(generateCampaignLevel(s.campaignN))
                } else {
                    s.randomSettings.seed = Random.nextInt(0xFFFFFF)
                    saveRandomSettings()
                    startRandomGame()
                }
            }
        }
        b.setNegativeButton("Nochmal spielen") { _, _ -> restartLevel() }
        b.setNeutralButton("Levelauswahl") { _, _ -> showLevelMenu() }
        b.show()
    }

    // ---- Zufallsspiel-Einstellungen (SharedPreferences) ----

    private fun loadRandomSettings() {
        val p = getSharedPreferences("towerdefense", Context.MODE_PRIVATE)
        with(ZellSession.randomSettings) {
            aiCount = p.getInt("zell.random.aiCount", aiCount)
            difficulty = p.getString("zell.random.difficulty", difficulty)!!
            mapSize = p.getString("zell.random.mapSize", mapSize)!!
            density = p.getString("zell.random.density", density)!!
            cellMix = p.getString("zell.random.cellMix", cellMix)!!
            fairness = p.getString("zell.random.fairness", fairness)!!
        }
    }

    private fun saveRandomSettings() {
        val p = getSharedPreferences("towerdefense", Context.MODE_PRIVATE)
        with(ZellSession.randomSettings) {
            p.edit()
                .putInt("zell.random.aiCount", aiCount)
                .putString("zell.random.difficulty", difficulty)
                .putString("zell.random.mapSize", mapSize)
                .putString("zell.random.density", density)
                .putString("zell.random.cellMix", cellMix)
                .putString("zell.random.fairness", fairness)
                .apply()
        }
    }
}
