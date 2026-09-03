// Ground-truth harness for the WHOLE perspective village reconstruction
// pipeline. Acceptance is on recovered shape ratios and measurement drift,
// never reprojection error alone.
// Usage: node tools/scratch-village-pipeline-harness.mjs [--keep]
import fs from 'fs';
import path from 'path';
import { execFileSync } from 'child_process';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(__dirname, 'verify-out');
fs.mkdirSync(OUT, { recursive: true });
const RAW_PATH = path.join(OUT, 'village-raw2d-v2.json');
const RECON_PATH = path.join(OUT, 'village-reconstructed-v2.json');
const KEEP = process.argv.includes('--keep');

function norm3(a) { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; }
function cross3(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
function rodrigues(axis, ang) {
  const [x, y, z] = axis, c = Math.cos(ang), s = Math.sin(ang), t = 1 - c;
  return [
    [t * x * x + c, t * x * y + s * z, t * x * z - s * y],
    [t * x * y - s * z, t * y * y + c, t * y * z + s * x],
    [t * x * z + s * y, t * y * z - s * x, t * z * z + c],
  ];
}
function matMul(A, B) {
  const out = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  for (let c = 0; c < 3; c++) for (let r = 0; r < 3; r++) { let s = 0; for (let k = 0; k < 3; k++) s += A[k][r] * B[c][k]; out[c][r] = s; }
  return out;
}
function localCoordsFor(fams) {
  const lc0 = [0, 0, 0];
  for (let i = 0; i < 3; i++) lc0[fams[i]] = (i % 2 === 0) ? 0 : 1;
  const lc = [lc0];
  for (let i = 0; i < 5; i++) { const next = lc[i].slice(); next[fams[i]] += (i % 2 === 0 ? 1 : -1); lc.push(next); }
  return lc;
}
const FAMS = [0, 2, 1, 0, 2, 1];
const HEX_LC = localCoordsFor(FAMS);

function project(T, scale, lc, R, f, pp) {
  const cam = [0, 1, 2].map((d) => T[d] + lc[0] * scale.Lx * R[0][d] + lc[1] * scale.Ly * R[1][d] + lc[2] * scale.Lz * R[2][d]);
  if (cam[2] <= 0.01) return null;
  return [pp[0] + f * cam[0] / cam[2], pp[1] + f * cam[1] / cam[2]];
}
function vpOfAxis(axis, pp, f) {
  if (Math.abs(axis[2]) < 1e-9) return null;
  return [pp[0] + f * axis[0] / axis[2], pp[1] + f * axis[1] / axis[2]];
}
function makeCamera({ yawDeg, pitchDeg, f, W, H }) {
  let R = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
  R = matMul(rodrigues([0, 1, 0], yawDeg * Math.PI / 180), R);
  R = matMul(rodrigues([1, 0, 0], pitchDeg * Math.PI / 180), R);
  return { R, f, pp: [W / 2, H / 2], W, H };
}
function makeScene({ name, cam, houses, noisePx, seed }) {
  let s = seed || 1;
  const rnd = () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; };
  const cubes = {}, truth = {};
  for (const h of houses) {
    const measuredVerts = HEX_LC.map((lc) => {
      const p = project(h.T, h.scale, lc, cam.R, cam.f, cam.pp);
      if (!p) return null;
      return noisePx ? [p[0] + (rnd() - 0.5) * 2 * noisePx, p[1] + (rnd() - 0.5) * 2 * noisePx] : p;
    });
    if (measuredVerts.some((v) => !v)) return null;
    cubes[h.name] = { rawPoly: measuredVerts, famAssignment: FAMS };
    // Immutable observations: evaluation always compares against this copy,
    // never against vertices returned/mutated by the reconstruction.
    truth[h.name] = { scale: h.scale, T: h.T, verts: measuredVerts.map((v) => v.slice()) };
  }
  return { name, W: cam.W, H: cam.H, cubes, truth, cam };
}

function runPipeline(scene) {
  fs.writeFileSync(RAW_PATH, JSON.stringify({ W: scene.W, H: scene.H, cubes: scene.cubes }, null, 2));
  try {
    execFileSync('node', [path.join(__dirname, 'scratch-village-reconstruct-v2.mjs')], { stdio: 'pipe', timeout: 180000 });
  } catch (e) {
    return { error: `reconstruct failed: ${String(e.message).slice(0, 160)}` };
  }
  if (!fs.existsSync(RECON_PATH)) return { error: 'reconstruct exited without producing village-reconstructed-v2.json' };
  try {
    return JSON.parse(fs.readFileSync(RECON_PATH, 'utf8'));
  } catch (e) {
    return { error: `malformed reconstruction JSON: ${e.message}` };
  }
}

function evaluate(scene, out) {
  if (out.error) return { fatal: out.error };
  let camErrDeg = null, fErrPct = null;
  if (out.R && out.f) {
    camErrDeg = 0;
    for (let k = 0; k < 3; k++) {
      const t = scene.cam.R[k], g = out.R[k];
      const dot = Math.abs(t[0] * g[0] + t[1] * g[1] + t[2] * g[2]);
      camErrDeg = Math.max(camErrDeg, Math.acos(Math.min(1, dot)) * 180 / Math.PI);
    }
    fErrPct = Math.abs(out.f - scene.cam.f) / scene.cam.f * 100;
  }
  const rows = [];
  for (const [name, t] of Object.entries(scene.truth)) {
    const got = out.scale && out.scale[name];
    if (!got) { rows.push({ name, fatal: 'missing from output' }); continue; }
    const trueRx = t.scale.Lx / t.scale.Lz, trueRy = t.scale.Ly / t.scale.Lz;
    const gotRx = got.Lx / got.Lz, gotRy = got.Ly / got.Lz;
    let maxDrift = 0;
    const post = out.vertices && out.vertices[name];
    if (post) for (let i = 0; i < 6; i++) {
      if (!post[i] || !t.verts[i]) continue;
      maxDrift = Math.max(maxDrift, Math.hypot(post[i][0] - t.verts[i][0], post[i][1] - t.verts[i][1]));
    }
    rows.push({
      name,
      trueRatio: [trueRx, trueRy], gotRatio: [gotRx, gotRy],
      ratioErrPct: [Math.abs(gotRx - trueRx) / trueRx * 100, Math.abs(gotRy - trueRy) / trueRy * 100],
      maxDrift,
    });
  }
  return { rows, camErrDeg, fErrPct };
}

const HOUSE_SHAPES = [
  { name: 'house1', scale: { Lx: 2.4, Ly: 1.3, Lz: 1.0 }, T: [-1.6, -1.2, 9.0] },
  { name: 'house2', scale: { Lx: 1.8, Ly: 1.1, Lz: 0.75 }, T: [1.3, -1.2, 8.2] },
  { name: 'house3', scale: { Lx: 3.0, Ly: 1.6, Lz: 1.35 }, T: [3.4, -1.2, 11.0] },
  { name: 'house4', scale: { Lx: 1.5, Ly: 0.9, Lz: 0.6 }, T: [-3.6, -1.2, 7.4] },
];
const SCENARIOS = [
  { label: 'strong perspective, noiseless', yawDeg: 35, pitchDeg: 22, f: 900, noisePx: 0 },
  { label: 'strong perspective, 1px noise', yawDeg: 35, pitchDeg: 22, f: 900, noisePx: 1 },
  { label: 'moderate perspective, noiseless', yawDeg: 22, pitchDeg: 15, f: 1400, noisePx: 0 },
  { label: 'weak perspective, noiseless', yawDeg: 10, pitchDeg: 8, f: 2100, noisePx: 0 },
  { label: 'weak perspective, 1px noise', yawDeg: 10, pitchDeg: 8, f: 2100, noisePx: 1 },
  { label: 'very weak perspective, noiseless', yawDeg: 4, pitchDeg: 3, f: 2600, noisePx: 0 },
];

const savedRaw = fs.existsSync(RAW_PATH) ? fs.readFileSync(RAW_PATH) : null;
const savedRecon = fs.existsSync(RECON_PATH) ? fs.readFileSync(RECON_PATH) : null;
const summary = [];
let allPass = false;

try {
  console.log('Pipeline ground-truth harness -- acceptance is on RECOVERED SHAPE RATIOS, not reprojection error.\n');
  for (const sc of SCENARIOS) {
    const cam = makeCamera({ yawDeg: sc.yawDeg, pitchDeg: sc.pitchDeg, f: sc.f, W: 1600, H: 1100 });
    const vpDist = [0, 1, 2].map((k) => {
      const vp = vpOfAxis(cam.R[k], cam.pp, cam.f);
      return vp ? Math.hypot(vp[0] - cam.W / 2, vp[1] - cam.H / 2) : Infinity;
    });
    const scene = makeScene({ name: sc.label, cam, houses: HOUSE_SHAPES, noisePx: sc.noisePx, seed: 7 });
    if (!scene) { console.log(`--- ${sc.label}: SKIPPED (geometry invalid)\n`); continue; }
    const out = runPipeline(scene);
    const ev = evaluate(scene, out);
    console.log(`--- ${sc.label}`);
    console.log(`    VP distances: ${vpDist.map((d) => d === Infinity ? 'inf' : Math.round(d)).join(', ')}px`);
    if (ev.fatal) {
      console.log(`    FATAL: ${ev.fatal}\n`);
      summary.push({ label: sc.label, worstRatioErr: Infinity, worstDrift: Infinity, camErrDeg: null });
      continue;
    }
    console.log(`    camera: worst axis ${ev.camErrDeg == null ? 'n/a' : ev.camErrDeg.toFixed(2) + ' deg'}, focal ${ev.fErrPct == null ? 'n/a' : ev.fErrPct.toFixed(1) + '%'}`);
    let worstRatioErr = 0, worstDrift = 0;
    for (const r of ev.rows) {
      if (r.fatal) { console.log(`    ${r.name}: ${r.fatal}`); worstRatioErr = Infinity; continue; }
      worstRatioErr = Math.max(worstRatioErr, ...r.ratioErrPct);
      worstDrift = Math.max(worstDrift, r.maxDrift);
      console.log(`    ${r.name}: true ${r.trueRatio.map((v) => v.toFixed(2)).join('/')} | got ${r.gotRatio.map((v) => v.toFixed(2)).join('/')} | ratio err ${r.ratioErrPct.map((v) => v.toFixed(1) + '%').join(', ')} | measurement drift ${r.maxDrift.toFixed(1)}px`);
    }
    summary.push({ label: sc.label, worstRatioErr, worstDrift, camErrDeg: ev.camErrDeg, fErrPct: ev.fErrPct });
    console.log(`    => worst ratio ${worstRatioErr === Infinity ? 'FATAL' : worstRatioErr.toFixed(1) + '%'}, drift ${worstDrift.toFixed(1)}px\n`);
  }

  console.log('=== Summary ===');
  for (const s of summary) {
    const shapeOk = s.worstRatioErr <= 5, driftOk = s.worstDrift <= 5;
    console.log(`  ${shapeOk && driftOk ? 'PASS' : 'FAIL'}  ${s.label.padEnd(34)} shape ${s.worstRatioErr === Infinity ? 'FATAL' : s.worstRatioErr.toFixed(1) + '%'} (<=5%), drift ${s.worstDrift === Infinity ? 'FATAL' : s.worstDrift.toFixed(1) + 'px'} (<=5px)`);
  }
  allPass = summary.length === SCENARIOS.length && summary.every((s) => s.worstRatioErr <= 5 && s.worstDrift <= 5);
} finally {
  if (!KEEP) {
    if (savedRaw) fs.writeFileSync(RAW_PATH, savedRaw); else if (fs.existsSync(RAW_PATH)) fs.unlinkSync(RAW_PATH);
    if (savedRecon) fs.writeFileSync(RECON_PATH, savedRecon); else if (fs.existsSync(RECON_PATH)) fs.unlinkSync(RECON_PATH);
    console.log('\n(restored the real village fixtures; pass --keep to leave the last synthetic run in place)');
  }
}

if (!allPass) process.exitCode = 1;
