// Behavioural regression test for runtime/world-sandbox-light.mjs's sun-visibility and
// sky-exposure ray-marches (Pass 3 and Pass 4 of the user's "Light as a World Field" reference
// doc). Proves the concrete physical claims: sun visibility is a real 2D silhouette test against
// the SAME heightfield the terrain already uses, not a blanket x-based rule -- a cell in a tall
// block's actual shadow is dark, a cell just past the block on the sun-facing side is lit, and a
// cell offset sideways (never crossing the block's own footprint along the sun direction) is lit
// too, even though it shares an x-coordinate with the shadowed cell. Sky exposure is a real
// horizon-angle measurement, independent of any sun direction -- flat ground sees the whole sky,
// a cell next to a tall wall sees measurably less of it, and a cell boxed in on every side (a
// pit) sees markedly less again than a cell with only one side blocked.
import assert from 'node:assert/strict';
import {CELL_STRIDE, FIELD, cellOffset} from '../runtime/world-sandbox-reference.mjs';
import {computeSunVisibility, computeSkyExposure} from '../runtime/world-sandbox-light.mjs';

const size = 60;

function visAt(vis, x, z) {
  const cx = Math.min(size - 1, Math.max(0, Math.floor(x * size)));
  const cz = Math.min(size - 1, Math.max(0, Math.floor(z * size)));
  return vis[cz * size + cx];
}
const expAt = visAt; // same indexing, sky-exposure arrays are shaped identically

// --- Flat terrain: no relief anywhere, so nothing can occlude the sun -----------------------
{
  const state = new Float32Array(size * size * CELL_STRIDE);
  for (let o = 0; o < state.length; o += CELL_STRIDE) state[o + FIELD.BEDROCK] = 0.05;
  const vis = computeSunVisibility(state, size, 1, 0, 0.4);
  let allLit = true;
  for (let i = 0; i < vis.length; i++) if (vis[i] !== 1) allLit = false;
  assert.ok(allLit, 'a perfectly flat world has no shadows anywhere, for any sun direction');
}

// --- A real tall block casts a real, spatially-localized shadow -----------------------------
{
  const state = new Float32Array(size * size * CELL_STRIDE);
  for (let o = 0; o < state.length; o += CELL_STRIDE) state[o + FIELD.BEDROCK] = 0.05;
  // A tall block: bedrock 0.05 + sand 0.35 = 0.40 total height, well above the flat 0.05 floor.
  for (let z = 0; z < size; z++) {
    for (let x = 0; x < size; x++) {
      const u = x / size, v = z / size;
      if (u >= 0.45 && u <= 0.55 && v >= 0.40 && v <= 0.60) {
        state[cellOffset(size, x, z) + FIELD.SAND] = 0.35;
      }
    }
  }
  // Sun to the east (+x), moderate elevation -- low enough to cast a real shadow at short range,
  // high enough that the shadow doesn't swallow the entire rest of the world.
  const vis = computeSunVisibility(state, size, 1, 0, 0.4);

  const shadowed = visAt(vis, 0.40, 0.50); // just west of the block, inside its z-range
  assert.equal(shadowed, 0, `a cell right next to the block, in its silhouette, sits in real shadow (got ${shadowed})`);

  const litPastBlock = visAt(vis, 0.60, 0.50); // just east of the block -- sun-facing side, clear path onward
  assert.equal(litPastBlock, 1, `a cell just past the block on the sun-facing side is lit -- nothing between it and the sun (got ${litPastBlock})`);

  const litOffAxis = visAt(vis, 0.40, 0.10); // SAME x as the shadowed cell, but outside the block's z-range
  assert.equal(litOffAxis, 1, `a cell that shares the shadowed cell's x-coordinate but never crosses the block's own z-range along the sun direction is lit -- this is a real 2D silhouette test, not a blanket x-based rule (got ${litOffAxis})`);
}

// --- Flat terrain: nothing to raise any horizon, so sky exposure is exactly 1 everywhere ----
{
  const state = new Float32Array(size * size * CELL_STRIDE);
  for (let o = 0; o < state.length; o += CELL_STRIDE) state[o + FIELD.BEDROCK] = 0.05;
  const exp = computeSkyExposure(state, size);
  let allOpen = true;
  for (let i = 0; i < exp.length; i++) if (exp[i] !== 1) allOpen = false;
  assert.ok(allOpen, 'a perfectly flat world has fully open sky (exposure exactly 1) everywhere');
}

// --- A tall wall reduces sky exposure next to it; a pit (walls on every side) reduces it -----
// far more than a single wall, and a cell nowhere near any relief stays fully open. -----------
{
  const state = new Float32Array(size * size * CELL_STRIDE);
  for (let o = 0; o < state.length; o += CELL_STRIDE) state[o + FIELD.BEDROCK] = 0.05;

  // A single modest wall segment along one edge -- 0.15 units above the flat 0.05 floor (not a
  // sheer 0.6-tall cliff: a wall that tall would measurably reach even the "far from relief"
  // control point at this grid's scale, since the ray-march searches out to ~1 world unit, most
  // of this [0,1] world's own diagonal -- that's real physics, not a bug, but it would leave no
  // room in this world for a genuinely unaffected control point).
  for (let z = 0; z < size; z++) {
    for (let x = 0; x < size; x++) {
      const u = x / size, v = z / size;
      if (u >= 0.18 && u <= 0.22 && v >= 0.0 && v <= 0.35) state[cellOffset(size, x, z) + FIELD.SAND] = 0.15;
    }
  }
  // A shallow pit: walls of the SAME height on all four sides of a small open floor, elsewhere
  // in the grid -- being boxed in on every side should still read as far more enclosed than
  // having just one wall nearby, even though no single wall here is dramatically taller.
  for (let z = 0; z < size; z++) {
    for (let x = 0; x < size; x++) {
      const u = x / size, v = z / size;
      const inRing = u >= 0.68 && u <= 0.92 && v >= 0.68 && v <= 0.92;
      const inFloor = u >= 0.76 && u <= 0.84 && v >= 0.76 && v <= 0.84;
      if (inRing && !inFloor) state[cellOffset(size, x, z) + FIELD.SAND] = 0.15;
    }
  }

  const exp = computeSkyExposure(state, size);
  const nextToWall = expAt(exp, 0.24, 0.15); // just east of the wall, still close to it
  const farFromRelief = expAt(exp, 0.55, 0.55); // well clear of both the wall and the pit
  const insidePit = expAt(exp, 0.80, 0.80); // floor of the enclosed pit

  assert.ok(farFromRelief > 0.9, `a cell well clear of any relief keeps most of its sky exposure (got ${farFromRelief.toFixed(3)})`);
  assert.ok(nextToWall < farFromRelief, `a cell right next to a wall sees measurably less sky than one with a clear view (wall=${nextToWall.toFixed(3)} vs open=${farFromRelief.toFixed(3)})`);
  assert.ok(insidePit < nextToWall, `a cell boxed in on every side (a pit) sees markedly less sky than a cell with only one side blocked, even though no single wall is any taller (pit=${insidePit.toFixed(3)} vs single-wall=${nextToWall.toFixed(3)})`);
}

console.log('light: sun visibility is a real 2D ray-marched silhouette against the terrain\'s own heightfield, and sky exposure is a real horizon-angle measurement -- both read flat ground as fully open and correctly grade shadow/enclosure by how much relief actually blocks the view');
