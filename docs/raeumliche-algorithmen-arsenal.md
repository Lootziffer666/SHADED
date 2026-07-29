# SHADED – Räumliche Algorithmen: Einordnung und Constraint-Projektion

**Status:** Einordnung eines Algorithmen-Katalogs gegen den tatsächlichen Stand von SHADED
**Stand:** 2026-07-26
**Umgesetzt daraus:** Dykstra-Projektion in der Materialschicht (§3)

> Der Katalog ist gut, aber er beschreibt überwiegend ein Szenario, das SHADED nicht hat:
> mehrere Ansichten, Punktwolken, Bewegung, Sensorik. SHADED hat **ein Standbild**.
> Genau ein Eintrag traf einen Defekt, der heute im Code steckt — und der ist behoben.

---

## 1. Triage

Radar-Regel 3: echte Ablösung von bloßer Ergänzung trennen. Vier Kategorien.

### 1.1 Steckt bereits in SHADED

| Verfahren | Wo |
|---|---|
| **Chamfer Distance Transform** | `chamfer()` in `analyze()` — Distanz zum Maskenrand, speist `phys.a` (Pfad-Distanz) |
| **Separabler Box-Blur / Tiefpass** | `boxBlur()` — Masken, Emissive, Zonen, Beleuchtungsschätzung |
| **Diffusion + Decay auf einem Feld** | Trail-Textur (Unit 5): Nachbar-Ausbreitung und Halbwertszeiten je Kanal |
| **Distanzfeld → Rendering** | Pfützen-Senken, Flussnetz, Bleed-Halos lesen Distanzen im Shader |

Ein exakter EDT (Parabola-Lower-Envelope) wäre genauer als Chamfer, aber die Distanz
speist weiche Effekte in Analyseauflösung — die Genauigkeit ist dort nicht der
begrenzende Faktor. **Kein Handlungsbedarf, nur eine Option.**

### 1.2 Trifft einen heutigen Defekt → umgesetzt

**Dykstra-Projektionsalgorithmus.** Details in §2/§3.

### 1.3 Gehört zu bereits entschiedenen Themen

| Verfahren | Zuständiges Dokument |
|---|---|
| Gaussian Splatting, P2ENet, Li-GS/GP-GS, Surface Splatting | [`sdf-geometrie-stand-2026.md`](./sdf-geometrie-stand-2026.md) §8, [`einzelbild-raeumlichkeit-providerlandschaft.md`](./einzelbild-raeumlichkeit-providerlandschaft.md) §4 |
| SDF, Raymarching, Sphere Tracing | [`sdf-geometrie-stand-2026.md`](./sdf-geometrie-stand-2026.md) |
| Multi-Output Gaussian Processes, Uncertainty-Densifizierung | [`einzelbild-raeumlichkeit-providerlandschaft.md`](./einzelbild-raeumlichkeit-providerlandschaft.md) §3.3, §8 |
| Optical Flow (Horn-Schunck, Lucas-Kanade) | `TemporalDepthProvider` in [`reconstruction-provider-und-world-surface-graph.md`](./reconstruction-provider-und-world-surface-graph.md) §4 |

### 1.4 Löst ein Problem, das SHADED nicht hat

| Verfahren | Warum nicht |
|---|---|
| **ICP, GICP, PCR-Pro, LiDAR-SLAM, FLi-SLAM** | Registrierung braucht **mehrere** Aufnahmen oder Sensorik. SHADED bekommt ein Standbild ohne Kamerapose. |
| **Dijkstra, A\*, ALT, All-Pairs-Shortest-Path** | Es gibt keine Navigation und keinen Graphen. Die Figur bewegt sich frei über UV, Kollision ist ein Feld, kein Netz. |
| **Voronoi, Delaunay, kd-Tree, R\*-Tree, Octree, Convex Hull** | Räumliche Indizes beschleunigen Nachbarschaftssuche in **unregelmäßigen** Punktmengen. SHADED rechnet auf einem regelmäßigen Raster fester Größe (`AW`×`AH`); Nachbarn sind Arrayindizes. Relevant erst, wenn Punktwolken ankommen. |
| **ParVoro++, verteilte Tessellation** | Zielt auf Hunderte Millionen Partikel. SHADEDs Analysefeld hat 331 776 Zellen. |
| **Minkowski-Summen, Straight Skeleton, Offset-Polygone** | Setzen Polygongeometrie voraus. SHADED hat Masken, keine Polygone. |

Das ist kein Abwerten der Quellen — es ist die Feststellung, dass sie eine andere
Eingabe erwarten. Kommt ein Multi-View- oder Point-Cloud-Provider, wandern sie aus
dieser Spalte heraus.

### 1.5 Ehrlicher Kandidat für eine spätere Runde

**Gray-Scott / Reaction-Diffusion, räumliche SIR-Modelle.** Das wäre kein Fix, sondern
ein **neues Weltgesetz** (Wucherung, Ausbreitung, Korruption) — inhaltlich attraktiv und
architektonisch anschlussfähig, weil die Trail-Textur schon Diffusion und Decay fährt.
Gehört in den Weltgesetze-Katalog, nicht in die Materialschicht.

---

## 2. Warum Dykstra hier der richtige Griff ist

Die Beleuchtungsschätzung ist **unterbestimmt**: ein dunkler Fleck kann Schatten oder
dunkle Farbe sein. Es gibt aber harte Nebenbedingungen. SHADED hatte sie — und hat sie
**sequenziell** angewandt:

```text
Tiefpass  →  auf Mittelwert normalisieren  →  in [0.18, 2.0] clampen
```

Genau das Muster, das der Katalog als POCS-Blindheit beschreibt: **der letzte Schritt
zerstört den vorherigen.** Gemessen am Demo-Dorf:

| Größe | vorher | soll |
|---|---|---|
| `mean(shading)` | **1.0703** | 1.0 — sonst verschiebt das Zuschalten die Gesamthelligkeit um 7 % |
| Pixel mit Reflektanz > 1 | **1,84 %**, schlimmster Wert **1.459** | 0 — Albedo über 1 ist physikalisch unmöglich und clippt zu Weiß |
| `max(shading)` | 2.0 exakt | Clamp sättigte |

Der zweite Punkt war überhaupt nicht als Bedingung formuliert. `albedo = col / shade`
wurde nie darauf geprüft, ob es im Gamut bleibt.

---

## 3. Umsetzung

`projectShadingDykstra()` in `index.html` projiziert die Startschätzung auf den Schnitt
**zweier** konvexer Mengen:

```text
C_box    lo(x) <= s(x) <= hi
         Wertebereich UND Albedo-Gamut in einer Menge:
         albedo = col/s <= 1  <=>  s >= max(col_r, col_g, col_b)  ->  lo(x)

C_mean   mittelwert(s) = target
         Energieneutralität: Zuschalten der Trennung darf die Gesamthelligkeit
         nicht verschieben.
```

Iteration mit Residuen, wie im Katalog:

```text
y = P_box(x + p);    p = x + p - y
x = P_mean(y + q);   q = y + q - x
```

Ergebnis am Demo-Dorf: **4 Iterationen**, `mean = 1.0000`, `meanError = 0`,
**0 Pixel** mit Reflektanz über 1.

### 3.1 Entscheidungen, die dabei bewusst gefallen sind

**Keine Glattheitsmenge.** „Feld gleicht seinem Tiefpass" ist keine konvexe Menge;
`‖∇s‖ ≤ τ` wäre konvex, bräuchte aber eine TV-Prox. Die Glattheit steckt deshalb in der
**Startschätzung**, nicht in einer Bedingung. Beide implementierten Projektionen sind
mild — die Box trifft nur verletzende Pixel, der Mean ist ein gleichmäßiger Versatz —
und erhalten sie weitgehend. Zwei Mengen mit **exakter** Projektion sind mehr wert als
drei mit einer geratenen.

**Leerer Schnitt wird ausgeschlossen, nicht ignoriert.** `mean(s) = 1` ist mit
`s ≥ lo` nur erfüllbar, wenn `mean(lo) ≤ 1`. Bei sehr hellen Bildern ist das nicht der
Fall. Das Ziel ist deshalb `target = max(1, mean(lo))` — die Iteration läuft nie gegen
eine leere Menge.

**Welche Bedingung garantiert gilt, ist dokumentiert statt Zufall.** Nach der Iteration
folgt eine letzte Box-Projektion: Gamut und Wertebereich sind damit **hart garantiert**,
die Energiebedingung gilt auf dem erreichten `meanError` — der im Zustand mitgeliefert
wird.

**Fremde Felder werden gemessen, nicht verbogen.** Ein Feld aus `intrinsic.set()` oder
einer Companion-Datei wird **nicht** nachprojiziert — die Hypothese gehört dem Provider
(Provenienzregel). Stattdessen liefert `state().gamut` Verletzungsanteil und schlimmsten
Albedowert, und `state().projection` ist `null`. Ein konstantes Testfeld von 0.6 zeigt so
37,63 % Verletzung bei schlimmstem Albedo 1.647 — die Qualität eines Providers wird damit
messbar, statt unsichtbar zu bleiben.

---

## 4. Wo dasselbe Werkzeug als nächstes greift

Dykstra braucht pro Bedingung nur eine Projektionsfunktion. Damit ist es kein Einzelfix,
sondern ein **wiederverwendbarer Constraint-Löser für jedes Feld, das SHADED speichert**:

| Feld | Mengen | Gewinn |
|---|---|---|
| **Tiefenkarte** | Wertebereich, `UNKNOWN`-Maske respektieren, Rand-/Himmelanker (K7) | Companion-Depth und geschätzte Depth widerspruchsfrei zusammenführen |
| **Rauheit** (nächster Kanal) | `[0,1]`, Klassen-Prior-Intervall je Materialklasse, Konsistenz mit Nässe | Klassen-Prior als **Bedingung** statt als hart codierte Konstante |
| **Kanalsatz insgesamt** | gemeinsame Konsistenz mehrerer Kanäle | genau die Inkonsistenz, gegen die Chord die verkettete Vorhersage einsetzt — nur nachgelagert und deterministisch |
| **Höhen-/Druckfeld** | Monotonie, Randbedingungen | Kontaktfelder ohne Artefakte an Blobgrenzen |

Regel dafür: **Bedingungen müssen konvex sein und eine exakte Projektion haben.** Sonst
gehört das Problem zu einem Optimierer, nicht zu Dykstra — und das wäre eine eigene
Entscheidung, keine stille Erweiterung.

---

## 5. Abnahmekriterien

- [x] Die Projektion erfüllt Gamut und Wertebereich hart, der Energie-Restfehler ist beziffert.
- [x] Der Zielmittelwert kann nie eine leere Schnittmenge erzeugen.
- [x] Fremde Felder werden nicht nachprojiziert, ihre Verletzung wird gemessen.
- [x] `state()` liefert Algorithmus, Iterationen, Mittelwert, Restfehler und Gamut-Statistik.
- [x] Klassenzählung unverändert — die Projektion rührt keine Materialklasse an.
- [x] Beweis in `tools/verify-intrinsic.js` (30 Prüfungen).
- [ ] Anwendung auf Tiefenkarte und Rauheit (offen, §4).

---

## 6. Klare Entscheidung

Der Katalog katapultiert SHADED nicht als Ganzes — der größte Teil setzt Eingaben voraus,
die SHADED nicht hat, und ist in den bestehenden Architekturdokumenten längst sortiert.

Ein Eintrag war trotzdem wertvoller als eine ganze Modellfamilie: **Dykstra hat einen
stillen Rechenfehler in einer Schicht aufgedeckt, die am selben Tag entstanden ist.**
Nicht weil das Verfahren neu wäre — es ist von 1983 — sondern weil es die richtige Frage
stellt:

```text
nicht: „erfüllt mein Feld die letzte Bedingung?"
sondern: „erfüllt es ALLE gleichzeitig, mit minimaler Verzerrung der Messung?"
```

Diese Frage gilt für jedes Feld im World Surface Graph.
