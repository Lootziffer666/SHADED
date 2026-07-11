// SHADED Editor – visuelle + funktionale Verifikation (headless). Nutzung:
//   npm i playwright        (einmalig, außerhalb des Repos oder mit .gitignore)
//   node tools/verify-editor.js
// Screenshots landen in tools/verify-out/. Exit != 0 bei FAIL oder Konsolenfehlern.
// Eigener Chromium-Pfad: env CHROMIUM=/pfad/zu/chromium node tools/verify-editor.js
const { chromium } = require('playwright');
const http = require('http');
const fs = require('fs');
const path = require('path');

const REPO = path.join(__dirname, '..');
const OUT = path.join(__dirname, 'verify-out');
fs.mkdirSync(OUT, { recursive: true });

const server = http.createServer((req, res) => {
  const urlPath = decodeURIComponent(req.url.split('?')[0]);
  const rel = urlPath === '/' ? 'index.html' : urlPath.replace(/^\//, '');
  const p = path.join(REPO, rel);
  try {
    const data = fs.readFileSync(p);
    const type = p.endsWith('.html') ? 'text/html'
      : p.endsWith('.js') ? 'text/javascript'
      : p.endsWith('.css') ? 'text/css'
      : p.endsWith('.json') ? 'application/json'
      : 'image/png';
    res.writeHead(200, { 'Content-Type': type });
    res.end(data);
  } catch (e) {
    res.writeHead(404);
    res.end();
  }
});

let failed = false;
function check(label, cond) {
  console.log(`${cond ? 'PASS' : 'FAIL'} — ${label}`);
  if (!cond) failed = true;
}

(async () => {
  await new Promise((r) => server.listen(8932, r));
  const launchOpts = { args: ['--use-gl=angle', '--enable-webgl', '--ignore-gpu-blocklist'] };
  if (process.env.CHROMIUM) launchOpts.executablePath = process.env.CHROMIUM;
  else if (fs.existsSync('/opt/pw-browsers/chromium')) launchOpts.executablePath = '/opt/pw-browsers/chromium';
  const browser = await chromium.launch(launchOpts);
  const page = await browser.newPage({ viewport: { width: 1500, height: 950 } });
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));

  try {
    await page.goto('http://localhost:8932/editor/index.html', { waitUntil: 'load' });

    // --- Demo laden -> Erstellen -> Engine wird ready ---
    await page.click('#btn-demo');
    await page.waitForTimeout(600); // fetch der Demo-Bilder in das iframe
    await page.click('#btn-erstellen');
    await page.waitForFunction(
      () => {
        const f = document.getElementById('engine-frame');
        return !!(f.contentWindow && f.contentWindow.SHADED && f.contentWindow.SHADED.isReady());
      },
      { timeout: 20000 },
    );
    check('Engine über iframe erreichbar und ready', true);

    await page.screenshot({ path: path.join(OUT, 'editor_ready.png') });

    // --- Parameter-Slider live gegen die Engine ---
    const before = await page.evaluate(() => document.getElementById('engine-frame').contentWindow.SHADED.getParams().storm);
    await page.fill('#p-storm', '0.9');
    await page.dispatchEvent('#p-storm', 'input');
    await page.waitForTimeout(50);
    const after = await page.evaluate(() => document.getElementById('engine-frame').contentWindow.SHADED.getParams().storm);
    check(`Slider ändert Engine-Parameter live (storm ${before} -> ${after})`, Math.abs(after - 0.9) < 1e-6);

    // --- Marker-/Palette-Overlay: Bild laden, malen, Diff prüfen ---
    const sceneImgPath = path.join(REPO, 'file_00000000974871f49fe71f6b456f9579.png');
    await page.setInputFiles('#f-paint-source', sceneImgPath);
    // Canvas-Decode konkurriert mit der WebGL-Szene um GPU/CPU — auf die echte
    // Größenänderung warten statt eine feste (unter Last zu kurze) Pause.
    await page.waitForFunction(() => document.getElementById('paint-canvas').width !== 640, { timeout: 10000 });

    // Das obere Panel (Vorschau + 15 Parameter-Slider) macht die Seite sehr lang;
    // boundingBox() ist sonst relativ zu einer Scroll-Position, an der der Canvas
    // außerhalb des Viewports liegt (Klicks würden ins Leere gehen).
    await page.locator('#paint-canvas').scrollIntoViewIfNeeded();
    const canvasBox = await page.locator('#paint-canvas').boundingBox();
    // Auf "Fenster-Marker" (Standard-aktiver Pinsel) malen
    await page.mouse.move(canvasBox.x + canvasBox.width * 0.3, canvasBox.y + canvasBox.height * 0.3);
    await page.mouse.down();
    await page.mouse.move(canvasBox.x + canvasBox.width * 0.35, canvasBox.y + canvasBox.height * 0.35, { steps: 5 });
    await page.mouse.up();

    // app.js kapselt seinen Zustand bewusst in ES-Modulen (keine globalen Leaks) —
    // der sichtbare Effekt wird daher über Pixel-Sampling des Canvas geprüft.
    const paintedPixel = await page.evaluate(() => {
      const c = document.getElementById('paint-canvas');
      const ctx = c.getContext('2d');
      const x = Math.floor(c.width * 0.3);
      const y = Math.floor(c.height * 0.3);
      const [r, g, b] = ctx.getImageData(x, y, 1, 1).data;
      return { r, g, b };
    });
    // Pink-Marker-Standardfarbe #FF33CC = rgb(255,51,204)
    check(
      `Paint-Werkzeug malt echte Pixel (Fenster-Marker-Pink erwartet, gefunden rgb(${paintedPixel.r},${paintedPixel.g},${paintedPixel.b}))`,
      paintedPixel.r > 200 && paintedPixel.g < 100 && paintedPixel.b > 150,
    );

    await page.screenshot({ path: path.join(OUT, 'editor_paint.png') });

    // --- Als Zweitbild anwenden -> Engine bekommt echtes Marker-Overlay ---
    await page.click('#btn-paint-apply');
    await page.waitForTimeout(300);
    await page.click('#btn-erstellen');
    await page.waitForFunction(
      () => document.getElementById('engine-frame').contentWindow.SHADED.isReady(),
      { timeout: 20000 },
    );
    check('Gemaltes Overlay als Zweitbild übernommen, Engine erstellt erneut ohne Absturz', true);
    await page.screenshot({ path: path.join(OUT, 'editor_after_overlay.png') });

    // --- Actor-Platzierung: echtes Test-Actor-Fixture aus tools/, wie verify-actors.js ---
    const actorSheet = path.join(__dirname, 'verify-test-actor.png');
    const actorManifest = path.join(__dirname, 'verify-test-actor.json');
    await page.setInputFiles('#f-actor-sheet', actorSheet);
    await page.setInputFiles('#f-actor-manifest', actorManifest);
    await page.click('#btn-actor-add');
    await page.waitForTimeout(300);
    const markerCount = await page.locator('#actor-overlay .actor-marker').count();
    const actorRowCount = await page.locator('#actor-list .actor-row').count();
    check(`Actor hinzugefügt: Marker in Vorschau (${markerCount}) und Zeile in Liste (${actorRowCount})`, markerCount === 1 && actorRowCount === 1);

    // Marker per Drag verschieben und prüfen, dass sich die Position wirklich ändert.
    // Scrollen auf 0,0: das Klicken weiter unten liegender Buttons kann den Marker
    // (oben in der Vorschau) aus dem Viewport heraus verschoben haben.
    await page.evaluate(() => window.scrollTo(0, 0));
    const markerBoxBefore = await page.locator('.actor-marker').boundingBox();
    const overlayBox = await page.locator('#actor-overlay').boundingBox();
    await page.mouse.move(markerBoxBefore.x + markerBoxBefore.width / 2, markerBoxBefore.y + markerBoxBefore.height / 2);
    await page.mouse.down();
    await page.mouse.move(overlayBox.x + overlayBox.width * 0.2, overlayBox.y + overlayBox.height * 0.2, { steps: 5 });
    await page.mouse.up();
    const markerBoxAfter = await page.locator('.actor-marker').boundingBox();
    check(
      `Actor-Marker per Drag verschoben (x ${markerBoxBefore.x.toFixed(0)} -> ${markerBoxAfter.x.toFixed(0)})`,
      Math.abs(markerBoxAfter.x - markerBoxBefore.x) > 20,
    );
    await page.screenshot({ path: path.join(OUT, 'editor_actor.png') });

    // --- Story/Akt-Timeline: Schritt hinzufügen, bearbeiten, Vorschau, Play/Stop ---
    const stepsBefore = await page.locator('#timeline .timeline-step').count();
    await page.click('#btn-timeline-add');
    await page.waitForTimeout(100);
    const stepsAfter = await page.locator('#timeline .timeline-step').count();
    check(`Timeline-Schritt hinzugefügt (${stepsBefore} -> ${stepsAfter})`, stepsAfter === stepsBefore + 1);

    const lastStepDurInput = page.locator('#timeline .timeline-step input[type=number]').last();
    await lastStepDurInput.fill('7');
    await lastStepDurInput.dispatchEvent('change');
    const engineStepCount = await page.evaluate(() => document.getElementById('engine-frame').contentWindow.SHADED.story.board().length);
    const lastStepDur = await page.evaluate(() => {
      const board = document.getElementById('engine-frame').contentWindow.SHADED.story.board();
      return board[board.length - 1].dur;
    });
    check(`Timeline schreibt direkt in window.SHADED.story.board() (Länge ${engineStepCount}, letzte Dauer ${lastStepDur})`, lastStepDur === 7);

    const lastPreviewBtn = page.locator('#timeline .timeline-step').last().locator('button', { hasText: '👁' });
    await lastPreviewBtn.click();
    await page.waitForTimeout(50);
    check('Timeline-Vorschau-Button lässt sich klicken ohne Fehler', true);

    await page.click('#btn-timeline-play');
    await page.waitForTimeout(200);
    await page.click('#btn-timeline-stop');
    check('Play/Stop der Timeline ohne Absturz', true);
    await page.screenshot({ path: path.join(OUT, 'editor_timeline.png') });
  } catch (e) {
    check(`Unerwarteter Fehler: ${e.message}`, false);
  }

  check('Keine Konsolen-/Seitenfehler', errors.length === 0);
  if (errors.length) console.log('Fehler:', errors);

  await browser.close();
  await new Promise((r) => server.close(r));
  console.log(failed ? '\n❌ verify-editor FAILED' : '\n✅ verify-editor PASSED');
  process.exit(failed ? 1 : 0);
})();
