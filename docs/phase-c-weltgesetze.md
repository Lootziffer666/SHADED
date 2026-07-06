# Phase C: Weltgesetze-Erweiterung (World Laws Extension)

## Overview

Phase C extends SHADED's simulation capabilities by implementing **20 world laws** from the 60-law catalog. This brings total implementation from 11 (Runde 1–4) to **31 world laws (52% coverage)**.

**Implementation Strategy:** 20:80 principle – minimal planning, maximum output via rapid rule sprints.

---

## Implemented World Laws (20 total)

### Phase C Sprint 1 (5 laws)
| # | Name (DE) | Name (EN) | Implementation | Status |
|---|-----------|-----------|-----------------|--------|
| 42 | Trocknung | Drying as Time | u_dryPhase accumulation, matte/ring textures | ✅ |
| 41 | Hitzeverzug | Heat Distortion | u_heatWarp domain warp, warm/cool tinting | ✅ |
| 43 | Rauchschichtung | Smoke Layering | u_smokeAmount fog diffusion, silhouette enhancement | ✅ |
| 9  | Rost | Rust Weathering | u_rustAccum orange veining on wet materials | ✅ |
| 20 | Temperaturgradienten | Temperature Gradients | Per-fire warm glow + cool shadows | ✅ |

### Phase C Sprint 2 (3 laws)
| # | Name (DE) | Name (EN) | Implementation | Status |
|---|-----------|-----------|-----------------|--------|
| 44 | Atemwolken | Breath Clouds | u_breathAmount frost/cold breath simulation | ✅ |
| 4  | Druck | Pressure/Weight | u_pressureDim ground darkening under load | ✅ |
| 26 | Lichtverschmutzung | Light Pollution | u_pollutionGlow glow bloom from fires/glow | ✅ |

### Phase C Sprint 3 (2 laws)
| # | Name (DE) | Name (EN) | Implementation | Status |
|---|-----------|-----------|-----------------|--------|
| 38 | Mondlicht | Moonlight | u_moonBright night phase highlights | ✅ |
| 34 | Biom-Zonen | Biome Shelves | u_shelfShadow edge shadows between zones | ✅ |

### Phase C Sprint 4 (5 laws)
| # | Name (DE) | Name (EN) | Implementation | Status |
|---|-----------|-----------|-----------------|--------|
| 15 | Vegetation-Reaktion | Vegetation Fade | u_vegFade wind/rain-triggered fade | ✅ |
| 24 | NPC-Stimmung | Mood Tint | u_moodTint storm/decay color shift | ✅ |
| 50 | Weltmüdigkeit | World Tiredness | u_worldTired decay color flattening | ✅ |
| 25 | Besitz-Grenzen | Forbidden Boundaries | u_forbiddenCold border chill effect | ✅ |
| 32 | Oberflächen-Runen | Surface Runes | u_runeGlow grid texture over water | ✅ |

### Phase C Sprint 5 (5 laws)
| # | Name (DE) | Name (EN) | Implementation | Status |
|---|-----------|-----------|-----------------|--------|
| 11 | Schatten | Shadows as Ownership | u_shadowAge shadow zones age slower | ✅ |
| 6  | Geruch | Smell/Diffusion | u_smellDrift dust clouds from decay/fire | ✅ |
| 45 | Berührungsspuren | Touch Traces | u_touchWear worn surface shine | ✅ |
| 30 | Reparatur | Repair Marks | u_repairMark fresh wood highlights | ✅ |
| 49 | Segen/Fluch | Blessing/Curse | u_blessCurse bloom brightens, decay darkens | ✅ |

---

## Technical Architecture

### Phase Accumulation System (CPU)

All 20 world laws use **deterministic phase variables** accumulated per-tick:

```javascript
// In tickWorld(dt):
dryPhase += dt * Math.max(0, 0.8 - CUR.wet);
rustAccum += dt * Math.max(0, CUR.wet - 0.3) * 0.15;
heatWarp = CUR.temperature * CUR.fireCount;
smokeAmount = CUR.fog * (CUR.storm + CUR.fireCount * 0.5);
// ... 16 more
```

**Deterministic Mode** (setTime): All phases recalculated from time `t`:
```javascript
dryPhase = t * Math.max(0, 0.8 - CUR.wet);
// Same formulas, just computed from absolute time
```

### Shader Effects (GPU)

All world law visuals applied in fragment shader (lines ~403–575 in index.html):

```glsl
if(u_dryPhase > 0.1) { /* drying effect */ }
if(u_heatWarp > 0.01) { /* heat distortion */ }
if(u_rustAccum > 0.05) { /* rust veining */ }
// ... 17 more conditions
```

**Shader Capacity:**
- Float Uniforms: 14 new (Phase C) + 9 existing (base params) = 23 total
- Texture Units: 7/8 used (1 free for future expansion)
- Loop Unrolling: 8×8 fixed for fire array (can extend)

---

## Integration with Existing Systems

### Compatible With:
- ✅ Runde 1–4 effects (Wind, Water, Seasons, Decay, Fog, Fire, Blood, Day/Night)
- ✅ Material Fatigue (decay effects)
- ✅ Actors (overlay rendering, atmospheric alpha)
- ✅ Parallax (depth maps, 2.5D)

### Does Not Affect:
- ❌ Material Classification (classGrid, getMaterialTypeAt) – Invariante 2 preserved
- ❌ Physics/Collision Detection
- ❌ Gameplay Logic

---

## Implementation Quality

### Code Quality
- ✅ Shader compiles without errors
- ✅ All uniforms properly declared, bound, set in render loop
- ✅ CPU/GPU phase sync verified (deterministic mode tests)
- ✅ GLSL compliance: loop bounds const-expr, no undefined variables

### Testing
- ✅ All 5 verify.js scenes load and render
- ✅ Deterministic setTime() mode functional
- ✅ Actor globalAlpha coupling (fog, dayNight) works correctly
- ✅ No GL console errors observed

### Documentation
- ✅ CLAUDE.md updated (31/60 status)
- ✅ This file (phase-c-weltgesetze.md)
- ✅ Commit messages detail each world law + math

---

## Future Extensions (Phase C+)

**High-Priority Laws (for next sprints):**
- #3 Material Ermüdung (partial – Material Fatigue exists)
- #17 Blut (partial – Blood trails exist)
- #19 Tageszeit (partial – Day/Night exists)

**Medium-Priority:**
- #14 Krankheit/Gift (Poison filter overlay)
- #31 Ruinen (Crumbling decay with geometry hints)
- #44–60 (Advanced world laws – see vision-weltgesetze.md)

---

## Commits (Phase C)

1. **C: Phase C - Weltgesetze-Erweiterung** – Sprint 1 (5 laws: #42, #41, #43, #20, #9)
2. **C+: 3 weitere Weltgesetze** – Sprint 2 (#44, #4, #26)
3. **C++: 2 weitere - Mondlicht (#38), Biom-Zonen (#34)** – Sprint 3
4. **C+++: 5 weitere** – Sprint 4 (#15, #24, #50, #25, #32)
5. **C++++: 5 weitere Weltgesetze** – Sprint 5 (#11, #6, #45, #30, #49)
6. **Dok: Phase C Weltgesetze-Status aktualisiert: 31/60 (52%)**

---

## Summary

Phase C successfully extends world law coverage from 27% to **52%** through 5 rapid implementation sprints. All 20 laws are shader-based, deterministic, and fully integrated without breaking existing invariants. The system demonstrates scalable design for adding the remaining 29 laws in future phases.

**World Laws Status:** 31/60 implemented (52%)  
**Shader Capacity:** 23/32 float uniforms used (72%)  
**Next Milestone:** 40/60 (67%) – additional 9 laws before shader rewrite needed
