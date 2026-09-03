import {CELL_STRIDE, createWorldState} from './world-sandbox-reference.mjs';

const MAX_STAMPS = 32;
const PARTICLE_STRIDE = 12;
const QUERY_BYTES = 32;

// The WGSL `Cell` struct below is six vec4<f32> fields (terrain/water/bio/atmo/combust/wind) --
// vec4<f32>'s mandatory 16-byte alignment makes that struct exactly 24 floats wide. The CPU
// reference's CELL_STRIDE (world-sandbox-reference.mjs) used to stop at 22, leaving wind.zw as
// genuine unused alignment padding; PLANT_TYPE/PLANT_AGE now occupy exactly those two slots, so
// CELL_STRIDE and the struct's real width are equal again with zero padding left over. Kept as
// its own constant (rather than importing CELL_STRIDE directly everywhere below) so a future
// field added to one side without the other still fails loudly here instead of silently
// misaligning every cell in `array<Cell>` from the second cell onward -- packCellsForGpu()
// exists for the same reason, even though it is a straight copy while the two strides match.
export const GPU_CELL_STRIDE = CELL_STRIDE;

export function packCellsForGpu(cpuState, size) {
  const packed = new Float32Array(size * size * GPU_CELL_STRIDE);
  for (let cell = 0, cellCount = size * size; cell < cellCount; cell++) {
    packed.set(cpuState.subarray(cell * CELL_STRIDE, (cell + 1) * CELL_STRIDE), cell * GPU_CELL_STRIDE);
  }
  return packed;
}

export const WORLD_COMPUTE_WGSL = /* wgsl */ `
struct Params {
  sim: vec4<f32>,
  environment: vec4<f32>,
  rates: vec4<f32>,
  emitter: vec4<f32>,
  particle: vec4<f32>,
  probe: vec4<f32>,
  spare: vec4<f32>,
}

struct Cell {
  terrain: vec4<f32>,
  water: vec4<f32>,
  bio: vec4<f32>,
  atmo: vec4<f32>,
  combust: vec4<f32>,
  wind: vec4<f32>,
}

struct Stamp {
  position: vec4<f32>,
  data: vec4<f32>,
}

struct Deposit {
  sand: atomic<u32>,
  water: atomic<u32>,
  heat: atomic<u32>,
  seed: atomic<u32>,
}

@group(0) @binding(0) var<uniform> P: Params;
@group(0) @binding(1) var<storage, read> src: array<Cell>;
@group(0) @binding(2) var<storage, read_write> dst: array<Cell>;
@group(0) @binding(3) var<storage, read> stamps: array<Stamp>;
@group(0) @binding(4) var<storage, read_write> deposits: array<Deposit>;

fn gridSize() -> u32 {
  return u32(P.sim.y);
}

fn indexAt(x: i32, z: i32) -> u32 {
  let edge = i32(gridSize()) - 1;
  let cx = u32(clamp(x, 0, edge));
  let cz = u32(clamp(z, 0, edge));
  return cz * gridSize() + cx;
}

fn surface(cell: Cell) -> f32 {
  return cell.terrain.x + cell.terrain.y;
}

fn sandFlux(a: Cell, b: Cell) -> f32 {
  let dt = P.sim.x;
  let delta = surface(a) - surface(b);
  let cohesion = 0.006 + a.terrain.w * 0.026 + a.terrain.z * 0.018;
  let excess = max(0.0, delta - 0.009 - cohesion);
  let flowable = 1.0 - a.atmo.z; // frozen ground does not slide
  return min(a.terrain.y * 0.19, excess * P.rates.x * dt * 0.24) * flowable;
}

// Water is no longer moved by an instantaneous "excess head -> displacement" rule (that
// produced the reported instant leveling: no memory, no overshoot). Instead the same
// gravity-accelerated, drag-damped velocity already computed below for erosion speed
// is now the thing that actually transports water -- Hoehendifferenz -> Beschleunigung ->
// Geschwindigkeit -> Transport -> Daempfung, not Hoehendifferenz -> Wasser direkt verschieben.
// edgeFlow reads last step's persisted velocity (leapfrog-style: this step's freshly
// updated velocity only takes effect next step), so momentum genuinely carries across
// frames and two basins can overshoot level and slosh back before damping settles them.
fn edgeFlow(near: Cell, far: Cell, edgeVelocity: f32, dt: f32, size: f32) -> f32 {
  let cap = 0.24;
  let crossing = edgeVelocity * dt * size;
  if (crossing > 0.0) {
    let flowable = 1.0 - near.atmo.z; // frozen water does not transport
    return min(near.water.x * cap, crossing * near.water.x) * flowable;
  }
  let flowable = 1.0 - far.atmo.z;
  return -min(far.water.x * cap, -crossing * far.water.x) * flowable;
}

// Airborne fields (VAPOR/CLOUD/SMOKE) drift downwind, on top of their existing isotropic
// diffusion, via a real one-way edge flux -- mirrors runtime/world-sandbox-reference.mjs
// exactly. edgeFlow/windFlux both derive their magnitude from a single cell's own stock, not
// a from-vs-to DIFFERENCE like sandFlux/diffusion, so at the grid's edge (where indexAt
// clamps the "neighbour" index back to this cell's own index) they must not run at all, or
// mass leaks out a downwind edge / gets manufactured at an upwind edge with no real neighbour
// on the other side. Cell structs carry no index identity here, so the caller in main() passes
// hasLeft/hasRight/hasTop/hasBottom explicitly instead of edgeFlow/windFlux detecting it.
// Bounds a cell's TOTAL outgoing wind flux (summed over all 4 directions) to at most its
// own available stock -- mirrors runtime/world-sandbox-reference.mjs's windOutflowScale
// exactly. A per-edge cap alone is not enough: at large grid sizes or strong diagonal wind,
// crossing can exceed the cap on two outgoing edges at once, letting a cell lose more than
// it has once summed. Derived only from the cell's own wind + dt/size/rate, so it stays a
// pure function of the source cell alone, which the mass-conservation guarantee requires.
// (crossing = the per-direction fraction of a cell's stock that wind moves this step.)
// reservedFraction (0..1) is the share of this cell's OWN stock that some OTHER same-step
// conversion (precip off CLOUD, melt off SNOW, decay off SMOKE -- all computed against the
// same pre-step stock windFlux reads) is about to remove -- mirrors
// runtime/world-sandbox-reference.mjs's windOutflowScale exactly, including this parameter.
// Without reserving it, wind alone could already claim up to 100% of the stock and the
// conversion claims more on top, clamping the source to 0 while neighbours still receive the
// FULL, un-reduced wind credit -- net mass creation in an otherwise closed system.
fn windOutflowScale(wind: vec2<f32>, dt: f32, size: f32, rate: f32, reservedFraction: f32) -> f32 {
  let total = max(0.0, wind.x) * dt * size * rate + max(0.0, -wind.x) * dt * size * rate
    + max(0.0, wind.y) * dt * size * rate + max(0.0, -wind.y) * dt * size * rate;
  let budget = max(0.0, 1.0 - clamp(reservedFraction, 0.0, 1.0));
  return select(1.0, budget / total, total > budget);
}

fn windFlux(fromValue: f32, windAlongFromTo: f32, dt: f32, size: f32, rate: f32, outflowScale: f32) -> f32 {
  let crossing = max(0.0, windAlongFromTo) * dt * size * rate * outflowScale;
  return crossing * fromValue;
}

// windAlong: dot of the wind vector carried by ONE cell with a cardinal direction. Always the
// FROM cell's own wind (never an average, never the TO cell's) -- mirrors
// runtime/world-sandbox-reference.mjs's windAlong exactly, and for the same reason: a
// directed edge's flux must be a pure function of (fromCell, direction) evaluated identically
// no matter which cell's own delta computation calls it, or mass-conservation breaks under a
// spatially-varying field.
fn windAlong(wind: vec2<f32>, dirX: f32, dirZ: f32) -> f32 {
  return wind.x * dirX + wind.y * dirZ;
}

fn windTransportDelta(
  selfValue: f32, leftValue: f32, rightValue: f32, topValue: f32, bottomValue: f32,
  hasLeft: bool, hasRight: bool, hasTop: bool, hasBottom: bool,
  selfWind: vec2<f32>, leftWind: vec2<f32>, rightWind: vec2<f32>, topWind: vec2<f32>, bottomWind: vec2<f32>,
  dt: f32, size: f32, rate: f32,
  reservedSelf: f32, reservedLeft: f32, reservedRight: f32, reservedTop: f32, reservedBottom: f32,
) -> f32 {
  let scaleSelf = windOutflowScale(selfWind, dt, size, rate, reservedSelf);
  let scaleLeft = windOutflowScale(leftWind, dt, size, rate, reservedLeft);
  let scaleRight = windOutflowScale(rightWind, dt, size, rate, reservedRight);
  let scaleTop = windOutflowScale(topWind, dt, size, rate, reservedTop);
  let scaleBottom = windOutflowScale(bottomWind, dt, size, rate, reservedBottom);
  var delta = 0.0;
  if (hasLeft) {
    delta += windFlux(leftValue, windAlong(leftWind, 1.0, 0.0), dt, size, rate, scaleLeft)
      - windFlux(selfValue, windAlong(selfWind, -1.0, 0.0), dt, size, rate, scaleSelf);
  }
  if (hasRight) {
    delta += windFlux(rightValue, windAlong(rightWind, -1.0, 0.0), dt, size, rate, scaleRight)
      - windFlux(selfValue, windAlong(selfWind, 1.0, 0.0), dt, size, rate, scaleSelf);
  }
  if (hasTop) {
    delta += windFlux(topValue, windAlong(topWind, 0.0, 1.0), dt, size, rate, scaleTop)
      - windFlux(selfValue, windAlong(selfWind, 0.0, -1.0), dt, size, rate, scaleSelf);
  }
  if (hasBottom) {
    delta += windFlux(bottomValue, windAlong(bottomWind, 0.0, -1.0), dt, size, rate, scaleBottom)
      - windFlux(selfValue, windAlong(selfWind, 0.0, 1.0), dt, size, rate, scaleSelf);
  }
  return delta;
}

// The fraction of SNOW that melt is about to remove at an arbitrary cell, computed the exact
// same way fn main() derives it for the centre cell (localTemp from altitude + HEAT, then the
// same rate curve melt itself uses) -- mirrors
// runtime/world-sandbox-reference.mjs's snowMeltFraction exactly. Needed so
// windTransportDelta can reserve the right budget at EVERY cell it touches (self and all 4
// neighbours), not just the one fn main() happens to be sitting on this invocation.
fn snowMeltFraction(cell: Cell, dt: f32) -> f32 {
  let altitude = surface(cell);
  let localTemp = clamp(P.environment.z + cell.bio.z * 0.35 - altitude * 0.6, 0.0, 1.0);
  return min(1.0, max(0.0, localTemp - 0.46) * dt * 1.4);
}

@compute @workgroup_size(8, 8, 1)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let size = gridSize();
  if (gid.x >= size || gid.y >= size) {
    return;
  }

  let x = i32(gid.x);
  let z = i32(gid.y);
  let i = indexAt(x, z);
  let il = indexAt(x - 1, z);
  let ir = indexAt(x + 1, z);
  let it = indexAt(x, z - 1);
  let ib = indexAt(x, z + 1);
  let hasLeft = il != i;
  let hasRight = ir != i;
  let hasTop = it != i;
  let hasBottom = ib != i;
  var c = src[i];
  let left = src[il];
  let right = src[ir];
  let top = src[it];
  let bottom = src[ib];
  let dt = P.sim.x;
  let baseWindX = P.spare.x;
  let baseWindZ = P.spare.y;

  // --- Wind field: a real local vector, not a uniform scalar -----------------------------
  // Mirrors runtime/world-sandbox-reference.mjs's wind-field block exactly: spatial diffusion
  // (a gust spreads into its neighbours), relaxation toward the prevailing weather
  // (baseWindX/Z, from P.spare -- env.wind/windDeg), and a thermal push away from nearby heat
  // (same gradient technique as the water-surface slope above, just on HEAT). The gradient
  // itself already vanishes away from a heat source, so no extra "is this cell on fire" gate
  // is needed -- a neighbour cell's gradient already senses a fire next door correctly.
  let windXOld = c.wind.x;
  let windZOld = c.wind.y;
  let neighbourWindX = (left.wind.x + right.wind.x + top.wind.x + bottom.wind.x) * 0.25;
  let neighbourWindZ = (left.wind.y + right.wind.y + top.wind.y + bottom.wind.y) * 0.25;
  let heatGradX = (right.bio.z - left.bio.z) * 0.5 * f32(size);
  let heatGradZ = (bottom.bio.z - top.bio.z) * 0.5 * f32(size);
  let CONVECTION_STRENGTH = 0.65;
  let windX = windXOld
    + (neighbourWindX - windXOld) * dt * 0.6
    + (baseWindX - windXOld) * dt * 0.35
    - heatGradX * CONVECTION_STRENGTH * dt;
  let windZ = windZOld
    + (neighbourWindZ - windZOld) * dt * 0.6
    + (baseWindZ - windZOld) * dt * 0.35
    - heatGradZ * CONVECTION_STRENGTH * dt;
  // Same leapfrog discipline as everywhere else: transport (and the fire wind-bias below)
  // reads LAST step's field (c.wind.xy == windXOld/windZOld), never the windX/windZ just
  // computed above, which is this step's write.
  let selfWind = vec2<f32>(windXOld, windZOld);
  let leftWind = left.wind.xy;
  let rightWind = right.wind.xy;
  let topWind = top.wind.xy;
  let bottomWind = bottom.wind.xy;

  var sandDelta = sandFlux(left, c) + sandFlux(right, c)
    + sandFlux(top, c) + sandFlux(bottom, c)
    - sandFlux(c, left) - sandFlux(c, right)
    - sandFlux(c, top) - sandFlux(c, bottom);

  var sand = max(0.0, c.terrain.y + sandDelta);
  let levelLeft = surface(left) + left.water.x;
  let levelRight = surface(right) + right.water.x;
  let levelTop = surface(top) + top.water.x;
  let levelBottom = surface(bottom) + bottom.water.x;
  // Slope limiter, mirrors runtime/world-sandbox-reference.mjs exactly: the raw gradient
  // diverges without bound right at a sharp discontinuity (a freshly-stamped pond edge, a
  // dam-break front) since it scales with grid size by construction. Confirmed empirically
  // on the CPU reference as a genuine velocity blow-up (+-60 within 2 steps of a normal
  // water stamp), not a tuning nit -- the same "flux limiter" technique real fluid/terrain
  // solvers use to stay stable at a sharp interface regardless of resolution.
  let GRADIENT_LIMIT = 6.0;
  let grad = clamp(vec2<f32>(levelRight - levelLeft, levelBottom - levelTop) * 0.5 * f32(size),
    vec2<f32>(-GRADIENT_LIMIT), vec2<f32>(GRADIENT_LIMIT));
  let velocity = (c.water.yz - grad * dt * 0.84) * max(0.0, 1.0 - dt * 2.4);
  let speed = length(velocity);

  let edgeVelXRight = 0.5 * (c.water.y + right.water.y);
  let edgeVelXLeft = 0.5 * (left.water.y + c.water.y);
  let edgeVelZBottom = 0.5 * (c.water.z + bottom.water.z);
  let edgeVelZTop = 0.5 * (top.water.z + c.water.z);
  let flowToRight = select(0.0, edgeFlow(c, right, edgeVelXRight, dt, f32(size)), hasRight);
  let flowFromLeft = select(0.0, edgeFlow(left, c, edgeVelXLeft, dt, f32(size)), hasLeft);
  let flowToBottom = select(0.0, edgeFlow(c, bottom, edgeVelZBottom, dt, f32(size)), hasBottom);
  let flowFromTop = select(0.0, edgeFlow(top, c, edgeVelZTop, dt, f32(size)), hasTop);
  var waterDelta = flowFromLeft - flowToRight + flowFromTop - flowToBottom;

  // --- Water cycle (Gas -> Kondensation -> Feuchte -> Eis -> Regen/Hagel/Schnee) ---------
  // Same leapfrog discipline as the momentum transport above: this step's precipitation
  // falls from LAST step's cloud (src), evaporation feeds THIS step's vapor, and vapor only
  // condenses into cloud for NEXT step's rainfall. Altitude cools (real orographic effect),
  // so the same cloud snows on a ridge while it rains in the valley below.
  let iceOld = c.atmo.z;
  let cloudOld = c.atmo.y;
  let altitude = surface(c);
  let localTemp = clamp(P.environment.z + c.bio.z * 0.35 - altitude * 0.6, 0.0, 1.0);

  let precip = min(cloudOld, cloudOld * dt * 0.22);
  // A near-freezing but not fully frozen band with a heavily loaded cloud is the closest
  // single-cell proxy for a thunderstorm updraft/downdraft cycle this 2.5D model has --
  // marked explicitly as a first approximation, not real hail-growth physics.
  let hailBand = smoothstep(0.30, 0.42, localTemp) * (1.0 - smoothstep(0.46, 0.58, localTemp));
  let hailing = hailBand > 0.5 && cloudOld > 0.03;
  let snowFraction = select(1.0 - smoothstep(0.42, 0.58, localTemp), 1.0, hailing);
  let rainPart = precip * (1.0 - snowFraction);
  let snowPart = precip * snowFraction;
  let hailImpact = select(0.0, min(0.05, precip * 1.5), hailing); // ground-impact kick, not extra mass

  var water = max(0.0, c.water.x + waterDelta + rainPart);
  var snow = max(0.0, c.atmo.w + snowPart);
  var sediment = max(0.0, c.water.w);
  let erosion = min(sand, water * speed * (1.0 - c.terrain.z) * dt * 0.032) * (1.0 - iceOld);
  let deposition = min(sediment, sediment * dt * (0.08 + max(0.0, 0.7 - speed) * 0.24));
  sand += deposition - erosion;
  sediment += erosion - deposition;

  // Snowmelt: warmth above the freeze line converts the snow reservoir back into water.
  let melt = min(snow, snow * max(0.0, localTemp - 0.46) * dt * 1.4);
  snow -= melt;
  water += melt;

  // Snowdrift: loose snow is picked up and redeposited downwind (real snowdrift behaviour --
  // it piles up on the leeward side of obstacles instead of staying exactly where it landed),
  // same conservative wind-flux machinery as the atmospheric fields, just on a ground
  // reservoir. Slower than smoke -- snow is heavy. Uses c.atmo.w (the RAW value every cell
  // still has in its own src[] snapshot), not the already-melted snow local var -- a neighbour
  // computing its own incoming flux from this cell only ever sees c.atmo.w (left.atmo.w /
  // right.atmo.w / ...), never this cell's partially-updated local variable, so using
  // anything else here would silently break the from-cell-only cancellation the whole
  // conservation proof depends on.
  let snowWindDelta = windTransportDelta(c.atmo.w, left.atmo.w, right.atmo.w, top.atmo.w, bottom.atmo.w,
    hasLeft, hasRight, hasTop, hasBottom, selfWind, leftWind, rightWind, topWind, bottomWind, dt, f32(size), 0.35,
    snowMeltFraction(c, dt), snowMeltFraction(left, dt), snowMeltFraction(right, dt), snowMeltFraction(top, dt), snowMeltFraction(bottom, dt));
  snow = max(0.0, snow + snowWindDelta);

  // Ice: relaxes toward a target frozen fraction set by local temperature (not instant --
  // a lake takes time to freeze over or thaw), and feeds back into sandFlux/edgeFlow above.
  let iceTarget = 1.0 - smoothstep(0.30, 0.42, localTemp);
  let ice = clamp(iceOld + (iceTarget - iceOld) * dt * 0.5 + hailImpact * 0.4, 0.0, 1.0);

  let groundwaterOld = c.combust.w;
  let infiltration = min(water, P.rates.w * (1.0 - c.terrain.z) * dt * 0.035) * (1.0 - iceOld);
  // Evaporation depends on local heat (a fire-scorched patch dries faster) and the vapor
  // deficit right above it (already-humid air can't accept much more), not only P.environment.y
  // (sun) -- the old formula never looked at the air it was evaporating into.
  let vaporDeficit = clamp(1.0 - c.atmo.x / (0.0006 + localTemp * 0.006 + 0.000001), 0.0, 1.0);
  let evaporation = min(water, P.environment.w * (0.25 + P.environment.y + c.bio.z * 0.6)
    * vaporDeficit * dt * 0.025) * (1.0 - iceOld);
  water -= infiltration + evaporation;
  var wetness = clamp(c.terrain.w + infiltration * 12.0 + water * dt * 0.45
    - dt * P.environment.w * (0.18 + P.environment.y * 0.52)
    - c.bio.z * dt * 0.16, 0.0, 1.0);

  // Groundwater: infiltration used to just vanish. Now it seeps into a deep reservoir that
  // spreads slowly between cells (an order of magnitude slower than surface water, no
  // momentum) and resurfaces as a spring once the water table is high enough -- a real
  // closed loop instead of a one-way drain.
  let neighbourGroundwater = (left.combust.w + right.combust.w + top.combust.w + bottom.combust.w) * 0.25;
  var groundwater = max(0.0, groundwaterOld + infiltration + (neighbourGroundwater - groundwaterOld) * dt * 0.03);
  let springFlow = max(0.0, groundwater - 0.6) * dt * 0.4;
  groundwater -= springFlow;
  water += springFlow;

  // Vapor: diffuses isotropically (as before) plus a real, mass-conserving wind-driven edge
  // flux on top (windTransportDelta -- drifts downwind like real humid air), and gains this
  // step's evaporation 1:1 (mass now carries through instead of vanishing) plus
  // P.environment.x (rain) as an atmospheric moisture injection -- rain no longer teleports
  // straight into water, it has to condense and fall like everything else.
  let neighbourVapor = (left.atmo.x + right.atmo.x + top.atmo.x + bottom.atmo.x) * 0.25;
  let vaporWindDelta = windTransportDelta(c.atmo.x, left.atmo.x, right.atmo.x, top.atmo.x, bottom.atmo.x,
    hasLeft, hasRight, hasTop, hasBottom, selfWind, leftWind, rightWind, topWind, bottomWind, dt, f32(size), 0.6,
    0.0, 0.0, 0.0, 0.0, 0.0);
  var vapor = max(0.0, c.atmo.x + (neighbourVapor - c.atmo.x) * dt * 0.18
    + vaporWindDelta + evaporation + P.environment.x * dt * 0.06);
  // Condensation: colder air holds less vapor before the excess condenses into cloud (tuned to
  // the scale a small lake's evaporation actually reaches in a demo-length run, not a literal
  // g/m3 curve -- this is a game-scale abstraction, not a weather model). Smoke acts as
  // condensation nuclei (real pyrocumulus effect): a smoky cell condenses more readily.
  let saturation = (0.0006 + localTemp * 0.006) * (1.0 - min(0.5, c.combust.y * 0.3));
  let condensed = max(0.0, vapor - saturation) * dt * 0.6;
  vapor -= condensed;
  let neighbourCloud = (left.atmo.y + right.atmo.y + top.atmo.y + bottom.atmo.y) * 0.25;
  // precip's own rate (cloudOld * dt * 0.22, see above) is the same constant fraction at every
  // cell this step, so reserving it needs no per-cell recomputation like melt's.
  let precipFraction = min(1.0, dt * 0.22);
  let cloudWindDelta = windTransportDelta(cloudOld, left.atmo.y, right.atmo.y, top.atmo.y, bottom.atmo.y,
    hasLeft, hasRight, hasTop, hasBottom, selfWind, leftWind, rightWind, topWind, bottomWind, dt, f32(size), 0.6,
    precipFraction, precipFraction, precipFraction, precipFraction, precipFraction);
  let cloud = max(0.0, cloudOld + (neighbourCloud - cloudOld) * dt * 0.35 + cloudWindDelta - precip + condensed);

  // --- Combustion: BIOMASS is the fuel, not a separate stock. FIRE is a self-sustaining 0..1
  // intensity -- once heat (a HEAT stamp, or a blazing neighbour) crosses the ignition
  // threshold on dry-enough fuel, the fire keeps itself going by consuming biomass and
  // releasing its own heat, exactly the positive-feedback chain real combustion is, until it
  // either runs out of fuel or gets doused by wetness/water/rain.
  let biomassOld = c.bio.x;
  // Downwind spread should visibly outrun upwind spread -- a neighbour's fire threatens this
  // cell more when the local wind (selfWind, i.e. last step's field) blows FROM that neighbour
  // TOWARD here, not just from raw adjacency. Same direction convention windAlong already
  // established: windBiasLeft>1 means wind blows away from the left neighbour, toward us.
  let windBiasLeft = clamp(1.0 + selfWind.x * 2.2, 0.15, 2.4);
  let windBiasRight = clamp(1.0 - selfWind.x * 2.2, 0.15, 2.4);
  let windBiasTop = clamp(1.0 + selfWind.y * 2.2, 0.15, 2.4);
  let windBiasBottom = clamp(1.0 - selfWind.y * 2.2, 0.15, 2.4);
  let neighbourFireMax = max(
    max(left.combust.x * windBiasLeft, right.combust.x * windBiasRight),
    max(top.combust.x * windBiasTop, bottom.combust.x * windBiasBottom));
  let canBurn = biomassOld > 0.012 && wetness < 0.42 && iceOld < 0.4;
  let ignitionSignal = max(c.bio.z, neighbourFireMax);
  let igniteRate = select(0.0, max(0.0, ignitionSignal - 0.22) * 4.5, canBurn);
  let douseRate = wetness * 1.6 + water * 3.2 + iceOld * 2.5 + select(3.0, 0.05, canBurn);
  let fire = clamp(c.combust.x + (igniteRate - douseRate * c.combust.x) * dt, 0.0, 1.0);
  // Burn slowly enough that fuel doesn't vanish in a fraction of a second -- a real fire needs
  // to still be blazing a few seconds from now for it to have spread anywhere.
  let fuelBurn = min(biomassOld, (biomassOld * fire * 0.45 + fire * 0.006) * dt);
  let heatRelease = fuelBurn * 20.0;
  let smokeRelease = fuelBurn * 3.5;
  let ashRelease = fuelBurn * 0.55;

  let neighbourHeat = (left.bio.z + right.bio.z + top.bio.z + bottom.bio.z) * 0.25;
  var heat = clamp(c.bio.z + (neighbourHeat - c.bio.z) * dt * 0.8 + heatRelease
    - (0.08 + wetness * 0.55 + water * 2.0) * dt, 0.0, 1.0);
  var disturbance = clamp(c.bio.w * max(0.0, 1.0 - dt * 0.16) + hailImpact, 0.0, 1.0);

  // Smoke: drifts downwind like vapor/cloud (isotropic diffusion plus the same conservative
  // wind flux, tuned faster since a plume should visibly stretch out, not just haze in place),
  // and simply thins out over time (no separate "settle" reservoir -- it just disperses,
  // unlike ash which actually falls to the ground).
  let neighbourSmoke = (left.combust.y + right.combust.y + top.combust.y + bottom.combust.y) * 0.25;
  // Same reasoning as precipFraction above: decay's rate (dt * 0.35) is constant across the
  // grid this step, so it needs no per-cell recomputation either.
  let smokeDecayFraction = min(1.0, dt * 0.35);
  let smokeWindDelta = windTransportDelta(c.combust.y, left.combust.y, right.combust.y, top.combust.y, bottom.combust.y,
    hasLeft, hasRight, hasTop, hasBottom, selfWind, leftWind, rightWind, topWind, bottomWind, dt, f32(size), 1.4,
    smokeDecayFraction, smokeDecayFraction, smokeDecayFraction, smokeDecayFraction, smokeDecayFraction);
  let smoke = max(0.0, c.combust.y + (neighbourSmoke - c.combust.y) * dt * 0.6
    + smokeWindDelta + smokeRelease - c.combust.y * dt * 0.35);

  // Ash: settles where it's released, slowly washed away by rain, and boosts the fertility a
  // burned patch regrows with (real post-fire ecology) via the growth formula below.
  let ash = max(0.0, c.combust.z + ashRelease - c.combust.z * dt * 0.015 - c.combust.z * rainPart * 4.0);

  let moistureFit = smoothstep(0.12, 0.46, wetness)
    * (1.0 - smoothstep(0.72, 1.05, wetness + water * 5.0));
  let temperatureFit = 1.0 - clamp(abs(P.environment.z - 0.55) / 0.52, 0.0, 1.0);
  let neighbourBiomass = (left.bio.x + right.bio.x + top.bio.x + bottom.bio.x) * 0.25;
  // Seeds ride the wind, same as pollen/dandelion seeds/spores in real vegetation -- mirrors
  // the CPU reference's seedWindDelta exactly (mass-conserving via windTransportDelta, gentle
  // rate since seeds are a much lighter payload than snow/sand).
  let seedWindDelta = windTransportDelta(c.bio.y, left.bio.y, right.bio.y, top.bio.y, bottom.bio.y,
    hasLeft, hasRight, hasTop, hasBottom, selfWind, leftWind, rightWind, topWind, bottomWind, dt, f32(size), 0.5,
    0.0, 0.0, 0.0, 0.0, 0.0);
  var seed = clamp(c.bio.y + neighbourBiomass * moistureFit * dt * 0.012 + seedWindDelta - dt * 0.0015, 0.0, 1.0);
  let fertility = 1.0 + min(0.6, ash * 1.4);
  let growth = seed * moistureFit * P.environment.y * temperatureFit
    * (1.0 - disturbance) * P.rates.z * fertility * dt;
  let crowding = c.bio.x * c.bio.x * dt * 0.022;
  let damage = (heat * 0.72 + max(0.0, water - 0.12) * 0.4 + disturbance * 0.2) * dt;
  // Real per-cell plant succession, mirrors runtime/world-sandbox-reference.mjs's PLANT_TYPE/
  // PLANT_AGE model exactly (see that file's own comment for the full explanation). c.wind.zw
  // carries plantType/plantAge -- genuine unused alignment padding until this, not a spare wind
  // channel, see GPU_CELL_STRIDE's own comment in this file for why that's where it lives.
  let plantTypeOld = c.wind.z;
  // Shrubs/trees displace flowers and bare growth around them, but only while THIS cell hasn't
  // itself reached shrub stage (co-existing canopy, not competition).
  let neighbourDominance = select(0.0, max(
      max(select(0.0, left.bio.x, left.wind.z >= 2.0), select(0.0, right.bio.x, right.wind.z >= 2.0)),
      max(select(0.0, top.bio.x, top.wind.z >= 2.0), select(0.0, bottom.bio.x, bottom.wind.z >= 2.0))
    ), plantTypeOld < 2.0);
  let shrubCrowding = neighbourDominance * dt * 0.03;
  var biomass = clamp(c.bio.x + growth - crowding - shrubCrowding - damage - fuelBurn, 0.0, 1.0);

  // Age only accumulates while this is a genuinely established, healthy stand and decays back
  // down otherwise (slower than it grows), so a burned/drought-killed grove reverts toward
  // early succession instead of staying "tree" forever once the tree itself is gone. Thresholds
  // (6 / 40 / 220 simulated seconds) match runtime/world-sandbox-reference.mjs's PLANT_AGE_
  // FLOWER/SHRUB/TREE constants exactly.
  let establishedFit = smoothstep(0.32, 0.55, biomass);
  let ageOld = c.wind.w;
  let age = max(0.0, ageOld + establishedFit * dt * 1.0 - (1.0 - establishedFit) * dt * 0.6);
  let canSupportShrub = moistureFit > 0.4;
  let canSupportTree = moistureFit > 0.55 && P.environment.z > 0.3;
  var plantType = plantTypeOld;
  if (age > 220.0 && canSupportTree) {
    plantType = 3.0;
  } else if (age > 40.0 && canSupportShrub) {
    plantType = max(plantType, 2.0);
  } else if (age > 6.0) {
    plantType = max(plantType, 1.0);
  }
  if (age < 3.0) {
    plantType = 0.0;
  }
  if (biomass < 0.05) {
    plantType = 0.0;
  }

  let fixedScale = 1.0 / 4096.0;
  sand += f32(atomicLoad(&deposits[i].sand)) * fixedScale;
  water += f32(atomicLoad(&deposits[i].water)) * fixedScale;
  heat = clamp(heat + f32(atomicLoad(&deposits[i].heat)) * fixedScale, 0.0, 1.0);
  seed = clamp(seed + f32(atomicLoad(&deposits[i].seed)) * fixedScale, 0.0, 1.0);

  let uv = (vec2<f32>(gid.xy) + 0.5) / f32(size);
  let stampCount = min(u32(P.sim.z), 32u);
  // STAMP.CARVE's velocity kick accumulates here rather than into the velocity local above
  // (which was already computed from LAST step's c.water.yz before this loop runs) -- this WGSL
  // kernel
  // applies stamps interleaved with the rest of the step instead of as a separate pre-pass the
  // way runtime/world-sandbox-reference.mjs's applyStamps() does, so a carve stamp's push shows
  // up in velocity/speed/erosion starting NEXT step, not this one. One frame (~33ms at 30
  // steps/second) of lag, not a correctness gap -- restructuring this kernel into a genuine
  // stamp pre-pass to remove it is a larger, separately-verified change, not bundled in here.
  var carveVelocity = vec2<f32>(0.0);
  for (var si = 0u; si < 32u; si++) {
    if (si >= stampCount) {
      break;
    }
    let stamp = stamps[si];
    let radius = max(1.0 / f32(size), stamp.position.z);
    let distanceToStamp = distance(uv, stamp.position.xy);
    if (distanceToStamp > radius) {
      continue;
    }
    let weight = pow(1.0 - distanceToStamp / radius, 2.0);
    let amount = stamp.data.y * weight;
    let kind = u32(stamp.data.x + 0.5);
    if (kind == 1u) {
      sand += amount;
    } else if (kind == 2u) {
      // Capped, not just accumulated: mirrors runtime/world-sandbox-reference.mjs's
      // MAX_WATER_DEPTH exactly -- repeated stamping (painting, the normal way to add
      // water) had no upper bound, and the water HEIGHT itself feeds the rendered mesh, so
      // an unbounded value here is a literal multi-unit-tall spike, not a color artifact.
      water = clamp(water + amount, 0.0, 1.2);
      wetness = clamp(wetness + amount * 5.0, 0.0, 1.0);
    } else if (kind == 3u) {
      seed = clamp(seed + amount * 3.0, 0.0, 1.0);
    } else if (kind == 4u) {
      sand = max(0.0, sand - amount);
      c.terrain.z = clamp(c.terrain.z - amount * 2.0, 0.0, 1.0);
    } else if (kind == 5u) {
      heat = clamp(heat + amount * 4.0, 0.0, 1.0);
    } else if (kind == 6u) {
      disturbance = clamp(disturbance + amount * 3.0, 0.0, 1.0);
      c.terrain.z = clamp(c.terrain.z + amount * 2.0, 0.0, 1.0);
    } else if (kind == 7u) {
      sand = max(0.0, sand - amount * 0.45);
      water = max(0.0, water - amount * 0.08);
      disturbance = clamp(disturbance + amount * 4.0, 0.0, 1.0);
      c.terrain.z = clamp(c.terrain.z + amount * 2.5, 0.0, 1.0);
    } else if (kind == 8u) {
      // Magnifying glass: mirrors runtime/world-sandbox-reference.mjs's STAMP.FOCUS
      // exactly. Unlike kind 5 (HEAT, an instant sun-independent torch), this only
      // concentrates REAL sunlight -- its effect scales with P.environment.y (sun), so it
      // does almost nothing at a dim/overcast setting. No new ignition logic: held
      // steadily over dry fuel, it just lets HEAT climb toward the same ignition
      // threshold combustion already uses.
      let focusStrength = clamp(P.environment.y, 0.0, 1.0);
      heat = clamp(heat + amount * focusStrength * 2.6, 0.0, 1.0);
    } else if (kind == 9u) {
      // "Wasserbändigen": mirrors runtime/world-sandbox-reference.mjs's STAMP.CARVE, with one
      // deliberate timing difference from the CPU reference explained below. Adds water, then
      // kicks velocity hard in the stroke's own drag direction (already packed into
      // stamp.data.zw, unused until this) so the speed-driven erosion term that already exists
      // (not a new mechanic) does the actual cutting.
      water = clamp(water + amount * 0.6, 0.0, 1.2);
      wetness = clamp(wetness + amount * 3.0, 0.0, 1.0);
      carveVelocity += stamp.data.zw * amount * 6.0;
    }
  }

  var next = c;
  next.terrain.y = max(0.0, sand);
  next.terrain.w = wetness;
  // Safety net matching the stamp-time cap above: rain/springs/snowmelt all add water
  // through paths other than a direct stamp, so the ceiling belongs here too.
  let carriedVelocity = clamp(velocity + carveVelocity, vec2<f32>(-4.0), vec2<f32>(4.0));
  next.water = vec4<f32>(clamp(water, 0.0, 1.2), carriedVelocity.x, carriedVelocity.y, max(0.0, sediment));
  next.bio = vec4<f32>(biomass, seed, heat, disturbance);
  next.atmo = vec4<f32>(vapor, cloud, ice, max(0.0, snow));
  next.combust = vec4<f32>(fire, smoke, ash, groundwater);
  next.wind = vec4<f32>(windX, windZ, plantType, age);
  dst[i] = next;
}
`;

export const PARTICLE_COMPUTE_WGSL = /* wgsl */ `
struct Params {
  sim: vec4<f32>,
  environment: vec4<f32>,
  rates: vec4<f32>,
  emitter: vec4<f32>,
  particle: vec4<f32>,
  probe: vec4<f32>,
  spare: vec4<f32>,
}

struct Cell {
  terrain: vec4<f32>,
  water: vec4<f32>,
  bio: vec4<f32>,
  atmo: vec4<f32>,
  combust: vec4<f32>,
  wind: vec4<f32>,
}

struct Particle {
  position: vec4<f32>,
  velocity: vec4<f32>,
  payload: vec4<f32>,
}

struct Deposit {
  sand: atomic<u32>,
  water: atomic<u32>,
  heat: atomic<u32>,
  seed: atomic<u32>,
}

@group(0) @binding(0) var<uniform> P: Params;
@group(0) @binding(1) var<storage, read> cells: array<Cell>;
@group(0) @binding(2) var<storage, read_write> particles: array<Particle>;
@group(0) @binding(3) var<storage, read_write> deposits: array<Deposit>;

fn hash(value: u32) -> f32 {
  var n = value * 747796405u + 2891336453u;
  n = ((n >> ((n >> 28u) + 4u)) ^ n) * 277803737u;
  n = (n >> 22u) ^ n;
  return f32(n & 0x00ffffffu) / 16777215.0;
}

fn worldIndex(position: vec2<f32>) -> u32 {
  let size = u32(P.sim.y);
  let cell = min(
    vec2<u32>(size - 1u),
    vec2<u32>(clamp(position, vec2<f32>(0.0), vec2<f32>(0.999999)) * f32(size))
  );
  return cell.y * size + cell.x;
}

@compute @workgroup_size(128, 1, 1)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let i = gid.x;
  let count = u32(P.particle.z);
  if (i >= count || count == 0u) {
    return;
  }
  var particle = particles[i];
  let spawnBase = u32(P.particle.x) % count;
  let spawnCount = min(u32(P.particle.y), count);
  let relative = (i + count - spawnBase) % count;
  let shouldSpawn = spawnCount > 0u && relative < spawnCount;
  let tick = u32(P.sim.w);

  if (shouldSpawn) {
    let r0 = hash(i * 11u + tick * 101u);
    let r1 = hash(i * 17u + tick * 193u);
    let r2 = hash(i * 29u + tick * 241u);
    let angle = r0 * 6.2831853;
    let radius = sqrt(r1) * (0.006 + P.emitter.w * 0.026);
    let xz = clamp(
      P.emitter.xy + vec2<f32>(cos(angle), sin(angle)) * radius,
      vec2<f32>(0.002),
      vec2<f32>(0.998)
    );
    let cell = cells[worldIndex(xz)];
    let top = cell.terrain.x + cell.terrain.y + cell.water.x;
    let kind = max(1.0, P.emitter.z);
    particle.position = vec4<f32>(xz.x, top + 0.035 + r2 * 0.12, xz.y, 0.0);
    particle.velocity = vec4<f32>(
      cos(angle) * (0.03 + r2 * 0.09),
      0.22 + r1 * 0.36,
      sin(angle) * (0.03 + r0 * 0.09),
      0.65 + r2 * 1.1
    );
    particle.payload = vec4<f32>(kind, r0, 0.0, 1.0);
  }

  if (particle.payload.w < 0.5) {
    particles[i] = particle;
    return;
  }

  let dt = P.sim.x;
  let kind = u32(particle.payload.x + 0.5);
  let drag = select(0.7, 1.8, kind == 1u);
  // WGSL (at least this Tint build) rejects compound assignment through a multi-component
  // swizzle lvalue (particle.velocity.xyz *= ...) -- rebuilding the full vec4 avoids relying
  // on that being supported at all, rather than depending on undefined/implementation-varying
  // behaviour.
  particle.velocity = vec4<f32>(particle.velocity.xyz * max(0.0, 1.0 - drag * dt), particle.velocity.w);
  particle.velocity.y -= 0.86 * dt;
  particle.position = vec4<f32>(particle.position.xyz + particle.velocity.xyz * dt, particle.position.w);
  particle.position.w += dt;

  if (particle.position.x < 0.0 || particle.position.x > 1.0) {
    particle.velocity.x *= -0.45;
    particle.position.x = clamp(particle.position.x, 0.001, 0.999);
  }
  if (particle.position.z < 0.0 || particle.position.z > 1.0) {
    particle.velocity.z *= -0.45;
    particle.position.z = clamp(particle.position.z, 0.001, 0.999);
  }

  let cellIndex = worldIndex(particle.position.xz);
  let cell = cells[cellIndex];
  let collisionHeight = cell.terrain.x + cell.terrain.y + select(0.0, cell.water.x, kind == 1u);
  let expired = particle.position.w >= particle.velocity.w;
  if (particle.position.y <= collisionHeight || expired) {
    let amount = u32(clamp(22.0 + length(particle.velocity.xyz) * 90.0, 1.0, 220.0));
    if (kind == 1u) {
      atomicAdd(&deposits[cellIndex].water, amount);
    } else if (kind == 2u) {
      atomicAdd(&deposits[cellIndex].sand, amount);
    } else if (kind == 3u) {
      atomicAdd(&deposits[cellIndex].seed, amount);
    } else if (kind == 4u) {
      atomicAdd(&deposits[cellIndex].heat, amount);
    }
    particle.payload.w = 0.0;
  }
  particles[i] = particle;
}
`;

export const QUERY_COMPUTE_WGSL = /* wgsl */ `
struct Params {
  sim: vec4<f32>,
  environment: vec4<f32>,
  rates: vec4<f32>,
  emitter: vec4<f32>,
  particle: vec4<f32>,
  probe: vec4<f32>,
  spare: vec4<f32>,
}

struct Cell {
  terrain: vec4<f32>,
  water: vec4<f32>,
  bio: vec4<f32>,
  atmo: vec4<f32>,
  combust: vec4<f32>,
  wind: vec4<f32>,
}

@group(0) @binding(0) var<uniform> P: Params;
@group(0) @binding(1) var<storage, read> cells: array<Cell>;
@group(0) @binding(2) var<storage, read> request: array<vec4<f32>>;
@group(0) @binding(3) var<storage, read_write> result: array<vec4<f32>>;

@compute @workgroup_size(1, 1, 1)
fn main() {
  let size = u32(P.sim.y);
  let query = request[0];
  let position = clamp(query.xy, vec2<f32>(0.0), vec2<f32>(0.999999));
  let cellPosition = min(vec2<u32>(size - 1u), vec2<u32>(position * f32(size)));
  let cell = cells[cellPosition.y * size + cellPosition.x];
  let ground = cell.terrain.x + cell.terrain.y;
  result[0] = vec4<f32>(query.z, ground, ground + cell.water.x, cell.terrain.w);
  result[1] = vec4<f32>(cell.water.x, cell.bio.x, cell.bio.z, cell.terrain.y);
}
`;

export const WORLD_RENDER_WGSL = /* wgsl */ `
struct RenderParams {
  resolution: vec4<f32>,
  view: vec4<f32>,
  body: vec4<f32>,
  cursor: vec4<f32>,
}

struct Cell {
  terrain: vec4<f32>,
  water: vec4<f32>,
  bio: vec4<f32>,
  atmo: vec4<f32>,
  combust: vec4<f32>,
  wind: vec4<f32>,
}

struct VertexOut {
  @builtin(position) position: vec4<f32>,
  @location(0) uv: vec2<f32>,
}

@group(0) @binding(0) var<uniform> R: RenderParams;
@group(0) @binding(1) var<storage, read> cells: array<Cell>;

fn hash(position: vec2<f32>) -> f32 {
  return fract(sin(dot(position, vec2<f32>(127.1, 311.7))) * 43758.5453);
}

fn indexAt(position: vec2<i32>) -> u32 {
  let size = i32(R.resolution.z);
  let p = clamp(position, vec2<i32>(0), vec2<i32>(size - 1));
  return u32(p.y * size + p.x);
}

@vertex
fn vs(@builtin(vertex_index) vertexIndex: u32) -> VertexOut {
  let positions = array<vec2<f32>, 3>(
    vec2<f32>(-1.0, -1.0),
    vec2<f32>(3.0, -1.0),
    vec2<f32>(-1.0, 3.0)
  );
  let p = positions[vertexIndex];
  var output: VertexOut;
  output.position = vec4<f32>(p, 0.0, 1.0);
  output.uv = vec2<f32>(p.x * 0.5 + 0.5, 1.0 - (p.y * 0.5 + 0.5));
  return output;
}

@fragment
fn fs(input: VertexOut) -> @location(0) vec4<f32> {
  let size = i32(R.resolution.z);
  let p = vec2<i32>(clamp(input.uv, vec2<f32>(0.0), vec2<f32>(0.999999)) * f32(size));
  let cell = cells[indexAt(p)];
  let left = cells[indexAt(p + vec2<i32>(-1, 0))];
  let right = cells[indexAt(p + vec2<i32>(1, 0))];
  let top = cells[indexAt(p + vec2<i32>(0, -1))];
  let bottom = cells[indexAt(p + vec2<i32>(0, 1))];
  let ground = cell.terrain.x + cell.terrain.y;
  let grad = vec2<f32>(
    (right.terrain.x + right.terrain.y) - (left.terrain.x + left.terrain.y),
    (bottom.terrain.x + bottom.terrain.y) - (top.terrain.x + top.terrain.y)
  ) * f32(size) * 0.38;
  let normal = normalize(vec3<f32>(-grad.x, 1.0, -grad.y));
  let light = normalize(vec3<f32>(-0.46, 0.82, -0.33));
  let diffuse = 0.38 + 0.62 * max(dot(normal, light), 0.0);
  let grain = hash(vec2<f32>(p));
  let sandCoverage = smoothstep(0.002, 0.055, cell.terrain.y);
  var color = mix(
    vec3<f32>(0.19, 0.17, 0.14),
    vec3<f32>(0.69, 0.43, 0.18) + (grain - 0.5) * 0.055,
    sandCoverage
  );
  color *= diffuse;
  color = mix(color, color * vec3<f32>(0.43, 0.51, 0.55), clamp(cell.terrain.w * 0.72, 0.0, 0.78));

  let speed = length(cell.water.yz);
  if (cell.water.x > 0.0003) {
    let depth = clamp(cell.water.x * 11.0, 0.0, 1.0);
    let waterColor = mix(vec3<f32>(0.08, 0.44, 0.47), vec3<f32>(0.015, 0.10, 0.20), depth);
    let waterNormal = normalize(vec3<f32>(
      -(right.water.x - left.water.x) * 18.0,
      1.0,
      -(bottom.water.x - top.water.x) * 18.0
    ));
    let sparkle = pow(max(dot(waterNormal, normalize(vec3<f32>(-0.45, 0.82, -0.31))), 0.0), 34.0);
    let foam = smoothstep(0.34, 1.2, speed)
      * (0.45 + 0.55 * hash(vec2<f32>(p) + floor(R.view.y * 8.0)));
    color = mix(color, waterColor + sparkle * vec3<f32>(0.65, 0.78, 0.82), 0.42 + depth * 0.45);
    color = mix(color, vec3<f32>(0.82, 0.88, 0.80), foam * 0.58);
  }

  let vegetationPattern = smoothstep(0.30, 0.75, hash(vec2<f32>(p) * 0.47 + 19.3));
  let vegetation = clamp(cell.bio.x * (0.75 + vegetationPattern * 0.45), 0.0, 1.0);
  color = mix(color, vec3<f32>(0.08, 0.31 + grain * 0.08, 0.11) * (0.72 + diffuse * 0.42), vegetation * 0.92);
  color = mix(color, vec3<f32>(0.92, 0.20, 0.035), cell.bio.z * (0.35 + grain * 0.35));

  let mode = u32(R.view.x + 0.5);
  if (mode == 1u) {
    color = vec3<f32>(clamp(ground * 2.1, 0.0, 1.0));
  } else if (mode == 2u) {
    color = vec3<f32>(0.02, 0.16, 0.24)
      + vec3<f32>(0.03, 0.62, 0.88) * clamp(cell.water.x * 12.0, 0.0, 1.0);
  } else if (mode == 3u) {
    color = mix(vec3<f32>(0.17, 0.075, 0.025), vec3<f32>(0.08, 0.55, 0.92), cell.terrain.w);
  } else if (mode == 4u) {
    color = mix(vec3<f32>(0.025, 0.035, 0.028), vec3<f32>(0.18, 0.93, 0.26), cell.bio.x);
  } else if (mode == 5u) {
    color = vec3<f32>(0.06) + vec3<f32>(abs(cell.water.y), length(cell.water.yz), abs(cell.water.z)) * 0.8;
  } else if (mode == 6u) {
    color = mix(vec3<f32>(0.025, 0.04, 0.09), vec3<f32>(1.0, 0.12, 0.015), cell.bio.z);
  }

  let cursorDistance = distance(input.uv, R.cursor.xy);
  let cursorEdge = 1.0 - smoothstep(0.003, 0.008, abs(cursorDistance - R.cursor.z));
  color = mix(color, vec3<f32>(0.70, 0.81, 1.0), cursorEdge * R.cursor.w * 0.8);

  if (R.body.w > 0.5) {
    let shadowUv = R.body.xy + vec2<f32>(0.006, 0.008);
    let shadow = 1.0 - smoothstep(0.012, 0.026 + R.body.z * 0.008, distance(input.uv, shadowUv));
    color *= 1.0 - shadow * 0.35;
    let stone = 1.0 - smoothstep(0.010, 0.018, distance(input.uv, R.body.xy));
    let stoneLight = clamp(0.42 + R.body.z * 0.5, 0.42, 0.92);
    color = mix(color, vec3<f32>(0.27, 0.29, 0.31) * stoneLight, stone);
  }

  let vignette = 1.0 - smoothstep(0.55, 0.88, distance(input.uv, vec2<f32>(0.5)));
  color *= 0.78 + vignette * 0.22;
  return vec4<f32>(pow(max(color, vec3<f32>(0.0)), vec3<f32>(1.0 / 2.2)), 1.0);
}
`;

export const PARTICLE_RENDER_WGSL = /* wgsl */ `
struct RenderParams {
  resolution: vec4<f32>,
  view: vec4<f32>,
  body: vec4<f32>,
  cursor: vec4<f32>,
}

struct Particle {
  position: vec4<f32>,
  velocity: vec4<f32>,
  payload: vec4<f32>,
}

struct VertexOut {
  @builtin(position) position: vec4<f32>,
  @location(0) local: vec2<f32>,
  @location(1) @interpolate(flat) kind: u32,
  @location(2) alpha: f32,
}

@group(0) @binding(0) var<uniform> R: RenderParams;
@group(0) @binding(1) var<storage, read> particles: array<Particle>;

@vertex
fn vs(@builtin(vertex_index) vertexIndex: u32, @builtin(instance_index) instanceIndex: u32) -> VertexOut {
  let corners = array<vec2<f32>, 6>(
    vec2<f32>(-1.0, -1.0),
    vec2<f32>(1.0, -1.0),
    vec2<f32>(-1.0, 1.0),
    vec2<f32>(-1.0, 1.0),
    vec2<f32>(1.0, -1.0),
    vec2<f32>(1.0, 1.0)
  );
  let particle = particles[instanceIndex];
  let corner = corners[vertexIndex];
  let active = particle.payload.w;
  let centre = vec2<f32>(
    particle.position.x * 2.0 - 1.0,
    (1.0 - particle.position.z) * 2.0 - 1.0 + particle.position.y * 0.10
  );
  let kind = u32(particle.payload.x + 0.5);
  let pixelSize = select(2.0, 3.2, kind == 1u) + clamp(particle.position.y * 2.0, 0.0, 2.0);
  let clipSize = vec2<f32>(
    pixelSize * 2.0 / max(1.0, R.resolution.x),
    pixelSize * 2.0 / max(1.0, R.resolution.y)
  );
  var output: VertexOut;
  output.position = vec4<f32>(
    select(vec2<f32>(-4.0), centre + corner * clipSize, active > 0.5),
    0.0,
    1.0
  );
  output.local = corner;
  output.kind = kind;
  output.alpha = active;
  return output;
}

@fragment
fn fs(input: VertexOut) -> @location(0) vec4<f32> {
  let radial = length(input.local);
  if (radial > 1.0 || input.alpha < 0.5) {
    discard;
  }
  var color = vec3<f32>(0.90, 0.65, 0.28);
  if (input.kind == 1u) {
    color = vec3<f32>(0.35, 0.76, 1.0);
  } else if (input.kind == 3u) {
    color = vec3<f32>(0.50, 0.92, 0.28);
  } else if (input.kind == 4u) {
    color = vec3<f32>(1.0, 0.31, 0.045);
  }
  let alpha = (1.0 - smoothstep(0.45, 1.0, radial)) * 0.9;
  return vec4<f32>(color, alpha);
}
`;

// Spatial presentation of the same CA state.  The solver remains a compact
// 2.5D field, while this renderer turns that field into actual terrain,
// independent water, vegetation blades and depth-tested interaction objects.
export const WORLD_SPATIAL_RENDER_WGSL = /* wgsl */ `
struct RenderParams {
  resolution: vec4<f32>,
  view: vec4<f32>,
  body: vec4<f32>,
  cursor: vec4<f32>,
  camera: vec4<f32>,
  spare0: vec4<f32>,
  spare1: vec4<f32>,
  spare2: vec4<f32>,
}

struct Cell {
  terrain: vec4<f32>,
  water: vec4<f32>,
  bio: vec4<f32>,
  atmo: vec4<f32>,
  combust: vec4<f32>,
  wind: vec4<f32>,
}

struct SurfaceOut {
  @builtin(position) position: vec4<f32>,
  @location(0) world: vec3<f32>,
  @location(1) normal: vec3<f32>,
  @location(2) uv: vec2<f32>,
  @location(3) terrain: vec4<f32>,
  @location(4) water: vec4<f32>,
  @location(5) bio: vec4<f32>,
  @location(6) atmo: vec4<f32>,
  @location(7) combust: vec4<f32>,
}

struct BladeOut {
  @builtin(position) position: vec4<f32>,
  @location(0) local: vec2<f32>,
  @location(1) color: vec3<f32>,
  // 0..3, mirrors FIELD.PLANT_TYPE (see world-sandbox-reference.mjs) -- carried through so
  // fsGrass can give TREE its own trunk-near-base/canopy-near-tip colour gradient instead of
  // one flat blade colour.
  @location(2) plantType: f32,
}

struct BodyOut {
  @builtin(position) position: vec4<f32>,
  @location(0) local: vec2<f32>,
}

@group(0) @binding(0) var<uniform> R: RenderParams;
@group(0) @binding(1) var<storage, read> cells: array<Cell>;

fn hash2(position: vec2<f32>) -> f32 {
  return fract(sin(dot(position, vec2<f32>(127.1, 311.7))) * 43758.5453123);
}

fn gridSize() -> u32 {
  return u32(R.resolution.z);
}

fn indexAt(position: vec2<i32>) -> u32 {
  let size = i32(gridSize());
  let p = clamp(position, vec2<i32>(0), vec2<i32>(size - 1));
  return u32(p.y * size + p.x);
}

fn surfaceHeight(position: vec2<i32>, includeWater: bool) -> f32 {
  let cell = cells[indexAt(position)];
  return cell.terrain.x + cell.terrain.y + select(0.0, cell.water.x, includeWater);
}

fn cameraForward() -> vec3<f32> {
  let yaw = R.view.z;
  let pitch = R.view.w;
  return normalize(vec3<f32>(sin(yaw) * cos(pitch), -sin(pitch), cos(yaw) * cos(pitch)));
}

fn cameraRight() -> vec3<f32> {
  return normalize(cross(vec3<f32>(0.0, 1.0, 0.0), cameraForward()));
}

fn cameraUp() -> vec3<f32> {
  return normalize(cross(cameraForward(), cameraRight()));
}

fn project(world: vec3<f32>) -> vec4<f32> {
  let aspect = R.resolution.x / max(1.0, R.resolution.y);
  if (R.spare0.w > 0.5) {
    // Walk mode: real perspective from the player's eye (R.spare0.xyz), looking via the same
    // yaw/pitch slot the orbit camera otherwise occupies (R.view.z/w) -- never both at once.
    // w is left as the TRUE (possibly negative, behind-eye) viewZ, not clamped to the near
    // plane -- clamping it here would hide the true depth from WebGPU's own clip-space near
    // clipping, which runs before the perspective divide, and geometry behind the eye would
    // get smeared across the screen at the clamped depth instead of correctly disappearing.
    let eye = R.spare0.xyz;
    let delta = world - eye;
    let forward = cameraForward();
    let viewX = dot(delta, cameraRight());
    let viewY = dot(delta, cameraUp());
    let viewZ = dot(delta, forward);
    let near = 0.006;
    let far = 3.4;
    let fovTan = 0.62;
    let ndcDepth = clamp((viewZ - near) / (far - near), 0.0005, 0.9995);
    return vec4<f32>(viewX / (fovTan * aspect), viewY / fovTan, ndcDepth * viewZ, viewZ);
  }
  let zoom = max(0.55, R.camera.x);
  let lookTarget = vec3<f32>(0.0, R.camera.z, 0.0);
  let delta = world - lookTarget;
  let forward = cameraForward();
  let viewX = dot(delta, cameraRight());
  let viewY = dot(delta, cameraUp());
  let viewZ = dot(delta, forward);
  return vec4<f32>(
    viewX / max(0.20, zoom * aspect),
    viewY / zoom,
    clamp(0.48 + viewZ * 0.18, 0.01, 0.99),
    1.0
  );
}

fn gridVertex(vertexIndex: u32) -> vec2<u32> {
  let corners = array<vec2<u32>, 6>(
    vec2<u32>(0u, 0u), vec2<u32>(1u, 0u), vec2<u32>(0u, 1u),
    vec2<u32>(0u, 1u), vec2<u32>(1u, 0u), vec2<u32>(1u, 1u)
  );
  let edge = gridSize() - 1u;
  let quad = vertexIndex / 6u;
  return vec2<u32>(quad % edge, quad / edge) + corners[vertexIndex % 6u];
}

fn makeSurface(vertexIndex: u32, includeWater: bool) -> SurfaceOut {
  let grid = gridVertex(vertexIndex);
  let p = vec2<i32>(grid);
  let cell = cells[indexAt(p)];
  let uv = vec2<f32>(grid) / f32(gridSize() - 1u);
  let verticalScale = max(0.2, R.camera.y);
  let height = surfaceHeight(p, includeWater);
  let spacing = 2.0 / f32(gridSize() - 1u);
  let dhx = (surfaceHeight(p + vec2<i32>(1, 0), includeWater)
    - surfaceHeight(p + vec2<i32>(-1, 0), includeWater)) * verticalScale;
  let dhz = (surfaceHeight(p + vec2<i32>(0, 1), includeWater)
    - surfaceHeight(p + vec2<i32>(0, -1), includeWater)) * verticalScale;
  let world = vec3<f32>(uv.x * 2.0 - 1.0, height * verticalScale, uv.y * 2.0 - 1.0);
  var output: SurfaceOut;
  output.position = project(world);
  output.world = world;
  output.normal = normalize(vec3<f32>(-dhx, spacing * 2.0, -dhz));
  output.uv = uv;
  output.terrain = cell.terrain;
  output.water = cell.water;
  output.bio = cell.bio;
  output.atmo = cell.atmo;
  output.combust = cell.combust;
  return output;
}

@vertex
fn vsTerrain(@builtin(vertex_index) vertexIndex: u32) -> SurfaceOut {
  return makeSurface(vertexIndex, false);
}

@vertex
fn vsWater(@builtin(vertex_index) vertexIndex: u32) -> SurfaceOut {
  var output = makeSurface(vertexIndex, true);
  output.world.y += 0.0025;
  output.position = project(output.world);
  return output;
}

fn fieldColor(terrain: vec4<f32>, water: vec4<f32>, bio: vec4<f32>, atmo: vec4<f32>, mode: u32) -> vec3<f32> {
  let height = terrain.x + terrain.y;
  if (mode == 1u) {
    let h = clamp(height * 2.15, 0.0, 1.0);
    return mix(vec3<f32>(0.025, 0.035, 0.04), vec3<f32>(0.88, 0.91, 0.90), h);
  }
  if (mode == 2u) {
    return mix(vec3<f32>(0.018, 0.028, 0.026), vec3<f32>(0.04, 0.58, 0.78), clamp(water.x * 13.0, 0.0, 1.0));
  }
  if (mode == 3u) {
    return mix(vec3<f32>(0.20, 0.075, 0.025), vec3<f32>(0.08, 0.48, 0.73), terrain.w);
  }
  if (mode == 4u) {
    return mix(vec3<f32>(0.025, 0.031, 0.026), vec3<f32>(0.28, 0.70, 0.18), bio.x);
  }
  if (mode == 5u) {
    return vec3<f32>(0.035) + vec3<f32>(abs(water.y), length(water.yz), abs(water.z)) * 0.75;
  }
  if (mode == 7u) {
    // Weather debug view: red=vapor (gas), green=cloud (condensed), blue=snow, ice pales toward white.
    let base = vec3<f32>(
      clamp(atmo.x * 60.0, 0.0, 1.0),
      clamp(atmo.y * 70.0, 0.0, 1.0),
      clamp(atmo.w * 14.0, 0.0, 1.0)
    );
    return mix(vec3<f32>(0.02, 0.02, 0.03) + base, vec3<f32>(0.85, 0.90, 0.93), clamp(atmo.z, 0.0, 1.0) * 0.8);
  }
  return mix(vec3<f32>(0.035, 0.045, 0.055), vec3<f32>(0.88, 0.15, 0.025), bio.z);
}

@fragment
fn fsTerrain(input: SurfaceOut) -> @location(0) vec4<f32> {
  let mode = u32(R.view.x + 0.5);
  let n = normalize(input.normal);
  // Day/night: sun direction rotates with R.spare1.x (0=midnight, 0.5=noon), driving both
  // light direction/strength here and the sky/fog gradient below from the same source of
  // truth (sunElevationOf) -- icy night comes from this dimming and cooling the terrain, not
  // a separate "night mode" switch.
  let dayNight = R.spare1.x;
  let temperature = R.spare1.y;
  let sunElevation = sunElevationOf(dayNight);
  let sunAzimuth = dayNight * 6.2831853;
  let sun = normalize(vec3<f32>(cos(sunAzimuth) * (1.0 - abs(sunElevation) * 0.3), max(0.06, sunElevation), sin(sunAzimuth) * (1.0 - abs(sunElevation) * 0.3)));
  let dayFactor = smoothstep(-0.18, 0.08, sunElevation);
  let diffuse = max(dot(n, sun), 0.0) * (0.18 + dayFactor * 0.82);
  let hemi = (0.09 + dayFactor * 0.17) + 0.24 * n.y * (0.35 + dayFactor * 0.65);
  let macroNoise = hash2(floor(input.world.xz * 74.0)) - 0.5;
  let fineNoise = hash2(floor(input.world.xz * 230.0) + 17.0) - 0.5;
  let sandCoverage = smoothstep(0.004, 0.07, input.terrain.y);
  let slope = clamp(1.0 - n.y, 0.0, 1.0);
  var rock = vec3<f32>(0.235, 0.218, 0.188) + macroNoise * 0.035;
  var sand = vec3<f32>(0.58, 0.405, 0.225) + macroNoise * 0.055 + fineNoise * 0.018;
  sand = mix(sand, vec3<f32>(0.43, 0.31, 0.18), slope * 0.55);
  var color = mix(rock, sand, sandCoverage);
  let wet = clamp(input.terrain.w, 0.0, 1.0);
  color = mix(color, color * vec3<f32>(0.43, 0.49, 0.50), wet * 0.70);
  let groundCover = smoothstep(0.025, 0.42, input.bio.x) * (0.72 + macroNoise * 0.22);
  color = mix(color, vec3<f32>(0.16, 0.285, 0.105), groundCover * 0.62);
  color = mix(color, vec3<f32>(0.105, 0.075, 0.052), input.bio.z * 0.66);
  // Water cycle made visible: frozen ground pales toward blue-white ice, and accumulated
  // snow (atmo.w, a separate reservoir from wet ground) buries the surface in white --
  // snow wins over ice when both are present, since snow sits on top of a frozen lake.
  let icePresence = smoothstep(0.15, 0.75, input.atmo.z);
  color = mix(color, vec3<f32>(0.62, 0.74, 0.80), icePresence * 0.62);
  let snowCoverage = smoothstep(0.006, 0.06, input.atmo.w);
  color = mix(color, vec3<f32>(0.90, 0.93, 0.95) + fineNoise * 0.02, snowCoverage * 0.88);
  // Icy night: not just dimmer, a real cool tint (moonlight has no warmth) so a cold desert
  // night reads as cold, not just "day with the brightness turned down."
  color = mix(color * vec3<f32>(0.52, 0.60, 0.78), color, dayFactor);
  color *= hemi + diffuse * 0.72;
  let backLight = pow(max(dot(n, normalize(vec3<f32>(0.46, 0.42, 0.76))), 0.0), 3.0);
  color += vec3<f32>(0.07, 0.085, 0.075) * backLight * dayFactor;
  if (mode > 0u) {
    color = fieldColor(input.terrain, input.water, input.bio, input.atmo, mode) * (0.35 + diffuse * 0.65);
  }

  // Combustion made visible: fire reads as its own emissive light source (day or night --
  // a real fire is not just "brighter shadow"), smoke thickens the air right above it into
  // a grey haze, and ash left behind after the fire dies down darkens the ground toward
  // soot instead of the burn scar vanishing without a trace once fuelBurn stops. Gated to
  // mode == 0u (beauty view) only -- applying it unconditionally after the mode>0u block
  // above overwrote every diagnostic field view (WATERFIELD/HOEHENFELD/WETTER/...) with
  // soot/fire/smoke colors instead of the requested field value, and did so inconsistently
  // with the CPU fallback (colorForCell returns its diagnostic colors before ever applying
  // these overlays), making the same experiment backend-dependent.
  if (mode == 0u) {
    let ashPresence = smoothstep(0.02, 0.35, input.combust.z);
    color = mix(color, vec3<f32>(0.05, 0.048, 0.045), ashPresence * 0.55);
    let fireGlow = clamp(input.combust.x, 0.0, 1.0);
    color = mix(color, vec3<f32>(1.0, 0.42, 0.06), fireGlow * 0.72);
    color += vec3<f32>(1.0, 0.55, 0.12) * fireGlow * fireGlow * 0.9;
    let smokeHaze = clamp(input.combust.y * 3.5, 0.0, 0.85);
    color = mix(color, vec3<f32>(0.18, 0.17, 0.16), smokeHaze);
  }

  let cursorDistance = distance(input.uv, R.cursor.xy);
  let edgeWidth = max(0.0025, fwidth(cursorDistance) * 1.35);
  let cursorEdge = 1.0 - smoothstep(edgeWidth, edgeWidth * 2.2, abs(cursorDistance - R.cursor.z));
  color = mix(color, vec3<f32>(0.82, 0.91, 0.86), cursorEdge * R.cursor.w * 0.84);
  // Terrain fades into the actual sky at the horizon (not a fixed haze color) -- this both
  // sells "walk toward the horizon" and hides the finite grid's edge. Heat shimmer wavers the
  // fog distance itself near midday, the same trick fsSky uses on its own gradient.
  let hotFactor = clamp((temperature - 0.55) / 0.4, 0.0, 1.0) * dayFactor;
  let shimmerJitter = sin(input.world.x * 40.0 + R.view.y * 6.0 + input.world.z * 17.0) * 0.08 * hotFactor;
  let facing = atan2(input.world.x, input.world.z + 0.0001);
  let horizonColor = skyColor(0.0, sin(facing + R.view.z) * 0.6, dayNight, temperature, R.view.y);
  let fog = smoothstep(0.62 + shimmerJitter, 1.42, length(input.world.xz));
  color = mix(color, horizonColor, fog * 0.92);
  return vec4<f32>(pow(max(color, vec3<f32>(0.0)), vec3<f32>(1.0 / 2.2)), 1.0);
}

@fragment
fn fsWater(input: SurfaceOut) -> @location(0) vec4<f32> {
  if (input.water.x < 0.00035 || u32(R.view.x + 0.5) != 0u) {
    discard;
  }
  // Ambient ripple for still water -- direction-agnostic, keeps calm ponds from looking dead.
  let ambient = vec2<f32>(
    sin(input.world.x * 31.0 + R.view.y * 2.2) + sin(input.world.z * 43.0 - R.view.y * 1.4),
    cos(input.world.z * 29.0 - R.view.y * 1.9) + cos(input.world.x * 37.0 + R.view.y * 1.2)
  ) * 0.018;
  // The momentum field (input.water.yz, driven by edgeFlow's accelerate-then-damp velocity
  // in the compute kernel) is now the actual transport -- so it should be visible as actual
  // transport here too: ripples travel along the real flow direction and get busier with
  // speed, instead of only reacting to |flow| with a direction-blind noise pattern.
  // A frozen surface (edgeFlow already stopped transporting it) should look still, not just
  // physically stop -- fade its own wave/flow motion out by the same ice fraction.
  let frozen = clamp(input.atmo.z, 0.0, 1.0);
  let flow = length(input.water.yz) * (1.0 - frozen);
  let flowDir = select(vec2<f32>(0.71, 0.71), input.water.yz / max(flow, 1e-5), flow > 1e-5);
  let along = dot(input.world.xz, flowDir);
  let travel = sin(along * 46.0 - R.view.y * (2.6 + flow * 9.0)) * min(0.05, flow * 0.06);
  let wave = (ambient + flowDir * travel) * (1.0 - frozen);
  let n = normalize(input.normal + vec3<f32>(wave.x, 0.0, wave.y));
  let viewDirection = normalize(-cameraForward());
  let dayNightWater = R.spare1.x;
  let sunElevationWater = sunElevationOf(dayNightWater);
  let sunAzimuthWater = dayNightWater * 6.2831853;
  let sun = normalize(vec3<f32>(cos(sunAzimuthWater) * (1.0 - abs(sunElevationWater) * 0.3), max(0.06, sunElevationWater), sin(sunAzimuthWater) * (1.0 - abs(sunElevationWater) * 0.3)));
  let dayFactorWater = smoothstep(-0.18, 0.08, sunElevationWater);
  let halfVector = normalize(viewDirection + sun);
  let fresnel = 0.10 + 0.90 * pow(1.0 - max(dot(n, viewDirection), 0.0), 4.0);
  let specular = pow(max(dot(n, halfVector), 0.0), 78.0);
  let depth = clamp(input.water.x * 12.0, 0.0, 1.0);
  var color = mix(vec3<f32>(0.13, 0.47, 0.49), vec3<f32>(0.025, 0.13, 0.19), depth);
  color = mix(color, vec3<f32>(0.38, 0.60, 0.61), fresnel * 0.42);
  color = mix(color * vec3<f32>(0.45, 0.55, 0.78), color, dayFactorWater);
  color += vec3<f32>(0.82, 0.91, 0.86) * specular * 0.72 * (0.2 + dayFactorWater * 0.8);
  let shore = (1.0 - smoothstep(0.0014, 0.008, input.water.x)) * smoothstep(0.0003, 0.0016, input.water.x);
  // Turbulence streaks along the flow direction -- the visible leading-edge surge of a
  // dam-break front, not just a flat foam-by-speed blend.
  let streak = smoothstep(0.55, 1.0, abs(sin(along * 90.0 - R.view.y * (3.0 + flow * 6.0))))
    * smoothstep(0.25, 0.9, flow);
  let foam = clamp(shore + smoothstep(0.35, 1.0, flow) * 0.40 + streak * 0.38, 0.0, 1.0);
  color = mix(color, vec3<f32>(0.76, 0.81, 0.72), foam * 0.64);
  color = mix(color, vec3<f32>(0.80, 0.87, 0.90), frozen * 0.72);
  let alpha = 0.48 + depth * 0.27 + fresnel * 0.14;
  return vec4<f32>(pow(color, vec3<f32>(1.0 / 2.2)), alpha);
}

@vertex
fn vsGrass(@builtin(vertex_index) vertexIndex: u32, @builtin(instance_index) instanceIndex: u32) -> BladeOut {
  let corners = array<vec2<f32>, 6>(
    vec2<f32>(-1.0, 0.0), vec2<f32>(1.0, 0.0), vec2<f32>(-0.22, 1.0),
    vec2<f32>(-0.22, 1.0), vec2<f32>(1.0, 0.0), vec2<f32>(0.22, 1.0)
  );
  let size = gridSize();
  let cellCount = size * size;
  let cellIndex = instanceIndex % cellCount;
  let layer = instanceIndex / cellCount;
  let x = cellIndex % size;
  let z = cellIndex / size;
  let cell = cells[cellIndex];
  let seed = hash2(vec2<f32>(f32(x) + f32(layer) * 19.7, f32(z) - f32(layer) * 31.1));
  // Real per-cell plant succession (mirrors FIELD.PLANT_TYPE in world-sandbox-reference.mjs
  // exactly -- see that file's own comment for the growth/succession model this renders).
  let plantType = cell.wind.z;
  let isFlower = plantType > 0.5 && plantType < 1.5;
  let isShrub = plantType > 1.5 && plantType < 2.5;
  let isTree = plantType > 2.5;
  // A tree is ONE prominent shape per cell, not the usual many thin blade layers stacked on
  // top of each other at tree scale -- that would read as a chaotic thicket of oversized
  // blades, not a tree. Every other stage keeps the existing multi-layer blade density.
  let layerAllowed = select(true, layer == 0u, isTree);
  let visible = cell.bio.x > 0.008
    && cell.water.x < 0.006
    && cell.atmo.w < 0.02 // snow buries grass -- it does not simply photobleach through it
    && seed < clamp(cell.bio.x * 3.8, 0.0, 0.94)
    && layerAllowed
    && u32(R.view.x + 0.5) == 0u;
  let jitter = vec2<f32>(
    hash2(vec2<f32>(f32(x), f32(z)) + f32(layer) * 7.3),
    hash2(vec2<f32>(f32(z), f32(x)) + f32(layer) * 13.9)
  ) - 0.5;
  let uv = (vec2<f32>(f32(x), f32(z)) + vec2<f32>(0.5) + jitter * 0.78) / f32(size);
  let ground = (cell.terrain.x + cell.terrain.y) * R.camera.y + 0.003;
  let angle = seed * 6.2831853;
  let side = vec3<f32>(cos(angle), 0.0, sin(angle));
  let corner = corners[vertexIndex];
  var bladeHeight = 0.018 + sqrt(max(0.0, cell.bio.x)) * 0.105;
  var bladeWidth = 0.0028 + seed * 0.0032;
  // Each stage gets a genuinely different silhouette, not just a colour swap: a flowerbed
  // reads as shorter and wider (the bloom itself, not a tall stem), a shrub as noticeably
  // bushier, and a tree as one tall, wide canopy shape rather than another thin blade.
  if (isFlower) {
    bladeHeight *= 0.75;
    bladeWidth *= 1.6;
  } else if (isShrub) {
    bladeHeight *= 1.6;
    bladeWidth *= 2.4;
  } else if (isTree) {
    bladeHeight *= 7.0;
    bladeWidth *= 3.2;
  }
  // Bend direction now comes from two real fields, not a fixed lean constant: water current
  // (the same edgeFlow-driven velocity that transports water -- a flooded dam-break front
  // visibly presses grass over) AND the local wind field (cell.wind, this session's spatial
  // wind system) -- a gust rolling across dry terrain now visibly bends grass in ITS actual
  // local direction, not one hardcoded default lean everywhere. Water dominates when present
  // (a real current is a much stronger physical force than a breeze); a tiny epsilon avoids
  // normalize(0) when both are exactly zero (calm, windless grass still needs SOME rest lean).
  let flowSpeed = length(vec2<f32>(cell.water.y, cell.water.z));
  let windSpeed = length(cell.wind.xy);
  let bendDir3 = vec3<f32>(cell.water.y, 0.0, cell.water.z) + vec3<f32>(cell.wind.x, 0.0, cell.wind.y) * 0.5;
  let bend = normalize(bendDir3 + vec3<f32>(0.0001, 0.0, 0.00013))
    * bladeHeight * (0.05 + min(0.30, flowSpeed * 0.9) + min(0.20, windSpeed * 0.55));
  var world = vec3<f32>(uv.x * 2.0 - 1.0, ground, uv.y * 2.0 - 1.0);
  world += side * corner.x * bladeWidth;
  world += vec3<f32>(0.0, corner.y * bladeHeight, 0.0) + bend * corner.y * corner.y;
  var output: BladeOut;
  output.position = select(vec4<f32>(-4.0, -4.0, 0.99, 1.0), project(world), visible);
  output.local = corner;
  output.plantType = plantType;
  let dry = clamp(cell.bio.z * 1.8 + (1.0 - cell.terrain.w) * 0.22, 0.0, 1.0);
  var color = mix(vec3<f32>(0.19, 0.39, 0.10), vec3<f32>(0.43, 0.31, 0.10), dry) * (0.78 + seed * 0.32);
  if (isFlower) {
    // A bright bloom colour genuinely different from grass green, varied by seed so a
    // flowerbed reads as mixed blooms rather than one uniform colour -- three real bloom
    // hues (pink/yellow/white), not a tint of the grass colour underneath.
    let hue = fract(seed * 3.7);
    let petal = mix(
      mix(vec3<f32>(0.92, 0.58, 0.68), vec3<f32>(0.95, 0.85, 0.35), step(0.33, hue)),
      vec3<f32>(0.90, 0.90, 0.86), step(0.66, hue));
    color = mix(color, petal, 0.7);
  } else if (isShrub) {
    color *= vec3<f32>(0.82, 0.92, 0.80); // denser, slightly darker canopy green
  } else if (isTree) {
    color = vec3<f32>(0.16, 0.34, 0.11); // canopy green -- fsGrass blends a trunk colour in near the base
  }
  output.color = color;
  return output;
}

@fragment
fn fsGrass(input: BladeOut) -> @location(0) vec4<f32> {
  let edge = 1.0 - smoothstep(0.42, 1.0, abs(input.local.x));
  if (edge < 0.04) { discard; }
  let light = 0.54 + input.local.y * 0.46;
  var color = input.color;
  if (input.plantType > 2.5) {
    // TREE: a real trunk-to-canopy gradient along the blade's own length (input.local.y is
    // 0 at the base, 1 at the tip) instead of one flat colour top to bottom.
    let trunk = vec3<f32>(0.30, 0.20, 0.12);
    color = mix(trunk, input.color, smoothstep(0.12, 0.42, input.local.y));
  }
  return vec4<f32>(pow(color * light, vec3<f32>(1.0 / 2.2)), edge);
}

@vertex
fn vsBody(@builtin(vertex_index) vertexIndex: u32) -> BodyOut {
  let corners = array<vec2<f32>, 6>(
    vec2<f32>(-1.0, -1.0), vec2<f32>(1.0, -1.0), vec2<f32>(-1.0, 1.0),
    vec2<f32>(-1.0, 1.0), vec2<f32>(1.0, -1.0), vec2<f32>(1.0, 1.0)
  );
  let corner = corners[vertexIndex];
  let centre = vec3<f32>(R.body.x * 2.0 - 1.0, R.body.z * R.camera.y, R.body.y * 2.0 - 1.0);
  let radius = 0.032;
  let world = centre + cameraRight() * corner.x * radius + cameraUp() * corner.y * radius;
  var output: BodyOut;
  output.position = select(vec4<f32>(-4.0, -4.0, 0.99, 1.0), project(world), R.body.w > 0.5);
  output.local = corner;
  return output;
}

@fragment
fn fsBody(input: BodyOut) -> @location(0) vec4<f32> {
  let radius = length(input.local);
  if (radius > 1.0) { discard; }
  let sphereZ = sqrt(max(0.0, 1.0 - radius * radius));
  let normal = normalize(vec3<f32>(input.local, sphereZ));
  let light = 0.28 + max(dot(normal, normalize(vec3<f32>(-0.45, 0.70, 0.55))), 0.0) * 0.72;
  let rim = pow(1.0 - sphereZ, 3.0);
  let color = vec3<f32>(0.29, 0.31, 0.30) * light + vec3<f32>(0.18, 0.21, 0.20) * rim;
  return vec4<f32>(pow(color, vec3<f32>(1.0 / 2.2)), 1.0);
}

fn sunElevationOf(dayNight: f32) -> f32 {
  return sin((dayNight - 0.25) * 6.2831853);
}

// Shared sky so terrain fog fades into the SAME sky instead of a fixed haze color -- not a
// physically simulated atmosphere, a cheap gradient + disc + stars matched to this renderer's
// existing non-standard projection (project() is an approximate orbit/walk hybrid, not a real
// camera matrix, so this sky is deliberately an approximation too, not a ray-traced dome).
fn skyColor(elevation: f32, screenX: f32, dayNight: f32, temperature: f32, time: f32) -> vec3<f32> {
  let sunElevation = sunElevationOf(dayNight);
  let dayFactor = smoothstep(-0.18, 0.08, sunElevation);

  // Heat shimmer: hot midday air near the horizon wavers -- a screen-space wobble on the sky
  // gradient itself, since this pipeline has no offscreen render target for a real refraction
  // post-pass. Icy night has no shimmer at all (hotFactor gated by dayFactor).
  let hotFactor = clamp((temperature - 0.55) / 0.4, 0.0, 1.0) * dayFactor;
  let horizonProximity = 1.0 - clamp(abs(elevation) / 0.22, 0.0, 1.0);
  let shimmer = sin(screenX * 46.0 + time * 7.0) * 0.045 * hotFactor * horizonProximity;
  let e = elevation + shimmer;

  let dayZenith = vec3<f32>(0.16, 0.42, 0.74);
  let dayHorizon = vec3<f32>(0.86, 0.72, 0.52); // warm desert dust haze
  let nightZenith = vec3<f32>(0.010, 0.014, 0.028);
  let nightHorizon = vec3<f32>(0.055, 0.050, 0.090); // icy-night horizon, cold not warm
  let zenith = mix(nightZenith, dayZenith, dayFactor);
  let horizon = mix(nightHorizon, dayHorizon, dayFactor);
  let t = clamp(e * 1.6 + 0.5, 0.0, 1.0);
  var color = mix(horizon, zenith, t * t * (3.0 - 2.0 * t));

  let sunDist = distance(vec2<f32>(screenX, e), vec2<f32>(screenX * 0.0 + sin(dayNight * 6.2831853) * 0.7, sunElevation));
  let sunGlow = pow(max(0.0, 1.0 - sunDist * 1.3), 6.0);
  // Ascending edges + explicit invert: GLSL/WGSL leave smoothstep(edge0, edge1, x)
  // undefined when edge0 > edge1, so implementations may render the disc inconsistently
  // or omit it. Inside the disc (small distance) should read as lit (1), outside (large
  // distance) as unlit (0) -- the opposite of ascending smoothstep's own 0-at-low/1-at-high
  // direction, hence the explicit 1.0 - ... inversion.
  let sunDisc = 1.0 - smoothstep(0.028, 0.05, sunDist);
  color += vec3<f32>(1.0, 0.92, 0.72) * sunGlow * dayFactor * 0.9;
  color = mix(color, vec3<f32>(1.0, 0.98, 0.88), sunDisc * dayFactor);

  let moonElevation = -sunElevation;
  let moonDist = distance(vec2<f32>(screenX, e), vec2<f32>(-sin(dayNight * 6.2831853) * 0.7, moonElevation));
  let moonDisc = 1.0 - smoothstep(0.02, 0.035, moonDist);
  color = mix(color, vec3<f32>(0.80, 0.83, 0.88), moonDisc * (1.0 - dayFactor) * 0.8);

  let starField = hash2(floor(vec2<f32>(screenX, e) * 340.0));
  let twinkle = 0.5 + 0.5 * sin(time * 3.0 + starField * 62.0);
  let stars = select(0.0, 1.0, starField > 0.9935) * twinkle * step(0.0, e) * (1.0 - dayFactor);
  color += vec3<f32>(0.85, 0.90, 1.0) * stars;

  return color;
}

struct SkyOut {
  @builtin(position) position: vec4<f32>,
  @location(0) ndc: vec2<f32>,
}

@vertex
fn vsSky(@builtin(vertex_index) vertexIndex: u32) -> SkyOut {
  let corners = array<vec2<f32>, 3>(vec2<f32>(-1.0, -1.0), vec2<f32>(3.0, -1.0), vec2<f32>(-1.0, 3.0));
  var output: SkyOut;
  output.position = vec4<f32>(corners[vertexIndex], 0.0, 1.0);
  output.ndc = corners[vertexIndex];
  return output;
}

@fragment
fn fsSky(input: SkyOut) -> @location(0) vec4<f32> {
  let pitch = R.view.w;
  let elevation = clamp(input.ndc.y * 0.6 + (pitch - 0.62) * 1.15, -1.0, 1.0);
  let screenX = input.ndc.x * 0.5 + sin(R.view.z) * 0.6;
  let color = skyColor(elevation, screenX, R.spare1.x, R.spare1.y, R.view.y);
  return vec4<f32>(pow(color, vec3<f32>(1.0 / 2.2)), 1.0);
}
`;

export const PARTICLE_SPATIAL_RENDER_WGSL = /* wgsl */ `
struct RenderParams {
  resolution: vec4<f32>,
  view: vec4<f32>,
  body: vec4<f32>,
  cursor: vec4<f32>,
  camera: vec4<f32>,
  spare0: vec4<f32>,
  spare1: vec4<f32>,
  spare2: vec4<f32>,
}

struct Particle {
  position: vec4<f32>,
  velocity: vec4<f32>,
  payload: vec4<f32>,
}

struct VertexOut {
  @builtin(position) position: vec4<f32>,
  @location(0) local: vec2<f32>,
  @location(1) @interpolate(flat) kind: u32,
  @location(2) alpha: f32,
}

@group(0) @binding(0) var<uniform> R: RenderParams;
@group(0) @binding(1) var<storage, read> particles: array<Particle>;

fn cameraForward() -> vec3<f32> {
  return normalize(vec3<f32>(sin(R.view.z) * cos(R.view.w), -sin(R.view.w), cos(R.view.z) * cos(R.view.w)));
}
fn cameraRight() -> vec3<f32> { return normalize(cross(vec3<f32>(0.0, 1.0, 0.0), cameraForward())); }
fn cameraUp() -> vec3<f32> { return normalize(cross(cameraForward(), cameraRight())); }
fn project(world: vec3<f32>) -> vec4<f32> {
  let aspect = R.resolution.x / max(1.0, R.resolution.y);
  if (R.spare0.w > 0.5) {
    // Same walk-mode perspective branch as the terrain/water/grass renderer's project() --
    // particles (dust, spray, embers) must sit in the same 3D space as everything else.
    let delta = world - R.spare0.xyz;
    let forward = cameraForward();
    let viewX = dot(delta, cameraRight());
    let viewY = dot(delta, cameraUp());
    let viewZ = dot(delta, forward);
    let near = 0.006;
    let far = 3.4;
    let fovTan = 0.62;
    let ndcDepth = clamp((viewZ - near) / (far - near), 0.0005, 0.9995);
    return vec4<f32>(viewX / (fovTan * aspect), viewY / fovTan, ndcDepth * viewZ, viewZ);
  }
  let delta = world - vec3<f32>(0.0, R.camera.z, 0.0);
  return vec4<f32>(
    dot(delta, cameraRight()) / max(0.20, R.camera.x * aspect),
    dot(delta, cameraUp()) / max(0.55, R.camera.x),
    clamp(0.48 + dot(delta, cameraForward()) * 0.18, 0.01, 0.99),
    1.0
  );
}

@vertex
fn vs(@builtin(vertex_index) vertexIndex: u32, @builtin(instance_index) instanceIndex: u32) -> VertexOut {
  let corners = array<vec2<f32>, 6>(
    vec2<f32>(-1.0, -1.0), vec2<f32>(1.0, -1.0), vec2<f32>(-1.0, 1.0),
    vec2<f32>(-1.0, 1.0), vec2<f32>(1.0, -1.0), vec2<f32>(1.0, 1.0)
  );
  let particle = particles[instanceIndex];
  let corner = corners[vertexIndex];
  let kind = u32(particle.payload.x + 0.5);
  let centre = vec3<f32>(
    particle.position.x * 2.0 - 1.0,
    particle.position.y * R.camera.y,
    particle.position.z * 2.0 - 1.0
  );
  let size = select(0.008, 0.011, kind == 1u) + clamp(particle.position.y * 0.004, 0.0, 0.006);
  let world = centre + cameraRight() * corner.x * size + cameraUp() * corner.y * size;
  var output: VertexOut;
  output.position = select(vec4<f32>(-4.0, -4.0, 0.99, 1.0), project(world), particle.payload.w > 0.5);
  output.local = corner;
  output.kind = kind;
  output.alpha = particle.payload.w;
  return output;
}

@fragment
fn fs(input: VertexOut) -> @location(0) vec4<f32> {
  let radial = length(input.local);
  if (radial > 1.0 || input.alpha < 0.5) { discard; }
  var color = vec3<f32>(0.84, 0.57, 0.26);
  if (input.kind == 1u) { color = vec3<f32>(0.37, 0.72, 0.82); }
  else if (input.kind == 3u) { color = vec3<f32>(0.50, 0.72, 0.25); }
  else if (input.kind == 4u) { color = vec3<f32>(0.92, 0.25, 0.045); }
  let alpha = (1.0 - smoothstep(0.48, 1.0, radial)) * 0.88;
  return vec4<f32>(pow(color, vec3<f32>(1.0 / 2.2)), alpha);
}
`;

function assertGpuGlobals() {
  if (!globalThis.navigator?.gpu) throw new Error('WebGPU unavailable');
  if (!globalThis.GPUBufferUsage || !globalThis.GPUMapMode || !globalThis.GPUTextureUsage || !globalThis.GPUShaderStage) {
    throw new Error('WebGPU constants unavailable');
  }
}

async function checkedModule(device, label, code) {
  const module = device.createShaderModule({label, code});
  if (typeof module.getCompilationInfo === 'function') {
    const info = await module.getCompilationInfo();
    const errors = info.messages.filter(message => message.type === 'error');
    if (errors.length) {
      throw new Error(label + ': ' + errors.map(error => error.message).join(' | '));
    }
  }
  return module;
}

// Requests the best adapter available without letting a preference hint fail the whole
// request. powerPreference is defined by spec as advisory only, but real implementations --
// disproportionately on mobile/single-GPU devices, where 'high-performance' has nothing more
// powerful to hand back than the one integrated GPU it already offers by default -- have been
// observed returning null for a specific preference that a plain, unconstrained request
// immediately satisfies. Preferring high-performance is still worth trying first (a real win on
// a laptop/desktop with both an integrated and a discrete GPU); it just can't be the only thing
// tried, since "no adapter" turns the entire simulation into the much slower CPU/Canvas2D
// fallback for a reason that was never about the hardware actually lacking WebGPU.
async function requestBestAdapter() {
  const preferred = await navigator.gpu.requestAdapter({powerPreference: 'high-performance'});
  if (preferred) return preferred;
  return navigator.gpu.requestAdapter();
}

export class WebGpuWorldSandbox {
  static async create(canvas, options = {}) {
    assertGpuGlobals();
    const adapter = await requestBestAdapter();
    if (!adapter) throw new Error('No WebGPU adapter');
    const device = await adapter.requestDevice();
    const instance = new WebGpuWorldSandbox(canvas, adapter, device, options);
    await instance.initialize();
    return instance;
  }

  constructor(canvas, adapter, device, options) {
    this.canvas = canvas;
    this.adapter = adapter;
    this.device = device;
    this.onQuery = options.onQuery || (() => {});
    this.onError = options.onError || (() => {});
    this.mobile = options.mobile ?? matchMedia('(max-width: 700px)').matches;
    // Immensely higher voxel resolution than the original 96/128 -- GPU compute and instanced
    // rendering both scale to this fine, unlike the CPU 2D-canvas fallback (see world-sandbox.js),
    // whose per-quad Canvas2D path fills are the real bottleneck and stay far more conservative.
    this.size = options.size || (this.mobile ? 256 : 512);
    this.particleCount = options.particleCount || (this.mobile ? 2048 : 8192);
    this.read = 0;
    this.tick = 0;
    this.spawnCursor = 0;
    this.queryId = 0;
    this.readbackBusy = [false, false, false];
    this.simFloats = new Float32Array(32);
    this.renderFloats = new Float32Array(32);
    this.stampFloats = new Float32Array(MAX_STAMPS * 8);
    this.depthTexture = null;
  }

  async initialize() {
    const {device} = this;
    this.context = this.canvas.getContext('webgpu');
    if (!this.context) throw new Error('GPUCanvasContext unavailable');
    this.format = navigator.gpu.getPreferredCanvasFormat();
    this.context.configure({device, format: this.format, alphaMode: 'opaque'});

    const modules = await Promise.all([
      checkedModule(device, 'SHADED world compute', WORLD_COMPUTE_WGSL),
      checkedModule(device, 'SHADED particle compute', PARTICLE_COMPUTE_WGSL),
      checkedModule(device, 'SHADED query compute', QUERY_COMPUTE_WGSL),
      checkedModule(device, 'SHADED spatial world render', WORLD_SPATIAL_RENDER_WGSL),
      checkedModule(device, 'SHADED spatial particle render', PARTICLE_SPATIAL_RENDER_WGSL),
    ]);
    const [worldModule, particleModule, queryModule, worldRenderModule, particleRenderModule] = modules;

    this.worldPipeline = await device.createComputePipelineAsync({
      label: 'SHADED coupled world step',
      layout: 'auto',
      compute: {module: worldModule, entryPoint: 'main'},
    });
    this.particlePipeline = await device.createComputePipelineAsync({
      label: 'SHADED secondary particle step',
      layout: 'auto',
      compute: {module: particleModule, entryPoint: 'main'},
    });
    this.queryPipeline = await device.createComputePipelineAsync({
      label: 'SHADED local world query',
      layout: 'auto',
      compute: {module: queryModule, entryPoint: 'main'},
    });
    this.worldRenderBindGroupLayout = device.createBindGroupLayout({
      label: 'SHADED spatial world bindings',
      entries: [
        {
          binding: 0,
          visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
          buffer: {type: 'uniform'},
        },
        {
          binding: 1,
          visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
          buffer: {type: 'read-only-storage'},
        },
      ],
    });
    this.worldRenderPipelineLayout = device.createPipelineLayout({
      label: 'SHADED spatial world pipeline layout',
      bindGroupLayouts: [this.worldRenderBindGroupLayout],
    });
    const depthStencil = {
      format: 'depth24plus',
      depthWriteEnabled: true,
      depthCompare: 'less',
    };
    this.skyRenderPipeline = await device.createRenderPipelineAsync({
      label: 'SHADED spatial sky renderer',
      layout: this.worldRenderPipelineLayout,
      vertex: {module: worldRenderModule, entryPoint: 'vsSky'},
      fragment: {module: worldRenderModule, entryPoint: 'fsSky', targets: [{format: this.format}]},
      primitive: {topology: 'triangle-list'},
      depthStencil: {...depthStencil, depthWriteEnabled: false, depthCompare: 'always'},
    });
    this.worldRenderPipeline = await device.createRenderPipelineAsync({
      label: 'SHADED spatial terrain renderer',
      layout: this.worldRenderPipelineLayout,
      vertex: {module: worldRenderModule, entryPoint: 'vsTerrain'},
      fragment: {module: worldRenderModule, entryPoint: 'fsTerrain', targets: [{format: this.format}]},
      primitive: {topology: 'triangle-list'},
      depthStencil,
    });
    this.waterRenderPipeline = await device.createRenderPipelineAsync({
      label: 'SHADED spatial water renderer',
      layout: this.worldRenderPipelineLayout,
      vertex: {module: worldRenderModule, entryPoint: 'vsWater'},
      fragment: {
        module: worldRenderModule,
        entryPoint: 'fsWater',
        targets: [{
          format: this.format,
          blend: {
            color: {srcFactor: 'src-alpha', dstFactor: 'one-minus-src-alpha', operation: 'add'},
            alpha: {srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add'},
          },
        }],
      },
      primitive: {topology: 'triangle-list'},
      depthStencil: {...depthStencil, depthWriteEnabled: false, depthCompare: 'less-equal'},
    });
    this.grassRenderPipeline = await device.createRenderPipelineAsync({
      label: 'SHADED vegetation blade renderer',
      layout: this.worldRenderPipelineLayout,
      vertex: {module: worldRenderModule, entryPoint: 'vsGrass'},
      fragment: {
        module: worldRenderModule,
        entryPoint: 'fsGrass',
        targets: [{
          format: this.format,
          blend: {
            color: {srcFactor: 'src-alpha', dstFactor: 'one-minus-src-alpha', operation: 'add'},
            alpha: {srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add'},
          },
        }],
      },
      primitive: {topology: 'triangle-list'},
      depthStencil: {...depthStencil, depthCompare: 'less-equal'},
    });
    this.bodyRenderPipeline = await device.createRenderPipelineAsync({
      label: 'SHADED CPU body renderer',
      layout: this.worldRenderPipelineLayout,
      vertex: {module: worldRenderModule, entryPoint: 'vsBody'},
      fragment: {module: worldRenderModule, entryPoint: 'fsBody', targets: [{format: this.format}]},
      primitive: {topology: 'triangle-list'},
      depthStencil: {...depthStencil, depthCompare: 'less-equal'},
    });
    this.particleRenderPipeline = await device.createRenderPipelineAsync({
      label: 'SHADED spatial particle renderer',
      layout: 'auto',
      vertex: {module: particleRenderModule, entryPoint: 'vs'},
      fragment: {
        module: particleRenderModule,
        entryPoint: 'fs',
        targets: [{
          format: this.format,
          blend: {
            color: {srcFactor: 'src-alpha', dstFactor: 'one-minus-src-alpha', operation: 'add'},
            alpha: {srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add'},
          },
        }],
      },
      primitive: {topology: 'triangle-list'},
      depthStencil: {...depthStencil, depthWriteEnabled: false, depthCompare: 'less-equal'},
    });

    const storage = GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC;
    const allocate = (label, size, usage = storage) => device.createBuffer({
      label,
      size: Math.max(16, size),
      usage,
    });
    const stateBytes = this.size * this.size * GPU_CELL_STRIDE * 4;
    this.stateBuffers = [
      allocate('SHADED world state A', stateBytes),
      allocate('SHADED world state B', stateBytes),
    ];
    this.particleBuffer = allocate('SHADED particles', this.particleCount * PARTICLE_STRIDE * 4);
    this.depositBuffer = allocate('SHADED particle deposits', this.size * this.size * 16);
    this.stampBuffer = allocate('SHADED CPU stamps', this.stampFloats.byteLength);
    this.simUniform = allocate(
      'SHADED simulation params',
      this.simFloats.byteLength,
      GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    );
    this.renderUniform = allocate(
      'SHADED render params',
      this.renderFloats.byteLength,
      GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    );
    this.queryRequest = allocate('SHADED query request', 16);
    this.queryResult = allocate('SHADED query result', QUERY_BYTES);
    this.readbacks = [0, 1, 2].map(index => allocate(
      'SHADED query readback ' + index,
      QUERY_BYTES,
      GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
    ));

    const worldLayout = this.worldPipeline.getBindGroupLayout(0);
    const particleLayout = this.particlePipeline.getBindGroupLayout(0);
    const queryLayout = this.queryPipeline.getBindGroupLayout(0);
    const worldRenderLayout = this.worldRenderBindGroupLayout;
    this.worldGroups = [0, 1].map(read => device.createBindGroup({
      label: 'SHADED world ping-pong ' + read,
      layout: worldLayout,
      entries: [
        {binding: 0, resource: {buffer: this.simUniform}},
        {binding: 1, resource: {buffer: this.stateBuffers[read]}},
        {binding: 2, resource: {buffer: this.stateBuffers[1 - read]}},
        {binding: 3, resource: {buffer: this.stampBuffer}},
        {binding: 4, resource: {buffer: this.depositBuffer}},
      ],
    }));
    this.particleGroups = [0, 1].map(read => device.createBindGroup({
      label: 'SHADED particle world ' + read,
      layout: particleLayout,
      entries: [
        {binding: 0, resource: {buffer: this.simUniform}},
        {binding: 1, resource: {buffer: this.stateBuffers[read]}},
        {binding: 2, resource: {buffer: this.particleBuffer}},
        {binding: 3, resource: {buffer: this.depositBuffer}},
      ],
    }));
    this.queryGroups = [0, 1].map(read => device.createBindGroup({
      label: 'SHADED query world ' + read,
      layout: queryLayout,
      entries: [
        {binding: 0, resource: {buffer: this.simUniform}},
        {binding: 1, resource: {buffer: this.stateBuffers[read]}},
        {binding: 2, resource: {buffer: this.queryRequest}},
        {binding: 3, resource: {buffer: this.queryResult}},
      ],
    }));
    this.worldRenderGroups = [0, 1].map(read => device.createBindGroup({
      label: 'SHADED render world ' + read,
      layout: worldRenderLayout,
      entries: [
        {binding: 0, resource: {buffer: this.renderUniform}},
        {binding: 1, resource: {buffer: this.stateBuffers[read]}},
      ],
    }));
    this.particleRenderGroup = device.createBindGroup({
      label: 'SHADED render particles',
      layout: this.particleRenderPipeline.getBindGroupLayout(0),
      entries: [
        {binding: 0, resource: {buffer: this.renderUniform}},
        {binding: 1, resource: {buffer: this.particleBuffer}},
      ],
    });

    this.reset();
    device.lost.then(info => {
      this.onError(new Error('WebGPU device lost: ' + (info.message || info.reason)));
    });
  }

  reset(seed = 0x53484144, options = {}) {
    const initial = packCellsForGpu(createWorldState(this.size, seed, options), this.size);
    this.device.queue.writeBuffer(this.stateBuffers[0], 0, initial);
    this.device.queue.writeBuffer(this.stateBuffers[1], 0, initial);
    this.device.queue.writeBuffer(
      this.particleBuffer,
      0,
      new Float32Array(this.particleCount * PARTICLE_STRIDE),
    );
    const encoder = this.device.createCommandEncoder({label: 'SHADED world reset'});
    encoder.clearBuffer(this.depositBuffer);
    encoder.clearBuffer(this.queryResult);
    this.device.queue.submit([encoder.finish()]);
    this.read = 0;
    this.tick = 0;
    this.spawnCursor = 0;
  }

  packSimulation({dt, stamps = [], environment = {}, emitter = null}) {
    const values = this.simFloats;
    values.fill(0);
    values[0] = dt;
    values[1] = this.size;
    values[2] = Math.min(MAX_STAMPS, stamps.length);
    values[3] = this.tick;
    values[4] = environment.rain || 0;
    values[5] = environment.sun ?? 0.64;
    values[6] = environment.temperature ?? 0.52;
    values[7] = environment.evaporation ?? 0.018;
    values[8] = environment.sandRate ?? 2.35;
    values[9] = environment.waterRate ?? 5.4;
    values[10] = environment.growthRate ?? 0.21;
    values[11] = environment.permeability ?? 0.052;

    let spawnCount = 0;
    if (emitter?.count > 0) {
      values[12] = emitter.x;
      values[13] = emitter.z;
      values[14] = emitter.kind;
      values[15] = emitter.strength ?? 1;
      spawnCount = Math.min(this.particleCount, Math.max(0, emitter.count | 0));
    }
    values[16] = this.spawnCursor;
    values[17] = spawnCount;
    values[18] = this.particleCount;
    this.spawnCursor = (this.spawnCursor + spawnCount) % this.particleCount;

    const windAngle = (environment.windDeg ?? 45) * Math.PI / 180;
    const windStrength = environment.wind ?? 0.3;
    values[24] = Math.cos(windAngle) * windStrength;
    values[25] = Math.sin(windAngle) * windStrength;

    this.stampFloats.fill(0);
    for (let index = 0; index < Math.min(MAX_STAMPS, stamps.length); index++) {
      const stamp = stamps[index];
      const offset = index * 8;
      this.stampFloats[offset] = stamp.x;
      this.stampFloats[offset + 1] = stamp.z;
      this.stampFloats[offset + 2] = stamp.radius;
      this.stampFloats[offset + 4] = stamp.kind;
      this.stampFloats[offset + 5] = stamp.amount;
      this.stampFloats[offset + 6] = stamp.directionX || 0;
      this.stampFloats[offset + 7] = stamp.directionZ || 0;
    }
    this.device.queue.writeBuffer(this.simUniform, 0, values);
    if (stamps.length) this.device.queue.writeBuffer(this.stampBuffer, 0, this.stampFloats);
  }

  step({dt = 1 / 30, stamps = [], environment = {}, emitter = null, query = null} = {}) {
    this.packSimulation({dt, stamps, environment, emitter});
    const {device} = this;
    const next = 1 - this.read;
    const encoder = device.createCommandEncoder({label: 'SHADED world tick ' + this.tick});
    const worldPass = encoder.beginComputePass({label: 'world fields'});
    worldPass.setPipeline(this.worldPipeline);
    worldPass.setBindGroup(0, this.worldGroups[this.read]);
    worldPass.dispatchWorkgroups(Math.ceil(this.size / 8), Math.ceil(this.size / 8));
    worldPass.end();

    encoder.clearBuffer(this.depositBuffer);
    const particlePass = encoder.beginComputePass({label: 'secondary particles'});
    particlePass.setPipeline(this.particlePipeline);
    particlePass.setBindGroup(0, this.particleGroups[next]);
    particlePass.dispatchWorkgroups(Math.ceil(this.particleCount / 128));
    particlePass.end();

    let readbackIndex = -1;
    if (query) {
      readbackIndex = this.readbackBusy.findIndex(busy => !busy);
      if (readbackIndex >= 0) {
        this.queryId += 1;
        this.device.queue.writeBuffer(this.queryRequest, 0, new Float32Array([
          query.x,
          query.z,
          this.queryId,
          query.flags || 0,
        ]));
        const queryPass = encoder.beginComputePass({label: 'local CPU query'});
        queryPass.setPipeline(this.queryPipeline);
        queryPass.setBindGroup(0, this.queryGroups[next]);
        queryPass.dispatchWorkgroups(1);
        queryPass.end();
        encoder.copyBufferToBuffer(
          this.queryResult,
          0,
          this.readbacks[readbackIndex],
          0,
          QUERY_BYTES,
        );
        this.readbackBusy[readbackIndex] = true;
      }
    }

    device.queue.submit([encoder.finish()]);
    this.read = next;
    this.tick += 1;
    if (readbackIndex >= 0) this.beginReadback(readbackIndex);
  }

  beginReadback(index) {
    const buffer = this.readbacks[index];
    const requestedAt = performance.now();
    buffer.mapAsync(GPUMapMode.READ).then(() => {
      const values = new Float32Array(buffer.getMappedRange()).slice();
      buffer.unmap();
      this.readbackBusy[index] = false;
      this.onQuery({
        id: values[0],
        ground: values[1],
        waterSurface: values[2],
        wetness: values[3],
        waterDepth: values[4],
        biomass: values[5],
        heat: values[6],
        sand: values[7],
        latencyMs: performance.now() - requestedAt,
      });
    }).catch(error => {
      this.readbackBusy[index] = false;
      this.onError(error);
    });
  }

  resize() {
    const quality = this.mobile ? 0.92 : 1.0;
    const dpr = Math.min(devicePixelRatio || 1, 2) * quality;
    const width = Math.max(2, Math.floor(this.canvas.clientWidth * dpr));
    const height = Math.max(2, Math.floor(this.canvas.clientHeight * dpr));
    const changed = this.canvas.width !== width || this.canvas.height !== height;
    if (changed) {
      this.canvas.width = width;
      this.canvas.height = height;
    }
    if (changed || !this.depthTexture) {
      this.depthTexture?.destroy?.();
      this.depthTexture = this.device.createTexture({
        label: 'SHADED spatial depth',
        size: [width, height],
        format: 'depth24plus',
        usage: GPUTextureUsage.RENDER_ATTACHMENT,
      });
    }
  }

  render({viewMode = 0, time = 0, body = null, cursor = null, camera = null, walk = null, dayNight = 0.5, temperature = 0.5} = {}) {
    this.resize();
    const values = this.renderFloats;
    values.fill(0);
    values[0] = this.canvas.width;
    values[1] = this.canvas.height;
    values[2] = this.size;
    values[3] = this.particleCount;
    values[4] = viewMode;
    values[5] = time;
    values[6] = walk?.active ? walk.yaw : (camera?.yaw ?? -0.68);
    values[7] = walk?.active ? walk.pitch : (camera?.pitch ?? 0.76);
    if (body?.active) {
      values[8] = body.x;
      values[9] = body.z;
      values[10] = body.y;
      values[11] = 1;
    }
    if (cursor) {
      values[12] = cursor.x;
      values[13] = cursor.z;
      values[14] = cursor.radius;
      values[15] = cursor.visible === false ? 0 : 1;
    }
    values[16] = camera?.zoom ?? 1.45;
    values[17] = camera?.verticalScale ?? 1.55;
    values[18] = camera?.targetY ?? 0.29;
    if (walk?.active) {
      values[20] = walk.x;
      values[21] = walk.eyeY;
      values[22] = walk.z;
      values[23] = 1;
    }
    values[24] = dayNight;
    values[25] = temperature;
    this.device.queue.writeBuffer(this.renderUniform, 0, values);

    const encoder = this.device.createCommandEncoder({label: 'SHADED world render'});
    const pass = encoder.beginRenderPass({
      colorAttachments: [{
        view: this.context.getCurrentTexture().createView(),
        clearValue: {r: 0.024, g: 0.034, b: 0.030, a: 1},
        loadOp: 'clear',
        storeOp: 'store',
      }],
      depthStencilAttachment: {
        view: this.depthTexture.createView(),
        depthClearValue: 1,
        depthLoadOp: 'clear',
        depthStoreOp: 'store',
      },
    });
    pass.setPipeline(this.skyRenderPipeline);
    pass.setBindGroup(0, this.worldRenderGroups[this.read]);
    pass.draw(3);
    pass.setPipeline(this.worldRenderPipeline);
    pass.setBindGroup(0, this.worldRenderGroups[this.read]);
    pass.draw((this.size - 1) * (this.size - 1) * 6);
    pass.setPipeline(this.waterRenderPipeline);
    pass.setBindGroup(0, this.worldRenderGroups[this.read]);
    pass.draw((this.size - 1) * (this.size - 1) * 6);
    pass.setPipeline(this.grassRenderPipeline);
    pass.setBindGroup(0, this.worldRenderGroups[this.read]);
    pass.draw(6, this.size * this.size * 2);
    pass.setPipeline(this.bodyRenderPipeline);
    pass.setBindGroup(0, this.worldRenderGroups[this.read]);
    pass.draw(6);
    pass.setPipeline(this.particleRenderPipeline);
    pass.setBindGroup(0, this.particleRenderGroup);
    pass.draw(6, this.particleCount);
    pass.end();
    this.device.queue.submit([encoder.finish()]);
  }

  get label() {
    return 'WEBGPU COMPUTE + SPATIAL · ' + this.size + '² · '
      + this.particleCount.toLocaleString('de-DE') + ' PARTICLES';
  }

  destroy() {
    for (const buffer of [
      ...this.stateBuffers,
      this.particleBuffer,
      this.depositBuffer,
      this.stampBuffer,
      this.simUniform,
      this.renderUniform,
      this.queryRequest,
      this.queryResult,
      ...this.readbacks,
    ]) buffer?.destroy?.();
    this.depthTexture?.destroy?.();
  }
}
