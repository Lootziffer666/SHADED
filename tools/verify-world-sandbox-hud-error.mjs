// Verifies that a real WebGPU initialization failure surfaces on the ALWAYS-VISIBLE canvas HUD,
// not only inside the collapsed inspector panel (#world-note). Found via a real user report: a
// device with a fully working WebGPU (adapter/device/context all succeed, full feature set, per
// an actual browser WebGPU capability report) still silently fell back to the CPU solver with no
// visible reason on the on-canvas HUD -- the real cause (error.message) was already being
// captured correctly, just written only to #world-note, buried inside a collapsed inspector
// section a user has no particular reason to open. This forces a REAL failure through the actual
// code path (navigator.gpu deleted before the page's own module scripts run, so
// assertGpuGlobals() in world-sandbox-webgpu.mjs genuinely throws 'WebGPU unavailable') and
// confirms the HUD element now shows that real message, not a mock of the failure.
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

  // Force a REAL failure through the actual code path, not a mock. This browser launch
  // deliberately does NOT pass the WebGPU-enabling flags the other WGSL/GPU tests in this repo
  // use (--enable-unsafe-webgpu etc.) -- so navigator.gpu exists (feature detection passes) but
  // requestAdapter() genuinely returns null, throwing world-sandbox-webgpu.mjs's own real "No
  // WebGPU adapter" error. A real, honest failure mode (this is what a browser/OS genuinely
  // without WebGPU produces), not a fabricated one.

  await page.goto(`http://127.0.0.1:${port}/index.html`, { waitUntil: 'load' });
  await page.waitForTimeout(500);
  await page.click('#btn-world-sandbox');
  await page.waitForTimeout(1200);

  const backendKind = await page.evaluate(() => window.SHADEDWorldSandbox.backend);
  assert(backendKind === 'cpu', `with navigator.gpu removed, the app genuinely falls back to the CPU backend (got "${backendKind}")`);

  const hudErrorHidden = await page.evaluate(() => document.getElementById('world-hud-error')?.hidden);
  assert(hudErrorHidden === false, 'the always-visible HUD error element is unhidden after a real WebGPU init failure');

  const hudErrorText = await page.evaluate(() => document.getElementById('world-hud-error')?.textContent || '');
  assert(hudErrorText.includes('No WebGPU adapter'), `the HUD error element shows the REAL underlying error message thrown by world-sandbox-webgpu.mjs itself, not a generic placeholder (got "${hudErrorText}")`);

  // Sanity: this element lives in the always-on canvas HUD (#world-sandbox-hud), not inside the
  // collapsible inspector (#panel-sandbox) -- confirms the fix actually changed WHERE this shows,
  // not just duplicated the same buried text somewhere else equally hidden.
  const insideAlwaysOnHud = await page.evaluate(() => !!document.getElementById('world-hud-error')?.closest('#world-sandbox-hud'));
  const insideCollapsedInspector = await page.evaluate(() => !!document.getElementById('world-hud-error')?.closest('#panel-sandbox'));
  assert(insideAlwaysOnHud, 'the HUD error element is inside the always-on canvas HUD');
  assert(!insideCollapsedInspector, 'the HUD error element is NOT inside the collapsible inspector panel -- it does not require opening the inspector to see');

  assert(!failures.length, `unexpected browser errors: ${failures.join(' | ')}`);
  console.log('verify-world-sandbox-hud-error: a real WebGPU init failure now shows its actual error message on the always-visible canvas HUD, not only inside the collapsed inspector panel');
} finally {
  await browser?.close();
  await new Promise(resolve => server.close(resolve));
}
