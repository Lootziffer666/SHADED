// SHADED Spatial Kernel — CellularGeometrySolver (proof-of-concept, not yet
// wired into any production path).
//
// Tests a specific hypothesis: local, deterministic agent rules acting on a
// scalar field can produce geometry-relevant structure (sharper edges,
// plausible accumulation/erosion patterns) when seeded from REAL, already-
// observed data (an existing depth map) instead of a blank grid. This is the
// smallest possible step toward "Observed Surface -> Cellular Completion
// Field -> Geometry" (docs/sdf-geometrie-stand-2026.md calls this path
// "generative Completion", one of the sanctioned ways to resolve UNKNOWN
// space -- never OBSERVED/MEASURED on its own).
//
// Deliberately NOT: a new world-law system, a replacement for
// runtime/spatial-kernel/world-law-solver.js (fields + behavior), a 3D voxel/
// SDF integration, or a marching-cubes pipeline. Those are only worth
// building if this 2D spike shows real structure. Pure ESM, no DOM/WebGL,
// deterministic via the same mulberry32 RNG the rest of runtime/spatial-kernel
// and runtime/style already share (no third reimplementation).

import { mulberry32 } from './world-fields.js';

export const AGENT_TYPES = Object.freeze({ GROW: 'GROW', ERODE: 'ERODE', SMOOTH: 'SMOOTH' });

function clampCoord(v, max) { return Math.max(0, Math.min(max - 1, v)); }
function idx(field, x, y) { return y * field.width + x; }

export function createHeightField(width, height, values) {
  const out = new Float32Array(width * height);
  if (values) for (let i = 0; i < out.length; i++) out[i] = values[i] ?? 0;
  return { width, height, values: out };
}

export function cloneHeightField(field) {
  return { width: field.width, height: field.height, values: Float32Array.from(field.values) };
}

function neighborAverage(field, x, y) {
  let sum = 0, count = 0;
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
    if (dx === 0 && dy === 0) continue;
    const nx = x + dx, ny = y + dy;
    if (nx < 0 || ny < 0 || nx >= field.width || ny >= field.height) continue;
    sum += field.values[idx(field, nx, ny)]; count++;
  }
  return count ? sum / count : field.values[idx(field, x, y)];
}

// Gradient-biased step (not a random walk): among the 8 neighbors, move
// toward the lowest (GROW seeks low cells to fill, per the maintainer's own
// operator description) or highest (ERODE seeks high cells to wear down)
// value. `randomness` keeps agents from freezing at the first local extremum.
function gradientStep(field, x, y, seekHigh, rng, randomness) {
  if (rng() < randomness) {
    const dx = Math.floor(rng() * 3) - 1, dy = Math.floor(rng() * 3) - 1;
    return [clampCoord(x + dx, field.width), clampCoord(y + dy, field.height)];
  }
  let best = null, bestVal = seekHigh ? -Infinity : Infinity;
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
    if (dx === 0 && dy === 0) continue;
    const nx = x + dx, ny = y + dy;
    if (nx < 0 || ny < 0 || nx >= field.width || ny >= field.height) continue;
    const v = field.values[idx(field, nx, ny)];
    if (seekHigh ? v > bestVal : v < bestVal) { bestVal = v; best = [nx, ny]; }
  }
  return best || [x, y];
}

export function createAgent(type, x, y) { return { type, x, y }; }

// Deterministic population: weighted GROW/ERODE/SMOOTH mix at random
// positions from the SAME seeded RNG the solver itself uses.
export function seedAgents(field, count, rng) {
  const agents = [];
  for (let i = 0; i < count; i++) {
    const roll = rng();
    const type = roll < 0.4 ? AGENT_TYPES.GROW : roll < 0.8 ? AGENT_TYPES.ERODE : AGENT_TYPES.SMOOTH;
    agents.push(createAgent(type, Math.floor(rng() * field.width), Math.floor(rng() * field.height)));
  }
  return agents;
}

// One synchronous pass over all agents, plus the "a cell hitting 0 spawns a
// fresh operator" rule from the maintainer's original description (capped by
// maxAgents so the population can't run away).
export function stepCellularGeometry(field, agents, rng, options = {}) {
  const {
    growRate = 0.05, erodeRate = 0.05, smoothFactor = 0.35,
    randomness = 0.12, spawnOnEmpty = true, maxAgents = 500, spawnChance = 0.01,
  } = options;
  for (const agent of agents) {
    if (agent.type === AGENT_TYPES.GROW) {
      const [nx, ny] = gradientStep(field, agent.x, agent.y, false, rng, randomness);
      agent.x = nx; agent.y = ny;
      const j = idx(field, agent.x, agent.y);
      field.values[j] = Math.min(1, field.values[j] + growRate);
    } else if (agent.type === AGENT_TYPES.ERODE) {
      const [nx, ny] = gradientStep(field, agent.x, agent.y, true, rng, randomness);
      agent.x = nx; agent.y = ny;
      const j = idx(field, agent.x, agent.y);
      field.values[j] = Math.max(0, field.values[j] - erodeRate);
    } else if (agent.type === AGENT_TYPES.SMOOTH) {
      const j = idx(field, agent.x, agent.y);
      const avg = neighborAverage(field, agent.x, agent.y);
      field.values[j] += (avg - field.values[j]) * smoothFactor;
      const dx = Math.floor(rng() * 3) - 1, dy = Math.floor(rng() * 3) - 1;
      agent.x = clampCoord(agent.x + dx, field.width);
      agent.y = clampCoord(agent.y + dy, field.height);
    }
  }
  if (spawnOnEmpty && agents.length < maxAgents) {
    for (let y = 0; y < field.height && agents.length < maxAgents; y++) {
      for (let x = 0; x < field.width && agents.length < maxAgents; x++) {
        if (field.values[idx(field, x, y)] <= 0 && rng() < spawnChance) {
          const roll = rng();
          const type = roll < 0.5 ? AGENT_TYPES.GROW : roll < 0.85 ? AGENT_TYPES.ERODE : AGENT_TYPES.SMOOTH;
          agents.push(createAgent(type, x, y));
        }
      }
    }
  }
  return agents;
}

export function runCellularGeometry(field, agents, seed, steps, options = {}) {
  const rng = mulberry32(seed);
  for (let s = 0; s < steps; s++) stepCellularGeometry(field, agents, rng, options);
  return field;
}

// Cheap edge-strength proxy (sum of 4-neighbor absolute differences), used to
// give the proof-of-concept a NUMBER, not just a picture -- "sinnvollere
// Kanten" should be measurable, not just asserted.
export function edgeEnergy(field) {
  let sum = 0;
  for (let y = 0; y < field.height; y++) {
    for (let x = 0; x < field.width; x++) {
      const v = field.values[idx(field, x, y)];
      if (x + 1 < field.width) sum += Math.abs(v - field.values[idx(field, x + 1, y)]);
      if (y + 1 < field.height) sum += Math.abs(v - field.values[idx(field, x, y + 1)]);
    }
  }
  return sum;
}

// --- Residual variant (follow-up test) -------------------------------------
// The direct-mutation solver above (stepCellularGeometry) only proves agents
// CAN change a height field -- the result read as a high-frequency artifact,
// not plausible structure, because nothing protected the field's existing
// edges and agents rewrote absolute values outright. This variant is the one
// permitted next step: agents accumulate into a bounded RESIDUAL layered on
// top of a frozen base, and a per-cell edit weight (low at strong existing
// edges, high in flat regions) damps that residual near real structure.
// Still not wired into production; still not a 3D/voxel/SDF step.

function sampleClamped(values, width, height, x, y) {
  const cx = Math.max(0, Math.min(width - 1, x));
  const cy = Math.max(0, Math.min(height - 1, y));
  return values[cy * width + cx];
}

// Central-difference gradient magnitude -- cheap edge detector, used only to
// decide where agents are allowed to act, never to decide WHAT the geometry
// should become.
export function computeEdgeMagnitude(field) {
  const { width, height, values } = field;
  const out = new Float32Array(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const gx = sampleClamped(values, width, height, x + 1, y) - sampleClamped(values, width, height, x - 1, y);
      const gy = sampleClamped(values, width, height, x, y + 1) - sampleClamped(values, width, height, x, y - 1);
      out[y * width + x] = Math.sqrt(gx * gx + gy * gy);
    }
  }
  return out;
}

// 1 = fully editable (flat region), approaching minWeight at strong edges.
// Never exactly 0: a hard wall would just move the artifact to the mask's
// own boundary instead of removing it.
export function computeEditWeight(field, options = {}) {
  const { edgeScale = 0.12, gamma = 1.5, minWeight = 0.03 } = options;
  const edgeMag = computeEdgeMagnitude(field);
  const out = new Float32Array(edgeMag.length);
  for (let i = 0; i < edgeMag.length; i++) {
    const t = Math.min(1, edgeMag[i] / edgeScale);
    out[i] = Math.max(minWeight, (1 - t) ** gamma);
  }
  return out;
}

// base: frozen, never written. residual: bounded delta agents accumulate
// into. values: base+residual, clamped -- the only array agents READ (so
// they still react to their own prior changes, same as the direct solver).
export function createResidualState(field) {
  return {
    width: field.width,
    height: field.height,
    base: Float32Array.from(field.values),
    residual: new Float32Array(field.width * field.height),
    values: Float32Array.from(field.values),
  };
}

export function stepResidualCellularGeometry(state, agents, editWeight, rng, options = {}) {
  const {
    growRate = 0.02, erodeRate = 0.02, smoothFactor = 0.2,
    randomness = 0.05, maxResidual = 0.15,
  } = options;
  const view = { width: state.width, height: state.height, values: state.values };
  const applyDelta = (x, y, delta) => {
    const j = y * state.width + x;
    const w = editWeight[j];
    const next = state.residual[j] + delta * w;
    state.residual[j] = Math.max(-maxResidual, Math.min(maxResidual, next));
    state.values[j] = Math.max(0, Math.min(1, state.base[j] + state.residual[j]));
  };
  for (const agent of agents) {
    if (agent.type === AGENT_TYPES.GROW) {
      const [nx, ny] = gradientStep(view, agent.x, agent.y, false, rng, randomness);
      agent.x = nx; agent.y = ny;
      applyDelta(agent.x, agent.y, growRate);
    } else if (agent.type === AGENT_TYPES.ERODE) {
      const [nx, ny] = gradientStep(view, agent.x, agent.y, true, rng, randomness);
      agent.x = nx; agent.y = ny;
      applyDelta(agent.x, agent.y, -erodeRate);
    } else if (agent.type === AGENT_TYPES.SMOOTH) {
      const avg = neighborAverage(view, agent.x, agent.y);
      const j = idx(view, agent.x, agent.y);
      const delta = (avg - view.values[j]) * smoothFactor;
      applyDelta(agent.x, agent.y, delta);
      const dx = Math.floor(rng() * 3) - 1, dy = Math.floor(rng() * 3) - 1;
      agent.x = clampCoord(agent.x + dx, state.width);
      agent.y = clampCoord(agent.y + dy, state.height);
    }
  }
  return agents;
}

export function runResidualCellularGeometry(field, agents, seed, steps, options = {}) {
  const rng = mulberry32(seed);
  const state = createResidualState(field);
  const editWeight = computeEditWeight(field, options.edgeProtection);
  for (let s = 0; s < steps; s++) stepResidualCellularGeometry(state, agents, editWeight, rng, options);
  return { base: state.base, residual: state.residual, output: state.values, editWeight };
}

// --- Bounded-movement residual variant (2nd follow-up test) ----------------
// The plain residual variant above damped WRITE amplitude near edges but
// left MOVEMENT unconstrained -- GROW/ERODE are gradient-seeking, and a real
// structural depth edge is exactly the strongest local extremum in the
// scene, so agents beelined to edges and re-visited them for the full run,
// tracing the protected contours despite the write damping (measured:
// protected/flat edge-change ratio 3.45, i.e. worse than unprotected). This
// variant fixes the mechanism agents used to find edges attractive, not just
// the amount they could write once there:
//   - low-edit-weight cells are a hard MOVEMENT barrier (excluded from the
//     candidate set entirely), not merely a low-write cell;
//   - GROW/ERODE/SMOOTH search only within their current connected editable
//     region (flood-filled from the edit-weight mask) -- they cannot step
//     across a structural boundary into a different surface;
//   - a large relief jump between adjacent cells is rejected outright, a
//     second, independent guard against crossing structure even inside one
//     region's 8-connectivity;
//   - GROW/ERODE steer on RELIEF (value minus a fixed low-frequency blur of
//     the base, i.e. depth detrended against its own local surface trend),
//     not absolute depth -- so a global slope from near to far ground is not
//     itself treated as "the edge to seek".
// An agent that spawns ON a protected cell gets one region-unconstrained
// bootstrap move onto the nearest editable cell, then is confined like any
// other agent -- otherwise a fraction of the population would be permanently
// stuck at t=0.

export function boxBlur(values, width, height, radius) {
  const integral = new Float64Array((width + 1) * (height + 1));
  for (let y = 0; y < height; y++) {
    let rowSum = 0;
    for (let x = 0; x < width; x++) {
      rowSum += values[y * width + x];
      integral[(y + 1) * (width + 1) + (x + 1)] = integral[y * (width + 1) + (x + 1)] + rowSum;
    }
  }
  const out = new Float32Array(width * height);
  for (let y = 0; y < height; y++) {
    const y0 = Math.max(0, y - radius), y1 = Math.min(height - 1, y + radius);
    for (let x = 0; x < width; x++) {
      const x0 = Math.max(0, x - radius), x1 = Math.min(width - 1, x + radius);
      const A = integral[y0 * (width + 1) + x0];
      const B = integral[y0 * (width + 1) + (x1 + 1)];
      const C = integral[(y1 + 1) * (width + 1) + x0];
      const D = integral[(y1 + 1) * (width + 1) + (x1 + 1)];
      const count = (x1 - x0 + 1) * (y1 - y0 + 1);
      out[y * width + x] = (D - B - C + A) / count;
    }
  }
  return out;
}

// 4-connected flood fill over cells with editWeight >= barrierWeight.
// -1 = barrier (not part of any editable surface region).
export function segmentEditableRegions(editWeight, width, height, barrierWeight) {
  const regionIds = new Int32Array(width * height).fill(-1);
  let nextId = 0;
  const stack = [];
  for (let start = 0; start < width * height; start++) {
    if (regionIds[start] !== -1 || editWeight[start] < barrierWeight) continue;
    const id = nextId++;
    stack.length = 0;
    stack.push(start);
    regionIds[start] = id;
    while (stack.length) {
      const cur = stack.pop();
      const cx = cur % width, cy = (cur / width) | 0;
      const neighbors = [[cx - 1, cy], [cx + 1, cy], [cx, cy - 1], [cx, cy + 1]];
      for (const [nx, ny] of neighbors) {
        if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
        const j = ny * width + nx;
        if (regionIds[j] !== -1 || editWeight[j] < barrierWeight) continue;
        regionIds[j] = id;
        stack.push(j);
      }
    }
  }
  return regionIds;
}

function boundedGradientStep(state, lowFreqBase, editWeight, regionIds, x, y, seekHigh, rng, opts) {
  const { randomness, barrierWeight, maxCrossJump } = opts;
  const w = state.width, h = state.height;
  const curIdx = y * w + x;
  const curRegion = regionIds[curIdx];
  const curRelief = state.values[curIdx] - lowFreqBase[curIdx];
  const valid = [], bootstrap = [];
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
    if (dx === 0 && dy === 0) continue;
    const nx = x + dx, ny = y + dy;
    if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
    const j = ny * w + nx;
    if (editWeight[j] < barrierWeight) continue;
    const relief = state.values[j] - lowFreqBase[j];
    bootstrap.push({ nx, ny, relief });
    if (curRegion !== -1 && regionIds[j] !== curRegion) continue;
    if (Math.abs(relief - curRelief) > maxCrossJump) continue;
    valid.push({ nx, ny, relief });
  }
  const pool = valid.length ? valid : bootstrap;
  if (!pool.length) return [x, y];
  if (rng() < randomness) { const p = pool[Math.floor(rng() * pool.length)]; return [p.nx, p.ny]; }
  let best = pool[0];
  for (const c of pool) if (seekHigh ? c.relief > best.relief : c.relief < best.relief) best = c;
  return [best.nx, best.ny];
}

function regionNeighborAverage(state, editWeight, regionIds, x, y, barrierWeight) {
  const w = state.width, h = state.height;
  const curRegion = regionIds[y * w + x];
  let sum = 0, count = 0;
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
    if (dx === 0 && dy === 0) continue;
    const nx = x + dx, ny = y + dy;
    if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
    const j = ny * w + nx;
    if (editWeight[j] < barrierWeight) continue;
    if (curRegion !== -1 && regionIds[j] !== curRegion) continue;
    sum += state.values[j]; count++;
  }
  return count ? sum / count : state.values[y * w + x];
}

function boundedJitter(state, editWeight, regionIds, x, y, rng, barrierWeight) {
  const w = state.width, h = state.height;
  const curRegion = regionIds[y * w + x];
  const valid = [], bootstrap = [];
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
    const nx = x + dx, ny = y + dy;
    if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
    const j = ny * w + nx;
    if (editWeight[j] < barrierWeight) continue;
    bootstrap.push([nx, ny]);
    if (curRegion === -1 || regionIds[j] === curRegion) valid.push([nx, ny]);
  }
  const pool = valid.length ? valid : bootstrap.length ? bootstrap : [[x, y]];
  return pool[Math.floor(rng() * pool.length)];
}

function stepBoundedResidualCellularGeometry(state, agents, editWeight, regionIds, lowFreqBase, rng, opts) {
  const { growRate, erodeRate, smoothFactor, randomness, maxResidual, barrierWeight, maxCrossJump } = opts;
  const applyDelta = (x, y, delta) => {
    const j = y * state.width + x;
    const w = editWeight[j];
    const next = state.residual[j] + delta * w;
    state.residual[j] = Math.max(-maxResidual, Math.min(maxResidual, next));
    state.values[j] = Math.max(0, Math.min(1, state.base[j] + state.residual[j]));
  };
  for (const agent of agents) {
    if (agent.type === AGENT_TYPES.GROW) {
      const [nx, ny] = boundedGradientStep(state, lowFreqBase, editWeight, regionIds, agent.x, agent.y, false, rng, { randomness, barrierWeight, maxCrossJump });
      agent.x = nx; agent.y = ny;
      applyDelta(agent.x, agent.y, growRate);
    } else if (agent.type === AGENT_TYPES.ERODE) {
      const [nx, ny] = boundedGradientStep(state, lowFreqBase, editWeight, regionIds, agent.x, agent.y, true, rng, { randomness, barrierWeight, maxCrossJump });
      agent.x = nx; agent.y = ny;
      applyDelta(agent.x, agent.y, -erodeRate);
    } else if (agent.type === AGENT_TYPES.SMOOTH) {
      const avg = regionNeighborAverage(state, editWeight, regionIds, agent.x, agent.y, barrierWeight);
      const j = agent.y * state.width + agent.x;
      applyDelta(agent.x, agent.y, (avg - state.values[j]) * smoothFactor);
      const [nx, ny] = boundedJitter(state, editWeight, regionIds, agent.x, agent.y, rng, barrierWeight);
      agent.x = nx; agent.y = ny;
    }
  }
  return agents;
}

export function runBoundedResidualCellularGeometry(field, agents, seed, steps, options = {}) {
  const {
    growRate = 0.02, erodeRate = 0.02, smoothFactor = 0.2, randomness = 0.05,
    maxResidual = 0.15, barrierWeight = 0.15, maxCrossJump = 0.05, blurRadius = 10,
    edgeProtection = {},
  } = options;
  const rng = mulberry32(seed);
  const state = createResidualState(field);
  const editWeight = computeEditWeight(field, edgeProtection);
  const regionIds = segmentEditableRegions(editWeight, field.width, field.height, barrierWeight);
  const lowFreqBase = boxBlur(state.base, field.width, field.height, blurRadius);
  const stepOpts = { growRate, erodeRate, smoothFactor, randomness, maxResidual, barrierWeight, maxCrossJump };
  for (let s = 0; s < steps; s++) stepBoundedResidualCellularGeometry(state, agents, editWeight, regionIds, lowFreqBase, rng, stepOpts);
  return {
    base: state.base, residual: state.residual, output: state.values, editWeight, regionIds, lowFreqBase,
  };
}

// --- Gated / kernel-stamp variant (3rd follow-up test) ----------------------
// The bounded-movement variant fixed leakage but not the visible artifact:
// GROW/ERODE still wrote a small delta at EVERY step of every move, so a
// converged agent still painted its whole path -- just now confined inside
// one surface instead of along its boundary, which reads as dendritic veins
// instead of contour tracing. Root cause: movement and modification were the
// same event. This variant separates them completely --
//   - agents SEARCH every step (same barrier + region + relief rules as the
//     bounded variant) and that search writes NOTHING;
//   - GROW/ERODE only deposit/remove when the current cell actually
//     qualifies as a local relief extremum in its own neighborhood -- a rare
//     event, not a per-step one;
//   - SMOOTH is no longer a moving brush at all: it only acts where local
//     roughness (variance in a small window) exceeds a threshold, i.e. where
//     there is something to smooth;
//   - every action, when it fires, is a small radial KERNEL stamp centered
//     on the qualifying cell (cone falloff, clamped to the same barrier +
//     region membership), not a single-pixel write -- so even several
//     qualifying hits near each other merge into one blob, not a line.

function regionWindowRelief(state, lowFreqBase, editWeight, regionIds, x, y, radius, barrierWeight) {
  const w = state.width, h = state.height;
  const curRegion = regionIds[y * w + x];
  const values = [];
  for (let dy = -radius; dy <= radius; dy++) for (let dx = -radius; dx <= radius; dx++) {
    const nx = x + dx, ny = y + dy;
    if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
    const j = ny * w + nx;
    if (editWeight[j] < barrierWeight) continue;
    if (curRegion !== -1 && regionIds[j] !== curRegion) continue;
    values.push(state.values[j] - lowFreqBase[j]);
  }
  return values;
}

function isQualifyingExtremum(windowRelief, currentRelief, seekHigh, tolerance) {
  if (!windowRelief.length) return false;
  let extreme = windowRelief[0];
  for (const v of windowRelief) if (seekHigh ? v > extreme : v < extreme) extreme = v;
  return seekHigh ? currentRelief >= extreme - tolerance : currentRelief <= extreme + tolerance;
}

function regionWindowVarianceAndMean(state, editWeight, regionIds, x, y, radius, barrierWeight) {
  const w = state.width, h = state.height;
  const curRegion = regionIds[y * w + x];
  const values = [];
  for (let dy = -radius; dy <= radius; dy++) for (let dx = -radius; dx <= radius; dx++) {
    const nx = x + dx, ny = y + dy;
    if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
    const j = ny * w + nx;
    if (editWeight[j] < barrierWeight) continue;
    if (curRegion !== -1 && regionIds[j] !== curRegion) continue;
    values.push(state.values[j]);
  }
  if (!values.length) return { mean: 0, variance: 0, count: 0 };
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance = values.reduce((a, b) => a + (b - mean) ** 2, 0) / values.length;
  return { mean, variance, count: values.length };
}

// Circular cone-falloff stamp, clamped to barrier + region membership at
// EACH target cell individually (not just the center) -- a kernel centered
// just inside a region boundary must not spill its edge lobes across it.
function applyKernelStamp(state, editWeight, regionIds, cx, cy, radius, barrierWeight, maxResidual, magnitudeFn) {
  const w = state.width, h = state.height;
  const curRegion = regionIds[cy * w + cx];
  for (let dy = -radius; dy <= radius; dy++) for (let dx = -radius; dx <= radius; dx++) {
    const dist2 = dx * dx + dy * dy;
    if (dist2 > radius * radius) continue;
    const nx = cx + dx, ny = cy + dy;
    if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
    const j = ny * w + nx;
    if (editWeight[j] < barrierWeight) continue;
    if (curRegion !== -1 && regionIds[j] !== curRegion) continue;
    const weight = Math.max(0, 1 - dist2 / (radius * radius + 1));
    const delta = magnitudeFn(nx, ny, weight);
    if (!delta) continue;
    const ew = editWeight[j];
    const next = state.residual[j] + delta * ew;
    state.residual[j] = Math.max(-maxResidual, Math.min(maxResidual, next));
    state.values[j] = Math.max(0, Math.min(1, state.base[j] + state.residual[j]));
  }
}

function stepGatedKernelCellularGeometry(state, agents, editWeight, regionIds, lowFreqBase, rng, opts) {
  const {
    growRate, erodeRate, smoothFactor, randomness, maxResidual, barrierWeight, maxCrossJump,
    extremumRadius, extremumTolerance, kernelRadius, roughnessRadius, roughnessThreshold,
  } = opts;
  for (const agent of agents) {
    if (agent.type === AGENT_TYPES.GROW || agent.type === AGENT_TYPES.ERODE) {
      const seekHigh = agent.type === AGENT_TYPES.ERODE;
      const [nx, ny] = boundedGradientStep(state, lowFreqBase, editWeight, regionIds, agent.x, agent.y, seekHigh, rng, { randomness, barrierWeight, maxCrossJump });
      agent.x = nx; agent.y = ny;
      const cidx = agent.y * state.width + agent.x;
      const curRelief = state.values[cidx] - lowFreqBase[cidx];
      const window = regionWindowRelief(state, lowFreqBase, editWeight, regionIds, agent.x, agent.y, extremumRadius, barrierWeight);
      if (isQualifyingExtremum(window, curRelief, seekHigh, extremumTolerance)) {
        const rate = seekHigh ? -erodeRate : growRate;
        applyKernelStamp(state, editWeight, regionIds, agent.x, agent.y, kernelRadius, barrierWeight, maxResidual, (nx2, ny2, weight) => rate * weight);
      }
    } else if (agent.type === AGENT_TYPES.SMOOTH) {
      const [nx, ny] = boundedJitter(state, editWeight, regionIds, agent.x, agent.y, rng, barrierWeight);
      agent.x = nx; agent.y = ny;
      const { mean, variance } = regionWindowVarianceAndMean(state, editWeight, regionIds, agent.x, agent.y, roughnessRadius, barrierWeight);
      if (variance > roughnessThreshold) {
        applyKernelStamp(state, editWeight, regionIds, agent.x, agent.y, kernelRadius, barrierWeight, maxResidual, (nx2, ny2, weight) => {
          const j2 = ny2 * state.width + nx2;
          return (mean - state.values[j2]) * smoothFactor * weight;
        });
      }
    }
  }
  return agents;
}

export function runGatedKernelCellularGeometry(field, agents, seed, steps, options = {}) {
  const {
    growRate = 0.05, erodeRate = 0.05, smoothFactor = 0.3, randomness = 0.05,
    maxResidual = 0.15, barrierWeight = 0.15, maxCrossJump = 0.05, blurRadius = 10,
    extremumRadius = 1, extremumTolerance = 0.01, kernelRadius = 2,
    roughnessRadius = 1, roughnessThreshold = 0.0006,
    edgeProtection = {},
  } = options;
  const rng = mulberry32(seed);
  const state = createResidualState(field);
  const editWeight = computeEditWeight(field, edgeProtection);
  const regionIds = segmentEditableRegions(editWeight, field.width, field.height, barrierWeight);
  const lowFreqBase = boxBlur(state.base, field.width, field.height, blurRadius);
  const stepOpts = {
    growRate, erodeRate, smoothFactor, randomness, maxResidual, barrierWeight, maxCrossJump,
    extremumRadius, extremumTolerance, kernelRadius, roughnessRadius, roughnessThreshold,
  };
  for (let s = 0; s < steps; s++) stepGatedKernelCellularGeometry(state, agents, editWeight, regionIds, lowFreqBase, rng, stepOpts);
  return {
    base: state.base, residual: state.residual, output: state.values, editWeight, regionIds, lowFreqBase,
  };
}

// Leakage: how much residual energy landed on cells the barrier was supposed
// to keep untouched. A near-zero result is expected BY CONSTRUCTION here
// (movement can't land on a barrier cell), so this is mainly a build-time
// sanity check that the barrier is actually wired in, not the acceptance
// metric itself (the edge-magnitude comparison in the driver is).
export function protectionLeakage(residual, editWeight, barrierWeight = 0.15) {
  let protectedEnergy = 0, totalEnergy = 0, protectedCount = 0;
  for (let i = 0; i < residual.length; i++) {
    const e = residual[i] * residual[i];
    totalEnergy += e;
    if (editWeight[i] < barrierWeight) { protectedEnergy += e; protectedCount++; }
  }
  return { protectedEnergy, totalEnergy, protectedCount, leakageFraction: totalEnergy > 0 ? protectedEnergy / totalEnergy : 0 };
}

// Guards against a degenerate "solver that changes nothing" trivially
// passing the leakage check: reports how much of the EDITABLE surface
// actually moved, not just how little of the protected surface did.
export function editableActivity(residual, editWeight, barrierWeight = 0.15, epsilon = 0.01) {
  let editableCount = 0, activeCount = 0, sumAbs = 0;
  for (let i = 0; i < residual.length; i++) {
    if (editWeight[i] < barrierWeight) continue;
    editableCount++;
    const a = Math.abs(residual[i]);
    sumAbs += a;
    if (a > epsilon) activeCount++;
  }
  return {
    editableCount, activeCount,
    activeFraction: editableCount ? activeCount / editableCount : 0,
    meanAbsResidual: editableCount ? sumAbs / editableCount : 0,
  };
}

export function fieldStats(field) {
  let min = Infinity, max = -Infinity, sum = 0;
  for (let i = 0; i < field.values.length; i++) {
    const v = field.values[i];
    if (v < min) min = v;
    if (v > max) max = v;
    sum += v;
  }
  const mean = sum / field.values.length;
  let variance = 0;
  for (let i = 0; i < field.values.length; i++) variance += (field.values[i] - mean) ** 2;
  variance /= field.values.length;
  return { min, max, mean, variance, edgeEnergy: edgeEnergy(field) };
}
