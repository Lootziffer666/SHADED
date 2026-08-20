# SHADED Evaluation Specification (EVALUATION_SPEC.md)

**Generated:** 2026-08-20  
**Status:** Complete specification for evaluation pipeline implementation

---

## Multi-Dimensional Quality Framework

### 7 Quality Dimensions (Measured Independently)

| Dimension | Code | Description |
|-----------|------|-------------|
| Geometry | `GEOMETRY` | Surface accuracy, normals, thin structures, silhouettes, scale, topology |
| Consistency | `CONSISTENCY` | Multi-view, temporal, camera, registration |
| Function | `FUNCTION` | Collision, free space, navigation, portals, slope/clearance |
| World Truth | `WORLD_TRUTH` | Observed vs generated, free-space violations, unknown correctness, hallucination |
| Visual | `VISUAL` | Appearance (LPIPS), edge stability, material consistency, texture consistency, held-out SSIM |
| Stability | `STABILITY` | Frame shimmer, camera artifacts, geometry popping, LOD transitions |
| Performance | `PERFORMANCE` | Compute time, VRAM, RAM, storage, file size, FPS, mobile cost |

### Metric Registry (36 Metrics)

Each metric has: dimension, unit, lowerIsBetter, description, reference range.

See `METRIC_DEFINITIONS` in `src/experiment/evaluation.js` for complete list.

---

## Goal-Specific Weights

| Goal | Use Case | Weight Distribution |
|------|----------|---------------------|
| **SHOWCASE** | Marketing, screenshots, trailers | VISUAL 35%, GEOMETRY 20%, STABILITY 15%, CONSISTENCY 10%, FUNCTION 5%, WORLD_TRUTH 5%, PERFORMANCE 10% |
| **PLAY** | Real-time interactive | FUNCTION 30%, STABILITY 25%, PERFORMANCE 20%, GEOMETRY 10%, CONSISTENCY 10%, VISUAL 5% |
| **EDIT** | Authoring, modification | GEOMETRY 30%, WORLD_TRUTH 25%, FUNCTION 20%, CONSISTENCY 15%, VISUAL 5%, STABILITY 5% |
| **MOBILE** | Web/mobile deployment | PERFORMANCE 40%, STABILITY 20%, VISUAL 15%, FUNCTION 10%, GEOMETRY 10% |
| **NAVIGATION** | Pathfinding, routing | FUNCTION 40%, GEOMETRY 25%, WORLD_TRUTH 20%, CONSISTENCY 10% |
| **COLLISION** | Physics, interaction | FUNCTION 35%, GEOMETRY 30%, WORLD_TRUTH 20%, STABILITY 10% |
| **RESEARCH** | Balanced analysis | All ~equal (14% each) |

---

## Evaluation Funnel (5 Levels)

### Level 1: Deterministic Metrics (Every Run)
**Cost:** ~ms | **Automation:** Full | **Coverage:** 100% runs

| Metric | Method | Reference |
|--------|--------|-----------|
| `geometry.surface_error` | Point-to-mesh distance (sampled) | Ground truth mesh |
| `geometry.normals_error` | Angular difference | Ground truth normals |
| `geometry.scale_accuracy` | Bounding box ratio | Ground truth bbox |
| `geometry.topology` | Euler characteristic + components | Ground truth |
| `world_truth.observed_vs_generated` | Voxel overlap ratio | Observation voxels |
| `world_truth.free_space_violations` | Occupied in observed free space | Observation voxels |
| `world_truth.hallucinated_matter` | Generated without support | Provenance analysis |
| `performance.compute_time` | Wall clock | System clock |
| `performance.vram` | Peak allocation | GPU query |
| `performance.ram` | Peak RSS | Process stats |
| `stability.frame_shimmer` | Frame diff variance | Consecutive frames |

### Level 2: Standardized Probe Views (Every Run)
**Cost:** ~seconds | **Automation:** Full | **Coverage:** 100% runs

| Probe | Camera Position | Metrics |
|-------|-----------------|---------|
| `entry` | Hall entrance, eye level | SSIM, LPIPS, edge stability |
| `center` | Hall center, eye level | SSIM, LPIPS, material consistency |
| `corner` | Hall corner, diagonal | SSIM, LPIPS, texture consistency |
| `elevated` | 3m height, center | SSIM, LPIPS, silhouette |
| `close_wall` | 1m from wall, parallel | Texture consistency, material |
| `portal` | Doorway threshold | Portal visibility, occlusion |

**Metrics per probe:**
- `visual.held_out_similarity.{probe}` — SSIM vs reference render
- `visual.appearance.{probe}` — LPIPS vs reference
- `visual.edge_stability.{probe}` — Edge map correlation
- `visual.material_consistency.{probe}` — Material histogram correlation

### Level 3: Held-Out Views (Multi-View Scenes)
**Cost:** ~minutes | **Automation:** Full | **Coverage:** Scenes with >3 views

**Protocol:**
1. Split views: 70% train (A,B,C), 30% hold-out (D,E)
2. Reconstruct from train views only
3. Render from hold-out camera poses (D', E')
4. Compare D' vs real D, E' vs real E

**Metrics:**
- `visual.held_out_similarity.{view}` — SSIM
- `consistency.multi_view.{view}` — Feature correspondence
- `geometry.silhouettes.{view}` — Silhouette IoU
- `consistency.camera.{view}` — Pose error (if GT poses)

### Level 4: Perceptual Model Comparison (Ambiguous Cases)
**Cost:** ~minutes | **Automation:** Semi-auto | **Coverage:** Flagged runs only

**Trigger:** L1-L3 scores within 0.05 of decision boundary

**Models:**
- **DreamSim** — Learned perceptual similarity (better than LPIPS for stylized)
- **CLIP-IQA** — CLIP-based quality assessment
- **SSIMULACRA2** — Modern SSIM variant

**Output:** Probability that A > B for human preference

### Level 5: Human Blind Comparison (Subset)
**Cost:** ~hours | **Automation:** Manual | **Coverage:** 10-20 runs per decision

**Protocol:**
1. Select 10-20 runs at Pareto frontier or decision boundary
2. Render standardized video sequences (camera path)
3. Blind A/B presentation (randomized order, hidden labels)
4. Forced choice: "Which looks better for [goal]?"
5. Minimum 5 raters, majority vote

**Output:** Human preference matrix, confidence intervals

---

## Synthetic Ground Truth Benchmarks

### 11 Benchmark Scenes

| ID | Name | Geometry | Materials | Key Challenges |
|----|------|----------|-----------|----------------|
| `planar_room` | Planar Room | Simple rectilinear | wall, floor, ceiling | Scale, planar accuracy |
| `thin_railings` | Thin Railings | Thin structures (1-2cm) | metal, glass | Thin preservation, silhouettes |
| `stairs` | Stairs | Sloped planes | concrete, metal | Slope, clearance, navigation |
| `pillars` | Pillars | Cylindrical | concrete | Cylindrical fitting, occlusion |
| `glass_partition` | Glass Partition | Planar transparent | glass | Transparency, reflections |
| `reflective_metal` | Reflective Metal | Varied | metal (glossy) | Roughness, cross-view consistency |
| `vegetation` | Vegetation | Organic thin | foliage | Thin, transparency, motion |
| `occluded_objects` | Occluded Objects | Complex | varied | Occlusion reasoning, completion |
| `repeated_architecture` | Repeated Architecture | Modular | concrete, tile | Repetition detection |
| `irregular_organic` | Irregular Organic | Non-manifold | organic | Topology, thin parts |
| `cluttered_floor` | Cluttered Floor | Cluttered | varied | Free space, navigation, collision |

### Benchmark Protocol
1. Build ground truth world (procedural or modeled)
2. Render controlled observations (known cameras, lighting)
3. Add noise: sensor noise, compression, motion blur
4. Run reconstruction pipeline
5. Evaluate with full L1-L3 metrics
6. Report: geometry error, completeness, hallucination rate

---

## Metric Computation Details

### Surface Error (Point-to-Mesh)
```
1. Sample N points from reconstructed mesh (N=100k)
2. For each point, find closest point on GT mesh
3. Mean distance = surface error
4. Also report: 50th, 90th, 99th percentiles
```

### Normals Error
```
1. For each sampled point, get reconstructed normal
2. Find corresponding GT normal (closest point)
3. Angular error = acos(|n_rec · n_gt|)
4. Report mean and percentiles in degrees
```

### Thin Structure Preservation
```
1. Extract skeleton of thin GT structures (railings, pillars < 5cm)
2. For each skeleton point, check if reconstructed surface within 2cm
3. Preservation rate = covered / total
```

### Free Space Violations
```
1. Voxelize observed free space (from depth maps)
2. Voxelize reconstructed occupied space
4. Violation = occupied ∩ observed_free
5. Count voxels, normalize by observed_free volume
```

### Hallucinated Matter
```
1. For each generated voxel, check provenance:
   - OBSERVED/MEASURED → not hallucinated
   - INFERRED/GENERATED without support → hallucinated
2. Hallucination score = hallucinated_volume / generated_volume
```

### LPIPS (Learned Perceptual Image Patch Similarity)
```
Use: lpips.net (AlexNet/VGG)
Input: 256x256 crops from probe renders
Output: Perceptual distance (lower = more similar)
```

### Edge Stability
```
1. Extract Canny edges from consecutive frames
2. Compute edge map correlation (IoU)
3. Stability = 1 - mean(1 - IoU) over sequence
```

---

## Evaluation Report Format

```json
{
  "runId": "RUN-20260820-143022-A7F3",
  "goal": "SHOWCASE",
  "overallScore": 0.873,
  "dimensionScores": {
    "GEOMETRY": 0.82,
    "CONSISTENCY": 0.91,
    "FUNCTION": 0.75,
    "WORLD_TRUTH": 0.88,
    "VISUAL": 0.93,
    "STABILITY": 0.85,
    "PERFORMANCE": 0.72
  },
  "metrics": {
    "geometry.surface_error": { "value": 0.023, "unit": "m", "p50": 0.018, "p90": 0.041 },
    "visual.held_out_similarity.entry": { "value": 0.89, "unit": "ssim" },
    "performance.compute_time": { "value": 1800000, "unit": "ms" }
  },
  "weights": { "VISUAL": 0.35, "GEOMETRY": 0.20, ... },
  "probeResults": {
    "entry": { "ssim": 0.89, "lpips": 0.12, "edgeStability": 0.94 },
    "center": { "ssim": 0.91, "lpips": 0.10, "materialConsistency": 0.96 }
  },
  "heldOutResults": {
    "view_D": { "ssim": 0.84, "silhouetteIoU": 0.88, "featureCorrespondence": 0.82 }
  },
  "timestamp": 1724178022000
}
```

---

## Regression Detection

### Per-Run Comparison
```python
def detect_regression(current, parent, thresholds):
    regressions = []
    for dim, score in current.dimensionScores.items():
        parent_score = parent.dimensionScores.get(dim)
        if parent_score and (parent_score - score) > thresholds[dim]:
            regressions.append({
                dimension: dim,
                current: score,
                parent: parent_score,
                delta: score - parent_score
            })
    return regressions
```

### Thresholds (per dimension)
| Dimension | Regression Threshold |
|-----------|---------------------|
| GEOMETRY | -0.03 |
| CONSISTENCY | -0.03 |
| FUNCTION | -0.05 |
| WORLD_TRUTH | -0.03 |
| VISUAL | -0.04 |
| STABILITY | -0.04 |
| PERFORMANCE | -0.10 |

---

## Pareto Analysis

### Multi-Objective Pareto Front
For a set of runs with same goal:
1. Normalize all metrics to [0,1] (higher better)
2. Identify non-dominated runs (Pareto front)
3. Report: Pareto count, hypervolume, spacing

### Decision Support
- **Knee point** — Best trade-off
- **Budget-constrained** — Best within cost limit
- **Minimum quality** — Cheapest above quality threshold

---

## CI/CD Integration

### GitHub Actions (PR Validation)
```yaml
- name: Run Synthetic Benchmarks
  run: |
    npm run eval:synthetic -- --quick
    # Must pass: geometry.error < 0.05, visual.ssim > 0.8
```

### Modal (Release Validation)
```bash
modal run shaded/eval_full.py --goal SHOWCASE --scene koelnmesse_hall_1
# Full L1-L3 + L4 perceptual
```

---

## Implementation Mapping

| Spec Section | Implementation File |
|--------------|---------------------|
| Metric definitions | `src/experiment/evaluation.js` → `METRIC_DEFINITIONS` |
| Goal weights | `src/experiment/evaluation.js` → `GOAL_WEIGHTS` |
| L1 metrics | `EvaluationPipeline.computeLevel1()` |
| L2 probes | `EvaluationPipeline.computeLevel2()` |
| L3 held-out | `EvaluationPipeline.computeLevel3()` |
| L4 perceptual | `EvaluationPipeline.computeLevel4()` |
| Synthetic benchmarks | `SYNTHETIC_BENCHMARKS`, `runSyntheticBenchmarks()` |
| Report generation | `EvaluationPipeline.generateReport()` |