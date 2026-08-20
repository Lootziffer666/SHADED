# Hall Texture Pipeline

> How textured, tileable surfaces are generated from photographs for the
> structural / hall elements of the SHADED reconstruction.

---

## 1. Current State

`runtime/hall-plan/` contains 7 ES modules (hall-plan-core.mjs, hall-extruder.mjs,
hall-plan-workflow.mjs, hall-plan-adapter.mjs, hall-spatial-bridge.mjs,
plan-analyzer.mjs, plan-calibrator.mjs) that implement:
- Rich structural plan model (rooms, volumes, levels, connections)
- Plan extrusion to 3D
- Workflow orchestration
- Adapter to spatial kernel

**No texture generation is currently implemented.** HallPlan is purely geometric.

Texture handling today is limited to:
- `index.html` `applyCompanionTexture()` loads `_depth.png`, `_shading.png` companions
- `editor/markerPainter.js` uses fixed `CANONICAL_PALETTE` colors for marker painting
- `editor/actorPlacer.js` handles SWIFT sprite sheets as overlay actors

---

## 2. Pipeline Overview

```
Input: Multi-photo hall capture
  │
  ▼
Phase A: Alignment & Registration (TextureStationarizer)
  ├── Align photos via COLMAP SfM
  ├── Register to structural plan (HallPlanner)
  └── Build per-wall photo adjacency
  │
  ▼
Phase B: Material Segmentation (MaterialExtraction)
  ├── Segment surfaces via PALETTE
  ├── Extract material regions (wall/floor/ceiling)
  ├── Generate per-region texture candidates
  └── Score candidates (coverage, seam, noise)
  │
  ▼
Phase C: Tiling & Seaming (SeamlessMultiTexturing)
  ├── Tileable texture generation per material
  ├── Seam blending across photos (Poisson)
  ├── Semantic UV mapping (SemanticUVMapper)
  └── Per-wall UV assignment
  │
  ▼
Phase D: Canonicalization (PaletteNormalizer)
  ├── Normalize colors to canonical palette
  ├── Detect and flag non-canonical colors
  ├── Apply marker overlay convention
  └── Output tileable texture set
  │
  ▼
Output: hall_textures/
  ├── wall_01_albedo.png (tileable)
  ├── wall_01_normal.png   (optional)
  ├── floor_01_albedo.png
  ├── ceiling_01_albedo.png
  └── materials.json       (material ↔ texture mapping)
```

---

## 3. Operators

| Operator | Role | Donor | Status | Priority |
|---|---|---|---|---|
| `TextureStationarizer` | Extract tileable texture from single photo | BEUTELTIER texture stationarization | Research concept | P0 |
| `MultiViewTextureFuser` | Seam-free blend of multiple photos | BEUTELTIER seamless multi-texturing | Research concept | P0 |
| `SemanticUVMapper` | Wall/floor/ceiling-specific UV strategy | BEUTELTIER semantic UV mapping | Research concept | P1 |
| `PaletteNormalizer` | Canonical material palette across views | SHADED posterization | Upgrade PALETTE | P0 |
| `MaterialExtraction` | Material segmentation per surface | IntrinsicNet/De-Lighter | Teacher only | P1 |
| `StructureFromMotion` | Camera alignment for registration | COLMAP | Pipeline integration | P2 |

---

## 4. TextureStationarizer

**Problem:** A single hall photo produces a non-tileable texture with visible seams
when repeated.

**Current approach:** `editor/markerPainter.js` uses fixed `CANONICAL_PALETTE` colors —
no automatic tiling.

**Operator:** `TextureStationarizer` (from BEUTELTIER texture stationarization)

### 4.1 Algorithm

1. **Input:** Single rectified wall/floor/ceiling photo + detected surface normal
2. **Edge analysis:** Find dominant edges; classify as "structural" (corners, frames)
   vs "textural" (surface pattern)
3. **Seam search:** For each edge direction, find minimal-error seam
   (using PatchMatch / LBP matching)
4. **Blend:** Poisson blend across seam for color continuity
5. **Validate:** Repetition artifact score < 0.15 (measured via SSIM self-similarity)

### 4.2 Integration

- Output stored as `hall_textures/<surface>_<material>_albedo.png`
- Hash-addressed in artifact store (§1, RETENTION_AND_ARTIFACT_SPEC)
- Consumed by `index.html` via companion texture mechanism (same as depth/shading companions)

### 4.3 Experiment

```
exp-010: TextureStationarizer tiling quality
Inputs: 10 wall photos from dorf-marker, dorf-kanon, legacy-map
Metrics:
  - textile_seam_score (≤ 0.15)
  - textile_repetition_psnr (≥ 35 dB)
  - class_consistency_delta (±10% vs GOLD)
```

---

## 5. MultiViewTextureFuser

**Problem:** Different photos of the same wall have varying lighting, color, and
shadowing, producing visible seams.

**Operator:** `MultiViewTextureFuser` (from BEUTELTIER seamless multi-texturing)

### 5.1 Algorithm

1. **Input:** N photos of same surface + COLMAP poses + per-pixel normals
2. **Weight map:** Per-pixel confidence (reprojection error, normal consistency)
3. **Blend coordinates:** Optimize texture coordinates for minimal seam energy
4. **Poisson blending:** Solve for seamless color blending across seams
5. **Color correction:** Per-region histogram matching to canonical palette

### 5.2 Integration

- Consumes output of `TextureStationarizer` (pre-tiled textures)
- Produces final blended texture set
- Can substitute `TextureStationarizer` when multi-view available (disposition: SUBSTITUTABLE)

### 5.3 Experiment

```
exp-011: MultiViewTextureFuser seam quality
Inputs: 5 multi-view captures of same hall wall
Metrics:
  - seam_visible_pct (≤ 2%)
  - color_variance_between_views (normalized ≤ 0.05)
  - textile_repetition_psnr (≥ 40 dB)
```

---

## 6. SemanticUVMapper

**Problem:** Default UV mapping causes texture stretching on complex geometry
(corners, door frames, window frames).

**Operator:** `SemanticUVMapper` (from BEUTELTIER semantic UV mapping)

### 6.1 Strategy

| Surface type | UV strategy | Reasoning |
|---|---|---|
| Wall (flat) | Planar projection (frontal) | Minimal distortion on flat planes |
| Corner | Box projection | Handles 2-3 meeting planes naturally |
| Window frame | Cylindrical around depth axis | Preserves frame proportions |
| Door frame | Planar + seam at hinge line | Matches architectural structure |
| Floor | Planar top-down | No distortion for ground plane |
| Ceiling | Planar top-down | No distortion for overhead plane |

### 6.2 Integration

- Attached to each `SceneGraphNode` via `material.uvStrategy`
- Consumed by SDF mesh pipeline (`optimizeMesh` → `indexMesh` → UV generation)
- Output: `materials.json` maps surface + material to UV strategy + texture path

---

## 7. PaletteNormalizer

**Problem:** Photos taken under varying lighting produce different color renders
of the same canonical material (e.g., grass appears brighter/darker).

**Current:** `index.html` PALETTE has fixed 8 canonical colors (CLAUDE.md §Invariante 3:
`#16A34A` grass, `#AA0EB7` foliage, `#F97316` roof, etc.)

**Operator:** `PaletteNormalizer` (upgrade/replace PALETTE)

### 7.1 Algorithm

1. **Reference clustering:** Cluster all surface pixels into 8 canonical material
   classes using k-means (k=8) with PALETTE seeds
2. **Per-class normalization:** For each class, compute mean/variance in LAB space
3. **Transfer:** Map each pixel's LAB to the canonical LAB centroid for its class
4. **Preserve structure:** Only normalize color, preserve local contrast/texture
5. **Marker merge:** Apply pink Fenster-Marker if present (Invariante 3: markers have
   always priority over heuristic)

### 7.2 Integration

- Runs as the **last** pass before texture output
- Can be toggled: `PaletteNormalizer.enabled = true`
- If disabled, raw blended textures are used (GOLD fallback)

### 7.3 Experiment

```
exp-012: PaletteNormalizer color consistency
Inputs: 5 views of same wall under different lighting
Metrics:
  - color_delta_e_00_mean (≤ 5.0 across views)
  - class_consistency (95% same material class across views)
  - marker_pink_preserved (100% if markers present)
```

---

## 8. Hall Texture Output Schema

```jsonc
// hall_textures/materials.json
{
  "version": "1.0",
  "textures": [
    {
      "id": "wall_plaster_white",
      "surface": "wall",
      "material": "plaster",
      "canonicalPaletteIndex": 6,            // rock (0x475569 mapped to plaster)
      "albedo": {
        "sha256": "a1b2c3...",
        "storagePath": "by-sha256/a1/b2c3...",
        "tileSize": [512, 512],
        "tileable": true
      },
      "normal": {
        "sha256": "d4e5f6...",
        "storagePath": "by-sha256/d4/e5f6...",
        "tileSize": [512, 512]
      },
      "uvStrategy": "planar",
      "confidence": 0.92,
      "sources": [
        "file_00000000974871f49fe71f6b456f9579.png:wall_03",
        "file_00000000974871f49fe71f6b456f9579.png:wall_07"
      ]
    }
  ]
}
```

---

## 9. Integration with Spatial Kernel

The `hall-plan/` system feeds textures into the spatial kernel via:

```js
// SceneGraph node gets material reference
node.material = {
  albedoTexture: "by-sha256/a1/b2c3...",
  uvStrategy: "planar",
  canonicalClass: "rock"   // maps to PALETTE index
};

// SparseField voxels can reference material
voxel.materialId = node.material.albedoTexture;
```

Textures are passed to `index.html`'s rendering pipeline as **companion textures**
(not companion files auto-loaded by `addActor` — those are for actors).

The `editor/facade.js` can expose texture assignment in the UI for manual override.

---

## 10. Fallback

If no photos are available (procedural or legacy modes):
- Use `PALETTE` solid colors as flat-shaded textures
- Use `editor/markerPainter.js` CANONICAL_PALETTE for manual painting
- Hall texture pipeline is **OFF BY DEFAULT** — only activates when photos present

This ensures the texturization pipeline never blocks scene delivery.
