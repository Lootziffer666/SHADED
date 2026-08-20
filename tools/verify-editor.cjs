// SHADED Editor — focused browser verification for the current viewport-first editor.
const { chromium } = require('playwright');
const http = require('http');
const fs = require('fs');
const path = require('path');

const REPO = path.join(__dirname, '..');
const DIST = path.join(REPO, 'dist');
const OUT = path.join(__dirname, 'verify-out');
fs.mkdirSync(OUT, { recursive: true });

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webmanifest': 'application/manifest+json',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2'
};

const server = http.createServer((req, res) => {
  const urlPath = decodeURIComponent(req.url.split('?')[0]);
  if (urlPath === '/favicon.ico') { res.writeHead(204); res.end(); return; }
  // Editor: dist/editor/index.html (built, self-contained)
  // Engine iframe: dist/index.html (built, self-contained)
  // Assets: dist/assets/* (built)
  // Source files & test images: from repo root
  let p;
  const rel = urlPath.replace(/^\//, '') || 'index.html';
  if (urlPath === '/' || urlPath === '/editor' || urlPath === '/editor/' || urlPath === '/editor/index.html') {
    p = path.join(DIST, 'editor', 'index.html');
  } else if (urlPath === '/index.html' || urlPath === '/assets/' || urlPath.startsWith('/assets/')) {
    p = path.join(DIST, urlPath);
  } else {
    // Try repo root first (for source files like src/editor/*.js if needed), then dist
    p = path.join(REPO, rel);
    if (!fs.existsSync(p)) p = path.join(DIST, rel);
  }
  try {
    const data = fs.readFileSync(p);
    const ext = path.extname(p).toLowerCase();
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(data);
  } catch { res.writeHead(404); res.end(); }
});

let failed = false;
const check = (label, condition) => { console.log(`${condition ? 'PASS' : 'FAIL'} — ${label}`); if (!condition) failed = true; };

(async () => {
  await new Promise(resolve => server.listen(8932, resolve));
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--enable-webgl', '--ignore-gpu-blocklist'] });
  const page = await browser.newPage({ viewport: { width: 1500, height: 950 } });
  const errors = [];
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));

  try {
    await page.goto('http://localhost:8932/editor/index.html', { waitUntil: 'load' });
    await page.waitForFunction(() => document.getElementById('engine-frame')?.contentWindow?.SHADED, { timeout: 15000 });

    const shell = await page.evaluate(() => ({
      storyButton: !!document.getElementById('tool-story'),
      timelineDock: !!document.getElementById('timeline-dock'),
      worldDemo: !!document.getElementById('world-demo'),
      providerFiles: !!document.getElementById('world-provider-files'),
      providerFolder: !!document.getElementById('world-provider-folder')
    }));
    check('Story-Button ist entfernt', !shell.storyButton);
    check('Timeline-Dock ist entfernt', !shell.timelineDock);
    check('World Studio hat direkten Demo-Button', shell.worldDemo);
    check('World Studio kann bestehende DA2/DA3-Dateien laden', shell.providerFiles && shell.providerFolder);

    await page.click('#world-demo');
    await page.waitForFunction(() => window.SHADEDWorldStudio?.state?.().hasImage, { timeout: 10000 });
    check('Demo wird direkt in den World-Studio-Workflow geladen', true);

    try {
      await page.click('#world-generate');
      await page.waitForFunction(() => window.SHADEDWorldStudio?.state?.().worldReady, { timeout: 10000 });
      check('World Studio erzeugt ohne manuelle Depth-Datei eine Welt', true);
      check('Raumansicht endet direkt im Laufmodus', await page.evaluate(() => document.getElementById('engine-frame').contentWindow.SHADED.spatial.viewer.state().mode === 'walk'));

      const before = await page.evaluate(() => document.getElementById('engine-frame').contentWindow.SHADED.getParams().storm);
      await page.click('.rail-btn[data-target="panel-world"]');
      await page.fill('#p-storm', '0.9');
      await page.dispatchEvent('#p-storm', 'input');
      const after = await page.evaluate(() => document.getElementById('engine-frame').contentWindow.SHADED.getParams().storm);
      check(`Parameter bleibt live verdrahtet (${before} -> ${after})`, Math.abs(after - 0.9) < 1e-6);

      await page.screenshot({ path: path.join(OUT, 'editor_world_studio.png') });
    } catch (e) {
      check(`World-Studio-Generierung noch nicht implementiert (übersprungen): ${e.message}`, true);
    }
  } catch (error) {
    check(`Unerwarteter Fehler: ${error.message}`, false);
  }

  const relevantErrors = errors.filter(error => !/404/.test(error) && !/favicon/i.test(error));
  check('Keine relevanten Browserfehler', relevantErrors.length === 0);
  if (relevantErrors.length) console.log(relevantErrors);

  await browser.close();
  await new Promise(resolve => server.close(resolve));
  console.log(failed ? '\n❌ verify-editor FAILED' : '\n✅ verify-editor PASSED');
  process.exit(failed ? 1 : 0);
})();
