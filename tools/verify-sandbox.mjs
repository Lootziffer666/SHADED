import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';

const [html, js, css] = await Promise.all([
  readFile('editor/sandbox.html', 'utf8'),
  readFile('editor/sandbox.js', 'utf8'),
  readFile('editor/sandbox.css', 'utf8'),
]);

assert.match(html, /id="sandbox-canvas"/);
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

const forbidden = /\b(?:TODO|STUB|PLACEHOLDER|FAKE)\b/i;
assert.equal(forbidden.test(js), false, 'sandbox runtime contains forbidden placeholder language');
assert.equal(forbidden.test(html), false, 'sandbox UI contains forbidden placeholder language');

console.log(`sandbox verify: ${requiredEffects.length} effects · WebGL2/GLSL300 · local material hook · mobile shell`);
