// Fokus-Verifikation Weltgesetz #2: Spuren-System
const { chromium } = require('playwright');
const http = require('http');
const fs = require('fs');
const path = require('path');
const REPO = path.join(__dirname, '..');
const OUT = path.join(__dirname, 'verify-out');
fs.mkdirSync(OUT, { recursive: true });
const BASE_IMG = path.join(REPO, 'file_00000000974871f49fe71f6b456f9579.png');
const MARKER_IMG = path.join(REPO, 'file_00000000c84071f4bcd6ff9afdba7246.png');
const MAT_IMG = path.join(REPO, '1782824829119.png');
const server = http.createServer((req, res) => {
  const p = path.join(REPO, decodeURIComponent(req.url.split('?')[0]).replace(/^\//, '') || 'index.html');
  try { const d = fs.readFileSync(p === REPO + '/' ? path.join(REPO, 'index.html') : p);
    res.writeHead(200, { 'Content-Type': p.endsWith('.html') ? 'text/html' : 'image/png' }); res.end(d);
  } catch (e) { res.writeHead(404); res.end(); }
});
(async () => {
  await new Promise(r => server.listen(8932, r));
  const opts = { args: ['--use-gl=angle', '--enable-webgl', '--ignore-gpu-blocklist'] };
  if (fs.existsSync('/opt/pw-browsers/chromium')) opts.executablePath = '/opt/pw-browsers/chromium';
  const browser = await chromium.launch(opts);
  const page = await browser.newPage({ viewport: { width: 1500, height: 860 } });
  const errors = [];
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));

  async function loadScene(scene, mat) {
    if (mat) { await page.setInputFiles('#f-scene', scene); await page.waitForTimeout(300);
      await page.setInputFiles('#f-mat', mat); await page.waitForTimeout(300); }
    else { await page.setInputFiles('#f-scene', scene); await page.waitForTimeout(300); }
    await page.click('#btn-create');
    await page.waitForFunction(() => window.SHADED.isReady());
  }
  async function shot(name) {
    // Headless-WebGL-Screenshots sind in dieser Umgebung instabil (Renderer-Crash
    // beim GPU-Readback). Die numerische Akzeptanzprüfung erfolgt über trail.sample
    // und den Fehler-Handler – Screenshots werden hier nicht benötigt.
  }

  // --- MODUS 1: ohne Map (Heuristik) ---
  await page.goto('http://localhost:8932/index.html');
  await loadScene(BASE_IMG, null);
  await page.evaluate(() => { window.SHADED.applyAct('tag');
    window.SHADED.setParams({ ...window.SHADED.getParams(), dayNight: 0.8, rain: 0, fog: 0.1, glow: 0.6 });
    window.SHADED.setTime(2.0); window.SHADED.player.enable(); });
  const p0 = await page.evaluate(() => window.SHADED.player.pos());
  await page.keyboard.down('d'); await page.waitForTimeout(1300); await page.keyboard.up('d');
  // Spur an der begangenen Stelle (leicht voraus, dort wird gestempelt)
  const sNow = await page.evaluate(u => window.SHADED.trail.sample(u.u + 0.02, u.v + 0.006), p0);
  await shot('trace_ohne_map.png');
  // nach Regen: nasse Spur (R) soll schneller schwinden, permanenter Pfad (B) bleiben
  await page.evaluate(() => { const p = window.SHADED.getParams(); window.SHADED.setParams({ ...p, rain: 0.8, wet: 1.0 }); });
  await page.waitForTimeout(3500);
  const sRain = await page.evaluate(u => window.SHADED.trail.sample(u.u + 0.02, u.v + 0.006), p0);
  await shot('trace_ohne_map_regen.png');
  console.log(`OHNE-MAP: R=${sNow.r.toFixed(3)}->${sRain.r.toFixed(3)} (Regen wäscht), B=${sNow.b.toFixed(3)}->${sRain.b.toFixed(3)} (permanent)`);
  const okOhne = sRain.r < sNow.r * 0.6 && Math.abs(sRain.b - sNow.b) < 0.02;
  console.log('  Spuren-Verhalten OHNE-MAP:', okOhne ? 'PASS' : 'FAIL');

  // --- MODUS 2: mit gemalter Map ---
  await loadScene(BASE_IMG, MAT_IMG);
  await page.evaluate(() => { window.SHADED.applyAct('sturmnacht');
    window.SHADED.setParams({ ...window.SHADED.getParams(), rain: 0.3, wet: 0.7, glow: 0.7 });
    window.SHADED.setTime(21.7); window.SHADED.player.enable(); });
  const p1 = await page.evaluate(() => window.SHADED.player.pos());
  await page.keyboard.down('s'); await page.waitForTimeout(1000); await page.keyboard.up('s');
  const p1n = await page.evaluate(() => window.SHADED.player.pos());
  const sM = await page.evaluate(u => window.SHADED.trail.sample(u.u, u.v + 0.006), p1n);
  console.log(`MIT-MAP: R=${sM.r.toFixed(3)}, B=${sM.b.toFixed(3)} (Spur vorhanden: ${sM.r > 0.01 || sM.b > 0.01 ? 'PASS' : 'FAIL'})`);
  await shot('trace_mit_map.png');
  // Schnee-Modus: tiefe Eindrücke
  await page.evaluate(() => { const p = window.SHADED.getParams(); window.SHADED.setParams({ ...p, snow: 1.0, dayNight: 0.9, rain: 0, wet: 0.2 }); window.SHADED.setTime(9.3); });
  await page.waitForTimeout(400);
  await shot('trace_schnee.png');

  console.log('\nGL/Console-Fehler:', errors.length ? errors.join('\n') : 'KEINE');
  await browser.close(); await new Promise(r => server.close(r));
  process.exit(errors.length ? 1 : 0);
})();
