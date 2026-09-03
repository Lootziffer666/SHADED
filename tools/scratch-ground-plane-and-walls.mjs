// SCRATCH -- round 26, two connected tasks requested directly:
// 1) determine the GROUND plane's orientation and possible tilt.
// 2) derive wall regions as (roof mask) vs (ground mask) difference,
//    explicitly excluding vegetation/occluding objects (bushes) so they
//    can't distort the assumed surface boundary.
//
// Ground plane fit is cross-checked against an ANALYTIC prediction: the
// affine solver's own dirF already assigns each of the 3 family axes to a
// world axis (0/1/2). The family whose 2D screen direction is closest to
// vertical (~90deg) is the height axis; the ground plane should therefore
// be the plane spanned by the OTHER TWO axes, with a normal derivable from
// the same T/scale data already fitted for the houses -- not a fresh guess,
// a consequence of geometry this session already measured.
import { pipeline } from '@huggingface/transformers';
import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(__dirname, 'verify-out');
const IMG = path.join(__dirname, '..', 'file_000000006d188210a9bb1129089a7b29.png');
const recon = JSON.parse(fs.readFileSync(path.join(OUT, 'village-reconstructed-affine.json'), 'utf8'));
const { dirF, T, scale } = recon;
const familyAnglesDeg = dirF.map(([dx, dy]) => { let a = Math.atan2(dy, dx) * 180 / Math.PI; return ((a % 180) + 180) % 180; });
function screenPoint(p3) { let x = 0, y = 0; for (let f = 0; f < 3; f++) { x += p3[f] * dirF[f][0]; y += p3[f] * dirF[f][1]; } return [x, y]; }
const groundTruthCentroids = Object.entries(T).map(([name, pos]) => {
  const sc = scale[name];
  const center = [pos[0] + 0.5 * sc[0], pos[1] + 0.5 * sc[1], pos[2] + 0.5 * sc[2]];
  return { name, screen: screenPoint(center) };
});

// Which family axis is closest to vertical on screen (~90deg) -- that's the
// height axis; the ground plane's analytic normal is that axis's OWN world
// direction, i.e. the height axis unit vector [1,0,0]/[0,1,0]/[0,0,1]
// depending on which index it is (this coordinate system already treats
// world-axis-index === family-index, established earlier this session).
let heightAxisIdx = 0, bestDiff = Infinity;
for (let i = 0; i < familyAnglesDeg.length; i++) {
  const diff = Math.abs(familyAnglesDeg[i] - 90);
  if (diff < bestDiff) { bestDiff = diff; heightAxisIdx = i; }
}
const analyticGroundNormal = [0, 0, 0]; analyticGroundNormal[heightAxisIdx] = 1;
console.log(`Height axis (closest to 90deg on screen): family ${heightAxisIdx} (${familyAnglesDeg[heightAxisIdx].toFixed(1)}deg)`);
console.log(`Analytic ground-plane normal (in this session's world-axis convention): ${JSON.stringify(analyticGroundNormal)}`);

const depthEstimator = await pipeline('depth-estimation', 'onnx-community/depth-anything-v2-small');
const output = await depthEstimator(IMG);
const pd = output.predicted_depth;
const [H, W] = pd.dims;
const rawDepth = Array.from(pd.data);

const launchOpts = { args: ['--no-sandbox'] };
if (fs.existsSync('/opt/pw-browsers/chromium')) launchOpts.executablePath = '/opt/pw-browsers/chromium';
const browser = await chromium.launch(launchOpts);
const page = await browser.newPage();
const imgDataUrl = 'data:image/png;base64,' + fs.readFileSync(IMG).toString('base64');
await page.setContent('<canvas id=c></canvas>');

const result = await page.evaluate(async ({ rawDepth, W, H, familyAnglesDeg, groundTruthCentroids, imgDataUrl }) => {
  const img = new Image();
  await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = imgDataUrl; });
  const srcCanvas = document.createElement('canvas'); srcCanvas.width = img.naturalWidth; srcCanvas.height = img.naturalHeight;
  const srcCtx = srcCanvas.getContext('2d'); srcCtx.drawImage(img, 0, 0);
  const srcW = srcCanvas.width, srcH = srcCanvas.height;
  const srcData = srcCtx.getImageData(0, 0, srcW, srcH).data;
  const rgb = (x, y) => { const i = (y * srcW + x) * 4; return [srcData[i], srcData[i + 1], srcData[i + 2]]; };
  const rgbDist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

  // --- Real ground-truth roof masks (verified, from the color extractor,
  // same as round 25) -- used both to exclude roof pixels from the ground
  // candidate and for the wall-difference step. ---
  const MATERIALS = {
    roof: { color: [225, 126, 69], tol: 35 },
    wallLight: { color: [198, 166, 109], tol: 22 },
    wallDark: { color: [141, 125, 81], tol: 22 },
  };
  function labelComponents(matchFn, minSize) {
    const visited = new Uint8Array(srcW * srcH);
    const components = [];
    for (let y = 0; y < srcH; y++) for (let x = 0; x < srcW; x++) {
      const idx = y * srcW + x;
      if (visited[idx] || !matchFn(x, y)) continue;
      const stack = [[x, y]]; visited[idx] = 1;
      const pixels = [];
      let minX = x, maxX = x, minY = y, maxY = y;
      while (stack.length) {
        const [cx, cy] = stack.pop(); pixels.push([cx, cy]);
        if (cx < minX) minX = cx; if (cx > maxX) maxX = cx;
        if (cy < minY) minY = cy; if (cy > maxY) maxY = cy;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nx = cx + dx, ny = cy + dy;
          if (nx < 0 || ny < 0 || nx >= srcW || ny >= srcH) continue;
          const nidx = ny * srcW + nx;
          if (visited[nidx] || !matchFn(nx, ny)) continue;
          visited[nidx] = 1; stack.push([nx, ny]);
        }
      }
      if (pixels.length >= minSize) components.push({ pixels, bbox: [minX, minY, maxX, maxY], cx: (minX + maxX) / 2, cy: (minY + maxY) / 2, count: pixels.length });
    }
    return components;
  }
  const roofComps = labelComponents((x, y) => rgbDist(rgb(x, y), MATERIALS.roof.color) <= MATERIALS.roof.tol, 300);
  const wallLightComps = labelComponents((x, y) => rgbDist(rgb(x, y), MATERIALS.wallLight.color) <= MATERIALS.wallLight.tol, 300);
  const wallDarkComps = labelComponents((x, y) => rgbDist(rgb(x, y), MATERIALS.wallDark.color) <= MATERIALS.wallDark.tol, 300);
  const roofPixelSet = new Set(roofComps.flatMap((c) => c.pixels).map(([x, y]) => x + ':' + y));

  // --- Vegetation (bush) identification: sample actual bush color directly
  // from this image (measured, not assumed) at a few known bush locations
  // near each house (visible in the source render as small round green
  // blobs distinct from the flatter grass background), then build a
  // same-method connected-component mask for it -- so bushes can be
  // explicitly excluded from both the ground AND wall candidates, per the
  // maintainer's explicit requirement.
  function sampleAround(cx, cy, r) {
    const samples = [];
    for (let dy = -r; dy <= r; dy += 4) for (let dx = -r; dx <= r; dx += 4) samples.push(rgb(cx + dx, cy + dy));
    return samples;
  }
  // Ground (grass) color: sample a patch far from any house/path (empirically
  // away from all known house centroids and image edges).
  const grassSample = rgb(Math.round(srcW * 0.5), Math.round(srcH * 0.85));
  console.log('grass sample (debug):', grassSample);

  // Bush color: bushes sit adjacent to house walls in this render; scan a
  // small ring around each house's wall bbox for a saturated-green cluster
  // distinct from the grassSample.
  const bushCandidateColors = [];
  for (const gt of groundTruthCentroids) {
    const [gx, gy] = gt.screen;
    for (const [dx, dy] of [[60, 20], [-60, 20], [80, -10], [-80, -10]]) {
      const c = rgb(Math.round(gx + dx), Math.round(gy + dy));
      const distFromGrass = rgbDist(c, grassSample);
      if (distFromGrass > 15 && distFromGrass < 90 && c[1] > c[0] && c[1] > c[2]) bushCandidateColors.push(c);
    }
  }
  let bushColor = grassSample;
  if (bushCandidateColors.length) {
    bushColor = bushCandidateColors.reduce((s, c) => [s[0] + c[0], s[1] + c[1], s[2] + c[2]], [0, 0, 0]).map((v) => Math.round(v / bushCandidateColors.length));
  }

  const bushComps = labelComponents((x, y) => {
    const c = rgb(x, y);
    return rgbDist(c, bushColor) <= 28 && rgbDist(c, grassSample) > 12;
  }, 150);
  const bushPixelSet = new Set(bushComps.flatMap((c) => c.pixels).map(([x, y]) => x + ':' + y));

  // --- Ground mask: grass-colored pixels, excluding roof, wall, and bush
  // pixels (vegetation/occluding objects must not shape the assumed ground
  // boundary, per the explicit requirement). ---
  const GROUND_TOL = 30;
  const groundPixels = [];
  for (let y = 0; y < srcH; y += 2) for (let x = 0; x < srcW; x += 2) {
    const key = x + ':' + y;
    if (roofPixelSet.has(key) || bushPixelSet.has(key)) continue;
    const c = rgb(x, y);
    if (rgbDist(c, grassSample) <= GROUND_TOL) groundPixels.push([x, y]);
  }

  // --- Back-project ground pixels to 3D (same pinhole model as round 24)
  // and fit a plane. Depth map is at (W,H); ground pixels are in source
  // image space (srcW,srcH) -- map coordinates accordingly. ---
  function at(x, y) { const xi = Math.max(0, Math.min(W - 1, x)), yi = Math.max(0, Math.min(H - 1, y)); return rawDepth[yi * W + xi]; }
  const FOV_DEG = 50, NEAR = 200, FAR = 900;
  const aspect = W / H;
  const fRad = FOV_DEG * Math.PI / 180;
  function backProject(sx, sy) {
    const dx = Math.round((sx / srcW) * W), dy = Math.round((sy / srcH) * H);
    const gray = at(dx, dy);
    const z = NEAR + (255 - gray) / 255 * (FAR - NEAR);
    const ndcX = (sx / srcW) * 2 - 1, ndcY = 1 - (sy / srcH) * 2;
    const camX = ndcX * Math.tan(fRad / 2) * z * aspect;
    const camY = ndcY * Math.tan(fRad / 2) * z;
    return [camX, camY, z];
  }
  function fitPlane(points3d) {
    const n = points3d.length;
    let cx = 0, cy = 0, cz = 0;
    for (const p of points3d) { cx += p[0]; cy += p[1]; cz += p[2]; }
    cx /= n; cy /= n; cz /= n;
    let sxx = 0, syy = 0, szz = 0, sxy = 0, sxz = 0, syz = 0;
    for (const p of points3d) {
      const dx = p[0] - cx, dy = p[1] - cy, dz = p[2] - cz;
      sxx += dx * dx; syy += dy * dy; szz += dz * dz;
      sxy += dx * dy; sxz += dx * dz; syz += dy * dz;
    }
    let a = [[sxx / n, sxy / n, sxz / n], [sxy / n, syy / n, syz / n], [sxz / n, syz / n, szz / n]];
    let v = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
    for (let sweep = 0; sweep < 30; sweep++) {
      let off = Math.abs(a[0][1]) + Math.abs(a[0][2]) + Math.abs(a[1][2]);
      if (off < 1e-9) break;
      for (let p = 0; p < 2; p++) for (let q = p + 1; q < 3; q++) {
        if (Math.abs(a[p][q]) < 1e-12) continue;
        const phi = 0.5 * Math.atan2(2 * a[p][q], a[q][q] - a[p][p]);
        const c = Math.cos(phi), s = Math.sin(phi);
        for (let k = 0; k < 3; k++) { const akp = a[k][p], akq = a[k][q]; a[k][p] = c * akp - s * akq; a[k][q] = s * akp + c * akq; }
        for (let k = 0; k < 3; k++) { const apk = a[p][k], aqk = a[q][k]; a[p][k] = c * apk - s * aqk; a[q][k] = s * apk + c * aqk; }
        for (let k = 0; k < 3; k++) { const vkp = v[k][p], vkq = v[k][q]; v[k][p] = c * vkp - s * vkq; v[k][q] = s * vkp + c * vkq; }
      }
    }
    const eigVals = [a[0][0], a[1][1], a[2][2]];
    let minIdx = 0; for (let i = 1; i < 3; i++) if (eigVals[i] < eigVals[minIdx]) minIdx = i;
    const normal = [v[0][minIdx], v[1][minIdx], v[2][minIdx]];
    const nlen = Math.hypot(...normal) || 1;
    return { center: [cx, cy, cz], normal: normal.map((c) => c / nlen), planarity: 1 - eigVals[minIdx] / (eigVals[0] + eigVals[1] + eigVals[2]) };
  }

  const step = Math.max(1, Math.floor(groundPixels.length / 5000));
  const sampledGround = groundPixels.filter((_, i) => i % step === 0);
  const groundPoints3d = sampledGround.map(([x, y]) => backProject(x, y));
  const groundPlane = fitPlane(groundPoints3d);
  const residuals = groundPoints3d.map((p) => {
    const d = [p[0] - groundPlane.center[0], p[1] - groundPlane.center[1], p[2] - groundPlane.center[2]];
    return Math.abs(d[0] * groundPlane.normal[0] + d[1] * groundPlane.normal[1] + d[2] * groundPlane.normal[2]);
  });
  residuals.sort((a, b) => a - b);

  // --- Wall regions: roof mask vs. ground mask "difference" per house --
  // the band of pixels within a house's column that are NEITHER roof NOR
  // ground NOR bush. ---
  function nearestComp(comps, [gx, gy]) {
    let best = null, bestD = Infinity;
    for (const c of comps) { const d = Math.hypot(c.cx - gx, c.cy - gy); if (d < bestD) { bestD = d; best = c; } }
    return best;
  }
  const groundPixelSet = new Set(groundPixels.map(([x, y]) => x + ':' + y));
  const wallResults = groundTruthCentroids.map((gt) => {
    const roof = nearestComp(roofComps, gt.screen);
    if (!roof) return { name: gt.name, error: 'no roof match' };
    const [rx0, ry0, rx1, ry1] = roof.bbox;
    const colW = rx1 - rx0;
    // Search a vertical column below the roof's bbox for non-roof,
    // non-ground, non-bush pixels -- the wall-difference candidate.
    const candidate = [];
    for (let y = ry1; y < Math.min(srcH, ry1 + colW); y++) {
      for (let x = rx0; x <= rx1; x++) {
        const key = x + ':' + y;
        if (roofPixelSet.has(key) || groundPixelSet.has(key) || bushPixelSet.has(key)) continue;
        candidate.push([x, y]);
      }
    }
    // Verify against REAL wall ground truth.
    const realWallLight = nearestComp(wallLightComps, gt.screen);
    const realWallDark = nearestComp(wallDarkComps, gt.screen);
    const realWallSet = new Set([...(realWallLight ? realWallLight.pixels : []), ...(realWallDark ? realWallDark.pixels : [])].map(([x, y]) => x + ':' + y));
    let hits = 0;
    for (const [x, y] of candidate) if (realWallSet.has(x + ':' + y)) hits++;
    const realWallTotal = realWallSet.size;
    return { name: gt.name, candidateSize: candidate.length, realWallTotal, hits, precision: candidate.length ? hits / candidate.length : 0, recall: realWallTotal ? hits / realWallTotal : 0 };
  });

  return {
    grassSample, bushColor, nBushComps: bushComps.length,
    groundPixelCount: groundPixels.length, sampledGroundCount: sampledGround.length,
    groundPlane, groundResidual: { mean: residuals.reduce((s, r) => s + r, 0) / residuals.length, median: residuals[Math.floor(residuals.length / 2)], p90: residuals[Math.floor(residuals.length * 0.9)], max: residuals[residuals.length - 1] },
    wallResults,
  };
}, { rawDepth, W, H, familyAnglesDeg, groundTruthCentroids, imgDataUrl });

console.log(`\nGrass sample color: rgb(${result.grassSample.join(',')})`);
console.log(`Bush color (measured from this image): rgb(${result.bushColor.join(',')}), ${result.nBushComps} bush components excluded`);
console.log(`Ground pixels (grass-colored, roof/bush excluded): ${result.groundPixelCount} (sampled ${result.sampledGroundCount} for plane fit)`);

console.log(`\nFitted ground plane normal: [${result.groundPlane.normal.map((v) => v.toFixed(4)).join(', ')}]`);
console.log(`Analytic predicted normal (from affine solver's height axis): ${JSON.stringify(analyticGroundNormal)}`);
const dot = result.groundPlane.normal.reduce((s, v, i) => s + v * analyticGroundNormal[i], 0);
const angleDeg = Math.acos(Math.min(1, Math.abs(dot))) * 180 / Math.PI;
console.log(`Angle between fitted and analytic normal: ${angleDeg.toFixed(2)}deg (0deg = perfectly flat/consistent, larger = measured tilt or fit error)`);
console.log(`Ground plane planarity: ${result.groundPlane.planarity.toFixed(4)}`);
console.log(`Ground residuals (world units): mean=${result.groundResidual.mean.toFixed(2)} median=${result.groundResidual.median.toFixed(2)} p90=${result.groundResidual.p90.toFixed(2)} max=${result.groundResidual.max.toFixed(2)}`);

console.log('\nWall-via-difference results (roof-mask vs ground-mask complement, bushes excluded), verified against REAL wall pixels:');
for (const w of result.wallResults) {
  if (w.error) { console.log(`  ${w.name}: ${w.error}`); continue; }
  console.log(`  ${w.name}: candidateSize=${w.candidateSize} realWallTotal=${w.realWallTotal} hits=${w.hits} precision=${(w.precision * 100).toFixed(1)}% recall=${(w.recall * 100).toFixed(1)}%`);
}

await browser.close();
