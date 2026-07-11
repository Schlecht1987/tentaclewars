// Zentrale Spiel-Konfiguration
const CONFIG = {
  tileSize: 40,
  cols: 24,
  rows: 16,
  waveBonusBase: 15, // Gold-Bonus pro geschaffter Welle (+ Welle * 3)
};

// ---- Kampagne: 10 Level mit eigener Karte + Schwierigkeit ----
// waypoints: Gitter-Wegpunkte (Spalte, Reihe), nur horizontale/vertikale Segmente.
// hpMul skaliert die Gegner-HP zusätzlich zur Wellen-Skalierung.
const LEVELS = [
  {
    name: "Grüne Wiese", desc: "Langer Schlangenpfad – viel Zeit zum Schießen.",
    waves: 12, startGold: 120, startLives: 25, hpMul: 0.8,
    waypoints: [[-1, 2], [4, 2], [4, 13], [9, 13], [9, 4], [14, 4], [14, 13], [19, 13], [19, 4], [24, 4]],
  },
  {
    name: "Flusslauf", desc: "Gemächliche Kurven durchs Tal.",
    waves: 14, startGold: 110, startLives: 20, hpMul: 0.9,
    waypoints: [[-1, 8], [5, 8], [5, 3], [11, 3], [11, 12], [17, 12], [17, 5], [24, 5]],
  },
  {
    name: "Die Spirale", desc: "Der Pfad windet sich zur Burg in der Mitte.",
    waves: 16, startGold: 110, startLives: 20, hpMul: 0.95,
    waypoints: [[-1, 1], [21, 1], [21, 14], [3, 14], [3, 5], [17, 5], [17, 10], [8, 10]],
  },
  {
    name: "Altes Schlachtfeld", desc: "Die klassische Karte – verschlungen und lang.",
    waves: 18, startGold: 100, startLives: 20, hpMul: 1.0,
    waypoints: [[-1, 3], [4, 3], [4, 9], [10, 9], [10, 2], [16, 2], [16, 12], [6, 12], [6, 14], [20, 14], [20, 6], [24, 6]],
  },
  {
    name: "Doppel-U", desc: "Zwei weite Bögen – nutze die Innenseiten.",
    waves: 20, startGold: 100, startLives: 18, hpMul: 1.05,
    waypoints: [[-1, 4], [20, 4], [20, 8], [4, 8], [4, 12], [24, 12]],
  },
  {
    name: "Der Haken", desc: "Nur eine Kehre – die Gegner sind schnell durch.",
    waves: 22, startGold: 100, startLives: 15, hpMul: 1.1,
    waypoints: [[-1, 13], [12, 13], [12, 2], [24, 2]],
  },
  {
    name: "S-Kurve", desc: "Kurzes Stück Straße, harte Wellen.",
    waves: 24, startGold: 90, startLives: 15, hpMul: 1.15,
    waypoints: [[-1, 6], [8, 6], [8, 10], [16, 10], [16, 6], [24, 6]],
  },
  {
    name: "Die Treppe", desc: "Stufe um Stufe hinab zur Festung.",
    waves: 26, startGold: 90, startLives: 12, hpMul: 1.2,
    waypoints: [[-1, 2], [5, 2], [5, 5], [10, 5], [10, 8], [15, 8], [15, 11], [20, 11], [20, 14], [24, 14]],
  },
  {
    name: "Schnellstraße", desc: "Fast kein Umweg – jeder Schuss muss sitzen.",
    waves: 28, startGold: 90, startLives: 10, hpMul: 1.3,
    waypoints: [[-1, 7], [16, 7], [16, 9], [24, 9]],
  },
  {
    name: "Der letzte Wall", desc: "Schnurgerade durch – das Finale.",
    waves: 30, startGold: 100, startLives: 10, hpMul: 1.4,
    waypoints: [[-1, 8], [24, 8]],
  },
];

// Turm-Typen
const TOWER_TYPES = {
  arrow: {
    name: "Bogenschütze",
    icon: "🏹",
    desc: "Schnell, günstig, Einzelziel",
    cost: 50,
    color: "#8ac06a",
    levels: [
      { damage: 12, range: 110, fireRate: 0.5 },   // Zeit zwischen Schüssen (s)
      { damage: 22, range: 125, fireRate: 0.42, upgradeCost: 60 },
      { damage: 40, range: 140, fireRate: 0.34, upgradeCost: 120 },
      { damage: 78, range: 155, fireRate: 0.26, upgradeCost: 240 },
    ],
    projectile: { speed: 420, color: "#d8f0c0", size: 4 },
  },
  cannon: {
    name: "Kanone",
    icon: "💣",
    desc: "Flächenschaden, langsam",
    cost: 100,
    color: "#c9924a",
    levels: [
      { damage: 30, range: 100, fireRate: 1.4, splash: 55 },
      { damage: 55, range: 110, fireRate: 1.25, splash: 65, upgradeCost: 110 },
      { damage: 95, range: 120, fireRate: 1.1, splash: 80, upgradeCost: 220 },
    ],
    projectile: { speed: 260, color: "#ffb347", size: 6 },
  },
  frost: {
    name: "Frostturm",
    icon: "❄️",
    desc: "Verlangsamt Gegner",
    cost: 80,
    color: "#6ab8d8",
    levels: [
      { damage: 6, range: 95, fireRate: 0.8, slow: 0.5, slowDuration: 1.5 },
      { damage: 12, range: 110, fireRate: 0.7, slow: 0.6, slowDuration: 2.0, upgradeCost: 90 },
      { damage: 20, range: 125, fireRate: 0.6, slow: 0.7, slowDuration: 2.5, upgradeCost: 180 },
    ],
    projectile: { speed: 340, color: "#bfeaff", size: 5 },
  },
  sniper: {
    name: "Scharfschütze",
    icon: "🎯",
    desc: "Hoher Schaden, große Reichweite",
    cost: 150,
    color: "#b06ac0",
    levels: [
      { damage: 90, range: 220, fireRate: 2.2 },
      { damage: 170, range: 250, fireRate: 2.0, upgradeCost: 160 },
      { damage: 300, range: 280, fireRate: 1.8, upgradeCost: 320 },
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
  const hpScale = Math.pow(1.16, n - 1) * hpMul;
  const goldScale = 1 + (n - 1) * 0.05;
  // Gegner werden mit jeder Welle etwas schneller (bis +50 %)
  const speedScale = Math.min(1.5, 1 + (n - 1) * 0.02);

  groups.push({ type: "runner", count: 6 + n * 2, interval: 0.75 });
  if (n >= 3) groups.push({ type: "soldier", count: 3 + n, interval: 1.0 });
  if (n >= 5) groups.push({ type: "swift", count: 4 + n, interval: 0.45 });
  if (n >= 7) groups.push({ type: "tank", count: 1 + Math.floor(n / 2), interval: 1.8 });
  if (n % 10 === 0) groups.push({ type: "boss", count: Math.floor(n / 10), interval: 4.0 });

  return { groups, hpScale, goldScale, speedScale };
}
