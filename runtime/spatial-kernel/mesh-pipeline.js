// SHADED Spatial Kernel — mesh optimization pipeline (spec §15, zeux/meshoptimizer
// donor). The production path should use meshoptimizer directly (license fit);
// these are correct, dependency-free reference implementations for small meshes
// and for the pipeline scaffold. Collision and visual geometry must NEVER be
// simplified with identical thresholds (spec §15) — callers pass separate ones.

// Build a compact indexed mesh from a flat [x,y,z,...] position array.
export function indexMesh(positions, stride = 3) {
  const n = positions.length / stride;
  const map = new Map();
  const unique = [];
  const indices = [];
  for (let i = 0; i < n; i++) {
    const key = [positions[i * stride], positions[i * stride + 1], positions[i * stride + 2]].map((v) => v.toFixed(5)).join(',');
    let u = map.get(key);
    if (u === undefined) { u = unique.length / stride; unique.push(positions[i * stride], positions[i * stride + 1], positions[i * stride + 2]); map.set(key, u); }
    indices.push(u);
  }
  return { positions: unique, indices };
}

// Weld vertices within `tol` (rounded-key hash). Returns welded positions and a
// remap array (old index -> new index).
export function weldVertices(positions, tol = 1e-4, stride = 3) {
  const n = positions.length / stride;
  const map = new Map();
  const out = [];
  const remap = new Int32Array(n);
  const q = (v) => Math.round(v / tol);
  for (let i = 0; i < n; i++) {
    const key = [q(positions[i * stride]), q(positions[i * stride + 1]), q(positions[i * stride + 2])].join(',');
    let u = map.get(key);
    if (u === undefined) { u = out.length / stride; out.push(positions[i * stride], positions[i * stride + 1], positions[i * stride + 2]); map.set(key, u); }
    remap[i] = u;
  }
  return { positions: out, remap };
}

// Remove degenerate (zero-area) triangles from an index buffer.
export function removeDegenerate(indices, positions, stride = 3) {
  const out = [];
  for (let t = 0; t < indices.length; t += 3) {
    const a = indices[t], b = indices[t + 1], c = indices[t + 2];
    if (a === b || b === c || a === c) continue;
    const ax = positions[a * stride], ay = positions[a * stride + 1], az = positions[a * stride + 2];
    const bx = positions[b * stride], by = positions[b * stride + 1], bz = positions[b * stride + 2];
    const cx = positions[c * stride], cy = positions[c * stride + 1], cz = positions[c * stride + 2];
    const abx = bx - ax, aby = by - ay, abz = bz - az;
    const acx = cx - ax, acy = cy - ay, acz = cz - az;
    const crx = aby * acz - abz * acy, cry = abz * acx - abx * acz, crz = abx * acy - aby * acx;
    if (crx * crx + cry * cry + crz * crz < 1e-12) continue; // degenerate
    out.push(a, b, c);
  }
  return out;
}

// Quantize positions to `bits` (signed) and return a dequantizer. Real meshopt
// does this with better error diffusion; this is the reference version.
export function quantizePositions(positions, bits = 14, stride = 3) {
  const range = 1 << (bits - 1);
  const out = new Int16Array(positions.length);
  const dequant = (arr) => {
    const f = new Float32Array(arr.length);
    for (let i = 0; i < arr.length; i++) f[i] = arr[i] / range;
    return f;
  };
  for (let i = 0; i < positions.length; i++) out[i] = Math.max(-range, Math.min(range - 1, Math.round(positions[i] * range)));
  return { quantized: out, dequantize: dequant };
}

// Greedy triangle decimation: iteratively drop the smallest-area triangle until
// the target ratio is reached. O(n^2) — fine for small meshes; production uses
// meshopt for large ones.
export function simplifyGreedy(indices, positions, ratio = 0.5, stride = 3) {
  if (ratio >= 1) return indices.slice();
  const area = (a, b, c) => {
    const crx = (positions[b * stride + 1] - positions[a * stride + 1]) * (positions[c * stride + 2] - positions[a * stride + 2]) - (positions[b * stride + 2] - positions[a * stride + 2]) * (positions[c * stride + 1] - positions[a * stride + 1]);
    return Math.abs(crx) * 0.5;
  };
  let tris = indices.slice();
  const target = Math.max(3, Math.floor(indices.length * ratio));
  while (tris.length > target) {
    let minI = 0, minA = Infinity;
    for (let t = 0; t < tris.length; t += 3) {
      const a = area(tris[t], tris[t + 1], tris[t + 2]);
      if (a < minA) { minA = a; minI = t; }
    }
    tris.splice(minI, 3);
  }
  return tris;
}

// Full pipeline: positions -> index/weld -> remove degenerate -> quantize.
// `simplifyRatio` triggers greedy decimation when < 1.
export function optimizeMesh(positions, opts = {}) {
  const { bits = 14, simplifyRatio = 1, stride = 3 } = opts;
  const indexed = indexMesh(positions, stride);
  let indices = indexed.indices;
  let pos = indexed.positions;
  indices = removeDegenerate(indices, pos, stride);
  if (simplifyRatio < 1) indices = simplifyGreedy(indices, pos, simplifyRatio, stride);
  const q = quantizePositions(pos, bits, stride);
  return { positions: pos, indices, quantized: q.quantized, triangleCount: indices.length / 3 };
}
