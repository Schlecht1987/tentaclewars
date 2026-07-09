"use strict";

/* ======================================================================
   KARTEN-GENERATOR
   generateMap(params, rng) erzeugt ein Level-Objekt in derselben Form wie
   die handgebauten Level (levels.js). Deterministisch: gleicher rng-Seed
   und gleiche Parameter -> exakt dieselbe Karte.
   ====================================================================== */

// Gewichtung der Zelltypen für Nicht-Heimatzellen
const MAPGEN_TYPE_WEIGHTS = { normal: 3, factory: 2, healer: 2, bunker: 1, attacker: 1 };

// Kürzel pro Fraktion für Zell-IDs
const MAPGEN_ID_PREFIX = { player: "P", enemy: "E", enemy2: "F", enemy3: "G", neutral: "N" };

// Ausbau-Obergrenze (tierMax) einer generierten Zelle deterministisch würfeln.
// Nicht jede Zelle darf bis Stufe 3 (120 Punkte) wachsen; Fabriken bleiben
// bewusst klein/schnell, Bunker wachsen höchstens leicht.
function rollTierMax(rng, type) {
  if (type === "factory") return 0;
  if (type === "bunker") return rng() < 0.5 ? 1 : 0;
  const r = rng();
  if (r < 0.15) return 0;
  if (r < 0.50) return 1;
  if (r < 0.82) return 2;
  return 3;
}

function generateMap(params, rng) {
  const p = Object.assign({
    width: 1000, height: 640,
    aiFactions: ["enemy"],
    cellsPerFaction: 3,
    neutralCells: 6,
    allowedTypes: Object.keys(CELL_TYPES),
    symmetric: true,
    startUnits: { player: 30, ai: 30 },
    minDist: 110,
    margin: 70
  }, params);

  const factions = ["player", ...p.aiFactions];
  const placed = []; // { x, y, type, owner, units }
  const cx = p.width / 2, cy = p.height / 2;

  // Effektiver Mindestabstand: skaliert mit der verfügbaren Fläche pro Zelle
  // (mindestens p.minDist). Sonst drängen sich bei wenigen Zellen auf großen
  // Karten alle eng um Anker/Mitte, während der Rest des Felds leer bleibt.
  const totalCells = factions.length * p.cellsPerFaction + p.neutralCells;
  const spread = Math.max(p.minDist,
    0.66 * Math.sqrt(((p.width - p.margin * 2) * (p.height - p.margin * 2)) / Math.max(1, totalCells)));

  const weights = {};
  for (const t of p.allowedTypes) {
    if (MAPGEN_TYPE_WEIGHTS[t]) weights[t] = MAPGEN_TYPE_WEIGHTS[t];
  }
  if (!Object.keys(weights).length) weights.normal = 1;

  const inBounds = pt =>
    pt.x >= p.margin && pt.x <= p.width - p.margin &&
    pt.y >= p.margin && pt.y <= p.height - p.margin;
  const farEnough = (pt, dist) =>
    placed.every(c => Math.hypot(c.x - pt.x, c.y - pt.y) >= dist);

  function pushCell(pt, type, owner, units, tierMax) {
    placed.push({ x: Math.round(pt.x), y: Math.round(pt.y), type, owner, units, tierMax: tierMax || 0 });
  }

  function neutralUnitsFor(type) {
    return type === "bunker" ? rngInt(rng, 20, 30) : rngInt(rng, 8, 25);
  }

  if (p.symmetric) {
    // k Fraktionen teilen sich die Karte rotations- (k>2) bzw. spiegel-
    // symmetrisch (k=2): jede Vorlage-Zelle wird k-fach transformiert
    // eingesetzt, mit identischem Typ und identischen Punkten -> fair.
    const k = factions.length;
    const transforms = [];
    if (k === 2) {
      transforms.push(pt => pt);
      transforms.push(pt => ({ x: p.width - pt.x, y: pt.y }));
    } else {
      for (let i = 0; i < k; i++) {
        const a = (Math.PI * 2 * i) / k;
        const cos = Math.cos(a), sin = Math.sin(a);
        transforms.push(pt => ({
          x: cx + (pt.x - cx) * cos - (pt.y - cy) * sin,
          y: cy + (pt.x - cx) * sin + (pt.y - cy) * cos
        }));
      }
    }

    // Heimat-Anker der Vorlage: links auf halber Höhe (k=2) bzw. auf einem
    // Ring um die Mitte (k>2)
    const ringR = Math.min(p.width, p.height) * 0.36;
    const anchor = k === 2
      ? { x: p.width * 0.16, y: p.height * 0.5 }
      : { x: cx - ringR, y: cy };

    // Eine Vorlage-Position finden, deren k Transformationen alle passen;
    // owners[i] ist der Besitzer der i-ten Transformation
    function placeSymmetric(sample, type, owners, unitsFn) {
      for (let attempt = 0; attempt < 220; attempt++) {
        const relax = 1 - 0.4 * (attempt / 220); // Abstand notfalls lockern
        const pt = sample(attempt);
        const pts = transforms.map(tr => tr(pt));
        if (!pts.every(inBounds)) continue;
        let ok = true;
        for (let i = 0; i < pts.length && ok; i++) {
          if (!farEnough(pts[i], spread * relax)) ok = false;
          for (let j = i + 1; j < pts.length && ok; j++) {
            if (Math.hypot(pts[i].x - pts[j].x, pts[i].y - pts[j].y) < spread * relax) ok = false;
          }
        }
        if (!ok) continue;
        // EINE Ausbau-Obergrenze je Vorlage -> alle symmetrischen Kopien
        // erhalten dieselbe (faire Startlagen, unabhängig vom Besitzer).
        const tierMax = rollTierMax(rng, type);
        for (let i = 0; i < pts.length; i++) {
          pushCell(pts[i], type, owners[i], unitsFn(i), tierMax);
        }
        return true;
      }
      return false;
    }

    const neutralOwners = factions.map(() => "neutral");

    // 1) Heimatzellen (immer "normal", Start-Punkte je Fraktion).
    // Bei k=2 darf der Anker deutlich in der Höhe variieren (gespiegelt
    // bleibt es fair) – sonst spielt sich alles auf halber Höhe ab und
    // ober-/unterhalb bleibt die Karte leer.
    const anchorJitterY = k === 2 ? p.height * 0.42 : 40;
    placeSymmetric(
      () => ({ x: anchor.x + (rng() - 0.5) * 40, y: anchor.y + (rng() - 0.5) * anchorJitterY }),
      "normal",
      factions,
      i => (factions[i] === "player" ? p.startUnits.player : p.startUnits.ai)
    );

    // 2) Rest des Fraktions-Clusters
    for (let n = 1; n < p.cellsPerFaction; n++) {
      const type = rngWeighted(rng, weights);
      const units = rngInt(rng, 8, 16);
      placeSymmetric(
        () => {
          const a = rng() * Math.PI * 2;
          const r = spread * (1 + rng() * 0.9);
          return { x: anchor.x + Math.cos(a) * r, y: anchor.y + Math.sin(a) * r };
        },
        type,
        factions,
        () => units
      );
    }

    // 3) Sektor-Neutrale (zwischen Heimat und Mitte), symmetrisch kopiert
    const sectorNeutrals = Math.floor(p.neutralCells / k);
    for (let n = 0; n < sectorNeutrals; n++) {
      const type = rngWeighted(rng, weights);
      const units = neutralUnitsFor(type);
      placeSymmetric(
        () => {
          const f = 0.35 + rng() * 0.45; // Anteil des Wegs Richtung Mitte
          return {
            x: anchor.x + (cx - anchor.x) * f + (rng() - 0.5) * spread * 2,
            y: anchor.y + (cy - anchor.y) * f + (rng() - 0.5) * spread * 2
          };
        },
        type,
        neutralOwners,
        () => units
      );
    }

    // 4) Rest-Neutrale einzeln in der umkämpften Mitte
    const rest = p.neutralCells - sectorNeutrals * k;
    for (let n = 0; n < rest; n++) {
      const type = rngWeighted(rng, weights);
      for (let attempt = 0; attempt < 200; attempt++) {
        const relax = 1 - 0.4 * (attempt / 200);
        const pt = {
          x: cx + (rng() - 0.5) * p.width * 0.55,
          y: cy + (rng() - 0.5) * p.height * 0.55
        };
        if (inBounds(pt) && farEnough(pt, spread * relax)) {
          pushCell(pt, type, "neutral", neutralUnitsFor(type), rollTierMax(rng, type));
          break;
        }
      }
    }

  } else {
    // Asymmetrische Karte: Heimatzellen weit voneinander entfernt,
    // Cluster drumherum, Neutrale frei verteilt.
    const diag = Math.hypot(p.width, p.height);
    const homes = [];
    for (const f of factions) {
      let need = diag * 0.45;
      for (let attempt = 0; attempt < 400; attempt++) {
        if (attempt > 0 && attempt % 50 === 0) need *= 0.9; // notfalls lockern
        const pt = {
          x: p.margin + rng() * (p.width - p.margin * 2),
          y: p.margin + rng() * (p.height - p.margin * 2)
        };
        if (!farEnough(pt, spread)) continue;
        if (homes.every(h => Math.hypot(h.x - pt.x, h.y - pt.y) >= need)) {
          pushCell(pt, "normal", f, f === "player" ? p.startUnits.player : p.startUnits.ai,
            rollTierMax(rng, "normal"));
          homes.push({ x: pt.x, y: pt.y, owner: f });
          break;
        }
      }
    }

    for (const h of homes) {
      for (let n = 1; n < p.cellsPerFaction; n++) {
        const type = rngWeighted(rng, weights);
        for (let attempt = 0; attempt < 200; attempt++) {
          const relax = 1 - 0.4 * (attempt / 200);
          const a = rng() * Math.PI * 2;
          const r = spread * (0.9 + rng() * 0.9);
          const pt = { x: h.x + Math.cos(a) * r, y: h.y + Math.sin(a) * r };
          if (!inBounds(pt) || !farEnough(pt, spread * relax)) continue;
          // Cluster-Zellen gehören klar zur eigenen Heimat: näher an ihr
          // als an jeder fremden Heimatzelle
          const dOwn = Math.hypot(pt.x - h.x, pt.y - h.y);
          if (homes.some(o => o !== h && Math.hypot(pt.x - o.x, pt.y - o.y) < dOwn)) continue;
          pushCell(pt, type, h.owner, rngInt(rng, 8, 16), rollTierMax(rng, type));
          break;
        }
      }
    }

    for (let n = 0; n < p.neutralCells; n++) {
      const type = rngWeighted(rng, weights);
      for (let attempt = 0; attempt < 200; attempt++) {
        const relax = 1 - 0.4 * (attempt / 200);
        const pt = {
          x: p.margin + rng() * (p.width - p.margin * 2),
          y: p.margin + rng() * (p.height - p.margin * 2)
        };
        if (inBounds(pt) && farEnough(pt, spread * relax)) {
          pushCell(pt, type, "neutral", neutralUnitsFor(type), rollTierMax(rng, type));
          break;
        }
      }
    }
  }

  // Spielbarkeits-Check: Jede Fraktion muss von ihrer stärksten Startzelle
  // aus eine fremde Zelle mit den Start-Punkten erreichen können (Tentakel-
  // Wachstum kostet lengthPerUnit Punkte pro Pixel-Einheit). Sonst wird
  // eine neutrale Brücken-Zelle Richtung Kartenmitte eingesetzt.
  for (const f of factions) {
    const own = placed.filter(c => c.owner === f);
    if (!own.length) continue;
    const strongest = own.reduce((a, b) => (b.units > a.units ? b : a));
    const reach = strongest.units * CONFIG.lengthPerUnit * 0.8;
    const reachable = placed.some(c =>
      c.owner !== f && Math.hypot(c.x - strongest.x, c.y - strongest.y) <= reach);
    if (!reachable) {
      const d = Math.hypot(cx - strongest.x, cy - strongest.y) || 1;
      const step = Math.min(reach * 0.85, d);
      pushCell(
        { x: strongest.x + ((cx - strongest.x) / d) * step,
          y: strongest.y + ((cy - strongest.y) / d) * step },
        "normal", "neutral", rngInt(rng, 8, 14), rollTierMax(rng, "normal"));
    }
  }

  // IDs vergeben (P0..., E0..., F0..., G0..., N0...)
  const counters = {};
  const cells = placed.map(c => {
    const pre = MAPGEN_ID_PREFIX[c.owner] || "X";
    counters[pre] = (counters[pre] || 0);
    const id = pre + counters[pre]++;
    return { id, type: c.type, owner: c.owner, x: c.x, y: c.y, units: c.units, tierMax: c.tierMax || 0 };
  });

  return {
    name: "Generierte Karte",
    desc: "",
    tag: "Generiert",
    sandbox: false,
    width: p.width, height: p.height,
    cells
  };
}

/* ======================================================================
   ZUFALLSSPIEL
   Übersetzt die Einstellungen aus dem Zufallsspiel-Menü (ui.js) in
   generateMap-Parameter. settings.seed macht die Karte reproduzierbar.
   ====================================================================== */

const RANDOM_MAP_SIZES = {
  small:  { width: 900,  height: 580, factor: 0.8 },
  medium: { width: 1100, height: 700, factor: 1.0 },
  large:  { width: 1350, height: 860, factor: 1.3 }
};
const RANDOM_DENSITY = { low: 3, normal: 6, high: 10 };
const RANDOM_CELL_MIX = {
  normalOnly: ["normal"],
  standard:   ["normal", "factory", "healer"],
  all:        ["normal", "factory", "healer", "bunker", "attacker"]
};

function generateRandomLevel(settings) {
  const rng = mulberry32(settings.seed);
  const size = RANDOM_MAP_SIZES[settings.mapSize] || RANDOM_MAP_SIZES.medium;
  const aiFactions = AI_FACTIONS.slice(0, settings.aiCount);
  const handicap = settings.fairness === "handicap";

  const map = generateMap({
    width: size.width, height: size.height,
    aiFactions,
    cellsPerFaction: 3,
    neutralCells: Math.round((RANDOM_DENSITY[settings.density] || 6) * size.factor),
    allowedTypes: RANDOM_CELL_MIX[settings.cellMix] || RANDOM_CELL_MIX.all,
    symmetric: settings.fairness === "symmetric",
    startUnits: { player: 30, ai: handicap ? 45 : 30 }
  }, rng);

  map.name = "Zufallskarte #" + settings.seed;
  map.tag = "Zufall";
  map.desc = `${settings.aiCount} KI-Gegner (${settings.difficulty}), Karte ${settings.mapSize}, Fairness: ${settings.fairness}.`;
  map.ai = {};
  for (const f of aiFactions) map.ai[f] = settings.difficulty;
  return map;
}
