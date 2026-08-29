// Real, headless test for SceneEditorFacade's orchestration extensions
// (loadProject/exportProject/addActorBundle/getRuntimeStatus/getDebugSnapshot —
// Real Golden Run R-08). Same pattern as tools/verify-editor.js: local static
// server + real headless Chromium, no mocked DOM/engine. Drives the real editor
// page end-to-end via `window.SHADED_ORCHESTRATOR` (app.js, R-09) so this exercises
// the actual facade.js code, not a re-implementation of it.
//
// Usage: node editor/facade.test.js
// Own Chromium path: env CHROMIUM=/path/to/chromium node editor/facade.test.js
const { chromium } = require('playwright');
const http = require('http');
const fs = require('fs');
const path = require('path');

const REPO = path.join(__dirname, '..');

const server = http.createServer((req, res) => {
  const urlPath = decodeURIComponent(req.url.split('?')[0]);
  const rel = urlPath === '/' ? 'index.html' : urlPath.replace(/^\//, '');
  const p = path.join(REPO, rel);
  try {
    const data = fs.readFileSync(p);
    const type = p.endsWith('.html') ? 'text/html'
      : (p.endsWith('.js') || p.endsWith('.mjs')) ? 'text/javascript'
      : p.endsWith('.css') ? 'text/css'
      : p.endsWith('.json') ? 'application/json'
      : 'image/png';
    res.writeHead(200, { 'Content-Type': type });
    res.end(data);
  } catch (e) {
    res.writeHead(404);
    res.end();
  }
});

let failed = false;
function check(label, cond) {
  console.log(`${cond ? 'PASS' : 'FAIL'} — ${label}`);
  if (!cond) failed = true;
}

(async () => {
  await new Promise((r) => server.listen(8933, r));
  const launchOpts = { args: ['--use-gl=angle', '--enable-webgl', '--ignore-gpu-blocklist'] };
  if (process.env.CHROMIUM) launchOpts.executablePath = process.env.CHROMIUM;
  else if (fs.existsSync('/opt/pw-browsers/chromium')) launchOpts.executablePath = '/opt/pw-browsers/chromium';
  const browser = await chromium.launch(launchOpts);
  const page = await browser.newPage({ viewport: { width: 1500, height: 950 } });
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));
  page.on('requestfailed', (r) => errors.push(`REQUESTFAILED: ${r.url()} (${r.failure()?.errorText})`));
  page.on('response', (r) => {
    // Companion-Proben (bild_depth.png / bild_shading.png) duerfen fehlen - sie
    // wuerden hier sonst DOPPELT zaehlen (Response-Handler und Konsole).
    if (r.status() >= 400 && !isCompanionProbe(r.url())) errors.push(`HTTP ${r.status()}: ${r.url()}`);
  });
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
  page.on('response', (r) => { if (r.status() === 404 && isCompanionProbe(r.url())) benign404++; });

  try {
    await page.goto('http://localhost:8933/index.html', { waitUntil: 'load' });

    check('window.SHADED_ORCHESTRATOR ist vor jedem Laden erreichbar', await page.evaluate(() => typeof window.SHADED_ORCHESTRATOR === 'object'));

    // engineLoaded wird schon true, sobald runtime/shaded-engine.mjs im selben
    // Dokument sein Skript ausgeführt hat (window.SHADED existiert dann) —
    // unabhängig von erstellen(). Nur `ready` hängt an create().
    const statusBefore = await page.evaluate(() => window.SHADED_ORCHESTRATOR.getRuntimeStatus());
    check(`getRuntimeStatus() vor loadProject: ready=false, actorCount=0 (${JSON.stringify(statusBefore)})`,
      statusBefore.ready === false && statusBefore.actorCount === 0);

    // --- loadProject(): echte Szene + echter Actor + echte Parameter, alles über den realen Facade-Code ---
    const snapshot = await page.evaluate(async ({ scenePath, sheetPath, manifestPath, shadingPath }) => {
      const fetchFile = async (url, name, type) => {
        const res = await fetch(url);
        const blob = await res.blob();
        return new File([blob], name, { type });
      };
      // Gleicher Basisname wie die echte Fixture-Datei, damit loadImageFile's
      // Auto-Tiefenkarten-Suche die tatsächlich vorhandene "..._depth.png"-Datei
      // findet, statt einen erfundenen Dateinamen ins Leere laufen zu lassen (404).
      const sceneFile = await fetchFile(scenePath, 'file_00000000974871f49fe71f6b456f9579.png', 'image/png');
      const sheetFile = await fetchFile(sheetPath, 'actor.png', 'image/png');
      const manifestFile = await fetchFile(manifestPath, 'actor.json', 'application/json');
      const project = {
        schema: 'shaded.scene-project/v1',
        params: { fog: 0.4, dayNight: 0.7 },
        actors: [{ label: 'test-actor', x: 0.5, y: 0.6, anim: 'idle' }],
        storyboard: [{ name: 'Akt 1', dur: 4, p: { fog: 0.4 } }],
      };
      // Materialschicht: fremdes Shading-Feld als URL. Die Fassade laedt es im
      // ENGINE-Realm - ein Bild aus diesem Realm wuerde an den Typpruefungen
      // der Engine scheitern (dieselbe Falle wie bei addActor).
      project.intrinsic = {
        provider: 'material.intrinsic.test-cli', providerVersion: '2.0.0',
        channelSetId: 'intrinsic.cli', provenance: 'INFERRED',
        confidence: 0.66, strength: 1, accepted: false,
      };
      return window.SHADED_ORCHESTRATOR.loadProject(project, {
        sceneFile,
        actorFiles: [{ sheetFile, manifestFile }],
        intrinsicShading: shadingPath,
      });
    }, {
      scenePath: '/file_00000000974871f49fe71f6b456f9579.png',
      sheetPath: '/tools/verify-test-actor.png',
      manifestPath: '/tools/verify-test-actor.json',
      shadingPath: '/file_00000000974871f49fe71f6b456f9579_depth.png',
    });

    check(`loadProject() liefert ready=true (${JSON.stringify({ ready: snapshot.ready, actorCount: snapshot.actorCount, storyboardSteps: snapshot.storyboardSteps })})`,
      snapshot.ready === true);
    check(`loadProject() hat den Actor wirklich hinzugefügt (actorCount=${snapshot.actorCount})`, snapshot.actorCount === 1);
    check(`loadProject() hat die Storyboard-Schritte übernommen (storyboardSteps=${snapshot.storyboardSteps})`, snapshot.storyboardSteps === 1);
    check(`loadProject() hat die Parameter wirklich in der Engine gesetzt (fog=${snapshot.params.fog})`, Math.abs(snapshot.params.fog - 0.4) < 1e-6);

    // --- Materialschicht: fremdes Shading-Feld ueber den Vertrag angekommen? ---
    const intr = snapshot.intrinsic || {};
    check(`loadProject() hat das fremde Shading-Feld uebernommen (${intr.provider}@${intr.providerVersion}, hasShading=${intr.hasShading})`,
      intr.provider === 'material.intrinsic.test-cli' && intr.providerVersion === '2.0.0' && intr.hasShading === true);
    check(`loadProject() hat Provenienz und Konfidenz des Providers erhalten (${intr.provenance}, conf=${intr.confidence})`,
      intr.provenance === 'INFERRED' && Math.abs(intr.confidence - 0.66) < 1e-6);
    check(`loadProject() hat die Wirkstaerke der Materialschicht gesetzt (strength=${intr.strength})`,
      Math.abs(intr.strength - 1) < 1e-6);
    // Das Feld muss wirklich aus dem Bild stammen, nicht aus dem eingebauten Backend:
    const shadingSpread = await page.evaluate(() => {
      let mn = 9, mx = -9;
      for (let y = 0; y < 24; y++) for (let x = 0; x < 24; x++) {
        const v = window.SHADED.intrinsic.sample((x + 0.5) / 24, (y + 0.5) / 24);
        mn = Math.min(mn, v); mx = Math.max(mx, v);
      }
      return { mn: +mn.toFixed(3), mx: +mx.toFixed(3) };
    });
    check(`Geladenes Shading-Feld ist abtastbar und nicht konstant (${shadingSpread.mn} … ${shadingSpread.mx})`,
      shadingSpread.mx - shadingSpread.mn > 0.05);

    // --- addActorBundle() direkt (zweiter Actor, unabhängig von loadProject) ---
    const afterSecondActor = await page.evaluate(async ({ sheetPath, manifestPath }) => {
      const fetchFile = async (url, name, type) => {
        const res = await fetch(url);
        const blob = await res.blob();
        return new File([blob], name, { type });
      };
      const sheetFile = await fetchFile(sheetPath, 'actor2.png', 'image/png');
      const manifestFile = await fetchFile(manifestPath, 'actor2.json', 'application/json');
      const entry = await window.SHADED_ORCHESTRATOR.addActorBundle(sheetFile, manifestFile, { x: 0.2, y: 0.3, depthLayer: 'back' });
      return { entryId: entry.id, status: window.SHADED_ORCHESTRATOR.getRuntimeStatus() };
    }, { sheetPath: '/tools/verify-test-actor.png', manifestPath: '/tools/verify-test-actor.json' });
    check(`addActorBundle() fügt einen zweiten, unabhängigen Actor hinzu (actorCount=${afterSecondActor.status.actorCount})`,
      afterSecondActor.status.actorCount === 2 && typeof afterSecondActor.entryId === 'number');

    // --- getDebugSnapshot(): Form + echte Werte ---
    const debugSnapshot = await page.evaluate(() => window.SHADED_ORCHESTRATOR.getDebugSnapshot());
    check('getDebugSnapshot() enthält params, actors, storyboard',
      debugSnapshot.params && Array.isArray(debugSnapshot.actors) && Array.isArray(debugSnapshot.storyboard));
    check(`getDebugSnapshot().actors[0] trägt die echte Position (x=${debugSnapshot.actors[0]?.x}, y=${debugSnapshot.actors[0]?.y})`,
      debugSnapshot.actors[0]?.x === 0.5 && debugSnapshot.actors[0]?.y === 0.6);

    // --- exportProject(): Schema + Rundreise-Form ---
    const exported = await page.evaluate(() => window.SHADED_ORCHESTRATOR.exportProject());
    check(`exportProject() trägt das richtige Schema (${exported.schema})`, exported.schema === 'shaded.scene-project/v1');
    check('exportProject() liefert Storyboard aus derselben Live-Referenz wie window.SHADED.story.board()',
      Array.isArray(exported.storyboard) && exported.storyboard.length === 1 && exported.storyboard[0].name === 'Akt 1');

    // --- loadProject() ohne sceneFile muss real fehlschlagen, nicht still ignorieren ---
    const rejects = await page.evaluate(async () => {
      try {
        await window.SHADED_ORCHESTRATOR.loadProject({ schema: 'shaded.scene-project/v1', params: {}, actors: [], storyboard: [] }, {});
        return { threw: false };
      } catch (e) {
        return { threw: true, message: e.message };
      }
    });
    check(`loadProject() ohne sceneFile wirft echten Fehler statt still zu ignorieren ("${rejects.message}")`,
      rejects.threw === true && /sceneFile/.test(rejects.message || ''));
  } catch (e) {
    check(`Unerwarteter Fehler: ${e.message}`, false);
  }

  const realErrors = dropCompanion404(errors, benign404);
  check('Keine Konsolen-/Seitenfehler', realErrors.length === 0);
  if (realErrors.length) console.log('Fehler:', realErrors);
  if (errors.length) console.log('Fehler:', errors);

  await browser.close();
  await new Promise((r) => server.close(r));
  console.log(failed ? '\n❌ facade.test FAILED' : '\n✅ facade.test PASSED');
  process.exit(failed ? 1 : 0);
})();
