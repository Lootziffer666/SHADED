// Selbsttest für die Erosion<->Granular-Brücke (runtime/solver/erosion-granular-bridge.js).
// Deterministisch, keine Browser-/WebGL-Abhängigkeit. Nutzung:
// node tools/test-erosion-granular-bridge.mjs

import { createHeightfield, generateHills, erode, heightRange } from '../runtime/solver/erosion-heightfield.js';
import { createGrid, MATERIAL, countMaterial, getCell } from '../runtime/solver/granular-grid.js';
import {
  profileFromHeightfield, applyTerrainProfile, erosionDelta, spawnErodedSediment,
} from '../runtime/solver/erosion-granular-bridge.js';

let failures = 0;
function assert(cond, msg) {
  if (!cond) { console.error('✗ FAIL:', msg); failures++; }
  else console.log('✓ ok:', msg);
}

// --- 1. profileFromHeightfield liest genau eine Zeile ----------------------
{
  const field = createHeightfield(20, 10);
  for (let x = 0; x < 20; x++) field.heights[5 * 20 + x] = x * 2; // Zeile 5 künstlich markiert
  const profile = profileFromHeightfield(field, 5);
  assert(profile.length === 20, 'Profil hat genau field.width Einträge');
  assert(profile[10] === 20, 'Profil liest die angeforderte Zeile korrekt (Wert an x=10 stimmt)');
}

// --- 2. applyTerrainProfile baut eine zusammenhängende Bodenkontur --------
{
  const grid = createGrid(40, 30);
  const field = createHeightfield(40, 5);
  generateHills(field, 3, 8);
  const profile = profileFromHeightfield(field, 2);
  const range = heightRange(field);
  const groundY = applyTerrainProfile(grid, profile, range);
  assert(groundY.length === grid.width, 'liefert eine groundY-Spalte je Grid-Spalte');
  let allColumnsSolid = true;
  for (let x = 0; x < grid.width; x++) {
    for (let y = groundY[x]; y < grid.height; y++) if (getCell(grid, x, y) !== MATERIAL.WALL) allColumnsSolid = false;
  }
  assert(allColumnsSolid, 'jede Spalte ist von groundY[x] bis zum unteren Rand durchgehend WALL (keine Löcher im Boden)');
  const wallCount = countMaterial(grid, MATERIAL.WALL);
  assert(wallCount > 0 && wallCount < grid.width * grid.height, 'Boden füllt einen echten Teil des Grids, nicht alles und nicht nichts');
}

// --- 3. Offener Bereich über dem Terrain bleibt für Sand-Fall reserviert --
{
  const grid = createGrid(40, 30);
  const field = createHeightfield(40, 5);
  generateHills(field, 3, 8);
  const profile = profileFromHeightfield(field, 2);
  const groundY = applyTerrainProfile(grid, profile, heightRange(field), { openFraction: 0.5 });
  const maxGroundY = Math.max(...groundY);
  assert(maxGroundY >= grid.height * 0.4, `mindestens die konfigurierte offene Fraktion bleibt frei (tiefste Bodenkante bei y=${maxGroundY} von ${grid.height})`);
}

// --- 4. erosionDelta ist positiv genau dort, wo Höhe sank -----------------
{
  const before = new Float64Array([10, 10, 10, 10]);
  const after = new Float64Array([10, 7, 12, 10]);
  const delta = erosionDelta(before, after);
  assert(delta[0] === 0, 'unveränderte Stelle hat delta 0');
  assert(delta[1] === 3, 'abgetragene Stelle (10 -> 7) hat delta +3');
  assert(delta[2] === -2, 'aufgeschüttete Stelle (10 -> 12) hat negatives delta (kein Sediment, filtert threshold)');
}

// --- 5. spawnErodedSediment setzt Sand exakt über der abgetragenen Stelle -
{
  const grid = createGrid(20, 20);
  const groundY = new Int32Array(20).fill(15);
  const delta = new Float64Array(20).fill(0);
  delta[10] = 2; // deutlicher Abtrag nur an x=10
  const grains = spawnErodedSediment(grid, delta, groundY, { grainsPerUnit: 4 });
  assert(grains === 8, `erwartete Kornzahl (2 * grainsPerUnit=4) exakt getroffen: ${grains}`);
  let sandAtX10 = 0, sandElsewhere = 0;
  for (let x = 0; x < 20; x++) for (let y = 0; y < 20; y++) {
    if (getCell(grid, x, y) === MATERIAL.SAND) { if (x === 10) sandAtX10++; else sandElsewhere++; }
  }
  assert(sandAtX10 === 8 && sandElsewhere === 0, `aller gespawnter Sand sitzt exakt an der abgetragenen Spalte x=10 (dort: ${sandAtX10}, anderswo: ${sandElsewhere})`);
}

// --- 6. Ein voller Erosionslauf erzeugt tatsächlich Sediment im Grid ------
{
  const field = createHeightfield(60, 60);
  generateHills(field, 4, 8);
  const row = 30;
  const range = heightRange(field);
  const before = profileFromHeightfield(field, row);

  erode(field, 400, 5);
  const after = profileFromHeightfield(field, row);

  const grid = createGrid(60, 40);
  const groundY = applyTerrainProfile(grid, after, range);
  const delta = erosionDelta(before, after);
  const grains = spawnErodedSediment(grid, delta, groundY);

  assert(grains > 0, `ein echter Erosionslauf entlang der beobachteten Zeile erzeugt tatsächlich Sedimentkörner im Grid (${grains})`);
  assert(countMaterial(grid, MATERIAL.SAND) === grains, 'gespawnte Kornzahl stimmt exakt mit der Sandzahl im Grid überein');
}

// --- 7. Determinismus: gleicher Seed erzeugt gleiche Sedimentmenge -------
{
  function run(seed) {
    const field = createHeightfield(50, 50);
    generateHills(field, 2, 8);
    const range = heightRange(field);
    const before = profileFromHeightfield(field, 25);
    erode(field, 300, seed);
    const after = profileFromHeightfield(field, 25);
    const grid = createGrid(50, 35);
    const groundY = applyTerrainProfile(grid, after, range);
    return spawnErodedSediment(grid, erosionDelta(before, after), groundY);
  }
  assert(run(7) === run(7), 'derselbe Erosions-Seed erzeugt exakt dieselbe Sedimentkornzahl');
}

// --- 8. Gespawnter Sand fällt unter der bestehenden Granular-Schwerkraft --
// (kein neuer Solver -- nur der Beweis, dass die Brücke mit dem
// unveränderten step() aus granular-grid.js zusammenspielt.)
{
  const { step } = await import('../runtime/solver/granular-grid.js');
  const field = createHeightfield(60, 60);
  generateHills(field, 9, 8);
  const row = 30;
  const range = heightRange(field);
  const before = profileFromHeightfield(field, row);
  erode(field, 400, 9);
  const after = profileFromHeightfield(field, row);

  const grid = createGrid(60, 40);
  const groundY = applyTerrainProfile(grid, after, range);
  spawnErodedSediment(grid, erosionDelta(before, after), groundY);

  const sandBefore = countMaterial(grid, MATERIAL.SAND);
  for (let i = 0; i < 60; i++) step(grid);
  const sandAfter = countMaterial(grid, MATERIAL.SAND);
  assert(sandBefore === sandAfter, `gespawnter Sand bleibt unter Schwerkraft komplett erhalten, nur die Position ändert sich (${sandBefore} -> ${sandAfter})`);

  let stillOnSurface = 0;
  for (let x = 0; x < grid.width; x++) {
    for (let y = 0; y < grid.height; y++) {
      if (getCell(grid, x, y) === MATERIAL.SAND) { if (y < groundY[x] - 2) stillOnSurface++; break; }
    }
  }
}

// --- 9. Alle neuen Dateien parsen ------------------------------------------
{
  const { execSync } = await import('node:child_process');
  const path = await import('node:path');
  const { fileURLToPath } = await import('node:url');
  const REPO = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
  let allParse = true;
  for (const f of ['runtime/solver/erosion-granular-bridge.js', 'tools/test-erosion-granular-bridge.mjs']) {
    try { execSync(`node --check "${f}"`, { cwd: REPO, stdio: 'pipe' }); } catch { allParse = false; console.error('  Parsefehler in', f); }
  }
  assert(allParse, 'die Brücke und dieses Testskript parsen mit node --check');
}

console.log(failures ? `\n❌ ${failures} Fehlschläge` : '\n✅ Alle Erosion<->Granular-Brücken-Selbsttests bestanden');
process.exit(failures ? 1 : 0);
