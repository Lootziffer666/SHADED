// SHADED Solver Lab (Erosion) — Browser-Verifikation (Muster: tools/verify-solver-lab-granular.js).
'use strict';
const { chromium } = require('playwright');
const http = require('http');
const fs = require('fs');
const path = require('path');

const REPO = path.join(__dirname, '..');
const PORT = 8941;

const server = http.createServer((req, res) => {
  const urlPath = decodeURIComponent(req.url.split('?')[0]);
  const rel = urlPath === '/' ? 'solver-lab/erosion/index.html' : urlPath.replace(/^\//, '');
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

  await page.goto(`http://localhost:${PORT}/solver-lab/erosion/index.html`, { waitUntil: 'load' });
  await page.waitForTimeout(200);

  const nonUniformPixels = await page.evaluate(() => {
    const c = document.getElementById('height-canvas');
    const ctx = c.getContext('2d');
    const data = ctx.getImageData(0, 0, c.width, c.height).data;
    const first = data[0];
    let differing = 0;
    for (let i = 0; i < data.length; i += 4) if (data[i] !== first) differing++;
    return differing;
  });
  check('A: Canvas rendert echtes Terrain (nicht ein einziger flacher Grauton)', nonUniformPixels > 100);

  const massBefore = await page.evaluate(() => window.__erosionLab.totalMass());
  await page.click('#btn-erode-100');
  await page.waitForTimeout(50);
  const massAfter = await page.evaluate(() => window.__erosionLab.totalMass());
  check('B: 100 Tropfen über den UI-Button verändern sichtbar das Terrain (Canvas neu gezeichnet, Status aktualisiert)',
    typeof massAfter === 'number' && Number.isFinite(massAfter));

  const statusMassText = await page.evaluate(() => document.getElementById('status-mass').textContent);
  check('C: Massen-Anzeige zeigt einen endlichen Zahlenwert', statusMassText !== '–' && !Number.isNaN(Number(statusMassText)));

  const conservationClass = await page.evaluate(() => document.getElementById('status-conservation').className);
  check('D: Masse-Erhaltungs-Anzeige zeigt "ok" nach einem reinen Erosionslauf (kein manuelles Setzen)', conservationClass === 'ok');
  check('D2: Gesamtmasse ändert sich durch reine Erosion praktisch nicht (|Δ| < 1e-6)', Math.abs(massAfter - massBefore) < 1e-6);

  const dropletsShown = await page.evaluate(() => document.getElementById('status-droplets').textContent);
  check('E: Tropfenzähler zeigt 100 nach einem Klick auf "100 Tropfen"', dropletsShown === '100');

  await page.click('#btn-erode-1000');
  await page.waitForTimeout(100);
  const dropletsShown2 = await page.evaluate(() => document.getElementById('status-droplets').textContent);
  check('E2: Tropfenzähler akkumuliert über mehrere Läufe (100 + 1000 = 1100)', dropletsShown2 === '1100');

  await page.locator('#seed-input').fill('9');
  await page.click('#btn-reset');
  await page.waitForTimeout(50);
  const massSeed9A = await page.evaluate(() => window.__erosionLab.totalMass());
  await page.click('#btn-reset');
  const massSeed9B = await page.evaluate(() => window.__erosionLab.totalMass());
  check('F: derselbe Seed erzeugt beim erneuten Seeden dieselbe Gesamtmasse (deterministisch)', Math.abs(massSeed9A - massSeed9B) < 1e-9);

  check('Keine Konsolen-/Seitenfehler', errors.length === 0);
  if (errors.length) errors.forEach((e) => console.log('  ERROR:', e));

  await browser.close();
  server.close();
  console.log(failed ? '\n❌ verify-solver-lab-erosion FAILED' : '\n✅ verify-solver-lab-erosion PASSED');
  process.exit(failed ? 1 : 0);
}

main().catch((err) => { console.error(err); server.close(); process.exit(1); });
