// Drives editor/world-sandbox.js's desert walk mode through a REAL browser and a mocked
// Gamepad API (navigator.getGamepads is poll-only and easy to fake: override it with a plain
// object shaped like a GamepadAxis array before the sim ticks) to prove twin-stick input
// actually moves/looks the player, not just that the code parses. Also re-proves keyboard
// movement still works (a regression net for the shared forwardInput/strafeInput blending path
// both input sources now go through) and that a half-tilted stick genuinely walks slower than
// a fully-held key, not just full-speed-at-the-deadzone-edge.
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
  browser = await chromium.launch({
    executablePath: process.env.CHROMIUM || (existsSync(fallbackChromium) ? fallbackChromium : undefined),
    headless: true,
  });
  const page = await browser.newPage({ viewport: { width: 900, height: 700 } });
  const failures = [];
  page.on('pageerror', error => failures.push('pageerror: ' + error.message));
  page.on('console', message => { if (message.type() === 'error') failures.push('console: ' + message.text()); });

  await page.goto(`http://127.0.0.1:${port}/index.html`, { waitUntil: 'load' });
  await page.waitForTimeout(500);
  await page.click('#btn-world-sandbox');
  await page.waitForTimeout(500);

  await page.evaluate(() => window.SHADEDWorldSandbox.enterWalk());
  const startPos = await page.evaluate(() => window.SHADEDWorldSandbox.walk);
  assert(startPos.active, 'enterWalk() actually activates walk mode');

  // Mock a connected Xbox-style gamepad with the left stick pushed fully "forward" (up = -1 on
  // the standard mapping's Y axis) and the right stick pushed right, then let the sim step
  // enough real time for updateWalk (called every fixed SIM_DT step) to visibly move/turn.
  await page.evaluate(() => {
    const fakePad = {
      connected: true,
      mapping: 'standard',
      axes: [0, -1, 1, 0], // left stick: forward; right stick: look right
      buttons: [],
    };
    navigator.getGamepads = () => [fakePad, null, null, null];
  });
  await page.waitForTimeout(1200);
  const afterStickForward = await page.evaluate(() => window.SHADEDWorldSandbox.walk);
  const movedDistance = Math.hypot(afterStickForward.x - startPos.x, afterStickForward.z - startPos.z);
  assert(movedDistance > 0.01, `left stick pushed forward actually moves the player (moved ${movedDistance.toFixed(4)})`);
  assert(afterStickForward.yaw > startPos.yaw + 0.05, `right stick pushed right actually turns the view (yaw ${startPos.yaw.toFixed(3)} -> ${afterStickForward.yaw.toFixed(3)})`);

  // A half-tilted stick should move noticeably slower than a fully-held key, not snap to full
  // speed the instant it clears the deadzone -- this is the actual bug the analog-preserving
  // rewrite (as opposed to always-normalize-to-unit-length) exists to prevent.
  await page.evaluate(() => {
    const fakePad = { connected: true, mapping: 'standard', axes: [0, -0.5, 0, 0], buttons: [] };
    navigator.getGamepads = () => [fakePad, null, null, null];
  });
  const beforeHalfStick = await page.evaluate(() => window.SHADEDWorldSandbox.walk);
  await page.waitForTimeout(400);
  const afterHalfStick = await page.evaluate(() => window.SHADEDWorldSandbox.walk);
  const halfStickDistance = Math.hypot(afterHalfStick.x - beforeHalfStick.x, afterHalfStick.z - beforeHalfStick.z);

  await page.evaluate(() => { navigator.getGamepads = () => []; });
  const beforeFullKey = await page.evaluate(() => window.SHADEDWorldSandbox.walk);
  await page.keyboard.down('KeyW');
  await page.waitForTimeout(400);
  await page.keyboard.up('KeyW');
  const afterFullKey = await page.evaluate(() => window.SHADEDWorldSandbox.walk);
  const fullKeyDistance = Math.hypot(afterFullKey.x - beforeFullKey.x, afterFullKey.z - beforeFullKey.z);

  assert(fullKeyDistance > 0.005, `keyboard W still moves the player at all (regression check, moved ${fullKeyDistance.toFixed(4)})`);
  assert(halfStickDistance > 0.001 && halfStickDistance < fullKeyDistance * 0.75,
    `a half-tilted stick (axis -0.5) covers noticeably less ground than a fully-held key in the same time ` +
    `(half-stick ${halfStickDistance.toFixed(4)} vs full-key ${fullKeyDistance.toFixed(4)}), proving analog magnitude survives instead of always snapping to full speed`);

  assert(!failures.length, `unexpected browser errors: ${failures.join(' | ')}`);
  console.log('verify-world-sandbox-gamepad: twin-stick move + look drive the desert walk player, analog magnitude preserved, keyboard regression-clean');
} finally {
  await browser?.close();
  await new Promise(resolve => server.close(resolve));
}
