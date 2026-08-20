# Stylized Rendering Pipeline

> Layered stylized rendering: geometry lines, material shading, and surface
> textures compose the final comic/illustration aesthetic.

---

## 1. Current State

`index.html` implements a **layered shader** with these components:

### 1.1 Geometry Layer (lines/contours)

- `SHADED.lens` system (Runde 8) — inspection lenses that apply screen-space effects
- No dedicated line rendering — contour detection is implicit via shader edge terms
  (see `index.html:1378` for lens state, `index.html:1442` for dykstra constraint)

### 1.2 Material/Shading Layer

- `window.SHADED.intrinsic` (v1.6) — material/lighting separation
  - `setStrength(0)` = identity-albedo (GOLD fallback)
  - Non-zero strength = shading separation
  - Dykstra projection enforces albedo-gamut constraint
- World-law parameters (13 + Phase C derived phases) drive the shading
- `analyze()` produces class masks (Unit 1: maskA, Unit 2: maskB)
- Shading field in Unit 8 R-channel (neutral = 0.5)

### 1.3 Texture/Wall Layer

- Hall textures (see HALL_TEXTURE_PIPELINE.md) — tileable surface textures
- Actor sprites (SWIFT-generated) — animated characters via `addActor()`
- Companion image system (`_depth.png`, `_shading.png`, `_normal.png`)

---

## 2. Stylized Rendering as Layers

The pipeline composes in this order (back to front):

```
Layer 0: Background / Sky (inert, per Image Canon K7)
  │
  ▼
Layer 1: Hall Textures (tileable, PaletteNormalized)
  │
  ▼
Layer 2: Geometry Effects (optional: GS-REP contour lines, hybrid-space warping)
  │
  ▼
Layer 3: Material Shading (intrinsic decomposition, world-law modulated)
  │
  ▼
Layer 4: Surface Details (hatching, stippling, sheen via wet-gain/bloom)
  │
  ▼
Layer 5: Effects (rain splashes, fire glow, footprints, trail stamps)
  │
  ▼
Layer 6: Actors (SWIFT sprites with depth + emissive)
  │
  ▼
Layer 7: Atmosphere (fog, dayNight, bloom, vignette)
  │
  ▼
Layer 8: Post-Processing (lenses, final color grade)
```

Each layer is **optional and toggleable** via operator parameters.
Disabling all layers = GOLD baseline (flat shader terms only).

---

## 3. Borderlands-Style Stylized Shading

**Problem:** The default shader has physically-based terms (diffuse, bloom, sheen).
To achieve a comic-book aesthetic, we need cel-shading + contour lines.

**Operator:** `StylizedSurfaceShader` (from Borderlands-style cel shading)

### 3.1 Algorithm

1. **Quantize lighting:** Instead of smooth ramp, use 3-tone ramp
   (shadow = 0.3, mid = 0.7, highlight = 1.0)
2. **Contour extraction:** Sobel filter on depth + normal buffers
   (threshold tuned to wall/floor boundaries, not texture noise)
3. **Apply line width:** `lineWidth = 1.0 + 0.5 * curvature` (thicker on curves)
4. **Compensate:** Increase brightness by +15% to offset dark lines

### 3.2 Integration

- Implemented as a **shader variant** of the existing fragment shader
- Toggled by `u_stylizedEnabled` uniform (default: 0 / off)
- **Does NOT fork the shader source** — integrated via `#ifdef` or uniform branch
- Consumes outputs of `IntrinsicDecomposer` (teacher) for clean albedo input

### 3.3 Experiment

```
exp-020: StylizedSurfaceShader comic aesthetic
Scene: dorf-kanon
Metrics:
  - ssim_comic_vs_photoreal (≥ 0.75 target similarity)
  - render_fps_stylized (≥ 30 FPS)
  - class_consistency (±10% vs GOLD)
  - line_jitter_px (≤ 0.5 px motion jitter)
```

---

## 4. HybridLineRenderer

**Problem:** Screen-space edge detection produces jitter and misses silhouette
edges behind foreground objects. Surface-space contours are more stable.

**Operator:** `HybridLineRenderer` (from Enhanced Cartoon Rendering / Hybrid-Space Stylization)

### 4.1 Algorithm

```
Screen-space lines (fast):
  - Sobel on depth (wall-floor boundaries)
  - Sobel on normals (surface curvature)
  - Threshold: 0.1–0.3 (tunable)

Surface-space lines (accurate):
  - Pre-computed SDF contour mesh (from SDF geometry)
  - Rendered as wireframe overlay
  - Thickened by geometry shader

Hybrid combination:
  - Surface-space lines = 70% opacity (stable, structural)
  - Screen-space lines = 100% opacity (supplemental, fine detail)
  - Fade screen-space lines at grazing angles (reduce false positives)
```

### 4.2 Integration

- `HybridLineRenderer` renders to a **separate texture** (not the main framebuffer)
- Blended additively in Layer 2, before material shading
- Surface-space line mesh from `SdfGeometry` output
- Screen-space lines computed in fragment shader (existing pipeline)

### 4.3 Experiment

```
exp-021: HybridLineRenderer stability
Camera: K1-building, 12-frame orbit (GOLD_FREEZE §4 canonical probe)
Metrics:
  - line_position_stability_px (≤ 1.0 px jitter across frames)
  - silhouette_completeness_pct (≥ 90% of true silhouette detected)
  - render_fps (≥ 25 FPS at 768×1080)
```

---

## 5. HatchingOperator

**Problem:** Flat cel-shading misses the hand-drawn texture of traditional comics.
Stippling and hatching add artistic texture.

**Operator:** `HatchingOperator` (from High-Quality Hatching via curvature)

### 5.1 Algorithm

Uses 5 predefined hatch textures (from lightest to darkest):

1. **Light areas:** No hatching (smooth paper)
2. **Mid-tone:** Sparse cross-hatch
3. **Shadow:** Dense hatching
4. **Deep shadow:** Very dense hatching + ink bleed
5. **Deepest shadow:** Solid fill with texture noise

Hatch density modulated by:
- Surface curvature (more hatching on curved surfaces)
- Shadow intensity (from intrinsic shading)
- Camera angle (reduce hatching on steep angles to reduce aliasing)

### 5.2 Integration

- Hatch textures are **tileable** (from `TextureStationarizer` output)
- Blend mode: `multiply` with shadow ramp
- Toggle: `u_hatchingEnabled` uniform
- Opacity: `u_hatchingStrength` (0.0 to 1.0)

### 5.3 Experiment

```
exp-022: HatchingOperator artistic quality
Scenes: dorf-marker, taverne, dorf-kanon
Metrics:
  - artistic_similarity_score (0–1, human-rated on 50 renders)
  - render_fps_hatching (≥ 25 FPS)
  - class_consistency (±10% vs GOLD)
```

---

## 6. Stylized Surface Shader Integration Points

### 6.1 Shader Integration

The stylized pipeline modifies the existing shader **without forking**:

```glsl
// In existing fragment shader (index.html):
#ifdef STYLIZED_ENABLED
  // Replace smooth diffuse ramp with stepped ramp
  float NdotL_q = floor(NdotL * 3.0) / 2.99;
  // Contour lines from depth+normal gradient
  float edge = 1.0 - smoothstep(u_edgeThreshold, u_edgeThreshold * 1.5, edgeGradient);
  albedo *= NdotL_q * edge;
#endif

#ifdef HATCHING_ENABLED
  vec2 uv_hatch = uv * u_hatchScale;
  vec4 hatch = texture(u_hatchTextures[u_hatchLevel], uv_hatch);
  albedo *= mix(vec3(1.0), hatch.rgb, hatch.a * u_hatchingStrength);
#endif
```

**No second shader source.** This is a compile-time variant via `#define` injected
at shader compilation time (in `loadShader` at `index.html:1220`).

### 6.2 Actor Styling

SWIFT actors (sprite sheets) already have a comic aesthetic by default.
The stylized pipeline may apply the same hatching/contour treatment to actors
by:
- Rendering actor to a separate framebuffer with contour extraction
- Blending with the main scene using actor depth (Unit 6 parallax)

This is **optional** and controlled by `actor.stylized = true` in the manifest.

---

## 7. Post-Processing Layer

### 7.1 Lens System (Runde 8)

Already implemented: `SHADED.lens` system with inspection lenses.
Can be extended for stylized post-effects:

| Lens | Effect |
|---|---|
| `comic_dot` | Ben-Day dots pattern (CMYK halftone simulation) |
| `paper_grain` | Film grain + paper texture overlay |
| `ink_bleed` | Slight color bleed at high-contrast boundaries |
| `vignette_comic` | Heavy vignette with rounded corners |

### 7.2 Bloom / Glow

Already in GOLD (`u_bloom`):
- `bloom: 0.5` baseline
- Stylized version: increase to 0.7–1.0 for comic glow
- Tint bloom toward warm tones for fire/emissive

### 7.3 Color Grading

Post-processing color LUT applied as final pass:
- `u_lutTexture` (1D or 3D LUT)
- Comic preset: high contrast, saturated, warm shadows

---

## 8. Performance Budget

| Layer | GPU cost | Toggle | Default |
|---|---|---|---|
| Geometry lines | +10% fillrate | `u_lines` | OFF |
| Hatching | +2 texture samples | `u_hatching` | OFF |
| Stylized ramp | Negligible (uniform branch) | `u_stylized` | OFF |
| Hatch paper grain | Negligible (dither) | `u_paperGrain` | OFF |
| Total max cost | +15% fillrate | — | — |

All stylized layers default OFF. GOLD baseline has zero stylized cost.

---

## 9. Non-Goals

- The stylized pipeline must **never** fork the shader source (`index.html`)
- All stylized effects must be toggleable and OFF by default
- No stylized effect may change material classification (`analyze()` output)
- Teacher operators (intrinsic decomposition) feed the pipeline but never
  override the albedo baseline
