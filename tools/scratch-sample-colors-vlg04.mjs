import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const IMG = path.join(__dirname, '..', 'file_0000000029f871f4bc597d92064d2e97.png');

(async () => {
  const launchOpts = { args: ['--no-sandbox'] };
  if (fs.existsSync('/opt/pw-browsers/chromium')) launchOpts.executablePath = '/opt/pw-browsers/chromium';
  const browser = await chromium.launch(launchOpts);
  const page = await browser.newPage();
  const dataUrl = 'data:image/png;base64,' + fs.readFileSync(IMG).toString('base64');
  await page.setContent('<canvas id=c></canvas>');
  const result = await page.evaluate(async ({ dataUrl }) => {
    const img = new Image();
    await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = dataUrl; });
    const c = document.getElementById('c'); c.width = img.naturalWidth; c.height = img.naturalHeight;
    const ctx = c.getContext('2d'); ctx.drawImage(img, 0, 0);
    const W = c.width, H = c.height;
    const data = ctx.getImageData(0, 0, W, H).data;
    // Bucket every pixel by color, quantized to steps of 8 per channel, to
    // find dominant color clusters -- no hand-picked coordinates. Roof
    // candidates: R > G > B by a wide margin (orange-ish hue), reasonably
    // bright. Wall candidates: R > G > B but more muted (lower saturation),
    // mid-brightness (excludes near-black shadow/trim lines and near-white
    // highlights).
    const bucket = new Map();
    for (let i = 0; i < data.length; i += 4) {
      const r = data[i], g = data[i + 1], b = data[i + 2];
      const key = `${r >> 3}:${g >> 3}:${b >> 3}`;
      bucket.set(key, (bucket.get(key) || 0) + 1);
    }
    const entries = [...bucket.entries()].map(([k, count]) => {
      const [rq, gq, bq] = k.split(':').map(Number);
      return { r: rq * 8 + 4, g: gq * 8 + 4, b: bq * 8 + 4, count };
    }).sort((a, b) => b.count - a.count);

    function isRoofish(p) {
      const sat = p.r - p.b;
      return p.r > p.g && p.g > p.b && sat > 40 && p.r > 140 && p.r < 255;
    }
    function isWallish(p) {
      const sat = p.r - p.b;
      return p.r >= p.g && p.g >= p.b && sat > 5 && sat < 60 && p.r > 60 && p.r < 210 && p.g > 40;
    }
    function isPlasterish(p) {
      // Broader: cream/tan plaster can run lighter and less saturated than
      // the "wallish" beam filter above allows.
      const sat = p.r - p.b;
      return p.r >= p.g && p.g >= p.b && sat >= 0 && sat < 70 && p.r >= 150 && p.r <= 250 && p.g >= 110;
    }
    const roofTop = entries.filter(isRoofish).slice(0, 15);
    const wallTop = entries.filter(isWallish).slice(0, 15);
    const plasterTop = entries.filter(isPlasterish).slice(0, 15);
    return { W, H, totalPixels: W * H, roofTop, wallTop, plasterTop };
  }, { dataUrl });
  console.log(JSON.stringify(result, null, 2));
  await browser.close();
})();
