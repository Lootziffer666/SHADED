---
name: shaded-living
description: AKTIV. Projektweiter, failure-getriebener Living Skill (GOAL_FOUNDATION.md 0C) — konsultiert vorhandene Erfahrung/Regeln, bevor neue Provider/Spezialcode/Fachliteratur eingeführt werden, und lernt nur aus nachgewiesenem Scheitern, nie spekulativ. Aktuell mit einem realen, ausgebauten Modul: Geometry/Spatial Construction — Denkgrammatik für geometrisches Schließen aus Bild-Evidenz (OBSERVE→DECOMPOSE→RELATE→OPERATE→CONSTRAIN→SOLVE→VERIFY vor jedem INFER/GENERATE), Perceptual-Geometry und PREPARE-FOR-EXTENSION. Nutzen vor jeder neuen geometrischen Konstruktions-, Rekonstruktions- oder Occlusion-/Implikationsentscheidung, und IMMER wenn SHADED an einer Form scheitert, bevor pauschal neue Fachliteratur, ein neuer Provider oder Spezialcode herangezogen wird. Weitere Domain-Module (Materials/Surface, Physics, Hydrology, Atmosphere/Light, Vegetation/Life, Reconstruction/Providers, UI/Perception, Performance/Backends, Verification) folgen demselben Mechanismus, sobald ein echter Failure sie verlangt — sie existieren noch nicht spekulativ vorab.
---

# SHADED Living Skill — projektweites, failure-getriebenes Regelgedächtnis

**Status: AKTIV.** Dieser Skill liegt unter `.claude/skills/` und wird vom Harness geladen.

Generalisiert aus dem früheren `.claude/skills/shaded-geometry` (GOAL_FOUNDATION.md F-0310):
sein Kernprinzip — kleiner stabiler Core, `REFERENCE.md`, wachsendes `RULES.md`,
`CORE / LEARNED / CANDIDATE`, Failure-Driven Growth, Gegenproben — war nie auf Geometry
beschränkt. Geometry ist jetzt ein Fachmodul dieses Skills (F-0311), nicht mehr seine Identität.

## Kernsatz (projektweit, nicht geometriespezifisch)

> Lerne nicht, weil neues Wissen verfügbar ist. Lerne, weil dir nachweislich Wissen fehlt.

## Der projektweite Living-Skill-Loop

```text
OBSERVE FAILURE / NOVEL CASE
        ↓
RETRIEVE: Dorfältester + bestehende RULES + passende Nachschlagewerke
        ↓
IDENTIFY MISSING KNOWLEDGE
        ↓
CANDIDATE RULE / OPERATOR / HEURISTIC
        ↓
APPLY TO ORIGINAL CASE
        ↓
COUNTEREXAMPLES / REGRESSION TESTS
        ↓
VERIFY
  ┌─────┴─────┐
 PASS         FAIL
  │             │
LEARNED       REVISE / DISCARD
  │
STORE IN RULES + DORFÄLTESTER
```

Mindestens zwei abweichende Gegenproben sind Standard für die Promotion einer Candidate Rule
(GOAL_FOUNDATION.md F-0322); ein positiver Einzelfall genügt nie (F-0323).

## Module

Domain-Module teilen denselben Learning-/Evidence-Mechanismus oben und erfinden keine eigenen
konkurrierenden Provenienzsysteme (F-0313). Ein Failure wird zuerst klassifiziert — fehlende
Relation/Operator/Constraint/Materialregel/World Law/Perceptionstrick/Providerentscheidung/
Performance-Regel/Verification-Regel etc. — erst danach wird gezielt recherchiert (F-0314).

### Geometry / Spatial Construction (aktiv, ausgebaut)

Die vollständige Methodik steht in [`REFERENCE.md`](REFERENCE.md) im selben Verzeichnis —
**vor Anwendung vollständig lesen.** Das wachsende, herkunftsbelegte Regelgedächtnis
(CORE/LEARNED/CANDIDATE) steht separat in [`RULES.md`](RULES.md), weil es sich unabhängig
von der Methodik selbst verändert und nicht bei jeder Methodik-Änderung mit-diffen soll.

Die tatsächlichen Primärquellen des Seed-Curriculums (REFERENCE.md Abschnitt 7) liegen lokal
im Repo unter [`docs/geometry-library/`](../../../docs/geometry-library/README.md) — geprüft
frei (Public Domain, Autoren-Self-Archiving oder CC BY-NC-SA, nie Piraterie oder Leihzugang),
damit die „gezielte Recherche" in Abschnitt 6 tatsächlich aus der Primärquelle passiert statt
aus einer Trainingsdaten-Paraphrase. **Diese Bibliothek wächst mit demselben Prinzip wie
`RULES.md`:** neue Werke kommen dazu, wenn ein echter SHADED-Failure sie konkret verlangt,
nicht spekulativ — siehe die Wachstumsregel am Ende von `docs/geometry-library/README.md`.

Verhältnis zu anderen Skills (keine zweite Autorität):

- **`shaded-reconstruction`** bleibt die Provenienz- und Provider-Architektur
  (`MEASURED/OBSERVED/RECONSTRUCTED/INFERRED/GENERATED/USER_APPROVED`, World Surface Graph).
  Das Geometry-Modul erfindet **keine** neue Provenienzklasse — seine „Vier Wahrheiten"
  (REFERENCE.md) sind eine Denk-Linse, die auf die bestehenden Klassen abbildet, kein Ersatz
  dafür.
- **`shaded-spatial-primitive-solver`** ist ein konkreter, verifizierter Solver
  (Single-View-Metrologie für einfache Körper). Das Geometry-Modul liefert die Denkgrammatik
  und das Vokabular, in dem so ein Solver beschrieben und erweitert wird — es dupliziert dessen
  Algebra nicht.
- **`shaded-sdf`** bleibt zuständig für implizite Geometrie/Raymarching/Mesh-Extraktion als
  Repräsentation. Das Geometry-Modul entscheidet nicht, in welcher Repräsentation etwas am Ende
  steht, sondern welche Konstruktion überhaupt gerechtfertigt ist.
- **Invariante 2 (Eine Material-Wahrheit)** gilt unverändert: das Geometry-Modul erzeugt
  Geometrie-Hypothesen, niemals `classGrid`/`getMaterialTypeAt`.

Wann benutzen:

- Vor jeder neuen geometrischen Konstruktions- oder Rekonstruktionsentscheidung (Dach, Fassade,
  Vegetation, Gelände, Bogen, Treppe, verdeckte Struktur …).
- Vor jeder Entscheidung, ob etwas gebaut oder nur impliziert werden darf (Occlusion, Nebel,
  Silhouette, Reflexion, Licht als Formhinweis).
- Sobald SHADED an einer Form sichtbar scheitert — dann als Einstieg in den
  Failure-Driven-Growth-Loop (REFERENCE.md, Abschnitt „Drei Wissenszustände").
- Vor jeder Erweiterung von `RULES.md` — neue Einträge laufen zwingend durch diesen Loop, nie
  durch spekulativen Bulk-Import aus Literatur.

Dieser Skill war der eigentliche Auftrag des Threads, der zum Branch-Namen
`shaded-geometry-skill-design` geführt hat — eine lange Maintainer-Diskussion über
Architectural Geometry, Shape Grammars, Procedural Modeling, Perceptual Geometry (Matte
Painting/VFX/Set-Design) und ein failure-getriebenes Lern-Curriculum (Dot-to-Dot als
Sparse-Evidence-Grundschule). Der Auftrag kam im ursprünglichen Thread nie an; dieses Modul
setzt ihn jetzt um, exakt nach dem darin festgelegten Prinzip: **kleiner stabiler Kern, kein
Enzyklopädie-Dump, Wachstum nur durch nachgewiesenes Scheitern an einer echten SHADED-Szene.**

### Weitere Module (noch nicht gebaut)

Materials/Surface, Physics, Hydrology, Atmosphere/Light, Vegetation/Life,
Reconstruction/Providers, UI/Perception, Performance/Backends, Verification
(GOAL_FOUNDATION.md F-0312) existieren noch nicht als eigene Module. Sie werden nach demselben
Loop wie oben angelegt, sobald ein echter SHADED-Failure eines von ihnen konkret verlangt — nicht
vorab spekulativ, per F-0301/F-0335/F-0339. Bis dahin bleibt dieser Skill ein Skill mit einem
ausgebauten Modul, nicht neun leeren.
