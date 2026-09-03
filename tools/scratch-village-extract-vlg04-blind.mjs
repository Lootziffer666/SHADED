// SCRATCH -- the actually fair second-image test the maintainer's "Das ist
// geschummelt" caught the previous version for lacking. Runs the EXACT,
// UNMODIFIED MATERIALS palette and extraction logic from
// scratch-village-extract-v2.mjs against a genuinely different image
// (VLG-04, file_0000000029f871f4bc597d92064d2e97.png), with ZERO tuning
// toward this image -- no color adjustment, no threshold change, nothing
// picked by having looked at VLG-04 first. Whatever comes out, comes out;
// this script reports it unfiltered, success or failure.
import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const IMG = path.join(__dirname, '..', 'file_0000000029f871f4bc597d92064d2e97.png');
const OUT = path.join(__dirname, 'verify-out');

(async () => {
  const launchOpts = { args: ['--no-sandbox'] };
  if (fs.existsSync('/opt/pw-browsers/chromium')) launchOpts.executablePath = '/opt/pw-browsers/chromium';
  const browser = await chromium.launch(launchOpts);
  const page = await browser.newPage();
  page.on('console', (msg) => console.log('[browser]', msg.text()));
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
    const rgbDist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

    // UNCHANGED from scratch-village-extract-v2.mjs -- copied verbatim, not
    // one value touched, not tuned by having looked at this image.
    const MATERIALS = {
      roof: { color: [225, 126, 69], tol: 35 },
      wallLight: { color: [198, 166, 109], tol: 22 },
      wallDark: { color: [141, 125, 81], tol: 22 },
    };
    const MIN_COMPONENT_SIZE = 300;

    function labelComponents(matchFn) {
      const visited = new Uint8Array(W * H);
      const components = [];
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const idx = y * W + x;
        if (visited[idx] || !matchFn(x, y)) continue;
        const stack = [[x, y]];
        visited[idx] = 1;
        const pixels = [];
        let minX = x, maxX = x, minY = y, maxY = y;
        while (stack.length) {
          const [cx, cy] = stack.pop();
          pixels.push([cx, cy]);
          if (cx < minX) minX = cx; if (cx > maxX) maxX = cx;
          if (cy < minY) minY = cy; if (cy > maxY) maxY = cy;
          for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            const nx = cx + dx, ny = cy + dy;
            if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
            const nidx = ny * W + nx;
            if (visited[nidx] || !matchFn(nx, ny)) continue;
            visited[nidx] = 1; stack.push([nx, ny]);
          }
        }
        if (pixels.length >= MIN_COMPONENT_SIZE) {
          components.push({ pixels, bbox: [minX, minY, maxX, maxY], cx: (minX + maxX) / 2, cy: (minY + maxY) / 2, count: pixels.length });
        }
      }
      return components;
    }

    const componentsByMaterial = {};
    for (const [name, { color, tol }] of Object.entries(MATERIALS)) {
      componentsByMaterial[name] = labelComponents((x, y) => rgbDist(rgb(x, y), color) <= tol);
    }

    function findAttachedWall(roof, wallComponents) {
      const [rx0, ry0, rx1, ry1] = roof.bbox;
      const rw = rx1 - rx0, rh = ry1 - ry0;
      let best = null, bestDist = Infinity;
      for (const w of wallComponents) {
        const [wx0, , wx1] = w.bbox;
        const xOverlap = Math.min(rx1, wx1) - Math.max(rx0, wx0);
        if (xOverlap < rw * 0.15) continue;
        if (w.cy < roof.cy) continue;
        const d = Math.hypot(w.cx - roof.cx, w.cy - roof.cy);
        if (d < bestDist && d < Math.max(rw, rh) * 3) { bestDist = d; best = w; }
      }
      return best;
    }

    const roofs = componentsByMaterial.roof;
    const houses = [];
    roofs.forEach((roof, i) => {
      const wallLight = findAttachedWall(roof, componentsByMaterial.wallLight);
      const wallDark = findAttachedWall(roof, componentsByMaterial.wallDark);
      houses.push({ name: `house${i + 1}`, roof, wallLight, wallDark, roofBox: roof.bbox, roofCount: roof.count });
    });

    return {
      W, H,
      componentCounts: Object.fromEntries(Object.entries(componentsByMaterial).map(([k, v]) => [k, v.length])),
      componentSizesSample: Object.fromEntries(Object.entries(componentsByMaterial).map(([k, v]) => [k, v.slice(0, 8).map((c) => c.count)])),
      houses: houses.map((h) => ({ name: h.name, roofBox: h.roofBox, roofCount: h.roofCount, hasWallLight: !!h.wallLight, hasWallDark: !!h.wallDark })),
    };
  }, { dataUrl });

  console.log(JSON.stringify(result, null, 2));
  await browser.close();
})();
