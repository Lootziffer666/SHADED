// SHADED Spatial Kernel — improved reconstruction (spec §6). Self-contained.
const EPS = 1e-9;
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const mul = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const length = a => Math.hypot(a[0], a[1], a[2]);
const xyz = p => [p.x, p.y, p.z];

function covariance(points, indices) {
  const n = indices.length;
  const center = [0, 0, 0];
  for (const i of indices) { const p = xyz(points[i]); center[0] += p[0]; center[1] += p[1]; center[2] += p[2]; }
  center[0] /= n; center[1] /= n; center[2] /= n;
  let sxx = 0, syy = 0, szz = 0, sxy = 0, sxz = 0, syz = 0;
  for (const i of indices) {
    const d = sub(xyz(points[i]), center);
    sxx += d[0] * d[0]; syy += d[1] * d[1]; szz += d[2] * d[2];
    sxy += d[0] * d[1]; sxz += d[0] * d[2]; syz += d[1] * d[2];
  }
  const inv = 1 / Math.max(1, n);
  return { matrix: [[sxx * inv, sxy * inv, sxz * inv], [sxy * inv, syy * inv, syz * inv], [sxz * inv, syz * inv, szz * inv]], center };
}

function eigenSymmetric3(m) {
  const a = [[m[0][0], m[0][1], m[0][2]], [m[0][1], m[1][1], m[1][2]], [m[0][2], m[1][2], m[2][2]]];
  const v = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
  for (let sweep = 0; sweep < 50; sweep++) {
    const off = Math.abs(a[0][1]) + Math.abs(a[0][2]) + Math.abs(a[1][2]);
    if (off < 1e-12) break;
    for (let p = 0; p < 2; p++) for (let q = p + 1; q < 3; q++) {
      if (Math.abs(a[p][q]) < 1e-15) continue;
      const phi = 0.5 * Math.atan2(2 * a[p][q], a[q][q] - a[p][p]);
      const c = Math.cos(phi), s = Math.sin(phi);
      for (let k = 0; k < 3; k++) { const akp = a[k][p], akq = a[k][q]; a[k][p] = c * akp - s * akq; a[k][q] = s * akp + c * akq; }
      for (let k = 0; k < 3; k++) { const apk = a[p][k], aqk = a[q][k]; a[p][k] = c * apk - s * aqk; a[q][k] = s * apk + c * aqk; }
      for (let k = 0; k < 3; k++) { const vkp = v[k][p], vkq = v[k][q]; v[k][p] = c * vkp - s * vkq; v[k][q] = s * vkp + c * vkq; }
    }
  }
  const values = [a[0][0], a[1][1], a[2][2]];
  const vectors = [[v[0][0], v[1][0], v[2][0]], [v[0][1], v[1][1], v[2][1]], [v[0][2], v[1][2], v[2][2]]];
  const order = [0, 1, 2].sort((i, j) => values[i] - values[j]);
  return order.map(i => ({ value: values[i], vector: vectors[i] }));
}

function buildBuckets(points, cellSize) {
  const buckets = new Map();
  for (let i = 0; i < points.length; i++) {
    const p = xyz(points[i]);
    const k = [Math.floor(p[0] / cellSize), Math.floor(p[1] / cellSize), Math.floor(p[2] / cellSize)].join(':');
    if (!buckets.has(k)) buckets.set(k, []);
    buckets.get(k).push(i);
  }
  return buckets;
}
function bucketNeighbours(buckets, points, index, cellSize, limit) {
  const p = xyz(points[index]);
  const c = [Math.floor(p[0] / cellSize), Math.floor(p[1] / cellSize), Math.floor(p[2] / cellSize)];
  const out = [];
  for (let dz = -1; dz <= 1; dz++) for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
    const arr = buckets.get((c[0] + dx) + ':' + (c[1] + dy) + ':' + (c[2] + dz));
    if (!arr) continue;
    for (const j of arr) { if (j !== index) out.push(j); if (out.length > limit * 27) return out; }
  }
  return out;
}

export function geometryNeighbourhood(points, index, opts = {}) {
  const k = opts.k ?? 16;
  const maxJump = opts.maxJumpFactor ?? 3;
  const n = points.length;
  let cellSize = opts.cellSize;
  if (!cellSize) {
    let min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
    for (const p of points) { const q = xyz(p); for (let a = 0; a < 3; a++) { min[a] = Math.min(min[a], q[a]); max[a] = Math.max(max[a], q[a]); } }
    const diag = length(sub(max, min));
    cellSize = Math.max(diag / Math.cbrt(Math.max(1, n)) * 2.2, 1e-4);
  }
  const buckets = buildBuckets(points, cellSize);
  const cand = bucketNeighbours(buckets, points, index, cellSize, Math.max(k * 3, 32));
  const dists = cand.map(j => ({ j, d: length(sub(xyz(points[j]), xyz(points[index]))) })).sort((a, b) => a.d - b.d);
  const near = dists.slice(0, Math.min(k * 2, dists.length));
  const localScale = near.length >= 3 ? near[Math.floor(near.length / 2)].d || EPS : EPS;
  const jumpLimit = localScale * maxJump;
  const kept = dists.filter(e => e.d <= jumpLimit).slice(0, k).map(e => e.j);
  return { neighbours: kept, localScale, jumpLimit };
}

export function estimatePointNormalsRobust(points, opts = {}) {
  const k = opts.k ?? 16;
  const results = new Array(points.length);
  for (let i = 0; i < points.length; i++) {
    const { neighbours, localScale } = geometryNeighbourhood(points, i, { k });
    if (neighbours.length < 4) { results[i] = { normal: [0, 0, -1], confidence: 0, reliability: 0, index: i }; continue; }
    const cov = covariance(points, [i, ...neighbours]);
    const eig = eigenSymmetric3(cov.matrix);
    let normal = eig[0].vector;
    if (dot(normal, xyz(points[i])) > 0) normal = mul(normal, -1);
    const conf = clamp(1 - eig[0].value / Math.max(eig[2].value, EPS), 0, 1);
    let jumps = 0;
    for (const j of neighbours) if (length(sub(xyz(points[j]), xyz(points[i]))) > localScale * 2.5) jumps++;
    const reliability = conf * (1 - jumps / Math.max(1, neighbours.length));
    results[i] = { normal, confidence: conf, reliability, index: i };
  }
  return results;
}

// density-aware connectivity distance (§6D): a fixed fraction of the bounding
// diagonal fails for sparse shells (e.g. a low-res sphere), so we base the
// limit on the median nearest-neighbour spacing instead.
export function connectedComponents3D(points, normals, opts = {}) {
  const n = points.length;
  if (!n) return [];
  let min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  for (const p of points) { const q = xyz(p); for (let a = 0; a < 3; a++) { min[a] = Math.min(min[a], q[a]); max[a] = Math.max(max[a], q[a]); } }
  const diag = length(sub(max, min));
  let distanceLimit = opts.componentDistanceThreshold;
  if (!distanceLimit) {
    const spacings = [];
    for (let s = 0; s < Math.min(n, 64); s++) {
      const { localScale } = geometryNeighbourhood(points, s, { k: 4 });
      if (localScale > EPS) spacings.push(localScale);
    }
    spacings.sort((a, b) => a - b);
    const nn = spacings.length ? spacings[Math.floor(spacings.length / 2)] : diag * 0.05;
    distanceLimit = Math.max(nn * 2.5, diag * 0.01, 1e-4);
  }
  const normalCos = Math.cos((opts.normalAngleDegrees || 28) * Math.PI / 180);
  const cell = distanceLimit;
  const buckets = buildBuckets(points, cell);
  const visited = new Uint8Array(n), components = [];
  for (let seed = 0; seed < n; seed++) {
    if (visited[seed]) continue;
    const comp = [], queue = [seed]; visited[seed] = 1;
    while (queue.length) {
      const cur = queue.pop(); comp.push(cur);
      const p = xyz(points[cur]);
      const c = [Math.floor(p[0] / cell), Math.floor(p[1] / cell), Math.floor(p[2] / cell)];
      for (let dz = -1; dz <= 1; dz++) for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const arr = buckets.get((c[0] + dx) + ':' + (c[1] + dy) + ':' + (c[2] + dz));
        if (!arr) continue;
        for (const next of arr) {
          if (visited[next]) continue;
          const dd = length(sub(xyz(points[next]), p));
          if (dd > distanceLimit) continue;
          if (normals && normals[next] && dot(normals[cur].normal, normals[next].normal) < normalCos) continue;
          visited[next] = 1; queue.push(next);
        }
      }
    }
    components.push(comp);
  }
  return components.sort((a, b) => b.length - a.length);
}

function fitSphere(points, indices) {
  const center = [0, 0, 0];
  for (const i of indices) { const p = xyz(points[i]); center[0] += p[0]; center[1] += p[1]; center[2] += p[2]; }
  const inv = 1 / indices.length; center[0] *= inv; center[1] *= inv; center[2] *= inv;
  let r = 0; for (const i of indices) r += length(sub(xyz(points[i]), center)); r *= inv;
  let sq = 0; for (const i of indices) { const d = length(sub(xyz(points[i]), center)) - r; sq += d * d; }
  return { type: 'sphere', model: { center, radius: r }, indices, rmse: Math.sqrt(sq / indices.length) };
}
function fitCapsule(points, indices) {
  const stat = covariance(points, indices), axis = eigenSymmetric3(stat.matrix)[2].vector;
  let tmin = Infinity, tmax = -Infinity;
  for (const i of indices) { const t = dot(sub(xyz(points[i]), stat.center), axis); tmin = Math.min(tmin, t); tmax = Math.max(tmax, t); }
  const a = add(stat.center, mul(axis, tmin)), b = add(stat.center, mul(axis, tmax));
  let r = 0; for (const i of indices) { const t = clamp(dot(sub(xyz(points[i]), stat.center), axis), tmin, tmax); const proj = add(stat.center, mul(axis, t)); r += length(sub(xyz(points[i]), proj)); } r /= indices.length;
  let sq = 0; for (const i of indices) { const t = clamp(dot(sub(xyz(points[i]), stat.center), axis), tmin, tmax); const proj = add(stat.center, mul(axis, t)); const d = length(sub(xyz(points[i]), proj)) - r; sq += d * d; }
  return { type: 'capsule', model: { a, b, radius: r }, indices, rmse: Math.sqrt(sq / indices.length) };
}

export function fitGeometricPrimitivesExtended(points, opts = {}) {
  const normals = estimatePointNormalsRobust(points, opts);
  const components = connectedComponents3D(points, normals, opts);
  const minimum = opts.minComponentSize || Math.max(6, Math.floor(points.length * 0.0008));
  const primitives = [];
  for (const comp of components) {
    if (comp.length < minimum) continue;
    const sphere = fitSphere(points, comp);
    const capsule = fitCapsule(points, comp);
    const stat = covariance(points, comp), eig = eigenSymmetric3(stat.matrix), mean = stat.center;
    const planeErr = eig[0].value;
    const candidates = [
      { p: sphere, complexity: 2 },
      { p: capsule, complexity: 2 },
      { p: { type: 'plane', model: { normal: eig[0].vector, center: mean }, indices: comp, rmse: Math.sqrt(planeErr) }, complexity: 1 },
    ];
    const score = c => Math.exp(-c.p.rmse * 8) / c.complexity;
    candidates.sort((a, b) => score(b) - score(a));
    const best = candidates[0].p;
    if (best.type === 'plane') {
      const nrm = best.model.normal, up = Math.abs(nrm[1]);
      if (up > 0.92) best.type = 'floor';
      else if (up < 0.25) best.type = 'wall';
      else best.type = 'slab';
    }
    best.id = primitives.length;
    best.confidence = clamp(Math.exp(-best.rmse * 8), 0, 1);
    primitives.push(best);
  }
  return { primitives, normals, components };
}
