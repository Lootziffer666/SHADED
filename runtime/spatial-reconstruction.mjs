// Geometry reconstruction used by SHADED's free spatial viewer.
// Visible samples remain OBSERVED. Any completion is explicitly GENERATED.

const EPS = 1e-9;
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const mul = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const length = a => Math.hypot(a[0], a[1], a[2]);
const normalize = a => { const n = length(a); return n > EPS ? mul(a, 1 / n) : [0, 1, 0]; };
const xyz = p => [p.x, p.y, p.z];

export function seededRandom(seed = 17) {
  let state = (Number(seed) || 17) >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function covariance(points, indices) {
  const center = [0, 0, 0];
  for (const index of indices) {
    const p = points[index];
    center[0] += p.x; center[1] += p.y; center[2] += p.z;
  }
  const inv = 1 / Math.max(1, indices.length);
  center[0] *= inv; center[1] *= inv; center[2] *= inv;
  const matrix = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  for (const index of indices) {
    const d = sub(xyz(points[index]), center);
    for (let r = 0; r < 3; r++) for (let c = r; c < 3; c++) matrix[r][c] += d[r] * d[c];
  }
  for (let r = 0; r < 3; r++) for (let c = r; c < 3; c++) {
    matrix[r][c] *= inv; matrix[c][r] = matrix[r][c];
  }
  return { center, matrix };
}

// Jacobi eigensolver for a real symmetric 3x3 matrix.
function eigenSymmetric3(input) {
  const a = input.map(row => row.slice());
  const v = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
  for (let iteration = 0; iteration < 24; iteration++) {
    let p = 0, q = 1, maximum = Math.abs(a[0][1]);
    for (const pair of [[0, 2], [1, 2]]) {
      const value = Math.abs(a[pair[0]][pair[1]]);
      if (value > maximum) { maximum = value; p = pair[0]; q = pair[1]; }
    }
    if (maximum < 1e-12) break;
    const angle = 0.5 * Math.atan2(2 * a[p][q], a[q][q] - a[p][p]);
    const c = Math.cos(angle), s = Math.sin(angle);
    for (let k = 0; k < 3; k++) {
      const apk = a[p][k], aqk = a[q][k];
      a[p][k] = c * apk - s * aqk;
      a[q][k] = s * apk + c * aqk;
    }
    for (let k = 0; k < 3; k++) {
      const akp = a[k][p], akq = a[k][q];
      a[k][p] = c * akp - s * akq;
      a[k][q] = s * akp + c * akq;
      const vkp = v[k][p], vkq = v[k][q];
      v[k][p] = c * vkp - s * vkq;
      v[k][q] = s * vkp + c * vkq;
    }
  }
  return [0, 1, 2].map(i => ({ value: a[i][i], vector: normalize([v[0][i], v[1][i], v[2][i]]) }))
    .sort((left, right) => right.value - left.value);
}

function pointGridKey(p) {
  if (Number.isInteger(p.gridX) && Number.isInteger(p.gridY)) return p.gridX + ":" + p.gridY;
  if (Number.isInteger(p.pixelX) && Number.isInteger(p.pixelY)) return p.pixelX + ":" + p.pixelY;
  return null;
}

export function estimatePointNormals(points) {
  const lookup = new Map();
  let structured = true;
  for (let i = 0; i < points.length; i++) {
    const key = pointGridKey(points[i]);
    if (key == null) { structured = false; break; }
    lookup.set(key, i);
  }
  if (structured) {
    const stepX = points.find(p => Number.isFinite(p.gridX)) ? 1 : Math.max(1, points[0]?.step || 1);
    const stepY = stepX;
    return points.map((p, index) => {
      const gx = Number.isFinite(p.gridX) ? p.gridX : p.pixelX;
      const gy = Number.isFinite(p.gridY) ? p.gridY : p.pixelY;
      const left = lookup.get((gx - stepX) + ":" + gy), right = lookup.get((gx + stepX) + ":" + gy);
      const up = lookup.get(gx + ":" + (gy - stepY)), down = lookup.get(gx + ":" + (gy + stepY));
      if (left == null || right == null || up == null || down == null) return { normal: [0, 0, -1], confidence: 0 };
      let n = normalize(cross(sub(xyz(points[right]), xyz(points[left])), sub(xyz(points[down]), xyz(points[up]))));
      if (dot(n, xyz(p)) > 0) n = mul(n, -1);
      const horizontal = length(sub(xyz(points[right]), xyz(points[left])));
      const vertical = length(sub(xyz(points[down]), xyz(points[up])));
      return { normal: n, confidence: clamp(Math.min(horizontal, vertical) / Math.max(horizontal, vertical, EPS), 0, 1), index };
    });
  }

  // Generic fallback: local PCA in a spatial hash, never an O(n^2) all-pairs pass.
  const bounds = pointBounds(points);
  const cellSize = Math.max(bounds.diagonal / Math.cbrt(Math.max(1, points.length)) * 2.2, 1e-4);
  const buckets = new Map();
  const cell = p => [Math.floor(p.x / cellSize), Math.floor(p.y / cellSize), Math.floor(p.z / cellSize)];
  points.forEach((p, index) => { const c = cell(p), key = c.join(":"); if (!buckets.has(key)) buckets.set(key, []); buckets.get(key).push(index); });
  return points.map((p, index) => {
    const c = cell(p), candidates = [];
    for (let z = -1; z <= 1; z++) for (let y = -1; y <= 1; y++) for (let x = -1; x <= 1; x++) {
      for (const other of buckets.get([c[0] + x, c[1] + y, c[2] + z].join(":")) || []) if (other !== index) candidates.push(other);
    }
    candidates.sort((a, b) => length(sub(xyz(points[a]), xyz(p))) - length(sub(xyz(points[b]), xyz(p))));
    const neighbours = [index, ...candidates.slice(0, 12)];
    if (neighbours.length < 4) return { normal: [0, 0, -1], confidence: 0, index };
    const eig = eigenSymmetric3(covariance(points, neighbours).matrix);
    let normal = eig[2].vector;
    if (dot(normal, xyz(p)) > 0) normal = mul(normal, -1);
    return { normal, confidence: clamp(1 - eig[2].value / Math.max(eig[0].value, EPS), 0, 1), index };
  });
}

function pointBounds(points, indices = points.map((_, i) => i)) {
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  for (const index of indices) {
    const p = points[index];
    min[0] = Math.min(min[0], p.x); min[1] = Math.min(min[1], p.y); min[2] = Math.min(min[2], p.z);
    max[0] = Math.max(max[0], p.x); max[1] = Math.max(max[1], p.y); max[2] = Math.max(max[2], p.z);
  }
  if (!indices.length) return { min: [-1, -1, -1], max: [1, 1, 1], diagonal: Math.sqrt(12) };
  return { min, max, diagonal: length(sub(max, min)) };
}

export function connectedSurfaceComponents(points, normals, options = {}) {
  if (!points.length) return [];
  const lookup = new Map(), structured = points.every(p => pointGridKey(p) != null);
  if (structured) points.forEach((p, i) => lookup.set(pointGridKey(p), i));
  const bounds = pointBounds(points);
  let spacing = 0;
  if (structured) {
    const samples = [];
    for (let i = 0; i < points.length && samples.length < 512; i++) {
      const p = points[i], gx = Number.isFinite(p.gridX) ? p.gridX : p.pixelX, gy = Number.isFinite(p.gridY) ? p.gridY : p.pixelY;
      const step = Number.isFinite(p.gridX) ? 1 : Math.max(1, p.step || 1);
      for (const key of [(gx + step) + ":" + gy, gx + ":" + (gy + step)]) {
        const neighbour = lookup.get(key); if (neighbour != null) samples.push(length(sub(xyz(points[neighbour]), xyz(p))));
      }
    }
    samples.sort((a, b) => a - b); spacing = samples[Math.floor(samples.length / 2)] || 0;
  }
  const distanceLimit = options.componentDistanceThreshold || Math.max(bounds.diagonal * 0.025, spacing * 2.5, 1e-4);
  const normalCos = Math.cos((options.normalAngleDegrees || 28) * Math.PI / 180);
  const visited = new Uint8Array(points.length), components = [];
  const neighboursOf = index => {
    const p = points[index];
    if (structured) {
      const gx = Number.isFinite(p.gridX) ? p.gridX : p.pixelX, gy = Number.isFinite(p.gridY) ? p.gridY : p.pixelY;
      const step = Number.isFinite(p.gridX) ? 1 : Math.max(1, p.step || 1);
      return [[gx - step, gy], [gx + step, gy], [gx, gy - step], [gx, gy + step]].map(q => lookup.get(q[0] + ":" + q[1])).filter(v => v != null);
    }
    const nearest = [];
    for (let i = 0; i < points.length; i++) if (i !== index) {
      const d = length(sub(xyz(points[i]), xyz(p)));
      if (d <= distanceLimit) nearest.push([d, i]);
    }
    return nearest.sort((a, b) => a[0] - b[0]).slice(0, 8).map(v => v[1]);
  };
  for (let seed = 0; seed < points.length; seed++) {
    if (visited[seed]) continue;
    const component = [], queue = [seed]; visited[seed] = 1;
    while (queue.length) {
      const current = queue.pop(); component.push(current);
      for (const next of neighboursOf(current)) {
        if (visited[next]) continue;
        if (length(sub(xyz(points[current]), xyz(points[next]))) > distanceLimit) continue;
        if (Math.abs(dot(normals[current].normal, normals[next].normal)) < normalCos) continue;
        visited[next] = 1; queue.push(next);
      }
    }
    components.push(component);
  }
  return components.sort((a, b) => b.length - a.length);
}

function planeFromThree(a, b, c) {
  const normal = normalize(cross(sub(b, a), sub(c, a)));
  if (length(normal) < EPS) return null;
  return { normal, offset: -dot(normal, a) };
}

function planeDistance(plane, p) { return Math.abs(dot(plane.normal, xyz(p)) + plane.offset); }

function refinePlane(points, indices) {
  const stats = covariance(points, indices), eig = eigenSymmetric3(stats.matrix);
  let normal = eig[2].vector;
  if (dot(normal, stats.center) > 0) normal = mul(normal, -1);
  return { normal, offset: -dot(normal, stats.center), center: stats.center, eigenvalues: eig.map(e => e.value), axes: [eig[0].vector, eig[1].vector, normal] };
}

export function fitPlaneRansac(points, indices, options = {}) {
  if (indices.length < 3) return null;
  const random = seededRandom(options.seed || 17), bounds = pointBounds(points, indices);
  const threshold = options.distanceThreshold || Math.max(bounds.diagonal * 0.012, 1e-4);
  let best = null;
  for (let iteration = 0; iteration < (options.iterations || 96); iteration++) {
    const selected = [];
    while (selected.length < 3) { const candidate = indices[Math.floor(random() * indices.length)]; if (!selected.includes(candidate)) selected.push(candidate); }
    const plane = planeFromThree(xyz(points[selected[0]]), xyz(points[selected[1]]), xyz(points[selected[2]]));
    if (!plane) continue;
    const inliers = indices.filter(index => planeDistance(plane, points[index]) <= threshold);
    if (!best || inliers.length > best.inliers.length) best = { ...plane, inliers };
  }
  if (!best || best.inliers.length < 3) return null;
  const refined = refinePlane(points, best.inliers);
  let squared = 0; for (const index of best.inliers) squared += planeDistance(refined, points[index]) ** 2;
  return { ...refined, inliers: best.inliers, threshold, rmse: Math.sqrt(squared / best.inliers.length), coverage: best.inliers.length / indices.length };
}

function projectedExtents(points, indices, center, axes) {
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  for (const index of indices) {
    const d = sub(xyz(points[index]), center);
    for (let axis = 0; axis < 3; axis++) { const value = dot(d, axes[axis]); min[axis] = Math.min(min[axis], value); max[axis] = Math.max(max[axis], value); }
  }
  return { min, max, half: min.map((value, i) => Math.max(1e-4, (max[i] - value) / 2)), localCenter: min.map((value, i) => (value + max[i]) / 2) };
}

function convexHull2(points) {
  if (points.length <= 3) return points.slice();
  const sorted = points.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const turn = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower = [], upper = [];
  for (const p of sorted) { while (lower.length >= 2 && turn(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop(); lower.push(p); }
  for (let i = sorted.length - 1; i >= 0; i--) { const p = sorted[i]; while (upper.length >= 2 && turn(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop(); upper.push(p); }
  lower.pop(); upper.pop(); return lower.concat(upper);
}

function insideConvex2(point, polygon) {
  if (!polygon || polygon.length < 3) return true;
  let sign = 0;
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i], b = polygon[(i + 1) % polygon.length], value = (b[0] - a[0]) * (point[1] - a[1]) - (b[1] - a[1]) * (point[0] - a[0]);
    if (Math.abs(value) < 1e-9) continue;
    const current = Math.sign(value); if (sign && current !== sign) return false; sign = current;
  }
  return true;
}

function fitBox(points, indices) {
  const stats = covariance(points, indices), eig = eigenSymmetric3(stats.matrix), axes = eig.map(e => e.vector);
  const extents = projectedExtents(points, indices, stats.center, axes);
  const center = add(stats.center, axes.reduce((sum, axis, i) => add(sum, mul(axis, extents.localCenter[i])), [0, 0, 0]));
  let squared = 0;
  for (const index of indices) {
    const d = sub(xyz(points[index]), center), local = axes.map(axis => dot(d, axis));
    const faceDistance = Math.min(...local.map((value, i) => Math.abs(Math.abs(value) - extents.half[i])));
    squared += faceDistance * faceDistance;
  }
  return { center, axes, halfExtents: extents.half, rmse: Math.sqrt(squared / Math.max(1, indices.length)) };
}

function fitCylinder(points, indices, box) {
  const axis = box.axes[0], center = box.center, halfHeight = box.halfExtents[0], radii = [];
  for (const index of indices) {
    const d = sub(xyz(points[index]), center), axial = dot(d, axis), radial = sub(d, mul(axis, axial)); radii.push(length(radial));
  }
  const radius = radii.reduce((a, b) => a + b, 0) / Math.max(1, radii.length);
  const rmse = Math.sqrt(radii.reduce((sum, value) => sum + (value - radius) ** 2, 0) / Math.max(1, radii.length));
  return { center, axis, halfHeight, radius, rmse, radialVariation: rmse / Math.max(radius, EPS) };
}

export function fitGeometricPrimitives(points, options = {}) {
  if (!points.length) return { primitives: [], normals: [], components: [], metrics: { coverage: 0, rmse: null, normalizedRmse: null, score: 0 } };
  const normals = estimatePointNormals(points), components = connectedSurfaceComponents(points, normals, options);
  const minimum = options.minComponentSize || Math.max(6, Math.floor(points.length * 0.0008));
  const primitives = [], assigned = new Uint8Array(points.length), globalBounds = pointBounds(points);
  for (const component of components) {
    if (component.length < minimum) continue;
    const plane = fitPlaneRansac(points, component, { seed: (options.seed || 17) + primitives.length * 101, iterations: options.ransacIterations || 96, distanceThreshold: options.distanceThreshold });
    const box = fitBox(points, component), cylinder = fitCylinder(points, component, box);
    let primitive;
    if (plane && plane.coverage >= (options.planeCoverage || 0.72)) {
      const extents = projectedExtents(points, plane.inliers, plane.center, plane.axes);
      const center = add(plane.center, add(mul(plane.axes[0], extents.localCenter[0]), mul(plane.axes[1], extents.localCenter[1])));
      const polygon = convexHull2(plane.inliers.map(index => { const d = sub(xyz(points[index]), center); return [dot(d, plane.axes[0]), dot(d, plane.axes[1])]; }));
      primitive = { type: 'plane', model: { normal: plane.normal, offset: plane.offset, center, axes: plane.axes.slice(0, 2), halfExtents: extents.half.slice(0, 2), polygon }, indices: plane.inliers, rmse: plane.rmse, coverage: plane.coverage };
    } else if (cylinder.radialVariation < 0.24 && cylinder.halfHeight > cylinder.radius * 1.25) {
      primitive = { type: 'cylinder', model: cylinder, indices: component.slice(), rmse: cylinder.rmse, coverage: 1 };
    } else {
      primitive = { type: 'box', model: box, indices: component.slice(), rmse: box.rmse, coverage: 1 };
    }
    primitive.id = primitives.length;
    primitive.fitScore = clamp(primitive.coverage * Math.exp(-primitive.rmse / Math.max(globalBounds.diagonal * 0.02, EPS)), 0, 1);
    primitive.scoreKind = 'HEURISTIC_RESIDUAL_COVERAGE_SCORE';
    primitive.indices.forEach(index => { assigned[index] = 1; });
    primitives.push(primitive);
  }
  const covered = assigned.reduce((sum, value) => sum + value, 0), weightedSquared = primitives.reduce((sum, p) => sum + p.rmse * p.rmse * p.indices.length, 0);
  const rmse = covered ? Math.sqrt(weightedSquared / covered) : null, normalizedRmse = rmse == null ? null : rmse / Math.max(globalBounds.diagonal, EPS);
  const coverage = covered / points.length, score = rmse == null ? 0 : clamp(coverage * Math.exp(-normalizedRmse * 40), 0, 1);
  return { primitives, normals, components, metrics: { coverage, rmse, normalizedRmse, score, observedPoints: points.length, fittedPoints: covered } };
}

function primitiveBasis(primitive) {
  if (primitive.type === 'plane') return { center: primitive.model.center, axes: [primitive.model.axes[0], primitive.model.axes[1], primitive.model.normal] };
  if (primitive.type === 'box') return { center: primitive.model.center, axes: primitive.model.axes };
  const axis = primitive.model.axis, helper = Math.abs(axis[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0], tangent = normalize(cross(axis, helper));
  return { center: primitive.model.center, axes: [axis, tangent, normalize(cross(axis, tangent))] };
}

function colourFromObserved(points, primitive, position, blend = 0.75) {
  const basis = primitiveBasis(primitive), local = sub(position, basis.center), target = [dot(local, basis.axes[0]), dot(local, basis.axes[1]), dot(local, basis.axes[2])];
  const stride = Math.max(1, Math.ceil(primitive.indices.length / 256)), nearest = [];
  for (let offset = 0; offset < primitive.indices.length; offset += stride) {
    const index = primitive.indices[offset];
    const d = sub(xyz(points[index]), basis.center), q = [dot(d, basis.axes[0]), dot(d, basis.axes[1]), dot(d, basis.axes[2])];
    const candidate = { index, distance: Math.hypot(q[0] - target[0], q[1] - target[1]) };
    let insert = nearest.findIndex(item => candidate.distance < item.distance); if (insert < 0) insert = nearest.length;
    nearest.splice(insert, 0, candidate); if (nearest.length > 4) nearest.pop();
  }
  let weightSum = 0, r = 0, g = 0, b = 0;
  for (const item of nearest) { const weight = 1 / Math.max(item.distance, 1e-5); const p = points[item.index]; weightSum += weight; r += p.r * weight; g += p.g * weight; b += p.b * weight; }
  const source = points[nearest[0]?.index] || { r: 128, g: 128, b: 128 };
  const mixed = weightSum ? [r / weightSum, g / weightSum, b / weightSum] : [source.r, source.g, source.b];
  return { color: [source.r * (1 - blend) + mixed[0] * blend, source.g * (1 - blend) + mixed[1] * blend, source.b * (1 - blend) + mixed[2] * blend], sources: nearest.map(item => item.index), weights: nearest.map(item => 1 / Math.max(item.distance, 1e-5)) };
}

function generatedPoint(points, primitive, position, blend) {
  const sample = colourFromObserved(points, primitive, position, blend);
  return { x: position[0], y: position[1], z: position[2], r: sample.color[0], g: sample.color[1], b: sample.color[2], generated: true, synthesized: true, provenance: 'GENERATED', generationMethod: `primitive-${primitive.type}`, primitiveId: primitive.id, primitiveType: primitive.type, textureSources: sample.sources, textureWeights: sample.weights, confidence: null, reliability: 'NOT_MEASURED', fitScore: primitive.fitScore, fitScoreKind: primitive.scoreKind };
}

function samplePlaneCompletion(points, primitive, options) {
  const m = primitive.model, thickness = options.thickness, density = clamp(Math.ceil(Math.sqrt(primitive.indices.length) * 0.72), 4, 48), out = [];
  for (let iy = 0; iy <= density; iy++) for (let ix = 0; ix <= density; ix++) {
    const u = (ix / density * 2 - 1) * m.halfExtents[0], v = (iy / density * 2 - 1) * m.halfExtents[1];
    if (!insideConvex2([u, v], m.polygon)) continue;
    const back = sub(add(add(m.center, mul(m.axes[0], u)), mul(m.axes[1], v)), mul(m.normal, thickness));
    out.push(generatedPoint(points, primitive, back, options.textureBlend));
  }
  for (let edge = 0; edge < m.polygon.length; edge++) {
    const a = m.polygon[edge], b = m.polygon[(edge + 1) % m.polygon.length], samples = Math.max(2, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / Math.max(m.halfExtents[0], m.halfExtents[1], EPS) * density));
    for (let sample = 0; sample <= samples; sample++) {
      const t = sample / samples, u = a[0] + (b[0] - a[0]) * t, v = a[1] + (b[1] - a[1]) * t;
      const front = add(add(m.center, mul(m.axes[0], u)), mul(m.axes[1], v));
      for (let layer = 1; layer <= options.sideLayers; layer++) out.push(generatedPoint(points, primitive, sub(front, mul(m.normal, thickness * layer / options.sideLayers)), options.textureBlend));
    }
  }
  return out;
}

function sampleBoxCompletion(points, primitive, options) {
  const m = primitive.model, out = [], camera = [0, 0, 0];
  for (let axis = 0; axis < 3; axis++) for (const sign of [-1, 1]) {
    const normal = mul(m.axes[axis], sign), faceCenter = add(m.center, mul(normal, m.halfExtents[axis]));
    // Only complete faces that do not face the source camera.
    if (dot(normal, sub(camera, faceCenter)) > 0.12) continue;
    const other = [0, 1, 2].filter(value => value !== axis), density = clamp(Math.ceil(Math.sqrt(primitive.indices.length) * 0.45), 4, 36);
    for (let y = 0; y <= density; y++) for (let x = 0; x <= density; x++) {
      let position = faceCenter;
      position = add(position, mul(m.axes[other[0]], (x / density * 2 - 1) * m.halfExtents[other[0]]));
      position = add(position, mul(m.axes[other[1]], (y / density * 2 - 1) * m.halfExtents[other[1]]));
      out.push(generatedPoint(points, primitive, position, options.textureBlend));
    }
  }
  return out;
}

function sampleCylinderCompletion(points, primitive, options) {
  const m = primitive.model, basis = primitiveBasis(primitive), tangent = basis.axes[1], bitangent = basis.axes[2], out = [];
  const around = clamp(Math.ceil(Math.sqrt(primitive.indices.length) * 2), 12, 72), along = clamp(Math.ceil(Math.sqrt(primitive.indices.length) * 0.65), 4, 40);
  for (let h = 0; h <= along; h++) for (let a = 0; a < around; a++) {
    const angle = a / around * Math.PI * 2, radial = add(mul(tangent, Math.cos(angle) * m.radius), mul(bitangent, Math.sin(angle) * m.radius));
    const position = add(add(m.center, mul(m.axis, (h / along * 2 - 1) * m.halfHeight)), radial);
    out.push(generatedPoint(points, primitive, position, options.textureBlend));
  }
  return out;
}

export function completeFromPrimitives(points, primitives, options = {}) {
  const normalized = { thickness: clamp(Number(options.thickness) || 0.035, 0.005, 0.25), sideLayers: clamp(Math.round(options.sideLayers || 3), 1, 8), textureBlend: clamp(Number(options.textureBlend) || 0.75, 0, 1) };
  const generated = [];
  for (const primitive of primitives) {
    const samples = primitive.type === 'plane' ? samplePlaneCompletion(points, primitive, normalized) : primitive.type === 'cylinder' ? sampleCylinderCompletion(points, primitive, normalized) : sampleBoxCompletion(points, primitive, normalized);
    generated.push(...samples);
  }
  return generated;
}

// Deliberately simple closed fallback for walking behind structural image regions.
// It is named and tagged as mirrored geometry instead of being presented as inferred.
export function completeMirroredShell(points, options = {}) {
  const structuralMaterials = new Set(options.structuralMaterials || ['wood', 'roof', 'window', 'rock']);
  const structural = points.filter(point => structuralMaterials.has(point.material));
  if (!structural.length) return [];
  const minimumZ = Math.min(...structural.map(point => point.z)), spanZ = Math.max(...structural.map(point => point.z)) - minimumZ;
  const thickness = clamp(Number(options.mirrorThickness) || 0.035, 0.01, 0.18), relief = clamp(Number(options.mirrorRelief) || 0.12, 0.02, 0.3);
  const maxPoints = Math.max(500, Math.round(Number(options.maxMirrorPoints) || 4500)), sampleStep = Math.max(1, Math.ceil(structural.length / maxPoints));
  const lookup = new Set(structural.map(pointGridKey).filter(Boolean)), generated = [];
  for (let sourceOffset = 0; sourceOffset < structural.length; sourceOffset += sampleStep) {
    const point = structural[sourceOffset], depth = spanZ > EPS ? (point.z - minimumZ) / spanZ : 0;
    const backZ = minimumZ - thickness - depth * relief, sourceIndex = point.sourceIndex ?? points.indexOf(point), shade = 0.68;
    generated.push({
      ...point, z: backZ, r: point.r * shade, g: point.g * shade, b: point.b * shade,
      generated: true, synthesized: true, provenance: 'GENERATED', generationMethod: 'mirrored-structural-shell',
      textureSources: [sourceIndex], textureWeights: [1], confidence: null, reliability: 'NOT_MEASURED'
    });
    const key = pointGridKey(point), gx = Number.isFinite(point.gridX) ? point.gridX : point.pixelX, gy = Number.isFinite(point.gridY) ? point.gridY : point.pixelY;
    if (!key || [[-1,0],[1,0],[0,-1],[0,1]].every(([dx,dy]) => lookup.has((gx + dx) + ':' + (gy + dy)))) continue;
    const layers = Math.max(2, Math.round(options.sideLayers || 3));
    for (let layer = 1; layer < layers; layer++) {
      const t = layer / layers;
      generated.push({
        ...point, z: point.z + (backZ - point.z) * t, r: point.r * (1 - t * 0.32), g: point.g * (1 - t * 0.32), b: point.b * (1 - t * 0.32),
        generated: true, synthesized: true, provenance: 'GENERATED', generationMethod: 'mirrored-structural-sidewall',
        textureSources: [sourceIndex], textureWeights: [1], confidence: null, reliability: 'NOT_MEASURED'
      });
    }
  }
  return generated;
}

export function buildSpatialEnvironment(sourcePoints, options = {}) {
  if (!sourcePoints.length) return { points: [], observed: [], generated: [], primitives: [], metrics: { coverage: 0, rmse: null, normalizedRmse: null, score: 0 }, bounds: { minX: -1, maxX: 1, minZ: -1, maxZ: 1 } };
  let maximum = 0;
  for (const p of sourcePoints) maximum = Math.max(maximum, Math.abs(p.x), Math.abs(p.y), Math.abs(p.z - 0.5));
  // Leave a guaranteed walkable band between the reconstructed scene and the
  // procedural boundary ring.
  const scale = maximum ? 0.62 / maximum : 1;
  const observed = sourcePoints.map((p, index) => ({ ...p, x: p.x * scale, y: p.y * scale, z: (p.z - 0.5) * scale, sourceIndex: p.sourceIndex ?? index, generated: false, synthesized: false, provenance: p.provenance || 'OBSERVED' }));
  const vertical = observed.map(point => point.y).sort((a, b) => a - b), floorY = vertical[Math.min(vertical.length - 1, Math.floor(vertical.length * 0.08))];
  const fitted = fitGeometricPrimitives(observed, options), primitiveCompletion = completeFromPrimitives(observed, fitted.primitives, options);
  const mirroredCompletion = options.mirrorShell === false ? [] : completeMirroredShell(observed, options), generated = [...primitiveCompletion, ...mirroredCompletion], allBounds = pointBounds([...observed, ...generated]);
  return { points: [...observed, ...generated], observed, generated, primitiveCompletion, mirroredCompletion, primitives: fitted.primitives, normals: fitted.normals, components: fitted.components, metrics: {...fitted.metrics, primitivePoints: primitiveCompletion.length, mirroredPoints: mirroredCompletion.length}, floorY, bounds: { minX: allBounds.min[0], maxX: allBounds.max[0], minZ: allBounds.min[2], maxZ: allBounds.max[2] } };
}
