package de.schlecht.towerdefense.kristall

import android.annotation.SuppressLint
import android.content.Context
import android.os.Bundle
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
import kotlin.math.ceil
import kotlin.math.floor
import kotlin.math.max

class KristallActivity : AppCompatActivity() {

    private lateinit var kkView: KristallView
    private lateinit var txtCrystals: TextView
    private lateinit var txtHint: TextView
    private lateinit var txtHp: TextView
    private lateinit var shop: LinearLayout
    private lateinit var btnSpeed: Button
    private lateinit var menuOverlay: ScrollView
    private lateinit var diffList: LinearLayout
    private val shopCards = mutableMapOf<String, View>()
    private var collectorCard: View? = null

    private val engine get() = kkView.engine

    // zuletzt angezeigte Werte, um TextView-Updates pro Frame zu vermeiden
    private var shownCrystals = -1
    private var shownHpP = -1
    private var shownHpE = -1

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_kristall)

        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        WindowCompat.setDecorFitsSystemWindows(window, false)
        WindowInsetsControllerCompat(window, window.decorView).apply {
            hide(WindowInsetsCompat.Type.systemBars())
            systemBarsBehavior = WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
        }

        kkView = findViewById(R.id.kkView)
        txtCrystals = findViewById(R.id.kkCrystals)
        txtHint = findViewById(R.id.kkHint)
        txtHp = findViewById(R.id.kkHp)
        shop = findViewById(R.id.kkShop)
        btnSpeed = findViewById(R.id.kkSpeed)
        menuOverlay = findViewById(R.id.kkMenu)
        diffList = findViewById(R.id.kkDiffList)

        buildShop()

        btnSpeed.setOnClickListener {
            engine.speed = when (engine.speed) { 1 -> 2; 2 -> 3; else -> 1 }
            btnSpeed.text = "${engine.speed}×"
        }
        findViewById<Button>(R.id.kkMenuBtn).setOnClickListener { showMenu() }

        kkView.onUiUpdate = { runOnUiThread { updateHud() } }
        kkView.onGameOver = { victory -> runOnUiThread { showGameOver(victory) } }

        if (engine.gameOver) showMenu() else updateHud(force = true)
    }

    override fun onResume() { super.onResume(); kkView.start() }
    override fun onPause() { super.onPause(); kkView.stop() }

    @SuppressLint("SetTextI18n")
    private fun buildShop() {
        for (t in KK_UNIT_TYPES) {
            val card = layoutInflater.inflate(R.layout.item_card, shop, false)
            card.findViewById<TextView>(R.id.cardIcon).text = t.icon
            card.findViewById<TextView>(R.id.cardName).text = t.name
            card.findViewById<TextView>(R.id.cardCost).text = "💎 ${t.cost}"
            card.setOnClickListener {
                engine.selectedType = if (engine.selectedType == t.key) null else t.key
                updateHud(force = true)
            }
            shop.addView(card)
            shopCards[t.key] = card
        }
        // Sammler-Karte
        val coll = layoutInflater.inflate(R.layout.item_card, shop, false)
        coll.findViewById<TextView>(R.id.cardIcon).text = "⛏️"
        coll.findViewById<TextView>(R.id.cardName).text = "Sammler"
        coll.setOnClickListener {
            if (!engine.gameOver && engine.tryBuyCollector()) updateHud(force = true)
        }
        shop.addView(coll)
        collectorCard = coll
    }

    @SuppressLint("SetTextI18n")
    private fun updateHud(force: Boolean = false) {
        val c = floor(engine.crystals).toInt()
        val hpP = max(0f, ceil(engine.playerBaseHp)).toInt()
        val hpE = max(0f, ceil(engine.enemyBaseHp)).toInt()
        if (!force && c == shownCrystals && hpP == shownHpP && hpE == shownHpE) return

        if (c != shownCrystals || force) {
            txtCrystals.text = "💎 $c  +${engine.playerIncome().toInt()}/s"
            for ((key, card) in shopCards) {
                val t = kkUnitType(key)
                card.alpha = if (c < t.cost) 0.4f else 1f
                card.isSelected = engine.selectedType == key
            }
            collectorCard?.let { card ->
                val cost = engine.collectorCost()
                val maxed = engine.collectors >= KK.COLLECTOR_MAX
                card.findViewById<TextView>(R.id.cardCost).text =
                    if (maxed) "max" else "💎 $cost · ${engine.collectors}/${KK.COLLECTOR_MAX}"
                card.alpha = if (maxed || c < cost) 0.4f else 1f
            }
        }
        if (hpP != shownHpP || hpE != shownHpE || force) {
            txtHp.text = "🛡 $hpP   ⚔ $hpE"
        }
        shownCrystals = c; shownHpP = hpP; shownHpE = hpE

        txtHint.text = engine.selectedType?.let { key ->
            val t = kkUnitType(key)
            "${t.icon} ${t.name} gewählt – tippe auf eine Bahn zum Aufstellen. ${t.desc}"
        } ?: "Einheit unten wählen, dann auf eine Bahn tippen. Wachtürme erobern: sie schießen mit und bringen +1 💎/s."
    }

    // ---- Menü ----
    @SuppressLint("SetTextI18n")
    private fun showMenu() {
        engine.gameOver = true
        diffList.removeAllViews()
        val prefs = getSharedPreferences("towerdefense", Context.MODE_PRIVATE)
        for (d in KK_DIFFICULTIES) {
            val wins = prefs.getInt("kristall.wins.${d.key}", 0)
            val tile = layoutInflater.inflate(R.layout.item_level, diffList, false)
            tile.findViewById<TextView>(R.id.lvStatus).text = if (wins > 0) "🏆" else "▶"
            tile.findViewById<TextView>(R.id.lvName).text = d.name
            tile.findViewById<TextView>(R.id.lvMeta).text =
                if (wins > 0) "$wins× gewonnen" else "noch nicht bezwungen"
            tile.findViewById<TextView>(R.id.lvDesc).text = when (d.key) {
                "leicht" -> "Gemütliche KI mit schwacher Wirtschaft."
                "mittel" -> "Ausgewogener Gegner, kontert gezielt."
                else -> "Schnelle, präzise KI mit Einkommens-Bonus."
            }
            tile.setOnClickListener { startGame(d) }
            diffList.addView(tile)
        }
        menuOverlay.visibility = View.VISIBLE
    }

    private fun startGame(diff: KkDifficulty) {
        engine.reset(diff)
        kkView.onGameStarted()
        btnSpeed.text = "1×"
        menuOverlay.visibility = View.GONE
        updateHud(force = true)
    }

    private fun showGameOver(victory: Boolean) {
        if (victory) {
            val prefs = getSharedPreferences("towerdefense", Context.MODE_PRIVATE)
            val key = "kristall.wins.${engine.difficulty.key}"
            prefs.edit().putInt(key, prefs.getInt(key, 0) + 1).apply()
        }
        val msg = if (victory)
            "Die gegnerische Festung ist gefallen (${engine.difficulty.name}, ${floor(engine.time).toInt()} s)."
        else
            "Deine Festung wurde zerstört. Versuch es mit mehr Wirtschaft – oder besseren Kontern."
        AlertDialog.Builder(this)
            .setTitle(if (victory) "🏆 Sieg!" else "💥 Niederlage")
            .setMessage(msg)
            .setCancelable(false)
            .setPositiveButton("Nochmal spielen") { _, _ -> startGame(engine.difficulty) }
            .setNeutralButton("Schwierigkeit") { _, _ -> showMenu() }
            .show()
    }
}
