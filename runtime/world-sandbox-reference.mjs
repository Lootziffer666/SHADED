// SHADED coupled world sandbox — deterministic CPU reference kernel.
//
// The WebGPU implementation in world-sandbox-webgpu.mjs owns the interactive
// fast path.  This module deliberately contains the same field contract in
// plain JavaScript so invariants can be tested without a GPU and browsers
// without WebGPU still get a real (lower-resolution) simulation.

export const CELL_STRIDE = 22;

export const FIELD = Object.freeze({
  BEDROCK: 0,
  SAND: 1,
  COMPACTION: 2,
  WETNESS: 3,
  WATER: 4,
  VELOCITY_X: 5,
  VELOCITY_Z: 6,
  SEDIMENT: 7,
  BIOMASS: 8,
  SEEDS: 9,
  HEAT: 10,
  DISTURBANCE: 11,
  // Water cycle (Gas -> Kondensation -> Feuchte -> Eis -> Regen/Hagel/Schnee): a fourth,
  // independent reservoir set. VAPOR/CLOUD are atmospheric (unitless moisture "load", can
  // exceed 1); ICE is a 0..1 frozen fraction of the ground that suppresses flow/erosion in
  // sandFlux/edgeFlow; SNOW is a separate ground reservoir from WATER because it does not
  // flow the same way and melts back into WATER instead of draining through edgeFlow.
  VAPOR: 12,
  CLOUD: 13,
  ICE: 14,
  SNOW: 15,
  // Fifth reservoir set: combustion (fuel is BIOMASS itself, not a new stock) and deep water.
  // FIRE is a self-sustaining 0..1 intensity, not just "hot" -- see the combustion comment in
  // stepWorldReference. SMOKE parallels VAPOR/CLOUD (drifts with wind, thins over time) but is
  // its own reservoir since it is not water. ASH is inert burned residue that boosts future
  // soil fertility. GROUNDWATER is where infiltration actually goes instead of vanishing --
  // it seeps slowly between cells and can resurface as a spring instead of disappearing for good.
  FIRE: 16,
  SMOKE: 17,
  ASH: 18,
  GROUNDWATER: 19,
  // Sixth reservoir set: a real spatial wind field, not a uniform scalar. WIND_X/WIND_Z is the
  // local air-movement vector this cell actually carries -- it diffuses toward its neighbours
  // (gusts spread out), relaxes back toward env.wind/windDeg's prevailing direction (weather
  // "wants" to return to normal absent a disturbance), and gets pushed outward by nearby FIRE's
  // own heat gradient (a real fire generates its own outflow/updraft, it doesn't just sit in
  // whatever ambient breeze exists). Everything that used to read the uniform wind directly
  // (VAPOR/CLOUD/SMOKE drift, and now SNOW drift + fire spread's downwind bias) reads this
  // field instead, so gusts are visibly local and directional instead of one global number.
  WIND_X: 20,
  WIND_Z: 21,
});

export const STAMP = Object.freeze({
  SAND: 1,
  WATER: 2,
  SEED: 3,
  DIG: 4,
  HEAT: 5,
  TRAMPLE: 6,
  IMPACT: 7,
  // A magnifying glass, not a torch: unlike HEAT (an instant, sun-independent heat
  // injection), FOCUS only concentrates REAL sunlight -- its effect scales with env.sun,
  // so it does almost nothing on a dim/overcast setting. Held steadily over dry fuel, it
  // lets HEAT climb toward the same ignition threshold combustion already uses (~0.22 in
  // stepWorldReference's igniteRate) -- no new ignition logic, just a new, physically
  // gated heat source feeding the existing one.
  FOCUS: 8,
  // "Wasserbändigen" -- water swirled through the air, aimed by the stroke's own drag
  // direction (directionX/directionZ on the stamp, set by the caller from successive pointer
  // positions -- these fields already existed in the GPU stamp buffer's packing code, unused
  // until this).
  // Deliberately not a new erosion mechanic: this adds water (so there is something to erode)
  // and kicks VELOCITY_X/Z hard in the aimed direction, so the speed-driven erosion term
  // that already exists (erosion = min(sand, water * speed * ...) below) does the actual
  // cutting -- this tool just aims the physics that is already there, the same way STAMP.FOCUS
  // feeds the existing ignition threshold instead of adding a second one.
  CARVE: 9,
});

export const DEFAULT_ENVIRONMENT = Object.freeze({
  rain: 0,
  sun: 0.64,
  temperature: 0.52,
  evaporation: 0.018,
  permeability: 0.052,
  sandRate: 2.35,
  waterRate: 5.4,
  growthRate: 0.21,
  // Wind: the PREVAILING direction/strength the local WIND_X/WIND_Z field (FIELD.WIND_X/Z)
  // relaxes toward absent a local disturbance -- not applied directly to any field itself
  // anymore (see FIELD.WIND_X's comment). Magnitude 0..1, direction in degrees (0 = +x).
  wind: 0.3,
  windDeg: 45,
});

const clamp = (value, low = 0, high = 1) => Math.max(low, Math.min(high, value));
// A physically sane ceiling on standing water depth at any one cell -- see the STAMP.WATER
// case in applyStamps for why this exists (repeated stamping had no upper bound at all).
const MAX_WATER_DEPTH = 1.2;
const smoothstep = (a, b, value) => {
  const t = clamp((value - a) / Math.max(1e-8, b - a));
  return t * t * (3 - 2 * t);
};

export function mulberry32(seed) {
  let value = seed >>> 0;
  return () => {
    value |= 0;
    value = (value + 0x6D2B79F5) | 0;
    let t = Math.imul(value ^ (value >>> 15), 1 | value);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function cellOffset(size, x, z) {
  const cx = Math.max(0, Math.min(size - 1, x | 0));
  const cz = Math.max(0, Math.min(size - 1, z | 0));
  return (cz * size + cx) * CELL_STRIDE;
}

// Dune shaping (sand donor: keaukraine/webgl-dunes, MIT -- verified in docs/sandbox-element-
// license-audit.md). The donor's live-shader technique (vSlopeCoeff from normal-vs-wind dot
// products, stretched windward/leeward UVs) is reimplemented here as a static heightfield
// profile, since this is a CPU/GPU-shared terrain generator, not a per-frame shader: a real
// dune's windward face is long and gentle (sand creeping uphill grain by grain) and its
// leeward face is short and steep (avalanching at the angle of repose), so a periodic ridge
// gets an ASYMMETRIC profile rather than a symmetric sine wave.
function duneProfile(t) {
  const local = t - Math.floor(t);
  if (local < 0.72) {
    const u = local / 0.72;
    return u * u * (3 - 2 * u);
  }
  const u = (local - 0.72) / 0.28;
  return 1 - u * u * (3 - 2 * u);
}

function generateDunes(state, size, random, windDeg = 34) {
  const windAngle = (windDeg * Math.PI) / 180;
  const wind = [Math.cos(windAngle), Math.sin(windAngle)];
  const windPerp = [-wind[1], wind[0]];
  const warpA = random() * 1000;
  const warpB = random() * 1000;
  for (let z = 0; z < size; z++) {
    for (let x = 0; x < size; x++) {
      const nx = (x + 0.5) / size;
      const nz = (z + 0.5) / size;
      const o = cellOffset(size, x, z);
      const along = nx * wind[0] + nz * wind[1];
      const across = nx * windPerp[0] + nz * windPerp[1];
      // Real transverse dune fields snake rather than running in perfectly straight lines.
      const meander = Math.sin(across * 11 + warpA) * 0.035 + Math.sin(across * 23 - warpB) * 0.015;
      const major = duneProfile((along + meander) / 0.16);
      const minor = duneProfile((along * 3.1 + meander * 2) / 0.032) * 0.22;
      const shape = major * 0.85 + minor * 0.15;
      const bedrock = 0.05 + shape * 0.01;
      const sand = 0.02 + shape * 0.24 + random() * 0.004;

      state[o + FIELD.BEDROCK] = bedrock;
      state[o + FIELD.SAND] = sand;
      state[o + FIELD.COMPACTION] = 0.03 + random() * 0.02; // loose, wind-blown sand
      state[o + FIELD.WETNESS] = 0;
      state[o + FIELD.WATER] = 0;
      state[o + FIELD.SEEDS] = 0;
      state[o + FIELD.BIOMASS] = 0;
    }
  }
}

export function createWorldState(size = 96, seed = 0x53484144, options = {}) {
  if (!Number.isInteger(size) || size < 8) throw new Error('World grid size must be an integer >= 8');
  const state = new Float32Array(size * size * CELL_STRIDE);
  const random = mulberry32(seed);

  if (options.terrain === 'desert') {
    generateDunes(state, size, random, options.windDeg);
    return state;
  }

  for (let z = 0; z < size; z++) {
    for (let x = 0; x < size; x++) {
      const nx = (x + 0.5) / size;
      const nz = (z + 0.5) / size;
      const o = cellOffset(size, x, z);
      const dune = Math.exp(-((nx - 0.68) ** 2 / 0.034 + (nz - 0.48) ** 2 / 0.12));
      const ridge = Math.exp(-((nx - 0.38) ** 2 / 0.015 + (nz - 0.28) ** 2 / 0.055));
      const basin = Math.exp(-((nx - 0.23) ** 2 / 0.038 + (nz - 0.68) ** 2 / 0.052));
      const micro = (Math.sin(nx * 19.1 + nz * 7.3) + Math.sin(nz * 15.7 - nx * 4.1)) * 0.004;
      const bedrock = clamp(0.13 + (1 - nx) * 0.13 - basin * 0.095 + micro, 0.035, 0.42);
      const sand = clamp(0.018 + dune * 0.12 + ridge * 0.065 + random() * 0.006, 0, 0.24);
      const water = clamp((basin - 0.54) * 0.105, 0, 0.075);
      const wetness = clamp(water * 8 + basin * 0.15, 0, 1);
      const seedPatch = Math.exp(-((nx - 0.49) ** 2 / 0.055 + (nz - 0.72) ** 2 / 0.022));
      const seeds = clamp(seedPatch * 0.7 + random() * 0.025, 0, 1);
      const biomass = clamp(seedPatch * wetness * 0.22, 0, 0.18);

      state[o + FIELD.BEDROCK] = bedrock;
      state[o + FIELD.SAND] = sand;
      state[o + FIELD.COMPACTION] = 0.08 + random() * 0.05;
      state[o + FIELD.WETNESS] = wetness;
      state[o + FIELD.WATER] = water;
      state[o + FIELD.SEEDS] = seeds;
      state[o + FIELD.BIOMASS] = biomass;
    }
  }
  return state;
}

function applyStamps(state, size, stamps, env) {
  for (const stamp of stamps || []) {
    const radius = Math.max(1 / size, Number(stamp.radius) || 0.035);
    const amount = Number(stamp.amount) || 0;
    const minX = Math.max(0, Math.floor((stamp.x - radius) * size));
    const maxX = Math.min(size - 1, Math.ceil((stamp.x + radius) * size));
    const minZ = Math.max(0, Math.floor((stamp.z - radius) * size));
    const maxZ = Math.min(size - 1, Math.ceil((stamp.z + radius) * size));
    for (let z = minZ; z <= maxZ; z++) {
      for (let x = minX; x <= maxX; x++) {
        const dx = (x + 0.5) / size - stamp.x;
        const dz = (z + 0.5) / size - stamp.z;
        const distance = Math.hypot(dx, dz);
        if (distance > radius) continue;
        const weight = (1 - distance / radius) ** 2;
        const value = amount * weight;
        const o = cellOffset(size, x, z);
        switch (stamp.kind) {
          case STAMP.SAND:
            state[o + FIELD.SAND] = Math.max(0, state[o + FIELD.SAND] + value);
            break;
          case STAMP.WATER:
            // Capped, not just floored: nothing previously stopped repeated stamping (a
            // user holding the water tool down while painting -- the normal, expected way
            // to add water, not an edge case) from piling WATER up far beyond any sane
            // pond depth at a single cell. Rendering assumes ~0.08-1 is already "full deep
            // water" (see editor/world-sandbox.js's `depth = Math.min(1, water * 12)`), and
            // nothing bounded the water HEIGHT itself, which is what the 3D mesh actually
            // rises by -- an unbounded value there is not a subtle color artifact, it is a
            // literal multi-unit-tall spike jutting out of the terrain.
            state[o + FIELD.WATER] = clamp(state[o + FIELD.WATER] + value, 0, MAX_WATER_DEPTH);
            state[o + FIELD.WETNESS] = clamp(state[o + FIELD.WETNESS] + value * 5);
            break;
          case STAMP.SEED:
            state[o + FIELD.SEEDS] = clamp(state[o + FIELD.SEEDS] + value * 3);
            break;
          case STAMP.DIG:
            state[o + FIELD.SAND] = Math.max(0, state[o + FIELD.SAND] - value);
            state[o + FIELD.COMPACTION] = clamp(state[o + FIELD.COMPACTION] - value * 2);
            break;
          case STAMP.HEAT:
            state[o + FIELD.HEAT] = clamp(state[o + FIELD.HEAT] + value * 4);
            break;
          case STAMP.FOCUS: {
            const focusStrength = clamp(env.sun);
            state[o + FIELD.HEAT] = clamp(state[o + FIELD.HEAT] + value * focusStrength * 2.6);
            break;
          }
          case STAMP.CARVE: {
            state[o + FIELD.WATER] = clamp(state[o + FIELD.WATER] + value * 0.6, 0, MAX_WATER_DEPTH);
            state[o + FIELD.WETNESS] = clamp(state[o + FIELD.WETNESS] + value * 3);
            const dirX = Number(stamp.directionX) || 0;
            const dirZ = Number(stamp.directionZ) || 0;
            // Clamped per-stamp, not just left to accumulate -- several carve stamps can land
            // on the same cell within one step during a fast drag, and velocity has no natural
            // [0,1] ceiling the way HEAT/WETNESS do (clamp() defaults to that range, which
            // would be wrong for a signed speed that legitimately exceeds 1 for a real flood
            // surge elsewhere in this file).
            state[o + FIELD.VELOCITY_X] = Math.max(-4, Math.min(4, state[o + FIELD.VELOCITY_X] + dirX * value * 6));
            state[o + FIELD.VELOCITY_Z] = Math.max(-4, Math.min(4, state[o + FIELD.VELOCITY_Z] + dirZ * value * 6));
            break;
          }
          case STAMP.TRAMPLE:
            state[o + FIELD.DISTURBANCE] = clamp(state[o + FIELD.DISTURBANCE] + value * 3);
            state[o + FIELD.COMPACTION] = clamp(state[o + FIELD.COMPACTION] + value * 2);
            break;
          case STAMP.IMPACT:
            state[o + FIELD.SAND] = Math.max(0, state[o + FIELD.SAND] - value * 0.45);
            state[o + FIELD.WATER] = Math.max(0, state[o + FIELD.WATER] - value * 0.08);
            state[o + FIELD.DISTURBANCE] = clamp(state[o + FIELD.DISTURBANCE] + value * 4);
            state[o + FIELD.COMPACTION] = clamp(state[o + FIELD.COMPACTION] + value * 2.5);
            break;
          default:
            break;
        }
      }
    }
  }
}

function surface(state, offset) {
  return state[offset + FIELD.BEDROCK] + state[offset + FIELD.SAND];
}

function sandFlux(state, from, to, dt, rate) {
  const delta = surface(state, from) - surface(state, to);
  const cohesion = 0.006
    + state[from + FIELD.WETNESS] * 0.026
    + state[from + FIELD.COMPACTION] * 0.018;
  const excess = Math.max(0, delta - 0.009 - cohesion);
  const flowable = 1 - state[from + FIELD.ICE]; // frozen ground does not slide
  return Math.min(state[from + FIELD.SAND] * 0.19, excess * rate * dt * 0.24) * flowable;
}

// Water is no longer moved by an instantaneous "excess head -> displacement" rule (that
// produced the reported instant leveling: no memory, no overshoot). Instead the same
// gravity-accelerated, drag-damped velocity already computed below for erosion `speed`
// is now the thing that actually transports water -- Höhendifferenz -> Beschleunigung ->
// Geschwindigkeit -> Transport -> Dämpfung, not Höhendifferenz -> Wasser direkt verschieben.
// `edgeFlow` reads last step's persisted velocity (leapfrog-style: this step's freshly
// updated velocity only takes effect next step), so momentum genuinely carries across
// frames and two basins can overshoot level and slosh back before damping settles them.
// At the grid's edge, cellOffset clamps the "neighbour" index to the cell's own index --
// near===far there. Unlike sandFlux (a pure a-vs-b DIFFERENCE, which is exactly 0 when
// a===b, so boundaries are naturally inert), edgeFlow's velocity-driven magnitude does NOT
// collapse to zero just because near===far, so without this guard a boundary cell would
// compute a real nonzero "flow to itself": mass leaving through a downwind edge with no
// neighbour to credit it to, or mass appearing from a phantom upwind "mirror" of itself.
function edgeFlow(state, nearIndex, farIndex, edgeVelocity, dt, size, cap = 0.24) {
  if (nearIndex === farIndex) return 0;
  const crossing = edgeVelocity * dt * size; // signed fraction of a cell width crossed toward `far`
  if (crossing > 0) {
    const flowable = 1 - state[nearIndex + FIELD.ICE]; // frozen water does not transport
    return Math.min(state[nearIndex + FIELD.WATER] * cap, crossing * state[nearIndex + FIELD.WATER]) * flowable;
  }
  const flowable = 1 - state[farIndex + FIELD.ICE];
  return -Math.min(state[farIndex + FIELD.WATER] * cap, -crossing * state[farIndex + FIELD.WATER]) * flowable;
}

// Airborne fields (VAPOR/CLOUD/SMOKE) drift downwind, on top of their existing isotropic
// diffusion, via a real one-way edge flux -- same shape and same symmetric-computation
// guarantee as sandFlux/edgeFlow above (a pure function of (from,to,state) evaluated
// identically from both cells' perspectives, so what one cell loses the other gains exactly).
// A first, direction-blind attempt at this ("relax toward a wind-weighted neighbour average")
// looked plausible but was NOT mass-conserving: unlike isotropic diffusion, a biased average's
// pairwise gain/loss don't cancel, since the weight from A->B differs from B->A by design.
// windFlux only returns nonzero when wind actually blows `from` toward `to` this direction.
// Same boundary guard as edgeFlow above, for the same reason: windFlux's magnitude depends
// only on the source cell's own stock, not a from-vs-to difference, so a clamped self-
// neighbour at the grid edge would otherwise leak mass out (downwind edge) or manufacture it
// from nothing (upwind edge) instead of correctly acting as a closed, no-flux boundary.
// Bounds a cell's TOTAL outgoing wind flux (summed over all 4 directions) to at most its
// own available stock. A per-edge cap alone is not enough: at large grid sizes (or strong
// diagonal wind) `crossing` can exceed the cap on TWO outgoing edges at once, so capping
// each edge independently at 50% still lets a cell lose up to 100%+ of its stock in one
// step once both are summed, going negative before the final Math.max(0, ...) clips the
// debit -- while its neighbours, computed independently, still receive the FULL uncapped
// credit each edge implied. Fixed by scaling every outgoing direction from a cell by the
// SAME factor, derived only from that cell's own wind + dt/size/rate (never a neighbour's),
// so it stays a pure function of the source cell alone -- required for the mass-conservation
// guarantee below to still hold.
// `reservedFraction` (0..1, default 0) is the share of this cell's OWN stock that some
// OTHER same-step conversion (precipitation off CLOUD, melt off SNOW, decay off SMOKE --
// all computed independently against the same pre-step stamped value windFlux reads) is
// about to remove. Without reserving it here, wind alone could already claim up to 100% of
// the stock, and the conversion claims more on top of that -- the source goes negative and
// gets clamped to 0 (real mass lost), while neighbours still receive the FULL wind credit
// computed as if that mass had actually left. Reserving shrinks the wind budget to what's
// actually going to be left once the conversion also runs, so neighbours never get credited
// for mass the source doesn't have.
function windOutflowScale(state, index, dt, size, rate, reservedFraction = 0) {
  const windX = state[index + FIELD.WIND_X];
  const windZ = state[index + FIELD.WIND_Z];
  const total = Math.max(0, windX) * dt * size * rate + Math.max(0, -windX) * dt * size * rate
    + Math.max(0, windZ) * dt * size * rate + Math.max(0, -windZ) * dt * size * rate;
  const budget = Math.max(0, 1 - clamp(reservedFraction));
  return total > budget ? budget / total : 1;
}

function windFlux(state, fieldIndex, fromIndex, toIndex, windAlongFromTo, dt, size, rate, outflowScale) {
  if (fromIndex === toIndex) return 0;
  const crossing = Math.max(0, windAlongFromTo) * dt * size * rate * outflowScale;
  return crossing * state[fromIndex + fieldIndex];
}

// Dot of the wind vector STORED AT `index` with a cardinal direction -- deliberately always
// the FROM cell's own wind, never an average or the TO cell's, and never the caller's local
// uniform. That single rule is what keeps this mass-conserving under a spatially-varying
// field: the flux for a given directed edge (say left->o) is a pure function of (left, o)
// evaluated identically no matter which cell's own delta computation calls it -- exactly the
// same guarantee sandFlux/edgeFlow already rely on, just carried over to a field that is now
// spatially varying instead of one shared scalar.
function windAlong(state, index, dirX, dirZ) {
  return state[index + FIELD.WIND_X] * dirX + state[index + FIELD.WIND_Z] * dirZ;
}

function windTransportDelta(state, fieldIndex, o, left, right, north, south, dt, size, rate, reservedFractionAt = () => 0) {
  const scaleO = windOutflowScale(state, o, dt, size, rate, reservedFractionAt(o));
  const scaleLeft = windOutflowScale(state, left, dt, size, rate, reservedFractionAt(left));
  const scaleRight = windOutflowScale(state, right, dt, size, rate, reservedFractionAt(right));
  const scaleNorth = windOutflowScale(state, north, dt, size, rate, reservedFractionAt(north));
  const scaleSouth = windOutflowScale(state, south, dt, size, rate, reservedFractionAt(south));
  let delta = 0;
  delta += windFlux(state, fieldIndex, left, o, windAlong(state, left, 1, 0), dt, size, rate, scaleLeft)
    - windFlux(state, fieldIndex, o, left, windAlong(state, o, -1, 0), dt, size, rate, scaleO);
  delta += windFlux(state, fieldIndex, right, o, windAlong(state, right, -1, 0), dt, size, rate, scaleRight)
    - windFlux(state, fieldIndex, o, right, windAlong(state, o, 1, 0), dt, size, rate, scaleO);
  delta += windFlux(state, fieldIndex, north, o, windAlong(state, north, 0, 1), dt, size, rate, scaleNorth)
    - windFlux(state, fieldIndex, o, north, windAlong(state, o, 0, -1), dt, size, rate, scaleO);
  delta += windFlux(state, fieldIndex, south, o, windAlong(state, south, 0, -1), dt, size, rate, scaleSouth)
    - windFlux(state, fieldIndex, o, south, windAlong(state, o, 0, 1), dt, size, rate, scaleO);
  return delta;
}

// The fraction of SNOW that melt is about to remove at an arbitrary cell, computed the exact
// same way the main step loop derives it for the centre cell (localTemp from altitude + HEAT,
// then the same rate curve melt itself uses) -- needed so windTransportDelta can reserve the
// right budget at EVERY cell it touches (o and all 4 neighbours), not just the one the main
// loop happens to be sitting on this iteration.
function snowMeltFraction(state, index, env, dt) {
  const altitude = surface(state, index);
  const localTemp = clamp(env.temperature + state[index + FIELD.HEAT] * 0.35 - altitude * 0.6);
  return Math.min(1, Math.max(0, localTemp - 0.46) * dt * 1.4);
}

export function stepWorldReference(source, size, dt = 1 / 30, options = {}) {
  if (!(source instanceof Float32Array) || source.length !== size * size * CELL_STRIDE) {
    throw new Error('Reference world state has the wrong shape');
  }
  const env = {...DEFAULT_ENVIRONMENT, ...(options.environment || {})};
  const stamped = source.slice();
  applyStamps(stamped, size, options.stamps || [], env);
  const next = stamped.slice();
  const safeDt = clamp(Number(dt) || 0, 0, 1 / 10);
  const windAngle = (env.windDeg * Math.PI) / 180;
  const windStrength = clamp(env.wind);
  const baseWindX = Math.cos(windAngle) * windStrength;
  const baseWindZ = Math.sin(windAngle) * windStrength;

  for (let z = 0; z < size; z++) {
    for (let x = 0; x < size; x++) {
      const o = cellOffset(size, x, z);
      const neighbours = [
        cellOffset(size, x - 1, z),
        cellOffset(size, x + 1, z),
        cellOffset(size, x, z - 1),
        cellOffset(size, x, z + 1),
      ];

      let sandDelta = 0;
      for (const n of neighbours) {
        sandDelta += sandFlux(stamped, n, o, safeDt, env.sandRate)
          - sandFlux(stamped, o, n, safeDt, env.sandRate);
      }

      const left = neighbours[0];
      const right = neighbours[1];
      const north = neighbours[2];
      const south = neighbours[3];

      // --- Wind field: a real local vector, not a uniform scalar --------------------------
      // Three forces, same leapfrog discipline as everything else (reads stamped, writes
      // next): spatial diffusion (a gust spreads into its neighbours instead of staying a
      // single-cell spike), relaxation toward the prevailing weather (env.wind/windDeg --
      // absent a disturbance, local wind drifts back to "normal"), and a thermal push away
      // from nearby heat (the same gradient technique the water-surface slope above already
      // uses, just on FIELD.HEAT instead of water+terrain height -- a real fire generates its
      // own outflow, it doesn't just sit passively in whatever breeze exists).
      const windXOld = stamped[o + FIELD.WIND_X];
      const windZOld = stamped[o + FIELD.WIND_Z];
      const neighbourWindX = (stamped[left + FIELD.WIND_X] + stamped[right + FIELD.WIND_X]
        + stamped[north + FIELD.WIND_X] + stamped[south + FIELD.WIND_X]) * 0.25;
      const neighbourWindZ = (stamped[left + FIELD.WIND_Z] + stamped[right + FIELD.WIND_Z]
        + stamped[north + FIELD.WIND_Z] + stamped[south + FIELD.WIND_Z]) * 0.25;
      // The gradient itself already vanishes away from a heat source -- no extra "am I
      // actually on fire" gate needed (an earlier version gated this on the CURRENT cell's
      // own FIELD.FIRE, which meant only the burning cell itself ever got pushed, never its
      // neighbours, even though their gradient already correctly senses it next door).
      const heatGradX = (stamped[right + FIELD.HEAT] - stamped[left + FIELD.HEAT]) * 0.5 * size;
      const heatGradZ = (stamped[south + FIELD.HEAT] - stamped[north + FIELD.HEAT]) * 0.5 * size;
      const CONVECTION_STRENGTH = 0.65;
      const windX = windXOld
        + (neighbourWindX - windXOld) * safeDt * 0.6
        + (baseWindX - windXOld) * safeDt * 0.35
        - heatGradX * CONVECTION_STRENGTH * safeDt;
      const windZ = windZOld
        + (neighbourWindZ - windZOld) * safeDt * 0.6
        + (baseWindZ - windZOld) * safeDt * 0.35
        - heatGradZ * CONVECTION_STRENGTH * safeDt;

      // Slope limiter: gradientX/Z scales with `size` by construction (a true discrete
      // slope, height-difference divided by cell width), which is correct for smooth
      // terrain but diverges without bound right at a sharp discontinuity -- exactly what
      // a freshly-stamped pond edge or a dam-break front IS. Without a cap here, that
      // single sharp edge injects a velocity impulse that grows with grid resolution
      // (confirmed empirically: velocity reaching +-60 within 2 steps of a normal water
      // stamp at size=96, before this fix existed), which is a genuine CFL-style
      // numerical instability, not a tuning nit -- the same technique real fluid/terrain
      // solvers use ("flux limiter") to stay stable at a sharp interface regardless of
      // resolution, instead of requiring dt to shrink as resolution grows.
      const GRADIENT_LIMIT = 6;
      const level = index => surface(stamped, index) + stamped[index + FIELD.WATER];
      const gradientX = clamp((level(right) - level(left)) * 0.5 * size, -GRADIENT_LIMIT, GRADIENT_LIMIT);
      const gradientZ = clamp((level(south) - level(north)) * 0.5 * size, -GRADIENT_LIMIT, GRADIENT_LIMIT);
      const velocityX = (stamped[o + FIELD.VELOCITY_X] - gradientX * safeDt * 0.84)
        * Math.max(0, 1 - safeDt * 2.4);
      const velocityZ = (stamped[o + FIELD.VELOCITY_Z] - gradientZ * safeDt * 0.84)
        * Math.max(0, 1 - safeDt * 2.4);
      const speed = Math.hypot(velocityX, velocityZ);

      const edgeVelXRight = 0.5 * (stamped[o + FIELD.VELOCITY_X] + stamped[right + FIELD.VELOCITY_X]);
      const edgeVelXLeft = 0.5 * (stamped[left + FIELD.VELOCITY_X] + stamped[o + FIELD.VELOCITY_X]);
      const edgeVelZBottom = 0.5 * (stamped[o + FIELD.VELOCITY_Z] + stamped[south + FIELD.VELOCITY_Z]);
      const edgeVelZTop = 0.5 * (stamped[north + FIELD.VELOCITY_Z] + stamped[o + FIELD.VELOCITY_Z]);
      const flowToRight = edgeFlow(stamped, o, right, edgeVelXRight, safeDt, size);
      const flowFromLeft = edgeFlow(stamped, left, o, edgeVelXLeft, safeDt, size);
      const flowToBottom = edgeFlow(stamped, o, south, edgeVelZBottom, safeDt, size);
      const flowFromTop = edgeFlow(stamped, north, o, edgeVelZTop, safeDt, size);
      const waterDelta = flowFromLeft - flowToRight + flowFromTop - flowToBottom;

      // --- Water cycle (Gas -> Kondensation -> Feuchte -> Eis -> Regen/Hagel/Schnee) -------
      // Same leapfrog discipline as the momentum transport above: this step's precipitation
      // falls from LAST step's cloud (stamped), and evaporation feeds THIS step's vapor,
      // which only condenses into cloud for NEXT step's rainfall. Altitude cools (real
      // orographic effect), so the same cloud snows on a ridge while it rains in the valley.
      const iceOld = stamped[o + FIELD.ICE];
      const cloudOld = stamped[o + FIELD.CLOUD];
      const altitude = surface(stamped, o);
      const localTemp = clamp(env.temperature + stamped[o + FIELD.HEAT] * 0.35 - altitude * 0.6);

      const precip = Math.min(cloudOld, cloudOld * safeDt * 0.22);
      // A near-freezing but not fully frozen band with a heavily loaded cloud is the closest
      // single-cell proxy for a thunderstorm updraft/downdraft cycle this 2.5D model has --
      // marked explicitly as a first approximation, not real hail-growth physics.
      const hailBand = smoothstep(0.30, 0.42, localTemp) * (1 - smoothstep(0.46, 0.58, localTemp));
      const hailing = hailBand > 0.5 && cloudOld > 0.03;
      const snowFraction = hailing ? 1 : 1 - smoothstep(0.42, 0.58, localTemp);
      const rainPart = precip * (1 - snowFraction);
      const snowPart = precip * snowFraction;
      const hailImpact = hailing ? Math.min(0.05, precip * 1.5) : 0; // ground-impact kick, not extra mass

      let sand = Math.max(0, stamped[o + FIELD.SAND] + sandDelta);
      let water = Math.max(0, stamped[o + FIELD.WATER] + waterDelta + rainPart);
      let snow = Math.max(0, stamped[o + FIELD.SNOW] + snowPart);
      let sediment = Math.max(0, stamped[o + FIELD.SEDIMENT]);
      const erosion = Math.min(sand, water * speed * (1 - stamped[o + FIELD.COMPACTION]) * safeDt * 0.032) * (1 - iceOld);
      const deposition = Math.min(sediment, sediment * safeDt * (0.08 + Math.max(0, 0.7 - speed) * 0.24));
      sand += deposition - erosion;
      sediment += erosion - deposition;

      // Snowmelt: warmth above the freeze line converts the snow reservoir back into water.
      const melt = Math.min(snow, snow * Math.max(0, localTemp - 0.46) * safeDt * 1.4);
      snow -= melt;
      water += melt;

      // Snowdrift: loose snow gets picked up and redeposited downwind (real snowdrift
      // behaviour -- it piles up on the leeward side of obstacles instead of falling and
      // staying exactly where it landed), same conservative wind-flux machinery as the
      // atmospheric fields, just on a ground reservoir. Slower than smoke -- snow is heavy.
      const snowWindDelta = windTransportDelta(stamped, FIELD.SNOW, o, left, right, north, south, safeDt, size, 0.35,
        (index) => snowMeltFraction(stamped, index, env, safeDt));
      snow = Math.max(0, snow + snowWindDelta);

      // Ice: relaxes toward a target frozen fraction set by local temperature (not instant --
      // a lake takes time to freeze over or thaw), and feeds back into sandFlux/edgeFlow above.
      const iceTarget = 1 - smoothstep(0.30, 0.42, localTemp);
      const ice = clamp(iceOld + (iceTarget - iceOld) * safeDt * 0.5 + hailImpact * 0.4);

      const groundwaterOld = stamped[o + FIELD.GROUNDWATER];
      const infiltration = Math.min(water, env.permeability * (1 - stamped[o + FIELD.COMPACTION]) * safeDt * 0.035) * (1 - iceOld);
      // Evaporation now depends on local heat (a fire-scorched patch dries faster) and on the
      // vapor deficit right above it (already-humid air can't accept much more), not only the
      // global sun slider -- the old formula never looked at the air it was evaporating into.
      const vaporDeficit = clamp(1 - stamped[o + FIELD.VAPOR] / (0.0006 + localTemp * 0.006 + 1e-6));
      const evaporation = Math.min(water, env.evaporation * (0.25 + env.sun + stamped[o + FIELD.HEAT] * 0.6)
        * vaporDeficit * safeDt * 0.025) * (1 - iceOld);
      water -= infiltration + evaporation;
      const wetness = clamp(stamped[o + FIELD.WETNESS]
        + infiltration * 12
        + water * safeDt * 0.45
        - safeDt * env.evaporation * (0.18 + env.sun * 0.52)
        - stamped[o + FIELD.HEAT] * safeDt * 0.16);

      // Groundwater: infiltration used to just vanish. Now it seeps into a deep reservoir that
      // spreads slowly between cells (an order of magnitude slower than surface water, no
      // momentum) and resurfaces as a spring once the water table is high enough -- a real
      // closed loop instead of a one-way drain.
      const neighbourGroundwater = neighbours.reduce((sum, n) => sum + stamped[n + FIELD.GROUNDWATER], 0) * 0.25;
      let groundwater = Math.max(0, groundwaterOld + infiltration
        + (neighbourGroundwater - groundwaterOld) * safeDt * 0.03);
      const springFlow = Math.max(0, groundwater - 0.6) * safeDt * 0.4;
      groundwater -= springFlow;
      water += springFlow;

      // Vapor: diffuses isotropically (as before) plus a real, mass-conserving wind-driven
      // edge flux on top (windTransportDelta -- drifts downwind like real humid air), and
      // gains this step's evaporation 1:1 (mass now carries through instead of vanishing)
      // plus env.rain as an atmospheric moisture injection -- `rain` no longer teleports
      // straight into `water`, it has to condense and fall like everything else.
      const neighbourVapor = (stamped[left + FIELD.VAPOR] + stamped[right + FIELD.VAPOR]
        + stamped[north + FIELD.VAPOR] + stamped[south + FIELD.VAPOR]) * 0.25;
      const vaporWindDelta = windTransportDelta(stamped, FIELD.VAPOR, o, left, right, north, south, safeDt, size, 0.6);
      let vapor = Math.max(0, stamped[o + FIELD.VAPOR]
        + (neighbourVapor - stamped[o + FIELD.VAPOR]) * safeDt * 0.18
        + vaporWindDelta
        + evaporation
        + env.rain * safeDt * 0.06);
      // Condensation: colder air holds less vapor before the excess condenses into cloud.
      // Tuned to the actual scale a small lake's evaporation reaches within a demo-length
      // run (a peak of roughly 0.01 over ~100s of sim time at default settings), not to a
      // literal g/m3 saturation curve -- this is a game-scale abstraction, not a weather model.
      // Smoke acts as condensation nuclei (real pyrocumulus effect): a smoky cell condenses
      // more readily, slightly lowering the threshold instead of needing its own cloud rule.
      const saturation = (0.0006 + localTemp * 0.006) * (1 - Math.min(0.5, stamped[o + FIELD.SMOKE] * 0.3));
      const condensed = Math.max(0, vapor - saturation) * safeDt * 0.6;
      vapor -= condensed;
      const neighbourCloud = (stamped[left + FIELD.CLOUD] + stamped[right + FIELD.CLOUD]
        + stamped[north + FIELD.CLOUD] + stamped[south + FIELD.CLOUD]) * 0.25;
      // precip's own rate (cloudOld * safeDt * 0.22, see above) is the same constant fraction
      // at every cell this step, so reserving it needs no per-cell recomputation like melt's.
      const precipFraction = Math.min(1, safeDt * 0.22);
      const cloudWindDelta = windTransportDelta(stamped, FIELD.CLOUD, o, left, right, north, south, safeDt, size, 0.6,
        () => precipFraction);
      const cloud = Math.max(0, cloudOld + (neighbourCloud - cloudOld) * safeDt * 0.35 + cloudWindDelta - precip + condensed);

      // --- Combustion: BIOMASS is the fuel, not a separate stock. FIRE is a self-sustaining
      // 0..1 intensity -- once heat (a HEAT stamp, or a blazing neighbour) crosses the ignition
      // threshold on dry-enough fuel, the fire keeps itself going by consuming biomass and
      // releasing its own heat, exactly the positive-feedback chain real combustion is, until
      // it either runs out of fuel or gets doused by wetness/water/rain.
      const biomassOld = stamped[o + FIELD.BIOMASS];
      // Downwind spread should visibly outrun upwind spread -- a neighbour's fire threatens
      // this cell more when the local wind blows FROM that neighbour TOWARD here, not just
      // from raw adjacency. windBias(dirX,dirZ) is >1 when the wind here blows in that
      // direction (i.e. away from that neighbour, toward us) and <1 against it, using the
      // exact same direction convention windAlong/windTransportDelta already established.
      // Reads windXOld/windZOld (last step's field), same leapfrog discipline as every other
      // wind consumer this step (windTransportDelta below reads stamped too) -- not the
      // brand-new windX/windZ computed a few lines up, which belongs to THIS step's write.
      const windBias = (dirX, dirZ) => clamp(1 + (windXOld * dirX + windZOld * dirZ) * 2.2, 0.15, 2.4);
      const neighbourFireMax = Math.max(
        stamped[left + FIELD.FIRE] * windBias(1, 0),
        stamped[right + FIELD.FIRE] * windBias(-1, 0),
        stamped[north + FIELD.FIRE] * windBias(0, 1),
        stamped[south + FIELD.FIRE] * windBias(0, -1),
      );
      const canBurn = biomassOld > 0.012 && wetness < 0.42 && iceOld < 0.4;
      const ignitionSignal = Math.max(stamped[o + FIELD.HEAT], neighbourFireMax);
      const igniteRate = canBurn ? Math.max(0, ignitionSignal - 0.22) * 4.5 : 0;
      const douseRate = wetness * 1.6 + water * 3.2 + iceOld * 2.5 + (canBurn ? 0.05 : 3.0);
      const fire = clamp(stamped[o + FIELD.FIRE] + (igniteRate - douseRate * stamped[o + FIELD.FIRE]) * safeDt);
      // Burn slowly enough that fuel doesn't vanish in a fraction of a second -- a real fire
      // needs to still be blazing a few seconds from now for it to have spread anywhere.
      const fuelBurn = Math.min(biomassOld, (biomassOld * fire * 0.45 + fire * 0.006) * safeDt);
      const heatRelease = fuelBurn * 20.0;
      const smokeRelease = fuelBurn * 3.5;
      const ashRelease = fuelBurn * 0.55;

      const neighbourHeat = neighbours.reduce((sum, n) => sum + stamped[n + FIELD.HEAT], 0) * 0.25;
      const heat = clamp(stamped[o + FIELD.HEAT]
        + (neighbourHeat - stamped[o + FIELD.HEAT]) * safeDt * 0.8
        + heatRelease
        - (0.08 + wetness * 0.55 + water * 2.0) * safeDt);
      const disturbance = clamp(stamped[o + FIELD.DISTURBANCE] * Math.max(0, 1 - safeDt * 0.16) + hailImpact);

      // Smoke: drifts downwind like vapor/cloud (isotropic diffusion plus the same conservative
      // wind flux, tuned faster since a plume should visibly stretch out, not just haze in
      // place), and simply thins out over time (no separate "settle" reservoir -- it just
      // disperses, unlike ash which actually falls to the ground).
      const neighbourSmoke = (stamped[left + FIELD.SMOKE] + stamped[right + FIELD.SMOKE]
        + stamped[north + FIELD.SMOKE] + stamped[south + FIELD.SMOKE]) * 0.25;
      // Same reasoning as precipFraction above: decay's rate (safeDt * 0.35) is constant
      // across the grid this step, so it needs no per-cell recomputation either.
      const smokeDecayFraction = Math.min(1, safeDt * 0.35);
      const smokeWindDelta = windTransportDelta(stamped, FIELD.SMOKE, o, left, right, north, south, safeDt, size, 1.4,
        () => smokeDecayFraction);
      const smoke = Math.max(0, stamped[o + FIELD.SMOKE]
        + (neighbourSmoke - stamped[o + FIELD.SMOKE]) * safeDt * 0.6
        + smokeWindDelta
        + smokeRelease
        - stamped[o + FIELD.SMOKE] * safeDt * 0.35);

      // Ash: settles where it's released, slowly washed away by rain, and boosts the fertility
      // a burned patch regrows with (real post-fire ecology) via the growth formula below.
      const ash = Math.max(0, stamped[o + FIELD.ASH] + ashRelease
        - stamped[o + FIELD.ASH] * safeDt * 0.015
        - stamped[o + FIELD.ASH] * rainPart * 4);

      const moistureFit = smoothstep(0.12, 0.46, wetness)
        * (1 - smoothstep(0.72, 1.05, wetness + water * 5));
      const temperatureFit = 1 - clamp(Math.abs(env.temperature - 0.55) / 0.52);
      const neighbourBiomass = neighbours.reduce((sum, n) => sum + stamped[n + FIELD.BIOMASS], 0) * 0.25;
      const seedSpread = neighbourBiomass * moistureFit * safeDt * 0.012;
      // Seeds ride the wind, same as pollen/dandelion seeds/spores in real vegetation --
      // downwind cells get colonised faster than the isotropic neighbour-average above would
      // predict on its own, exactly the SAND/SNOW/CLOUD/SMOKE wind-transport pattern (mass-
      // conserving via windTransportDelta, so a gust redistributes seeds rather than creating
      // them). Rate is deliberately gentle -- seeds are a much lighter payload than snow/sand,
      // but should still visibly drift a scrubby patch downwind over time.
      const seedWindDelta = windTransportDelta(stamped, FIELD.SEEDS, o, left, right, north, south, safeDt, size, 0.5);
      const seeds = clamp(stamped[o + FIELD.SEEDS] + seedSpread + seedWindDelta - safeDt * 0.0015);
      const fertility = 1 + Math.min(0.6, ash * 1.4);
      const growth = seeds * moistureFit * env.sun * temperatureFit * (1 - disturbance)
        * env.growthRate * fertility * safeDt;
      const crowding = stamped[o + FIELD.BIOMASS] ** 2 * safeDt * 0.022;
      const damage = (heat * 0.72 + Math.max(0, water - 0.12) * 0.4 + disturbance * 0.2) * safeDt;
      const biomass = clamp(stamped[o + FIELD.BIOMASS] + growth - crowding - damage - fuelBurn);

      next[o + FIELD.SAND] = Math.max(0, sand);
      // Safety net matching the stamp-time cap above: rain/springs/snowmelt all add water
      // through paths other than a direct stamp, so the ceiling belongs here too, not only
      // in applyStamps.
      next[o + FIELD.WATER] = clamp(water, 0, MAX_WATER_DEPTH);
      next[o + FIELD.VELOCITY_X] = velocityX;
      next[o + FIELD.VELOCITY_Z] = velocityZ;
      next[o + FIELD.SEDIMENT] = Math.max(0, sediment);
      next[o + FIELD.WETNESS] = wetness;
      next[o + FIELD.HEAT] = heat;
      next[o + FIELD.DISTURBANCE] = disturbance;
      next[o + FIELD.SEEDS] = seeds;
      next[o + FIELD.BIOMASS] = biomass;
      next[o + FIELD.VAPOR] = vapor;
      next[o + FIELD.CLOUD] = cloud;
      next[o + FIELD.ICE] = ice;
      next[o + FIELD.SNOW] = snow;
      next[o + FIELD.FIRE] = fire;
      next[o + FIELD.SMOKE] = smoke;
      next[o + FIELD.ASH] = ash;
      next[o + FIELD.GROUNDWATER] = groundwater;
      next[o + FIELD.WIND_X] = windX;
      next[o + FIELD.WIND_Z] = windZ;
    }
  }
  return next;
}

export function sampleWorld(state, size, x, z) {
  const cx = Math.min(size - 1, Math.max(0, Math.floor(clamp(x) * size)));
  const cz = Math.min(size - 1, Math.max(0, Math.floor(clamp(z) * size)));
  const o = cellOffset(size, cx, cz);
  const ground = state[o + FIELD.BEDROCK] + state[o + FIELD.SAND];
  return {
    id: 0,
    x: cx,
    z: cz,
    ground,
    waterSurface: ground + state[o + FIELD.WATER],
    wetness: state[o + FIELD.WETNESS],
    waterDepth: state[o + FIELD.WATER],
    biomass: state[o + FIELD.BIOMASS],
    heat: state[o + FIELD.HEAT],
    sand: state[o + FIELD.SAND],
    vapor: state[o + FIELD.VAPOR],
    cloud: state[o + FIELD.CLOUD],
    ice: state[o + FIELD.ICE],
    snow: state[o + FIELD.SNOW],
    fire: state[o + FIELD.FIRE],
    smoke: state[o + FIELD.SMOKE],
    ash: state[o + FIELD.ASH],
    groundwater: state[o + FIELD.GROUNDWATER],
    windX: state[o + FIELD.WIND_X],
    windZ: state[o + FIELD.WIND_Z],
  };
}

export function worldTotals(state) {
  const totals = {
    sand: 0, water: 0, sediment: 0, biomass: 0, vapor: 0, cloud: 0, snow: 0,
    fire: 0, smoke: 0, ash: 0, groundwater: 0,
  };
  for (let o = 0; o < state.length; o += CELL_STRIDE) {
    totals.sand += state[o + FIELD.SAND];
    totals.water += state[o + FIELD.WATER];
    totals.sediment += state[o + FIELD.SEDIMENT];
    totals.biomass += state[o + FIELD.BIOMASS];
    totals.vapor += state[o + FIELD.VAPOR];
    totals.cloud += state[o + FIELD.CLOUD];
    totals.snow += state[o + FIELD.SNOW];
    totals.fire += state[o + FIELD.FIRE];
    totals.smoke += state[o + FIELD.SMOKE];
    totals.ash += state[o + FIELD.ASH];
    totals.groundwater += state[o + FIELD.GROUNDWATER];
  }
  return totals;
}

export function stateChecksum(state) {
  let hash = 2166136261 >>> 0;
  for (let i = 0; i < state.length; i++) {
    const value = Math.round(state[i] * 1e5) | 0;
    hash ^= value & 0xff;
    hash = Math.imul(hash, 16777619) >>> 0;
    hash ^= (value >>> 8) & 0xff;
    hash = Math.imul(hash, 16777619) >>> 0;
  }
  return hash >>> 0;
}
