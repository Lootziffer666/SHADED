import { chromium } from 'playwright';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.join(HERE, '..');
let failed = false;
const errors = [];
const check = (label, condition) => { console.log(`${condition ? 'PASS' : 'FAIL'} — ${label}`); if (!condition) failed = true; };

const server = http.createServer((req, res) => {
  const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  const rel = pathname === '/' ? 'editor/index.html' : pathname.replace(/^\//, '');
  const file = path.join(REPO, rel);
  try {
    const data = fs.readFileSync(file);
    const type = file.endsWith('.html') ? 'text/html' : file.endsWith('.js') || file.endsWith('.mjs') ? 'text/javascript' : file.endsWith('.css') ? 'text/css' : file.endsWith('.json') || file.endsWith('.webmanifest') ? 'application/json' : file.endsWith('.svg') ? 'image/svg+xml' : 'image/png';
    res.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'no-store' }); res.end(data);
  } catch { res.writeHead(404); res.end(); }
});

await new Promise(resolve => server.listen(8941, resolve));
const browser = await chromium.launch({ args: ['--use-gl=angle', '--enable-webgl', '--ignore-gpu-blocklist'] });
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2, userAgent: 'Mozilla/5.0 (Linux; Android 16) AppleWebKit/537.36 Chrome/140 Mobile Safari/537.36' });
const page = await context.newPage();
page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
page.on('pageerror', error => errors.push(`PAGEERROR: ${error.message}`));

try {
  await page.goto('http://localhost:8941/editor/index.html', { waitUntil: 'load' });
  await page.waitForFunction(() => document.getElementById('engine-frame')?.contentWindow?.SHADED, { timeout: 15000 });

  const idle = await page.evaluate(() => ({ inspector: document.body.classList.contains('inspector-open'), active: document.querySelectorAll('.rail-btn.active').length, directViewportCss: [...document.styleSheets].some(sheet => sheet.href?.includes('viewport-first.css')), timeline: !!document.getElementById('timeline-dock'), storyButton: !!document.getElementById('tool-story') }));
  check('Startzustand hat keinen offenen Inspector', !idle.inspector);
  check('Timeline-DOM ist vollständig entfernt', !idle.timeline);
  check('Story-Werkzeug ist vollständig entfernt', !idle.storyButton);
  check('Startzustand hat kein scheinbar aktives Werkzeug', idle.active === 0);
  check('Viewport-first CSS ist direkt geladen', idle.directViewportCss);

  const viewport = await page.locator('.viewport').boundingBox();
  check(`Viewport nutzt nahezu volle Breite (${viewport?.width}px)`, viewport && viewport.width >= 385);
  check(`Viewport nutzt nahezu volle Höhe (${viewport?.height}px)`, viewport && viewport.height >= 835);

  const sourceButton = page.locator('.rail-btn[data-target="panel-source"]');
  await sourceButton.waitFor({ state: 'visible', timeout: 60000 });
  await sourceButton.click({ timeout: 60000 });
  check('Quelle öffnet Inspector', await page.evaluate(() => document.body.classList.contains('inspector-open')));

  await sourceButton.waitFor({ state: 'visible', timeout: 60000 });
  await sourceButton.click({ timeout: 60000 });
  check('Zweiter Tap auf Quelle schließt Inspector vollständig', await page.evaluate(() => !document.body.classList.contains('inspector-open')));

  // Neuer Hauptpfad: Demo direkt im World Studio, ohne versteckten Legacy-Inspector.
  await page.click('#world-demo');
  await page.waitForFunction(() => window.SHADEDWorldStudio?.state?.().hasImage, { timeout: 10000 });
  check('World Studio lädt das Demo-Bild direkt', true);

  // Browser-Testserver hat keine lokale GPU-Bridge; der Flow muss deshalb ohne Dialog
  // in den Software-Fallback gehen und trotzdem eine räumliche Welt öffnen.
  await page.click('#world-generate');
  await page.waitForFunction(() => window.SHADEDWorldStudio?.state?.().worldReady, { timeout: 60000 });
  check('1-Bild-Workflow wird auch ohne GPU-Bridge fertig', true);
  check('RAUM landet im Lauf-Modus', await page.evaluate(() => document.getElementById('engine-frame')?.contentWindow?.SHADED?.spatial?.viewer?.state?.()?.mode === 'walk'));

  const roomState = await page.evaluate(() => {
    const win = document.getElementById('engine-frame').contentWindow;
    const mesh = win.SHADED.spatial.voxel.mesh();
    return { triangles: mesh.indices.length / 3, camera: win.SHADED.spatial.viewer.state().camera };
  });
  check(`RAUM hat Dreiecksgeometrie (${roomState.triangles} Dreiecke)`, roomState.triangles > 10);

  // Korrekturfläche bleibt weiterhin ein echtes Werkzeug.
  const paintButton = page.locator('.rail-btn[data-target="panel-paint"]');
  await paintButton.waitFor({ state: 'visible', timeout: 60000 });
  await paintButton.click({ timeout: 60000 });
  await page.waitForTimeout(120);
  const correctionBefore = await page.evaluate(() => {
    const canvas = document.getElementById('paint-canvas'), ctx = canvas.getContext('2d'), x = Math.floor(canvas.width * .45), y = Math.floor(canvas.height * .45);
    return { width: canvas.width, height: canvas.height, pixel: [...ctx.getImageData(x, y, 1, 1).data] };
  });
  check('Korrekturfläche wird aus der Live-Szene befüllt', correctionBefore.width > 1 && correctionBefore.height > 1 && correctionBefore.pixel[3] > 0);
} catch (error) {
  check(`Unerwarteter Fehler: ${error.message}`, false);
}

const relevantErrors = errors.filter(error => !/404/.test(error) && !/favicon/i.test(error));
check('Keine relevanten Browserfehler', relevantErrors.length === 0);
if (relevantErrors.length) console.log(relevantErrors.join('\n'));

await browser.close();
await new Promise(resolve => server.close(resolve));
console.log(failed ? '\n❌ verify-editor-mobile FAILED' : '\n✅ verify-editor-mobile PASSED');
process.exit(failed ? 1 : 0);
