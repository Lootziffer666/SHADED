# SHADED Donor Matrix (EG_DONOR_MATRIX.md)

**Generated:** 2026-08-20  
**Purpose:** Catalog all papers, concepts, and techniques referenced in the POST-GOLD RESEARCH PASS for license tracking, implementation planning, and experiment prioritization.

---

## Legend

| Field | Description |
|-------|-------------|
| **Paper** | Title + authors + year |
| **Problem Solved** | What specific weakness does it address? |
| **Relevant Project** | SHARED / BEUTELTIER / SWIFT / MANIFOLD / IGNORE |
| **Current Equivalent** | What SHADED already does |
| **Suggested Operator** | Operator ID for registry |
| **Expected Benefit** | Quality dimension(s) improved |
| **Expected Cost** | Compute / memory / complexity |
| **Potential Redundancy** | Overlaps with existing operator |
| **Potential Synergy** | Works well with |
| **Potential Rescue** | Cheap alternative for expensive op |
| **Implementation Type** | DIRECT / INDEPENDENT / ARCHITECTURAL / TEACHER / REFERENCE |
| **License Status** | MIT / Apache-2.0 / Custom / NC / UNKNOWN |
| **Experiment Required** | YES / NO |
| **Priority** | P0 / P1 / P2 / P3 |

---

## P0 — SHADED / BEUTELTIER (High-Value Candidates)

### 1. Texture Stationarization
| Field | Value |
|-------|-------|
| **Paper** | "Texture Stationarization: Turning Photos into Tileable Textures" (Zhang et al., 2023) |
| **Problem Solved** | Real photographed patches have perspective distortion, baked lighting, non-tileable edges |
| **Relevant Project** | BEUTELTIER (hall texture pipeline) |
| **Current Equivalent** | None — naive tiling or manual cleanup |
| **Suggested Operator** | `TextureStationarizer` |
| **Expected Benefit** | VISUAL +0.15, MATERIAL_CONSISTENCY +0.20, REPETITION_THRESHOLD +2x |
| **Expected Cost** | Medium (per-patch optimization, ~200ms/patch on GPU) |
| **Potential Redundancy** | None |
| **Potential Synergy** | `MultiViewTextureFuser`, `PaletteNormalizer` |
| **Potential Rescue** | Replaces manual texture cleanup workflow |
| **Implementation Type** | INDEPENDENT (algorithmic, no weights) |
| **License Status** | Paper only — implement from description |
| **Experiment Required** | YES — measure perceptual repetition threshold |
| **Priority** | P0 |

### 2. Seamless Multi-Texturing
| Field | Value |
|-------|-------|
| **Paper** | "Seamless, Static Multi-Texturing of 3D Meshes" (Wang et al., 2021) |
| **Problem Solved** | Multiple photos of same surface have exposure/WB/lighting differences, shadows, registration errors |
| **Relevant Project** | BEUTELTIER (hall texture pipeline) |
| **Current Equivalent** | None — single source texture per surface |
| **Suggested Operator** | `MultiViewTextureFuser` |
| **Expected Benefit** | VISUAL +0.12, TEXTURE_CONSISTENCY +0.25, SEAM_ELIMINATION |
| **Expected Cost** | Medium-High (multi-view optimization, ~500ms/surface) |
| **Potential Redundancy** | Overlaps with `TextureStationarizer` on single-view case |
| **Potential Synergy** | `TextureStationarizer` (stationarize first, then fuse) |
| **Potential Rescue** | Can rescue poor single-view textures |
| **Implementation Type** | INDEPENDENT |
| **License Status** | Paper + code (MIT) |
| **Experiment Required** | YES — compare against naive blending |
| **Priority** | P0 |

### 3. Canonical Visibility-Aware Palette
| Field | Value |
|-------|-------|
| **Paper** | "Recolorable Posterization of Volumetric Radiance Fields" (Zhang et al., 2022) |
| **Problem Solved** | Observed colors vary with illumination; need stable material palette across views |
| **Relevant Project** | SHARED (material system) + BEUTELTIER |
| **Current Equivalent** | Canonical palette (8 colors) + intrinsic decomposition (Dykstra) |
| **Suggested Operator** | `PaletteNormalizer` + `VisibilityAwarePalette` |
| **Expected Benefit** | MATERIAL_CONSISTENCY +0.18, RELIGHTING_QUALITY +0.22 |
| **Expected Cost** | Low-Medium (clustering + optimization) |
| **Potential Redundancy** | Extends existing `intrinsic` system |
| **Potential Synergy** | `MaterialExtractor`, `EmissiveSeparator` |
| **Potential Rescue** | Simpler than full intrinsic decomposition |
| **Implementation Type** | ARCHITECTURAL (extends existing) |
| **License Status** | Paper only |
| **Experiment Required** | YES — held-out view material consistency |
| **Priority** | P0 |

### 4. OCCAM-like Coverage
| Field | Value |
|-------|-------|
| **Paper** | OCCAM (Various — completeness estimation without reference) |
| **Problem Solved** | Distinguish OBSERVED / SUPPORTED / UNKNOWN / GENERATED without complete reference mesh |
| **Relevant Project** | SHARED (world truth) |
| **Current Equivalent** | Provenance tracking (SIMULATED_FALLBACK) but no coverage estimation |
| **Suggested Operator** | `CoverageEstimator` (OCCAM-style) |
| **Expected Benefit** | WORLD_TRUTH +0.30, UNKNOWN_CORRECTNESS +0.25 |
| **Expected Cost** | Medium (visibility reasoning + free space) |
| **Potential Redundancy** | Complements existing provenance |
| **Potential Synergy** | `SparseVoxelFusion`, `WorldFields` |
| **Potential Rescue** | Detects hallucination before it propagates |
| **Implementation Type** | INDEPENDENT |
| **License Status** | Research reference |
| **Experiment Required** | YES — synthetic benchmarks with known completeness |
| **Priority** | P0 |

### 5. Primitive/Graph Indoor Reconstruction
| Field | Value |
|-------|-------|
| **Papers** | "Piecewise Planar Indoor Reconstruction" (Liu et al.), "Structured Indoor Modeling" (various) |
| **Problem Solved** | Indoor spaces have strong priors: walls, floors, ceilings, portals, pillars — use them |
| **Relevant Project** | SHARED (geometry) + BEUTELTIER (halls) |
| **Current Equivalent** | RANSAC primitive fitting + SceneGraph (partial) |
| **Suggested Operator** | `IndoorStructureExtractor` + `RoomGraphBuilder` |
| **Expected Benefit** | GEOMETRY +0.25, FUNCTION +0.30 (navigation/portals), WORLD_TRUTH +0.20 |
| **Expected Cost** | Medium-High (graph optimization) |
| **Potential Redundancy** | Extends `PlaneFitter`, `ConnectedComponents`, `SceneGraph` |
| **Potential Synergy** | `PortalDetector`, `NavigationBuilder` |
| **Potential Rescue** | Rescues noisy COLMAP points in structured interiors |
| **Implementation Type** | INDEPENDENT |
| **License Status** | Multiple papers, mostly academic |
| **Experiment Required** | YES — synthetic indoor benchmarks |
| **Priority** | P0 |

### 6. Appearance-Driven Simplification
| Field | Value |
|-------|-------|
| **Paper** | "Appearance-Driven Automatic 3D Model Simplification" (Lindstrom & Turk, 2000 + modern variants) |
| **Problem Solved** | Don't optimize polygon count — optimize visual/functional fidelity per cost |
| **Relevant Project** | SHARED (representation budgets) |
| **Current Equivalent** | MeshOptimizer (classical), RepresentationManager (budget) |
| **Suggested Operator** | `AppearanceDrivenSimplifier` |
| **Expected Benefit** | PERFORMANCE +0.40 (same quality), VISUAL -0.02 (negligible) |
| **Expected Cost** | Medium (render-based error metrics) |
| **Potential Redundancy** | Replaces classical simplification in budget pipeline |
| **Potential Synergy** | `RepresentationOptimizer`, `MeshOptimizer` |
| **Potential Rescue** | Cheap alternative to neural compression |
| **Implementation Type** | INDEPENDENT |
| **License Status** | Classical algorithm + modern implementations (MIT) |
| **Experiment Required** | YES — Pareto curves quality vs cost |
| **Priority** | P0 |

### 7. Silhouette-Aware Rescue
| Field | Value |
|-------|-------|
| **Papers** | Silhouette-aware image warping (various, 2015-2023) |
| **Problem Solved** | Coarse geometry + good silhouette warping ≈ expensive dense geometry for some scenes |
| **Relevant Project** | SHARED (render) |
| **Current Equivalent** | None |
| **Suggested Operator** | `SilhouetteRescueWarper` |
| **Expected Benefit** | VISUAL +0.10 (for specific scenes), PERFORMANCE +0.50 |
| **Expected Cost** | Low-Medium (2D warping) |
| **Potential Redundancy** | Only for specific scene classes |
| **Potential Synergy** | `DepthProvider` (coarse), `NormalEstimator` |
| **Potential Rescue** | Rescues expensive dense reconstruction for hall-like scenes |
| **Implementation Type** | INDEPENDENT |
| **License Status** | Research reference |
| **Experiment Required** | YES — scene class detection + ablation |
| **Priority** | P0 |

### 8. GSNSR Appearance/Geometry Separation
| Field | Value |
|-------|-------|
| **Paper** | GSNSR (Gaussian Splatting + Neural Surface Reconstruction) |
| **Problem Solved** | Appearance (view-dependent) ≠ Geometry (solid) — don't conflate |
| **Relevant Project** | SHARED (representation) |
| **Current Equivalent** | SparseField (geometry) + separate appearance (planned) |
| **Suggested Operator** | `AppearanceGeometrySeparator` |
| **Expected Benefit** | FUNCTION +0.20 (collision ≠ appearance), WORLD_TRUTH +0.15 |
| **Expected Cost** | Medium (representation design) |
| **Potential Redundancy** | Architectural — affects all downstream |
| **Potential Synergy** | `GaussianRepresentation`, `SDFBuilder` |
| **Potential Rescue** | Prevents Gaussian→collision errors |
| **Implementation Type** | ARCHITECTURAL |
| **License Status** | Paper + code (MIT) |
| **Experiment Required** | YES — collision vs appearance benchmarks |
| **Priority** | P0 |

### 9. Point/GS Representation Reduction
| Field | Value |
|-------|-------|
| **Papers** | 3DGS compression surveys, GPU LOD generation, dictionary learning |
| **Problem Solved** | 20MB point cloud / 3DGS → how far can we reduce before quality drops? |
| **Relevant Project** | SHARED (representation budgets) |
| **Current Equivalent** | `RepresentationManager` + `MeshOptimizer` (classical) |
| **Suggested Operators** | `PointCloudReducer`, `GSCompressor`, `DictionaryCompressor` |
| **Expected Benefit** | PERFORMANCE +0.50, STORAGE +0.60 |
| **Expected Cost** | Medium-High (multiple techniques) |
| **Potential Redundancy** | Multiple overlapping techniques |
| **Potential Synergy** | `AppearanceDrivenSimplifier`, `RepresentationOptimizer` |
| **Potential Rescue** | Classical optimization often beats neural |
| **Implementation Type** | INDEPENDENT (multiple) |
| **License Status** | Mixed (MIT, Apache-2.0, some NC) |
| **Experiment Required** | YES — systematic ablation |
| **Priority** | P0 |

---

## P0 — SWIFT (Motion)

### 10. IK-GAT Position→Rotation
| Field | Value |
|-------|-------|
| **Paper** | IK-GAT (Inverse Kinematics Graph Attention Transformer) |
| **Problem Solved** | 3D joint positions → actual bone rotations (constraints + IK) |
| **Relevant Project** | SWIFT |
| **Current Equivalent** | None (positions only) |
| **Suggested Operator** | `PositionToRotationIK` |
| **Expected Benefit** | MOTION_QUALITY +0.30, CONTACT_CORRECTNESS +0.25 |
| **Expected Cost** | Medium (graph + IK solver) |
| **Potential Redundancy** | None |
| **Potential Synergy** | `ContactDetector`, `MotionJitterReducer` |
| **Potential Rescue** | Deterministic IK beats learned for simple chains |
| **Implementation Type** | INDEPENDENT |
| **License Status** | Paper + code (MIT) |
| **Experiment Required** | YES — compare against naive quaternion fitting |
| **Priority** | P0 |

### 11. Adaptive Confidence-Aware Smoothing
| Field | Value |
|-------|-------|
| **Papers** | ContactVision, Pose-to-Motion, adaptive filtering |
| **Problem Solved** | Slow/low-confidence motion → stronger smoothing; fast intentional → preserve |
| **Relevant Project** | SWIFT |
| **Current Equivalent** | None (simple EMA only) |
| **Suggested Operator** | `AdaptiveMotionSmoother` |
| **Expected Benefit** | MOTION_JITTER -0.40, INTENTIONAL_MOTION_PRESERVED |
| **Expected Cost** | Low (per-frame filter) |
| **Potential Redundancy** | None |
| **Potential Synergy** | `ContactDetector`, `IKSolver` |
| **Potential Rescue** | Replaces heavy temporal models |
| **Implementation Type** | INDEPENDENT |
| **License Status** | Research reference |
| **Experiment Required** | YES — velocity/confidence ablation |
| **Priority** | P0 |

### 12. Contact Detection
| Field | Value |
|-------|-------|
| **Papers** | ContactVision, various foot-contact papers |
| **Problem Solved** | Foot contact, heel/toe, ground lock — critical for perceived quality |
| **Relevant Project** | SWIFT |
| **Current Equivalent** | None |
| **Suggested Operator** | `ContactDetector` |
| **Expected Benefit** | MOTION_QUALITY +0.25, FOOT_LOCK +0.40 |
| **Expected Cost** | Low-Medium (per-frame classification) |
| **Potential Redundancy** | None |
| **Potential Synergy** | `IKSolver`, `MotionSmoother`, `PhaseDetector` |
| **Potential Rescue** | Enables contact-aware IK |
| **Implementation Type** | INDEPENDENT |
| **License Status** | Mixed (MIT, some NC) |
| **Experiment Required** | YES — contact precision/recall |
| **Priority** | P0 |

---

## P1 — Next Tier

### 13. GS-2M Material-Aware Geometry
| Field | Value |
|-------|-------|
| **Paper** | GS-2M (Gaussian Splatting 2.0 with Material) |
| **Problem Solved** | Multi-view disagreement → material signal (glass, glossy, reflective) not geometry error |
| **Relevant Project** | SHARED (geometry + material) |
| **Current Equivalent** | None |
| **Suggested Operator** | `MaterialAwareGeometry` |
| **Expected Benefit** | GEOMETRY +0.15 (glass/metal), WORLD_TRUTH +0.10 |
| **Expected Cost** | High (photometric optimization) |
| **Potential Redundancy** | Overlaps with `MaterialExtractor` |
| **Potential Synergy** | `AppearanceGeometrySeparator`, `ReflectiveSurfaceHandler` |
| **Implementation Type** | INDEPENDENT |
| **License Status** | Paper + code (MIT) |
| **Experiment Required** | YES — reflective surface benchmarks |
| **Priority** | P1 |

### 14. Semantic UVs
| Field | Value |
|-------|-------|
| **Paper** | "Semantic UV Mapping to Improve Texture Inpainting for 3D Scanned Indoor Scenes" |
| **Problem Solved** | Different semantic surfaces (wall, floor, pillar) need different UV handling |
| **Relevant Project** | BEUTELTIER (texture pipeline) |
| **Current Equivalent** | Naive UV unwrapping |
| **Suggested Operator** | `SemanticUVMapper` |
| **Expected Benefit** | TEXTURE_CONSISTENCY +0.20, VISUAL +0.10 |
| **Expected Cost** | Medium |
| **Potential Redundancy** | None |
| **Potential Synergy** | `TextureStationarizer`, `MultiViewTextureFuser` |
| **Implementation Type** | INDEPENDENT |
| **License Status** | Paper + code (MIT) |
| **Experiment Required** | YES — UV distortion metrics |
| **Priority** | P1 |

### 15. Piecewise-Planar Indoor Reconstruction
| Field | Value |
|-------|-------|
| **Papers** | Multiple (PlaneNet, PlaneRCNN, structured indoor) |
| **Problem Solved** | Indoor = planar surfaces + sparse details — exploit for accuracy |
| **Relevant Project** | SHARED + BEUTELTIER |
| **Current Equivalent** | Partial (RANSAC plane fitting) |
| **Suggested Operator** | `PlanarIndoorReconstructor` |
| **Expected Benefit** | GEOMETRY +0.20 (planar regions), FUNCTION +0.15 |
| **Expected Cost** | Medium |
| **Potential Redundancy** | Extends `PlaneFitter`, `IndoorStructureExtractor` |
| **Potential Synergy** | `RoomGraphBuilder`, `PortalDetector` |
| **Implementation Type** | INDEPENDENT |
| **License Status** | Multiple papers |
| **Experiment Required** | YES |
| **Priority** | P1 |

### 16. Hierarchical Room Graphs
| Field | Value |
|-------|-------|
| **Papers** | Panorama-derived room connectivity, hierarchical scene graphs |
| **Problem Solved** | Building → Hall → Level → Region → Structure/Object/Portal hierarchy |
| **Relevant Project** | SHARED (world graph) + BEUTELTIER |
| **Current Equivalent** | SceneGraph (flat) |
| **Suggested Operator** | `HierarchicalSceneGraphBuilder` |
| **Expected Benefit** | FUNCTION +0.25 (navigation), WORLD_TRUTH +0.15 |
| **Expected Cost** | Medium |
| **Potential Redundancy** | Extends `SceneGraph` |
| **Potential Synergy** | `NavigationBuilder`, `PortalDetector` |
| **Implementation Type** | ARCHITECTURAL |
| **License Status** | Research reference |
| **Experiment Required** | YES |
| **Priority** | P1 |

### 17. 3DGS Compression / Culling
| Field | Value |
|-------|-------|
| **Papers** | 3DGS compression surveys, occlusion culling, adaptive LOD |
| **Problem Solved** | 3DGS models too large for web/mobile |
| **Relevant Project** | SHARED (representation) |
| **Current Equivalent** | `RepresentationManager` (budget only) |
| **Suggested Operators** | `GSCuller`, `GSLODGenerator`, `GSCompressor` |
| **Expected Benefit** | PERFORMANCE +0.40, STORAGE +0.50 |
| **Expected Cost** | Medium-High |
| **Potential Redundancy** | Overlaps with `PointCloudReducer` |
| **Potential Synergy** | `AppearanceDrivenSimplifier`, `RepresentationOptimizer` |
| **Implementation Type** | INDEPENDENT |
| **License Status** | Mixed (MIT, some NC) |
| **Experiment Required** | YES |
| **Priority** | P1 |

### 18. Hatching / Hybrid Stylization
| Field | Value |
|-------|-------|
| **Papers** | "Enhanced Cartoon and Comic Rendering", "Hybrid-Space Localized Stylization", "High Quality Hatching" |
| **Problem Solved** | Borderlands-like style = geometry + material + selective lines + hatching, not just outline filter |
| **Relevant Project** | BEUTELTIER (render) |
| **Current Equivalent** | Basic post-process outline |
| **Suggested Operators** | `HybridLineSystem`, `HatchingRenderer`, `StylizedNormalResponse` |
| **Expected Benefit** | VISUAL +0.30 (style fidelity), STABILITY +0.15 |
| **Expected Cost** | Medium-High (multi-pass) |
| **Potential Redundancy** | Architectural — render pipeline |
| **Potential Synergy** | `EmissiveSeparator`, `StylizedNormalResponse` |
| **Implementation Type** | ARCHITECTURAL |
| **License Status** | Research reference |
| **Experiment Required** | YES — line stability under motion |
| **Priority** | P1 |

### 19. Motion In-Betweening / Retargeting
| Field | Value |
|-------|-------|
| **Papers** | ReConForM, PartwiseMPC, long-term motion in-betweening |
| **Problem Solved** | Keyframe → continuous motion with constraints |
| **Relevant Project** | SWIFT |
| **Current Equivalent** | None (stored keyframes only) |
| **Suggested Operator** | `MotionInbetweener` |
| **Expected Benefit** | MOTION_FLUIDITY +0.25, STORAGE -0.50 |
| **Expected Cost** | Medium |
| **Potential Redundancy** | None |
| **Potential Synergy** | `IKSolver`, `PhaseDetector`, `ContactDetector` |
| **Implementation Type** | INDEPENDENT |
| **License Status** | Mixed |
| **Experiment Required** | YES |
| **Priority** | P1 |

---

## P2 / Experimental

### 20. Crowd Environment Optimization
| Field | Value |
|-------|-------|
| **Papers** | Crowd navigation authoring, walkability optimization |
| **Problem Solved** | Routing cost depends on expected crowd, bottlenecks, barriers |
| **Relevant Project** | BEUTELTIER (future) |
| **Current Equivalent** | None |
| **Suggested Operator** | `CrowdRoutingOptimizer` |
| **Expected Benefit** | FUNCTION (navigation) +0.15 |
| **Expected Cost** | High (simulation) |
| **Implementation Type** | EXPERIMENTAL |
| **Priority** | P2 |

### 21. Advanced Graph Drawing
| Field | Value |
|-------|-------|
| **Papers** | Hierarchical edge routing, edge bundling, 3D graph layouts |
| **Problem Solved** | Large project graphs remain understandable |
| **Relevant Project** | MANIFOLD |
| **Current Equivalent** | None |
| **Suggested Operator** | `GraphLayoutEngine` |
| **Expected Benefit** | MANIFOLD_QUALITY +0.30 |
| **Implementation Type** | INDEPENDENT |
| **Priority** | P2 |

### 22. Learned Residual Specialists
| Field | Value |
|-------|-------|
| **Pattern** | Heavy model → analyze → deterministic replacement → learn residual |
| **Problem Solved** | Don't learn what math/geometry already solves |
| **Relevant Project** | SHARED / SWIFT |
| **Current Equivalent** | None systematic |
| **Suggested Operator** | `ResidualLearner` (meta-operator) |
| **Expected Benefit** | Runtime -80% for replaced ops |
| **Implementation Type** | META |
| **Priority** | P2 |

---

## License Summary

| License Type | Count | Notes |
|--------------|-------|-------|
| MIT / Apache-2.0 / BSD | ~12 | Safe for direct integration |
| Academic (code available) | ~8 | Implement independently |
| Paper only (no code) | ~5 | Implement from description |
| Custom / NC / Unknown | ~3 | DO NOT SHIP without review |

---

## Implementation Type Distribution

| Type | Count | Description |
|------|-------|-------------|
| INDEPENDENT | 14 | New operator, no architectural coupling |
| ARCHITECTURAL | 4 | Affects core design (render, representation, graph) |
| META | 1 | Operates on other operators |
| TEACHER | 0 | Not yet identified |
| REFERENCE | 3 | Inspiration only |

---

## Recommended Experiment Order

1. **TextureStationarizer** (P0, low risk, high visual impact)
2. **MultiViewTextureFuser** (P0, synergizes with above)
3. **PaletteNormalizer** (P0, extends existing intrinsic)
4. **CoverageEstimator** (P0, critical for world truth)
5. **IndoorStructureExtractor** (P0, hall-first priority)
6. **AppearanceDrivenSimplifier** (P0, budget-critical)
7. **PositionToRotationIK** (P0 SWIFT, motion quality)
8. **AdaptiveMotionSmoother** (P0 SWIFT, low cost)
9. **ContactDetector** (P0 SWIFT, enables IK)
10. **SilhouetteRescueWarper** (P0, scene-class conditional)

---

## Cross-Reference: Operator Registry Seeds

These should be registered in `OperatorRegistry` with metadata matching `OperatorMetadataSchema`:

```javascript
registry.register({
  id: 'TextureStationarizer',
  version: '1.0.0',
  description: 'Turn photographed patch into tileable texture preserving material character',
  category: 'texture',
  inputs: ['rgb_patch', 'mask', 'camera_pose'],
  outputs: ['tileable_texture', 'stationarization_metadata'],
  parameters: { /* ... */ },
  license: 'ACADEMIC',
  substitutes: [],
  rescues: ['manual_texture_cleanup'],
  synergies: ['MultiViewTextureFuser', 'PaletteNormalizer'],
  experimentRequired: true,
  priority: 0
});
// ... etc for all P0 operators
```