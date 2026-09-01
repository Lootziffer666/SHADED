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
const CI_SCENE_PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAADAAAAAgCAIAAADbtmxLAAAAoklEQVR4nGOsmLaFYTABpoF2ADoYdRAhMOogQmDQOYiFFobeuHGDeMUaGhrI3EEXQoPOQTijzObNMuJNOSISRQ3HMDAMwhAadRAhMOogQgAll705MgnB0RAh3hQUjQwMDCJuJOkVscmDcwddCI06iBAYdRAhMOogQmDQOQhn82PDjTf0dAcc0KQJK/JmF9l6B12UjTqIEBh0DkJJ1MjNgIECAPPWFRTYINHRAAAAAElFTkSuQmCC', 'base64');

const server = http.createServer((req, res) => {
  const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  const rel = pathname === '/' ? 'index.html' : pathname.replace(/^\//, '');
  const file = path.join(REPO, rel);
  try {
    const data = fs.readFileSync(file);
    const type = file.endsWith('.html') ? 'text/html' : file.endsWith('.js') || file.endsWith('.mjs') ? 'text/javascript' : file.endsWith('.css') ? 'text/css' : file.endsWith('.json') || file.endsWith('.webmanifest') ? 'application/json' : file.endsWith('.svg') ? 'image/svg+xml' : 'image/png';
    res.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'no-store' }); res.end(data);
  } catch { res.writeHead(404); res.end(); }
});

await new Promise(resolve => server.listen(8941, resolve));
const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--enable-webgl', '--ignore-gpu-blocklist', '--no-sandbox', '--disable-dev-shm-usage'] });
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2, userAgent: 'Mozilla/5.0 (Linux; Android 16) AppleWebKit/537.36 Chrome/140 Mobile Safari/537.36' });
const page = await context.newPage();
page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
page.on('pageerror', error => errors.push(`PAGEERROR: ${error.message}`));

try {
  await page.goto('http://localhost:8941/index.html', { waitUntil: 'load' });
  await page.waitForFunction(() => !!window.SHADED, undefined, { timeout: 15000 });

  const idle = await page.evaluate(() => ({
    inspector: document.body.classList.contains('inspector-open'),
    active: document.querySelectorAll('.rail-btn.active').length,
    directViewportCss: [...document.styleSheets].some(sheet => sheet.href?.includes('viewport-first.css')),
    workspaceToolbar: !!document.getElementById('workspace-view-toolbar'),
    bottomDock: !!document.getElementById('workspace-bottom-dock'),
    reconstruct: !!document.getElementById('panel-reconstruct'),
    worldStudioHidden: getComputedStyle(document.getElementById('world-studio')).display === 'none',
  }));
  check('Startzustand hat keinen offenen Inspector', !idle.inspector);
  check('Startzustand hat kein scheinbar aktives Werkzeug', idle.active === 0);
  check('Viewport-first CSS ist direkt geladen', idle.directViewportCss);
  check('Workspace-Toolbar ist vorhanden', idle.workspaceToolbar);
  check('Reconstruct-Workspace ist vorhanden', idle.reconstruct);
  check('Altes World-Studio-Overlay ist visuell ersetzt', idle.worldStudioHidden);
  check('Desktop-Bottom-Dock bleibt auf Mobile bewusst verborgen', idle.bottomDock && await page.locator('#workspace-bottom-dock').isHidden());

  const viewport = await page.locator('.viewport').boundingBox();
  check(`Viewport nutzt volle Breite (${viewport?.width}px)`, viewport && viewport.width >= 385);
  check(`Viewport lässt nur die mobile Workspace-Rail frei (${viewport?.height}px)`, viewport && viewport.height >= 740);

  // New mobile shell exposes workspaces directly; no ERWEITERT gate.
  const sourceButton = page.locator('.rail-btn[data-target="panel-source"]');
  await sourceButton.waitFor({ state: 'visible', timeout: 10000 });
  check('Workspace-Rail ist direkt erreichbar', true);
  await sourceButton.click({ timeout: 10000 });
  check('Quelle öffnet Inspector', await page.evaluate(() => document.body.classList.contains('inspector-open')));
  await sourceButton.click({ timeout: 10000 });
  check('Zweiter Tap auf Quelle schließt Inspector vollständig', await page.evaluate(() => !document.body.classList.contains('inspector-open')));

  // Hidden compatibility bridge still owns import/generation runtime.
  await page.evaluate(() => { document.getElementById('world-demo')?.click(); });
  await page.waitForFunction(() => window.SHADEDWorldStudio?.state?.().hasImage, undefined, { timeout: 10000 });
  check('Demo bleibt über die Runtime-Bridge verdrahtet', true);

  await page.locator('#world-file').setInputFiles({ name: 'ci-spatial-fixture.png', mimeType: 'image/png', buffer: CI_SCENE_PNG });
  await page.waitForFunction(() => document.getElementById('world-file-title')?.textContent === 'ci-spatial-fixture.png', undefined, { timeout: 10000 });
  check('Kleines CI-Bild übernimmt denselben 1-Bild-Workflow', true);

  await page.evaluate(() => { document.getElementById('world-generate')?.click(); });
  await page.waitForFunction(() => window.SHADEDWorldStudio?.state?.().worldReady, undefined, { timeout: 60000 });
  check('1-Bild-Workflow wird auch ohne GPU-Bridge fertig', true);
  check('RAUM landet im Lauf-Modus', await page.evaluate(() => window.SHADED?.spatial?.viewer?.state?.()?.mode === 'walk'));

  const roomState = await page.evaluate(() => {
    const mesh = window.SHADED.spatial.voxel.mesh();
    return { triangles: mesh.indices.length / 3, camera: window.SHADED.spatial.viewer.state().camera };
  });
  check(`RAUM hat Dreiecksgeometrie (${roomState.triangles} Dreiecke)`, roomState.triangles > 10);

  // Paint workspace remains directly reachable from the horizontal rail.
  if (!document.getElementById('spatial-viewer')?.hidden) await page.evaluate(() => document.getElementById('spatial-close')?.click());
  const paintButton = page.locator('.rail-btn[data-target="panel-paint"]');
  await paintButton.waitFor({ state: 'visible', timeout: 10000 });
  await paintButton.click({ timeout: 10000 });
  await page.waitForTimeout(120);
  const correctionBefore = await page.evaluate(() => {
    const canvas = document.getElementById('paint-canvas'), ctx = canvas.getContext('2d'), x = Math.floor(canvas.width * .45), y = Math.floor(canvas.height * .45);
    return { width: canvas.width, height: canvas.height, pixel: [...ctx.getImageData(x, y, 1, 1).data] };
  });
  check('Korrekturfläche wird aus der Live-Szene befüllt', correctionBefore.width > 1 && correctionBefore.height > 1 && correctionBefore.pixel[3] > 0);
} catch (error) {
  const diagnostic = await page.evaluate(() => ({
    world: window.SHADEDWorldStudio?.state?.() || null,
    status: document.getElementById('world-status')?.textContent || '',
    inspector: document.body.classList.contains('inspector-open'),
  })).catch(() => null);
  check(`Unerwarteter Fehler: ${error.message}${diagnostic ? ` | ${JSON.stringify(diagnostic)}` : ''}`, false);
}

const relevantErrors = errors.filter(error => !/404/.test(error) && !/favicon/i.test(error));
check('Keine relevanten Browserfehler', relevantErrors.length === 0);
if (relevantErrors.length) console.log(relevantErrors.join('\n'));

await browser.close();
await new Promise(resolve => server.close(resolve));
console.log(failed ? '\n❌ verify-editor-mobile FAILED' : '\n✅ verify-editor-mobile PASSED');
process.exit(failed ? 1 : 0);
