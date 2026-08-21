# Evaluation Specification

> Multi-dimensional funnel: from raw metrics → pass/fail threshold → operator ranking → retention decision.

---

## 1. Evaluation Funnel

```
                        ┌─────────────────────────────────────┐
                        │   RAW METRICS (per experiment)      │
                        │  depth_mse_mm, depth_edge_f1,       │
                        │  render_fps, class_delta,           │
                        │  console_errors, provenance_score   │
                        └─────────────────┬───────────────────┘
                                          │ threshold check
                   ┌──────────────────────┼──────────────────────┐
                   ▼                      ▼                      ▼
            PASS METRICS              FAIL METRICS           ERROR
         (all thresholds met)       (one+ threshold failed)  (crash/timeout)
               │                            │                   │
               │                            │                   │
         ┌─────▼──────┐          ┌───────▼───────┐      ┌────▼────┐
         │RANK &     │          │RANK &       │      │LOG     │
         │COMPARE    │          │COMPARE      │      │ERROR   │
         │(see §3)   │          │(see §3)     │      │&        │
         └─────┬──────┘          └───────┬───────┘      │RETRY   │
               │                         │              │(max 1) │
     ┌─────────▼──────────┐   ┌─────────▼──────────┐    └────┬────┘
     │RETENTION DECISION  │   │RETENTION DECISION  │         │
     │(§4, see matrix)    │   │(§4)                │         │
     └────────────────────┘   └────────────────────┘         │
                                                               │
                                                    ┌─────────▼────────┐
                                                    │FINAL EXIT CODE   │
                                                    │2 (error)         │
                                                    └──────────────────┘
```

### 1.1 Pass Path

An experiment **passes** if and only if:
1. Exit code = 0
2. **All** metric thresholds met (§2)
3. Class count regression within ±10% of `expected-classes.json` (GOLD_FREEZE §6)
4. No new console/WebGL errors introduced vs GOLD baseline

### 1.2 Fail Path

An experiment **fails on metrics** if:
- Any metric exceeds its threshold, but the process completes (exit code = 1)

### 1.2 Error Path

An experiment **errors** if:
- Process crashes, times out, or fails to produce required outputs (exit code = 2)
- Class count regression exceeds ±10% (exit code = 3)
- New console errors vs GOLD baseline (exit code = 1)

---

## 2. Metric Thresholds

Every metric has a pass/fail threshold defined in the `ExperimentCard.metrics` array.

| Metric | Unit | Direction | Default threshold | Notes |
|---|---|---|---|---|
| `depth_mse_mm` | millimeters | ≤ (lower is better) | 25.0 mm | Metric depth error vs reference |
| `depth_edge_f1` | 0–1 | ≥ (higher is better) | 0.70 | Boundary F1 score on depth edges |
| `depth_completeness_pct` | 0–100 | ≥ | 95.0 | % of pixels with valid depth |
| `render_fps` | FPS | ≥ | 30 | WebGL frame rate at canonical view |
| `class_count_delta` | count | ±10% (min 40 abs) | — | vs `expected-classes.json` |
| `console_errors` | count | = 0 | 0 | WebGL/GL errors, new vs GOLD |
| `console_warnings` | count | ≤5 | 5 | Must not be new categories vs GOLD |
| `provenance_score` | 0–1 | = 1.0 | 1.0 | All artifacts tracked |
| `artifact_hash_match` | bool | true | true | Output hashes match re-run |
| `intrinsic_identity_render` | bool | true | true | `setStrength(0)` renders like GOLD |
| `intrinsic_effect_render` | bool | true | true | Non-zero strength changes render |
| `actor_depth_sort_correct` | bool | true | true | Front actors occlude mid/back |
| `actor_alpha_atmosphere` | bool | true | true | Fog/dayNight darken actors |
| `bundle_size_mb` | MB | ≤ | 5.0 | For mobile/web targets |
| `startup_time_ms` | ms | ≤ | 2000 | Time to first ready frame |

**Threshold derivation:** Defaults from GOLD freeze measurements + 20% margin.
Any threshold change must be documented in `result.json` with justification.

---

## 3. Multi-Operator Ranking

When multiple operators solve the same problem (e.g., DA-V2 vs V3), ranking criteria:

| Rank | Criterion | Weight | Method |
|---|---|---|---|
| 1 | **Metric score** (normalized) | 40% | Sum of (metric / threshold) for pass-side, inverted for fail-side |
| 2 | **Cost** (runtime + memory) | 25% | `wallTimeMs` + `maxMemoryMb`, normalized against GOLD baseline |
| 3 | **Class regression** | 20% | % deviation from `expected-classes.json` |
| 4 | **License compatibility** | 10% | MIT/BSD ≥ Apache ≥ GPL/research-only ≥ proprietary |
| 5 | **Implementation type** | 5% | External provider > existing impl > new impl > research concept (no code) |

**Ranking formula:**

```
rankScore = 0.4 * metricNorm + 0.25 * costNorm + 0.2 * classNorm + 0.1 * licenseNorm + 0.05 * implNorm

Where each component is normalized to 0–1 (1 = best).
```

### 3.1 Example: DA-V2 vs V3

| Field | DA-V2 | V3 |
|---|---|---|
| `depth_mse_mm` | 22.1 | 18.3 |
| `depth_edge_f1` | 0.68 | 0.74 |
| `wallTimeMs` | 2100 | 2800 |
| `maxMemoryMb` | 450 | 512 |
| License | MIT | Apache-2.0 |
| Impl type | external provider | external provider |
| **rankScore** | 0.81 | 0.89 |

→ V3 ranks higher; DA-V2 kept as **backup**.

---

## 4. Retention Decision

| Matrix disposition | Evaluation threshold | Retention action |
|---|---|---|
| `keep_default` | All metrics pass | Retain permanently as default |
| `keep_conditional` | Metrics pass, cost acceptable | Retain as optional; OFF by default |
| `off_by_default` | Teacher metrics pass | Retain for analysis only; never default |
| `research_only` | May pass or fail | Retain artifacts for reference; do not integrate |
| `teacher_only` | Output matches reference | Retain as teacher; never delivery path |
| `replace` | Replaces existing operator completely | Replace baseline only if ≥15% improvement |
| `redundant` | Metrics worse than substitute | Remove from future experiments |
| `substitutable` | Equivalent metrics | Keep both; choose by cost |
| `negative_contribution` | Worse metrics + higher cost | Remove and document |
| `remove` | Consistently fails | Remove from matrix |

### 4.1 Retention Classes (content addressing)

| Class | TTL | Storage | Description |
|---|---|---|---|
| `GOLD` | permanent | `artifacts/gold/` | Frozen baseline; never expires |
| `PASS` | 90 days | `artifacts/pass/` | Passing research operators |
| `FAIL` | 30 days | `artifacts/fail/` | Failed experiments; cleanup after 30d |
| `ERROR` | 14 days | `artifacts/error/` | Crashes/timeouts; cleanup after 14d |
| `TEACHER` | 180 days | `artifacts/teacher/` | Teacher model outputs for training |
| `REFERENCE` | permanent | `artifacts/reference/` | Published benchmarks, paper outputs |

See `RETENTION_AND_ARTIFACT_SPEC.md` for full artifact lifecycle.

---

## 5. Class Count Regression Check

Every experiment that modifies rendering must verify class counts against
`tools/expected-classes.json` (GOLD_FREEZE.md §6) using `tools/verify.js`'s
regression harness:

```bash
node tools/verify.js --class-regression --scene <scene> --operator <operator> --output <result.json>
```

**Regression rules:**
- Pass: all classes within ±10% tolerance (minimum 40 absolute deviation)
- Fail: any class outside tolerance → exit code 3
- Allowed exception: **explicitly intended** class shifts (e.g., new window detector
  finding more windows) must document the shift in `result.json.notes` and receive
  sign-off against visual inspection

---

## 6. Visual Verification Protocol

### 6.1 Screenshot-based metrics

For experiments that modify rendering output, generate screenshots at canonical
probe cameras (§1.7):

```bash
# Example: capture at K1-building view
SHADED_PARAMS='{"dayNight":0,"storm":0,"rain":0.5,"wet":0.3}' \
  node tools/verify.js --scene dorf-marker --camera K1-building --output shot_K1.png
```

### 6.2 Visual similarity metric

Compare rendered output against GOLD:

| Metric | Tool | Threshold |
|---|---|---|
| `ssim` | `tools/ssim-compare.js` | ≥ 0.95 (structural similarity) |
| `psnr` | `tools/psnr-compare.js` | ≥ 35 dB |
| `pixel_diff_pct` | `tools/pixel-diff.js` | ≤ 2% |

---

## 7. Operator Ranking Report

After all experiments in a batch run, generate `artifacts/<runId>/ranking.csv`:

```csv
operator,metric_score,cost_score,class_score,license_score,impl_score,rank_score,disposition
DepthAnythingV3,0.92,0.73,1.0,0.9,1.0,0.89,keep_default
DepthAnythingV2,0.81,0.85,1.0,1.0,1.0,0.81,keep_conditional
NeRF,0.95,0.30,1.0,0.8,0.6,0.62,research_only
```

The top-ranked `keep_default` operator becomes the new default (requires GOLD
freeze update). Others are retained per their disposition.

---

## 8. Non-Goals

- Operators do not get ranked if they fail basic integration tests
- No subjective "visual appeal" metric — only objective, reproducible metrics
- No operator may change the shader directly; all evaluation is via input/output metrics
- Teacher operators are compared against reference, not ranked for delivery
