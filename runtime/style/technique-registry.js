// SHADED Style Discovery — TechniqueRegistry (renderer-unabhängiger Kern).
//
// Lädt/validiert runtime/style/technique-registry.json (Form angelehnt an
// docs/research/operators.json, siehe CLAUDE.md-Vorgabe). Reines ESM: läuft
// per fetch() im Browser und per fs im Node-Test, ohne zwei Ladepfade zu
// duplizieren.

export const TECHNIQUE_REGISTRY_SCHEMA = 'shaded.style.technique-registry/v1';

const LICENSE_CLASSES = Object.freeze(['A', 'B', 'C', 'D']);
const USAGE_KINDS = Object.freeze(['algorithm-reference', 'research-only']);

export function validateTechniqueDescriptor(t) {
  const errors = [];
  if (!t.id) errors.push('id fehlt');
  if (!t.family) errors.push('family fehlt');
  if (!t.name) errors.push('name fehlt');
  if (!t.source || !t.source.name) errors.push('source.name fehlt');
  if (t.source && !LICENSE_CLASSES.includes(t.source.licenseClass)) errors.push(`ungültige licenseClass: ${t.source && t.source.licenseClass}`);
  if (t.source && !USAGE_KINDS.includes(t.source.usage)) errors.push(`ungültige usage: ${t.source && t.source.usage}`);
  // Lizenzklasse C/D darf nie als direkt übernommener/portierter Code auftreten
  // (Root-LICENSE ist all rights reserved — siehe docs/research/DONOR_LICENSES.md).
  if (t.source && ['C', 'D'].includes(t.source.licenseClass) && t.source.usage !== 'research-only' && t.source.usage !== 'algorithm-reference') {
    errors.push(`Lizenzklasse ${t.source.licenseClass} erlaubt keine usage '${t.source.usage}'`);
  }
  if (!Array.isArray(t.supportedBudgets) || t.supportedBudgets.length === 0) errors.push('supportedBudgets fehlt');
  return { ok: errors.length === 0, errors };
}

export function validateRegistry(list) {
  const errors = [];
  const ids = new Set();
  for (const t of list) {
    const { ok, errors: e } = validateTechniqueDescriptor(t);
    if (!ok) errors.push(`${t.id || '<ohne id>'}: ${e.join(', ')}`);
    if (t.id) {
      if (ids.has(t.id)) errors.push(`doppelte id: ${t.id}`);
      ids.add(t.id);
    }
  }
  return { ok: errors.length === 0, errors };
}

export function byFamily(list, family) {
  return list.filter((t) => t.family === family);
}

export function forBudget(list, tier) {
  return list.filter((t) => t.supportedBudgets.includes(tier));
}

export function provenanceOf(list, id) {
  const t = list.find((x) => x.id === id);
  return t ? t.source : null;
}

export function implementedOnly(list) {
  return list.filter((t) => !t.researchOnly);
}

export async function loadTechniqueRegistry(url) {
  const target = url || new URL('./technique-registry.json', import.meta.url);
  if (typeof fetch === 'function' && typeof window !== 'undefined') {
    const res = await fetch(target);
    if (!res.ok) throw new Error(`technique-registry.json konnte nicht geladen werden: ${res.status}`);
    return res.json();
  }
  const { readFileSync } = await import('node:fs');
  const { fileURLToPath } = await import('node:url');
  const path = target instanceof URL ? fileURLToPath(target) : target;
  return JSON.parse(readFileSync(path, 'utf8'));
}
