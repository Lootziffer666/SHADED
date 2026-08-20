# SWIFT Motion Research (SWIFT_MOTION_RESEARCH.md)

**Generated:** 2026-08-20  
**Target:** SWIFT (sprite-sheet character generator) → SHADED `addActor`  
**Donor reference:** EG_DONOR_MATRIX #10 (IK-GAT), #11 (Adaptive Smoothing), #12 (Contact Detection), #19 (In-Betweening / Retargeting)  
**Companion:** `EG_DONOR_MATRIX.md` P0 SWIFT section

---

## 0. Problem

SWIFT emits sprite-sheets: **2D raster frames** of characters. SHADED `addActor` renders them as transparent overlay optics (CLAUDE.md invariant 2 — no material/world truth effect). The frames already encode *some* motion, but:

- Frame-to-frame **jitter** from imperfect capture/generation.
- No **foot lock / contact** — characters slide or float.
- No **bone-correct rotation** — limbs bend unnaturally between keyframes.
- No **intent-aware smoothing** — slow hesitant motion over-smoothed, fast deliberate motion blurred.

This research defines the motion operators that lift SWIFT sprites from "animated pictures" to "believable actors", measured by the experiment system.

---

## 1. Operator Set (registered in OperatorRegistry)

### 1.1 `PositionToRotationIK` (donor #10 — IK-GAT)
- **Input:** 3D joint positions per frame (from SWIFT pose estimation / optical flow on sheet).
- **Output:** bone rotations (quaternion per joint) satisfying skeletal constraints.
- **Method:** graph-attention over the bone graph + analytic IK solver (FABRIK / CCD) for terminal chains.
- **Benefit:** `MOTION_QUALITY +0.30`, `CONTACT_CORRECTNESS +0.25`.
- **Cost:** Medium (graph + solver, per frame).
- **License:** Paper + code (MIT) — implement independently, no weights copy.
- **Rescue:** deterministic IK beats learned for simple chains (cheap path).

### 1.2 `AdaptiveMotionSmoother` (donor #11)
- **Input:** per-joint trajectory + confidence + velocity.
- **Output:** smoothed trajectory.
- **Method:** confidence/velocity-gated filter — strong smoothing when low-confidence or slow, preserve when fast & intentional.
- **Benefit:** `MOTION_JITTER −0.40`, intentional motion preserved.
- **Cost:** Low (per-frame 1D filter).
- **Synergy:** `ContactDetector`, `PositionToRotationIK`.

### 1.3 `ContactDetector` (donor #12)
- **Input:** foot/hand joint positions + ground plane (from SHADED `getMaterialTypeAt` / world truth).
- **Output:** contact label per extremity per frame (heel / toe / flat / none).
- **Method:** proximity-to-ground + velocity-zero crossing + support-polygon test.
- **Benefit:** `MOTION_QUALITY +0.25`, `FOOT_LOCK +0.40`.
- **Synergy:** drives contact-aware IK and phase detection.
- **License:** Mixed (MIT, some NC) — implement from description where NC.

### 1.4 `PhaseDetector` (new, enables #19)
- **Input:** contact sequence.
- **Output:** gait phase (stance/swing) + cycle normalization.
- **Benefit:** enables in-betweening + retargeting.

### 1.5 `MotionInbetweener` (donor #19)
- **Input:** sparse keyframes + constraints (contact, target pose).
- **Output:** continuous motion.
- **Benefit:** `MOTION_FLUIDITY +0.25`, `STORAGE −0.50` (store keyframes, synthesize between).
- **License:** Mixed — implement independently.

---

## 2. Hook into SHADED `addActor`

`addActor` currently takes `{image, manifest, x, y, scale, anim, depthImage, depthLayer, emissiveImage, worldStateImages}` (CLAUDE.md v1.3–1.5). Motion research adds **optional** fields without breaking the contract (Invariante 5 — extend only):

```javascript
window.SHADED.addActor({
  image, manifest,
  motion: {
    enabled: true,
    source: 'swift_pose',        // or 'keyframes'
    ik: 'PositionToRotationIK',
    smoothing: 'AdaptiveMotionSmoother',
    contact: 'ContactDetector'
  }
});
```

New handle methods (extend, not rename):
- `setMotionProfile(profile)`
- `getMotionMetrics()` → returns `MOTION_QUALITY` etc. for evaluation.

Actors remain **optics** — motion never writes `classGrid` / world truth.

---

## 3. Evaluation (per experiment run)

New metrics added to `src/experiment/evaluation.js` `METRIC_DEFINITIONS`:

| Metric | Dimension | LowerIsBetter |
|--------|-----------|---------------|
| `motion.jitter` | STABILITY | yes |
| `motion.foot_lock` | FUNCTION | no |
| `motion.contact_precision` | FUNCTION | no |
| `motion.intentional_preserved` | VISUAL | no |
| `motion.fluidity` | VISUAL | no |

Benchmark: render SHADED actor sequence, extract probe frames (EXPERIMENT_ARCHITECTURE L2), measure frame-to-frame joint stability + contact ground-lock.

---

## 4. Experiment Order (from EG_DONOR_MATRIX recommended order)

1. `ContactDetector` (enables everything else, low cost)
2. `AdaptiveMotionSmoother` (low cost, immediate jitter win)
3. `PositionToRotationIK` (quality step)
4. `PhaseDetector` (glue)
5. `MotionInbetweener` (storage + fluency)

Each as SINGLE ABLATION vs BASE (EMA-only baseline) per EXPERIMENT_ARCHITECTURE experiment types.

---

## 5. Constraints / Red Lines

- No NC-licensed code copied (donor #12 partial NC) — implement from description.
- Motion output never feeds material/world truth (Invariant 2).
- SWIFT remains the generator; SHADED consumes via `addActor` (TRIVIUM/SHADED contract unchanged).

---

## 6. Status

| Item | Status |
|------|--------|
| Research spec | ✅ this doc |
| Operators registered | 📋 pending |
| `addActor` motion extension | 📋 pending (contract extend) |
| Metrics in evaluation.js | 📋 pending |
