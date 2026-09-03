// SHADED Solver Lab — Granular cellular solver (renderer-independent core).
//
// First vertical slice of the "Missing SHADED labs" Granular/Erosion track
// (docs/sandbox-element-donor-matrix.md, P0 #1). Same architectural rule as
// runtime/style/: WORLD STATE (the grid) -> SOLVER (step()) -> RENDERER
// (solver-lab/granular/, thin, visuals never become authoritative state).
// This module has no DOM/WebGL dependency and is Node-testable, exactly
// like runtime/style/material-response.js.
//
// Algorithm: block cellular automaton with Margolus-style offsets, per
// docs/sandbox-element-donor-matrix.md's "Granular algorithm target":
// non-overlapping 2x2 blocks avoid write races, and the block partition
// cycles through four offset phases (GelamiSalami/GPU-Falling-Sand-CA's
// "four-step Z-shaped shift" -- no reusable license found in that repo's
// root, technique only; independently implemented here, no code copied;
// see docs/sandbox-element-license-audit.md) so particles are never locked
// to one partition. Whole cells are swapped, never written individually
// mid-block, which is what makes the block-parallel update race-safe.
//
// Materials and the eventual reaction count are informed by
// Qqwy/js1k_powder_game (no license found, technique only) -- a real 2D
// falling-sand chemistry sandbox with 11 elements and 50+ reactions. This
// slice implements a small subset (empty/sand/water/wall) to prove the
// WorldState -> Solver -> Renderer chain; more materials extend MATERIAL
// and the reaction rules below, never fork a second grid representation.

export const MATERIAL = Object.freeze({ EMPTY: 0, SAND: 1, WATER: 2, WALL: 3 });

export const MATERIAL_NAMES = Object.freeze({
  [MATERIAL.EMPTY]: 'empty', [MATERIAL.SAND]: 'sand', [MATERIAL.WATER]: 'water', [MATERIAL.WALL]: 'wall',
});

export function createGrid(width, height) {
  return { width, height, cells: new Uint8Array(width * height), step: 0 };
}

export function cloneGrid(grid) {
  return { width: grid.width, height: grid.height, cells: grid.cells.slice(), step: grid.step };
}

// Deterministic PRNG (mulberry32) -- same seed always produces the same
// sequence. Required so verify fixtures are reproducible, same discipline
// as PSYCHOPATH's genesis-seed discussion and the Style Sandbox's seeded
// noise, not because either directly informed this.
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function rng() {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function fillRandom(grid, material, density, seed) {
  const rng = mulberry32(seed);
  for (let i = 0; i < grid.cells.length; i++) {
    if (grid.cells[i] === MATERIAL.EMPTY && rng() < density) grid.cells[i] = material;
  }
  return grid;
}

export function setCell(grid, x, y, material) {
  if (x < 0 || x >= grid.width || y < 0 || y >= grid.height) return grid;
  grid.cells[y * grid.width + x] = material;
  return grid;
}

export function getCell(grid, x, y) {
  if (x < 0 || x >= grid.width || y < 0 || y >= grid.height) return MATERIAL.WALL; // Rand = Wand
  return grid.cells[y * grid.width + x];
}

// a fällt auf/verdrängt b, wenn a dichter ist als b (einfache Dichteordnung:
// Sand > Wasser > Leer). Erweiterung um weitere Materialien braucht nur
// diese eine Funktion, nicht den Solver selbst.
function densityFalls(a, b) {
  if (a === MATERIAL.SAND && (b === MATERIAL.EMPTY || b === MATERIAL.WATER)) return true;
  if (a === MATERIAL.WATER && b === MATERIAL.EMPTY) return true;
  return false;
}

const OFFSET_PHASES = Object.freeze([[0, 0], [1, 0], [0, 1], [1, 1]]); // Margolus, Z-förmiger Vier-Schritt-Zyklus

function swapBlock(grid, next, x0, y0) {
  const a = getCell(grid, x0, y0), b = getCell(grid, x0 + 1, y0);
  const c = getCell(grid, x0, y0 + 1), d = getCell(grid, x0 + 1, y0 + 1);
  let a2 = a, b2 = b, c2 = c, d2 = d;
  // Schwerkraft: obere Zelle fällt in untere Zelle derselben Spalte, wenn dichter.
  if (densityFalls(a, c)) { a2 = c; c2 = a; }
  if (densityFalls(b, d)) { b2 = d; d2 = b; }
  // Wasser weicht seitlich aus, wenn direkt darunter blockiert ist (Sand tut das nicht).
  if (c2 !== MATERIAL.EMPTY && a2 === MATERIAL.WATER && d2 === MATERIAL.EMPTY) { const t = a2; a2 = d2; d2 = t; }
  if (d2 !== MATERIAL.EMPTY && b2 === MATERIAL.WATER && c2 === MATERIAL.EMPTY) { const t = b2; b2 = c2; c2 = t; }
  writeIfInBounds(grid, next, x0, y0, a2);
  writeIfInBounds(grid, next, x0 + 1, y0, b2);
  writeIfInBounds(grid, next, x0, y0 + 1, c2);
  writeIfInBounds(grid, next, x0 + 1, y0 + 1, d2);
}

function writeIfInBounds(grid, next, x, y, value) {
  if (x < 0 || x >= grid.width || y < 0 || y >= grid.height) return; // Rand ist Wand, nichts zu schreiben
  next[y * grid.width + x] = value;
}

// Ein Generationsschritt. Liest ausschließlich aus grid.cells, schreibt
// ausschließlich in eine frische Kopie -- kein Block sieht je den
// Zwischenzustand eines anderen Blocks derselben Generation (race-safe).
export function step(grid) {
  const [ox, oy] = OFFSET_PHASES[grid.step % OFFSET_PHASES.length];
  const next = grid.cells.slice();
  for (let by = -1; by < grid.height; by += 2) {
    for (let bx = -1; bx < grid.width; bx += 2) {
      swapBlock(grid, next, bx + ox, by + oy);
    }
  }
  grid.cells = next;
  grid.step++;
  return grid;
}

export function countMaterial(grid, material) {
  let n = 0;
  for (let i = 0; i < grid.cells.length; i++) if (grid.cells[i] === material) n++;
  return n;
}

// Alle Nicht-Wand-Zellen zu Data-URL-tauglichen RGBA-Bytes -- die dünne
// Renderer-Schicht (solver-lab/) liest nur dies, kennt keine Solver-Logik.
export const MATERIAL_COLOR = Object.freeze({
  [MATERIAL.EMPTY]: [8, 10, 18, 255],
  [MATERIAL.SAND]: [214, 178, 107, 255],
  [MATERIAL.WATER]: [45, 110, 200, 200],
  [MATERIAL.WALL]: [60, 60, 68, 255],
});

export function toRGBA(grid) {
  const out = new Uint8ClampedArray(grid.width * grid.height * 4);
  for (let i = 0; i < grid.cells.length; i++) {
    const [r, g, b, a] = MATERIAL_COLOR[grid.cells[i]];
    out[i * 4] = r; out[i * 4 + 1] = g; out[i * 4 + 2] = b; out[i * 4 + 3] = a;
  }
  return out;
}
