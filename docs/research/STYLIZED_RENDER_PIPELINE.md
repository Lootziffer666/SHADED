# SHADED Stylized Render Pipeline (STYLIZED_RENDER_PIPELINE.md)

**Generated:** 2026-08-20  
**Target:** BEUTELTIER (consumer of SHADED) + SHADED core render  
**Donor reference:** EG_DONOR_MATRIX #18 (Hatching / Hybrid Stylization)  
**Companion:** `HALL_TEXTURE_PIPELINE.md` Stage 7, `EVALUATION_SPEC.md` (VISUAL / STABILITY dimensions)

---

## 0. Goal

A **Borderlands-like** look = geometry + material + *selective* lines + curvature-guided hatching, **not** a screen-space outline filter. The style must be **stable under camera motion** (STABILITY dimension), **relightable** (no double-baked light — ties to `intrinsic` separation), and **consistent with the canonical palette** (Invariante 3).

This document defines the render passes, the data contract between the material layer and the stylization layer, and the evaluation probes. It does NOT specify a particular implementation language — it is the architectural spec for operator(s) `HybridLineSystem`, `HatchingRenderer`, `StylizedNormalResponse` registered in `OperatorRegistry`.

---

## 1. Render Pass Order

```
1. GEOMETRY PASS        → G-buffer (position, normal, materialId, albedo, shading)
2. LIGHTING PASS        → relit color from intrinsic-separated albedo + world lights
                          (NO baked light — uses u_intrinsic channel, Invariante 6)
3. MATERIAL RESPONSE    → per-material stylization hints (rough/metal/diffuse split)
4. LINE DETECTION       → view-space + world-space edges (selective, curvature-aware)
5. HATCHING PASS         → curvature/occlusion-driven hatch density map
6. POSTERIZATION        → per-palette posterization (controlled banding)
7. COMPOSITE            → color + linework + hatching + emissive (additive)
8. PROBE RENDER         → standardized probe views (EXPERIMENT_ARCHITECTURE L2)
```

Edge stability is measured at **every frame** of the probe sequence (STABILITY), not just on stills.

---

## 2. Data Contract (Material → Stylization)

Stylization consumes the **same** material truth as the rest of SHADED (Invariante 2 — one material truth). No second classifier.

| Input | Source | Notes |
|-------|--------|-------|
| `albedo` | `u_intrinsic` R-channel (shading) → Dykstra baseline | Neutral lighting, palette-normalized |
| `materialId` | `getMaterialTypeAt()` / GPU mask A,B | roof/wood/window/water/rock/grass/foliage/path |
| `normalWorld` | G-buffer | For curvature + line orientation |
| `depth` | Unit 6 | For silhouette edges (hybrid-space) |
| `emissive` | Unit 4 (emissive) | Added additively, **never** posterized/clamped to palette |
| `worldTruthFlag` | provenance (OBSERVED/GENERATED) | GENERATED regions get a subtle provenance hatch |

---

## 3. Line System (HybridLineSystem)

Two complementary edge sources (hybrid-space, donor #18):

1. **View-space silhouette** — depth + normal discontinuity at screen edges (outer contours, material boundaries).
2. **World-space crease** — high curvature on the surface (folds, bevels) that persists under rotation.

**Selective, not full-screen:**
- Edge strength = `f(curvature, depthDiscontinuity, materialContrast)`
- Thin structures (railings, pillars < 5cm) get **boosted** edge weight (geometry donor #5)
- Flat, low-contrast regions (hall floor) get **suppressed** edges → no moiré line noise

**Anti-instability:** line detection runs in a **temporal-consistent** space: edges are matched across frames before draw; flickering sub-pixel edges are filtered (`visual.edge_stability.{probe}` target > 0.9, see HALL_TEXTURE_PIPELINE QC).

---

## 4. Hatching (HatchingRenderer)

Hatching is **surface-locked**, not screen-locked (donor #18 "Hybrid-Space Localized Stylization"):

- Hatch direction derived from `tangentFrame` of the surface (projected to screen).
- Hatch density = monotonic function of **occlusion + curvature + shaded darkness** (darker → denser), clamped per material.
- Density map is **mip-aware** so it does not shimmer at distance (LOD coupling, donor meshoptimizer).
- Emissive and GENERATED-provenance regions excluded from hatching.

---

## 5. Posterization (Palette-Locked)

- Posterization levels derived from the **canonical palette** per material family (Invariante 3), not a global fixed band count.
- `PaletteNormalizer` output (from HALL_TEXTURE_PIPELINE Stage 5) supplies the quantization centers.
- Residual maps preserved so relight still works (albedo ≠ final color).
- `emissiveColor` is **exempt** — signage/LEDs stay saturated, high-luminance (donor EmissiveSeparator).

---

## 6. Relighting Constraint

Because the style is applied to **intrinsic-separated albedo** (Invariante 6, `window.SHADED.intrinsic`):

- Changing day/night / fog must re-light the stylized surface **without** re-running stylization.
- Posterization bands shift with light, but **palette membership is stable**.
- Verify by `visual.relighting_quality` test (3 light conditions, no double-baked light).

---

## 7. Integration Points

| Component | File | Role |
|-----------|------|------|
| G-buffer / GLSL | `src/render/shader.js` | Add line/hatch/relight uniforms + passes |
| Engine compositor | `src/render/engine.js` | Multi-pass orchestration, probe capture |
| Material truth | `getMaterialTypeAt()` + mask textures | Single source (Invariante 2) |
| Intrinsic | `window.SHADED.intrinsic` | Neutral albedo feed |
| Operators | `src/experiment/core.js` registry | `HybridLineSystem`, `HatchingRenderer`, `StylizedNormalResponse` |
| Evaluation | `src/experiment/evaluation.js` | VISUAL + STABILITY metrics |

---

## 8. Evaluation Probes (must pass before merge)

| Probe | Metrics | Target |
|-------|---------|--------|
| `entry` | `visual.edge_stability`, `visual.material_consistency` | > 0.90 |
| `center` | `visual.appearance` (LPIPS vs ref), `visual.held_out_similarity` | SSIM > 0.85 |
| `corner` | `visual.texture_consistency`, line stability | > 0.88 |
| `elevated` | silhouette quality, no over-line | — |
| `close_wall` | hatch density stability under dolly | no shimmer |
| `portal` | emissive exempt from posterization | signage saturation > 0.8 |

Regression thresholds from `EVALUATION_SPEC.md`: VISUAL −0.04, STABILITY −0.04.

---

## 9. Open Questions

1. Should hatching density be **per-goal** tuned (SHOWCASE vs EDIT)? Likely yes via `GOAL_WEIGHTS`.
2. Does hybrid-space hatching need a separate normal-map hint from `PBRHintGenerator` (HALL_TEXTURE_PIPELINE Stage 8)? Prototype both.
3. Line width in CSS px vs world units — must be world units to stay stable under zoom.

---

## 10. Status

| Item | Status |
|------|--------|
| Spec | ✅ this doc |
| Operators registered | 📋 pending |
| GLSL passes | 📋 pending (depends on material layer stabilization) |
| Probe harness | ✅ (EXPERIMENT_ARCHITECTURE L2) |
