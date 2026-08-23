import assert from 'node:assert/strict';
import {
  addProceduralBoundaries, boxSet, buildNavigationGrid, buildSpatialEnvironment, dijkstraGrid, diskSet,
  dykstraProject, fitGeometricPrimitives, segmentIsTraversable, SparseVoxelWorld,
  SpatialWorldSimulation, VOXEL_STATE, worldToCell
} from '../runtime/spatial-navigation.mjs';

const projected = dykstraProject([3, 0], [boxSet(-1, 1, -1, 1), diskSet(0, 0, 0.5)]).point;
assert.ok(Math.hypot(...projected) <= 0.500001, 'Dykstra respects movement disk');
assert.ok(projected[0] <= 1 && projected[0] >= -1, 'Dykstra respects world box');

const cells = new Uint8Array(25), costs = new Float32Array(25); costs.fill(1); costs[2 * 5 + 2] = 100;
const weightedPath = dijkstraGrid({size: 5, cells, cost: costs}, [1, 2], [3, 2]);
assert.ok(weightedPath.length > 3, 'Dijkstra avoids a dangerous but geometrically open cell');
assert.ok(!weightedPath.some(([x, z]) => x === 2 && z === 2), 'dynamic world cost changes the route');
cells[2 * 5 + 2] = 1;
assert.equal(segmentIsTraversable({size: 5, cells}, [-0.45, 0], [0.45, 0]), false, 'continuous traversal checks intermediate cells');

const visiblePlane = [];
for (let y = 0; y < 18; y++) for (let x = 0; x < 22; x++) visiblePlane.push({
  x: (x - 11) * 0.025, y: (y - 9) * 0.025, z: 0.62 + Math.sin(x * 2 + y) * 0.00015,
  r: 80 + x, g: 100 + y, b: 140, gridX: x, gridY: y, pixelX: x * 2, pixelY: y * 2,
  material: 'wood', confidence: 0.9, provenance: 'OBSERVED'
});
const fitted = fitGeometricPrimitives(visiblePlane, {seed: 42});
assert.ok(fitted.primitives.some(primitive => primitive.type === 'plane'), 'RANSAC/PCA fits an actual plane model');
assert.ok(fitted.metrics.coverage > 0.98 && fitted.metrics.rmse < 0.001, 'fit quality is measured from residuals');
assert.ok(fitted.normals.some(item => item.confidence > 0.5), 'surface normals are estimated from structured neighbours');

const environment = buildSpatialEnvironment(visiblePlane, {seed: 42, thickness: 0.05, textureBlend: 0.8});
assert.equal(environment.observed.length, visiblePlane.length, 'all input samples remain observed');
assert.notEqual(environment.generated.length, environment.observed.length, 'completion is independently sampled, not one generated point per source point');
assert.ok(environment.generated.every(point => point.provenance === 'GENERATED'), 'completion provenance is explicit');
assert.ok(environment.generated.every(point => point.confidence === null && point.reliability === 'NOT_MEASURED'), 'generated geometry never invents measurement confidence');
assert.ok(environment.generated.every(point => Array.isArray(point.textureSources) && point.textureSources.length > 0), 'generated colours carry their actual patch source indices');
assert.ok(environment.mirroredCompletion.length > 0, 'structural pixels receive an explicit mirrored fallback shell');
const mirroredBack = environment.mirroredCompletion.filter(point => point.generationMethod === 'mirrored-structural-shell');
const structuralMinimumZ = Math.min(...environment.observed.filter(point => ['wood','roof','window','rock'].includes(point.material)).map(point => point.z));
assert.ok(mirroredBack.length > 0 && mirroredBack.every(point => point.z < structuralMinimumZ), 'mirrored fallback is a real backside behind every observed structural point');
assert.ok(environment.mirroredCompletion.some(point => point.generationMethod === 'mirrored-structural-sidewall'), 'mirror fallback closes visible structural borders with sidewalls');

const walkGrid = buildNavigationGrid(environment, 36); addProceduralBoundaries(walkGrid, 0.35, 'trees', 0.6);
const nearestOpen = ([targetX,targetZ]) => {
  let best=null,distance=Infinity;for(let z=1;z<walkGrid.size-1;z++)for(let x=1;x<walkGrid.size-1;x++){if(walkGrid.cells[z*walkGrid.size+x])continue;const d=(x-targetX)**2+(z-targetZ)**2;if(d<distance){distance=d;best=[x,z];}}
  return best;
};
const walkStart=nearestOpen([worldToCell(0,36),worldToCell(.62,36)]),walkGoal=nearestOpen([worldToCell(0,36),worldToCell(-.62,36)]),aroundHouse=dijkstraGrid(walkGrid,walkStart,walkGoal);
assert.ok(aroundHouse.length > 2, 'a traversable route exists from the front to behind the mirrored house shell');
assert.ok(aroundHouse.every(([x,z]) => !walkGrid.cells[z*walkGrid.size+x]), 'the front-to-back route never enters house or boundary geometry');

const voxelWorld = SparseVoxelWorld.fromPointCloud(environment.points, {resolution: 32, bounds: {min: [-1, -1, -1], max: [1, 1, 1]}, cameraOrigin: [0, 0, -1]});
const observedCell = voxelWorld.worldToGrid([environment.observed[0].x, environment.observed[0].y, environment.observed[0].z]);
assert.equal(voxelWorld.stateAt(...observedCell), VOXEL_STATE.SURFACE, 'observed endpoint becomes a surface voxel');
assert.ok(voxelWorld.free.size > 0, 'camera rays record known free space');
assert.ok(voxelWorld.voxels.size > 0, 'surface voxels exist');
const mesh = voxelWorld.extractSurfaceMesh();
assert.ok(mesh.positions.length > 0 && mesh.indices.length > 0, 'voxel surface extraction returns a real indexed mesh');
assert.ok(mesh.provenance.includes('OBSERVED') && mesh.provenance.includes('GENERATED'), 'mesh preserves observed/generated provenance');

const providerValues = new Float32Array([-.2, 0, .5, 1, 0, 0, .2, 0, .7, 0, 1, 0]);
const providerBytes = Buffer.from(providerValues.buffer);
const providerBundle = {
  format: 'SHADED.spatial-provider-bundle.v1',
  result: {format: 'SHADED.spatial-provider-result.v1', provider: 'fixture', channels: {points: {dtype: 'float32-le', shape: [2, 6]}}},
  channelData: {points: {encoding: 'base64', bytes: providerBytes.length, data: providerBytes.toString('base64')}}
};
const providerWorld = SparseVoxelWorld.fromProviderBundle(providerBundle, {resolution: 24});
assert.ok(providerWorld.voxels.size > 0, 'self-contained provider bundle imports into the sparse voxel world');
assert.ok(providerWorld.surfacePoints().every(point => point.provenance === 'INFERRED'), 'provider imports retain inferred provenance');
assert.ok(providerWorld.surfacePoints().every(point => point.confidence === null), 'missing provider confidence stays unknown');
assert.ok(providerWorld.surfacePoints().some(point => point.r > point.g || point.g > point.r), 'provider RGB reaches visible voxels instead of a grey placeholder');

const xyzOnlyValues = new Float32Array([0, 0, .5, .1, 0, .6]), xyzOnlyBytes = Buffer.from(xyzOnlyValues.buffer);
const xyzOnlyBundle = {
  format: 'SHADED.spatial-provider-bundle.v1',
  result: {format: 'SHADED.spatial-provider-result.v1', provider: 'fixture-no-rgb', channels: {points: {dtype: 'float32-le', shape: [2, 3]}}},
  channelData: {points: {encoding: 'base64', bytes: xyzOnlyBytes.length, data: xyzOnlyBytes.toString('base64')}}
};
assert.throws(() => SparseVoxelWorld.fromProviderBundle(xyzOnlyBundle), /Platzhalterfarben sind nicht erlaubt/, 'XYZ without RGB fails honestly');
assert.throws(() => SparseVoxelWorld.fromProviderBundle({format:'SHADED.spatial-provider-bundle.v1',result:{format:'SHADED.spatial-provider-result.v1',provider:'fixture-depth-only',channels:{depth:{dtype:'float32-le',shape:[1,1]}}},channelData:{}}), /kein RGB/, 'depth-only visible import fails honestly');

const paintWorld = new SparseVoxelWorld({resolution: 24});
const lowPressure = paintWorld.paint([0, 0, 0], {pressure: 0.2, radius: 0.2, material: 'wood', color: [90, 60, 30]});
const lowCount = paintWorld.voxels.size;
assert.ok(lowPressure.changed > 0 && paintWorld.undo(), 'pressure brush creates an undoable edit');
assert.equal(paintWorld.voxels.size, 0, 'undo restores the exact prior sparse field');
assert.ok(paintWorld.redo(), 'redo reapplies the voxel edit');
paintWorld.undo();
const highPressure = paintWorld.paint([0, 0, 0], {pressure: 1, radius: 0.2, tiltX: 55, material: 'wood', color: [90, 60, 30]});
assert.ok(highPressure.changed > lowCount, 'pressure and tilt alter real brush coverage');

function makeGrid(size = 10) {
  const fields = {}, names = ['waterVolume','moisture','snowMass','iceMass','fuelMass','fireEnergy','temperatureC','smokeMass','mudMass','sootMass','grassMass','bloodMass','urineMass'];
  for (const name of names) fields[name] = new Float32Array(size * size);
  fields.temperatureC.fill(18);
  const grid = {size, cells: new Uint8Array(size * size), material: new Uint8Array(size * size), height: new Float32Array(size * size), fields, syncFieldsToVoxels() { this.syncCount = (this.syncCount || 0) + 1; }};
  for (let z = 0; z < size; z++) for (let x = 0; x < size; x++) grid.height[z * size + x] = (size - x) * 0.02;
  return grid;
}

const flowGrid = makeGrid(), flowWorld = new SpatialWorldSimulation(flowGrid, {seed: 9}), high = 5 * flowGrid.size + 2, low = 5 * flowGrid.size + 7;
flowWorld.water[high] = 0.8;
const waterBefore = flowWorld.massBudget().water;
for (let i = 0; i < 12; i++) flowWorld.step(0.05, {params: {temperature: 0.5, wind: 0}});
const waterAfter = flowWorld.massBudget().water;
assert.ok(flowWorld.water[low] > 0 || flowWorld.events.some(event => event.waterMoved > 0), 'water flows through height potential');
assert.ok(Math.abs(waterAfter - waterBefore) < 1e-4, 'internal water flow conserves volume without sources or sinks');

const fireGrid = makeGrid(), fireWorld = new SpatialWorldSimulation(fireGrid, {seed: 3}), source = 5 * fireGrid.size + 5, downwind = source + 1;
fireGrid.material[source] = 1; fireGrid.material[downwind] = 1; fireWorld.fuel[source] = 1; fireWorld.fuel[downwind] = 1; fireWorld.fire[source] = 1;
for (let i = 0; i < 80; i++) fireWorld.step(0.05, {params: {temperature: 0.7, wind: 1, windDirectionDegrees: 0}});
assert.ok(fireWorld.fuel[source] < 1, 'combustion consumes an explicit fuel mass');
assert.ok(fireWorld.fire[downwind] > 0 || fireWorld.fuel[downwind] < 1, 'fire spreads to a downwind neighbouring fuel cell');
assert.ok(fireGrid.cost[source] > 20, 'fire changes navigation cost on the same surface grid');
const fireBeforeRain = fireWorld.fire.reduce((sum, value) => sum + value, 0);
for (let i = 0; i < 30; i++) fireWorld.step(0.05, {params: {rain: 1, rainExtinguish: 2, temperature: 0.4}});
assert.ok(fireWorld.fire.reduce((sum, value) => sum + value, 0) < fireBeforeRain, 'rain extinguishes active combustion');

const transferred = fireWorld.transferTo(makeGrid(14));
assert.ok(transferred.massBudget().fuel > 0 && transferred.time === fireWorld.time, 'geometry rebuild transfers world state instead of deleting it');

const boundaryGrid = makeGrid(32), boundary = addProceduralBoundaries(boundaryGrid, 0.7, 'trees', 1);
assert.ok(boundary.some(point => point.branchId > 0 && point.parentBranchId != null), 'procedural trees contain branch/leaf hierarchy');
assert.ok(boundary.every(point => point.confidence === null && point.reliability === 'NOT_MEASURED'), 'procedural boundary carries no fake confidence');
assert.ok(boundaryGrid.fields.fuelMass.some(Boolean), 'tree boundary writes fuel into the shared world field');
const middle = Math.floor(boundaryGrid.size / 2);
assert.equal(boundaryGrid.cells[middle * boundaryGrid.size + boundaryGrid.size - 3], 0, 'organic boundary keeps a real gate instead of a sealed ring');

fireWorld.contaminateAt(0, 0, 'blood', 1); fireWorld.contaminateAt(0.2, 0, 'urine', 1); fireWorld.water.fill(0.7); fireWorld.snow.fill(0.7);
const contaminated = fireWorld.points();
assert.ok(contaminated.some(point => point.kind === 25) && contaminated.some(point => point.kind === 30), 'blood and urine are spatial surface fields');
assert.ok(contaminated.some(point => point.kind === 1 && point.r > 45), 'contaminants tint rendered water from the same state');

console.log('✅ Räumliche Rekonstruktion, Voxel, Weltzustand und Navigation bestanden');
