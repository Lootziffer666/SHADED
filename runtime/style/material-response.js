// SHADED Style Discovery — MaterialResponse (renderer-unabhängiger Kern).
//
// deriveMaterialResponse(worldState) ist eine REINE, STILFREIE Funktion:
// derselbe WorldState liefert immer dieselbe MaterialResponse, unabhängig
// vom StyleProfile. Die Response reduziert NICHT auf
// {baseColor, roughness, reflectance, emission, damage} — Nässe, Ruß,
// Risse, Frost, Schnee, Rost usw. bleiben als eigene benannte Kanäle
// erhalten, damit unterschiedliche StyleProfiles dieselbe Semantik
// unterschiedlich interpretieren können (z. B. "wetness" als Glanzband bei
// einem Stil, als Farbabdunkelung bei einem anderen).

import { MaterialKind, fieldValue } from './world-state.js';

function clamp01(v) { return Math.max(0, Math.min(1, v)); }
function mix(a, b, t) { return a + (b - a) * clamp01(t); }
function mixColor(a, b, t) { return [mix(a[0], b[0], t), mix(a[1], b[1], t), mix(a[2], b[2], t)]; }

// Stilfreie Basis-Materialwerte je MaterialKind. Grobe, plausible PBR-artige
// Ausgangswerte für die 10 Benchmark-Primitive (docs/STYLE_DISCOVERY.md).
const MATERIAL_BASE = Object.freeze({
  [MaterialKind.STONE]:    { baseColor: [0.55, 0.53, 0.50], roughness: 0.85, reflectance: 0.04 },
  [MaterialKind.WOOD]:     { baseColor: [0.45, 0.30, 0.18], roughness: 0.70, reflectance: 0.03 },
  [MaterialKind.METAL]:    { baseColor: [0.64, 0.65, 0.68], roughness: 0.35, reflectance: 0.70 },
  [MaterialKind.GLASS]:    { baseColor: [0.90, 0.95, 0.97], roughness: 0.05, reflectance: 0.90 },
  [MaterialKind.WATER]:    { baseColor: [0.14, 0.34, 0.44], roughness: 0.06, reflectance: 0.50 },
  [MaterialKind.SKIN]:     { baseColor: [0.85, 0.64, 0.55], roughness: 0.50, reflectance: 0.05 },
  [MaterialKind.FIBER]:    { baseColor: [0.50, 0.40, 0.30], roughness: 0.92, reflectance: 0.02 },
  [MaterialKind.EMISSIVE]: { baseColor: [1.00, 0.48, 0.10], roughness: 0.60, reflectance: 0.05 },
  [MaterialKind.SMOKE]:    { baseColor: [0.32, 0.32, 0.34], roughness: 1.00, reflectance: 0.00 },
});

const WHITE = [1, 1, 1];
const FROST_TINT = [0.80, 0.88, 0.95];
const CHAR_TINT = [0.04, 0.03, 0.03];
const RUST_TINT = [0.55, 0.28, 0.10];
const WET_DARKEN = 0.35;

// Rost betrifft laut CLAUDE.md Weltgesetz #9 metallische und hölzerne
// Oberflächen unter Nässe — auf anderen Materialien bleibt er wirkungslos.
const RUST_SUSCEPTIBLE = new Set([MaterialKind.METAL, MaterialKind.WOOD]);

export function deriveMaterialResponse(worldState) {
  const kind = worldState.materialKind;
  const base = MATERIAL_BASE[kind] || MATERIAL_BASE[MaterialKind.STONE];
  const f = (name) => fieldValue(worldState, name);

  const wetness = clamp01(f('moisture') * 0.5 + f('water') * 0.7 + f('mud') * 0.25);
  const sootAmount = f('soot');
  const charAmount = clamp01(sootAmount * 0.8 + f('heat') * 0.08);
  const crackAmount = f('crack');
  const frostEdge = clamp01(f('frost') * 0.8 + f('ice') * 0.35);
  const snowCap = f('snowCap');
  const iceAmount = f('ice');
  const rustAmount = RUST_SUSCEPTIBLE.has(kind) ? f('rust') * clamp01(0.35 + wetness) : 0;
  const damageAmount = clamp01(f('damage') + crackAmount * 0.3);
  const heatAmount = f('heat');
  const fireAmount = f('fire');
  const smokeAmount = f('smoke');
  const muddiness = f('mud');

  let baseColor = base.baseColor;
  let roughness = base.roughness;
  let reflectance = base.reflectance;

  // Nässe dunkelt ab und glättet (poröse Materialien stärker, Glas/Metall kaum).
  if (wetness > 0) {
    baseColor = mixColor(baseColor, [0, 0, 0], wetness * WET_DARKEN);
    roughness = mix(roughness, Math.min(roughness, 0.08), wetness);
    reflectance = mix(reflectance, Math.max(reflectance, 0.4), wetness * 0.6);
  }
  // Ruß/Verkohlung schiebt Richtung Schwarz und erhöht Rauheit.
  if (charAmount > 0) {
    baseColor = mixColor(baseColor, CHAR_TINT, charAmount);
    roughness = mix(roughness, 0.95, charAmount);
    reflectance = mix(reflectance, 0.02, charAmount);
  }
  // Rost schiebt Richtung orange-braun, erhöht Rauheit, senkt Reflektanz.
  if (rustAmount > 0) {
    baseColor = mixColor(baseColor, RUST_TINT, rustAmount);
    roughness = mix(roughness, 0.9, rustAmount);
    reflectance = mix(reflectance, 0.05, rustAmount);
  }
  // Frost/Schnee hellen auf, Richtung kühles Weiß.
  if (frostEdge > 0) baseColor = mixColor(baseColor, FROST_TINT, frostEdge * 0.55);
  if (snowCap > 0) baseColor = mixColor(baseColor, WHITE, snowCap * 0.85);

  const emissionBase = kind === MaterialKind.EMISSIVE ? 1 : 0;
  const emission = clamp01(emissionBase * mix(0.4, 1, fireAmount) + heatAmount * 0.15);

  // Von der Style-Stufe interpretierbare Normalstörung: Risse, Rost-Textur
  // und Faser-Rauheit tragen bei — der genaue Look bleibt Sache des Stils.
  const normalPerturb = clamp01(crackAmount * 0.8 + rustAmount * 0.4 + (kind === MaterialKind.FIBER ? 0.5 : 0));

  return {
    materialKind: kind,
    baseColor,
    roughness: clamp01(roughness),
    reflectance: clamp01(reflectance),
    emission,
    normalPerturb,
    damage: damageAmount,
    // Semantische Signale bleiben als eigene Kanäle erhalten (Korrektur 1) —
    // der Style-Pass entscheidet, WIE er sie zeigt.
    wetness,
    charAmount,
    sootAmount,
    crackAmount,
    frostEdge,
    snowCap,
    iceAmount,
    rustAmount,
    heatAmount,
    fireAmount,
    smokeAmount,
    muddiness,
  };
}

// Flaches Array (fester Kanal-Index) für GPU-Upload/G-Buffer-Packing, falls
// eine Stufe eine kompakte Darstellung statt des Objekts braucht. Die
// Reihenfolge ist Vertrag — neue Kanäle werden angehängt, nie eingefügt.
export const MATERIAL_RESPONSE_CHANNELS = Object.freeze([
  'roughness', 'reflectance', 'emission', 'normalPerturb', 'damage',
  'wetness', 'charAmount', 'sootAmount', 'crackAmount', 'frostEdge',
  'snowCap', 'iceAmount', 'rustAmount', 'heatAmount', 'fireAmount',
  'smokeAmount', 'muddiness',
]);

export function materialResponseToVector(response) {
  return MATERIAL_RESPONSE_CHANNELS.map((name) => response[name] ?? 0);
}
