"use strict";

/* ======================================================================
   BOOTSTRAP – einziger Ort, an dem beim Laden dateiübergreifend
   Funktionen ausgeführt werden (Ladereihenfolge siehe index.html).
   ====================================================================== */

// Hintergrund hinter der Level-Auswahl: Level 1 (pausiert, solange inMenu)
LEVEL = generateCampaignLevel(1);
currentRef = { kind: "campaign", n: 1 };

makeStars();
resize();
window.addEventListener("resize", resize);

buildLegend();
initUi();
buildHud();
resetGame();
showLevelMenu(); // Start in der Level-Auswahl
requestAnimationFrame(frame);

// Service Worker nur über http(s) registrieren – beim direkten Öffnen der
// Datei (file://) läuft das Spiel ohne Offline-Cache einfach weiter.
if ("serviceWorker" in navigator && location.protocol.startsWith("http")) {
  navigator.serviceWorker.register("./sw.js").catch(() => { /* offline-Cache optional */ });
}
