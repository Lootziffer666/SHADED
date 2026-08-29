// SHADED Style Discovery — WorldState (renderer-unabhängiger Kern).
//
// Reines ESM, kein DOM/WebGL, in Node importierbar (siehe CLAUDE.md-Vorgabe
// zur Style-Schicht). Baut auf den Feldnamen aus
// runtime/spatial-kernel/world-fields.js auf (moisture/water/ice/mud/fire/
// fuelMass/heat/smoke/soot), ist aber PRO OBJEKT ein Skalarwert statt eines
// Feld-Grids: die Sandbox hat keinen Solver, jeder Zustand ist eine manuell
// gesetzte Vorgabe. Deshalb trägt jedes Feld ein origin: 'manual' | 'solver' —
// ein manuell gesetzter Sandbox-Zustand wird NIE als Simulation ausgewiesen.

export const MaterialKind = Object.freeze({
  STONE: 'stone',
  WOOD: 'wood',
  METAL: 'metal',
  GLASS: 'glass',
  WATER: 'water',
  SKIN: 'skin',
  FIBER: 'fiber',       // fell-/federartig
  EMISSIVE: 'emissive', // Feuer/Eigenlicht
  SMOKE: 'smoke',       // Volumen
});

export const WORLD_STATE_SCHEMA = 'shaded.style.world-state/v1';

// Dieselben Feldnamen wie world-fields.js, ergänzt um sandboxspezifische
// Materialsemantik (crack, frost, snowCap, rust, damage), die
// deriveMaterialResponse() für den Bildkanon-artigen Stil-Input braucht.
const FIELD_DEFAULTS = Object.freeze({
  moisture: 0, water: 0, ice: 0, mud: 0,
  fire: 0, fuelMass: 0, heat: 0, smoke: 0, soot: 0,
  crack: 0, frost: 0, snowCap: 0, rust: 0, damage: 0,
});

export const WORLD_STATE_FIELD_NAMES = Object.freeze(Object.keys(FIELD_DEFAULTS));

function clamp01(v) {
  return Math.max(0, Math.min(1, Number.isFinite(v) ? v : 0));
}

export function createWorldState({ materialKind = MaterialKind.STONE, fields = {}, origin = 'manual', seed = 0 } = {}) {
  if (!Object.values(MaterialKind).includes(materialKind)) {
    throw new Error(`Unbekannter MaterialKind: ${materialKind}`);
  }
  const out = { schema: WORLD_STATE_SCHEMA, materialKind, seed, time: 0, fields: {} };
  for (const [name, def] of Object.entries(FIELD_DEFAULTS)) {
    const raw = fields[name];
    out.fields[name] = { value: clamp01(raw != null ? raw : def), origin };
  }
  return out;
}

// Neuer WorldState mit denselben Feldern, nur die in patch genannten Felder
// werden ersetzt (mit eigenem origin) — der Rest bleibt inkl. seines origin
// unverändert. Nie in-place mutieren.
export function mergeWorldState(base, patch = {}, origin = 'manual') {
  const out = { schema: base.schema, materialKind: base.materialKind, seed: base.seed, time: base.time, fields: {} };
  for (const [name, entry] of Object.entries(base.fields)) {
    if (Object.prototype.hasOwnProperty.call(patch, name)) {
      out.fields[name] = { value: clamp01(patch[name]), origin };
    } else {
      out.fields[name] = { value: entry.value, origin: entry.origin };
    }
  }
  return out;
}

export function fieldValue(worldState, name) {
  const entry = worldState.fields[name];
  return entry ? entry.value : 0;
}

export function isSimulated(worldState, name) {
  const entry = worldState.fields[name];
  return entry ? entry.origin === 'solver' : false;
}

// Vorgefertigte Sandbox-Weltzustände (docs: dry, wet, charred, damaged,
// frozen, snow). Bewusst manuell gesetzt — es gibt keinen echten Fluid-/CA-/
// Erosions-Solver in der Sandbox (Doku-Pflicht, siehe Aufgabenbeschreibung).
export const WORLD_STATE_PRESETS = Object.freeze({
  dry: {},
  wet: { moisture: 0.75, water: 0.55 },
  charred: { soot: 0.7, heat: 0.15, damage: 0.35 },
  damaged: { damage: 0.6, crack: 0.55 },
  frozen: { ice: 0.6, frost: 0.7, moisture: 0.2 },
  snow: { snowCap: 0.8, ice: 0.3, frost: 0.4 },
});

export const WORLD_STATE_PRESET_NAMES = Object.freeze(Object.keys(WORLD_STATE_PRESETS));

export function createPresetWorldState(materialKind, presetName, overrides = {}) {
  const preset = WORLD_STATE_PRESETS[presetName];
  if (!preset) throw new Error(`Unbekannter WorldState-Preset: ${presetName}`);
  return createWorldState({ materialKind, fields: { ...preset, ...overrides }, origin: 'manual' });
}

export function worldStatesEqual(a, b) {
  if (!a || !b) return a === b;
  if (a.materialKind !== b.materialKind || a.seed !== b.seed) return false;
  const namesA = Object.keys(a.fields), namesB = Object.keys(b.fields);
  if (namesA.length !== namesB.length) return false;
  for (const name of namesA) {
    const fa = a.fields[name], fb = b.fields[name];
    if (!fb || fa.value !== fb.value || fa.origin !== fb.origin) return false;
  }
  return true;
}

export function cloneWorldState(worldState) {
  const fields = {};
  for (const [name, entry] of Object.entries(worldState.fields)) fields[name] = { ...entry };
  return { schema: worldState.schema, materialKind: worldState.materialKind, seed: worldState.seed, time: worldState.time, fields };
}
