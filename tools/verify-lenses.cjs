// SHADED Wally-Monokel Verifikation (Runde 8: Inspektions-Linsen + Klang-Wellenfeld)
// Nutzung: node tools/verify-lenses.js
// Eigener Chromium-Pfad: env CHROMIUM=/pfad/zu/chromium node tools/verify-lenses.js
const { chromium } = require('playwright');
const http = require('http');
const fs = require('fs');
const path = require('path');

const REPO = path.join(__dirname, '..');
const OUT = path.join(__dirname, 'verify-out');
fs.mkdirSync(OUT, { recursive: true });
const BASE_IMG = path.join(REPO, 'file_00000000974871f49fe71f6b456f9579.png');
const MARKER_IMG = path.join(REPO, 'file_00000000c84071f4bcd6ff9afdba7246.png');

const server = http.createServer((req, res) => {
  const p = path.join(REPO, decodeURIComponent(req.url.split('?')[0]).replace(/^\//, '') || 'index.html');
  try {
    const data = fs.readFileSync(p === REPO + '/' ? path.join(REPO, 'index.html') : p);
    res.writeHead(200, { 'Content-Type': p.endsWith('.html') ? 'text/html' : 'image/png' });
    res.end(data);
  } catch (e) { res.writeHead(404); res.end(); }
});

// Mittelwert |Δ| über einen Raster von Sample-Punkten zwischen zwei Frames (0..1500x860 CSS-Px).
async function sampleGrid(page) {
  return page.evaluate(() => {
    const gl = document.getElementById('gl');
    const c = document.createElement('canvas');
    c.width = gl.width; c.height = gl.height;
    const cx = c.getContext('2d');
    cx.drawImage(gl, 0, 0);
    const pts = [];
    for (let gy = 0; gy < 6; gy++) for (let gx = 0; gx < 6; gx++) {
      const x = Math.floor((gx + 0.5) / 6 * c.width), y = Math.floor((gy + 0.5) / 6 * c.height);
      pts.push(...cx.getImageData(x, y, 1, 1).data);
    }
    return pts;
  });
}
function meanAbsDiff(a, b) {
  let s = 0; for (let i = 0; i < a.length; i++) s += Math.abs(a[i] - b[i]);
  return s / a.length;
}
// Kleiner Pixel-Patch exakt an einer UV-Position (für punktuelle Stempel wie sound.emit,
// die im groben 6x6-Raster von sampleGrid() durchs Rost fallen können).
async function samplePatch(page, u, v) {
  return page.evaluate(([u, v]) => {
    const gl = document.getElementById('gl');
    const c = document.createElement('canvas');
    c.width = gl.width; c.height = gl.height;
    const cx = c.getContext('2d');
    cx.drawImage(gl, 0, 0);
    const x = Math.floor(u * c.width), y = Math.floor(v * c.height);
    const r = 6, out = [];
    for (let dy = -r; dy <= r; dy += 3) for (let dx = -r; dx <= r; dx += 3) {
      const px = Math.max(0, Math.min(c.width - 1, x + dx)), py = Math.max(0, Math.min(c.height - 1, y + dy));
      out.push(...cx.getImageData(px, py, 1, 1).data);
    }
    return out;
  }, [u, v]);
}

(async () => {
  await new Promise(r => server.listen(8933, r));
  const launchOpts = { args: ['--use-gl=angle', '--enable-webgl', '--ignore-gpu-blocklist'] };
  if (process.env.CHROMIUM) launchOpts.executablePath = process.env.CHROMIUM;
  else if (fs.existsSync('/opt/pw-browsers/chromium')) launchOpts.executablePath = '/opt/pw-browsers/chromium';
  const browser = await chromium.launch(launchOpts);
  const page = await browser.newPage({ viewport: { width: 1500, height: 860 } });
  const errors = [];
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));

  console.log('=== SHADED Wally-Monokel Verifikation (Runde 8) ===\n');

  await page.goto('http://localhost:8933/index.html');
  await page.setInputFiles('#f-scene', BASE_IMG);
  await page.waitForFunction(() => /Szene geladen|Tiefenkarte geladen/.test(document.getElementById('status').textContent));
  await page.setInputFiles('#f-mat', MARKER_IMG);
  await page.waitForFunction(() => document.getElementById('status').textContent.includes('Material-Map geladen'));
  await page.click('#btn-create');
  await page.waitForFunction(() => window.SHADED.isReady());
  await page.evaluate(() => { window.SHADED.applyAct('tag'); window.SHADED.setTime(2.0, true); });
  await page.waitForTimeout(300);

  let failed = false;
  function check(name, ok, detail) {
    console.log(`  ${ok ? '✓ PASS' : '✗ FAIL'}: ${name}${detail ? ' — ' + detail : ''}`);
    if (!ok) failed = true;
  }

  // Test 1: API-Oberfläche
  console.log('Test 1: SHADED.lens / SHADED.sound API');
  const api = await page.evaluate(() => ({
    hasLens: !!window.SHADED.lens && typeof window.SHADED.lens.set === 'function' && typeof window.SHADED.lens.get === 'function',
    hasSound: !!window.SHADED.sound && typeof window.SHADED.sound.emit === 'function',
    defaultLens: window.SHADED.lens.get(),
  }));
  check('lens.set/get vorhanden', api.hasLens);
  check('sound.emit vorhanden', api.hasSound);
  check('Default-Linse ist 0 (aus)', api.defaultLens === 0, `war ${api.defaultLens}`);

  // Test 2: jede Linse rendert sichtbar anders als das normale Bild — außer Linse 4
  // (Materialtreue = der stabile Shader = bewusst IDENTISCH zum Normalbild, siehe Design).
  console.log('\nTest 2: Linsen 1/2/3/5 verändern das Bild, Linse 4 nicht (= "der stabile Shader")');
  await page.evaluate(() => window.SHADED.lens.set(0));
  await page.waitForTimeout(120);
  const baseline = await sampleGrid(page);
  await (await page.$('#canvas-wrap')).screenshot({ path: path.join(OUT, 'shot_lens_0_normal.png') });

  for (const n of [1, 2, 3, 4, 5]) {
    await page.evaluate((lens) => window.SHADED.lens.set(lens), n);
    await page.waitForTimeout(120);
    const sample = await sampleGrid(page);
    await (await page.$('#canvas-wrap')).screenshot({ path: path.join(OUT, `shot_lens_${n}.png`) });
    const diff = meanAbsDiff(baseline, sample);
    if (n === 4) check(`Linse 4 ≈ Normalbild`, diff < 2.0, `meanAbsDiff=${diff.toFixed(2)}`);
    else check(`Linse ${n} unterscheidet sich sichtbar`, diff > 5.0, `meanAbsDiff=${diff.toFixed(2)}`);
  }

  // Test 3: Linse 3 (Klang) reagiert auf SHADED.sound.emit() — Sample exakt am Stempelpunkt,
  // da der Stempelradius (~10% der 256er-Textur) durchs grobe 6x6-Raster fallen kann.
  console.log('\nTest 3: Klang-Wellenfeld — sound.emit() macht sich in Linse 3 bemerkbar');
  await page.evaluate(() => window.SHADED.lens.set(3));
  await page.waitForTimeout(120);
  const quiet = await samplePatch(page, 0.5, 0.5);
  await page.evaluate(() => { for (let i = 0; i < 8; i++) window.SHADED.sound.emit(0.5, 0.5, 1.0); });
  await page.waitForTimeout(120);
  const loud = await samplePatch(page, 0.5, 0.5);
  await (await page.$('#canvas-wrap')).screenshot({ path: path.join(OUT, 'shot_lens_3_emit.png') });
  check('Klangwelle sichtbar nach emit()', meanAbsDiff(quiet, loud) > 3.0, `meanAbsDiff=${meanAbsDiff(quiet, loud).toFixed(2)}`);

  // Test 4: Klang klingt ab (transient, ~0.35s Halbwertszeit)
  console.log('\nTest 4: Klangwelle klingt ab (Decay)');
  await page.waitForTimeout(1500);
  const decayed = await samplePatch(page, 0.5, 0.5);
  check('Welle nach 1.5s deutlich abgeklungen', meanAbsDiff(loud, decayed) > 2.0, `meanAbsDiff(loud,decayed)=${meanAbsDiff(loud, decayed).toFixed(2)}`);

  // Test 5: Regression — Linse aus, normales Rendering unverändert (Kino-Modus-Versprechen)
  console.log('\nTest 5: Regression — Linse 0 nach Nutzung wieder exakt Normalbild');
  await page.evaluate(() => window.SHADED.lens.set(0));
  await page.waitForTimeout(120);
  const backToNormal = await sampleGrid(page);
  check('zurück auf Linse 0 == ursprüngliches Normalbild', meanAbsDiff(baseline, backToNormal) < 2.0, `meanAbsDiff=${meanAbsDiff(baseline, backToNormal).toFixed(2)}`);

  // Test 6: Tastatur 1..5 (Stans Controller) schaltet Linsen, erneutes Drücken schaltet aus
  console.log('\nTest 6: Tasten 1..5 schalten Linsen um (Stans Controller)');
  await page.keyboard.press('3');
  await page.waitForTimeout(80);
  const afterKey3 = await page.evaluate(() => window.SHADED.lens.get());
  check('Taste "3" aktiviert Linse 3', afterKey3 === 3, `war ${afterKey3}`);
  await page.keyboard.press('3');
  await page.waitForTimeout(80);
  const afterKey3Again = await page.evaluate(() => window.SHADED.lens.get());
  check('erneutes "3" schaltet Linse wieder aus', afterKey3Again === 0, `war ${afterKey3Again}`);

  console.log('\nKonsole-Fehler:', errors.length ? errors.join(' | ') : '(keine)');
  check('keine Page-/Shader-Errors', !errors.some(e => e.startsWith('PAGEERROR')));

  await browser.close();
  server.close();
  console.log(failed ? '\n❌ verify-lenses FAILED' : '\n✅ verify-lenses PASSED');
  process.exitCode = failed ? 1 : 0;
})();
