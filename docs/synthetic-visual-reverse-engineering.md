# Synthetic Visual Reverse Engineering — Methodenreferenz

> **Status:** Forschungsnotiz / Referenz, **keine verbindliche Architektur**, **kein Skill**, keine automatische Entscheidungsregel.
>
> Zweck dieses Dokuments ist, die im Experiment diskutierten Verfahren festzuhalten, damit sie nicht bei jeder Session neu erklärt oder aus älteren SHADED-Annahmen rekonstruiert werden müssen. Mehrere Ansätze widersprechen sich bewusst oder gelten nur für bestimmte Teststufen.

## 1. Ziel

Das Ziel ist **nicht**, aus einem Einzelbild die historisch wahre, verborgene 3D-Welt zu erraten. Das ist im Allgemeinen nicht eindeutig lösbar.

Das Ziel ist:

> Aus sichtbaren Bildstrukturen möglichst billig eine **plausible, geschlossene, editierbare und begehbare synthetische Geometrie** zu konstruieren, die mit der sichtbaren Projektion vereinbar ist.

Die Leitidee ist **visuelles Reverse Engineering unbekannter Geometrie**:

```text
sichtbare Struktur
→ zugrunde liegende Konstruktionslogik
→ synthetische Ergänzung des Unsichtbaren
→ geschlossener 3D-Proxy
```

Das Verfahren soll zunächst dort stark sein, wo Geometrie regelhaft ist:

- Architektur
- Räume
- Hallen
- Fassaden
- Wege
- Dächer
- Möbel / Kisten / Props
- stilisierte oder isometrische Szenen

Organische Formen, Stoff, Menschen, Vegetation und stark gekrümmte Geometrie sind spätere Sonderfälle oder Fallback-Kandidaten.

---

## 2. Grundannahmen für den billigsten Solver

Die erste Solver-Stufe darf bewusst harte Priors nutzen:

- planare Flächen
- rechtwinklige Wände / Manhattan-Geometrie
- gegenüberliegende Wände parallel
- gemeinsame Bodenebene
- gemeinsame Hochachse
- geschlossene Volumina
- verborgene Flächen dürfen synthetisch sein
- metrische Wahrheit ist nicht erforderlich

Wichtig:

> Eine synthetische Rückwand muss nicht die echte Rückwand sein. Sie muss nur geometrisch konsistent, glaubhaft und für Navigation / Kollision / Texturierung brauchbar sein.

Wenn diese Annahmen nicht passen, kann später auf allgemeinere Winkel oder schwerere Verfahren eskaliert werden.

---

## 3. Nicht „Depth first“, sondern „Faces / Structure first“

Klassischer schwerer Pfad:

```text
RGB
→ monokulare Depth-Schätzung
→ Punktwolke
→ Mesh
→ Bereinigung
```

Alternative Forschungsrichtung:

```text
RGB
→ strukturelle Flächen / Kanten / Relationen
→ perspektivische Entzerrung
→ Face Graph
→ Falt-/Winkelregeln
→ lokales Volumen
→ globale Verortung
```

Die zentrale Frage lautet nicht:

> „Wie tief ist jeder Pixel?“

sondern:

> „Welche ebenen Bauteile sehe ich, wie hängen sie zusammen, und welche einfachen Regeln schließen sie zu einem Körper?“

---

# 4. Verfahrensfamilien

## 4.1 Kantenbasierter Primitive-Extractor

### Idee

Strukturelle Kanten werden aus dem Bild gewonnen und in wenige globale Raumrichtungen eingeordnet.

Für einen quaderartigen 3D-Raum existieren genau drei Raumachsen:

```text
X
Y
Z
```

Bei perspektivischer Projektion entsprechen ihnen bis zu drei globale Fluchtpunkte:

```text
alle X-Kanten → Vx
alle Y-Kanten → Vy
alle Z-Kanten → Vz
```

Bei orthographischer / exakt axonometrischer Projektion liegen die Fluchtpunkte projektiv im Unendlichen; die jeweiligen Kanten bleiben parallel.

### Wichtige Regel

**Nie pro Kante oder pro Objekt eigene Fluchtpunkte erzeugen.**

Wenn eine Kante nicht zur globalen Familie passt, sind wahrscheinlicher:

- Eckpunkt falsch lokalisiert
- Kante falsch klassifiziert
- Schatten / Anti-Aliasing als Struktur interpretiert

Nicht: „neuer Fluchtpunkt“.

### Würfel-Benchmark

Eine typische sichtbare Würfelsilhouette besitzt **6 strukturelle Außenecken**. Zusätzlich ist bei drei sichtbaren Flächen häufig die innere sichtbare Würfelecke / Flächenkreuzung beobachtbar.

Ein Extractor, der denselben Würfel einmal als Vierpunkt-Polygon und einmal mit Zusatzknoten beschreibt, ist strukturell unzuverlässig.

### Robustheit

Kleine Pixelabweichungen sind weich. Die Topologie ist hart.

```text
Topologie / Richtungsfamilie = hart
Pixelkoordinate = weich
```

Nach der strukturellen Erfassung dürfen Eckpunkte durch globale Constraints nachkorrigiert werden.

---

## 4.2 Fluchtpunkte nicht im Pixelraum „herumschieben“

Ein weit außerhalb des Bildes liegender Fluchtpunkt ist numerisch schlecht konditioniert. Ein kleiner Kantenwinkelfehler kann tausende Pixel Fluchtpunktverschiebung erzeugen.

Deshalb:

- Fluchtpunkte nicht als lokale Agentenziele im Pixelraum optimieren.
- Kanten / Geraden sammeln.
- globale projektive Richtung robust fitten.
- Fluchtpunkt nur als projektive Repräsentation dieser Richtung verwenden.

Homogene Darstellung:

```text
V = (x, y, w)
```

Für Richtungen im Unendlichen kann `w = 0` sein.

Wenn Kameraintrinsik `K` bekannt oder geschätzt ist:

```text
d ∝ K⁻¹ v
```

Damit können echte 3D-Richtungswinkel geprüft werden. 90°-Orthogonalität wird im Kameraraum geprüft, **nicht** als 90°-Bildwinkel.

---

## 4.3 Perspective Rectification / Fläche begradigen

Sobald eine planare sichtbare Fläche erkannt ist, wird sie perspektivisch entzerrt.

```text
Bildpolygon
→ Homographie
→ frontale / planare 2D-Fläche
```

Die entzerrte Fläche wird danach als echtes Bauteil behandelt:

- saubere 2D-Geometrie
- relative Kantenverhältnisse
- direkt nutzbare Textur
- definierte gemeinsame Kanten

Dies ist ein Kernschritt für die spätere Faltlogik.

---

## 4.4 „Inverse Pepakura“ / Papercraft rückwärts

Pepakura klassisch:

```text
3D-Mesh
→ Faces
→ Shared Edges
→ 2D-Abwicklung
```

Gesuchte Umkehrung:

```text
2D-Bild
→ sichtbare planare Faces
→ perspektivisch entzerren
→ Shared Edges
→ Faltbeziehungen
→ 3D zusammenfalten
```

Metapher:

> **Perspective-corrected inverse papercraft.**

Nach Entzerrung wird ein Face Graph aufgebaut:

```text
Face A
├─ shared edge → Face B
└─ shared edge → Face C
```

Bei Manhattan-Geometrie sind viele Winkel direkt bekannt:

```text
Wand ↔ Wand = 90°
Wand ↔ Boden = 90°
```

Dachflächen erhalten eigene Faltwinkel bzw. First-Constraints.

---

## 4.5 Sichtbare Flächen direkt als Bauteile verwenden

Ein sehr einfacher Pfad lautet:

1. sichtbare Fläche erkennen
2. ausschneiden
3. entzerren
4. als Mesh-Face erzeugen
5. mit Nachbarflächen über Shared Edges verbinden
6. richtig neigen / rotieren
7. schließen

Vorteil:

> Die Flächen werden nicht erst aus einer Punktwolke rekonstruiert. Sie **sind bereits die Bauteile**.

---

## 4.6 Verborgene Geometrie durch Kopieren / Spiegeln / Parallelverschiebung

Für einfache, ungefähr symmetrische oder prismatische Architektur genügt häufig:

```text
sichtbare Front
+ sichtbare Seite
→ Gegenflächen erzeugen
→ Volumen schließen
```

Wichtig: Bei Quadern ist „Spiegeln“ oft nicht einmal die beste Beschreibung. Gegenüberliegende Wände sind **parallel verschobene Kopien**.

```text
Frontfläche + Tiefenvektor → Rückwand
Seitenfläche + Breitenvektor → Gegenseite
```

Für einen Editor reichen als primitive Operationen:

- Select
- Duplicate
- Rotate / Translate
- Snap
- Weld / Close

Der Pivot bzw. die lokale Objektmitte kann aus dem bereits aufgebauten Face-/Edge-Gerüst abgeleitet oder zunächst gesetzt werden.

### Erfolgsmaß

Nicht Ground Truth, sondern:

- geschlossen
- konsistent
- drehbar
- begehbar
- texturierbar
- erweiterbar

---

# 5. Agenten- / Operatorenansätze

## 5.1 Früher Cellular-Test: GROW / ERODE / SMOOTH

Experimenteller Ausgangspunkt:

- Zellen tragen Werte
- GROW erhöht / füllt
- ERODE senkt / trägt ab
- SMOOTH glättet
- lokale Regeln erzeugen emergente Formänderungen

Der erste Test zeigte, dass lokale Operatoren Geometrie bzw. Relief beeinflussen können, aber reine Bildenergie / Kantenmetriken leicht zu Kontur-Nachzeichnung, Adermustern oder Rauschen führen.

**Lehre:** Operatoren sollten nicht frei „schöne Form“ erzeugen, sondern klar definierte geometrische Constraints bearbeiten oder Struktur erfassen.

---

## 5.2 Fehlgeschlagener Ansatz: Fluchtpunkte lokal durch Operatoren optimieren

Versuch:

- ALIGN / ORTHO usw. verändern iterativ Fluchtpunktpositionen im Pixelraum.

Problem:

- weit entfernte Fluchtpunkte sind extrem schlecht konditioniert
- kleiner Winkelmessfehler → riesiger Pixelpositionsfehler
- lokale Iterationen können in eine intern konsistente, aber falsche Projektionskonfiguration driften

**Nicht als Widerlegung von Agenten verstehen.** Es widerlegt nur diese spezielle Parametrisierung.

---

## 5.3 Tron Boundary Walker

Ein Agent wird als „Tron-Fahrer“ gedacht:

```text
freie Fläche
→ stößt auf strukturelle Grenze
→ folgt ihr
→ hinterlässt Spur
```

Lokaler Zustand kann minimal sein:

```text
position
heading
insideSide = left | right
directionFamily = X | Y | Z | unknown
visited
```

Mögliche Regeln:

1. Folge einer stabilen Boundary.
2. Kleine Pixelabweichungen / AA ignorieren.
3. Bei strukturellem Knick Node setzen.
4. Bei Verzweigung nächste zulässige Richtung wählen oder Agent spawnen.
5. Spur nicht doppelt abfahren.
6. Rückkehr zum Startpunkt → Loop geschlossen.

Die Spur ist danach ein Kantengraph.

### Links / Rechts

Wie bei einer Polygonvermessung kann der Agent nur protokollieren:

```text
Strecke 1
RIGHT
Strecke 2
LEFT
Strecke 3
...
CLOSE
```

Diese Relation ist häufig robuster als die rohe Pixelkoordinate.

---

## 5.4 Surface / Boundary Cultivator

Noch stärker vereinfachte Idee:

> Nicht Kanten suchen, sondern **mögliche Flächen wachsen lassen**.

Start:

- Seed liegt sicher in einer Fläche.
- Region wächst in Nachbarpixel.
- Wachstum stoppt nur an stabilen, strukturell plausiblen Grenzen.

```text
Seed
→ Region wächst
→ Front kollidiert mit Hindernissen / anderer Region
→ Boundary stabilisiert sich
→ Fläche geschlossen
```

Vorteil gegenüber reiner Kantensuche:

- Schatten müssen nicht automatisch als Kanten gelten.
- Ein Bodencultivator kann durch eine dunklere Schattenzone weiterwachsen, wenn links und rechts weiterhin dieselbe Bodenhypothese gilt.
- Grenzen entstehen teilweise automatisch dort, wo zwei kultivierte Flächen aufeinandertreffen.

Beispiel Würfel:

```text
Top-Seed
Left-Seed
Right-Seed
```

Wo Top und Left zusammentreffen entsteht die gemeinsame Würfelkante. Der Algorithmus muss diese Kante nicht separat „entdecken“.

### Minimaltest

Für einen einzelnen Würfel drei Seeds manuell setzen und nur prüfen:

- wachsen die drei sichtbaren Flächen plausibel?
- entstehen gemeinsame Grenzen?
- entstehen die strukturellen Eckpunkte stabil?

Keine automatische Seed-Erkennung und kein 3D im ersten Test.

---

# 6. Piazza-Prinzip: lokal ungenau, global exakt schließen

Bei einer Polygonvermessung mit ausschließlich rechten Winkeln kann man eine Folge messen:

```text
S1, rechts,
S2, links,
S3, links,
S4, rechts,
...
→ zurück zum Start
```

Einzelmessungen dürfen ungenau sein. Harte globale Regeln korrigieren sie:

- nur 90°-Drehungen
- bekannte Reihenfolge
- links / rechts bekannt
- geschlossener Loop

Mathematisch muss am Ende gelten:

```text
Σ sᵢ = 0
```

Übertragen auf Bildgeometrie:

```text
lokale Messungen = weich
Topologie = hart
Orthogonalität = hart
Loop Closure = hart
```

Daraus folgt ein wichtiges Designprinzip:

> **Erst beobachten und Relationen sammeln. Danach global korrigieren.**

Nicht jeder lokale Agent muss die perfekte Geometrie liefern.

---

# 7. Mehrere Objekte als gegenseitige Korrektoren

Ein einzelner Proxy kann mehrdeutig sein. Mehrere Objekte derselben Szene teilen jedoch globale Bedingungen:

- Bodenebene
- Kamera
- Hochachse
- Raumrichtungsfamilien
- Verdeckungsordnung
- gemeinsame Wege / Abstände
- ähnliche Bauprinzipien

Damit entsteht ein globales Constraint-System.

```text
Haus A ≈ Hypothese
Haus B ≈ Hypothese
Haus C ≈ Hypothese
        ↓
gemeinsame Weltbedingungen
        ↓
A, B, C werden gemeinsam korrigiert
```

Mehr strukturierte Objekte können die Rekonstruktion **leichter**, nicht schwerer machen, weil sie redundante Messungen derselben Welt liefern.

### Mögliche globale Fehlerterme

```text
E_projection
E_ground
E_parallel
E_orthogonal
E_contact
E_occlusion
E_loop
E_equal-size
```

Der Solver soll harte Constraints respektieren und nur weiche Messgrößen relaxieren.

---

# 8. Scene Assembly

Lokale Objekt-Rekonstruktion und globale Szenenplatzierung sollten getrennt bleiben.

## A. Lokale Rekonstruktion

```text
Wie wird dieses Objekt aus seinen sichtbaren Faces gefaltet?
```

## B. Globale Verortung

```text
Wo steht dieses gefaltete Objekt in der Szene?
```

Globale Platzierung nutzt:

- gemeinsamen Boden
- projizierte Bildposition
- Größenrelationen
- Verdeckung
- Nachbarobjekte
- Wege / Kontakte

---

# 9. Texturierung

Sichtbare Faces besitzen nach der Rectification bereits eine direkt nutzbare Textur.

```text
sichtbares Face
→ Crop
→ Rectify
→ Texture
```

Für synthetische versteckte Faces genügt zunächst:

- gespiegelte Textur
- fortgesetzte Randfarbe
- Materialmittelwert
- einfache prozedurale Fläche

Perfekte Rückseiten-Textur ist **kein** Akzeptanzkriterium des ersten Geometriebeweises.

---

# 10. Depth / schwere Verfahren als spätere Fallbacks

Diese Forschungsrichtung ist ausdrücklich ein Versuch, schwere Schritte möglichst spät oder gar nicht zu benötigen.

Mögliche spätere Fallbacks:

- Depth Anything / andere monocular depth
- Multi-View
- Point Clouds
- COLMAP
- SDF / Raymarching
- ML-basierte Segmentierung

Sie sollen nicht automatisch der Startpunkt sein.

Hierarchieidee:

```text
bekannte / geometrisch abgeleitete Struktur
> constraint-basierte synthetische Completion
> geführte Schätzung
> monokulare Depth-Schätzung
```

---

# 11. Wichtige Failure Modes aus den Tests

## 11.1 Falsche Vertex-Zahl

Beispiel: projizierter Würfel wird als 4-Punkt-Polygon statt struktureller 6-Eck-Silhouette erkannt.

Folge:

- eine Raumrichtung geht bereits in 2D verloren
- jeder spätere 3D-Solver arbeitet mit falscher Topologie

## 11.2 Zu viele Knoten

Schatten, weiche Kontrastverläufe oder AA erzeugen zusätzliche Polygonknoten.

Gegenmittel:

- strukturelle Vereinfachung
- dominante Richtungsfamilien
- Topologieklasse erzwingen
- keine naive Konturverfolgung als endgültige Geometrie

## 11.3 Schatten als Objektkante

Dunkle Bodenschatten wurden teilweise als Würfelgrenze interpretiert.

Gegenmittel:

- Flächenhypothesen statt nur Gradient
- Cultivator kann durch Schatten wachsen
- gemeinsame Richtungs-/Flächenconstraints

## 11.4 Pro Kante eigener Fluchtpunkt

Fundamentaler Fehler. Ein dreidimensionales rechtwinkliges System hat maximal drei globale Richtungsfamilien / Fluchtpunkte.

## 11.5 Parallelannahme trotz echter Perspektive

Entsprechende 3D-Kanten sind im Bild nicht zwingend parallel. Bei echter Perspektive können z. B. Vertikalen links nach links und rechts nach rechts geneigt sein, solange sie zum selben globalen `Vz` laufen.

## 11.6 Fluchtpunktoptimierung in Pixelkoordinaten

Weit entfernte Fluchtpunkte sind numerisch instabil. Nicht lokal in Pixelkoordinaten optimieren.

## 11.7 Testbild selbst nicht projektiv konsistent

Bei generativen Bildern muss geprüft werden, ob vermeintlich identische Objekte tatsächlich einer gemeinsamen Kamera-Geometrie folgen. Für harte Benchmarks besser echte 3D-Render verwenden.

## 11.8 Visualisierung verdeckt Fehler

Dicke Overlay-Linien können kleine Abstände verdecken. Für Verifikation:

- dünne / halbtransparente Linien
- schattenfreie Benchmarks
- Top-Down / Front / Orbit gleichzeitig

---

# 12. Minimaler Testpfad

Die Komplexität soll nur schrittweise erhöht werden.

## Stufe 0 — ein Würfel, 2D

Akzeptanz:

- korrekte strukturelle Eckpunkte
- 3 Richtungsfamilien
- keine Schattenkanten
- reproduzierbare Topologie

## Stufe 1 — vier identische Würfel

Ground Truth möglichst aus echter 3D-Szene.

Akzeptanz:

- ein kanonisches Cube-Mesh
- vier Instanzen
- gemeinsame Bodenebene
- korrekte relative Platzierung
- Reprojektion plausibel
- Top-Down stimmt

## Stufe 2 — Quaderdorf

Nur einfache Quader + Wege.

Akzeptanz:

- Footprints
- Höhen
- relative Größen
- Verortung
- Wege als Bodenflächen

## Stufe 3 — Quader + Satteldächer

Akzeptanz:

- Dachflächen separat
- First
- Wand/Dach-Verbindung
- geschlossener Hausproxy

## Stufe 4 — Teilverdeckungen

Akzeptanz:

- mehrere Objekte unterstützen globale Korrektur
- Occlusion ordering bleibt konsistent

## Stufe 5 — Textur / Stil

Erst jetzt:

- Details
- Materialien
- dekorative Geometrie
- komplexere Architektur

---

# 13. Empfohlene Pipeline als derzeit sauberste Synthese

```text
INPUT RGB
   ↓
[1] Seeds / strukturelle Regionen / Kanten
   ↓
[2] Tron Boundary Walker ODER Surface Cultivator
   ↓
[3] Kantengraph / Face Graph
   ↓
[4] drei globale Richtungsfamilien / projektive Geometrie
   ↓
[5] Perspective Rectification je planarem Face
   ↓
[6] harte lokale Regeln
    - planar
    - 90° wo zulässig
    - shared edges
    - loop closure
   ↓
[7] inverse-Papercraft-Faltung
   ↓
[8] versteckte Faces synthetisch schließen
   ↓
[9] lokale Objekt-Proxies
   ↓
[10] globale Scene Assembly / Relaxation
   ↓
[11] Texturprojektion
   ↓
EDITIERBARES / DREHBARES / BEGEHBARES PROXY-MESH
```

---

# 14. Operatoren, die weiterhin sinnvoll sein könnten

Operatoren sollten **Constraint-Verletzungen abbauen**, nicht frei Form erfinden.

Mögliche Rollen:

- `GROW` — Fläche kultivieren
- `STOP` — Wachstum an stabiler Grenze stoppen
- `MERGE` — kompatible Regionen zusammenführen
- `SPLIT` — Region an stabiler Struktur trennen
- `SNAP` — Eckpunkt auf geometrisch konsistenten Schnittpunkt ziehen
- `ALIGN` — Kante einer globalen Richtungsfamilie zuordnen
- `EQUALIZE` — als identisch bekannte Maße angleichen
- `ORTHO` — 3D-Orthogonalität nach Rectification / Kameralösung erzwingen
- `PLACE` — Objekt auf Bodenebene verorten
- `RELATE` — Nachbarrelationen berücksichtigen
- `CLOSE` — fehlende Gegenflächen ergänzen
- `RELAX` — weiche Residuen global verteilen

Nicht empfohlen:

- Fluchtpunkte als lokale Pixelkoordinaten durch Agenten verschieben
- harte Topologie durch Glättung verändern
- sichtbare Ground Truth überschreiben, nur um einen Fit schöner zu machen

---

# 15. Harte vs. weiche Information

## Hart

- Objekt-/Face-Adjazenz, wenn sicher
- Links/Rechts-Turn-Sequenz
- Loop muss schließen
- bekannte Parallelität
- bekannte Orthogonalität
- gemeinsame Bodenebene
- identische Mesh-Klasse bei explizit identischen Objekten

## Weich

- Pixel-Eckpunkt
- Segmentlänge
- Helligkeitskante
- Schattenkante
- lokale Flächenmaske
- Texturgrenze

Prinzip:

> **Weiche Messungen werden an harte Relationen angepasst, nicht umgekehrt.**

---

# 16. Was bisher als mechanisch gezeigt wurde

Die bisherigen Tests haben zumindest als Proof-of-Mechanism gezeigt:

- sichtbare Flächen können in grobe Geometrie überführt werden
- geschlossene drehbare Proxy-Körper lassen sich erzeugen
- mehrere einfache Objekte können plausibel gemeinsam verortet werden
- Top-Down / Orbit / Frontansichten sind als starke Verifikation geeignet
- Fehler lagen mehrfach upstream in 2D-Struktur / Kantenwahl, nicht zwingend in der 3D-Schließung selbst

Nicht bewiesen ist bislang:

- allgemeine Robustheit auf beliebigen Bildern
- metrische Rekonstruktion
- vollautomatische Seed-/Face-Erkennung
- organische Geometrie
- komplexe Innenräume ohne harte Priors

---

# 17. Forschungsfragen

1. Reicht ein Surface Cultivator mit wenigen Seeds, um planare Faces robuster als klassische Kantenverfolgung zu bestimmen?
2. Kann die Boundary primär als Ergebnis konkurrierender Flächenregionen entstehen?
3. Wie viel Kamerakalibrierung ist wirklich nötig, bevor Rectification stabil funktioniert?
4. Wann reicht Manhattan-Geometrie, wann muss ein allgemeiner Winkel-Solver übernehmen?
5. Wie stark können mehrere zunächst falsche Objekt-Proxies sich über globale Constraints gegenseitig korrigieren?
6. Wie billig ist ein robuster globaler Solve auf Face-/Plane-Parametern gegenüber Dense Depth?
7. Welche Unsicherheiten müssen explizit erhalten bleiben, statt früh „gelöst“ zu werden?
8. Wie gut funktioniert die inverse-Papercraft-Idee bei Innenräumen, wenn Boden/Wand/Decke bereits grob bekannt sind?

---

# 18. Leitprinzipien

1. **Nicht Ground Truth erzwingen, wenn Plausibilität genügt.**
2. **Nicht Pixel lösen, wenn Relationen reichen.**
3. **Nicht Fluchtpunkte lokal optimieren, wenn globale Linienfamilien direkt lösbar sind.**
4. **Nicht perfekte Masken verlangen, wenn Face-/Edge-Topologie genügt.**
5. **Erst Struktur richtig, danach glätten.**
6. **Lokale Agenten beobachten; globale Mathematik korrigiert.**
7. **Mehr strukturierte Objekte sind zusätzliche Messungen derselben Welt.**
8. **Schwere ML-/Depth-Verfahren sind Fallbacks, nicht automatisch Fundament.**
9. **Eine gute aktuelle Hypothese niemals als zeitlose Skill-Regel konservieren.**

---

## Kurzfassung für Claude

> Treat the task as synthetic visual reverse engineering, not ground-truth monocular reconstruction. Prefer planar faces, shared edges, global direction families, perspective rectification, hard Manhattan/closure constraints, and inverse-papercraft assembly. Local agents may trace or cultivate candidate surfaces, but must not optimize far-away vanishing-point pixel coordinates. Build a Face/Edge Graph first, solve global projection geometry second, fold visible faces into local 3D proxies third, synthesize hidden faces fourth, and only then perform global scene relaxation and optional texture/depth refinement. Preserve uncertainty and never replace a simpler geometrically valid solution with a heavier provider merely because the source is a single RGB image.
