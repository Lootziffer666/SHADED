# SHADED – SDF-Geometrie: Stand 2026 und Architekturrolle

**Status:** verbindliche Ergänzung zur Rekonstruktionsarchitektur  
**Stand:** 2026-07-26  
**Gilt für:** implizite Geometrie, Raymarching, Surface Reconstruction, Mesh-Extraktion, Gaussian-SDF-Hybride und physische Oberflächen

> In den letzten zehn Jahren wurde aus dem SDF eine lernbare und differenzierbare Geometrieschicht.  
> Es ist aber keine magische Einzelbild-Wahrheit und nicht für jede offene Szene automatisch die richtige Repräsentation.

---

## 1. Was sich grundlegend verändert hat

Klassische Signed Distance Fields waren vor allem:

- analytische Funktionen für primitive Formen,
- diskrete Abstandsgitter,
- Hilfsmittel für CSG, Kollisionen und Raymarching,
- TSDF-Volumen zur Fusion gemessener Tiefendaten.

Heute kommen fünf fundamentale Erweiterungen hinzu:

1. **Neuronale kontinuierliche SDFs**  
   Ein Netz approximiert die Distanzfunktion und kann Formfamilien, Completion und latente Variation lernen.

2. **SDF plus differenzierbares Rendering**  
   Geometrie kann direkt aus Bildern optimiert werden, weil Renderfehler bis in die implizite Oberfläche zurückpropagieren.

3. **Schnelle Multi-Resolution-Repräsentationen**  
   Hash Grids und CUDA-Implementierungen reduzieren Optimierungszeiten drastisch und machen große oder dynamische Rekonstruktionen praktikabler.

4. **Differenzierbare Isosurface-Extraktion**  
   Mesh-Positionen und teilweise auch Topologie können während der Optimierung verändert werden, statt erst am Ende mit klassischem Marching Cubes extrahiert zu werden.

5. **Hybridisierung mit Gaussians und expliziten Meshes**  
   SDF liefert globale Oberflächenkohärenz; Gaussians liefern schnelle fotorealistische Appearance; Meshes liefern Engine-, Physik- und Animationskompatibilität.

Der rote Faden lautet:

```text
statisches Distanzfeld
→ lernbare Formfunktion
→ bildoptimierbare Oberfläche
→ differenzierbar extrahierbares Mesh
→ Hybrid aus Oberfläche, Appearance und Physik
```

---

## 2. SDF ist heute nicht eine einzelne Technik

SHADED muss folgende Repräsentationen unterscheiden:

| Typ | Bedeutung | Typische Verwendung |
|---|---|---|
| **Analytic SDF** | exakte Formel für Primitive oder CSG | Raymarching, prozedurale Formen, Kollision |
| **Voxel SDF** | diskretes Distanzgitter | schnelle Queries, Simulation, Mesh-Extraktion |
| **TSDF** | nur nahe der Oberfläche genaue, abgeschnittene SDF | Depth- und Point-Cloud-Fusion |
| **UDF** | Abstand ohne gesichertes Innen-/Außen-Vorzeichen | offene Flächen, dünne Strukturen, unbekannter Raum |
| **Occupancy Field** | Wahrscheinlichkeit oder Klassifikation belegt/frei | robuste grobe Form und Rekonstruktion |
| **Neural SDF** | kontinuierliche gelernte Funktion | Rekonstruktion, Completion, Optimierung |
| **Latent SDF** | Form über einen latenten Code konditioniert | generative Objektfamilien und Interpolation |
| **Differentiable SDF Mesh** | Feld plus differenzierbare Isosurface | inverse Rendering- und Asset-Pipelines |
| **SDF–Gaussian Hybrid** | implizite Oberfläche plus explizite Splats | kohärente Geometrie und schnelles Rendering |

Diese Typen dürfen im World Surface Graph nicht alle als bloßes Feld `sdf` zusammenfallen.

---

## 3. Die wichtigste Einzelbild-Grenze

Aus einem einzelnen RGB-Bild ist typischerweise sichtbar:

- die erste getroffene Oberfläche,
- deren Farbe,
- eine geschätzte Kamera-Depth oder Point Map,
- teilweise Normals und Materialhinweise.

Nicht direkt sichtbar sind:

- Rückseiten,
- Wandstärken,
- geschlossene Innenräume,
- verdeckte Hohlräume,
- das sichere Vorzeichen eines vollständigen Volumens.

Damit ist aus einem Einzelbild zunächst oft **keine vollständige Signed Distance Function** beweisbar.

Die sichere Zwischenrepräsentation lautet eher:

```text
sichtbare Surface Samples
+ freier Raum entlang bekannter Kamerastrahlen
+ unbekannter Raum hinter der Oberfläche
```

SHADED braucht deshalb drei Raumzustände:

```text
FREE
SURFACE / OCCUPIED
UNKNOWN
```

Eine binäre Innen-/Außen-Entscheidung darf erst entstehen durch:

- echte Multi-View-Beobachtung,
- bekannte Architekturregeln,
- sensorische Fusion,
- Formprior oder generative Completion,
- explizite Nutzerfreigabe.

> Ein SDF-Completion-Modell kann ein plausibles geschlossenes Objekt erzeugen. Es verwandelt die erfundene Rückseite aber nicht rückwirkend in beobachtete Geometrie.

---

## 4. Der erste Umbruch: lernbare implizite Geometrie

### 4.1 DeepSDF

Paper: https://openaccess.thecvf.com/content_CVPR_2019/html/Park_DeepSDF_Learning_Continuous_Signed_Distance_Functions_for_Shape_Representation_CVPR_2019_paper.html

DeepSDF zeigte 2019, dass ein neuronales Netz eine kontinuierliche SDF für eine ganze Formklasse repräsentieren kann.

Neu daran:

- kompakte kontinuierliche Formrepräsentation,
- Completion aus partiellen oder verrauschten 3D-Daten,
- Interpolation im latenten Formenraum,
- Auflösung nicht fest an ein Voxelraster gebunden.

SHADED-Rolle:

```text
LatentShapeSDFProvider
```

Grenze:

DeepSDF benötigt gelernte Formpriors und löst nicht automatisch beliebige offene Weltszenen aus einem einzelnen RGB-Bild.

---

## 5. Der zweite Umbruch: SDF plus Bild-Rendering

### 5.1 NeuS, VolSDF und verwandte Verfahren

NeuS: https://arxiv.org/abs/2106.10689  
VolSDF: https://arxiv.org/abs/2106.12052

Diese Verfahren koppeln eine SDF an volumetrisches Rendering. Dadurch kann eine Oberfläche aus Multi-View-RGB-Bildern gelernt werden, ohne dass vorher ein fertiges Mesh vorhanden ist.

Grundmuster:

```text
mehrere Bilder + Kameras
        ↓
SDF und Appearance rendern
        ↓
Renderfehler vergleichen
        ↓
Gradienten verändern SDF
        ↓
Null-Level-Set wird Oberfläche
```

NeuS korrigiert den geometrischen Bias gewöhnlicher Volume-Rendering-Formulierungen. VolSDF leitet Dichte aus einer SDF ab und koppelt damit Radiance und Oberfläche enger.

SHADED-Rolle:

```text
MultiViewNeuralSurfaceProvider
```

Grenzen:

- benötigt mehrere konsistente Ansichten,
- ist Optimierung, kein einfacher Einzelbild-Forward-Pass,
- kann bei wenig View-Overlap, Spiegeln und falschen Kameraposen scheitern.

---

## 6. Der dritte Umbruch: Geschwindigkeit und große Szenen

### 6.1 NeuS2

Projekt: https://vcai.mpi-inf.mpg.de/projects/NeuS2/

NeuS2 kombiniert Multi-Resolution-Hash-Encodings, CUDA und progressive Optimierung. Das Projekt berichtet zwei Größenordnungen Beschleunigung gegenüber NeuS und erweitert die Methode auf dynamische Sequenzen.

SHADED-Rolle:

```text
FastMultiViewNeuralSurfaceProvider
```

### 6.2 Neuralangelo

Projekt: https://research.nvidia.com/labs/dir/neuralangelo/

Neuralangelo verbindet SDF-basiertes Surface Rendering mit Multi-Resolution-Hash-Grids, numerischen Gradienten und coarse-to-fine Optimierung. Dadurch werden aus RGB-Videos detaillierte, auch größere Oberflächen rekonstruiert.

SHADED-Rolle:

```text
HighFidelityVideoSurfaceProvider
```

Wichtig:

> Neuralangelo ist ein Video-/Multi-View-Rekonstrukteur, kein Einzelbild-Vervollständiger.

### 6.3 Neural Geometric LOD und Grid-Repräsentationen

Moderne SDF-Systeme verwenden adaptive Octrees, Feature Grids und Multi-Resolution-Encodings. Dadurch wird ein neuronales SDF nicht mehr zwingend bei jeder Abfrage vollständig durch ein großes MLP ausgewertet.

SHADED-Folge:

- SDF-LOD ist ein eigener Ressourcenvertrag,
- grobe Distanzfelder können für Physik und Scheduler reichen,
- feine Oberflächen werden nur lokal oder bei Export materialisiert,
- Runtime-Raymarching und Offline-Rekonstruktion brauchen unterschiedliche Qualitätsstufen.

---

## 7. Der vierte Umbruch: differenzierbare Mesh-Extraktion

### 7.1 DMTet / differentiable marching tetrahedra

Projekt: https://nvlabs.github.io/nvdiffrec/

DMTet verbindet ein tetraedrisches Gitter mit lernbaren SDF-Werten und Vertex-Deformationen. Die extrahierte Oberfläche bleibt in einer gradientenbasierten Optimierung verwendbar.

Das ermöglicht gemeinsam zu optimieren:

- Topologie,
- Vertexpositionen,
- Materialien,
- Beleuchtung,
- Renderfehler.

SHADED-Rolle:

```text
DifferentiableTetMeshExtractor
```

### 7.2 FlexiCubes

Repository: https://github.com/nv-tlabs/FlexiCubes  
Projekt: https://research.nvidia.com/labs/toronto-ai/flexicubes/

FlexiCubes erweitert Dual-Marching-Cubes-artige Extraktion um zusätzliche lokale Freiheitsgrade. Ziel sind bessere Meshqualität, dünnere Strukturen, schärfere Merkmale und bessere Optimierbarkeit.

SHADED-Rolle:

```text
DifferentiableAdaptiveMeshExtractor
```

### 7.3 Warum das grundlegend ist

Früher war der übliche Ablauf:

```text
SDF optimieren
→ Optimierung beenden
→ Marching Cubes
→ Mesh nachträglich reparieren
```

Heute ist möglich:

```text
SDF / Tet Grid / Surface
↔ differenzierbares Mesh
↔ Renderer
↔ Material und Licht
```

Das Mesh kann damit während der Rekonstruktion auf Engine-Tauglichkeit, Oberflächenqualität und Bildübereinstimmung optimiert werden.

---

## 8. Der fünfte Umbruch: SDF, Mesh und Gaussian Splatting wachsen zusammen

Reine 3D-Gaussians sind schnell und visuell stark, aber nicht automatisch eine saubere Oberfläche für:

- Kollision,
- Navmesh,
- Verformung,
- Materialgrenzen,
- UVs,
- klassische Animation,
- belastbare Mesh-Exporte.

SDF und Mesh liefern diese Oberflächenstruktur, rendern aber häufig langsamer oder verlieren Appearance-Details.

Die aktuelle Richtung ist daher hybrid.

### 8.1 MILo

Projekt: https://anttwo.github.io/milo/  
Repository: https://github.com/Anttwo/MILo

MILo extrahiert während der Gaussian-Optimierung differenzierbar ein Mesh und lässt Gradienten zwischen Mesh und Gaussians fließen.

SHADED-Rolle:

```text
GaussianMeshCoOptimizationProvider
```

Architekturwert:

- Appearance bleibt in Gaussians stark,
- ein explizites Mesh wird gleichzeitig für Physik und Bearbeitung verbessert,
- Mesh-Extraktion ist nicht mehr nur nachträglicher Export.

### 8.2 DiscretizedSDF

Repository: https://github.com/NK-CS-ZZL/DiscretizedSDF

Der Ansatz koppelt diskretisierte SDF-Samples und Gaussians, projiziert Gaussians auf das Null-Level-Set und optimiert Geometrie, Material und Beleuchtung für relightbare Assets.

SHADED-Rolle:

```text
RelightableGaussianSDFProvider
```

### 8.3 Weitere Hybridrichtungen

Aktuelle Forschung umfasst außerdem:

- SDF-geführte Gaussian-Regularisierung,
- Surface-aligned Gaussians,
- MeshSplatting und differenzierbares Triangle Splatting,
- Gaussian-to-Mesh- und Mesh-to-Gaussian-Konsistenz,
- Relighting mit gemeinsamem Material-, Licht- und Geometriemodell.

SHADED darf deshalb `GaussianScene` nicht als Endformat behandeln. Es ist eine Appearance-Repräsentation, die mit Surface Geometry verbunden werden kann.

---

## 9. Neue SHADED-Providerfamilien

```text
SDFProviderRegistry
├─ AnalyticSDFProvider
├─ TSDFusionProvider
├─ UDFSurfaceProvider
├─ NeuralSDFReconstructionProvider
├─ LatentSDFCompletionProvider
├─ DifferentiableMeshExtractionProvider
├─ GaussianSDFHybridProvider
└─ SDFRuntimeQueryProvider
```

### 9.1 AnalyticSDFProvider

Für:

- Primitive,
- CSG,
- prozedurale Architektur,
- SDF-Modifier,
- schnelle Raymarching-Prototypen.

Donor-/Referenzbasis:

- https://github.com/fogleman/sdf

### 9.2 TSDFusionProvider

Für:

- metrische Depth,
- mehrere Kameras,
- RGB-D-Sequenzen,
- Point-Cloud-Fusion,
- beobachtete sichtbare Oberflächen.

### 9.3 UDFSurfaceProvider

Für:

- offene Szenenflächen,
- dünne Oberflächen,
- Einzelbild-Rekonstruktion ohne sicheres Innen/Außen,
- Zwischenzustände vor einer bewussten Completion.

### 9.4 LatentSDFCompletionProvider

Für:

- plausible Rückseiten,
- geschlossene Einzelobjekte,
- Objektklassen mit starkem Prior,
- Forminterpolation.

Output-Provenienz:

```text
GENERATED_CONSISTENT oder GENERATED_FREE
```

Nicht:

```text
OBSERVED oder MEASURED
```

### 9.5 DifferentiableMeshExtractionProvider

Backends:

- DMTet,
- FlexiCubes,
- spätere differenzierbare Meshrepräsentationen.

### 9.6 GaussianSDFHybridProvider

Für:

- fotorealistische Vorschau,
- Mesh-Extraktion,
- Relighting,
- gemeinsame Appearance- und Oberflächenoptimierung.

---

## 10. Erweiterung des World Surface Graph

Der Geometriezweig wird präzisiert:

```text
geometry
├─ observations
│  ├─ cameraRays
│  ├─ depthSamples
│  ├─ pointMaps
│  └─ pointClouds
│
├─ occupancy
│  ├─ freeSpace
│  ├─ occupiedSpace
│  └─ unknownSpace
│
├─ implicit
│  ├─ fieldType: SDF | TSDF | UDF | occupancy
│  ├─ representation: analytic | voxel | neural | hash-grid | tet-grid
│  ├─ zeroLevelSet
│  ├─ truncationDistance
│  ├─ signConfidence
│  └─ queryBackend
│
├─ explicit
│  ├─ mesh
│  ├─ tetrahedra
│  ├─ pointCloud
│  └─ gaussianScene
│
└─ conversion
   ├─ extractor
   ├─ parameters
   ├─ sourceVersion
   ├─ topologyConfidence
   └─ repairHistory
```

### 10.1 Sign Confidence

Jeder SDF-Knoten benötigt einen `signConfidence`-Wert oder eine entsprechende Karte.

Beispiel:

```text
sichtbarer Raum vor Oberfläche  → hohe FREE-Konfidenz
beobachtete Oberfläche          → hohe ZERO-SET-Konfidenz
direkt dahinter                 → UNKNOWN
modellgenerierte Rückseite      → niedrige bis mittlere SIGN-Konfidenz
nutzerbestätigtes geschlossenes Objekt → USER_APPROVED
```

---

## 11. SDF und World Laws

SDFs können mehrere Weltgesetze direkt unterstützen:

- Abstand zu Wänden und Hindernissen,
- weiche Kollisionen,
- Kontakt- und Druckzonen,
- Fluss um Geometrie,
- Rauch- und Wärmeausbreitung,
- Schneeablagerung,
- Materialdicke,
- Erosion und Wachstum,
- CSG-Schäden,
- prozedurale Übergänge,
- volumetrische Masken,
- räumliche Sound- und Geruchsfelder.

Dabei gilt:

```text
SDF beschreibt Geometrie
World Law beschreibt Verhalten
```

Ein SDF darf nicht selbst entscheiden, ob eine Fläche nass, heiß, tot oder begehbar ist. Es liefert Abstände, Normalen und Innen-/Außen-Hypothesen, die Gesetze lesen.

---

## 12. Runtime gegen Offline-Pipeline

### 12.1 Runtime-tauglich

- analytische SDFs,
- kleine Voxel-/TSDF-Felder,
- grobe Kollisions-SDFs,
- lokale SDF-Modifier,
- Raymarching klar begrenzter Effekte,
- gecachte Distanzfelder,
- SDF-LOD.

### 12.2 Import-/Worker-Arbeit

- neuronales SDF-Training,
- Multi-View-Surface-Reconstruction,
- Neuralangelo,
- NeuS2,
- DMTet-/FlexiCubes-Optimierung,
- Gaussian-SDF-Co-Optimization,
- hochauflösende Mesh-Extraktion und Repair.

Diese Arbeit wird über Jobs und Cache-Artefakte in den World Surface Graph überführt, nicht im Frame-Loop ausgeführt.

---

## 13. Praktische Pipeline aus einem Einzelbild

Ein sicherer erster Ablauf lautet:

```text
RGB-Einzelbild
  ↓
Point Map / Depth / Normals / Kamera
  ↓
Surface Samples + FREE-Rays + UNKNOWN-Raum
  ↓
partielle UDF oder TSDF-nahe Repräsentation
  ↓
optional: generative Rückseiten-/Form-Completion
  ↓
SDF mit Provenienz und Sign Confidence
  ↓
FlexiCubes / DMTet / klassischer Extractor
  ↓
Mesh + Kollisions-LOD + optional Gaussian Appearance
  ↓
World Surface Graph
```

Die Pipeline darf nach der partiellen Oberfläche stoppen. Ein offener 2.5D-Raum ist ehrlicher und oft nützlicher als ein automatisch erfundener wasserdichter Körper.

---

## 14. Donor- und Forschungszuordnung

| Quelle | Rolle | Status für SHADED |
|---|---|---|
| `fogleman/sdf` | analytische SDFs und CSG | Donor/Blaupause nach Lizenzprüfung |
| `facebookresearch/DeepSDF` | latente Neural-SDF-Formen | Forschungsbackend |
| `Totoro97/NeuS` | Multi-View Neural Surface | Referenz/Forschungsworker |
| NeuS2 | schnelle Neural Surface | Remote-/GPU-Worker |
| Neuralangelo | hochwertige Video-Surface-Rekonstruktion | Remote-/GPU-Worker |
| `NVlabs/nvdiffrec` | DMTet, Mesh+Material+Licht | zentraler Architektur-Donor |
| `nv-tlabs/FlexiCubes` | differenzierbare Mesh-Extraktion | zentraler Extractor-Kandidat |
| `Anttwo/MILo` | Mesh-in-the-Loop Gaussian Splatting | Hybrid-Forschungspfad |
| `NK-CS-ZZL/DiscretizedSDF` | relightbares SDF-Gaussian-Hybrid | Material-/Relighting-Forschungspfad |

Lizenz und Checkpoint-Bedingungen werden pro Provider dokumentiert. Forschungscode wird nicht automatisch zur Kernabhängigkeit.

---

## 15. Erster vertikaler Schnitt

Der erste SDF-Schnitt für SHADED soll keine komplette neuronale Rekonstruktionssuite bauen.

### Eingabe

- vorhandene Depth oder Point Map eines Einzelbilds,
- Kameraannahmen,
- bestehende Materialmasken.

### Ablauf

1. sichtbare Punkte und freie Kamerastrahlen erzeugen,
2. `UNKNOWN` hinter der ersten Oberfläche erhalten,
3. partielle TSDF-/UDF-Repräsentation bauen,
4. grobes Mesh für Vorschau extrahieren,
5. SDF-/UDF-Debugslice und Sign Confidence anzeigen,
6. Mesh und Feld gemeinsam im World Surface Graph speichern,
7. Kollision nur auf ausreichend bestätigten Regionen erlauben,
8. optionalen Completion-Worker später separat zuschalten.

### Noch nicht Teil des ersten Schnitts

- Neuralangelo-Training,
- NeuS2-Training,
- freie generative Rückseiten,
- MILo-Integration,
- vollständige automatische Mesh-Reparatur,
- globale SDF-Welt in voller Auflösung.

---

## 16. Abnahmekriterien

- [ ] SDF, TSDF, UDF und Occupancy sind unterscheidbare Typen.
- [ ] `FREE`, `OCCUPIED/SURFACE` und `UNKNOWN` bleiben getrennt.
- [ ] Einzelbilddaten werden nicht automatisch als geschlossener Körper gespeichert.
- [ ] Sign Confidence und Provenienz werden persistiert.
- [ ] generierte Rückseiten sind als generiert markiert.
- [ ] vorhandene gemessene Geometrie hat Vorrang.
- [ ] Mesh-Extraktion speichert Extractor und Parameter.
- [ ] Kollisions-LOD und Render-Mesh dürfen unterschiedliche Auflösungen haben.
- [ ] SDF-Arbeit läuft nicht ungeplant im Frame-Loop.
- [ ] Gaussian Appearance und Surface Geometry bleiben getrennt, aber verknüpfbar.
- [ ] World Laws lesen Geometrie, werden aber nicht vom Provider erfunden.
- [ ] Provider- und Checkpoint-Lizenzen sind dokumentiert.

---

## 17. Klare Entscheidung

Ja, bei SDF-Geometrie hat sich grundlegend etwas verändert.

SDF ist heute:

- lernbare kontinuierliche Formrepräsentation,
- differenzierbare Oberfläche,
- Optimierungsraum für inverse Graphics,
- Brücke zu expliziten Meshes,
- geometrischer Anker für Gaussian Appearance,
- leistungsfähige Query-Repräsentation für Weltgesetze.

Für SHADED lautet die Zielarchitektur jedoch nicht:

```text
Alles wird SDF.
```

Sondern:

```text
Beobachtung
→ partielle Geometrie mit UNKNOWN-Raum
→ passende implizite Repräsentation
→ bewusste Completion
→ differenzierbare oder klassische Mesh-Extraktion
→ gekoppelte Render-, Material- und Physikrepräsentationen
```

SDF wird damit eine zentrale **Geometriesprache** des World Surface Graph – aber nicht dessen einzige Wahrheit.