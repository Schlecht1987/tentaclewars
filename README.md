# Zellkrieg – Tentacle-Wars-Spiel

Ein browserbasiertes Echtzeit-Strategiespiel im Stil von *Tentacle Wars* / *Galcon*.
HTML + Canvas + Vanilla-JavaScript ohne externe Bibliotheken und ohne Build-Schritt –
als **PWA** installierbar (Handy & Desktop), mit **50-Level-Kampagne** und
**Zufallsspiel-Generator** gegen 1–3 KIs.

**Online-Version (Claude-Artifact):** https://claude.ai/code/artifact/b7a591a2-4516-4e65-94ea-6ee11b5875fa

## Spielen

- **Lokal (empfohlen):** im Projektordner einen statischen Server starten, z.B.
  `npx serve .`, und `http://localhost:3000` öffnen. So funktionieren auch
  Offline-Cache (Service Worker) und Spielstand-Speicherung dauerhaft.
- **Schnellstart:** `index.html` per Doppelklick öffnen geht ebenfalls
  (ohne Offline-Cache; der Spielstand liegt dann unter einer anderen Origin).
  *Hinweis: Die frühere Einzeldatei `zellkrieg.html` wurde in `index.html` +
  `js/`-Dateien aufgeteilt.*
- **Als App aufs Handy:** die gehostete Version (https, z.B. GitHub Pages) im
  mobilen Browser öffnen und **„Zum Startbildschirm hinzufügen"** wählen
  (Android: Menü ⋮ → „App installieren"; iOS: Teilen-Symbol → „Zum Home-Bildschirm").
  Das Spiel startet dann im Vollbild-Querformat und läuft auch offline.

## Spielidee

Der Spielplan besteht aus Zellen, die dem Spieler (blau), bis zu drei
KI-Gegnern (rot, bernstein, violett) oder niemandem (grau) gehören. Zellen
produzieren kontinuierlich Punkte. Der Spieler fährt **Tentakel** von eigenen
Zellen zu beliebigen anderen Zellen aus – es gibt keine festen Routen.
Angedockte Tentakel übertragen kontinuierlich Punkte: Freunde werden geheilt,
Fremde angegriffen. Fällt der Vorrat einer gegnerischen Zelle unter 0, wechselt
sie den Besitzer; neutrale Zellen muss man dagegen erst leerkämpfen und dann
aufladen (siehe *Kernmechaniken*). Zellen mit viel Vorrat bauen sich zudem in
Stufen aus. Die KI-Fraktionen bekämpfen dabei auch **einander**. Gewonnen hat,
wer alle gegnerischen Zellen erobert.

| Fraktion | Farbe |
|---|---|
| Spieler | Cyan-Blau |
| KI 1 | Koralle-Rot |
| KI 2 | Bernstein |
| KI 3 | Violett |
| Neutral | Grau |

## Steuerung

| Aktion | Bedienung (Maus & Touch) |
|---|---|
| Tentakel ausfahren | Von eigener Zelle zum Ziel ziehen (oder: Zelle antippen, dann Ziel antippen) |
| Tentakel einziehen | Quellzelle auswählen, Ziel der bestehenden Tentakel erneut antippen |
| Tentakel durchschneiden | Auf freier Fläche ansetzen und über die EIGENE Tentakel wischen |
| Auswahl aufheben | Tipp auf freie Fläche, Rechtsklick oder Esc |

Nur eigene Tentakel sind schneidbar (im Testlabor: alle Parteien).
Beim Schneiden zieht sich das hintere Stück zur Quelle zurück (Punkte fließen
heim), das vordere Stück fließt weiter zum Ziel und wirkt dort.

## Spielmodi

- **Kampagne (50 Level):** Level werden nacheinander freigeschaltet und
  deterministisch erzeugt – Level n ist bei jedem Spieler dieselbe Karte.
  Die Schwierigkeit steigt: schnellere und kluger zielende KI, ab Level 15
  zwei und ab Level 35 drei KI-Fraktionen, größere Karten, mehr Zellen.
  Spezial-Zelltypen kommen nach und nach dazu (Fabrik ab 3, Heiler ab 6,
  Bunker ab 9, Angreifer ab 12); jedes dritte Level ist bewusst asymmetrisch.
  Schlüssel-Level (1, 10, 50) sind handgebaut. Der Fortschritt wird im
  Browser gespeichert (localStorage); nach einem Sieg geht es per
  „Nächstes Level" direkt weiter.
- **Zufallsspiel:** frei einstellbar – Anzahl KIs (1–3), Schwierigkeit
  (Leicht/Mittel/Schwer), Kartengröße, Zelldichte, Zelltypen-Mix
  (nur Normal / Standard / alle fünf) und Fairness (Symmetrisch = exakt
  gespiegelte bzw. rotierte Startlagen, Zufällig, oder Handicap = die KIs
  starten mit 50 % mehr Punkten). Jede Karte hat eine sichtbare Nummer
  (Seed) und lässt sich damit exakt reproduzieren; „Neu würfeln" erzeugt
  eine neue. Nach einem Sieg startet „Neue Karte" mit denselben Einstellungen.
- **Testlabor (Sandbox):** alle fünf Zelltypen auf beiden Seiten, keine KI,
  kein Spielende – der Spieler steuert ALLE Parteien. Zum Ausprobieren.

Die KI-Schwierigkeiten unterscheiden sich in Reaktionstempo, Mindest-Vorrat
vor einem Angriff, Befehlen pro Zug und Zielgenauigkeit (leichte KI „verzielt"
sich messbar).

## Die fünf Zelltypen

Angriffs-/Heilwert hängt an der **sendenden** Zelle, die Verteidigung an der
**empfangenden**. Werte gelten pro übertragenem Punkt.

| Typ | Form | Produktion | Max | Angriff | Heilung | Besonderheit |
|---|---|---|---|---|---|---|
| Normal | Kreis | 1/s | 50 | −1 | +1 | – |
| Heiler | Kreis mit Kreuz | 1/s | 50 | −1 | +2 | Symbiose-Motor |
| Angreifer | Stachelring | 1/s | 50 | −2 | +1 | Duell- und Bunkerbrecher |
| Fabrik | Zahnrad | 2/s | 25 | −1 | +1 | Schneller Nachschub |
| Bunker | Doppel-Sechseck | 0,5/s | 100 | −1 | +1 | Halbiert eingehenden Schaden pro Punkt |

Hinweis: Die Bunker-Verteidigung wird nicht vom Angriffswert abgezogen,
sondern skaliert den Schaden pro übertragenem Punkt herunter (aktuell
halbiert sie ihn). Normal- und Heiler-Zellen (Angriff 1) knacken einen
Bunker dadurch nur halb so schnell wie ungeschützte Zellen – Angreifer-
Zellen (Angriff 2) bleiben unverändert die effizienteste Wahl gegen
Bunker.

## Kernmechaniken

- **Tentakel-Wachstum kostet Punkte:** 1 Punkt pro 22 Pixel Länge – Entfernung
  ist der natürliche Begrenzer. Die voraussichtlichen Kosten werden beim Ziehen
  angezeigt. Ohne Vorrat stockt das Wachstum.
- **Tentakel-Slots:** Jede Zelle darf 1 Tentakel ausfahren, plus 1 pro 25
  aktuelle Punkte (max. 4). Anzeige als kleine Punkte unter der Zelle.
- **Heilen, einseitiges Angreifen UND Duelle laufen über dieselbe Produktions-
  Deckelung:** Heil-Flüsse, ein Angriff OHNE Gegen-Tentakel und auch ein
  echtes **Tentakel-Duell** (siehe unten) sind alle auf die Produktion der
  Quelle gedeckelt – Kämpfen kostet nie den gespeicherten Vorrat, nur die
  laufende Produktion. Zwei gleich starke Zellen im Duell speisen dadurch
  exakt gleich viel gegeneinander und pendeln sich zu einem echten Patt ein,
  statt sich gegenseitig leerzusaugen.
- **Verzögerte Wirkung:** Übertragene Punkte werden beim Absenden von der
  Quelle abgezogen, wirken (heilen/schaden) am Ziel aber erst, nachdem sie
  sichtbar die Tentakel entlang geflossen sind – die Laufzeit entspricht der
  Tentakel-Länge geteilt durch die Fluss-Geschwindigkeit der Animation. Die
  Fluss-Punkte-Animation zeigt dabei die echten, gerade unterwegs
  befindlichen Punkte-Pakete: sie starten sichtbar am Rand der Quellzelle,
  nicht sofort über die ganze Strecke.
- **Überschuss-Durchleitung (Symbiose):** Volle Zellen leiten eingehende
  Heilung und eigene Produktion über ihre Tentakel weiter, statt sie verfallen
  zu lassen. So verstärken Heiler-Ketten die Front (sichtbar am doppelten,
  schnelleren Punktestrom).
- **Einbahn-Regel:** Zwischen zwei befreundeten Zellen ist immer nur eine
  Verbindungsrichtung gleichzeitig möglich.
- **Tentakel-Duelle:** Gegnerische Tentakel zwischen denselben zwei Zellen
  treffen sich im Korridor und ringen (weiß glühende Front). Beide Seiten
  speisen Punkte aus ihrer laufenden Produktion (nicht aus dem Vorrat!); bei
  gleicher Produktion ist das ein echtes Patt. Wird eine Seite zusätzlich von
  einer anderen eigenen Zelle versorgt (Heiler-Kette, Überschuss-Durch-
  leitung), speist sie mehr als ihre eigene Produktion hergibt und gewinnt die
  Abnutzung langsam. Ein **Heimvorteil** (stark an der eigenen Zelle, null in
  der Mitte) sorgt zusätzlich dafür, dass sich gleich starke Parteien in der
  Korridor-Mitte einpendeln. Sind hingegen **beide** Zellen erschöpft (Vorrat
  leer), kann keine mehr eine Front halten: Dann bricht die Tentakel durch,
  die ihrem Ziel näher ist, und erobert – das Duell friert nicht bei zwei
  0-Zellen ein.
- **Eroberung (eigene/gegnerische Zellen):** Fällt der Vorrat unter 0,
  wechselt die Zelle sofort den Besitzer. Ihre noch ausgefahrenen Tentakel
  ziehen sich automatisch ein – die zurückfließende Masse zählt für den NEUEN
  Besitzer (Beute).
- **Neutrale Zellen erobern (Aufladen):** Neutrale Zellen wechseln NICHT im
  Moment des Nullpunkts den Besitzer (das führte zu einem Wettlauf um den
  entscheidenden Tick). Stattdessen bricht ein Angreifer erst die Garnison
  (Vorrat auf 0) und lädt die Zelle danach mit eigenen Punkten auf; erst bei
  15 Punkten (`CONFIG.captureCharge`) gehört sie ihm. Greift währenddessen
  ein Konkurrent an, muss er die bereits geladenen Punkte zuerst wieder
  abtragen und kann erst dann selbst laden – das gelingt nur mit mehr Angriff
  pro Sekunde. Der Ladefortschritt erscheint als Ring in der Farbe des
  aktuellen Eroberers.
- **Zell-Ausbau (Stufen):** Hält eine Zelle viel Vorrat, wächst sie: ab
  40 / 80 / 120 Punkten steigt sie auf Stufe 1 / 2 / 3 mit größerem Radius,
  höherer Produktion (×1,25 / ×1,5 / ×1,8) und mehr Kapazität (90 / 130 / 170
  statt Typ-Max). Sie schrumpft erst 20 Punkte unter der Aufstiegsschwelle
  wieder (Hysterese – Stufe 3 hält bis unter 100). Wie hoch eine Zelle
  wachsen darf, legt ihr `tierMax` (0–3) fest: nicht jede Zelle erreicht
  Stufe 3. In generierten Karten ist die Verteilung deterministisch aus dem
  Seed (symmetrische Zellen gleich → faire Startlagen), in den festen Leveln
  pro Zelle vorgegeben. Kleine Ringe am Zellrand zeigen die Stufe an.
- **Mehrere KIs:** Jede KI-Fraktion handelt in ihrem eigenen Takt und greift
  ALLE fremden Zellen an – auch die der anderen KIs. Sieg, sobald keine
  KI-Fraktion mehr lebt; Niederlage, sobald die letzte eigene Zelle fällt.

## Anpassen & Erweitern

Kein Build-Schritt: alle Dateien sind direkt editierbar.

| Datei | Inhalt |
|---|---|
| `js/config.js` | Alle Stellschrauben: `CONFIG` (Geschwindigkeiten, Kosten, Slots, Heimvorteil), `CELL_TYPES`, Fraktionsfarben, `AI_PROFILES` (Leicht/Mittel/Schwer) |
| `js/levels.js` | Handgebaute Level (Sandbox + Kampagnen-Schlüssel-Level) |
| `js/mapgen.js` | Karten-Generator (symmetrisch/zufällig, Spielbarkeits-Check) |
| `js/campaign.js` | Schwierigkeitskurve der 50 Level, Fortschritts-Speicherung |
| `js/ai.js` | KI-Verhalten |
| `js/game.js` | Simulation, Eingabe, Rendering |
| `js/ui.js` | Menüs, HUD, Overlays |
| `sw.js` | Offline-Cache – bei Releases die `CACHE`-Version erhöhen |

Neue handgebaute Level: Objekt mit `name`, `desc`, `tag`, `sandbox`,
`width`/`height`, optional `ai` (Profil pro Fraktion) und `cells`
(Typ, Besitzer `player`/`enemy`/`enemy2`/`enemy3`/`neutral`, Position,
Startpunkte) – für die Kampagne unter der Levelnummer in
`CAMPAIGN_HANDBUILT` eintragen.

## Technik

- Kein Build, keine Abhängigkeiten; klassische `<script>`-Tags in fester
  Ladereihenfolge (siehe `index.html`).
- **PWA:** `manifest.webmanifest` (Standalone, Querformat, Icons) +
  Service Worker (`sw.js`, cache-first) – installierbar und offline spielbar,
  sobald über http(s) ausgeliefert.
- Canvas-Rendering mit devicePixelRatio-Skalierung; das virtuelle Spielfeld
  (Standard 1000×640, Kampagne bis 1350×860) wird ins Fenster eingepasst.
  Auf kleinen Bildschirmen werden Legende/Hinweiszeile ausgeblendet und die
  Ränder verkleinert; Safe-Area-Insets (Notch) werden berücksichtigt.
- Eingabe über Pointer-Events (Maus und Touch).
- Deterministischer Zufall (mulberry32): Kampagnen-Level und Zufallskarten
  sind über ihren Seed exakt reproduzierbar.
- Spielstand (`zellkrieg.progress.v1`) und Zufallsspiel-Einstellungen
  (`zellkrieg.randomSettings.v1`) liegen im localStorage.
- Tentakel sind Segmente `[tail, head]` entlang der Verbindungslinie mit den
  Modi `grow` (wachsen), `flow` (angedockt, überträgt), `retract` (einziehen)
  und `free` (abgetrenntes Stück, fließt zum Ziel).
- Jede Tentakel führt eine **Pipeline** mitlaufender Punkte-Pakete
  (`{ amount, remaining }`): beim Absenden wird der Quellzelle sofort Vorrat
  abgezogen, das Paket wirkt (heilt/schadet) aber erst am Ziel, nachdem seine
  Laufzeit (Tentakel-Länge / Fluss-Geschwindigkeit) abgelaufen ist. So bleiben
  bereits unterwegs befindliche Pakete auch nach einem Einziehen oder
  Durchschneiden gültig und werden zugestellt.
- `prefers-reduced-motion` wird respektiert (Animationen reduziert).

---

Stand: 03.07.2026 – erstellt mit Claude Code.
