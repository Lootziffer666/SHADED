// SHADED Wetter-in-der-Welt Verifikation (Exp. 3, docs/first-glimpse-depth-layers.md).
// Beweist am tatsächlich gerenderten Overlay-Canvas (keine Introspektion interner Arrays):
// Regen wird über einer STRUCTURAL-Region (Gebäude/Dach) nie gezeichnet (occluded), über
// einer NEAR-Region sichtbar gezeichnet. Nutzung: node tools/verify-weather-depth.js
const { chromium } = require('playwright');
const http = require('http');
const fs = require('fs');
const path = require('path');

const REPO = path.join(__dirname, '..');
const BASE_IMG = path.join(REPO, 'file_00000000974871f49fe71f6b456f9579.png'); // kein Companion-Depth

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
  await new Promise((r) => server.listen(8938, r));
  const launchOpts = { args: ['--use-gl=angle', '--enable-webgl', '--ignore-gpu-blocklist'] };
  if (process.env.CHROMIUM) launchOpts.executablePath = process.env.CHROMIUM;
  else if (fs.existsSync('/opt/pw-browsers/chromium')) launchOpts.executablePath = '/opt/pw-browsers/chromium';
  const browser = await chromium.launch(launchOpts);
  const page = await browser.newPage({ viewport: { width: 1500, height: 860 } });
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));

  console.log('=== SHADED Wetter-in-der-Welt Verifikation (Exp. 3) ===\n');
  let failed = false;
  function check(name, ok, detail) { console.log(`  ${ok ? '✓ PASS' : '✗ FAIL'}: ${name}${detail ? ' — ' + detail : ''}`); if (!ok) failed = true; }

  await page.goto('http://localhost:8938/index.html');
  await page.evaluate(() => { const el = document.getElementById('world-studio'); if (el) el.style.display = 'none'; });
  await page.setInputFiles('#f-scene', BASE_IMG);
  await page.waitForFunction(() => /Szene geladen|Tiefenkarte geladen/.test(document.getElementById('status').textContent), { timeout: 30000 });
  await page.evaluate(() => window.SHADED.erstellen());
  await page.waitForFunction(() => window.SHADED.isReady(), { timeout: 30000 });

  console.log('Test 1: Testszene hat sowohl eine structural- als auch eine near-Region (für den Vergleich)');
  const points = await page.evaluate(() => {
    const regions = window.SHADED.depthRegions(); // größte zuerst (Exp. 2)
    return {
      structural: regions.find(r => r.layer === 'structural') || null,
      near: regions.find(r => r.layer === 'near') || null,
    };
  });
  check('größte structural-Region gefunden', !!points.structural, JSON.stringify(points.structural));
  check('größte near-Region gefunden', !!points.near, JSON.stringify(points.near));

  console.log('\nTest 2: heftiger Regen über ~2,4s — an tatsächlich STRUCTURAL klassifizierten Pixeln bleibt');
  console.log('  der Regen klar UNSICHTBAR (nur schwaches Kanten-Antialiasing zulässig); an anderen');
  console.log('  Pixeln wird deutlich sichtbar Regen gezeichnet.');
  // Ein einzelner Stichprobenpunkt hat bei dünnen, verstreuten Regenstreifen eine zu geringe
  // Trefferwahrscheinlichkeit (Entwurf 1 verfehlte deshalb sogar die near-Region). Die
  // Bounding-Box einer Region ist ebenfalls kein verlässlicher Ersatz (Entwurf 2): ein
  // Gebäude-Cluster ist oft nicht konvex, seine Bounding-Box schließt Lücken (Gras/Himmel
  // zwischen zwei Flügeln) ein, die selbst NICHT structural sind und dort korrekt sichtbaren
  // Regen zeigen — das ist keine Occlusion-Verletzung, nur ein zu grober Test gewesen.
  // Diese Fassung baut EINMALIG eine echte Pixelmaske aus depthLayerAt() (derselben Quelle,
  // die weatherOccludedAt() auch nutzt) und prüft pro Frame nur dagegen.
  // WICHTIGER FUND (Entwurf 4, mit temporärer Partikel-Introspektion aufgeklärt): das
  // `elements.trigger('rain')`-Preset setzt storm UND rain hoch, und storm*rain überschreitet
  // hailTicks Schwelle — es spawnt also NEBENBEI auch Hagel. Hagel-Aufprall-„Bounces" stempeln
  // `pressureBursts` (Druckringe, `runtime/weather-particles.mjs`s eigener Kommentar führt sie
  // ausdrücklich unter „Element-Labs", NICHT unter „Wetter"), und diese Ringe waren nie für eine
  // Occlusion-Prüfung vorgesehen — ein Aufprallring gehört semantisch AUF die getroffene
  // Fläche (wie liegender Schnee), nicht dahinter. Das war also kein Bug in der Regen-Occlusion,
  // sondern ein zu grob gewähltes Test-Trigger-Preset, das ein fremdes System mit anregte.
  // Diese Fassung setzt Regen daher direkt per setParams mit storm=0 (unterhalb der Hagel-
  // Schwelle) statt über das Preset — sauber isoliert auf genau das System, das Exp. 3 betrifft.
  await page.evaluate(() => {
    const ov = document.getElementById('ov');
    const stride = 3;
    const cols = Math.ceil(ov.width / stride), rows = Math.ceil(ov.height / stride);
    const mask = new Uint8Array(cols * rows);
    for (let gy = 0; gy < rows; gy++) for (let gx = 0; gx < cols; gx++) {
      const x = gx * stride, y = gy * stride;
      mask[gy * cols + gx] = window.SHADED.depthLayerAt(x / ov.width, y / ov.height) === 'structural' ? 1 : 0;
    }
    window.__structMask = { mask, cols, rows, stride };
  });
  const maskStats = await page.evaluate(() => {
    const m = window.__structMask;
    let s = 0; for (let i = 0; i < m.mask.length; i++) s += m.mask[i];
    return { structuralCells: s, totalCells: m.mask.length };
  });
  check('Pixelmaske enthält tatsächlich structural-klassifizierte Zellen', maskStats.structuralCells > 0, JSON.stringify(maskStats));

  await page.evaluate(() => window.SHADED.setParams({ ...window.SHADED.getParams(), rain: 1, storm: 0, wet: 1 }));
  let maxStructAlpha = 0, maxOutsideAlpha = 0, samples = 0;
  for (let i = 0; i < 40; i++) {
    await page.waitForTimeout(60);
    const { sMax, oMax } = await page.evaluate(() => {
      const ov = document.getElementById('ov');
      const ctx = ov.getContext('2d');
      const data = ctx.getImageData(0, 0, ov.width, ov.height).data;
      const { mask, cols, stride } = window.__structMask;
      let sMax = 0, oMax = 0;
      for (let y = 0; y < ov.height; y += stride) {
        for (let x = 0; x < ov.width; x += stride) {
          const a = data[(y * ov.width + x) * 4 + 3];
          if (a === 0) continue;
          const isStruct = mask[(y / stride | 0) * cols + (x / stride | 0)] === 1;
          if (isStruct) sMax = Math.max(sMax, a); else oMax = Math.max(oMax, a);
        }
      }
      return { sMax, oMax };
    });
    samples++;
    maxStructAlpha = Math.max(maxStructAlpha, sMax);
    maxOutsideAlpha = Math.max(maxOutsideAlpha, oMax);
  }
  console.log(`  ${samples} Frames gesampelt (~${(samples * 60 / 1000).toFixed(1)}s Regen)`);
  console.log(`  maximale Alpha auf structural-Pixeln: ${maxStructAlpha}/255, außerhalb: ${maxOutsideAlpha}/255`);
  check('structural-Pixel bleiben klar unter sichtbarer Deckkraft (nur Kanten-Antialiasing, <80/255)', maxStructAlpha < 80, maxStructAlpha);
  check('außerhalb von structural wird deutlich sichtbarer Regen gezeichnet (>=150/255)', maxOutsideAlpha >= 150, maxOutsideAlpha);

  console.log('\nKonsole-Fehler:', errors.length ? errors.join(' | ') : '(keine)');
  check('keine Page-/Shader-Errors', !errors.some((e) => e.startsWith('PAGEERROR')));

  await browser.close();
  server.close();
  console.log(failed ? '\n❌ verify-weather-depth FAILED' : '\n✅ verify-weather-depth PASSED');
  process.exitCode = failed ? 1 : 0;
})();
