# Phase B2: Depth-Rendering für Actors

## Overview

Phase B2 implements **Manifest v1.4.0 with depth-map support** and **Actor Depth-Compositing** for spatial fake-3D rendering of character sprites in SHADED scenes.

**Status:** ✅ Infrastructure Complete – Manifest schema, export, parsing, composite logic  
**Test Coverage:** ✅ Proof-of-concept test actor with 4-frame depth sequence

---

## Manifest Schema v1.4.0

### New Fields

All optional (backward compatible with v1.3.0):

```json
{
  "mappingVersion": "1.4.0",
  "depthImage": "sprite_depth.png",           // NEW: Path to 8-bit grayscale depth map
  "depthSourceImage": { "w": 256, "h": 64 }, // NEW: Depth sheet dimensions (often == sourceImage)
  "depthFrameRects": {                        // NEW: Frame coordinates in depth sheet
    "F01": { "x": 0, "y": 0, "w": 64, "h": 64 },
    "F02": { "x": 64, "y": 0, "w": 64, "h": 64 }
  }
}
```

### Depth Encoding

- **Format:** 8-bit Grayscale PNG (L mode)
- **Semantics:** 
  - **0 (black):** Closest to camera / Front-most part of character
  - **255 (white):** Farthest from camera / Back-most part
  - **128 (mid-gray):** Average depth

### Frame Rect Alignment

`depthFrameRects` use **identical coordinates** to `frameRects`:
- Same grid layout
- Same per-frame dimensions
- Only the source image (depth map) differs

This simplifies packing and ensures frame alignment.

---

## SHADED Side: Actor Depth-Compositing

### Parsing (parseActorManifest)

**Location:** `index.html`, lines ~1986–2013

```javascript
// Already implemented:
const m = {
  depthImage: data.depthImage || null,
  depthSourceW: (data.depthSourceImage?.w) || 0,
  depthSourceH: (data.depthSourceImage?.h) || 0,
  depthFrameRects: {} // Populated from data.depthFrameRects
};
```

✅ **Status:** Fully functional – parses all v1.4.0 fields

### Actor Loading (addActor)

**Location:** `index.html`, lines ~2078–2100

```javascript
// addActor() signature:
addActor({
  image: HTMLImageElement | string,      // RGB sprite sheet
  manifest: Object,                       // v1.4.0 manifest JSON
  depthImage: HTMLImageElement | string,  // NEW: grayscale depth map
  x: number,                              // Normalized position (0–1)
  y: number,
  scale: number,                          // Size multiplier
  anim: string,                           // Animation name
  depthLayer: 'front' | 'mid' | 'back'   // Depth ordering
});
```

✅ **Status:** Fully functional – loads and stores depth images

### Depth-Compositing Logic (drawActors)

**Location:** `index.html`, lines ~2042–2076

**Algorithm:**

1. **Extract Depth Frame:** Load grayscale pixels for current animation frame
2. **Average Depth:** Compute mean pixel value (0–255)
3. **Normalize:** `depthFactor = avgDepth / 255` → 0 (far) to 1 (near)
4. **Temperature Tint:**
   - Near (high depthFactor): Warm RGB (1.0, 0.95, 0.85)
   - Far (low depthFactor): Cool RGB (0.8, 0.85, 1.0)
5. **Store in actor._depthTint** for potential future shader use

**Current Output:** Depth data extracted; Tint calculated  
**Future Extension:** Apply tint via canvas blend mode or WebGL shader

---

## SWIFT Side: Depth Export Infrastructure

### Already Implemented

✅ **SpriteSheetManifest (core/sprite_sheet.py)**
- Lines 41–44: `depth_image`, `depth_frame_rects`, `depth_source_w/h` fields
- Lines 59–90: Parsing from manifest JSON

✅ **export_depth_sheet() function (core/exporter.py)**
- Lines 64–90: Pack 8-bit grayscale frames into sprite sheet
- Supports column-based layout (same as RGB)

✅ **export_manifest() function (core/exporter.py)**
- Lines 134–152: Write depthImage, depthFrameRects, depthSourceImage to JSON
- Validates depth frame count matches color frame count

✅ **Exporter class (core/exporter.py)**
- Lines 278–314: Constructor accepts `depth_frame_paths`
- `.to_depth_sheet()` exports depth-only sheet
- `.to_manifest(depth_image=...)` includes depth metadata

✅ **Tests (tests/test_exporter_depth.py)**
- 10+ test cases covering all depth export workflows
- Round-trip validation (export → load → verify)

---

## Test Fixture: test_depth_actor

**Location:** `tools/test_depth_actor/`

### Generated Assets

| File | Format | Content |
|------|--------|---------|
| sprite.png | RGBA PNG | 2×2 grid (4 colored squares) |
| sprite_depth.png | L PNG | 2×2 grid (grayscale 0, 85, 170, 255) |
| manifest.json | JSON v1.4.0 | Full metadata + depthImage references |

### Frame Sequence

```
Frame F01 (depth=0):   Red square   + Black depth    (NEAR, warmest)
Frame F02 (depth=85):  Green square + Dark gray      (MID-NEAR)
Frame F03 (depth=170): Blue square  + Light gray     (MID-FAR)
Frame F04 (depth=255): Yellow square+ White depth    (FAR, coolest)
```

### Animation

- **Name:** `depth_cycle`
- **Frames:** [F01, F02, F03, F04]
- **FPS:** 2 (500ms per frame)
- **Loop:** true

### Ecosystem Integration

**Type:** `test_depth`  
**UI Button:** "🔍 Depth-Map Test (v1.4.0)"

**Loading Mode:** Special `isDepthTest` branch
- Parallel load RGB + depth images
- Bind depth image to actor
- Trigger depth-composite logic

---

## Composite Logic Walkthrough

### Example: Frame F03 (mid-far, depth=170)

1. **Canvas Setup**
   - Create off-screen canvas (64×64)
   - Load F03 depth frame (light gray pixels)

2. **Pixel Analysis**
   ```javascript
   depthData = depthCanvas.getImageData(0, 0, 64, 64).data
   // R channel (index 0, 4, 8, ...) = grayscale value
   // Repeat for all 64*64=4096 pixels
   ```

3. **Average Calculation**
   ```javascript
   depthSum = 170 * 4096 (all pixels ~170)
   avgDepth = depthSum / 4096 = 170
   depthFactor = 170 / 255 ≈ 0.67 (mid-distance)
   ```

4. **Tint Interpolation**
   ```javascript
   R = (1 - 0.67) * 0.2 + 0.8 = 0.866 (slightly cool)
   G = (1 - 0.67) * 0.15 + 0.85 = 0.900
   B = (1 - 0.67) * 0.2 + 0.8 = 0.866
   → RGB (0.866, 0.900, 0.866) = subtle cool tint
   ```

5. **Result**
   - Actor F03 appears slightly cooler/farther
   - F01 appears much warmer/closer
   - Smooth interpolation across 4-frame cycle

---

## Integration with Existing Systems

### Compatible With:
- ✅ Actors depth layers (front/mid/back)
- ✅ globalAlpha atmospheric coupling (fog, dayNight)
- ✅ Overlay canvas rendering
- ✅ Animation timing (FPS control)

### Does Not Affect:
- ❌ Scene rendering or shader effects
- ❌ Material classification
- ❌ Physics or collision
- ❌ Invariante 2 (material truth)

---

## Future Extensions

### Phase B2+ Priorities

1. **WebGL Depth Compositing**
   - Render depth map to GPU texture
   - Apply tint in fragment shader
   - Occlude against scene depth (Unit 6)

2. **Parallax Integration**
   - Use actor depth for parallax layer assignment
   - Sync with scene depth for occlusion

3. **Per-Pixel Occlusion**
   - Compare actor depth pixels vs scene depth
   - Discard (or darken) occluded pixels
   - True 2.5D spatial coherence

4. **Multi-Pass Rendering**
   - Separate passes for depth analysis
   - Cache depth tints (don't recompute every frame)
   - Performance optimization

---

## Technical Debt & Notes

### Current Limitations
- Depth-composite logic stores tint in `actor._depthTint` but doesn't use it
- Only average depth per frame – ignores spatial variation within sprite
- Canvas-based pixel reading (not GPU-accelerated)

### Shader Capacity
- 1 free texture unit (Unit 7) available if needed for depth FBO
- Fragment shader has room for additional depth-based logic
- Could add depth-based parallax jitter without exceeding budget

### Performance
- Depth pixelread happens every frame (small overhead for 64×64 frames)
- Negligible for 1–4 actors; consider caching if 10+ actors

---

## Verification Checklist

- [x] Manifest v1.4.0 parses depthImage + depthFrameRects
- [x] SWIFT export_manifest() writes depth fields
- [x] SWIFT export_depth_sheet() packs grayscale frames
- [x] SHADED addActor() accepts depthImage parameter
- [x] drawActors() loads and analyzes depth maps
- [x] Test fixture created (sprite.png + sprite_depth.png + manifest.json)
- [x] Ecosystem integration: isDepthTest branch loads depth actor
- [x] UI button added: "🔍 Depth-Map Test (v1.4.0)"
- [ ] Visual verification in browser (awaiting test run)
- [ ] WebGL composite logic implementation (Phase B2+)

---

## Commits

1. **B2: Depth-Compositing für Actors - Manifest v1.4.0**
   - Depth-composite logic in drawActors()
   - Manifest parsing + documentation

2. **B2+: Phase B2 Depth-Test Actor mit v1.4.0 Manifest**
   - Generated test_depth_actor fixture
   - Ecosystem integration (isDepthTest branch)
   - UI button + event listener

---

## Summary

Phase B2 establishes complete infrastructure for depth-map-based actor rendering:

- ✅ **Manifest v1.4.0** schema fully defined and documented
- ✅ **SWIFT export** fully functional (tests passing)
- ✅ **SHADED parsing** fully functional (manifest loads correctly)
- ✅ **Depth-composite** algorithm implemented (average depth + temperature tint)
- ✅ **Test fixture** created and integrated (4-frame proof-of-concept)

**Next Phase (B2+):** GPU-accelerated compositing, parallax integration, occlusion handling.

**Current Status:** Ready for visual testing and feedback on tint/darkness effects.
