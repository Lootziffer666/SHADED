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
      : p.endsWith('.js') ? 'text/javascript'
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
  page.on('response', (r) => { if (r.status() >= 400) errors.push(`HTTP ${r.status()}: ${r.url()}`); });

  try {
    await page.goto('http://localhost:8933/editor/index.html', { waitUntil: 'load' });

    check('window.SHADED_ORCHESTRATOR ist vor jedem Laden erreichbar', await page.evaluate(() => typeof window.SHADED_ORCHESTRATOR === 'object'));

    // engineLoaded wird schon true, sobald das Iframe (../index.html) sein Skript ausgeführt
    // hat (window.SHADED existiert dann) — unabhängig von erstellen(). Nur `ready` hängt an create().
    const statusBefore = await page.evaluate(() => window.SHADED_ORCHESTRATOR.getRuntimeStatus());
    check(`getRuntimeStatus() vor loadProject: ready=false, actorCount=0 (${JSON.stringify(statusBefore)})`,
      statusBefore.ready === false && statusBefore.actorCount === 0);

    // --- loadProject(): echte Szene + echter Actor + echte Parameter, alles über den realen Facade-Code ---
    const snapshot = await page.evaluate(async ({ scenePath, sheetPath, manifestPath }) => {
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
      return window.SHADED_ORCHESTRATOR.loadProject(project, {
        sceneFile,
        actorFiles: [{ sheetFile, manifestFile }],
      });
    }, {
      scenePath: '/file_00000000974871f49fe71f6b456f9579.png',
      sheetPath: '/tools/verify-test-actor.png',
      manifestPath: '/tools/verify-test-actor.json',
    });

    check(`loadProject() liefert ready=true (${JSON.stringify({ ready: snapshot.ready, actorCount: snapshot.actorCount, storyboardSteps: snapshot.storyboardSteps })})`,
      snapshot.ready === true);
    check(`loadProject() hat den Actor wirklich hinzugefügt (actorCount=${snapshot.actorCount})`, snapshot.actorCount === 1);
    check(`loadProject() hat die Storyboard-Schritte übernommen (storyboardSteps=${snapshot.storyboardSteps})`, snapshot.storyboardSteps === 1);
    check(`loadProject() hat die Parameter wirklich in der Engine gesetzt (fog=${snapshot.params.fog})`, Math.abs(snapshot.params.fog - 0.4) < 1e-6);

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

  check('Keine Konsolen-/Seitenfehler', errors.length === 0);
  if (errors.length) console.log('Fehler:', errors);

  await browser.close();
  await new Promise((r) => server.close(r));
  console.log(failed ? '\n❌ facade.test FAILED' : '\n✅ facade.test PASSED');
  process.exit(failed ? 1 : 0);
})();
