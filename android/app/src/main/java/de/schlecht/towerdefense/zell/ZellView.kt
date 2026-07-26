package de.schlecht.towerdefense.zell

import android.annotation.SuppressLint
import android.content.Context
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.DashPathEffect
import android.graphics.Paint
import android.graphics.Path
import android.graphics.RadialGradient
import android.graphics.RectF
import android.graphics.Shader
import android.util.AttributeSet
import android.view.Choreographer
import android.view.MotionEvent
import android.view.View
import kotlin.math.PI
import kotlin.math.ceil
import kotlin.math.cos
import kotlin.math.hypot
import kotlin.math.max
import kotlin.math.min
import kotlin.math.roundToInt
import kotlin.math.sin

/**
 * Zellkrieg-Spielfläche: fixed-timestep-Simulation (30 Hz) mit interpoliertem
 * Rendering, Ein-Finger-Spielgesten (ziehen, tippen, schneiden) und
 * Zwei-Finger-Kamera (verschieben + Pinch-Zoom).
 */
class ZellView @JvmOverloads constructor(
    context: Context, attrs: AttributeSet? = null,
) : View(context, attrs), Choreographer.FrameCallback {

    val engine = ZellHolder.engine

    var onUiUpdate: (() -> Unit)? = null

    private var running = false
    private var lastFrameNanos = 0L
    private var simAccumulator = 0f
    private var alpha = 1f
    private var nowSec = 0f

    // ---- Kamera ----
    private var fitScale = 1f
    private var zoom = ZK.START_ZOOM
    private var panX = 0f
    private var panY = 0f
    private var scale = 1f
    private var offX = 0f
    private var offY = 0f
    private var focusX = -1f
    private var focusY = -1f
    private val pad = 8f
    // Hochformat: die querformatige Welt wird um 90° gedreht gezeichnet,
    // damit sie den hochkant gehaltenen Bildschirm füllt (wie in der Web-Version)
    private var rotated = false

    // ---- Eingabe ----
    private var dragSource: ZCell? = null
    private var hovered: ZCell? = null
    private var pointerWx = 0f
    private var pointerWy = 0f
    private var cutting = false
    private var cutArmed = false
    private var cutStartX = 0f
    private var cutStartY = 0f
    private var cutLastX = 0f
    private var cutLastY = 0f
    private val cutTrail = mutableListOf<FloatArray>() // [x, y, zeitSek]
    private var panning = false
    private var ignoreUntilDown = false
    private var pinchMx = 0f
    private var pinchMy = 0f
    private var pinchDist = 0f

    // ---- Zeichnen ----
    private val paint = Paint(Paint.ANTI_ALIAS_FLAG)
    private val stroke = Paint(Paint.ANTI_ALIAS_FLAG).apply { style = Paint.Style.STROKE }
    private val textPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        textAlign = Paint.Align.CENTER
        isFakeBoldText = true
    }
    private val path = Path()
    private val rect = RectF()
    private val gradientCache = HashMap<Long, RadialGradient>()
    private var stars = FloatArray(0) // x, y, r, alpha je Stern

    // ---------------------------------------------------------------

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

    init {
        // Nach Activity-Neuaufbau (z. B. Bildschirmdrehung) läuft ggf. schon ein
        // Level in der Engine – Sterne dafür direkt erzeugen.
        if (engine.cells.isNotEmpty()) makeStars()
    }

    /** Nach dem Laden eines Levels: Sterne und Kamera zurücksetzen. */
    fun onLevelLoaded() {
        makeStars()
        zoom = ZK.START_ZOOM; panX = 0f; panY = 0f
        focusOnHome()
        applyCamera()
        invalidate()
    }

    private fun focusOnHome() {
        val home = engine.cells.filter { it.owner == "player" }.maxByOrNull { it.units }
        if (home != null) { focusX = home.x; focusY = home.y } else { focusX = -1f }
    }

    private fun makeStars() {
        var seed = 42L
        fun rnd(): Float { seed = seed * 16807 % 2147483647; return seed / 2147483647f }
        val lv = engine.level
        stars = FloatArray(70 * 4)
        for (i in 0 until 70) {
            stars[i * 4] = rnd() * lv.width
            stars[i * 4 + 1] = rnd() * lv.height
            stars[i * 4 + 2] = 0.6f + rnd() * 1.3f
            stars[i * 4 + 3] = 0.04f + rnd() * 0.1f
        }
    }

    override fun onSizeChanged(w: Int, h: Int, oldw: Int, oldh: Int) {
        // Beim Wechsel Hoch-/Querformat wieder auf die Heimatzelle zentrieren
        if (engine.cells.isNotEmpty() && (h > w) != rotated) focusOnHome()
        applyCamera()
    }

    private fun applyCamera() {
        val lv = engine.level
        rotated = height > width
        // Im Hochformat liegen Feldbreite/-höhe an vertauschten Bildschirmachsen
        val fieldW = if (rotated) lv.height else lv.width
        val fieldH = if (rotated) lv.width else lv.height
        val availW = width - pad * 2
        val availH = height - pad * 2
        if (availW <= 0 || availH <= 0) return
        fitScale = min(availW / fieldW, availH / fieldH)
        zoom = zoom.coerceIn(1f, ZK.MAX_ZOOM)
        scale = fitScale * zoom
        val w = fieldW * scale
        val h = fieldH * scale
        val baseX = (width - w) / 2
        val baseY = (height - h) / 2

        if (focusX >= 0) {
            // Fokus-Weltpunkt in Bildschirmachsen der Feld-Bounding-Box umrechnen
            val bx = if (rotated) lv.height - focusY else focusX
            val by = if (rotated) focusX else focusY
            panX = (pad + availW / 2 - bx * scale) - baseX
            panY = (pad + availH / 2 - by * scale) - baseY
            focusX = -1f
        }

        if (w <= availW) { panX = 0f; offX = baseX }
        else {
            offX = min(pad, max(pad + availW - w, baseX + panX))
            panX = offX - baseX
        }
        if (h <= availH) { panY = 0f; offY = baseY }
        else {
            offY = min(pad, max(pad + availH - h, baseY + panY))
            panY = offY - baseY
        }
    }

    // ---------------------------------------------------------------

    override fun doFrame(frameTimeNanos: Long) {
        if (!running) return
        val simDt = 1f / ZK.SIM_TICK_RATE
        var frameDt = 0f
        if (lastFrameNanos != 0L) {
            frameDt = min(0.25f, (frameTimeNanos - lastFrameNanos) / 1_000_000_000f)
        }
        lastFrameNanos = frameTimeNanos
        nowSec += frameDt

        if (!engine.paused && !engine.inMenu) {
            simAccumulator += frameDt
            var steps = 0
            while (simAccumulator >= simDt && steps < 5) {
                engine.snapshotPrevState()
                engine.update(simDt)
                simAccumulator -= simDt
                steps++
            }
            if (steps == 5) simAccumulator = 0f
            alpha = (simAccumulator / simDt).coerceIn(0f, 1f)
        }

        cutTrail.removeAll { nowSec - it[2] > 0.35f }
        onUiUpdate?.invoke()
        invalidate()
        Choreographer.getInstance().postFrameCallback(this)
    }

    // ---------------------------------------------------------------
    // Eingabe

    // Umkehrung der (im Hochformat gedrehten) Welt-Transform
    private fun toWorldX(sx: Float, sy: Float) =
        if (rotated) (sy - offY) / scale else (sx - offX) / scale

    private fun toWorldY(sx: Float, sy: Float) =
        if (rotated) (offX + engine.level.height * scale - sx) / scale else (sy - offY) / scale

    private fun pickCell(wx: Float, wy: Float): ZCell? {
        val slop = 26f / scale
        var best: ZCell? = null
        var bestD = Float.MAX_VALUE
        for (c in engine.cells) {
            val r = cellRadiusOf(c) + slop
            val d = hypot(wx - c.x, wy - c.y)
            if (d <= r && d < bestD) { best = c; bestD = d }
        }
        return best
    }

    @SuppressLint("ClickableViewAccessibility")
    override fun onTouchEvent(event: MotionEvent): Boolean {
        when (event.actionMasked) {
            MotionEvent.ACTION_DOWN -> {
                ignoreUntilDown = false
                if (engine.gameOver || engine.inMenu || engine.paused) return true
                val wx = toWorldX(event.x, event.y)
                val wy = toWorldY(event.x, event.y)
                pointerWx = wx; pointerWy = wy
                val cell = pickCell(wx, wy)
                val sel = engine.selected

                if (sel != null && cell != null && cell !== sel) {
                    engine.tryCommand(sel, cell)
                    engine.selected = null
                    return true
                }
                if (cell != null && engine.controllable(cell)) {
                    engine.selected = cell
                    dragSource = cell
                } else if (cell == null) {
                    engine.selected = null
                    cutting = true
                    cutArmed = false
                    cutStartX = wx; cutStartY = wy
                    cutLastX = wx; cutLastY = wy
                    cutTrail.add(floatArrayOf(wx, wy, nowSec))
                } else {
                    engine.selected = null
                }
            }

            MotionEvent.ACTION_POINTER_DOWN -> {
                if (event.pointerCount == 2) {
                    // Zweiter Finger: Kamera-Modus, laufende Spielgeste abbrechen
                    panning = true
                    savePinchState(event)
                    dragSource = null; cutting = false; cutArmed = false
                }
            }

            MotionEvent.ACTION_MOVE -> {
                if (panning && event.pointerCount >= 2) {
                    val mx = (event.getX(0) + event.getX(1)) / 2
                    val my = (event.getY(0) + event.getY(1)) / 2
                    val dist = max(20f, hypot(event.getX(0) - event.getX(1), event.getY(0) - event.getY(1)))
                    val newZoom = (zoom * (dist / pinchDist)).coerceIn(1f, ZK.MAX_ZOOM)
                    val f = (fitScale * newZoom) / scale
                    val nOffX = mx - (pinchMx - offX) * f
                    val nOffY = my - (pinchMy - offY) * f
                    val lv = engine.level
                    val fieldW = if (rotated) lv.height else lv.width
                    val fieldH = if (rotated) lv.width else lv.height
                    val w2 = fieldW * fitScale * newZoom
                    val h2 = fieldH * fitScale * newZoom
                    zoom = newZoom
                    panX = nOffX - (width - w2) / 2
                    panY = nOffY - (height - h2) / 2
                    applyCamera()
                    pinchMx = mx; pinchMy = my; pinchDist = dist
                    return true
                }
                if (ignoreUntilDown) return true
                val wx = toWorldX(event.x, event.y)
                val wy = toWorldY(event.x, event.y)
                pointerWx = wx; pointerWy = wy
                hovered = pickCell(wx, wy)

                if (cutting && !engine.gameOver) {
                    // Schnitt erst nach kurzer Zugstrecke "scharf" (kein Zerschneiden bei Wacklern)
                    if (!cutArmed && hypot(wx - cutStartX, wy - cutStartY) > 12f) cutArmed = true
                    if (cutArmed) {
                        engine.performCut(cutLastX, cutLastY, wx, wy, 0xFFEAF2FA.toInt())
                    }
                    cutLastX = wx; cutLastY = wy
                    cutTrail.add(floatArrayOf(wx, wy, nowSec))
                }
            }

            MotionEvent.ACTION_POINTER_UP -> {
                if (panning && event.pointerCount - 1 < 2) {
                    panning = false
                    // verbleibender Finger startet KEINE neue Spielgeste
                    ignoreUntilDown = true
                }
                else if (panning) savePinchState(event, skipIndex = event.actionIndex)
            }

            MotionEvent.ACTION_UP -> {
                if (!panning && !ignoreUntilDown) {
                    val ds = dragSource
                    if (ds != null && !engine.paused) {
                        val cell = pickCell(toWorldX(event.x, event.y), toWorldY(event.x, event.y))
                        if (cell != null && cell !== ds) {
                            engine.tryCommand(ds, cell)
                            engine.selected = null
                        }
                    }
                }
                dragSource = null
                cutting = false
                cutArmed = false
                panning = false
                ignoreUntilDown = false
            }

            MotionEvent.ACTION_CANCEL -> {
                dragSource = null; cutting = false; cutArmed = false
                panning = false; ignoreUntilDown = false
            }
        }
        return true
    }

    private fun savePinchState(event: MotionEvent, skipIndex: Int = -1) {
        val idx = ArrayList<Int>(2)
        for (i in 0 until event.pointerCount) {
            if (i != skipIndex && idx.size < 2) idx.add(i)
        }
        if (idx.size < 2) return
        pinchMx = (event.getX(idx[0]) + event.getX(idx[1])) / 2
        pinchMy = (event.getY(idx[0]) + event.getY(idx[1])) / 2
        pinchDist = max(20f, hypot(
            event.getX(idx[0]) - event.getX(idx[1]),
            event.getY(idx[0]) - event.getY(idx[1]),
        ))
    }

    // ---------------------------------------------------------------
    // Rendering

    private fun colorOf(owner: String) = Z_OWNER_COLOR[owner] ?: Z_OWNER_COLOR.getValue("neutral")

    private fun withAlpha(color: Int, a: Float): Int =
        color and 0x00FFFFFF or ((a.coerceIn(0f, 1f) * 255).toInt() shl 24)

    override fun onDraw(canvas: Canvas) {
        // Hintergrund-Vignette
        canvas.drawColor(0xFF080E18.toInt())
        paint.color = 0xFF0D1626.toInt()
        canvas.drawCircle(width / 2f, height / 2f, max(width, height) * 0.7f, paint)

        canvas.save()
        if (rotated) {
            // Welt um 90° drehen: (x, y) -> (offX + H*s - y*s, offY + x*s)
            canvas.translate(offX + engine.level.height * scale, offY)
            canvas.rotate(90f)
            canvas.scale(scale, scale)
        } else {
            canvas.translate(offX, offY)
            canvas.scale(scale, scale)
        }

        // Sterne
        for (i in 0 until stars.size / 4) {
            paint.color = withAlpha(Color.rgb(160, 190, 220), stars[i * 4 + 3])
            canvas.drawCircle(stars[i * 4], stars[i * 4 + 1], stars[i * 4 + 2], paint)
        }

        // Tentakel (unter den Zellen)
        for (t in engine.tentacles) drawTentacle(canvas, t)

        drawDragPreview(canvas)
        drawCutTrail(canvas)
        drawSlashes(canvas)
        for (c in engine.cells) drawCell(canvas, c)

        canvas.restore()

        // Pause-Overlay in Bildschirmkoordinaten
        if (engine.paused) {
            paint.color = 0x730A111C
            canvas.drawRect(0f, 0f, width.toFloat(), height.toFloat(), paint)
            textPaint.color = 0xFFEAF2FA.toInt()
            textPaint.textSize = 28f * resources.displayMetrics.density
            canvas.drawText("PAUSIERT", width / 2f, height / 2f + 10, textPaint)
        }
    }

    private fun drawTentacle(canvas: Canvas, t: ZTentacle) {
        val head = t.prevHead + (t.head - t.prevHead) * alpha
        val tail = t.prevTail + (t.tail - t.prevTail) * alpha
        val seg = head - tail
        if (seg < 1) return
        val color = colorOf(t.owner)
        val nx = -t.uy
        val ny = t.ux

        fun wob(L: Float): Float =
            sin(L * 0.045f + nowSec * 3.33f + t.phase) * 5f * sin(PI.toFloat() * L / t.len)

        // Wellige Linie
        stroke.color = withAlpha(color, 0.85f)
        stroke.strokeWidth = 3f
        stroke.strokeCap = Paint.Cap.ROUND
        path.reset()
        val steps = max(6, (seg / 12).roundToInt())
        for (i in 0..steps) {
            val L = tail + seg * (i.toFloat() / steps)
            val o = wob(L)
            val px = t.p0x + t.ux * L + nx * o
            val py = t.p0y + t.uy * L + ny * o
            if (i == 0) path.moveTo(px, py) else path.lineTo(px, py)
        }
        canvas.drawPath(path, stroke)

        // Spitze
        val ho = wob(head)
        val tipX = t.p0x + t.ux * head + nx * ho
        val tipY = t.p0y + t.uy * head + ny * ho
        paint.color = color
        canvas.drawCircle(tipX, tipY, 4.2f, paint)

        // Duell-Funken
        if (t.clashGlow > 0) {
            val a = min(1f, t.clashGlow / 0.25f)
            val flicker = 0.75f + 0.25f * sin(nowSec * 33f + t.phase * 7)
            paint.color = withAlpha(Color.WHITE, 0.85f * a)
            canvas.drawCircle(tipX, tipY, (3f + 3f * a) * flicker, paint)
        }

        // Fluss-Punkte: Rückzug / freies Stück / Duell-Front
        if (t.mode == TMode.RETRACT || t.mode == TMode.FREE || t.clashGlow > 0) {
            val dir = if (t.mode == TMode.RETRACT) -1 else 1
            val boosted = t.boostGlow > 0
            val spacing = 26f
            val shift = (nowSec * ZK.FLOW_DOT_SPEED * (if (boosted) 1.5f else 1f)) % spacing
            paint.color = withAlpha(Color.WHITE, if (boosted) 0.95f else 0.8f)
            var L = tail + if (dir == 1) shift else spacing - shift
            while (L < head) {
                val o = wob(L)
                canvas.drawCircle(t.p0x + t.ux * L + nx * o, t.p0y + t.uy * L + ny * o,
                    if (boosted) 2.1f else 1.7f, paint)
                L += spacing
            }
        }

        // Fluss-Punkte für angedockte, übertragende Tentakel (Pipeline-Front)
        if (t.pipeline.isNotEmpty()) {
            val lead = t.pipeline.first()
            val travelTime = if (lead.travel > 0) lead.travel else t.len / ZK.FLOW_DOT_SPEED
            val boosted = t.boostGlow > 0
            val leadFrac = 1f - (lead.remaining / travelTime).coerceIn(0f, 1f)
            val leadL = tail + leadFrac * (head - tail)
            val spacing = 26f
            val dotSpeed = t.dotSpeed * (if (boosted) 1.5f else 1f)
            val shift = (nowSec * dotSpeed) % spacing
            paint.color = withAlpha(Color.WHITE, if (boosted) 0.95f else 0.8f)
            var L = tail + shift
            while (L < leadL) {
                val o = wob(L)
                canvas.drawCircle(t.p0x + t.ux * L + nx * o, t.p0y + t.uy * L + ny * o,
                    if (boosted) 2.1f else 1.7f, paint)
                L += spacing
            }
        }
    }

    private fun drawDragPreview(canvas: Canvas) {
        val ds = dragSource ?: return
        var tx = pointerWx
        var ty = pointerWy
        var snap = false
        val hov = hovered
        if (hov != null && hov !== ds) { tx = hov.x; ty = hov.y; snap = true }

        stroke.color = withAlpha(colorOf(ds.owner), if (snap) 0.9f else 0.5f)
        stroke.strokeWidth = if (snap) 3f else 2f
        stroke.pathEffect = DashPathEffect(floatArrayOf(6f, 6f), 0f)
        canvas.drawLine(ds.x, ds.y, tx, ty, stroke)
        stroke.pathEffect = null

        val d = hypot(tx - ds.x, ty - ds.y) - cellRadiusOf(ds) -
            (if (snap && hov != null) cellRadiusOf(hov) else 0f)
        if (d > 20) {
            val cost = ceil(d / ZK.LENGTH_PER_UNIT).toInt()
            textPaint.color = withAlpha(0xFFEAF2FA.toInt(), 0.9f)
            textPaint.textSize = 13f
            canvas.save()
            canvas.translate((ds.x + tx) / 2, (ds.y + ty) / 2)
            if (rotated) canvas.rotate(-90f) // Text bleibt bildschirm-aufrecht
            canvas.drawText("−$cost", 0f, -10f, textPaint)
            canvas.restore()
        }
    }

    private fun drawCutTrail(canvas: Canvas) {
        if (cutTrail.size < 2) return
        stroke.strokeCap = Paint.Cap.ROUND
        stroke.strokeWidth = 2f
        for (i in 1 until cutTrail.size) {
            val a = 1f - (nowSec - cutTrail[i][2]) / 0.35f
            if (a <= 0) continue
            stroke.color = withAlpha(0xFFEAF2FA.toInt(), a * 0.7f)
            canvas.drawLine(cutTrail[i - 1][0], cutTrail[i - 1][1], cutTrail[i][0], cutTrail[i][1], stroke)
        }
    }

    private fun drawSlashes(canvas: Canvas) {
        for (s in engine.slashes) {
            val a = max(0f, 1f - s.age / 0.8f)
            stroke.color = withAlpha(s.color, a)
            stroke.strokeWidth = 3.5f
            canvas.drawLine(s.x1, s.y1, s.x2, s.y2, stroke)
            val mx = (s.x1 + s.x2) / 2
            val my = (s.y1 + s.y2) / 2
            stroke.strokeWidth = 2f
            stroke.color = withAlpha(s.color, a * 0.6f)
            canvas.drawCircle(mx, my, 6f + s.age * 50f, stroke)
        }
    }

    private fun shapePath(out: Path, type: String, x: Float, y: Float, r: Float) {
        out.reset()
        when (type) {
            "bunker" -> {
                for (i in 0 until 6) {
                    val a = (i / 6f) * 2 * PI.toFloat() - PI.toFloat() / 2
                    val px = x + cos(a) * r
                    val py = y + sin(a) * r
                    if (i == 0) out.moveTo(px, py) else out.lineTo(px, py)
                }
                out.close()
            }
            "attacker" -> {
                val spikes = 10
                for (i in 0 until spikes * 2) {
                    val a = (i / (spikes * 2f)) * 2 * PI.toFloat() - PI.toFloat() / 2
                    val rr = if (i % 2 == 0) r * 1.16f else r * 0.86f
                    val px = x + cos(a) * rr
                    val py = y + sin(a) * rr
                    if (i == 0) out.moveTo(px, py) else out.lineTo(px, py)
                }
                out.close()
            }
            "factory" -> {
                val teeth = 8
                val ri = r * 0.8f
                val stepDeg = 360f / teeth
                val wDeg = stepDeg * 0.27f
                for (i in 0 until teeth) {
                    val aDeg = i * stepDeg
                    rect.set(x - r, y - r, x + r, y + r)
                    out.arcTo(rect, aDeg - wDeg, 2 * wDeg, false)
                    rect.set(x - ri, y - ri, x + ri, y + ri)
                    out.arcTo(rect, aDeg + wDeg, stepDeg - 2 * wDeg, false)
                }
                out.close()
            }
            else -> out.addCircle(x, y, r, Path.Direction.CW)
        }
    }

    private fun cellGradient(color: Int, r: Float): RadialGradient {
        val key = color.toLong() shl 16 or r.toInt().toLong()
        return gradientCache.getOrPut(key) {
            RadialGradient(
                0f, 0f, r,
                intArrayOf(0xF2101A2A.toInt(), withAlpha(color, 0.22f)),
                floatArrayOf(0.2f, 1f), Shader.TileMode.CLAMP,
            )
        }
    }

    private fun drawCell(canvas: Canvas, c: ZCell) {
        val color = colorOf(c.owner)
        val r = cellRadiusOf(c)
        val charging = c.owner == "neutral" && c.chargeOwner != null
        val ringColor = if (charging) colorOf(c.chargeOwner!!) else color
        val frac = if (charging) (c.units / ZK.CAPTURE_CHARGE).coerceIn(0f, 1f)
        else (c.units / cellMaxOf(c)).coerceIn(0f, 1f)

        // Körper: Form + radialer Verlauf + Kontur. Der gecachte Gradient ist um
        // den Ursprung zentriert, daher wird die Zeichnung auf die Zellmitte
        // verschoben. Im Hochformat wird die Welt-Drehung lokal zurückgenommen,
        // damit Zahlen, Heiler-Kreuz und Slot-Punkte bildschirm-aufrecht stehen.
        canvas.save()
        canvas.translate(c.x, c.y)
        if (rotated) canvas.rotate(-90f)
        shapePath(path, c.type, 0f, 0f, r)
        paint.shader = cellGradient(color, r)
        canvas.drawPath(path, paint)
        paint.shader = null
        stroke.color = color
        stroke.strokeWidth = 2.5f
        canvas.drawPath(path, stroke)
        if (c.type == "bunker") {
            shapePath(path, c.type, 0f, 0f, r - 5)
            stroke.color = withAlpha(color, 0.5f)
            stroke.strokeWidth = 1.5f
            canvas.drawPath(path, stroke)
        }
        if (c.type == "healer") {
            paint.color = 0xFF0A111C.toInt()
            canvas.drawCircle(0f, -r, 7f, paint)
            stroke.color = color
            stroke.strokeWidth = 1.5f
            canvas.drawCircle(0f, -r, 7f, stroke)
            canvas.drawLine(-3.5f, -r, 3.5f, -r, stroke)
            canvas.drawLine(0f, -r - 3.5f, 0f, -r + 3.5f, stroke)
        }

        // Ausbaustufe: kleine Ringe am Zellrand
        if (c.tier > 0) {
            stroke.strokeWidth = 1.4f
            stroke.color = withAlpha(color, 0.28f)
            for (s in 0 until c.tier) {
                canvas.drawCircle(0f, 0f, r + 2 + s * 2.4f, stroke)
            }
        }

        // Füllstands- bzw. Lade-Ring
        stroke.color = withAlpha(ringColor, if (charging) 0.9f else 0.55f)
        stroke.strokeWidth = if (charging) 4f else 3f
        rect.set(-r - 7, -r - 7, r + 7, r + 7)
        canvas.drawArc(rect, -90f, frac * 360f, false, stroke)

        // Umkämpfte Neutrale: rotierender Strichring in Eroberer-Farbe
        if (charging) {
            stroke.color = withAlpha(ringColor, 0.7f)
            stroke.strokeWidth = 1.6f
            stroke.pathEffect = DashPathEffect(floatArrayOf(4f, 6f), (nowSec * 16.7f) % 20f)
            canvas.drawCircle(0f, 0f, r + 12, stroke)
            stroke.pathEffect = null
        }

        // Auswahl-Ring
        if (c === engine.selected) {
            stroke.color = color
            stroke.strokeWidth = 2f
            stroke.pathEffect = DashPathEffect(floatArrayOf(5f, 5f), (nowSec * 25f) % 10f)
            canvas.drawCircle(0f, 0f, r + 13, stroke)
            stroke.pathEffect = null
        }

        // Sende-Blitz
        if (c.flash > 0) {
            val k = 1f - c.flash / 0.3f
            stroke.color = withAlpha(color, 0.5f * (1 - k))
            stroke.strokeWidth = 2f
            canvas.drawCircle(0f, 0f, r + 8 + k * 14, stroke)
        }
        // Abgelehnt-Blitz
        if (c.denyFlash > 0) {
            stroke.color = withAlpha(0xFFFF5964.toInt(), min(1f, c.denyFlash * 2.2f))
            stroke.strokeWidth = 3f
            canvas.drawCircle(0f, 0f, r + 10, stroke)
        }

        // Punkte-Zähler
        textPaint.color = 0xFFEAF2FA.toInt()
        textPaint.textSize = (r * 0.62f).roundToInt().toFloat()
        canvas.drawText(
            max(0, c.units.toInt()).toString(),
            0f, textPaint.textSize * 0.36f, textPaint,
        )

        // Tentakel-Slots als kleine Punkte unter befehligbaren Zellen
        if (engine.controllable(c)) {
            val total = engine.maxSlots(c)
            val used = engine.outgoingCount(c)
            val sy = r + 16
            val x0 = -((total - 1) * 9f) / 2
            for (i in 0 until total) {
                if (i < used) {
                    paint.color = color
                    canvas.drawCircle(x0 + i * 9, sy, 2.6f, paint)
                } else {
                    stroke.color = withAlpha(color, 0.45f)
                    stroke.strokeWidth = 1.2f
                    canvas.drawCircle(x0 + i * 9, sy, 2.6f, stroke)
                }
            }
        }
        canvas.restore()
    }
}
