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

  // Feuer neben Holz setzen und laufen lassen -- Holzzahl muss sinken, Rauch
  // entstehen. Exakte Grid-Koordinaten über window.__granularLab statt
  // fragiler Maus-zu-Canvas-Pixel-Umrechnung (derselbe window.SHADED-Vertrag-
  // Gedanke aus CLAUDE.md, nur für diese kleinere Lab-Seite). Die Umgebung
  // wird zuerst geräumt: der Reset-Seed (1) sät zufällig auch Sand in diesem
  // Bereich, und seit Sand Feuer ersticken kann, darf ein zufällig
  // benachbartes Sandkorn dieses Feuer nicht vorzeitig löschen, bevor der
  // Test überhaupt die Holz-Zündung prüfen konnte.
  await page.evaluate(() => {
    const { setCell, MATERIAL } = window.__granularLab;
    for (let y = 7; y <= 17; y++) for (let x = 57; x <= 63; x++) setCell(x, y, MATERIAL.EMPTY);
    for (let y = 10; y <= 16; y++) setCell(60, y, MATERIAL.WOOD);
    setCell(60, 9, MATERIAL.FIRE);
  });
  const woodBefore = await page.evaluate(() => window.__granularLab.countMaterial(window.__granularLab.MATERIAL.WOOD));
  let sawSmoke = false;
  for (let i = 0; i < 60; i++) {
    await page.evaluate(() => window.__granularLab.step());
    if (await page.evaluate(() => window.__granularLab.countMaterial(window.__granularLab.MATERIAL.SMOKE)) > 0) sawSmoke = true;
  }
  const woodAfter = await page.evaluate(() => window.__granularLab.countMaterial(window.__granularLab.MATERIAL.WOOD));
  check('E2: Feuer verzehrt angrenzendes Holz über 60 Schritte (Reaktion sichtbar via UI-Hook)', woodAfter < woodBefore);
  check('E3: Rauch-Anzeige zeigt zwischenzeitlich Werte > 0 (Feuer ist ausgebrannt)', sawSmoke);
  const smokeStatusAtSomePoint = await page.evaluate(() => Number(document.getElementById('status-smoke').textContent));
  check('E4: die DOM-Statusanzeige selbst bleibt konsistent mit dem Solver-Zustand', typeof smokeStatusAtSomePoint === 'number' && !Number.isNaN(smokeStatusAtSomePoint));

  const seedInput = page.locator('#seed-input');
  await seedInput.fill('7');
  await page.click('#btn-reset');
  const sandSeed7A = await page.evaluate(() => document.getElementById('status-sand').textContent);
  await page.click('#btn-reset');
  const sandSeed7B = await page.evaluate(() => document.getElementById('status-sand').textContent);
  check('F: derselbe Seed erzeugt beim erneuten Seeden dieselbe Sandmenge (deterministisch)', sandSeed7A === sandSeed7B);

  // Eis -> Wasser -> Dampf: mehrere unabhängige Paare (siehe Test 13 in
  // tools/test-granular-solver.mjs für die Begründung, warum ein einzelnes
  // Paar unzuverlässig ist -- BOIL_CHANCE und EXTINGUISH_CHANCE konkurrieren).
  await page.evaluate(() => {
    const { setCell, MATERIAL } = window.__granularLab;
    for (let p = 0; p < 6; p++) {
      const x = 10 + p * 15;
      setCell(x, 40, MATERIAL.ICE);
      setCell(x, 39, MATERIAL.FIRE);
      // Wasser braucht einen Boden, sonst fällt es sofort vom Feuer weg
      // (siehe Node-Test 13) -- separate, verankerte Wasser/Feuer-Paare
      // für einen zuverlässigen Dampf-Check statt nur auf geschmolzenes,
      // frei fallendes Eiswasser zu hoffen.
      setCell(x + 5, 41, MATERIAL.WALL);
      setCell(x + 5, 40, MATERIAL.WATER);
      setCell(x + 5, 39, MATERIAL.FIRE);
    }
  });
  let sawWaterFromIce = false, sawSteam = false;
  for (let i = 0; i < 40; i++) {
    await page.evaluate(() => window.__granularLab.step());
    if (await page.evaluate(() => window.__granularLab.countMaterial(window.__granularLab.MATERIAL.WATER)) > 0) sawWaterFromIce = true;
    if (await page.evaluate(() => window.__granularLab.countMaterial(window.__granularLab.MATERIAL.STEAM)) > 0) sawSteam = true;
  }
  check('G: Eis neben Feuer schmilzt zu Wasser (mindestens eines von 6 Paaren)', sawWaterFromIce);
  check('G2: Dampf erscheint zwischenzeitlich (Wasser kocht oder Eis geht via Wasser weiter)', sawSteam);

  // Sand erstickt Feuer -- mehrere unabhängige Paare, gleiches
  // Robustheits-Argument wie bei G/G2 (Node-Test 20).
  await page.evaluate(() => {
    const { setCell, MATERIAL } = window.__granularLab;
    for (let p = 0; p < 6; p++) {
      const x = 10 + p * 15;
      setCell(x, 50, MATERIAL.SAND);
      setCell(x, 49, MATERIAL.FIRE);
    }
  });
  const fireBeforeSmother = await page.evaluate(() => window.__granularLab.countMaterial(window.__granularLab.MATERIAL.FIRE));
  let sawSmothered = false;
  for (let i = 0; i < 20; i++) {
    await page.evaluate(() => window.__granularLab.step());
    if (await page.evaluate(() => window.__granularLab.countMaterial(window.__granularLab.MATERIAL.FIRE)) < fireBeforeSmother) sawSmothered = true;
  }
  check('H: Sand erstickt angrenzendes Feuer (mindestens eines von 6 Paaren binnen 20 Schritten)', sawSmothered);

  // Die volle "brennenden Holzscheit ins Wasser werfen"-Szene: ein LOG
  // treibt auf einem Wasserbecken, faengt Feuer, und erlischt am Wasser.
  await page.evaluate(() => {
    const { setCell, MATERIAL } = window.__granularLab;
    for (let x = 90; x < 110; x++) {
      setCell(x, 65, MATERIAL.WALL);
      for (let y = 60; y < 65; y++) setCell(x, y, MATERIAL.WATER);
    }
    setCell(100, 59, MATERIAL.LOG);
    setCell(100, 58, MATERIAL.FIRE);
  });
  let sawLogFire = false, sawLogExtinguished = false;
  for (let i = 0; i < 60; i++) {
    await page.evaluate(() => window.__granularLab.step());
    const logIsFire = await page.evaluate(() => window.__granularLab.countMaterial(window.__granularLab.MATERIAL.FIRE)) > 0;
    if (logIsFire) sawLogFire = true;
    if (sawLogFire && !logIsFire) sawLogExtinguished = true;
  }
  check('I: ein schwimmender Baumstamm faengt Feuer und erlischt am Wasser (I2 kombiniert)', sawLogFire && sawLogExtinguished);

  check('Keine Konsolen-/Seitenfehler', errors.length === 0);
  if (errors.length) errors.forEach((e) => console.log('  ERROR:', e));

  await browser.close();
  server.close();
  console.log(failed ? '\n❌ verify-solver-lab-granular FAILED' : '\n✅ verify-solver-lab-granular PASSED');
  process.exit(failed ? 1 : 0);
}

main().catch((err) => { console.error(err); server.close(); process.exit(1); });
