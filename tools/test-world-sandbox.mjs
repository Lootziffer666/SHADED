import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {
  CELL_STRIDE,
  DEFAULT_ENVIRONMENT,
  FIELD,
  STAMP,
  cellOffset,
  createWorldState,
  sampleWorld,
  stateChecksum,
  stepWorldReference,
  worldTotals,
} from '../runtime/world-sandbox-reference.mjs';
import {
  PARTICLE_COMPUTE_WGSL,
  QUERY_COMPUTE_WGSL,
  WORLD_COMPUTE_WGSL,
  WORLD_SPATIAL_RENDER_WGSL,
  PARTICLE_SPATIAL_RENDER_WGSL,
} from '../runtime/world-sandbox-webgpu.mjs';

const size = 40;
const seed = 0x5a17c0de;
const environment = {
  ...DEFAULT_ENVIRONMENT,
  rain: 0,
  sun: 0.72,
  evaporation: 0,
  permeability: 0,
  growthRate: 0.8,
};
const eventStream = [
  {kind: STAMP.SAND, x: 0.42, z: 0.31, radius: 0.07, amount: 0.045},
  {kind: STAMP.WATER, x: 0.35, z: 0.18, radius: 0.06, amount: 0.08},
  {kind: STAMP.SEED, x: 0.49, z: 0.58, radius: 0.08, amount: 0.09},
];

let first = createWorldState(size, seed);
let second = createWorldState(size, seed);
for (let tick = 0; tick < 90; tick++) {
  const stamps = tick === 0 ? eventStream : [];
  first = stepWorldReference(first, size, 1 / 30, {environment, stamps});
  second = stepWorldReference(second, size, 1 / 30, {environment, stamps});
}
assert.equal(stateChecksum(first), stateChecksum(second), 'fixed seed and event stream must replay deterministically');

let massState = createWorldState(size, seed);
const massBefore = worldTotals(massState);
for (let tick = 0; tick < 120; tick++) {
  massState = stepWorldReference(massState, size, 1 / 30, {environment});
}
const massAfter = worldTotals(massState);
const granularBefore = massBefore.sand + massBefore.sediment;
const granularAfter = massAfter.sand + massAfter.sediment;
assert.ok(
  Math.abs(granularAfter - granularBefore) < granularBefore * 2e-5,
  'sand transport plus erosion/deposition must conserve granular mass',
);

let causal = createWorldState(size, seed);
const target = {x: 0.5, z: 0.58};
const before = sampleWorld(causal, size, target.x, target.z);
causal = stepWorldReference(causal, size, 1 / 30, {
  environment: {...environment, permeability: 0.08},
  stamps: [
    {kind: STAMP.WATER, ...target, radius: 0.09, amount: 0.12},
    {kind: STAMP.SEED, ...target, radius: 0.09, amount: 0.14},
  ],
});
const watered = sampleWorld(causal, size, target.x, target.z);
assert.ok(watered.waterDepth > before.waterDepth, 'water stamp must increase local water depth');
for (let tick = 0; tick < 360; tick++) {
  causal = stepWorldReference(causal, size, 1 / 30, {
    environment: {...environment, permeability: 0.08, growthRate: 1.2},
  });
}
const grown = sampleWorld(causal, size, target.x, target.z);
assert.ok(grown.biomass > before.biomass + 0.002, 'wet seeded cells must grow biomass');
const burnEnvironment = {...environment, sun: 0, growthRate: 0, permeability: 0};
for (let tick = 0; tick < 30; tick++) {
  causal = stepWorldReference(causal, size, 1 / 30, {
    environment: burnEnvironment,
    stamps: tick % 5 === 0 ? [{kind: STAMP.HEAT, ...target, radius: 0.08, amount: 0.2}] : [],
  });
}
const burned = sampleWorld(causal, size, target.x, target.z);
assert.ok(burned.biomass < grown.biomass, 'sustained heat must damage biomass');

// Water transport must come from the same accelerate-then-damp velocity field used for
// erosion `speed`, not an instantaneous "excess head -> displacement" relaxation -- that
// old rule could only ever monotonically shrink the head difference (reported as water
// leveling instantly, with no memory). A dam-break (deep water on one half of a flat
// floor, none on the other) must show the probe cell at the seam overshoot its eventual
// settling depth and slosh back at least once before damping wins, the signature of a
// real momentum-carrying transport model.
{
  const damSize = 24;
  const flat = new Float32Array(damSize * damSize * CELL_STRIDE);
  for (let z = 0; z < damSize; z++) {
    for (let x = 0; x < damSize; x++) {
      flat[cellOffset(damSize, x, z) + FIELD.BEDROCK] = 0.1;
    }
  }
  for (let z = 0; z < damSize; z++) {
    for (let x = 0; x < damSize / 2; x++) {
      flat[cellOffset(damSize, x, z) + FIELD.WATER] = 0.3;
    }
  }
  const damEnvironment = {
    rain: 0, sun: 0.5, temperature: 0.5, evaporation: 0, permeability: 0, sandRate: 2.35, waterRate: 5.4, growthRate: 0,
  };
  let dam = flat;
  const depths = [];
  for (let tick = 0; tick < 400; tick++) {
    dam = stepWorldReference(dam, damSize, 1 / 30, {environment: damEnvironment});
    depths.push(sampleWorld(dam, damSize, 0.5, 0.5).waterDepth);
  }
  let signChanges = 0;
  let prevDelta = 0;
  for (let i = 1; i < depths.length; i++) {
    const delta = depths[i] - depths[i - 1];
    if (Math.abs(delta) < 1e-7) continue;
    if (prevDelta !== 0 && Math.sign(delta) !== Math.sign(prevDelta)) signChanges++;
    prevDelta = delta;
  }
  assert.ok(signChanges >= 3, `dam-break water depth must slosh (overshoot + settle back), not relax monotonically (sign changes: ${signChanges})`);
  const peak = Math.max(...depths.slice(0, 100));
  const late = depths[depths.length - 1];
  assert.ok(peak > late + 0.01, `dam-break water must overshoot its late-time settling depth (peak ${peak.toFixed(4)} vs late ${late.toFixed(4)})`);
}

// --- Water cycle: Gas (vapor) -> Kondensation -> Feuchte -> Eis -> Regen/Hagel/Schnee -----
// Evaporation no longer discards mass -- it feeds a real vapor reservoir that condenses into
// cloud once local (altitude-cooled) temperature can no longer hold it, and precipitates back
// down as rain or snow depending on that same local temperature. The whole loop must conserve
// mass with no external injection, and must actually produce weather at the scale a small lake's
// natural evaporation reaches within a demo-length run, not just in principle.
{
  const flatSize = 16;
  function flatWorldWithCloud(cloudAmount) {
    const s = new Float32Array(flatSize * flatSize * CELL_STRIDE);
    for (let z = 0; z < flatSize; z++) {
      for (let x = 0; x < flatSize; x++) {
        const o = cellOffset(flatSize, x, z);
        s[o + FIELD.BEDROCK] = 0.1; // fixed altitude, so localTemp tracks env.temperature exactly
        s[o + FIELD.CLOUD] = cloudAmount;
      }
    }
    return s;
  }
  const closedEnv = {...DEFAULT_ENVIRONMENT, rain: 0, permeability: 0};

  // A. Closed system: no rain injection, no infiltration -> water+vapor+cloud+snow is conserved.
  let closed = createWorldState(flatSize, 0x1234);
  const closedBefore = worldTotals(closed);
  const beforeSum = closedBefore.water + closedBefore.vapor + closedBefore.cloud + closedBefore.snow;
  for (let tick = 0; tick < 1200; tick++) closed = stepWorldReference(closed, flatSize, 1 / 30, {environment: closedEnv});
  const closedAfter = worldTotals(closed);
  const afterSum = closedAfter.water + closedAfter.vapor + closedAfter.cloud + closedAfter.snow;
  assert.ok(
    Math.abs(afterSum - beforeSum) < Math.max(1e-6, beforeSum * 1e-4),
    `closed water cycle (no rain, no infiltration) must conserve total moisture (before ${beforeSum}, after ${afterSum})`,
  );

  // B. Natural evaporation actually reaches condensation within a demo-length run (not just
  //    in principle) -- a lake basin under default settings must produce a real cloud.
  let natural = createWorldState(48, 3);
  let cloudSeen = false;
  for (let tick = 0; tick < 3000 && !cloudSeen; tick++) {
    natural = stepWorldReference(natural, 48, 1 / 30, {environment: DEFAULT_ENVIRONMENT});
    if (worldTotals(natural).cloud > 1e-4) cloudSeen = true;
  }
  assert.ok(cloudSeen, 'natural lake evaporation must condense into a real cloud within 100s of default-settings sim time');

  // C. Temperature decides rain vs snow: warm precipitation goes to water, cold to snow.
  let warm = flatWorldWithCloud(0.05);
  warm = stepWorldReference(warm, flatSize, 1 / 30, {environment: {...closedEnv, temperature: 0.85}});
  const warmTotals = worldTotals(warm);
  assert.ok(warmTotals.water > 0 && warmTotals.snow < 1e-6, `warm (temp=0.85) precipitation must fall as rain, not snow (water ${warmTotals.water}, snow ${warmTotals.snow})`);

  let cold = flatWorldWithCloud(0.05);
  cold = stepWorldReference(cold, flatSize, 1 / 30, {environment: {...closedEnv, temperature: 0.15}});
  const coldTotals = worldTotals(cold);
  assert.ok(coldTotals.snow > 0 && coldTotals.water < 1e-6, `cold (temp=0.15) precipitation must fall as snow, not rain (water ${coldTotals.water}, snow ${coldTotals.snow})`);

  // D. Sustained cold freezes a lake solid, and ice then suppresses transport (edgeFlow) and
  //    erosion (sandFlux) -- a frozen cell must stop moving water/sand, not just look cold.
  const frozenSize = 20;
  const frozenLake = new Float32Array(frozenSize * frozenSize * CELL_STRIDE);
  for (let z = 0; z < frozenSize; z++) {
    for (let x = 0; x < frozenSize; x++) {
      const o = cellOffset(frozenSize, x, z);
      frozenLake[o + FIELD.BEDROCK] = 0.1;
    }
  }
  for (let z = 0; z < frozenSize; z++) {
    for (let x = 0; x < frozenSize / 2; x++) frozenLake[cellOffset(frozenSize, x, z) + FIELD.WATER] = 0.3;
  }
  let frozen = frozenLake;
  const freezeEnv = {rain: 0, sun: 0.5, temperature: 0.05, evaporation: 0, permeability: 0, sandRate: 2.35, waterRate: 5.4, growthRate: 0};
  for (let tick = 0; tick < 900; tick++) frozen = stepWorldReference(frozen, frozenSize, 1 / 30, {environment: freezeEnv});
  const seamIce = sampleWorld(frozen, frozenSize, 0.5, 0.5).ice;
  assert.ok(seamIce > 0.9, `sustained cold must freeze the lake near-solid (ice fraction at seam: ${seamIce})`);
  const preFreezeDepth = sampleWorld(frozen, frozenSize, 0.5, 0.5).waterDepth;
  for (let tick = 0; tick < 60; tick++) frozen = stepWorldReference(frozen, frozenSize, 1 / 30, {environment: freezeEnv});
  const postFreezeDepth = sampleWorld(frozen, frozenSize, 0.5, 0.5).waterDepth;
  assert.ok(
    Math.abs(postFreezeDepth - preFreezeDepth) < 1e-4,
    `a frozen cell must stop transporting water once ice is near 1 (before ${preFreezeDepth}, after 60 more steps ${postFreezeDepth})`,
  );

  // E. Hail: a heavily loaded cloud right at the near-freezing band (just above where ice
  //    fully forms) must produce a real, measurable ground-impact kick (disturbance), not
  //    just silently convert to ordinary snow.
  let hailWorld = flatWorldWithCloud(0.5);
  hailWorld = stepWorldReference(hailWorld, flatSize, 1 / 30, {environment: {...closedEnv, temperature: 0.48}});
  let maxDisturbance = 0;
  for (let o = 0; o < hailWorld.length; o += CELL_STRIDE) maxDisturbance = Math.max(maxDisturbance, hailWorld[o + FIELD.DISTURBANCE]);
  assert.ok(maxDisturbance > 0.001, `a heavy cloud in the hail band must leave a ground-impact disturbance (max disturbance: ${maxDisturbance})`);
}

// --- Desert dune terrain (sand donor: keaukraine/webgl-dunes, MIT) -------------------------
{
  const duneSize = 64;
  const windDeg = 34;
  const dunes = createWorldState(duneSize, 0x2026, {terrain: 'desert', windDeg});
  assert.deepEqual(dunes, createWorldState(duneSize, 0x2026, {terrain: 'desert', windDeg}), 'dune generation is deterministic for a fixed seed');

  const heightAt = (x, z) => {
    const o = cellOffset(duneSize, x, z);
    return dunes[o + FIELD.BEDROCK] + dunes[o + FIELD.SAND];
  };
  let totalWater = 0, totalBiomass = 0;
  for (let o = 0; o < dunes.length; o += CELL_STRIDE) { totalWater += dunes[o + FIELD.WATER]; totalBiomass += dunes[o + FIELD.BIOMASS]; }
  assert.equal(totalWater, 0, 'a desert preset must start bone dry, no oasis water');
  assert.equal(totalBiomass, 0, 'a desert preset must start barren, no vegetation');

  // Sample a profile along the wind direction and find the widest single rise/fall run --
  // the donor's key physical signature is a long, gentle windward slope and a short, steep
  // leeward slip face, i.e. the profile must NOT be a symmetric sine wave.
  const windAngle = (windDeg * Math.PI) / 180;
  const wind = [Math.cos(windAngle), Math.sin(windAngle)];
  const heights = [];
  for (let i = 0; i < duneSize * 2; i++) {
    const t = i / (duneSize * 2);
    const x = Math.round((0.5 + wind[0] * (t - 0.5)) * (duneSize - 1));
    const z = Math.round((0.5 + wind[1] * (t - 0.5)) * (duneSize - 1));
    heights.push(heightAt(Math.max(0, Math.min(duneSize - 1, x)), Math.max(0, Math.min(duneSize - 1, z))));
  }
  let longestRise = 0, longestFall = 0, run = 0, dir = 0;
  for (let i = 1; i < heights.length; i++) {
    const d = Math.sign(heights[i] - heights[i - 1]);
    if (d === 0) continue;
    if (d === dir) { run++; } else { run = 1; dir = d; }
    if (dir > 0) longestRise = Math.max(longestRise, run);
    if (dir < 0) longestFall = Math.max(longestFall, run);
  }
  assert.ok(longestRise > longestFall * 1.5, `windward rise must span noticeably more of the profile than the leeward fall (rise run ${longestRise}, fall run ${longestFall})`);

  // A different wind direction must produce a genuinely different terrain, not just a
  // relabeled one -- otherwise "wind-shaped" would be cosmetic.
  const crossDunes = createWorldState(duneSize, 0x2026, {terrain: 'desert', windDeg: windDeg + 90});
  assert.notDeepEqual(dunes, crossDunes, 'a different wind direction must reshape the dune field');

  // The default (non-desert) terrain generator must be completely unaffected -- same call
  // shape and same output as before this option existed.
  assert.equal(stateChecksum(createWorldState(48, 7)), stateChecksum(createWorldState(48, 7, {})), 'omitting options must match passing an empty options object');
}

// --- Boundary mass leak regression -----------------------------------------------------
// edgeFlow/windFlux both derive their magnitude from a single cell's own stock, not a
// from-vs-to DIFFERENCE like sandFlux/diffusion -- so at the grid's edge, where cellOffset
// clamps the "neighbour" index back to the cell's own index, they must explicitly refuse to
// transport (near===far), or mass leaks out a downwind edge / gets manufactured at an
// upwind edge with no real neighbour on the other side. This is the sharpest possible check:
// a lake that touches the boundary on all sides, with wind blowing diagonally across it.
{
  const edgeSize = 20;
  const edgeState = new Float32Array(edgeSize * edgeSize * CELL_STRIDE);
  for (let o = 0; o < edgeState.length; o += CELL_STRIDE) {
    edgeState[o + FIELD.BEDROCK] = 0.1;
    edgeState[o + FIELD.WATER] = 0.2;
    edgeState[o + FIELD.VAPOR] = 0.02;
  }
  const edgeEnv = {...DEFAULT_ENVIRONMENT, rain: 0, permeability: 0, evaporation: 0, wind: 1, windDeg: 45};
  let edgeWorld = edgeState;
  const before = worldTotals(edgeWorld);
  const beforeSum = before.water + before.vapor + before.cloud + before.snow;
  for (let tick = 0; tick < 300; tick++) edgeWorld = stepWorldReference(edgeWorld, edgeSize, 1 / 30, {environment: edgeEnv});
  const after = worldTotals(edgeWorld);
  const afterSum = after.water + after.vapor + after.cloud + after.snow;
  assert.ok(
    Math.abs(afterSum - beforeSum) < Math.max(1e-6, beforeSum * 1e-4),
    `a lake and vapor field touching every grid edge under diagonal wind must not leak mass at the boundary (before ${beforeSum}, after ${afterSum})`,
  );
}

// --- Combustion: BIOMASS is fuel, FIRE is self-sustaining -----------------------------
{
  const fireSize = 32;
  function dryFuelWorld() {
    const w = new Float32Array(fireSize * fireSize * CELL_STRIDE);
    for (let o = 0; o < w.length; o += CELL_STRIDE) {
      w[o + FIELD.BEDROCK] = 0.1;
      w[o + FIELD.BIOMASS] = 0.15;
      w[o + FIELD.WETNESS] = 0.05;
    }
    return w;
  }
  const fireEnv = {...DEFAULT_ENVIRONMENT, rain: 0, sun: 0.6, wind: 0};
  const ignite = [{kind: STAMP.HEAT, x: 0.5, z: 0.5, radius: 0.05, amount: 0.15}];

  // A. A single ignition point spreads into neighbouring fuel (a real chain reaction), then
  //    self-extinguishes once fuel runs out -- not a fixed-radius scorch mark.
  let fire = dryFuelWorld();
  for (let tick = 0; tick < 5; tick++) fire = stepWorldReference(fire, fireSize, 1 / 30, {environment: fireEnv, stamps: ignite});
  const biomassAfterIgnition = worldTotals(fire).biomass;
  let peakFire = 0;
  for (let tick = 0; tick < 300; tick++) {
    fire = stepWorldReference(fire, fireSize, 1 / 30, {environment: fireEnv});
    peakFire = Math.max(peakFire, worldTotals(fire).fire);
  }
  const settled = worldTotals(fire);
  assert.ok(peakFire > 20, `an ignited dry fuel bed must spread into a real chain reaction, not stay pinned to one cell (peak total fire: ${peakFire.toFixed(2)})`);
  assert.ok(settled.biomass < biomassAfterIgnition * 0.5, `a spreading fire must consume a substantial share of the fuel bed, not just the ignition point (before spread ${biomassAfterIgnition.toFixed(2)}, after ${settled.biomass.toFixed(2)})`);
  assert.ok(settled.fire < 0.01, `fire must self-extinguish once fuel runs out, not burn forever (final total fire: ${settled.fire})`);
  assert.ok(settled.ash > 0, 'a burned fuel bed must leave ash residue behind');

  // B. Water/wetness actively douses an already-raging fire, not just prevents ignition.
  let raging = dryFuelWorld();
  for (let tick = 0; tick < 5; tick++) raging = stepWorldReference(raging, fireSize, 1 / 30, {environment: fireEnv, stamps: ignite});
  for (let tick = 0; tick < 60; tick++) raging = stepWorldReference(raging, fireSize, 1 / 30, {environment: fireEnv});
  const beforeDouse = worldTotals(raging).fire;
  const douse = [{kind: STAMP.WATER, x: 0.5, z: 0.5, radius: 0.6, amount: 0.3}];
  for (let tick = 0; tick < 10; tick++) raging = stepWorldReference(raging, fireSize, 1 / 30, {environment: fireEnv, stamps: douse});
  const afterDouse = worldTotals(raging).fire;
  assert.ok(beforeDouse > 5, `sanity: fire must actually be raging before the dousing test (${beforeDouse})`);
  assert.ok(afterDouse < beforeDouse * 0.5, `dumping water on a raging fire must actively suppress it, not just block new ignition (before ${beforeDouse.toFixed(2)}, after ${afterDouse.toFixed(2)})`);

  // C. A wet fuel bed must refuse to ignite at all, even under sustained heat.
  const wetWorld = dryFuelWorld();
  for (let o = 0; o < wetWorld.length; o += CELL_STRIDE) { wetWorld[o + FIELD.WETNESS] = 0.6; wetWorld[o + FIELD.WATER] = 0.05; }
  let wet = wetWorld;
  for (let tick = 0; tick < 10; tick++) wet = stepWorldReference(wet, fireSize, 1 / 30, {environment: fireEnv, stamps: [{kind: STAMP.HEAT, x: 0.5, z: 0.5, radius: 0.05, amount: 0.3}]});
  assert.equal(worldTotals(wet).fire, 0, 'wet fuel must refuse to ignite even under a strong heat stamp');
}

// --- Groundwater: infiltration goes somewhere instead of vanishing --------------------
{
  const gwSize = 24;
  const gwEnv = {...DEFAULT_ENVIRONMENT, permeability: 0.5, rain: 0};
  let gw = createWorldState(gwSize, 3);
  for (let tick = 0; tick < 300; tick++) gw = stepWorldReference(gw, gwSize, 1 / 30, {environment: gwEnv});
  assert.ok(worldTotals(gw).groundwater > 0, 'high permeability over a real run must build up a real groundwater reservoir, not discard infiltration');

  // A saturated water table resurfaces as a spring instead of accumulating forever.
  const springState = new Float32Array(gwSize * gwSize * CELL_STRIDE);
  for (let o = 0; o < springState.length; o += CELL_STRIDE) {
    springState[o + FIELD.BEDROCK] = 0.1;
    springState[o + FIELD.GROUNDWATER] = 0.9;
  }
  let spring = springState;
  const beforeSpring = worldTotals(spring);
  for (let tick = 0; tick < 60; tick++) spring = stepWorldReference(spring, gwSize, 1 / 30, {environment: {...DEFAULT_ENVIRONMENT, permeability: 0, rain: 0}});
  const afterSpring = worldTotals(spring);
  assert.ok(afterSpring.water > beforeSpring.water, 'a saturated water table must resurface as a spring, raising surface water');
  assert.ok(afterSpring.groundwater < beforeSpring.groundwater, 'water resurfacing as a spring must actually leave the groundwater reservoir');
}

// --- Wind: drifts airborne fields (smoke here, cheapest to seed cleanly) downwind -------
{
  const windSize = 32;
  const windState = new Float32Array(windSize * windSize * CELL_STRIDE);
  for (let o = 0; o < windState.length; o += CELL_STRIDE) windState[o + FIELD.BEDROCK] = 0.1;
  windState[cellOffset(windSize, 10, 16) + FIELD.SMOKE] = 5;
  const windEnv = {...DEFAULT_ENVIRONMENT, wind: 1, windDeg: 0, rain: 0}; // blows toward +x
  let wind = windState;
  const peakXAt = tick => {
    let bestX = -1, bestVal = 0;
    for (let x = 0; x < windSize; x++) {
      const v = wind[cellOffset(windSize, x, 16) + FIELD.SMOKE];
      if (v > bestVal) { bestVal = v; bestX = x; }
    }
    return bestX;
  };
  for (let tick = 0; tick < 180; tick++) wind = stepWorldReference(wind, windSize, 1 / 30, {environment: windEnv});
  const driftedX = peakXAt();
  assert.ok(driftedX > 10, `smoke's peak must have drifted downwind (+x) from its seed column, not stayed put (started x=10, now x=${driftedX})`);
}

// --- Wind FIELD: a real local vector, not a uniform scalar ------------------------------
{
  const windFieldSize = 24;
  const windFieldEnv = {...DEFAULT_ENVIRONMENT, wind: 0.8, windDeg: 0, rain: 0}; // prevailing +x
  let field = new Float32Array(windFieldSize * windFieldSize * CELL_STRIDE);
  for (let o = 0; o < field.length; o += CELL_STRIDE) field[o + FIELD.BEDROCK] = 0.1;
  for (let tick = 0; tick < 90; tick++) field = stepWorldReference(field, windFieldSize, 1 / 30, {environment: windFieldEnv});
  const centre = sampleWorld(field, windFieldSize, 0.5, 0.5);
  assert.ok(centre.windX > 0.5, `local wind relaxes toward the prevailing +x direction absent any disturbance (windX=${centre.windX.toFixed(3)} after 90 steps)`);
  assert.ok(Math.abs(centre.windZ) < 0.15, `no crosswind component was introduced (windZ=${centre.windZ.toFixed(3)})`);
}

{
  // A single-cell gust perturbation (env.wind=0 so nothing masks it) must spread into its
  // neighbours over time -- spatial diffusion, not a permanently isolated spike.
  const diffuseSize = 24;
  const diffuseEnv = {...DEFAULT_ENVIRONMENT, wind: 0, windDeg: 0, rain: 0};
  let field = new Float32Array(diffuseSize * diffuseSize * CELL_STRIDE);
  for (let o = 0; o < field.length; o += CELL_STRIDE) field[o + FIELD.BEDROCK] = 0.1;
  field[cellOffset(diffuseSize, 12, 12) + FIELD.WIND_X] = 1;
  for (let tick = 0; tick < 40; tick++) field = stepWorldReference(field, diffuseSize, 1 / 30, {environment: diffuseEnv});
  const neighbour = sampleWorld(field, diffuseSize, 13 / diffuseSize, 12 / diffuseSize);
  assert.ok(neighbour.windX > 0.02, `a wind perturbation diffuses into an adjacent cell within 40 steps (neighbour windX=${neighbour.windX.toFixed(4)})`);
}

// --- Fire generates its own outflow (thermal push away from the flame) -----------------
{
  const thermalSize = 24;
  const thermalEnv = {...DEFAULT_ENVIRONMENT, wind: 0, windDeg: 0, rain: 0}; // no prevailing wind to mask it
  let field = new Float32Array(thermalSize * thermalSize * CELL_STRIDE);
  for (let o = 0; o < field.length; o += CELL_STRIDE) field[o + FIELD.BEDROCK] = 0.1;
  const fireAt = cellOffset(thermalSize, 12, 12);
  field[fireAt + FIELD.FIRE] = 1;
  field[fireAt + FIELD.HEAT] = 1;
  for (let tick = 0; tick < 20; tick++) field = stepWorldReference(field, thermalSize, 1 / 30, {environment: thermalEnv});
  const east = sampleWorld(field, thermalSize, 13 / thermalSize, 12 / thermalSize);
  const west = sampleWorld(field, thermalSize, 11 / thermalSize, 12 / thermalSize);
  assert.ok(east.windX > 0.01, `a burning cell pushes wind outward to its east neighbour (windX=${east.windX.toFixed(4)})`);
  assert.ok(west.windX < -0.01, `and outward to its west neighbour in the opposite direction (windX=${west.windX.toFixed(4)})`);
}

// --- Fire spreads faster downwind than upwind ------------------------------------------
{
  // A strong crosswind should make a fire visibly race downwind while upwind spread lags.
  // With dense uniform fuel this asymmetry is real but SHORT-LIVED: given enough time both
  // sides eventually catch fire regardless (IGNITE_CHANCE keeps rolling every step), so this
  // must sample early, at a distance the front has reached on one side but not the other yet
  // -- not "burned at all" (both sides saturate to 1.0 given enough steps either way).
  const spreadSize = 30;
  const spreadEnv = {...DEFAULT_ENVIRONMENT, wind: 1, windDeg: 0, rain: 0}; // blows toward +x
  let field = new Float32Array(spreadSize * spreadSize * CELL_STRIDE);
  for (let o = 0; o < field.length; o += CELL_STRIDE) {
    field[o + FIELD.BEDROCK] = 0.1;
    field[o + FIELD.BIOMASS] = 0.4;
  }
  field[cellOffset(spreadSize, 15, 15) + FIELD.FIRE] = 1;
  for (let tick = 0; tick < 15; tick++) field = stepWorldReference(field, spreadSize, 1 / 30, {environment: spreadEnv});
  const downwindBurned = sampleWorld(field, spreadSize, 20 / spreadSize, 15 / spreadSize).fire
    + sampleWorld(field, spreadSize, 19 / spreadSize, 15 / spreadSize).fire;
  const upwindBurned = sampleWorld(field, spreadSize, 10 / spreadSize, 15 / spreadSize).fire
    + sampleWorld(field, spreadSize, 11 / spreadSize, 15 / spreadSize).fire;
  assert.ok(downwindBurned > upwindBurned, `fire reaches 5 cells downwind (+x) well before it reaches 5 cells upwind (downwind fire sum=${downwindBurned.toFixed(3)}, upwind=${upwindBurned.toFixed(3)})`);
}

// --- Snowdrift: loose snow is picked up and redeposited downwind -----------------------
{
  const driftSize = 24;
  const driftEnv = {...DEFAULT_ENVIRONMENT, wind: 1, windDeg: 0, rain: 0}; // blows toward +x
  let field = new Float32Array(driftSize * driftSize * CELL_STRIDE);
  for (let o = 0; o < field.length; o += CELL_STRIDE) field[o + FIELD.BEDROCK] = 0.1;
  field[cellOffset(driftSize, 10, 12) + FIELD.SNOW] = 3;
  const peakXAt = () => {
    let bestX = -1, bestVal = 0;
    for (let x = 0; x < driftSize; x++) {
      const v = field[cellOffset(driftSize, x, 12) + FIELD.SNOW];
      if (v > bestVal) { bestVal = v; bestX = x; }
    }
    return bestX;
  };
  for (let tick = 0; tick < 200; tick++) field = stepWorldReference(field, driftSize, 1 / 30, {environment: driftEnv});
  const driftedX = peakXAt();
  assert.ok(driftedX > 10, `snow's peak drifts downwind (+x) from its seed column, not just falling and staying put (started x=10, now x=${driftedX})`);
}

assert.match(WORLD_COMPUTE_WGSL, /@compute\s+@workgroup_size\(8, 8, 1\)/);
assert.match(WORLD_COMPUTE_WGSL, /var<storage, read> src/);
assert.match(WORLD_COMPUTE_WGSL, /var<storage, read_write> dst/);
assert.match(WORLD_COMPUTE_WGSL, /atomicLoad/);
assert.match(PARTICLE_COMPUTE_WGSL, /var<storage, read_write> particles/);
assert.match(PARTICLE_COMPUTE_WGSL, /atomicAdd/);
assert.match(QUERY_COMPUTE_WGSL, /local CPU query|result\[1\]/);
assert.match(WORLD_SPATIAL_RENDER_WGSL, /fn vsTerrain/);
assert.match(WORLD_SPATIAL_RENDER_WGSL, /fn vsWater/);
assert.match(WORLD_SPATIAL_RENDER_WGSL, /fn vsGrass/);
assert.match(WORLD_SPATIAL_RENDER_WGSL, /cell\.bio\.x/);
assert.match(PARTICLE_SPATIAL_RENDER_WGSL, /fn project/);

const [editorHtml, integrationJs, integrationCss, engineJs] = await Promise.all([
  readFile(new URL('../index.html', import.meta.url), 'utf8'),
  readFile(new URL('../editor/world-sandbox.js', import.meta.url), 'utf8'),
  readFile(new URL('../editor/world-sandbox.css', import.meta.url), 'utf8'),
  readFile(new URL('../runtime/shaded-engine.mjs', import.meta.url), 'utf8'),
]);
assert.match(editorHtml, /id="btn-world-sandbox"/);
assert.match(editorHtml, /id="world-sandbox-canvas"/);
assert.match(editorHtml, /id="world-sandbox-hud"/);
assert.match(editorHtml, /id="panel-sandbox"/);
assert.match(editorHtml, /editor\/world-sandbox\.js/);
assert.match(integrationJs, /window\.SHADEDWorldSandbox/);
assert.match(integrationJs, /world-sandbox-mode/);
assert.match(integrationJs, /screenToWorld/);
assert.match(integrationJs, /beginMultiGesture/);
assert.match(integrationCss, /body\.world-sandbox-mode/);
assert.match(integrationCss, /#world-sandbox-hud/);
assert.doesNotMatch(engineJs, /document\.body\.innerHTML=.*SHADED braucht WebGL 2/);
assert.match(engineJs, /webgl2-unavailable/);

const combinedGpuSource = WORLD_COMPUTE_WGSL + PARTICLE_COMPUTE_WGSL + QUERY_COMPUTE_WGSL;
assert.doesNotMatch(combinedGpuSource, /onSubmittedWorkDone/);

console.log('world sandbox: deterministic CA · mass-conserving sand/sediment · water→wetness→growth→heat chain · WebGPU compute/readback contracts');
