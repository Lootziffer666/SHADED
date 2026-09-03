// SHADED local-agent vegetation growth -- "Test A: Wurzel" from the user's own three-part
// vertical slice (root -> vine -> bloom state), root first. A growth tip is a small travelling
// agent, not a per-cell field: each step it samples its immediate surroundings (moisture,
// how hard the ground is to push through), picks a direction, moves, spends energy, and can
// branch when it has energy to spare -- the same "sample -> score -> move -> branch" loop the
// user described, not a scripted path.
//
// Deliberately reads the existing WorldState (world-sandbox-reference.mjs) as its only source
// of environment truth (WETNESS for moisture, COMPACTION for how hard/rocky the ground is to
// grow through -- already the field the rest of this sim uses for "harder to erode/infiltrate",
// a real resistance signal, not a new invented one) and never writes classification back into
// it -- a tip's own path is its own state, not a second material truth layered under the grid's.
//
// The plant itself is a GRAPH, not a mesh (the user's own architecture note, section 2): a tip
// moving is really a tip appending a node to a permanent parent/child structure and re-pointing
// itself at the new node. A tip's x/z is a cursor into that graph, not the plant's only record --
// this is what lets a future sweep/tube renderer (section 5), pruning, or "dead wood persists"
// life-state (section 9) exist later without re-deriving geometry from a discarded path. Nodes
// are never removed once created; a branch forks a NEW node off the branching tip's own current
// node (shared parent), it does not copy that tip's position into an unrelated second node --
// that's what makes the graph an actual fork, not two coincidentally-overlapping lines.
//
// This is the FIRST slice, not the finished vision: vine climbing/light-seeking and the
// bloom/wilt state machine (Tests B and C) are real follow-ups, not built here yet, and this
// module has no sweep/mesh geometry, no wind hierarchy, and no life-state machine -- those are
// later phases in the user's own roadmap (sections 5-9), not silently pre-empted here.

import {FIELD, cellOffset, mulberry32} from './world-sandbox-reference.mjs';

const CANDIDATE_ANGLES = [-0.9, -0.55, -0.25, 0, 0.25, 0.55, 0.9];
const LOOKAHEAD = 0.02; // world units ahead a tip samples before committing to a direction
const TURN_RATE = 6; // how fast a tip's own direction can swing per second (radians/second cap)
const SPEED = 0.012; // world units/second a tip advances when unobstructed
const ENERGY_COST_PER_UNIT = 0.9; // energy spent per world unit travelled
const ENERGY_COST_COMPACTION_MULT = 2.4; // extra cost multiplier scaling with ground hardness
const FEED_RATE = 0.35; // energy regained per second while in genuinely moist ground
const BRANCH_ENERGY_THRESHOLD = 0.55; // a tip needs at least this much energy to even consider branching
const BRANCH_CHANCE_PER_SECOND = 0.12;
const BRANCH_ENERGY_SHARE = 0.4; // fraction of the parent's energy handed to a new branch
const COMPACTION_STOP = 0.85; // ground this hard simply can't be pushed through further

// Radius is a placeholder model for now (energy alone, no species profile yet -- section 12 of
// the user's plan) -- good enough for a future sweep/tube renderer to taper a root toward its
// growing tip, not a claim that this is the final radius law.
const RADIUS_BASE = 0.004;
const RADIUS_ENERGY_GAIN = 0.01;
function nodeRadius(energy) {
  return RADIUS_BASE + RADIUS_ENERGY_GAIN * Math.max(0, Math.min(1, energy));
}

function sampleField(state, size, field, x, z) {
  const cx = Math.min(size - 1, Math.max(0, Math.floor(x * size)));
  const cz = Math.min(size - 1, Math.max(0, Math.floor(z * size)));
  return state[cellOffset(size, cx, cz) + field];
}

// A permanent record of every position a tip (or its branches) has ever occupied, as parent-
// linked nodes -- the "PLANT GRAPH" from the user's own diagram, not yet the full
// stem/branch/root/leaf/flower typing, just the shared skeleton every later phase (sweep
// geometry, wind hierarchy, life-state) will need. Nodes are appended, never removed or
// mutated in place; `id` always equals the node's own index in `graph.nodes`, so a parentId is
// a direct, stable array index, not a lookup key that can drift.
export function createPlantGraph() {
  return {nodes: []};
}

function addGraphNode(graph, x, z, radius, parentId) {
  const id = graph.nodes.length;
  const node = {id, x, z, radius, parentId, children: []};
  graph.nodes.push(node);
  if (parentId != null) graph.nodes[parentId].children.push(id);
  return id;
}

// `graph` and `parentNodeId` are required: a tip's very first position is itself a graph node
// (parentNodeId=null for a freshly-planted seed, or an existing node's id when this tip is a
// branch forking off another tip's current position -- see the branch call site below).
export function createRootTip(x, z, angle, energy, graph, parentNodeId) {
  const clampedEnergy = Math.max(0, Math.min(1, energy));
  const nodeId = addGraphNode(graph, x, z, nodeRadius(clampedEnergy), parentNodeId ?? null);
  return {
    x, z,
    dirX: Math.cos(angle),
    dirZ: Math.sin(angle),
    energy: clampedEnergy,
    age: 0,
    alive: true,
    nodeId,
  };
}

// Scores a candidate direction purely from the target cell's own moisture/resistance -- higher
// moisture is better (that is the whole point of a root), higher compaction is worse (harder to
// push through), and a real cost for turning away from the tip's current heading so a root
// doesn't thrash back and forth chasing every tiny moisture gradient -- real roots have
// directional persistence, they do not re-plan from scratch every step.
function scoreDirection(state, size, x, z, dirX, dirZ, currentDirX, currentDirZ) {
  const targetX = x + dirX * LOOKAHEAD;
  const targetZ = z + dirZ * LOOKAHEAD;
  if (targetX < 0 || targetX > 1 || targetZ < 0 || targetZ > 1) return -Infinity;
  const moisture = sampleField(state, size, FIELD.WETNESS, targetX, targetZ);
  const compaction = sampleField(state, size, FIELD.COMPACTION, targetX, targetZ);
  if (compaction >= COMPACTION_STOP) return -Infinity;
  const turnCost = 1 - (dirX * currentDirX + dirZ * currentDirZ); // 0 = same heading, 2 = reversal
  return moisture * 2.2 - compaction * 1.6 - turnCost * 0.18;
}

// Advances every living tip in `tips` by `dt` seconds against `state` (the same WorldState
// stepWorldReference operates on), mutating tips in place, appending a graph node for every
// tip's new position (and for every newly-branched tip's starting position) to `graph`, and
// appending any newly-branched tips to the `tips` array. Returns nothing -- callers own the
// array's lifetime (removing dead tips, capping total count, etc.), the same way
// editor/world-sandbox.js already owns state.particles; `graph` is expected to persist for the
// plant's whole lifetime, not be recreated per step.
//
// `random` is a REQUIRED () => [0,1) function (mulberry32(seed) from world-sandbox-reference.mjs
// is the project's own standard one), not Math.random() with a silent fallback -- growth is
// meant to be as reproducible/testable as the rest of this "CPU reference is the deterministic
// golden oracle" simulation, and a hidden dependency on the platform's own unseeded RNG would
// quietly break that for exactly the subsystem meant to prove branching only happens with
// enough energy, not just "sometimes."
export function stepGrowthTips(state, size, tips, dt, random, graph) {
  const branched = [];
  for (const tip of tips) {
    if (!tip.alive || tip.energy <= 0) {
      tip.alive = false;
      continue;
    }
    tip.age += dt;

    let bestScore = -Infinity;
    let bestDirX = tip.dirX;
    let bestDirZ = tip.dirZ;
    for (const offset of CANDIDATE_ANGLES) {
      const baseAngle = Math.atan2(tip.dirZ, tip.dirX);
      const angle = baseAngle + offset;
      const dirX = Math.cos(angle);
      const dirZ = Math.sin(angle);
      const score = scoreDirection(state, size, tip.x, tip.z, dirX, dirZ, tip.dirX, tip.dirZ);
      if (score > bestScore) {
        bestScore = score;
        bestDirX = dirX;
        bestDirZ = dirZ;
      }
    }
    if (bestScore === -Infinity) {
      // Every candidate direction is blocked (out of bounds or solid rock) -- the tip is
      // trapped, not fed a direction it can't actually take.
      tip.alive = false;
      continue;
    }

    // Turn toward the chosen direction at a bounded rate rather than snapping straight to it --
    // this is what makes a root read as a curving line finding its way, not a dowsing rod that
    // instantly points at water.
    const currentAngle = Math.atan2(tip.dirZ, tip.dirX);
    const targetAngle = Math.atan2(bestDirZ, bestDirX);
    let delta = targetAngle - currentAngle;
    while (delta > Math.PI) delta -= Math.PI * 2;
    while (delta < -Math.PI) delta += Math.PI * 2;
    const maxTurn = TURN_RATE * dt;
    const turn = Math.max(-maxTurn, Math.min(maxTurn, delta));
    const newAngle = currentAngle + turn;
    tip.dirX = Math.cos(newAngle);
    tip.dirZ = Math.sin(newAngle);

    const step = SPEED * dt;
    const newX = Math.max(0, Math.min(1, tip.x + tip.dirX * step));
    const newZ = Math.max(0, Math.min(1, tip.z + tip.dirZ * step));
    const compactionHere = sampleField(state, size, FIELD.COMPACTION, newX, newZ);
    const moistureHere = sampleField(state, size, FIELD.WETNESS, newX, newZ);
    tip.x = newX;
    tip.z = newZ;

    const travelled = step;
    tip.energy -= travelled * ENERGY_COST_PER_UNIT * (1 + compactionHere * ENERGY_COST_COMPACTION_MULT);
    if (moistureHere > 0.3) tip.energy += FEED_RATE * dt;
    tip.energy = Math.max(0, Math.min(1, tip.energy));

    // The tip actually grew this step -- record it in the permanent graph as a child of the
    // node it was just standing on, then re-point the tip at that new node. A tip's own
    // position is now derived FROM the graph, not a parallel truth that happens to agree with
    // it. Recorded even when this step's energy spend kills the tip: it still physically grew
    // to this point before running out -- that segment is real, not a phantom last half-step
    // the graph never heard about (matches "dead wood persists" in the user's own plan, section
    // 9 -- a graph that silently drops a tip's final position couldn't support that later).
    tip.nodeId = addGraphNode(graph, tip.x, tip.z, nodeRadius(tip.energy), tip.nodeId);

    if (tip.energy <= 0) {
      tip.alive = false;
      continue;
    }

    if (tip.energy > BRANCH_ENERGY_THRESHOLD && random() < BRANCH_CHANCE_PER_SECOND * dt) {
      const branchAngle = newAngle + (random() < 0.5 ? 1 : -1) * (0.6 + random() * 0.5);
      const branchEnergy = tip.energy * BRANCH_ENERGY_SHARE;
      tip.energy -= branchEnergy;
      // The branch forks off the SAME node the parent tip just grew to -- a real fork with two
      // children of one node, not two lines that merely happen to start at the same coordinates.
      branched.push(createRootTip(tip.x, tip.z, branchAngle, branchEnergy, graph, tip.nodeId));
    }
  }
  for (const tip of branched) tips.push(tip);
}
