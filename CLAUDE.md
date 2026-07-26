# Spielhalle – Monorepo (Web + Android)

Spielebibliothek mit drei Spielen auf **zwei Plattformen**, die spielmechanisch
synchron gehalten werden:

- `web/` – PWA: HTML + Canvas + Vanilla-JS, kein Build-Schritt.
  Details: `web/CLAUDE.md`
- `android/` – native Android-App: Kotlin, Android-Canvas.
  Details: `android/CLAUDE.md`

## ⚖️ Grundregel: Mechanik synchron, UI plattformspezifisch

**Jede Änderung an Spielmechanik oder Balance wird IMMER auf beiden
Plattformen im selben Commit umgesetzt.** Dazu zählen: Zahlenwerte (Kosten,
Schaden, HP, Raten, Radien), Regeln (Konter, Eroberung, Slots, Duelle),
Level-/Wellen-Definitionen, KI-Verhalten und Generator-Logik.

**Plattformspezifisch bleiben dürfen:** Rendering/Optik, Layout, Menüs,
Eingabe-Details (Maus vs. Touch), Speicher-Backend (localStorage vs.
SharedPreferences) und Performance-Optimierungen.

Ist eine Seite ausnahmsweise nicht im selben Commit nachziehbar, MUSS das im
Commit-Text mit `TODO(sync): …` vermerkt und zeitnah nachgeholt werden.

## 🗺️ Datei-Zuordnung (wo ist das Gegenstück?)

Android-Basis: `android/app/src/main/java/de/schlecht/towerdefense/`

| Spiel | Web (`web/games/…`) | Android |
|---|---|---|
| 🏰 TD: Balance/Türme/Wellen/Level | `towerdefense/js/config.js` | `Config.kt` (`Tuning`, `TOWER_TYPES`, `LEVELS`, `buildWave`) |
| 🏰 TD: Simulation | `towerdefense/js/{enemies,towers}.js`, Teile von `game.js` | `Engine.kt` |
| 🏰 TD: Rendering/UI | `towerdefense/js/game.js`, `index.html` | `GameView.kt`, `TowerPainter.kt`, `MainActivity.kt` |
| 💎 KK: Balance/Einheiten/KI-Profile | `kristallkrieg/js/config.js` | `kristall/KristallConfig.kt` |
| 💎 KK: Simulation + KI | `kristallkrieg/js/{units,ai}.js`, Teile von `game.js` | `kristall/KristallEngine.kt` |
| 💎 KK: Rendering/UI | `kristallkrieg/js/game.js`, `index.html` | `kristall/{KristallView,KristallActivity}.kt` |
| 🦠 ZK: Balance/Zelltypen/KI-Profile | `zellkrieg/js/config.js` | `zell/ZellConfig.kt` |
| 🦠 ZK: Simulation + KI | `zellkrieg/js/{game,ai}.js` | `zell/ZellEngine.kt` |
| 🦠 ZK: Mapgen + Kampagne + Zufall | `zellkrieg/js/{mapgen,campaign}.js`, `rng.js` | `zell/ZellMapGen.kt` (inkl. `Mulberry`) |
| 🦠 ZK: Handgebaute Level | `zellkrieg/js/levels.js` | `zell/ZellLevels.kt` |
| 🦠 ZK: Rendering/UI | `zellkrieg/js/{ui,main}.js`, Teile von `game.js` | `zell/{ZellView,ZellActivity}.kt` |

Beim Ändern einer linken Datei immer die rechte prüfen (und umgekehrt).

## 🎲 Determinismus (Zellkrieg – KRITISCH)

Kampagnen-Level und Zufallskarten werden aus Seeds deterministisch erzeugt.
Damit "Level 17" auf Web und Android dieselbe Karte ist, müssen auf beiden
Plattformen IDENTISCH bleiben:

- der mulberry32-Algorithmus (`rng.js` ↔ `Mulberry` in `ZellMapGen.kt`),
- die REIHENFOLGE aller RNG-Ziehungen in `generateMap`/`campaignDifficulty`,
- `CAMPAIGN_SEED` und das Level-Seed-Mapping (`seed ^ imul(n, 2654435761)`).

Jede Änderung an der Generator-Logik ⇒ `CAMPAIGN_SEED` auf BEIDEN Plattformen
gemeinsam bumpen (sonst verschieben sich alle 50 Karten bzw. laufen die
Plattformen auseinander).

## 📝 Commit-Konventionen

- Präfix im Commit-Text: `[web]`, `[android]` oder `[beide]`.
- Web-Releases: `CACHE`-Version in `web/sw.js` UND `APP_VERSION` in
  `web/games/zellkrieg/js/config.js` hochzählen (Details: `web/CLAUDE.md`).
- `CHANGELOG.md` (Repo-Root) bei nennenswerten Änderungen fortschreiben.

## 🚀 Deployment / Test

- **Web:** Jeder Push auf `master` deployt `web/` automatisch via GitHub
  Actions auf GitHub Pages (`.github/workflows/deploy-web.yml`) → live im
  Browser testbar. Lokal: statischen Server in `web/` starten (`npx serve web`).
- **Android:** `android/` in Android Studio öffnen, Run ▶ (Gerät/Emulator).
  CLI-Build: `android/gradlew.bat assembleDebug` (JDK: Android-Studio-JBR).
