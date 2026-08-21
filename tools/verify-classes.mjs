// verify-classes.mjs — Class regression for all 5 scenes (no screenshots).
// Matches verify.js loading pattern: scene + marker overlay + btn-create.
import { chromium } from 'playwright';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const REPO = process.cwd();
const MIME = {'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.png':'image/png','.jpg':'image/jpeg','.ico':'image/x-icon','.svg':'image/svg+xml','.webmanifest':'application/manifest+json'};

const server = http.createServer((req, res) => {
  const urlPath = decodeURIComponent(req.url.split('?')[0]);
  const fp = path.join(REPO, urlPath === '/' ? 'index.html' : urlPath.replace(/^\//, ''));
  try { const d = fs.readFileSync(fp); res.writeHead(200, { 'Content-Type': MIME[path.extname(fp).toLowerCase()] || 'application/octet-stream' }); res.end(d); }
  catch { res.writeHead(404); res.end(); }
});

function logClassesPage(page, label) {
  return page.evaluate(() => {
    const c = {}, W = 192, H = 108;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const m = window.SHADED.getMaterialTypeAt((x + 0.5) / W, (y + 0.5) / H);
      c[m] = (c[m] || 0) + 1;
    } return c;
  }).then(c => {
    process.stdout.write('Klassen[' + label + ']: ' + JSON.stringify(c) + '\n');
    const expPath = path.join(REPO, 'tools', 'expected-classes.json');
    if (fs.existsSync(expPath)) {
      const exp = JSON.parse(fs.readFileSync(expPath, 'utf8'))[label];
      if (exp) {
        let ok = true;
        for (const k of new Set([...Object.keys(exp), ...Object.keys(c)])) {
          const e = exp[k] || 0, a = c[k] || 0;
          if (Math.abs(a - e) > Math.max(40, e * 0.10)) { ok = false;
            process.stdout.write('  Abweichung ' + k + ': erwartet ~' + e + ', ist ' + a + '\n'); }
        }
        process.stdout.write('  Klassen-Regression[' + label + ']: ' + (ok ? 'PASS' : 'FAIL') + '\n');
        return { label, counts: c, expected: exp, passed: ok };
      }
    }
    return { label, counts: c, expected: null, passed: null };
  });
}

const port = 8942;
await new Promise(r => server.listen(port, r));

const browser = await chromium.launch({ args: ['--use-gl=angle', '--enable-webgl', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1500, height: 860 } });

const SCENES = [
  { label: 'dorf-marker', scene: 'file_00000000974871f49fe71f6b456f9579.png', marker: 'file_00000000c84071f4bcd6ff9afdba7246.png', act: null, params: {} },
  { label: 'legacy-map', scene: 'ResizedImage_2026-06-30_10-29-19_2317[41].png', marker: null, act: 'sturmnacht', params: {} },
  { label: 'taverne', scene: 'ResizedImage_2026-06-30_23-14-34_6442[1].jpg', marker: null, act: 'morgen', params: { dayNight: 0.35, fog: 0.5, rain: 0.5, wet: 1, puddle: 0.8, glow: 0.8 } },
  { label: 'dorf-kanon', scene: 'file_00000000c40471f4859a10d6bf3ac39b.png', marker: null, act: 'sturmnacht', params: { rain: 0.3 } },
  { label: 'dorf-himmel', scene: 'file_00000000723471f48a11eaa8371edfb7.png', marker: null, act: 'sturmnacht', params: { rain: 0.3 } },
];

const results = [];
for (const scene of SCENES) {
  const imgPath = path.join(REPO, scene.scene);
  if (!fs.existsSync(imgPath)) {
    process.stdout.write('SKIP ' + scene.label + ': file not found: ' + scene.scene + '\n');
    continue;
  }
  try {
    process.stdout.write('--- Loading scene: ' + scene.label + ' ---\n');
    await page.goto('http://localhost:' + port + '/index.html', { waitUntil: 'load' });
    await page.waitForTimeout(500);

    await page.setInputFiles('#f-scene', imgPath);
    await new Promise(r => setTimeout(r, 300));

    if (scene.marker) {
      await page.setInputFiles('#f-mat', path.join(REPO, scene.marker));
      await new Promise(r => setTimeout(r, 300));
    }

    await page.click('#btn-create');
    await page.waitForFunction(() => window.SHADED.isReady(), { timeout: 30000 });
    await page.waitForTimeout(500);

    if (scene.act) {
      await page.evaluate((act, params) => { window.SHADED.applyAct(act); window.SHADED.setParams(params); window.SHADED.setTime(21.7, true); }, scene.act, scene.params);
      await page.waitForTimeout(250);
    }

    const result = await logClassesPage(page, scene.label);
    results.push(result);
  } catch (e) {
    process.stdout.write('ERROR ' + scene.label + ': ' + e.message.substring(0, 300) + '\n');
    results.push({ label: scene.label, error: e.message });
  }
}

await browser.close();
await new Promise(r => server.close(r));

process.stdout.write('\n=== GOLD Baseline Class Regression Summary ===\n');
for (const r of results) {
  if (r.error) process.stdout.write(r.label + ': ERROR\n');
  else process.stdout.write(r.label + ': ' + (r.passed === null ? 'N/A' : r.passed ? 'PASS' : 'FAIL') + ' (' + Object.keys(r.counts).length + ' classes)\n');
}
