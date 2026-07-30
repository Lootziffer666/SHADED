// SHADED Sprite-Exporter Verifikation (Runde 10) — synthetisches Fixture, keine echten
// Spieldateien. Prüft den vollen Nutzerfluss: Ressourcendatei + Kostüm-Labels laden -> Sheets
// packen -> ZIP exportieren -> die ZIP ist mit einem unabhängigen Reader (Python zipfile)
// tatsächlich gültig und enthält die erwarteten PNG+Manifest-Paare.
// Nutzung: node tools/verify-sprite-exporter.js
const { chromium } = require('playwright');
const http = require('http');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const REPO = path.join(__dirname, '..');
const OUT = path.join(__dirname, 'verify-out');
fs.mkdirSync(OUT, { recursive: true });

function be32(n) { return Buffer.from([(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255]); }
function chunk(tag, body) { return Buffer.concat([Buffer.from(tag, 'ascii'), be32(8 + body.length), body]); }
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
  return Buffer.concat([Buffer.from([numAnim, formatByte]), Buffer.from(Array.from({ length: numColors }, (_, i) => i * 3)), Buffer.concat(cels)]);
}

const idx1 = [];
for (let y = 0; y < 8; y++) for (let x = 0; x < 10; x++) idx1.push(x < 3 ? 1 : x < 7 ? 4 : (x + y) % 12 + 2);
const cost1 = encodeCostume(1, 0x58, 16, [encodeCel(10, 8, idx1, 4)]);
const idx2 = [];
for (let y = 0; y < 6; y++) for (let x = 0; x < 6; x++) idx2.push((x + y) % 15 + 1);
const cost2 = encodeCostume(1, 0x58, 16, [encodeCel(6, 6, idx2, 4)]);
const lecf = chunk('LECF', chunk('LFLF', Buffer.concat([chunk('COST', cost1), chunk('COST', cost2)])));
const scrambled = Buffer.from(lecf.map((b) => b ^ 0x69));
const FIXTURE_RES = path.join(OUT, 'exporter-fixture.001');
fs.writeFileSync(FIXTURE_RES, scrambled);

const FIXTURE_LABELS = path.join(OUT, 'exporter-fixture-labels.json');
const costOffsets = []; // recompute the two COST chunk offsets exactly as findCostChunks would see them
{
  let off = 0;
  function walk(buf, start, end, depth) {
    let o = start;
    while (o < end) {
      const tag = buf.toString('ascii', o, o + 4);
      const size = buf.readUInt32BE(o + 4);
      if (tag === 'COST') costOffsets.push(o);
      if (tag === 'LECF' || tag === 'LFLF') walk(buf, o + 8, o + size, depth + 1);
      o += size;
    }
  }
  walk(lecf, 0, lecf.length, 0);
}
fs.writeFileSync(FIXTURE_LABELS, JSON.stringify({
  schemaVersion: '1.0.0', tool: 'shaded.costume-browser',
  labels: [
    { index: 0, offset: costOffsets[0], room: 8, name: 'Held-idle' },
    { index: 1, offset: costOffsets[1], room: 8, name: 'Nebenfigur-talk' },
  ],
}));

const server = http.createServer((req, res) => {
  const p = path.join(REPO, decodeURIComponent(req.url.split('?')[0]).replace(/^\//, ''));
  try {
    const data = fs.readFileSync(p);
    res.writeHead(200, { 'Content-Type': p.endsWith('.html') ? 'text/html' : 'application/octet-stream' });
    res.end(data);
  } catch (e) { res.writeHead(404); res.end(); }
});

(async () => {
  await new Promise((r) => server.listen(8935, r));
  const launchOpts = { args: ['--use-gl=angle', '--enable-webgl', '--ignore-gpu-blocklist'] };
  if (process.env.CHROMIUM) launchOpts.executablePath = process.env.CHROMIUM;
  else if (fs.existsSync('/opt/pw-browsers/chromium')) launchOpts.executablePath = '/opt/pw-browsers/chromium';
  const browser = await chromium.launch(launchOpts);
  const page = await browser.newPage();
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));

  console.log('=== SHADED Sprite-Exporter Verifikation (Runde 10, synthetisches Fixture) ===\n');
  let failed = false;
  function check(name, ok, detail) { console.log(`  ${ok ? '✓ PASS' : '✗ FAIL'}: ${name}${detail ? ' — ' + detail : ''}`); if (!ok) failed = true; }

  await page.goto('http://localhost:8935/tools/sprite-exporter.html');
  await page.setInputFiles('#f-res', FIXTURE_RES);
  await page.setInputFiles('#f-labels', FIXTURE_LABELS);
  await page.waitForFunction(() => !document.getElementById('export').disabled, { timeout: 5000 }).catch(() => {});

  const status = await page.textContent('#status');
  check('Beide Labels gepackt', /2 von 2/.test(status), status);

  const rows = await page.$$eval('#preview tbody tr', (trs) => trs.map((tr) => tr.textContent));
  check('Vorschau-Tabelle nennt beide Labels', rows.some((r) => r.includes('Held-idle')) && rows.some((r) => r.includes('Nebenfigur-talk')), rows.join(' | '));

  const [download] = await Promise.all([page.waitForEvent('download'), page.click('#export')]);
  const zipPath = path.join(OUT, 'sprite-sheets.zip');
  await download.saveAs(zipPath);

  try {
    const py = `
import zipfile, json
with zipfile.ZipFile(${JSON.stringify(zipPath)}) as z:
    bad = z.testzip()
    assert bad is None, f"corrupt: {bad}"
    names = set(z.namelist())
    expected = {"Held-idle.png","Held-idle.json","Nebenfigur-talk.png","Nebenfigur-talk.json"}
    assert expected <= names, names
    m = json.loads(z.read("Held-idle.json"))
    assert m["mappingVersion"] == "1.4.0", m
    assert "Held-idle" in m["animations"], m["animations"]
    png = z.read("Held-idle.png")
    assert png[:8] == bytes([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]), png[:8]
print("PYTHON_ZIP_OK")
`;
    const result = execFileSync('python3', ['-c', py], { encoding: 'utf8' });
    check('Exportierte ZIP ist gültig (Python zipfile) mit korrekten PNG+Manifest-Paaren', result.includes('PYTHON_ZIP_OK'));
  } catch (err) {
    check('Exportierte ZIP ist gültig', false, err.message);
  }

  console.log('\nKonsole-Fehler:', errors.length ? errors.join(' | ') : '(keine)');
  check('keine Page-Errors', !errors.some((e) => e.startsWith('PAGEERROR')));

  await browser.close();
  server.close();
  for (const f of [FIXTURE_RES, FIXTURE_LABELS]) fs.rmSync(f, { force: true });
  console.log(failed ? '\n❌ verify-sprite-exporter FAILED' : '\n✅ verify-sprite-exporter PASSED');
  process.exitCode = failed ? 1 : 0;
})();
