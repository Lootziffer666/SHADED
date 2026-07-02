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
const BASE_IMG = path.join(REPO, 'ResizedImage_2026-06-30_10-29-19_2317[41].png');
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
  await page.click('#btn-create');
  await page.waitForFunction(() => window.SHADED.isReady());
  await page.waitForTimeout(400);

  const shots = [['tag', 3.0], ['aufzug', 10.0], ['sturmnacht', 21.7], ['morgen', 5.0], ['danach', 7.0], ['verfall', 4.0]];
  for (const [act, t] of shots) {
    await page.evaluate(([a, tt]) => { window.SHADED.applyAct(a); window.SHADED.setTime(tt); }, [act, t]);
    await page.waitForTimeout(250);
    await (await page.$('#gl')).screenshot({ path: path.join(OUT, 'shot_' + act + '.png') });
  }

  // Zweiter Durchlauf: mit gemalter Material-Map
  await page.setInputFiles('#f-mat', MAT_IMG);
  await page.waitForTimeout(300);
  await page.click('#btn-create');
  await page.waitForFunction(() => window.SHADED.isReady());
  await page.evaluate(() => { window.SHADED.applyAct('sturmnacht'); window.SHADED.setTime(21.7); });
  await page.waitForTimeout(250);
  await (await page.$('#gl')).screenshot({ path: path.join(OUT, 'shot_map_sturmnacht.png') });

  const mats = await page.evaluate(() => [
    window.SHADED.getMaterialTypeAt(0.5, 0.6),  // Pfadmitte
    window.SHADED.getMaterialTypeAt(0.13, 0.35), // linkes Dach
    window.SHADED.getMaterialTypeAt(0.05, 0.05)  // Baum oben links
  ]);
  console.log('Materialproben (Pfad/Dach/Baum):', mats.join(', '));
  console.log('Konsole-Fehler:', errors.length ? errors.join(' | ') : 'keine');
  await browser.close();
  server.close();
})().catch(e => { console.error(e); process.exit(1); });
