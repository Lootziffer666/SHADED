# SHADED: Billige räumliche Hypothesen aus Tiefengrenzen

**Status:** Architektur- und Referenznotiz  
**Ziel:** Aus Einzelbildern und späteren Frames glaubhafte, räumlich stabile Szenen erzeugen. Nicht der Anspruch eines metrisch korrekten digitalen Zwillings, sondern eine schöne, plausible und aus einem begrenzten Kameraraum konsistente Welt.

> **Bezug zu `docs/village-box-cultivation-experimente.md`:** diese Notiz formalisiert genau
> die Kette, die dort in Runden 17–21 experimentell erarbeitet wurde (Tiefenkanten statt
> Farbmasken für die Grobsegmentierung, Tron-Bike-Grenzverfolgung, VP-Richtungen als
> Zusatzregel statt Pflichtschritt, Fake-LiDAR zur Hüllen-Prüfung, Provenance-Trennung
> OBSERVED/INFERRED/GENERATED). Eine konkrete Präzisierung hier, die in Runde 20b (Tron-Tracer)
> noch fehlte: an Kreuzungen soll der Tracer nicht irgendeiner Richtung mit Kantenstütze
> folgen, sondern der Seite, deren lokale Fläche die stärkste zusammenhängende KOMPATIBLE
> Masse trägt (§„Tron-Bike / Boundary Tracing", Schritt 5) — siehe die Nachfolge-Runde dazu
> in der Experimente-Datei.

## Leitidee

SHADED soll schwere Vision- und Rekonstruktionsverfahren nicht reflexhaft durch noch größere Modelle ersetzen. Es soll ihre tatsächlich benötigten Teilfunktionen isolieren und zuerst mit sehr billigen, deterministischen Operatoren lösen.

Die Zielgröße ist kein universeller Benchmark-Sieg:

> Etwa 80 Prozent der wahrgenommenen räumlichen Qualität mit höchstens etwa 20 Prozent der Ressourcen.

Das gilt besonders für mobile und lokale Browser-/PWA-Pfade. Ein großer Provider bleibt ein optionaler Fallback für Fälle, die durch die billige Kette sichtbar nicht stabil lösbar sind.

## Nicht „wahre“ Tiefe

Das zentrale Artefakt heißt nicht einfach `DepthMap`. Es ist ein `PlausibleDepthField`: eine Verbindung aus beobachteten Tiefen, geometrischen Flächenhypothesen, erzeugten Schließungen und ihrer Herkunft.

Eine einzelne Ansicht kann verdeckte Seiten nicht messen. SHADED darf sie trotzdem schließen, wenn die Fortsetzung visuell und geometrisch konsistent ist. Die Schließung ist dann nicht `OBSERVED`, sondern `INFERRED` oder `GENERATED`.

Zielkriterium:

> Für alle erlaubten virtuellen Kameraposen wirkt die Szene geschlossen, ruhig, plausibel und ohne störende Löcher, Nähte oder Selbstschnitte.

## Primärer billiger Einstieg

Der erste Schritt ist **nicht** semantische Segmentierung und nicht sofort ein Ebenen-Solver. Er ist eine topologische Zerlegung anhand von Tiefengrenzen.

```text
Grobe Depthmap / relative Tiefenordnung
  ↓
Depth-Gradienten, Tiefenvarianz, gegebenenfalls Laplacian
  ↓
DepthBoundaryMap
  ↓
Boundary Tracing („Tron-Bike“ / Snake)
  ↓
Flood Fill
  ↓
DepthCluster mit sauberer Außenkontur
```

### Warum Tiefengrenzen vor Farbkanten

Farben trennen oft Beleuchtung, Schatten, Textur oder Material, die geometrisch zu derselben Fläche gehören. Eine Depth Boundary trennt dagegen dort, wo ein Tiefensprung, eine Verdeckung oder eine Faltung vermutet wird.

Daraus folgt:

- Farbe und Textur sind sekundäre Hilfen.
- Tiefenstruktur ist die primäre Segmentierungsdomäne.
- Fluchtpunktfamilien liefern Richtungsordnung.
- Flood Fill macht aus geschlossenen Außenlinien verwendbare Flächencluster.

## Tron-Bike / Boundary Tracing

Ein Tracer fährt wie ein Tron-Bike entlang bekannter Grenzen. Er hält die erkannte Grenze auf einer festen Seite und verfolgt die Außenlinie einer Masse. Das Ergebnis ist keine freie Kantenwolke, sondern eine geordnete Kontur.

Minimaler Ablauf:

1. Berechne die Tiefegradienten der groben Map.
2. Schwelle daraus eine `boundaryMask`.
3. Suche per Scan einen noch unbesuchten Randpixel.
4. Verfolge die Kontur in 8er-Nachbarschaft mit fester Handregel.
5. An Kreuzungen folgt der Tracer dem Ast, dessen lokale Seite die stärkste zusammenhängende kompatible Masse trägt.
6. Schließe die Kontur am Startpunkt oder markiere sie als offene Bildrandkontur.
7. Fülle das konturumgrenzte Innere per Flood Fill.
8. Wiederhole für nicht besuchte Regionen.

```text
for every unvisited boundary seed:
  contour = traceBoundary(seed, boundaryMask, massCompatibility)
  cluster = floodFill(interiorSeed(contour), !boundaryMask)
  emit DepthCluster(contour, cluster)
```

Die Kreuzungsregel ist wichtig: Der Tracer soll nicht beliebig an einer Kante abbiegen, sondern entlang der zusammenhängenden Tiefenmasse weiterfahren. Dadurch bleiben Außenlinien bei Raumkanten, Faltungen und Objektkonturen stabiler als bei einer bloßen Kantenliste.

## Flächen kultivieren

Ein Cluster ist zunächst nur ein Gebiet. Es wird danach schrittweise zu einer Fläche kultiviert.

```text
DepthCluster
  ↓
seed + Außenkontur + lokale Tiefenstatistik
  ↓
kompatible Nachbarn aufnehmen
  ↓
Stopp an DepthBoundary, Occlusion, konkurrierender Richtung
  ↓
SurfacePatch
  ↓
optional: Ebene, Box, Prisma, Zylinder oder freier Patch
```

Ein Nachbar darf zu einem Patch gehören, wenn er:

- nicht von einer starken Depth Boundary getrennt ist,
- zur Tiefenordnung und lokalen Gradientenrichtung passt,
- den Ebenen-/Patch-Residuum nicht über die Schwelle hebt,
- nicht bereits besser durch eine konkurrierende Hypothese erklärt wird.

Fluchtpunkte oder Richtungsfamilien sind kein Pflichtschritt im MVP. Sie werden später zu einer günstigen zusätzlichen Regel: Gerade Raumkanten, die derselben Projektionsfamilie folgen, begünstigen denselben Wand-, Boden- oder Deckenpatch.

## Einfache Formen vor komplexer Geometrie

Ein sichtbar geklusterter Bereich wird nicht sofort zu einem dichten Mesh. SHADED prüft zuerst die kleinste plausible Erklärung:

| Beobachtetes Muster | Erste Hypothese |
|---|---|
| Ruhige große Fläche | Ebene |
| Frontaler Gegenstand mit Tiefenkante | Flache Schicht oder extrudierte Platte |
| Rechteckige/orthogonale Kontur | Box |
| Dach-/Keil-Silhouette | Prisma |
| Runde Kontur mit Achse | Zylinder |
| Unregelmäßige, lokal zusammenhängende Masse | vereinfachter Mesh-Patch |

Diese Reihenfolge reduziert Flimmern, Löcher und überflüssige Geometrie. Details kommen erst später.

## Sichtbar schließen

Verdeckte oder rückwärtige Bereiche dürfen zur ästhetischen Vervollständigung erzeugt werden. Verwendbare primitive Operationen sind:

- sichtbare Ebene bis zu einer plausiblen Grenze fortsetzen,
- Boden hinter einer Verdeckung koplanar fortführen,
- Wand oder Decke entlang einer sichtbaren Faltung verlängern,
- Volumen aus einer Frontfläche extrudieren,
- spiegelbare Volumen an einer plausiblen Symmetrieebene schließen,
- eine Öffnung als Durchgang, Nebelraum oder Fernkulisse behandeln statt eine harte Wand zu erfinden.

Die Anschlusszone zwischen Beobachtung und Schließung ist besonders wertvoll. Dort muss die Hypothese an einer sichtbaren Faltung, Kontur, Ebene oder Kante andocken. Diese Andockbedingung begrenzt Lage und Volumen des erzeugten Teils stark.

## Fake-LiDAR als geometrischer Operator

Eine Punktwolke oder eine vorläufige Hülle kann virtuelle LiDAR-Scans und virtuelle Kamerabilder aus bisher nicht aufgenommenen Posen erzeugen.

Das dient in SHADED vorrangig nicht zur historischen Wahrheitsfindung. Es dient dazu, plausible Hüllen zu testen, zu lokalisieren und visuell zu stabilisieren.

```text
beobachtete Punktwolke + SurfacePatches + geschlossene Hypothesen
  ↓
virtuelle Pose wählen
  ↓
Raycast / Fake-LiDAR
  ↓
virtuelle Depth-, Normal-, ID- und Silhouette-Maps
  ↓
Naht-, Loch-, Silhouetten- und Selbstschnittprüfung
  ↓
Hypothesenparameter verbessern oder verwerfen
```

Wichtige Aussage: Ein virtueller Scan macht eine verdeckte Rückseite nicht nachträglich gemessen. Er kann aber sehr effektiv zeigen, ob die angenommene Rückseite an der real sichtbaren Geometrie sauber andockt, ob sie ein lokalisierbares Volumen bildet und ob sie aus dem erlaubten Bewegungsraum störende offene oder widersprüchliche Silhouetten erzeugt.

## Kostenfunktion für schöne Plausibilität

Die Optimierung bewertet nicht den Abstand zu unbekannter Bodenwahrheit, sondern die Qualität einer begehbaren visuellen Erklärung.

```text
cost =
    wSeam       * Anschlussfehler
  + wSilhouette * offene Sichtseiten
  + wIntersect  * Selbstschnitte und Kollisionen
  + wReproject  * Widerspruch zur Originalansicht
  + wJitter     * Instabilität bei kleinen Kamerabewegungen
  + wComplexity * unnötige Flächen und Primitive
```

Die Gewichte priorisieren in dieser Reihenfolge:

1. Originalansicht nicht verletzen.
2. Sichtbare Nähte und Löcher vermeiden.
3. Bei kleinen Bewegungen ruhige Parallaxe behalten.
4. Die einfachste Geometrie bevorzugen.
5. Erst dann Details, Material und Realismus erhöhen.

## Virtuelle Multi-Views und Gaussian Splats

Sobald die Hülle innerhalb eines vorgegebenen Kamerasegments stabil ist, kann SHADED virtuelle Ansichten samplen.

```text
PlausibleDepthField
  ↓
virtuelle Kameraposen im erlaubten Bewegungsraum
  ↓
synthetische Multi-Views
  ↓
Punktwolken-/Splat-Initialisierung
  ↓
Gaussian Splats
  ↓
weicher, dichter, räumlich stabiler Renderer
```

Für dieses Ziel sind Splats ideal: Sie müssen kein wasserdichtes CAD-Modell darstellen. Sie verdichten Parallaxe, Verdeckung, Farbe und atmosphärische Kontinuität zu einer räumlichen Darstellung. Sie funktionieren damit wie eine räumliche Erweiterung von 360-Grad-Erlebnissen, nur dass die Sichtbasis aus echten und plausibel geschlossenen Anteilen bestehen kann.

## Provenienz und Unsicherheit

Plausibilität darf intern nicht mit Beobachtung verwechselt werden. Jedes Patch, Voxel oder Splat trägt daher wenigstens:

```ts
type Provenance =
  | "OBSERVED"
  | "INFERRED"
  | "GENERATED"
  | "USER_APPROVED"
  | "REJECTED"

type SpatialState =
  | "FREE"
  | "SURFACE"
  | "OCCUPIED"
  | "UNKNOWN"
```

- `OBSERVED`: Sichtbarer Treffer oder direkter Bildbeleg.
- `INFERRED`: Aus Kontinuität, Ebene, Faltung oder Geometriezwang gefolgert.
- `GENERATED`: Spiegelung, Extrusion, Füllfläche, Fernkulisse oder bewusst geschaffene Rückseite.
- `UNKNOWN`: Nicht sichtbar und nicht ausreichend sinnvoll zu schließen.
- `REJECTED`: Durch spätere echte Aufnahme, Nutzerkorrektur oder starke Inkonsistenz verworfen.

Diese Information muss den ästhetischen Renderpfad nicht stören. Sie ist für Debug-Ansicht, iterative Erfassung, Editierbarkeit und die Trennung von harter Navigation von dekorativer Vervollständigung unverzichtbar.

## Mehr Frames

Weitere reale Frames lösen Unsicherheit nicht durch bloße Menge, sondern durch neue Baseline und neue Sichtbarkeit.

- Ein nahezu identischer Frame bestätigt wenig.
- Eine seitliche Bewegung testet Parallaxe und verdeckte Bodenstücke.
- Ein Schritt vorwärts testet Rückwand versus Durchgang.
- Eine Gegenansicht kann eine erzeugte Rückseite ersetzen oder verwerfen.

Ablauf:

```text
neuer echter Frame
  ↓
Pose/Feature-Registrierung
  ↓
Beobachtungen in gemeinsamen Raum übertragen
  ↓
Hypothesen mit der Vorhersage vergleichen
  ↓
Konfidenz und Provenienz aktualisieren
  ↓
Patches/Volumen neu kultivieren oder ersetzen
```

Generierte Geometrie kann durch echte Sichtbarkeit hochgestuft oder entfernt werden. Sie darf aber nie allein dadurch „wahrer“ werden, dass sie sich aus ihrer eigenen virtuellen Kamera konsistent rendert.

## Architekturgrenze

Die billige Kette ersetzt nicht jede Modellfunktion. Sie löst insbesondere:

- zusammenhängende Tiefenmassen finden,
- Außenlinien bestimmen,
- Flächen clusterweise abgrenzen,
- einfache Geometrie kultivieren,
- sichtbare Faltungen und Anschlüsse als Constraints nutzen,
- plausible Volumen schließen,
- virtuelle Sichtfehler finden,
- Splats für eine schöne räumliche Experience vorbereiten.

Ein schweres Modell bleibt nur für klar begrenzte Restfragen sinnvoll:

- bedeutungsvolle semantische Unterscheidung bei schwacher Geometrie,
- texturarme oder verdeckte Flächen ohne nutzbare Grenze,
- organische oder hochkomplexe Formen,
- echte metrische Kalibrierung,
- globale Multi-View-Registrierung unter schwierigem Bildmaterial.

## MVP-Reihenfolge

1. Import einer beliebigen groben Depthmap oder relativen Tiefenordnung.
2. GPU/WASM: Depth-Sobel, Varianz und binäre `boundaryMask`.
3. CPU/WASM: Boundary Tracing mit 8er-Nachbarschaft und Masse-Tie-Breaker.
4. Flood Fill: `DepthCluster` mit Maske, Kontur, Flächengröße, mittlerer Tiefe und Varianz.
5. Debug-Overlay: Konturen, Cluster-ID, Tiefenmittelwert, offene Grenzen.
6. Einfache Patch-Hypothesen: Ebene und extrudierte Platte zuerst.
7. Virtueller Raycast: Depth-, Normal- und Provenance-Buffer aus alternativen Posen.
8. Naht-/Loch-/Silhouettenkosten; nur die einfachsten Reparaturen anwenden.
9. Splat-Export oder Splat-Initialisierung aus der stabilisierten Hülle.
10. Erst danach: VP-Familien, RANSAC, Dykstra und schwergewichtige Fallbacks.

## Abnahmekriterien

- Der komplette Cluster-Schritt läuft lokal und ohne Python, Server oder neuronales Modell.
- Eine Depth Boundary erzeugt nachvollziehbar Außenkontur und Füllmaske.
- Konturen sind bei kleinen Störungen stabil genug, um große Flächen nicht zufällig zu zerreißen.
- Eine erzeugte Schließung ist an beobachtete Geometrie gebunden und mit Herkunft markiert.
- Virtuelle Ansichten zeigen innerhalb eines definierten Bewegungsraums keine dominanten Löcher oder offenen Rückseiten.
- Originalansicht und beobachtete Silhouetten bleiben erhalten.
- Schwere Provider werden nur bei explizit gemessener Unzulänglichkeit des billigen Pfads aufgerufen.

## Verhältnis zu bestehenden SHADED-Dokumenten

Diese Notiz ersetzt keine Raumrekonstruktion mit metrischer Point Map, RANSAC, Dykstra, EDT und Dijkstra. Sie definiert den bewusst viel früheren, günstigen Einstieg: Topologische Flächencluster und plausible Sichtstabilisierung.

Dykstra bleibt sinnvoll, sobald diskrete Strukturentscheidungen gefallen sind und Ebenenparameter gemeinsam konsistent gemacht werden sollen. Mehransicht-Registrierung bleibt sinnvoll, sobald echte weitere Aufnahmen vorliegen. Der neue Pfad liefert jedoch vorher bereits verwertbare Cluster, Konturen, Schließungsanschlüsse und eine optisch stabile Grundlage für virtuelle Sicht und Splats.
