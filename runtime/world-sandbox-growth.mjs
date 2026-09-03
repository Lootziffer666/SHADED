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

// `y` defaults to 0 (ground level) -- this world-sandbox grid is currently a flat x/z plane with
// no vertical axis at all (no stepper below writes to it yet), so every node the growth/vine
// tips create sits at y=0. Accepted as a real parameter, not omitted entirely, so the mesh format
// (world-sandbox-mesh.mjs) is genuinely 3D-capable from the start rather than needing its vertex
// layout revisited later: real vertical growth (roots descending, vines climbing a real height
// axis) is a named follow-up that would only need to change what callers PASS here, not this
// function or anything that consumes graph.nodes downstream.
function addGraphNode(graph, x, z, radius, parentId, y = 0) {
  const id = graph.nodes.length;
  const node = {id, x, y, z, radius, parentId, children: []};
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
// `step` is the ACTUAL distance this tick would move if this direction is chosen (SPEED * dt) --
// distinct from LOOKAHEAD, which only informs preference. Checking compaction at LOOKAHEAD alone
// is not enough to prevent tunnelling into solid rock: LOOKAHEAD is deliberately much further out
// than a single step so a tip can "see" a gradient coming, and at a sharp corner a direction can
// look clear that far out while the tip's actual, much shorter real step this tick still lands
// inside the wall. Both points must be checked -- the near one for physical validity this tick,
// the far one for the gradient the tip is actually navigating toward.
function scoreDirection(state, size, x, z, dirX, dirZ, currentDirX, currentDirZ, step) {
  const nearX = x + dirX * step;
  const nearZ = z + dirZ * step;
  if (nearX < 0 || nearX > 1 || nearZ < 0 || nearZ > 1) return -Infinity;
  if (sampleField(state, size, FIELD.COMPACTION, nearX, nearZ) >= COMPACTION_STOP) return -Infinity;
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

    const step = SPEED * dt;
    let bestScore = -Infinity;
    let bestDirX = tip.dirX;
    let bestDirZ = tip.dirZ;
    for (const offset of CANDIDATE_ANGLES) {
      const baseAngle = Math.atan2(tip.dirZ, tip.dirX);
      const angle = baseAngle + offset;
      const dirX = Math.cos(angle);
      const dirZ = Math.sin(angle);
      const score = scoreDirection(state, size, tip.x, tip.z, dirX, dirZ, tip.dirX, tip.dirZ, step);
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

    const newX = Math.max(0, Math.min(1, tip.x + tip.dirX * step));
    const newZ = Math.max(0, Math.min(1, tip.z + tip.dirZ * step));
    const compactionHere = sampleField(state, size, FIELD.COMPACTION, newX, newZ);
    if (compactionHere >= COMPACTION_STOP) {
      // The turn-rate cap means the tip's ACTUAL heading this tick can still differ from the
      // best-scored candidate direction (a full turn toward a sharp candidate is spread over
      // several ticks) -- scoreDirection's own near-step check validates a candidate, not
      // necessarily the partially-turned heading this tick ends up moving along. This is the
      // real, final "can't tunnel into solid rock" guard: hold position this tick instead of
      // committing a move that lands in the wall regardless of why it would have. The tip has
      // already turned further toward the safe candidate, so the next tick tries again from a
      // heading closer to clear ground.
      continue;
    }
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

// ---------------------------------------------------------------------------------------------
// Vine gremlin -- "Test B: Ranke" from the user's plan. Grows freely at first, discovers a
// solid surface (a "wall"), follows it, and can round a corner while it does, all while pulling
// toward a light source. This world-sandbox grid is currently flat 2D (x/z only -- no vertical
// axis, no per-cell light field: `light`, `support` etc. from the user's own WORLD FIELDS list
// aren't real fields here yet). Two honest stand-ins, not invented physics:
//   - "wall/support" = adjacency to a high-COMPACTION neighbour cell. COMPACTION already means
//     "hard/rocky, resists erosion" for the rest of this sim; a solid rock band read as a
//     climbable surface for something growing along its face is a reasonable reuse, not a new
//     concept smuggled in under a new name.
//   - "light source" = an explicit target point passed in by the caller, not a field the vine
//     samples locally. SHADED has no per-cell light field yet (this sandbox's only light-like
//     signal is the single global `env.sun` scalar used elsewhere in this file, which carries no
//     position at all) -- a point target is the honest version of "there is a light source
//     somewhere" until a real per-cell light field exists. Replacing this with an actual local
//     field, once one exists, should not need to change the shape of scoreVineDirection itself.
// No energy/branching yet -- Test B's own stated PASS criterion is purely geometric ("reaches a
// light source along a surface"), not resource-limited growth; that's a real follow-up matching
// root's model, not built here.

const VINE_LIGHT_WEIGHT = 3.2; // reward for closing the gap toward the light target
const VINE_SUPPORT_WEIGHT = 1.1; // reward for growing where a wall is close by
const VINE_UNSUPPORTED_PENALTY = 1.6; // once attached, cost for drifting away from any wall
const VINE_ATTACH_THRESHOLD = 0.5; // neighbour compaction above this counts as "found a wall"
const VINE_TURN_COST_WEIGHT = 0.18;

export function createVineTip(x, z, angle, graph, parentNodeId) {
  const nodeId = addGraphNode(graph, x, z, nodeRadius(1), parentNodeId ?? null);
  return {
    x, z,
    dirX: Math.cos(angle),
    dirZ: Math.sin(angle),
    attached: false,
    alive: true,
    nodeId,
  };
}

// Highest COMPACTION among the cells immediately around (x,z), EXCLUDING (x,z)'s own cell --
// "is there a wall right next to me," not "am I standing in one" (growing INTO solid rock is
// still refused separately, same as roots).
function neighborSupport(state, size, x, z) {
  const cx = Math.min(size - 1, Math.max(0, Math.floor(x * size)));
  const cz = Math.min(size - 1, Math.max(0, Math.floor(z * size)));
  let best = 0;
  for (let dz = -1; dz <= 1; dz++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (dx === 0 && dz === 0) continue;
      const nx = cx + dx, nz = cz + dz;
      if (nx < 0 || nx >= size || nz < 0 || nz >= size) continue;
      const compaction = state[cellOffset(size, nx, nz) + FIELD.COMPACTION];
      if (compaction > best) best = compaction;
    }
  }
  return best;
}

// `step` is the ACTUAL per-tick move distance (see scoreDirection's own comment on the same
// near-vs-lookahead distinction, and stepVineTips's post-turn guard below for why the near check
// here is still only a bias, not the final tunnelling guarantee).
function scoreVineDirection(state, size, x, z, dirX, dirZ, currentDirX, currentDirZ, lightX, lightZ, attached, step) {
  const nearX = x + dirX * step;
  const nearZ = z + dirZ * step;
  if (nearX < 0 || nearX > 1 || nearZ < 0 || nearZ > 1) return -Infinity;
  if (sampleField(state, size, FIELD.COMPACTION, nearX, nearZ) >= COMPACTION_STOP) return -Infinity;
  const targetX = x + dirX * LOOKAHEAD;
  const targetZ = z + dirZ * LOOKAHEAD;
  if (targetX < 0 || targetX > 1 || targetZ < 0 || targetZ > 1) return -Infinity;
  const ownCompaction = sampleField(state, size, FIELD.COMPACTION, targetX, targetZ);
  if (ownCompaction >= COMPACTION_STOP) return -Infinity; // can't grow into the wall itself
  const support = neighborSupport(state, size, targetX, targetZ);
  const distNow = Math.hypot(x - lightX, z - lightZ);
  const distNext = Math.hypot(targetX - lightX, targetZ - lightZ);
  const lightGain = distNow - distNext; // positive = actually closing the gap this step
  const turnCost = 1 - (dirX * currentDirX + dirZ * currentDirZ);
  let score = lightGain * VINE_LIGHT_WEIGHT + support * VINE_SUPPORT_WEIGHT - turnCost * VINE_TURN_COST_WEIGHT;
  if (attached) score -= (1 - support) * VINE_UNSUPPORTED_PENALTY;
  return score;
}

// Same sample -> score -> move -> record loop as stepGrowthTips, with vine-specific scoring
// (light target + wall adjacency instead of root's moisture/compaction) and no energy/branching
// yet. `lightX`/`lightZ` is the point the vine pulls toward; `graph` persists across calls the
// same way it does for stepGrowthTips.
export function stepVineTips(state, size, tips, dt, lightX, lightZ, graph) {
  for (const tip of tips) {
    if (!tip.alive) continue;

    const step = SPEED * dt;
    let bestScore = -Infinity;
    let bestDirX = tip.dirX;
    let bestDirZ = tip.dirZ;
    for (const offset of CANDIDATE_ANGLES) {
      const baseAngle = Math.atan2(tip.dirZ, tip.dirX);
      const angle = baseAngle + offset;
      const dirX = Math.cos(angle);
      const dirZ = Math.sin(angle);
      const score = scoreVineDirection(state, size, tip.x, tip.z, dirX, dirZ, tip.dirX, tip.dirZ, lightX, lightZ, tip.attached, step);
      if (score > bestScore) {
        bestScore = score;
        bestDirX = dirX;
        bestDirZ = dirZ;
      }
    }
    if (bestScore === -Infinity) {
      tip.alive = false;
      continue;
    }

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

    const newX = Math.max(0, Math.min(1, tip.x + tip.dirX * step));
    const newZ = Math.max(0, Math.min(1, tip.z + tip.dirZ * step));
    // Same final tunnelling guard as stepGrowthTips: the turn-rate cap means this tick's actual
    // heading can still differ from the validated best candidate, so re-check the ACTUAL landing
    // point before committing to it, independent of which candidate scored best.
    if (sampleField(state, size, FIELD.COMPACTION, newX, newZ) >= COMPACTION_STOP) continue;
    tip.x = newX;
    tip.z = newZ;

    if (neighborSupport(state, size, tip.x, tip.z) >= VINE_ATTACH_THRESHOLD) tip.attached = true;

    tip.nodeId = addGraphNode(graph, tip.x, tip.z, nodeRadius(1), tip.nodeId);
  }
}

// ---------------------------------------------------------------------------------------------
// Plant life-state -- "Test C: Bloom/Wilt" from the user's plan, section 9. A plant's metabolic
// state (water, energy, health, age, stress, growth, bloom) reacting to the world over time, so
// events read as state SEQUENCES ("moisture up -> water up -> stress down -> growth up") rather
// than as scripted animations triggered by name. Deliberately a simple leaky-bucket/first-order
// model, not real plant physiology -- section 11 of the user's own plan explicitly rules out
// simulating cellular respiration; this tracks only the variables a player could actually
// perceive (is it thriving, stressed, blooming, dying), driven by two real inputs: local moisture
// (WETNESS, the same field the root tips already read) and local light (an already-combined
// irradiance value in [0,1] -- world-sandbox-light.mjs's computeSunVisibility/computeSkyExposure
// are the honest way to produce one; this function stays decoupled from exactly how the caller
// got it, the same way it doesn't care how `moisture` was sampled either). Both are required, no
// silent default -- a light-less call would silently make every plant photosynthesize in the
// dark, which is exactly the kind of invented-physics shortcut this module has avoided
// everywhere else. Nutrients/temperature inputs are real, named follow-ups.
//
// Whole-plant, not per-node: this models ONE life-state object per plant (the thing a species
// profile, later, would attach to), separate from the growth tips/graph above. A future
// integration point (not built here) would let health/stress feed back into tip behaviour
// (e.g. a stressed plant's tips stop branching) and vice versa.

const LIFE_WATER_TRACK_RATE = 0.6; // how fast stored water chases ambient moisture
const LIFE_STRESS_TRACK_RATE = 0.5; // how fast stress chases its water-derived target
const LIFE_STRESS_WATER_THRESHOLD = 0.35; // water below this starts building stress
const LIFE_HEALTH_STRESS_DRAIN = 0.05; // health lost per second at full sustained stress
const LIFE_HEALTH_RECOVER_RATE = 0.03; // health regained per second when calm and watered
const LIFE_ENERGY_PRODUCTION = 0.4; // energy gained per second at full water, zero stress
const LIFE_ENERGY_UPKEEP = 0.06; // baseline energy spent per second just staying alive
const LIFE_GROWTH_RATE = 0.5; // growth signal scale from (water, energy, calm)
const LIFE_WILT_STRESS_THRESHOLD = 0.6; // stress above this reads as visibly wilting
const LIFE_BLOOM_AGE_THRESHOLD = 30; // simulated seconds before a plant can bloom at all
const LIFE_BLOOM_ENERGY_THRESHOLD = 0.6;
const LIFE_BLOOM_STRESS_MAX = 0.3; // can't bloom while meaningfully stressed
const LIFE_DEAD_DRY_RATE = 0.15; // dead wood's stored water drains toward 0 (drying, section 9)

export function createPlantLifeState() {
  return {
    water: 0.5, energy: 0.5, health: 1, age: 0, stress: 0, growth: 0, bloom: false,
    alive: true,
  };
}

// Advances `life` by `dt` seconds against two real inputs: `moisture` (the caller samples
// WETNESS at the plant's own position -- same field root tips already read) and `light` (an
// already-combined [0,1] irradiance value, e.g. from world-sandbox-light.mjs's
// computeSunVisibility/computeSkyExposure -- no new field invented). Mutates `life` in place;
// returns nothing, matching stepGrowthTips/stepVineTips.
export function stepPlantLifeState(life, dt, moisture, light) {
  life.age += dt;

  if (!life.alive) {
    // "Dead wood persists" (section 9): not deleted, not frozen either -- it keeps drying out
    // and stays inert. No growth, no bloom, no metabolic recovery.
    life.water = Math.max(0, life.water - LIFE_DEAD_DRY_RATE * dt);
    life.growth = 0;
    life.bloom = false;
    return;
  }

  // Water tracks ambient moisture with inertia (a leaky bucket, not an instant copy) -- this is
  // what makes "Regen"/"Dürre" read as a state that BUILDS over the event's duration rather than
  // snapping the instant the rain starts or stops.
  life.water += (moisture - life.water) * Math.min(1, LIFE_WATER_TRACK_RATE * dt);
  life.water = Math.max(0, Math.min(1, life.water));

  // Stress rises toward a target set by how far water is below the threshold, falls toward 0
  // once water is adequate again -- this single relationship is what "Regen: stress ↓" and
  // "Dürre: stress ↑" both fall out of, driven by the same water value, not two separate rules.
  const stressTarget = Math.max(0, (LIFE_STRESS_WATER_THRESHOLD - life.water) / LIFE_STRESS_WATER_THRESHOLD);
  life.stress += (stressTarget - life.stress) * Math.min(1, LIFE_STRESS_TRACK_RATE * dt);
  life.stress = Math.max(0, Math.min(1, life.stress));

  // Energy production needs water, light, AND calm (low stress) all at once -- photosynthesis-
  // shaped without claiming to BE photosynthesis. A perfectly watered, perfectly calm plant
  // sitting in total darkness (light=0) now produces nothing, same as one sitting dry in full
  // sun -- light is a real multiplier here, not decoration; upkeep is constant regardless, so a
  // plant with no water OR no light still runs its energy down even doing nothing.
  const calm = 1 - life.stress;
  const produced = LIFE_ENERGY_PRODUCTION * life.water * light * calm * dt;
  life.energy = Math.max(0, Math.min(1, life.energy + produced - LIFE_ENERGY_UPKEEP * dt));

  // Health drains under sustained stress, recovers slowly when calm and watered -- a single bad
  // moment doesn't kill a plant, but sustained drought does, matching "Tod... nicht einfach
  // delete plant" needing an actual accumulated cause, not an instant threshold trip.
  if (life.stress > 0) {
    life.health -= LIFE_HEALTH_STRESS_DRAIN * life.stress * dt;
  } else if (life.water > LIFE_STRESS_WATER_THRESHOLD) {
    life.health += LIFE_HEALTH_RECOVER_RATE * dt;
  }
  life.health = Math.max(0, Math.min(1, life.health));
  if (life.health <= 0) {
    life.alive = false;
    life.growth = 0;
    life.bloom = false;
    return;
  }

  // Growth is suppressed by wilting (visible stress) even before health itself is threatened --
  // "Welken: growth ↓" as its own earlier consequence of stress, not just a side effect of
  // eventual health loss.
  const wilting = life.stress > LIFE_WILT_STRESS_THRESHOLD;
  life.growth = wilting ? 0 : LIFE_GROWTH_RATE * life.water * life.energy * calm;

  // Bloom requires real maturity (age), spare capacity (energy) AND calm (low stress) all at
  // once -- age alone or energy alone is not enough, matching the user's own conjunction
  // ("age > threshold, energy high, ... suitable"); a bloom that starts wilting (stress climbs
  // past the wilt threshold) closes again rather than staying open through visible distress.
  if (!life.bloom) {
    if (life.age > LIFE_BLOOM_AGE_THRESHOLD && life.energy > LIFE_BLOOM_ENERGY_THRESHOLD && life.stress < LIFE_BLOOM_STRESS_MAX) {
      life.bloom = true;
    }
  } else if (wilting) {
    life.bloom = false;
  }
}
