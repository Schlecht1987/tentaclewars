"use strict";

/* ======================================================================
   SERVICE WORKER – Offline-Cache (cache-first)
   Bei jedem Release, das Dateien ändert, die CACHE-Version bumpen –
   sonst liefern installierte Clients weiter die alte Version aus.
   Während der Entwicklung: DevTools -> Application -> Service Workers ->
   "Update on reload" / "Bypass for network" aktivieren.
   ====================================================================== */

const CACHE = "spielhalle-v31";

const ASSETS = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./games/zellkrieg/",
  "./games/zellkrieg/index.html",
  "./games/zellkrieg/styles.css",
  "./games/zellkrieg/js/config.js",
  "./games/zellkrieg/js/rng.js",
  "./games/zellkrieg/js/levels.js",
  "./games/zellkrieg/js/mapgen.js",
  "./games/zellkrieg/js/campaign.js",
  "./games/zellkrieg/js/ai.js",
  "./games/zellkrieg/js/game.js",
  "./games/zellkrieg/js/ui.js",
  "./games/zellkrieg/js/debug.js",
  "./games/zellkrieg/js/main.js",
  "./games/towerdefense/",
  "./games/towerdefense/index.html",
  "./games/towerdefense/style.css",
  "./games/towerdefense/js/config.js",
  "./games/towerdefense/js/enemies.js",
  "./games/towerdefense/js/towers.js",
  "./games/towerdefense/js/game.js",
  "./icons/icon.svg",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/icon-512-maskable.png"
];

self.addEventListener("install", e => {
  e.waitUntil(
    caches.open(CACHE)
      .then(c => c.addAll(ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", e => {
  if (e.request.method !== "GET") return;
  e.respondWith(
    caches.match(e.request, { ignoreSearch: true }).then(hit => {
      if (hit) return hit;
      return fetch(e.request).then(res => {
        // nur erfolgreiche Antworten der eigenen Origin nachcachen
        if (res.ok && new URL(e.request.url).origin === self.location.origin) {
          const copy = res.clone();
          caches.open(CACHE).then(c => c.put(e.request, copy));
        }
        return res;
      }).catch(err => {
        // offline: Navigationen auf die gecachte Startseite umleiten
        if (e.request.mode === "navigate") return caches.match("./index.html");
        throw err;
      });
    })
  );
});
