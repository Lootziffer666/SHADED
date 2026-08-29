// SHADED Editor — focused browser verification for the current viewport-first editor.
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
      if (/depth|model|webgl|spatial|world|pipeline/i.test(m.text()) && !/favicon/i.test(m.text())) {
        console.log(`PAGE-ERROR[${m.type()}]: ${m.text()}`);
      }
    }
  });
  page.on('pageerror', e => { errors.push('PAGEERROR: ' + e.message); console.log('PAGEERROR:', e.message); });

  try {
    await page.goto('http://localhost:8932/index.html', { waitUntil: 'load' });
    await page.waitForFunction(() => !!window.SHADED, { timeout: 15000 });

    const shell = await page.evaluate(() => ({
      storyButton: !!document.getElementById('tool-story'),
      timelineDock: !!document.getElementById('timeline-dock'),
      worldDemo: !!document.getElementById('world-demo'),
      providerFiles: !!document.getElementById('world-provider-files'),
      providerFolder: !!document.getElementById('world-provider-folder'),
      linkEditor: !!document.getElementById('link-editor'),
      engineFrame: !!document.getElementById('engine-frame'),
    }));
    check('Story-Button ist entfernt', !shell.storyButton);
    check('Timeline-Dock ist entfernt', !shell.timelineDock);
    check('World Studio hat direkten Demo-Button', shell.worldDemo);
    check('World Studio kann bestehende DA2/DA3-Dateien laden', shell.providerFiles && shell.providerFolder);
    check('Kein "Editor öffnen"-Link mehr (SHADED ist der Editor, ein Dokument)', !shell.linkEditor);
    check('Keine iframe-Engine mehr (Canvas läuft im selben Dokument)', !shell.engineFrame);

    await page.locator('#world-demo').click();
    await page.waitForFunction(() => window.SHADEDWorldStudio?.state?.().hasImage, { timeout: 15000 });
    check('Demo wird direkt in den World-Studio-Workflow geladen', true);

    // Die kanonische Demo ist hochauflösend; deren vollständige Materialanalyse blockiert
    // schwache CI-CPUs. Verwende ein kleines CI-Fixture-Bild für die Weltgenerierung,
    // analog zum mobile-Verify-Test.
    await page.locator('#world-file').setInputFiles({ name: 'ci-spatial-fixture.png', mimeType: 'image/png', buffer: CI_SCENE_PNG });
    await page.waitForFunction(() => document.getElementById('world-file-title')?.textContent === 'ci-spatial-fixture.png', { timeout: 10000 });

    await page.locator('#world-generate').click();
    await page.waitForFunction(() => window.SHADEDWorldStudio?.state?.().worldReady, { timeout: 60000 });
    check('World Studio erzeugt ohne manuelle Depth-Datei eine Welt', true);
    check('Raumansicht endet direkt im Laufmodus', await page.evaluate(() => window.SHADED.spatial.viewer.state().mode === 'walk'));

    const before = await page.evaluate(() => window.SHADED.getParams().storm);
    // World Studio hides Rail + Inspector standardmäßig; ERWEITERT deckt sie auf und
    // klappt sein eigenes Panel ein — kurz warten, bis das Einklappen abgeschlossen ist,
    // sonst überlappt der World-Studio-Header noch den ersten Rail-Button.
    await page.locator('.world-studio-expert').click();
    await page.waitForFunction(() => document.getElementById('world-studio')?.classList.contains('collapsed'), { timeout: 10000 }).catch(() => {});
    await page.locator('.rail-btn[data-target="panel-world"]').waitFor({ state: 'visible', timeout: 10000 });
    await page.locator('.rail-btn[data-target="panel-world"]').click();
    await page.locator('#panel-world').waitFor({ state: 'visible', timeout: 10000 });
    // #sliders wird von runtime/shaded-engine.mjs selbst befüllt (s-<key>/v-<key>),
    // nicht mehr von einer zweiten editor/app.js-Implementierung dupliziert. Die
    // Engine legt für dieselbe ID zusätzlich einen unsichtbaren Body-Stub an
    // (ENGINE_STUB_IDS läuft vor dem eigenen Slider-Builder) — auf #sliders
    // scopen, um den echten, sichtbaren Regler eindeutig zu treffen.
    await page.locator('#sliders input#s-storm').waitFor({ state: 'attached', timeout: 10000 });
    await page.fill('#sliders input#s-storm', '90');
    await page.dispatchEvent('#sliders input#s-storm', 'input');
    const after = await page.evaluate(() => window.SHADED.getParams().storm);
    check(`Parameter bleibt live verdrahtet (${before} -> ${after})`, Math.abs(after - 0.9) < 1e-6);

    await page.screenshot({ path: path.join(OUT, 'editor_world_studio.png') });
  } catch (error) {
    const diagnostic = await page.evaluate(() => ({
      world: window.SHADEDWorldStudio?.state?.() || null,
      status: document.getElementById('world-status')?.textContent || '',
      stages: [...document.querySelectorAll('.world-progress-row')].map(row => ({ stage: row.dataset.stage, className: row.className, status: row.querySelector('small')?.textContent || '' }))
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
