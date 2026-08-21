# SHADED Experimental Operator Donor Matrix (EG_DONOR_MATRIX)

> For every discussed paper/concept, map: Paper → Problem solved → Relevant project →
> Current equivalent → Suggested operator → Expected benefit → Expected cost →
> Potential redundancy → Potential synergy → Potential rescue relation →
> Implementation type → License status → Experiment required → Priority.

**Relevant project must be one of:** SHADED | BEUTELTIER | SWIFT | MANIFOLD | SHARED RESEARCH | IGNORE

**Matrix legend (disposition):** KEEP DEFAULT | KEEP CONDITIONAL | OFF BY DEFAULT |
RESEARCH ONLY | TEACHER ONLY | REPLACE | REDUNDANT | SUBSTITUTABLE | NEGATIVE CONTRIBUTION | REMOVE

**Priority:** P0 (immediate) | P1 (next) | P2 (experimental) | P3 (distant)

---

## A. Depth

| Paper | Problem | Project | Current equivalent | Operator | Benefit | Cost | Redundancy | Synergy | Rescue | Impl type | License | Experiment | Priority |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| **Depth Anything V2** | Monocular depth from single image; metric-ambiguous | SHADED | `MonocularDepthProvider` (wrapper) | `DepthProvider` | Real depth for photo-first scenes | Torch+CUDA runtime, ~1-2s inference | Overlaps with DA-V3 | Feeds SpatialMemory anchors | Cheap software fallback rescues missing CUDA | External provider (wrapper) | Apache-2.0 (model: MIT) | Compare V2 vs V3 depth quality on 5 hall scenes | P0 |
| **Depth Anything V3** | Same as V2, improved architecture | SHADED | `MonocularDepthProvider` (wrapper) | `DepthProvider` | Better depth edges, fewer artifacts | Torch+CUDA runtime | Overlaps DA-V2 | Same | Same | External provider (wrapper) | MIT | Same comparison | P0 |
| **DA-Flow** | Temporal-consistent depth from video | SHADED | — | `DepthProvider + TemporalFusion` | Reduces jitter in depth video | 2× inference + tracking | DA V2/V3 alone | With SpatialMemory (frames as keyframes) | DA V2 alone rescues missing temporal | External (research only) | MIT | Synthetic moving camera, 5 scenes | P1 |
| **MiDaS-DPT** | Dense prediction transformer | SHADED | — | (alternative `DepthProvider`) | Transformer-quality depth | Larger model, GPU memory | DA-V3 | Same input/output contract | Software-depth fallback | External (alternative) | MIT | Same scene comparison | P2 |
| **BM-Decolma** | Multi-view depth fusion | SHADED | — | `MultiViewDepthFusion` | Resolves occluded surfaces | Requires multi-view | DA single-view | DepthProvider (each view) + CompletionProvider | Single-view DA rescues missing views | Independent impl | GPL-3 (study only, no code copy) | 3-view synthetic benchmark | P2 |
| **NeRF / Mip-NeRF 360** | Volumetric novel views | SHADED | — | `NovelViewSynthesizer` (teacher only) | Unobserved view synthesis | Very slow, GPU memory heavy | Gaussian representation | DepthProvider + CompletionProvider | 2.5D depth parallax rescues missing views | External (teacher only) | Apache-2.0 | Held-out view quality on 10 scenes | P2 |
| **VGGT** | Single/multi-view 3D reconstruction (depth+camera+points) | SHADED | `DepthProvider` (DepthAnything) | `VGGTDepthProvider` | Depth + predicted camera intrinsics/extrinsics + point map in one pass | Torch+CUDA, vggt package | DepthAnything V3 | SpatialMemory (frames as keyframes) | DA-V3 single-view | External provider (wrapper) | Apache-2.0 | Compare depth+pose accuracy vs DA-V3 on 5 hall scenes | P0 |
| **MapAnything Distance Matrix** | Geospatial routing optimization (7,500×7,500, 9 traffic windows) | SHADED | — | `MapAnythingGeospatialProvider` | Travel-time/depth raster + waypoint anchors + route headings as normals | REST API (commercial), no ML | HallPlanner (floor plans) | DepthProvider, SpatialMemory | GeoJSON-only fallback | External provider (REST) | Commercial | Validate route rasterisation on Charlotte test fixture | P1 |

## B. Point Cloud / Gaussians
| **GS-2M** | Material-aware geometry from multi-view disagreement | SHADED | — | `MaterialDisagreementSignal` | Glass/glossy/metal detection from cross-view | Cross-view inference needed | Gaussian repr | GaussianRepresentation (same point source) | Smooth-shading fallback | Research concept (no code) | Unknown | Synthetic glass/metal/multi-view | P1 |
| **GSNSR** | Super-resolution for 3D Gaussians | SHADED | — | `GaussianUpsampler` | Reduce Gaussian count at distance | 2× GS render resolution | GaussianRepresentation | Same point source | Downsampled GS rescues compute | Research concept | Unknown | GS count vs visual quality | P2 |
| **Spherical Fusion** | Point fusion from multiple depth maps | SHADED | `SpatialMemory` (stub registrar) | `SparseVoxelFusion` | Deduplicate, resolve conflicts | Registration overhead | SpatialMemory + SparseField | Same observation ingestion | Single-depth DA V3 | Independent impl | MIT | 3-view fusion accuracy | P1 |
| **Open3D (voxel down-sample)** | Sparse voxel octree from points | SHADED | `SparseVoxelWorld` (legacy) | `SparseVoxelOctree` | Hierarchical storage, LOD | Memory restructure | SparseField (current) | SparseField bridge | SparseField rescues flat map | Wrapper (reuse) | MIT | Voxel resolution vs memory | P2 |
| **Li-GS / GP-GS** | Geometry-plus-photometry Gaussians | SHADED | — | `GaussianAppearanceRep` | Better relighting | Larger attribute set | GaussianRepresentation | Same | SDF mesh rescues | Research concept | — | GS vs SDF quality | P2 |

## C. Surface Reconstruction

| Paper | Problem | Project | Current equivalent | Operator | Benefit | Cost | Redundancy | Synergy | Rescue | Impl type | License | Experiment | Priority |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| **TRELLIS** | Image-to-3D via multi-view diffusion | SHADED | `CompletionProvider` (stub) | `ImageTo3DCompletion` | Unseen surface completion | Slow inference, large | SDF geometry | SparseField (observed points) | 2.5D depth-only rescues | External provider (optional) | MIT | Completion coverage vs hallucination | P0 |
| **Zero-123+** | Multi-view synthesis from single image | SHADED | `CompletionProvider` (stub) | `ImageTo3DCompletion` (alt) | Alternative completion | Same as TRELLIS | TRELLIS | Same | Same | External provider (optional) | Apache-2.0 | Same comparison | P1 |
| **MoGe-3** | 3D-aware geometry from single image | SHADED | `spatial-reconstruction.mjs` (image adjacency) | `GeometryNeighbourhood` upgrade | 3D spatial neighbourhood rejects false 2D neighbours | CPU cost of voxel hashing | existing PCA normals | SpatialMemory (observation chain) | Existing PCA | Independent impl | MIT | Compare old vs new neighbourhood on stairs | P0 |
| **Pixel2Mesh++** | Single-image mesh generation | SHADED | — | `PhotoSurfaceRepresentation` | Direct mesh from image | Training-dependent | SDF primitives | DepthProvider (input) | Point-cloud rescues | Research concept | Apache-2.0 | Mesh quality on chairs | P2 |
| **Occupancy Networks** | Implicit surface from points | SHADED | `SdfGeometry` (analytic SDF) | `SDFBuilder` | Smooth implicit surfaces | Voxel grid resolution | SDF primitives | SparseField (points) | SDF primitives | Independent impl | MIT | Occupancy vs SDF accuracy | P2 |
| **Neuralangelo / VolSDF** | Volumetric surface + neural texture | SHADED | — | `NeuralSurfaceRep` (teacher) | High-fidelity surfaces | Very slow training/inference | SDF mesh | SDFBuilder | SDF mesh | Teacher only | MIT | Synthetic shape benchmarks | P3 |
| **DeepSim / DeepSim2** | Dense correspondence matching | SHADED | `patch-registration.mjs` | `DenseCorrespondenceRefiner` | Improve registration accuracy | Matching cost | PatchRegistrar (coarse) | PatchRegistrar | PatchRegistrar coarse→rescue | Independent impl | MIT | Registration residual reduction | P2 |

## D. Indoor / Structure

| Paper | Problem | Project | Current equivalent | Operator | Benefit | Cost | Redundancy | Synergy | Rescue | Impl type | License | Experiment | Priority |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| **Primitive-driven reconstruction** | Indoor via planes/boxes | SHADED | `fitGeometricPrimitivesExtended` (plane/box/cyl) | `PrimitiveFitter` | Plane/box/cylinder primitives | Small | SDF geometry | SparseField (points) | RANSAC plane | Already impl (upgrade) | Internal | Add sphere/capsule, test room accuracy | P0 |
| **GraphCut partitioning** | Space partitioning into rooms | SHADED | — | `SpacePartitioner` | Floor/plan/semantic regions | Graph cut cost | ConstraintGraph | SceneGraph (structure) | Depth-only | Independent impl | MS-PL | Room boundary Jaccard | P1 |
| **Piecewise planar** | Planar indoor reconstruction | SHAFED | `fitGeometricPrimitivesExtended` | `PiecewisePlanarFitter` | Wall/floor/ceiling decomposition | Plane merging overhead | PrimitiveFitter | Wall anchors (Runde 5) | Single-plane fit | Research concept | MIT | Plane coverage vs wall area | P1 |
| **RoomRunner / LayoutNet** | Room layout estimation | BEUTELTIER | — | `HallPlanner` | Hall structure from plan/photo | Layout parser | `hall-plan/` modules | DepthProvider, SceneGraph | 2.5D parallax | Integrate existing | MIT | Hall volume accuracy | P0 |
| **HoloNet** | Panorama → room connectivity | SHADED | — | `PanoramaToConnectivity` | Connect adjacent rooms | Panorama input only | HallPlanner | DepthProvider | Floor plan | Research concept | Unknown | Connectivity accuracy | P2 |
| **TSDF Fusion** | Volumetrische Rekonstruktion aus mehreren Depth-Maps | SHADED | `SparseField` (einzelne Frames) | `TSDFFusion` | Wasserdichtes Mesh, rauschrobust durch Multi-View-Aggregation | Voxel-Gedächtnis + Marching-Cubes-Kosten | DepthProvider (einzeln) | SparseField (punktweise) | 2.5D Parallaxen | Independent impl (Open3D bridge) | MIT | Compare TSDF vs PointCloud-Fusion on 3 multi-view hall scenes | P0 |
| **Marching Cubes** | implizite Oberflächenextraktion aus Voxelgrid | SHADED | — | (integrated in TSDFFusion) | Glattes, wasserdichtes Mesh von TSDF | Topologie-Artefakte (Säbelzähne) | TSDFFusion | SparseField | Rohe Punktwolke | Library (Open3D) | MIT | Mesh-Qualität vs Rekonstruktions-Parameter | P1 |
| **RANSAC Plane-Fitting** | Segmentierung in Wände/Boden/Decke aus Punktwolke | SHADED | `fitGeometricPrimitivesExtended` (plane/box) | `PlanarSpaceSegmenter` | Robuste Raumgeometrie, rauschunempfindlich | Parameterempfindlich (distanz, winsize) | TSDFFusion | HallPlanner | Rohe Schnittpunkte | Library (Open3D/PROSAC) | MIT | Wand/Boden-Klassifikation vs Klassenzählung | P0 |
| **Screened Poisson** | Rekonstruktion aus orientierter Punktwolke | SHADED | — | `PoissonSurfaceReconstructor` | Glattes, wasserdichtes Mesh (breiter als MC) | Übergeneralisierung in dünnen Wänden | TSDFFusion | HallPlanner | Rohe Punktwolke | Library (Open3D) | MPL-2.0 | Mesh-Dichte vs Übergeneralisierung | P1 |
| **Room Envelopes** | Feed-forward Layout-Pointmaps (entfernt Möbel/Aufbauten) | SHADED | — | `FeedForwardLayoutEstimator` | Direkte Raumgrenzen ohne Ebenen-Pipeline | Trainingsdaten-Abstimmung | PlanarSpaceSegmenter | TSDFFusion | 2.5D Parallaxen | External provider (wrapper) | Apache-2.0 | Layout-IoU vs RANSAC-Pipeline auf 5 Szenen | P1 |
| **WallNet / PlaneNet** | Feed-forward Wandsegmentierung aus RGB-D | SHADED | — | (variante von FeedForwardLayoutEstimator) | Single-shot Layout-Prediction | Einschränkung auf bekannte Layouts (3/5-Freiheitsgrade) | Room Envelopes | PlanarSpaceSegmenter | COLMAP | External provider (wrapper) | MIT | Layout-Accuracy vs Ground-Truth-Höhen | P1 |
| **Directional TSDF** | TSDF mit Normaleninformation für kohärente Meshes | SHADED | — | (extension of TSDFFusion) | Reduziert Säbelzähne in Marching-Cubes | Erweiterte Voxelrepräsentation | TSDFFusion | SparseField | Rohe Punktwolke | Independent impl (study) | Apache-2.0 (original) | Mesh-Artefaktfrequenz | P2 |
| **Diffusion-Driven Surface Separation** | Trennung von Innen-/Außensurface aus Punktwolke | SHADED | — | `SurfaceSeparator` | Trennt Wandinnen- von Außenflächen | Iterative Optimierung | TSDFFusion | SparseField | Single-surface TSDF | Research concept | Apache-2.0 | Trennungsgenauigkeit auf 3 Szenen | P2 |
| **Point Cloud Fusion** | Aggregierte Punktwolke aus mehreren Views | SHADED | `SparseField` (einzelne Frames) | `SparseVoxelFusion` (enhanced) | Einfacher als TSDF, direkte Punktwolke | Weniger rauschrobust (keine Implizitheität) | TSDFFusion | DepthProvider | Rohe Punktwolke | Independent impl | MIT | Vergleich Qualität TSDF-vs-PointFusion | P1 |

## E. Materials & Lighting

| Paper | Problem | Project | Current equivalent | Operator | Benefit | Cost | Redundancy | Synergy | Rescue | Impl type | License | Experiment | Priority |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| **Intrinsic decomposition (Retinex / IntrinsicNet / AdaIN)** | Decompose image into albedo + shading | SHADED | `decomposeIntrinsicBaseline()` (analytical) | `IntrinsicDecomposer` | Separate baked lighting from material | Torch inference if neural | Analytical baseline | Shading field (Unit 8) | Identity-albedo (setStrength=0) | Replace analytical with neural (teacher) | Apache-2.0 | Albedo reconstruction PSNR vs baseline | P0 |
| **De-Lighter** | Remove illumination, recover albedo | SHADED | — | `IntrinsicDecomposer` (impl) | Clean albedo extraction | Torch inference | Analytical baseline | Intrinsic decomposition | Identity-albedo | Independent impl | MIT | Albedo vs ground truth (synthetic) | P1 |
| **MaterialX / OpenPBR** | Standardized material description | SHADED | CLAUDE.md §1.6 (OpenPBR vocab) | `MaterialDescriptor` | Interoperable material definitions | Mapping overhead | current PALETTE | Material extraction | Current palette | Schema (no impl) | Apache-2.0 | PBR channel fidelity | P2 |
| **Texture Stationarization** | Tileable textures from photos | BEUTELTIER | — | `TextureStationarizer` | Reusable hall textures | Seam detection | PaletteNormalizer | Material extraction | Manual crop | Independent impl | MIT | Repetition threshold measure | P0 |
| **Seamless Multi-Texturing** | Blend multi-photo surfaces | BEUTELTIER | — | `MultiViewTextureFuser` | No seams across photos | Registration + blending | TextureStationarizer | Material extraction | Single photo | Independent impl | MIT | Seam visibility metric | P0 |
| **Recolorable Posterization** | Stable material palette across views | SHADED | `PALETTE` (fixed 8 colors) | `PaletteNormalizer` | Canonical colors per material | Palette estimation | Current PALETTE | Intrinsic decomposition | Identity-albedo | Replace/enhance PALETTE | Internal | Color consistency across 5 views | P0 |
| **SVBRDF recovery (BML / SIRF)** | Full BRDF + roughness + normal | SHADED | — (no BRDF yet) | `SVBRDFReconstructor` | Relightable materials | Multi-light capture | Current shading term | Intrinsic decomposition | Flat shading | Research concept | Various | Relighting error | P2 |
| **Neural Texture Transfer** | Transfer texture between surfaces | BEUTELTIER | — | (not needed) | — | — | — | — | — | IGNORE | — | — | — |

## F. Stylized Rendering

| Paper | Problem | Project | Current equivalent | Operator | Benefit | Cost | Redundancy | Synergy | Rescue | Impl type | License | Experiment | Priority |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| **Enhanced Cartoon Rendering** | Edge + shading for comics | SHADED | — | `HybridLineRenderer` | Selective screen-space + surface-space lines | Edge detection cost | SDF geometry | SDF geometry (silhouettes) | Flat polygon edges | Independent impl | MIT | Line stability under camera motion | P1 |
| **Hybrid-Space Stylization** | Local stylization in screen/obj space | SHADED | — | `HybridLineRenderer` (extension) | Context-aware stylization | Multi-space sampling | HybridLineRenderer | SDF geometry | Single-space lines | Independent impl | MIT | Stylization coherence metric | P2 |
| **High-Quality Hatching** | Hatching via curvature | SHADED | — | `HatchingOperator` | Curvature-based hatching | Curvature estimation | HybridLineRenderer | SDF geometry | Flat cross-hatch | Independent impl | MIT | Hatching vs flat shade | P2 |
| **Borderlands-style cel shading** | Comic/inked 3D look | SHADED | Shader terms (wet-gain, sheen) | `StylizedSurfaceShader` | Layered style (geometry, material, lines) | Shader complexity | Current shader terms | Material layer | Flat shading | Shader integration | Internal | Visual similarity to Borderlands | P1 |

## G. Representation / Simplification

| Paper | Problem | Project | Current equivalent | Operator | Benefit | Cost | Redundancy | Synergy | Rescue | Impl type | License | Experiment | Priority |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| **Appearance-Driven Simplification** | Optimize for visual, not just geometry | SHADED | `optimizeMesh` (greedy) | `AppearanceDrivenSimplifier` | Cheaper geometry, same visual | Edge-collapse cost matrix | Mesh pipeline | Material layer | Flat shading | Independent impl | MIT | Visual error vs poly count | P0 |
| **meshoptimizer** | Classical mesh optimization | SHADED | `mesh-pipeline.js` (reference impl) | `MeshOptimizer` | Production-grade optimization | Library dependency | Current reference | Mesh pipeline | Current impl | Library (meshopt) | MIT | Speed vs quality vs reference | P1 |
| **3DGS Compression (OPT/GS-Stack)** | Compress Gaussian representations | SHADED | — | `GaussianCompressor` | Reduce GS memory by 10-100× | Encoding/decoding cost | GaussianRepresentation | GaussianRepresentation | Downsample GS | Research concept | Various | Compression ratio vs FPS | P2 |
| **3DGS Occlusion Culling** | Cull invisible Gaussians | SHADED | — | `GaussianOcclusionCull` | Skip invisible Gaussians | Culling overhead | GaussianRepresentation | SparseField (frustum) | No culling | Independent impl | MIT | FPS vs cull ratio | P2 |
| **Point-Blank LOD** | Point cloud LOD generation | SHADED | — | `PointCloudLOD` | Multi-res point cloud | LOD transition management | SparseField | SparseField | Single-res | Independent impl | MIT | Point count vs visual gap | P2 |
| **Representation Budget** | Same world, 4 budgets | SHADED | `QualityBudget` (4 profiles) | `RepresentationManager` (existing) | GOLD/DESKTOP/WEB/MOBILE | Profile tuning | Current | All representation ops | — | Already impl (extend) | Internal | Profile coverage test | P0 |

## H. Simulation

| Paper | Problem | Project | Current equivalent | Operator | Benefit | Cost | Redundancy | Synergy | Rescue | Impl type | License | Experiment | Priority |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| **PhysX / Bullet** | Rigid body dynamics | SHADED | `ConstraintGraph` (static) | `PhysicalStabilizer` (optional backend) | Dynamic stabilization | Physics engine dep | ConstraintGraph | ConstraintGraph | Static constraints | Optional dep (rapier) | ZLib (rapier) | Constraint vs static resolution | P1 |
| **Phoenix FD / FumeFX** | Fluid simulation | SHADED | `surface-world-simulation.mjs` (grid) | `WorldSimulation` upgrade | Accurate fluid dynamics | GPU sim cost | Current grid sim | WorldFields | Current grid | Replace grid with sim | Research concept | Sim accuracy vs grid | P2 |
| **Adaptive velocity smoothing** | Jitter reduction | SWIFT | — | `MotionSmoother` | Reduce jitter on low-confidence | Frame delay | EMA / Savitzky-Golay | SpatialMemory | Raw joint positions | Independent impl | MIT | Jitter reduction metric | P0 |
| **IK-GAT** | Position→rotation conversion | SWIFT | — | `PositionToRotation` | Recover joint orientations | Graph neural net | Procedural IK | Contact detection | Raw positions | Research concept (use math) | Unknown | Rotation accuracy vs IK | P2 |
| **ContactVision** | Foot contact detection | SWIFT | — | `ContactDetector` | Foot lock, root stabilization | Vision model | BodyParser | Position→rotation | Raw positions | External (research) | Apache-2.0 | Contact accuracy on walking | P1 |
| **PartwiseMPC** | Part-wise motion planning | SWIFT | — | `PartwisePlanner` | Semi-independent limb planning | Cross-body coordination | Position→rotation | Contact detection | Whole-body model | Research concept | Unknown | Motion naturalness | P2 |
| **ReConForM** | Motion in-betweening | SWIFT | — | `MotionInterpolator` | Fill gaps between keyframes | Temporal consistency | Procedural motion | Position→rotation | Keyframes only | Independent impl | MIT | Interpolation smoothness | P2 |

## I. Navigation / Collision

| Paper | Problem | Project | Current equivalent | Operator | Benefit | Cost | Redundancy | Synergy | Rescue | Impl type | License | Experiment | Priority |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| **A* / Jump Point Search** | Grid pathfinding | SHADED | `aStarGrid` (kernel) | `NavigationBuilder` | Path planning with costs | Grid resolution | Dijkstra (legacy) | ConstraintGraph | Dijkstra | Already impl | Internal | A* vs Dijkstra length | P0 |
| **Recast/Detour** | Navmesh generation | SHADED | — | `NavigationBuilder` (mesh) | Triangle mesh navigation | Mesh rasterization | A* grid | SDF mesh | Grid pathing | Library | MIT | Navmesh vs grid accuracy | P2 |
| **TSDF + Marching Cubes** | Volumetric reconstruction | SHADED | `SdfGeometry` (analytic) | `SDFBuilder` | Smooth surfaces from observations | Voxel memory | SDF primitives | SparseField | Analytic SDF | Independent impl | MIT | Surface error vs analytic | P2 |
| **Dykstra projection** | Constraint satisfaction | SHADED | `dykstraProject` (index.html) | `ConstraintProjector` | Project onto convex sets | Iterative cost | ConstraintGraph | SparseField | Unconstrained voxels | Already impl | Internal | Project count vs constraint error | P0 |

## J. Perception / Multi-view

| Paper | Problem | Project | Current equivalent | Operator | Benefit | Cost | Redundancy | Synergy | Rescue | Impl type | License | Experiment | Priority |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| **COLMAP** | Structure-from-motion + MVS | SHADED | — | `StructureFromMotion` | Camera poses + sparse cloud | SfM pipeline | ReverseViewfinder (manual) | DepthProvider | Single view | Pipeline integration | GPL (study only) | SfM accuracy vs manual | P2 |
| **MVS / PatchMatchNet** | Multi-view stereo | SHADED | — | `MultiViewTextureFuser` | Dense depth + texture | Matching cost | DepthProvider | MultiViewTextureFuser | Single view | Research concept | Apache-2.0 | Texture seam visibility | P1 |
| **Semantic UV Mapping** | Per-surface UV handling | BEUTELTIER | — | `SemanticUVMapper` | Wall/floor/pillar specific UVs | UV seam management | TextureStationarizer | Material extraction | Default UV | Research concept | Unknown | Seam visibility metric | P1 |

## K. Graph / Workflow

| Paper | Problem | Project | Current equivalent | Operator | Benefit | Cost | Redundancy | Synergy | Rescue | Impl type | License | Experiment | Priority |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| **ManiLatte (Mani)** | Edge routing / bundling | MANIFOLD | — | `EdgeRouter` | Clean graph edges | Layout computation | SceneGraph | SceneGraph | Raw edges | Library (ManiLatte) | MIT | Edge length vs readability | P2 |
| **Graph drawing (Davidson-Harel)** | Force-directed layout | MANIFOLD | — | `GraphLayoutEngine` | Semantic graph layout | Force iteration | SceneGraph | SceneGraph | Adjacency list | Independent impl | MIT | Layout stability | P2 |
| **Provenance DAG** | Track run → operator → artifact → metric | SHADED | — | `ProvenanceTracker` | Experiment reproducibility | Metadata overhead | Experiment log | All operators | Raw logs | Independent impl | Internal | Provenance completeness | P0 |

## L. Provenance / Active Learning

| Paper | Problem | Project | Current equivalent | Operator | Benefit | Cost | Redundancy | Synergy | Rescue | Impl type | License | Experiment | Priority |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| **Bayesian Optimization** | Select useful experiments | SHADED | — | `BayesianSelector` | Minimize experiments for target | GP model cost | Random sampling | All operators | Exhaustive search | Independent impl | MIT | BO vs random regret | P2 |
| **Active Learning** | Focus on uncertainty | SHADED | — | `ActiveLearner` | High-value experiment selection | Uncertainty estimation | BayesianSelector | QualityPredictor | Exhaustive search | Research concept | — | Uncertainty calibration | P3 |

---

## H. Distraktor-Robuste Rekonstruktion (Besucher-, Aufbauten-Rauschen)

Diese Sektion gruppiert alle Verfahren, die explizit für Gebäudeanlagen-Rekonstruktion unter starkem temporärem Rauschen (laufende Besucher, temporäre Aufbauten, Fahrzeuge) entwickelt wurden. Sie gliedern sich nach Input-Typ und Reife.

| Paper / Tool | Problem | Project | Current equivalent | Operator | Benefit | Cost | Redundancy | Synergy | Rescue | Impl type | License | Experiment | Priority |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| **T-3DGS** | 3D Scene reconstruction removing transient distractors via uncertainty predictor + transient mask refiner | SHADED | — | `DistractorRobustGaussianRep` | Explicit transient-object filtering in dense indoor scenes | GPU memory + mask refinement overhead | GaussianRepresentation | DepthProvider, SparseField | SDG (flat) | Independent impl / paper reimpl | Apache-2.0 | Compare reconstruction quality with vs without visitors on DORF test scene | P0 |
| **SpotLessSplats (SLS)** | Robust Gaussian Splatting ignoring distractors via pretrained features + robust optimisation | SHADED | — | `DistractorRobustGaussianRep` (alt) | Unsupervised distractor rejection, no manual masks | Feature extraction cost, slower training | GaussianRepresentation | DepthProvider | Flat GaussianRep | Wrap SLS pipeline | Apache-2.0 | Benchmark SLS vs T-3DGS on visitor-heavy hall scenes | P0 |
| **RobustSplat** | Decouples densification from dynamics to reduce moving-object artefacts | SHADED | — | (config variant of DistractorRobustGaussianRep) | Artefact-free densification | Reduced density without dynamics | DistractorRobustGaussianRep | GaussianRepresentation | Flat GaussianRep | Config flag | Apache-2.0 | Ablation: densification-order impact | P1 |
| **Robust3DGaussians** | Adapts 3DGS against scene-distracting objects | SHADED | — | (config variant) | GitHub reference impl | Repo maturity | DistractorRobustGaussianRep | GaussianRepresentation | Flat GaussianRep | Wrap / study | Apache-2.0 | Study code patterns for integration | P1 |
| **GaussianMove** | Adaptive transparency via SAM masks for dynamic objects; replaces with static background | SHADED | — | `DynamicMaskInpainter` | Zero-transparency moving objects, background inpainting | SAM inference cost, needs mask propagation | GaussianRepresentation | DepthProvider | Inpainting fallback | Independent impl | Apache-2.0 | Validate on street-facing building facade with foot traffic | P1 |
| **DynamicFilter** | Online map+visibility-based dynamic object detection | SHADED | — | `DynamicMaskInpainter` (alt) | Map-consistent dynamic filtering | Stereo/SfM dependency | GaussianMove | DepthProvider | Manual mask | Wrap | Apache-2.0 (original CVPR 2022) | Compare filter recall on video walking-tour | P1 |
| **Generalized Dynamic Object Removal (stereo)** | Stereo-flow inconsistency detection for depth/intensity outlier isolation | SHADED | — | `DynamicMaskInpainter` (stereo) | Independent of reconstruction backend | Requires stereo input | DynamicFilter | DepthProvider | Manual mask | Reference impl | BSD-3 (original) | Test on synthetic stereo corridor with people | P2 |
| **dynamic-3d-object-removal** | Pure-numpy 3D bbox cropping + temporal voxel filtering for LiDAR point clouds | SHADED | — | (preprocessor for SparseField) | No GPU/Deep Learning, lightweight | LiDAR-only, not pure vision | SparseField | DepthProvider | None | Reference impl (numpy) | MIT | Validate on LiDAR+image fused scenes | P2 |
| **SeeingThroughClutter** | VLM-orchestrated iterative foreground removal from single images | SHADED | — | `SingleViewClutterRemover` | Single-image (no video needed) clutter removal | LLM/VLM inference cost | All depth pipelines | DepthProvider | Manual cleanup | Independent impl | Custom (research) | Test iterative removal quality on single photos of visitor scenes | P1 |
| **DG-SLAM** | Gaussian-Splatting visual-SLAM for dynamic indoor tracking + reconstruction | SHADED | — | `DynamicSLAMBackend` | Joint tracking + reconstruction under dynamics | SLAM pipeline complexity | GaussianRepresentation | DepthProvider | COLMAP (static) | Wrap / integrate | Apache-2.0 | Validate camera trajectory + reconstruction quality | P1 |
| **Scan-to-BIM roof reconstruction** | UAV photogrammetry → geospatially-constrained planarity → IFC | BEUTELTIER | `HallPlanner` | `BIMGeometryExtractor` | Structured Dach/Wand output (semantisch statt nur Mesh) | Requires geospatiale Footprints + Taubin-Glättung | HallPlanner | DepthProvider | 2.5D mesh | Bridge concept (reuse) | MIT | Extract roof faces from 5 UAV datasets | P1 |

## I. Klassische Photogrammetrie-Suiten

| Tool | Problem | Project | Current equivalent | Operator | Benefit | Cost | Redundancy | Synergy | Rescue | Impl type | License | Experiment | Priority |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| **RealityCapture** | End-to-end Mesh + Orthomosaic | SHADED | COLMAP | `PhotogrammetryPipeline` | Industry-grade accuracy, large scale | Commercial license | COLMAP | DepthProvider | 2.5D depth | Pipeline integration (external) | Commercial | Reference 500-image building survey | P2 |
| **COLMAP** | SfM + MVS toolchain | SHADED | — | `StructureFromMotion` (P2 matrix) | Open-source standard, well-documented | Single-threaded bottleneck | RealityCapture | DepthProvider | 2.5D depth | Pipeline integration (external) | GPL-3 (study only) | Compare COLMAP vs VGGT pose accuracy | P1 |
| **ContextCapture** | Automated dense matching + texture | SHADED | — | (alternative PhotogrammetryPipeline) | City-scale, auto-texture | Heavy compute | RealityCapture | DepthProvider | N/A | External pipeline | Commercial | Test on mega-city building block | P2 |
| **3DF Zephyr / OpenDroneMap** | Automated photogrammetry | SHADED | — | (alternative) | Drone imagery to 3D | Limited automation | COLMAP | DepthProvider | None | External pipeline | GPL (Zephyr) / MIT (ODM) | ODM vs COLMAP comparison | P2 |

---

## Disposition Summary

| Disposition | Count | Key items |
|---|---|---|
| KEEP DEFAULT | 8 | Current PALETTE, current shader, current analyze(), current actor system, current material layer, current world laws, SpatialKernel, SparseField, SceneGraph |
| KEEP CONDITIONAL | 5 | DepthAnything V2/V3, Gaussian Splatting, TRELLIS/Zero123+, meshoptimizer, multi-view |
| OFF BY DEFAULT | 4 | NeRF, Neuralangelo, Phoenix FD, Recast/Detour |
| RESEARCH ONLY | 15 | GSNSR, GS-2M, Pixel2Mesh, Open3D octree, Li-GS, DA-Flow, MiDaS-DPT, BM-Decolma, Holistic 3D, Hatching, Graph drawing, Bayesian opt, Active learning, RobustSplat, dynamic-3d-object-removal |
| TEACHER ONLY | 2 | NeRF (novel views), Neuralangelo (surface target) |
| REPLACE | 3 | Analytical intrinsic → neural intrinsic; Dijkstra → A* (kernel already done); legacy recon → MoGe-3 neighbourhood |
| REDUNDANT | 3 | Neural Texture Transfer, Occupancy Networks (vs SDF), GraphCut (vs HallPlanner) |
| SUBSTITUTABLE | 8 | DA-V2 ↔ DA-V3; SDF ↔ Occupancy; A* ↔ Dijkstra; Single-view ↔ Multi-view; Flat ↔ Hatching; Grid ↔ Navmesh; T-3DGS ↔ SLS (distraktor-robust); COLMAP ↔ RealityCapture |
| NEGATIVE CONTRIBUTION | 1 | Neural texture transfer (adds cost, no new benefit beyond existing pipeline) |
| REMOVE | 0 | (none yet — all candidates have some value) |

## Priority Groups

### P0 (High value, implement first)

1. **DepthAnything V2 vs V3** — Same provider contract, directly comparable. Determines baseline depth quality.
2. **VGGT (CVPR 2025)** — Single-pass depth + camera + points. Compare against DA-V3 baseline.
3. **MoGe-3 neighbourhood upgrade** — Fixes known `spatial-reconstruction.mjs` O(n²) / image-adjacency bug.
4. **PrimitiveFitter** — Extend `fitGeometricPrimitivesExtended` with sphere/capsule.
5. **HallPlanner integration** — Wire `hall-plan/` modules into the kernel SceneGraph.
6. **T-3DGS distractor-robust reconstruction** — Essential for visitor-heavy scenes.
7. **TSDF Fusion** — Replace risky point-cloud-intersection with volumetric reconstruction.
8. **RASAC Plane-Fitting** — Robust room segmentation (walls/floor/ceiling) from TSDF-filtered cloud.
9. **RepresentationBudget** — Already implemented; needs GOLD/DESKTOP/WEB/MOBILE validation.
10. **Intrinsic decomposition** — Neural provider as teacher; analytical remains default.

### P1 (Next after P0)

1. **MapAnything geospatial provider** — Route rasterisation as geometric constraint.
2. **SpotLessSplats (SLS)** — Alternative distractor-robust Gaussian representation.
3. **DG-SLAM** — Dynamic visual-SLAM for video walking-tours with people.
4. **GaussianMove (SAM masks)** — Dynamic object transparency + inpainting.
5. **SeeingThroughClutter** — VLM iterative single-image clutter removal.
6. **BIMGeometryExtractor** — Scan-to-BIM structured roof/wall extraction.
7. **COLMAP** — Reference SfM/MVS for pose comparison.
8. **3D Gaussian Splatting** — Full GS representation, optional rendering backend.
9. **TRELLIS/Zero-123+** — Completion provider (optional, not canonical truth).
10. **TextureStationarizer** — Tileable hall textures from photos.
11. **MultiViewTextureFuser** — Seam-free multi-photo blending.
12. **PaletteNormalizer** — Canonical material palette across views.
13. **Appearance-Driven Simplification** — Visual-lossless geometry reduction.
14. **HybridLineRenderer** — Borderlands-style selective line rendering.
15. **ContactVision** — SWIFT foot contact detection.
16. **DynamicFilter** — Online map+visibility-based dynamic detection.
17. **A* vs Dijkstra** — Already implemented in kernel; compare on real scenes.

### P2 / Experimental

1. **GS-2M** — Material-aware geometry from multi-view disagreement.
2. **GSNSR / GS compression** — Reduce Gaussian count and memory.
3. **Neuralangelo / VolSDF** — Teacher for surface targets.
4. **Phoenix FD** — Fluid simulation (replace grid sim).
5. **Recast/Detour** — Navmesh navigation.
6. **COLMAP** — SfM pipeline.
7. **Semantic UV Mapping** — Per-surface UV strategy.
8. **Graph drawing (ManiLatte, Davidson-Harel)** — MANIFOLD graph layouts.

### P3 (Distant)

1. **Bayesian Optimization / Active Learning** — Experiment selection.
2. **PartwiseMPC** — Semi-independent limb planning for SWIFT.
3. **ReConForM** — Motion in-betweening.
4. **HoloNet** — Panorama room connectivity.
