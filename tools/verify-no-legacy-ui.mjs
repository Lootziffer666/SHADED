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

// index.html currently boots Snowflow (/src/main.js), not this chain — see the "Status: two
// subsystems, one repo" note at the top of CLAUDE.md. `runtime/*.mjs` + `integrations/*.js` are a
// parked subsystem: real, tested, and documented, just not wired into the live page. The guard's
// job for that subsystem is "still exists on disk," not "index.html references it" — asserting the
// latter here is exactly the drift that made `npm run check` red without index.html actually
// regressing.
if (!html.includes('/src/main.js')) {
  fail('index.html no longer boots the live Snowflow entry point (/src/main.js)');
}

for (const required of [
  'runtime/shaded-engine.mjs',
  'runtime/world-sandbox-runtime.mjs',
  'runtime/world-sandbox-cpu-backend.mjs',
  'runtime/world-sandbox-camera.mjs',
  'runtime/world-sandbox-webgpu.mjs',
  'integrations/headless-orchestrator.js',
  'integrations/world-sandbox-runtime.js',
]) {
  if (!fs.existsSync(path.join(root, required))) {
    fail(`parked engine file deleted (see CLAUDE.md status note): ${required}`);
  }
}

if (!docs.includes('DOM is not an API')) fail('contract document lost DOM boundary rule');
if (!docs.includes('editor/world-sandbox.js')) fail('contract document lost sandbox extraction history');
if (!docs.includes('window.SHADEDWorldSandbox')) fail('world sandbox public contract is undocumented');

if (!process.exitCode) {
  console.log('UI CONTRACT GUARD: PASS — editor UI absent, runtime contracts explicit.');
}
