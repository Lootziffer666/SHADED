# Forgotten & Cross-Domain Techniques

> Analyse etablierter aber oft übersehener Verfahren mit ungeahnter Synergie
> für SHADEDs Rekonstruktionspipeline.

## 1. Shape-from-Shading / Photometric Stereo (Old but Gold)

| Aspekt | Wert |
|---|---|
| **Donor** | Woodham (1980), Horn (1989) |
| **DeepPS2** | Selbstüberwachtes Inverse-Rendering, 2 Bilder reichen |
| **Input** | Einzelbild (SfS) / Mehrere Bilder mit unterschiedlicher Beleuchtung (PPS) |
| **Output** | Oberflächennormalen, Albedo, Beleuchtung |
| **Skalierung** | Relativ |
| **Rauschrobust** | Hoch bei hartem seitlichem Licht (alt-Foto-Stärke) |
| **Synergie** | Ergänzt Feed-forward Depth: liefert Geometrie wo Multi-View versagt |
| **Hardware** | Minimal — CPU-tauglich |

**Relevanz für SHADED:** Ideal für "Kinderbilder zum Leben erwecken" — alte Fotos mit hartem Blitzlicht liefern mehr Feindetail via SfS als jedes Depth-Modell.

## 2. MeshGraphNets — Physics-GNN als adaptive LOD-Controller

| Aspekt | Wert |
|---|---|
| **Donor** | DeepMind / Stanford (Physics Simulation) |
| **Input** | Mesh-Graph |
| **Output** | Adaptive Mesh-Refinement-Entscheidungen |
| **Synergie** | Lerne, wo mehr TSDF-Voxel-Auflösung nötig ist (Kanten/Ornamente vs glatte Wände) |
| **Hardware** | GPU-Training, CPU-Training-Inferenz |
| **Portabilität** | Mesh-agnostisch — funktioniert auf feinen und groben Netzen ohne Retraining |

**Relevanz für SHADED:** Ersetzt die feste Octree-Regel im HierarchicalChunkPartitioner durch gelernte, kontextadaptive Auflösung.

## 3. Neural Cellular Automata (NCA) / Generative Cellular Automata (GCA)

| Aspekt | Wert |
|---|---|
| **Donor** | Growing Neuronal Cellular Automata (Mordvintsev et al.) |
| **Input** | Zufallssamen / Seed |
| **Output** | 3D Voxelstrukturen (Gebäude, funktionelle Maschinen) |
| **Skalierung** | Relativ |
| **Modellgröße** | Minimal (KB statt GB) |
| **Robustheit** | Selbstreparierend — robust gegen Teilkörperfehlzüsse |
| **Hardware** | Extrem schwach — theoretisch auch auf Mikrocontrollern |

**Relevanz für SHADED:** Radikal ressourcenschonende Alternative zum untersten Hardware-Tier. Wo Splatter Image schon zu schwer ist, könnte GCA laufen.

## 4. Graph-SLAM + Bag-of-Words Loop Closure (Vergessener Schatz)

| Aspekt | Wert |
|---|---|
| **Donor** | OpenCV-SLAM, ORB-SLAM3, Cartographer |
| **Input** | Video-Sequenz |
| **Output** | Globale Pose-Graph mit Loop-Closure-Korrektur |
| **Skalierung** | Metrisch (via VO/VIO) |
| **Kosten** | Extrem gering gegenüber full-Bundle-Adjustment |
| **Synergie** | Gezielte, lokale Drift-Korrektur vs. globale Re-Optimierung |

**Relevanz für SHADED:** Billigere Alternative zur vollen Bundle-Adjustment für multi-session Video-Input mit Wiederbeschreibung (z.B. Urlaubsvideo, der zurückkehrt).

## Portabilitäts-Strategie: Cross-Domain als Schalten

| Hardware-Tier | Primär-Verfahren | Cross-Domain-Fallback |
|---|---|---|
| **Bottom** (4GB RAM, CPU) | Splatter Image (1 Forward-Pass) | **NCA/GCA** — KI-Modelle < 100KB |
| **Middle** (16GB, RTX 3060) | DiffSplat / DreamGaussian | **SfS/PPS** — ergänzt Geometrie aus Licht |
| **Top** (48GB, RTX 6090) | Complete Gaussian Splats / Lyra | **MeshGraphNets** — adaptive LOD über TSDF |

## Kategorie-Übersicht

| Kategorie | Reife | Ressourcen | SHADED-Anwendung |
|---|---|---|---|
| Photometric Stereo / SfS | old but gold | minimal | Einzelbild-Geometrie für alte Fotos |
| DeepPS2 | aufstrebend | niedrig | 2-Bild-Normalen ohne Ground-Truth |
| MeshGraphNets | etabliert (fremddomäne) | GPU-Training | Adaptive LOD-Verfeinerung |
| NCA/GCA | experimentell | minimal | Radikal-resourcenschonende Welten |
| Graph-SLAM + BoW | old but gold | minimal | Billige Loop-Closure-Korrektur |
