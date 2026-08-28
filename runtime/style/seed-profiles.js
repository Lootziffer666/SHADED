// SHADED Style Discovery — seed-profiles (renderer-unabhängiger Kern).
//
// 8 strukturell verschiedene Startprofile für die Blindphase. Die internen
// Namen (soft-toon, hard-cel, …) dienen nur der Entwicklung/Doku und werden
// von der UI vor der Abstimmung NIEMALS angezeigt (sandbox/app.js hängt sie
// erst nach dem Votum an).

import { defaultStyleProfile, setDimension } from './style-profile.js';

function build(id, values) {
  let profile = defaultStyleProfile(id, id);
  for (const [key, value] of Object.entries(values)) profile = setDimension(profile, key, value);
  return profile;
}

export const SEED_PROFILE_DEFS = Object.freeze({
  'soft-toon': {
    'lighting.mode': 'banded', 'lighting.rampBands': 3, 'lighting.rampSoftness': 0.6,
    'specular.mode': 'banded', 'specular.intensity': 0.35,
    'rim.mode': 'soft', 'rim.width': 0.25, 'rim.hue': 0.6,
    'normal.mode': 'smooth', 'outline.mode': 'none',
    'palette.mode': 'free', 'texture.mode': 'clean',
    'post.mode': 'bloomGrain', 'post.intensity': 0.4, 'shadow.warmth': 0.3,
  },
  'hard-cel': {
    'lighting.mode': 'hardCel', 'lighting.rampBands': 2, 'lighting.rampSoftness': 0.05,
    'specular.mode': 'banded', 'specular.intensity': 0.5,
    'rim.mode': 'hard', 'rim.width': 0.3, 'rim.hue': 0.1,
    'normal.mode': 'faceted', 'outline.mode': 'sobel', 'outline.thickness': 0.6,
    'palette.mode': 'posterize', 'palette.steps': 3,
    'texture.mode': 'clean', 'post.mode': 'halftone', 'post.intensity': 0.5, 'shadow.warmth': -0.2,
  },
  painterly: {
    'lighting.mode': 'halfLambert', 'lighting.rampBands': 4, 'lighting.rampSoftness': 0.7,
    'specular.mode': 'ggx', 'specular.intensity': 0.3,
    'rim.mode': 'soft', 'rim.width': 0.15, 'rim.hue': 0.55,
    'normal.mode': 'curvature', 'normal.strength': 0.6, 'outline.mode': 'none',
    'palette.mode': 'free', 'texture.mode': 'breakup', 'texture.strength': 0.7,
    'post.mode': 'bloomGrain', 'post.intensity': 0.5, 'shadow.warmth': 0.5,
  },
  graphic: {
    'lighting.mode': 'hardCel', 'lighting.rampBands': 2, 'lighting.rampSoftness': 0,
    'specular.mode': 'banded', 'specular.intensity': 0.2,
    'rim.mode': 'off', 'normal.mode': 'faceted', 'outline.mode': 'sobel', 'outline.thickness': 0.8,
    'palette.mode': 'posterize', 'palette.steps': 2,
    'texture.mode': 'clean', 'post.mode': 'halftone', 'post.intensity': 0.7, 'shadow.warmth': 0,
  },
  'low-poly-facet': {
    'lighting.mode': 'halfLambert', 'lighting.rampBands': 3, 'lighting.rampSoftness': 0.2,
    'specular.mode': 'ggx', 'specular.intensity': 0.2,
    'rim.mode': 'off', 'normal.mode': 'faceted', 'normal.strength': 0.9, 'outline.mode': 'none',
    'palette.mode': 'free', 'texture.mode': 'clean',
    'post.mode': 'bloomGrain', 'post.intensity': 0.15, 'shadow.warmth': -0.1,
  },
  'matcap-heavy': {
    'lighting.mode': 'banded', 'lighting.rampBands': 5, 'lighting.rampSoftness': 0.5,
    'specular.mode': 'ggx', 'specular.intensity': 0.8,
    'rim.mode': 'hard', 'rim.width': 0.4, 'rim.hue': 0.55,
    'normal.mode': 'smooth', 'outline.mode': 'none',
    'palette.mode': 'gradientMap', 'palette.hue': 0.55,
    'texture.mode': 'clean', 'post.mode': 'bloomGrain', 'post.intensity': 0.6, 'shadow.warmth': 0.2,
  },
  gooch: {
    'lighting.mode': 'halfLambert', 'lighting.rampBands': 2, 'lighting.rampSoftness': 0.4,
    'specular.mode': 'ggx', 'specular.intensity': 0.4,
    'rim.mode': 'soft', 'rim.width': 0.2, 'rim.hue': 0.05,
    'normal.mode': 'smooth', 'outline.mode': 'sobel', 'outline.thickness': 0.3,
    'palette.mode': 'gradientMap', 'palette.hue': 0.15,
    'texture.mode': 'clean', 'post.mode': 'bloomGrain', 'post.intensity': 0.3, 'shadow.warmth': -0.6,
  },
  'pbr-stylized': {
    'lighting.mode': 'halfLambert', 'lighting.rampBands': 6, 'lighting.rampSoftness': 0.15,
    'specular.mode': 'ggx', 'specular.intensity': 0.65,
    'rim.mode': 'soft', 'rim.width': 0.2, 'rim.hue': 0.6,
    'normal.mode': 'smooth', 'outline.mode': 'none',
    'palette.mode': 'free', 'texture.mode': 'breakup', 'texture.strength': 0.25,
    'post.mode': 'bloomGrain', 'post.intensity': 0.35, 'shadow.warmth': 0.1,
  },
});

export const SEED_PROFILE_NAMES = Object.freeze(Object.keys(SEED_PROFILE_DEFS));

export function seedProfiles() {
  return SEED_PROFILE_NAMES.map((name) => build(name, SEED_PROFILE_DEFS[name]));
}

export function seedProfileByName(name) {
  if (!SEED_PROFILE_DEFS[name]) throw new Error(`Unbekanntes Seed-Profil: ${name}`);
  return build(name, SEED_PROFILE_DEFS[name]);
}

// Blindkopie ohne den internen Namen — für die UI vor dem Votum.
export function blindProfile(profile) {
  const copy = JSON.parse(JSON.stringify(profile));
  copy.name = '';
  return copy;
}
