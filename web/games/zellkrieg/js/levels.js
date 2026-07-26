"use strict";

/* ======================================================================
   HANDGEBAUTE LEVEL
   Koordinaten in einem virtuellen Spielfeld (width x height, Standard
   1000 x 640). Es gibt KEINE festen Routen – jede Zelle kann jede andere
   anvisieren. Entfernung kostet: lange Tentakel verbrauchen viele Punkte.
   sandbox: true -> Spieler steuert ALLE Parteien, keine KI, kein Sieg.
   ai: pro Fraktion ein Profil-Name ("easy"/"medium"/"hard") oder ein
       Inline-Profil-Objekt; fehlt der Eintrag, gilt "medium".
   ====================================================================== */

const SANDBOX_LEVEL = {
  name: "Testlabor",
  desc: "Alle fünf Zelltypen auf beiden Seiten. Du steuerst ALLE Parteien – keine KI, kein Spielende. Zum Ausprobieren der Mechaniken.",
  tag: "Sandbox",
  sandbox: true,
  width: 1000, height: 640,
  cells: [
    { id: "L1", type: "normal",   owner: "player",  x: 150, y: 130, units: 30, tierMax: 3 },
    { id: "L2", type: "healer",   owner: "player",  x: 110, y: 300, units: 30, tierMax: 2 },
    { id: "L3", type: "attacker", owner: "player",  x: 150, y: 470, units: 30, tierMax: 2 },
    { id: "L4", type: "factory",  owner: "player",  x: 270, y: 210, units: 15, tierMax: 0 },
    { id: "L5", type: "bunker",   owner: "player",  x: 270, y: 400, units: 40, tierMax: 1 },
    { id: "M1", type: "normal",   owner: "neutral", x: 500, y: 140, units: 15, tierMax: 2 },
    { id: "M2", type: "bunker",   owner: "neutral", x: 500, y: 320, units: 25, tierMax: 1 },
    { id: "M3", type: "normal",   owner: "neutral", x: 500, y: 500, units: 15, tierMax: 3 },
    { id: "R1", type: "normal",   owner: "enemy",   x: 850, y: 130, units: 30, tierMax: 3 },
    { id: "R2", type: "healer",   owner: "enemy",   x: 890, y: 300, units: 30, tierMax: 2 },
    { id: "R3", type: "attacker", owner: "enemy",   x: 850, y: 470, units: 30, tierMax: 2 },
    { id: "R4", type: "factory",  owner: "enemy",   x: 730, y: 210, units: 15, tierMax: 0 },
    { id: "R5", type: "bunker",   owner: "enemy",   x: 730, y: 400, units: 40, tierMax: 1 }
  ]
};

// Handgebaute Kampagnen-Level: Schlüssel = Levelnummer. Alle anderen der
// 50 Level werden deterministisch generiert (siehe campaign.js).
// WICHTIG: generateCampaignLevel() liefert eine tiefe Kopie – die Objekte
// hier bleiben unangetastet.
const CAMPAIGN_HANDBUILT = {
  1: {
    name: "Level 1 – Erstkontakt",
    desc: "Sanfter Einstieg: nur normale Zellen, eine zögerliche KI. Erobere alle roten Zellen.",
    tag: "Kampagne",
    sandbox: false,
    width: 1000, height: 640,
    ai: { enemy: "easy" },
    cells: [
      { id: "P0", type: "normal", owner: "player",  x: 160, y: 320, units: 30, tierMax: 3 },
      { id: "P1", type: "normal", owner: "player",  x: 300, y: 480, units: 12, tierMax: 1 },
      { id: "N0", type: "normal", owner: "neutral", x: 500, y: 190, units: 10, tierMax: 2 },
      { id: "N1", type: "normal", owner: "neutral", x: 520, y: 450, units: 14, tierMax: 1 },
      { id: "E0", type: "normal", owner: "enemy",   x: 840, y: 320, units: 30, tierMax: 3 },
      { id: "E1", type: "normal", owner: "enemy",   x: 700, y: 160, units: 12, tierMax: 1 }
    ]
  },
  10: {
    name: "Level 10 – Die Festung",
    desc: "Boss: Ein Bunker-Wall schützt das rote Hinterland. Angreifer-Zellen knacken Bunker am schnellsten.",
    tag: "Kampagne",
    sandbox: false,
    width: 1100, height: 700,
    ai: { enemy: "medium" },
    cells: [
      { id: "P0", type: "normal",   owner: "player",  x: 150, y: 350, units: 35, tierMax: 3 },
      { id: "P1", type: "factory",  owner: "player",  x: 260, y: 500, units: 15, tierMax: 0 },
      { id: "P2", type: "healer",   owner: "player",  x: 240, y: 200, units: 18, tierMax: 2 },
      { id: "N0", type: "attacker", owner: "neutral", x: 470, y: 350, units: 18, tierMax: 2 },
      { id: "N1", type: "normal",   owner: "neutral", x: 520, y: 120, units: 12, tierMax: 1 },
      { id: "N2", type: "normal",   owner: "neutral", x: 520, y: 580, units: 12, tierMax: 1 },
      { id: "B0", type: "bunker",   owner: "enemy",   x: 720, y: 190, units: 35, tierMax: 1 },
      { id: "B1", type: "bunker",   owner: "enemy",   x: 700, y: 350, units: 40, tierMax: 1 },
      { id: "B2", type: "bunker",   owner: "enemy",   x: 720, y: 510, units: 35, tierMax: 1 },
      { id: "E0", type: "factory",  owner: "enemy",   x: 900, y: 250, units: 18, tierMax: 0 },
      { id: "E1", type: "healer",   owner: "enemy",   x: 930, y: 430, units: 25, tierMax: 2 },
      { id: "E2", type: "normal",   owner: "enemy",   x: 990, y: 340, units: 30, tierMax: 3 }
    ]
  },
  50: {
    name: "Level 50 – Endkampf",
    desc: "Finale: Drei harte KIs an drei Ecken, umkämpfte Heiler und ein Bunker im Zentrum. Alles oder nichts.",
    tag: "Kampagne",
    sandbox: false,
    width: 1350, height: 860,
    ai: { enemy: "hard", enemy2: "hard", enemy3: "hard" },
    cells: [
      { id: "P0", type: "normal",   owner: "player",  x: 200,  y: 700, units: 40, tierMax: 3 },
      { id: "P1", type: "factory",  owner: "player",  x: 330,  y: 760, units: 15, tierMax: 0 },
      { id: "P2", type: "healer",   owner: "player",  x: 150,  y: 560, units: 20, tierMax: 2 },
      { id: "P3", type: "attacker", owner: "player",  x: 340,  y: 600, units: 15, tierMax: 2 },
      { id: "E0", type: "normal",   owner: "enemy",   x: 1150, y: 160, units: 40, tierMax: 3 },
      { id: "E1", type: "factory",  owner: "enemy",   x: 1020, y: 100, units: 15, tierMax: 0 },
      { id: "E2", type: "healer",   owner: "enemy",   x: 1200, y: 300, units: 20, tierMax: 2 },
      { id: "E3", type: "attacker", owner: "enemy",   x: 1010, y: 240, units: 15, tierMax: 2 },
      { id: "F0", type: "normal",   owner: "enemy2",  x: 200,  y: 160, units: 40, tierMax: 3 },
      { id: "F1", type: "factory",  owner: "enemy2",  x: 330,  y: 100, units: 15, tierMax: 0 },
      { id: "F2", type: "healer",   owner: "enemy2",  x: 150,  y: 300, units: 20, tierMax: 2 },
      { id: "F3", type: "attacker", owner: "enemy2",  x: 340,  y: 240, units: 15, tierMax: 2 },
      { id: "G0", type: "normal",   owner: "enemy3",  x: 1150, y: 700, units: 40, tierMax: 3 },
      { id: "G1", type: "factory",  owner: "enemy3",  x: 1020, y: 760, units: 15, tierMax: 0 },
      { id: "G2", type: "healer",   owner: "enemy3",  x: 1200, y: 560, units: 20, tierMax: 2 },
      { id: "G3", type: "attacker", owner: "enemy3",  x: 1010, y: 620, units: 15, tierMax: 2 },
      { id: "N0", type: "bunker",   owner: "neutral", x: 675,  y: 430, units: 30, tierMax: 1 },
      { id: "N1", type: "healer",   owner: "neutral", x: 675,  y: 250, units: 18, tierMax: 2 },
      { id: "N2", type: "healer",   owner: "neutral", x: 675,  y: 610, units: 18, tierMax: 2 },
      { id: "N3", type: "normal",   owner: "neutral", x: 480,  y: 430, units: 15, tierMax: 3 },
      { id: "N4", type: "normal",   owner: "neutral", x: 870,  y: 430, units: 15, tierMax: 3 }
    ]
  }
};
