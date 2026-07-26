package de.schlecht.towerdefense

import android.content.Context
import android.content.SharedPreferences

/**
 * Persistenz über SharedPreferences: Balance-Stellschrauben (🛠-Dialog)
 * und Kampagnen-Fortschritt (geschaffte Level).
 */
object Store {
    private fun prefs(ctx: Context): SharedPreferences =
        ctx.getSharedPreferences("towerdefense", Context.MODE_PRIVATE)

    // ---- Balance-Regler ----
    fun loadTuning(ctx: Context) {
        val p = prefs(ctx)
        for (f in Tuning.fields) f.set(p.getFloat("tuning.${f.key}", f.default))
    }

    fun saveTuning(ctx: Context) {
        val e = prefs(ctx).edit()
        for (f in Tuning.fields) e.putFloat("tuning.${f.key}", f.get())
        e.apply()
    }

    fun resetTuning(ctx: Context) {
        Tuning.reset()
        val e = prefs(ctx).edit()
        for (f in Tuning.fields) e.remove("tuning.${f.key}")
        e.apply()
    }

    // ---- Kampagnen-Fortschritt ----
    fun completedLevels(ctx: Context): Set<Int> =
        prefs(ctx).getStringSet("progress.completed", emptySet())!!
            .mapNotNull { it.toIntOrNull() }.toSet()

    fun markCompleted(ctx: Context, index: Int) {
        val done = completedLevels(ctx) + index
        prefs(ctx).edit()
            .putStringSet("progress.completed", done.map { it.toString() }.toSet())
            .apply()
    }

    fun isUnlocked(index: Int, completed: Set<Int>): Boolean =
        index == 0 || (index - 1) in completed
}
