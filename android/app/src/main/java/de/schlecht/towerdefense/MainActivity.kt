package de.schlecht.towerdefense

import android.annotation.SuppressLint
import android.os.Bundle
import android.text.InputType
import android.view.View
import android.view.WindowManager
import android.widget.Button
import android.widget.CheckBox
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import androidx.appcompat.app.AlertDialog
import androidx.appcompat.app.AppCompatActivity
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat
import kotlin.math.roundToInt

class MainActivity : AppCompatActivity() {

    private lateinit var gameView: GameView
    private lateinit var txtStats: TextView
    private lateinit var txtWaveInfo: TextView
    private lateinit var txtSelection: TextView
    private lateinit var selectionPanel: LinearLayout
    private lateinit var btnStart: Button
    private lateinit var btnSpeed: Button
    private lateinit var btnUpgrade: Button
    private lateinit var btnSell: Button
    private lateinit var btnToolUpgrade: Button
    private lateinit var btnToolSell: Button
    private lateinit var btnMenu: Button
    private lateinit var btnBalance: Button
    private lateinit var chkAuto: CheckBox
    private lateinit var shop: LinearLayout
    private lateinit var menuOverlay: ScrollView
    private lateinit var levelList: LinearLayout
    private val shopItems = mutableMapOf<String, View>()

    private val engine get() = gameView.engine

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        Store.loadTuning(this) // Balance-Regler vor dem ersten UI-Update laden
        setContentView(R.layout.activity_main)

        // Vollbild + Display anlassen
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        WindowCompat.setDecorFitsSystemWindows(window, false)
        WindowInsetsControllerCompat(window, window.decorView).apply {
            hide(WindowInsetsCompat.Type.systemBars())
            systemBarsBehavior = WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
        }

        gameView = findViewById(R.id.gameView)
        txtStats = findViewById(R.id.txtStats)
        txtWaveInfo = findViewById(R.id.txtWaveInfo)
        txtSelection = findViewById(R.id.txtSelection)
        selectionPanel = findViewById(R.id.selectionPanel)
        btnStart = findViewById(R.id.btnStart)
        btnSpeed = findViewById(R.id.btnSpeed)
        btnUpgrade = findViewById(R.id.btnUpgrade)
        btnSell = findViewById(R.id.btnSell)
        btnToolUpgrade = findViewById(R.id.btnToolUpgrade)
        btnToolSell = findViewById(R.id.btnToolSell)
        btnMenu = findViewById(R.id.btnMenu)
        btnBalance = findViewById(R.id.btnBalance)
        chkAuto = findViewById(R.id.chkAuto)
        shop = findViewById(R.id.shop)
        menuOverlay = findViewById(R.id.menuOverlay)
        levelList = findViewById(R.id.levelList)

        buildShop()

        btnStart.setOnClickListener {
            engine.startNextWave()
            updateUi()
        }
        chkAuto.setOnCheckedChangeListener { _, checked ->
            engine.autoWave = checked
            if (checked) engine.startNextWave()
            updateUi()
        }
        btnSpeed.setOnClickListener {
            engine.speed = when (engine.speed) { 1 -> 2; 2 -> 4; else -> 1 }
            btnSpeed.text = "${engine.speed}×"
        }
        btnUpgrade.setOnClickListener {
            engine.selectedTower?.let { engine.tryUpgrade(it) }
            updateUi()
        }
        btnSell.setOnClickListener {
            engine.selectedTower?.let { engine.sell(it) }
            updateUi()
        }
        btnToolUpgrade.setOnClickListener { toggleTool("upgrade") }
        btnToolSell.setOnClickListener { toggleTool("sell") }
        btnMenu.setOnClickListener { showMenu() }
        btnBalance.setOnClickListener { showBalanceDialog() }

        // Menü-Overlay
        findViewById<Button>(R.id.btnResume).setOnClickListener { hideMenu() }
        findViewById<Button>(R.id.btnRestartLevel).setOnClickListener {
            gameView.loadLevel(engine.levelIndex)
            afterLevelLoad()
        }

        gameView.onUiUpdate = { runOnUiThread { updateUi() } }
        gameView.onGameOver = { victory -> runOnUiThread { showGameOver(victory) } }

        if (engine.inMenu) showMenu() else updateUi()
    }

    override fun onResume() { super.onResume(); gameView.start() }
    override fun onPause() { super.onPause(); gameView.stop() }

    /** Antipp-Werkzeug (Upgrade/Verkauf) ein-/ausschalten. */
    private fun toggleTool(name: String) {
        engine.tool = if (engine.tool == name) null else name
        engine.placingType = null
        engine.selectedTower = null
        updateUi()
    }

    private fun buildShop() {
        for (t in TOWER_TYPES) {
            val item = layoutInflater.inflate(R.layout.item_tower, shop, false)
            item.findViewById<TowerIconView>(R.id.towerIcon).towerKey = t.key
            item.findViewById<TextView>(R.id.towerName).text = t.name
            item.findViewById<TextView>(R.id.towerCost).text = "${t.cost} 💰"
            // Beschreibung gibt es nur im Querformat-Layout
            item.findViewById<TextView?>(R.id.towerDesc)?.text = t.desc
            item.setOnClickListener {
                if (engine.gold < t.cost) return@setOnClickListener
                engine.placingType = if (engine.placingType == t.key) null else t.key
                engine.tool = null
                engine.selectedTower = null
                updateUi()
            }
            shop.addView(item)
            shopItems[t.key] = item
        }
    }

    @SuppressLint("SetTextI18n")
    private fun updateUi() {
        txtStats.text = "💰 ${engine.gold}   ❤️ ${engine.lives}\n" +
            "🌊 ${engine.wave}/${engine.totalWaves}   ☠️ ${engine.kills}"

        for ((key, item) in shopItems) {
            val t = towerType(key)
            item.alpha = if (engine.gold < t.cost) 0.4f else 1f
            item.isSelected = engine.placingType == key
        }

        btnToolUpgrade.isSelected = engine.tool == "upgrade"
        btnToolSell.isSelected = engine.tool == "sell"

        val waveActive = engine.waveActive
        val allDone = engine.wave >= engine.totalWaves && !waveActive
        btnStart.isEnabled = !waveActive && !allDone && !engine.gameOver
        btnStart.text = when {
            waveActive -> "Welle ${engine.wave} läuft…"
            allDone -> "Alle Wellen geschafft!"
            else -> "Welle ${engine.wave + 1}/${engine.totalWaves} starten ▶"
        }
        val levelLabel = "Level ${engine.levelIndex + 1}: ${engine.level.name}"
        txtWaveInfo.text = when {
            engine.tool == "upgrade" -> "⬆️ Tippe einen Turm an, um ihn zu upgraden."
            engine.tool == "sell" -> "💰 Tippe einen Turm an, um ihn zu verkaufen."
            waveActive -> {
                val sp = engine.spawner
                val pending = if (sp != null) sp.queue.size - sp.index else 0
                "$levelLabel   Gegner übrig: ${engine.enemies.size + pending}"
            }
            engine.wave > 0 -> "$levelLabel   Bereit für die nächste Welle."
            else -> "$levelLabel   Baue Türme und starte die erste Welle!"
        }

        val tw = engine.selectedTower
        if (tw != null) {
            selectionPanel.visibility = View.VISIBLE
            txtSelection.text = selectionText(tw)
            if (tw.maxLevel) {
                btnUpgrade.text = "Max. Level"
                btnUpgrade.isEnabled = false
            } else {
                btnUpgrade.text = "Upgrade (${tw.upgradeCost} 💰)"
                btnUpgrade.isEnabled = engine.gold >= tw.upgradeCost
            }
            btnSell.text = "Verkaufen (+${tw.sellValue} 💰)"
        } else {
            selectionPanel.visibility = View.GONE
        }
    }

    /** Info-Text des ausgewählten Turms inkl. kompakter Upgrade-Vorschau. */
    private fun selectionText(tw: Tower): String = buildString {
        val s = tw.stats
        append("${tw.def.icon} ${tw.def.name} (Level ${tw.level + 1})\n")
        when {
            s.buff != null -> append("Buff: +${(s.buff * 100).roundToInt()} % Schaden\nRadius: ${s.range.roundToInt()}")
            s.rateBuff != null -> append("Buff: +${(s.rateBuff * 100).roundToInt()} % Angriffstempo\nRadius: ${s.range.roundToInt()}")
            else -> {
                append("Schaden: ${s.damage.roundToInt()}")
                if (tw.buffMult > 1f) append(" (×${"%.2f".format(tw.buffMult)} ⚡)")
                append("\nReichweite: ${s.range.roundToInt()}\n")
                append("Feuerrate: ${"%.1f".format(1 / s.fireRate)}/s")
                if (tw.rateMult > 1f) append(" (×${"%.2f".format(tw.rateMult)} ⏩)")
            }
        }
        if (s.targets > 1) append("\nZiele: ${if (s.targets >= 999) "alle in Reichweite" else "bis zu ${s.targets}"}")
        s.splash?.let { append("\nFläche: ${it.roundToInt()}") }
        s.slow?.let { append("\nSlow: ${(it * 100).roundToInt()} %") }
        if (s.stun > 0) append("\nBetäubung: ${s.stun} s")
        if (s.critEvery > 0) append("\nKrit: jeder ${s.critEvery}. Schuss ×${s.critMult.roundToInt()}")

        // Upgrade-Vorschau: was ändert sich auf der nächsten Stufe
        if (!tw.maxLevel) {
            val n = tw.def.levels[tw.level + 1]
            val parts = mutableListOf<String>()
            if (n.damage != s.damage) parts.add("Schaden ${s.damage.roundToInt()}→${n.damage.roundToInt()}")
            n.buff?.let { if (it != s.buff) parts.add("Buff +${((s.buff ?: 0f) * 100).roundToInt()}→+${(it * 100).roundToInt()} %") }
            n.rateBuff?.let { if (it != s.rateBuff) parts.add("Tempo +${((s.rateBuff ?: 0f) * 100).roundToInt()}→+${(it * 100).roundToInt()} %") }
            if (n.range != s.range) parts.add("Reichweite ${s.range.roundToInt()}→${n.range.roundToInt()}")
            if (n.targets != s.targets) parts.add("Ziele ${s.targets}→${if (n.targets >= 999) "alle" else "${n.targets}"}")
            if (n.splash != s.splash) parts.add("Fläche ${s.splash?.roundToInt() ?: "–"}→${n.splash?.roundToInt()}")
            if (n.stun != s.stun) parts.add("Betäubung ${n.stun} s")
            if (n.critEvery != s.critEvery) parts.add("Krit: jeder ${n.critEvery}. ×${n.critMult.roundToInt()}")
            if (parts.isNotEmpty()) append("\nNach Upgrade: ${parts.joinToString(", ")}")
        }
    }

    // ---- Levelauswahl ----
    private fun showMenu() {
        engine.inMenu = true
        engine.placingType = null
        engine.tool = null
        buildMenu()
        menuOverlay.visibility = View.VISIBLE
        updateUi()
    }

    private fun hideMenu() {
        engine.inMenu = false
        menuOverlay.visibility = View.GONE
        updateUi()
    }

    private fun afterLevelLoad() {
        menuOverlay.visibility = View.GONE
        chkAuto.isChecked = false
        btnSpeed.text = "1×"
        updateUi()
    }

    @SuppressLint("SetTextI18n")
    private fun buildMenu() {
        val completed = Store.completedLevels(this)
        levelList.removeAllViews()
        for ((i, lv) in LEVELS.withIndex()) {
            val done = i in completed
            val open = Store.isUnlocked(i, completed)
            val tile = layoutInflater.inflate(R.layout.item_level, levelList, false)
            val status = tile.findViewById<TextView>(R.id.lvStatus)
            status.text = if (done) "✔" else if (open) "${i + 1}" else "🔒"
            if (done) status.setTextColor(0xFF6AD06A.toInt())
            tile.findViewById<TextView>(R.id.lvName).text = lv.name
            tile.findViewById<TextView>(R.id.lvMeta).text = "${lv.waves} Wellen · ${lv.startLives} Leben · ${lv.startGold} 💰"
            tile.findViewById<TextView>(R.id.lvDesc).text = lv.desc
            tile.isEnabled = open
            tile.alpha = if (open) 1f else 0.45f
            if (open) tile.setOnClickListener {
                gameView.loadLevel(i)
                afterLevelLoad()
            }
            levelList.addView(tile)
        }
    }

    // ---- Balance-Dialog (🛠) ----
    private fun showBalanceDialog() {
        val pad = (12 * resources.displayMetrics.density).toInt()
        val list = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(pad, pad / 2, pad, pad / 2)
        }
        val inputs = mutableMapOf<String, EditText>()
        for (f in Tuning.fields) {
            val label = TextView(this).apply {
                text = f.key
                setTextColor(0xFFE8ECF4.toInt())
                textSize = 13f
                setTypeface(typeface, android.graphics.Typeface.BOLD)
            }
            val input = EditText(this).apply {
                inputType = InputType.TYPE_CLASS_NUMBER or
                    InputType.TYPE_NUMBER_FLAG_DECIMAL or InputType.TYPE_NUMBER_FLAG_SIGNED
                setText(f.get().toString())
                textSize = 13f
            }
            val info = TextView(this).apply {
                text = f.info
                setTextColor(0xFF8A93A8.toInt())
                textSize = 10f
            }
            list.addView(label)
            list.addView(input)
            list.addView(info)
            inputs[f.key] = input
        }
        val scroll = ScrollView(this).apply { addView(list) }

        AlertDialog.Builder(this)
            .setTitle("🛠 Balance-Regler")
            .setView(scroll)
            .setPositiveButton("Speichern") { _, _ ->
                for (f in Tuning.fields) {
                    val v = inputs[f.key]?.text?.toString()?.replace(',', '.')?.toFloatOrNull()
                    if (v != null && !v.isNaN()) f.set(v)
                }
                Store.saveTuning(this)
                updateUi()
            }
            .setNeutralButton("+500 💰") { _, _ ->
                engine.gold += 500
                engine.dirty = true
                updateUi()
            }
            .setNegativeButton("Zurücksetzen") { _, _ ->
                Store.resetTuning(this)
                updateUi()
            }
            .show()
    }

    // ---- Spielende ----
    private fun showGameOver(victory: Boolean) {
        val lv = engine.level
        val lastLevel = engine.levelIndex >= LEVELS.size - 1
        if (victory) Store.markCompleted(this, engine.levelIndex)

        val title = if (victory) "🏆 Gewonnen!" else "💀 Game Over"
        var msg = if (victory)
            "„${lv.name}“ überstanden – alle ${engine.totalWaves} Wellen, mit ${engine.lives} Leben und ${engine.kills} Kills!"
        else
            "Du hast ${engine.wave} Welle(n) erreicht und ${engine.kills} Gegner besiegt."
        if (victory && lastLevel) msg += " Kampagne komplett!"

        val b = AlertDialog.Builder(this)
            .setTitle(title)
            .setMessage(msg)
            .setCancelable(false)
        if (victory && !lastLevel) {
            b.setPositiveButton("Nächstes Level ▶") { _, _ ->
                gameView.loadLevel(engine.levelIndex + 1)
                afterLevelLoad()
            }
        }
        b.setNegativeButton("Nochmal spielen") { _, _ ->
            gameView.loadLevel(engine.levelIndex)
            afterLevelLoad()
        }
        b.setNeutralButton("Levelauswahl") { _, _ -> showMenu() }
        b.show()
    }
}
