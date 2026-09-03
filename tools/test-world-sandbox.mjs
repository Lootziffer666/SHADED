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
