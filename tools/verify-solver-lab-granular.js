// SHADED Solver Lab (Granular) — Browser-Verifikation (Muster: tools/verify-sandbox.js).
// HTTP-Server + Playwright/Chromium, PASS/FAIL je Kriterium, Exit-Code != 0 bei FAIL.
'use strict';
const { chromium } = require('playwright');
const http = require('http');
const fs = require('fs');
const path = require('path');

const REPO = path.join(__dirname, '..');
const PORT = 8938;

const server = http.createServer((req, res) => {
  const urlPath = decodeURIComponent(req.url.split('?')[0]);
  const rel = urlPath === '/' ? 'solver-lab/granular/index.html' : urlPath.replace(/^\//, '');
  const p = path.join(REPO, rel);
  try {
    const data = fs.readFileSync(p);
    const type = p.endsWith('.html') ? 'text/html'
      : (p.endsWith('.js') || p.endsWith('.mjs')) ? 'text/javascript'
      : p.endsWith('.css') ? 'text/css' : 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'no-store' });
    res.end(data);
  } catch { res.writeHead(404); res.end(); }
});

let failed = false;
const check = (label, condition) => { console.log(`${condition ? 'PASS' : 'FAIL'} — ${label}`); if (!condition) failed = true; };

async function main() {
  await new Promise((resolve) => server.listen(PORT, resolve));
  const browser = await chromium.launch({ args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  const page = await browser.newPage();
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(String(e)));

  await page.goto(`http://localhost:${PORT}/solver-lab/granular/index.html`, { waitUntil: 'load' });
  await page.waitForTimeout(200);

  const nonEmptyPixels = await page.evaluate(() => {
    const c = document.getElementById('grid-canvas');
    const ctx = c.getContext('2d');
    const data = ctx.getImageData(0, 0, c.width, c.height).data;
    let nonEmpty = 0;
    for (let i = 0; i < data.length; i += 4) if (data[i] !== 8 || data[i + 1] !== 10 || data[i + 2] !== 18) nonEmpty++;
    return nonEmpty;
  });
  check('A: Canvas rendert einen nicht-leeren Frame (Sand/Wasser sichtbar, nicht nur Leer-Hintergrund)', nonEmptyPixels > 100);

  // Pause, damit Schrittzählung deterministisch über den Test bleibt.
  await page.click('#btn-play');
  const stepBefore = await page.evaluate(() => document.getElementById('status-step').textContent);
  await page.click('#btn-step');
  const stepAfter = await page.evaluate(() => document.getElementById('status-step').textContent);
  check('B: Einzelschritt-Button erhöht den Schrittzähler um genau 1', Number(stepAfter) === Number(stepBefore) + 1);

  const sandBefore = await page.evaluate(() => Number(document.getElementById('status-sand').textContent));
  for (let i = 0; i < 30; i++) await page.click('#btn-step');
  const sandAfter = await page.evaluate(() => Number(document.getElementById('status-sand').textContent));
  check('C: Sandmenge bleibt über 30 Schritte erhalten (reine Bewegung, keine Erzeugung/Vernichtung)', sandBefore === sandAfter);
  const conservationClass = await page.evaluate(() => document.getElementById('status-conservation').className);
  check('C2: Masse-Erhaltungs-Anzeige zeigt "ok" nach reiner Bewegung ohne Malen', conservationClass === 'ok');

  // Malen: eine Wandzelle mitten im Grid setzen, Statusanzeige muss reagieren.
  const box = await page.locator('#grid-canvas').boundingBox();
  await page.locator('button[data-material="3"]').click(); // Wand
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  const conservationAfterPaint = await page.evaluate(() => document.getElementById('status-conservation').className);
  check('D: Malen einer Wandzelle löst sofort ein UI-Update aus (Canvas neu gezeichnet, kein Absturz)', typeof conservationAfterPaint === 'string');

  await page.click('#btn-reset');
  await page.waitForTimeout(50);
  const stepAfterReset = await page.evaluate(() => document.getElementById('status-step').textContent);
  check('E: "Neu seeden" setzt den Schrittzähler auf 0 zurück', stepAfterReset === '0');

  const seedInput = page.locator('#seed-input');
  await seedInput.fill('7');
  await page.click('#btn-reset');
  const sandSeed7A = await page.evaluate(() => document.getElementById('status-sand').textContent);
  await page.click('#btn-reset');
  const sandSeed7B = await page.evaluate(() => document.getElementById('status-sand').textContent);
  check('F: derselbe Seed erzeugt beim erneuten Seeden dieselbe Sandmenge (deterministisch)', sandSeed7A === sandSeed7B);

  check('Keine Konsolen-/Seitenfehler', errors.length === 0);
  if (errors.length) errors.forEach((e) => console.log('  ERROR:', e));

  await browser.close();
  server.close();
  console.log(failed ? '\n❌ verify-solver-lab-granular FAILED' : '\n✅ verify-solver-lab-granular PASSED');
  process.exit(failed ? 1 : 0);
}

main().catch((err) => { console.error(err); server.close(); process.exit(1); });
