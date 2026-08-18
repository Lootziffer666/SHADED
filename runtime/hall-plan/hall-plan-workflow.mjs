// PLAN → HALL workflow orchestrator.
// IMPORT → SCALE → CLASSIFY → REVIEW → BUILD HALL.
// Owns the editable semantic state and bridges to HallModel + HallExtruder.
// The "example → find similar" UX lives here: classify one rect, get scored
// candidates (high=auto-accept, medium=review, low=unknown) — no silent risky calls.

import { PlanImage, PlanAnalyzer, SEMANTIC_CLASS, DETECTION_PROVENANCE, findSimilar } from './plan-analyzer.mjs';
import { PlanCalibration, CALIBRATION_SOURCE } from './plan-calibrator.mjs';
import { HallModel, HallLevel, HallColumn, HallWall, HallCore, HallPortal, HallStair, HallEscalator, PlanPoint } from './hall-plan-core.mjs';
import { HallExtruder } from './hall-extruder.mjs';

const CONF_HIGH = 0.85;
const CONF_MED = 0.6;

export class HallPlanWorkflow {
  constructor() {
    this.image = null;          // PlanImage
    this.imageMeta = null;      // {name, sha256, width, height}
    this.calibration = new PlanCalibration();
    this.analysis = null;       // result of PlanAnalyzer.analyze
    this.classification = new Map(); // rectId -> {semantic, provenance}
    this.zones = [];            // dashed/stand zones (never walls)
    this.hallParams = {
      hallHeight: 7.4, columnHeight: 7.4, defaultWallHeight: 7.4,
      defaultWallThickness: 0.3, floorThickness: 0.2
    };
    this.stage = 'IMPORT';      // IMPORT, SCALE, CLASSIFY, REVIEW, BUILD
  }

  // ---- 1. IMPORT ----
  importPlan(rgba, width, height, meta = {}) {
    this.image = new PlanImage(width, height, rgba);
    this.imageMeta = { name: meta.name || 'plan', sha256: meta.sha256 || null, width, height };
    this.analysis = null;
    this.classification.clear();
    this.zones = [];
    this.stage = 'SCALE';
    return this;
  }

  // ---- 2. SCALE ----
  calibrateTwoPoint(a, b, realMeters) {
    this.calibration.calibrateTwoPoint(a, b, realMeters);
    return this.calibration;
  }
  calibrateBoundingBox(minC, maxC, wM, lM) {
    this.calibration.calibrateBoundingBox(minC, maxC, wM, lM);
    return this.calibration;
  }
  calibrateMultiPoint(measures) {
    this.calibration.calibrateMultiPoint(measures);
    return this.calibration;
  }
  setTransform(rotation, offset) {
    this.calibration.setTransform({ rotation, offset: offset ? new PlanPoint(offset[0], offset[1]) : null });
    return this.calibration;
  }

  // ---- 3. CLASSIFY (analysis) ----
  analyze(opts = {}) {
    if (!this.image) throw new Error('Kein Plan importiert.');
    this.analysis = new PlanAnalyzer().analyze(this.image, opts);
    // Pre-seed dashed zones as IGNORE/STAND_ZONE (never walls).
    for (const z of this.analysis.dashedZones) {
      this.zones.push({ id: 'zone_' + z.minX + '_' + z.minY, type: SEMANTIC_CLASS.STAND_ZONE, polygon: [[z.minX, z.minY], [z.maxX, z.minY], [z.maxX, z.maxY], [z.minX, z.maxY]], provenance: DETECTION_PROVENANCE.AUTO });
    }
    // Auto-seed column candidates from detected grid cells.
    for (const cell of this.analysis.columnCells) {
      this.classification.set(cell.rect.id, { semantic: SEMANTIC_CLASS.COLUMN, provenance: DETECTION_PROVENANCE.AUTO, grid: cell.grid });
    }
    // Auto-seed wall candidates from long-thin.
    for (const w of this.analysis.walls) {
      this.classification.set(w.id, { semantic: SEMANTIC_CLASS.WALL, provenance: DETECTION_PROVENANCE.AUTO });
    }
    this.stage = 'CLASSIFY';
    return this.analysis;
  }

  /**
   * Given a clicked rect id + chosen semantic class, find similar rects and score them.
   * @returns {{template:{id,score,semantic}, candidates:[{id,score,tier}]}}
   */
  proposeSimilar(rectId, semantic) {
    const rects = this.analysis ? this.analysis.rects : [];
    const template = rects.find(r => r.id === rectId);
    if (!template) throw new Error('Rechteck nicht gefunden: ' + rectId);
    const others = rects.filter(r => r.id !== rectId && !this._isInZone(r));
    const scored = findSimilar(template, others, { threshold: 0 });
    const candidates = scored.map(m => ({
      id: m.rect.id,
      score: m.score,
      tier: m.score >= CONF_HIGH ? 'high' : m.score >= CONF_MED ? 'medium' : 'low'
    }));
    return { template: { id: rectId, semantic, score: 1 }, candidates };
  }

  _isInZone(rect) {
    return this.zones.some(z => rect.cx >= z.polygon[0][0] && rect.cx <= z.polygon[2][0] &&
      rect.cy >= z.polygon[0][1] && rect.cy <= z.polygon[2][1]);
  }

  /** Assign a semantic class to one rect (user-driven). */
  classifyOne(rectId, semantic, provenance = DETECTION_PROVENANCE.USER) {
    this.classification.set(rectId, { semantic, provenance, grid: this.classification.get(rectId)?.grid });
    return this.classification.get(rectId);
  }

  /** Assign semantic class to rect + all similar above the given tier (default: all). */
  classifyAllSimilar(rectId, semantic, { minTier = 'low', provenance = DETECTION_PROVENANCE.USER } = {}) {
    const { candidates } = this.proposeSimilar(rectId, semantic);
    const tierRank = { low: 0, medium: 1, high: 2 };
    const minRank = tierRank[minTier] ?? 0;
    this.classifyOne(rectId, semantic, provenance); // template always
    let accepted = 0;
    for (const c of candidates) {
      if (tierRank[c.tier] >= minRank) {
        this.classification.set(c.id, { semantic, provenance, grid: this.classification.get(c.id)?.grid });
        accepted++;
      }
    }
    return accepted;
  }

  /** Mark a detected dashed zone as a specific semantic (stand_zone / ignore). */
  classifyZone(zoneId, type) {
    const z = this.zones.find(z => z.id === zoneId);
    if (z) { z.type = type; z.provenance = DETECTION_PROVENANCE.USER; }
    return z;
  }

  setHallParams(params) {
    this.hallParams = { ...this.hallParams, ...params };
    this.stage = 'REVIEW';
    return this.hallParams;
  }

  // ---- 4. REVIEW ----
  /** Summary of what is classified, for the review UI. */
  reviewSummary() {
    const counts = {};
    for (const v of this.classification.values()) counts[v.semantic] = (counts[v.semantic] || 0) + 1;
    const unclassified = (this.analysis ? this.analysis.rects : [])
      .filter(r => !this.classification.has(r.id)).length;
    return { counts, unclassified, zones: this.zones.length, calibrated: this.calibration.isCalibrated };
  }

  // ---- 5. BUILD HALL ----
  /** Build the editable HallModel from calibration + classification. */
  buildModel() {
    if (!this.calibration.isCalibrated) throw new Error('Plan ist nicht kalibriert (SCALE fehlt).');
    if (!this.analysis) this.analyze();
    const model = new HallModel();
    model.format = 'SHADED.hall-plan.v2';
    model.unit = 'm';
    model.source = {
      image: this.imageMeta?.name,
      sha256: this.imageMeta?.sha256,
      note: 'Strukturelle Halle aus technischem Plan. Keine Texturen/Fenster/Beleuchtung erfunden.'
    };
    model.calibration = this.calibration.toJSON();
    model.bounds = { note: 'Außenkontur ggf. manuell bestätigt.' };

    const level = new HallLevel('L0', 'Erdgeschoss', 0, {});
    const rectById = new Map(this.analysis.rects.map(r => [r.id, r]));

    for (const [rectId, cls] of this.classification.entries()) {
      const r = rectById.get(rectId);
      if (!r) continue;
      if (cls.semantic === SEMANTIC_CLASS.IGNORE) continue;
      if (cls.semantic === SEMANTIC_CLASS.STAND_ZONE) continue; // kept as zone, not geometry
      const [wx, wz] = this.calibration.toWorld(new PlanPoint(r.cx, r.cy));
      const wMeters = r.width * this.calibration.scale;
      const hMeters = r.height * this.calibration.scale;

      if (cls.semantic === SEMANTIC_CLASS.COLUMN) {
        level.addElement(new HallColumn(
          'column_' + (cls.grid ? cls.grid.row + cls.grid.column : rectId),
          new PlanPoint(wx, wz),
          [wMeters, hMeters],
          this.hallParams.columnHeight,
          { provenance: cls.provenance, heightIsDefault: true, grid: cls.grid || null }
        ));
      } else if (cls.semantic === SEMANTIC_CLASS.WALL) {
        // footprint from rect bbox corners (world)
        const [x0, z0] = this.calibration.toWorld(new PlanPoint(r.minX, r.minY));
        const [x1, z1] = this.calibration.toWorld(new PlanPoint(r.maxX, r.maxY));
        const fp = [
          new PlanPoint(x0, z0), new PlanPoint(x1, z0), new PlanPoint(x1, z1), new PlanPoint(x0, z1)
        ];
        level.addElement(new HallWall('wall_' + rectId, fp, this.hallParams.defaultWallHeight,
          { provenance: cls.provenance, thickness: this.hallParams.defaultWallThickness }));
      } else if (cls.semantic === SEMANTIC_CLASS.CORE) {
        const [x0, z0] = this.calibration.toWorld(new PlanPoint(r.minX, r.minY));
        const [x1, z1] = this.calibration.toWorld(new PlanPoint(r.maxX, r.maxY));
        const fp = [new PlanPoint(x0, z0), new PlanPoint(x1, z0), new PlanPoint(x1, z1), new PlanPoint(x0, z1)];
        level.addElement(new HallCore('core_' + rectId, fp, this.hallParams.hallHeight, { provenance: cls.provenance }));
      }
    }

    // Add dashed zones as semantic zones (not geometry).
    for (const z of this.zones) {
      const poly = z.polygon.map(([px, py]) => {
        const [wx, wz] = this.calibration.toWorld(new PlanPoint(px, py));
        return [wx, wz];
      });
      model.zones.push({ id: z.id, type: z.type, polygon: poly, provenance: z.provenance });
    }

    model.addLevel(level);
    this.stage = 'BUILD';
    this._lastModel = model;
    return model;
  }

  buildHall() {
    const model = this._lastModel || this.buildModel();
    return new HallExtruder(model, this.hallParams).build();
  }

  toJSON() {
    const model = this._lastModel || (this.calibration.isCalibrated ? this.buildModel() : null);
    return model ? model.exportHall() : null;
  }
}

export { SEMANTIC_CLASS, DETECTION_PROVENANCE, CONF_HIGH, CONF_MED };
