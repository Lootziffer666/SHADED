# SHADED – Raumrekonstruktion: Dykstra und Dijkstra

**Status:** verbindliche Ergänzung zu [`reconstruction-provider-und-world-surface-graph.md`](./reconstruction-provider-und-world-surface-graph.md)
**Stand:** 2026-07-26
**Gilt für:** Ebenenkandidaten, Raumhülle, Begehbarkeit, Raumgraph, Unsicherheitsmarkierung

> Zwei Namen, die fast gleich klingen, und zwei orthogonale Aufgaben:
> **Dykstra** macht aus Rohgeometrie einen *konsistenten* Raum.
> **Dijkstra** macht aus einem konsistenten Raum einen *nutzbaren* Raum.

## Implementierungsstand (Code-Audit)

Die Namen in diesem Dokument sind ein Architekturplan, aber nicht beide Teil der
heutigen Laufzeit. Der ausführbare Stand ist ausdrücklich getrennt:

| Technik | Heute tatsächlich ausgeführt | Ort und Grenze |
|---|---:|---|
| Dykstra-Projektion | **Ja** | `dykstraProject()` in `index.html` stabilisiert die Materialschicht. Der Laufmodus nutzt zusätzlich `runtime/spatial-navigation.mjs`, um Bewegung auf den Schnitt aus Raum-Box und konvexem Schrittradius zu projizieren. |
| Dijkstra | **Ja, gewichtetes Oberflächenraster** | `dijkstraGrid()` führt Klickziele um Blockaden und gewichtet Wasser, Eis, Matsch, Feuer, Rauch und Wachstum. Bewegungen prüfen die durchquerten Zellen statt nur die Endzelle. |
| 2.5D-Kamera | **Ja, begrenzt** | Eine Tiefenkarte verschiebt Shader-UVs abhängig von der Tiefe; die Maus steuert höchstens 3,5 % Parallaxe. Das ist kein freier 6-DoF-Kameraflug und erzeugt keine verdeckten Flächen. |
| Normierte Point Cloud | **Ja, Export + Viewer** | `SHADED.spatial.pointCloud()` rückprojiziert sichtbare Farbpixel mit relativer Companion-Tiefe nach `SHADED.spatial-point-cloud.v1`. `runtime/spatial-viewer.js` rendert beobachtete Punkte und getrennt markierte, aus gefitteten Flächen neu abgetastete Ergänzungen. |
| Metrische Point Cloud | **Ja, Offline-Werkzeug** | `tools/room_to_assets.py` schneidet Kamerastrahlen mit einer vermessenen Hallengeometrie und schreibt `SHADED.metric-point-cloud.v1` in Metern. Das ist ein spezialisierter Hallen-Provider, noch kein allgemeiner monokularer Point-Map-Provider. |
| „Point-Cloud-Motes“ im Shader | **Ja, rein visuell** | Tiefenabhängige Staub-/Asche-/Schneepunkte im Fragmentshader; trotz des Namens keine persistente oder navigierbare Punktwolke. |
| Sparse Voxel | **Ja, Oberflächenzustand** | Kamerastrahlen markieren `FREE`, Treffer `SURFACE`, unbekannter Raum bleibt implizit. Voxel tragen Material, Confidence, Provenienz und Felder; Pointer-Druck/Tilt/Eraser, Undo/Redo, Projekt- und Provider-Import sowie Block-Mesh-Extraktion sind implementiert. Es wird keine SDF/TSDF behauptet. |
| Oberflächen-Weltzustand | **Ja, gekoppeltes 2D-Raster** | Das aus den Voxeln abgeleitete Raster trägt Wasser, Eis, Schnee, Brennstoff, Feuer, Rauch, Matsch, Wachstum und Kontamination. Wasserfluss ist intern massenerhaltend; Feuer verbraucht Brennstoff und breitet sich nachbar-/windabhängig aus. Das ist keine 3D-Fluid- oder Atmosphärenphysik. |
| Geometrische Fits | **Ja, gemessen und begrenzt** | Lokale Normalen, zusammenhängende Oberflächen, RANSAC/PCA-Ebenen sowie PCA-Boxen/-Zylinder liefern Coverage und RMSE. Ergänzungen aus Fits und die zusätzlich absichtlich gespiegelte strukturelle Rückseitenhülle werden als `GENERATED` markiert; es gibt keine Prozent-Ähnlichkeitszusage. |
| Jahreszeiten-Showcase | **Ja, Parametersequenz** | Eine feste beziehungsweise benutzergeordnete Liste setzt Saisonparameter und ein Ereignis pro Zeile. Blüten-/Frucht- und Vegetationswerte sind Raster-/Punktsprite-Zustände, keine individuellen Pflanzenlebenszyklen. |
| Räumliche Regie | **Ja, minimale Szenenliste** | Saison, ein Ereignis und Dauer pro Zeile können geordnet und abgespielt werden. Aufnahme nutzt Canvas-`MediaRecorder`. Das Diagnosefenster enthält UI-Events und gerundete 250-ms-Stichproben, kein vollständiges Änderungsjournal. |

Damit ist die kurze Antwort: **Dykstra und ein gewichteter Dijkstra sind für das kleine
lokale Umfeld implementiert; Point Clouds werden erzeugt, geometrisch gefittet, um eine
bewusst einfache Spiegelhülle ergänzt, in ein Sparse-Voxel-Feld integriert und im
Viewer frei gerendert.** Die Ergänzungen sind explizit generiert. Navigation und Weltzustand teilen dasselbe abgeleitete
Oberflächenraster; beides ist keine vollständige semantische 3D-Welt.

---

## 1. Korrektur einer Fehleinordnung

[`raeumliche-algorithmen-arsenal.md`](./raeumliche-algorithmen-arsenal.md) hatte ICP,
Dijkstra, Voronoi/Delaunay und die Raumindizes als „löst ein Problem, das SHADED nicht
hat" einsortiert. Das war gegen die **heutige Runtime** geprüft, nicht gegen den
**dokumentierten Scope**.

[`reconstruction-provider-und-world-surface-graph.md`](./reconstruction-provider-und-world-surface-graph.md)
§1 nennt SHADED ausdrücklich einen **Rekonstrukteur**, und §5.4 sagt wörtlich, monokulare
Depth liefere *architektonische Indizien, keine fertige Architektur* — und dass die Lücke
durch weitere Provider und Regeln zu schließen ist. Genau diese Lücke ist die
Raumrekonstruktion. Die Algorithmen sind damit nicht unpassend, sondern **noch nicht
fällig**, weil ihre Eingabe fehlt (§5).

Richtige Frage ist nicht „braucht die Runtime das heute?", sondern
„verlangt die dokumentierte Architektur das?".

---

## 2. Die Kette

```text
Depth / Point Map
  → räumliche Indizes            kd-Tree · Octree
  → Registrierung mehrerer Ansichten   ICP · GICP
  → Oberflächen- und Raumstruktur      Ebenen · Voronoi/Delaunay · Alpha Shapes
  → Constraint-Projektion              DYKSTRA   ← konsistente Raumhülle
  → Distanzfelder                      EDT · SDF · Minkowski-Offset
  → Navigation und Interaktion         DIJKSTRA / A*   ← begehbarer Raum
```

Und als Ablauf:

```text
1. Wände, Boden und Decke als Ebenenkandidaten erkennen
2. Ebenen durch Constraints stabilisieren
3. Raumgraph aus Flächen, Öffnungen und Übergängen bilden
4. Begehbarkeit und Verbindungen berechnen
5. Unsichere Stellen sichtbar markieren statt halluzinieren
```

---

## 3. Die Konvexitätsprüfung — wo der Plan eine Falle hat

Dykstra garantiert die nächstgelegene gültige Lösung **nur**, wenn jede Menge konvex ist
und eine exakte Projektion besitzt. Die sechs Stabilisierungsschritte teilen sich genau
dort auf:

| Bedingung | konvex? | Konsequenz |
|---|---|---|
| Punkte auf einer **gegebenen** Ebene | **ja**, affin | exakte Projektion = Lotfuß. Trivial parallelisierbar. |
| Punkte auf **irgendeiner** Ebene (Parameter frei) | **nein** | bilineare Rang-Bedingung. Gehört zu RANSAC / Region Growing, nicht zu Dykstra. |
| Normale senkrecht zur Aufrichtung („vertikal") | **nein** zusammen mit `‖n‖ = 1` | die Einheitssphäre ist nicht konvex. **Lösung: Parametrisierung wechseln** — eine Wand nur über ihren Azimut `θ` und Offset `d` beschreiben, dann gilt Vertikalität *per Konstruktion* und ist gar keine Bedingung mehr. |
| Zwei Wände parallel | **nein** als Disjunktion `θᵢ−θⱼ ∈ {0, π}` | nach **Zuordnung** („diese beiden sind parallel") wird es affin → ja. |
| Ecke schließen (zwei Wände treffen sich in einem Punkt) | **ja**, affin bei festen Normalen | die Offsets erfüllen eine lineare Gleichung. |
| Boden unter Decke, Mindestraumhöhe | **ja**, Halbraum | `h_boden ≤ h_decke − h_min`. |
| Mindestraumbreite zwischen gegenüberliegenden Wänden | **nein** als `|dᵢ−dⱼ| ≥ w` | mit festgelegter **Innenseite** wird daraus ein Halbraum → ja. |
| Raum innerhalb einer Bounding Box | **ja**, Box | |

Das Muster ist bei jeder Zeile dasselbe:

> **Die kombinatorische Entscheidung gehört VOR den Solver.**
> Sobald die Struktur feststeht — welche Ebenen es gibt, welche parallel sind, welche
> sich treffen, welche Seite innen ist — sind fast alle Bedingungen affin, und Dykstra
> liefert genau das, was er versprechen kann.

Daraus folgt ein alternierendes Schema — dieselbe Bauform wie ICP (Zuordnung, dann
Lösung):

```text
Ebenenkandidaten
  → Struktur festlegen        (kombinatorisch: RANSAC, Adjazenz, Innen/Außen)
  → Dykstra auf Parametern    (konvex, exakt: Offsets, Höhen, Ecken)
  → Residuen prüfen
  → Struktur revidieren       (falls eine Zuordnung nicht trägt)
  → wiederholen
```

### 3.1 Worauf Dykstra dabei rechnet

Nicht auf der Punktwolke. Auf den **Ebenenparametern**: pro Wand ein Azimut und ein
Offset, plus zwei Höhen. Das sind Dutzende Zahlen, keine Hunderttausende — die Projektion
ist praktisch kostenlos, und der Solver kann viele Iterationen fahren.

Die Punkte folgen danach in einem zweiten, trivial parallelen Schritt (Lotfuß auf die
zugewiesene Ebene). Beide Schritte sind konvex, aber sie sind **getrennt** — das ist der
Unterschied zwischen „Wandkandidaten planar machen" als Formulierung und als
implementierbarem Vorgang.

### 3.2 Der Solver steht schon

`dykstraProject(x0, sets, {maxIter, tol, finish})` in `index.html` ist generisch über N
Mengen. Jede Menge liefert `project(src, dst)` und `violation(v)`; `finish` nennt die
Mengen, die am Ende exakt nachgezogen werden und damit hart garantiert sind. Erste
Anwendung ist die Materialschicht
([`neuronale-materialien-svbrdf-pbr.md`](./neuronale-materialien-svbrdf-pbr.md) §12);
die Raumhülle wäre die zweite mit denselben Verträgen.

---

## 4. Dykstra und Dijkstra: die Grenze zwischen beiden

| | Dykstra | Dijkstra |
|---|---|---|
| Eingabe | verrauschte Geometrie | konsistente Raumhülle |
| Frage | „Welche gültige Geometrie liegt der Messung am nächsten?" | „Was ist von hier aus erreichbar, und wie teuer?" |
| Rechnet auf | Ebenenparametern (konvexe Mengen) | Graph aus Flächen, Öffnungen, Übergängen |
| Ergebnis | Wände stehen senkrecht, Ecken schließen, Boden trägt | Türen, Korridore, Begehbarkeit, Wegkosten |
| Fehlerbild ohne ihn | schiefe Wände, offene Ecken, sich durchdringende Flächen | ein Raum, der geometrisch stimmt und trotzdem unbetretbar ist |

Zwischen beiden liegt die Distanzschicht, und sie ist nicht optional:

```text
Raumhülle
  → Minkowski-Offset um die Agentenbreite     (Hindernisse aufblasen)
  → begehbare Maske
  → EDT/SDF darauf                            (Abstand zur nächsten Wand)
  → Kostenfeld = f(Abstand)                   (Wege halten Abstand zur Wand)
  → Graph + Dijkstra/A*
```

Der EDT ist hier wichtiger als in der Materialschicht: das Kostenfeld entscheidet, ob ein
Weg mitten durch eine Türöffnung schrammt oder sie sauber nimmt. Chamfer würde dafür
genügen, ein exakter EDT (Parabola-Lower-Envelope) ist die bessere Wahl.

---

## 5. Eingangsbedingung — was heute geht und was nicht

Ehrlich getrennt, damit niemand Schritt 1 für sofort baubar hält:

| Schritt | Braucht | Stand in SHADED |
|---|---|---|
| Ebenenkandidaten aus **einem** Bild | metrische Point Map + Normalen | **möglich**, sobald ein `MetricPointMapProvider` steht (MoGe-2 liefert Point Map, Depth, Normalen und Kamera in einem Lauf — siehe [`einzelbild-raeumlichkeit-providerlandschaft.md`](./einzelbild-raeumlichkeit-providerlandschaft.md) §3.2). Existiert noch nicht. |
| Raumhülle stabilisieren (Dykstra) | Ebenenkandidaten | Solver steht, Eingabe fehlt |
| **ICP / GICP** | **mehrere** Ansichten oder Sensorik | SHADED hat ein Standbild. Erst mit Novel-View- oder Multi-View-Provider fällig — die sind in §5 der Providerlandschaft gelistet. |
| Distanzfeld, Minkowski, Graph, Dijkstra | Raumhülle | nachgelagert |

Die allgemeine Runtime-Tiefenkarte (Companion oder Provider) ist **relative** Tiefe ohne
Kamera. Daraus lässt sich rückprojizieren, aber die Skalierung ist unsicher — für
Ebenenwinkel und Raumbreiten ist das zu wenig. Das spezialisierte Hallenwerkzeug kann
dagegen aus Nutzermaß und vermessenen Fluchtlinien eine metrische Punktwolke backen;
es ersetzt noch keinen allgemeinen metrischen Point-Map-Provider. Die Priorität für
beliebige Szenen lautet deshalb weiterhin: **metrische Point Map zuerst**, alles andere
danach.

---

## 6. Schritt 5 ist schon vorgesehen

„Unsichere Stellen sichtbar markieren statt halluzinieren" braucht keine neue Mechanik —
die Verträge stehen:

- **Provenienzklassen** (`MEASURED · OBSERVED · RECONSTRUCTED · INFERRED · GENERATED · USER_APPROVED`)
  aus [`reconstruction-provider-und-world-surface-graph.md`](./reconstruction-provider-und-world-surface-graph.md) §8.1.
- **Raumzustände** `FREE · SURFACE/OCCUPIED · UNKNOWN` und `signConfidence` aus
  [`sdf-geometrie-stand-2026.md`](./sdf-geometrie-stand-2026.md) §3 und §10.1.
- **Residuen des Solvers**: `dykstraProject` liefert je Menge den Restfehler. Eine Ecke,
  die sich nur mit großem Residuum schließen ließ, ist eine unsichere Ecke — das ist eine
  Messung, keine Schätzung.

Regeln, die dabei gelten:

1. Eine erfundene Rückwand ist `GENERATED`, nie `OBSERVED`.
2. Harte Kollision darf nicht auf niedriger Konfidenz stehen (§8.1 dort).
3. Ein großes Solver-Residuum wird **angezeigt**, nicht wegnormalisiert.
4. Ein Grundriss wird nicht aus monokularer Tiefe als gesichert gespeichert.

---

## 7. Providerfamilie

```text
RoomReconstructionRegistry
├─ PlaneCandidateProvider     Point Map + Normalen → Ebenenkandidaten (RANSAC/Region Growing)
├─ RoomStructureSolver        Struktur festlegen + Dykstra auf Ebenenparametern
├─ RoomShellProvider          geschlossene Hülle: Wände, Boden, Decke, Öffnungen
├─ WalkableSurfaceProvider    Minkowski-Offset + EDT → begehbare Maske und Clearance
├─ RoomGraphProvider          Flächen, Öffnungen, Übergänge → Graph
└─ MultiViewRegistrationProvider   ICP/GICP, sobald mehrere Ansichten existieren
```

Verträge wie gehabt: Provider erzeugen **Eigenschaften**, keine Weltgesetze und keine
Materialklassen (Invariante 2). Der Raumgraph gehört in den **World Surface Graph**, nicht
in den Fragmentshader — die 2D-Runtime liest daraus höchstens Felder.

---

## 8. Erster vertikaler Schnitt, wenn die Point Map steht

Nicht die ganze Kette. Der kleinste Beweis, der den Dykstra-Teil trägt:

```text
1. Point Map + Normalen importieren (Provider, Provenienz INFERRED)
2. Bodenebene und bis zu vier Wandebenen per RANSAC schätzen
3. Struktur festlegen: Azimut-Cluster, Adjazenz, Innenseite
4. Dykstra auf {Azimut-Zuordnung fix} × {Ecken affin, Höhen-Halbraum, Bounding Box}
5. Residuen je Menge speichern und als Debugansicht zeigen
6. Hülle als Wireframe über das Bild legen, UNKNOWN-Bereiche markiert
7. Nutzer akzeptiert, korrigiert oder verwirft
```

Ausdrücklich **nicht** Teil davon: ICP, Türerkennung, Raumgraph, Dijkstra, Decken bei
Außenszenen, wasserdichte Meshes.

---

## 9. Abnahmekriterien

- [ ] Jede Dykstra-Menge ist konvex und hat eine exakte Projektion — dokumentiert, welche.
- [ ] Die kombinatorische Zuordnung liegt außerhalb des Solvers und ist revidierbar.
- [ ] Dykstra rechnet auf Ebenenparametern, nicht auf der Punktwolke.
- [ ] Residuen je Menge werden persistiert und angezeigt.
- [ ] Generierte Rückseiten und Decken sind `GENERATED`, nie `OBSERVED`.
- [ ] `UNKNOWN`-Raum bleibt als solcher erhalten, statt geschlossen zu werden.
- [ ] Relative und metrische Skalierung bleiben unterscheidbar.
- [ ] Kein Raumartefakt schreibt in `classGrid` oder `getMaterialTypeAt()`.
- [ ] Begehbarkeit nutzt Minkowski-Offset, nicht die Rohhülle.
- [ ] Rekonstruktionsarbeit läuft bei Import/Dirty, nie im Frame-Loop.

---

## 10. Klare Entscheidung

Die Kette ist richtig, und meine Einordnung war zu eng. Zwei Präzisierungen bleiben:

1. **Der kombinatorische Teil ist nicht Dykstra.** Wer „auf irgendeine Ebene projizieren",
   „Einheitsnormale ausrichten" oder „parallel oder antiparallel" als konvexe Menge führt,
   bekommt Oszillation statt Konvergenz. Struktur zuerst festlegen, dann projizieren,
   dann revidieren — wie ICP.
2. **Die Eingabe fehlt noch.** Ohne metrische Point Map ist Schritt 1 nicht ehrlich
   baubar. Der Solver steht bereits; die Priorität ist der `MetricPointMapProvider`.

Dann gilt:

```text
Dykstra   Rohgeometrie      → konsistenter Raum
Dijkstra  konsistenter Raum → nutzbarer Raum
```
