# SWIFT Motion Research

> Analysis of SWIFT (`lootziffer666/swift`) motion generation pipeline and
> integration points with SHADED's Actor system.

---

## 1. Current State

SHADED consumes SWIFT via two channels:

### 1.1 Actor System (active, v1.4.0+)

`index.html:3261-3560` implements:
- `addActor({image, manifest, x, y, scale, anim, depthImage, emissiveImage, depthLayer})`
- `drawActors()` — renders on `#ov` overlay canvas, sorted by depth layer
- `setAnim(name)` / `setPosition(x,y)` / `setVisible(v)` / `setDepthLayer(layer)` / `remove()`
- Fog/dayNight alpha coupling: `alpha = baseAlpha * (1 - fog * 0.5) * (1 - dayNight * 0.3)`
- Depth parallax (Phase B2): brightness modulation via `actorDepthBrightness()`
  - Helle Depth = +30%, Dunkel = −15%
  - avgDepth cached per frame-ID (`actor._depthAvg`)

**Manifest schema** (CLAUDE.md §Invariante 5, v1.4+):
- `sourceImage`, `frameRects`/`grid`, `frames`, `animations`
- `depthImage`, `depthFrameRects` (optional, Phase B2)
- `emissiveImage`, `emissiveSourceImage`, `emissiveFrameRects` (optional, v1.5)
- `worldStates` (optional, v1.5)

### 1.2 Dialogue System (partial integration)

`index.html:2520-2560` has showcase system; dialogue engine at
`index.html:4250-4320` references `content/prolog-act1.js`.

**Not integrated:** Motion generation pipeline from SWIFT.

---

## 2. SWIFT Motion Pipeline (from research matrix)

The EG_DONOR_MATRIX §H identifies these SWIFT motion components:

| Component | Function | Integration status |
|---|---|---|
| `BodyParser` | Extract joint positions per frame | Research concept (stubbed) |
| `PositionToRotation` | Joint positions → 3D rotations (IK-GAT) | Research concept |
| `ContactDetector` | Foot contact detection (ContactVision) | Research concept |
| `MotionSmoother` | EMA / Savitzky-Golay smoothing | Research concept |
| `PartwisePlanner` | Semi-independent limb planning (PartwiseMPC) | Research concept |
| `MotionInterpolator` | Motion in-betweening (ReConForM) | Research concept |

### 2.1 Current SWIFT Export

SWIFT's `python main.py render ... --format sprite_sheet` produces:
- Sprite sheet (PNG): animated character in pixel art
- Manifest (JSON): frame rects, animations, optional depth map
- Depth map (8-bit grayscale PNG): z-buffer for spatial ordering

**No motion data is currently exported** — only static sprite sheets + manifests.

---

## 3. Proposed Motion Pipeline

### 3.1 Input: Motion Capture Data

SWIFT should export joint trajectories alongside sprite sheets:

```jsonc
// manifest with motion data extension
{
  "mappingVersion": "1.4.0",
  "sourceImage": { "w": 256, "h": 64 },
  "frameRects": { "F01": {"x": 0, "y": 0, "w": 64, "h": 64}, ... },
  "frames": [{ "id": "F01", "key": "walk_01" }, ...],
  "animations": {
    "walk": { "frames": ["F01", "F02", ...], "fps": 12, "loop": true }
  },
  "motion": {                         // NEW: optional motion data
    "format": "joint_trajectory_v1",
    "joints": ["root", "l_foot", "r_foot", "l_hand", "r_hand", ...],
    "frames": [
      {
        "frameId": "F01",
        "t": 0.0,
        "positions": [[x,y,z], ...],     // per-joint 3D position
        "rotations": [[qx,qy,qz,qw], ...], // per-joint quaternion
        "contacts": { "l_foot": true, "r_foot": false }
      },
      ...
    ]
  }
}
```

### 3.2 SHADED Consumers of Motion Data

The motion data feeds three channels in SHADED:

#### 3.2.1 Actor Animation (`addActor`)

Extended actor handle to accept motion data:

```js
const actor = window.SHADED.addActor({
  image: spriteSheetUrl,
  manifest: manifestWithMotion,
  x: 100, y: 200, scale: 1.0,
  anim: 'walk',
  motion: manifest.motion         // optional
});

// Motion-aware animation
actor.setMotionState({ walkSpeed: 0.8, direction: 45 });
```

**Benefit:** Characters move with physically plausible foot plant / lift cycles,
even if the sprite sheet has limited frames.

#### 3.2.2 Spatial Kernel (`SpatialKernel.ingest`)

Motion data becomes `GeometryObservation` with `sourceType: "motion_capture"`:

```js
kernel.ingest({
  sourceType: SOURCE_TYPE.MOTION_CAPTURE,
  provenance: OBS_PROVENANCE.DIRECT_EVIDENCE,
  payload: {
    trajectory: motion.frames,
    joints: motion.joints,
    contacts: motion.contacts
  }
});
```

**Benefit:** Spatial kernel can reason about character movement paths,
footprint placement, and interaction zones.

#### 3.2.3 World Simulation (`surface-world-simulation.mjs`)

Motion data drives world-law simulation:

```
MotionSmoother(positions) → smooth trajectory
ContactDetector(contacts) → footprint placement (Footprints law, #2)
PositionToRotation(positions) → character orientation
PartwisePlanner(joints) → limb IK targets
MotionInterpolator(frames) → in-between frames for smooth playback
```

**Benefit:** Physical world reactions (footsteps, displaced grass, water ripples).

---

## 4. Operator Integration Table

| Operator | Input | Output | Consumes | Produces |
|---|---|---|---|---|
| `BodyParser` | SWIFT sprite sheet + manifest | Joint positions per frame | `addActor.image, manifest` | `motion.positions` |
| `PositionToRotation` | Joint positions | Joint rotations (quaternions) | `motion.positions` | `motion.rotations` |
| `ContactDetector` | Joint positions + ground plane | Foot contact flags | `motion.positions` | `motion.contacts` |
| `MotionSmoother` | Raw joint trajectory | Smoothed trajectory | `motion.positions` (noisy) | `motion.positions` (smooth) |
| `PartwisePlanner` | Body parts + goals | Per-limb paths | `motion.rotations` | `motion.limbPaths` |
| `MotionInterpolator` | Keyframe joints | In-between joints | `motion.keyframes` | `motion.frames` (dense) |

### 4.1 Dependency Chain

```
addActor {image, manifest}
  │
  ▼
BodyParser (extract joints from sprite sheet keypoints)
  │
  ▼
MotionSmoother (EMA / Savitzky-Golay)
  │
  ▼
PositionToRotation (IK-GAT: positions → quaternions)
  │
  ▼
ContactDetector (ground contact inference)
  │
  ▼
PartwisePlanner (per-limb planning, optional)
  │
  ▼
MotionInterpolator (dense frame generation)
  │
  ▼
motion: { joints, frames, positions, rotations, contacts, limbPaths }
```

### 4.2 Integration Points

| SHADED component | Receives motion data via |
|---|---|
| `index.html` Actor system | `addActor({manifest.motion})` → `drawActors()` uses interpolated frames |
| Spatial kernel | `GeometryObservation {sourceType: MOTION_CAPTURE, payload: {trajectory}}` |
| World simulation | `surface-world-simulation.mjs` world-law solver (Footprints #2) |
| Player system | `window.SHADED.player.move()` can reference motion templates |

---

## 5. Research Questions for Motion Operators

### 5.1 BodyParser

**Problem:** Given a pixel-art sprite sheet, recover 2D joint positions per frame.

**Approach A (vision):** Pose estimation model trained on pixel-art characters
(trained on SWIFT-generated sprites — bootstrap problem).

**Approach B (synthetic):** SWIFT generates joint positions alongside sprites
(author knows the rig; no ML needed).

**Recommendation:** B — SWIFT should export joint trajectories at generation time.
No vision model needed; avoids bootstrap.

### 5.2 PositionToRotation (IK-GAT)

**Problem:** Convert 2D/3D joint positions to rotations for smooth interpolation.

**Graph Attention Network** that:
1. Takes joint positions as nodes
2. Learns kinematic chains (limb edges)
3. Outputs quaternion rotations

**Integration:** Post-processing step. SHADED consumes quaternions directly.

### 5.3 ContactDetector (ContactVision)

**Problem:** Detect foot-ground contact for footprint placement.

**Approach:**
- Heuristic: foot position y < threshold + foot size
- Vision: train ContactVision on SWIFT sprites with known contact states
- Fallback: infer from animation frame metadata

**Recommendation:** Heuristic fallback (foot y-position < floor_y + 2px), with
SWIFT-embedded contact flags as ground truth.

---

## 6. Experiment Plan

### 6.1 Experiment exp-030: BodyParser joint recovery

```
Inputs: 50 SWIFT sprite sheets with embedded joint data (ground truth)
Metrics:
  - joint_position_error_px (≤ 3 px)
  - contact_detection_f1 (≥ 0.90)
  - animation_smoothness (inter-frame position delta continuity)
```

### 6.2 Experiment exp-031: MotionSmoother jitter reduction

```
Inputs: Noisy joint trajectories (Gaussian noise σ=5px added to ground truth)
Metrics:
  - jitter_reduction (smooth vs raw position delta)
  - phase_preservation (no lag in walk cycle period)
  - render_fps_impact (≤ -5%)
```

### 6.3 Experiment exp-032: PositionToRotation quaternion accuracy

```
Inputs: 5 motion sequences (walk, run, idle, jump, fall) with ground truth quaternions
Metrics:
  - quaternion_angle_error_deg (≤ 15° mean)
  - interpolation_smoothness (no gimbal flip)
  - runtime_ms_per_frame (≤ 0.5ms)
```

### 6.4 Experiment exp-033: ContactDetector footprint placement

```
Inputs: 10 walk sequences on grass/path surfaces
Metrics:
  - footprint_precision (≥ 90% footprints on ground pixels)
  - footprint_recall (≥ 85% contact frames produce footprint)
  - spurious_prints (≤ 2% false positives)
```

---

## 7. Motion Data Flow in SHADED

```
SWIFT (lootziffer666/swift)
  │
  │  python main.py render ... --format sprite_sheet --motion
  │  (produces sprite sheet + manifest.json + _depth.png + motion data)
  │
  ▼
addActor({image, manifest, ..., motion: manifest.motion})
  │
  ▼
SpatialKernel.ingest(GeometryObservation {sourceType: MOTION_CAPTURE})
  │
  ▼
Surface-world-simulation.mjs
  ├── Footprints (#2): contact → footprint stamp
  ├── Wet/Greasiness (#22): footstep material state change
  └── Pressure (#4): weight transfer visualization
  │
  ▼
index.html drawActors() renders with motion-interpolated frames
  │
  ▼
Output: Living character that interacts with the environment physically
```

---

## 8. Non-Goals

- SHADED does NOT retrain SWIFT's sprite generation pipeline
- Motion data is **optional** — actors without motion data fall back to
  frame-based animation (current behavior, GOLD)
- No vision model runs inside SHADED's shader — all motion inference
  happens CPU-side or in SWIFT itself
- Motion data is **not** part of the GOLD baseline — only sprite sheets +
  manifests are canonical (v1.4 contract)
