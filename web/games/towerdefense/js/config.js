// Zentrale Spiel-Konfiguration
const CONFIG = {
  tileSize: 40,
  cols: 24,
  rows: 16,
};

// ---- Balance-Stellschrauben (live editierbar über das 🛠-Dev-Panel) ----
const TUNING = {
  hpGrowth: 1.17,     // Faktor, mit dem Gegner-HP pro Welle wachsen (exponentiell)
  hpMulGlobal: 1,     // globaler Multiplikator auf alle Gegner-HP
  goldGrowth: 0.07,   // Gold-Zuwachs pro Welle (linear, +7 %/Welle)
  goldMulGlobal: 1,   // globaler Multiplikator auf Gegner-Gold
  speedGrowth: 0.02,  // Tempo-Zuwachs der Gegner pro Welle
  speedMax: 1.5,      // Obergrenze des Tempo-Zuwachses
  waveBonusBase: 20,  // Gold-Bonus pro geschaffter Welle (+ Welle * 3)
  towerDmgMul: 1,     // globaler Multiplikator auf allen Turmschaden
  startGoldBonus: 0,  // zusätzliches Startgold (gilt ab Levelstart/Neustart)
  stunImmunity: 5,    // Sekunden Betäubungs-Immunität nach einer Betäubung
};
const TUNING_DEFAULTS = { ...TUNING };

// Hilfetexte fürs Dev-Panel (title-Tooltip beim Hovern)
const TUNING_INFO = {
  hpGrowth: "Exponentielles HP-Wachstum der Gegner pro Welle. 1.17 = +17 % pro Welle. Wichtigster Schwierigkeits-Regler fürs Lategame.",
  hpMulGlobal: "Globaler Faktor auf alle Gegner-HP (zusätzlich zum Level-hpMul). 1 = normal, 1.2 = alle Gegner 20 % zäher.",
  goldGrowth: "Wie stark das Gold pro Gegner mit jeder Welle steigt (linear). 0.07 = +7 % pro Welle. Höher = großzügigere Wirtschaft im Lategame.",
  goldMulGlobal: "Globaler Faktor auf das Gold aller Gegner. 1 = normal, 0.8 = 20 % weniger Einkommen.",
  speedGrowth: "Wie viel schneller die Gegner pro Welle werden. 0.02 = +2 % pro Welle (bis zur Obergrenze).",
  speedMax: "Obergrenze des Tempo-Zuwachses. 1.5 = Gegner werden maximal 50 % schneller als ihr Grundtempo.",
  waveBonusBase: "Gold-Grundbonus nach jeder geschafften Welle (dazu kommt Welle × 3).",
  towerDmgMul: "Globaler Faktor auf den Schaden ALLER Türme. 1 = normal, 0.9 = alle Türme 10 % schwächer. Schneller Test, ob die Türme insgesamt zu stark sind.",
  startGoldBonus: "Zusätzliches Startgold, wird beim Levelstart/Neustart auf das Level-Startgold addiert (z. B. 100).",
  stunImmunity: "Wie viele Sekunden ein Gegner nach einer Betäubung immun gegen weitere Betäubungen ist. Verhindert Dauer-Stun-Ketten durch mehrere Kanonen. 0 = keine Immunität.",
};

// ---- Kampagne: 10 Level mit eigener Karte + Schwierigkeit ----
// waypoints: Gitter-Wegpunkte (Spalte, Reihe), nur horizontale/vertikale Segmente.
// hpMul skaliert die Gegner-HP zusätzlich zur Wellen-Skalierung.
const LEVELS = [
  {
    name: "Grüne Wiese", desc: "Langer Schlangenpfad – viel Zeit zum Schießen.",
    waves: 12, startGold: 200, startLives: 25, hpMul: 0.75,
    waypoints: [[-1, 2], [4, 2], [4, 13], [9, 13], [9, 4], [14, 4], [14, 13], [19, 13], [19, 4], [24, 4]],
  },
  {
    name: "Flusslauf", desc: "Gemächliche Kurven durchs Tal.",
    waves: 14, startGold: 180, startLives: 20, hpMul: 0.85,
    waypoints: [[-1, 8], [5, 8], [5, 3], [11, 3], [11, 12], [17, 12], [17, 5], [24, 5]],
  },
  {
    name: "Die Spirale", desc: "Der Pfad windet sich zur Burg in der Mitte.",
    waves: 16, startGold: 170, startLives: 20, hpMul: 0.95,
    waypoints: [[-1, 1], [21, 1], [21, 14], [3, 14], [3, 5], [17, 5], [17, 10], [8, 10]],
  },
  {
    name: "Altes Schlachtfeld", desc: "Die klassische Karte – verschlungen und lang.",
    waves: 18, startGold: 160, startLives: 20, hpMul: 1.0,
    waypoints: [[-1, 3], [4, 3], [4, 9], [10, 9], [10, 2], [16, 2], [16, 12], [6, 12], [6, 14], [20, 14], [20, 6], [24, 6]],
  },
  {
    name: "Doppel-U", desc: "Zwei weite Bögen – nutze die Innenseiten.",
    waves: 20, startGold: 160, startLives: 18, hpMul: 1.05,
    waypoints: [[-1, 4], [20, 4], [20, 8], [4, 8], [4, 12], [24, 12]],
  },
  {
    name: "Der Haken", desc: "Nur eine Kehre – die Gegner sind schnell durch.",
    waves: 22, startGold: 150, startLives: 15, hpMul: 1.1,
    waypoints: [[-1, 13], [12, 13], [12, 2], [24, 2]],
  },
  {
    name: "S-Kurve", desc: "Kurzes Stück Straße, harte Wellen.",
    waves: 24, startGold: 150, startLives: 15, hpMul: 1.15,
    waypoints: [[-1, 6], [8, 6], [8, 10], [16, 10], [16, 6], [24, 6]],
  },
  {
    name: "Die Treppe", desc: "Stufe um Stufe hinab zur Festung.",
    waves: 26, startGold: 140, startLives: 12, hpMul: 1.2,
    waypoints: [[-1, 2], [5, 2], [5, 5], [10, 5], [10, 8], [15, 8], [15, 11], [20, 11], [20, 14], [24, 14]],
  },
  {
    name: "Schnellstraße", desc: "Fast kein Umweg – jeder Schuss muss sitzen.",
    waves: 28, startGold: 140, startLives: 10, hpMul: 1.3,
    waypoints: [[-1, 7], [16, 7], [16, 9], [24, 9]],
  },
  {
    name: "Der letzte Wall", desc: "Schnurgerade durch – das Finale.",
    waves: 30, startGold: 160, startLives: 10, hpMul: 1.4,
    waypoints: [[-1, 8], [24, 8]],
  },
];

// Turm-Typen
const TOWER_TYPES = {
  arrow: {
    name: "Bogenschütze",
    icon: "🏹",
    desc: "Schnell, günstig – ab Lv. 2 Mehrfachschuss, ab Lv. 3 alle Ziele in Reichweite",
    cost: 50,
    color: "#8ac06a",
    levels: [
      { damage: 12, range: 110, fireRate: 0.5, targets: 1 },   // fireRate = Zeit zwischen Schüssen (s)
      { damage: 15, range: 125, fireRate: 0.44, targets: 3, upgradeCost: 70 },
      { damage: 20, range: 135, fireRate: 0.4, targets: 999, upgradeCost: 160 },
      { damage: 32, range: 150, fireRate: 0.34, targets: 999, upgradeCost: 300 },
    ],
    projectile: { speed: 420, color: "#d8f0c0", size: 4 },
  },
  cannon: {
    name: "Kanone",
    icon: "💣",
    desc: "Flächenschaden, langsam – ab Lv. 3 betäubt die Explosion kurz",
    cost: 100,
    color: "#c9924a",
    levels: [
      { damage: 30, range: 100, fireRate: 1.4, splash: 55 },
      { damage: 55, range: 110, fireRate: 1.25, splash: 65, upgradeCost: 110 },
      { damage: 95, range: 120, fireRate: 1.1, splash: 80, stun: 0.4, upgradeCost: 240 },
    ],
    projectile: { speed: 260, color: "#ffb347", size: 6 },
  },
  frost: {
    name: "Frostturm",
    icon: "❄️",
    desc: "Verlangsamt Gegner – ab Lv. 3 Frostbombe (verlangsamt alle im Radius)",
    cost: 80,
    color: "#6ab8d8",
    levels: [
      { damage: 6, range: 95, fireRate: 0.8, slow: 0.5, slowDuration: 1.5 },
      { damage: 12, range: 110, fireRate: 0.7, slow: 0.6, slowDuration: 2.0, upgradeCost: 90 },
      { damage: 18, range: 125, fireRate: 1.0, slow: 0.65, slowDuration: 2.2, splash: 60, upgradeCost: 200 },
    ],
    projectile: { speed: 340, color: "#bfeaff", size: 5 },
  },
  sniper: {
    name: "Scharfschütze",
    icon: "🎯",
    desc: "Hoher Schaden, große Reichweite – ab Lv. 2 kritische Treffer",
    cost: 150,
    color: "#b06ac0",
    levels: [
      { damage: 90, range: 220, fireRate: 2.2 },
      { damage: 160, range: 250, fireRate: 2.0, critEvery: 3, critMult: 2, upgradeCost: 170 },
      { damage: 260, range: 280, fireRate: 1.8, critEvery: 2, critMult: 2, upgradeCost: 340 },
    ],
    projectile: { speed: 700, color: "#f0c0ff", size: 4 },
  },
  booster: {
    name: "Verstärker",
    icon: "⚡",
    desc: "Schießt nicht – erhöht den Schaden aller Türme in Reichweite",
    cost: 120,
    color: "#e0d05a",
    levels: [
      { buff: 0.3, range: 90 },
      { buff: 0.5, range: 105, upgradeCost: 140 },
      { buff: 0.75, range: 120, upgradeCost: 280 },
    ],
  },
  haste: {
    name: "Taktgeber",
    icon: "⏩",
    desc: "Schießt nicht – erhöht die Angriffsgeschwindigkeit aller Türme in Reichweite",
    cost: 120,
    color: "#5ad08a",
    levels: [
      { rateBuff: 0.2, range: 90 },
      { rateBuff: 0.35, range: 105, upgradeCost: 140 },
      { rateBuff: 0.5, range: 120, upgradeCost: 280 },
    ],
  },
};

// Gegner-Typen
const ENEMY_TYPES = {
  runner:  { name: "Läufer",  hp: 45,   speed: 90, gold: 4,  color: "#e2c05a", size: 10 },
  soldier: { name: "Soldat",  hp: 110,  speed: 60, gold: 7,  color: "#d06a5a", size: 12 },
  tank:    { name: "Panzer",  hp: 380,  speed: 38, gold: 18, color: "#8a6ad0", size: 16 },
  swift:   { name: "Flitzer", hp: 65,   speed: 145, gold: 8, color: "#5ad0c0", size: 9 },
  boss:    { name: "Boss",    hp: 2000, speed: 30, gold: 100, color: "#e05a8a", size: 22 },
};

// Wellen-Generator: liefert für Wellennummer n die Zusammensetzung.
// hpMul: zusätzlicher Level-Multiplikator auf die Gegner-HP.
function buildWave(n, hpMul = 1) {
  const groups = [];
  // HP wächst exponentiell – Gold nur linear. Dadurch wird es spürbar härter.
  const hpScale = Math.pow(TUNING.hpGrowth, n - 1) * hpMul * TUNING.hpMulGlobal;
  const goldScale = (1 + (n - 1) * TUNING.goldGrowth) * TUNING.goldMulGlobal;
  // Gegner werden mit jeder Welle etwas schneller (bis zur Obergrenze)
  const speedScale = Math.min(TUNING.speedMax, 1 + (n - 1) * TUNING.speedGrowth);

  groups.push({ type: "runner", count: 6 + n * 2, interval: 0.75 });
  if (n >= 3) groups.push({ type: "soldier", count: 3 + n, interval: 1.0 });
  if (n >= 5) groups.push({ type: "swift", count: 4 + n, interval: 0.45 });
  if (n >= 7) groups.push({ type: "tank", count: 1 + Math.floor(n / 2), interval: 1.8 });
  if (n % 10 === 0) groups.push({ type: "boss", count: Math.floor(n / 10), interval: 4.0 });

  return { groups, hpScale, goldScale, speedScale };
}
