# Implementation Roadmap (IMPLEMENTATION_ROADMAP.md)

**Generated:** 2026-08-20  
**Status:** Phased plan for the POST-GOLD RESEARCH PASS execution.  
**Anchors:** `GOLD_FREEZE.md` (baseline `8e9e284`), `EXPERIMENT_ARCHITECTURE.md`, `EG_DONOR_MATRIX.md`, `EVALUATION_SPEC.md`, `DONOR_LICENSES.md`.

> Each phase has an **entry gate** (parent green) and an **exit gate** (metrics + docs). Nothing merges that regresses a dimension beyond `EVALUATION_SPEC.md` thresholds. The GOLD run is never interrupted — experiments run as separate `RUN-*` records against the frozen baseline.

---

## Phase 0 — Experiment Infrastructure (DONE)

- ✅ `src/experiment/core.js` (Run IDs, content hash, ExperimentRun, ArtifactCache, OperatorRegistry)
- ✅ `src/experiment/evaluation.js` (7 dims, GOAL_WEIGHTS, 11 synthetic benchmarks)
- ✅ `src/experiment/retention.js` (retention classes, RunLifecycleManager)
- ✅ Research docs: GOLD_FREEZE, EG_DONOR_MATRIX, EXPERIMENT_ARCHITECTURE, EVALUATION_SPEC, HALL_TEXTURE_PIPELINE, spatial-kernel-donor-map
- **Exit:** reproducible run records possible.

## Phase 1 — Texture Pipeline (BEUTELTIER, P0)

Donors #1, #2, #3, #6b. Operators: `TextureStationarizer`, `MultiViewTextureFuser`, `PaletteNormalizer`, `EmissiveSeparator`.
- Entry: GOLD freeze.
- Work: real-photo → rectify → intrinsic → stationarize → palette → fuse → emissive.
- Exit: `visual.texture_consistency` > 0.85, `visual.repetition_threshold` measured, `visual.relighting_quality` no double-bake.
- Docs: `HALL_TEXTURE_PIPELINE.md` (done), `DONOR_LICENSES.md` (done).

## Phase 2 — Geometry Reconstruction Upgrade (P0)

Donors spatial-kernel §6/§7/§8. Upgrade `spatial-reconstruction`, `sparse-voxel-world` → `SparseField`, primitive set.
- Entry: Phase 0 green.
- Exit: `geometry.surface_error` < 0.05 on `SYNTHETIC_BENCHMARKS`, thin-structure preservation > 0.8.
- Red line: no faked depth (gate `allowFallback`).

## Phase 3 — Stylized Render (P0/P1)

Donors #18. Operators `HybridLineSystem`, `HatchingRenderer`, `StylizedNormalResponse`.
- Entry: material layer stable (Phase 1 palette + intrinsic).
- Exit: `visual.edge_stability` > 0.9, `STABILITY` no regression, emissive exempt.
- Docs: `STYLIZED_RENDER_PIPELINE.md` (done).

## Phase 4 — SWIFT Motion (P0)

Donors #10, #11, #12, #19. Operators `ContactDetector`, `AdaptiveMotionSmoother`, `PositionToRotationIK`, `PhaseDetector`, `MotionInbetweener`.
- Entry: `addActor` contract extend (Invariante 5).
- Exit: `MOTION_JITTER −0.40`, `FOOT_LOCK +0.40`.
- Docs: `SWIFT_MOTION_RESEARCH.md` (done).

## Phase 5 — World Truth / Coverage (P0)

Donors #4 (OCCAM). `CoverageEstimator` + provenance-driven hallucination score.
- Entry: Phase 2 geometry.
- Exit: `WORLD_TRUTH` +0.30, `hallucinated_matter` reported per run.

## Phase 6 — Representation Budgets (P0)

Donors #6, #8, #9, #17. `AppearanceDrivenSimplifier`, `RepresentationManager` budgets, `GSCuller`/`GSCompressor`.
- Entry: Phase 2/3 outputs exist.
- Exit: `PERFORMANCE +0.40` at equal quality (Pareto curve).

## Phase 7 — BEUTELTIER Integration

Wire Koelnmesse material assets + hall graph into BEUTELTIER runtime. Uses `tools/pipeline/`.
- Entry: Phases 1–6.
- Exit: end-to-end Koelnmesse Hall 1 render from GML+photos.

## Phase 8 — Quality/Cost Predictors

Train `QualityPredictor` / `CostPredictor` from accumulated `RUN-*` records (EXPERIMENT_ARCHITECTURE §Quality/Cost Predictors).
- Entry: ≥ 500 runs accumulated.
- Exit: predictor MAE within budget.

## Phase 9 — Web / Mobile Targets

HARDWARE_TARGET experiments (DESKTOP/WEB/MOBILE). Quantization FP32→FP16→INT8.
- Exit: MOBILE goal weights satisfied, `PERFORMANCE` green on mobile budget.

## Phase 10 — Release & Freeze Bump

- Tag new GOLD from best Pareto run.
- Update GOLD_FREEZE baseline (new commit, new hashes).
- CI: synthetic benchmarks on every PR (`EVALUATION_SPEC.md` CI/CD).

---

## Cross-Cutting (continuous)

- **GF-001 fix:** update `tools/verify*.cjs` for modular dev server (unblock verify suite).
- **GF-002:** bundle DA3 WASM offline-first or document requirement.
- **GF-003:** implement `SpatialMemory` (connect PatchRegistrar).
- **License gate:** every operator passes `DONOR_LICENSES.md` §6 before merge.

---

## Priority Cuts (if time-boxed)

1. Phase 1 (texture) — highest visual ROI, low risk.
2. Phase 4 (motion) — SWIFT differentiation.
3. Phase 5 (world truth) — prevents hallucination propagation.
4. Phase 2/6 (geometry/perf) — quality/cost backbone.
3D stylization (Phase 3) and predictors (Phase 8) are deferrable to a later freeze.
