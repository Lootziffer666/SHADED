// SHADED First-Glimpse-Tiefenschicht Verifikation (Exp. 1, docs/first-glimpse-depth-layers.md).
// Prüft window.SHADED.depthLayerAt()/depthLayers(): eine grobe NEAR/MID/FAR/STRUCTURAL-
// Ordnung, DERIVED aus classGrid/zoneGrid/skyGrid — keine neue Klassifikation, keine
// zweite Material-Wahrheit (Invariante 2). Nutzung: node tools/verify-depth-layers.js
const { chromium } = require('playwright');
const http = require('http');
const fs = require('fs');
const path = require('path');

const REPO = path.join(__dirname, '..');
const BASE_IMG = path.join(REPO, 'file_00000000974871f49fe71f6b456f9579.png'); // kein Himmel im Bild
const SKY_IMG = path.join(REPO, 'file_00000000723471f48a11eaa8371edfb7.png');  // Kanon-Dorf MIT Himmel

const MIME = {'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.json':'application/json','.css':'text/css; charset=utf-8','.png':'image/png','.jpg':'image/jpeg'};
const server = http.createServer((req, res) => {
  const p = path.join(REPO, decodeURIComponent(req.url.split('?')[0]).replace(/^\//, '') || 'index.html');
  try {
    const data = fs.readFileSync(p === REPO + '/' ? path.join(REPO, 'index.html') : p);
    res.writeHead(200, { 'Content-Type': MIME[path.extname(p).toLowerCase()] || 'application/octet-stream' });
    res.end(data);
  } catch (e) { res.writeHead(404); res.end(); }
});

(async () => {
  await new Promise((r) => server.listen(8937, r));
  const launchOpts = { args: ['--use-gl=angle', '--enable-webgl', '--ignore-gpu-blocklist'] };
  if (process.env.CHROMIUM) launchOpts.executablePath = process.env.CHROMIUM;
  else if (fs.existsSync('/opt/pw-browsers/chromium')) launchOpts.executablePath = '/opt/pw-browsers/chromium';
  const browser = await chromium.launch(launchOpts);
  const page = await browser.newPage({ viewport: { width: 1500, height: 860 } });
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));

  console.log('=== SHADED First-Glimpse-Tiefenschicht Verifikation (Exp. 1) ===\n');
  let failed = false;
  function check(name, ok, detail) { console.log(`  ${ok ? '✓ PASS' : '✗ FAIL'}: ${name}${detail ? ' — ' + detail : ''}`); if (!ok) failed = true; }

  await page.goto('http://localhost:8937/index.html');
  await page.evaluate(() => { const el = document.getElementById('world-studio'); if (el) el.style.display = 'none'; });

  console.log('Test 1: Vor erstellen() liefert depthLayerAt() den sicheren Default');
  const beforeReady = await page.evaluate(() => ({
    layer: window.SHADED.depthLayerAt(0.5, 0.5),
    counts: window.SHADED.depthLayers(),
  }));
  check('depthLayerAt() == "unknown" ohne Szene', beforeReady.layer === 'unknown', beforeReady.layer);
  check('depthLayers() zählt nichts ohne Szene', Object.values(beforeReady.counts).every(v => v === 0), JSON.stringify(beforeReady.counts));

  console.log('\nTest 2: Szene OHNE Himmel im Bild (BASE_IMG) — near/mid/structural nicht-trivial, far == 0');
  await page.setInputFiles('#f-scene', BASE_IMG);
  await page.waitForFunction(() => /Szene geladen|Tiefenkarte geladen/.test(document.getElementById('status').textContent), { timeout: 30000 });
  await page.evaluate(() => window.SHADED.erstellen());
  await page.waitForFunction(() => window.SHADED.isReady(), { timeout: 30000 });
  const noSky = await page.evaluate(() => ({ counts: window.SHADED.depthLayers(), hasSkyRegion: window.SHADED.hasSkyRegion() }));
  console.log('  Layer-Verteilung:', JSON.stringify(noSky.counts));
  check('hasSkyRegion() == false (bestätigt: dieses Bild hat kein Himmel-Segment)', !noSky.hasSkyRegion);
  check('far == 0 (kein Himmel erkannt -> keine FAR-Pixel, korrekt)', noSky.counts.far === 0, noSky.counts.far);
  check('near > 0 (Pfad/Gras/Wasser vorhanden)', noSky.counts.near > 0, noSky.counts.near);
  check('structural > 0 (Dach/Fenster/Holz/Gebäudezone vorhanden)', noSky.counts.structural > 0, noSky.counts.structural);
  check('mid > 0 (Laub/Fels vorhanden)', noSky.counts.mid > 0, noSky.counts.mid);
  check('unknown == 0 (jede classGrid-Klasse ist einer Schicht zugeordnet)', noSky.counts.unknown === 0, noSky.counts.unknown);

  console.log('\nTest 3: depthLayerAt() an konkreten Punkten stimmt mit getMaterialTypeAt()/skyAt() überein');
  const sample = await page.evaluate(() => {
    // Rasterpunkte sammeln und die erste Übereinstimmung je erwarteter Klasse melden.
    const pts = [];
    for (let y = 0; y < 20; y++) for (let x = 0; x < 20; x++) {
      const u = x / 19, v = y / 19;
      pts.push({ u, v, mat: window.SHADED.getMaterialTypeAt(u, v), sky: window.SHADED.skyAt(u, v), zone: window.SHADED.zoneAt(u, v), layer: window.SHADED.depthLayerAt(u, v) });
    }
    return pts;
  });
  let mismatch = null;
  for (const p of sample) {
    if (p.zone) { if (p.layer !== 'structural') { mismatch = { reason: 'zone but not structural', p }; break; } continue; }
    if (p.sky) { if (p.layer !== 'far') { mismatch = { reason: 'sky but not far', p }; break; } continue; }
    const expect = { roof: 'structural', window: 'structural', wood: 'structural', foliage: 'mid', rock: 'mid', path: 'near', grass: 'near', water: 'near' }[p.mat];
    if (expect && p.layer !== expect) { mismatch = { reason: `mat=${p.mat} expected ${expect}`, p }; break; }
  }
  check('Stichprobe (400 Punkte) konsistent mit der dokumentierten Prioritätsregel', !mismatch, mismatch ? JSON.stringify(mismatch) : '');

  console.log('\nTest 4: Szene MIT Himmel im Bild — far > 0, hasSkyRegion() == true');
  await page.setInputFiles('#f-scene', SKY_IMG);
  await page.waitForFunction(() => /Szene geladen|Tiefenkarte geladen/.test(document.getElementById('status').textContent), { timeout: 30000 });
  await page.evaluate(() => window.SHADED.erstellen());
  await page.waitForFunction(() => window.SHADED.isReady(), { timeout: 30000 });
  const withSky = await page.evaluate(() => ({ counts: window.SHADED.depthLayers(), hasSkyRegion: window.SHADED.hasSkyRegion() }));
  console.log('  Layer-Verteilung:', JSON.stringify(withSky.counts));
  check('hasSkyRegion() == true', withSky.hasSkyRegion);
  check('far > 0 (Himmel-Pixel als FAR gezählt)', withSky.counts.far > 0, withSky.counts.far);

  console.log('\nTest 5: erneutes erstellen() (neue Analyse) baut layerGrid neu, keine veralteten Reste');
  await page.setInputFiles('#f-scene', BASE_IMG);
  await page.waitForFunction(() => /Szene geladen|Tiefenkarte geladen/.test(document.getElementById('status').textContent), { timeout: 30000 });
  await page.evaluate(() => window.SHADED.erstellen());
  await page.waitForFunction(() => window.SHADED.isReady(), { timeout: 30000 });
  const backToNoSky = await page.evaluate(() => window.SHADED.depthLayers());
  check('far wieder 0 nach Rückwechsel auf das himmel-lose Bild (kein Altzustand)', backToNoSky.far === 0, backToNoSky.far);

  console.log('\nKonsole-Fehler:', errors.length ? errors.join(' | ') : '(keine)');
  check('keine Page-/Shader-Errors', !errors.some((e) => e.startsWith('PAGEERROR')));

  await browser.close();
  server.close();
  console.log(failed ? '\n❌ verify-depth-layers FAILED' : '\n✅ verify-depth-layers PASSED');
  process.exitCode = failed ? 1 : 0;
})();
