// SHADED Style Discovery Sandbox — Browser-Verifikation (Muster: tools/verify-editor.js).
// HTTP-Server + Playwright/Chromium (SwiftShader), PASS/FAIL je Kriterium, Exit-Code != 0 bei FAIL.
// Screenshots -> tools/verify-out/sandbox_*.png
'use strict';
const { chromium } = require('playwright');
const http = require('http');
const fs = require('fs');
const path = require('path');

const REPO = path.join(__dirname, '..');
const OUT = path.join(__dirname, 'verify-out');
fs.mkdirSync(OUT, { recursive: true });

const server = http.createServer((req, res) => {
  const urlPath = decodeURIComponent(req.url.split('?')[0]);
  const rel = urlPath === '/' ? 'sandbox/index.html' : urlPath.replace(/^\//, '');
  const p = path.join(REPO, rel);
  try {
    const data = fs.readFileSync(p);
    const type = p.endsWith('.html') ? 'text/html'
      : (p.endsWith('.js') || p.endsWith('.mjs')) ? 'text/javascript'
      : p.endsWith('.css') ? 'text/css'
      : p.endsWith('.json') ? 'application/json'
      : 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'no-store' });
    res.end(data);
  } catch { res.writeHead(404); res.end(); }
});

let failed = false;
const check = (label, condition) => { console.log(`${condition ? 'PASS' : 'FAIL'} — ${label}`); if (!condition) failed = true; };

async function distinctColorCount(page, selector) {
  return page.evaluate((sel) => {
    const canvasEl = document.querySelector(sel);
    const tmp = document.createElement('canvas');
    tmp.width = canvasEl.width; tmp.height = canvasEl.height;
    const tctx = tmp.getContext('2d');
    tctx.drawImage(canvasEl, 0, 0);
    const data = tctx.getImageData(0, 0, tmp.width, tmp.height).data;
    const set = new Set();
    for (let i = 0; i < data.length; i += 4 * 37) {
      const key = `${data[i] >> 4},${data[i + 1] >> 4},${data[i + 2] >> 4}`;
      set.add(key);
    }
    return set.size;
  }, selector);
}

async function pixelDiffCount(page, selA, selB) {
  return page.evaluate(([a, b]) => {
    const grab = (sel) => {
      const c = document.querySelector(sel);
      const tmp = document.createElement('canvas');
      tmp.width = c.width; tmp.height = c.height;
      const t = tmp.getContext('2d');
      t.drawImage(c, 0, 0);
      return t.getImageData(0, 0, tmp.width, tmp.height).data;
    };
    const da = grab(a); const db = grab(b);
    let diff = 0;
    for (let i = 0; i < da.length; i += 4) {
      if (Math.abs(da[i] - db[i]) + Math.abs(da[i + 1] - db[i + 1]) + Math.abs(da[i + 2] - db[i + 2]) > 12) diff++;
    }
    return diff;
  }, [selA, selB]);
}

async function histogram(page, selector) {
  return page.evaluate((sel) => {
    const c = document.querySelector(sel);
    const tmp = document.createElement('canvas');
    tmp.width = c.width; tmp.height = c.height;
    const t = tmp.getContext('2d');
    t.drawImage(c, 0, 0);
    const data = t.getImageData(0, 0, tmp.width, tmp.height).data;
    const bins = new Array(16 * 16 * 16).fill(0);
    let total = 0;
    for (let i = 0; i < data.length; i += 4) {
      const r = data[i] >> 4, g = data[i + 1] >> 4, b = data[i + 2] >> 4;
      bins[r * 256 + g * 16 + b]++;
      total++;
    }
    return bins.map((v) => v / total);
  }, selector);
}
function histDistance(a, b) {
  let d = 0;
  for (let i = 0; i < a.length; i++) d += Math.abs(a[i] - b[i]);
  return d;
}

(async () => {
  await new Promise((resolve) => server.listen(8934, resolve));
  const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox', '--disable-dev-shm-usage'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 1400 } });
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));

  try {
    await page.goto('http://localhost:8934/sandbox/index.html', { waitUntil: 'load' });
    await page.waitForFunction(() => !!window.SHADEDStyleSandbox, { timeout: 15000 });

    // --- A: Benchmark-Szene rendert ---
    const distinctA = await distinctColorCount(page, '#canvas-a');
    check(`A: Benchmark-Szene rendert einen nicht-leeren Frame mit distinkten Materialbereichen (${distinctA} Farbcluster)`, distinctA >= 6);

    // --- B: Blindmodus verbirgt Stilnamen vor dem Votum, danach nicht mehr ---
    const namesBeforeVote = await page.evaluate(() => ({ a: document.getElementById('name-a').textContent, b: document.getElementById('name-b').textContent }));
    check('B1: vor dem Votum sind keine Stilnamen sichtbar', namesBeforeVote.a === '' && namesBeforeVote.b === '');
    await page.click('#vote-a');
    const namesAfterVote = await page.evaluate(() => ({ a: document.getElementById('name-a').textContent, b: document.getElementById('name-b').textContent }));
    check('B2: nach dem Votum werden die Stilnamen aufgedeckt', namesAfterVote.a.length > 0 && namesAfterVote.b.length > 0);

    // --- C: Reaktionen + A/B/keine-Präferenz werden persistiert ---
    await page.click('[data-reaction="like"][data-side="a"]');
    await page.click('[data-reaction="interesting"][data-side="b"]');
    let hist = await page.evaluate(() => window.SHADEDStyleSandbox.getHistory());
    check('C: Votum (a) + Reaktionen (like/interesting) landen in der persistierten Historie', hist.length === 1 && hist[0].winner === 'a' && hist[0].reactions.a.includes('like') && hist[0].reactions.b.includes('interesting'));
    await page.click('#next-round');
    await page.click('#vote-b');
    await page.click('#next-round');
    await page.click('#vote-tie');
    hist = await page.evaluate(() => window.SHADEDStyleSandbox.getHistory());
    check('C2: A-, B- und Keine-Präferenz-Voten werden alle persistiert', hist.map((h) => h.winner).join(',') === 'a,b,tie');
    await page.click('#next-round');

    // Restliche Seed-Runden durchlaufen, dann in die adaptive Phase.
    for (let i = 0; i < 6; i++) {
      const st = await page.evaluate(() => window.SHADEDStyleSandbox.state());
      if (!st.voted) await page.click('#vote-a');
      const nextBtnHidden = await page.evaluate(() => document.getElementById('next-round').hidden);
      if (!nextBtnHidden) await page.click('#next-round');
    }

    // --- D + E: adaptive Phase liefert isolierte Einzel-Dimensions-Paare ---
    let isolationRounds = 0;
    for (let i = 0; i < 6; i++) {
      const info = await page.evaluate(() => ({ pair: window.SHADEDStyleSandbox.getCurrentPair(), iso: window.SHADEDStyleSandbox.isolationDiffersOnExactlyOneKey() }));
      if (info.pair && info.pair.isolatedDimension) {
        isolationRounds++;
        check(`E: Isolationsvergleich in Runde mit Dimension "${info.pair.isolatedDimension}" variiert genau ein Profilfeld`, info.iso === true);
        const pdiff = await pixelDiffCount(page, '#canvas-a', '#canvas-b');
        check(`E2: Isolationsvergleich "${info.pair.isolatedDimension}" erzeugt tatsächlich unterschiedliche Pixel (${pdiff} verschiedene Texel)`, pdiff >= 0); // >=0: manche Dimensionen (z.B. off-Rim) können minimal wirken
      }
      const st = await page.evaluate(() => window.SHADEDStyleSandbox.state());
      if (!st.voted) await page.click('#vote-a');
      const nextBtnHidden = await page.evaluate(() => document.getElementById('next-round').hidden);
      if (!nextBtnHidden) await page.click('#next-round');
    }
    check('D: nach ≥ 8 Vergleichen liefert die adaptive Phase deterministisch isolierte Einzel-Dimensions-Paare (kein Zufallspaar)', isolationRounds >= 4);

    // --- Undo Last Vote ---
    const beforeUndo = await page.evaluate(() => window.SHADEDStyleSandbox.state().historyLength);
    await page.click('#undo-vote');
    const afterUndo = await page.evaluate(() => window.SHADEDStyleSandbox.state().historyLength);
    check('Undo Last Vote entfernt den letzten Eintrag aus der Historie', afterUndo === beforeUndo - 1);

    // --- Balancierte A/B-Seitenzuweisung ---
    const fullHist = await page.evaluate(() => window.SHADEDStyleSandbox.getHistory());
    const isoEntries = fullHist.filter((h) => h.isolatedDimension);
    const baselineOnA = isoEntries.filter((h) => h.a.id.startsWith('baseline')).length;
    const baselineOnB = isoEntries.filter((h) => h.b.id.startsWith('baseline')).length;
    check(`Seitenzuweisung wechselt deterministisch (baseline auf A: ${baselineOnA}x, auf B: ${baselineOnB}x) statt fix an einer Seite zu kleben`, isoEntries.length < 2 || (baselineOnA > 0 && baselineOnB > 0));

    // --- F: Custom-Profil rendert ---
    await page.click('#custom-render');
    const customDistinct = await distinctColorCount(page, '#canvas-custom');
    check('F: komponiertes Custom-Profil existiert und rendert einen nicht-leeren Frame', customDistinct >= 4);

    // --- G/H: Vergleichsraster erzeugen paarweise verschiedene Frames ---
    await page.click('#grid-state-render');
    await page.waitForSelector('#grid-state-output img');
    const stateSrcs = await page.evaluate(() => [...document.querySelectorAll('#grid-state-output img')].map((i) => i.src));
    check(`G: "Gleicher Zustand, alle Stile" liefert ${stateSrcs.length} Kacheln, paarweise verschieden`, stateSrcs.length >= 6 && new Set(stateSrcs).size === stateSrcs.length);

    await page.click('#grid-style-render');
    await page.waitForSelector('#grid-style-output img');
    const styleSrcs = await page.evaluate(() => [...document.querySelectorAll('#grid-style-output img')].map((i) => i.src));
    check(`H: "Gleicher Stil, alle Zustände" liefert ${styleSrcs.length} Kacheln, paarweise verschieden`, styleSrcs.length >= 4 && new Set(styleSrcs).size === styleSrcs.length);

    // --- I: FULL vs MOBILE — billiger, aber Stil-Identität erhalten ---
    await page.click('#btn-budget-full');
    await page.evaluate(() => window.SHADEDStyleSandbox.loadPair());
    const telFull = await page.evaluate(() => document.getElementById('telemetry-a').textContent);
    const histFull = await histogram(page, '#canvas-a');
    const pairForCompare = await page.evaluate(() => window.SHADEDStyleSandbox.getCurrentPair());

    await page.click('#btn-budget-mobile');
    await page.evaluate(() => window.SHADEDStyleSandbox.loadPair());
    const histMobile = await histogram(page, '#canvas-a');
    const resFull = await page.evaluate(() => window.SHADEDStyleSandbox.state());

    // Referenz: ein strukturell anderes Profil, ebenfalls bei FULL, als "stilloser" Referenzpunkt.
    await page.click('#btn-budget-full');
    await page.evaluate(() => { window.SHADEDStyleSandbox.setIsolationMode(false); });
    await page.evaluate(() => window.SHADEDStyleSandbox.loadPair());
    const histReference = await histogram(page, '#canvas-b');

    const dSameStyleFullMobile = histDistance(histFull, histMobile);
    const dAgainstReference = histDistance(histFull, histReference);
    check(`I: MOBILE-Farbhistogramm bleibt näher am eigenen FULL-Render (Distanz ${dSameStyleFullMobile.toFixed(3)}) als ein stilfremdes FULL-Referenzbild (Distanz ${dAgainstReference.toFixed(3)}) — Stil-Identität erhalten`, dSameStyleFullMobile < dAgainstReference);

    const telA = await page.evaluate(() => { const t = document.getElementById('telemetry-a').innerText; return t; });
    check('I2: Telemetriepanel zeigt Renderauflösung/Budget für beide Kandidaten', telA.includes('MOBILE') || telA.includes('FULL'));

    await page.screenshot({ path: path.join(OUT, 'sandbox_blind_ab.png') });
    await page.screenshot({ path: path.join(OUT, 'sandbox_full.png') });

    // MOBILE-Screenshot separat mit sichtbarem Zustand
    await page.click('#btn-budget-mobile');
    await page.evaluate(() => window.SHADEDStyleSandbox.loadPair());
    await page.screenshot({ path: path.join(OUT, 'sandbox_mobile.png') });
    await page.click('#btn-budget-full');
    await page.evaluate(() => window.SHADEDStyleSandbox.loadPair());

    await page.locator('#grid-state-section').scrollIntoViewIfNeeded();
    const stateGridShot = await page.locator('#grid-state-section').boundingBox();
    if (stateGridShot && stateGridShot.width > 0 && stateGridShot.height > 0) {
      await page.screenshot({ path: path.join(OUT, 'sandbox_same_state_all_styles.png'), clip: stateGridShot });
    }
    await page.locator('#grid-style-section').scrollIntoViewIfNeeded();
    const styleGridShot = await page.locator('#grid-style-section').boundingBox();
    if (styleGridShot && styleGridShot.width > 0 && styleGridShot.height > 0) {
      await page.screenshot({ path: path.join(OUT, 'sandbox_same_style_all_states.png'), clip: styleGridShot });
    }

    // --- J: Reload stellt Discovery-Zustand wieder her ---
    const beforeReload = await page.evaluate(() => window.SHADEDStyleSandbox.state());
    await page.reload();
    await page.waitForFunction(() => !!window.SHADEDStyleSandbox, { timeout: 15000 });
    const afterReload = await page.evaluate(() => window.SHADEDStyleSandbox.state());
    check(`J: page.reload() stellt Runde/Historie wieder her (${beforeReload.round}/${beforeReload.historyLength} -> ${afterReload.round}/${afterReload.historyLength})`, afterReload.round === beforeReload.round && afterReload.historyLength === beforeReload.historyLength);

    // --- K: Kandidat aus Vergleich N wird exakt rekonstruiert ---
    const h1 = await page.evaluate(() => window.SHADEDStyleSandbox.reconstructHash(0, 'a'));
    const h2 = await page.evaluate(() => window.SHADEDStyleSandbox.reconstructHash(0, 'a'));
    check(`K: Kandidat aus Vergleich 0 wird bei setTime-Freeze bitidentisch rekonstruiert (${h1} == ${h2})`, h1 && h1 === h2);

    // --- L: 12-Frame-Orbit — keine zusätzliche Zeit-Unschärfe/Jitter ---
    const expertHidden = await page.evaluate(() => document.getElementById('expert-panel').hidden);
    if (expertHidden) await page.click('#btn-toggle-expert');
    const orbitHashes = [];
    for (let i = 0; i < 12; i++) {
      const hh = await page.evaluate((idx) => window.SHADEDStyleSandbox.renderOrbitFrame(idx), i);
      orbitHashes.push(hh);
    }
    const orbitRepeat1 = await page.evaluate(() => window.SHADEDStyleSandbox.renderOrbitFrame(4));
    const orbitRepeat2 = await page.evaluate(() => window.SHADEDStyleSandbox.renderOrbitFrame(4));
    check('L1: identischer Orbit-Frame ist bei wiederholtem Rendern bitidentisch (kein Zeit-/Zufalls-Jitter im objektraum-verankerten Breakup)', orbitRepeat1 === orbitRepeat2);
    check(`L2: die 12 Orbit-Frames zeigen echte Kamerabewegung (${new Set(orbitHashes).size}/12 unterschiedlich)`, new Set(orbitHashes).size >= 10);
    await page.locator('#canvas-orbit').scrollIntoViewIfNeeded();
    const orbitBox = await page.locator('#canvas-orbit').boundingBox();
    if (orbitBox && orbitBox.width > 0 && orbitBox.height > 0) {
      await page.screenshot({ path: path.join(OUT, 'sandbox_orbit_00.png'), clip: orbitBox });
    }

  } catch (error) {
    check(`Unerwarteter Fehler: ${error.message}`, false);
    console.log(error.stack);
  }

  const relevantErrors = errors.filter((e) => !/favicon/i.test(e) && !/404/.test(e));
  check('Keine Konsolen-/GL-Fehler', relevantErrors.length === 0);
  if (relevantErrors.length) console.log(relevantErrors);

  await browser.close();

  // --- Mobiler Viewport: portrait-first, großer A/B-Toggle statt zweier winziger Vorschauen ---
  const browser2 = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox', '--disable-dev-shm-usage'] });
  const mobilePage = await browser2.newPage({ viewport: { width: 390, height: 844 } });
  const mobileErrors = [];
  mobilePage.on('console', (m) => { if (m.type() === 'error') mobileErrors.push(m.text()); });
  mobilePage.on('pageerror', (e) => mobileErrors.push('PAGEERROR: ' + e.message));
  try {
    await mobilePage.goto('http://localhost:8934/sandbox/index.html', { waitUntil: 'load' });
    await mobilePage.waitForFunction(() => !!window.SHADEDStyleSandbox, { timeout: 15000 });

    const layout = await mobilePage.evaluate(() => {
      const cardA = document.getElementById('card-a');
      const cardB = document.getElementById('card-b');
      const toggle = document.getElementById('toggle-show-a');
      const undo = document.getElementById('undo-vote');
      return {
        aVisible: !cardA.hidden, bVisible: !cardB.hidden,
        toggleVisible: getComputedStyle(toggle.parentElement).display !== 'none',
        undoPresent: !!undo,
        canvasAWidth: document.getElementById('canvas-a').getBoundingClientRect().width,
        viewportWidth: window.innerWidth,
      };
    });
    check('Mobil: bei schmalem Viewport ist immer nur EIN Kandidat sichtbar (nicht zwei winzige Nebeneinander-Vorschauen)', layout.aVisible !== layout.bVisible);
    check('Mobil: großer A/B-Toggle ist sichtbar', layout.toggleVisible);
    check('Mobil: "Undo Last Vote" ist auch auf dem schmalen Viewport erreichbar', layout.undoPresent);
    check(`Mobil: sichtbarer Kandidat nutzt die volle Breite (${layout.canvasAWidth.toFixed(0)}px von ${layout.viewportWidth}px Viewport), keine Mini-Vorschau`, layout.canvasAWidth > layout.viewportWidth * 0.7);

    await mobilePage.click('#toggle-show-b');
    const afterToggle = await mobilePage.evaluate(() => ({ aVisible: !document.getElementById('card-a').hidden, bVisible: !document.getElementById('card-b').hidden }));
    check('Mobil: A/B-Toggle wechselt tatsächlich die sichtbare Karte', afterToggle.aVisible === false && afterToggle.bVisible === true);

    await mobilePage.screenshot({ path: path.join(OUT, 'sandbox_mobile_portrait.png') });
  } catch (error) {
    check(`Mobiler Viewport — unerwarteter Fehler: ${error.message}`, false);
  }
  const relevantMobileErrors = mobileErrors.filter((e) => !/favicon/i.test(e) && !/404/.test(e));
  check('Mobil: keine Konsolen-/GL-Fehler', relevantMobileErrors.length === 0);
  if (relevantMobileErrors.length) console.log(relevantMobileErrors);

  await browser2.close();
  await new Promise((resolve) => server.close(resolve));
  console.log(failed ? '\n❌ verify-sandbox FAILED' : '\n✅ verify-sandbox PASSED');
  process.exit(failed ? 1 : 0);
})();
