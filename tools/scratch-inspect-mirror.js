// SCRATCH inspection — NOT part of the verify suite, NOT meant to be
// committed. Loads the real scene + depth companion through SHADED's actual
// engine, opens the REAL, already-shipping free spatial viewer, switches to
// its 'mirror' pipeline stage (observed structural points + the real
// completeMirroredShell() output), and screenshots it from a few angles so
// we can actually SEE how flat/uniform the existing mirror shell is on real
// data, instead of describing it from reading the source.
const { chromium } = require('playwright');
const http = require('http');
const fs = require('fs');
const path = require('path');

const REPO = path.join(__dirname, '..');
const OUT = path.join(__dirname, 'verify-out');
fs.mkdirSync(OUT, { recursive: true });
const SCENE_IMG = path.join(REPO, 'file_00000000974871f49fe71f6b456f9579.png');
const DEPTH_IMG = path.join(REPO, 'file_00000000974871f49fe71f6b456f9579_depth.png');
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.gif': 'image/gif', '.ico': 'image/x-icon' };

const server = http.createServer((req, res) => {
  const p = path.join(REPO, decodeURIComponent(req.url.split('?')[0]).replace(/^\//, '') || 'index.html');
  try {
    const data = fs.readFileSync(p === REPO + '/' ? path.join(REPO, 'index.html') : p);
    res.writeHead(200, { 'Content-Type': MIME[path.extname(p).toLowerCase()] || 'application/octet-stream' });
    res.end(data);
  } catch (e) { res.writeHead(404); res.end(); }
});

(async () => {
  await new Promise(r => server.listen(8932, r));
  const launchOpts = { args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--enable-webgl', '--ignore-gpu-blocklist', '--no-sandbox', '--disable-dev-shm-usage'] };
  if (fs.existsSync('/opt/pw-browsers/chromium')) launchOpts.executablePath = '/opt/pw-browsers/chromium';
  const browser = await chromium.launch(launchOpts);
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  const errors = [];
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));

  await page.goto('http://localhost:8932/index.html', { waitUntil: 'load' });
  await page.setInputFiles('#f-scene', SCENE_IMG);
  await page.setInputFiles('#f-depth', DEPTH_IMG);
  await page.evaluate(() => window.SHADED.erstellen());
  await page.waitForFunction(() => window.SHADED.isReady(), { timeout: 60000 });

  await page.evaluate(() => document.getElementById('btn-spatial-view').click());
  await page.waitForTimeout(400);
  const openState = await page.evaluate(() => window.SHADED.spatial.viewer.state());
  console.log('State after open (stage=final):', openState);

  await page.evaluate(() => window.SHADED.spatial.viewer.stage('mirror'));
  await page.evaluate(() => window.SHADED.spatial.viewer.setMode('orbit'));
  await page.waitForTimeout(200);
  const mirrorState = await page.evaluate(() => window.SHADED.spatial.viewer.state());
  console.log('State on stage=mirror:', mirrorState);

  const canvas = await page.$('#spatial-viewer canvas');
  if (!canvas) throw new Error('spatial viewer canvas not found');
  // Hide the World Studio overlay panel purely for a clean inspection screenshot.
  await page.evaluate(() => { const el = document.getElementById('world-studio'); if (el) el.style.display = 'none'; });

  // Front-on.
  await page.evaluate(() => window.SHADED.spatial.viewer.setCamera({ x: 0, y: 0, z: 2.3, yaw: 0, pitch: 0 }));
  await page.waitForTimeout(300);
  await canvas.screenshot({ path: path.join(OUT, 'mirror-inspect-front.png') });

  // 3/4 side angle, to see the mirrored shell separate from the front.
  await page.evaluate(() => window.SHADED.spatial.viewer.setCamera({ x: 1.6, y: 0.3, z: 1.6, yaw: -0.9, pitch: -0.15 }));
  await page.waitForTimeout(300);
  await canvas.screenshot({ path: path.join(OUT, 'mirror-inspect-side.png') });

  // Near-top-down, to see the front/back Z-separation as a flat push-back.
  await page.evaluate(() => window.SHADED.spatial.viewer.setCamera({ x: 0, y: 1.1, z: 0.05, yaw: 0, pitch: -1.35 }));
  await page.waitForTimeout(300);
  await canvas.screenshot({ path: path.join(OUT, 'mirror-inspect-top.png') });

  // Pure side profile (looking along X), the clearest cut through Z-depth.
  await page.evaluate(() => window.SHADED.spatial.viewer.setCamera({ x: 1.4, y: 0.05, z: 0, yaw: -1.5708, pitch: 0 }));
  await page.waitForTimeout(300);
  await canvas.screenshot({ path: path.join(OUT, 'mirror-inspect-profile.png') });

  console.log('Console/page errors:', errors);
  await browser.close();
  await new Promise(r => server.close(r));
})();
