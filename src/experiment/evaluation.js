/**
 * SHADED Evaluation Framework
 * Multi-dimensional quality metrics for experiment evaluation
 */

import { ExperimentRun } from './core.js';

/**
 * Quality dimensions — each measured independently
 */
export const QUALITY_DIMENSIONS = {
  GEOMETRY: 'geometry',
  CONSISTENCY: 'consistency',
  FUNCTION: 'function',
  WORLD_TRUTH: 'world_truth',
  VISUAL: 'visual',
  STABILITY: 'stability',
  PERFORMANCE: 'performance'
};

/**
 * Metric definitions for each dimension
 */
export const METRIC_DEFINITIONS = {
  // GEOMETRY
  'geometry.surface_error': { dimension: 'GEOMETRY', unit: 'm', lowerIsBetter: true, description: 'Mean surface distance to ground truth' },
  'geometry.normals_error': { dimension: 'GEOMETRY', unit: 'deg', lowerIsBetter: true, description: 'Mean angular error of normals' },
  'geometry.thin_structures': { dimension: 'GEOMETRY', unit: 'score', lowerIsBetter: false, description: 'Preservation of thin structures (railings, pillars)' },
  'geometry.silhouettes': { dimension: 'GEOMETRY', unit: 'iou', lowerIsBetter: false, description: 'Silhouette IoU from held-out views' },
  'geometry.scale_accuracy': { dimension: 'GEOMETRY', unit: 'ratio', lowerIsBetter: false, description: 'Global scale correctness' },
  'geometry.topology': { dimension: 'GEOMETRY', unit: 'score', lowerIsBetter: false, description: 'Topological correctness (connected components, holes)' },

  // CONSISTENCY
  'consistency.multi_view': { dimension: 'CONSISTENCY', unit: 'score', lowerIsBetter: false, description: 'Cross-view geometric consistency' },
  'consistency.temporal': { dimension: 'CONSISTENCY', unit: 'score', lowerIsBetter: false, description: 'Frame-to-frame temporal stability' },
  'consistency.camera': { dimension: 'CONSISTENCY', unit: 'm', lowerIsBetter: true, description: 'Camera pose accuracy vs ground truth' },
  'consistency.registration': { dimension: 'CONSISTENCY', unit: 'm', lowerIsBetter: true, description: 'Registration error between views' },

  // FUNCTION
  'function.collision': { dimension: 'FUNCTION', unit: 'score', lowerIsBetter: false, description: 'Collision mesh correctness' },
  'function.free_space': { dimension: 'FUNCTION', unit: 'score', lowerIsBetter: false, description: 'Free space correctness (no false obstacles)' },
  'function.navigation': { dimension: 'FUNCTION', unit: 'score', lowerIsBetter: false, description: 'Navigation graph correctness' },
  'function.portals': { dimension: 'FUNCTION', unit: 'score', lowerIsBetter: false, description: 'Portal/doorway connectivity' },
  'function.slope_clearance': { dimension: 'FUNCTION', unit: 'score', lowerIsBetter: false, description: 'Slope and clearance correctness' },

  // WORLD_TRUTH
  'world_truth.observed_vs_generated': { dimension: 'WORLD_TRUTH', unit: 'ratio', lowerIsBetter: false, description: 'Observed vs generated geometry ratio' },
  'world_truth.free_space_violations': { dimension: 'WORLD_TRUTH', unit: 'count', lowerIsBetter: true, description: 'Generated matter in observed free space' },
  'world_truth.unknown_correctness': { dimension: 'WORLD_TRUTH', unit: 'score', lowerIsBetter: false, description: 'Correctness in unknown regions' },
  'world_truth.hallucinated_matter': { dimension: 'WORLD_TRUTH', unit: 'score', lowerIsBetter: true, description: 'Unsupported hallucinated geometry' },

  // VISUAL
  'visual.appearance': { dimension: 'VISUAL', unit: 'lpips', lowerIsBetter: true, description: 'LPIPS perceptual distance to ground truth' },
  'visual.edge_stability': { dimension: 'VISUAL', unit: 'score', lowerIsBetter: false, description: 'Edge stability under camera motion' },
  'visual.material_consistency': { dimension: 'VISUAL', unit: 'score', lowerIsBetter: false, description: 'Material appearance consistency across views' },
  'visual.texture_consistency': { dimension: 'VISUAL', unit: 'score', lowerIsBetter: false, description: 'Texture consistency (no seams)' },
  'visual.held_out_similarity': { dimension: 'VISUAL', unit: 'ssim', lowerIsBetter: false, description: 'SSIM on held-out views' },

  // STABILITY
  'stability.frame_shimmer': { dimension: 'STABILITY', unit: 'score', lowerIsBetter: true, description: 'Frame-to-frame pixel shimmer' },
  'stability.camera_artifacts': { dimension: 'STABILITY', unit: 'score', lowerIsBetter: true, description: 'Camera motion artifacts' },
  'stability.geometry_popping': { dimension: 'STABILITY', unit: 'count', lowerIsBetter: true, description: 'LOD geometry popping events' },
  'stability.lod_transitions': { dimension: 'STABILITY', unit: 'score', lowerIsBetter: false, description: 'LOD transition smoothness' },

  // PERFORMANCE
  'performance.compute_time': { dimension: 'PERFORMANCE', unit: 'ms', lowerIsBetter: true, description: 'Total compute time' },
  'performance.vram': { dimension: 'PERFORMANCE', unit: 'MB', lowerIsBetter: true, description: 'Peak VRAM usage' },
  'performance.ram': { dimension: 'PERFORMANCE', unit: 'MB', lowerIsBetter: true, description: 'Peak RAM usage' },
  'performance.storage': { dimension: 'PERFORMANCE', unit: 'MB', lowerIsBetter: true, description: 'Output storage size' },
  'performance.file_size': { dimension: 'PERFORMANCE', unit: 'MB', lowerIsBetter: true, description: 'Final asset file size' },
  'performance.fps': { dimension: 'PERFORMANCE', unit: 'fps', lowerIsBetter: false, description: 'Runtime FPS' },
  'performance.mobile_cost': { dimension: 'PERFORMANCE', unit: 'score', lowerIsBetter: true, description: 'Estimated mobile render cost' }
};

/**
 * Goal-specific metric weights
 * Different goals prioritize different dimensions
 */
export const GOAL_WEIGHTS = {
  SHOWCASE: {
    VISUAL: 0.35,
    GEOMETRY: 0.20,
    STABILITY: 0.15,
    CONSISTENCY: 0.10,
    FUNCTION: 0.05,
    WORLD_TRUTH: 0.05,
    PERFORMANCE: 0.10
  },
  PLAY: {
    FUNCTION: 0.30,
    STABILITY: 0.25,
    PERFORMANCE: 0.20,
    GEOMETRY: 0.10,
    CONSISTENCY: 0.10,
    VISUAL: 0.05,
    WORLD_TRUTH: 0.00
  },
  EDIT: {
    GEOMETRY: 0.30,
    WORLD_TRUTH: 0.25,
    FUNCTION: 0.20,
    CONSISTENCY: 0.15,
    VISUAL: 0.05,
    STABILITY: 0.05,
    PERFORMANCE: 0.00
  },
  MOBILE: {
    PERFORMANCE: 0.40,
    STABILITY: 0.20,
    VISUAL: 0.15,
    FUNCTION: 0.10,
    GEOMETRY: 0.10,
    CONSISTENCY: 0.05,
    WORLD_TRUTH: 0.00
  },
  NAVIGATION: {
    FUNCTION: 0.40,
    GEOMETRY: 0.25,
    WORLD_TRUTH: 0.20,
    CONSISTENCY: 0.10,
    STABILITY: 0.05,
    PERFORMANCE: 0.00,
    VISUAL: 0.00
  },
  COLLISION: {
    FUNCTION: 0.35,
    GEOMETRY: 0.30,
    WORLD_TRUTH: 0.20,
    STABILITY: 0.10,
    CONSISTENCY: 0.05,
    PERFORMANCE: 0.00,
    VISUAL: 0.00
  },
  RESEARCH: {
    GEOMETRY: 0.20,
    CONSISTENCY: 0.20,
    WORLD_TRUTH: 0.20,
    VISUAL: 0.15,
    FUNCTION: 0.10,
    STABILITY: 0.10,
    PERFORMANCE: 0.05
  }
};

/**
 * Evaluation Pipeline
 */
export class EvaluationPipeline {
  constructor(options = {}) {
    this.goal = options.goal || 'RESEARCH';
    this.weights = GOAL_WEIGHTS[this.goal] || GOAL_WEIGHTS.RESEARCH;
    this.heldOutViews = options.heldOutViews || [];
    this.groundTruth = options.groundTruth || null;
    this.probeCameras = options.probeCameras || [];
    this.metrics = {};
  }

  /**
   * Level 1: Cheap deterministic metrics for every run
   */
  async computeLevel1(run, world) {
    const metrics = {};
    
    // Geometry metrics (if ground truth available)
    if (this.groundTruth && world.mesh) {
      metrics['geometry.surface_error'] = await this.computeSurfaceError(world.mesh, this.groundTruth.mesh);
      metrics['geometry.normals_error'] = await this.computeNormalsError(world.mesh, this.groundTruth.mesh);
      metrics['geometry.scale_accuracy'] = this.computeScaleAccuracy(world.mesh, this.groundTruth.mesh);
      metrics['geometry.topology'] = this.computeTopologyScore(world.mesh);
    }
    
    // World truth metrics (from run artifacts)
    if (run.artifacts.has('world_truth')) {
      const wt = run.artifacts.get('world_truth').metadata;
      metrics['world_truth.observed_vs_generated'] = wt.observedRatio || 0;
      metrics['world_truth.free_space_violations'] = wt.freeSpaceViolations || 0;
      metrics['world_truth.hallucinated_matter'] = wt.hallucinatedScore || 0;
    }
    
    // Performance metrics (always available)
    metrics['performance.compute_time'] = run.metrics['totalDuration']?.value || 0;
    metrics['performance.vram'] = run.metrics['memory.peak.vram']?.value || 0;
    metrics['performance.ram'] = run.metrics['memory.peak.heap']?.value || 0;
    metrics['performance.storage'] = run.metrics['output.size']?.value || 0;
    
    // Stability metrics
    metrics['stability.frame_shimmer'] = run.metrics['stability.shimmer']?.value || 0;
    metrics['stability.geometry_popping'] = run.metrics['stability.lod_pops']?.value || 0;
    
    this.metrics = metrics;
    return metrics;
  }

  /**
   * Level 2: Standardized probe views
   */
  async computeLevel2(run, world, renderer) {
    const metrics = {};
    
    if (!renderer || !world.mesh) return metrics;
    
    for (const probe of this.probeCameras) {
      const rendered = await renderer.render(world, probe.camera);
      const reference = probe.referenceImage;
      
      if (reference) {
        const key = `probe.${probe.name}`;
        metrics[`visual.held_out_similarity.${key}`] = this.computeSSIM(rendered, reference);
        metrics[`visual.appearance.${key}`] = await this.computeLPIPS(rendered, reference);
        metrics[`visual.edge_stability.${key}`] = this.computeEdgeStability(rendered, reference);
      }
    }
    
    return metrics;
  }

  /**
   * Level 3: Held-out views (when multi-view data available)
   */
  async computeLevel3(run, world, heldOutViews) {
    const metrics = {};
    
    for (const view of heldOutViews) {
      // Render from held-out camera
      // Compare with actual photograph
      metrics[`visual.held_out_similarity.${view.id}`] = 0; // placeholder
      metrics[`consistency.multi_view.${view.id}`] = 0;
      metrics[`geometry.silhouettes.${view.id}`] = 0;
    }
    
    return metrics;
  }

  /**
   * Level 4: Perceptual model comparison (for ambiguous cases)
   */
  async computeLevel4(run, world) {
    // Only run for runs flagged as ambiguous
    // Uses a perceptual model (e.g., CLIP, DreamSim) to compare
    return {};
  }

  /**
   * Level 5: Human blind comparison (small subset)
   */
  async computeLevel5(run, world) {
    // Manual process - not automated
    return {};
  }

  /**
   * Compute aggregate score for a dimension
   */
  computeDimensionScore(metrics, dimension) {
    const dimMetrics = Object.entries(metrics)
      .filter(([name]) => METRIC_DEFINITIONS[name]?.dimension === dimension)
      .map(([name, value]) => ({ name, value, def: METRIC_DEFINITIONS[name] }));
    
    if (dimMetrics.length === 0) return null;
    
    // Normalize each metric to 0-1 (higher is better)
    const normalized = dimMetrics.map(m => {
      const { lowerIsBetter } = m.def;
      // Simple normalization - in practice use reference ranges
      let norm = m.value;
      if (lowerIsBetter) norm = 1 / (1 + m.value);
      return norm;
    });
    
    return normalized.reduce((a, b) => a + b, 0) / normalized.length;
  }

  /**
   * Compute overall quality score for the goal
   */
  computeOverallScore(metrics) {
    let score = 0;
    let totalWeight = 0;
    
    for (const [dimension, weight] of Object.entries(this.weights)) {
      const dimScore = this.computeDimensionScore(metrics, dimension);
      if (dimScore !== null) {
        score += dimScore * weight;
        totalWeight += weight;
      }
    }
    
    return totalWeight > 0 ? score / totalWeight : 0;
  }

  /**
   * Generate evaluation report
   */
  generateReport(run, metrics) {
    const dimensionScores = {};
    for (const dimension of Object.values(QUALITY_DIMENSIONS)) {
      dimensionScores[dimension] = this.computeDimensionScore(metrics, dimension);
    }
    
    const overall = this.computeOverallScore(metrics);
    
    return {
      runId: run.runId,
      goal: this.goal,
      overallScore: overall,
      dimensionScores,
      metrics,
      weights: this.weights,
      timestamp: Date.now()
    };
  }

  // Placeholder metric computations
  async computeSurfaceError(mesh, gtMesh) { return 0; }
  async computeNormalsError(mesh, gtMesh) { return 0; }
  computeScaleAccuracy(mesh, gtMesh) { return 1; }
  computeTopologyScore(mesh) { return 1; }
  computeSSIM(img1, img2) { return 0; }
  async computeLPIPS(img1, img2) { return 0; }
  computeEdgeStability(img1, img2) { return 0; }
}

/**
 * Synthetic Ground Truth Benchmarks
 * Known worlds for controlled evaluation
 */
export const SYNTHETIC_BENCHMARKS = [
  {
    id: 'planar_room',
    name: 'Planar Room',
    description: 'Simple rectangular room with flat walls/floor/ceiling',
    geometry: 'simple',
    materials: ['wall', 'floor', 'ceiling'],
    challenges: ['scale', 'planar accuracy']
  },
  {
    id: 'thin_railings',
    name: 'Thin Railings',
    description: 'Room with thin metal railings (1-2cm)',
    geometry: 'thin_structures',
    materials: ['metal', 'glass'],
    challenges: ['thin structure preservation', 'silhouettes']
  },
  {
    id: 'stairs',
    name: 'Stairs',
    description: 'Staircase with proper slope and clearance',
    geometry: 'sloped',
    materials: ['concrete', 'metal'],
    challenges: ['slope accuracy', 'clearance', 'navigation']
  },
  {
    id: 'pillars',
    name: 'Pillars',
    description: 'Room with cylindrical pillars',
    geometry: 'cylindrical',
    materials: ['concrete'],
    challenges: ['cylindrical fitting', 'occlusion']
  },
  {
    id: 'glass_partition',
    name: 'Glass Partition',
    description: 'Glass walls with reflections',
    geometry: 'planar',
    materials: ['glass'],
    challenges: ['transparency', 'reflections', 'GS-2M material awareness']
  },
  {
    id: 'reflective_metal',
    name: 'Reflective Metal',
    description: 'Glossy metal surfaces',
    geometry: 'varied',
    materials: ['metal'],
    challenges: ['roughness estimation', 'cross-view consistency']
  },
  {
    id: 'vegetation',
    name: 'Vegetation',
    description: 'Indoor plants and foliage',
    geometry: 'organic',
    materials: ['foliage'],
    challenges: ['thin structures', 'transparency', 'motion']
  },
  {
    id: 'occluded_objects',
    name: 'Partially Occluded Objects',
    description: 'Objects partially hidden by furniture',
    geometry: 'complex',
    materials: ['varied'],
    challenges: ['occlusion reasoning', 'completion']
  },
  {
    id: 'repeated_architecture',
    name: 'Repeated Architecture',
    description: 'Modular repeated wall sections',
    geometry: 'modular',
    materials: ['concrete', 'tile'],
    challenges: ['repetition detection', 'modular reconstruction']
  },
  {
    id: 'irregular_organic',
    name: 'Irregular Organic Object',
    description: 'Non-manifold organic shape',
    geometry: 'organic',
    materials: ['organic'],
    challenges: ['topology', 'thin parts']
  },
  {
    id: 'cluttered_floor',
    name: 'Cluttered Floor',
    description: 'Floor with scattered objects',
    geometry: 'cluttered',
    materials: ['varied'],
    challenges: ['free space', 'navigation', 'collision']
  }
];

/**
 * Run synthetic benchmark suite
 */
export async function runSyntheticBenchmarks(evaluator, worldBuilder, options = {}) {
  const results = [];
  
  for (const bench of SYNTHETIC_BENCHMARKS) {
    console.log(`Running benchmark: ${bench.id}`);
    
    // Build ground truth world
    const gtWorld = await worldBuilder.build(bench);
    
    // Render controlled observations
    const observations = await renderObservations(gtWorld, bench.cameraConfig);
    
    // Reconstruct from observations
    const run = await runReconstruction(observations, { goal: 'RESEARCH' });
    
    // Evaluate
    const report = evaluator.generateReport(run, run.metrics);
    
    results.push({
      benchmark: bench.id,
      report
    });
  }
  
  return results;
}

export default {
  QUALITY_DIMENSIONS,
  METRIC_DEFINITIONS,
  GOAL_WEIGHTS,
  EvaluationPipeline,
  SYNTHETIC_BENCHMARKS,
  runSyntheticBenchmarks
};