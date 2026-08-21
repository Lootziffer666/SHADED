// SHADED Spatial Kernel — HallPlannerRecipe (spec §17).
//
// Turns a technical floor plan (+ calibration) into a GeometryObservation
// with sourceType FLOOR_PLAN, producing structural anchors for the kernel.
// Uses the existing hall-plan/ workflow modules (HallPlanWorkflow, HallExtruder,
// hallToStructuralPayload) — no code duplication.

import { GeometryObservation, SOURCE_TYPE, OBS_PROVENANCE } from '../observation.js';
import { NODE_FAMILY } from '../scene-graph.js';
import { VOXEL_PROVENANCE } from '../sparse-field.js';

let _bridge = null;
async function getBridge() {
  if (_bridge) return _bridge;
  try {
    const bp = await import('../../hall-plan/hall-spatial-bridge.mjs');
    const wf = await import('../../hall-plan/hall-plan-workflow.mjs');
    const core = await import('../../hall-plan/hall-plan-core.mjs');
    _bridge = {
      HallPlanWorkflow: wf.HallPlanWorkflow,
      PlanPoint: core.PlanPoint,
      hallToStructuralPayload: bp.hallToStructuralPayload,
    };
  } catch (err) {
    _bridge = { HallPlanWorkflow: null, PlanPoint: null, hallToStructuralPayload: null, error: err.message };
  }
  return _bridge;
}

export class HallPlannerRecipe {
  constructor(opts = {}) {
    this.name = 'hall-planner';
  }

  async run(kernel, input = {}, opts = {}) {
    const bridge = await getBridge();
    if (!bridge.HallPlanWorkflow) {
      return {
        ok: false,
        error: 'hall-plan modules not available: ' + (bridge.error || 'unknown'),
        simulated: false,
      };
    }

    const { HallPlanWorkflow, PlanPoint, hallToStructuralPayload } = bridge;
    const workflow = new HallPlanWorkflow();
    const planImage = input.image;
    const width = input.width;
    const height = input.height;
    const calibration = input.calibration || {};

    // 1) Import the plan image.
    if (planImage && width && height) {
      const rgba = planImage;
      try {
        workflow.importPlan(rgba, width, height, { name: calibration.planId || 'plan', sha256: calibration.sha256 || null });
      } catch (err) {
        return { ok: false, error: 'plan import failed: ' + err.message };
      }
    } else if (input.planImage) {
      try {
        workflow.importPlan(input.planImage.rgba, input.planImage.width, input.planImage.height, { name: calibration.planId, sha256: calibration.sha256 || null });
      } catch (err) {
        return { ok: false, error: 'plan import failed: ' + err.message };
      }
    } else {
      return { ok: false, error: 'no plan image provided in input' };
    }

    // 2) Calibrate: apply explicit calibration params if provided.
    if (calibration.calibrationPoints && PlanPoint) {
      const { measures } = calibration.calibrationPoints;
      if (measures && measures.length > 0) {
        workflow.calibration.calibrateMultiPoint(measures.map(m => ({
          a: new PlanPoint(m.a[0], m.a[1]), b: new PlanPoint(m.b[0], m.b[1]), real: m.real,
        })));
      }
    } else if (calibration.boundingBox && PlanPoint) {
      const { min, max, widthMeters, lengthMeters } = calibration.boundingBox;
      workflow.calibration.calibrateBoundingBox(
        new PlanPoint(min[0], min[1]), new PlanPoint(max[0], max[1]), widthMeters, lengthMeters
      );
    } else if (calibration.metersPerPixel && width && height && PlanPoint) {
      // Auto-calibrate: full image as bounding box, using metersPerPixel
      const scale = calibration.metersPerPixel;
      const wPx = calibration.realWidthPx || width;
      const hPx = calibration.realHeightPx || height;
      workflow.calibration.calibrateBoundingBox(
        new PlanPoint(0, 0), new PlanPoint(wPx, hPx),
        wPx * scale, hPx * scale
      );
    }

    if (!workflow.calibration.isCalibrated) {
      return { ok: false, error: 'plan not calibrated: provide calibrationPoints, boundingBox, or metersPerPixel' };
    }

    // 3) Analyze the plan (detect columns, walls, dashed zones).
    try {
      workflow.analyze({ minArea: 4 });
    } catch (err) {
      return { ok: false, error: 'plan analysis failed: ' + err.message };
    }

    // 4) Apply user classifications if provided.
    if (input.classifications) {
      for (const c of input.classifications) {
        try { workflow.classifyOne(c.rectId, c.semantic, c.provenance || 'auto'); }
        catch (e) { /* rect may not exist — skip */ }
      }
    }

    // 5) Build the hall (extrude structural geometry).
    let hall;
    try {
      hall = await workflow.buildHall();
    } catch (err) {
      return { ok: false, error: 'hall build failed: ' + err.message };
    }

    // 6) Convert to structural payload.
    const payload = hallToStructuralPayload(hall, workflow._lastModel || null);

    // 4) Build structural anchor points.
    const anchorPoints = [];
    if (payload && payload.anchors) {
      for (const a of payload.anchors) {
        const p = a.position || a.world || [0, 0, 0];
        anchorPoints.push({
          x: p[0], y: p[1], z: p[2],
          type: a.kind,
          confidence: a.confidence || 1,
        });
      }
    }

    // 5) Generate surface voxels from structural colliders (shell only, not solid fill).
    const surfaceVoxels = [];
    if (payload && payload.colliders) {
      for (const c of payload.colliders) {
        const min = c.min, max = c.max;
        const step = 0.5;
        const ix0 = Math.round(min[0] / step), ix1 = Math.round(max[0] / step);
        const iy0 = Math.round(min[1] / step), iy1 = Math.round(max[1] / step);
        const iz0 = Math.round(min[2] / step), iz1 = Math.round(max[2] / step);
        for (let x = ix0; x <= ix1; x++)
          for (let y = iy0; y <= iy1; y++)
            for (let z = iz0; z <= iz1; z++) {
              // Shell: only surfaces (at least one face on the boundary)
              if (x !== ix0 && x !== ix1 && y !== iy0 && y !== iy1 && z !== iz0 && z !== iz1) continue;
              surfaceVoxels.push({ x, y, z, material: 'rock' });
            }
      }
    }

    // 6) Create and ingest a FLOOR_PLAN observation.
    const obs = new GeometryObservation({
      sourceType: SOURCE_TYPE.FLOOR_PLAN,
      provenanceClass: OBS_PROVENANCE.OBSERVED,
      constraints: {
        anchors: anchorPoints,
        walls: payload ? (payload.colliders || []).filter(e => e.type === 'wall') : [],
        colliders: payload ? (payload.colliders || []) : [],
      },
      points: {
        positions: anchorPoints.map(a => ({ x: a.x, y: a.y, z: a.z })),
        count: anchorPoints.length,
      },
      camera: calibration.metersPerPixel
        ? { fx: calibration.metersPerPixel, fy: calibration.metersPerPixel, width, height }
        : null,
      metric: true,
      sourceRef: 'hall-plan:' + (calibration.planId || 'unknown'),
    });

    const ingest = kernel.ingest(obs);

    // 7) Import anchors into SparseField.
    let voxelCount = 0;
    const field = kernel.getSubsystem('field');
    if (field && surfaceVoxels.length > 0) {
      voxelCount = field.importPoints(surfaceVoxels, {
        provenance: VOXEL_PROVENANCE.OBSERVED,
        confidence: 1,
        sourceObs: obs.id,
      });
    }

    // 8) Create SceneGraph nodes.
    let worldNode = null, hallNode = null, anchorNodes = [];
    const graph = kernel.getSubsystem('graph');
    if (graph) {
      worldNode = graph.rootId ? graph.get(graph.rootId) : graph.createNode({ family: NODE_FAMILY.WORLD, id: 'world_hall_' + Date.now() });

      hallNode = graph.createNode({
        family: NODE_FAMILY.STRUCTURE,
        parent: worldNode.id,
        type: 'hall',
        id: 'hall_' + obs.id,
        metadata: { planId: calibration.planId, anchorCount: anchorPoints.length },
      });

      for (let i = 0; i < anchorPoints.length; i++) {
        const a = anchorPoints[i];
        const n = graph.createNode({
          family: NODE_FAMILY.ANCHOR,
          parent: hallNode.id,
          type: a.type,
          id: 'anchor_' + obs.id + '_' + i,
          metadata: { world: [a.x, a.y, a.z], confidence: a.confidence },
        });
        anchorNodes.push(n.id);
      }
    }

    return {
      ok: ingest.ok,
      observationId: obs.id,
      observedIds: [obs.id],
      hybridObservationId: obs.id,
      anchorCount: anchorPoints.length,
      surfaceVoxelCount: voxelCount,
      payloadElements: payload ? (payload.elementCount ? Object.values(payload.elementCount).reduce((a, b) => a + b, 0) : 0) : 0,
      worldNodeId: worldNode ? worldNode.id : null,
      hallNodeId: hallNode ? hallNode.id : null,
      anchorNodeIds: anchorNodes,
    };
  }
}
