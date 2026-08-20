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

| Phase | Duration | Milestones |
|---|---|---|
| Phase 0 | Complete | GOLD freeze, audit, matrix, specs |
| Phase 1 | 2 weeks | Engine, operators registry, retention sweep |
| Phase 2 | 1 week | Probe set, GOLD baselines |
| Phase 3 | 4 weeks | 6 P0 experiments |
| Phase 4 | 6 weeks | 12 P1 experiments |
| Phase 5 | 4–24 weeks | P2+ long-shot research |
| Phase 6 | 1 week | Retention decisions, documentation update |

---

## Blocking Issues

1. **`test-hybrid-world.mjs`** — must be fixed before Phase 1 exit (GOLD recovery)
2. **Browser visual tests fail in headless** — need GPU-enabled Chromium for
   full visual verification; node tests are the CI gate
3. **SWIFT coordination** — motion experiments require SWIFT `--motion` export
   feature; this is a cross-repo dependency

---

## Success Criteria

Each phase ends green when:
- **Phase 1:** `node tools/orchestrate.js --dry-run` exits 0; `test-hybrid-world.mjs` passes
- **Phase 2:** `docs/research/gold-metrics.json` has 6 probes × 3 metrics
- **Phase 3:** All P0 experiments have `result.json` with `status: pass`
- **Phase 4:** All P1 experiments pass + `ranking.csv` generated
- **Phase 5:** At least 3 P2+ experiments complete
- **Phase 6:** `EG_DONOR_MATRIX.md` dispositions updated for all experiments
