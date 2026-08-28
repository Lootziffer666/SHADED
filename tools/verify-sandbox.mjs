import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';

const [html, js, css, granularJs, granularCss, sources] = await Promise.all([
  readFile('editor/sandbox.html', 'utf8'),
  readFile('editor/sandbox.js', 'utf8'),
  readFile('editor/sandbox.css', 'utf8'),
  readFile('editor/sandbox-granular.js', 'utf8'),
  readFile('editor/sandbox-granular.css', 'utf8'),
  readFile('docs/sandbox-sand-water-sources.md', 'utf8'),
]);

assert.match(html, /id="sandbox-canvas"/);
assert.match(html, /sandbox-granular\.js/);
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
assert.match(sources, /WebGL SandToy/);
assert.match(sources, /FreeStylized Sand 01/);
assert.match(sources, /Particle \/ Volume Lab/);

const forbiddenRuntime = /\b(?:TODO|STUB|PLACEHOLDER|FAKE)\b/i;
const forbiddenUi = /\b(?:TODO|STUB|FAKE_RENDER)\b/i;
assert.equal(forbiddenRuntime.test(js), false, 'sandbox runtime contains forbidden placeholder language');
assert.equal(forbiddenRuntime.test(granularJs), false, 'granular runtime contains forbidden placeholder language');
assert.equal(forbiddenUi.test(html), false, 'sandbox UI contains forbidden placeholder rendering');

console.log(`sandbox verify: ${requiredEffects.length} material/volume effects · WebGL2 granular ping-pong lab · local material hook · mobile shell`);
