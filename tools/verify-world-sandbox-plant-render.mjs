// Verifies the "Wurzel" (root growth-agent) tool's plumbing through a REAL browser and the real
// window.SHADEDWorldSandbox API -- the live integration of world-sandbox-growth.mjs (already
// unit-tested in isolation by tools/test-world-sandbox-growth.mjs) into the actual running app,
// not a re-proof of the growth math itself. Deliberately does NOT attempt a synthesized mouse
// click on the toolbar button: this panel has the same documented, pre-existing click-
// interception issue in headless testing already noted for the carve/Lupe tools (an overlay
// sits above parts of the UI whenever the inspector is open). This test proves what's actually
// reachable here: the button exists in both toolbars with the right label, and spawning +
// stepping a real plant through the live CpuWorldSandbox (via the same public
// window.SHADEDWorldSandbox.spawnPlant() a real click ultimately reaches through useTool())
// actually grows a graph over real simulation time, not just creates a static seed node.
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.png': 'image/png' };

const server = createServer(async (req, res) => {
  try {
    const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    const filename = path.resolve(root, '.' + pathname);
    const data = await readFile(filename);
    res.writeHead(200, { 'Content-Type': MIME[path.extname(filename)] || 'application/octet-stream' });
    res.end(data);
  } catch {
    res.writeHead(404);
    res.end('not found');
  }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const { port } = server.address();

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

let browser;
try {
  const fallbackChromium = '/opt/pw-browsers/chromium';
  browser = await chromium.launch({ executablePath: process.env.CHROMIUM || (existsSync(fallbackChromium) ? fallbackChromium : undefined), headless: true });
  const page = await browser.newPage({ viewport: { width: 900, height: 900 } });
  const failures = [];
  page.on('pageerror', error => failures.push('pageerror: ' + error.message));
  page.on('console', message => { if (message.type() === 'error') failures.push('console: ' + message.text()); });

  await page.goto(`http://127.0.0.1:${port}/index.html`, { waitUntil: 'load' });
  await page.waitForTimeout(500);
  await page.click('#btn-world-sandbox');
  await page.waitForTimeout(1200); // give the CPU backend (or a failed WebGPU attempt falling back to it) time to initialize

  const desktopButton = page.locator('.world-hud-tools [data-world-tool="root"]');
  const mobileButton = page.locator('.world-tools [data-world-tool="root"]');
  assert(await desktopButton.count() === 1, 'the desktop "Wurzel" tool button is present exactly once');
  assert(await mobileButton.count() === 1, 'the mobile "Wurzel" tool button is present exactly once');
  assert((await desktopButton.getAttribute('title'))?.includes('Wurzel pflanzen'), 'the desktop button carries the expected tooltip');

  const backendKind = await page.evaluate(() => window.SHADEDWorldSandbox.backend);
  assert(backendKind === 'cpu' || backendKind === 'webgpu', `a real backend actually initialized (got "${backendKind}")`);

  // Pause BEFORE spawning: the sim runs continuously by default (real requestAnimationFrame
  // ticks), so reading `plants` even a moment after an unpaused spawn can already reflect
  // several real steps having run -- this isn't a bug, just a timing race this test must avoid
  // to make a meaningful "starts as exactly one node" assertion.
  await page.evaluate(() => document.getElementById('world-pause')?.click());
  await page.waitForTimeout(150);
  await page.evaluate(() => window.SHADEDWorldSandbox.spawnPlant(0.5, 0.5));
  const afterSpawn = await page.evaluate(() => window.SHADEDWorldSandbox.plants);

  if (backendKind === 'webgpu') {
    // Documented, real limitation (see useTool()'s own comment): growth-agent plants only have
    // a render/step path on the CPU backend so far. Proving that here would need forcing a CPU
    // fallback, which is exactly what tools/verify-world-sandbox-carve.mjs already established
    // is unreliable to force deterministically in this environment -- so this run only confirms
    // the no-op is silent (no crash, no phantom plant), not the CPU-side growth itself.
    assert(afterSpawn.length === 0, 'spawnPlant() on the WebGPU backend is a documented, silent no-op (no growth-agent render path there yet), not a crash or a phantom plant');
    console.log('verify-world-sandbox-plant-render: "Wurzel" buttons present in both toolbars; WebGPU backend was active this run, so the CPU-only spawnPlant()/growth path was only confirmed to no-op silently, not exercised end-to-end (see tools/test-world-sandbox-growth.mjs for the growth math itself, already proven separately)');
  } else {
    assert(afterSpawn.length === 1, `exactly one plant exists after spawning (got ${afterSpawn.length})`);
    const nodeCountAtSpawn = afterSpawn[0].nodeCount;
    assert(nodeCountAtSpawn === 1, `a freshly spawned plant starts as a single seed node (got ${nodeCountAtSpawn})`);
    assert(afterSpawn[0].livingTips === 1, 'a freshly spawned plant has exactly one living tip');

    // Unpause and let real simulation time pass -- this exercises the ACTUAL step() wiring
    // (stepGrowthTips called against this frame's live world state inside CpuWorldSandbox.step),
    // not a standalone call to the growth module.
    await page.evaluate(() => document.getElementById('world-pause')?.click());
    await page.waitForTimeout(2500);
    await page.evaluate(() => document.getElementById('world-pause')?.click());

    const afterSteps = await page.evaluate(() => window.SHADEDWorldSandbox.plants);
    assert(afterSteps.length === 1, 'the plant still exists after real simulation time passes (not silently dropped)');
    assert(afterSteps[0].nodeCount > nodeCountAtSpawn,
      `the graph actually grew new nodes over real simulation time (${nodeCountAtSpawn} -> ${afterSteps[0].nodeCount}) -- proves stepGrowthTips is genuinely wired into CpuWorldSandbox.step(), not just callable in isolation`);

    console.log(`verify-world-sandbox-plant-render: "Wurzel" buttons present in both toolbars, spawnPlant() creates a real single-node plant, and it genuinely grows through real simulation time inside the live app (${nodeCountAtSpawn} -> ${afterSteps[0].nodeCount} nodes)`);
  }

  assert(!failures.length, `unexpected browser errors: ${failures.join(' | ')}`);
} finally {
  await browser?.close();
  await new Promise(resolve => server.close(resolve));
}
