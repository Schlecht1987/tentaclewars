# Spielhalle – Native Android-App

Native Kotlin-Portierung der Web-Spielhalle (`../web/`). **Spielmechanik und
Balance müssen mit der Web-Version übereinstimmen** – Grundregel und
Datei-Zuordnung stehen in der Root-`CLAUDE.md`.

## Build

- **Android Studio:** diesen Ordner (`android/`) als Projekt öffnen, Run ▶.
- **CLI:** `gradlew.bat assembleDebug` – benötigt ein JDK 17+
  (z. B. `JAVA_HOME = C:\Program Files\Android\Android Studio\jbr`) und ein
  `local.properties` mit `sdk.dir` (legt Android Studio automatisch an).
- App-ID `de.schlecht.towerdefense`, minSdk 26, App-Name "Spielhalle".

## Architektur

Ein Modul (`app`), Package `de.schlecht.towerdefense`:

- **`LauncherActivity`** – Spielebibliothek (Einstiegspunkt), zeigt pro Spiel
  eine Karte mit Fortschritt.
- **🏰 Tower Defense** (Package-Root): `Config.kt` (Balance = Web-`config.js`),
  `Engine.kt` (Simulation), `GameView.kt` (Rendering, Choreographer-Loop,
  dreht die Welt im Hochformat um 90°), `TowerPainter.kt` (Turm-Modelle,
  auch für Shop-Icons via `TowerIconView`), `MainActivity.kt` (UI, Levelmenü,
  🛠-Balance-Dialog), `Store.kt` (SharedPreferences).
- **💎 Kristallkrieg** (`kristall/`): `KristallConfig.kt`, `KristallEngine.kt`
  (Simulation + KI), `KristallView.kt`, `KristallActivity.kt`. Nur Querformat.
- **🦠 Zellkrieg** (`zell/`): `ZellConfig.kt` (inkl. `Mulberry`-RNG –
  Determinismus, siehe Root-`CLAUDE.md`!), `ZellMapGen.kt` (Mapgen/Kampagne/
  Zufallsspiel), `ZellLevels.kt` (handgebaute Level), `ZellEngine.kt`
  (Tentakel-Simulation + KI), `ZellView.kt` (30-Hz-Sim mit Interpolation,
  Pinch-Zoom, Hochformat-Drehung), `ZellActivity.kt` (Menüs/HUD).

## Konventionen

- Engines sind UI-frei und leben in `object`-Holdern (`GameHolder`,
  `KristallHolder`, `ZellHolder`), damit sie Activity-Neustarts (Drehung)
  überleben.
- Rendering: kein Allokieren im Frame (Paints/Paths/Gradients wiederverwenden
  bzw. cachen), Choreographer statt Timer.
- Persistenz: ausschließlich SharedPreferences `"towerdefense"`.
  Keys: `tuning.*`, `progress.completed` (TD), `kristall.wins.*`,
  `zell.completed`, `zell.campaign.best`, `zell.random.*`.
- UI-Texte auf Deutsch, dunkles Theme (#141821-Familie), Buttons über die
  Drawables `bg_btn_*`/`bg_shop_item` + Style `GameButton`.
