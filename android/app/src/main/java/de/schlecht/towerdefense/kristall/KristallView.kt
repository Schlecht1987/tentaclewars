package de.schlecht.towerdefense.kristall

import android.annotation.SuppressLint
import android.content.Context
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.Path
import android.graphics.RadialGradient
import android.graphics.RectF
import android.graphics.Shader
import android.util.AttributeSet
import android.view.Choreographer
import android.view.MotionEvent
import android.view.View
import kotlin.math.abs
import kotlin.math.max
import kotlin.math.min
import kotlin.math.sin

/**
 * Spielfläche für Kristallkrieg: rendert Bahnen, Festungen, Wachtürme,
 * Einheiten und Effekte vsync-synchron über den Choreographer.
 * Die Welt (960×540) wird passend ins View skaliert (Letterbox).
 */
class KristallView @JvmOverloads constructor(
    context: Context, attrs: AttributeSet? = null,
) : View(context, attrs), Choreographer.FrameCallback {

    val engine = KristallHolder.engine

    var onUiUpdate: (() -> Unit)? = null
    var onGameOver: ((Boolean) -> Unit)? = null

    private var lastFrameNanos = 0L
    private var running = false
    private var reportedGameOver = false
    private var animTime = 0f

    private var scale = 1f
    private var offX = 0f
    private var offY = 0f

    private val paint = Paint(Paint.ANTI_ALIAS_FLAG)
    private val stroke = Paint(Paint.ANTI_ALIAS_FLAG).apply { style = Paint.Style.STROKE }
    private val textPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        textAlign = Paint.Align.CENTER
        color = Color.WHITE
    }
    private val path = Path()
    private val rect = RectF()
    private var bgShader: RadialGradient? = null

    override fun onSizeChanged(w: Int, h: Int, oldw: Int, oldh: Int) {
        scale = min(w / KK.WIDTH, h / KK.HEIGHT)
        offX = (w - KK.WIDTH * scale) / 2f
        offY = (h - KK.HEIGHT * scale) / 2f
        bgShader = RadialGradient(
            w / 2f, h / 2f, max(w, h).toFloat(),
            0xFF1C2230.toInt(), 0xFF10141C.toInt(), Shader.TileMode.CLAMP,
        )
    }

    fun start() {
        if (running) return
        running = true
        lastFrameNanos = 0
        Choreographer.getInstance().postFrameCallback(this)
    }

    fun stop() {
        running = false
        Choreographer.getInstance().removeFrameCallback(this)
    }

    override fun doFrame(frameTimeNanos: Long) {
        if (!running) return
        if (lastFrameNanos != 0L) {
            var dt = (frameTimeNanos - lastFrameNanos) / 1_000_000_000f
            dt = min(dt, 0.05f)
            animTime += dt
            if (!engine.gameOver) {
                repeat(engine.speed) { engine.update(dt) }
                onUiUpdate?.invoke()
            }
            if (engine.ended && !reportedGameOver) {
                reportedGameOver = true
                onGameOver?.invoke(engine.victory)
            }
        }
        lastFrameNanos = frameTimeNanos
        invalidate()
        Choreographer.getInstance().postFrameCallback(this)
    }

    fun onGameStarted() {
        reportedGameOver = false
        onUiUpdate?.invoke()
    }

    // ---- Eingabe ----
    @SuppressLint("ClickableViewAccessibility")
    override fun onTouchEvent(event: MotionEvent): Boolean {
        if (event.actionMasked != MotionEvent.ACTION_UP) return true
        if (engine.gameOver) return true
        val wy = (event.y - offY) / scale
        val lane = laneAt(wy)
        if (lane >= 0 && engine.tryBuyUnit(lane)) onUiUpdate?.invoke()
        performClick()
        return true
    }

    private fun laneAt(y: Float): Int {
        var best = -1
        var bestD = Float.MAX_VALUE
        for (i in 0..2) {
            val d = abs(y - KK.LANE_YS[i])
            if (d < bestD) { bestD = d; best = i }
        }
        return if (bestD <= KK.LANE_TAP_RADIUS) best else -1
    }

    // ---- Rendering ----
    override fun onDraw(canvas: Canvas) {
        paint.shader = bgShader
        canvas.drawRect(0f, 0f, width.toFloat(), height.toFloat(), paint)
        paint.shader = null

        canvas.save()
        canvas.translate(offX, offY)
        canvas.scale(scale, scale)

        drawBackdrop(canvas)
        drawLanes(canvas)
        drawBase(canvas, true)
        drawBase(canvas, false)
        for (tw in engine.towers) drawTower(canvas, tw)
        for (u in engine.units) drawUnit(canvas, u)
        for (fx in engine.effects) drawEffect(canvas, fx)
        canvas.restore()
    }

    /** Deko-Kristalle im Hintergrund (deterministische Positionen). */
    private fun drawBackdrop(canvas: Canvas) {
        for (i in 0 until 14) {
            val x = 80f + (i * 137 % 800)
            val y = 40f + (i * 211 % 460)
            val s = 5f + (i * 53 % 9)
            paint.color = 0x1466CCE8
            drawCrystal(canvas, x, y, s)
        }
    }

    private fun drawCrystal(canvas: Canvas, x: Float, y: Float, s: Float) {
        path.reset()
        path.moveTo(x, y - s)
        path.lineTo(x + s * 0.7f, y)
        path.lineTo(x, y + s)
        path.lineTo(x - s * 0.7f, y)
        path.close()
        canvas.drawPath(path, paint)
    }

    private fun drawLanes(canvas: Canvas) {
        val placing = engine.selectedType != null
        val pulse = if (placing) (sin(animTime * 5f) + 1f) / 2f else 0f
        for (i in 0..2) {
            val y = KK.LANE_YS[i]
            // Bahnkörper: Steinweg wie beim Tower Defense
            paint.color = 0xFF272130.toInt()
            canvas.drawRoundRect(60f, y - 42f, KK.WIDTH - 60f, y + 42f, 14f, 14f, paint)
            paint.color = 0xFF322B3E.toInt()
            canvas.drawRoundRect(60f, y - 38f, KK.WIDTH - 60f, y + 38f, 12f, 12f, paint)
            paint.color = 0xFF3B3349.toInt()
            canvas.drawRoundRect(60f, y - 38f, KK.WIDTH - 60f, y - 10f, 12f, 12f, paint)
            // Mittellinie
            stroke.color = 0x14FFFFFF
            stroke.strokeWidth = 1.5f
            canvas.drawLine(70f, y, KK.WIDTH - 70f, y, stroke)
            // Aufstell-Hinweis, wenn eine Einheit gewählt ist
            if (placing) {
                stroke.color = Color.argb((40 + pulse * 90).toInt(), 90, 208, 192)
                stroke.strokeWidth = 2.5f
                canvas.drawRoundRect(60f, y - 42f, KK.WIDTH - 60f, y + 42f, 14f, 14f, stroke)
            }
        }
    }

    private fun drawBase(canvas: Canvas, player: Boolean) {
        val color = if (player) KK.COLOR_PLAYER else KK.COLOR_ENEMY
        val hp = if (player) engine.playerBaseHp else engine.enemyBaseHp
        val w = 56f
        val h = 140f
        val bx = if (player) 6f else KK.WIDTH - 6f - w
        val cy = KK.HEIGHT / 2f

        // Festungskörper mit Zinnen
        paint.color = 0xFF2C3244.toInt()
        canvas.drawRoundRect(bx, cy - h / 2, bx + w, cy + h / 2, 8f, 8f, paint)
        paint.color = 0xFF434C66.toInt()
        canvas.drawRoundRect(bx + 3f, cy - h / 2 + 3f, bx + w - 3f, cy + h / 2 - 5f, 6f, 6f, paint)
        paint.color = 0xFF525C7A.toInt()
        var zx = bx + 4f
        while (zx < bx + w - 8f) {
            canvas.drawRect(zx, cy - h / 2 - 7f, zx + 8f, cy - h / 2 + 2f, paint)
            zx += 14f
        }
        // Besitzerfarbe als Banner
        paint.color = color
        canvas.drawRoundRect(bx + w / 2 - 3f, cy - h / 2 - 24f, bx + w / 2 + 14f, cy - h / 2 - 12f, 2f, 2f, paint)
        stroke.color = 0xFF1B2130.toInt()
        stroke.strokeWidth = 3f
        canvas.drawLine(bx + w / 2 - 3f, cy - h / 2 - 26f, bx + w / 2 - 3f, cy - h / 2 + 2f, stroke)

        textPaint.textSize = 36f
        canvas.drawText("🏰", bx + w / 2, cy + 13f, textPaint)

        // HP-Balken
        val frac = max(0f, hp / KK.BASE_HP)
        paint.color = 0xB0000000.toInt()
        canvas.drawRoundRect(bx, cy + h / 2 + 8f, bx + w, cy + h / 2 + 16f, 3f, 3f, paint)
        paint.color = if (frac > 0.3f) color else 0xFFFF5A4B.toInt()
        canvas.drawRoundRect(bx, cy + h / 2 + 8f, bx + w * frac, cy + h / 2 + 16f, 3f, 3f, paint)
    }

    private fun drawTower(canvas: Canvas, tw: Watchtower) {
        val color = when (tw.owner) {
            "player" -> KK.COLOR_PLAYER
            "enemy" -> KK.COLOR_ENEMY
            else -> KK.COLOR_NEUTRAL
        }
        // Einflussradius dezent
        paint.color = color and 0x00FFFFFF or 0x0A000000
        canvas.drawCircle(tw.x, tw.y, KK.TOWER_RANGE, paint)
        // Sockel
        paint.color = 0x46000000
        canvas.drawOval(tw.x - 16f, tw.y + 12f, tw.x + 16f, tw.y + 22f, paint)
        paint.color = 0xFF3A4152.toInt()
        canvas.drawCircle(tw.x, tw.y, 20f, paint)
        paint.color = 0xFF4A5268.toInt()
        canvas.drawCircle(tw.x, tw.y, 16f, paint)
        stroke.color = color
        stroke.strokeWidth = 2.5f
        canvas.drawCircle(tw.x, tw.y, 20f, stroke)
        textPaint.textSize = 21f
        canvas.drawText("🗼", tw.x, tw.y + 8f, textPaint)

        // Eroberungs-Fortschritt
        val chargeOwner = tw.chargeOwner
        if (tw.charge > 0 && chargeOwner != null) {
            stroke.color = if (chargeOwner == "player") KK.COLOR_PLAYER else KK.COLOR_ENEMY
            stroke.strokeWidth = 3.5f
            rect.set(tw.x - 26f, tw.y - 26f, tw.x + 26f, tw.y + 26f)
            canvas.drawArc(rect, -90f, 360f * (tw.charge / KK.TOWER_CAPTURE_NEED), false, stroke)
        }
    }

    private fun drawUnit(canvas: Canvas, u: Fighter) {
        val color = if (u.owner == "player") KK.COLOR_PLAYER else KK.COLOR_ENEMY
        val bob = sin(animTime * 9f + u.yOff) * 1.5f
        val y = u.y + bob

        // Bodenschatten
        paint.color = 0x3C000000
        canvas.drawOval(u.x - 11f, u.y + 9f, u.x + 11f, u.y + 15f, paint)
        // Körper: gefüllte Scheibe mit hellem Kern
        paint.color = color and 0x00FFFFFF or 0x30000000
        canvas.drawCircle(u.x, y, 13f, paint)
        paint.color = color and 0x00FFFFFF or 0x18000000
        canvas.drawCircle(u.x, y, 16f, paint)
        stroke.color = color
        stroke.strokeWidth = 2f
        canvas.drawCircle(u.x, y, 13f, stroke)
        textPaint.textSize = 16f
        canvas.drawText(u.def.icon, u.x, y + 6f, textPaint)

        // HP-Balken nur bei Schaden
        val frac = u.hp / u.maxHp
        if (frac < 1f) {
            paint.color = 0xB0000000.toInt()
            canvas.drawRoundRect(u.x - 12f, y - 24f, u.x + 12f, y - 19f, 2f, 2f, paint)
            paint.color = if (frac > 0.4f) 0xFF7EE08A.toInt() else 0xFFFFB04B.toInt()
            canvas.drawRoundRect(u.x - 12f, y - 24f, u.x - 12f + 24f * frac, y - 19f, 2f, 2f, paint)
        }
    }

    private fun drawEffect(canvas: Canvas, fx: HitEffect) {
        val alpha = (max(0f, fx.t / fx.max) * 255).toInt()
        if (fx.ranged) {
            stroke.color = fx.color and 0x00FFFFFF or (alpha shl 24)
            stroke.strokeWidth = 1.8f
            canvas.drawLine(fx.x1, fx.y1, fx.x2, fx.y2, stroke)
        } else {
            stroke.color = fx.color and 0x00FFFFFF or (alpha shl 24)
            stroke.strokeWidth = 2.5f
            canvas.drawCircle(fx.x2, fx.y2, 9f, stroke)
        }
    }
}
