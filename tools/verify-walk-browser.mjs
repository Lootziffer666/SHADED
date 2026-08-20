import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const repository = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const mime = {'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.json':'application/json','.webmanifest':'application/manifest+json','.png':'image/png','.jpg':'image/jpeg','.svg':'image/svg+xml','.css':'text/css; charset=utf-8','.ico':'image/x-icon'};
let server;

async function localOrigin() {
  const DIST = path.join(repository, 'dist');
  server = http.createServer((request, response) => {
    const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    if (pathname === '/' || pathname === '/index.html') {
      const file = path.join(DIST, 'index.html');
      try { const data = fs.readFileSync(file); response.writeHead(200, {'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache'}); response.end(data); return; } catch { response.writeHead(404); response.end(); return; }
    }
    if (pathname.startsWith('/assets/')) {
      const file = path.join(DIST, pathname);
      try { const data = fs.readFileSync(file); response.writeHead(200, {'Content-Type': mime[path.extname(pathname)] || 'text/javascript', 'Cache-Control': 'no-cache'}); response.end(data); return; } catch { response.writeHead(404); response.end(); return; }
    }
    // Fallback to repo root for other files (models, images, etc.)
    const requested = pathname;
    const filename = path.resolve(repository, '.' + requested), relative = path.relative(repository, filename);
    if (relative.startsWith('..' + path.sep) || path.isAbsolute(relative) || !fs.existsSync(filename) || !fs.statSync(filename).isFile()) { response.writeHead(404); response.end(); return; }
    response.writeHead(200, {'Content-Type': mime[path.extname(filename)] || 'application/octet-stream', 'Cache-Control': 'no-cache'});
    fs.createReadStream(filename).pipe(response);
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  return `http://127.0.0.1:${server.address().port}`;
}

const assert = (condition, message) => { if (!condition) throw new Error(message); };
const origin = (process.env.BASE_URL || await localOrigin()).replace(/\/$/, '');
let browser;
try {
  const launch = {headless: true, args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--enable-webgl', '--ignore-gpu-blocklist']};
  if (process.env.CHROMIUM) launch.executablePath = process.env.CHROMIUM;
  browser = await chromium.launch(launch);
  const page = await browser.newPage({viewport: {width: 960, height: 600}}), failures = [];
  page.on('pageerror', error => failures.push(error.message));
  page.on('response', response => { if (response.status() >= 400 && !/_(depth|shading)\.(png|jpe?g|webp)(\?|$)/i.test(response.url()) && !/\/models\//.test(response.url())) failures.push(`HTTP ${response.status()}: ${response.url()}`); });
  page.on('dialog', dialog => { failures.push(`DIALOG: ${dialog.message()}`); dialog.dismiss(); });
  console.error('[WALK] Loading index.html...');
  await page.goto(origin + '/index.html', {waitUntil: 'domcontentloaded', timeout: 60000});
  console.error('[WALK] Loading demo image...');
  await page.click('#btn-demo');
  console.error('[WALK] Waiting for scene to load...');
  await page.waitForFunction(() => /Szene geladen|Tiefenkarte geladen/.test(document.getElementById('status')?.textContent || ''), undefined, {timeout: 120000});
  await page.click('#btn-create');
  console.error('[WALK] Waiting for SHADED ready...');
  await page.waitForFunction(() => window.SHADED?.isReady?.(), undefined, {timeout: 60000});
  console.error('[WALK] Opening spatial view...');
  await page.click('#btn-spatial-view');
  console.error('[WALK] Waiting for spatial fit...');
  await page.waitForFunction(() => /Spiegelhülle/.test(document.getElementById('spatial-fit-status').textContent), undefined, {timeout: 120000});
  await page.waitForTimeout(2500);

  const proof = await page.evaluate(() => ({state: window.SHADED.spatial.viewer.state(), route: window.SHADED.spatial.viewer.route()}));
  assert(proof.state.observed > 0, 'keine beobachtete Point Cloud');
  assert(proof.state.mirrored > 0 && proof.state.generated >= proof.state.mirrored, 'keine explizite Spiegel-Rückseite');
  assert(proof.state.boundaryTrees > 0, 'keine Begrenzungsbäume');
  assert(proof.state.skybox === 'procedural-directional-background', 'Skybox ist nicht aktiv');
  assert(proof.route.length > 2, 'kein Dijkstra-Weg von vor dem Haus hinter das Haus');
  assert(proof.state.points < 80_000, `Punktbudget überschritten: ${proof.state.points}`);
  const stages = await page.evaluate(() => window.SHADED.spatial.viewer.stages().map(stage => window.SHADED.spatial.viewer.stage(stage.id)));
  assert(stages.length === 12 && stages.every(stage => stage.description.length > 20), 'nicht alle Erzeugungsstufen sind einzeln erklärt');
  assert(stages.every(stage => stage.stage === 'sky' || stage.points > 0), 'mindestens eine Erzeugungsstufe ist nicht sichtbar');
  await page.evaluate(() => window.SHADED.spatial.viewer.stage('final'));

  const walk = await page.evaluate(() => {
    window.SHADED.spatial.viewer.setMode('walk');
    const route = window.SHADED.spatial.viewer.walkTo(0, -.62);
    return {route, start: window.SHADED.spatial.viewer.state().camera};
  });
  assert(walk.route.length > 2 && walk.start.z > 0, 'Laufmodus startet nicht vor dem Haus');
  console.error('[WALK] Walking to target...');
  await page.waitForFunction(() => window.SHADED.spatial.viewer.state().camera.z < -.45, undefined, {timeout: 60000});
  console.error('[WALK] Walk complete, testing orbit...');

  await page.evaluate(() => window.SHADED.spatial.viewer.setMode('orbit'));
  const box = await page.locator('#spatial-canvas').boundingBox(), before = await page.evaluate(() => window.SHADED.spatial.viewer.state().camera);
  await page.mouse.move(box.x + box.width * .5, box.y + box.height * .5);
  await page.mouse.down(); await page.mouse.move(box.x + box.width * .72, box.y + box.height * .74, {steps: 5}); await page.mouse.up();
  await page.mouse.move(box.x + box.width * .5, box.y + box.height * .5);
  await page.keyboard.down('Shift'); await page.mouse.down(); await page.mouse.move(box.x + box.width * .62, box.y + box.height * .62, {steps: 4}); await page.mouse.up(); await page.keyboard.up('Shift');
  await page.mouse.move(box.x + box.width * .5, box.y + box.height * .5);
  await page.mouse.wheel(0, -700);
  const after = await page.evaluate(() => window.SHADED.spatial.viewer.state().camera);
  assert(Math.abs(after.yaw - before.yaw) > .1 && Math.abs(after.pitch - before.pitch) > .1, 'Orbit/Tilt reagiert nicht auf Pointer-Drag');
  assert(Math.abs(after.x - before.x) > .05 || Math.abs(after.y - before.y) > .05, 'Pan reagiert nicht auf Shift-Drag');
  assert(after.z < before.z, 'Zoom reagiert nicht auf Mausrad');
  const floorCamera = await page.evaluate(() => {
    const state = window.SHADED.spatial.viewer.state();
    return window.SHADED.spatial.viewer.setCamera({y: state.floorY + .02, z: .22, pitch: -1.45});
  });
  assert(floorCamera.pitch < -1.4 && floorCamera.z <= .22, 'Kamera erreicht Bodenhöhe/steilen Tilt nicht');
  assert(!failures.length, failures.join(' | '));
  console.log(`✅ Walkthrough: 12 sichtbare Stufen, ${proof.state.observed} beobachtet, ${proof.state.mirrored} Spiegelpunkte, ${proof.state.boundaryTrees} Baum-Punkte, ${proof.route.length} Wegzellen (Software-Renderer informativ: ${proof.state.fps.toFixed(1)} FPS)`);
} finally {
  await browser?.close();
  if (server) await new Promise(resolve => server.close(resolve));
}
