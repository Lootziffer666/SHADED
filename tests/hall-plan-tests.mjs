// Tests for SHADED PLAN → HALL workflow.
// Run: node tests/hall-plan-tests.mjs

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

import {
  PlanPoint, HallModel, HallLevel, HallColumn, HallWall
} from '../runtime/hall-plan/hall-plan-core.mjs';
import {
  PlanImage, PlanAnalyzer, otsuThreshold, binarize, connectedComponents, componentToRect, detectDashedRuns
} from '../runtime/hall-plan/plan-analyzer.mjs';
import { PlanCalibration } from '../runtime/hall-plan/plan-calibrator.mjs';
import { HallExtruder, colliderToMesh } from '../runtime/hall-plan/hall-extruder.mjs';
import { HallPlanWorkflow, SEMANTIC_CLASS } from '../runtime/hall-plan/hall-plan-workflow.mjs';
import { loadHall } from '../runtime/hall-plan/hall-plan-adapter.mjs';

const EPS = 1e-6;
let passed = 0, failed = 0;
function assert(cond, msg) {
  if (!cond) { failed++; console.error('  FAIL: ' + msg); }
  else { passed++; }
}
function approx(a, b, tol = 1e-4) { return Math.abs(a - b) <= tol; }

// ---- helpers: build synthetic plan images ----
function makeImage(w, h, draw) {
  const rgba = new Uint8ClampedArray(w * h * 4).fill(255);
  draw(rgba, w, h);
  return new PlanImage(w, h, rgba);
}
function fillRect(rgba, w, x0, y0, x1, y1, v = 0) {
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
    const i = (y * w + x) * 4; rgba[i] = rgba[i + 1] = rgba[i + 2] = v;
  }
}

// =========================================================
// 1) SCALE CALIBRATION
// =========================================================
console.log('\n[1] Scale Calibration');
{
  const cal = new PlanCalibration();
  cal.calibrateTwoPoint(new PlanPoint(0, 0), new PlanPoint(100, 0), 25.0);
  assert(approx(cal.scale, 0.25), 'metersPerPixel = 0.25 (got ' + cal.scale + ')');
  assert(approx(cal.pixelsPerMeter, 4), 'pixelsPerMeter = 4');
  assert(cal.source === 'TWO_POINT', 'source TWO_POINT');
  // toWorld / toPlan roundtrip
  const back = cal.toPlan(cal.toWorld(new PlanPoint(50, 30)));
  assert(approx(back.x, 50, 1e-6) && approx(back.y, 30, 1e-6), 'toWorld/toPlan roundtrip');
  // multi-point best fit
  const cal2 = new PlanCalibration();
  cal2.calibrateMultiPoint([
    { a: new PlanPoint(0, 0), b: new PlanPoint(100, 0), real: 25 },
    { a: new PlanPoint(0, 0), b: new PlanPoint(0, 200), real: 50 }
  ]);
  assert(approx(cal2.scale, 0.25, 1e-6), 'multi-point scale 0.25 (got ' + cal2.scale + ')');
  assert(cal2.residualError !== null && cal2.residualError >= 0, 'multi-point residual present');
}

// =========================================================
// 2) ROTATION / DESKEW
// =========================================================
console.log('\n[2] Rotation / Deskew');
{
  // Plan drawn rotated by 30deg; deskew should recover true world coords.
  const angle = 30 * Math.PI / 180;
  const cal = new PlanCalibration();
  cal.calibrateTwoPoint(new PlanPoint(0, 0), new PlanPoint(100, 0), 25.0); // along plan X
  cal.setTransform({ rotation: -angle }); // deskew: world was rotated +angle in plan
  // A plan point at (100,0) should land along world X by 25m. With rotation -angle,
  // toWorld rotates plan by -angle then scales. Use inverse check: define a rotated
  // pixel and confirm its world position matches an expected location.
  // Simpler: rotate a known world vector into plan, then back.
  const wp = [10, 5];
  const planPt = cal.toPlan(wp);          // world -> plan (rotation applied)
  const wpBack = cal.toWorld(planPt);     // plan -> world (rotation removed), returns [x,z]
  assert(approx(wpBack[0], 10, 1e-5) && approx(wpBack[1], 5, 1e-5), 'deskew roundtrip (' + wpBack[0] + ',' + wpBack[1] + ')');
}

// =========================================================
// 3) COLUMN DETECTION (synthetic grid)
// =========================================================
console.log('\n[3] Column Detection (grid)');
{
  const W = 300, H = 300;
  const img = makeImage(W, H, (rgba, w) => {
    // 4 columns x 4 rows of 12x12 filled squares, spacing 60px
    for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) {
      const x = 30 + c * 60, y = 30 + r * 60;
      fillRect(rgba, w, x, y, x + 12, y + 12, 0);
    }
  });
  const analysis = new PlanAnalyzer().analyze(img, { minArea: 4 });
  assert(analysis.filledSquares.length === 16, 'detected 16 filled squares (got ' + analysis.filledSquares.length + ')');
  assert(analysis.columnCells.length === 16, 'detected 16 column grid cells (got ' + analysis.columnCells.length + ')');
  // grid labels present
  const labels = new Set(analysis.columnCells.map(c => c.row + '_' + c.column));
  assert(labels.has('A_1') && labels.has('D_4'), 'grid labels A_1..D_4 present');
}

// =========================================================
// 4) DASHED LINE TEST (NOT extruded as walls)
// =========================================================
console.log('\n[4] Dashed Line Test');
{
  const W = 400, H = 100;
  const img = makeImage(W, H, (rgba, w) => {
    // dashed stand rectangle: dashes every 20px along top & bottom edges
    for (let x = 10; x < 380; x += 24) {
      fillRect(rgba, w, x, 10, x + 12, 22, 0);   // top dashes
      fillRect(rgba, w, x, 78, x + 12, 90, 0);   // bottom dashes
    }
  });
  const analysis = new PlanAnalyzer().analyze(img, { minArea: 4 });
  // dashes must NOT be detected as walls
  assert(analysis.walls.length === 0, 'dashed dashes not detected as walls (got ' + analysis.walls.length + ')');
  assert(analysis.dashedZones.length >= 1, 'dashed zones detected (got ' + analysis.dashedZones.length + ')');

  // Through the workflow: dashed zone must never become a wall geometry.
  const wf = new HallPlanWorkflow();
  wf.importPlan(img.rgba, W, H, { name: 'dashed' });
  wf.calibrateTwoPoint(new PlanPoint(0, 0), new PlanPoint(100, 0), 25.0);
  wf.analyze();
  const model = wf.buildModel();
  const walls = model.getAllWalls();
  assert(walls.length === 0, 'no wall geometry from dashed zones (got ' + walls.length + ')');
  assert(model.zones.length >= 1, 'dashed zone preserved as semantic zone');
}

// =========================================================
// 5) WALL FOOTPRINT → correct 3D dimensions
// =========================================================
console.log('\n[5] Wall Footprint');
{
  const W = 400, H = 100;
  const img = makeImage(W, H, (rgba, w) => {
    fillRect(rgba, w, 20, 40, 320, 56, 0); // long thin wall: 300px x 16px
  });
  const wf = new HallPlanWorkflow();
  wf.importPlan(img.rgba, W, H, { name: 'wall' });
  wf.calibrateTwoPoint(new PlanPoint(0, 0), new PlanPoint(100, 0), 10.0); // 10m / 100px => 0.1 m/px
  wf.analyze();
  // classify the detected wall
  const wallRect = wf.analysis.walls[0];
  assert(wallRect, 'wall rect detected');
  wf.classifyOne(wallRect.id, SEMANTIC_CLASS.WALL);
  const model = wf.buildModel();
  const walls = model.getAllWalls();
  assert(walls.length === 1, 'one wall built');
  const wpx = (wallRect.maxX - wallRect.minX) * 0.1;
  // Centerline extent of the wall footprint (bounding box adds wall thickness).
  const fp = walls[0].footprint;
  const centerline = Math.hypot(fp[1].x - fp[0].x, fp[1].y - fp[0].y);
  assert(approx(centerline, wpx, 1e-3), 'wall footprint centerline = pixel length * scale (' + centerline + ' vs ' + wpx + ')');
}

// =========================================================
// 6) STABLE IDS (save/load)
// =========================================================
console.log('\n[6] Stable IDs');
{
  const W = 300, H = 300;
  const img = makeImage(W, H, (rgba, w) => {
    for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) {
      const x = 30 + c * 80, y = 30 + r * 80;
      fillRect(rgba, w, x, y, x + 14, y + 14, 0);
    }
  });
  const wf = new HallPlanWorkflow();
  wf.importPlan(img.rgba, W, H, { name: 'ids' });
  wf.calibrateTwoPoint(new PlanPoint(0, 0), new PlanPoint(100, 0), 25.0);
  wf.analyze();
  const model1 = wf.buildModel();
  const ids1 = model1.getAllColumns().map(c => c.id).sort();
  const json = model1.exportHall();
  const model2 = new HallModel(); model2.importHall(json);
  const ids2 = model2.getAllColumns().map(c => c.id).sort();
  assert(JSON.stringify(ids1) === JSON.stringify(ids2), 'column IDs stable across save/load');
}

// =========================================================
// 7) v1 COMPATIBILITY
// =========================================================
console.log('\n[7] v1 Compatibility');
{
  const repo = dirname(dirname(fileURLToPath(import.meta.url)));
  const v1path = join(repo, 'content/raum/messehalle.hall.json');
  const v1 = JSON.parse(readFileSync(v1path, 'utf8'));
  const model = loadHall(v1);
  assert(model.format === 'SHADED.hall-plan.v2', 'migrated to v2');
  const cols = model.getAllColumns();
  assert(cols.length === v1.stuetzen.positionen_xz_m.length, 'column count preserved (' + cols.length + ')');
  // positions migrated in meters
  const first = cols[0];
  assert(approx(first.position.x, v1.stuetzen.positionen_xz_m[0][0]) &&
         approx(first.position.y, v1.stuetzen.positionen_xz_m[0][1]),
         'first column position preserved in meters');
  // It must be loadable again (round-trip through migration)
  const reloaded = loadHall(model.exportHall());
  assert(reloaded.getAllColumns().length === cols.length, 'migrated model re-loadable');
}

// =========================================================
// 8) ROUNDTRIP (plan → semantics → hall → load → extrude)
// =========================================================
console.log('\n[8] Roundtrip');
{
  const W = 300, H = 300;
  const img = makeImage(W, H, (rgba, w) => {
    for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) {
      const x = 30 + c * 80, y = 30 + r * 80;
      fillRect(rgba, w, x, y, x + 14, y + 14, 0);
    }
  });
  const wf = new HallPlanWorkflow();
  wf.importPlan(img.rgba, W, H, { name: 'rt' });
  wf.calibrateTwoPoint(new PlanPoint(0, 0), new PlanPoint(100, 0), 25.0);
  wf.analyze();
  const modelA = wf.buildModel();
  const bboxA = modelA.getBoundingBox();
  const json = modelA.exportHall();
  const modelB = new HallModel(); modelB.importHall(json);
  const bboxB = modelB.getBoundingBox();
  assert(approx(bboxA.min[0], bboxB.min[0], 1e-3) && approx(bboxA.max[0], bboxB.max[0], 1e-3),
    'bounding box preserved after roundtrip');
  // extrude both, collider counts must match
  const extA = new HallExtruder(modelA, wf.hallParams).buildColliders();
  const extB = new HallExtruder(modelB, wf.hallParams).buildColliders();
  assert(extA.length === extB.length, 'collider count preserved (' + extA.length + ')');
}

// =========================================================
// 9) ANCHOR TEST
// =========================================================
console.log('\n[9] Anchor Test');
{
  const W = 300, H = 300;
  const img = makeImage(W, H, (rgba, w) => {
    for (let r = 0; r < 2; r++) for (let c = 0; c < 2; c++) {
      const x = 30 + c * 100, y = 30 + r * 100;
      fillRect(rgba, w, x, y, x + 14, y + 14, 0);
    }
  });
  const wf = new HallPlanWorkflow();
  wf.importPlan(img.rgba, W, H, { name: 'anc' });
  wf.calibrateTwoPoint(new PlanPoint(0, 0), new PlanPoint(100, 0), 25.0);
  wf.analyze();
  const model = wf.buildModel();
  const ext = new HallExtruder(model, wf.hallParams).build();
  assert(ext.anchors.length === 4, '4 anchors from 4 columns (got ' + ext.anchors.length + ')');
  const a = ext.anchors[0];
  assert(a.position.length === 3 && Number.isFinite(a.position[0]), 'anchor has 3D world coords');
  assert(a.base[1] === 0, 'anchor base at floor (y=0)');
}

// =========================================================
// 10) COLLISION TEST (structural geometry independent of photos)
// =========================================================
console.log('\n[10] Collision Test');
{
  const W = 300, H = 300;
  const img = makeImage(W, H, (rgba, w) => {
    for (let r = 0; r < 2; r++) for (let c = 0; c < 2; c++) {
      const x = 30 + c * 100, y = 30 + r * 100;
      fillRect(rgba, w, x, y, x + 14, y + 14, 0);
    }
  });
  const wf = new HallPlanWorkflow();
  wf.importPlan(img.rgba, W, H, { name: 'col' });
  wf.calibrateTwoPoint(new PlanPoint(0, 0), new PlanPoint(100, 0), 25.0);
  wf.analyze();
  const model = wf.buildModel();
  const extruder = new HallExtruder(model, wf.hallParams);
  const colliders = extruder.buildColliders();
  assert(colliders.length === 4, '4 column colliders (got ' + colliders.length + ')');

  // Mock nav grid (size 36) like spatial-navigation buildNavigationGrid
  const size = 36;
  const grid = { size, cells: new Uint8Array(size * size) };
  extruder.applyToNavGrid(grid);
  const toCell = v => Math.max(1, Math.min(size - 2, Math.floor(((v + 1) * 0.5) * size)));
  // A column center should be blocked; a far empty point should be free.
  const col = model.getAllColumns()[0];
  const cx = toCell(col.position.x), cz = toCell(col.position.y);
  assert(grid.cells[cz * size + cx] === 1, 'column center cell blocked');
  const freeIdx = toCell(-0.95) + size * toCell(-0.95);
  assert(grid.cells[freeIdx] === 0, 'empty far cell free');
  // colliderToMesh produces valid triangles
  const mesh = colliderToMesh(colliders[0]);
  assert(mesh.vertices.length === 8 && mesh.indices.length === 36, 'box mesh 8 verts / 36 indices');
}

// tiny safe calibrator stand-in exposing the bridge's expected methods
class CalibratorStandIn {
  constructor() { this.referencePoints_ = []; this.calibrationConfidence_ = 0; }
  addReferencePoint(ip, wp, w = 1) { this.referencePoints_.push({ ip, wp, w }); }
}

// =========================================================
// 11) SPATIAL BRIDGE (integration with nav grid + photo anchors)
// =========================================================
console.log('\n[11] Spatial Bridge');
{
  const W = 300, H = 300;
  const img = makeImage(W, H, (rgba, w) => {
    for (let r = 0; r < 2; r++) for (let c = 0; c < 2; c++) {
      const x = 30 + c * 100, y = 30 + r * 60;
      fillRect(rgba, w, x, y, x + 14, y + 14, 0);
    }
    fillRect(rgba, w, 20, 250, 320, 266, 0); // a wall, clear of the columns
  });
  const wf = new HallPlanWorkflow();
  wf.importPlan(img.rgba, W, H, { name: 'bridge' });
  wf.calibrateTwoPoint(new PlanPoint(0, 0), new PlanPoint(100, 0), 25.0);
  wf.analyze();
  wf.classifyOne(wf.analysis.walls[0].id, SEMANTIC_CLASS.WALL);
  const model = wf.buildModel();
  const hall = wf.buildHall();
  assert(hall.colliders.length === 5, 'hall has 5 colliders (4 cols + 1 wall)');

  // nav grid integration (independent of photos)
  const size = 36;
  const grid = { size, cells: new Uint8Array(size * size) };
  const { applyHallToNavGrid, refineCameraFromAnchors } = await import('../runtime/hall-plan/hall-spatial-bridge.mjs');
  applyHallToNavGrid(hall, grid);
  const toCell = v => Math.max(1, Math.min(size - 2, Math.floor(((v + 1) * 0.5) * size)));
  const col = model.getAllColumns()[0];
  assert(grid.cells[toCell(col.position.y) * size + toCell(col.position.x)] === 1, 'bridge: column cell blocked in nav grid');

  // anchor → photo camera matching (graceful: <3 matches => no invented pose)
  const cal = new CalibratorStandIn();
  const weak = refineCameraFromAnchors(hall, cal, [
    { anchorId: hall.anchors[0].id, imagePoint: [0.3, 0.4] }
  ]);
  assert(weak.solved === false, 'bridge: <3 anchor matches => no invented camera pose (manual fallback)');
}

// =========================================================
console.log('\n==== Hall-Plan tests: ' + passed + ' passed, ' + failed + ' failed ====');
process.exit(failed ? 1 : 0);
