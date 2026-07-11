// orchestrate.js — real headless CLI contract for driving the SHADED editor from
// outside the browser (Real Golden Run R-10). This is the shell-out target ANVIL's
// ShadedCliAdapter (core:externaladapters) is meant to call — same idea as SWIFT's
// `python main.py render --json` contract (SwiftCliAdapter.kt), but for SHADED.
//
// It boots a real local static server + real headless Chromium, loads the real
// editor page, and drives `window.SHADED_ORCHESTRATOR` (app.js) — which itself only
// calls the real, already-stable SceneEditorFacade methods. No shader/analyze code
// is duplicated here; this file is pure orchestration glue.
//
// Contract (see docs/ORCHESTRATION.md):
//   node tools/orchestrate.js --project <path-to-request.json> --json
//
// Exit codes (mirrors SWIFT's docs/ORCHESTRATION.md convention):
//   0  success — one JSON object on stdout: {"status":"ok", ...debugSnapshot}
//   1  generic failure (engine/page error, console/GL error during the run)
//   2  missing input (request file or a referenced asset path does not exist)
//
// Request file shape (NOT the same as contracts/shaded-scene-project.schema.json —
// that schema has no file paths; this is the CLI-facing envelope that also carries
// where the real bytes live on disk):
//   {
//     "scene": "/abs/or/relative/path/to/scene.png",
//     "material": "/abs/or/relative/path/to/material.png",   // optional
//     "params": { "fog": 0.4, ... },                          // optional
//     "actors": [                                              // optional
//       { "sheet": "path/to/sheet.png", "manifest": "path/to/manifest.json",
//         "x": 0.5, "y": 0.6, "scale": 1, "anim": "walk", "depthLayer": "mid", "label": "hero" }
//     ],
//     "storyboard": [ { "name": "Akt 1", "dur": 4, "p": { "fog": 0.4 } } ]  // optional
//   }
const { chromium } = require('playwright');
const http = require('http');
const fs = require('fs');
const path = require('path');

const REPO = path.join(__dirname, '..');

function parseArgs(argv) {
  const out = { json: false };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--project') out.project = argv[++i];
    else if (argv[i] === '--json') out.json = true;
    else if (argv[i] === '--port') out.port = parseInt(argv[++i], 10);
  }
  return out;
}

function fail(code, payload) {
  process.stdout.write(JSON.stringify({ status: 'error', ...payload }) + '\n');
  process.exit(code);
}

(async () => {
  const args = parseArgs(process.argv.slice(2));
  if (!args.project) {
    fail(2, { code: 'missing_input', message: 'Fehlendes --project <path> Argument.' });
    return;
  }
  const projectPath = path.resolve(args.project);
  if (!fs.existsSync(projectPath)) {
    fail(2, { code: 'missing_input', message: `Request-Datei nicht gefunden: ${projectPath}` });
    return;
  }

  let request;
  try {
    request = JSON.parse(fs.readFileSync(projectPath, 'utf8'));
  } catch (e) {
    fail(2, { code: 'missing_input', message: `Request-Datei ist kein gültiges JSON: ${e.message}` });
    return;
  }
  if (!request.scene) {
    fail(2, { code: 'missing_input', message: 'Request-Datei hat kein "scene"-Feld.' });
    return;
  }

  // Alle referenzierten Dateien (Szene, Material, Actor-Sheets/Manifeste) einsammeln,
  // gegen echte Dateipfade prüfen und unter synthetischen Server-Routen erreichbar
  // machen (sie liegen typischerweise NICHT unter REPO, z.B. SWIFT-Renderausgaben).
  const assetPaths = [];
  const resolveAsset = (rel, label) => {
    if (!rel) return null;
    const abs = path.resolve(path.dirname(projectPath), rel);
    if (!fs.existsSync(abs)) throw { code: 'missing_input', message: `${label} nicht gefunden: ${abs}` };
    const routeIndex = assetPaths.length;
    assetPaths.push(abs);
    // `name` trägt den echten Basisnamen weiter (nicht nur die synthetische Route) —
    // loadImageFile()s Auto-Tiefenkarten-Suche (index.html) braucht den ECHTEN Namen,
    // um z.B. "szene.png" -> "szene_depth.png" danebenliegend zu finden. Ein erfundener
    // Platzhaltername würde die Suche ins Leere laufen lassen (harmloser, aber echter
    // 404, den orchestrate.js als Konsolenfehler werten würde).
    return { url: `/_orchestrate-asset/${routeIndex}`, name: path.basename(abs) };
  };

  let sceneRoute, materialRoute, actorRoutes;
  try {
    sceneRoute = resolveAsset(request.scene, 'Szenenbild');
    materialRoute = resolveAsset(request.material, 'Material-Map');
    actorRoutes = (request.actors || []).map((a, i) => ({
      sheet: resolveAsset(a.sheet, `Actor #${i} Sprite-Sheet`),
      manifest: resolveAsset(a.manifest, `Actor #${i} Manifest`),
      x: a.x, y: a.y, scale: a.scale, anim: a.anim, depthLayer: a.depthLayer, label: a.label,
    }));
  } catch (e) {
    fail(2, { code: e.code || 'missing_input', message: e.message || String(e) });
    return;
  }

  const server = http.createServer((req, res) => {
    const urlPath = decodeURIComponent(req.url.split('?')[0]);
    const assetMatch = urlPath.match(/^\/_orchestrate-asset\/(\d+)$/);
    const filePath = assetMatch
      ? assetPaths[parseInt(assetMatch[1], 10)]
      : path.join(REPO, urlPath === '/' ? 'index.html' : urlPath.replace(/^\//, ''));
    try {
      const data = fs.readFileSync(filePath);
      const type = filePath.endsWith('.html') ? 'text/html'
        : filePath.endsWith('.js') ? 'text/javascript'
        : filePath.endsWith('.css') ? 'text/css'
        : filePath.endsWith('.json') ? 'application/json'
        : 'image/png';
      res.writeHead(200, { 'Content-Type': type });
      res.end(data);
    } catch (e) {
      res.writeHead(404);
      res.end();
    }
  });

  const port = args.port || 8934;
  await new Promise((r) => server.listen(port, r));

  const launchOpts = { args: ['--use-gl=angle', '--enable-webgl', '--ignore-gpu-blocklist'] };
  if (process.env.CHROMIUM) launchOpts.executablePath = process.env.CHROMIUM;
  else if (fs.existsSync('/opt/pw-browsers/chromium')) launchOpts.executablePath = '/opt/pw-browsers/chromium';

  const browser = await chromium.launch(launchOpts);
  const page = await browser.newPage({ viewport: { width: 1500, height: 950 } });
  const consoleErrors = [];
  page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });
  page.on('pageerror', (e) => consoleErrors.push('PAGEERROR: ' + e.message));

  let result;
  try {
    await page.goto(`http://localhost:${port}/editor/index.html`, { waitUntil: 'load' });
    await page.waitForFunction(() => typeof window.SHADED_ORCHESTRATOR === 'object', { timeout: 10000 });

    result = await page.evaluate(async ({ sceneRoute, materialRoute, actorRoutes, params, storyboard }) => {
      const fetchFile = async (asset, type) => {
        const res = await fetch(asset.url);
        if (!res.ok) throw new Error(`Asset-Fetch fehlgeschlagen (${res.status}): ${asset.url}`);
        const blob = await res.blob();
        return new File([blob], asset.name, { type });
      };
      const sceneFile = await fetchFile(sceneRoute, 'image/png');
      const materialFile = materialRoute ? await fetchFile(materialRoute, 'image/png') : undefined;
      const actorFiles = [];
      const actorSpecs = [];
      for (const a of actorRoutes) {
        const sheetFile = await fetchFile(a.sheet, 'image/png');
        const manifestFile = await fetchFile(a.manifest, 'application/json');
        actorFiles.push({ sheetFile, manifestFile });
        actorSpecs.push({ x: a.x, y: a.y, scale: a.scale, anim: a.anim, depthLayer: a.depthLayer, label: a.label });
      }
      const project = { schema: 'shaded.scene-project/v1', params: params || {}, actors: actorSpecs, storyboard: storyboard || [] };
      return window.SHADED_ORCHESTRATOR.loadProject(project, { sceneFile, materialFile, actorFiles });
    }, { sceneRoute, materialRoute, actorRoutes, params: request.params, storyboard: request.storyboard });
  } catch (e) {
    await browser.close();
    await new Promise((r) => server.close(r));
    fail(1, { message: `Orchestrierung fehlgeschlagen: ${e.message || String(e)}`, consoleErrors });
    return;
  }

  await browser.close();
  await new Promise((r) => server.close(r));

  if (consoleErrors.length > 0) {
    fail(1, { message: 'Konsolen-/Seitenfehler während der Orchestrierung.', consoleErrors });
    return;
  }

  process.stdout.write(JSON.stringify({ status: 'ok', ...result }) + '\n');
  process.exit(0);
})();
