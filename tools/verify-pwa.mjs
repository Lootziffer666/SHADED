import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (name) => fs.readFileSync(path.join(root, name), 'utf8');
const manifest = JSON.parse(read('manifest.webmanifest'));
const html = read('index.html');
const worker = read('service-worker.js');

const checks = [
  ['manifest name', typeof manifest.name === 'string' && manifest.name.includes('SHADED')],
  ['standalone display', manifest.display === 'standalone'],
  ['start URL', manifest.start_url === './index.html'],
  ['text-only scalable icon', manifest.icons.length === 1 && manifest.icons[0].sizes === 'any' && manifest.icons[0].type === 'image/svg+xml'],
  ['icon files exist', manifest.icons.every((icon) => fs.existsSync(path.join(root, icon.src)))],
  ['manifest linked', /rel="manifest" href="manifest\.webmanifest"/.test(html)],
  ['install module linked', /type="module" src="runtime\/install\.js"/.test(html)],
  ['spatial viewer linked', /type="module" src="runtime\/spatial-viewer\.js"/.test(html)],
  ['editor cached offline', worker.includes("'./editor/index.html'") && worker.includes("'./editor/app.js'")],
  ['runtime modules cached offline', worker.includes("'./runtime/install.js'") && worker.includes("'./runtime/spatial-viewer.js'") && worker.includes("'./runtime/spatial-navigation.mjs'")],
];

let failed = false;
for (const [label, ok] of checks) {
  console.log(`${ok ? '✓' : '✗'} ${label}`);
  failed ||= !ok;
}
if (failed) process.exit(1);
console.log('✅ PWA-Vertrag vollständig');
