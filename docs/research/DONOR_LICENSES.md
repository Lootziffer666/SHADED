# Donor License Status (DONOR_LICENSES.md)

**Generated:** 2026-08-20  
**Purpose:** Per-donor license clearance for the POST-GOLD RESEARCH PASS.  
**Companion:** `EG_DONOR_MATRIX.md` (operator mapping), `spatial-kernel-donor-map.md` §3 (kernel donors).

> **Rule:** SHADED-internal code stays MIT-style. We may **implement from a paper's description**, **wrap external providers via a contract**, or **use MIT/Apache/BSD code directly**. We may **NOT** copy code from NC / GPL-copyleft / restricted-model repos, and we may **NOT** vendor restricted model weights.

---

## 1. Clearance Legend

| Status | Meaning | Action allowed |
|--------|---------|----------------|
| ✅ SAFE | MIT / Apache-2.0 / BSD / public code | Copy or vendor with attribution |
| 📋 IMPLEMENT | Algorithm described, code not required | Re-implement from paper |
| 🔗 WRAP | External model/provider | Use via contract, do NOT vendor weights |
| ⛔ REFERENCE | NC / GPL / restricted | Study only, no code copy |

---

## 2. SHADED / BEUTELTIER Donors (EG_DONOR_MATRIX)

| # | Donor | License | Status | Operators | Notes |
|---|-------|---------|--------|-----------|-------|
| 1 | Texture Stationarization (Zhang 2023) | Paper only | 📋 IMPLEMENT | `TextureStationarizer` | Algo described; re-implement |
| 2 | Seamless Multi-Texturing (Wang 2021) | Paper + code (MIT) | ✅ SAFE | `MultiViewTextureFuser` | Vendor MIT code w/ attrib |
| 3 | Recolorable Posterization (Zhang 2022) | Paper only | 📋 IMPLEMENT | `PaletteNormalizer` | Extends intrinsic |
| 4 | OCCAM (coverage) | Research ref | 🔗 WRAP/📋 | `CoverageEstimator` | Concept only |
| 5 | Piecewise Planar Indoor (Liu et al.) | Academic | 📋 IMPLEMENT | `IndoorStructureExtractor` | Multi-paper |
| 6 | Appearance-Driven Simplification (Lindstrom&Turk) | Classical + MIT variants | ✅ SAFE | `AppearanceDrivenSimplifier` | |
| 7 | Silhouette-Aware Warping | Research ref | 📋 IMPLEMENT | `SilhouetteRescueWarper` | |
| 8 | GSNSR (GS + surface) | Paper + code (MIT) | ✅ SAFE | `AppearanceGeometrySeparator` | |
| 9 | 3DGS / Point reduction | Mixed (MIT, Apache, some NC) | ⚠️ PER-OP | `PointCloudReducer` etc. | Check each sub-technique |
| 10 | IK-GAT | Paper + code (MIT) | ✅ SAFE | `PositionToRotationIK` | |
| 11 | Adaptive Smoothing (ContactVision etc.) | Mixed (MIT, some NC) | ⚠️ PER-OP | `AdaptiveMotionSmoother` | Re-impl if NC |
| 12 | Contact Detection (ContactVision) | Mixed (MIT, some NC) | ⚠️ PER-OP | `ContactDetector` | Re-impl if NC |
| 13 | GS-2M Material-Aware Geo | Paper + code (MIT) | ✅ SAFE | `MaterialAwareGeometry` | |
| 14 | Semantic UVs | Paper + code (MIT) | ✅ SAFE | `SemanticUVMapper` | |
| 15 | PlaneNet / PlaneRCNN | Academic | 📋 IMPLEMENT | `PlanarIndoorReconstructor` | |
| 16 | Hierarchical Room Graphs | Research ref | 📋 IMPLEMENT | `HierarchicalSceneGraphBuilder` | |
| 17 | 3DGS Compression | Mixed | ⚠️ PER-OP | `GSCuller` etc. | |
| 18 | Hatching / Hybrid Stylization | Research ref | 📋 IMPLEMENT | `HybridLineSystem` etc. | |
| 19 | Motion In-Betweening (ReConForM) | Mixed | ⚠️ PER-OP | `MotionInbetweener` | |
| 20 | Crowd Routing | Research ref | 📋 IMPLEMENT | `CrowdRoutingOptimizer` | |
| 21 | Graph Drawing | Research ref | 📋 IMPLEMENT | `GraphLayoutEngine` | |
| 22 | Residual Learner (meta) | Concept | 📋 IMPLEMENT | `ResidualLearner` | |

---

## 3. Spatial Kernel Donors (spatial-kernel-donor-map.md §3)

| Donor | License | Status | Use |
|-------|---------|--------|-----|
| Robbyant/lingbot-map | Internal impl | ✅ SAFE | `SpatialMemory` (no transformer copy) |
| ShirleyMaxx/REST3D | **CC BY-NC** | ⛔ REFERENCE | Architecture only, **no code** |
| pascalorg/editor | Reference | 📋 IMPLEMENT | SceneGraph design |
| ZyFou/ProceduralTerrains | Reference | 📋 IMPLEMENT | Chunk/dirty design |
| zeux/meshoptimizer | MIT | ✅ SAFE | Use directly |
| fogleman/sdf | Reference (SDF lang) | 📋 IMPLEMENT | SdfGeometry |
| dimforge/rapier | Dual (MIT/commercial) | ✅ SAFE (optional dep) | Collision backend |
| VAST-AI/TripoSplat | Reference | 📋 IMPLEMENT | Budget principle |
| apple/ml-lito | Reference | 📋 IMPLEMENT | Separable repr |
| TencentARC/Pixal3D | **Model restricted** | 🔗 WRAP | Provider contract only |
| Tencent HY-World 2 | **Research/restricted** | 🔗 WRAP | Observation contract |
| MoGe-3 | Principle | 📋 IMPLEMENT | 3D neighbourhood |
| TRELLIS 2 / Zero123 | Optional | 🔗 WRAP | Completion provider |
| PlayCanvas / WebGPU | Reference | 📋 IMPLEMENT | Render patterns |
| starred GPU/terrain (GPL) | **GPL/copyleft** | ⛔ REFERENCE | Study only |

---

## 4. Hard Red Lines (must not cross)

1. **REST3D (CC BY-NC)** — paper/architecture reference only. No code copy, no derived source.
2. **Tencent HY-World / Pixal3D restricted models** — do not vendor weights or restricted code. Only wrap external providers via `CompletionProvider` / observation contract.
3. **GPL/copyleft starred repos** — study ideas, do not copy code into SHADED.
4. **NC sub-techniques in #9/#11/#12/#17/#19** — for each sub-technique, verify license before vendoring; re-implement from description if NC.

---

## 5. Provenance Requirement

Every operator implemented from a donor MUST record in its `OperatorRegistry` metadata:
- `license` field (one of SAFE / IMPLEMENT / WRAP / REFERENCE)
- `donor` citation (paper + authors + year)
- `licenseVerifiedBy` + date

This is enforced by `EXPERIMENT_ARCHITECTURE.md` OperatorRegistry schema (`license` key).

---

## 6. Review Checklist (before any PR merges a donor operator)

- [ ] `license` status in {SAFE, IMPLEMENT, WRAP}
- [ ] If SAFE: attribution + license file retained
- [ ] If WRAP: no weights/code vendored, only contract wrapper
- [ ] If IMPLEMENT: no verbatim code copy from NC source
- [ ] Red lines (§4) not crossed
- [ ] `donor` citation present in registry metadata
