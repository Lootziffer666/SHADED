# Gebäudeanlagen-Rekonstruktion: Distraktor-Robuste Pipeline

> Analyse aller Verfahren zur Rekonstruktion ganzer Gebäudeanlagen unter starkem
> Besucher-/Aufbauten-Rauschen — für Photo- und Video-Input.

## Kritische Erkenntnis: Punktwolken-Schnittpunkte sind riskant

Rohe Punktwolken aus Multi-View-Stereo sind per Definition verrauscht und redundant.
Direkte geometrische Schnittpunktberechnung (Wand-Wand-Kanten) akkumuliert Rauschen
in der Kantenschätzung. Der Community-Standard löst das über TSDF-Fusion + RANSAC.

## Empfohlene Pipeline-Reihenfolge

| Stufe | Operator | Status |
|---|---|---|
| 1. Posen | COLMAPPhotogrammetryProvider | P0 (Referenz-Skala) |
| 2. Dichte Depth | VGGTDepthProvider / DepthProvider | P0 |
| 2b. Skalierung | ScaleAlignmentCalibrator | **NEU, P0** — RANSAC-Least-Squares gegen SfM-Sparse-Depth |
| 3. Rauschfilterung | SemanticMaskFilter | **NEU, P0** — SAM2+SegFormer, vorgeschaltet |
| 3b. Video-Fallback | T3DGSReconstructionProvider / SpotLessSplatsProvider | P1, Fallback |
| 4. Partitionierung | HierarchicalChunkPartitioner | **NEU, P0** — Out-of-Core für 48GB RAM |
| 5. Fusion | TSDFFusion (pro Chunk) | P0 (bestehend, jetzt chunk-weise) |
| 6. Ebenen | PlanarSpaceSegmenter (pro Chunk + Merge) | P0 (bestehend, Merge-Logik) |
| 7. Oberfläche | ScreenedPoissonReconstructor / MarchingCubes | P1 |
| 8. Layout | RoomEnvelopesLayoutEstimator | P1 |
| 9. Sequenz-Konsistenz | SequenceConsistencyAligner | **NEU, P1** |

## Kategorie 1: Etablierte Photogrammetrie-Suiten

| Tool | Lizenz | Skalierung | Rauschrobust | Video |
|---|---|---|---|---|
| RealityCapture | kommerziell | metrisch | gering (manuell maskieren) | ✅ |
| Metashape | kommerziell | metrisch | gering | ✅ |
| Pix4Dmapper | kommerziell | metrisch | gering | ✅ |
| COLMAP | GPL-3 | metrisch (relativ) | gering | ✅ |
| ContextCapture | kommerziell | metrisch | mittel | ✅ |
| 3DF Zephyr | gemischt | metrisch | gering | ✅ |

## Kategorie 2: Feed-forward Deep-Learning

| Modell | Skalierung | Rauschrobust | Video | Experiment |
|---|---|---|---|---|
| DepthAnything V2/V3 | relativ | gering | Photo | exp-001 |
| VGGT (CVPR 2025) | relativ | gering | Multi-View | exp-001-vggt |
| DA-Flow | relativ | mittel | Video | P1 |
| MiDaS-DPT | relativ | gering | Photo | P2 |

## Kategorie 3: Distraktor-Robuste NeRF/3DGS

Alle Verfahren hier nutzen Multi-View-Konsistenz über eine Sequenz.

| Verfahren | Rauschfilterung | Input | Skalierung | Implementierung |
|---|---|---|---|---|
| **T-3DGS** | Uncert. Predictor + Transient Mask | Video | relativ | P0 (Fallback) |
| **SpotLessSplats** | DINOv2-Features + M-Step | Video | relativ | P1 (Fallback) |
| **RobustSplat** | Decoupled Densification | Video | relativ | Konfig-Variante |
| **GaussianMove** | SAM-Masken + Transparenz | Video/Photo | relativ | P1 |

## Kategorie 4: Spezialisierte Dynamik-Entfernung (vorgeschaltet)

| Verfahren | Input | Output | Implementierung |
|---|---|---|---|
| **SAM2 + SegFormer** | Multi-View Video/Foto | Masken + Tracking | **NEU: SemanticMaskFilter** |
| DynamicFilter | Stereo-Video | Dynamikmasken | Bibliothek (Wrap) |
| Generalized DO removal | Stereo-Video | Rauschfreie Punktwolke | Referenz |

## Kategorie 5: Feed-Forward Layout-Estimation

| Verfahren | Input | Output | Skalierung |
|---|---|---|---|
| Room Envelopes | Single Image | Layout-Pointmaps | relativ |
| WallNet | Single Image | Wandsegmente | relativ |
| PlaneNet | Single Image | Ebenen-Tiefe | relativ |

## Skalierung: Murre-Ansatz (Murre et al.)

> "SfM-guided Monocular Depth Estimation" — CVPR 2025

**Problem:** VGGT/DA3 liefern nur relative Skalierung. COLMAP liefert metrische.
**Lösung:** RANSAC-basierte lineare Regression der pro-Frame-Depth gegen
SfM-Sparse-Depth vor der Fusion.

Dieser Calibrator ist **P0 Pflicht** — ohne ihn driftet TSDF und RANSAC-Ebenen.
