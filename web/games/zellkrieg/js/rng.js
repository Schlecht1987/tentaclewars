"use strict";

/* ======================================================================
   DETERMINISTISCHER ZUFALL (mulberry32)
   Gleicher Seed -> gleiche Zahlenfolge. Grundlage dafür, dass Kampagnen-
   Level und Zufallskarten über Neustarts hinweg reproduzierbar sind.
   ====================================================================== */

function mulberry32(seed) {
  let a = seed | 0;
  return function () {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Ganzzahl in [min, max] (beide inklusive)
function rngInt(rng, min, max) {
  return min + Math.floor(rng() * (max - min + 1));
}

// Zufälliges Element eines Arrays
function rngPick(rng, arr) {
  return arr[Math.floor(rng() * arr.length)];
}

// Gewichtete Auswahl: weights = { key: gewicht, ... }
function rngWeighted(rng, weights) {
  const keys = Object.keys(weights);
  let total = 0;
  for (const k of keys) total += weights[k];
  let roll = rng() * total;
  for (const k of keys) {
    roll -= weights[k];
    if (roll <= 0) return k;
  }
  return keys[keys.length - 1];
}
