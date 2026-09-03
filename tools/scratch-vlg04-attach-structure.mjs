// SCRATCH -- round 15, direct continuation of round 14's one honest hit
// (a 14,702px roof-like polygon found on VLG-04 via pure size+geometry, zero
// reference to VLG-02's colors). That alone is not a house -- a house needs
// an attached wall. Extending the same discipline: find a spatially
// plausible "wall" candidate below the roof using ONLY structural/spatial
// logic (below, x-overlapping, close -- the same relationship
// scratch-village-extract-v2.mjs's findAttachedWall already uses), searching
// ALL 519 components regardless of color -- never filtering by a known wall
// RGB value. If a real wall exists, its color is whatever VLG-04 itself
// uses, discovered structurally, not looked up.
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(__dirname, 'verify-out');
const cache = JSON.parse(fs.readFileSync(path.join(OUT, 'vlg04-cultivation-fresh.json'), 'utf8'));

// The one confirmed roof-like hit from round 14 (size>2000px, polyedrisch-N
// signature). We don't have its raw pixel list cached (only summary fields),
// so this round re-derives full component data by re-running the same
// image-local labeling used in round 14, then applies ONLY the spatial
// attachment logic on top -- still zero VLG-02 color reference anywhere.
import { chromium } from 'playwright';
const IMG = path.join(__dirname, '..', 'file_0000000029f871f4bc597d92064d2e97.png');

(async () => {
  const launchOpts = { args: ['--no-sandbox'] };
  if (fs.existsSync('/opt/pw-browsers/chromium')) launchOpts.executablePath = '/opt/pw-browsers/chromium';
  const browser = await chromium.launch(launchOpts);
  const page = await browser.newPage();
  await page.setContent('<canvas id=c></canvas>');
  const dataUrl = 'data:image/png;base64,' + fs.readFileSync(IMG).toString('base64');

  const result = await page.evaluate(async ({ dataUrl }) => {
    const img = new Image();
    await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = dataUrl; });
    const c = document.getElementById('c'); c.width = img.naturalWidth; c.height = img.naturalHeight;
    const ctx = c.getContext('2d'); ctx.drawImage(img, 0, 0);
    const W = c.width, H = c.height;
    const data = ctx.getImageData(0, 0, W, H).data;
    const rgb = (x, y) => { const i = (y * W + x) * 4; return [data[i], data[i + 1], data[i + 2]]; };
    const STEP = 20;
    function quant(x, y) { const [r, g, b] = rgb(x, y); return [Math.floor(r / STEP), Math.floor(g / STEP), Math.floor(b / STEP)]; }
    const MIN_COMPONENT_SIZE = Math.round(W * H * 0.0001);

    function labelComponents() {
      const visited = new Uint8Array(W * H);
      const components = [];
      const qcache = new Int32Array(W * H).fill(-1);
      function qkey(x, y) { const idx = y * W + x; if (qcache[idx] === -1) { const [qr, qg, qb] = quant(x, y); qcache[idx] = (qr << 16) | (qg << 8) | qb; } return qcache[idx]; }
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const idx = y * W + x;
        if (visited[idx]) continue;
        const key = qkey(x, y);
        const stack = [[x, y]];
        visited[idx] = 1;
        let minX = x, maxX = x, minY = y, maxY = y, count = 0, sr = 0, sg = 0, sb = 0;
        while (stack.length) {
          const [cx, cy] = stack.pop(); count++;
          const [pr, pg, pb] = rgb(cx, cy); sr += pr; sg += pg; sb += pb;
          if (cx < minX) minX = cx; if (cx > maxX) maxX = cx;
          if (cy < minY) minY = cy; if (cy > maxY) maxY = cy;
          for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            const nx = cx + dx, ny = cy + dy;
            if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
            const nidx = ny * W + nx;
            if (visited[nidx] || qkey(nx, ny) !== key) continue;
            visited[nidx] = 1; stack.push([nx, ny]);
          }
        }
        if (count >= MIN_COMPONENT_SIZE) {
          components.push({ bbox: [minX, minY, maxX, maxY], count, cx: (minX + maxX) / 2, cy: (minY + maxY) / 2, meanColor: [sr / count, sg / count, sb / count].map((v) => Math.round(v)) });
        }
      }
      return components.sort((a, b) => b.count - a.count);
    }

    const components = labelComponents();
    return { W, H, components };
  }, { dataUrl });
  await browser.close();

  const { components } = result;
  // The round-14 roof candidate, identified by its known bbox (not by
  // re-deriving the geometric signature again -- that was already proven in
  // round 14; this round's job is only the attachment step).
  const roofCandidate = components.find((c) => c.bbox[0] === 647 && c.bbox[1] === 616);
  if (!roofCandidate) { console.error('Could not re-find the round-14 roof component -- labeling is not deterministic across runs?'); process.exit(1); }
  console.log('Roof candidate (from round 14):', JSON.stringify(roofCandidate));

  // findAttachedWall, structurally identical to scratch-village-extract-v2.mjs
  // -- below the roof, x-overlapping by >=15% of roof width, within 3x
  // roof's own bbox scale. NO color check anywhere.
  function findAttached(roof, candidates) {
    const [rx0, ry0, rx1, ry1] = roof.bbox;
    const rw = rx1 - rx0, rh = ry1 - ry0;
    const matches = [];
    for (const w of candidates) {
      if (w === roof) continue;
      const [wx0, , wx1] = w.bbox;
      const xOverlap = Math.min(rx1, wx1) - Math.max(rx0, wx0);
      if (xOverlap < rw * 0.15) continue;
      if (w.cy < roof.cy) continue;
      const d = Math.hypot(w.cx - roof.cx, w.cy - roof.cy);
      if (d < Math.max(rw, rh) * 3) matches.push({ w, d, xOverlap });
    }
    return matches.sort((a, b) => a.d - b.d);
  }

  const attached = findAttached(roofCandidate, components);
  console.log(`\nStructurally attached candidates below the roof (any color, spatial logic only): ${attached.length}`);
  for (const m of attached.slice(0, 8)) {
    console.log(`  bbox=${JSON.stringify(m.w.bbox)} size=${m.w.count}px color=rgb(${m.w.meanColor.join(',')}) dist=${m.d.toFixed(0)} xOverlap=${m.xOverlap.toFixed(0)}`);
  }
})();
