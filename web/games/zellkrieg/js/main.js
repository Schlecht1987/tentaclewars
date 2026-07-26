"use strict";

/* ======================================================================
   BOOTSTRAP – einziger Ort, an dem beim Laden dateiübergreifend
   Funktionen ausgeführt werden (Ladereihenfolge siehe index.html).
   ====================================================================== */

// Hintergrund hinter der Level-Auswahl: Level 1 (pausiert, solange inMenu)
LEVEL = generateCampaignLevel(1);
currentRef = { kind: "campaign", n: 1 };

for (const el of document.querySelectorAll(".app-version")) el.textContent = "v" + APP_VERSION;

makeStars();
resize();
window.addEventListener("resize", resize);
// Fallback für Geräte, bei denen "resize" bei einer Drehung verspätet oder
// gar nicht feuert (bekannte iOS-Safari-Eigenart) – nötig, damit resize()
// bei Quer-/Hochformat-Wechsel view.portrait neu setzt (siehe game.js).
window.addEventListener("orientationchange", resize);

buildLegend();
initUi();
buildHud();
resetGame();
showLevelMenu(); // Start in der Level-Auswahl
requestAnimationFrame(frame);

// Service Worker nur über http(s) registrieren – beim direkten Öffnen der
// Datei (file://) läuft das Spiel ohne Offline-Cache einfach weiter.
if ("serviceWorker" in navigator && location.protocol.startsWith("http")) {
  navigator.serviceWorker.register("../../sw.js").catch(() => { /* offline-Cache optional */ });
}
