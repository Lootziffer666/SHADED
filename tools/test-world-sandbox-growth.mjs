// Behavioural regression tests for runtime/world-sandbox-growth.mjs's root-tip agents (the
// user's "Test A: Wurzel" from their own three-part vertical slice). Each test proves one of the
// three concrete claims from that spec directly: grows toward a water/moisture source, avoids a
// stone-like obstacle instead of passing through it, and branches only when it actually has
// enough energy to spare.
import assert from 'node:assert/strict';
import {CELL_STRIDE, FIELD, cellOffset, mulberry32} from '../runtime/world-sandbox-reference.mjs';
import {createRootTip, stepGrowthTips, createPlantGraph} from '../runtime/world-sandbox-growth.mjs';

const size = 40;

function flatField() {
  const state = new Float32Array(size * size * CELL_STRIDE);
  for (let o = 0; o < state.length; o += CELL_STRIDE) state[o + FIELD.BEDROCK] = 0.05;
  return state;
}

function distance(ax, az, bx, bz) {
  return Math.hypot(ax - bx, az - bz);
}

// --- Root grows toward moisture -----------------------------------------------------------
{
  const state = flatField();
  // A moisture gradient rising toward the far corner (1,1), nothing in the near corner (0,0).
  for (let z = 0; z < size; z++) {
    for (let x = 0; x < size; x++) {
      const o = cellOffset(size, x, z);
      state[o + FIELD.WETNESS] = Math.max(0, ((x + z) / (2 * size)) - 0.15);
    }
  }
  const graph = createPlantGraph();
  const tip = createRootTip(0.05, 0.05, Math.PI / 4, 1, graph, null);
  const tips = [tip];
  const random = mulberry32(1);
  // 2000 steps at dt=1/20 is 100s of simulated time -- at SPEED=0.012 units/s that is a travel
  // BUDGET of up to 1.2 units if the tip moved dead straight the whole way (it doesn't quite,
  // since scoreDirection's turn-cost discourages instant re-aiming every step), enough to
  // meaningfully close the ~1.34-unit starting distance to this gradient's far corner.
  for (let i = 0; i < 2000; i++) stepGrowthTips(state, size, tips, 1 / 20, random, graph);

  const target = distance(0.05, 0.05, 1, 1);
  const final = distance(tip.x, tip.z, 1, 1);
  assert.ok(final < target * 0.75,
    `a root tip started far from moisture measurably closes the distance toward the wetter corner (started ${target.toFixed(3)} away, ended ${final.toFixed(3)} away)`);
  assert.ok(tip.x >= 0.05 && tip.z >= 0.05, 'the tip actually moved forward, not backward, toward moisture');

  // The graph, not the tip's x/z, is meant to be the plant's real record (section 2 of the
  // user's plan): every step that actually grew must have appended a node, the tip's own
  // current position must equal its current node's stored position (no drift between "cursor"
  // and "record"), and walking parentId back from the tip's node must reach the seed (id 0)
  // in a bounded number of hops without ever cycling.
  assert.ok(graph.nodes.length > 1, 'growing for 2000 steps left more than just the seed node in the graph');
  const tipNode = graph.nodes[tip.nodeId];
  assert.equal(tipNode.x, tip.x, "the tip's current node position matches the tip's own x");
  assert.equal(tipNode.z, tip.z, "the tip's current node position matches the tip's own z");
  let walk = tipNode;
  let hops = 0;
  while (walk.parentId != null) {
    walk = graph.nodes[walk.parentId];
    hops++;
    assert.ok(hops <= graph.nodes.length, 'walking parentId back from the tip terminates instead of cycling');
  }
  assert.equal(walk.id, 0, 'walking parentId back from the tip always reaches the original seed node');
}

// --- Root avoids a stone-like (high-compaction) obstacle directly in its path --------------
{
  const state = flatField();
  // Moisture straight ahead in +x, but a solid wall of high compaction blocks the direct path
  // at x=0.5 across the whole z range the tip could realistically reach.
  for (let z = 0; z < size; z++) {
    for (let x = 0; x < size; x++) {
      const o = cellOffset(size, x, z);
      state[o + FIELD.WETNESS] = x > size * 0.6 ? 0.8 : 0.2;
    }
  }
  for (let z = 0; z < size; z++) {
    for (let x = Math.floor(size * 0.45); x < Math.floor(size * 0.55); x++) {
      state[cellOffset(size, x, z) + FIELD.COMPACTION] = 0.95;
    }
  }
  const graph = createPlantGraph();
  const tip = createRootTip(0.2, 0.5, 0, 1, graph, null);
  const tips = [tip];
  const random = mulberry32(2);
  const wallMinX = 0.45, wallMaxX = 0.55;
  let everInsideWall = false;
  for (let i = 0; i < 600; i++) {
    stepGrowthTips(state, size, tips, 1 / 20, random, graph);
    if (tip.x > wallMinX && tip.x < wallMaxX) {
      const compactionHere = state[cellOffset(size, Math.floor(tip.x * size), Math.floor(tip.z * size)) + FIELD.COMPACTION];
      if (compactionHere > 0.9) everInsideWall = true;
    }
    if (!tip.alive) break;
  }
  assert.ok(!everInsideWall, 'the root tip never actually enters a cell with compaction > 0.9 -- it routes around the wall, not through it');
}

// --- Branching only happens with energy to spare, never below the threshold ---------------
{
  const state = flatField();
  for (let o = 0; o < state.length; o += CELL_STRIDE) state[o + FIELD.WETNESS] = 0.5;
  // A tip started with barely any energy, in generous moisture (so it CAN regain energy over
  // time) -- branches should only start appearing once it has actually climbed back above the
  // threshold, not immediately.
  const graph = createPlantGraph();
  const tip = createRootTip(0.5, 0.5, 0, 0.05, graph, null);
  const tips = [tip];
  const random = mulberry32(3);
  // "Never branches below the threshold" is checked on the newly-created branch's OWN starting
  // energy, not a before/after snapshot of the parent across the whole step: the parent's
  // energy this same step is updated (feed/cost) before the branch decision fires, so a
  // snapshot taken before stepGrowthTips() runs doesn't reflect the value the guard actually
  // compared against. A child's starting energy is `parentEnergyAtDecision * 0.4` (see
  // BRANCH_ENERGY_SHARE) -- since the guard requires parentEnergyAtDecision > 0.55, every real
  // branch's own starting energy must be > 0.55 * 0.4 = 0.22, which IS something this test can
  // observe directly and externally without needing that intermediate value.
  const MIN_POSSIBLE_BRANCH_ENERGY = 0.55 * 0.4;
  let branchedWhileLow = false;
  let sawAnyBranch = false;
  for (let i = 0; i < 2000; i++) {
    const countBefore = tips.length;
    stepGrowthTips(state, size, tips, 1 / 20, random, graph);
    if (tips.length > countBefore) {
      sawAnyBranch = true;
      const newest = tips[tips.length - 1];
      if (newest.energy <= MIN_POSSIBLE_BRANCH_ENERGY - 1e-6) branchedWhileLow = true;
    }
  }
  assert.ok(!branchedWhileLow, `no observed branch's own starting energy is at or below what the 0.55 threshold guard could possibly produce (${MIN_POSSIBLE_BRANCH_ENERGY.toFixed(3)})`);
  assert.ok(sawAnyBranch, 'sanity: given enough time in good moisture, the tip DOES eventually recover enough energy to branch at least once');
  assert.ok(tips.length > 1, 'the branch was actually appended to the shared tips array');

  // A REAL fork has a node with two or more children -- the parent tip's own continuation, and
  // at least one branch. Checked once at the end over the whole finished graph (not at the
  // moment a branch fires): the branch's own node exists immediately, but the parent's matching
  // next-step child doesn't get added until the parent's OWN following step, so checking
  // mid-loop would catch every fork "too early", still showing only one child.
  const forkNodeSeen = graph.nodes.some(node => node.children.length >= 2);
  assert.ok(forkNodeSeen, "at least one node in the finished graph genuinely has two+ children -- a real fork, not two unrelated lines");
}

console.log('growth: root tips seek moisture, route around solid obstacles instead of crossing them, and only branch once genuinely above the energy threshold');
