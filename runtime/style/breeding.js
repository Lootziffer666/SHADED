// SHADED Style Discovery — breeding (renderer-unabhängiger Kern).
//
// breed(parentA, parentB, {mutationRate, dimensions}) komponiert ein Kind-
// StyleProfile per Dimension-Crossover und mutiert lokal, inspizierbar NUR
// die übergebenen (typischerweise unsichersten) Dimensionen — nicht das
// ganze Profil auf einmal.

import { STYLE_DIMENSIONS, dimensionByKey, defaultStyleProfile, getDimension, setDimension } from './style-profile.js';

export function breed(parentA, parentB, { mutationRate = 0.15, dimensions = [], rng = Math.random, id = 'bred' } = {}) {
  let child = defaultStyleProfile(id, id);
  for (const dim of STYLE_DIMENSIONS) {
    const chosen = rng() < 0.5 ? getDimension(parentA, dim.key) : getDimension(parentB, dim.key);
    child = setDimension(child, dim.key, chosen);
  }

  const mutable = dimensions.length ? dimensions : STYLE_DIMENSIONS.map((d) => d.key);
  for (const key of mutable) {
    if (rng() >= mutationRate) continue;
    const dim = dimensionByKey(key);
    const current = getDimension(child, key);
    let mutated;
    if (dim.kind === 'categorical') {
      const others = dim.options.filter((o) => o !== current);
      mutated = others.length ? others[Math.floor(rng() * others.length)] : current;
    } else {
      const half = (dim.max - dim.min) / 2;
      const jitter = (rng() * 2 - 1) * half * 0.3;
      mutated = current + jitter;
    }
    child = setDimension(child, key, mutated);
  }

  child.id = id;
  child.name = id;
  return child;
}
