// Behavioural regression test for runtime/world-sandbox-light.mjs's sun-visibility ray-march
// (Pass 3 of the user's "Light as a World Field" reference doc). Proves the concrete physical
// claim: a real 2D silhouette test against the SAME heightfield the terrain already uses, not a
// blanket x-based rule -- a cell in a tall block's actual shadow is dark, a cell just past the
// block on the sun-facing side is lit, and a cell offset sideways (never crossing the block's own
// footprint along the sun direction) is lit too, even though it shares an x-coordinate with the
// shadowed cell.
import assert from 'node:assert/strict';
import {CELL_STRIDE, FIELD, cellOffset} from '../runtime/world-sandbox-reference.mjs';
import {computeSunVisibility} from '../runtime/world-sandbox-light.mjs';

const size = 60;

function visAt(vis, x, z) {
  const cx = Math.min(size - 1, Math.max(0, Math.floor(x * size)));
  const cz = Math.min(size - 1, Math.max(0, Math.floor(z * size)));
  return vis[cz * size + cx];
}

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

console.log('light: sun visibility is a real 2D ray-marched silhouette against the terrain\'s own heightfield -- flat ground is never shadowed, a tall block casts a localized shadow, and cells outside that silhouette stay lit even when they share a coordinate with a shadowed cell');
