// SHADED Solver Lab (Erosion × Granular gekoppelt) — Browser-Verifikation.
// Muster: tools/verify-solver-lab-erosion.js.
'use strict';
const { chromium } = require('playwright');
const http = require('http');
const fs = require('fs');
const path = require('path');

const REPO = path.join(__dirname, '..');
const PORT = 8944;

const server = http.createServer((req, res) => {
  const urlPath = decodeURIComponent(req.url.split('?')[0]);
  const rel = urlPath === '/' ? 'solver-lab/coupled/index.html' : urlPath.replace(/^\//, '');
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

  await page.goto(`http://localhost:${PORT}/solver-lab/coupled/index.html`, { waitUntil: 'load' });
  await page.waitForTimeout(200);

  const wallPixelsBefore = await page.evaluate(() => {
    const c = document.getElementById('grid-canvas');
    const data = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
    let wallish = 0;
    for (let i = 0; i < data.length; i += 4) if (data[i] > 40 && data[i] < 80 && data[i + 1] > 40 && data[i + 1] < 80) wallish++;
    return wallish;
  });
  check('A: Granular-Canvas zeigt bereits vor jeder Erosion eine Bodenkontur (WALL-Farbe vorhanden)', wallPixelsBefore > 50);

  const sandBefore = await page.evaluate(() => window.__coupledLab.countSand());
  check('B: kein Sand vor dem ersten Erosionslauf (frisch geseedetes Terrain, noch nichts abgetragen)', sandBefore === 0);

  await page.evaluate(() => window.__coupledLab.erodeAndTransfer(500));
  const sandAfterOne = await page.evaluate(() => window.__coupledLab.countSand());
  check('C: erster Erosionslauf erzeugt tatsächlich Sediment im Granular-Grid', sandAfterOne > 0);

  await page.evaluate(() => window.__coupledLab.erodeAndTransfer(500));
  const sandAfterTwo = await page.evaluate(() => window.__coupledLab.countSand());
  check('D: zweiter Lauf fügt weiteres Sediment hinzu, statt das erste zu ersetzen', sandAfterTwo > sandAfterOne);

  const runsShown = await page.evaluate(() => document.getElementById('status-runs').textContent);
  const dropletsShown = await page.evaluate(() => document.getElementById('status-droplets').textContent);
  check('E: Statusanzeige zählt Läufe korrekt (2)', runsShown === '2');
  check('E2: Statusanzeige zählt Tropfen korrekt (1000)', dropletsShown === '1000');

  const sandBeforeSteps = sandAfterTwo;
  for (let i = 0; i < 40; i++) await page.evaluate(() => window.__coupledLab.step());
  const sandAfterSteps = await page.evaluate(() => window.__coupledLab.countSand());
  check('F: gespawnter Sand bleibt unter der Granular-Schwerkraft erhalten (kein Verschwinden/Duplizieren)', sandAfterSteps === sandBeforeSteps);

  await page.locator('#seed-input').fill('12');
  await page.click('#btn-reset');
  await page.waitForTimeout(50);
  const sandAfterReset = await page.evaluate(() => window.__coupledLab.countSand());
  check('G: "Neu seeden" setzt das übernommene Sediment zurück auf 0', sandAfterReset === 0);

  check('Keine Konsolen-/Seitenfehler', errors.length === 0);
  if (errors.length) errors.forEach((e) => console.log('  ERROR:', e));

  await browser.close();
  server.close();
  console.log(failed ? '\n❌ verify-solver-lab-coupled FAILED' : '\n✅ verify-solver-lab-coupled PASSED');
  process.exit(failed ? 1 : 0);
}

main().catch((err) => { console.error(err); server.close(); process.exit(1); });
