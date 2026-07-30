# SHADED – Providerlandschaft für Räumlichkeit aus einem Einzelbild

**Status:** recherchierte Architekturgrundlage  
**Stand:** 2026-07-26  
**Gilt für:** Einzelbild-Import, 2.5D, Point Maps, Novel Views, Gaussian Scenes und generative Weltvervollständigung

> Es gibt nicht den einen Nachfolger von Depth Anything V2.  
> Der aktuelle Stand zerfällt in mehrere Modellfamilien mit unterschiedlichen Outputs, Wahrheitsgraden und Hardwarekosten.

---

## 1. Die eigentliche Auswahlfrage

Nicht mehr:

> Welches Modell erzeugt die beste Depth Map?

Sondern:

> Welche Art von Räumlichkeit benötigt SHADED für diesen Import?

```text
Einzelbild
├─ nur Tiefenstaffelung / Parallax
│  └─ Depth-/Normal-Provider
├─ kamerabezogene 3D-Geometrie
│  └─ Point-Map-/Camera-Provider
├─ sofort renderbare nahe Kamerabewegung
│  └─ Gaussian-Scene-Provider
├─ verdeckte Bereiche plausibel ergänzen
│  └─ Novel-View-/World-Completion-Provider
└─ editierbare Einzelobjekte und Raumkomponenten
   └─ Object-/Compositional-3D-Provider
```

Diese Familien dürfen nicht unter einem einzigen `MonocularDepthProvider` versteckt werden.

---

## 2. Provider-Familien

### 2.1 Dense Geometry Provider

Liefert pro Pixel geometrische Eigenschaften:

- relative oder metrische Depth,
- Point Map,
- Surface Normals,
- Kameraintrinsics oder FOV,
- Validity Mask,
- Unsicherheit.

Geeignet für:

- Parallax,
- 2.5D,
- Depth-Clustering,
- grobe Point Clouds,
- Occlusion,
- Depth of Field,
- Startwerte für Rekonstruktion.

### 2.2 Explicit Scene Representation Provider

Erzeugt direkt renderbare Raumrepräsentationen:

- 3D Gaussian Splats,
- geschichtete Gaussians,
- Mesh oder GLB,
- kombinierte Geometrie- und Appearance-Repräsentation.

Geeignet für:

- räumliche Vorschau,
- nahe freie Kamerabewegung,
- Echtzeit-Novel-View-Rendering,
- Import in 3D-Viewports.

### 2.3 Novel View / World Completion Provider

Erzeugt neue Kamerawinkel oder RGB-D-Sequenzen und ergänzt nicht sichtbare Bereiche generativ.

Geeignet für:

- Kamerafahrten,
- Rückseiten-Hypothesen,
- Weltvergrößerung,
- zusätzliche Ansichten für Rekonstruktion.

Diese Provider erzeugen plausible Inhalte, keine beobachtete Wahrheit.

### 2.4 Compositional Scene / Object Provider

Segmentiert oder interpretiert mehrere Objekte und erzeugt daraus einzelne 3D-Assets mit räumlicher Anordnung.

Geeignet für:

- editierbare Innenräume,
- isolierbare Requisiten,
- Levelbau aus Objektinstanzen,
- spätere Physik und Interaktion.

---

## 3. Aktuelle Dense-Geometry-Modelle

## 3.1 Depth Anything 3

Repository: https://github.com/ByteDance-Seed/Depth-Anything-3

DA3 verarbeitet einzelne oder beliebig viele Ansichten mit oder ohne bekannte Kameraposen. Es verwendet eine gemeinsame Depth-Ray-Repräsentation und liefert räumlich konsistente Geometrie statt nur einer isolierten monokularen Tiefenkarte.

SHADED-Rolle:

```text
AnyViewGeometryProvider
```

Nicht bloß:

```text
MonocularDepthProvider
```

Bewertung:

- wichtig als einheitliche Einzel-/Mehransicht-Geometrieschicht,
- verbessert monokulare Depth und Multi-View-Geometrie,
- kann später Kamera- und View-Konsistenz in einer Providerfamilie bündeln,
- die konkrete Modelllizenz muss pro Checkpoint geprüft werden; das Repository ist Apache 2.0.

## 3.2 MoGe-2 und MoGe-3

Repository: https://github.com/microsoft/MoGe

MoGe-2 erzeugt in einem Forward Pass:

- metrische Point Map,
- metrische Depth,
- optionale Normal Map,
- Validity Mask,
- Kamera-Intrinsics/FOV,
- direkte GLB- und PLY-Ausgabe.

Es gibt kleine Normal-Modelle mit 35M und 104M Parametern neben der großen Variante.

MoGe-3 wurde am **21. Juli 2026** angekündigt und verspricht deutlich verbesserte feingranulare Point-Map-Geometrie durch selbstgeführte sparse volumetric refinement. Code und Checkpoints waren zum Stand dieser Datei noch nicht verfügbar.

SHADED-Rolle:

```text
MetricPointMapProvider
```

Bewertung:

- **MoGe-2 ist der stärkste erste lokale Benchmark-Kandidat**, weil Point Map, Depth, Normals und Kamera zusammenkommen,
- MIT-lizenzierter Code,
- die kleine 35M-Variante ist für eine RTX 3060 12 GB besonders interessant,
- MoGe-3 beobachten, aber noch nicht als verfügbare Abhängigkeit behandeln.

## 3.3 UniDepthV2

Repository: https://github.com/lpiccinelli-eth/UniDepth

Liefert metrische 3D-Punkte aus einem Einzelbild und zusätzlich pixelweise Unsicherheit.

SHADED-Rolle:

```text
MetricPointMapWithUncertaintyProvider
```

Bewertung:

- Unsicherheit ist architektonisch sehr wertvoll,
- gutes Gegenmodell zu MoGe und DA3,
- nichtkommerzielle Lizenzgrenzen beachten.

## 3.4 UniK3D

Repository: https://github.com/lpiccinelli-eth/UniK3D

Zielt auf universelle Kameramodelle und ist besonders relevant für:

- große oder ungewöhnliche FOVs,
- Fisheye,
- Panorama- und 360°-Bilder.

SHADED-Rolle:

```text
UniversalCameraGeometryProvider
```

## 3.5 Apple Depth Pro

Repository: https://github.com/apple/ml-depth-pro

Liefert scharfe metrische Depth, absolute Skalierung und geschätzte Brennweite.

SHADED-Rolle:

```text
SharpMetricDepthProvider
```

Bewertung:

- stark als Referenz für saubere Objekt- und Materialgrenzen,
- reine Depth bleibt ärmer als eine gemeinsame Point-/Normal-/Kamera-Ausgabe,
- sinnvoller Ensemble- und Benchmarkpartner.

## 3.6 HyDen / MetaDepth

Repository: https://github.com/facebookresearch/metadepth

HyDen kombiniert einen leichten CNN-Pfad mit einem ViT-Pfad für hochauflösende Geometrie. Veröffentlicht wurden Varianten für relative Depth, metrische MoGe-Point-Maps und Normals.

SHADED-Rolle:

```text
HighResolutionGeometryAccelerator
```

Bewertung:

- kein eigener Wahrheitsprovider, sondern Detail- und Beschleunigungspfad,
- interessant für große Texturen und Concept Art,
- Noncommercial-Research-Lizenz beachten.

## 3.7 Lotus-2

Projekt: https://lotus-2.github.io/

Lotus-2 nutzt einen generativen World Prior als deterministischen Geometrie-Prior. Ein schneller Core Predictor liefert global kohärente Geometrie; ein optionaler Detail Sharpener verfeinert Depth und Normals.

SHADED-Rolle:

```text
GenerativePriorDenseGeometryProvider
```

Bewertung:

- besonders interessant für Gemälde, stilisierte Bilder, transparente und ungewöhnliche Oberflächen,
- ideal als zweiter Meinungsgeber oder Detail-Refiner,
- kein Ersatz für metrische Point Maps.

## 3.8 Weitere Benchmark-Backends

- Marigold – diffusionbasierte Depth mit starkem Bildprior,
- DepthFM – Flow Matching, schnelle Depth und Inpainting,
- GeoWizard – gemeinsame Depth- und Normal-Schätzung,
- Metric3Dv2 – metrische Depth und Normals über kanonischen Kameraraum,
- DepthAnything-AC – robuste Depth unter Wetter, Beleuchtung und Sensorstörungen,
- DA360 – Panorama-/360°-angepasste Depth.

SHADED-Rolle:

```text
DenseGeometryBenchmarkBackends
```

---

## 4. Explizite Scene-Repräsentationen

## 4.1 Apple SHARP

Repository: https://github.com/apple/ml-sharp

SHARP erzeugt aus einem Einzelbild direkt eine metrische 3D-Gaussian-Repräsentation, die für nahe neue Kamerawinkel in Echtzeit gerendert werden kann.

SHADED-Rolle:

```text
MetricGaussianSceneProvider
```

Unterschied zu einem Depth-Provider:

```text
Depth / Point Map
  → weitere Rekonstruktion nötig

SHARP
  → renderbare Appearance-plus-Geometry-Szene
```

Grenzen:

- stark für nahe Viewpoint-Bewegungen,
- keine verlässliche vollständige Welt hinter allen Verdeckungen,
- nicht automatisch editierbares Mesh.

## 4.2 Flash3D

Repository: https://github.com/eldar/flash3d

Flash3D erweitert monokulare Depth zu mehreren Schichten von 3D-Gaussians. Zusätzliche Schichten modellieren Bereiche hinter der sichtbaren ersten Oberfläche.

SHADED-Rolle:

```text
LayeredGaussianSceneProvider
```

Architekturwert:

> Nicht nur eine Oberfläche extrudieren, sondern mehrere räumliche Appearance-Schichten erzeugen.

## 4.3 SceneGen

Repository: https://github.com/Mengmouxu/SceneGen

Erzeugt aus einem Szenenbild plus Objektmasken mehrere 3D-Assets samt relativer Position und kann GLB exportieren.

SHADED-Rolle:

```text
CompositionalSceneAssetProvider
```

Grenzen:

- stark für klar segmentierbare Innenräume und Gegenstände,
- kein allgemeiner Ersatz für Landschafts- oder Weltrekonstruktion,
- laut Repository hoher GPU-Speicherbedarf.

## 4.4 MIDI-3D

Repository: https://github.com/VAST-AI-Research/MIDI-3D

Erzeugt mehrere 3D-Objektinstanzen und erhält deren räumliche Beziehungen.

SHADED-Rolle:

```text
MultiInstanceObjectSceneProvider
```

Nicht mit Musik-MIDI verwechseln.

## 4.5 FlashWorld

Repository: https://github.com/imlixinyang/FlashWorld

Erzeugt aus Einzelbild oder Text direkt generative 3D-Gaussian-Szenen.

SHADED-Rolle:

```text
FastGenerativeGaussianWorldProvider
```

Bewertung:

- wichtiger Zukunftspfad,
- eher Remote-/Cloud-Worker als lokaler Standard auf 12 GB VRAM.

---

## 5. Novel View und World Completion

## 5.1 Stable Virtual Camera

Repository: https://github.com/Stability-AI/stable-virtual-camera

Erzeugt 3D-konsistente neue Ansichten entlang vorgegebener Zielkameras.

SHADED-Rolle:

```text
ControlledNovelViewProvider
```

## 5.2 ViewCrafter

Repository: https://github.com/Drexubery/ViewCrafter

Kombiniert grobe 3D-Hinweise und Video-Diffusion für kontrollierbare Kamerafahrten aus einem Einzelbild oder wenigen Ansichten.

SHADED-Rolle:

```text
HighFidelityNovelViewVideoProvider
```

Eher Remote-Worker wegen hohem GPU-Speicherbedarf.

## 5.3 VistaDream

Repository: https://github.com/WHU-USI3DV/VistaDream

Baut zuerst ein grobes 3D-Gerüst aus Outpainting und Depth und ergänzt danach Löcher durch iteratives RGB-D-Inpainting. Ergebnis ist ein Gaussian Field.

SHADED-Rolle:

```text
IterativeWorldCompletionProvider
```

Wichtiges Muster:

```text
globale Struktur zuerst
→ fehlende Bereiche gezielt generieren
→ Ansichtskonsistenz erzwingen
```

## 5.4 GEN3C

Repository: https://github.com/nv-tlabs/GEN3C

Hält einen expliziten 3D-Cache aus Depth und Point Clouds. Bei neuer Kamera wird dieser Cache gerendert; das generative Modell ergänzt nur bislang unsichtbare Regionen.

SHADED-Rolle:

```text
GeometryCachedWorldExpansionProvider
```

Besonders wichtige Architekturidee:

> Generative Modelle sollen nicht jedes Frame die Welt neu erfinden. Sie sollen auf dem kanonischen World Surface Graph aufbauen und nur fehlende Regionen ergänzen.

## 5.5 HunyuanWorld-Voyager

Repository: https://github.com/Tencent-Hunyuan/HunyuanWorld-Voyager

Erzeugt aus Einzelbild und Kamerafahrt räumlich konsistente RGB-D-Videos und Punktwolken-Sequenzen.

SHADED-Rolle:

```text
InteractiveRGBDWorldExplorationProvider
```

## 5.6 WorldWarp

Erweitert Szenen über lange Kamerafahrten mit asynchroner Video-Diffusion und Online-3D-Cache.

SHADED-Rolle:

```text
LongRangeWorldPropagationProvider
```

Forschungspfad mit sehr hohem Hardwarebedarf.

---

## 6. Neue kanonische Output-Typen

Der World Surface Graph muss mindestens unterscheiden:

```text
RelativeDepthMap
MetricDepthMap
SurfaceNormalMap
PointMap
CameraIntrinsics
CameraRays
UncertaintyMap
PointCloud
Mesh
SDF
GaussianScene
NovelViewSet
RGBDSequence
ObjectInstanceSet
```

`DepthMap` allein ist als Zwischenformat zu klein.

---

## 7. Wahrheitshierarchie

```text
MEASURED
  Sensor, Engine, bekannte Kamera

OBSERVED
  direkt sichtbare Bildinformation

RECONSTRUCTED
  geometrisch aus mehreren konsistenten Signalen abgeleitet

INFERRED
  Depth, Point Map, Kamera oder Normals aus Einzelbild geschätzt

GENERATED_CONSISTENT
  neue Ansichten unter räumlichem Cache oder Konsistenzzwang erzeugt

GENERATED_FREE
  plausible, aber schwach gebundene Vervollständigung

USER_APPROVED
  Nutzer bestätigt eine Hypothese als kanonisch
```

Eine Gaussian Scene kann visuell überzeugend sein und dennoch nur `INFERRED` oder `GENERATED_CONSISTENT` sein.

---

## 8. Provider-Ensemble statt blindem Vertrauen

Für wichtige Imports kann SHADED mehrere günstige Provider ausführen:

```text
MoGe-2 Point Map
+ DA3 Depth/Rays
+ Lotus-2 Normals/Detail
+ bestehende Materialmasken
────────────────────────
Konsens + Konfliktkarte
```

Ausgabe:

- übereinstimmende Geometrie,
- Konfliktregionen,
- geschätzte Konfidenz,
- gezielte Nutzerfreigaben.

Ein Ensemble soll nicht alle Ergebnisse mitteln. Es soll **Uneinigkeit sichtbar machen**.

---

## 9. Praktische Priorisierung für RTX 3060 12 GB

### Sofort lokal benchmarken

1. **MoGe-2 ViT-S Normal**  
   Kleine 35M-Variante; Point Map, Depth, Normals und Kamera in einer Pipeline.

2. **DA3-SMALL oder DA3-BASE**  
   Einzel- und spätere Mehransicht in derselben Familie.

3. **Apple Depth Pro**  
   Scharfe metrische Depth und Brennweite als Referenz.

4. **Lotus-2**  
   Mit stilisierten Bildern, Gemälden und schwierigen Oberflächen testen.

### Später lokal oder mit Optimierung

- UniDepthV2,
- UniK3D,
- HyDen,
- Flash3D,
- Apple SHARP.

### Remote-/Cloud-Worker

- ViewCrafter,
- SceneGen,
- FlashWorld,
- VistaDream,
- Stable Virtual Camera,
- GEN3C,
- HunyuanWorld-Voyager,
- WorldWarp.

---

## 10. Erster Benchmark statt voreiliger Standardwahl

SHADED erhält ein kleines Referenzset:

- Foto Innenraum,
- Foto Außenraum,
- stilisiertes Concept Art,
- Pixel-Art-/2D-Hintergrund,
- transparente oder reflektierende Oberfläche,
- ungewöhnliches FOV,
- Architektur mit klaren Kanten,
- Vegetation und feine Strukturen.

Pro Provider messen:

- Laufzeit,
- Peak-VRAM,
- Output-Typen,
- Kantenqualität,
- geometrische Konsistenz,
- metrische Stabilität,
- Fehler an Himmel, Spiegeln und Transparenz,
- Lizenz,
- Exportierbarkeit,
- Eignung für Parallax, Point Cloud, Kollision und World Completion.

Erst danach wird ein Standardbackend pro Providerfamilie festgelegt.

---

## 11. Klare Architekturentscheidung

Depth Anything V2 ist nicht mehr der Default für alles.

```text
Provider Registry
├─ DenseGeometryProvider
├─ PointMapCameraProvider
├─ GaussianSceneProvider
├─ NovelViewProvider
├─ WorldCompletionProvider
├─ CompositionalSceneProvider
└─ SDFSurfaceProvider
```

Depth Anything 3, MoGe-2/3, SHARP und die Novel-View-Systeme lösen unterschiedliche Teile desselben Problems. SHADED soll ihre Ergebnisse nicht in eine einzige Tiefenkarte pressen, sondern als unterscheidbare Raumartefakte im World Surface Graph verwalten.