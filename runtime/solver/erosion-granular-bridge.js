// SHADED Solver Lab — Erosion <-> Granular bridge (renderer-independent).
//
// A pure integration/glue layer, not a third solver: it reuses
// erosion-heightfield.js and granular-grid.js exactly as they are and adds
// no new physics of its own. Per CLAUDE.md's own anti-premature-
// abstraction rule, this is deliberately a thin bridge, not a shared
// "world system" framework -- that would be the wrong thing to build
// before a second real coupling exists to prove the shape is right.
//
// What it actually couples: a single row of the (top-down) erosion
// heightfield is a valid 1D terrain height-vs-x profile, which is exactly
// what a (side-view) granular grid's floor needs. So:
//   1. that profile becomes the granular grid's ground silhouette (WALL
//      cells), and
//   2. wherever erosion just removed height along that row, the granular
//      grid receives SAND cells proportional to how much was carved away,
//      sitting on the freshly exposed surface.
// The granular solver then runs completely unmodified -- the newly spawned
// sand settles into the new terrain's own depressions under its existing
// gravity rules. No shared coordinate system beyond "this row's x-axis",
// no shared timestep, no new authoritative state.

import { MATERIAL, setCell } from './granular-grid.js';

export function profileFromHeightfield(field, row) {
  const r = Math.max(0, Math.min(field.height - 1, row));
  const profile = new Float64Array(field.width);
  for (let x = 0; x < field.width; x++) profile[x] = field.heights[r * field.width + x];
  return profile;
}

function resampleIndex(gridX, gridWidth, profileLength) {
  return Math.min(profileLength - 1, Math.floor((gridX / gridWidth) * profileLength));
}

// Baut die Bodenkontur einer Erosions-Profilzeile als WALL-Silhouette in
// ein Granular-Grid. Nutzt den (min,max) der ÜBERGEBENEN Referenzspanne,
// nicht des aktuellen Profils selbst, damit "vorher" und "nachher"
// dieselbe Skala verwenden -- sonst würde reine Neu-Normalisierung wie
// Erosion aussehen, obwohl sich nur der Wertebereich verschoben hat.
export function applyTerrainProfile(grid, profile, referenceRange, options = {}) {
  const { openFraction = 0.4 } = options; // Anteil der Grid-Höhe, der IMMER frei bleibt (Platz zum Fallen)
  const { min, max } = referenceRange;
  const span = Math.max(max - min, 1e-6);
  const usableRows = Math.round(grid.height * (1 - openFraction));
  const groundYByColumn = new Int32Array(grid.width);
  for (let x = 0; x < grid.width; x++) {
    const h = profile[resampleIndex(x, grid.width, profile.length)];
    const filled = Math.round(((h - min) / span) * usableRows);
    const groundY = Math.max(0, grid.height - 1 - filled);
    groundYByColumn[x] = groundY;
    for (let y = groundY; y < grid.height; y++) setCell(grid, x, y, MATERIAL.WALL);
  }
  return groundYByColumn;
}

// Positive Werte = an dieser Stelle wurde Material abgetragen (Höhe sank).
export function erosionDelta(beforeProfile, afterProfile) {
  const n = Math.min(beforeProfile.length, afterProfile.length);
  const delta = new Float64Array(n);
  for (let x = 0; x < n; x++) delta[x] = beforeProfile[x] - afterProfile[x];
  return delta;
}

// Setzt SAND-Zellen direkt über der (bereits mit applyTerrainProfile neu
// gezogenen) Bodenkontur, proportional zum lokal abgetragenen Betrag --
// das abgetragene Material landet sichtbar genau dort, wo es herausgegraben
// wurde, nicht irgendwo zufällig im Grid.
export function spawnErodedSediment(grid, delta, groundYByColumn, options = {}) {
  const { grainsPerUnit = 4, maxStack = 12, threshold = 0.02 } = options;
  let totalGrains = 0;
  for (let x = 0; x < grid.width; x++) {
    const idx = resampleIndex(x, grid.width, delta.length);
    const eroded = delta[idx];
    if (eroded <= threshold) continue;
    const grains = Math.min(maxStack, Math.round(eroded * grainsPerUnit));
    const groundY = groundYByColumn[x];
    for (let g = 1; g <= grains; g++) {
      const y = groundY - g;
      if (y < 0) break;
      setCell(grid, x, y, MATERIAL.SAND);
      totalGrains++;
    }
  }
  return totalGrains;
}
