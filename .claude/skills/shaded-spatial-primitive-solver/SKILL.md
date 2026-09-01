---
name: shaded-spatial-primitive-solver
description: INAKTIV (liegt bewusst außerhalb von .claude/skills/, wird nicht geladen). Ein möglicher, verifizierter Eintrittspunkt in Room Reconstruction aus einem einzigen Bild — NICHT SHADEDs kanonische Architektur, sondern ein unkonventioneller, aber nachweisbar funktionierender Baustein. Deckt klassische Single-View-Metrologie (Caprile & Torre / Criminisi), einen operatorbasierten Zwei-Phasen-Solver und pixelbasierte Cultivation als 2D-Vorstufe ab. Nutzen, sobald aktiviert, vor jeder Rekonstruktion einfacher achsenparalleler Körper aus Fluchtpunkten.
---

# SHADED Spatial Primitive Solver (klassische Single-View-Metrologie + Operator-Solver + Cultivation)

**Status: INAKTIV.** Dieser Skill liegt absichtlich unter `.claude/skills-inactive/`,
nicht unter `.claude/skills/` — er wird vom Harness nicht automatisch geladen oder
gelistet. Aktivierung: Verzeichnis nach `.claude/skills/shaded-spatial-primitive-solver/`
verschieben.

**Ausdrückliche Einordnung des Maintainers, wörtlich festgehalten:** „Das ist nicht
SHADEDs way to be. Es ist ein möglicher Eintrittspunkt in room reconstruction. Jedoch
genau so einer, wie SHADED ihn braucht. Vielleicht unkonventionell, aber es ist nicht
dumm, wenn es funktioniert.“ Dieser Skill ist also kein Ersatz für `shaded-reconstruction`
und keine neue Doktrin — er ist ein verifizierter, aber bewusst separat gehaltener
Baustein, der bei Bedarf integriert wird, nicht automatisch Vorrang bekommt.

Verifiziert an: vier synthetischen 1×1×1-Würfeln (Rückprojektionsfehler 0.88–4.01px)
UND — neu — an einem ECHTEN Testbild (vier Würfel, `newtest.png`/`newtest-color.png`),
end-to-end von Pixeln bis zur 3D-Rekonstruktion, mit 0.00–0.05px Rückprojektionsfehler,
ganz ohne Ground Truth an irgendeiner Stelle der Pipeline. Noch nicht erprobt an SHADEDs
echter Dorfszene (Häuser, Wege) und nicht in die Produktions-Pipeline integriert.

## Woher das kommt

Entstanden aus einer langen, iterativen Session mit dem Maintainer: erst mehrere
gescheiterte Ansätze (Zellular-Automaten-Agenten, Kontur-basierte Silhouetten,
handgezeichnete Flächen, Parallelrichtungs-Vereinfachung), dann die Korrektur zur
echten Drei-Punkt-Perspektive. Der entscheidende Fehler unterwegs war ein
Off-by-eins zwischen Kanten- und Eckpunkt-Indizierung (siehe unten) — er hat den
Rückprojektionsfehler von ~250px auf unter 5px gesenkt. Das ist kein Detail, das
ist der Unterschied zwischen "sieht ungefähr richtig aus" und "beweisbar korrekt".

## Kernprinzip

Aus EINEM Bild mit mehreren **identisch orientierten** Objekten mit **bekannter
realer Kantenlänge** lässt sich die volle Kamera-Kalibrierung UND die 3D-Position
jedes Objekts algebraisch rekonstruieren — kein maschinelles Lernen, keine
geschätzte Tiefe, reine projektive Geometrie.

```text
1. Pro Objekt: 2D-Silhouette extrahieren (siehe Sub-Skill "2D-Extraktion" unten)
   → exakt 6 Eckpunkte (bei einem Würfel/Quader mit 3 sichtbaren Flächen),
     Kanten in genau 3 Raumrichtungs-Familien einordnen.
2. GLOBAL, nicht pro Objekt: alle Kanten einer Familie über ALLE Objekte poolen
   (bei N identischen Objekten: N*2 Kanten pro Familie) und EINEN gemeinsamen
   Fluchtpunkt robust fitten (Total-Least-Squares über senkrechte Abstände).
   Regel, nicht Empfehlung: Ein Fluchtpunkt entsteht NIE aus einer einzelnen
   Kante. Weniger als oder mehr als die bekannte Anzahl Raumrichtungen (3 bei
   rechtwinkligen Körpern) ist ein Fehler, kein Messergebnis.
3. Hauptpunkt (principal point) = Orthozentrum des Dreiecks der 3 Fluchtpunkte
   (exakter Satz für 3 zueinander orthogonale Fluchtpunkte, keine Annahme wie
   "Bildmitte" nötig).
4. Brennweite aus der Orthogonalitätsbedingung: f² = -(V_i - pp)·(V_j - pp)
   für jedes Fluchtpunkt-Paar. **Korrektur (per Operator-Solver-Testreihe
   verifiziert):** dass alle 3 Paare exakt denselben Skalarprodukt-Wert
   liefern, ist KEIN Beweis für Korrektheit — es ist eine Identität des
   Orthozentrums selbst (HA·HB = HB·HC = HC·HA gilt für JEDES beliebige
   Dreieck ABC mit Orthozentrum H, auch für ein geometrisch unsinniges).
   Numerisch bestätigt an 5 zufälligen Dreiecken. Was tatsächlich Information
   trägt: (a) das VORZEICHEN dieses gemeinsamen Werts — nur negativ liefert
   ein reelles f=sqrt(-dot); ein positiver Wert heißt, dieses Fluchtpunkt-
   Dreieck kann für KEINE reelle Kamera die drei Achsen sein, ganz gleich wie
   pp berechnet wurde; (b) am Ende einzig der Rückprojektionsfehler gegen
   echte gemessene Punkte (Schritt 7).
5. Rotationsmatrix: die 3 Weltachsen als Kamera-Raum-Richtungen sind
   normalize([V_k.x - pp.x, V_k.y - pp.y, f]) für jede der 3 Fluchtpunkte.
6. Pro Objekt: Translation (Position) aus den 6 gemessenen 2D-Eckpunkten +
   bekannter Kantenlänge per linearer Ausgleichsrechnung (3 Unbekannte,
   12 Gleichungen aus 6 Korrespondenzen). Siehe Herleitung im Referenz-Skript.
7. PFLICHT-Beweis, kein optionaler Schritt: die rekonstruierten Objekte durch
   die rekonstruierte Kamera zurückprojizieren und mit den echten gemessenen
   Eckpunkten vergleichen. Nur ein kleiner Rückprojektionsfehler (wenige Pixel
   bei Objekten von einigen hundert Pixeln Größe) beweist Korrektheit — ein
   "sieht plausibel aus"-Rendering beweist nichts.
```

## Referenzimplementierung (Scratch, committet als Referenz — kein Produktionscode)

Vollständige Dateiliste inklusive Operator-Solver- und Cultivation-Varianten
in den Abschnitten „Operator-Solver“, „Validierung an einem echten Bild“ und
„Cultivation“ unten. Die ursprüngliche Closed-Form-Kette:

- `tools/scratch-cube-silhouette-2d.mjs` — 2D-Silhouetten-Extraktion: posterisiert
  freistellen (Schattenverlauf verschmilzt so nicht mit der Objektfarbe) →
  konvexe Hülle → auf exakt 6 Ecken reduzieren (kleinste-Dreiecksfläche-zuerst,
  Visvalingam-Whyatt-Prinzip, kein Epsilon-Raten) → Kanten global über alle
  Objekte in genau 3 Richtungsfamilien clustern (zirkuläres K-Means mit fest
  K=3, NICHT ein Abstands-Schwellenwert — der fragmentiert bei manchen Bildern
  eine Familie in zwei).
- `tools/scratch-cube-3d-reconstruct.mjs` — Kalibrierung + pro-Objekt-Position +
  Rückprojektions-Beweis (Schritte 3–7 oben).
- `tools/scratch-cube-3d-render.mjs` — Weltkoordinaten aus der Rekonstruktion
  ableiten und aus beliebigen neuen Blickwinkeln rendern ("die Szene drehen").

## Der teuerste Fehler unterwegs (damit er nicht wiederkehrt)

`vertices[i]` in der Hexagon-Rekonstruktion ist der Schnittpunkt von Kante `i`
und Kante `i+1` — es liegt also am ENDE von Kante `i`, nicht an deren Anfang.
Das Segment `vertices[i] → vertices[i+1]` gehört folglich zur Familie von Kante
`i+1`, nicht zu der von Kante `i`. Diese Verwechslung erzeugte einen
Rückprojektionsfehler von 200–330px trotz perfekt konsistenter Kalibrierung
(Fokal­länge exakt gleich aus allen 3 Fluchtpunkt-Paaren, Orthogonalität exakt
0.0000) — ein Beweis, dass Kalibrierungs-Konsistenz allein NICHTS über die
Korrektheit der nachgelagerten Rekonstruktion aussagt. Immer den vollen
Rückprojektionsfehler prüfen, nie nur Zwischenwerte.

## Operator-Solver: emergente Rekonstruktion statt reinem Closed-Form (v1→v3e)

Zweite große Testreihe: kann ein Satz „nüchterner“, lokaler Operatoren
(ALIGN, SNAP, EQUALIZE, ORTHO, PLACE, RELATE, CLOSE, SMOOTH/RELAX — je eine
Zeile Definition, keine freie Formfindung) dieselbe Lösung wie der
geschlossene Löser emergent finden? Antwort nach sechs Iterationen (v1–v3e):
**ja, aber nur mit einer spezifischen, jetzt verifizierten Architektur** —
nicht durch bloßes „mehr iterieren“.

```text
v1  Fluchtpunkt-PIXELPOSITION direkt per Gradient verschoben
    → katastrophal: NaN, danach stabiler aber FALSCHER lokaler Optimalpunkt.
    Ill-conditioning: eine weit außerhalb liegende Fluchtpunktposition
    reagiert auf einen winzigen Winkelfehler mit einer Verschiebung um
    tausende Pixel.

v2  Richtung als WINKEL statt Position (Maintainer-Korrektur: "repräsentiere
    Richtung als Winkel, nicht als VP-Pixelposition")
    → Bug gefunden: ALIGN/SNAP zwangen JEDE Kante einer Familie auf EINEN
      gemeinsamen Winkel. Das ist eine orthografische Annahme in einem
      perspektivischen Problem — echte Kanten derselben Familie sind NICHT
      parallel im Bild, nur ihr Fluchtpunkt ist gemeinsam. Erzwungene
      Parallelität → exakt singulärer Fluchtpunkt-Fit → orthocenter(3
      identische Punkte) → 0/0 = NaN.
    → zweiter Bug: `calibrate()` hatte einen stillen Fallback `f = ... : 1000`,
      der eine echte Degenerierung maskierte, statt sie zu melden.
    → nach beiden Fixes: stabil, aber `eOrtho` blieb hängen (nie < 2700).

v3  Kamera als echte 3×3-ROTATIONSMATRIX (state.R) statt VP-Position.
    Orthogonalität der 3 Weltachsen ist dadurch STRUKTURELL garantiert
    (Rodrigues-Komposition bleibt exakt orthonormal) statt ein weiches
    Energieziel — die wörtlichste Umsetzung von „harte Constraints nie von
    weichen Operatoren überschreiben lassen“ für genau diesen Constraint.
    → Bug gefunden: Rotations-Gradient (Radiant) und pp/f-Gradient (Pixel)
      in EINE gemeinsame L2-Norm gemischt → pp/f bekamen nie einen echten
      Schritt (bestätigt: f/pp blieben 300 Iterationen lang exakt beim
      Seed-Wert). Fix: getrennte Trust-Region-Normalisierung pro
      Parametergruppe.
    → mit generischem Seed: konvergiert sauber, aber zu EINEM in sich
      konsistenten, aber FALSCHEN lokalen Minimum (Nicht-Konvexität, kein
      Konditionierungsproblem mehr).

v3b Seed = die bereits verifizierte Closed-Form-Kamera (schummelt bewusst,
    um EINE Frage zu isolieren): halten die korrigierten Operatoren einen
    guten Startpunkt, statt wegzudriften? Ja — f auf 0.3% genau, aber `pp`
    driftete trotzdem ~200px weg.

v3c Kamera nach der Initial-Kalibrierung KOMPLETT EINFRIEREN (kein
    opCalibrate mehr in der Schleife) — direkter Test der externen
    Review-Kernaussage („der VP wird einmal bestimmt, danach nie wieder von
    lokalen Agenten verschoben“). Ergebnis: exakt 0.0px VP-Fehler, exakte
    f/pp-Wiederherstellung — entscheidender Beweis, dass NICHT die
    Operatoren selbst das Problem waren, sondern dass sie die globale
    Kamera nebenbei mitverändert haben.

v3d Ehrlicher End-to-End-Test (Seed NICHT aus Ground Truth, sondern echter
    Closed-Form-Fit aus den verrauschten Kanten): der naive
    "3-unabhängige-VP-Fits→Orthozentrum→Vorzeichentest"-Weg ist für DIESES
    Szenario (eine Familie 4528px außerhalb) bei JEDEM getesteten
    Rauschlevel degeneriert — kein Rauschproblem, sondern eine intrinsische
    Tatsache der Szenengeometrie. Koordinatennormalisierung (Hartley-Stil)
    wurde getestet und ändert NACHWEISLICH nichts (0.000000px Differenz,
    exakt wie vorhergesagt für eine reine affine Umskalierung eines
    linearen Solves) — nicht jedes Problem ist ein Konditionierungsproblem.

v3e Finale, validierte Architektur: PHASE 1 = Multi-Start-Kalibrierung
    ALLEIN (kein Vertex-Operator läuft mit), mehrere Zufalls-Restarts,
    Kandidaten-Ranking nach (1) Chiralität — verwirft Kamera-Spiegel-
    Mehrdeutigkeiten, die reiner Winkel-Residual nicht sehen kann, exakt
    wie echte Bundle-Adjustment-Pipelines — dann (2) Skalen-Konsistenz
    (alle Körper teilen eine reale Kantenlänge; EIN Fehlversuch: das direkt
    in den Gradienten von opCalibrate zu mischen destabilisierte ihn massiv,
    T-Werte explodierten in die Millionen — Skalen-Konsistenz gehört als
    POST-HOC-Rangkriterium zwischen bereits konvergierten Kandidaten, NICHT
    in den Gradientenschritt selbst, weil sie über eine Matrixinversion
    läuft und für kleine Störungen scharf springen kann), dann (3) Residual.
    PHASE 2 = Kamera einfrieren, NUR Vertex-Operatoren (ALIGN, SNAP, RELATE,
    EQUALIZE, PLACE, CLOSE, SMOOTH) laufen lassen.
```

**Kernlektion, unabhängig bestätigt durch die vom Maintainer geteilte
„Cultivation Reconstruction Reference“ (deren §3 dieselbe Regel unabhängig
formuliert):** globales und lokales Problem dürfen nie gleichzeitig frei
optimiert werden. Erst robust global lösen (mit echter Multi-Start-Vielfalt,
nicht 1–2 Kandidaten), dann einfrieren, dann lokal verfeinern.

Referenz: `tools/scratch-operator-solver.mjs` (v1) →
`scratch-operator-solver-v2-angle.mjs` → `v3-camera.mjs` →
`v3b-goodseed.mjs` → `v3c-frozen-camera.mjs` → `v3d-full-pipeline.mjs` →
`v3e-two-phase.mjs` (finale Architektur).

## Validierung an einem echten Bild (kein synthetischer Ground Truth)

`tools/scratch-cube-silhouette-2d-newtest.mjs` (2D-Extraktion) +
`scratch-real-image-reconstruct.mjs` (v3e-Architektur, echte Closed-Form-
Kandidaten + Winkel-Fallback-Kandidaten) + `scratch-real-image-render.mjs`
(Turntable-Rendering). Ergebnis: 0.00–0.05px Rückprojektionsfehler über alle
4 Würfel, konsistente Welt-Y-Koordinaten (alle auf derselben Bodenebene).

Zwei echte, an diesem Bild gefundene und behobene Fehler, keine Spekulation:

1. **Kantenfamilien-Fehlzuordnung:** reines Pro-Kante-K-Means ordnete zwei
   BENACHBARTE Kanten (die zu verschiedenen Familien gehören MÜSSEN) derselben
   globalen Familie zu. Fix: pro Körper die 3 GEGENÜBERLIEGENDEN Kantenpaare
   per optimaler bipartiter Zuordnung (alle 3! Permutationen, trivial
   durchprobierbar) auf die 3 globalen Zentren matchen, statt unabhängigen
   Pro-Kante-Labels zu vertrauen.
2. **Topologie-Bug in der Lokalkoordinaten-Herleitung** (teuersten Fehler
   dieser zweiten Testreihe): die naive Regel „jede Achse startet bei 0“
   erzeugte einen Wert außerhalb `{0,1}` (nachweislich `-1`) — ein Fakt, den
   der Rückprojektionsfehler NICHT aufdeckte, weil er zirkulär gegen
   dieselben (falschen) Labels prüft, mit denen gefittet wurde. Sichtbar
   wurde der Fehler erst an einem inhaltlichen Symptom: ein Würfel bekam
   eine wild abweichende Welt-Y-Position. Per Hand aus der echten
   Würfel-Kombinatorik hergeleitet (die 6 Silhouetten-Ecken sind alle
   Würfelecken außer der komplett verdeckten und der zum Betrachter
   nächsten; ihr eindeutiger Hamilton-Zyklus alterniert 3 Achsen UND
   +1/−1-Vorzeichen, aber die START-Werte pro Achse hängen davon ab, ob
   deren erstes Vorkommen im Zyklus ein Zuwachs- oder Abnahme-Schritt ist).
   **Lehre, allgemein:** Rückprojektionsfehler beweist nur Konsistenz
   gegen die eigenen Annahmen, nie deren geometrische Gültigkeit — separat
   prüfen (z. B. „liegen alle rekonstruierten Körper auf einer gemeinsamen
   Ebene, wie visuell erwartet?“).

## Cultivation: pixelbasierte 2D-Vorstufe als Alternative zum Flood-Fill

Von externen Modellen (Grok, ChatGPT) plus einem vom Maintainer geteilten
Referenzdokument („Cultivation Reconstruction Reference“) angestoßen, dann
tatsächlich implementiert und verifiziert, nicht nur diskutiert:
`tools/scratch-surface-cultivator.mjs` (Graustufen) →
`scratch-surface-cultivator-color.mjs` (RGB) →
`scratch-cultivator-all-cubes.mjs` (alle 4 Körper gleichzeitig) →
`scratch-cultivated-reconstruct.mjs` / `scratch-cultivated-render.mjs`
(derselbe v3e-Solver, jetzt mit Cultivation statt Flood-Fill gefüttert).

**Idee:** jedes Pixel ist eine Zustandszelle mit 5 Attributen (Koordinate,
Appearance, Gradient, Owner/Region, Confidence), nicht nur eine Farbe.
Mehrere Regionen wachsen GLEICHZEITIG und KONKURRIEREND von manuellen Seeds
aus; wo zwei Owner aufeinandertreffen, entsteht eine Boundary als
Nebenprodukt — nicht weil danach gesucht wurde. Ersetzt reine
Flood-Fill-Toleranz + Bounding-Box als Sicherheitsnetz.

**Tatsächlich gefundene Ergebnisse, nicht nur die Idee:**

- Graustufenbild (`newtest.png`): Konkurrenz löste die 3 Flächen EINES
  Körpers sauber (Boundaries lagen exakt auf echten Kanten), leckte aber
  über die Lücke zu einem NACHBAR-Körper (sichtbarer Blob + Sprenkelmuster
  auf einem fremden Würfel). Ursache identifiziert: ein frei driftender
  Region-Mittelwert erlaubt einen "Boiling Frog"-Effekt — jeder einzelne
  Schritt besteht die lokale Toleranzprüfung, aber die Kette akkumulierter
  kleiner Schritte wandert am Ende so weit vom ursprünglichen Seed-Wert weg,
  dass Werte akzeptiert werden, die der ORIGINALE Seed-Wert abgelehnt hätte.
  Fix: zusätzliches hartes Drift-Budget gegen den ursprünglichen Seed-Wert,
  nicht nur gegen den aktuellen laufenden Mittelwert.
- Farbbild (`newtest-color.png`, vom Maintainer nachgereicht): derselbe
  Leck-Fall verschwand VOLLSTÄNDIG, sobald Appearance über RGB statt
  Luminanz lief — an genau der vorher fehlschlagenden Grenze sprang der
  Farbabstand von ~5–9 Graustufen-Einheiten auf einen eindeutigen
  RGB-Sprung (z. B. (190,39,39)→(232,96,1)). Kein Bounding Box, keine
  Kantenerkennung, keine Per-Objekt-Kalibrierung nötig — nur echte Farbe.
  Region-Größen blieben über Toleranz 20–40 stabil (kein fragiler
  Schwellenwert).
- End-to-End-Beweis: alle 4 aus Cultivation gewonnenen Hexagone durch
  dieselbe v3e-Pipeline geschickt → 0.00–0.05px Rückprojektionsfehler,
  praktisch identisch zur Flood-Fill-Extraktion.

**Ehrliche Grenze:** dieser Fix nutzt aus, dass die Objekte im Testbild
unterscheidbare Farben haben. Für das ORIGINALE Graustufenbild (alle 4
Würfel dasselbe graue Material) ist Farbunterscheidung keine Option — dort
bräuchte es tatsächlich den aufwendigeren, noch nicht gebauten
Multi-Zeilen-Kantensignal-Detektor. Cultivation ist damit kein Ersatz für
Edge-/VP-basierte Extraktion, sondern eine zusätzliche, oft robustere
Option, wenn Farbe als Signal verfügbar ist.

## Ausblick, bewusst noch nicht begonnen

Der Maintainer hat unmittelbar nach der Cultivation-Validierung eine sehr
naheliegende nächste Anwendung benannt, aber ausdrücklich vertagt:
**Vegetation/Wachstumssysteme (Wurzeln, Ranken, Blüh-/Welk-Zustände) als
Agenten**, die auf Weltgesetze reagieren (Regen, Dürre, Tag/Nacht, Schaden,
Ereignisse). Begründung: Pflanzenwachstum ist ohnehin kein einmaliges
Modellieren, sondern ein lokaler, iterativer Prozess — die Cultivation-
Denkweise passt dort noch natürlicher als bei starren Würfeln. Zitat:
„Das will ich jetzt gerade nicht verfolgen, aber das sollte bald
anknüpfen.“ Kein Code dazu existiert bisher; bei Aufgriff zuerst
`docs/vision-weltgesetze.md` und `shaded-pipeline`s Lastverteilungs-Vertrag
konsultieren (jedes neue Weltgesetz braucht Ursache/Frequenz/Pass-Phase/
Fallback, siehe dort), nicht bei Null anfangen.

## Harte Regeln

1. Kein Fluchtpunkt aus einer einzelnen Kante. Immer alle verfügbaren Kanten
   derselben Familie poolen (über alle Objekte hinweg, wenn mehrere identisch
   orientierte Objekte im Bild sind).
2. Die Anzahl Richtungsfamilien ist ein bekanntes Fakt (3 bei rechtwinkligen
   Körpern), kein Schätzparameter. Clustering-Verfahren müssen diese Zahl fest
   vorgeben (K-Means mit festem K), nicht über einen Abstands-Schwellenwert
   erraten.
3. Rückprojektions-Beweis ist Pflicht vor jeder Aussage über Korrektheit.
   Ein Rendering, das "richtig aussieht", ersetzt das nicht.
4. Materialschicht/Klassifikation (SHADEDs `classGrid`) bleibt unberührt —
   dieser Solver liefert Geometrie, keine Materialklassen (Invariante 2 gilt
   unverändert, siehe `shaded-materials`/`shaded-pipeline`).
5. Bei Bildern ohne zweite unabhängige Struktur (z. B. kein Bodenraster) ist
   der Fluchtpunkt EINER Richtung ohne mehrere Objekte/Kanten dieser Richtung
   nicht rekonstruierbar — das ist eine strukturelle Grenze der Methode, kein
   Implementierungsfehler (siehe die frühere Diskussion zum reinen
   Occlusion-Argument, das allein die Tiefe nicht bestimmen konnte).

## Nächste Schritte, falls aktiviert

- Auf SHADEDs echte Dorfszene anwenden (Häuser statt Würfel) — Häuser sind
  keine perfekten Würfel, brauchen also eine Formulierung mit unterschiedlichen
  Kantenlängen pro Achse (Breite/Tiefe/Höhe), nicht nur Kantenlänge 1.
  Objekte müssen dafür nicht identisch sein — nur genug Kanten pro Richtung
  liefern, damit die 3 Fluchtpunkte robust fittbar sind.
- Die v3e-Architektur (Multi-Start-Kalibrierung → Chiralität → Skala →
  Residual → Einfrieren → Vertex-Operatoren) ist die zu übernehmende
  Referenz, nicht v1/v2/v3 — die früheren Versionen bleiben nur als
  dokumentierte Fehlversuche stehen.
- Cultivation als 2D-Vorstufe ausprobieren, wenn Objekte unterscheidbare
  Farben haben; sonst bei Flood-Fill/Edge-basierter Extraktion bleiben oder
  den noch nicht gebauten Multi-Zeilen-Kantensignal-Detektor entwickeln.
- Vegetations-/Wachstumsagenten (siehe „Ausblick“ oben) — explizit vertagt,
  nicht Teil dieser Aktivierung.
- Integrationspunkt wäre `runtime/spatial-reconstruction.mjs` /
  `runtime/spatial-navigation.mjs` (siehe `shaded-reconstruction`-Skill) —
  aber erst nach Verifikation an echtem Bildmaterial, nicht vorher (jetzt
  einmal erfolgt, siehe oben — aber nur an synthetisch-einfachen Würfeln,
  nicht an SHADEDs tatsächlicher Zielszene).
