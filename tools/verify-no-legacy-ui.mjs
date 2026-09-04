import fs from 'node:fs';

const html = fs.readFileSync('index.html', 'utf8');
const sw = fs.readFileSync('service-worker.js', 'utf8');
const docs = fs.readFileSync('docs/ENTRYPOINTS_AND_CONTRACTS.md', 'utf8');

const fail = (message) => {
  console.error(`UI CONTRACT GUARD: ${message}`);
  process.exitCode = 1;
};

const forbiddenHtml = [
  'world-studio',
  'editor/editor.css',
  'editor/viewport-first.css',
  'editor/drawer-handle.css',
  'editor/world-studio.css',
  'editor/world-studio-shell.css',
  'editor/world-studio-imports.css',
  'editor/engine-shell.css',
  'editor/world-sandbox.css',
  'editor/app.js',
  'editor/ui-shell.js',
  'editor/ux-fixes.js',
  'editor/world-room-gate.js',
  'editor/drawer-handle.js',
  'editor/world-studio.js',
  'editor/world-studio-bridge-settings.js',
  'editor/material-preview-live.js',
  'editor/world-studio-expert.js',
  'editor/world-sandbox.js',
];

for (const token of forbiddenHtml) {
  if (html.includes(token)) fail(`index.html re-attached quarantined UI token: ${token}`);
  if (sw.includes(token)) fail(`service-worker.js re-caches quarantined UI token: ${token}`);
}

if (/<(?:button|input|select|textarea|nav|aside)\b/i.test(html)) {
  fail('UI-zero host contains an authored interactive control');
}
if (/display\s*:\s*none\s*!important/i.test(html)) {
  fail('UI-zero host hides authored DOM instead of removing it');
}
if (!html.includes('runtime/shaded-engine.mjs')) fail('runtime/shaded-engine.mjs is not booted');
if (!html.includes('integrations/headless-orchestrator.js')) fail('headless orchestrator is not booted');
if (!docs.includes('DOM is not an API')) fail('contract document lost the DOM boundary rule');

if (!process.exitCode) console.log('UI CONTRACT GUARD: PASS — legacy presentation is not an active entry point.');
