// SHADED Style Discovery — StyleProfile (renderer-unabhängiger Kern).
//
// Ein StyleProfile ist eine benannte Auswahl aus dem ersten echten
// Primitivensatz (docs/STYLE_DISCOVERY.md): Lighting, Specular, Rim, Normal,
// Outline, Palette, Texture-Breakup, Post, Shadow-Color. Jede Dimension ist
// entweder kategorial (Primitivwahl) oder kontinuierlich (Parameter) und in
// STYLE_DIMENSIONS beschrieben — dieselbe Liste treibt toVector()/
// fromVector(), das Preference-Model, pair-selection und breeding.

export const STYLE_PROFILE_SCHEMA = 'shaded.style.profile/v1';

export const STYLE_DIMENSIONS = Object.freeze([
  { key: 'lighting.mode', kind: 'categorical', options: ['halfLambert', 'banded', 'hardCel'] },
  { key: 'lighting.rampBands', kind: 'continuous', min: 2, max: 6, step: 1 },
  { key: 'lighting.rampSoftness', kind: 'continuous', min: 0, max: 1 },
  { key: 'specular.mode', kind: 'categorical', options: ['ggx', 'banded'] },
  { key: 'specular.intensity', kind: 'continuous', min: 0, max: 1 },
  { key: 'rim.mode', kind: 'categorical', options: ['off', 'soft', 'hard'] },
  { key: 'rim.width', kind: 'continuous', min: 0, max: 1 },
  { key: 'rim.hue', kind: 'continuous', min: 0, max: 1 },
  { key: 'normal.mode', kind: 'categorical', options: ['smooth', 'curvature', 'faceted'] },
  { key: 'normal.strength', kind: 'continuous', min: 0, max: 1 },
  { key: 'outline.mode', kind: 'categorical', options: ['none', 'sobel'] },
  { key: 'outline.thickness', kind: 'continuous', min: 0, max: 1 },
  { key: 'palette.mode', kind: 'categorical', options: ['free', 'gradientMap', 'posterize', 'iridescent'] },
  { key: 'palette.steps', kind: 'continuous', min: 2, max: 8, step: 1 },
  { key: 'palette.hue', kind: 'continuous', min: 0, max: 1 },
  { key: 'texture.mode', kind: 'categorical', options: ['clean', 'breakup'] },
  { key: 'texture.strength', kind: 'continuous', min: 0, max: 1 },
  { key: 'post.mode', kind: 'categorical', options: ['bloomGrain', 'halftone'] },
  { key: 'post.intensity', kind: 'continuous', min: 0, max: 1 },
  { key: 'shadow.warmth', kind: 'continuous', min: -1, max: 1 },
]);

// Stil-Identitätsfelder: bleiben über RenderBudget.substitute() hinweg IMMER
// unverändert, damit FULL und MOBILE als dieselbe visuelle Welt erkennbar
// bleiben (Palette, Bandzahl, Shadow-Color, Rim-Modus — Maintainer-Korrektur 3).
export const STYLE_IDENTITY_KEYS = Object.freeze([
  'palette.mode', 'palette.steps', 'palette.hue',
  'lighting.mode', 'lighting.rampBands',
  'shadow.warmth',
  'rim.mode',
]);

const DIMENSION_BY_KEY = new Map(STYLE_DIMENSIONS.map((d) => [d.key, d]));

export function dimensionByKey(key) {
  const d = DIMENSION_BY_KEY.get(key);
  if (!d) throw new Error(`Unbekannte StyleProfile-Dimension: ${key}`);
  return d;
}

function getPath(obj, key) {
  const [a, b] = key.split('.');
  return obj[a] ? obj[a][b] : undefined;
}

function setPath(obj, key, value) {
  const [a, b] = key.split('.');
  if (!obj[a]) obj[a] = {};
  obj[a][b] = value;
}

function clampDimensionValue(dim, value) {
  if (dim.kind === 'categorical') {
    return dim.options.includes(value) ? value : dim.options[0];
  }
  let v = Number.isFinite(value) ? value : dim.min;
  if (dim.step) v = Math.round(v / dim.step) * dim.step;
  return Math.max(dim.min, Math.min(dim.max, v));
}

export function defaultStyleProfile(id = 'default', name = 'Default') {
  const profile = { schema: STYLE_PROFILE_SCHEMA, id, name, lighting: {}, specular: {}, rim: {}, normal: {}, outline: {}, palette: {}, texture: {}, post: {}, shadow: {} };
  const defaults = {
    'lighting.mode': 'halfLambert', 'lighting.rampBands': 3, 'lighting.rampSoftness': 0.35,
    'specular.mode': 'ggx', 'specular.intensity': 0.5,
    'rim.mode': 'soft', 'rim.width': 0.3, 'rim.hue': 0.6,
    'normal.mode': 'smooth', 'normal.strength': 0.5,
    'outline.mode': 'none', 'outline.thickness': 0.3,
    'palette.mode': 'free', 'palette.steps': 4, 'palette.hue': 0.5,
    'texture.mode': 'clean', 'texture.strength': 0.4,
    'post.mode': 'bloomGrain', 'post.intensity': 0.4,
    'shadow.warmth': 0,
  };
  for (const [key, value] of Object.entries(defaults)) setPath(profile, key, value);
  return profile;
}

export function getDimension(profile, key) {
  return getPath(profile, key);
}

export function setDimension(profile, key, value) {
  const dim = dimensionByKey(key);
  const clamped = clampDimensionValue(dim, value);
  const out = cloneStyleProfile(profile);
  setPath(out, key, clamped);
  return out;
}

export function cloneStyleProfile(profile) {
  return JSON.parse(JSON.stringify(profile));
}

export function validateStyleProfile(profile) {
  const errors = [];
  if (!profile || profile.schema !== STYLE_PROFILE_SCHEMA) errors.push('schema fehlt oder falsch');
  for (const dim of STYLE_DIMENSIONS) {
    const v = getPath(profile, dim.key);
    if (v === undefined) { errors.push(`fehlende Dimension: ${dim.key}`); continue; }
    if (dim.kind === 'categorical' && !dim.options.includes(v)) errors.push(`ungültiger Wert für ${dim.key}: ${v}`);
    if (dim.kind === 'continuous' && (typeof v !== 'number' || v < dim.min || v > dim.max)) errors.push(`ungültiger Wert für ${dim.key}: ${v}`);
  }
  return { ok: errors.length === 0, errors };
}

export function serializeStyleProfile(profile) {
  return JSON.stringify(profile);
}

export function deserializeStyleProfile(json) {
  const profile = typeof json === 'string' ? JSON.parse(json) : json;
  const { ok, errors } = validateStyleProfile(profile);
  if (!ok) throw new Error(`Ungültiges StyleProfile: ${errors.join('; ')}`);
  return profile;
}

// Inspizierbarer Vektor: eine Zahl/String pro STYLE_DIMENSIONS-Eintrag, in
// fester Reihenfolge. Kategoriale Dimensionen bleiben als String erhalten
// (nicht auf einen Index reduziert) — das macht den Vektor menschenlesbar
// und ist die Grundlage für Preference-Model, pair-selection und breeding.
export function toVector(profile) {
  return STYLE_DIMENSIONS.map((dim) => getPath(profile, dim.key));
}

export function fromVector(vector, id = 'from-vector', name = 'Von Vektor') {
  const profile = defaultStyleProfile(id, name);
  STYLE_DIMENSIONS.forEach((dim, i) => setPath(profile, dim.key, clampDimensionValue(dim, vector[i])));
  return profile;
}

export function styleProfilesEqualOnKeys(a, b, keys) {
  return keys.every((key) => getPath(a, key) === getPath(b, key));
}
