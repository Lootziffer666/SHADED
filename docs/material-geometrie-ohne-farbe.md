# Material & Geometrie ohne Farbwerte — Forschungsnotiz

> **Status:** Forschungsnotiz / Referenz, **keine verbindliche Architektur**, kein Skill.
> Beantwortet die in [`docs/fixture-taxonomie.md`](fixture-taxonomie.md) §6 offen
> gelassene Frage ("der Extraktor ist noch szenen-/paletten-spezifisch") mit externem
> Recherchematerial, jetzt vertieft um ein Generalisierungs-Protokoll für den Cultivator
> und eine überarbeitete, selbstkritische Fassung der Vegetations-Idee. Reine
> Dokumentation — **kein Code geändert**, per Nutzerentscheidung ("nur dokumentieren,
> nicht jetzt umbauen").

## 0. Scope-Klarstellung, bevor irgendetwas anderes gilt

Alles in diesem Dokument beschreibt eine mögliche Erweiterung der
**Rekonstruktions-Forschungslinie** (`tools/scratch-village-*`, die künftige
`Strukturklasse`-Erkennung aus `fixture-taxonomie.md`, das World Surface Graph aus
`docs/reconstruction-provider-und-world-surface-graph.md`). Es beschreibt **nicht** eine
Änderung an SHADEDs geschütztem Laufzeit-Materialsystem (`analyze()`, `classGrid`,
`getMaterialTypeAt()`). Das ist keine Formsache: `shaded-reconstruction`s eigene
Integrationsregel 1 sagt wörtlich *"Keine zweite Materialwahrheit neben `classGrid` und
kanonischen Materialmasken"* — dieselbe Regel, die `shaded-materials` als Harte Regel 1/2
für den Materialkanal-Vertrag führt. Solange dieser Cultivator ausschließlich in
`tools/scratch-*`-Forschung lebt (aktueller Stand), ist das nicht akut. Sollte er je in
den produktiven Pfad wandern, gilt die Regel unverändert: eine Klasse, eine Quelle.

## 1. Drei Vorschläge, drei getrennte Ziele

Das Ausgangsmaterial deckt inzwischen drei Fragen ab, die nicht vermischt werden sollten:

1. **Material-/Geometrieerkennung ohne Farbwerte** — welche Merkmale (Textur,
   Periodizität, Kantenstruktur) können die aktuelle Farbtoleranz-Klassifikation
   ersetzen oder ergänzen.
2. **Wie der Cultivator generalisiert** — die eigentliche, wichtigere Frage: nicht "mit
   welchem Merkmal", sondern "wie verhindern wir, dass der Mechanismus selbst nur für
   ein Demo-Bild funktioniert".
3. **Vegetation als Weltsystem** — inzwischen selbst korrigiert von einem klassischen
   Space-Colonization-Baumgenerator zu einem generischen, feld-getriebenen
   Wachstums-Kernel.

## 2. Material-/Geometriesignale ohne Farbe

*(unverändert gegenüber der vorigen Fassung dieses Dokuments — Kernaussagen kurz
zusammengefasst, Details s. Versionsgeschichte)*

- **Geometrie-Score** `G = w_l·L + w_c·C + w_j·J + w_s·S − w_r·R` (Länge, Kontur, Junction,
  Mehrskalen-Stabilität, minus Repetitions-Strafe) formalisiert, was dieses Repo bereits
  informell nutzt (`synthetic-visual-reverse-engineering.md` §11: "Topologie = hart,
  Pixelkoordinate = weich"; `fixture-taxonomie.md` §1 Achse A). Direkt nachtragbar, sobald
  an der Extraktion gearbeitet wird.
- **Mikrotextur-Signatur** (LBP + Gabor + 2D-Autokorrelation auf Luminanz) ist
  methodisch solide, aber an Fotografien validiert — SHADEDs Fixtures sind gemalte,
  cel-shaded Illustrationen. Ob das Signal dort diskriminativ genug ist, bleibt eine
  **offene, ungeprüfte Frage**, kein Literaturbefund.
- Perspektiv-Entzerrung muss der Periodizitätsmessung vorausgehen, nicht umgekehrt.
- Architektonisch zulässig nur als Ersatzsignal für **dieselbe eine** Klassifikation oder
  als Eingabe für die noch fehlenden Rauheit-/BRDF-Kanäle — nie als zweite Klasse.

## 3. Wie der Cultivator generalisiert (das eigentlich wichtige Dokument)

Die zentrale These der ersten Referenz ist nicht "nutze mehr Merkmale", sondern:

> Der Cultivator darf nicht lernen, was DIESES Bild enthält. Er muss eine allgemeinere
> Regel implementieren: Eine Fläche ist eine räumlich kohärente Region, deren
> Beobachtungen wechselseitig kompatibel bleiben, bis stärkere Evidenz sagt, dass die
> Region stoppen, sich teilen, einer anderen weichen oder ihre geometrische Hypothese
> wechseln muss.

Das ist eine präzise, falsifizierbare Umformulierung von etwas, das in diesem Repo schon
oft als Prinzip auftaucht, aber nie so klar als **Testprotokoll** stand. Die Bausteine,
verkürzt:

**Drei getrennte Kontinuitätsfragen**, die der bisherige RGB-Cultivator zu einer
zusammenfasst: *Appearance-Kontinuität* (RGB, Luminanz, lokaler Kontrast),
*Material-/Struktur-Kontinuität* (Mikrotextur, Periodizität, Orientierung — s. §2),
*Geometrie-Kontinuität* (Orientierungs-Kontinuität, Ebenen-Hypothese, Verdeckung,
Junctions, Topologie). Eine Farbmaske beantwortet nur die erste Frage und wird bisher
für alle drei benutzt.

**Zellzustand als weiche Evidenzfelder, keine Klassen:** `coord, appearance, gradient,
textureEnergy, dominantAngle, anisotropy, frequencyScale, periodicity, edgeDensity,
owner, confidence, stability` — später erweiterbar um `directionFamily,
planeHypothesis, normalHypothesis, occlusionConfidence`. Wichtig: **keine** vorzeitigen
Materialnamen im Zustand.

**Reversibles Ownership statt Flood-Fill:** `unclaimed → weakly claimed → strongly
claimed → contested → yielded → reclaimed`. Das ist ein echter, begründeter Unterschied
zur aktuellen `scratch-village-extract-v2.mjs`-Pipeline (`labelComponents`, Flood-Fill,
irreversibel) — nicht nur eine andere Formulierung.

**Kompetitive Wachstumsfront statt einzelner Kantendetektor:** eine Grenze entsteht nicht,
weil "ein Kantendetektor hier ausgelöst hat", sondern weil die Erweiterung JEDER
konkurrierenden Hypothese über diesen Punkt hinaus deren Kohärenz verschlechtern würde.

**Der Benchmark-Ladder A–K ist der wertvollste Teil dieses Dokuments** — ein konkretes
Anti-Overfitting-Protokoll, keine bloße Absichtserklärung:

| Stufe | Szene | Testet |
|---|---|---|
| A | Farbige Würfel | Baseline (bereits erledigt — `village-cube`) |
| B | Dieselbe Szene, Graustufen | Überlebt Cultivation ohne Objektfarbe? |
| C | Graustufen, unterschiedliche Mikrotexturen | Textur-Evidenz |
| D | Ähnliche Farbe/Helligkeit, unterschiedliche Struktur | Nicht-Farb-Diskriminierung |
| E | Harter Schatten über eine Fläche | Schatten darf nicht zu Geometrie werden |
| F | Starke Wiederholtextur auf einer Fläche | Innentextur darf Geometrie nicht spalten |
| G | Zwei Materialien auf einer planaren Wand | Materialgrenze ≠ geometrische Grenze |
| H | Gleiches Material über eine 90°-Faltung | Geometrische Faltung ohne Erscheinungswechsel |
| I | Teilweise Verdeckung | Ownership, Topologie, reversibles Wachstum |
| J | Quader + Satteldächer | Primitiv-Generalisierung |
| K | Stilisiertes Dorf | Mehrere Objekte/Materialien/Vegetation |

**Stufe J und K sind bereits im Repo vorhanden, nicht hypothetisch:** Stufe J entspricht
strukturell den `SC-2`-Fixtures aus `fixture-taxonomie.md` (VLG-01/02/04/05, echte
Satteldächer statt der Flachdach-Cube-Fixture), Stufe K entspricht den vollen
Mehrobjekt-Szenen mit Vegetation (VLG-02/03/04/06/08, RUI-01). Der Ladder braucht also
keine neuen Testbilder — er kann direkt gegen die bereits klassifizierten Fixtures
laufen, sobald ein Cultivator existiert, der mehr als Stufe A kann.

**12 Anti-Overfit-Regeln** sind harte, gut formulierte Entwicklungsregeln (keine
bild-/koordinatenspezifischen Regeln, keine versteckten Bounding-Boxen, jeder
Schwellenwert über einen Bereich getestet und als Intervall statt Einzelwert berichtet,
Extraktions- und Rekonstruktionsqualität getrennt gemessen, Reprojektionsfehler allein
genügt nicht — Topologie muss mitgeprüft werden). Diese Regeln sind eine direkte,
strengere Fortsetzung dessen, was die village-Cube-Untersuchung dieser Session bereits
gelernt hat (Reprojektion bei 0.00px UND falsche Form gleichzeitig war genau das
Problem, das Regel 10 hier vorwegnimmt).

**Reihenfolge Cultivation → globaler Solve → Freeze → Verfeinerung** deckt sich exakt mit
dem bereits verifizierten Ergebnis der village-Cube-Pipeline (v3c/v3e: eingefrorene
Kamera nach einmaligem globalem Fit, keine iterative Kamera-Nachjustierung durch lokale
Operatoren) — dieselbe Lehre, jetzt als allgemeine Architekturregel formuliert statt als
Post-hoc-Fix für ein einzelnes Solver-Problem.

## 4. Vegetation als generischer Growth-Kernel, nicht Baumgenerator

Die zweite Fassung der Vegetations-Idee korrigiert die erste an einem entscheidenden
Punkt: nicht *"baue einen Space-Colonization-Baumgenerator"*, sondern:

> Dieselben lokalen Cultivation-Agenten, die gerade Bildflächen organisieren, können in
> einem bereits rekonstruierten Raum Weltzustände konsumieren und dadurch neue Geometrie
> wachsen lassen.

Das ist der richtige Einwand. Space Colonization bleibt eine mögliche
Vergleichs-/Benchmark-Methode für verzweigte Strukturen, aber die Architektur soll
generischer sein: **CELL** (state, neighbors, fields, owner, confidence), **AGENT**
(position, state, rules), **WORLD** (constraints, events) — Reconstruction-Cultivator und
Vegetation-Cultivator unterscheiden sich dann nur darin, welche Felder sie lesen und
welchen Zustand sie schreiben (Bild-Evidenz → Surface-Ownership, vs. Welt-Evidenz →
Occupancy/Geometrie), nicht in einem zweiten, unabhängigen Mechanismus.

**Das passt besser zu SHADED als es zunächst aussieht, weil die Feldliste der
Vegetations-Agenten großteils bereits existiert**, nur nicht pro Zelle sampelbar:
`moisture` ↔ das bereits gebaute `wet`-Parameter, `light` ↔ `dayNight`/`glow`,
`temperature` ↔ das bereits gebaute `temperature`-Parameter, `damage` ↔ `decay`. SHADEDs
13 High-Level-Parameter (`CLAUDE.md`) sind aktuell global-uniforme Shader-Parameter, kein
Feld pro Zelle — genau diese Lücke (global → lokal samplebar) ist die eigentliche
Vorarbeit, die ein Growth-Kernel bräuchte, nicht das Erfinden neuer Weltbegriffe.

**SDF als natürliche Repräsentation** (jedes Wachstumssegment als Capsule-SDF, Vereinigung
über Segmente) ist konsequent, berührt aber ein drittes, hier noch nicht geladenes
Regelwerk: den `shaded-sdf`-Skill ("Vor jeder Änderung an impliziter Geometrie... SDF-zu-
Mesh-Konvertierung verwenden"). Vor jeder tatsächlichen Implementierung dieses Teils
müsste dieser Skill zuerst geladen werden — hier nur vorgemerkt, nicht schon geprüft.

**Die zwei bereits gestellten offenen Fragen bleiben unverändert offen, wiegen jetzt aber
schwerer:**

- `runtime/spatial-kernel/cellular-geometry-solver.js` (GROW/ERODE/SMOOTH-Agenten auf
  einem Höhenfeld, "proof-of-concept, not yet wired") ist der genaue Vorläufer-Code für
  GENAU diese generischere Fassung (Feld-lesende, Feld-schreibende lokale Agenten) — näher
  dran als an der ursprünglichen Baumgenerator-Idee. Dieser Branch hat unabhängig
  festgestellt, dass `main` diese Datei entfernt hat, Grund unbekannt. Das bleibt zu
  klären, bevor neuer Code in dieselbe Richtung entsteht.
- Die gelieferte `VegetationKernel.kt` bleibt unzugänglich (Sandbox-Link einer fremden
  KI-Umgebung, kein erreichbarer Pfad) — **und wird jetzt auch inhaltlich von der zweiten
  Referenz selbst verworfen** ("den Kotlin-MVP würde ich ebenfalls verwerfen. SHADED
  braucht keinen isolierten Fremdkörper"), unabhängig von meinem eigenen Einwand
  (Kotlin war nie SHADEDs Laufzeit oder Entwicklungswerkzeug — das war KorGE, SHADEDs
  bereits abgelöster Vorläufer). Beide Einwände zeigen in dieselbe Richtung, aus
  unterschiedlichen Gründen: Zugänglichkeit/Laufzeit einerseits, Architektur
  andererseits.

## 5. Ausdrücklich offen

- Kein Code geändert. Kein Extraktor umgebaut. Kein Growth-Kernel angelegt.
- Keine empirische Prüfung der Mikrotextur-Hypothese an echten SHADED-Fixtures.
- Keine Klärung, warum `main` `cellular-geometry-solver.js` entfernt hat.
- `shaded-sdf`-Skill noch nicht geladen — Pflicht vor jeder SDF-Implementierung dieses
  Themas, nicht vor dieser Dokumentation.
- Der Benchmark-Ladder A–K ist definiert, aber nicht durchgeführt — auch nicht Stufe B
  (Graustufen-Test der bereits funktionierenden village-Cube-Fixture), die der billigste
  nächste Schritt wäre, um die Kernthese überhaupt zu prüfen.
