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
// slice now covers falling solids, a spreading liquid, a rising/decaying
// gas, and one reaction (fire ignites adjacent wood) -- still a fraction
// of js1k_powder_game's vocabulary, extended the same way: add a MATERIAL,
// teach densityFalls/densityRises/isFluid about it, add a reaction() rule
// if it needs one. Never fork a second grid representation.

export const MATERIAL = Object.freeze({
  EMPTY: 0, SAND: 1, WATER: 2, WALL: 3, WOOD: 4, FIRE: 5, SMOKE: 6,
});

export const MATERIAL_NAMES = Object.freeze({
  [MATERIAL.EMPTY]: 'empty', [MATERIAL.SAND]: 'sand', [MATERIAL.WATER]: 'water',
  [MATERIAL.WALL]: 'wall', [MATERIAL.WOOD]: 'wood', [MATERIAL.FIRE]: 'fire', [MATERIAL.SMOKE]: 'smoke',
});

// Wie lange (in Schritten) eine Feuer- bzw. Rauchzelle lebt, bevor sie
// weiterzerfällt. Über age[] getrackt, nicht über mehrere Material-IDs pro
// Alterstufe -- das hielte den MATERIAL-Enum klein und die Farb-/Malbar-
// keits-Logik einfach.
const FIRE_LIFETIME = 14;
const SMOKE_LIFETIME = 40;
const IGNITE_CHANCE = 0.10;

export function createGrid(width, height) {
  const n = width * height;
  return { width, height, cells: new Uint8Array(n), age: new Uint8Array(n), step: 0 };
}

export function cloneGrid(grid) {
  return { width: grid.width, height: grid.height, cells: grid.cells.slice(), age: grid.age.slice(), step: grid.step };
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

// Billiger deterministischer Hash für Reaktionswürfe, an (step, cellIndex)
// gebunden -- reproduzierbar wie mulberry32, aber ohne pro Zelle/Schritt ein
// Generator-Objekt anzulegen (das Grid hat bis zu ~10k Zellen pro Schritt).
function cellRandom01(step, index) {
  let h = (step * 374761393 + index * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h = h ^ (h >>> 16);
  return ((h >>> 0) % 100000) / 100000;
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
  const i = y * grid.width + x;
  grid.cells[i] = material;
  grid.age[i] = 0;
  return grid;
}

export function getCell(grid, x, y) {
  if (x < 0 || x >= grid.width || y < 0 || y >= grid.height) return MATERIAL.WALL; // Rand = Wand
  return grid.cells[y * grid.width + x];
}

const STATIC = new Set([MATERIAL.WALL, MATERIAL.WOOD]); // fallen/steigen nie von selbst
const FLUID = new Set([MATERIAL.WATER, MATERIAL.SMOKE]); // weichen seitlich aus, wenn oben/unten blockiert

// a fällt auf/verdrängt b, wenn a dichter ist als b (Sand > Wasser > Leer).
function densityFalls(a, b) {
  if (STATIC.has(a)) return false;
  if (a === MATERIAL.SAND && (b === MATERIAL.EMPTY || b === MATERIAL.WATER)) return true;
  if (a === MATERIAL.WATER && b === MATERIAL.EMPTY) return true;
  return false;
}

// a steigt in b (über sich) auf, wenn a leichter als Luft/b ist -- nur
// Rauch, NICHT Feuer. Erster Entwurf ließ auch Feuer aufsteigen wie Rauch;
// das trieb die Flamme sofort vom Brennstoff weg, noch bevor die
// Zündreaktion überhaupt eine Chance hatte (siehe Test 9 in
// tools/test-granular-solver.mjs, das den Fehler tatsächlich aufgedeckt
// hat). Feuer klebt jetzt an seinem Brennstoff, wie eine echte Flamme --
// nur der Rauch, den es erzeugt, steigt frei auf. Das Gegenstück zu
// densityFalls, nicht dieselbe Funktion mit getauschten Argumenten, weil
// "leichter als" keine reine Umkehr von "dichter als" ist.
function densityRises(a, b) {
  if (a === MATERIAL.SMOKE && b === MATERIAL.EMPTY) return true;
  return false;
}

function verticalPairNext(top, bottom) {
  if (densityFalls(top, bottom)) return [bottom, top];
  if (densityRises(bottom, top)) return [bottom, top]; // top ist hier per Definition EMPTY
  return [top, bottom];
}

const OFFSET_PHASES = Object.freeze([[0, 0], [1, 0], [0, 1], [1, 1]]); // Margolus, Z-förmiger Vier-Schritt-Zyklus

function swapBlock(grid, next, nextAge, x0, y0) {
  const a = getCell(grid, x0, y0), b = getCell(grid, x0 + 1, y0);
  const c = getCell(grid, x0, y0 + 1), d = getCell(grid, x0 + 1, y0 + 1);
  let [a2, c2] = verticalPairNext(a, c);
  let [b2, d2] = verticalPairNext(b, d);
  // Fluide weichen seitlich aus, wenn ihre bevorzugte Richtung (Wasser: nach
  // unten, Rauch: nach oben) blockiert ist -- Sand/Feuer/Wand/Holz tun das nicht.
  if (c2 !== MATERIAL.EMPTY && FLUID.has(a2) && d2 === MATERIAL.EMPTY) { const t = a2; a2 = d2; d2 = t; }
  if (d2 !== MATERIAL.EMPTY && FLUID.has(b2) && c2 === MATERIAL.EMPTY) { const t = b2; b2 = c2; c2 = t; }
  writeIfInBounds(grid, next, nextAge, x0, y0, a2, a2 === a ? undefined : 0);
  writeIfInBounds(grid, next, nextAge, x0 + 1, y0, b2, b2 === b ? undefined : 0);
  writeIfInBounds(grid, next, nextAge, x0, y0 + 1, c2, c2 === c ? undefined : 0);
  writeIfInBounds(grid, next, nextAge, x0 + 1, y0 + 1, d2, d2 === d ? undefined : 0);
}

function writeIfInBounds(grid, next, nextAge, x, y, value, ageOverride) {
  if (x < 0 || x >= grid.width || y < 0 || y >= grid.height) return; // Rand ist Wand, nichts zu schreiben
  const i = y * grid.width + x;
  next[i] = value;
  // Alter bleibt bei reiner Bewegung an der Zelle "kleben" (sie trägt ihr
  // Alter mit um), nur ein echter Materialwechsel setzt es zurück.
  nextAge[i] = ageOverride === undefined ? grid.age[i] : ageOverride;
}

// Reaktionen: eine zweite, materialverändernde Runde NACH der Bewegung,
// gelesen aus dem (bereits bewegten) grid.cells, geschrieben in einen
// frischen Puffer -- gleiches Doppelpuffer-Prinzip wie step(), aber ohne
// Block-Partitionierung, weil hier nur die eigene Zelle plus ihre vier
// Nachbarn gelesen werden (das ist von Natur aus racefrei).
function reactions(grid) {
  const nextCells = grid.cells.slice();
  const nextAge = grid.age.slice();
  const w = grid.width, h = grid.height;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const m = grid.cells[i];
      if (m === MATERIAL.FIRE) {
        const age = grid.age[i] + 1;
        if (age >= FIRE_LIFETIME) { nextCells[i] = MATERIAL.SMOKE; nextAge[i] = 0; }
        else nextAge[i] = age;
      } else if (m === MATERIAL.SMOKE) {
        const age = grid.age[i] + 1;
        if (age >= SMOKE_LIFETIME) { nextCells[i] = MATERIAL.EMPTY; nextAge[i] = 0; }
        else nextAge[i] = age;
      } else if (m === MATERIAL.WOOD) {
        const nFire = getCell(grid, x - 1, y) === MATERIAL.FIRE || getCell(grid, x + 1, y) === MATERIAL.FIRE
          || getCell(grid, x, y - 1) === MATERIAL.FIRE || getCell(grid, x, y + 1) === MATERIAL.FIRE;
        if (nFire && cellRandom01(grid.step, i) < IGNITE_CHANCE) { nextCells[i] = MATERIAL.FIRE; nextAge[i] = 0; }
      }
    }
  }
  grid.cells = nextCells;
  grid.age = nextAge;
}

// Ein Generationsschritt: erst Bewegung (racefreie Block-Swaps), dann
// Reaktionen (Zünden/Altern/Zerfall). Liest Bewegung ausschließlich aus
// grid.cells, schreibt ausschließlich in eine frische Kopie -- kein Block
// sieht je den Zwischenzustand eines anderen Blocks derselben Generation.
export function step(grid) {
  const [ox, oy] = OFFSET_PHASES[grid.step % OFFSET_PHASES.length];
  const next = grid.cells.slice();
  const nextAge = grid.age.slice();
  for (let by = -1; by < grid.height; by += 2) {
    for (let bx = -1; bx < grid.width; bx += 2) {
      swapBlock(grid, next, nextAge, bx + ox, by + oy);
    }
  }
  grid.cells = next;
  grid.age = nextAge;
  reactions(grid);
  grid.step++;
  return grid;
}

export function countMaterial(grid, material) {
  let n = 0;
  for (let i = 0; i < grid.cells.length; i++) if (grid.cells[i] === material) n++;
  return n;
}

// Alle Zellen zu RGBA-Bytes -- die dünne Renderer-Schicht (solver-lab/)
// liest nur dies, kennt keine Solver-Logik.
export const MATERIAL_COLOR = Object.freeze({
  [MATERIAL.EMPTY]: [8, 10, 18, 255],
  [MATERIAL.SAND]: [214, 178, 107, 255],
  [MATERIAL.WATER]: [45, 110, 200, 200],
  [MATERIAL.WALL]: [60, 60, 68, 255],
  [MATERIAL.WOOD]: [110, 72, 38, 255],
  [MATERIAL.FIRE]: [235, 120, 30, 255],
  [MATERIAL.SMOKE]: [120, 118, 112, 160],
});

export function toRGBA(grid) {
  const out = new Uint8ClampedArray(grid.width * grid.height * 4);
  for (let i = 0; i < grid.cells.length; i++) {
    const [r, g, b, a] = MATERIAL_COLOR[grid.cells[i]];
    out[i * 4] = r; out[i * 4 + 1] = g; out[i * 4 + 2] = b; out[i * 4 + 3] = a;
  }
  return out;
}
