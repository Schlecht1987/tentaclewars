package de.schlecht.towerdefense

import android.annotation.SuppressLint
import android.content.Context
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.RadialGradient
import android.graphics.Shader
import android.util.AttributeSet
import android.view.Choreographer
import android.view.MotionEvent
import android.view.View
import kotlin.math.floor
import kotlin.math.max
import kotlin.math.min

/**
 * Hardwarebeschleunigte Spielfläche: rendert die Karte, Türme, Gegner und
 * Projektile mit dem Choreographer (vsync-synchron, flüssige 60/120 FPS).
 * Im Hochformat wird die Welt um 90° gedreht, damit die lange Karte den
 * Bildschirm optimal füllt.
 */
class GameView @JvmOverloads constructor(
    context: Context, attrs: AttributeSet? = null,
) : View(context, attrs), Choreographer.FrameCallback {

    val engine = GameHolder.engine

    /** Wird aufgerufen, wenn sich Gold/Leben/Welle etc. geändert haben. */
    var onUiUpdate: (() -> Unit)? = null
    /** Wird bei Spielende aufgerufen (victory). */
    var onGameOver: ((Boolean) -> Unit)? = null

    private var lastFrameNanos = 0L
    private var running = false
    private var reportedGameOver = false
    private var animTime = 0f // Laufzeit für Puls-/Rotations-Animationen

    // Welt → Bildschirm
    private var scale = 1f
    private var offX = 0f
    private var offY = 0f
    private var rotated = false // Hochformat: Welt um 90° gedreht

    private val worldW = Config.COLS * Config.TILE
    private val worldH = Config.ROWS * Config.TILE

    private val paint = Paint(Paint.ANTI_ALIAS_FLAG)
    private val stroke = Paint(Paint.ANTI_ALIAS_FLAG).apply { style = Paint.Style.STROKE }
    private val textPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        textAlign = Paint.Align.CENTER
        color = Color.WHITE
    }
    private var bgShader: RadialGradient? = null

    // Kugel-Schattierungen werden pro Farbe/Größe gecacht (keine Allokation im Frame)
    private val sphereCache = HashMap<Long, RadialGradient>()

    override fun onSizeChanged(w: Int, h: Int, oldw: Int, oldh: Int) {
        rotated = h > w
        val ww = if (rotated) worldH else worldW
        val wh = if (rotated) worldW else worldH
        scale = min(w / ww, h / wh)
        offX = (w - ww * scale) / 2f
        offY = (h - wh * scale) / 2f
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
            dt = min(dt, 0.05f) // große Sprünge (App-Wechsel) begrenzen
            animTime += dt
            repeat(engine.speed) { engine.update(dt) }
            if (engine.dirty) {
                engine.dirty = false
                onUiUpdate?.invoke()
            }
            if (engine.gameOver && !reportedGameOver) {
                reportedGameOver = true
                onGameOver?.invoke(engine.victory)
            }
        }
        lastFrameNanos = frameTimeNanos
        invalidate()
        Choreographer.getInstance().postFrameCallback(this)
    }

    /** Level (neu) laden – auch für Neustart des aktuellen Levels. */
    fun loadLevel(index: Int) {
        engine.loadLevel(index)
        reportedGameOver = false
        onUiUpdate?.invoke()
    }

    // ---- Eingabe ----
    @SuppressLint("ClickableViewAccessibility")
    override fun onTouchEvent(event: MotionEvent): Boolean {
        if (event.actionMasked != MotionEvent.ACTION_UP) return true
        if (engine.gameOver) return true

        val wx: Float
        val wy: Float
        if (rotated) {
            wx = (event.y - offY) / scale
            wy = worldH - (event.x - offX) / scale
        } else {
            wx = (event.x - offX) / scale
            wy = (event.y - offY) / scale
        }
        val col = floor(wx / Config.TILE).toInt()
        val row = floor(wy / Config.TILE).toInt()

        if (engine.placingType != null) {
            engine.tryPlace(col, row)
        } else if (engine.tool != null) {
            // Antipp-Werkzeug: Turm direkt upgraden/verkaufen
            engine.applyTool(col, row)
        } else {
            engine.selectedTower = engine.towerAt(col, row)
            engine.dirty = true
        }
        onUiUpdate?.invoke()
        performClick()
        return true
    }

    // ---- Rendering ----
    override fun onDraw(canvas: Canvas) {
        // Hintergrund mit dezentem Verlauf
        paint.shader = bgShader
        canvas.drawRect(0f, 0f, width.toFloat(), height.toFloat(), paint)
        paint.shader = null

        canvas.save()
        canvas.translate(offX, offY)
        canvas.scale(scale, scale)
        if (rotated) {
            // Welt um 90° drehen: (x, y) -> (worldH - y, x)
            canvas.rotate(90f)
            canvas.translate(0f, -worldH)
        }

        drawMap(canvas)
        for (t in engine.towers) drawTower(canvas, t, t === engine.selectedTower)
        for (e in engine.enemies) drawEnemy(canvas, e)
        for (p in engine.projectiles) drawProjectile(canvas, p)
        for (fx in engine.effects) drawExplosion(canvas, fx)
        canvas.restore()
    }

    /** Emoji/Text aufrecht zeichnen, auch wenn die Welt gedreht ist. */
    private fun drawUpright(canvas: Canvas, text: String, x: Float, y: Float) {
        if (rotated) {
            canvas.save()
            canvas.rotate(-90f, x, y)
            canvas.drawText(text, x, y, textPaint)
            canvas.restore()
        } else {
            canvas.drawText(text, x, y, textPaint)
        }
    }

    /** Gecachte Kugel-Schattierung: hell oben links, dunkler Rand. */
    private fun sphere(color: Int, radius: Float): RadialGradient {
        val key = color.toLong() shl 16 or radius.toInt().toLong()
        return sphereCache.getOrPut(key) {
            RadialGradient(
                -radius * 0.35f, -radius * 0.35f, radius * 2.1f,
                intArrayOf(lighten(color, 0.45f), color, darken(color, 0.35f)),
                floatArrayOf(0f, 0.55f, 1f), Shader.TileMode.CLAMP,
            )
        }
    }

    private fun lighten(c: Int, f: Float) = Color.rgb(
        (Color.red(c) + (255 - Color.red(c)) * f).toInt(),
        (Color.green(c) + (255 - Color.green(c)) * f).toInt(),
        (Color.blue(c) + (255 - Color.blue(c)) * f).toInt(),
    )

    private fun darken(c: Int, f: Float) = Color.rgb(
        (Color.red(c) * (1 - f)).toInt(),
        (Color.green(c) * (1 - f)).toInt(),
        (Color.blue(c) * (1 - f)).toInt(),
    )

    /** Kugel mit Schattierung + Glanzpunkt an (x, y) zeichnen. */
    private fun drawSphere(canvas: Canvas, x: Float, y: Float, r: Float, color: Int) {
        canvas.save()
        canvas.translate(x, y)
        paint.shader = sphere(color, r)
        canvas.drawCircle(0f, 0f, r, paint)
        paint.shader = null
        // Glanzpunkt
        paint.color = 0x38FFFFFF
        canvas.drawCircle(-r * 0.3f, -r * 0.35f, r * 0.35f, paint)
        canvas.restore()
    }

    /** Weicher Bodenschatten. */
    private fun drawShadow(canvas: Canvas, x: Float, y: Float, r: Float) {
        paint.color = 0x46000000
        canvas.drawOval(x - r, y + r * 0.55f, x + r, y + r * 1.05f, paint)
    }

    private fun drawMap(canvas: Canvas) {
        val s = Config.TILE

        // Boden als Schachbrett aus zwei dunklen Tönen
        for (r in 0 until Config.ROWS) {
            for (c in 0 until Config.COLS) {
                paint.color = if ((c + r) % 2 == 0) 0xFF1A2030.toInt() else 0xFF171C2A.toInt()
                canvas.drawRect(c * s, r * s, c * s + s, r * s + s, paint)
            }
        }

        // Pfad: dunkle Rinne mit erhöhtem, warmem Weg darauf
        paint.color = 0xFF322C22.toInt()
        for ((c, r) in engine.pathTiles) canvas.drawRect(c * s, r * s, c * s + s, r * s + s, paint)
        for ((c, r) in engine.pathTiles) {
            // Wegplatte mit heller Oberkante (wirkt erhaben)
            paint.color = 0xFF544A38.toInt()
            canvas.drawRoundRect(c * s + 2f, r * s + 2f, c * s + s - 2f, r * s + s - 2f, 7f, 7f, paint)
            paint.color = 0xFF635741.toInt()
            canvas.drawRoundRect(c * s + 2f, r * s + 2f, c * s + s - 2f, r * s + s * 0.45f, 7f, 7f, paint)
            // kleine Steinchen für Textur (deterministisch aus Kachelposition)
            paint.color = 0x2E000000
            val seed = c * 31 + r * 17
            canvas.drawCircle(c * s + 8f + (seed % 11), r * s + 14f + (seed % 17), 2f, paint)
            canvas.drawCircle(c * s + 24f + (seed % 7), r * s + 26f + (seed % 9), 1.5f, paint)
        }

        // Start- und Zielmarkierung
        val start = engine.pathPixels.first()
        val end = engine.pathPixels.last()
        textPaint.textSize = 22f
        drawUpright(canvas, "🚪", max(start.x, 14f), start.y + 8f)
        drawUpright(canvas, "🏰", min(end.x, worldW - 14f), end.y + 8f)
    }

    private fun drawTower(canvas: Canvas, t: Tower, selected: Boolean) {
        val s = Config.TILE
        val px = t.col * s
        val py = t.row * s

        if (selected) {
            paint.color = 0x12FFFFFF
            canvas.drawCircle(t.x, t.y, t.stats.range, paint)
            stroke.color = 0x4DFFFFFF
            stroke.strokeWidth = 1.5f
            canvas.drawCircle(t.x, t.y, t.stats.range, stroke)
        }

        // Verstärker-Aura
        if (t.isBooster) {
            stroke.color = 0x40E0D05A
            stroke.strokeWidth = 1f
            canvas.drawCircle(t.x, t.y, t.stats.range, stroke)
        }

        // Detailliertes Turm-Modell (Sockel + drehbarer Aufsatz)
        val recoil = if (t.stats.fireRate > 0f) (t.cooldown / t.stats.fireRate).coerceIn(0f, 1f) else 0f
        canvas.save()
        canvas.translate(t.x, t.y)
        TowerPainter.draw(canvas, t.type, s, t.aimAngle, t.level, recoil, animTime)
        canvas.restore()

        // Level-Punkte
        paint.color = 0xFFFFD75E.toInt()
        for (i in 0..t.level) {
            canvas.drawCircle(px + 9f + i * 8f, py + s - 6f, 2.5f, paint)
        }
    }

    private fun drawEnemy(canvas: Canvas, e: Enemy) {
        drawShadow(canvas, e.x, e.y + 1f, e.size)
        drawSphere(canvas, e.x, e.y, e.size, e.color)
        stroke.color = 0x59000000
        stroke.strokeWidth = 1.5f
        canvas.drawCircle(e.x, e.y, e.size, stroke)

        if (e.slowTimer > 0) {
            stroke.color = 0xCC8CDCFF.toInt()
            stroke.strokeWidth = 2f
            canvas.drawCircle(e.x, e.y, e.size + 3f, stroke)
        }
        if (e.stunTimer > 0) {
            stroke.color = 0xE6FFDC78.toInt()
            stroke.strokeWidth = 2f
            canvas.drawCircle(e.x, e.y, e.size + 5f, stroke)
        }

        // HP-Balken mit dunklem Rahmen
        val w = e.size * 2
        val ratio = max(0f, e.hp / e.maxHp)
        paint.color = 0xB0000000.toInt()
        canvas.drawRoundRect(e.x - w / 2 - 1, e.y - e.size - 10f, e.x + w / 2 + 1, e.y - e.size - 4f, 2f, 2f, paint)
        paint.color = when {
            ratio > 0.5f -> 0xFF6AD06A.toInt()
            ratio > 0.25f -> 0xFFE0C05A.toInt()
            else -> 0xFFE05A5A.toInt()
        }
        canvas.drawRoundRect(e.x - w / 2, e.y - e.size - 9f, e.x - w / 2 + w * ratio, e.y - e.size - 5f, 2f, 2f, paint)
    }

    private fun drawProjectile(canvas: Canvas, p: Projectile) {
        // kritische Treffer: größer und golden
        val size = if (p.crit) p.proj.size * 1.6f else p.proj.size
        val color = if (p.crit) 0xFFFFE066.toInt() else p.proj.color
        // Glow um das Geschoss
        paint.color = color and 0x00FFFFFF or 0x50000000
        canvas.drawCircle(p.x, p.y, size * 2.2f, paint)
        paint.color = color
        canvas.drawCircle(p.x, p.y, size, paint)
        paint.color = 0x80FFFFFF.toInt()
        canvas.drawCircle(p.x - size * 0.25f, p.y - size * 0.25f, size * 0.4f, paint)
    }

    private fun drawExplosion(canvas: Canvas, fx: Explosion) {
        val prog = fx.t / fx.life
        val alpha = ((1 - prog) * 255).toInt()
        // gefüllter Feuerball + Ring
        paint.color = Color.argb(alpha / 3, 255, 160, 60)
        canvas.drawCircle(fx.x, fx.y, fx.radius * prog, paint)
        stroke.color = Color.argb(alpha, 255, 180, 70)
        stroke.strokeWidth = 3f
        canvas.drawCircle(fx.x, fx.y, fx.radius * prog, stroke)
        stroke.color = Color.argb(alpha / 2, 255, 230, 160)
        stroke.strokeWidth = 1.5f
        canvas.drawCircle(fx.x, fx.y, fx.radius * prog * 0.75f, stroke)
    }
}
