import { chromium } from 'playwright';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.join(HERE, '..');
let failed = false;
const errors = [];

function check(label, condition) {
  console.log(`${condition ? 'PASS' : 'FAIL'} — ${label}`);
  if (!condition) failed = true;
}

const server = http.createServer((req, res) => {
  const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  const rel = pathname === '/' ? 'editor/index.html' : pathname.replace(/^\//, '');
  const file = path.join(REPO, rel);
  try {
    const data = fs.readFileSync(file);
    const type = file.endsWith('.html') ? 'text/html'
      : file.endsWith('.js') || file.endsWith('.mjs') ? 'text/javascript'
      : file.endsWith('.css') ? 'text/css'
      : file.endsWith('.json') || file.endsWith('.webmanifest') ? 'application/json'
      : file.endsWith('.svg') ? 'image/svg+xml'
      : 'image/png';
    res.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'no-store' });
    res.end(data);
  } catch {
    res.writeHead(404); res.end();
  }
});

await new Promise(resolve => server.listen(8941, resolve));
const browser = await chromium.launch({ args: ['--use-gl=angle', '--enable-webgl', '--ignore-gpu-blocklist'] });
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
  isMobile: true,
  hasTouch: true,
  deviceScaleFactor: 2,
  userAgent: 'Mozilla/5.0 (Linux; Android 16) AppleWebKit/537.36 Chrome/140 Mobile Safari/537.36'
});
const page = await context.newPage();
page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
page.on('pageerror', error => errors.push(`PAGEERROR: ${error.message}`));

try {
  await page.goto('http://localhost:8941/editor/index.html', { waitUntil: 'load' });
  await page.waitForFunction(() => document.getElementById('engine-frame')?.contentWindow?.SHADED, { timeout: 15000 });

  const idle = await page.evaluate(() => ({
    inspector: document.body.classList.contains('inspector-open'),
    story: document.body.classList.contains('story-open'),
    active: document.querySelectorAll('.rail-btn.active').length,
    directViewportCss: [...document.styleSheets].some(sheet => sheet.href?.includes('viewport-first.css'))
  }));
  check('Startzustand hat keinen offenen Inspector', !idle.inspector);
  check('Startzustand hat keine offene Timeline', !idle.story);
  check('Startzustand hat kein scheinbar aktives Werkzeug', idle.active === 0);
  check('Viewport-first CSS ist direkt geladen', idle.directViewportCss);

  const viewport = await page.locator('.viewport').boundingBox();
  check(`Viewport nutzt nahezu volle Breite (${viewport?.width}px)`, viewport && viewport.width >= 385);
  check(`Viewport nutzt nahezu volle Höhe (${viewport?.height}px)`, viewport && viewport.height >= 835);

  // Quelle: auf -> derselbe Button wieder zu.
  await page.click('.rail-btn[data-target="panel-source"]');
  check('Quelle öffnet Inspector', await page.evaluate(() => document.body.classList.contains('inspector-open')));
  check('Nur Quelle ist im Inspector entfaltet', await page.evaluate(() => {
    const source = document.getElementById('panel-source');
    return !source.classList.contains('section-collapsed') && [...document.querySelectorAll('.inspector-section')].filter(s => !s.classList.contains('section-collapsed')).length === 1;
  }));
  await page.click('.rail-btn[data-target="panel-source"]');
  check('Zweiter Tap auf Quelle schließt Inspector vollständig', await page.evaluate(() => !document.body.classList.contains('inspector-open')));

  // Welt -> Story muss Welt schließen. Story -> Story wieder zu.
  await page.click('.rail-btn[data-target="panel-world"]');
  await page.click('.rail-btn[data-target="timeline-dock"]');
  const storyOnly = await page.evaluate(() => ({
    inspector: document.body.classList.contains('inspector-open'),
    story: document.body.classList.contains('story-open')
  }));
  check('Story öffnet nie gleichzeitig mit Inspector', !storyOnly.inspector && storyOnly.story);
  await page.click('.rail-btn[data-target="timeline-dock"]');
  check('Zweiter Tap auf Story schließt Timeline vollständig', await page.evaluate(() => !document.body.classList.contains('story-open')));

  // Reale Demo laden und erstellen.
  await page.click('.rail-btn[data-target="panel-source"]');
  await page.click('#btn-demo');
  await page.waitForTimeout(700);
  await page.click('#btn-erstellen');
  await page.waitForFunction(() => document.getElementById('engine-frame')?.contentWindow?.SHADED?.isReady?.(), { timeout: 20000 });
  check('Demo-Szene ist real erstellt', true);
  await page.click('.rail-btn[data-target="panel-source"]');

  // Korrekturfläche: sie soll jetzt ohne extra Bild-Dialog direkt die Szene enthalten
  // und auf Touch tatsächlich Pixel verändern.
  await page.click('.rail-btn[data-target="panel-paint"]');
  await page.waitForTimeout(120);
  const correctionBefore = await page.evaluate(() => {
    const canvas = document.getElementById('paint-canvas');
    const ctx = canvas.getContext('2d');
    const x = Math.floor(canvas.width * .45), y = Math.floor(canvas.height * .45);
    return { width: canvas.width, height: canvas.height, pixel: [...ctx.getImageData(x, y, 1, 1).data] };
  });
  check('Korrekturfläche wird automatisch aus der Live-Szene befüllt', correctionBefore.width > 1 && correctionBefore.height > 1 && correctionBefore.pixel[3] > 0);
  const paintBox = await page.locator('#paint-canvas').boundingBox();
  await page.touchscreen.tap(paintBox.x + paintBox.width * .45, paintBox.y + paintBox.height * .45);
  const correctionAfter = await page.evaluate(() => {
    const canvas = document.getElementById('paint-canvas');
    const ctx = canvas.getContext('2d');
    const x = Math.floor(canvas.width * .45), y = Math.floor(canvas.height * .45);
    return [...ctx.getImageData(x, y, 1, 1).data];
  });
  check('Korrekturfläche verändert bei Touch echte Pixel', correctionAfter.some((value, i) => value !== correctionBefore.pixel[i]));
  await page.click('.rail-btn[data-target="panel-paint"]');

  // RAUM soll nicht mehr als Orbit-Punktwolke starten, sondern direkt begehbar sein.
  await page.click('#btn-room-view');
  await page.waitForFunction(() => {
    const win = document.getElementById('engine-frame')?.contentWindow;
    return !win?.document.getElementById('spatial-viewer')?.hidden && win?.SHADED?.spatial?.viewer?.state?.()?.mode === 'walk';
  }, { timeout: 15000 });
  check('RAUM startet direkt im Lauf-Modus', true);

  await page.waitForFunction(() => {
    const doc = document.getElementById('engine-frame')?.contentDocument;
    const badge = doc?.getElementById('spatial-solid-badge');
    return badge && badge.textContent.includes('△') && !badge.textContent.includes('FEHLER');
  }, { timeout: 15000 });

  const roomState = await page.evaluate(() => {
    const win = document.getElementById('engine-frame').contentWindow;
    const doc = win.document;
    const mesh = win.SHADED.spatial.voxel.mesh();
    const solid = doc.getElementById('spatial-solid-canvas');
    const pad = doc.getElementById('spatial-touch-walk');
    return {
      triangles: mesh.indices.length / 3,
      solidWidth: solid.width,
      solidHeight: solid.height,
      pad: !!pad,
      camera: win.SHADED.spatial.viewer.state().camera
    };
  });
  check(`RAUM hat echte Dreiecksgeometrie (${roomState.triangles} Dreiecke)`, roomState.triangles > 10);
  check(`Solid-Canvas rendert (${roomState.solidWidth}×${roomState.solidHeight})`, roomState.solidWidth > 0 && roomState.solidHeight > 0);
  check('Mobile Laufsteuerung ist vorhanden', roomState.pad);

  // Touch-Vorwärts benutzt walkTo(), also dieselbe Dijkstra-/Kollisionslogik wie die
  // bestehende begehbare Route statt Kamera-Teleportation.
  await page.evaluate(() => {
    const doc = document.getElementById('engine-frame').contentDocument;
    const forward = doc.querySelector('#spatial-touch-walk [data-step="forward"]');
    forward.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 1, pointerType: 'touch' }));
    setTimeout(() => forward.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerId: 1, pointerType: 'touch' })), 420);
  });
  await page.waitForTimeout(750);
  const afterWalk = await page.evaluate(() => document.getElementById('engine-frame').contentWindow.SHADED.spatial.viewer.state().camera);
  const distance = Math.hypot(afterWalk.x - roomState.camera.x, afterWalk.z - roomState.camera.z);
  check(`Touch-Steuerung bewegt die Laufkamera (${distance.toFixed(3)} Welt-Einheiten)`, distance > .01);

  check('Inspector und Story bleiben beim Betreten von RAUM geschlossen', await page.evaluate(() => !document.body.classList.contains('inspector-open') && !document.body.classList.contains('story-open')));
} catch (error) {
  check(`Unerwarteter Fehler: ${error.message}`, false);
}

// Companion image probes are expected and may log 404s; everything else is relevant.
const relevantErrors = errors.filter(error => !/404/.test(error) && !/favicon/i.test(error));
check('Keine relevanten Browserfehler', relevantErrors.length === 0);
if (relevantErrors.length) console.log(relevantErrors.join('\n'));

await browser.close();
await new Promise(resolve => server.close(resolve));
console.log(failed ? '\n❌ verify-editor-mobile FAILED' : '\n✅ verify-editor-mobile PASSED');
process.exit(failed ? 1 : 0);
