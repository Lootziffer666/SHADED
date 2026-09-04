import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const html = read('index.html');
const sw = read('service-worker.js');
const docs = read('docs/ENTRYPOINTS_AND_CONTRACTS.md');

const fail = message => {
  console.error(`UI CONTRACT GUARD: ${message}`);
  process.exitCode = 1;
};

if (fs.existsSync(path.join(root, 'editor'))) {
  fail('production editor/ tree exists; deleted UI has been restored');
}
if (fs.existsSync(path.join(root, 'gui.html'))) {
  fail('legacy gui.html exists');
}

if (/<(?:button|input|select|textarea|nav|aside)\b/i.test(html)) {
  fail('UI-zero host contains an authored interactive control');
}
if (/editor\//i.test(html)) {
  fail('index.html references deleted editor assets');
}
if (/editor\//i.test(sw)) {
  fail('service-worker.js caches deleted editor assets');
}
if (/display\s*:\s*none\s*!important/i.test(html)) {
  fail('UI-zero host hides authored DOM instead of removing it');
}

for (const required of [
  'runtime/shaded-engine.mjs',
  'integrations/headless-orchestrator.js',
  'integrations/world-sandbox-runtime.js',
]) {
  if (!html.includes(required)) fail(`runtime entry point missing: ${required}`);
}

for (const required of [
  './runtime/world-sandbox-runtime.mjs',
  './runtime/world-sandbox-cpu-backend.mjs',
  './runtime/world-sandbox-camera.mjs',
  './integrations/world-sandbox-runtime.js',
]) {
  if (!sw.includes(`'${required}'`)) fail(`service worker does not cache runtime contract: ${required}`);
}

if (!docs.includes('DOM is not an API')) fail('contract document lost DOM boundary rule');
if (!docs.includes('editor/world-sandbox.js')) fail('contract document lost sandbox extraction history');
if (!docs.includes('window.SHADEDWorldSandbox')) fail('world sandbox public contract is undocumented');

if (!process.exitCode) {
  console.log('UI CONTRACT GUARD: PASS — editor UI absent, runtime contracts explicit.');
}
