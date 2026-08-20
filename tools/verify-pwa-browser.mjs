import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.join(HERE, '..');
const DIST = path.join(REPO, 'dist');
const DIST_EDITOR = path.join(DIST, 'editor');

const serviceWorkerSource = fs.readFileSync(path.join(REPO, 'service-worker.js'), 'utf8');
const expectedCache = serviceWorkerSource.match(/const\s+CACHE\s*=\s*['"]([^'"]+)['"]/)?.[1];
if (!expectedCache) throw new Error('Service-Worker-Cacheversion konnte nicht aus service-worker.js gelesen werden');
const mime = {'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.json':'application/json','.webmanifest':'application/manifest+json','.png':'image/png','.jpg':'image/jpeg','.svg':'image/svg+xml','.css':'text/css; charset=utf-8','.ico':'image/x-icon'};
const server = http.createServer((request, response) => {
  const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
  // Serve editor from dist/editor
  if (pathname === '/editor/index.html' || pathname === '/editor/') {
    const file = path.join(DIST_EDITOR, 'index.html');
    try { const data = fs.readFileSync(file); response.writeHead(200, {'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache'}); response.end(data); return; } catch { response.writeHead(404); response.end(); return; }
  }
  // Serve assets from dist/
  if (pathname.startsWith('/assets/')) {
    const file = path.join(DIST, pathname);
    try { const data = fs.readFileSync(file); response.writeHead(200, {'Content-Type': mime[path.extname(pathname)] || 'application/octet-stream', 'Cache-Control': 'no-cache'}); fs.createReadStream(file).pipe(response); return; } catch { response.writeHead(404); response.end(); return; }
  }
  // Runtime modules: serve source files
  if (pathname.startsWith('/runtime/')) {
    const file = path.join(REPO, 'src', pathname.replace(/^\/runtime\//, 'runtime/'));
    try { const data = fs.readFileSync(file); response.writeHead(200, {'Content-Type': 'text/javascript', 'Cache-Control': 'no-cache'}); response.end(data); return; } catch { response.writeHead(404); response.end(); return; }
  }
  // Fallback to dist/ for root, repo root for other files
  if (pathname === '/') {
    const file = path.join(DIST, 'index.html');
    try { const data = fs.readFileSync(file); response.writeHead(200, {'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache'}); response.end(data); return; } catch { response.writeHead(404); response.end(); return; }
  }
  const requested = pathname;
  const filename = path.resolve(REPO, '.' + requested), relative = path.relative(REPO, filename);
  if (relative.startsWith('..' + path.sep) || path.isAbsolute(relative) || !fs.existsSync(filename) || !fs.statSync(filename).isFile()) { response.writeHead(404); response.end(); return; }
  response.writeHead(200, {'Content-Type': mime[path.extname(filename)] || 'application/octet-stream', 'Cache-Control': 'no-cache'});
  fs.createReadStream(filename).pipe(response);
});

const listen = () => new Promise(resolve => server.listen(0, '127.0.0.1', resolve));

let browser;
try {
  await listen();
  const address = server.address(), origin = `http://127.0.0.1:${address.port}`;
  const launch = {headless: true, args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--enable-webgl', '--ignore-gpu-blocklist']};
  if (process.env.CHROMIUM) launch.executablePath = process.env.CHROMIUM;
  browser = await chromium.launch(launch);
  const context = await browser.newContext({serviceWorkers: 'allow'}), page = await context.newPage(), failures = [];
  page.on('pageerror', error => failures.push(error.message));
  page.on('console', message => { if (message.type() === 'error' && !/Failed to load resource/.test(message.text())) failures.push(`console: ${message.text()}`); });
  page.on('response', response => {
    if (response.status() < 400 || /_(depth|shading)\.(png|jpe?g|webp)(\?|$)/i.test(response.url())) return;
    failures.push(`HTTP ${response.status()}: ${response.url()}`);
  });
  await page.goto(origin + '/index.html', {waitUntil: 'domcontentloaded', timeout: 60000});
  console.error('[PWA] Waiting for service worker registration...');
  await page.evaluate(() => navigator.serviceWorker.ready).catch(() => console.error('[PWA] SW ready timeout, continuing')).then(() => console.error('[PWA] SW ready'));
  await page.reload({waitUntil: 'domcontentloaded', timeout: 60000});
  console.error('[PWA] Waiting for SW controller...');
  await page.waitForFunction(() => !!navigator.serviceWorker.controller, undefined, {timeout: 30000}).catch(() => console.error('[PWA] SW controller timeout, continuing')).then(() => console.error('[PWA] SW controller ready'));

  const cacheState = await page.evaluate(async cacheName => {
    const names = await caches.keys(), cache = await caches.open(cacheName);
    const required = [
      '/index.html', '/editor/index.html',
      '/assets/editor-*.js', '/assets/editor-*.css',
      '/runtime/install.js', '/runtime/spatial-viewer.js', '/runtime/spatial-reconstruction.mjs',
      '/runtime/sparse-voxel-world.mjs', '/runtime/surface-world-simulation.mjs',
      '/file_00000000974871f49fe71f6b456f9579.png', '/file_00000000974871f49fe71f6b456f9579_depth.png',
      '/file_00000000c84071f4bcd6ff9afdba7246.png'
    ];
    const hits = await Promise.all(required.map(async pathname => [pathname, !!(await cache.match(pathname))]));
    return {names, hits};
  }, expectedCache);
  assert(cacheState.names.includes(expectedCache), `Aktiver Service-Worker-Cache ${expectedCache} fehlt`);
  assert(cacheState.hits.every(([, hit]) => hit), `Cache fehlt: ${cacheState.hits.filter(([, hit]) => !hit).map(([name]) => name).join(', ')}`);

  await page.click('#btn-demo');
  console.error('[PWA] Waiting for demo to load...');
  try { await page.waitForFunction(() => /Szene geladen|Tiefenkarte geladen/.test(document.getElementById('status').textContent), undefined, {timeout: 120000}); }
  catch { throw new Error(`Demo-Laden fehlgeschlagen: ${await page.locator('#status').textContent()} | ${failures.join(' | ')}`); }
  console.error('[PWA] Demo loaded, creating scene...');
  await page.click('#btn-create');
  console.error('[PWA] Waiting for SHADED to be ready...');
  await page.waitForFunction(() => window.SHADED?.isReady?.(), undefined, {timeout: 60000});
  await page.click('#btn-spatial-view');
  console.error('[PWA] Waiting for spatial viewer...');
  await page.waitForFunction(() => !document.getElementById('spatial-viewer').hidden && /RMSE/.test(document.getElementById('spatial-fit-status').textContent), undefined, {timeout: 120000});
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
  await page.reload({waitUntil: 'domcontentloaded', timeout: 60000});
  console.error('[PWA] Testing offline fetches...');
  const offlineFetches = await page.evaluate(async () => Promise.all([
    'runtime/spatial-viewer.js', 'runtime/sparse-voxel-world.mjs', 'file_00000000974871f49fe71f6b456f9579.png'
  ].map(async url => ({url, ok: (await fetch(url, {signal: AbortSignal.timeout(30000)})).ok}))));
  assert(offlineFetches.every(result => result.ok), 'Offline-Abruf der Runtime oder Demo-Datei ist fehlgeschlagen');
  await page.click('#btn-demo');
  console.error('[PWA] Waiting for offline demo to load...');
  try { await page.waitForFunction(() => /Szene geladen|Tiefenkarte geladen/.test(document.getElementById('status').textContent), undefined, {timeout: 120000}); }
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
