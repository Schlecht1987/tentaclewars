package de.schlecht.towerdefense

import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.Path
import android.graphics.RectF
import kotlin.math.cos
import kotlin.math.sin

/**
 * Zeichnet die Türme als detaillierte Top-Down-Modelle (statt einfacher Kugeln).
 * Wird vom GameView (Spielfeld) und vom TowerIconView (Shop-Buttons) benutzt,
 * damit Vorschau und Spiel identisch aussehen.
 *
 * Der Canvas muss vor dem Aufruf auf die Turmmitte verschoben sein; alle
 * Koordinaten sind auf eine Kachelgröße von 40 normiert und werden skaliert.
 */
object TowerPainter {

    private val fill = Paint(Paint.ANTI_ALIAS_FLAG)
    private val stroke = Paint(Paint.ANTI_ALIAS_FLAG).apply { style = Paint.Style.STROKE }
    private val path = Path()
    private val rect = RectF()

    private val DEG = (180.0 / Math.PI).toFloat()

    /**
     * @param size    Kachelgröße in Weltkoordinaten (Zeichnung wird passend skaliert)
     * @param angle   Blickrichtung des Aufsatzes in Radiant (0 = rechts)
     * @param recoil  1 direkt nach dem Schuss → 0 wenn nachgeladen (für Rückstoß)
     * @param time    Laufzeit in Sekunden für Puls-/Rotations-Animationen
     */
    fun draw(
        canvas: Canvas, key: String, size: Float,
        angle: Float, level: Int, recoil: Float, time: Float,
    ) {
        canvas.save()
        canvas.scale(size / 40f, size / 40f)
        drawBase(canvas, level)
        when (key) {
            "arrow" -> drawArrow(canvas, angle)
            "cannon" -> drawCannon(canvas, angle, recoil)
            "frost" -> drawFrost(canvas, time)
            "sniper" -> drawSniper(canvas, angle, recoil)
            "booster" -> drawBooster(canvas, time)
            "haste" -> drawHaste(canvas, time)
        }
        canvas.restore()
    }

    /** Steinsockel-Plateau mit heller Oberkante; ab Max-Ausbau mit Goldrand. */
    private fun drawBase(c: Canvas, level: Int) {
        fill.color = 0xFF2C3244.toInt()
        c.drawRoundRect(-16f, -14f, 16f, 18f, 7f, 7f, fill)
        fill.color = 0xFF434C66.toInt()
        c.drawRoundRect(-16f, -16f, 16f, 14f, 7f, 7f, fill)
        if (level >= 2) {
            stroke.color = 0x80FFD75E.toInt()
            stroke.strokeWidth = 1.5f
            c.drawRoundRect(-16f, -16f, 16f, 14f, 7f, 7f, stroke)
        }
        // weicher Bodenschatten des Aufbaus
        fill.color = 0x38000000
        c.drawOval(-12f, 6f, 12f, 15f, fill)
    }

    // ---- Bogenschütze: runder Steinturm mit Zinnen und drehbarer Armbrust ----
    private fun drawArrow(c: Canvas, angle: Float) {
        // Zinnenkranz
        fill.color = 0xFF6E7687.toInt()
        for (i in 0 until 8) {
            c.save()
            c.rotate(i * 45f)
            c.drawRoundRect(9.5f, -3f, 15f, 3f, 1.5f, 1.5f, fill)
            c.restore()
        }
        // Mauerring
        fill.color = 0xFF4A5160.toInt()
        c.drawCircle(0f, 0f, 12f, fill)
        fill.color = 0xFF5A6272.toInt()
        c.drawCircle(0f, 0f, 10f, fill)
        // Lichtkante oben links
        stroke.color = 0x30FFFFFF
        stroke.strokeWidth = 2f
        rect.set(-11f, -11f, 11f, 11f)
        c.drawArc(rect, 180f, 90f, false, stroke)
        // Holzplattform mit Planken
        fill.color = 0xFF7A5C38.toInt()
        c.drawCircle(0f, 0f, 7.5f, fill)
        stroke.color = 0xFF67492B.toInt()
        stroke.strokeWidth = 1f
        c.drawLine(-7f, -2.5f, 7f, -2.5f, stroke)
        c.drawLine(-7.4f, 2.5f, 7.4f, 2.5f, stroke)

        // Armbrust dreht sich zum Ziel
        c.save()
        c.rotate(angle * DEG)
        // Bügel (gebogener Bogen vorn)
        stroke.color = 0xFF5A4326.toInt()
        stroke.strokeWidth = 2.4f
        path.reset()
        path.moveTo(6f, -8f)
        path.quadTo(13f, 0f, 6f, 8f)
        c.drawPath(path, stroke)
        // Sehne
        stroke.color = 0xFFD8D8D0.toInt()
        stroke.strokeWidth = 1f
        c.drawLine(6f, -8f, 6f, 8f, stroke)
        // Schaft
        fill.color = 0xFF6B4F30.toInt()
        c.drawRoundRect(-6f, -2f, 10f, 2f, 1.5f, 1.5f, fill)
        // Bolzen mit Spitze
        stroke.color = 0xFFE8E0C8.toInt()
        stroke.strokeWidth = 1.5f
        c.drawLine(2f, 0f, 12f, 0f, stroke)
        fill.color = 0xFFC8CDD8.toInt()
        path.reset()
        path.moveTo(12f, -2.2f); path.lineTo(15.5f, 0f); path.lineTo(12f, 2.2f); path.close()
        c.drawPath(path, fill)
        c.restore()
    }

    // ---- Kanone: Metallbasis mit Nieten, dickes Rohr mit Rückstoß ----
    private fun drawCannon(c: Canvas, angle: Float, recoil: Float) {
        fill.color = 0xFF3A404E.toInt()
        c.drawCircle(0f, 0f, 13f, fill)
        fill.color = 0xFF464E5E.toInt()
        c.drawCircle(0f, 0f, 10.5f, fill)
        // Nieten am Rand
        fill.color = 0xFF5C6678.toInt()
        for (i in 0 until 8) {
            c.save()
            c.rotate(i * 45f + 22.5f)
            c.drawCircle(11.7f, 0f, 1.3f, fill)
            c.restore()
        }
        stroke.color = 0x28FFFFFF
        stroke.strokeWidth = 1.5f
        rect.set(-12f, -12f, 12f, 12f)
        c.drawArc(rect, 190f, 70f, false, stroke)

        c.save()
        c.rotate(angle * DEG)
        val off = -recoil * 4f // Rohr fährt nach dem Schuss zurück
        // Rohr
        fill.color = 0xFF262B36.toInt()
        c.drawRoundRect(off - 3f, -3.8f, off + 17f, 3.8f, 2.5f, 2.5f, fill)
        fill.color = 0xFF3A4252.toInt()
        c.drawRoundRect(off - 3f, -3.8f, off + 17f, -1.2f, 2.5f, 2.5f, fill)
        // Mündungsring
        fill.color = 0xFF1E222C.toInt()
        c.drawRoundRect(off + 13f, -4.6f, off + 17f, 4.6f, 1.5f, 1.5f, fill)
        // Drehkuppel
        fill.color = 0xFF4A5364.toInt()
        c.drawCircle(0f, 0f, 5.8f, fill)
        fill.color = 0x28FFFFFF
        c.drawCircle(-1.5f, -1.5f, 2.2f, fill)
        c.restore()
    }

    // ---- Frostturm: pulsierender Eiskristall ----
    private fun drawFrost(c: Canvas, time: Float) {
        val pulse = (sin(time * 3f) + 1f) / 2f
        // Frost-Aura
        fill.color = Color.argb((0x22 + pulse * 0x22).toInt(), 150, 220, 255)
        c.drawCircle(0f, 0f, 13f + pulse * 2f, fill)
        // Eisplatte
        fill.color = 0xFF3E6478.toInt()
        c.drawCircle(0f, 0f, 10.5f, fill)
        // Kristallstern (6 Zacken)
        star(path, 12f, 4.6f, 6)
        fill.color = 0xFF6AC8E8.toInt()
        c.drawPath(path, fill)
        stroke.color = 0xFFBFEAFF.toInt()
        stroke.strokeWidth = 1.4f
        c.drawPath(path, stroke)
        // innere Facette
        star(path, 6.5f, 2.6f, 6)
        fill.color = 0x66FFFFFF
        c.drawPath(path, fill)
        // Kern
        fill.color = 0xFFF0FBFF.toInt()
        c.drawCircle(0f, 0f, 2.4f, fill)
    }

    // ---- Scharfschütze: achteckige Plattform, langer Präzisionslauf ----
    private fun drawSniper(c: Canvas, angle: Float, recoil: Float) {
        // Achteck-Plattform
        polygon(path, 13f, 8, 22.5f)
        fill.color = 0xFF322B44.toInt()
        c.drawPath(path, fill)
        polygon(path, 10.5f, 8, 22.5f)
        fill.color = 0xFF3E3654.toInt()
        c.drawPath(path, fill)
        stroke.color = 0x26FFFFFF
        stroke.strokeWidth = 1.5f
        rect.set(-11f, -11f, 11f, 11f)
        c.drawArc(rect, 195f, 60f, false, stroke)

        c.save()
        c.rotate(angle * DEG)
        val off = -recoil * 3f
        // langer Lauf
        fill.color = 0xFF232734.toInt()
        c.drawRoundRect(off + 2f, -1.8f, off + 19f, 1.8f, 1.5f, 1.5f, fill)
        // Mündungsbremse
        fill.color = 0xFF2E3444.toInt()
        c.drawRoundRect(off + 15f, -3f, off + 19f, 3f, 1f, 1f, fill)
        // Gehäuse
        fill.color = 0xFF4A3E62.toInt()
        c.drawRoundRect(-7f, -5.5f, 5f, 5.5f, 4f, 4f, fill)
        fill.color = 0xFF5A4C74.toInt()
        c.drawRoundRect(-7f, -5.5f, 5f, -1f, 4f, 4f, fill)
        // Optik-Linse
        fill.color = 0xFF79D0F0.toInt()
        c.drawCircle(0f, 0f, 2.4f, fill)
        stroke.color = 0xFF241F33.toInt()
        stroke.strokeWidth = 1f
        c.drawCircle(0f, 0f, 2.4f, stroke)
        c.restore()
    }

    // ---- Verstärker: Tesla-Spule mit pulsierender Energiekugel ----
    private fun drawBooster(c: Canvas, time: Float) {
        val pulse = (sin(time * 5f) + 1f) / 2f
        fill.color = 0xFF3A404E.toInt()
        c.drawCircle(0f, 0f, 11.5f, fill)
        // Spulenringe
        stroke.strokeWidth = 2f
        stroke.color = 0xFFE0C34A.toInt()
        c.drawCircle(0f, 0f, 10f, stroke)
        stroke.color = 0xB0E0C34A.toInt()
        c.drawCircle(0f, 0f, 7.2f, stroke)
        stroke.color = 0x70E0C34A.toInt()
        c.drawCircle(0f, 0f, 4.6f, stroke)
        // rotierende Energie-Bögen
        c.save()
        c.rotate(time * 60f)
        stroke.color = 0xFFFFF0A0.toInt()
        stroke.strokeWidth = 2.2f
        rect.set(-10f, -10f, 10f, 10f)
        for (i in 0 until 3) c.drawArc(rect, i * 120f, 40f, false, stroke)
        c.restore()
        // Energiekugel
        fill.color = Color.argb((0x28 + pulse * 0x30).toInt(), 255, 235, 160)
        c.drawCircle(0f, 0f, 6f + pulse * 2.5f, fill)
        fill.color = 0xFFFFF6C8.toInt()
        c.drawCircle(0f, 0f, 3.2f + pulse * 0.8f, fill)
        fill.color = 0xFFFFFFFF.toInt()
        c.drawCircle(0f, 0f, 1.4f, fill)
    }

    // ---- Taktgeber: grüne Turbine mit rotierenden Blättern ----
    private fun drawHaste(c: Canvas, time: Float) {
        fill.color = 0xFF3A404E.toInt()
        c.drawCircle(0f, 0f, 11.5f, fill)
        stroke.strokeWidth = 2f
        stroke.color = 0xFF4AC97E.toInt()
        c.drawCircle(0f, 0f, 10f, stroke)
        // rotierende Turbinenblätter (Doppel-Pfeile wie ⏩)
        c.save()
        c.rotate(time * 180f)
        fill.color = 0xFF6ADB96.toInt()
        for (i in 0 until 3) {
            c.save()
            c.rotate(i * 120f)
            path.reset()
            path.moveTo(2f, -2.6f); path.lineTo(8.5f, 0f); path.lineTo(2f, 2.6f); path.close()
            c.drawPath(path, fill)
            path.reset()
            path.moveTo(6f, -2.2f); path.lineTo(11f, 0f); path.lineTo(6f, 2.2f); path.close()
            c.drawPath(path, fill)
            c.restore()
        }
        c.restore()
        // Nabe
        fill.color = 0xFFDCF7E6.toInt()
        c.drawCircle(0f, 0f, 2.6f, fill)
    }

    /** Regelmäßiges n-Eck in [out] schreiben. */
    private fun polygon(out: Path, radius: Float, sides: Int, startDeg: Float) {
        out.reset()
        for (i in 0 until sides) {
            val a = Math.toRadians((startDeg + i * 360f / sides).toDouble())
            val x = (cos(a) * radius).toFloat()
            val y = (sin(a) * radius).toFloat()
            if (i == 0) out.moveTo(x, y) else out.lineTo(x, y)
        }
        out.close()
    }

    /** Stern mit [points] Zacken in [out] schreiben. */
    private fun star(out: Path, outer: Float, inner: Float, points: Int) {
        out.reset()
        for (i in 0 until points * 2) {
            val r = if (i % 2 == 0) outer else inner
            val a = Math.toRadians((i * 180.0 / points) - 90.0)
            val x = (cos(a) * r).toFloat()
            val y = (sin(a) * r).toFloat()
            if (i == 0) out.moveTo(x, y) else out.lineTo(x, y)
        }
        out.close()
    }
}
