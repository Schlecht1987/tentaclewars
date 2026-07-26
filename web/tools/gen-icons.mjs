// Einmal-Werkzeug: erzeugt die App-Icons (icons/icon-192.png, icon-512.png,
// icon-512-maskable.png) passend zu icons/icon.svg – ohne Abhängigkeiten
// (eigener Mini-Rasterizer + PNG-Encoder über Node-zlib).
//
//   node tools/gen-icons.mjs
//
// Nur nötig, wenn sich das Icon-Design ändert; die PNGs sind eingecheckt.

import { deflateSync } from "node:zlib";
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

/* ---------- Mini-Rasterizer (RGBA, weiches Kanten-Blending) ---------- */

function makeImage(size) {
  return { size, data: new Uint8ClampedArray(size * size * 4) };
}

function hex(c) {
  const n = parseInt(c.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function blend(img, x, y, [r, g, b], a) {
  if (a <= 0 || x < 0 || y < 0 || x >= img.size || y >= img.size) return;
  const i = (y * img.size + x) * 4;
  const d = img.data;
  const inv = 1 - a;
  const outA = a + (d[i + 3] / 255) * inv;
  if (outA <= 0) return;
  d[i]     = (r * a + d[i]     * (d[i + 3] / 255) * inv) / outA;
  d[i + 1] = (g * a + d[i + 1] * (d[i + 3] / 255) * inv) / outA;
  d[i + 2] = (b * a + d[i + 2] * (d[i + 3] / 255) * inv) / outA;
  d[i + 3] = outA * 255;
}

// Distanzbasierte Formen: alpha = Deckkraft am Pixel (weiche 1px-Kante)
function paint(img, color, alphaAt, opacity = 1) {
  const c = hex(color);
  for (let y = 0; y < img.size; y++) {
    for (let x = 0; x < img.size; x++) {
      const a = alphaAt(x + 0.5, y + 0.5);
      if (a > 0) blend(img, x, y, c, Math.min(1, a) * opacity);
    }
  }
}

const clamp01 = v => Math.max(0, Math.min(1, v));

function fillCircle(img, cx, cy, r, color, opacity = 1) {
  paint(img, color, (x, y) => clamp01(r + 0.5 - Math.hypot(x - cx, y - cy)), opacity);
}

function ring(img, cx, cy, r, width, color, opacity = 1, arc = null) {
  paint(img, color, (x, y) => {
    const d = Math.abs(Math.hypot(x - cx, y - cy) - r);
    if (arc) {
      let ang = Math.atan2(y - cy, x - cx);
      if (!angleInArc(ang, arc[0], arc[1])) return 0;
    }
    return clamp01(width / 2 + 0.5 - d);
  }, opacity);
}

function angleInArc(a, from, to) {
  const tau = Math.PI * 2;
  const norm = v => ((v % tau) + tau) % tau;
  a = norm(a); from = norm(from); to = norm(to);
  return from <= to ? (a >= from && a <= to) : (a >= from || a <= to);
}

// Quadratische Bezier-Kurve als "Schlauch" (gestempelte Kreise)
function bezierTube(img, p0, p1, p2, width, color) {
  const c = hex(color);
  const steps = 400;
  const r = width / 2;
  // Distanzfeld per Sampling: für jeden Pixel wäre das teuer, daher
  // stempeln wir dicht entlang der Kurve in ein Alpha-Feld
  const alpha = new Float32Array(img.size * img.size);
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const x = (1 - t) * (1 - t) * p0[0] + 2 * (1 - t) * t * p1[0] + t * t * p2[0];
    const y = (1 - t) * (1 - t) * p0[1] + 2 * (1 - t) * t * p1[1] + t * t * p2[1];
    const x0 = Math.max(0, Math.floor(x - r - 1)), x1 = Math.min(img.size - 1, Math.ceil(x + r + 1));
    const y0 = Math.max(0, Math.floor(y - r - 1)), y1 = Math.min(img.size - 1, Math.ceil(y + r + 1));
    for (let py = y0; py <= y1; py++) {
      for (let px = x0; px <= x1; px++) {
        const a = clamp01(r + 0.5 - Math.hypot(px + 0.5 - x, py + 0.5 - y));
        const idx = py * img.size + px;
        if (a > alpha[idx]) alpha[idx] = a;
      }
    }
  }
  for (let y = 0; y < img.size; y++) {
    for (let x = 0; x < img.size; x++) {
      const a = alpha[y * img.size + x];
      if (a > 0) blend(img, x, y, c, a);
    }
  }
}

// Bilineares Herunterskalieren
function scaleImage(img, size) {
  const out = makeImage(size);
  const f = img.size / size;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      // Box-Sampling über den Quellbereich
      let r = 0, g = 0, b = 0, a = 0, n = 0;
      const sx0 = Math.floor(x * f), sx1 = Math.min(img.size - 1, Math.ceil((x + 1) * f) - 1);
      const sy0 = Math.floor(y * f), sy1 = Math.min(img.size - 1, Math.ceil((y + 1) * f) - 1);
      for (let sy = sy0; sy <= sy1; sy++) {
        for (let sx = sx0; sx <= sx1; sx++) {
          const i = (sy * img.size + sx) * 4;
          const pa = img.data[i + 3] / 255;
          r += img.data[i] * pa; g += img.data[i + 1] * pa; b += img.data[i + 2] * pa;
          a += pa; n++;
        }
      }
      const i = (y * size + x) * 4;
      if (a > 0) {
        out.data[i] = r / a; out.data[i + 1] = g / a; out.data[i + 2] = b / a;
        out.data[i + 3] = (a / n) * 255;
      }
    }
  }
  return out;
}

/* ---------- PNG-Encoder ---------- */

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xFFFFFFFF;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 255] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function encodePng(img) {
  const s = img.size;
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(s, 0);
  ihdr.writeUInt32BE(s, 4);
  ihdr[8] = 8;  // bit depth
  ihdr[9] = 6;  // RGBA
  const raw = Buffer.alloc(s * (s * 4 + 1));
  for (let y = 0; y < s; y++) {
    raw[y * (s * 4 + 1)] = 0; // Filter: none
    Buffer.from(img.data.buffer, y * s * 4, s * 4).copy(raw, y * (s * 4 + 1) + 1);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0))
  ]);
}

/* ---------- Icon-Design (entspricht icons/icon.svg) ---------- */

function drawDesign(img, scale = 1, offset = 0) {
  const s = v => v * scale + offset;
  // Tentakel: Bezier von der Spielerzelle zur neutralen Zelle
  bezierTube(img, [s(214), s(330)], [s(300), s(260)], [s(356), s(178)], 16 * scale, "#4fc1ff");
  fillCircle(img, s(356), s(178), 12 * scale, "#4fc1ff");
  // neutrale Zielzelle
  fillCircle(img, s(392), s(130), 52 * scale, "#101a2a");
  ring(img, s(392), s(130), 52 * scale, 10 * scale, "#8593a1");
  // Spielerzelle mit Füllstands-Ring
  fillCircle(img, s(176), s(352), 92 * scale, "#101a2a");
  ring(img, s(176), s(352), 92 * scale, 14 * scale, "#4fc1ff");
  ring(img, s(176), s(352), 114 * scale, 10 * scale, "#4fc1ff", 0.55, [-Math.PI / 2, Math.PI * 0.75]);
}

function renderIcon() {
  const img = makeImage(512);
  // abgerundetes dunkles Quadrat (rx 96), Ecken transparent
  paint(img, "#0a111c", (x, y) => {
    const rx = 96;
    const dx = Math.max(rx - x, x - (512 - rx), 0);
    const dy = Math.max(rx - y, y - (512 - rx), 0);
    return clamp01(rx + 0.5 - Math.hypot(dx, dy));
  });
  drawDesign(img);
  return img;
}

function renderMaskable() {
  const img = makeImage(512);
  paint(img, "#0a111c", () => 1); // volle Fläche (Maskable: Rand wird beschnitten)
  drawDesign(img, 0.72, 512 * 0.14); // Design in die sichere Zone schrumpfen
  return img;
}

mkdirSync(join(root, "icons"), { recursive: true });
const icon512 = renderIcon();
writeFileSync(join(root, "icons", "icon-512.png"), encodePng(icon512));
writeFileSync(join(root, "icons", "icon-192.png"), encodePng(scaleImage(icon512, 192)));
writeFileSync(join(root, "icons", "icon-512-maskable.png"), encodePng(renderMaskable()));
console.log("Icons geschrieben: icons/icon-192.png, icon-512.png, icon-512-maskable.png");
