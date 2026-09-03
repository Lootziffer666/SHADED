// SHADED Style Discovery — Produktionsadapter (renderer-unabhängiger Kern).
//
// Die einzige Brücke zwischen runtime/style/ (WorldState -> MaterialResponse ->
// StyleProfile -> RenderBudget) und der echten Produktions-Engine. Kein
// DOM/WebGL hier; classGrid/getMaterialTypeAt() bleiben die einzige Quelle
// dafür, WAS wo ist. Dieser Adapter bestimmt nur, WIE das bereits
// klassifizierte Material auf Weltzustand + Stil reagiert.

import { MaterialKind, createWorldState } from './world-state.js';
import { deriveMaterialResponse } from './material-response.js';
import { substitute } from './render-budget.js';

function clamp01(v) {
  return Math.max(0, Math.min(1, Number.isFinite(v) ? v : 0));
}

export const SHADED_CLASS_TO_MATERIAL_KIND = Object.freeze({
  grass: MaterialKind.FIBER,
  foliage: MaterialKind.FIBER,
  roof: MaterialKind.STONE,
  path: MaterialKind.STONE,
  wood: MaterialKind.WOOD,
  window: MaterialKind.GLASS,
  water: MaterialKind.WATER,
  rock: MaterialKind.STONE,
});
export const SHADED_CLASSES = Object.freeze(Object.keys(SHADED_CLASS_TO_MATERIAL_KIND));

export function worldStateForShadedClass(shadedClass, curParams) {
  const materialKind = SHADED_CLASS_TO_MATERIAL_KIND[shadedClass];
  if (!materialKind) throw new Error(`Unbekannte SHADED-Materialklasse: ${shadedClass}`);
  const wet = clamp01(curParams.wet);
  const cold = clamp01(curParams.temperature) < 0.42;
  return createWorldState({
    materialKind,
    origin: 'manual',
    fields: {
      moisture: wet,
      water: wet * clamp01(curParams.puddle),
      mud: wet > 0.5 ? (wet - 0.5) * 0.6 : 0,
      ice: cold ? clamp01(curParams.snow) * 0.5 : 0,
      frost: cold ? clamp01(0.42 - clamp01(curParams.temperature)) : 0,
      // snowCap is persistent SURFACE COVER, not the transient fall rate.
      // `snow` == Schneedecke, `snowfall` == Schneefall in shaded-engine.mjs.
      snowCap: clamp01(curParams.snow),
      rust: clamp01(curParams.decay),
      damage: clamp01(curParams.decay),
      crack: curParams.decay > 0.3 ? clamp01(curParams.decay - 0.3) : 0,
      soot: 0, heat: 0, fire: 0, fuelMass: 0, smoke: 0,
    },
  });
}

export function deriveProductionMaterialResponses(curParams) {
  const out = {};
  for (const shadedClass of SHADED_CLASSES) {
    out[shadedClass] = deriveMaterialResponse(worldStateForShadedClass(shadedClass, curParams));
  }
  return out;
}

// --- Migration 1: Specular-Sheen ---
const SPECULAR_GATED_CLASSES = Object.freeze(['roof', 'path', 'rock', 'wood']);
const SPECULAR_SURFACE_FINISH = Object.freeze({ roof: 2.2, path: 1.0, rock: 1.0, wood: 1.0 });
const MAX_RELATIVE_SPECULAR_WEIGHT = 2.5;

function specularResponseWeight(materialResponse) {
  return (1 - materialResponse.roughness) * (0.15 + materialResponse.reflectance);
}

export function specularWeightsForShader(materialResponses) {
  // MaterialResponse already reacts to wetness (lower roughness / higher
  // reflectance). The production shader ALSO multiplies the sheen by u_wet.
  // Using a fixed dry-state normalizer here amplified ordinary wet presets by
  // an order of magnitude (e.g. sturmnacht roof >20) and effectively applied
  // wetness twice. Normalize the CURRENT responses instead: world wetness may
  // change the relative ordering, but it cannot globally inflate the weight
  // scale. u_wet remains the single global wetness multiplier in the shader.
  const raw = {};
  for (const shadedClass of SPECULAR_GATED_CLASSES) {
    const response = materialResponses[shadedClass];
    if (!response) throw new Error(`Fehlende MaterialResponse für ${shadedClass}`);
    const value = specularResponseWeight(response) * SPECULAR_SURFACE_FINISH[shadedClass];
    raw[shadedClass] = Number.isFinite(value) && value >= 0 ? value : 0;
  }
  const mean = SPECULAR_GATED_CLASSES.reduce((sum, key) => sum + raw[key], 0) / SPECULAR_GATED_CLASSES.length;
  if (!(mean > 1e-9)) return Object.fromEntries(SPECULAR_GATED_CLASSES.map((key) => [key, 1]));

  const weights = {};
  for (const shadedClass of SPECULAR_GATED_CLASSES) {
    weights[shadedClass] = Math.max(0, Math.min(MAX_RELATIVE_SPECULAR_WEIGHT, raw[shadedClass] / mean));
  }
  return weights;
}

const SPECULAR_INTENSITY_TO_SHADER_SCALE = 0.56;
export const SPECULAR_NIGHT_DIM_RATIO = 0.16 / 0.28;

export function styleUniformsForShader(profile, budgetTier, materialResponses) {
  const { profile: resolved } = substitute(profile, budgetTier);
  const weights = specularWeightsForShader(materialResponses);
  return {
    specStyleIntensity: resolved.specular.intensity * SPECULAR_INTENSITY_TO_SHADER_SCALE,
    specStyleMode: resolved.specular.mode === 'banded' ? 1 : 0,
    specWeightRoof: weights.roof,
    specWeightPath: weights.path,
    specWeightRock: weights.rock,
    specWeightWood: weights.wood,
    shadowWarmth: resolved.shadow.warmth,
  };
}
