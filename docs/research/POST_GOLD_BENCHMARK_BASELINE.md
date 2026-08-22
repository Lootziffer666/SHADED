# POST-GOLD Benchmark Baseline

**Purpose:** Freeze the exact reproducible benchmark surface for SHADED post-GOLD research.
Anything that cannot run on this surface is **environment-blocked**, not **broken**.

This document is the single source of truth for:
- Which commit is the frozen baseline (§1)
- What "reproduces locally with zero external dependencies" means — `MAXIMUM DENNIS` (§2)
- The quality gates that define pass/fail (§3)
- The cost model the tournament optimizes (§4)
- The provider status: real vs. stub (§5)
- The sandbox environment (§6)

It does **not** commit code or artifacts. Baseline commit hash is *recorded*, not created here.

---

## 1. Frozen Baseline Commit

| Role | Value |
|---|---|
| GOLD / origin/main (handoff) | `1cb06c432d90c49628786a1c80bcdb9ad8145722` |
| Canonical experiment-card `gitRef.commit` (stale) | `b341f7f46390216e81c97e01259a573fd2e9896c` |
| This pass instrumentation commit (local `wip`) | `d7efa42` (verify-`*.js` swiftshader migration + `verify-lenses.js` `shotWrap`) |
| **Benchmark baseline commit** | `1cb06c4` (GOLD) — the frozen surface. Instrumentation `d7efa42` sits *on top* and is documented as env-hardening, not a baseline shift. |

**Verifiability:** from `1cb06c4`, the reproduction recipe in `CURRENT_STATE_AUDIT.md` §0 produces the class counts in §3 and the stub tournament result in §2/MAXIMUM DENNIS (deterministic per `SpatialMemory`/`WorldFields` seed-free invariant).

---

## 2. MAXIMUM DENNIS — The Local Reproduction Floor

**MAXIMUM DENNIS** is the *maximal* benchmark that reproduces **locally with zero external (torch/GPU/Modal) dependencies**. It is the floor, not a substitute for real providers: a failing DENNIS is a *failure to reproduce*, period. A passing DENNIS is *necessary but not sufficient* for a real-provider pass.

It is driven by `tools/benchmark-local.mjs` (Phase C driver) and is deterministic by construction:

- **Providers:** the 8 stub providers from `createStandardBenchmark()` in `tools/benchmark-providers.mjs` (no ML, no GPU).
- **Stages:** the canonical 4-stage pipeline — `DEPTH → GEOMETRY → CLEANUP → COMPLETION` (`STAGE_ORDER`).
- **Cases (= benchmark scenes):** all 5 scenes in `tools/expected-classes.json` mapped to `BenchmarkCase` inputs (§3).
- **Execution:** `Tournament.runTournament(STAGE_ORDER, providersByStage, cases)` + `Tournament.runStack(cases, winners)` — i.e. the same tournament+stack path real providers take.
- **Determinism contract:** stub outputs are constant floats; `measureInfoLoss` is pure; the only `Date.now()`/`process.memoryUsage()` terms are wall-clock/memory *metrics* (not quality). The tournament **ranking** is therefore stable across runs.
- **Output:** `result.json` + `result.sha256` (content-addressed copy into `by-sha256/`) written under `--out artifacts/local-<runId>`.

**Pass criterion for DENNIS:** exit 0 AND every case within class-count tolerance (§3.3) AND tournament winners stable AND no provider eliminated for `all_runs_failed`.

---

## 3. Quality Gates (Class-Count Regression)

The single source of truth for "the engine still classifies what it should" is **class-count regression** against the 5 scenes in `tools/expected-classes.json`. This is what `tools/verify-classes.mjs` checks with `dorf-marker` (exact) and what `tools/run-experiment.js` enforces programmatically.

| Scene (id) | Foliage | Grass | Wood | Rock | Roof | Window | Path | Water |
|---|---|---|---|---|---|---|---|---|
| `dorf-marker` | 5872 | 4885 | 3636 | 1186 | 2814 | 197 | 2146 | — |
| `legacy-map` | 3916 | 6024 | 1921 | 1175 | 4753 | 522 | 2080 | 345 |
| `taverne` | 6279 | 3284 | 4366 | 2644 | 2040 | 0 | 2123 | — |
| `dorf-kanon` | 7246 | 5575 | 2356 | 1099 | 2626 | 20 | 1813 | 1 |
| `dorf-himmel` | 5443 | 4670 | 2848 | 3996 | 2186 | 26 | 1552 | 15 |

**Tolerance rule** (identical in `tools/run-experiment.js` `checkClassRegression`):
`delta <= max(40, round(0.10 * expected))` per `(scene, material)` cell.

`dorf-marker` must match **exactly** (marker map removes heuristic variance) — this is the primary gate. The other four are heuristic-classification scenes and tolerate variance.

---

## 4. Cost Model (Tournament Objective)

From `tools/benchmark-providers.mjs` `Tournament.runStage`:

```
score = avgQuality - avgRuntimeMs/1000 - avgMemoryMb/100
```

Per `BenchmarkCase.thresholds` (defaults):
```
quality_min: 0.5   |  runtime_max_ms: 10000  |  memory_max_mb: 512  |  info_loss_max: 0.3
```

Per-run metrics captured (in `BenchmarkRun.metrics`): `runtime_ms`, `memory_mb`, `quality`.
Per-stage report (`ReconstructionBenchmark.report`): `total`, `ok`, `failed`, `avgRuntimeMs`, `avgMemoryMb`, `avgQuality`.

---

## 5. Provider Status

### 5.1 Real providers — environment-blocked (require Modal/GPU)

These live in `tools/providers/*.py` and are registered in `docs/research/operators.json`
(47 operators). They **do not run** in this sandbox.

| Operator | Donor | Needs | Status here |
|---|---|---|---|
| `DepthProvider` | Depth Anything V2 / V3 | `torch:2.3` | ❌ `No module named torch` |
| `ImageTo3DCompletion` | TRELLIS | `torch` | ❌ |
| `GeometryNeighbourhood` | MoGe-3 | `torch` | ❌ |
| `IntrinsicDecomposer` | IntrinsicNet/De-Lighter | `torch` | ❌ |
| (VGGT, MapAnything, COLMAP, RANSAC, TSDF, scale-align, software_depth) | various | `torch`/`numpy` | ❌ no torch / no numpy / no pip |

`python3` is available but `pip` is not (`No module named pip`) and `numpy`/`Pillow` are absent
(`software_depth.py` also needs numpy). `torch` is absent (`probeNvidia()` → `available:false`,
no CUDA). This matches `operators.json` `dependencies` (e.g. `"torch:2.3"`).

### 5.2 Stub providers — the MAXIMUM DENNIS floor

In `tools/benchmark-providers.mjs`, `createStandardBenchmark()` registers 8 stubs
(`depth-accurate`, `depth-fast`, `geo-full`, `geo-fast`, `cleanup-strict`, `cleanup-loose`,
`completion-full`, `completion-minimal`). They are deterministic, ML-free, and reproduce the
4-stage tournament + stack locally.

### 5.3 Provider contract

`BenchmarkProvider`: `async provide(input, ctx) -> { ok, output, metrics, error }`, plus
`name`, `stage`, `params`, `signature()`, `dispose()`. Real providers are wrapped by
`WrappedProvider` (measures runtime, estimates memory, normalizes metrics).

---

## 6. Environment Snapshot

| Resource | Present? | Evidence |
|---|---|---|
| Linux (container) | ✅ | `/etc/os-release` |
| node | ✅ | `node --version` (v22) |
| python3 | ✅ | `python3 --version`; `pip` module ❌ |
| numpy / Pillow / torch | ❌ | `No module named numpy/torch`; no pip |
| GPU / CUDA | ❌ | `probeNvidia()` → `available:false` |
| OpenGL | ✅ (software) | `--use-gl=swiftshader --enable-unsafe-swiftshader` (installs this pass) |
| headless Chromium | ✅ | `npx playwright install chromium` (installs this pass) |
| Chromium OS libs | ✅ | `npx playwright install-deps chromium` (installs this pass) |
| `npm ci` deps (ajv, typescript, playwright) | ✅ after `npm ci` | not committed (per `.gitignore`) |
| `node_modules/` persisted | ❌ across restore | `npm ci` must be re-run per-session |

---

## 7. Benchmark Pipeline Contract

Concrete, reproducible pipeline exercised by `tools/benchmark-local.mjs`:

```
for each scene in expected-classes.json (5 cases)
  for each stage in STAGE_ORDER (DEPTH, GEOMETRY, CLEANUP, COMPLETION)
    for each registered provider in stage
      run: provider.provide(input) → BenchmarkRun(metrics: runtime_ms, memory_mb, quality)
      Tournament.runStage: composite score = avgQuality - avgRuntimeMs/1000 - avgMemoryMb/100
      Tournament.eliminateBottom(0.5): drop bottom half per stage
Tournament.runStack(cases, winners): chain stage winners Depth→Geometry→Cleanup→Completion
  → stageOutputs[stage] per case (proves data flow through the full pipeline)
ReconstructionBenchmark.report(): per-stage total/ok/failed/avgRuntimeMs/avgMemoryMb/avgQuality
→ artifacts/by-sha256/<sha256>/  (content-addressed output copy)
→ result.json + result.sha256
```

Exit codes: `0` = pass (DENICS holds), `1` = metric/threshold fail, `2` = execution error,
`3` = class regression (same as `tools/run-experiment.js`:0=pass,1=metric,2=execution,3=class-regression).

**This floor does NOT touch** `index.html`'s shader. It exercises only the spatial-kernel
benchmarks (`benchmark-providers.mjs`). Shader-level reproduction still requires the Chromium
runs in `tools/verify-*.js` (swiftshader), documented in CURRENT_STATE_AUDIT.md §3.3/§3.6.

---

## 8. Reproducibility Checklist (MAXIMUM DENNIS)

- [x] `npm ci`
- [x] `npx playwright install chromium`
- [x] `npx playwright install-deps chromium`
- [x] `node tools/test-benchmark-provider.mjs` → 63 assert pass (proves the benchmark API)
- [x] `node tools/benchmark-local.mjs --out artifacts/local-<runId> --repeat 3` → **PASS 8/8** (60 runs; stack ok:true at all 4 stages × 5 cases; ranking deterministic ×3; sha256 `601bb13603aa`)
- [x] class-count regression on `dorf-marker` exact, other 4 within tolerance
- [ ] Real providers (DA v3, VGGT, …): **deferred to Modal/L40S** (environment-blocked)

---

## 9. Relationship to MASTER-TASK Phases

| Phase | What happens vs this baseline |
|---|---|
| PHASE A (this pass) | Update audit; verify-script instrumentation; confirm `npm run check`; confirm stub benchmark API. |
| PHASE B | This baseline document + frozen commit `1cb06c4`. |
| PHASE C (this pass) | Run `tools/benchmark-local.mjs` → MAXIMUM DENNIS evidence (this doc §2 + §8). |
| PHASE D (this pass) | Document real-provider baselines as environment-blocked (§5.1) — deferred to Modal/GPU run. |

The local/stub pass above is the **only** pass that can be completed in this sandbox. It proves
the benchmark pipeline is wired, deterministic, and gated. Real-provider numbers are recorded
as "environment-blocked" here and collected downstream on Modal.
