import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const mime = {'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.json':'application/json','.webmanifest':'application/manifest+json','.png':'image/png','.jpg':'image/jpeg','.svg':'image/svg+xml','.css':'text/css; charset=utf-8'};
const server = http.createServer((request, response) => {
  const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
  const requested = pathname === '/' ? '/index.html' : pathname;
  const filename = path.resolve(root, '.' + requested), relative = path.relative(root, filename);
  if (relative.startsWith('..' + path.sep) || path.isAbsolute(relative) || !fs.existsSync(filename) || !fs.statSync(filename).isFile()) {
    response.writeHead(404); response.end(); return;
  }
  response.writeHead(200, {'Content-Type': mime[path.extname(filename)] || 'application/octet-stream', 'Cache-Control':'no-cache'});
  fs.createReadStream(filename).pipe(response);
});

const listen = () => new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const assert = (condition, message) => { if (!condition) throw new Error(message); };
const effects = ['water','ice','sand','mud','soil','wet','snow','moss','lava','fire','smoke','steam','fog','cloud','hologram','dissolve'];
const volumeEffects = new Set(['fire','smoke','steam','fog','cloud']);

let browser;
try {
  await listen();
  const address = server.address(), origin = `http://127.0.0.1:${address.port}`;
  browser = await chromium.launch({headless:true,args:['--use-gl=swiftshader','--enable-unsafe-swiftshader','--enable-webgl','--ignore-gpu-blocklist','--no-sandbox','--disable-dev-shm-usage']});
  const page = await browser.newPage({viewport:{width:900,height:500}}), failures=[];
  page.setDefaultTimeout(10000);
  page.on('pageerror', error => failures.push(`page: ${error.message}`));
  page.on('console', message => { if (message.type()==='error' && !/Failed to load resource/.test(message.text())) failures.push(`console: ${message.text()}`); });

  await page.goto(origin + '/editor/sandbox.html', {waitUntil:'domcontentloaded'});
  await page.waitForFunction(() => /GLSL ES 3\.00 · LIVE/.test(document.getElementById('sandbox-status')?.textContent || ''));

  // CI runs Chromium through CPU-backed SwiftShader. Prove every mode on the real
  // WebGL2 path, but keep the raymarch budget small so this is a correctness test,
  // not an accidental CPU benchmark.
  await page.selectOption('#quality-select', 'fast');
  await page.waitForTimeout(80);

  const glState = await page.evaluate(() => {
    const canvas = document.getElementById('sandbox-canvas');
    const gl = canvas?.getContext('webgl2');
    return {
      webgl2: !!gl,
      width: canvas?.width || 0,
      height: canvas?.height || 0,
      renderer: gl ? gl.getParameter(gl.RENDERER) : '',
      error: gl ? gl.getError() : -1,
    };
  });
  assert(glState.webgl2, 'Sandbox hat keinen WebGL2-Kontext');
  assert(glState.width > 300 && glState.height > 150, `Sandbox-Canvas ist nicht gerendert (${glState.width}x${glState.height})`);
  assert(glState.error === 0, `WebGL meldet Fehler ${glState.error} direkt nach Shader-Link`);

  for (const effect of effects) {
    await page.evaluate(id => document.querySelector(`[data-effect="${id}"]`)?.click(), effect);
    await page.waitForFunction(id => document.querySelector(`[data-effect="${id}"]`)?.classList.contains('active'), effect);
    await page.waitForTimeout(volumeEffects.has(effect) ? 25 : 15);
    const error = await page.evaluate(() => document.getElementById('sandbox-canvas').getContext('webgl2').getError());
    assert(error === 0, `${effect}: WebGL error ${error}`);
  }

  // Granular Lab is a separate GPU-state system, not another material preset.
  await page.click('.granular-launch');
  await page.waitForFunction(() => document.body.classList.contains('granular-mode'));
  await page.waitForFunction(() => /GPU READY|PASS/.test(document.getElementById('granular-state')?.textContent || ''));
  const granular = page.locator('#granular-canvas');
  const box = await granular.boundingBox();
  assert(box && box.width > 300 && box.height > 150, 'Granular-Canvas ist nicht sichtbar');
  await page.mouse.move(box.x + box.width * .45, box.y + box.height * .22);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * .58, box.y + box.height * .28, {steps:4});
  await page.mouse.up();
  await page.waitForTimeout(800);
  const granularState = await page.evaluate(() => {
    const canvas = document.getElementById('granular-canvas');
    const gl = canvas?.getContext('webgl2');
    return {webgl2:!!gl,error:gl?gl.getError():-1,status:document.getElementById('granular-state')?.textContent||''};
  });
  assert(granularState.webgl2 && granularState.error === 0, `Granular WebGL2 error ${granularState.error}`);
  assert(/2 PASS/.test(granularState.status), `Granular-Simulation läuft nicht: ${granularState.status}`);
  await page.click('[data-grain="water"]');
  await page.mouse.move(box.x + box.width * .62, box.y + box.height * .18);
  await page.mouse.down(); await page.waitForTimeout(60); await page.mouse.up();
  await page.click('#granular-exit');
  await page.waitForFunction(() => !document.body.classList.contains('granular-mode'));

  // HQ/Balanced/Fast switching itself is also part of the contract. Keep the cheap
  // surface mode active while checking the higher budgets.
  await page.evaluate(() => document.querySelector('[data-effect="water"]')?.click());
  await page.selectOption('#quality-select', 'balanced');
  await page.waitForTimeout(25);
  await page.selectOption('#quality-select', 'hq');
  await page.waitForTimeout(25);
  const intensity = page.locator('[data-param="intensity"]');
  await intensity.fill('0.31');
  assert(await intensity.inputValue() === '0.31', 'Sandbox-Parameter lässt sich nicht live ändern');

  await page.setViewportSize({width:390,height:844});
  await page.waitForTimeout(60);
  assert(await page.evaluate(() => document.body.classList.contains('library-closed')), 'Mobile Sandbox startet nicht viewport-first');
  await page.click('#btn-library-toggle');
  await page.waitForTimeout(40);
  const mobileLibrary = await page.evaluate(() => ({libraryClosed:document.body.classList.contains('library-closed'),controlsClosed:document.body.classList.contains('controls-closed')}));
  assert(!mobileLibrary.libraryClosed && mobileLibrary.controlsClosed, 'Mobile EFFEKTE öffnet nicht exklusiv');
  await page.click('#btn-controls-toggle');
  await page.waitForTimeout(40);
  const mobileControls = await page.evaluate(() => ({libraryClosed:document.body.classList.contains('library-closed'),controlsClosed:document.body.classList.contains('controls-closed')}));
  assert(mobileControls.libraryClosed && !mobileControls.controlsClosed, 'Mobile PARAMETER öffnet nicht exklusiv');

  assert(!failures.length, `Browserfehler: ${failures.join(' | ')}`);
  console.log(`✅ Sandbox Browser: WebGL2/GLSL300 · ${effects.length} effect modes · GPU granular ping-pong · desktop/mobile UI · ${glState.renderer}`);
} finally {
  await browser?.close();
  await new Promise(resolve => server.close(resolve));
}
