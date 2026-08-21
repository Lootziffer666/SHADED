# Hall Texture Pipeline (HALL_TEXTURE_PIPELINE.md)

**Generated:** 2026-08-20  
**Target:** BEUTELTIER (consumer of SHADED) — Koelnmesse hall reconstruction

---

## Philosophy

> Real photographed material → rectify → normalize → remove baked illumination → build reusable texture source → stylize → use repeatedly

**Never:** Generate generic procedural replacements when real source exists.

---

## Source Material Strategy

### Real Texture Sources (Priority Order)

1. **On-site photography** — Koelnmesse halls, controlled lighting
2. **Public archives** — NRW Geobasis orthophotos, building documentation
3. **Reference libraries** — CC0 texture libraries (ambientCG, Poly Haven) for gaps only

### Material Families (Initial Hall Set)

| Family | Variants | Source Type | Notes |
|--------|----------|-------------|-------|
| White Concrete | Smooth, broom finish, formwork | On-site | Dominant hall material |
| Grey Concrete | Smooth, exposed aggregate | On-site | Structural elements |
| White Tiles | 30×30, 60×60, rectangular | On-site | Wall cladding |
| Grey Tiles | 30×30, 60×60 | On-site | Floor/wall |
| Dark Industrial Floor | Heavy wear, scratches, stains | On-site | Main floor — **critical** |
| Wood | Oak, beech, pine | Reference | Doors, benches, trim |
| Brown Rough Plaster | Textured, stained | On-site | Older sections |
| Metal v1 | Brushed stainless | Reference | Railings, frames |
| Metal v2 | Powder-coated (RAL colors) | Reference | Doors, signage frames |
| Metal v3 | Galvanized / corroded | On-site | Structural, outdoor |
| Glass | Clear, tinted, reflective | On-site | Partitions, doors |
| Foliage | Indoor plants | Reference | Planters, green walls |

---

## Processing Pipeline

### Stage 1: Rectification (Perspective Correction)
```
Input: Raw photo (perspective distorted)
        ↓
Camera pose estimation (from COLMAP/SHADED)
        ↓
Homography → orthographic projection
        ↓
Output: Rectified patch (metric scale, e.g., 1px = 1mm)
```

### Stage 2: Illumination Normalization
```
Input: Rectified patch (baked lighting)
        ↓
Intrinsic decomposition (SHADED Dykstra baseline)
        ↓
Base color (albedo) + Shading map
        ↓
Output: Normalized albedo (neutral lighting) + Shading reference
```

### Stage 3: Baked Light Removal
```
Input: Normalized albedo (may have residual shadows/highlights)
        ↓
Shadow detection (frequency analysis + semantic)
        ↓
Highlight/specular removal (threshold + inpainting)
        ↓
Output: Clean base color (pure material reflectance)
```

### Stage 4: Stationarization (Tileable Texture)
```
Input: Clean base color patch (may have visible edges)
        ↓
TextureStationarizer:
  - Edge blending (frequency domain)
  - Color harmonization (Lab space)
  - Periodicity enforcement (FFT-based)
        ↓
Output: Tileable texture (256×256, 512×512, 1024×1024 mip levels)
```

### Stage 5: Palette Normalization
```
Input: Stationarized textures (multiple patches per family)
        ↓
Visibility-aware clustering (Lab/OKLab)
        ↓
Canonical palette extraction (per family: 3-5 base colors)
        ↓
Palette constraint application (quantize to palette + residuals)
        ↓
Output: Palette-normalized textures + residual maps
```

### Stage 6: Multi-View Fusion (When Multiple Patches)
```
Input: Multiple stationarized patches of same surface
        ↓
MultiViewTextureFuser:
  - Exposure/white balance alignment
  - Shadow/lighting disagreement resolution
  - Seamless blending (gradient domain)
        ↓
Output: Single fused texture per surface type
```

### Stage 6b: Emissive Separation
```
Input: Stationarized texture (may contain LEDs, screens, signage)
        ↓
EmissiveSeparator:
  - High-luminance detection (threshold in linear space)
  - Color purity check (narrow spectrum = emissive)
  - Spatial coherence (connected components)
        ↓
Output: baseColor + emissiveMask + emissiveColor
```

### Stage 7: Stylization Layer
```
Input: Palette-normalized base texture
        ↓
Stylization (Borderlands-like):
  - Controlled posterization (per-palette)
  - Edge enhancement (selective, not full-screen)
  - Hatching (curvature-guided, not screen-space)
  - Material contrast boost (roughness/metal differentiation)
        ↓
Output: Stylized baseColor + lineworkMask + hatchingMap
```

### Stage 8: PBR Hint Generation
```
Input: Stationarized texture + material family
        ↓
PBRHintGenerator (heuristic):
  - Roughness: surface frequency → roughness map
  - Metalness: material family (metal=1, dielectric=0)
  - Normal: frequency detail → normal map (optional)
        ↓
Output: roughnessHint, metalnessHint, normalHint (low-res, stylized)
```

---

## Output Assets (Per Material Family)

```
materials/
├── white_concrete/
│   ├── baseColor_1k.png          # Palette-normalized, stationarized
│   ├── baseColor_512.png         # Mip levels
│   ├── baseColor_256.png
│   ├── roughnessHint_512.png     # Grayscale
│   ├── metalnessHint_512.png     # Grayscale (0)
│   ├── normalHint_512.png        # Optional
│   ├── emissiveMask_512.png      # If applicable
│   ├── lineworkMask_512.png      # Stylization lines
│   ├── hatchingMap_512.png       # Hatching density
│   ├── palette.json              # { baseColors: [...], residuals: [...] }
│   └── metadata.json             # Source photos, processing params, hashes
├── dark_industrial_floor/
│   ├── ... (same structure)
│   └── wearMap_512.png           # Real wear pattern (from photos)
└── ...
```

---

## Metadata Schema (metadata.json)

```json
{
  "family": "dark_industrial_floor",
  "variants": ["heavy_wear", "medium_wear", "clean"],
  "sourcePhotos": [
    { "path": "photos/floor_001.jpg", "camera": "Sony A7R IV", "settings": "f/8, 1/125s, ISO 100", "pose": {...} },
    { "path": "photos/floor_002.jpg", "camera": "...", ... }
  ],
  "processing": {
    "rectification": { "method": "COLMAP_pose", "accuracy": "sub-pixel" },
    "intrinsic": { "method": "Dykstra_baseline", "strength": 1.0 },
    "stationarization": { "method": "TextureStationarizer_v1", "patchSize": 512, "overlap": 64 },
    "palette": { "method": "OKLab_kmeans", "numColors": 4 },
    "stylization": { "method": "Borderlands_v1", "posterizationLevels": 8, "lineThreshold": 0.3 }
  },
  "outputHashes": {
    "baseColor_1k": "sha256:abc123...",
    "roughnessHint": "sha256:def456..."
  },
  "palette": {
    "space": "OKLab",
    "baseColors": [[0.45, 0.02, 0.01], [0.38, 0.01, 0.00], ...],
    "coverage": [0.42, 0.31, 0.18, 0.09]
  },
  "provenance": "REAL_PHOTO"
}
```

---

## Integration with SHADED

### SHADED Operators Used

| Operator | Role |
|----------|------|
| `DepthProvider.DA3` | Camera poses for rectification |
| `IntrinsicDecomposer` | Baked light separation (Dykstra baseline) |
| `TextureStationarizer` | Tileable texture generation |
| `PaletteNormalizer` | Canonical palette extraction |
| `MultiViewTextureFuser` | Multi-patch fusion |
| `EmissiveSeparator` | LED/screen extraction |
| `StylizedRenderer` | Borderlands-like output |

### Data Flow

```
Raw Photos (on-site)
    ↓
COLMAP SfM → Camera poses
    ↓
SHADED DepthProvider (DA3) → Dense depth (validation)
    ↓
Rectification (homography from poses)
    ↓
SHADED IntrinsicDecomposer → Albedo + Shading
    ↓
TextureStationarizer → Tileable patches
    ↓
PaletteNormalizer → Canonical palette + normalized textures
    ↓
MultiViewTextureFuser → Fused textures (if multi-patch)
    ↓
EmissiveSeparator → baseColor + emissiveMask
    ↓
StylizedRenderer → Styled output + linework + hatching
    ↓
PBRHintGenerator → roughness/metalness/normal hints
    ↓
Material Assets → BEUTELTIER runtime
```

---

## Quality Control

### Automated Checks

| Check | Threshold | Action |
|-------|-----------|--------|
| Tileable seam visibility | SSIM(edge, edge+1) > 0.95 | Reject / re-stationarize |
| Palette coverage | Σcoverage > 0.90 | Add base color |
| Illumination residual | Mean shading deviation < 0.05 | Re-run intrinsic |
| Emissive purity | Emissive color saturation > 0.8 | Verify |
| Stylization artifacts | Line stability (temporal) > 0.9 | Adjust params |

### Perceptual Validation

- **Repetition threshold test:** Render 20m wall with texture, measure detection distance
- **Cross-view consistency:** Render same surface from 5 angles, measure material histogram correlation
- **Relighting test:** Apply 3 lighting conditions, verify no double-baked lighting

---

## Storage & Versioning

### Content-Addressed Cache
- All intermediate outputs stored by SHA256 hash
- Stationarized patches deduplicated across families
- Palette normalizations shared

### Versioning
```
materials/v1/white_concrete/     # Current
materials/v2/white_concrete/     # New palette, re-processed
```
- Semantic versioning for material families
- Git LFS for final assets
- SHA256 hashes in metadata for verification

---

## Koelnmesse Specifics

### Hall 1-4 (Priority)
- Dark industrial floor (heavy wear) — **most visible surface**
- White/grey concrete walls
- White/grey tile bands
- Metal railings (brushed + powder-coated)

### Hall 5-8 (Secondary)
- Similar palette, different wear patterns
- More glass partitions

### Outdoor / Connecting Areas
- Galvanized metal
- Concrete paving
- Glass facades

---

## Integration with Experiment System

### Experiment Config
```json
{
  "runId": "RUN-20260820-...",
  "goal": "SHOWCASE",
  "operators": [
    { "id": "TextureStationarizer", "enabled": true, "params": { "patchSize": 512 } },
    { "id": "PaletteNormalizer", "enabled": true, "params": { "numColors": 4 } },
    { "id": "MultiViewTextureFuser", "enabled": true }
  ],
  "scene": { "id": "koelnmesse_floor_textures", "type": "multi_rgb" }
}
```

### Evaluation Metrics
- `visual.texture_consistency` — Cross-view material histogram correlation
- `visual.repetition_threshold` — Distance where repetition detected
- `visual.relighting_quality` — No double-baked lighting under 3 light conditions
- `performance.storage` — Final asset size per family

---

## Future Extensions

1. **Procedural wear synthesis** — Extend real wear maps procedurally
2. **Seasonal variation** — Wet/dry/aged variants from same base
3. **Damage decals** — Bullet holes, scratches as overlay system
4. **Dynamic emissive** — Time-of-day signage animation
