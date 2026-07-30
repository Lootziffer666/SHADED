---
name: shaded-sdf
description: Verbindliche Regeln für SDF-, TSDF-, UDF-, Occupancy-, Raymarching-, Mesh-Extraktions- und Gaussian-SDF-Arbeit in SHADED. Vor jeder Änderung an impliziter Geometrie, SDF-Kollision, Surface Reconstruction oder SDF-zu-Mesh-Konvertierung verwenden.
---

# SHADED-SDF

Vollständige Architektur:

- [`docs/sdf-geometrie-stand-2026.md`](../../../docs/sdf-geometrie-stand-2026.md)
- [`docs/reconstruction-provider-und-world-surface-graph.md`](../../../docs/reconstruction-provider-und-world-surface-graph.md)
- [`docs/einzelbild-raeumlichkeit-providerlandschaft.md`](../../../docs/einzelbild-raeumlichkeit-providerlandschaft.md)

## Kernregel

SDF ist eine zentrale Geometriesprache, aber nicht die einzige Geometriewahrheit.

Unterscheiden:

```text
Analytic SDF
Voxel SDF
TSDF
UDF
Occupancy Field
Neural SDF
Latent SDF
Differentiable SDF Mesh
SDF–Gaussian Hybrid
```

## Einzelbild-Invariante

Aus einem Einzelbild sind Rückseite, Wandstärke und vollständiges Innen/Außen nicht beobachtet.

Immer getrennt speichern:

```text
FREE
SURFACE / OCCUPIED
UNKNOWN
```

Ein vollständiges SDF-Vorzeichen darf erst durch Multi-View, Sensorfusion, Formprior, generative Completion oder Nutzerfreigabe entstehen.

Generierte Rückseiten sind niemals `OBSERVED` oder `MEASURED`.

## Providerfamilien

```text
AnalyticSDFProvider
TSDFusionProvider
UDFSurfaceProvider
NeuralSDFReconstructionProvider
LatentSDFCompletionProvider
DifferentiableMeshExtractionProvider
GaussianSDFHybridProvider
SDFRuntimeQueryProvider
```

## Moderne Referenzen

- DeepSDF → lernbare kontinuierliche Form und Completion
- NeuS / VolSDF → SDF plus Multi-View-Volume-Rendering
- NeuS2 → beschleunigte statische und dynamische Neural Surfaces
- Neuralangelo → hochauflösende Surface Reconstruction aus RGB-Video
- DMTet / nvdiffrec → differenzierbare Mesh-, Material- und Lichtoptimierung
- FlexiCubes → flexible differenzierbare Isosurface-Extraktion
- MILo → Mesh-in-the-Loop Gaussian Splatting
- DiscretizedSDF → relightbare Gaussian-SDF-Assets

## Pflichtfelder im World Surface Graph

```text
fieldType: SDF | TSDF | UDF | occupancy
representation: analytic | voxel | neural | hash-grid | tet-grid
freeSpace
occupiedSpace
unknownSpace
signConfidence
zeroLevelSet
truncationDistance
queryBackend
extractor
extractorParameters
provenance
providerVersion
```

## Runtime gegen Worker

Runtime-tauglich:

- analytische SDFs,
- kleine Voxel-/TSDF-Felder,
- grobe Kollisions-SDFs,
- lokale Modifier,
- gecachte Distanzfelder,
- begrenztes Raymarching.

Worker-/Import-Arbeit:

- Neural-SDF-Training,
- NeuS2,
- Neuralangelo,
- DMTet-/FlexiCubes-Optimierung,
- Gaussian-SDF-Co-Optimization,
- hochauflösende Mesh-Extraktion.

## Integrationsregeln

1. Gemessene und beobachtete Geometrie hat Vorrang vor Completion.
2. Einzelbilddaten werden nicht stillschweigend wasserdicht geschlossen.
3. SDF, TSDF, UDF und Occupancy bleiben unterschiedliche Typen.
4. Sign Confidence und Provenienz werden persistiert.
5. Mesh-Extraktion speichert Backend, Version und Parameter.
6. Render-Mesh, Kollisions-LOD und SDF-LOD dürfen verschieden sein.
7. Gaussian Appearance und Surface Geometry bleiben getrennt, aber verknüpft.
8. Provider liefern Geometrie; World Laws liefern Verhalten.
9. Keine schwere Rekonstruktion im Frame-Loop.
10. Keine Forschungslizenz wird ungeprüft zur Kernabhängigkeit.

## Erster vertikaler Schnitt

```text
Depth / Point Map / Kamera
→ sichtbare Surface Samples
→ FREE-Rays + UNKNOWN dahinter
→ partielle TSDF oder UDF
→ grobes Vorschau-Mesh
→ Debugslice + Sign Confidence
→ World Surface Graph
```

Keine harte Kollision in Regionen mit unzureichender Geometrie- oder Sign-Konfidenz.