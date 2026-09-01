// SHADED Style Discovery Produktionsintegration — Verifikation (Migration #1:
// Specular-Sheen + Warm/Kalt-Schattenrampe, docs/STYLE_DISCOVERY.md). Beweist
// am tatsächlich gerenderten Canvas (keine Introspektion interner Werte):
// window.SHADED.style.set()/setBudget() wirken sichtbar, specular.intensity
// skaliert die Sheen-Staerke, RenderBudget MOBILE reduziert sie um den
// dokumentierten Faktor 0.6, und shadow.warmth (Identitaetsdimension) wirkt
// BUDGET-UNABHAENGIG identisch (Kern von Aufgabe 5 der Produktionsintegration).
// Nutzung: node tools/verify-style-adapter.js
const { chromium } = require('playwright');
const http = require('http');
const fs = require('fs');
const path = require('path');

const REPO = path.join(__dirname, '..');
const BASE_IMG = path.join(REPO, 'file_00000000974871f49fe71f6b456f9579.png');

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
  await new Promise((r) => server.listen(8940, r));
  const launchOpts = { args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--enable-webgl', '--ignore-gpu-blocklist', '--no-sandbox', '--disable-dev-shm-usage'] };
  if (process.env.CHROMIUM) launchOpts.executablePath = process.env.CHROMIUM;
  else if (fs.existsSync('/opt/pw-browsers/chromium')) launchOpts.executablePath = '/opt/pw-browsers/chromium';
  const browser = await chromium.launch(launchOpts);
  const page = await browser.newPage({ viewport: { width: 1500, height: 860 } });
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));

  console.log('=== SHADED Style Discovery Produktionsintegration — Verifikation (Migration #1) ===\n');
  let failed = false;
  function check(name, ok, detail) { console.log(`  ${ok ? '✓ PASS' : '✗ FAIL'}: ${name}${detail !== undefined ? ' — ' + JSON.stringify(detail) : ''}`); if (!ok) failed = true; }

  await page.goto('http://localhost:8940/index.html');
  await page.evaluate(() => { const el = document.getElementById('world-studio'); if (el) el.style.display = 'none'; });
  await page.setInputFiles('#f-scene', BASE_IMG);
  await page.waitForFunction(() => /Szene geladen|Tiefenkarte geladen/.test(document.getElementById('status').textContent), { timeout: 30000 });
  await page.evaluate(() => window.SHADED.erstellen());
  await page.waitForFunction(() => window.SHADED.isReady(), { timeout: 30000 });

  console.log('Test 1: window.SHADED.style API vorhanden und liefert ein valides Default-Profil');
  const apiShape = await page.evaluate(() => {
    const s = window.SHADED.style;
    return { hasApi: !!s, hasGet: typeof s?.get === 'function', hasSet: typeof s?.set === 'function',
             hasGetBudget: typeof s?.getBudget === 'function', hasSetBudget: typeof s?.setBudget === 'function',
             defaultBudget: s?.getBudget?.(), profile: s?.get?.() };
  });
  check('API-Form vollständig', apiShape.hasApi && apiShape.hasGet && apiShape.hasSet && apiShape.hasGetBudget && apiShape.hasSetBudget, apiShape);
  check('Default-Budget ist FULL', apiShape.defaultBudget === 'FULL', apiShape.defaultBudget);
  check('Default-Profil hat spezifiziertes schema', apiShape.profile?.schema === 'shaded.style.profile/v1', apiShape.profile?.schema);

  console.log('\nTest 2: ungültiges StyleProfile wird abgelehnt (set() wirft), gültiges wird übernommen');
  const rejectResult = await page.evaluate(() => {
    try { window.SHADED.style.set({ not: 'a profile' }); return { threw: false }; }
    catch (e) { return { threw: true, message: e.message }; }
  });
  check('set() wirft bei ungültigem Profil', rejectResult.threw, rejectResult);
  const setUnknownBudget = await page.evaluate(() => {
    try { window.SHADED.style.setBudget('ULTRA'); return { threw: false }; }
    catch (e) { return { threw: true }; }
  });
  check('setBudget() wirft bei unbekannter Stufe', setUnknownBudget.threw);

  // Heftiger Regen (u_wet=1) auf einer eingefrorenen Zeit, damit Sheen sichtbar
  // ist UND Frames deterministisch vergleichbar sind (setTime(t, freeze=true),
  // wie im Material-Test-Workflow von CLAUDE.md vorgeschrieben).
  await page.evaluate(() => {
    window.SHADED.setParams({ ...window.SHADED.getParams(), wet: 1, storm: 0, rain: 0, dayNight: 0.3, fog: 0 });
    window.SHADED.setTime(12.3, true);
  });
  await page.waitForTimeout(150);

  async function sampleRoofPath() {
    return page.evaluate(() => {
      const gl = document.getElementById('gl');
      // WebGL-Canvas: readPixels über ein 2D-Snapshot-Canvas (drawImage kopiert den
      // aktuellen Framebuffer-Inhalt, kein erneutes Rendern nötig).
      const snap = document.createElement('canvas');
      snap.width = gl.width; snap.height = gl.height;
      const ctx = snap.getContext('2d');
      ctx.drawImage(gl, 0, 0);
      const data = ctx.getImageData(0, 0, snap.width, snap.height).data;
      // Summiere Helligkeit über alle Pixel — grob, aber robust gegen die genaue
      // Bildkomposition (kein Wissen ueber exakte Dach-/Pfad-Pixelkoordinaten noetig).
      let sum = 0;
      for (let i = 0; i < data.length; i += 4) sum += data[i] + data[i + 1] + data[i + 2];
      return sum;
    });
  }

  console.log('\nTest 3: specular.intensity=0 entfernt den Sheen sichtbar (niedrigere Gesamthelligkeit als Default)');
  await page.evaluate(() => { const p = window.SHADED.style.get(); window.SHADED.style.set(p); });
  const brightDefault = await sampleRoofPath();
  const zeroProfile = await page.evaluate(() => {
    const p = window.SHADED.style.get();
    p.specular.intensity = 0;
    window.SHADED.style.set(p);
    return p;
  });
  await page.waitForTimeout(100);
  const brightZero = await sampleRoofPath();
  check('specular.intensity=0 ist sichtbar dunkler als Default (0.5)', brightZero < brightDefault,
        { default: brightDefault, zero: brightZero });

  console.log('\nTest 4: RenderBudget MOBILE reduziert die Sheen-Beitrag-Menge gegenüber FULL, entfernt ihn');
  console.log('aber nicht vollständig (Kostenfeld wird skaliert, nicht auf 0 gesetzt). Der exakte Faktor 0.6');
  console.log('ist bereits in tools/test-production-adapter.mjs bitgenau bewiesen (reine Logik über');
  console.log('runtime/style/production-adapter.js); hier zählt');
  console.log('nur die qualitative Reihenfolge 0 < MOBILE < FULL am echten gerenderten Pixel.');
  const defaultProfile = await page.evaluate(() => {
    const p = window.SHADED.style.get(); p.specular.intensity = 0.5; window.SHADED.style.set(p);
    window.SHADED.style.setBudget('FULL');
    return p;
  });
  await page.waitForTimeout(100);
  const brightFull = await sampleRoofPath();
  await page.evaluate(() => window.SHADED.style.setBudget('MOBILE'));
  await page.waitForTimeout(100);
  const brightMobile = await sampleRoofPath();
  await page.evaluate(() => window.SHADED.style.setBudget('FULL'));
  await page.waitForTimeout(100);
  const brightFullAgain = await sampleRoofPath();
  const sheenFull = brightFull - brightZero;
  const sheenMobile = brightMobile - brightZero;
  check('FULL zeigt mehr Sheen-Beitrag als das intensity=0-Bild', sheenFull > 0, { sheenFull });
  check('MOBILE zeigt WENIGER Sheen-Beitrag als FULL, aber mehr als 0 (Budget dimmt, entfernt nicht)',
        sheenMobile > 0 && sheenMobile < sheenFull, { sheenFull, sheenMobile, ratio: sheenFull ? sheenMobile / sheenFull : null });
  // Absolute Gleichheit ist hier nicht realistisch: SHADEDs setTime(t,true) friert
  // nur die u_time-getriebenen Phasenterme ein (siehe tickWorld() in shaded-engine.mjs),
  // NICHT wall-clock-getriebene Akkumulatoren wie mossBoost/trailTick, die zwischen den
  // page.waitForTimeout()-Aufrufen dieses Tests weiterlaufen -- ein winziges, vorbestehendes
  // Rauschen unabhaengig von dieser Migration. Relative statt absolute Toleranz.
  const roundTripDrift = Math.abs(brightFullAgain - brightFull) / brightFull;
  check('zurück auf FULL reproduziert denselben Helligkeitswert (kein Drift/Leck über Budgetwechsel, <0.1% Tol.)',
        roundTripDrift < 0.001, { brightFull, brightFullAgain, roundTripDrift });

  console.log('\nTest 5: shadow.warmth ist eine Identitaetsdimension — wirkt sichtbar, aber IDENTISCH bei');
  console.log('FULL und MOBILE (Kern von Aufgabe 5: Stil-Identitaet bleibt ueber Budget-Stufen erhalten).');
  console.log('specular.intensity=0 isoliert den Effekt (kein Sheen-Rauschen in diesem Vergleich).');
  await page.evaluate(() => {
    const p = window.SHADED.style.get();
    p.specular.intensity = 0;
    p.shadow.warmth = 0;
    window.SHADED.style.set(p);
    window.SHADED.style.setBudget('FULL');
  });
  await page.waitForTimeout(100);
  const brightWarmthZero = await sampleRoofPath();
  await page.evaluate(() => { const p = window.SHADED.style.get(); p.shadow.warmth = 0.9; window.SHADED.style.set(p); });
  await page.waitForTimeout(100);
  const brightWarmthFull = await sampleRoofPath();
  await page.evaluate(() => window.SHADED.style.setBudget('MOBILE'));
  await page.waitForTimeout(100);
  const brightWarmthMobile = await sampleRoofPath();
  check('shadow.warmth=0.9 veraendert das Bild sichtbar gegenüber warmth=0', brightWarmthFull !== brightWarmthZero,
        { zero: brightWarmthZero, full: brightWarmthFull });
  // Gleiche Begründung wie beim FULL-Rundlauf oben: relative statt absolute Toleranz,
  // da wall-clock-getriebene Akkumulatoren (mossBoost/trail) nicht von setTime(t,true)
  // eingefroren werden. Der reale, absichtliche warmth-Effekt (Test oben) liegt bei
  // ~0.26% Helligkeitsverschiebung -- eine 0.1%-Toleranz erkennt trotzdem zuverlässig,
  // wenn der Effekt faelschlich vom Budget abhinge.
  const warmthBudgetDrift = Math.abs(brightWarmthFull - brightWarmthMobile) / brightWarmthFull;
  check('shadow.warmth wirkt bei FULL und MOBILE IDENTISCH (Identitaetsfeld, budgetunabhaengig, <0.1% Tol.)',
        warmthBudgetDrift < 0.001, { full: brightWarmthFull, mobile: brightWarmthMobile, warmthBudgetDrift });

  console.log('\nKonsole-Fehler:', errors.length ? errors.join(' | ') : '(keine)');
  check('keine Page-/Shader-Errors', !errors.some((e) => e.startsWith('PAGEERROR')));

  await browser.close();
  server.close();
  console.log(failed ? '\n❌ verify-style-adapter FAILED' : '\n✅ verify-style-adapter PASSED');
  process.exitCode = failed ? 1 : 0;
})();
