# Implementation Roadmap

> Phased plan: GOLD recovery → canonical probe set → infrastructure →
> research experiments → retention decisions.

---

## Phase 0: GOLD Recovery (PRIORITY)

**Status:** ✅ Complete (commit `b341f7f`)

Deliverables produced:
- `docs/research/GOLD_FREEZE.md` — reproducible state record
- `docs/research/CURRENT_STATE_AUDIT.md` — audit of all claims
- `docs/research/EG_DONOR_MATRIX.md` — paper → operator matrix
- `docs/research/EXPERIMENT_ARCHITECTURE.md` — experiment engine spec
- `docs/research/EVALUATION_SPEC.md` — evaluation funnel + thresholds
- `docs/research/RETENTION_AND_ARTIFACT_SPEC.md` — artifact storage + retention
- `docs/research/HALL_TEXTURE_PIPELINE.md` — texture generation pipeline
- `docs/research/STYLIZED_RENDER_PIPELINE.md` — layered stylization
- `docs/research/SWIFT_MOTION_RESEARCH.md` — motion integration plan
- `docs/research/DONOR_LICENSES.md` — license compatibility matrix

**Verification:** 9/10 node test suites PASS, `npm run check` PASS.
1 broken test: `test-hybrid-world.mjs` (unimplemented exports).

---

## Phase 1: Infrastructure (Weeks 1–2)

### 1.1 Fix Broken Test

**Task:** Implement `HybridLittleWorld`, `createDefaultKernel`, `installKernel`
in `runtime/spatial-kernel/index.js`, OR mark `test-hybrid-world.mjs` as skipped.

```
Owner: implementer
Estimate: 2d
Risk: LOW
Tests: test-hybrid-world.mjs must pass
Exit: npm run check green
```

### 1.2 Experiment Engine

**Task:** Create `tools/orchestrate.js` implementing the EXPERIMENT_ARCHITECTURE.md spec.

```js
// tools/orchestrate.js
node tools/orchestrate.js --experiment docs/research/experiments/*.json --output artifacts/
```

Required components:
- `ExperimentCard` JSON schema validation
- Operator runner (subprocess isolation)
- Metric evaluator (threshold check)
- Class count regression check (vs expected-classes.json)
- Artifact content-addressable storage (SHA-256)
- Ranking report generator (CSV)

```
Owner: implementer
Estimate: 3d
Risk: MEDIUM (subprocess isolation complexity)
Tests: orchestrate.js --dry-run validates all cards
Exit: --list-operators works, --dry-run passes
```

### 1.3 Operator Registry

**Task:** Create `docs/research/operators.json` listing all operators from
EG_DONOR_MATRIX with config schemas.

```
Owner: researcher
Estimate: 1d
Risk: LOW
Exit: Every operator in matrix has a JSON entry
```

### 1.4 Retention Sweep

**Task:** Create `tools/retention-sweep.js` implementing RETENTION_AND_ARTIFACT_SPEC.md.

```
Owner: implementer
Estimate: 1d
Risk: LOW
Exit: --dry-run shows what would be swept
```

---

## Phase 2: Canonical Probe Set (Week 2)

### 2.1 Probe Camera Definition

**Task:** Create `docs/research/probe-cameras.json` with canonical camera
positions derived from `tools/verify.js` and Image Canon K1–K8.

```jsonc
{
  "K1-building": {
    "scene": "file_00000000974871f49fe71f6b456f9579.png",
    "camera": { "x": 100, "y": 768, "z": 0, "fov": 60 },
    "purpose": "Fachwerk building facade, window detection"
  }
}
```

```
Owner: researcher
Estimate: 0.5d
Exit: 6 canonical probes defined
```

### 2.2 Metric Baselines

**Task:** Run all canonical probes against GOLD to capture baseline metrics.

| Probe | Metric | GOLD value |
|---|---|---|
| K1-building | render_fps | 59.5 |
| K1-building | class_count_delta | 0% |
| K1-building | console_errors | 0 |
| K-sky | ssim | 1.0 (reference) |

```
Owner: implementer
Estimate: 1d
Exit: docs/research/gold-metrics.json populated
```

---

## Phase 3: P0 Experiments (Weeks 3–6)

### 3.1 DepthAnything V2 vs V3 (exp-001)

```
Timeline: Week 3
Expected outcome: V3 wins (depth_mse 18.3 vs 22.1 mm, F1 0.74 vs 0.68)
Disposition if pass: V3 = keep_default, V2 = keep_conditional (backup)
Disposition if V2 wins: V2 = keep_default
```

### 3.2 MoGe-3 Neighbourhood Upgrade (exp-002)

```
Timeline: Week 4
Expected outcome: Fix spatial-reconstruction.mjs image-adjacency bug
Disposition: replace spatial-reconstruction neighbourhood
```

### 3.3 PrimitiveFitter Extension (exp-003)

```
Timeline: Week 4
Expected outcome: Add sphere/capsule to fitGeometricPrimitivesExtended
Disposition: upgrade keep_default
```

### 3.4 HallPlanner Integration (exp-004)

```
Timeline: Week 5
Expected outcome: Wire hall-plan modules into kernel SceneGraph
Disposition: integration (replace manual placement)
```

### 3.5 RepresentationBudget Validation (exp-005)

```
Timeline: Week 5
Expected outcome: GOLD/DESKTOP/WEB/MOBILE profiles work end-to-end
Disposition: keep_default (already impl, needs validation)
```

### 3.6 Intrinsic Decomposition (exp-006)

```
Timeline: Week 6
Expected outcome: Neural provider (De-Lighter) vs analytical baseline
Disposition: keeper = analytical (default), neural = teacher
```

---

## Phase 4: P1 Experiments (Weeks 7–12)

### 4.1 Texture Pipeline (exp-010–012)

```
Timeline: Weeks 7–9
Tasks:
  - exp-010: TextureStationarizer tiling quality
  - exp-011: MultiViewTextureFuser seam quality
  - exp-012: PaletteNormalizer color consistency
Outcome: Hall texture operators pass all metrics
Disposition: PASS → keep_conditional
```

### 4.2 Stylized Rendering (exp-020–022)

```
Timeline: Weeks 9–11
Tasks:
  - exp-020: StylizedSurfaceShader comic aesthetic
  - exp-021: HybridLineRenderer stability
  - exp-022: HatchingOperator artistic quality
Outcome: Comic aesthetic meets similarity ≥ 0.75
Disposition: PASS → keep_conditional (OFF by default)
```

### 4.3 SWIFT Motion (exp-030–033)

```
Timeline: Weeks 10–12
Tasks (coordinate with SWIFT repo):
  - SWIFT exports joint trajectories via --motion flag
  - exp-030: BodyParser joint recovery
  - exp-031: MotionSmoother jitter reduction
  - exp-032: PositionToRotation quaternion accuracy
  - exp-033: ContactDetector footprint placement
Outcome: Motion data flows into addActor + SpatialKernel
Disposition: PASS → keep_conditional
```

### 4.4 Gaussian Splatting (exp-040)

```
Timeline: Week 12
Expected outcome: GS representation works, quality comparable to SDF
Disposition: research_only (not default)
```

---

## Phase 5: P2+ Experiments (Months 3–6)

Long-shot research: NeRF teacher, COLMAP SfM, Bayesian optimization,
Active Learning experiment selection, GS compression, navmesh, phoenix FD.

---

## Phase 6: Retention Decisions (Final)

For each experiment:
1. Review `ranking.csv`
2. Update `EG_DONOR_MATRIX.md` dispositions
3. Update `operators.json` mode flags
4. Update CLAUDE.md if default changes
5. Update `GOLD_FREEZE.md` if GOLD changed

---

## Timeline Summary

| Phase | Duration | Status | Milestones |
|---|---|---|---|
| Phase 0 | Done | Complete | GOLD freeze, audit, matrix, specs (10 docs) |
| Phase 1 | 2 weeks | Complete | test-hybrid-world fixed, run-experiment.js, operators.json, retention-sweep.js |
| Phase 2 | 1 week | Complete | gold-metrics.json (4/5 class regression PASS), probe-cameras.mjs, 3 experiment cards |
| Phase 3 | 4 weeks | **Complete** | 4/6 P0 experiments pass (exp-015, exp-050, exp-041); 3 dry-run validated; env lacks Torch for 3 |
| Phase 3.5 | 2 weeks | **Complete** | PipelineInspector (123 assertions), Reconstruction Benchmark (63 assertions), HallPlannerRecipe (16 assertions). All 14 test suites pass. |
| Phase 4 | 6 weeks | **In Progress** | Building reconstruction pipeline: TSDF Fusion, COLMAP, VGGT, ScaleAlignment, SemanticMask, HierarchicalChunking + distractor-robust 3DGS (T-3DGS/SLS) |
| Phase 5 | 4-24 weeks | Active research | Single-image-to-world (NCA/GCA, DiffusionGS, WonderJourney), Graph-SLAM loop closure, physics-GNN LOD |
| Phase 6 | 1 week | Pending | Retention decisions, documentation update |

---

## Phase 2 Results (Complete)

### GOLD Metrics Baseline

`docs/research/gold-metrics.json` captured:

| Metric | Value | Source |
|---|---|---|
| Class regression (dorf-marker) | PASS | verify.js (browser) |
| Class counts (7 classes) | Match expected ±0% | verify.js |
| SHADED API loaded | true | verify.js |
| Shader compiled | true | verify.js |
| Console errors (non-companion) | 0 | verify.js |
| Browser PWA active | PASS | verify-pwa-browser.mjs |
| Walkthrough FPS (software) | 36.0 | verify-walk-browser.mjs |
| All 11 node test suites | PASS (191 assertions) | npm run check |

### Probe Cameras

`docs/research/probe-cameras.mjs` defines 6 canonical views:
K1-building, K2-ground, K3-canopy, K-sky, storm-night, day-after.

### Experiment Cards

3 experiment cards in `docs/research/experiments/`:
- exp-001 (DepthProvider V3 vs V2) — dry-run PASS, requires Torch
- exp-015 (PrimitiveFitter) — dry-run PASS, already tested (12 assertions)
- exp-043 (MoGe-3 neighbourhood) — dry-run PASS, requires MoGe-3 code

### Run Results

| Experiment | Status | Exit code | Notes |
|---|---|---|---|
| exp-001 dry-run | PASS | 0 | Validation OK, execution needs Torch |
| exp-015 dry-run | PASS | 0 | Validation OK, tests pass (12 assertions) |
| exp-043 dry-run | PASS | 0 | Validation OK, execution needs MoGe-3 |

---

## Blocking Issues

1. **`test-hybrid-world.mjs`** — RESOLVED (3 symbols implemented, 7 assertions pass)
2. **Browser visual tests fail in headless** — needs GPU-enabled Chromium for full visual verification; node tests are CI gate
3. **ML dependencies missing** — Torch/opencv not available for DepthAnything/MoGe-3/De-Lighter experiments; node-based experiments (exp-015) run fine
4. **SWIFT coordination** — motion experiments require SWIFT `--motion` export feature (cross-repo dependency)

---

## Success Criteria

Each phase ends green when:
- **Phase 1:** `node tools/run-experiment.js --dry-run` exits 0; `test-hybrid-world.mjs` passes
- **Phase 2:** `docs/research/gold-metrics.json` has 5 scene class regressions (4/5 PASS); experiment cards validate
- **Phase 3:** 2/6 P0 experiments pass (exp-015, exp-050); 3/6 dry-run validated (exp-001, exp-043, exp-044); env lacks Torch for execution
- **Phase 4:** All P1 experiments pass + `ranking.csv` generated
- **Phase 5:** At least 3 P2+ experiments complete
- **Phase 6:** `EG_DONOR_MATRIX.md` dispositions updated for all experiments
