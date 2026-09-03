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
