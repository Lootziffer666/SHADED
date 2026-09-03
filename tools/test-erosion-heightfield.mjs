// Selbsttest für den Erosions-Solver (runtime/solver/erosion-heightfield.js).
// Deterministisch, keine Browser-/WebGL-Abhängigkeit. Gleiches Muster wie
// tools/test-granular-solver.mjs. Nutzung: node tools/test-erosion-heightfield.mjs

import {
  createHeightfield, cloneHeightfield, generateHills, totalMass,
  erode, simulateDroplet, toGrayscaleRGBA, mulberry32, DEFAULT_EROSION_PARAMS,
} from '../runtime/solver/erosion-heightfield.js';

let failures = 0;
function assert(cond, msg) {
  if (!cond) { console.error('✗ FAIL:', msg); failures++; }
  else console.log('✓ ok:', msg);
}

// --- 1. generateHills ist deterministisch bei gleichem Seed --------------
{
  const a = generateHills(createHeightfield(40, 40), 5);
  const b = generateHills(createHeightfield(40, 40), 5);
  assert(JSON.stringify(Array.from(a.heights)) === JSON.stringify(Array.from(b.heights)),
    'generateHills(seed=5) erzeugt zweimal identisches Terrain');
  const c = generateHills(createHeightfield(40, 40), 6);
  assert(JSON.stringify(Array.from(a.heights)) !== JSON.stringify(Array.from(c.heights)),
    'unterschiedliche Seeds erzeugen unterschiedliches Terrain');
}

// --- 2. erode() ist deterministisch bei gleichem Seed ---------------------
{
  const fieldA = generateHills(createHeightfield(60, 60), 3);
  const fieldB = generateHills(createHeightfield(60, 60), 3);
  erode(fieldA, 200, 11);
  erode(fieldB, 200, 11);
  assert(JSON.stringify(Array.from(fieldA.heights)) === JSON.stringify(Array.from(fieldB.heights)),
    '200 Tropfen mit identischem Droplet-Seed erzeugen bitidentisches Terrain');
}

// --- 3. Masse bleibt über einen vollen Erosionslauf exakt erhalten -------
{
  const field = generateHills(createHeightfield(50, 50), 9);
  const before = totalMass(field);
  erode(field, 300, 4);
  const after = totalMass(field);
  assert(Math.abs(before - after) < 1e-6,
    `Gesamtmasse bleibt über 300 Tropfen exakt erhalten (${before.toFixed(6)} -> ${after.toFixed(6)}, Δ=${(after - before).toExponential(2)})`);
}

// --- 4. Ein einzelner Tropfen verändert das Terrain lokal, nicht global --
{
  const field = generateHills(createHeightfield(40, 40), 2);
  const before = field.heights.slice();
  simulateDroplet(field, 20, 20, DEFAULT_EROSION_PARAMS);
  let changedCells = 0;
  for (let i = 0; i < field.heights.length; i++) if (Math.abs(field.heights[i] - before[i]) > 1e-9) changedCells++;
  assert(changedCells > 0, 'ein einzelner Tropfen verändert mindestens eine Zelle');
  assert(changedCells < field.heights.length / 4, `ein einzelner Tropfen verändert nur einen kleinen Teil des Grids (${changedCells}/${field.heights.length} Zellen)`);
}

// --- 5. Viele Tropfen aus der gleichen Region graben tatsächlich ein Tal -
{
  // Schiefe Ebene: Höhe fällt mit x. Tropfen, die immer am selben Rand
  // starten, nehmen denselben Abflussweg nach unten. Wichtig: das an
  // globalem min/max gemessen zu wollen war der erste, falsche Test hier --
  // Start-min/max dieses Feldes liegen an den Rändern (x=0 bzw. x=49), weit
  // weg vom befahrenen Pfad, und ändern sich deshalb nie, obwohl der Pfad
  // selbst sich sichtbar eintieft. Richtig gemessen: die Summe der Höhen
  // GENAU entlang des tatsächlich befahrenen Pfads.
  const field = createHeightfield(50, 30);
  for (let y = 0; y < field.height; y++) for (let x = 0; x < field.width; x++) {
    field.heights[y * field.width + x] = (field.width - x) * 0.3 + Math.sin(y * 0.7) * 0.5;
  }
  const pathCells = [];
  for (let x = 5; x <= 15; x++) pathCells.push(15 * field.width + x); // grober Abflussweg, s. Debug unten
  const sumPath = () => pathCells.reduce((s, i) => s + field.heights[i], 0);
  const before = sumPath();
  for (let i = 0; i < 150; i++) simulateDroplet(field, 5, 15, DEFAULT_EROSION_PARAMS);
  const after = sumPath();
  assert(after < before, `150 Tropfen vom selben Startpunkt tiefen den befahrenen Pfad spürbar ein (Summe entlang des Pfads: ${before.toFixed(2)} -> ${after.toFixed(2)})`);
}

// --- 6. mulberry32 ist deterministisch (geteilt mit granular-grid.js) -----
{
  const a = mulberry32(21), b = mulberry32(21);
  assert(a() === b(), 'mulberry32(21) liefert bei gleichem Seed denselben ersten Wert');
}

// --- 7. cloneHeightfield ist eine echte Kopie ------------------------------
{
  const field = generateHills(createHeightfield(10, 10), 1);
  const clone = cloneHeightfield(field);
  clone.heights[0] = 999;
  assert(field.heights[0] !== 999, 'cloneHeightfield() teilt keinen Buffer mit dem Original');
}

// --- 8. toGrayscaleRGBA liefert gültige, normalisierte Bytes --------------
{
  const field = generateHills(createHeightfield(16, 16), 1);
  erode(field, 50, 1);
  const rgba = toGrayscaleRGBA(field);
  assert(rgba.length === field.width * field.height * 4, 'toGrayscaleRGBA() liefert width*height*4 Bytes');
  let minV = 255, maxV = 0;
  for (let i = 0; i < rgba.length; i += 4) { minV = Math.min(minV, rgba[i]); maxV = Math.max(maxV, rgba[i]); }
  assert(minV === 0 && maxV === 255, `Graustufen sind auf den vollen [0,255]-Bereich normalisiert (min=${minV}, max=${maxV})`);
}

// --- 9. keine NaN/Infinity-Werte nach einem größeren Lauf ------------------
{
  const field = generateHills(createHeightfield(70, 70), 42);
  erode(field, 500, 42);
  let allFinite = true;
  for (let i = 0; i < field.heights.length; i++) if (!Number.isFinite(field.heights[i])) allFinite = false;
  assert(allFinite, 'nach 500 Tropfen sind alle Höhenwerte endlich (kein NaN/Infinity)');
}

// --- 10. Alle neuen Dateien parsen ------------------------------------------
{
  const { execSync } = await import('node:child_process');
  const path = await import('node:path');
  const { fileURLToPath } = await import('node:url');
  const REPO = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
  let allParse = true;
  for (const f of ['runtime/solver/erosion-heightfield.js', 'tools/test-erosion-heightfield.mjs']) {
    try { execSync(`node --check "${f}"`, { cwd: REPO, stdio: 'pipe' }); } catch { allParse = false; console.error('  Parsefehler in', f); }
  }
  assert(allParse, 'runtime/solver/erosion-heightfield.js und dieses Testskript parsen mit node --check');
}

console.log(failures ? `\n❌ ${failures} Fehlschläge` : '\n✅ Alle Erosions-Solver-Selbsttests bestanden');
process.exit(failures ? 1 : 0);
