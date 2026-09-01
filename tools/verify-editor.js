// SHADED Editor — focused browser verification for the floating workspace shell.
const { chromium } = require('playwright');
const http = require('http');
const fs = require('fs');
const path = require('path');

const REPO = path.join(__dirname, '..');
const OUT = path.join(__dirname, 'verify-out');
fs.mkdirSync(OUT, { recursive: true });

const CI_SCENE_PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAADAAAAAgCAIAAADbtmxLAAAAoklEQVR4nGOsmLaFYTABpoF2ADoYdRAhMOogQmDQOYiFFobeuHGDeMUaGhrI3EEXQoPOQTijzObNMuJNOSISRQ3HMDAMwhAadRAhMOogQgAll705MgnB0RAh3hQUjQwMDCJuJOkVscmDcwddCI06iBAYdRAhMOogQmDQOQhn82PDjTf0dAcc0KQJK/JmF9l6B12UjTqIEBh0DkJJ1MjNgIECAPPWFRTYINHRAAAAAElFTkSuQmCC', 'base64');

const server = http.createServer((req, res) => {
  const urlPath = decodeURIComponent(req.url.split('?')[0]);
  const rel = urlPath === '/' ? 'index.html' : urlPath.replace(/^\//, '');
  const p = path.join(REPO, rel);
  try {
    const data = fs.readFileSync(p);
    const type = p.endsWith('.html') ? 'text/html' : p.endsWith('.js') || p.endsWith('.mjs') ? 'text/javascript' : p.endsWith('.css') ? 'text/css' : p.endsWith('.json') || p.endsWith('.webmanifest') ? 'application/json' : 'image/png';
    res.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'no-store' }); res.end(data);
  } catch { res.writeHead(404); res.end(); }
});

let failed = false;
const check = (label, condition) => { console.log(`${condition ? 'PASS' : 'FAIL'} — ${label}`); if (!condition) failed = true; };

(async () => {
  await new Promise(resolve => server.listen(8932, resolve));
  const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox', '--disable-dev-shm-usage'] });
  const page = await browser.newPage({ viewport: { width: 1500, height: 950 } });
  const errors = [];
  page.on('console', m => {
    if (m.type() === 'error') {
      errors.push(m.text());
      if (/depth|model|webgl|spatial|world|pipeline/i.test(m.text()) && !/favicon/i.test(m.text())) console.log(`PAGE-ERROR[${m.type()}]: ${m.text()}`);
    }
  });
  page.on('pageerror', e => { errors.push('PAGEERROR: ' + e.message); console.log('PAGEERROR:', e.message); });

  try {
    await page.goto('http://localhost:8932/index.html', { waitUntil: 'load' });
    await page.waitForFunction(() => !!window.SHADED, { timeout: 15000 });

    const shell = await page.evaluate(() => ({
      worldStudioHidden: getComputedStyle(document.getElementById('world-studio')).display === 'none',
      reconstruct: !!document.getElementById('panel-reconstruct'),
      debug: !!document.getElementById('panel-debug'),
      project: !!document.getElementById('panel-project'),
      toolbar: !!document.getElementById('workspace-view-toolbar'),
      bottomDock: !!document.getElementById('workspace-bottom-dock'),
      railButtons: document.querySelectorAll('.tool-rail .rail-btn[data-target]').length,
      engineFrame: !!document.getElementById('engine-frame'),
      worldDemo: !!document.getElementById('world-demo'),
      providerFiles: !!document.getElementById('world-provider-files'),
      providerFolder: !!document.getElementById('world-provider-folder'),
    }));
    check('Altes World-Studio-Overlay ist visuell ersetzt', shell.worldStudioHidden);
    check('Workspace-Shell hat Reconstruct/Debug/Project', shell.reconstruct && shell.debug && shell.project);
    check('Viewport-Toolbar und Bottom-Dock existieren', shell.toolbar && shell.bottomDock);
    check(`Workspace-Rail ist vollständig (${shell.railButtons} Bereiche)`, shell.railButtons >= 10);
    check('World-Studio Runtime bleibt als unsichtbare Bridge vorhanden', shell.worldDemo && shell.providerFiles && shell.providerFolder);
    check('Keine iframe-Engine mehr (Canvas läuft im selben Dokument)', !shell.engineFrame);

    // Trigger the hidden compatibility bridge directly; the visible shell no longer exposes the old onboarding overlay.
    await page.evaluate(() => document.getElementById('world-demo')?.click());
    await page.waitForFunction(() => window.SHADEDWorldStudio?.state?.().hasImage, { timeout: 15000 });
    check('Demo bleibt über bestehende World-Studio-Bridge verdrahtet', true);

    await page.locator('#world-file').setInputFiles({ name: 'ci-spatial-fixture.png', mimeType: 'image/png', buffer: CI_SCENE_PNG });
    await page.waitForFunction(() => document.getElementById('world-file-title')?.textContent === 'ci-spatial-fixture.png', { timeout: 10000 });
    await page.evaluate(() => document.getElementById('world-generate')?.click());
    await page.waitForFunction(() => window.SHADEDWorldStudio?.state?.().worldReady, { timeout: 60000 });
    check('Unsichtbare Runtime-Bridge erzeugt weiterhin die Welt', true);
    check('Raumansicht endet direkt im Laufmodus', await page.evaluate(() => window.SHADED.spatial.viewer.state().mode === 'walk'));

    // New shell: tools are directly available, no ERWEITERT gate.
    const worldButton = page.locator('.rail-btn[data-target="panel-world"]');
    await worldButton.waitFor({ state: 'visible', timeout: 10000 });
    await worldButton.click();
    check('World-Workspace öffnet den Inspector', await page.evaluate(() => document.body.classList.contains('inspector-open')));
    await page.locator('#panel-world').waitFor({ state: 'visible', timeout: 10000 });

    const before = await page.evaluate(() => window.SHADED.getParams().storm);
    await page.locator('#sliders input#s-storm').waitFor({ state: 'attached', timeout: 10000 });
    await page.fill('#sliders input#s-storm', '90');
    await page.dispatchEvent('#sliders input#s-storm', 'input');
    const after = await page.evaluate(() => window.SHADED.getParams().storm);
    check(`Parameter bleibt live verdrahtet (${before} -> ${after})`, Math.abs(after - 0.9) < 1e-6);

    await page.locator('.rail-btn[data-target="panel-reconstruct"]').click();
    check('Reconstruct-Workspace ist erreichbar', await page.locator('#panel-reconstruct').isVisible());
    check('Bottom-Dock zeigt Live-Pipeline-Struktur', await page.locator('#workspace-bottom-dock').isVisible());

    await page.screenshot({ path: path.join(OUT, 'editor_workspace_shell.png') });
  } catch (error) {
    const diagnostic = await page.evaluate(() => ({
      world: window.SHADEDWorldStudio?.state?.() || null,
      status: document.getElementById('world-status')?.textContent || '',
      inspector: document.body.classList.contains('inspector-open'),
    })).catch(() => null);
    check(`Unerwarteter Fehler: ${error.message}${diagnostic ? ` | ${JSON.stringify(diagnostic)}` : ''}`, false);
    console.log('All errors:', errors.slice(0, 10));
  }

  const relevantErrors = errors.filter(error => !/404/.test(error) && !/favicon/i.test(error) && !/Modell nicht gefunden/.test(error));
  check('Keine relevanten Browserfehler', relevantErrors.length === 0);
  if (relevantErrors.length) console.log(relevantErrors);

  await browser.close();
  await new Promise(resolve => server.close(resolve));
  console.log(failed ? '\n❌ verify-editor FAILED' : '\n✅ verify-editor PASSED');
  process.exit(failed ? 1 : 0);
})();
