# Spielhalle – Native Android-App

Native Kotlin-Portierung der Web-Spielhalle (`../web/`) mit drei Spielen:
🏰 Tower Defense, 💎 Kristallkrieg und 🦠 Zellkrieg. Einstieg ist die
Spielebibliothek (`LauncherActivity`). Architektur und Konventionen:
siehe `CLAUDE.md` in diesem Ordner; die plattformübergreifenden
Mechanik-Sync-Regeln stehen in der Root-`CLAUDE.md`.

## So bekommst du die App aufs Handy

### 1. Projekt öffnen
1. Android Studio starten → **Open** → diesen Ordner (`android/`) wählen.
2. Warten, bis der Gradle-Sync abgeschlossen ist (erster Lauf dauert etwas).

### 2. Installieren
**Variante A – per USB (empfohlen):**
1. Auf dem Handy Entwickleroptionen + USB-Debugging aktivieren
   (*Einstellungen → Über das Telefon → 7× auf „Build-Nummer" tippen*).
2. Handy anschließen, Debugging-Anfrage bestätigen, in Android Studio
   das Gerät wählen und **▶ Run** drücken.

**Variante B – APK-Datei:**
1. *Build → Build App Bundle(s) / APK(s) → Build APK(s)*.
2. APK liegt unter `app/build/outputs/apk/debug/app-debug.apk` –
   aufs Handy kopieren und installieren.

**Variante C – Kommandozeile:**
`gradlew.bat assembleDebug` (JDK 17+, z. B. das Android-Studio-JBR als
`JAVA_HOME`).

## Die Spiele
- **🏰 Tower Defense:** 10-Level-Kampagne, 6 Turmtypen mit Spezialfähigkeiten,
  Antipp-Werkzeuge für Upgrade/Verkauf, 🛠-Balance-Regler. Hoch- und Querformat.
- **💎 Kristallkrieg:** Lane-Strategie gegen KI (3 Schwierigkeitsgrade),
  Konter-Dreieck ⚔️>🏹>🐴>⚔️, eroberbare Wachtürme. Querformat.
- **🦠 Zellkrieg:** Tentacle-Wars-Strategie, 50-Level-Kampagne (deterministisch,
  identische Karten wie im Web), Zufallsspiel, Testlabor. Ein Finger spielt,
  zwei Finger verschieben/zoomen die Karte. Hoch- und Querformat.
