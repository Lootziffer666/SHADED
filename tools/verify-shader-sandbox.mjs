import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';

const [html, rootHtml, js, css, granularJs, granularCss, coastJs, coastCss, worldJs, worldCss, worldGpu, worldReference, sources] = await Promise.all([
  readFile('editor/sandbox.html', 'utf8'),
  readFile('index.html', 'utf8'),
  readFile('editor/sandbox.js', 'utf8'),
  readFile('editor/sandbox.css', 'utf8'),
  readFile('editor/sandbox-granular.js', 'utf8'),
  readFile('editor/sandbox-granular.css', 'utf8'),
  readFile('editor/sandbox-coast.js', 'utf8'),
  readFile('editor/sandbox-coast.css', 'utf8'),
  readFile('editor/world-sandbox.js', 'utf8'),
  readFile('editor/world-sandbox.css', 'utf8'),
  readFile('runtime/world-sandbox-webgpu.mjs', 'utf8'),
  readFile('runtime/world-sandbox-reference.mjs', 'utf8'),
  readFile('docs/sandbox-sand-water-sources.md', 'utf8'),
]);

assert.match(html, /id="sandbox-canvas"/);
assert.match(html, /sandbox-granular\.js/);
assert.match(html, /sandbox-coast\.js/);
assert.match(rootHtml, /id="world-sandbox-canvas"/);
assert.match(rootHtml, /id="panel-sandbox"/);
assert.match(rootHtml, /world-sandbox\.js/);
assert.match(html, /SHADED<\/span><span class="brand-mode">\/ SANDBOX/);
assert.match(html, /id="material-select"/);
assert.match(html, /ISOLIERT/);
assert.match(js, /getContext\('webgl2'/);
assert.match(js, /#version 300 es/);
assert.match(js, /shaded\.sandbox\.effect\.v1/);
assert.match(js, /\.cache\/materials\/freestylized\/library-1k\.json/);
assert.match(js, /uVolumeSteps/);
assert.match(css, /@media\(max-width:860px\)/);

const requiredEffects = [
  'water','ice','sand','mud','soil','wet','snow','moss',
  'lava','fire','smoke','steam','fog','cloud','hologram','dissolve',
];
for (const id of requiredEffects) assert.match(js, new RegExp(`id: '${id}'`), `missing sandbox effect: ${id}`);

assert.match(granularJs, /class GranularLab/);
assert.match(granularJs, /getContext\('webgl2'/);
assert.match(granularJs, /uPhase/);
assert.match(granularJs, /this\.simPass\(0\);this\.simPass\(1\)/);
assert.match(granularJs, /data-grain="sand"/);
assert.match(granularJs, /data-grain="water"/);
assert.match(granularCss, /body\.granular-mode/);

assert.match(coastJs, /class CoastRenderer/);
assert.match(coastJs, /getContext\('webgl2'/);
assert.match(coastJs, /uWaterLevel/);
assert.match(coastJs, /thickness/);
assert.match(coastJs, /uRefraction/);
assert.match(coastJs, /uAbsorption/);
assert.match(coastJs, /foamMask/);
assert.match(coastJs, /slopeW/);
assert.match(coastJs, /slopeL/);
assert.match(coastJs, /uRipples/);
assert.match(coastCss, /body\.coast-mode/);

assert.match(worldJs, /class CpuWorldSandbox/);
assert.match(worldJs, /WebGpuWorldSandbox\.create/);
assert.match(rootHtml, /URSACHE → WIRKUNG/);
assert.match(worldJs, /updateBody/);
assert.match(worldJs, /latencyMs/);
assert.match(worldCss, /body\.world-sandbox-mode/);
assert.match(worldGpu, /createComputePipelineAsync/);
assert.match(worldGpu, /mapAsync\(GPUMapMode\.READ\)/);
assert.match(worldGpu, /copyBufferToBuffer/);
assert.match(worldGpu, /worldGroups/);
assert.match(worldGpu, /particleGroups/);
assert.match(worldGpu, /queryGroups/);
assert.match(worldReference, /stepWorldReference/);
assert.match(worldReference, /sandFlux/);
assert.match(worldReference, /waterFlux/);

assert.match(sources, /WebGL SandToy/);
assert.match(sources, /FreeStylized Sand 01/);
assert.match(sources, /Particle \/ Volume Lab/);
assert.match(sources, /Surface \/ Coast Lab/);

const forbiddenRuntime = /\b(?:TODO|STUB|PLACEHOLDER|FAKE)\b/i;
const forbiddenUi = /\b(?:TODO|STUB|FAKE_RENDER)\b/i;
assert.equal(forbiddenRuntime.test(js), false, 'sandbox runtime contains forbidden placeholder language');
assert.equal(forbiddenRuntime.test(granularJs), false, 'granular runtime contains forbidden placeholder language');
assert.equal(forbiddenRuntime.test(coastJs), false, 'coast runtime contains forbidden placeholder language');
assert.equal(forbiddenRuntime.test(worldJs), false, 'world runtime contains forbidden placeholder language');
assert.equal(forbiddenRuntime.test(worldGpu), false, 'world GPU runtime contains forbidden placeholder language');
assert.equal(forbiddenUi.test(html), false, 'sandbox UI contains forbidden placeholder rendering');

console.log(`sandbox verify: ${requiredEffects.length} material/volume effects · WebGL2 granular lab · depth-aware Coast Lab · coupled WebGPU World Lab with CPU reference · optional material hook · mobile shell`);
