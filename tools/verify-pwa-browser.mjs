import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const serviceWorkerSource = fs.readFileSync(path.join(root, 'service-worker.js'), 'utf8');
const expectedCache = serviceWorkerSource.match(/const\s+CACHE\s*=\s*['"]([^'"]+)['"]/)?.[1];
if (!expectedCache) throw new Error('Service-Worker-Cacheversion konnte nicht aus service-worker.js gelesen werden');
const mime = {'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.json':'application/json','.webmanifest':'application/manifest+json','.png':'image/png','.jpg':'image/jpeg','.svg':'image/svg+xml','.css':'text/css; charset=utf-8','.ico':'image/x-icon'};
const server = http.createServer((request, response) => {
  const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname), requested = pathname === '/' ? '/index.html' : pathname;
  const filename = path.resolve(root, '.' + requested), relative = path.relative(root, filename);
  if (relative.startsWith('..' + path.sep) || path.isAbsolute(relative) || !fs.existsSync(filename) || !fs.statSync(filename).isFile()) { response.writeHead(404); response.end(); return; }
  response.writeHead(200, {'Content-Type': mime[path.extname(filename)] || 'application/octet-stream', 'Cache-Control': 'no-cache'});
  fs.createReadStream(filename).pipe(response);
});

const listen = () => new Promise(resolve => server.listen(0, '127.0.0.1', resolve));

let browser;
try {
  await listen();
  const address = server.address(), origin = `http://127.0.0.1:${address.port}`;
  const launch = {headless: true, args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--enable-webgl', '--ignore-gpu-blocklist', '--no-sandbox', '--disable-dev-shm-usage']};
  if (process.env.CHROMIUM) launch.executablePath = process.env.CHROMIUM;
  browser = await chromium.launch(launch);
  const context = await browser.newContext({serviceWorkers: 'allow'}), page = await context.newPage(), failures = [];
  page.on('pageerror', error => failures.push(error.message));
  page.on('console', message => { if (message.type() === 'error' && !/Failed to load resource/.test(message.text())) failures.push(`console: ${message.text()}`); });
  page.on('response', response => {
    if (response.status() < 400 || /_(depth|shading)\.(png|jpe?g|webp)(\?|$)/i.test(response.url())) return;
    failures.push(`HTTP ${response.status()}: ${response.url()}`);
  });
  await page.goto(origin + '/index.html', {waitUntil: 'domcontentloaded'});
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload({waitUntil: 'domcontentloaded'});
  await page.waitForFunction(() => !!navigator.serviceWorker.controller);

  const cacheState = await page.evaluate(async cacheName => {
    const names = await caches.keys(), cache = await caches.open(cacheName);
    const required = [
      '/index.html', '/runtime/install.js', '/runtime/spatial-viewer.js', '/runtime/spatial-reconstruction.mjs',
      '/runtime/sparse-voxel-world.mjs', '/runtime/surface-world-simulation.mjs',
      '/file_00000000974871f49fe71f6b456f9579.png', '/file_00000000974871f49fe71f6b456f9579_depth.png',
      '/file_00000000c84071f4bcd6ff9afdba7246.png', '/editor/ui-shell.js?v=10', '/editor/app.js?v=9', '/editor/facade.js'
    ];
    const hits = await Promise.all(required.map(async pathname => [pathname, !!(await cache.match(pathname))]));
    return {names, hits};
  }, expectedCache);
  assert(cacheState.names.includes(expectedCache), `Aktiver Service-Worker-Cache ${expectedCache} fehlt`);
  assert(cacheState.hits.every(([, hit]) => hit), `Cache fehlt: ${cacheState.hits.filter(([, hit]) => !hit).map(([name]) => name).join(', ')}`);

  // The single-document consolidation (see CLAUDE.md invariant 1) retired the old World
  // Studio overlay this test used to gate Rail/Inspector behind via an "ERWEITERT" toggle
  // button (editor/world-studio-expert.js) -- that script's own target selector
  // ('#world-studio .world-studio-head') no longer exists anywhere in index.html, so the
  // button it tries to create is never inserted and a click on it can only ever time out.
  // The click was already redundant: this manual override sets every piece of state the
  // click was meant to produce (open inspector, expand the source panel, mark its rail
  // button active) directly and unconditionally, the same open-section logic a real rail
  // click uses (see editor/ui-shell.js openSection()).
  await page.evaluate(() => {
    document.body.classList.add('inspector-open');
    document.body.classList.remove('inspector-collapsed');
    document.querySelectorAll('.inspector-section').forEach((section) => section.classList.toggle('section-collapsed', section.id !== 'panel-source'));
    document.querySelectorAll('.rail-btn').forEach((button) => button.classList.toggle('active', button.dataset.target === 'panel-source'));
  });
  await page.locator('#btn-demo').waitFor({ state: 'visible', timeout: 10000 });
  await page.click('#btn-demo');
  try { await page.waitForFunction(() => /Szene geladen|Tiefenkarte geladen/.test(document.getElementById('status').textContent)); }
  catch { throw new Error(`Demo-Laden fehlgeschlagen: ${await page.locator('#status').textContent()} | ${failures.join(' | ')}`); }
  await page.click('#btn-erstellen');
  await page.waitForFunction(() => window.SHADED?.isReady?.());
  await page.evaluate(() => {
    document.querySelectorAll('.inspector-section').forEach((section) => section.classList.toggle('section-collapsed', section.id !== 'panel-story'));
    document.querySelectorAll('.rail-btn').forEach((button) => button.classList.toggle('active', button.dataset.target === 'panel-story'));
  });
  await page.locator('#btn-spatial-view').waitFor({ state: 'visible', timeout: 10000 });
  await page.click('#btn-spatial-view');
  await page.waitForFunction(() => !document.getElementById('spatial-viewer').hidden && /RMSE/.test(document.getElementById('spatial-fit-status').textContent));
  const spatial = await page.evaluate(() => {
    const before = window.SHADED.spatial.voxel.state(), fit = window.SHADED.spatial.voxel.fit();
    const paint = window.SHADED.spatial.voxel.paint([0, 0, 0], {pressure: 0.8, tiltX: 30, radius: 0.08, opacity: 0.7, material: 'wood', color: [90, 60, 30]});
    const undo = window.SHADED.spatial.voxel.undo(), redo = window.SHADED.spatial.voxel.redo(), mesh = window.SHADED.spatial.voxel.mesh();
    return {before, fit, paint, undo, redo, vertices: mesh.positions.length / 3, project: window.SHADED.spatial.voxel.project().format};
  });
  assert(spatial.before.voxels > 0, 'Raumansicht enthält keine Oberflächenvoxel');
  assert(Number.isFinite(spatial.fit.coverage) && spatial.fit.coverage > 0, 'Geometrie-Fit enthält keine gemessene Abdeckung');
  assert(spatial.paint.changed > 0 && spatial.undo && spatial.redo, 'Browser-Pinsel/Undo/Redo hat keinen Voxelzustand geändert');
  assert(spatial.vertices > 0 && spatial.project === 'SHADED.sparse-voxel-world.v1', 'Browser-Mesh/Projekt-Export fehlt');

  await context.setOffline(true);
  await page.reload({waitUntil: 'domcontentloaded'});
  const offlineFetches = await page.evaluate(async () => Promise.all([
    'runtime/spatial-viewer.js', 'runtime/sparse-voxel-world.mjs', 'file_00000000974871f49fe71f6b456f9579.png'
  ].map(async url => ({url, ok: (await fetch(url)).ok}))));
  assert(offlineFetches.every(result => result.ok), 'Offline-Abruf der Runtime oder Demo-Datei ist fehlgeschlagen');
  // Same retired-overlay reasoning as above (editor/world-studio-shell.css's unconditional
  // `#world-studio{display:none!important}` keeps the whole legacy panel, including this
  // button, permanently unreachable) -- the manual override below is what actually opens
  // the inspector after the offline reload resets DOM state.
  await page.evaluate(() => {
    document.body.classList.add('inspector-open');
    document.body.classList.remove('inspector-collapsed');
    document.querySelectorAll('.inspector-section').forEach((section) => section.classList.toggle('section-collapsed', section.id !== 'panel-source'));
    document.querySelectorAll('.rail-btn').forEach((button) => button.classList.toggle('active', button.dataset.target === 'panel-source'));
  });
  await page.locator('#btn-demo').waitFor({ state: 'visible', timeout: 10000 });
  await page.click('#btn-demo');
  try { await page.waitForFunction(() => /Szene geladen|Tiefenkarte geladen/.test(document.getElementById('status').textContent)); }
  catch { throw new Error(`Offline-Demo fehlgeschlagen: ${await page.locator('#status').textContent()} | ${failures.join(' | ')}`); }
  assert(!failures.length, `Browserfehler: ${failures.join(' | ')}`);
  console.log(`✅ Browser-PWA aktiv: ${expectedCache}, Offline-Navigation, Demo-Cache, WebGL-Raumansicht und Voxel-Editor geprüft (${origin})`);
} finally {
  await browser?.close();
  await new Promise(resolve => server.close(resolve));
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
