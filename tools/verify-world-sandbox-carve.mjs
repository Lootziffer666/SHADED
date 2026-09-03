// Verifies the "Bändigen" ("Wasserbändigen"/STAMP.CARVE) tool's plumbing through a REAL
// browser and the real window.SHADEDWorldSandbox API. Deliberately does NOT attempt a
// synthesized mouse drag across the toolbar+canvas: this panel has a documented, pre-existing
// click-interception issue in headless testing (an overlay -- the same "#drawer-backdrop"/
// inspector click-catcher noted elsewhere in this codebase's own history for the Lupe tool --
// sits above parts of the UI whenever the inspector is open, so synthetic clicks on toolbar
// buttons at their real screen coordinates land on the overlay instead, silently). Confirmed by
// hand while writing this test: a real page.mouse.click() at the "Bändigen" button's own
// bounding-box centre left state.tool unchanged, while calling queueStamp() directly -- the
// same public API a real click ultimately reaches through useTool() -- worked immediately. So
// this test proves what's actually reachable here: the button exists in the DOM with the
// right label/selector, and the STAMP.CARVE contract itself (kind 9, water + a directional
// velocity kick) round-trips correctly through the real running app. The drag-direction
// computation in useTool() and the erosion physics it drives are both proven separately and
// rigorously by tools/test-world-sandbox.mjs's STAMP.CARVE block (verified against the pre-fix
// code first, so it's confirmed to actually catch a regression).
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
  await page.waitForTimeout(800);

  const desktopButton = page.locator('.world-hud-tools [data-world-tool="carve"]');
  const mobileButton = page.locator('.world-tools [data-world-tool="carve"]');
  assert(await desktopButton.count() === 1, 'the desktop "Bändigen" tool button is present exactly once');
  assert(await mobileButton.count() === 1, 'the mobile "Bändigen" tool button is present exactly once');
  assert((await desktopButton.getAttribute('title'))?.includes('Wasser bändigen'), 'the desktop button carries the expected tooltip');

  await page.evaluate(() => document.getElementById('world-pause')?.click());
  await page.waitForTimeout(150);
  await page.evaluate(() => window.SHADEDWorldSandbox.queueStamp(9, 0.42, 0.58, 0.03, 0.05, 0.6, -0.8));
  const stamps = await page.evaluate(() => window.SHADEDWorldSandbox.stamps);
  assert(stamps.length === 1, `exactly the one queued stamp is pending (got ${stamps.length})`);
  const [stamp] = stamps;
  assert(stamp.kind === 9, `queued stamp is STAMP.CARVE (kind 9), got kind ${stamp.kind}`);
  assert(Math.abs(stamp.directionX - 0.6) < 1e-6 && Math.abs(stamp.directionZ - -0.8) < 1e-6,
    `the direction passed to queueStamp survives into the queued stamp unchanged (got directionX=${stamp.directionX}, directionZ=${stamp.directionZ})`);
  assert(stamp.amount > 0, 'the queued carve stamp carries a positive amount');

  assert(!failures.length, `unexpected browser errors: ${failures.join(' | ')}`);
  console.log('verify-world-sandbox-carve: "Bändigen" buttons present in both toolbars, STAMP.CARVE round-trips correctly through the real running app');
} finally {
  await browser?.close();
  await new Promise(resolve => server.close(resolve));
}
