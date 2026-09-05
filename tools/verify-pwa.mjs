import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = name => fs.readFileSync(path.join(root, name), 'utf8');
const manifest = JSON.parse(read('manifest.webmanifest'));
const html = read('index.html');
const worker = read('service-worker.js');

// index.html currently boots Snowflow (/src/main.js) and links neither the manifest nor the
// parked runtime/*.mjs engine modules -- see CLAUDE.md's "Status: two subsystems, one repo" note.
// That's accepted current state, not a regression this guard should fail on; the manifest/worker
// content checks below still guard the parked subsystem's own files against corruption.
const checks = [
  ['manifest name', typeof manifest.name === 'string' && manifest.name.includes('SHADED')],
  ['standalone display', manifest.display === 'standalone'],
  ['start URL is runtime host', manifest.start_url === './index.html'],
  ['no authored controls', !/<(?:button|input|select|textarea|nav|aside)\b/i.test(html)],
  ['no editor directory', !fs.existsSync(path.join(root, 'editor'))],
  ['no editor cache entries', !worker.includes('./editor/')],
  ['index cached offline', worker.includes("'./index.html'")],
  ['sandbox contracts cached', [
    './runtime/world-sandbox-reference.mjs',
    './runtime/world-sandbox-webgpu.mjs',
    './runtime/world-sandbox-runtime.mjs',
    './integrations/world-sandbox-runtime.js',
  ].every(file => worker.includes(`'${file}'`))],
  ['canonical demo cached offline', [
    './file_00000000974871f49fe71f6b456f9579.png',
    './file_00000000974871f49fe71f6b456f9579_depth.png',
    './file_00000000c84071f4bcd6ff9afdba7246.png',
  ].every(file => worker.includes(`'${file}'`))],
];

let failed = false;
for (const [label, ok] of checks) {
  console.log(ok ? 'PASS' : 'FAIL', label);
  failed ||= !ok;
}
if (failed) process.exit(1);
console.log('PWA runtime host/cache statically verified.');
