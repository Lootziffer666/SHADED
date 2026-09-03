// SHADED Style Discovery — Candidate (renderer-unabhängiger Kern).
//
// Ein Kandidat = {id, seed, profile, worldStateId, budget, sceneVersion}.
// fromSeed(seed) ist deterministisch (mulberry32) — derselbe Seed liefert
// bitidentisch dasselbe StyleProfile, reproduzierbar über serialize()/hash().

import { mulberry32 } from './rng.js';
import { STYLE_DIMENSIONS, fromVector } from './style-profile.js';

export const CANDIDATE_SCHEMA = 'shaded.style.candidate/v1';

export function styleProfileFromSeed(seed, id, name) {
  const rng = mulberry32(seed >>> 0);
  const vector = STYLE_DIMENSIONS.map((dim) => {
    if (dim.kind === 'categorical') {
      const idx = Math.min(dim.options.length - 1, Math.floor(rng() * dim.options.length));
      return dim.options[idx];
    }
    let v = dim.min + rng() * (dim.max - dim.min);
    if (dim.step) v = Math.round(v / dim.step) * dim.step;
    return Math.max(dim.min, Math.min(dim.max, v));
  });
  return fromVector(vector, id, name);
}

export function fromSeed(seed, { worldStatePreset = 'dry', materialKind = 'stone', budget = 'FULL', sceneVersion = '1.1.0', id } = {}) {
  const seedInt = seed >>> 0;
  const candidateId = id || `cand-${seedInt}`;
  const profile = styleProfileFromSeed(seedInt, candidateId, candidateId);
  return {
    schema: CANDIDATE_SCHEMA,
    id: candidateId,
    seed: seedInt,
    profile,
    worldStateId: `${materialKind}:${worldStatePreset}`,
    budget,
    sceneVersion,
  };
}

export function serialize(candidate) {
  return JSON.stringify(candidate);
}

export function deserialize(json) {
  return typeof json === 'string' ? JSON.parse(json) : JSON.parse(JSON.stringify(json));
}

// Kleiner, schneller FNV-1a-Hash über die serialisierte Form — genügt für
// Reproduzierbarkeits- und Frame-Vergleichstests, kein kryptografischer Hash.
export function hash(candidate) {
  const s = serialize(candidate);
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return (h >>> 0).toString(16);
}
