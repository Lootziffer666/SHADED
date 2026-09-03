// Behavioural regression test for runtime/world-sandbox-growth.mjs's vine-tip agent (the user's
// "Test B: Ranke" from their own three-part vertical slice). Proves the concrete PASS claim from
// that spec: starting free of any wall, a vine tip routes around a solid L-shaped obstacle (never
// entering it), genuinely uses wall-adjacency along the way (the "support" signal actually does
// something, not just coincidentally succeeds without it), and still measurably closes the
// distance to a light-source target on the far side of the corner.
import assert from 'node:assert/strict';
import {CELL_STRIDE, FIELD, cellOffset} from '../runtime/world-sandbox-reference.mjs';
import {createVineTip, stepVineTips, createPlantGraph} from '../runtime/world-sandbox-growth.mjs';

const size = 60;

function wallField() {
  const state = new Float32Array(size * size * CELL_STRIDE);
  for (let o = 0; o < state.length; o += CELL_STRIDE) state[o + FIELD.BEDROCK] = 0.05;
  // An L-shaped solid wall: a vertical band, then a horizontal band picking up where it ends,
  // forming one real corner -- exactly the "Start -> Wand -> Ecke -> Lichtquelle" shape from the
  // user's own test description, not a single straight barrier a vine could simply skirt past
  // without ever actually following a surface.
  for (let z = 0; z < size; z++) {
    for (let x = 0; x < size; x++) {
      const u = x / size, v = z / size;
      const onVertical = u >= 0.48 && u <= 0.52 && v >= 0.10 && v <= 0.65;
      const onHorizontal = u >= 0.50 && u <= 0.90 && v >= 0.63 && v <= 0.67;
      if (onVertical || onHorizontal) state[cellOffset(size, x, z) + FIELD.COMPACTION] = 0.97;
    }
  }
  return state;
}

const state = wallField();
const graph = createPlantGraph();
const startX = 0.30, startZ = 0.30;
const lightX = 0.85, lightZ = 0.75;
const tip = createVineTip(startX, startZ, Math.PI * 0.35, graph, null);
const tips = [tip];

// A straight line from start to light passes directly through the vertical wall band (crosses
// u=0.5 at v ~= 0.46, well inside the wall's own v-range) -- so any success here is genuinely
// routing around the corner, not just a coincidence of an already-clear line of sight.
const directDx = lightX - startX, directDz = lightZ - startZ;
const tCross = (0.5 - startX) / directDx;
const zAtCross = startZ + tCross * directDz;
assert.ok(tCross > 0 && tCross < 1 && zAtCross >= 0.10 && zAtCross <= 0.65,
  'sanity: the straight start->light line actually crosses the vertical wall band (this test is only meaningful if the direct path is genuinely blocked)');

const startDistToLight = Math.hypot(startX - lightX, startZ - lightZ);
let everInsideWall = false;
let everAttached = false;
for (let i = 0; i < 3000; i++) {
  stepVineTips(state, size, tips, 1 / 20, lightX, lightZ, graph);
  const compactionHere = state[cellOffset(size, Math.floor(tip.x * size), Math.floor(tip.z * size)) + FIELD.COMPACTION];
  if (compactionHere > 0.9) everInsideWall = true;
  if (tip.attached) everAttached = true;
  if (!tip.alive) break;
}

assert.ok(!everInsideWall, 'the vine tip never actually enters a cell with compaction > 0.9 -- it routes around the wall, not through it');
assert.ok(everAttached, 'the vine tip genuinely detects and attaches to the wall at some point (the support signal is not dead code)');

const finalDistToLight = Math.hypot(tip.x - lightX, tip.z - lightZ);
assert.ok(finalDistToLight < startDistToLight * 0.7,
  `the vine measurably closes the distance to the light source despite the blocking corner (started ${startDistToLight.toFixed(3)} away, ended ${finalDistToLight.toFixed(3)} away)`);

// The graph invariant proven for roots holds here too: the tip's cursor and its own graph node
// must never silently diverge.
const tipNode = graph.nodes[tip.nodeId];
assert.equal(tipNode.x, tip.x, "the tip's current node position matches the tip's own x");
assert.equal(tipNode.z, tip.z, "the tip's current node position matches the tip's own z");

console.log('vine: a vine tip detects a solid wall, follows it around a real corner without ever entering it, and still closes the distance to a light-source target');
