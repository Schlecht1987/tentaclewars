package de.schlecht.towerdefense

import android.content.Context
import android.graphics.Canvas
import android.util.AttributeSet
import android.view.View
import kotlin.math.PI
import kotlin.math.min

/**
 * Kleine Turm-Vorschau für die Shop-Buttons – nutzt denselben TowerPainter
 * wie das Spielfeld, damit der Button genau zeigt, was gebaut wird.
 */
class TowerIconView @JvmOverloads constructor(
    context: Context, attrs: AttributeSet? = null,
) : View(context, attrs) {

    var towerKey: String = "arrow"
        set(value) {
            field = value
            invalidate()
        }

    override fun onDraw(canvas: Canvas) {
        val size = min(width, height).toFloat()
        canvas.save()
        canvas.translate(width / 2f, height / 2f)
        TowerPainter.draw(canvas, towerKey, size, (-PI / 2).toFloat(), 0, 0f, 0.4f)
        canvas.restore()
    }
}
