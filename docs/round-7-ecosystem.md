# Runde 7: Ökosystem-Integration

## Overview

Runde 7 integrates **SWIFT-generated sprite sheets and GAIME character assets** into SHADED via the Actor system, creating a dynamic ecosystem of animated characters in scenes.

**Status:** ✅ Complete – 4 ecosystem types, 13 total actors, multi-asset support

---

## Ecosystem Types

### 1. Animated Sprite-Sheets (SWIFT)

**Type:** `cats`  
**Assets:** `tools/verify-test-actor.png` + `tools/verify-test-actor.json` (Cat sprite sheet)  
**Actors:** 4 cats  
**Animation System:** Frame-based with FPS control

| Actor | Position | Animation | Scale | Depth Layer |
|-------|----------|-----------|-------|-------------|
| Cat 1 | (0.2, 0.6) | walk | 0.8 | mid |
| Cat 2 | (0.5, 0.65) | rest_idle | 1.0 | mid |
| Cat 3 | (0.8, 0.7) | eat_cycle | 0.9 | back |
| Cat 4 | (0.3, 0.5) | walk_stretchy | 0.7 | mid |

**Available Animations (from manifest):**
- walk, walk_stretchy, small_hop, pounce
- rest_roll_to_sleep, rest_idle, eat_cycle
- idle_variants, specials

---

### 2. GAIME Enemies

**Type:** `gaime_enemies`  
**Source:** GAIME repo (`composeApp/src/commonMain/composeResources/drawable/enemy_*.png`)  
**Rendering:** Static images (no animations)  
**Actors:** 3 enemies

| Actor | Asset | Position | Scale | Depth Layer |
|-------|-------|----------|-------|-------------|
| Blob | enemy_blob.png | (0.15, 0.55) | 2.0 | mid |
| Rat | enemy_rat.png | (0.35, 0.65) | 2.5 | mid |
| Wolf | enemy_wolf.png | (0.65, 0.6) | 2.0 | back |

---

### 3. GAIME NPCs

**Type:** `gaime_npcs`  
**Source:** GAIME repo (`composeApp/src/commonMain/composeResources/drawable/npc_world_*.png`)  
**Rendering:** Static images  
**Actors:** 4 NPCs

| Actor | Asset | Position | Scale | Depth Layer |
|-------|-------|----------|-------|-------------|
| Citizen 1 | npc_world_citizen1.png | (0.2, 0.6) | 3.0 | mid |
| Citizen 2 | npc_world_citizen2.png | (0.5, 0.65) | 3.0 | mid |
| Barkeep | npc_world_barkeep.png | (0.75, 0.7) | 2.5 | back |
| Merchant | npc_world_merchant.png | (0.3, 0.5) | 2.5 | mid |

---

### 4. GAIME Heroes

**Type:** `gaime_heroes`  
**Source:** GAIME repo (`composeApp/src/commonMain/composeResources/drawable/hero_*.png`)  
**Rendering:** Static images  
**Actors:** 3 heroes

| Actor | Asset | Position | Scale | Depth Layer |
|-------|-------|----------|-------|-------------|
| Nib | hero_nib.png | (0.25, 0.6) | 2.5 | front |
| Brugg | hero_brugg.png | (0.55, 0.65) | 2.5 | mid |
| Vellum | hero_vellum.png | (0.75, 0.58) | 2.5 | mid |

---

## Technical Architecture

### Ecosystem Manager

**Location:** `index.html`, lines ~2110–2200

**Core Function:** `spawnEcosystem(type)`
- Clears existing actors
- Loads correct asset set (sprite-sheet or static images)
- Configures animations, positions, depth layers
- Binds to overlay canvas via `addActor()` API

**Three Loading Modes:**

1. **Animated Sprite-Sheets** (`.anim` property)
   - Loads single RGB sheet + manifest JSON
   - Applies animation timing per frame
   - Sets globalAlpha based on fog/dayNight

2. **Static Images** (GAIME assets)
   - Loads individual PNG files
   - Parallel loading (waits for all images)
   - No animation timing

3. **Depth-Testing** (Phase B2, `isDepthTest`)
   - Loads RGB sheet + depth map in parallel
   - Binds depth map to actor for composite
   - Special handling for Manifest v1.4.0

### Manifest Schema (v1.4.0)

All animated actors require a manifest JSON describing frame layout:

```json
{
  "mappingVersion": "1.4.0",
  "sourceImage": { "w": 1536, "h": 523 },
  "frameRects": { "F01": { "x": 0, "y": 0, "w": 149, "h": 153 }, ... },
  "frames": [{ "id": "F01", "key": "idle_stand" }, ...],
  "animations": {
    "walk": { "frames": ["F01", "F02", ...], "fps": 8, "loop": true }
  }
}
```

### UI Controls

Four new buttons in Tools panel:

| Button | Callback | Result |
|--------|----------|--------|
| 🐱 Katzen-Schwarm | `spawnEcosystem('cats')` | 4 animated cats, mixed animations |
| 👿 Feinde | `spawnEcosystem('gaime_enemies')` | 3 enemies (Blob, Rat, Wolf) |
| 🧑 NPCs | `spawnEcosystem('gaime_npcs')` | 4 townspeople |
| ⚔️ Helden | `spawnEcosystem('gaime_heroes')` | 3 heroes (Nib, Brugg, Vellum) |

All spawn actors with appropriate depth layering for spatial coherence.

---

## Integration Points

### Invariants Preserved

✅ **Invariante 2 (Material Truth):** Actors are purely optical – no effect on `classGrid`, `getMaterialTypeAt()`, or physics  
✅ **Single-File Architecture:** All code inline in `index.html`, no external dependencies  
✅ **API Contract:** `window.SHADED.addActor()` and `window.SHADED.ecosystem` fully exposed  

### Depth Layer System

Actors render in order: **back → mid → front**

Within each layer, sorted by Y position (bottom to top, Z-order correctness).

**Use Cases:**
- `'back'`: Background silhouettes, distant characters
- `'mid'`: Main characters, focal point (default)
- `'front'`: Flying creatures, overlays

### Atmospheric Coupling

Actor globalAlpha automatically adjusted:

```javascript
alpha = baseAlpha * (1 - fog * 0.5) * (1 - dayNight * 0.3)
```

**Effect:** Characters fade in fog, darken at night – without shader modifications

---

## Testing

### Manual Tests (Browser)
1. Load a scene image and click "✨ Erstellen"
2. Click one of the four ecosystem buttons
3. Verify:
   - ✅ Actors appear at correct positions
   - ✅ Animations play (if applicable)
   - ✅ Depth layers sort correctly (no z-fighting)
   - ✅ globalAlpha responds to fog/dayNight sliders
   - ✅ No GL console errors

### Verify.js
- `shot_actor_default.png`: All 4 ecosystems tested
- `shot_actor_fog_night.png`: Atmospheric coupling verified

---

## Asset Sources

| Ecosystem | Source | Path | Count | Format |
|-----------|--------|------|-------|--------|
| cats | SHADED test | tools/verify-test-actor.* | 1 sheet | PNG + JSON |
| gaime_enemies | GAIME repo | composeApp/.../drawable/enemy_*.png | 3 images | PNG |
| gaime_npcs | GAIME repo | composeApp/.../drawable/npc_world_*.png | 4 images | PNG |
| gaime_heroes | GAIME repo | composeApp/.../drawable/hero_*.png | 3 images | PNG |

---

## Known Issues

- Asset paths relative to document root (browser file:// may fail – use HTTP server)
- Parallel image loading may race on slow connections (awaits all before render)
- No AI/pathfinding (actors are static-positioned; animation is decorative)

---

## Future Enhancements

### Phase B2+
- Depth-Map support for actors (see phase-b2-depth-rendering.md)
- Z-ordering based on depth maps instead of hard-coded layers

### Phase R8+
- AI Movement: Simple patrol/wander behaviors
- Interaction: Click to talk, trade, etc.
- Persistence: Save actor states across scene reloads

---

## Summary

Runde 7 demonstrates full Actor ecosystem integration: **13 characters from 2 sources (SWIFT + GAIME), 4 ecosystem types, atmospheric coupling, correct depth layering**. System is extensible – adding new ecosystem types requires only new entries in `ecosystemDefs` and corresponding UI buttons.

**Coverage:** 13/∞ possible characters  
**Ecosystem Types:** 4 (cats, enemies, NPCs, heroes)  
**Total Assets:** 8 (1 sprite sheet, 7 static images)  
**API Version:** v1.4.0 (Actor system with depth support)
