// Bridge between PLAN→HALL structure and the existing SHADED systems:
//  - spatial-navigation: structural collision (independent of any photo patch)
//  - reverse-viewfinder (PHOTO-FIRST): known hall anchors become camera-calibration
//    constraints (CLAUDE.md §9/§21/§22: a column is a possible camera/photo anchor).
//
// This module deliberately adds NO second reconstruction truth — it only adapts the
// already-built structural hall into the two existing consumers.

/**
 * Mark a built hall's colliders into an existing navigation grid (mirrors
 * spatial-navigation buildNavigationGrid cell blocking). Keeps structural
 * collision independent of PHOTO-FIRST patches.
 * @param {object} hall built hall (from HallPlanWorkflow.buildHall / HallExtruder.build)
 * @param {{size:number, cells:Uint8Array|Int8Array}} grid
 */
export function applyHallToNavGrid(hall, grid) {
  if (!hall || !grid) return grid;
  // Rasterize the hall's structural colliders into the navigation grid.
  const size = grid.size;
  const toCell = v => Math.max(1, Math.min(size - 2, Math.floor(((v + 1) * 0.5) * size)));
  for (const c of hall.colliders) {
    const x0 = toCell(c.min[0]), x1 = toCell(c.max[0]);
    const z0 = toCell(c.min[2]), z1 = toCell(c.max[2]);
    for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) {
      grid.cells[z * size + x] = 1;
    }
  }
  return grid;
}

/**
 * Feed known hall anchors into a ReverseViewfinderCalibrator as reference points.
 * The user (or an auto feature-match) supplies the corresponding image points;
 * we translate the anchor's world position into the calibrator's world frame.
 * @param {object} hall built hall (anchors: [{id, position:[x,y,z], ...}])
 * @param {object} calibrator ReverseViewfinderCalibrator instance
 * @param {Array<{anchorId:string, imagePoint:[u,v], weight?:number}>} matches
 */
export function applyAnchorMatchesToCalibrator(hall, calibrator, matches) {
  if (!hall || !calibrator) return 0;
  const byId = new Map(hall.anchors.map(a => [a.id, a]));
  let applied = 0;
  for (const m of matches) {
    const anchor = byId.get(m.anchorId);
    if (!anchor) continue;
    calibrator.addReferencePoint(m.imagePoint, anchor.position, m.weight ?? 1.0);
    applied++;
  }
  return applied;
}

/**
 * Solve/refine a photo camera from matched hall anchors (falls back gracefully:
 * if the calibrator cannot solve with <3 points it does NOT invent a pose).
 * @returns {{solved:boolean, confidence:number}}
 */
export function refineCameraFromAnchors(hall, calibrator, matches) {
  const n = applyAnchorMatchesToCalibrator(hall, calibrator, matches);
  if (n < 3) {
    // Not enough anchors: leave camera as the user set it (manual fallback, §22).
    return { solved: false, confidence: 0, reason: 'need >=3 anchor matches, got ' + n };
  }
  try {
    const res = calibrator.solveCameraPose ? calibrator.solveCameraPose() : null;
    return { solved: !!res, confidence: calibrator.calibrationConfidence_ ?? 0, result: res };
  } catch (e) {
    return { solved: false, confidence: 0, reason: String(e.message || e) };
  }
}

/**
 * Convert a built hall into a minimal provider-style payload that the spatial
 * system / persistence can consume (provenance: structural, not inferred surface).
 */
export function hallToStructuralPayload(hall, model) {
  return {
    format: 'SHADED.structural-hall.v1',
    provenance: 'PLAN_STRUCTURAL',
    colliders: hall.colliders,
    floor: hall.floor,
    anchors: hall.anchors,
    params: hall.params,
    elementCount: {
      columns: model ? model.getAllColumns().length : 0,
      walls: model ? model.getAllWalls().length : 0,
      cores: model ? model.getAllCores().length : 0
    }
  };
}
