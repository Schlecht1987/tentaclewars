"use strict";

/* ======================================================================
   SERVICE WORKER – Offline-Cache (cache-first)
   Bei jedem Release, das Dateien ändert, die CACHE-Version bumpen –
   sonst liefern installierte Clients weiter die alte Version aus.
   Während der Entwicklung: DevTools -> Application -> Service Workers ->
   "Update on reload" / "Bypass for network" aktivieren.
   ====================================================================== */

const CACHE = "zellkrieg-v11";

const ASSETS = [
  "./",
  "./index.html",
  "./styles.css",
  "./manifest.webmanifest",
  "./js/config.js",
  "./js/rng.js",
  "./js/levels.js",
  "./js/mapgen.js",
  "./js/campaign.js",
  "./js/ai.js",
  "./js/game.js",
  "./js/ui.js",
  "./js/debug.js",
  "./js/main.js",
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
