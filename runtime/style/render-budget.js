// SHADED Style Discovery — RenderBudget (renderer-unabhängiger Kern).
//
// Nur FULL und MOBILE sind sichtbare Budget-Stufen dieser vertikalen Scheibe
// (Maintainer-Korrektur 3). BALANCED/MINIMAL existieren nur, damit die
// Zuordnung auf runtime/spatial-kernel/quality-budget.js' QUALITY-Presets
// vollständig bleibt — sie werden von sandbox/ nicht angeboten.
//
// substitute(profile, tier) ersetzt NUR Kostenfelder (Specular-Intensität,
// Outline-Dicke, Texture-Breakup-Stärke, Post-Intensität, Normal-Stärke).
// Stil-Identitätsfelder (STYLE_IDENTITY_KEYS) bleiben bitidentisch — FULL und
// MOBILE müssen dieselbe visuelle Welt bleiben, nur mit billigeren Mitteln.

import { QUALITY, BUDGET_PRESETS } from '../spatial-kernel/quality-budget.js';
import { cloneStyleProfile, STYLE_IDENTITY_KEYS, styleProfilesEqualOnKeys } from './style-profile.js';

// Nutzer-sichtbare Stufen dieser Aufgabe.
export const STYLE_BUDGET_TIERS = Object.freeze({ FULL: 'FULL', MOBILE: 'MOBILE' });

// Vollständiger Enum inkl. Kompatibilitätsstufen (nicht im UI angeboten).
export const STYLE_BUDGET_TIERS_ALL = Object.freeze({ FULL: 'FULL', BALANCED: 'BALANCED', MOBILE: 'MOBILE', MINIMAL: 'MINIMAL' });

const TIER_TO_QUALITY_PROFILE = Object.freeze({
  FULL: QUALITY.DESKTOP,
  BALANCED: QUALITY.BROWSER,
  MOBILE: QUALITY.MOBILE,
  MINIMAL: QUALITY.MOBILE,
});

// Kostenfelder: Pfad + wie stark der Wert je Stufe skaliert wird (Faktor auf
// den bestehenden Profilwert, nicht auf einen festen Zielwert — der Stil
// bleibt derselbe, nur billiger ausgeführt).
const COST_FACTORS = Object.freeze({
  FULL: {
    'specular.intensity': 1, 'outline.thickness': 1, 'texture.strength': 1,
    'post.intensity': 1, 'normal.strength': 1,
  },
  BALANCED: {
    'specular.intensity': 0.85, 'outline.thickness': 0.75, 'texture.strength': 0.7,
    'post.intensity': 0.8, 'normal.strength': 0.85,
  },
  MOBILE: {
    'specular.intensity': 0.6, 'outline.thickness': 0.45, 'texture.strength': 0.35,
    'post.intensity': 0.5, 'normal.strength': 0.6,
  },
  MINIMAL: {
    'specular.intensity': 0.3, 'outline.thickness': 0.2, 'texture.strength': 0.15,
    'post.intensity': 0.25, 'normal.strength': 0.35,
  },
});

export const STYLE_COST_KEYS = Object.freeze(Object.keys(COST_FACTORS.FULL));

function getPath(obj, key) {
  const [a, b] = key.split('.');
  return obj[a] ? obj[a][b] : undefined;
}
function setPath(obj, key, value) {
  const [a, b] = key.split('.');
  if (!obj[a]) obj[a] = {};
  obj[a][b] = value;
}

// Rein datengetriebene Render-Metadaten (kein GPU-Zugriff hier) — abgeleitet
// aus quality-budget.js statt einer zweiten Budget-Wahrheit.
function budgetMetaFor(tier) {
  const qualityProfile = TIER_TO_QUALITY_PROFILE[tier];
  const preset = BUDGET_PRESETS[qualityProfile];
  return {
    tier,
    qualityProfile,
    renderScale: qualityProfile === QUALITY.MOBILE ? 0.5 : qualityProfile === QUALITY.BROWSER ? 0.75 : 1,
    raymarchSteps: Math.round(64 * preset.shaderComplexity),
    particleBudget: preset.particles,
    textureRes: preset.textureRes,
    shadowQuality: preset.shadowQuality,
  };
}

export function substitute(profile, tier) {
  if (!STYLE_BUDGET_TIERS_ALL[tier]) throw new Error(`Unbekannte RenderBudget-Stufe: ${tier}`);
  const factors = COST_FACTORS[tier];
  const resolvedProfile = cloneStyleProfile(profile);
  for (const [key, factor] of Object.entries(factors)) {
    const base = getPath(profile, key);
    if (typeof base === 'number') setPath(resolvedProfile, key, base * factor);
  }
  return { profile: resolvedProfile, budget: budgetMetaFor(tier) };
}

export function preservesIdentity(originalProfile, resolvedProfile) {
  return styleProfilesEqualOnKeys(originalProfile, resolvedProfile, STYLE_IDENTITY_KEYS);
}
