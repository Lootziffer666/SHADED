// Editor UI controller for the SHADED PLAN → HALL workflow.
// Self-contained: owns the 5-step flow (IMPORT → SCALE → CLASSIFY → REVIEW → BUILD)
// and renders plan + semantic overlays on a 2D canvas. It ONLY uses the runtime
// hall-plan modules (never duplicates engine/analyze code). Final structural hall is
// exposed via getHallModel()/buildHall() and can be pushed into the spatial system.
//
// Integration note: PLAN→HALL produces STRUCTURAL geometry. Photos (PHOTO-FIRST) supply
// the visible surface. The structure is the camera-calibration scaffold (see §21/§22):
// known columns/walls become anchors that a photo's reverse-viewfinder match can lock to.

import { HallPlanWorkflow, SEMANTIC_CLASS, DETECTION_PROVENANCE } from '../runtime/hall-plan/hall-plan-workflow.mjs';
import { PlanPoint } from '../runtime/hall-plan/hall-plan-core.mjs';

const SEMANTIC_COLORS = {
  column: '#38bdf8',
  wall: '#f59e0b',
  core: '#a855f7',
  portal: '#22c55e',
  stair: '#ef4444',
  escalator: '#ec4899',
  outer_shell: '#64748b',
  level_link: '#14b8a6',
  ignore: '#475569',
  stand_zone: '#94a3b8',
  unknown: '#facc15'
};

export class HallPlanMode {
  constructor({ canvas, statusEl, fileInput, outEl } = {}) {
    this.canvas = canvas;
    this.ctx = canvas ? canvas.getContext('2d') : null;
    this.statusEl = statusEl;
    this.outEl = outEl;
    this.wf = new HallPlanWorkflow();
    this.imageData = null;     // ImageData (RGBA)
    this.mode = 'idle';        // idle | calibrate | classify
    this.calPoints = [];       // picked pixel points for 2-point calibration
    this.lastProposals = null;
    this.onHallBuilt = null;   // callback(hallResult)
  }

  setStatus(msg) { if (this.statusEl) this.statusEl.textContent = msg; }
  log(msg) { if (this.outEl) { this.outEl.textContent += msg + '\n'; } }

  // ---- 1. IMPORT ----
  async loadFile(file) {
    const bitmap = await createImageBitmap(file);
    const w = bitmap.width, h = bitmap.height;
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const cx = c.getContext('2d');
    cx.drawImage(bitmap, 0, 0);
    const data = cx.getImageData(0, 0, w, h);
    this.imageData = data;
    if (this.canvas) { this.canvas.width = w; this.canvas.height = h; this.ctx.putImageData(data, 0, 0); }
    // sha256 if available
    let sha = null;
    try { const buf = await file.arrayBuffer(); const dg = await crypto.subtle.digest('SHA-256', buf); sha = [...new Uint8Array(dg)].map(b => b.toString(16).padStart(2, '0')).join(''); } catch (e) { /* non-secure context */ }
    this.wf.importPlan(data.data, w, h, { name: file.name, sha256: sha });
    this.setStatus('Plan importiert (' + w + '×' + h + '). Jetzt SCALE: zwei Punkte klicken + Distanz eingeben.');
    this.mode = 'calibrate';
    this.render();
  }

  // ---- 2. SCALE ----
  handleCalibrateClick(px, py) {
    if (this.mode !== 'calibrate') return;
    this.calPoints.push(new PlanPoint(px, py));
    this.render();
    if (this.calPoints.length === 2) {
      this.setStatus('Zwei Punkte gesetzt. Distanz in Metern eingeben (Feld "distance") und "Anwenden" klicken.');
    }
  }

  applyTwoPoint(realMeters) {
    if (this.calPoints.length !== 2) { this.setStatus('Erst zwei Punkte im Plan klicken.'); return; }
    this.wf.calibrateTwoPoint(this.calPoints[0], this.calPoints[1], realMeters);
    this.setStatus('Kalibriert: ' + this.wf.calibration.scale.toFixed(5) + ' m/px (Quelle TWO_POINT). Weiter zu CLASSIFY → Analyze.');
    this.render();
  }

  applyBoundingBox(realWidth, realLength) {
    this.wf.calibrateBoundingBox(new PlanPoint(0, 0), new PlanPoint(this.imageData.width, this.imageData.height), realWidth, realLength);
    this.setStatus('Außenmaß-Kalibrierung: ' + this.wf.calibration.scale.toFixed(5) + ' m/px.');
    this.render();
  }

  // ---- 3. CLASSIFY ----
  analyze() {
    if (!this.wf.calibration.isCalibrated) { this.setStatus('Zuerst SCALE durchführen.'); return; }
    this.wf.analyze();
    this.mode = 'classify';
    const s = this.wf.reviewSummary();
    this.setStatus('Analyse: ' + JSON.stringify(s.counts) + ', Zonen=' + s.zones + '. Klicke ein Element, wähle Klasse, dann "Ähnliche markieren".');
    this.render();
  }

  handleClassifyClick(px, py) {
    if (this.mode !== 'classify') return;
    const rect = this._rectAtPixel(px, py);
    if (!rect) { this.setStatus('Kein erkanntes Element an dieser Stelle.'); return; }
    this.selectedRect = rect;
    this.setStatus('Element #' + rect.id + ' gewählt (' + rect.width + '×' + rect.height + ' px). Klasse unten wählen.');
    this.render();
  }

  _rectAtPixel(px, py) {
    const rects = this.wf.analysis ? this.wf.analysis.rects : [];
    // topmost (last drawn) first
    for (let i = rects.length - 1; i >= 0; i--) {
      const r = rects[i];
      if (px >= r.minX && px <= r.maxX && py >= r.minY && py <= r.maxY) return r;
    }
    return null;
  }

  /** User picks a semantic class for the selected element; proposes similar ones. */
  classifySelectedAs(semantic, { applyAll = true, minTier = 'medium' } = {}) {
    if (!this.selectedRect) { this.setStatus('Zuerst ein Element anklicken.'); return; }
    this.lastProposals = this.wf.proposeSimilar(this.selectedRect.id, semantic);
    if (applyAll) {
      const n = this.wf.classifyAllSimilar(this.selectedRect.id, semantic, { minTier });
      this.setStatus('"' + semantic + '": ' + (n + 1) + ' Elemente klassifiziert (Template + ' + n + ' ähnliche, minTier=' + minTier + ').');
    } else {
      this.wf.classifyOne(this.selectedRect.id, semantic);
      this.setStatus('Nur dieses Element als "' + semantic + '" markiert.');
    }
    this.render();
  }

  classifyZone(zoneId, type) {
    this.wf.classifyZone(zoneId, type);
    this.render();
  }

  // ---- 4. REVIEW ----
  runReview() {
    const s = this.wf.reviewSummary();
    this.log('REVIEW: ' + JSON.stringify(s));
    this.setStatus('REVIEW: ' + JSON.stringify(s.counts) + ' | unklassifiziert=' + s.unclassified);
    return s;
  }

  // ---- 5. BUILD HALL ----
  build({ hallHeight, columnHeight, defaultWallHeight, defaultWallThickness, floorThickness } = {}) {
    if (hallHeight != null) this.wf.hallParams.hallHeight = hallHeight;
    if (columnHeight != null) this.wf.hallParams.columnHeight = columnHeight;
    if (defaultWallHeight != null) this.wf.hallParams.defaultWallHeight = defaultWallHeight;
    if (defaultWallThickness != null) this.wf.hallParams.defaultWallThickness = defaultWallThickness;
    if (floorThickness != null) this.wf.hallParams.floorThickness = floorThickness;
    const model = this.wf.buildModel();
    const hall = this.wf.buildHall();
    this.log('BUILD HALL: ' + hall.colliders.length + ' collider, ' + hall.anchors.length + ' anchors, ' + hall.floor.length + ' floor-pts.');
    this.setStatus('Halle gebaut: ' + hall.colliders.length + ' Solids, ' + hall.anchors.length + ' Anker. JSON via Export verfügbar.');
    if (this.onHallBuilt) this.onHallBuilt(hall, model);
    return { model, hall };
  }

  exportJSON() {
    const json = this.wf.toJSON();
    return JSON.stringify(json, null, 2);
  }

  // ---- rendering ----
  render() {
    if (!this.ctx) return;
    const d = this.imageData;
    if (!d) return;
    this.ctx.putImageData(new ImageData(new Uint8ClampedArray(d.data), d.width, d.height), 0, 0);
    const ctx = this.ctx;
    // calibration points
    this.calPoints.forEach((p, i) => {
      ctx.strokeStyle = '#22d3ee'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(p.x, p.y, 6, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = '#22d3ee'; ctx.fillText('P' + (i + 1), p.x + 8, p.y - 8);
    });
    // classified rects overlay
    if (this.wf.analysis) {
      for (const [id, cls] of this.wf.classification.entries()) {
        const r = this.wf.analysis.rects.find(rr => rr.id === id);
        if (!r) continue;
        ctx.strokeStyle = SEMANTIC_COLORS[cls.semantic] || '#fff';
        ctx.lineWidth = 2;
        ctx.strokeRect(r.minX, r.minY, r.width, r.height);
        if (cls.grid) { ctx.fillStyle = ctx.strokeStyle; ctx.fillText(cls.grid.row + cls.grid.column, r.minX + 2, r.minY + 12); }
      }
      // zones
      for (const z of this.wf.zones) {
        ctx.strokeStyle = SEMANTIC_COLORS[z.type] || '#888';
        ctx.setLineDash([4, 4]); ctx.lineWidth = 1.5;
        ctx.strokeRect(z.polygon[0][0], z.polygon[0][1], z.polygon[2][0] - z.polygon[0][0], z.polygon[2][1] - z.polygon[0][1]);
        ctx.setLineDash([]);
      }
      // selection highlight
      if (this.selectedRect) {
        const r = this.selectedRect;
        ctx.strokeStyle = '#f43f5e'; ctx.lineWidth = 3;
        ctx.strokeRect(r.minX - 2, r.minY - 2, r.width + 4, r.height + 4);
      }
    }
  }
}

export { SEMANTIC_CLASS, SEMANTIC_COLORS, DETECTION_PROVENANCE };
