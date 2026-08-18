// Metric calibration for technical hall plans.
// Translates pixel coordinates (plan image space) to meter coordinates (world space).
// Three calibration modes are supported:
//   1) Two-point   – click A,B + known real distance => metersPerPixel
//   2) Bounding box – known outer width/length in meters
//   3) Multi-point  – several known measures => least-squares best fit + residual error
// No hidden automatic scaling: every scale factor has an explicit, traceable source.

import { PlanPoint, HallPlanUtils } from './hall-plan-core.mjs';

export const CALIBRATION_SOURCE = {
  TWO_POINT: 'TWO_POINT',
  BOUNDING_BOX: 'BOUNDING_BOX',
  MULTI_POINT: 'MULTI_POINT',
  DEFAULT: 'DEFAULT'
};

export class PlanCalibration {
  constructor() {
    // Explicit, never-implicit transform parameters.
    this.scale = 0;          // meters per pixel (>= 0 means uncalibrated)
    this.pixelsPerMeter = 0; // 1 / scale
    this.rotation = 0;       // radians, deskew
    this.offset = new PlanPoint(0, 0); // plan-space origin offset (pixels)
    this.source = CALIBRATION_SOURCE.DEFAULT;
    this.knownMeasures = []; // [{a:PlanPoint, b:PlanPoint, real:number, label}]
    this.residualError = null; // meters, only for multi-point
    this.boundsMeters = null; // {width, length} when bounding-box used
  }

  get isCalibrated() {
    return this.scale > 0 && Number.isFinite(this.scale);
  }

  /**
   * Two-point calibration.
   * @param {PlanPoint} a pixel point A
   * @param {PlanPoint} b pixel point B
   * @param {number} realDistanceMeters known real distance between A and B
   */
  calibrateTwoPoint(a, b, realDistanceMeters) {
    if (!(a instanceof PlanPoint)) a = new PlanPoint(a.x, a.y);
    if (!(b instanceof PlanPoint)) b = new PlanPoint(b.x, b.y);
    if (!(realDistanceMeters > 0)) {
      throw new Error('Zwei-Punkt-Kalibrierung braucht eine positive reale Distanz.');
    }
    this.scale = HallPlanUtils.calculateMetersPerPixel(a, b, realDistanceMeters);
    this.pixelsPerMeter = this.scale > 0 ? 1 / this.scale : 0;
    this.source = CALIBRATION_SOURCE.TWO_POINT;
    this.knownMeasures = [{ a, b, real: realDistanceMeters, label: 'A–B' }];
    this.residualError = 0;
    this.boundsMeters = null;
    return this;
  }

  /**
   * Bounding-box calibration from known outer dimensions.
   * @param {PlanPoint} minC top-left plan pixel
   * @param {PlanPoint} maxC bottom-right plan pixel
   * @param {number} widthMeters real width (plan X extent)
   * @param {number} lengthMeters real length (plan Y extent)
   */
  calibrateBoundingBox(minC, maxC, widthMeters, lengthMeters) {
    if (!(minC instanceof PlanPoint)) minC = new PlanPoint(minC.x, minC.y);
    if (!(maxC instanceof PlanPoint)) maxC = new PlanPoint(maxC.x, maxC.y);
    const pxW = Math.abs(maxC.x - minC.x);
    const pxL = Math.abs(maxC.y - minC.y);
    if (!(pxW > 0) || !(pxL > 0)) {
      throw new Error('Außenmaß-Kalibrierung braucht eine nicht-leere Bounding-Box.');
    }
    // Average scale from both axes; residual = half the per-axis deviation.
    const sx = widthMeters / pxW;
    const sy = lengthMeters / pxL;
    this.scale = (sx + sy) / 2;
    this.pixelsPerMeter = 1 / this.scale;
    this.source = CALIBRATION_SOURCE.BOUNDING_BOX;
    this.boundsMeters = { width: widthMeters, length: lengthMeters };
    this.knownMeasures = [
      { a: minC, b: new PlanPoint(maxC.x, minC.y), real: widthMeters, label: 'width' },
      { a: minC, b: new PlanPoint(minC.x, maxC.y), real: lengthMeters, label: 'length' }
    ];
    this.residualError = Math.abs(sx - sy) / 2 * Math.max(pxW, pxL); // approx meters
    return this;
  }

  /**
   * Multi-point calibration: least-squares best fit of a single global scale.
   * @param {Array<{a:PlanPoint,b:PlanPoint,real:number,label?:string}>} measures
   */
  calibrateMultiPoint(measures) {
    if (!measures || measures.length < 1) {
      throw new Error('Mehrpunkt-Kalibrierung braucht mindestens ein Maß.');
    }
    const clean = measures.map(m => ({
      a: m.a instanceof PlanPoint ? m.a : new PlanPoint(m.a.x, m.a.y),
      b: m.b instanceof PlanPoint ? m.b : new PlanPoint(m.b.x, m.b.y),
      real: m.real,
      label: m.label || `m${measures.indexOf(m)}`
    }));
    if (clean.length === 1) {
      return this.calibrateTwoPoint(clean[0].a, clean[0].b, clean[0].real);
    }
    // Best fit: minimize sum((scale * pixelDist - real)^2) => scale = sum(px*real)/sum(px^2)
    let num = 0, den = 0;
    for (const m of clean) {
      const px = m.a.distanceTo(m.b);
      num += px * m.real;
      den += px * px;
    }
    if (!(den > 0)) throw new Error('Alle Maße haben Pixel-Distanz 0.');
    this.scale = num / den;
    this.pixelsPerMeter = 1 / this.scale;
    this.source = CALIBRATION_SOURCE.MULTI_POINT;
    this.knownMeasures = clean;
    // Residual = RMS of (scale*px - real) over all measures.
    let sq = 0;
    for (const m of clean) {
      const err = this.scale * m.a.distanceTo(m.b) - m.real;
      sq += err * err;
    }
    this.residualError = Math.sqrt(sq / clean.length);
    this.boundsMeters = null;
    return this;
  }

  /**
   * Convert a plan pixel point to world meter coordinates [x, z].
   * World axes: X = plan horizontal, Z = plan vertical, Y = height (added later).
   * @param {PlanPoint|{x,y}} pixelPoint
   * @returns {[number, number]}
   */
  toWorld(pixelPoint) {
    if (!this.isCalibrated) throw new Error('Plan ist nicht kalibriert.');
    const p = pixelPoint instanceof PlanPoint ? pixelPoint : new PlanPoint(pixelPoint.x, pixelPoint.y);
    const wp = HallPlanUtils.applyTransform(p, this.scale, this.rotation, this.offset);
    return [wp.x, wp.y]; // world X, world Z
  }

  /**
   * Convert a world meter point [x, z] back to plan pixels.
   * @param {[number, number]} worldXZ
   * @returns {PlanPoint}
   */
  toPlan(worldXZ) {
    if (!this.isCalibrated) throw new Error('Plan ist nicht kalibriert.');
    return HallPlanUtils.applyInverseTransform(
      new PlanPoint(worldXZ[0], worldXZ[1]), this.scale, this.rotation, this.offset);
  }

  /** Apply deskew rotation (radians) and origin offset (plan pixels). */
  setTransform({ rotation = 0, offset = null } = {}) {
    this.rotation = rotation;
    if (offset) this.offset = offset instanceof PlanPoint ? offset : new PlanPoint(offset.x, offset.y);
    return this;
  }

  toJSON() {
    return {
      scale: this.scale,
      pixelsPerMeter: this.pixelsPerMeter,
      rotation: this.rotation,
      offset: [this.offset.x, this.offset.y],
      source: this.source,
      residualError: this.residualError,
      boundsMeters: this.boundsMeters,
      knownMeasures: this.knownMeasures.map(m => ({
        a: [m.a.x, m.a.y], b: [m.b.x, m.b.y], real: m.real, label: m.label
      }))
    };
  }

  static fromJSON(json) {
    const c = new PlanCalibration();
    if (!json) return c;
    c.scale = json.scale || 0;
    c.pixelsPerMeter = json.pixelsPerMeter || 0;
    c.rotation = json.rotation || 0;
    c.offset = new PlanPoint(json.offset?.[0] || 0, json.offset?.[1] || 0);
    c.source = json.source || CALIBRATION_SOURCE.DEFAULT;
    c.residualError = json.residualError ?? null;
    c.boundsMeters = json.boundsMeters || null;
    c.knownMeasures = (json.knownMeasures || []).map(m => ({
      a: new PlanPoint(m.a[0], m.a[1]), b: new PlanPoint(m.b[0], m.b[1]),
      real: m.real, label: m.label
    }));
    return c;
  }
}
