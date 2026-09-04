// Verifies a real bug found via a live user report: clicking the RAUM button appeared to do
// "nothing" (no visible feedback, no console errors). Traced the actual cause: world-studio.js's
// enterRoom() (when no image is loaded yet) correctly writes an actionable status message
// ("Bild laden oder Demo starten...") into #editor-status, which editor/ui-shell.js's own
// MutationObserver correctly relays into #viewport-status (the actually-visible HUD status
// line) -- but ui-shell.js also runs updateState() on an unconditional setInterval(750ms) that
// unconditionally overwrote #viewport-status with a generic engine-state string, stomping the
// RAUM message well under a second later (confirmed empirically while diagnosing this: the
// relay wrote the message at 6ms, the interval overwrote it again at 473ms) -- long before most
// users would ever consciously register having seen it.
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
  browser = await chromium.launch({ executablePath: process.env.CHROMIUM || (existsSync(fallbackChromium) ? fallbackChromium : undefined) });
  const page = await browser.newPage({ viewport: { width: 900, height: 900 } });
  const failures = [];
  page.on('pageerror', error => failures.push('pageerror: ' + error.message));
  page.on('console', message => { if (message.type() === 'error') failures.push('console: ' + message.text()); });

  await page.goto(`http://127.0.0.1:${port}/index.html`, { waitUntil: 'load' });
  await page.waitForTimeout(1000);

  // Click RAUM with no image loaded (the exact reported scenario) and sample #viewport-status
  // on every animation frame for 5 real seconds -- this is checking the ACTUAL DOM over real
  // wall-clock time against the real 750ms interval and MutationObserver, not a mocked timer.
  const trace = await page.evaluate(() => new Promise(resolve => {
    const el = document.getElementById('viewport-status');
    const samples = [];
    const start = performance.now();
    const tick = () => {
      samples.push({ t: performance.now() - start, text: el.textContent });
      if (performance.now() - start < 5000) requestAnimationFrame(tick);
      else resolve(samples);
    };
    document.getElementById('btn-room-view').click();
    requestAnimationFrame(tick);
  }));

  const genericText = 'Engine live · Bild laden oder Demo starten';
  const roomMessageSubstring = 'SHADED erzeugt Depth und Welt automatisch';

  const sawRoomMessage = trace.some(s => s.text.includes(roomMessageSubstring));
  assert(sawRoomMessage, 'clicking RAUM writes its own actionable status message into the visible HUD status line at all');

  // The real bug: the message must survive long enough to actually be read, not just flicker
  // for a handful of milliseconds before the periodic ticker reclaims the element. Checked at
  // t=2000ms (comfortably inside the 4s hold window, and well past the 750ms interval period
  // that used to guarantee a stomp by ~473ms).
  const atTwoSeconds = trace.filter(s => s.t >= 1900 && s.t <= 2100).pop();
  assert(atTwoSeconds, 'sanity: at least one sample exists around t=2000ms');
  assert(atTwoSeconds.text.includes(roomMessageSubstring),
    `the RAUM status message is STILL showing ~2 seconds later, not stomped by the periodic engine-state ticker (got "${atTwoSeconds.text}")`);

  // The hold is temporary, not permanent: after it elapses, the periodic ticker must resume its
  // normal job (this app must not get permanently stuck showing a one-time action's message).
  const atFiveSeconds = trace[trace.length - 1];
  assert(atFiveSeconds.text === genericText,
    `the hold expires and the periodic ticker resumes normal engine-state reporting after enough time passes (got "${atFiveSeconds.text}")`);

  assert(!failures.length, `unexpected browser errors: ${failures.join(' | ')}`);
  console.log('verify-room-status-hold: RAUM\'s status message actually stays visible long enough to read (still present ~2s later), and the periodic engine-state ticker still resumes normal reporting once the hold window elapses');
} finally {
  await browser?.close();
  await new Promise(resolve => server.close(resolve));
}
