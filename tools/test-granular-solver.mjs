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

// --- 8. Rauch steigt auf (Gegenstück zur Schwerkraft) ----------------------
{
  const grid = createGrid(10, 30);
  setCell(grid, 5, 25, MATERIAL.SMOKE);
  for (let i = 0; i < 60; i++) step(grid);
  let smokeY = -1;
  for (let y = 0; y < grid.height; y++) for (let x = 0; x < grid.width; x++) if (getCell(grid, x, y) === MATERIAL.SMOKE) smokeY = y;
  assert(smokeY !== -1 && smokeY < 20, `einzelne Rauchzelle steigt nach 60 Schritten sichtbar auf (Start y=25, jetzt y=${smokeY})`);
}

// --- 9. Feuer zündet angrenzendes Holz, altert zu Rauch, Rauch zerfällt ---
{
  const grid = createGrid(20, 20);
  for (let y = 5; y < 15; y++) setCell(grid, 10, y, MATERIAL.WOOD); // eine Holzsäule
  setCell(grid, 10, 5, MATERIAL.FIRE); // oben angezündet
  const woodBefore = countMaterial(grid, MATERIAL.WOOD);
  let sawFire = false, sawSmoke = false;
  for (let i = 0; i < 40; i++) {
    step(grid);
    if (countMaterial(grid, MATERIAL.FIRE) > 0) sawFire = true;
    if (countMaterial(grid, MATERIAL.SMOKE) > 0) sawSmoke = true;
  }
  const woodAfter = countMaterial(grid, MATERIAL.WOOD);
  assert(woodAfter < woodBefore, `Feuer verzehrt angrenzendes Holz (${woodBefore} -> ${woodAfter} Holzzellen nach 40 Schritten)`);
  assert(sawFire, 'Feuer war zwischenzeitlich sichtbar (Zündung hat stattgefunden)');
  assert(sawSmoke, 'gealtertes Feuer wurde zu Rauch (FIRE_LIFETIME griff)');

  // Ohne Brennstoff und genug Zeit zerfällt aller Rauch zu EMPTY.
  for (let i = 0; i < 200; i++) step(grid);
  assert(countMaterial(grid, MATERIAL.FIRE) === 0, 'kein Feuer mehr übrig, sobald das Holz aufgebraucht ist');
  assert(countMaterial(grid, MATERIAL.SMOKE) === 0, 'aller Rauch ist nach ausreichend Schritten zu EMPTY zerfallen (SMOKE_LIFETIME griff)');
}

// --- 10. Reaktionen bleiben deterministisch bei gleichem Seed --------------
{
  function runFireSim(seed) {
    const grid = createGrid(16, 16);
    fillRandom(grid, MATERIAL.WOOD, 0.3, seed);
    setCell(grid, 8, 8, MATERIAL.FIRE);
    for (let i = 0; i < 25; i++) step(grid);
    return Array.from(grid.cells).join(',');
  }
  assert(runFireSim(11) === runFireSim(11), 'identischer Seed erzeugt nach 25 Schritten mit Zündungen bitidentischen Endzustand');
}

// --- 11. Holz fällt/steigt nie von selbst (ohne Feuer in der Nähe) --------
{
  const grid = createGrid(10, 10);
  setCell(grid, 3, 3, MATERIAL.WOOD);
  for (let i = 0; i < 30; i++) step(grid);
  assert(getCell(grid, 3, 3) === MATERIAL.WOOD, 'freischwebendes Holz bleibt nach 30 Schritten exakt an seiner Startposition');
  assert(countMaterial(grid, MATERIAL.WOOD) === 1, 'und es entsteht kein zweites Holz irgendwo sonst im Grid');
}

// --- 12. Eis schmilzt neben Feuer zu Wasser --------------------------------
{
  const grid = createGrid(10, 10);
  setCell(grid, 5, 5, MATERIAL.ICE);
  setCell(grid, 5, 4, MATERIAL.FIRE);
  let sawWater = false;
  for (let i = 0; i < 40; i++) { step(grid); if (countMaterial(grid, MATERIAL.WATER) > 0) sawWater = true; }
  assert(sawWater, 'Eis neben Feuer wird innerhalb von 40 Schritten zu Wasser (MELT_CHANCE griff irgendwann)');
}

// --- 13. Wasser kocht neben Feuer zu Dampf, Dampf zerfällt zu EMPTY -------
{
  // Ohne Boden fällt das Wasser unter Schwerkraft sofort vom Feuer weg
  // (dieselbe Fallklasse Fehler wie beim Feuer/Holz-Test zuvor) -- eine
  // Wand darunter hält es als "Wasserpfütze über der Flamme" an Ort und
  // Stelle. Ein einzelnes Wasser/Feuer-Paar reichte hier NICHT als Test:
  // EXTINGUISH_CHANCE (20%/Schritt) und BOIL_CHANCE (12%/Schritt) laufen
  // gegeneinander, und ein einzelnes Feuer kann durchs Löschen schon nach
  // 5-6 Schritten verschwinden, bevor Kochen überhaupt oft genug würfeln
  // durfte -- bei einem einzigen deterministischen Seed reiner Zufall, ob
  // das trifft. Mehrere unabhängige Paare machen den Test robust, ohne die
  // Chance künstlich hochzudrehen.
  const grid = createGrid(40, 20);
  for (let p = 0; p < 6; p++) {
    const x = 3 + p * 6;
    setCell(grid, x - 1, 16, MATERIAL.WALL); setCell(grid, x, 16, MATERIAL.WALL); setCell(grid, x + 1, 16, MATERIAL.WALL);
    setCell(grid, x, 15, MATERIAL.WATER);
    setCell(grid, x, 14, MATERIAL.FIRE);
  }
  let sawSteam = false;
  for (let i = 0; i < 40; i++) { step(grid); if (countMaterial(grid, MATERIAL.STEAM) > 0) sawSteam = true; }
  assert(sawSteam, 'mindestens eines von 6 Wasser/Feuer-Paaren wird innerhalb von 40 Schritten zu Dampf (BOIL_CHANCE griff irgendwann)');
  for (let i = 0; i < 60; i++) step(grid);
  assert(countMaterial(grid, MATERIAL.STEAM) === 0, 'aller Dampf ist nach ausreichend Schritten zu EMPTY zerfallen (STEAM_LIFETIME griff)');
}

// --- 14. Dampf steigt auf wie Rauch ----------------------------------------
{
  const grid = createGrid(10, 30);
  setCell(grid, 5, 25, MATERIAL.STEAM);
  for (let i = 0; i < 15; i++) step(grid);
  let steamY = -1;
  for (let y = 0; y < grid.height; y++) for (let x = 0; x < grid.width; x++) if (getCell(grid, x, y) === MATERIAL.STEAM) steamY = y;
  assert(steamY !== -1 && steamY < 25, `einzelne Dampfzelle steigt nach 15 Schritten sichtbar auf (Start y=25, jetzt y=${steamY})`);
}

// --- 15. Eis fällt/steigt nie von selbst -----------------------------------
{
  const grid = createGrid(10, 10);
  setCell(grid, 3, 3, MATERIAL.ICE);
  for (let i = 0; i < 30; i++) step(grid);
  assert(getCell(grid, 3, 3) === MATERIAL.ICE, 'freischwebendes Eis ohne Feuer in der Nähe bleibt an Ort und Stelle');
}

// --- 17. LOG faellt durch Luft und schwimmt auf der Wasseroberflaeche ------
{
  const grid = createGrid(10, 20);
  for (let x = 0; x < grid.width; x++) {
    setCell(grid, x, 15, MATERIAL.WALL);
    for (let y = 10; y < 15; y++) setCell(grid, x, y, MATERIAL.WATER); // ein Wasserbecken
  }
  setCell(grid, 5, 2, MATERIAL.LOG); // fallen gelassen weit ueber dem Becken
  for (let i = 0; i < 80; i++) step(grid);
  let logY = -1;
  for (let y = 0; y < grid.height; y++) for (let x = 0; x < grid.width; x++) if (getCell(grid, x, y) === MATERIAL.LOG) logY = y;
  assert(logY !== -1, 'der Baumstamm existiert nach 80 Schritten noch (nicht spurlos verschwunden)');
  assert(logY <= 10, `der Stamm sinkt nicht unter die Wasseroberflaeche (Becken beginnt bei y=10, Stamm liegt jetzt bei y=${logY})`);
  assert(logY > 2, `der Stamm ist tatsaechlich gefallen, statt in der Luft haengen zu bleiben (Start y=2, jetzt y=${logY})`);
}

// --- 18. Ein untergetauchter LOG treibt zurueck an die Oberflaeche ---------
{
  const grid = createGrid(10, 20);
  for (let x = 0; x < grid.width; x++) {
    setCell(grid, x, 15, MATERIAL.WALL);
    for (let y = 8; y < 15; y++) setCell(grid, x, y, MATERIAL.WATER);
  }
  setCell(grid, 5, 13, MATERIAL.LOG); // tief im Becken versenkt
  for (let i = 0; i < 60; i++) step(grid);
  let logY = -1;
  for (let y = 0; y < grid.height; y++) for (let x = 0; x < grid.width; x++) if (getCell(grid, x, y) === MATERIAL.LOG) logY = y;
  assert(logY !== -1 && logY < 13, `der versenkte Stamm treibt nach 60 Schritten sichtbar nach oben (Start y=13, jetzt y=${logY})`);
}

// --- 19. LOG zuendet wie WOOD, wenn Feuer angrenzt --------------------------
{
  // Ein einzelnes Paar ist bei IGNITE_CHANCE=0.10/Schritt kein robuster
  // Test (10% Fehlwurf-Wahrscheinlichkeit pro Schritt macht "0 von 30
  // Wuerfen trifft" bei ~4% nicht vernachlaessigbar, und cellRandom01 ist
  // deterministisch an die Zellposition gebunden -- kein Seed rettet einen
  // ungluecklichen Index) -- gleiches Robustheits-Argument wie Test 13/20.
  // Anders als SAND (das nach dem Fallen liegen bleibt) faellt ein LOG ohne
  // Unterlage sofort von der stationaeren Flamme weg (Test 17 zeigt genau
  // das) -- eine WALL darunter haelt es an Ort und Stelle, exakt wie
  // Test 13's "Wasserpfuetze ueber der Flamme" Begruendung.
  const grid = createGrid(40, 10);
  for (let p = 0; p < 6; p++) {
    const x = 3 + p * 6;
    setCell(grid, x, 6, MATERIAL.WALL);
    setCell(grid, x, 5, MATERIAL.LOG);
    setCell(grid, x, 4, MATERIAL.FIRE);
  }
  let sawLogFire = false;
  for (let i = 0; i < 30; i++) {
    step(grid);
    for (let p = 0; p < 6; p++) if (getCell(grid, 3 + p * 6, 5) === MATERIAL.FIRE) sawLogFire = true;
  }
  assert(sawLogFire, 'mindestens einer von 6 LOG/Feuer-Paaren faengt innerhalb von 30 Schritten selbst Feuer (IGNITE_CHANCE griff)');
}

// --- 20. Feuer wird durch angrenzenden Sand erstickt ------------------------
{
  // Gleiches Robustheits-Argument wie Test 13 (Wasser kocht zu Dampf):
  // mehrere unabhaengige Paare statt eines einzelnen Wuerfelwurfs.
  const grid = createGrid(40, 10);
  for (let p = 0; p < 6; p++) {
    const x = 3 + p * 6;
    setCell(grid, x, 5, MATERIAL.SAND);
    setCell(grid, x, 4, MATERIAL.FIRE);
  }
  let sawSmothered = false;
  for (let i = 0; i < 20; i++) {
    step(grid);
    if (countMaterial(grid, MATERIAL.FIRE) < 6) sawSmothered = true;
  }
  assert(sawSmothered, 'mindestens eines von 6 Sand/Feuer-Paaren erstickt innerhalb von 20 Schritten (SMOTHER_CHANCE griff, weit vor FIRE_LIFETIME=14 waere das sonst Zufall)');
  const sandBefore = countMaterial(grid, MATERIAL.SAND);
  for (let i = 0; i < 40; i++) step(grid);
  assert(countMaterial(grid, MATERIAL.SAND) === sandBefore, 'der erstickende Sand selbst wird beim Ersticken nicht verbraucht');
}

// --- 21. Ein brennender Baumstamm im Wasser erlischt ------------------------
{
  // Die vollstaendige "brennenden Holzscheit ins Wasser werfen"-Szene:
  // ein LOG treibt auf einem Becken, faengt Feuer, und das angrenzende
  // Wasser loescht es -- reine Komposition der bereits einzeln getesteten
  // Regeln (17/19 + die bestehende Wasser-loescht-Feuer-Reaktion), hier als
  // Integrationsbeweis, dass sie tatsaechlich zusammenspielen.
  const grid = createGrid(12, 20);
  for (let x = 0; x < grid.width; x++) {
    setCell(grid, x, 15, MATERIAL.WALL);
    for (let y = 10; y < 15; y++) setCell(grid, x, y, MATERIAL.WATER);
  }
  setCell(grid, 6, 9, MATERIAL.LOG); // liegt auf der Oberflaeche
  setCell(grid, 6, 8, MATERIAL.FIRE); // von oben angezuendet
  let sawFireOnLog = false, sawExtinguished = false;
  for (let i = 0; i < 60; i++) {
    step(grid);
    if (getCell(grid, 6, 9) === MATERIAL.FIRE) sawFireOnLog = true;
    if (sawFireOnLog && countMaterial(grid, MATERIAL.FIRE) === 0) sawExtinguished = true;
  }
  assert(sawFireOnLog, 'der schwimmende Stamm faengt Feuer');
  assert(sawExtinguished, 'das Feuer auf dem Stamm erlischt innerhalb von 60 Schritten, weil Wasser direkt angrenzt');
}

// --- 22. Alle neuen Dateien parsen ------------------------------------------
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
