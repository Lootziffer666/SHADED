// SHADED Kostüm-Browser Verifikation (Runde 9) — testet die HTML-Kopie der Decoder-Logik
// gegen ein rein synthetisches Fixture (KEINE echten Spieldateien). Prüft, dass die
// (separat gepflegte) Kopie in tools/costume-browser.html sich wie tools/cost-format.mjs
// verhält, damit beide Kopien nicht auseinanderlaufen.
// Nutzung: node tools/verify-costume-browser.js
const { chromium } = require('playwright');
const http = require('http');
const fs = require('fs');
const path = require('path');

const REPO = path.join(__dirname, '..');
const OUT = path.join(__dirname, 'verify-out');
fs.mkdirSync(OUT, { recursive: true });

function be32(n) { return Buffer.from([(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255]); }
function chunk(tag, body) { return Buffer.concat([Buffer.from(tag, 'ascii'), be32(8 + body.length), body]); }

// Ein Cel im selben Format, das tools/test-cost-format.mjs als Encoder nutzt (4bpp, byteweise
// pro Run ausgerichtet) — 12x10, drei Runs (zwei Repeat-Läufe + ein literaler Lauf).
function encodeCel(width, height, indices, bpp) {
  const runs = [];
  let i = 0;
  while (i < indices.length) {
    let j = i;
    while (j + 1 < indices.length && indices[j + 1] === indices[i] && (j - i) < 127) j++;
    if (j > i) { runs.push({ repeat: true, run: j - i + 1, values: [indices[i]] }); i = j + 1; }
    else {
      let k = i; const vals = [];
      while (k < indices.length && vals.length < 127) {
        if (k + 1 < indices.length && indices[k + 1] === indices[k]) break;
        vals.push(indices[k]); k++;
      }
      runs.push({ repeat: false, run: vals.length, values: vals });
      i = k;
    }
  }
  const bytes = [];
  let bitBuf = 0, bitCount = 0;
  const mask = (1 << bpp) - 1;
  function pushIndex(v) { bitBuf |= (v & mask) << bitCount; bitCount += bpp; while (bitCount >= 8) { bytes.push(bitBuf & 0xff); bitBuf >>>= 8; bitCount -= 8; } }
  function flush() { if (bitCount > 0) { bytes.push(bitBuf & 0xff); bitBuf = 0; bitCount = 0; } }
  for (const r of runs) {
    bytes.push((r.repeat ? 0x80 : 0) | (r.run & 0x7f));
    if (r.repeat) { flush(); pushIndex(r.values[0]); flush(); } else { flush(); for (const v of r.values) pushIndex(v); flush(); }
  }
  return Buffer.from([width & 255, (width >> 8) & 255, height & 255, (height >> 8) & 255, 0, 0, 0, 0, 0, 0, ...bytes]);
}
function encodeCostume(numAnim, formatByte, numColors, cels) {
  const palette = Buffer.from(Array.from({ length: numColors }, (_, i) => i * 3));
  const celBytes = Buffer.concat(cels);
  return Buffer.concat([Buffer.from([numAnim, formatByte]), palette, celBytes]);
}

const idx = [];
for (let y = 0; y < 10; y++) for (let x = 0; x < 12; x++) idx.push(x < 4 ? 1 : x < 8 ? 5 : (x + y) % 14 + 2);
const cel1 = encodeCel(12, 10, idx, 4);
const costBody = encodeCostume(2, 0x58, 16, [cel1]);
const costChunk = chunk('COST', costBody);
const lflf = chunk('LFLF', costChunk);
const lecf = chunk('LECF', lflf);
const scrambled = Buffer.from(lecf.map(b => b ^ 0x69));
const FIXTURE_RES = path.join(OUT, 'synthetic-fixture.001');
fs.writeFileSync(FIXTURE_RES, scrambled);

const server = http.createServer((req, res) => {
  const p = path.join(REPO, decodeURIComponent(req.url.split('?')[0]).replace(/^\//, ''));
  try {
    const data = fs.readFileSync(p);
    res.writeHead(200, { 'Content-Type': p.endsWith('.html') ? 'text/html' : 'application/octet-stream' });
    res.end(data);
  } catch (e) { res.writeHead(404); res.end(); }
});

(async () => {
  await new Promise(r => server.listen(8934, r));
  const launchOpts = { args: ['--use-gl=angle', '--enable-webgl', '--ignore-gpu-blocklist'] };
  if (process.env.CHROMIUM) launchOpts.executablePath = process.env.CHROMIUM;
  else if (fs.existsSync('/opt/pw-browsers/chromium')) launchOpts.executablePath = '/opt/pw-browsers/chromium';
  const browser = await chromium.launch(launchOpts);
  const page = await browser.newPage();
  const errors = [];
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));

  console.log('=== SHADED Kostüm-Browser Verifikation (Runde 9, synthetisches Fixture) ===\n');
  let failed = false;
  function check(name, ok, detail) { console.log(`  ${ok ? '✓ PASS' : '✗ FAIL'}: ${name}${detail ? ' — ' + detail : ''}`); if (!ok) failed = true; }

  await page.goto('http://localhost:8934/tools/costume-browser.html');
  await page.setInputFiles('#f-res', FIXTURE_RES);
  await page.waitForFunction(() => document.getElementById('viewer').style.display === 'block', { timeout: 5000 }).catch(() => {});

  const status = await page.textContent('#status');
  check('Synthetisches COST-Chunk gefunden', /1 Kostüm/.test(status), status);

  const decodeStatus = await page.textContent('#decodeStatus');
  check('Pixel-Vorschau erfolgreich dekodiert (kein Fallback)', /Cel\(s\) dekodiert/.test(decodeStatus), decodeStatus);

  await page.fill('#label', 'Test-Figur');
  await page.click('#save');
  const labelRow = await page.textContent('#labels');
  check('Label wird in Tabelle übernommen', /Test-Figur/.test(labelRow), labelRow);

  const [download] = await Promise.all([page.waitForEvent('download'), page.click('#export')]);
  const dlPath = path.join(OUT, 'costume-labels.json');
  await download.saveAs(dlPath);
  const exported = JSON.parse(fs.readFileSync(dlPath, 'utf8'));
  check('Export enthält Label, keine Pixeldaten', exported.labels?.[0]?.name === 'Test-Figur' && JSON.stringify(exported).length < 2000, `${JSON.stringify(exported).length} Bytes`);

  console.log('\nKonsole-Fehler:', errors.length ? errors.join(' | ') : '(keine)');
  check('keine Page-Errors', !errors.some(e => e.startsWith('PAGEERROR')));

  await browser.close();
  server.close();
  fs.rmSync(FIXTURE_RES, { force: true });
  console.log(failed ? '\n❌ verify-costume-browser FAILED' : '\n✅ verify-costume-browser PASSED');
  process.exitCode = failed ? 1 : 0;
})();
