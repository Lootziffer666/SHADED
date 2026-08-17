// Sparse, provenance-aware voxel field. Unknown space is implicit; observed camera
// rays mark FREE voxels and endpoints mark SURFACE voxels.

export const VOXEL_STATE = Object.freeze({ UNKNOWN: 0, FREE: 1, SURFACE: 2 });
export const VOXEL_PROVENANCE = Object.freeze({ MEASURED: 'MEASURED', OBSERVED: 'OBSERVED', RECONSTRUCTED: 'RECONSTRUCTED', INFERRED: 'INFERRED', GENERATED: 'GENERATED', USER_APPROVED: 'USER_APPROVED' });
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const clone = value => value == null ? value : JSON.parse(JSON.stringify(value));
const keyOf = (x, y, z) => x + ':' + y + ':' + z;
const parseKey = key => key.split(':').map(Number);

function decodeBundleChannel(bundle, name) {
  const descriptor = bundle?.result?.channels?.[name], payload = bundle?.channelData?.[name];
  if (!descriptor || !payload || payload.encoding !== 'base64' || typeof payload.data !== 'string') throw new Error(`Provider-Bundle enthält keinen lesbaren Kanal ${name}`);
  const binary = globalThis.atob(payload.data), bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index);
  if (bytes.byteLength !== payload.bytes) throw new Error(`${name}: Bundle-Bytezahl stimmt nicht`);
  const values = descriptor.shape.reduce((count, value) => count * value, 1);
  if (descriptor.dtype !== 'float32-le' || bytes.byteLength !== values * 4) throw new Error(`${name}: nur passende float32-le-Kanäle werden importiert`);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength), floats = new Float32Array(values);
  for (let index = 0; index < values; index++) {
    floats[index] = view.getFloat32(index * 4, true);
    if (!Number.isFinite(floats[index])) throw new Error(`${name}: nicht-endlicher Wert bei ${index}`);
  }
  return { descriptor, values: floats };
}

function normalizeImportedPoints(points) {
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  for (const point of points) for (let axis = 0; axis < 3; axis++) { min[axis] = Math.min(min[axis], point.position[axis]); max[axis] = Math.max(max[axis], point.position[axis]); }
  const center = min.map((value, axis) => (value + max[axis]) * 0.5), span = Math.max(...min.map((value, axis) => max[axis] - value), 1e-6), scale = 1.7 / span;
  return points.map((point, sourceIndex) => ({
    x: (point.position[0] - center[0]) * scale, y: (point.position[1] - center[1]) * scale, z: (point.position[2] - center[2]) * scale,
    r: point.color[0], g: point.color[1], b: point.color[2], confidence: point.confidence,
    provenance: VOXEL_PROVENANCE.INFERRED, material: 'unknown', sourceIndex
  }));
}

export function providerBundlePoints(bundle, { pointBudget = 500_000 } = {}) {
  if (bundle?.format !== 'SHADED.spatial-provider-bundle.v1' || bundle.result?.format !== 'SHADED.spatial-provider-result.v1') throw new Error('Ungültiges SHADED-Provider-Bundle');
  const points = [];
  if (bundle.result.channels.points) {
    const channel = decodeBundleChannel(bundle, 'points'), stride = channel.descriptor.shape[1];
    if (![3, 6].includes(stride)) throw new Error('points braucht Shape [count,3|6]');
    const count = channel.descriptor.shape[0], step = Math.max(1, Math.ceil(count / Math.max(1, pointBudget)));
    for (let index = 0; index < count; index += step) {
      const offset = index * stride, colorScale = stride === 6 && Math.max(channel.values[offset + 3], channel.values[offset + 4], channel.values[offset + 5]) <= 1 ? 255 : 1;
      points.push({ position: [channel.values[offset], channel.values[offset + 1], channel.values[offset + 2]], color: stride === 6 ? [channel.values[offset + 3] * colorScale, channel.values[offset + 4] * colorScale, channel.values[offset + 5] * colorScale] : [160, 160, 160], confidence: 0.7 });
    }
  } else {
    const channel = decodeBundleChannel(bundle, 'depth'), [height, width] = channel.descriptor.shape, camera = bundle.result.camera || {};
    const fx = camera.fx || width, fy = camera.fy || width, cx = camera.cx ?? width * 0.5, cy = camera.cy ?? height * 0.5;
    let minimum = Infinity, maximum = -Infinity;
    for (const value of channel.values) { minimum = Math.min(minimum, value); maximum = Math.max(maximum, value); }
    const pixelStep = Math.max(1, Math.ceil(Math.sqrt((width * height) / Math.max(1, pointBudget))));
    const confidence = bundle.result.channels.confidence ? decodeBundleChannel(bundle, 'confidence').values : null;
    for (let y = 0; y < height; y += pixelStep) for (let x = 0; x < width; x += pixelStep) {
      const index = y * width + x, raw = channel.values[index], normalized = (raw - minimum) / Math.max(maximum - minimum, 1e-9);
      const z = bundle.result.metric ? Math.max(raw, 1e-6) : 0.2 + (bundle.result.depthConvention === 'relative-disparity-higher-near' ? 1 - normalized : normalized) * 0.8;
      points.push({ position: [(x - cx) * z / fx, (cy - y) * z / fy, z], color: [160, 160, 160], confidence: confidence ? clamp(confidence[index], 0, 1) : 0.5 });
    }
  }
  if (!points.length) throw new Error('Provider-Bundle enthält keine importierbaren Punkte');
  return normalizeImportedPoints(points);
}

const DEFAULT_FIELDS = Object.freeze({
  waterVolume: 0, moisture: 0, snowMass: 0, iceMass: 0,
  fuelMass: 0, fireEnergy: 0, temperatureC: 18, smokeMass: 0,
  mudMass: 0, sootMass: 0, grassMass: 0, bloodMass: 0, urineMass: 0
});

export class SparseVoxelWorld {
  constructor({ resolution = 64, bounds = { min: [-1, -1, -1], max: [1, 1, 1] } } = {}) {
    this.resolution = Math.max(8, Math.min(256, Math.round(resolution)));
    this.bounds = { min: bounds.min.slice(), max: bounds.max.slice() };
    this.voxels = new Map();
    this.free = new Set();
    this.undoStack = [];
    this.redoStack = [];
    this.revision = 0;
  }

  get voxelSize() { return Math.max(...this.bounds.max.map((value, i) => value - this.bounds.min[i])) / this.resolution; }

  worldToGrid(position) {
    return position.map((value, axis) => clamp(Math.floor((value - this.bounds.min[axis]) / Math.max(this.bounds.max[axis] - this.bounds.min[axis], 1e-9) * this.resolution), 0, this.resolution - 1));
  }

  gridToWorld(cell) {
    return cell.map((value, axis) => this.bounds.min[axis] + (value + 0.5) / this.resolution * (this.bounds.max[axis] - this.bounds.min[axis]));
  }

  stateAt(x, y, z) {
    const key = keyOf(x, y, z);
    if (this.voxels.has(key)) return VOXEL_STATE.SURFACE;
    if (this.free.has(key)) return VOXEL_STATE.FREE;
    return VOXEL_STATE.UNKNOWN;
  }

  voxelAt(x, y, z) { return this.voxels.get(keyOf(x, y, z)) || null; }

  setFree(x, y, z) {
    const key = keyOf(x, y, z);
    if (!this.voxels.has(key)) this.free.add(key);
  }

  setSurface(x, y, z, sample = {}) {
    const key = keyOf(x, y, z), previous = this.voxels.get(key), weight = Math.max(1e-6, Number(sample.weight) || Number(sample.confidence) || 1);
    const color = sample.color || [sample.r ?? 128, sample.g ?? 128, sample.b ?? 128];
    if (previous) {
      const total = previous.weight + weight;
      previous.color = previous.color.map((value, i) => (value * previous.weight + color[i] * weight) / total);
      previous.weight = total;
      previous.confidence = Math.max(previous.confidence, Number(sample.confidence) || 0);
      if (sample.material) previous.material = sample.material;
      if (sample.provenance === VOXEL_PROVENANCE.USER_APPROVED) previous.provenance = sample.provenance;
      if (sample.sourceIndex != null && !previous.sourceIndices.includes(sample.sourceIndex)) previous.sourceIndices.push(sample.sourceIndex);
      return previous;
    }
    const material = sample.material || 'unknown', fuelMass = material === 'wood' ? 1 : material === 'foliage' || material === 'grass' ? 0.35 : 0;
    const voxel = {
      state: VOXEL_STATE.SURFACE, color: color.slice(), material,
      confidence: clamp(Number(sample.confidence) || 0, 0, 1),
      provenance: sample.provenance || VOXEL_PROVENANCE.OBSERVED,
      sourceIndices: sample.sourceIndex == null ? [] : [sample.sourceIndex], weight,
      fields: { ...DEFAULT_FIELDS, fuelMass }
    };
    this.free.delete(key); this.voxels.set(key, voxel); return voxel;
  }

  integrateRay(origin, endpoint, sample = {}) {
    const direction = endpoint.map((value, i) => value - origin[i]), distance = Math.hypot(...direction);
    if (!Number.isFinite(distance) || distance < 1e-8) return;
    const steps = Math.max(1, Math.ceil(distance / Math.max(this.voxelSize * 0.45, 1e-5)));
    let lastKey = null;
    for (let step = 0; step < steps; step++) {
      const t = step / steps, cell = this.worldToGrid(origin.map((value, i) => value + direction[i] * t)), key = keyOf(...cell);
      if (key !== lastKey) this.setFree(...cell);
      lastKey = key;
    }
    this.setSurface(...this.worldToGrid(endpoint), sample);
  }

  integratePointCloud(points, { cameraOrigin = [0, 0, -1.2] } = {}) {
    for (const point of points) {
      const sample = { ...point, color: [point.r, point.g, point.b], provenance: point.provenance || (point.generated ? VOXEL_PROVENANCE.GENERATED : VOXEL_PROVENANCE.OBSERVED) };
      if (point.generated) this.setSurface(...this.worldToGrid([point.x, point.y, point.z]), sample);
      else this.integrateRay(cameraOrigin, [point.x, point.y, point.z], sample);
    }
    this.revision++;
    return this;
  }

  static fromPointCloud(points, options = {}) {
    const world = new SparseVoxelWorld(options); return world.integratePointCloud(points, options);
  }

  static fromProviderBundle(bundle, options = {}) {
    const points = providerBundlePoints(bundle, options);
    return SparseVoxelWorld.fromPointCloud(points, { ...options, cameraOrigin: options.cameraOrigin || [0, 0, -1.2] });
  }

  raycast(origin, direction, { maxDistance = 4 } = {}) {
    const norm = Math.hypot(...direction); if (norm < 1e-9) return null;
    const unit = direction.map(value => value / norm), stepSize = this.voxelSize * 0.35;
    let previousKey = null;
    for (let distance = 0; distance <= maxDistance; distance += stepSize) {
      const position = origin.map((value, i) => value + unit[i] * distance), cell = this.worldToGrid(position), key = keyOf(...cell);
      if (key === previousKey) continue; previousKey = key;
      const voxel = this.voxels.get(key); if (voxel) return { key, cell, position: this.gridToWorld(cell), distance, voxel };
    }
    return null;
  }

  paint(center, brush = {}) {
    const pressure = clamp(Number(brush.pressure) || 0.5, 0.01, 1), baseRadius = Math.max(this.voxelSize * 0.5, Number(brush.radius) || this.voxelSize * 2);
    const radius = baseRadius * (0.35 + pressure * 0.65), opacity = clamp((Number(brush.opacity) || 1) * pressure, 0, 1);
    const tiltX = clamp(Number(brush.tiltX) || 0, -90, 90) / 90, tiltY = clamp(Number(brush.tiltY) || 0, -90, 90) / 90;
    const gridCenter = this.worldToGrid(center), cells = Math.ceil(radius / this.voxelSize * 1.75), changes = [];
    for (let z = gridCenter[2] - cells; z <= gridCenter[2] + cells; z++) for (let y = gridCenter[1] - cells; y <= gridCenter[1] + cells; y++) for (let x = gridCenter[0] - cells; x <= gridCenter[0] + cells; x++) {
      if (x < 0 || y < 0 || z < 0 || x >= this.resolution || y >= this.resolution || z >= this.resolution) continue;
      const position = this.gridToWorld([x, y, z]), dx = (position[0] - center[0]) / (1 + Math.abs(tiltX) * 0.8), dy = position[1] - center[1], dz = (position[2] - center[2]) / (1 + Math.abs(tiltY) * 0.8);
      if (Math.hypot(dx, dy, dz) > radius) continue;
      const key = keyOf(x, y, z), before = clone(this.voxels.get(key) || null);
      if (brush.mode === 'erase' || brush.eraser) this.voxels.delete(key);
      else {
        const voxel = this.setSurface(x, y, z, { color: brush.color || [128, 128, 128], material: brush.material || 'user', confidence: opacity, provenance: VOXEL_PROVENANCE.USER_APPROVED, weight: opacity });
        if (brush.channel && brush.channel in voxel.fields) voxel.fields[brush.channel] = clamp(Number(brush.value) * opacity + voxel.fields[brush.channel] * (1 - opacity), 0, Number.MAX_SAFE_INTEGER);
      }
      const after = clone(this.voxels.get(key) || null);
      if (JSON.stringify(before) !== JSON.stringify(after)) changes.push({ key, before, after });
    }
    if (changes.length) { this.undoStack.push(changes); if (this.undoStack.length > 128) this.undoStack.shift(); this.redoStack.length = 0; this.revision++; }
    return { changed: changes.length, pressure, radius, opacity };
  }

  applyChanges(changes, direction) {
    for (const change of changes) {
      const value = direction === 'undo' ? change.before : change.after;
      if (value == null) this.voxels.delete(change.key); else this.voxels.set(change.key, clone(value));
    }
    this.revision++;
  }

  undo() { const changes = this.undoStack.pop(); if (!changes) return false; this.applyChanges(changes, 'undo'); this.redoStack.push(changes); return true; }
  redo() { const changes = this.redoStack.pop(); if (!changes) return false; this.applyChanges(changes, 'redo'); this.undoStack.push(changes); return true; }

  createSurfaceGrid(size = 36) {
    size = Math.max(8, Math.round(size));
    const cells = new Uint8Array(size * size), material = new Uint8Array(size * size), height = new Float32Array(size * size), voxelKeys = Array(size * size).fill(null);
    height.fill(-Infinity);
    const materialCode = { wood: 1, rock: 2, grass: 3, foliage: 3, path: 4, water: 5, roof: 6 };
    for (const [key, voxel] of this.voxels) {
      const cell = parseKey(key), position = this.gridToWorld(cell), x = clamp(Math.floor((position[0] - this.bounds.min[0]) / (this.bounds.max[0] - this.bounds.min[0]) * size), 0, size - 1), z = clamp(Math.floor((position[2] - this.bounds.min[2]) / (this.bounds.max[2] - this.bounds.min[2]) * size), 0, size - 1), index = z * size + x;
      if (position[1] > height[index]) { height[index] = position[1]; voxelKeys[index] = key; material[index] = materialCode[voxel.material] || 0; }
    }
    const finite = Array.from(height).filter(Number.isFinite).sort((a, b) => a - b), median = finite[Math.floor(finite.length / 2)] || 0;
    for (let z = 0; z < size; z++) for (let x = 0; x < size; x++) {
      const index = z * size + x, edge = x === 0 || z === 0 || x === size - 1 || z === size - 1;
      if (!Number.isFinite(height[index])) height[index] = median;
      const steep = Math.abs(height[index] - median) > this.voxelSize * 5 && ![3, 4, 5].includes(material[index]);
      cells[index] = edge || steep ? 1 : 0;
    }
    const fields = {};
    for (const name of Object.keys(DEFAULT_FIELDS)) fields[name] = new Float32Array(size * size);
    voxelKeys.forEach((key, index) => { const voxel = key && this.voxels.get(key); if (voxel) for (const name of Object.keys(DEFAULT_FIELDS)) fields[name][index] = voxel.fields[name]; });
    const syncFieldsToVoxels = () => voxelKeys.forEach((key, index) => { const voxel = key && this.voxels.get(key); if (voxel) for (const name of Object.keys(DEFAULT_FIELDS)) voxel.fields[name] = fields[name][index]; });
    return { size, cells, material, height, voxelKeys, fields, voxelWorld: this, syncFieldsToVoxels };
  }

  extractSurfaceMesh() {
    const positions = [], colors = [], indices = [], provenance = [];
    const directions = [
      { n: [1, 0, 0], corners: [[1, 0, 0], [1, 1, 0], [1, 1, 1], [1, 0, 1]] }, { n: [-1, 0, 0], corners: [[0, 0, 1], [0, 1, 1], [0, 1, 0], [0, 0, 0]] },
      { n: [0, 1, 0], corners: [[0, 1, 1], [1, 1, 1], [1, 1, 0], [0, 1, 0]] }, { n: [0, -1, 0], corners: [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]] },
      { n: [0, 0, 1], corners: [[1, 0, 1], [1, 1, 1], [0, 1, 1], [0, 0, 1]] }, { n: [0, 0, -1], corners: [[0, 0, 0], [0, 1, 0], [1, 1, 0], [1, 0, 0]] }
    ];
    for (const [key, voxel] of this.voxels) {
      const cell = parseKey(key);
      for (const face of directions) {
        if (this.voxels.has(keyOf(cell[0] + face.n[0], cell[1] + face.n[1], cell[2] + face.n[2]))) continue;
        const base = positions.length / 3;
        for (const corner of face.corners) {
          const position = corner.map((value, axis) => this.bounds.min[axis] + (cell[axis] + value) / this.resolution * (this.bounds.max[axis] - this.bounds.min[axis]));
          positions.push(...position); colors.push(...voxel.color.map(value => value / 255)); provenance.push(voxel.provenance);
        }
        indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
      }
    }
    return { format: 'SHADED.voxel-surface-mesh.v1', positions: new Float32Array(positions), colors: new Float32Array(colors), indices: new Uint32Array(indices), provenance };
  }

  surfacePoints({provenance = null} = {}) {
    const points = [];
    for (const [key, voxel] of this.voxels) {
      if (provenance && voxel.provenance !== provenance) continue;
      const position = this.gridToWorld(parseKey(key));
      points.push({x: position[0], y: position[1], z: position[2], r: voxel.color[0], g: voxel.color[1], b: voxel.color[2], kind: 31, generated: voxel.provenance === VOXEL_PROVENANCE.GENERATED || voxel.provenance === VOXEL_PROVENANCE.INFERRED, provenance: voxel.provenance, confidence: voxel.confidence, material: voxel.material, voxelKey: key});
    }
    return points;
  }

  toJSON() {
    return { format: 'SHADED.sparse-voxel-world.v1', resolution: this.resolution, bounds: this.bounds, revision: this.revision, free: Array.from(this.free), voxels: Array.from(this.voxels, ([key, value]) => [key, value]) };
  }

  static fromJSON(data) {
    if (data?.format !== 'SHADED.sparse-voxel-world.v1') throw new Error('Ungültiges Sparse-Voxel-Format');
    const world = new SparseVoxelWorld({ resolution: data.resolution, bounds: data.bounds });
    world.free = new Set(data.free || []); world.voxels = new Map(data.voxels || []); world.revision = data.revision || 0; return world;
  }
}
