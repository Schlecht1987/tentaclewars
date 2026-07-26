# 🕹️ Spielhalle

Eine Spielebibliothek mit drei Spielen (🏰 Tower Defense, 💎 Kristallkrieg,
🦠 Zellkrieg) auf **zwei Plattformen**, die spielmechanisch synchron gehalten
werden:

| Plattform | Ordner | Technik | Doku |
|---|---|---|---|
| **Web (PWA)** | [`web/`](web/) | HTML + Canvas + Vanilla-JS, kein Build-Schritt | [`web/README.md`](web/README.md) |
| **Android (nativ)** | [`android/`](android/) | Kotlin, Android-Canvas, Gradle | [`android/CLAUDE.md`](android/CLAUDE.md) |

**Deployment Web:** Jeder Push auf `master` veröffentlicht `web/` automatisch
über GitHub Actions auf GitHub Pages (siehe
[`.github/workflows/deploy-web.yml`](.github/workflows/deploy-web.yml)).

**Grundregel für Änderungen:** Spielmechanik und Balance werden immer auf
BEIDEN Plattformen im selben Commit geändert; UI/Rendering ist
plattformspezifisch. Details und Datei-Zuordnung: [`CLAUDE.md`](CLAUDE.md).
