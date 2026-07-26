package de.schlecht.towerdefense

import android.annotation.SuppressLint
import android.content.Context
import android.content.Intent
import android.os.Bundle
import android.widget.LinearLayout
import android.widget.TextView
import androidx.appcompat.app.AppCompatActivity
import de.schlecht.towerdefense.kristall.KristallActivity
import de.schlecht.towerdefense.zell.ZellActivity

/** Spielebibliothek: Startbildschirm mit allen Spielen. */
class LauncherActivity : AppCompatActivity() {

    private lateinit var gameList: LinearLayout

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_launcher)
        gameList = findViewById(R.id.gameList)
    }

    override fun onResume() {
        super.onResume()
        buildList() // Fortschritt kann sich geändert haben
    }

    @SuppressLint("SetTextI18n")
    private fun buildList() {
        gameList.removeAllViews()
        val prefs = getSharedPreferences("towerdefense", Context.MODE_PRIVATE)

        val tdDone = Store.completedLevels(this).size
        addCard(
            "🏰", "Tower Defense",
            "10-Level-Kampagne, 6 Turmtypen mit Spezialfähigkeiten, Bosse und Balance-Regler.",
            if (tdDone > 0) "🏆 $tdDone/${LEVELS.size} Leveln geschafft" else "Noch kein Level geschafft",
            MainActivity::class.java,
        )

        val kkWins = listOf("leicht", "mittel", "schwer").sumOf { prefs.getInt("kristall.wins.$it", 0) }
        addCard(
            "💎", "Kristallkrieg",
            "Echtzeit-Strategie auf 3 Bahnen: Kristalle sammeln, Konter-Dreieck nutzen, Festung stürmen.",
            if (kkWins > 0) "🏆 $kkWins Siege" else "Noch kein Sieg",
            KristallActivity::class.java,
        )

        val zkDone = prefs.getInt("zell.campaign.best", 0)
        addCard(
            "🦠", "Zellkrieg",
            "Tentacle-Wars-Strategie: Zellen erobern, Tentakel ziehen und schneiden. 50-Level-Kampagne, Zufallsspiel, Sandbox.",
            if (zkDone > 0) "🏆 Kampagne: Level $zkDone geschafft" else "Noch kein Level geschafft",
            ZellActivity::class.java,
        )
    }

    private fun addCard(
        icon: String, name: String, desc: String, progress: String,
        activity: Class<out AppCompatActivity>,
    ) {
        val card = layoutInflater.inflate(R.layout.item_game, gameList, false)
        card.findViewById<TextView>(R.id.gameIcon).text = icon
        card.findViewById<TextView>(R.id.gameName).text = name
        card.findViewById<TextView>(R.id.gameDesc).text = desc
        card.findViewById<TextView>(R.id.gameProgress).text = progress
        card.setOnClickListener { startActivity(Intent(this, activity)) }
        gameList.addView(card)
    }
}
