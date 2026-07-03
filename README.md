# Zellkrieg – Tentacle-Wars-Prototyp

Ein browserbasiertes Echtzeit-Strategiespiel im Stil von *Tentacle Wars* / *Galcon*.
Eine einzelne HTML-Datei ohne externe Bibliotheken (HTML + Canvas + Vanilla-JavaScript).

**Spielen:** `zellkrieg.html` einfach im Browser öffnen (Doppelklick genügt).
**Online-Version (Claude-Artifact):** https://claude.ai/code/artifact/b7a591a2-4516-4e65-94ea-6ee11b5875fa

---

## Spielidee

Der Spielplan besteht aus Zellen, die dem Spieler (blau), dem Gegner (rot) oder
niemandem (grau) gehören. Zellen produzieren kontinuierlich Punkte. Der Spieler
fährt **Tentakel** von eigenen Zellen zu beliebigen anderen Zellen aus – es gibt
keine festen Routen. Angedockte Tentakel übertragen kontinuierlich Punkte:
Freunde werden geheilt, Fremde angegriffen. Fällt der Vorrat einer Zelle unter 0,
wechselt sie den Besitzer. Gewonnen hat, wer alle gegnerischen Zellen erobert.

## Steuerung

| Aktion | Bedienung |
|---|---|
| Tentakel ausfahren | Von eigener Zelle zum Ziel ziehen (oder: Zelle anklicken, dann Ziel anklicken) |
| Tentakel einziehen | Quellzelle auswählen, Ziel der bestehenden Tentakel erneut anklicken |
| Tentakel durchschneiden | Auf freier Fläche klicken und über die EIGENE Tentakel wischen |
| Auswahl aufheben | Klick auf freie Fläche, Rechtsklick oder Esc |

Nur eigene Tentakel sind schneidbar (im Testlabor: beide Parteien).
Beim Schneiden zieht sich das hintere Stück zur Quelle zurück (Punkte fließen
heim), das vordere Stück fließt weiter zum Ziel und wirkt dort.

## Die fünf Zelltypen

Angriffs-/Heilwert hängt an der **sendenden** Zelle, die Verteidigung an der
**empfangenden**. Werte gelten pro übertragenem Punkt.

| Typ | Form | Produktion | Max | Angriff | Heilung | Besonderheit |
|---|---|---|---|---|---|---|
| Normal | Kreis | 1/s | 50 | −1 | +1 | – |
| Heiler | Kreis mit Kreuz | 1/s | 50 | −1 | +2 | Symbiose-Motor |
| Angreifer | Stachelring | 1/s | 50 | −2 | +1 | Duell- und Bunkerbrecher |
| Fabrik | Zahnrad | 2/s | 25 | −1 | +1 | Schneller Nachschub |
| Bunker | Doppel-Sechseck | 0,5/s | 100 | −1 | +1 | Reduziert eingehenden Schaden um 1 pro Punkt |

Hinweis: Gegen Bunker richten Normal- und Heiler-Zellen nichts aus
(1 − 1 = 0 Schaden) – Bunker knackt man mit Angreifer-Zellen.

## Kernmechaniken

- **Tentakel-Wachstum kostet Punkte:** 1 Punkt pro 22 Pixel Länge – Entfernung
  ist der natürliche Begrenzer. Die voraussichtlichen Kosten werden beim Ziehen
  angezeigt. Ohne Vorrat stockt das Wachstum.
- **Tentakel-Slots:** Jede Zelle darf 1 Tentakel ausfahren, plus 1 pro 25
  aktuelle Punkte (max. 4). Anzeige als kleine Punkte unter der Zelle.
- **Heilen vs. (unbeantwortetes) Angreifen:** Sowohl Heil-Flüsse als auch ein
  Angriff OHNE Gegen-Tentakel (kein Duell) sind auf die Produktion der Quelle
  gedeckelt – Unterstützen und einseitiges Angreifen kosten nie Vorrat, der
  Vorrat bleibt also gleich (kann durch den Überschuss-Puffer sogar mit-
  wachsen). Nur ein echtes **Tentakel-Duell** (siehe unten) zapft den VORRAT
  mit voller Rate (3 Punkte/s) an.
- **Verzögerte Wirkung:** Übertragene Punkte werden beim Absenden von der
  Quelle abgezogen, wirken (heilen/schaden) am Ziel aber erst, nachdem sie
  sichtbar die Tentakel entlang geflossen sind – die Laufzeit entspricht der
  Tentakel-Länge geteilt durch die Fluss-Geschwindigkeit der Animation.
- **Überschuss-Durchleitung (Symbiose):** Volle Zellen leiten eingehende
  Heilung und eigene Produktion über ihre Tentakel weiter, statt sie verfallen
  zu lassen. So verstärken Heiler-Ketten die Front (sichtbar am doppelten,
  schnelleren Punktestrom).
- **Einbahn-Regel:** Zwischen zwei befreundeten Zellen ist immer nur eine
  Verbindungsrichtung gleichzeitig möglich.
- **Tentakel-Duelle:** Gegnerische Tentakel zwischen denselben zwei Zellen
  treffen sich im Korridor und ringen (weiß glühende Front). Beide Seiten
  speisen Punkte aus ihrem Vorrat; die stärkere drückt die schwächere zurück.
  Ein **Heimvorteil** (stark an der eigenen Zelle, null in der Mitte) sorgt
  dafür, dass sich gleich starke Parteien in der Korridor-Mitte einpendeln.
- **Eroberung:** Fällt der Vorrat unter 0, wechselt die Zelle sofort den
  Besitzer. Ihre noch ausgefahrenen Tentakel ziehen sich automatisch ein –
  die zurückfließende Masse zählt für den NEUEN Besitzer (Beute).

## Level

Beim Start erscheint eine Level-Auswahl:

1. **Erstkontakt** *(gegen die KI)* – 3 gegen 3 mit umkämpfter neutraler Mitte.
   Die KI steuert Rot: stärkste Zelle greift alle 3 s das schwächste erreichbare
   Ziel an, dem sie schaden kann, sonst verstärkt sie die eigene Front.
2. **Testlabor** *(Sandbox)* – alle fünf Zelltypen auf beiden Seiten, drei
   neutrale Zellen in der Mitte. Der Spieler steuert Blau UND Rot, keine KI,
   kein Spielende – zum Ausprobieren aller Mechaniken.

Der „Level"-Knopf im HUD führt jederzeit zurück zur Auswahl, „Neustart" setzt
das aktuelle Level zurück.

## Anpassen & Erweitern

Alle Stellschrauben liegen kommentiert am Anfang des `<script>`-Blocks in
`zellkrieg.html`:

- **`CONFIG`** – Geschwindigkeiten, Kosten, Transferrate, Slots, Heimvorteil,
  Bunker-Abwehr, KI-Takt.
- **`CELL_TYPES`** – Produktion, Maximum, Angriffs-/Heilwerte, Radius je Typ.
- **`LEVELS`** – Level-Definitionen. Neues Level = neues Objekt mit `name`,
  `desc`, `tag`, `sandbox` (true = beide Parteien steuerbar, keine KI) und
  `cells` (Typ, Besitzer, Position im virtuellen 1000×640-Feld, Startpunkte).
  Die Karte erscheint automatisch in der Level-Auswahl.

## Technik

- Eine Datei, kein Build, keine Abhängigkeiten; läuft lokal per Doppelklick.
- Canvas-Rendering mit devicePixelRatio-Skalierung, Spielfeld wird ins Fenster
  eingepasst (virtuelles Koordinatensystem 1000×640).
- Eingabe über Pointer-Events (Maus und Touch).
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
