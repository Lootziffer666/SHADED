// Selbsttest für den Granular-Solver (runtime/solver/granular-grid.js).
// Deterministisch, keine Browser-/WebGL-Abhängigkeit -- gleiches Muster wie
// tools/test-style-discovery.mjs. Nutzung: node tools/test-granular-solver.mjs

import {
  MATERIAL, createGrid, cloneGrid, fillRandom, setCell, getCell,
  step, countMaterial, toRGBA, mulberry32,
} from '../runtime/solver/granular-grid.js';

let failures = 0;
function assert(cond, msg) {
  if (!cond) { console.error('✗ FAIL:', msg); failures++; }
  else console.log('✓ ok:', msg);
}

// --- 1. mulberry32 ist deterministisch -----------------------------------
{
  const a = mulberry32(42), b = mulberry32(42);
  const seqA = Array.from({ length: 5 }, () => a());
  const seqB = Array.from({ length: 5 }, () => b());
  assert(JSON.stringify(seqA) === JSON.stringify(seqB), 'mulberry32(42) liefert bei gleichem Seed dieselbe Folge');
  const c = mulberry32(43);
  const seqC = Array.from({ length: 5 }, () => c());
  assert(JSON.stringify(seqA) !== JSON.stringify(seqC), 'unterschiedliche Seeds liefern unterschiedliche Folgen');
}

// --- 2. fillRandom + step sind reproduzierbar bei gleichem Seed ----------
{
  const gridA = createGrid(24, 24);
  fillRandom(gridA, MATERIAL.SAND, 0.3, 7);
  const gridB = createGrid(24, 24);
  fillRandom(gridB, MATERIAL.SAND, 0.3, 7);
  assert(JSON.stringify(Array.from(gridA.cells)) === JSON.stringify(Array.from(gridB.cells)),
    'fillRandom(seed=7) erzeugt auf zwei frischen Grids identische Belegung');

  for (let i = 0; i < 20; i++) { step(gridA); step(gridB); }
  assert(JSON.stringify(Array.from(gridA.cells)) === JSON.stringify(Array.from(gridB.cells)),
    '20 identische step()-Aufrufe auf identischen Startzuständen bleiben bitidentisch');
}

// --- 3. Masse bleibt erhalten (reine Swaps, keine Erzeugung/Vernichtung) -
{
  const grid = createGrid(30, 30);
  fillRandom(grid, MATERIAL.SAND, 0.25, 1);
  fillRandom(grid, MATERIAL.WATER, 0.15, 2);
  const sandBefore = countMaterial(grid, MATERIAL.SAND);
  const waterBefore = countMaterial(grid, MATERIAL.WATER);
  for (let i = 0; i < 50; i++) step(grid);
  const sandAfter = countMaterial(grid, MATERIAL.SAND);
  const waterAfter = countMaterial(grid, MATERIAL.WATER);
  assert(sandBefore === sandAfter, `Sandmenge bleibt über 50 Schritte erhalten (${sandBefore} -> ${sandAfter})`);
  assert(waterBefore === waterAfter, `Wassermenge bleibt über 50 Schritte erhalten (${waterBefore} -> ${waterAfter})`);
}

// --- 4. Schwerkraft: Sand setzt sich tatsächlich am Boden ab --------------
{
  const grid = createGrid(20, 40);
  fillRandom(grid, MATERIAL.SAND, 0.4, 5);
  const bottomRowBefore = countRow(grid, grid.height - 1, MATERIAL.SAND);
  for (let i = 0; i < 300; i++) step(grid);
  const bottomRowAfter = countRow(grid, grid.height - 1, MATERIAL.SAND);
  const bottomThirdAfter = countRows(grid, grid.height - Math.floor(grid.height / 3), grid.height, MATERIAL.SAND);
  const totalSand = countMaterial(grid, MATERIAL.SAND);
  assert(bottomRowAfter > bottomRowBefore, `unterste Reihe hat nach 300 Schritten mehr Sand (${bottomRowBefore} -> ${bottomRowAfter})`);
  assert(bottomThirdAfter / totalSand > 0.6, `>60% des Sands liegt nach 300 Schritten im unteren Drittel (${bottomThirdAfter}/${totalSand} = ${(bottomThirdAfter / totalSand * 100).toFixed(1)}%)`);
}
function countRow(grid, y, material) {
  let n = 0; for (let x = 0; x < grid.width; x++) if (getCell(grid, x, y) === material) n++; return n;
}
function countRows(grid, y0, y1, material) {
  let n = 0; for (let y = y0; y < y1; y++) n += countRow(grid, y, material); return n;
}

// --- 5. Ränder sind Wand, kein Auslaufen aus dem Grid ----------------------
{
  const grid = createGrid(10, 10);
  assert(getCell(grid, -1, 0) === MATERIAL.WALL, 'negative x-Koordinate liefert WALL');
  assert(getCell(grid, 0, -1) === MATERIAL.WALL, 'negative y-Koordinate liefert WALL');
  assert(getCell(grid, grid.width, 0) === MATERIAL.WALL, 'x >= width liefert WALL');
  assert(getCell(grid, 0, grid.height) === MATERIAL.WALL, 'y >= height liefert WALL');
  fillRandom(grid, MATERIAL.WATER, 0.5, 9);
  const before = countMaterial(grid, MATERIAL.WATER);
  for (let i = 0; i < 100; i++) step(grid);
  const after = countMaterial(grid, MATERIAL.WATER);
  assert(before === after, `Wasser verschwindet nicht am Rand über 100 Schritte (${before} -> ${after})`);
}

// --- 6. setCell/getCell und cloneGrid sind konsistent ---------------------
{
  const grid = createGrid(5, 5);
  setCell(grid, 2, 2, MATERIAL.WALL);
  assert(getCell(grid, 2, 2) === MATERIAL.WALL, 'setCell/getCell rundtrip stimmt');
  const clone = cloneGrid(grid);
  clone.cells[0] = MATERIAL.SAND;
  assert(grid.cells[0] !== MATERIAL.SAND, 'cloneGrid() ist eine echte Kopie (kein geteilter Buffer)');
}

// --- 7. toRGBA liefert für jede Zelle 4 gültige Bytes ---------------------
{
  const grid = createGrid(4, 4);
  fillRandom(grid, MATERIAL.SAND, 1.0, 3);
  const rgba = toRGBA(grid);
  assert(rgba.length === grid.width * grid.height * 4, 'toRGBA() liefert width*height*4 Bytes');
  let allValid = true;
  for (let i = 0; i < rgba.length; i++) if (!(rgba[i] >= 0 && rgba[i] <= 255)) allValid = false;
  assert(allValid, 'alle RGBA-Bytes liegen in [0,255]');
}

// --- 8. Alle neuen Dateien parsen ------------------------------------------
{
  const { execSync } = await import('node:child_process');
  const path = await import('node:path');
  const { fileURLToPath } = await import('node:url');
  const REPO = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
  let allParse = true;
  for (const f of ['runtime/solver/granular-grid.js', 'tools/test-granular-solver.mjs']) {
    try { execSync(`node --check "${f}"`, { cwd: REPO, stdio: 'pipe' }); } catch { allParse = false; console.error('  Parsefehler in', f); }
  }
  assert(allParse, 'runtime/solver/ und dieses Testskript parsen mit node --check');
}

console.log(failures ? `\n❌ ${failures} Fehlschläge` : '\n✅ Alle Granular-Solver-Selbsttests bestanden');
process.exit(failures ? 1 : 0);
