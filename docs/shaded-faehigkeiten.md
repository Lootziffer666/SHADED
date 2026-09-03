# SHADED-Fähigkeiten – ausführbarer Stand

SHADED ist eine statische WebGL-2-Anwendung für die visuelle Bearbeitung eines
Einzelbilds. Sie kombiniert heuristische Materialklassifikation, einen Fragmentshader,
Canvas-Akteure, relative Tiefenkarten und einen getrennten räumlichen Prototyp. Die
Bezeichnungen unten beschreiben ausführbaren Code; sie sind keine Aussage über
physikalische Genauigkeit oder Rekonstruktionsqualität.

## Browser-Anwendung

| Bereich | Implementierter Stand | Grenze |
|---|---|---|
| Materialanalyse | Heuristische CPU-Klassifikation in einem kleinen Raster; Marker können Klassen korrigieren. Dieselben Klassen speisen Materialtextur und Abfragen. | Keine trainierte semantische Segmentierung und keine Garantie für beliebige Bilder. |
| Rendering | Ein GLSL-ES-3.00-Fragmentshader für Nässe-, Wetter-, Licht-, Jahreszeit-, Verfall- und Inspektionseffekte. | Die Effekte sind visuelle Regeln, keine Energie-, Stoff- oder Strömungssimulation. |
| 2.5D | Eine optionale relative Tiefenkarte verschiebt UVs und sortiert Akteure. | Kein metrischer Kameraraum, keine verdeckten Flächen und kein freier 6-DoF-Flug in der Hauptansicht. |
| Akteure | Sprite-Manifeste, Animationen, Tiefenschichten, Platzierung und lokale Editor-Werkzeuge. | Akteure verändern die Materialklassifikation nicht und sind keine kollidierenden 3D-Körper. |
| Storyboard | Parameter-Schritte mit Dauer, Übergang und Loop; Dialog-Beats sind getrennte Inhaltsdaten. | Kein Mehrspur-NLE, keine Kurvenansicht und keine Audiotimeline. |
| Export | PNG, Canvas-WebM, Point-Cloud-JSON, Szenenprojekt- und Sprite-Werkzeuge. | WebM hängt von `MediaRecorder` und den Codecs des Browsers ab. |

Der kanonische Chromium-Test kompiliert den Shader, lädt das Demo, öffnet die
Raumansicht und prüft Service Worker sowie Offline-Navigation. Er bewertet keine
ästhetische oder physikalische Glaubwürdigkeit.

## Räumliche Runtime

| Bereich | Implementierter Stand | Grenze |
|---|---|---|
| Point Cloud | Sichtbare RGB-Pixel werden mit relativer Companion-Tiefe rückprojiziert. | Die Punkte sind nicht metrisch und enthalten zunächst nur sichtbare Oberflächen. |
| Geometrische Fits | Lokale Normalen, zusammenhängende Oberflächen, RANSAC/PCA-Ebenen sowie PCA-Boxen und -Zylinder; Coverage und RMSE werden aus Residuen berechnet. | Keine semantische Objekterkennung und kein Qualitätsprozentsatz. |
| Ergänzung | Ebenen werden mit Dicke extrudiert, Box-/Zylinderflächen neu abgetastet. Zusätzlich erzeugt die Laufdemo absichtlich eine dunkle Spiegelhülle mit Randwänden für die strukturellen Bildpunkte. Farben verwenden protokollierte nächste Quell-Patches. | Sämtliche Ergänzungen tragen `GENERATED`-Provenienz. Die Spiegelhülle ist ein begehbarer Platzhalter, keine beobachtete oder eigenständig rekonstruierte Rückseite. |
| Sparse Voxel | `UNKNOWN`, `FREE` und `SURFACE`; Kamerastrahlen, Material, Confidence, Provenienz und Zustandskanäle. | Kein SDF, keine TSDF und kein Sparse Voxel Octree. |
| Stiftbearbeitung | Pointer-Pressure, Tilt, Eraser, Material/Farbe, Undo/Redo, Projekt-Import/-Export und Block-Mesh-Extraktion. | Keine herstellerspezifische XP-Pen-API, Layer oder PatchMatch-Klonquelle. |
| Weltzustand | Ein aus Voxeln abgeleitetes 2D-Oberflächenraster für Wasser, Feuchte, Schnee, Eis, Brennstoff, Feuer, Temperatur, Rauch, Matsch, Ruß, Wachstum, Blut und Urin. | Keine volumetrische 3D-Stoffphysik. |
| Wasser/Feuer | Wasser fließt nach Höhenpotential mit internem Massenerhalt. Feuer verbraucht Brennstoff und kann nachbar- und windabhängig übergreifen; Regen löscht. | Koeffizienten haben keine kalibrierten physikalischen Einheiten. |
| Navigation | Gewichteter 4-Nachbar-Dijkstra; dynamische Kosten für Wasser, Eis, Matsch, Feuer, Rauch und Wachstum; Segmentprüfung gegen Zwischenzellen. | Kein Navmesh und keine Continuous Collision Detection gegen Dreiecksgeometrie. |
| Himmel | Ein richtungsabhängiger analytischer Shader erzeugt Wolkenband und Bergsilhouette im Hintergrund. | Kein SDF-Raymarching durch die Szene, keine Schattenstrahlen und keine physikalische Atmosphäre. |
| Regie/Log | Geordnete Liste aus Saison, einem Ereignis und Dauer. UI-Events und gerundete 250-ms-Stichproben werden geloggt. | Kein lückenloses Zelljournal, keine Keyframe-Kurven und kein Mehrspur-Composer. |

## Externe Depth-Provider

SHADED enthält konkrete Adapter für die offiziellen Python-APIs von Depth Anything V2
und Depth Anything 3. Die Adapter führen nur dann CUDA/FP16 aus, wenn Torch CUDA meldet;
`doctor` scheitert sonst sichtbar. Ergebnisse werden per JSON-Schema und anhand der
Binärgrößen validiert und können als selbstenthaltendes Bundle in die Sparse-Voxel-
Runtime importiert werden.

Modelle, Gewichte, Torch und CUDA sind nicht im Repository enthalten. Ein grüner
Vertragstest beweist Prozessstart, Schema, Kanäle, Bundle und Vergleichsrechnung – keine
Modellqualität, keinen RTX-Durchsatz und keine GPU-Verfügbarkeit.

**CUDA ist für Depth-Anything-Inferenz an sich nicht zwingend** — nur für DIESEN
Python-Adapter-Pfad. `docs/village-box-cultivation-experimente.md`/
`docs/browser-native-provider-kandidaten.md` (2026-09-01) belegen einen zweiten, echten
Pfad: `@huggingface/transformers` (npm) führt `onnx-community/depth-anything-v2-small`
per CPU/WASM aus, ganz ohne GPU/CUDA/Torch, in unter 2 Sekunden pro Bild, visuell
verifiziert korrekt. Reines `tools/scratch-*`-Experiment, keine Integration in `runtime/`
oder `window.SHADED` — aber der CUDA-Zwang gilt nur für den bestehenden Python-Adapter,
nicht für Depth-Anything-Inferenz allgemein.

## PWA

Manifest, Service Worker und Installationsmodul sind vorhanden. Der Browser-Test prüft
einen aktiven Service Worker, gecachte Runtime-Module, das kanonische Demo,
Offline-Navigation und erneutes Demo-Laden ohne Netzwerk. Ob ein konkretes Betriebssystem
einen nativen Installationsdialog zeigt, bleibt eine Eigenschaft dieser Plattform.
