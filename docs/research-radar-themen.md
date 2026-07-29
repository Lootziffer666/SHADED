# SHADED – Research Radar: größere Themen

**Stand:** 2026-07-26

Diese Liste dient als Prüfraster gegen veraltete Fundamententscheidungen. Sie enthält bewusst Themenklassen statt einzelner Repositories.

- Monokulare Depth- und metrische 3D-Schätzung
- Point Maps, Kameraintrinsics und Ray Maps
- Single-Image-to-3D und Multi-Object-Scene-Reconstruction
- Novel View Synthesis und kameragesteuerte View-Generierung
- Generative World Completion und World Models
- Video-to-3D, temporale Depth und dynamische 4D-Szenen
- NeRF-Nachfolger und 3D Gaussian Splatting
- SDF–Gaussian-Hybride
- Neuronale SDFs, UDFs und TSDF-Fusion
- Differenzierbare Mesh-Extraktion: DMTet, FlexiCubes und Nachfolger
- Neural Surface Reconstruction und inverse Geometrie
- Differentiable Rendering und inverse Graphics
- Neural Materials, SVBRDF und PBR-Map-Rekonstruktion
- Intrinsic Image Decomposition: Albedo, Licht, Schatten und Material
- Relighting, relightable Gaussians und Material-Transfer
- Open-Vocabulary-3D-Segmentierung und semantische Szenengraphen
- Panorama-, Fisheye- und 360°-Rekonstruktion
- SLAM, Sparse-View-Reconstruction und sensor-geführte Fusion
- Mesh-Optimierung, Remeshing, LOD und Neural Compression
- SDF-/Voxel-/Mesh-/Gaussian-Konvertierung
- Physikbewusste 3D-Generierung und differenzierbare Simulation
- Kontakt, Verformung, Stoff, Flüssigkeit und granulare Materialien
- Neural Physics und gelernte Surrogate Solver
- WebGPU, WGSL, Slang, SPIR-V und moderne Shader-Toolchains
- Shader-Graph-Compiler, Rendergraph-Compiler und automatische Pass-Fusion
- Neural Shaders und AI-generierte prozedurale Materialien
- Scene Representation Standards: glTF, USD, MaterialX und OpenPBR
- 3D Foundation Models und multimodale Geometriemodelle
- Unsicherheit, Provenienz und Konfliktauflösung zwischen Rekonstruktionsmodellen
- Projektionsmethoden auf konvexe Mengen und Constraint-Satisfaction auf Feldern
- Klassische räumliche Algorithmen: Distanztransformationen, Graphen, Tessellationen
- lokale 12-GB-VRAM-Modelle gegenüber Cloud-/Worker-Pipelines

## Bereits entschiedene Themen

| Themenblock | Entscheidung |
|---|---|
| Monokulare Depth, Point Maps, Single-Image-to-3D, Novel View, World Completion | [`einzelbild-raeumlichkeit-providerlandschaft.md`](./einzelbild-raeumlichkeit-providerlandschaft.md) |
| SDF, UDF, TSDF, differenzierbare Mesh-Extraktion, SDF–Gaussian-Hybride | [`sdf-geometrie-stand-2026.md`](./sdf-geometrie-stand-2026.md) |
| Neural Materials, SVBRDF, PBR-Maps, Intrinsic Decomposition, Materialstandards | [`neuronale-materialien-svbrdf-pbr.md`](./neuronale-materialien-svbrdf-pbr.md) |
| Räumliche Algorithmen, Constraint-Projektion auf Felder | [`raeumliche-algorithmen-arsenal.md`](./raeumliche-algorithmen-arsenal.md) |
| Rendergraph, Pass-Fusion, Lastverteilung | [`rendergraph-lastverteilung.md`](./rendergraph-lastverteilung.md) |
| Provider-Verträge, Provenienz, World Surface Graph | [`reconstruction-provider-und-world-surface-graph.md`](./reconstruction-provider-und-world-surface-graph.md) |

Offen bleiben unter anderem: WebGPU/WGSL-Kontextwechsel, Relighting und relightable Gaussians, Open-Vocabulary-Segmentierung, Panorama/Fisheye, Mesh-Optimierung und LOD, Neural Physics sowie systematische Konfliktauflösung zwischen Rekonstruktionsmodellen.

Bei jeder größeren Architekturentscheidung ist mindestens zu prüfen:

1. Welche Modell- oder Repräsentationsklasse ist aktuell?
2. Welche ältere Technik ist weiterhin stabiler oder leichter?
3. Welche neue Technik ersetzt sie tatsächlich und welche ergänzt sie nur?
4. Welche Lizenz-, VRAM-, Laufzeit- und Exportgrenzen gelten?
5. Welches kanonische SHADED-Artefakt entsteht daraus?