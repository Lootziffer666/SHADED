// Shared spatial algorithms. Geometry fitting, voxel state and world simulation live
// in separate modules so each layer is independently testable.
import {buildSpatialEnvironment, completeFromPrimitives, completeMirroredShell, estimatePointNormals, fitGeometricPrimitives, fitPlaneRansac, seededRandom} from './spatial-reconstruction.mjs';
import {SparseVoxelWorld, VOXEL_PROVENANCE, VOXEL_STATE} from './sparse-voxel-world.mjs';
import {SpatialWorldSimulation, segmentCells, segmentIsTraversable} from './surface-world-simulation.mjs';

export {buildSpatialEnvironment, completeFromPrimitives, completeMirroredShell, estimatePointNormals, fitGeometricPrimitives, fitPlaneRansac, seededRandom};
export {SparseVoxelWorld, VOXEL_PROVENANCE, VOXEL_STATE};
export {SpatialWorldSimulation, segmentCells, segmentIsTraversable};

export function dykstraProject(point, sets, {maxIterations = 48, tolerance = 1e-6} = {}) {
  const x = Float64Array.from(point), residuals = sets.map(() => new Float64Array(x.length));
  for (let iteration = 0; iteration < maxIterations; iteration++) {
    let change = 0;
    sets.forEach((set, i) => {
      const input = x.map((value, j) => value + residuals[i][j]), output = set.project(input);
      for (let j = 0; j < x.length; j++) { residuals[i][j] = input[j] - output[j]; change = Math.max(change, Math.abs(output[j] - x[j])); x[j] = output[j]; }
    });
    if (change < tolerance) return {point: Array.from(x), iterations: iteration + 1};
  }
  return {point: Array.from(x), iterations: maxIterations};
}

export function boxSet(minX, maxX, minZ, maxZ) {
  return {project: ([x, z]) => [Math.max(minX, Math.min(maxX, x)), Math.max(minZ, Math.min(maxZ, z))]};
}

export function diskSet(centerX, centerZ, radius) {
  return {project: ([x, z]) => { const dx = x - centerX, dz = z - centerZ, distance = Math.hypot(dx, dz); return distance <= radius || !distance ? [x, z] : [centerX + dx * radius / distance, centerZ + dz * radius / distance]; }};
}

export function buildNavigationGrid(environment, size = 36) {
  const voxelWorld = environment.voxelWorld || SparseVoxelWorld.fromPointCloud(environment.points, {resolution: 64, bounds: {min: [-1, -1, -1], max: [1, 1, 1]}, cameraOrigin: [0, 0, -1.2]});
  environment.voxelWorld = voxelWorld;
  const grid = voxelWorld.createSurfaceGrid(size), {cells} = grid, density = new Uint16Array(size * size);
  for (const p of environment.points) {
    if (p.y < -0.2) continue;
    if (!['wood', 'roof', 'window', 'rock'].includes(p.material)) continue;
    const x = Math.max(0, Math.min(size - 1, Math.floor((p.x + 1) * 0.5 * size))), z = Math.max(0, Math.min(size - 1, Math.floor((p.z + 1) * 0.5 * size)));
    density[z * size + x]++;
  }
  const sorted = Array.from(density).filter(Boolean).sort((a, b) => a - b), threshold = sorted[Math.floor(sorted.length * 0.82)] || Infinity;
  for (let z = 0; z < size; z++) for (let x = 0; x < size; x++) {
    const edge = x < 1 || z < 1 || x >= size - 1 || z >= size - 1, index = z * size + x;
    cells[index] = edge || cells[index] || density[index] >= threshold ? 1 : 0;
  }
  return grid;
}

class MinHeap {
  constructor() { this.items = []; }
  push(item) { this.items.push(item); let i = this.items.length - 1; while (i) { const parent = (i - 1) >> 1; if (this.items[parent][0] <= item[0]) break; this.items[i] = this.items[parent]; i = parent; } this.items[i] = item; }
  pop() {
    if (!this.items.length) return null;
    const root = this.items[0], last = this.items.pop();
    if (this.items.length) { let i = 0; while (true) { const left = i * 2 + 1, right = left + 1; if (left >= this.items.length) break; const child = right < this.items.length && this.items[right][0] < this.items[left][0] ? right : left; if (this.items[child][0] >= last[0]) break; this.items[i] = this.items[child]; i = child; } this.items[i] = last; }
    return root;
  }
}

export function dijkstraGrid(grid, start, goal) {
  const {size, cells} = grid, total = size * size, index = ([x, z]) => z * size + x, startIndex = index(start), goalIndex = index(goal);
  if (cells[startIndex] || cells[goalIndex]) return [];
  const distance = new Float64Array(total), previous = new Int32Array(total); distance.fill(Infinity); previous.fill(-1); distance[startIndex] = 0;
  const queue = new MinHeap(); queue.push([0, startIndex]);
  while (queue.items.length) {
    const [cost, current] = queue.pop(); if (cost !== distance[current]) continue; if (current === goalIndex) break;
    const x = current % size, z = Math.floor(current / size);
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, nz = z + dz; if (nx < 0 || nz < 0 || nx >= size || nz >= size) continue;
      const next = nz * size + nx; if (cells[next]) continue;
      const stepCost = grid.cost ? grid.cost[next] : 1; if (!Number.isFinite(stepCost)) continue;
      const candidate = cost + Math.max(0.001, stepCost);
      if (candidate < distance[next]) { distance[next] = candidate; previous[next] = current; queue.push([candidate, next]); }
    }
  }
  if (!Number.isFinite(distance[goalIndex])) return [];
  const path = []; for (let at = goalIndex; at !== -1; at = previous[at]) path.push([at % size, Math.floor(at / size)]);
  return path.reverse();
}

export function worldToCell(value, size) { return Math.max(1, Math.min(size - 2, Math.floor((value + 1) * 0.5 * size))); }
export function cellToWorld(value, size) { return ((value + 0.5) / size) * 2 - 1; }

function blockCell(grid, x, z, material) {
  if (x <= 0 || z <= 0 || x >= grid.size - 1 || z >= grid.size - 1) return;
  const index = z * grid.size + x; grid.cells[index] = 1; if (grid.material) grid.material[index] = material;
  if (grid.fields?.fuelMass && material === 1) grid.fields.fuelMass[index] = 1;
}

function addTree(points, x, z, treeId, canopyFlex) {
  const trunkHeight = 0.48 + 0.08 * Math.sin(treeId * 1.7), trunkTop = -0.31 + trunkHeight;
  for (let y = -0.31; y <= trunkTop; y += 0.035) points.push({x, y, z, r: 91, g: 58, b: 34, kind: 2, treeId, branchId: 0, generated: true, provenance: 'GENERATED', confidence: null, reliability: 'NOT_MEASURED'});
  const bendKind = canopyFlex < 0.25 ? 20 : canopyFlex < 0.7 ? 21 : 22;
  for (let branch = 0; branch < 7; branch++) {
    const angle = branch / 7 * Math.PI * 2 + treeId * 0.73, elevation = -0.08 + (branch % 3) * 0.055, branchLength = 0.12 + (branch % 2) * 0.04;
    let tip = [x, trunkTop - 0.08 + branch * 0.012, z];
    for (let segment = 1; segment <= 5; segment++) {
      const t = segment / 5; tip = [x + Math.cos(angle) * branchLength * t, trunkTop - 0.08 + branch * 0.012 + elevation * t, z + Math.sin(angle) * branchLength * t];
      points.push({x: tip[0], y: tip[1], z: tip[2], r: 104, g: 67, b: 38, kind: bendKind, treeId, branchId: branch + 1, parentBranchId: 0, generated: true, provenance: 'GENERATED', confidence: null, reliability: 'NOT_MEASURED'});
    }
    for (let leaf = 0; leaf < 9; leaf++) {
      const phi = leaf / 9 * Math.PI * 2, radius = 0.035 + (leaf % 2) * 0.012;
      points.push({x: tip[0] + Math.cos(phi) * radius, y: tip[1] + Math.sin(phi * 2) * 0.026, z: tip[2] + Math.sin(phi) * radius, r: 38, g: 128, b: 67, kind: bendKind, treeId, branchId: branch + 1, parentBranchId: branch + 1, generated: true, provenance: 'GENERATED', confidence: null, reliability: 'NOT_MEASURED'});
    }
  }
}

function addRock(points, x, z, rockId) {
  for (let latitude = 0; latitude <= 5; latitude++) for (let longitude = 0; longitude < 10; longitude++) {
    const phi = latitude / 5 * Math.PI, theta = longitude / 10 * Math.PI * 2, warp = 0.85 + 0.15 * Math.sin(theta * 3 + rockId);
    points.push({x: x + Math.sin(phi) * Math.cos(theta) * 0.12 * warp, y: -0.31 + (1 - Math.cos(phi)) * 0.075, z: z + Math.sin(phi) * Math.sin(theta) * 0.09 * warp, r: 91, g: 101, b: 116, kind: 3, rockId, generated: true, provenance: 'GENERATED', confidence: null, reliability: 'NOT_MEASURED'});
  }
}

export function addProceduralBoundaries(grid, density = 0, form = 'trees', canopyFlex = 0.6) {
  const points = [], amount = Math.max(0, Math.min(1, Number(density) || 0)); if (!amount) return points;
  const count = Math.max(6, Math.round(10 + amount * 42));
  for (let i = 0; i < count; i++) {
    const angle = i / count * Math.PI * 2;
    // Two real openings and a non-circular, deterministic boundary contour.
    const gate = Math.abs(Math.atan2(Math.sin(angle), Math.cos(angle))) < 0.14 || Math.abs(Math.atan2(Math.sin(angle - Math.PI), Math.cos(angle - Math.PI))) < 0.11;
    if (gate) continue;
    const radius = 0.78 + 0.075 * Math.sin(angle * 3 + 0.4) + 0.035 * Math.sin(angle * 7 - 1.1), x = Math.cos(angle) * radius, z = Math.sin(angle) * radius;
    const cx = worldToCell(x, grid.size), cz = worldToCell(z, grid.size), blockRadius = form === 'rocks' ? 1 : 0;
    for (let dz = -blockRadius; dz <= blockRadius; dz++) for (let dx = -blockRadius; dx <= blockRadius; dx++) blockCell(grid, cx + dx, cz + dz, form === 'trees' ? 1 : 2);
    if (form === 'trees') addTree(points, x, z, i, canopyFlex); else addRock(points, x, z, i);
  }
  return points;
}

export function buildWorldLawPoints(grid, params = {}) {
  const points = [], water = Math.max(0, Math.min(1, Math.max(params.rain || 0, params.wet || 0, params.puddle || 0))); if (water < 0.05) return points;
  for (let z = 1; z < grid.size - 1; z++) for (let x = 1; x < grid.size - 1; x++) {
    const index = z * grid.size + x; if (grid.cells[index]) continue;
    const value = grid.fields?.waterVolume?.[index] ?? water, basin = (Math.sin(x * 12.9898 + z * 78.233) * 43758.5453) % 1;
    if (value < 0.04 && Math.abs(basin) > water * 0.38) continue;
    points.push({x: cellToWorld(x, grid.size), y: -0.31, z: cellToWorld(z, grid.size), r: 45, g: 132, b: 190, kind: 1, generated: true, provenance: 'GENERATED', confidence: null, reliability: 'NOT_MEASURED', size: Math.max(value, water * 0.2)});
  }
  return points;
}
