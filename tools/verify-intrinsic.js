// SHADED Materialschicht-Verifikation: Licht/Material-Trennung (erster vertikaler Schnitt)
// Siehe docs/neuronale-materialien-svbrdf-pbr.md §12.
// Nutzung: npm i playwright && node tools/verify-intrinsic.js
//
// Beweisziele:
//   1. Fallback identity-albedo   – u_intrinsic=0 rendert wie bisher
//   2. Die Zerlegung wirkt        – u_intrinsic=1 verändert das Bild sichtbar
//   3. Invariante 2 bleibt        – classGrid/getMaterialTypeAt sind identisch
//   4. Doppelbeschattung behoben  – Schatten saufen bei Nässe nicht mehr ab
//   5. Externer Provider          – intrinsic.set() nimmt ein fremdes Feld an
//   6. Providerausfall            – clear() fällt auf den Ausgangszustand zurück
//   7. Provenienz/Metadaten       – Kanalvertrag ist vollständig und persistent
//   8. Dykstra-Projektion         – Energieneutralität UND Albedo-Gamut gleichzeitig,
//                                   fremde Felder werden gemessen statt verbogen
const { chromium } = require('playwright');
const http = require('http');
const fs = require('fs');
const path = require('path');

const REPO = path.join(__dirname, '..');
const OUT = path.join(__dirname, 'verify-out');
fs.mkdirSync(OUT, { recursive: true });
const BASE_IMG = path.join(REPO, 'file_00000000974871f49fe71f6b456f9579.png');
const MARKER_IMG = path.join(REPO, 'file_00000000c84071f4bcd6ff9afdba7246.png');

// Schalter fuer den Companion-Test: erst im zweiten Durchgang liefert der Server
// eine "<szene>_shading.png" aus. Als Inhalt dienen die Bytes der vorhandenen
// Tiefenkarte - ein echtes Graustufenbild, kein neues Binaerfile im Repo.
let serveShadingCompanion = false;
const SHADING_URL = 'file_00000000974871f49fe71f6b456f9579_shading.png';
const DEPTH_IMG = path.join(REPO, 'file_00000000974871f49fe71f6b456f9579_depth.png');

const server = http.createServer((req, res) => {
  const urlPath = decodeURIComponent(req.url.split('?')[0]).replace(/^\//, '');
  if (urlPath === 'favicon.ico') { res.writeHead(204); res.end(); return; }
  if (urlPath === SHADING_URL) {
    if (!serveShadingCompanion) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'Content-Type': 'image/png' });
    res.end(fs.readFileSync(DEPTH_IMG));
    return;
  }
  let p = path.join(REPO, urlPath || 'index.html');
  if (p === REPO + '/' || p === REPO) p = path.join(REPO, 'index.html');
  try {
    const data = fs.readFileSync(p);
    res.writeHead(200, { 'Content-Type': p.endsWith('.html') ? 'text/html' : 'image/png' });
    res.end(data);
  } catch (e) { res.writeHead(404); res.end(); }
});

const results = [];
function check(ok, label, detail) {
  results.push(!!ok);
  console.log(`  ${ok ? '✓ PASS' : '✗ FAIL'}: ${label}${detail ? ' (' + detail + ')' : ''}`);
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
// Optionale Companion-Dateien: die Engine sucht neben "bild.png" automatisch eine
// "bild_depth.png" (2.5D) und eine "bild_shading.png" (Materialschicht). Fehlen sie,
// ist das der Normalfall - Chromium loggt den Fehlversuch trotzdem als 404. Genau
// diese Treffer werden abgezogen, jeder andere 404 bleibt ein echter Fehler.
const isCompanionProbe = (u) => /_(depth|shading)\.(png|jpe?g|webp)(\?|$)/i.test(u);
const dropCompanion404 = (list, count) => {
  let out = list.slice();
  for (let i = 0; i < count; i++) {
    const idx = out.findIndex((e) => /status of 404|HTTP 404/.test(e));
    if (idx < 0) break;
    out = out.filter((_, k) => k !== idx);
  }
  return out;
};
  let benign404 = 0;
  page.on('response', r => { if (r.status() === 404 && isCompanionProbe(r.url())) benign404++; });

  console.log('=== SHADED Materialschicht-Verifikation (Intrinsic Decomposition) ===\n');

  await page.goto('http://localhost:8933/index.html');
  await page.setInputFiles('#f-scene', BASE_IMG);
  await page.waitForFunction(() => /Szene geladen|Tiefenkarte geladen/.test(document.getElementById('status').textContent));
  await page.setInputFiles('#f-mat', MARKER_IMG);
  await page.waitForFunction(() => document.getElementById('status').textContent.includes('Material-Map geladen'));
  await page.click('#btn-create');
  await page.waitForFunction(() => window.SHADED.isReady());

  // Deterministische Frames: feste Zeit, kein Parallax-Versatz
  await page.evaluate(() => { window.SHADED.parallax.set(0, 0); });

  const shot = async (file) => {
    const el = await page.$('#stage');
    await page.screenshot({ path: path.join(OUT, file), clip: await el.boundingBox() });
  };
  // Frame-Abgriff in fester Auflösung. Mit eingefrorener Zeit (setTime(t,true))
  // sind aufeinanderfolgende Frames identisch – Unterschiede stammen dann
  // ausschliesslich aus der Materialschicht.
  const frame = () => page.evaluate(() => {
    const gl = document.getElementById('gl');
    const c = document.createElement('canvas'); c.width = 240; c.height = 135;
    c.getContext('2d').drawImage(gl, 0, 0, 240, 135);
    return Array.from(c.getContext('2d').getImageData(0, 0, 240, 135).data);
  });
  const diff = (a, b) => {
    let s = 0, n = 0;
    for (let i = 0; i < a.length; i += 4) { s += Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]); n += 3; }
    return +(s / n).toFixed(3);
  };
  const same = (a, b) => a.length === b.length && a.every((v, i) => v === b[i]);
  // freeze=true friert die Zeit ein -> Frames sind deterministisch vergleichbar
  const setAct = async (act, time) => {
    await page.evaluate(([a, t]) => { window.SHADED.applyAct(a); window.SHADED.setTime(t, true); }, [act, time]);
    await page.waitForTimeout(250);
  };
  const classes = () => page.evaluate(() => {
    const c = {}, W = 192, H = 108;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const m = window.SHADED.getMaterialTypeAt((x + 0.5) / W, (y + 0.5) / H);
      c[m] = (c[m] || 0) + 1;
    } return c;
  });
  // Mittlere Helligkeit der dunkelsten 20 % des Bildes – misst das Absaufen
  const shadowFloor = () => page.evaluate(() => {
    const gl = document.getElementById('gl');
    const c = document.createElement('canvas'); c.width = 240; c.height = 135;
    c.getContext('2d').drawImage(gl, 0, 0, 240, 135);
    const d = c.getContext('2d').getImageData(0, 0, 240, 135).data;
    const lums = [];
    for (let i = 0; i < d.length; i += 4) lums.push(d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114);
    lums.sort((a, b) => a - b);
    const n = Math.max(1, Math.floor(lums.length * 0.2));
    let s = 0; for (let i = 0; i < n; i++) s += lums[i];
    return +(s / n).toFixed(2);
  });

  // --- 1) Ausgangszustand: Zerlegung liegt vor, ist aber AUS -----------------
  console.log('1) Ausgangszustand und Kanalvertrag');
  const st0 = await page.evaluate(() => window.SHADED.intrinsic.state());
  check(st0.strength === 0, 'Default ist identity-albedo (strength=0)', `strength=${st0.strength}`);
  check(st0.hasShading === true, 'Eingebautes Backend hat ein Shading-Feld erzeugt');
  check(st0.provenance === 'INFERRED', 'Provenienz ist INFERRED, nicht OBSERVED', st0.provenance);
  const metaOk = !!(st0.provider && st0.providerVersion && st0.channelSetId &&
                    st0.colorSpace && st0.colorSpace.albedo && st0.colorSpace.shading &&
                    typeof st0.confidence === 'number' && st0.resolution.w > 0);
  check(metaOk, 'Kanalvertrag vollständig (provider/version/channelSet/colorSpace/confidence/resolution)',
        `${st0.provider}@${st0.providerVersion}, conf=${st0.confidence}`);
  // Dykstra-Projektion: erfüllt das Feld BEIDE konvexen Bedingungen gleichzeitig?
  const proj = st0.projection || {};
  check(proj.algorithm === 'dykstra' && proj.iterations > 0 && proj.iterations <= 60,
        'Shading-Feld ist Dykstra-projiziert und konvergiert', `${proj.iterations} Iterationen`);
  check(typeof proj.meanError === 'number' && proj.meanError < 0.01,
        'Energieneutralität: Mittelwert trifft das Ziel', `mean=${proj.meanShading}, Fehler=${proj.meanError}`);
  check(st0.gamut && st0.gamut.pixels === 0,
        'Kein Pixel mit Reflektanz über 1 (Albedo-Gamut erfüllt)',
        `${st0.gamut ? st0.gamut.percent : '?'} %`);

  const shSpread = await page.evaluate(() => {
    let mn = 9, mx = -9;
    for (let y = 0; y < 40; y++) for (let x = 0; x < 40; x++) {
      const s = window.SHADED.intrinsic.sample((x + 0.5) / 40, (y + 0.5) / 40);
      mn = Math.min(mn, s); mx = Math.max(mx, s);
    } return { mn: +mn.toFixed(3), mx: +mx.toFixed(3) };
  });
  check(shSpread.mx - shSpread.mn > 0.15, 'Shading-Feld hat echte Dynamik (kein konstantes Feld)',
        `${shSpread.mn} … ${shSpread.mx}`);

  // --- 2) Fallback identity-albedo -----------------------------------------
  console.log('\n2) Fallback identity-albedo (u_intrinsic = 0)');
  // Gemessen wird auf einem ruhigen, nassen Akt: bei Sturm/Regen/Blitz uebertoent
  // die Eigenanimation jede Materialwirkung. Sturmnacht-Screenshots folgen unten.
  const MACT = 'danach', MT = 12;
  await setAct(MACT, MT);
  await shot('shot_intrinsic_off.png');
  const offA = await frame();
  const classesOff = await classes();
  await setAct(MACT, MT);
  const offB = await frame();
  // Auch bei eingefrorener Zeit laufen langsame Zustaende weiter (mossBoost,
  // Trail-Decay). Diese Restdrift ist die Messbasis, gegen die alles andere
  // verglichen wird – nicht Bit-Gleichheit.
  const drift = diff(offA, offB);
  check(drift < 0.05, 'Messbasis stabil: Restdrift bei eingefrorener Zeit ist vernachlässigbar', `Δ=${drift}`);

  // Härtetest: ein pathologisches Fremdfeld (konstant 0.6 = alles deutlich
  // dunkler) darf bei strength=0 NICHTS verändern. Das beweist den Fallback
  // unabhängig von der laufenden Animation.
  await page.evaluate(() => {
    const st = window.SHADED.intrinsic.state();
    const n = st.resolution.w * st.resolution.h;
    window.SHADED.intrinsic.set({ shading: new Array(n).fill(0.6), provider: 'fallback-probe', providerVersion: '1' });
    window.SHADED.intrinsic.setStrength(0);
  });
  await setAct(MACT, MT);
  const probeOff = await frame();
  const probeDelta = diff(offA, probeOff);
  check(probeDelta <= Math.max(0.05, drift * 5),
        'Pathologisches Fremdfeld wirkt bei strength=0 nicht (echter identity-albedo-Fallback)',
        `Δ=${probeDelta} bei Drift ${drift}`);
  await page.evaluate(() => window.SHADED.intrinsic.reset());

  // --- 3) Die Zerlegung wirkt ----------------------------------------------
  console.log('\n3) Wirkung der Zerlegung (u_intrinsic = 1)');
  await page.evaluate(() => window.SHADED.intrinsic.setStrength(1));
  await setAct(MACT, MT);
  await shot('shot_intrinsic_on.png');
  const onBuf = await frame();
  const effect = diff(offA, onBuf);
  check(effect > 1.5 && effect > drift * 50,
        'Zerlegung verändert das Bild messbar und weit über der Restdrift',
        `Δ=${effect}, Faktor ${(effect / Math.max(drift, 0.001)).toFixed(0)}× über Drift`);

  // --- 4) Invariante 2: Materialwahrheit unverändert ------------------------
  console.log('\n4) Invariante 2 – eine Material-Wahrheit');
  const classesOn = await classes();
  const sameClasses = JSON.stringify(classesOff) === JSON.stringify(classesOn);
  check(sameClasses, 'Klassenzählung ist bei an/aus exakt identisch',
        sameClasses ? Object.keys(classesOn).length + ' Klassen' : JSON.stringify(classesOn));
  const zoneSame = await page.evaluate(() => {
    let n = 0; for (let y = 0; y < 30; y++) for (let x = 0; x < 30; x++)
      n += window.SHADED.zoneAt((x + 0.5) / 30, (y + 0.5) / 30);
    return n;
  });
  check(typeof zoneSame === 'number', 'K1-Gebäudezonen weiterhin abfragbar (R-Kanal intakt)', `${zoneSame} Zellen`);

  // --- 5) Doppelbeschattung: Schatten saufen bei Nässe nicht mehr ab --------
  console.log('\n5) Weltgesetz Nässe – Schattenboden');
  await page.evaluate(() => window.SHADED.intrinsic.setStrength(0));
  await setAct('morgen', 4);   // wet = 1.0
  const floorOff = await shadowFloor();
  await page.evaluate(() => window.SHADED.intrinsic.setStrength(1));
  await page.waitForTimeout(250);
  const floorOn = await shadowFloor();
  check(floorOn > floorOff, 'Dunkelste 20 % bleiben bei Nässe heller als ohne Trennung',
        `aus=${floorOff} → an=${floorOn}`);

  // --- 6) Externer Provider -------------------------------------------------
  console.log('\n6) Externes Backend über intrinsic.set()');
  const ext = await page.evaluate(() => {
    const st = window.SHADED.intrinsic.state();
    const n = st.resolution.w * st.resolution.h;
    const field = new Float32Array(n);
    for (let i = 0; i < n; i++) field[i] = 0.6;   // konstant abgedunkeltes Licht
    const ok = window.SHADED.intrinsic.set({
      shading: Array.from(field), provider: 'material.intrinsic.test-worker',
      providerVersion: '9.9.9', confidence: 0.42, provenance: 'INFERRED',
      channelSetId: 'intrinsic.test'
    });
    return { ok, state: window.SHADED.intrinsic.state(), sample: window.SHADED.intrinsic.sample(0.5, 0.5) };
  });
  check(ext.ok && ext.state.provider === 'material.intrinsic.test-worker' &&
        ext.state.providerVersion === '9.9.9' && ext.state.confidence === 0.42,
        'Fremdes Shading-Feld inkl. Metadaten übernommen', `${ext.state.provider}@${ext.state.providerVersion}`);
  check(Math.abs(ext.sample - 0.6) < 0.01, 'Übernommenes Feld ist abtastbar', `sample=${ext.sample}`);
  check(ext.state.projection === null,
        'Fremdes Feld wird NICHT nachprojiziert – die Hypothese gehört dem Provider');
  check(ext.state.gamut && ext.state.gamut.pixels > 0,
        'Gamut-Verletzung eines fremden Feldes wird gemessen statt verschwiegen',
        `${ext.state.gamut ? ext.state.gamut.percent : '?'} % , schlimmster Albedo ${ext.state.gamut ? ext.state.gamut.worstAlbedo : '?'}`);
  const accepted = await page.evaluate(() => {
    window.SHADED.intrinsic.accept();
    return window.SHADED.intrinsic.state();
  });
  check(accepted.provenance === 'USER_APPROVED' && accepted.accepted === true,
        'Nutzerbestätigung setzt Provenienz auf USER_APPROVED');
  const afterReset = await page.evaluate(() => {
    window.SHADED.intrinsic.reset();
    return window.SHADED.intrinsic.state();
  });
  check(afterReset.provider === 'material.intrinsic.retinex-baseline' && afterReset.accepted === false,
        'reset() verwirft die Fremdhypothese und stellt das eingebaute Backend her');
  check(afterReset.projection && afterReset.projection.algorithm === 'dykstra' &&
        afterReset.gamut.pixels === 0,
        'Nach reset() gilt wieder die projizierte Baseline (Gamut sauber)');

  // --- 7) Providerausfall ---------------------------------------------------
  console.log('\n7) Providerausfall');
  await page.evaluate(() => window.SHADED.intrinsic.clear());
  await page.waitForTimeout(200);
  await setAct(MACT, MT);
  await shot('shot_intrinsic_cleared.png');
  const clearedBuf = await frame();
  const stC = await page.evaluate(() => window.SHADED.intrinsic.state());
  check(stC.hasShading === false && stC.strength === 0 && stC.provenance === 'OBSERVED',
        'clear() fällt auf identity-albedo zurück', `${stC.provider}`);
  const clearedDelta = diff(offA, clearedBuf);
  check(clearedDelta <= Math.max(0.15, drift * 20) && clearedDelta < effect / 10,
        'Rendering nach Providerausfall entspricht dem Ausgangszustand',
        `Δ=${clearedDelta} gegenüber Wirkung ${effect}`);
  const classesCleared = await classes();
  check(JSON.stringify(classesCleared) === JSON.stringify(classesOff),
        'Providerausfall löscht keine Materialwahrheit');

  // --- 8) Companion-Konvention: <szene>_shading.png -------------------------
  console.log('\n8) Companion-Datei <szene>_shading.png');
  serveShadingCompanion = true;
  await page.goto('http://localhost:8933/index.html');
  await page.setInputFiles('#f-scene', BASE_IMG);
  await page.waitForFunction(() => /Shading-Feld gefunden/.test(document.getElementById('status').textContent),
    { timeout: 10000 }).catch(() => {});
  const foundMsg = await page.textContent('#status');
  check(/Shading-Feld gefunden/.test(foundMsg), 'Companion-Datei wird neben der Szene gefunden',
        foundMsg.trim().slice(0, 60));
  // Gleiche Eingabe wie im Hauptlauf (Szene + Marker-Overlay), sonst waere die
  // Klassenzaehlung unten nicht vergleichbar - andere Eingabe, andere Klassen.
  await page.setInputFiles('#f-mat', MARKER_IMG);
  await page.waitForFunction(() => document.getElementById('status').textContent.includes('Material-Map geladen'));
  await page.click('#btn-create');
  await page.waitForFunction(() => window.SHADED.isReady());
  await page.waitForTimeout(300);
  const compState = await page.evaluate(() => window.SHADED.intrinsic.state());
  check(compState.provider === 'material.intrinsic.companion-file',
        'Companion-Feld ersetzt das eingebaute Backend', compState.provider);
  check(compState.strength === 1,
        'Trennung ist aktiv – der Autor hat die Datei bewusst danebengelegt', `strength=${compState.strength}`);
  check(compState.hasShading === true && compState.channelSetId === 'intrinsic.companion',
        'Kanalsatz ist als Companion gekennzeichnet', compState.channelSetId);
  const compClasses = await classes();
  check(JSON.stringify(compClasses) === JSON.stringify(classesOff),
        'Companion-Feld ändert die Materialwahrheit nicht');
  // Zweite Szene ohne Companion darf das Feld NICHT erben
  serveShadingCompanion = false;
  await page.setInputFiles('#f-scene', MARKER_IMG);
  await page.waitForTimeout(400);
  await page.click('#btn-create');
  await page.waitForFunction(() => window.SHADED.isReady());
  await page.waitForTimeout(300);
  const nextState = await page.evaluate(() => window.SHADED.intrinsic.state());
  check(nextState.provider === 'material.intrinsic.retinex-baseline',
        'Neue Szene ohne Companion erbt das alte Feld nicht', nextState.provider);

  // --- Visuelle Referenz: Sturmnacht A/B fuer den Screenshot-Vergleich -------
  await page.goto('http://localhost:8933/index.html');
  await page.setInputFiles('#f-scene', BASE_IMG);
  await page.waitForFunction(() => /Szene geladen|Tiefenkarte geladen/.test(document.getElementById('status').textContent));
  await page.click('#btn-create');
  await page.waitForFunction(() => window.SHADED.isReady());
  await page.evaluate(() => window.SHADED.parallax.set(0, 0));
  await page.evaluate(() => window.SHADED.intrinsic.reset());
  await setAct('sturmnacht', 6);
  await shot('shot_intrinsic_sturmnacht_off.png');
  await page.evaluate(() => window.SHADED.intrinsic.setStrength(1));
  await setAct('sturmnacht', 6);
  await shot('shot_intrinsic_sturmnacht_on.png');

  const realErrors = dropCompanion404(errors, benign404);
  const failed = results.filter(r => !r).length || realErrors.length;
  console.log('\nKonsolen-Fehler:', realErrors.length ? realErrors.join(' | ') : 'keine');
  console.log(`\n${failed ? '✗' : '✓'} ${results.length - failed}/${results.length} Prüfungen bestanden.`);
  console.log('  Screenshots: tools/verify-out/shot_intrinsic_{off,on,cleared,sturmnacht_off,sturmnacht_on}.png');

  await browser.close();
  server.close();
  if (failed) process.exit(1);
})().catch(e => { console.error(e); process.exit(1); });
