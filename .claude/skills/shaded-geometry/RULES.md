# SHADED Geometry — Regelgedächtnis

Lebendes Dokument. Wächst ausschließlich über den Failure-Driven-Growth-Loop
aus `REFERENCE.md` Abschnitt 6 — nie durch spekulativen Import aus Literatur.
Ein Eintrag ohne bestandene Gegenproben an einer echten SHADED-Szene bleibt
`CANDIDATE`, wandert nie direkt nach `LEARNED`.

Format (siehe `REFERENCE.md` Abschnitt 6):

```yaml
id: <slug>
tier: CORE | LEARNED | CANDIDATE
statement: <ein Satz>
trigger: <welche Beobachtung/Situation sie auslöst>
source: seed            # nur bei CORE
learned_from:            # nur bei LEARNED/CANDIDATE
  - <SHADED-Fall-ID oder kurze Beschreibung>
tests:
  - <Gegenprobe 1>
  - <Gegenprobe 2>
confidence: <0.0–1.0>
```

## CORE

Fundament, nicht failure-getrieben — das Vokabular, gegen das Failures
überhaupt als Failures erkannt werden. Details in `REFERENCE.md` Abschnitte
1–5; hier nur die Kurzreferenz mit Herkunft, damit CORE genauso durchsuchbar
ist wie LEARNED/CANDIDATE.

```yaml
id: relation_vocabulary
tier: CORE
statement: >
  Geometrische Beobachtungen werden über ein festes Relationsvokabular
  beschrieben (parallel, orthogonal, koplanar, supported-by, intersects,
  bounds, occludes, continues, repeats, symmetric-to), nicht über
  Objektlabels.
trigger: jede DECOMPOSE/RELATE-Phase (REFERENCE.md Abschnitt 1)
source: seed
confidence: 1.0
```

```yaml
id: operator_vocabulary
tier: CORE
statement: >
  Formkonstruktion wird als Komposition eines festen Operatorvokabulars
  beschrieben (project, intersect, extrude, offset, sweep, loft, fold,
  split, trim, mirror, repeat, subdivide, relax, grow). Eine Konstruktion,
  die sich nicht so beschreiben lässt, ist entweder ein fehlender Operator
  (→ CANDIDATE) oder ein Spezialfall-Hack (→ nicht in diesem Skill).
trigger: jede OPERATE-Phase (REFERENCE.md Abschnitt 1)
source: seed
confidence: 1.0
```

```yaml
id: constraint_value_ordering
tier: CORE
statement: >
  Hoch-constrainte Elemente (Wandecke, First+Traufen, geschlossener
  Footprint) werden vor niedrig-constrainten Elementen (isolierter Punkt,
  einzelne Kante) gelöst, weil sie den Rest der Konstruktion am stärksten
  einschränken.
trigger: jede SOLVE-Phase mit mehreren unbekannten Teilflächen
source: seed
confidence: 1.0
```

```yaml
id: reprojection_is_mandatory_proof
tier: CORE
statement: >
  Eine rekonstruierte Geometrie gilt erst als verifiziert, wenn sie durch
  die rekonstruierte Kamera zurückprojiziert und gegen echte gemessene
  Punkte verglichen wurde (kleiner Rückprojektionsfehler). "Sieht plausibel
  aus" ist kein Beweis.
trigger: jede VERIFY-Phase nach RECONSTRUCTED-Geometrie
source: seed (übernommen aus shaded-spatial-primitive-solver, dort bereits
  verifiziert an synthetischen und echten Testbildern)
confidence: 1.0
```

```yaml
id: perceptual_lod_by_demand
tier: CORE
statement: >
  Die Repräsentation eines Elements (Proxy/Matte/Card/Shadow-Proxy/
  Reflection-Proxy/echte Oberfläche/Kollisionsgeometrie) richtet sich nach
  dem tatsächlichen Bedarf (Silhouette/Hintergrund/Parallaxe/Schatten/
  Reflexion/begehbar/Physik/Nahaufnahme), nicht nach Bequemlichkeit oder
  pauschaler Vollständigkeit.
trigger: jede Entscheidung, ob etwas gebaut oder nur impliziert werden darf
source: seed
confidence: 1.0
```

## LEARNED

*(noch leer — erster Eintrag entsteht, sobald ein echter SHADED-Failure den
vollständigen Loop inklusive Gegenproben bestanden hat.)*

## CANDIDATE

*(noch leer — erster Eintrag entsteht, sobald ein Failure eine Regel liefert,
die den Originalfall löst, aber noch nicht genug Gegenproben überstanden hat.)*
