// SHADED coupled world sandbox — deterministic CPU reference kernel.
//
// The WebGPU implementation in world-sandbox-webgpu.mjs owns the interactive
// fast path.  This module deliberately contains the same field contract in
// plain JavaScript so invariants can be tested without a GPU and browsers
// without WebGPU still get a real (lower-resolution) simulation.

export const CELL_STRIDE = 16;

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
});

export const STAMP = Object.freeze({
  SAND: 1,
  WATER: 2,
  SEED: 3,
  DIG: 4,
  HEAT: 5,
  TRAMPLE: 6,
  IMPACT: 7,
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
});

const clamp = (value, low = 0, high = 1) => Math.max(low, Math.min(high, value));
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

export function createWorldState(size = 96, seed = 0x53484144) {
  if (!Number.isInteger(size) || size < 8) throw new Error('World grid size must be an integer >= 8');
  const state = new Float32Array(size * size * CELL_STRIDE);
  const random = mulberry32(seed);

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

function applyStamps(state, size, stamps) {
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
            state[o + FIELD.WATER] = Math.max(0, state[o + FIELD.WATER] + value);
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
function edgeFlow(state, nearIndex, farIndex, edgeVelocity, dt, size, cap = 0.24) {
  const crossing = edgeVelocity * dt * size; // signed fraction of a cell width crossed toward `far`
  if (crossing > 0) {
    const flowable = 1 - state[nearIndex + FIELD.ICE]; // frozen water does not transport
    return Math.min(state[nearIndex + FIELD.WATER] * cap, crossing * state[nearIndex + FIELD.WATER]) * flowable;
  }
  const flowable = 1 - state[farIndex + FIELD.ICE];
  return -Math.min(state[farIndex + FIELD.WATER] * cap, -crossing * state[farIndex + FIELD.WATER]) * flowable;
}

export function stepWorldReference(source, size, dt = 1 / 30, options = {}) {
  if (!(source instanceof Float32Array) || source.length !== size * size * CELL_STRIDE) {
    throw new Error('Reference world state has the wrong shape');
  }
  const env = {...DEFAULT_ENVIRONMENT, ...(options.environment || {})};
  const stamped = source.slice();
  applyStamps(stamped, size, options.stamps || []);
  const next = stamped.slice();
  const safeDt = clamp(Number(dt) || 0, 0, 1 / 10);

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
      const level = index => surface(stamped, index) + stamped[index + FIELD.WATER];
      const gradientX = (level(right) - level(left)) * 0.5 * size;
      const gradientZ = (level(south) - level(north)) * 0.5 * size;
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

      // Ice: relaxes toward a target frozen fraction set by local temperature (not instant --
      // a lake takes time to freeze over or thaw), and feeds back into sandFlux/edgeFlow above.
      const iceTarget = 1 - smoothstep(0.30, 0.42, localTemp);
      const ice = clamp(iceOld + (iceTarget - iceOld) * safeDt * 0.5 + hailImpact * 0.4);

      const infiltration = Math.min(water, env.permeability * (1 - stamped[o + FIELD.COMPACTION]) * safeDt * 0.035) * (1 - iceOld);
      const evaporation = Math.min(water, env.evaporation * (0.25 + env.sun) * safeDt * 0.025) * (1 - iceOld);
      water -= infiltration + evaporation;
      const wetness = clamp(stamped[o + FIELD.WETNESS]
        + infiltration * 12
        + water * safeDt * 0.45
        - safeDt * env.evaporation * (0.18 + env.sun * 0.52)
        - stamped[o + FIELD.HEAT] * safeDt * 0.16);

      // Vapor: diffuses like heat, gains this step's evaporation 1:1 (mass now carries through
      // instead of vanishing) plus env.rain as an atmospheric moisture injection -- `rain` no
      // longer teleports straight into `water`, it has to condense and fall like everything else.
      const neighbourVapor = neighbours.reduce((sum, n) => sum + stamped[n + FIELD.VAPOR], 0) * 0.25;
      let vapor = Math.max(0, stamped[o + FIELD.VAPOR]
        + (neighbourVapor - stamped[o + FIELD.VAPOR]) * safeDt * 0.18
        + evaporation
        + env.rain * safeDt * 0.06);
      // Condensation: colder air holds less vapor before the excess condenses into cloud.
      // Tuned to the actual scale a small lake's evaporation reaches within a demo-length
      // run (a peak of roughly 0.01 over ~100s of sim time at default settings), not to a
      // literal g/m3 saturation curve -- this is a game-scale abstraction, not a weather model.
      const saturation = 0.0006 + localTemp * 0.006;
      const condensed = Math.max(0, vapor - saturation) * safeDt * 0.6;
      vapor -= condensed;
      const cloud = Math.max(0, cloudOld - precip + condensed);

      const neighbourHeat = neighbours.reduce((sum, n) => sum + stamped[n + FIELD.HEAT], 0) * 0.25;
      const heat = clamp(stamped[o + FIELD.HEAT]
        + (neighbourHeat - stamped[o + FIELD.HEAT]) * safeDt * 0.8
        - (0.08 + wetness * 0.55 + water * 2.0) * safeDt);
      const disturbance = clamp(stamped[o + FIELD.DISTURBANCE] * Math.max(0, 1 - safeDt * 0.16) + hailImpact);
      const moistureFit = smoothstep(0.12, 0.46, wetness)
        * (1 - smoothstep(0.72, 1.05, wetness + water * 5));
      const temperatureFit = 1 - clamp(Math.abs(env.temperature - 0.55) / 0.52);
      const neighbourBiomass = neighbours.reduce((sum, n) => sum + stamped[n + FIELD.BIOMASS], 0) * 0.25;
      const seedSpread = neighbourBiomass * moistureFit * safeDt * 0.012;
      const seeds = clamp(stamped[o + FIELD.SEEDS] + seedSpread - safeDt * 0.0015);
      const growth = seeds * moistureFit * env.sun * temperatureFit * (1 - disturbance)
        * env.growthRate * safeDt;
      const crowding = stamped[o + FIELD.BIOMASS] ** 2 * safeDt * 0.022;
      const damage = (heat * 0.72 + Math.max(0, water - 0.12) * 0.4 + disturbance * 0.2) * safeDt;
      const biomass = clamp(stamped[o + FIELD.BIOMASS] + growth - crowding - damage);

      next[o + FIELD.SAND] = Math.max(0, sand);
      next[o + FIELD.WATER] = Math.max(0, water);
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
  };
}

export function worldTotals(state) {
  const totals = {sand: 0, water: 0, sediment: 0, biomass: 0, vapor: 0, cloud: 0, snow: 0};
  for (let o = 0; o < state.length; o += CELL_STRIDE) {
    totals.sand += state[o + FIELD.SAND];
    totals.water += state[o + FIELD.WATER];
    totals.sediment += state[o + FIELD.SEDIMENT];
    totals.biomass += state[o + FIELD.BIOMASS];
    totals.vapor += state[o + FIELD.VAPOR];
    totals.cloud += state[o + FIELD.CLOUD];
    totals.snow += state[o + FIELD.SNOW];
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
