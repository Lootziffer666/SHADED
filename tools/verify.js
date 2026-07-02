// SHADED – visuelle Verifikation (headless). Nutzung:
//   npm i playwright        (einmalig, außerhalb des Repos oder mit .gitignore)
//   node tools/verify.js
// Screenshots landen in tools/verify-out/ – visuell gegen die Zielbilder im Repo vergleichen.
// Eigener Chromium-Pfad: env CHROMIUM=/pfad/zu/chromium node tools/verify.js
const { chromium } = require('playwright');
const http = require('http');
const fs = require('fs');
const path = require('path');

const REPO = path.join(__dirname, '..');
const OUT = path.join(__dirname, 'verify-out');
fs.mkdirSync(OUT, { recursive: true });
const BASE_IMG = path.join(REPO, 'file_00000000974871f49fe71f6b456f9579.png');   // Szene (mit Fenstern)
const MARKER_IMG = path.join(REPO, 'file_00000000c84071f4bcd6ff9afdba7246.png');  // Pink-Marker-Overlay
const LEGACY_IMG = path.join(REPO, 'ResizedImage_2026-06-30_10-29-19_2317[41].png');
const MAT_IMG = path.join(REPO, '1782824829119.png');

const server = http.createServer((req, res) => {
  const p = path.join(REPO, decodeURIComponent(req.url.split('?')[0]).replace(/^\//, '') || 'index.html');
  try {
    const data = fs.readFileSync(p === REPO + '/' ? path.join(REPO, 'index.html') : p);
    res.writeHead(200, { 'Content-Type': p.endsWith('.html') ? 'text/html' : 'image/png' });
    res.end(data);
  } catch (e) { res.writeHead(404); res.end(); }
});

(async () => {
  await new Promise(r => server.listen(8931, r));
  const launchOpts = { args: ['--use-gl=angle', '--enable-webgl', '--ignore-gpu-blocklist'] };
  if (process.env.CHROMIUM) launchOpts.executablePath = process.env.CHROMIUM;
  else if (fs.existsSync('/opt/pw-browsers/chromium')) launchOpts.executablePath = '/opt/pw-browsers/chromium';
  const browser = await chromium.launch(launchOpts);
  const page = await browser.newPage({ viewport: { width: 1500, height: 860 } });
  const errors = [];
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));

  await page.goto('http://localhost:8931/index.html');
  await page.setInputFiles('#f-scene', BASE_IMG);
  await page.waitForFunction(() => document.getElementById('status').textContent.includes('Szene geladen'));
  await page.setInputFiles('#f-mat', MARKER_IMG);
  await page.waitForFunction(() => document.getElementById('status').textContent.includes('Material-Map geladen'));
  await page.click('#btn-create');
  await page.waitForFunction(() => window.SHADED.isReady());
  await page.waitForTimeout(400);

  const shots = [['tag', 3.0], ['aufzug', 10.0], ['sturmnacht', 21.7], ['morgen', 5.0], ['danach', 7.0], ['verfall', 4.0],
                 ['fruehling', 2.5], ['herbst', 6.0], ['schnee', 9.3]];
  for (const [act, t] of shots) {
    await page.evaluate(([a, tt]) => { window.SHADED.applyAct(a); window.SHADED.setTime(tt,true); }, [act, t]);
    await page.waitForTimeout(250);
    await (await page.$('#gl')).screenshot({ path: path.join(OUT, 'shot_' + act + '.png') });
  }

  // Zeitraffer-Mitte: halber Verfall (Holz grau, Dach-Moos beginnt, Pfad noch frei)
  await page.evaluate(() => {
    window.SHADED.applyAct('verfall');
    window.SHADED.setParams({ ...window.SHADED.getParams(), decay: 0.5 });
    window.SHADED.setTime(4.4,true);
  });
  await page.waitForTimeout(250);
  await (await page.$('#gl')).screenshot({ path: path.join(OUT, 'shot_zeitraffer_mitte.png') });

  // Interaktionstest (Runde 4): Trampelpfad wächst, Delle klingt ab, Feuer leuchtet
  await page.evaluate(() => {
    window.SHADED.applyAct('tag');
    window.SHADED.setParams({ ...window.SHADED.getParams(), dayNight: 0.8, storm: 0, rain: 0, fog: 0.1, glow: 0.6 });
    window.SHADED.setTime(2.0);
    window.SHADED.player.enable();
  });
  const p0 = await page.evaluate(() => window.SHADED.player.pos());
  await page.keyboard.down('d');
  await page.waitForTimeout(1300);
  await page.keyboard.up('d');
  const s1 = await page.evaluate(u => window.SHADED.trail.sample(u.u + 0.02, u.v + 0.006), p0);
  await page.waitForTimeout(3200);
  const s2 = await page.evaluate(u => window.SHADED.trail.sample(u.u + 0.02, u.v + 0.006), p0);
  const trailOk = s1.b > 0.02 && s1.r > 0.05 && s2.r < s1.r * 0.5 && Math.abs(s2.b - s1.b) < 0.02;
  console.log(`Trail-Test: B=${s1.b.toFixed(3)} (permanent: ${s2.b.toFixed(3)}), ` +
    `R=${s1.r.toFixed(3)} -> ${s2.r.toFixed(3)} nach 3.2s  =>  ${trailOk ? 'PASS' : 'FAIL'}`);
  await page.evaluate(u => window.SHADED.fire.ignite(u.u + 0.08, u.v), p0);
  await page.waitForTimeout(700);
  await (await page.$('#canvas-wrap')).screenshot({ path: path.join(OUT, 'shot_interaktion.png') });

  // Zweiter Durchlauf: Legacy-Szene mit gemalter Palette-Material-Map
  await page.setInputFiles('#f-scene', LEGACY_IMG);
  await page.waitForTimeout(300);
  await page.setInputFiles('#f-mat', MAT_IMG);
  await page.waitForTimeout(300);
  await page.click('#btn-create');
  await page.waitForFunction(() => window.SHADED.isReady());
  await page.evaluate(() => { window.SHADED.applyAct('sturmnacht'); window.SHADED.setTime(21.7,true); });
  await page.waitForTimeout(250);
  await (await page.$('#gl')).screenshot({ path: path.join(OUT, 'shot_map_sturmnacht.png') });

  const mats = await page.evaluate(() => [
    window.SHADED.getMaterialTypeAt(0.5, 0.6),  // Pfadmitte
    window.SHADED.getMaterialTypeAt(0.13, 0.35), // linkes Dach
    window.SHADED.getMaterialTypeAt(0.05, 0.05)  // Baum oben links
  ]);
  console.log('Materialproben Legacy-Map (Pfad/Dach/Baum):', mats.join(', '));

  // Dritter Durchlauf: Taverne (andere Auflösung, anderer Stil, ohne Zweitbild)
  // Vergleichen mit ResizedImage_2026-06-30_23-13-00_0185[1].png (Regen-Target)
  await page.setInputFiles('#f-scene', path.join(REPO, 'ResizedImage_2026-06-30_23-14-34_6442[1].jpg'));
  await page.waitForTimeout(300);
  await page.click('#btn-create');
  await page.waitForFunction(() => window.SHADED.isReady());
  await page.evaluate(() => {
    window.SHADED.applyAct('morgen');
    window.SHADED.setParams({ ...window.SHADED.getParams(), dayNight: 0.35, fog: 0.5, rain: 0.5, wet: 1, puddle: 0.8, glow: 0.8 });
    window.SHADED.setTime(5.0, true);
  });
  await page.waitForTimeout(250);
  await (await page.$('#gl')).screenshot({ path: path.join(OUT, 'shot_taverne_regen.png') });
  console.log('Konsole-Fehler:', errors.length ? errors.join(' | ') : 'keine');
  await browser.close();
  server.close();
})().catch(e => { console.error(e); process.exit(1); });
