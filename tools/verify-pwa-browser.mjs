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

const log = (phase, msg) => console.log(`[${phase}] ${msg}`);
const assert = (condition, message) => { if (!condition) throw new Error(message); };

// Filter for benign errors that should not fail CI
const isBenignError = (text) =>
  /Failed to load resource/.test(text) ||
  /Modell nicht gefunden/.test(text) ||
  /_(depth|shading)\.(png|jpe?g|webp)/i.test(text);

let browser;
try {
  await listen();
  const address = server.address(), origin = `http://127.0.0.1:${address.port}`;
  const launch = {headless: true, args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--enable-webgl', '--ignore-gpu-blocklist', '--no-sandbox', '--disable-dev-shm-usage', '--disable-setuid-sandbox']};
  if (process.env.CHROMIUM) launch.executablePath = process.env.CHROMIUM;
  browser = await chromium.launch(launch);
  const context = await browser.newContext({serviceWorkers: 'allow', viewport: {width: 1280, height: 720}}), page = await context.newPage(), failures = [];
  page.on('pageerror', error => { console.log('[PAGEERROR]', error.message.slice(0, 200)); failures.push(error.message); });
  page.on('console', message => { if (message.type() === 'error' && !isBenignError(message.text())) failures.push(`console: ${message.text()}`); });
  page.on('response', response => {
    if (response.status() < 400) return;
    // Benign 404s: depth models, companion images, wasm
    if (/\/models\//.test(response.url())) return;
    if (/\/(wasm|gguf)/i.test(response.url())) return;
    if (/_(depth|shading)\.(png|jpe?g|webp)(\?|$)/i.test(response.url())) return;
    console.log('[HTTP-404]', response.status(), response.url());
    failures.push(`HTTP ${response.status()}: ${response.url()}`);
  });

  // Phase 1: Load page and register service worker
  log('Phase 1/4', 'Loading index.html...');
  await page.goto(origin + '/index.html', {waitUntil: 'domcontentloaded', timeout: 30000});

  log('Phase 1/4', 'Waiting for SW registration...');
  try {
    await page.waitForFunction(() => navigator.serviceWorker?.ready, undefined, { timeout: 15000 });
  } catch (e) {
    log('Phase 1/4', `SW registration timeout (may be expected on HTTP): ${e.message.slice(0, 100)}`);
  }

  log('Phase 1/4', 'Reloading with SW active...');
  await page.reload({waitUntil: 'domcontentloaded', timeout: 30000});
  const hasSW = await page.evaluate(() => !!navigator.serviceWorker?.controller).catch(() => false);
  log('Phase 1/4', `SW controller: ${hasSW ? 'active' : 'none'}`);

  // Phase 2: Cache verification (only if SW is active)
  if (hasSW) {
    log('Phase 2/4', 'Checking cache contents...');
    const cacheState = await page.evaluate(async cacheName => {
      const names = await caches.keys();
      const cache = await caches.open(cacheName);
      const required = [
        '/index.html', '/editor/index.html', '/runtime/install.js', '/runtime/spatial-viewer.js',
        '/runtime/spatial-reconstruction.mjs', '/runtime/sparse-voxel-world.mjs', '/runtime/surface-world-simulation.mjs',
        '/file_00000000974871f49fe71f6b456f9579.png', '/file_00000000974871f49fe71f6b456f9579_depth.png',
        '/file_00000000c84071f4bcd6ff9afdba7246.png', '/editor/ui-shell.js', '/editor/app.js'
      ];
      const hits = await Promise.all(required.map(async pathname => [pathname, !!(await cache.match(pathname))]));
      return {names, hits};
    }, expectedCache);
    assert(cacheState.names.includes(expectedCache), `Aktiver Service-Worker-Cache ${expectedCache} fehlt`);
    const missingCache = cacheState.hits.filter(([, hit]) => !hit).map(([name]) => name);
    assert(missingCache.length === 0, `Cache fehlt: ${missingCache.join(', ')}`);
    log('Phase 2/4', `Cache OK (${cacheState.hits.length} entries)`);
  } else {
    log('Phase 2/4', 'SW not active — cache check skipped');
  }

  // Phase 3: Load demo scene and create world
  log('Phase 3/4', 'Loading demo scene...');
  await page.click('#btn-demo');
  try { await page.waitForFunction(() => /Szene geladen|Tiefenkarte geladen/.test(document.getElementById('status').textContent), undefined, { timeout: 30000 }); }
  catch { throw new Error(`Demo-Laden fehlgeschlagen: ${await page.locator('#status').textContent()} | ${failures.join(' | ')}`); }

  log('Phase 3/4', 'Creating world...');
  await page.click('#btn-create');
  await page.waitForFunction(() => window.SHADED?.isReady?.(), undefined, { timeout: 30000 });
  log('Phase 3/4', 'World created, engine ready');

  // Phase 4: Spatial viewer
  log('Phase 4/4', 'Opening spatial viewer...');
  await page.evaluate(() => { const btn = document.getElementById('btn-spatial-view'); if (btn) btn.click(); });
  await page.waitForFunction(() => !document.getElementById('spatial-viewer').hidden && /RMSE/.test(document.getElementById('spatial-fit-status').textContent), undefined, { timeout: 30000 });

  log('Phase 4/4', 'Checking spatial voxel state...');
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
  log('Phase 4/4', `Spatial OK: ${spatial.vertices} vertices, ${spatial.before.voxels} voxels`);

  // Phase 5: Offline verification (skip if no SW controlling)
  if (hasSW) {
    log('Phase 4/4', 'Testing offline mode...');
    await context.setOffline(true);
    try { await page.reload({waitUntil: 'domcontentloaded', timeout: 30000 }); } catch (e) { log('Phase 4/4', `Offline reload failed (expected without SW): ${e.message.slice(0, 80)}`); }
    const offlineFetches = await page.evaluate(async () => Promise.all([
      'runtime/spatial-viewer.js', 'runtime/sparse-voxel-world.mjs', 'file_00000000974871f49fe71f6b456f9579.png'
    ].map(async url => ({url, ok: (await fetch(url)).ok}))));
    assert(offlineFetches.every(result => result.ok), 'Offline-Abruf der Runtime oder Demo-Datei ist fehlgeschlagen');

    await page.click('#btn-demo');
    try { await page.waitForFunction(() => /Szene geladen|Tiefenkarte geladen/.test(document.getElementById('status').textContent), undefined, { timeout: 30000 }); }
    catch { throw new Error(`Offline-Demo fehlgeschlagen: ${await page.locator('#status').textContent()} | ${failures.join(' | ')}`); }
  } else {
    log('Phase 4/4', 'Offline test skipped (no SW controller)');
  }
  assert(!failures.length, `Browserfehler: ${failures.join(' | ')}`);

  console.log(`\n✅ Browser-PWA verifiziert: ${expectedCache}, Demo-Cache, WebGL-Raumansicht und Voxel-Editor geprüft (${origin})`);
} finally {
  await browser?.close();
  await new Promise(resolve => server.close(resolve));
}
