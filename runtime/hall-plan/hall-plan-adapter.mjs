// SHADED.hall-plan.v1 → v2 migration adapter.
// v1 (German field names, single-view room provider output) stays loadable; this
// adapter maps it onto the v2 in-memory HallModel without inventing structure.
// v1 carries column positions + a declared anchor scale, so columns migrate cleanly.
// Heights are NOT claimed as measured: they default and are flagged as such.

import { HallModel, HallLevel, HallColumn, PlanPoint } from './hall-plan-core.mjs';
import { PlanCalibration, CALIBRATION_SOURCE } from './plan-calibrator.mjs';

/**
 * Load any hall JSON (v1 or v2) into a HallModel.
 * @param {object} data parsed JSON
 * @returns {HallModel}
 */
export function loadHall(data) {
  if (!data || typeof data !== 'object') throw new Error('Ungültige Hall-Daten.');
  if (data.format === 'SHADED.hall-plan.v2') return hallV2ToModel(data);
  if (data.format === 'SHADED.hall-plan.v1') return hallV1ToModel(data);
  // Unknown: try v2 shape defensively.
  if (data.columns || data.levels) return hallV2ToModel(data);
  throw new Error('Unbekanntes Hallenformat: ' + data.format);
}

export function hallV1ToModel(data) {
  const model = new HallModel();
  model.format = 'SHADED.hall-plan.v2';
  model.source = {
    migratedFrom: 'SHADED.hall-plan.v1',
    herkunft: data.herkunft || {},
    note: 'Spalten aus v1 übernommen; Höhen sind Default, NICHT aus dem 2D-Plan gemessen.'
  };
  // Calibration: v1 declares an anchor scale implicitly via kamera + boden.fliese_m.
  const cal = new PlanCalibration();
  cal.scale = 1; // v1 positions are already in meters
  cal.pixelsPerMeter = 1;
  cal.source = CALIBRATION_SOURCE.DEFAULT;
  cal.residualError = null;
  model.calibration = cal.toJSON();

  const level = new HallLevel('L0', 'Erdgeschoss', 0, { migrated: true });
  const stuetzen = data.stuetzen;
  if (stuetzen && Array.isArray(stuetzen.positionen_xz_m)) {
    const bw = stuetzen.breite_m ?? 0.26;
    stuetzen.positionen_xz_m.forEach((p, i) => {
      const col = new HallColumn(
        'column_' + String.fromCharCode(65 + (i % 26)) + '_' + (Math.floor(i / 26) + 1),
        new PlanPoint(p[0], p[1]),
        [bw, bw],
        7.4, // DEFAULT, not measured from plan
        { provenance: 'MIGRATED_V1', heightIsDefault: true }
      );
      level.addElement(col);
    });
  }
  model.addLevel(level);
  model.bounds = {
    note: 'v1 lieferte keine Außenkontur; nur Stützenpositionen bekannt.',
    fromV1: true
  };
  return model;
}

export function hallV2ToModel(data) {
  const model = new HallModel();
  model.format = data.format || 'SHADED.hall-plan.v2';
  model.unit = data.unit || 'm';
  model.source = data.source || {};
  model.calibration = data.calibration || {};
  model.bounds = data.bounds || {};

  if (Array.isArray(data.levels)) {
    for (const ld of data.levels) {
      const lvl = new HallLevel(ld.id, ld.name, ld.elevation || 0, ld.properties || {});
      for (const e of (ld.elements || [])) lvl.addElement(deserializeElement(e));
      model.addLevel(lvl);
    }
  }
  for (const e of (data.globalElements || [])) model.addGlobalElement(deserializeElement(e));
  for (const a of (data.anchors || [])) {
    model.addAnchor({
      id: a.id, type: a.type,
      position: new PlanPoint(a.position[0], a.position[1], a.position[2] || 0),
      description: a.description || '', confidence: a.confidence ?? 1.0
    });
  }
  return model;
}

function deserializeElement(e) {
  switch (e.type) {
    case 'column':
      return new HallColumn(e.id, new PlanPoint(e.position[0], e.position[1]), e.footprint, e.height, e.properties);
    case 'wall':
      return new HallWall(e.id, (e.footprint || []).map(p => new PlanPoint(p[0], p[1])), e.height, e.properties);
    case 'core':
      return new HallCore(e.id, (e.footprint || []).map(p => new PlanPoint(p[0], p[1])), e.height, e.properties);
    case 'portal':
      return new HallPortal(e.id, new PlanPoint(e.position[0], e.position[1]), e.width, e.height, e.properties);
    case 'stair':
      return new HallStair(e.id, new PlanPoint(e.position[0], e.position[1]), e.width, e.connectedLevelA, e.connectedLevelB, e.heightDifference, e.properties);
    case 'escalator':
      return new HallEscalator(e.id, new PlanPoint(e.position[0], e.position[1]), e.width, e.connectedLevelA, e.connectedLevelB, e.heightDifference, e.properties);
    default:
      return new HallElement(e.id, e.type, e.properties);
  }
}

/** Serialize a HallModel to v2 JSON object. */
export function modelToV2(model) {
  return model.exportHall();
}
