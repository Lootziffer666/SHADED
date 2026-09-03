import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {
  DEFAULT_ENVIRONMENT,
  STAMP,
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
  const flat = new Float32Array(damSize * damSize * 12);
  const {cellOffset: damOffset, FIELD: damField} = await import('../runtime/world-sandbox-reference.mjs');
  for (let z = 0; z < damSize; z++) {
    for (let x = 0; x < damSize; x++) {
      flat[damOffset(damSize, x, z) + damField.BEDROCK] = 0.1;
    }
  }
  for (let z = 0; z < damSize; z++) {
    for (let x = 0; x < damSize / 2; x++) {
      flat[damOffset(damSize, x, z) + damField.WATER] = 0.3;
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
