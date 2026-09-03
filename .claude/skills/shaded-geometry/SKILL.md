---
name: shaded-geometry
description: AKTIV. Denkgrammatik und wachsendes Regelgedächtnis für geometrisches Schließen aus Bild-Evidenz — OBSERVE→DECOMPOSE→RELATE→OPERATE→CONSTRAIN→SOLVE→VERIFY vor jedem INFER/GENERATE, dazu Perceptual-Geometry (was implizit bleiben darf) und PREPARE-FOR-EXTENSION (was jetzt gebaut werden muss, damit später konsistent angeschlossen werden kann). Nutzen vor jeder neuen geometrischen Konstruktions-, Rekonstruktions- oder Occlusion-/Implikationsentscheidung, und IMMER wenn SHADED an einer Form scheitert, bevor pauschal neue Fachliteratur, ein neuer Provider oder Spezialcode herangezogen wird.
---

# SHADED Geometry — Denkgrammatik statt Enzyklopädie

**Status: AKTIV.** Dieser Skill liegt unter `.claude/skills/` und wird vom Harness
geladen.

Die vollständige Methodik steht in [`REFERENCE.md`](REFERENCE.md) im selben
Verzeichnis — **vor Anwendung vollständig lesen.** Das wachsende, herkunfts-
belegte Regelgedächtnis (CORE/LEARNED/CANDIDATE) steht separat in
[`RULES.md`](RULES.md), weil es sich unabhängig von der Methodik selbst
verändert und nicht bei jeder Methodik-Änderung mit-diffen soll.

Die tatsächlichen Primärquellen des Seed-Curriculums (REFERENCE.md Abschnitt 7)
liegen lokal im Repo unter
[`docs/geometry-library/`](../../../docs/geometry-library/README.md) —
geprüft frei (Public Domain, Autoren-Self-Archiving oder CC BY-NC-SA, nie
Piraterie oder Leihzugang), damit die „gezielte Recherche" in Abschnitt 6
tatsächlich aus der Primärquelle passiert statt aus einer Trainingsdaten-
Paraphrase. **Diese Bibliothek wächst mit demselben Prinzip wie `RULES.md`:**
neue Werke kommen dazu, wenn ein echter SHADED-Failure sie konkret verlangt,
nicht spekulativ — siehe die Wachstumsregel am Ende von
`docs/geometry-library/README.md`.

## Auftrag

Dieser Skill war der eigentliche Auftrag des Threads, der zum Branch-Namen
`shaded-geometry-skill-design` geführt hat — eine lange Maintainer-Diskussion
über Architectural Geometry, Shape Grammars, Procedural Modeling, Perceptual
Geometry (Matte Painting/VFX/Set-Design) und ein failure-getriebenes
Lern-Curriculum (Dot-to-Dot als Sparse-Evidence-Grundschule). Der Auftrag kam
im ursprünglichen Thread nie an; dieser Skill setzt ihn jetzt um, exakt nach
dem darin festgelegten Prinzip: **kleiner stabiler Kern, kein Enzyklopädie-Dump,
Wachstum nur durch nachgewiesenes Scheitern an einer echten SHADED-Szene.**

## Kernsatz

> Lerne nicht, weil neues Wissen verfügbar ist. Lerne, weil dir nachweislich
> Wissen fehlt.

## Verhältnis zu anderen Skills (keine zweite Autorität)

- **`shaded-reconstruction`** bleibt die Provenienz- und Provider-Architektur
  (`MEASURED/OBSERVED/RECONSTRUCTED/INFERRED/GENERATED/USER_APPROVED`,
  World Surface Graph). Dieser Skill erfindet **keine** neue Provenienzklasse —
  seine „Vier Wahrheiten" (REFERENCE.md) sind eine Denk-Linse, die auf die
  bestehenden Klassen abbildet, kein Ersatz dafür.
- **`shaded-spatial-primitive-solver`** ist ein konkreter, verifizierter
  Solver (Single-View-Metrologie für einfache Körper). Dieser Skill liefert
  die Denkgrammatik und das Vokabular, in dem so ein Solver beschrieben und
  erweitert wird — er dupliziert dessen Algebra nicht.
- **`shaded-sdf`** bleibt zuständig für implizite Geometrie/Raymarching/
  Mesh-Extraktion als Repräsentation. Dieser Skill entscheidet nicht, in
  welcher Repräsentation etwas am Ende steht, sondern welche Konstruktion
  überhaupt gerechtfertigt ist.
- **Invariante 2 (Eine Material-Wahrheit)** gilt unverändert: dieser Skill
  erzeugt Geometrie-Hypothesen, niemals `classGrid`/`getMaterialTypeAt`.

## Wann benutzen

- Vor jeder neuen geometrischen Konstruktions- oder Rekonstruktionsentscheidung
  (Dach, Fassade, Vegetation, Gelände, Bogen, Treppe, verdeckte Struktur …).
- Vor jeder Entscheidung, ob etwas gebaut oder nur impliziert werden darf
  (Occlusion, Nebel, Silhouette, Reflexion, Licht als Formhinweis).
- Sobald SHADED an einer Form sichtbar scheitert — dann als Einstieg in den
  Failure-Driven-Growth-Loop (REFERENCE.md, Abschnitt „Drei Wissenszustände").
- Vor jeder Erweiterung von `RULES.md` — neue Einträge laufen zwingend durch
  diesen Loop, nie durch spekulativen Bulk-Import aus Literatur.
