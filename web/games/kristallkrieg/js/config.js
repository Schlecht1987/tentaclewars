"use strict";

/* ======================================================================
   KRISTALLKRIEG – Konfiguration
   Alle Balance-Zahlen leben hier. Konter-Dreieck:
   Schwertkämpfer > Bogenschütze > Lanzenreiter > Schwertkämpfer.
   ====================================================================== */

const CONFIG = {
  width: 960,
  height: 540,
  laneYs: [120, 270, 420],      // Mittellinien der 3 Lanes
  laneTapRadius: 80,            // wie weit ein Tap von der Lane-Mitte entfernt sein darf
  playerSpawnX: 90,
  enemySpawnX: 870,
  playerBaseEdge: 62,           // x-Kante der Spielerbasis (Angriffsziel)
  enemyBaseEdge: 898,
  baseHp: 900,
  baseGunRange: 180,            // Festungen verteidigen sich selbst
  baseGunDmg: 12,
  baseGunInterval: 0.7,

  startCrystals: 60,
  baseIncome: 3,                // Kristalle pro Sekunde Grundeinkommen
  collectorIncome: 2,           // pro Sammler zusätzlich
  collectorMax: 4,
  collectorBaseCost: 60,
  collectorCostStep: 30,        // Kosten = base + step * bereits gebaute

  towerX: 480,                  // Wachturm-Position (Lane-Mitte)
  towerCaptureRadius: 85,
  towerCaptureNeed: 100,        // Ladung bis zur Eroberung
  towerCaptureRate: 22,         // Ladung pro Sekunde und Einheit (max. 3 zählen)
  towerRange: 150,
  towerDmg: 9,
  towerAtkInterval: 0.8,
  towerIncome: 1,               // Kristalle pro Sekunde je eigenem Turm

  unitSpacing: 24,              // Mindestabstand zur vorderen eigenen Einheit
  maxUnitsPerSide: 60           // Sicherheitsdeckel
};

/* Einheitentypen. counters: Schadensmultiplikator gegen den jeweiligen Typ.
   vsBase/vsUnit: zusätzliche Multiplikatoren des Katapults. */
const UNIT_TYPES = {
  sword: {
    name: "Schwertkämpfer", icon: "⚔️", cost: 25,
    hp: 95, dmg: 13, atkInterval: 0.9, range: 26, speed: 46,
    counters: { archer: 2 },
    desc: "Solider Nahkämpfer. Stark gegen Bogenschützen."
  },
  archer: {
    name: "Bogenschütze", icon: "🏹", cost: 35,
    hp: 55, dmg: 11, atkInterval: 1.1, range: 135, speed: 42,
    counters: { lancer: 2 },
    desc: "Fernkampf. Stark gegen Lanzenreiter, schwach im Nahkampf."
  },
  lancer: {
    name: "Lanzenreiter", icon: "🐴", cost: 40,
    hp: 120, dmg: 15, atkInterval: 1.0, range: 28, speed: 75,
    counters: { sword: 2 },
    desc: "Schnell und robust. Stark gegen Schwertkämpfer."
  },
  healer: {
    name: "Heiler", icon: "💚", cost: 45,
    hp: 60, dmg: 0, atkInterval: 1, range: 90, speed: 40,
    heal: 9,
    desc: "Kämpft nicht, heilt Verbündete in der Nähe."
  },
  siege: {
    name: "Katapult", icon: "🪨", cost: 70,
    hp: 80, dmg: 30, atkInterval: 2.2, range: 165, speed: 30,
    vsBase: 4, vsUnit: 0.35,
    desc: "Langsam. Enormer Schaden gegen die gegnerische Basis, kaum gegen Einheiten."
  }
};

const UNIT_ORDER = ["sword", "archer", "lancer", "healer", "siege"];

/* KI-Schwierigkeiten.
   interval: Sekunden zwischen Entscheidungen
   incomeMul: Multiplikator auf das KI-Einkommen
   smart: Wahrscheinlichkeit, gezielt zu kontern statt zufällig zu bauen
   ecoTarget: wie viele Sammler die KI anstrebt */
const DIFFICULTIES = {
  leicht:  { name: "Leicht",  interval: 3.0, incomeMul: 0.7,  smart: 0.25, ecoTarget: 2 },
  mittel:  { name: "Mittel",  interval: 1.8, incomeMul: 1.0,  smart: 0.65, ecoTarget: 3 },
  schwer:  { name: "Schwer",  interval: 1.2, incomeMul: 1.15, smart: 0.9,  ecoTarget: 4 }
};
