# Operators — dieselbe Maschine vorwärts und rückwärts

Companion to [`WORLD_KERNEL.md`](./WORLD_KERNEL.md), [`PHYSICS.md`](./PHYSICS.md),
[`HYDROLOGY.md`](./HYDROLOGY.md), [`SHADER_IR.md`](./SHADER_IR.md), [`MATERIALS.md`](./MATERIALS.md),
[`STATE.md`](./STATE.md), [`VERIFICATION.md`](./VERIFICATION.md).

## These

> Simulation fragt: „Wenn die Welt so ist, was passiert dann?"
> Reconstruction fragt: „Wenn ich das hier sehe, wie muss die Welt gewesen sein?"

Dieselben Operatoren. Unterschiedliche Richtung.

```
WORLD RUNTIME                       RECONSTRUCTION

State                                Observation
  ↓                                    ↑
Operators                            Operators
  ↓                                    ↑
Future State                         Most plausible State
```

Das ist kein zufälliger Zusammenhang. WORLD_KERNEL.md, PHYSICS.md und HYDROLOGY.md beschreiben
bereits Zustandsübergänge (`STATE → OPERATOR → STATE`: Infiltration, Kontaktimpuls, Phasenwechsel).
Ein Operator, der einmal sauber definiert ist, lässt sich vorwärts (Simulation) genauso ausführen
wie rückwärts befragen (Reconstruction) — die geparkte Image-to-World-Engine und die Snowflow-Welt
sind dann keine zwei Produkte, die zufällig denselben Namen tragen, sondern zwei Richtungen
derselben Maschine.

## Der Operator als Grundeinheit

Erweitert VERIFICATION.md's `LAW:`-Format um Ein-/Ausgabe und Richtung — ein Operator-Eintrag ist
ein `LAW`, der zusätzlich weiß, was er verbindet:

```
OPERATOR: <name>_v<n>

INPUT:
  <Zustandsfelder, mit Einheiten>

OUTPUT:
  <Zustandsfelder, mit Einheiten>

FORWARD:
  <Zustand → Zustand, die Simulationsrichtung>

INVERSE:
  <PASS/PARTIAL/NONE — existiert eine geschlossene Umkehrung, oder nur "y ≈ F(x) minimieren"?>

CONSTRAINTS:
  <Erhaltungssätze, Monotonie, physikalisch zulässiger Bereich>

CONSENSUS:        <siehe VERIFICATION.md>
MATH_VERIFICATION: <siehe VERIFICATION.md>
CONTEXT7:         <siehe VERIFICATION.md>
SHADED TESTS:     <siehe VERIFICATION.md>
```

Kein neues Prüfformat — dieselben vier Spalten aus VERIFICATION.md, nur mit einem Kopf, der sagt,
was der Operator verbindet, statt nur, dass er stimmt.

## Reconstruction als inverses Operatorproblem

```
WORLD STATE x
   │
   ├─ Camera Projection
   ├─ Visibility
   ├─ Geometry
   ├─ Material / BRDF
   ├─ Lighting
   ├─ Atmosphere
   └─ Sensor/Image formation
   │
   ▼
OBSERVATION ŷ
```

Formal: `ŷ = F(x)`. Rekonstruktion sucht `x`, sodass `F(x) ≈ y` — meist nicht über eine
geschlossene Inverse `x = F⁻¹(y)` (die existiert bei den meisten dieser Operatoren nicht
eindeutig), sondern über `argmin_x L(F(x), y)` unter zusätzlichen Weltgesetzen als Nebenbedingung.

Das ist keine SHADED-Erfindung, sondern ein etabliertes Feld: **Analysis-by-Synthesis / Inverse
Rendering**. Belegt u. a. durch [Unified Shape and SVBRDF Recovery using Differentiable Monte
Carlo Rendering](https://consensus.app/papers/details/56b8565b34765de69e6905f1480df382/) (Luan et
al., 2021, 129 Zitationen) — exakt Form + Reflektanz aus 2D-Bildern über
Analysis-by-Synthesis+differenzierbares Rendering — und dem Überblick [Advances in Neural
Rendering](https://consensus.app/papers/details/cca4fa2096cb5a4594c0dd4b3c2d2886/) (Tewari et al.,
2021, 558 Zitationen), der "inverse graphics" als Rekonstruktion einer Szenen-Repräsentation aus
Beobachtungen über eine differenzierbare Rendering-Loss definiert.

## Drei Einschränkungen, die die Idee nicht entkräften, aber ernst genommen werden müssen

Nach Consensus-Gegenprüfung (siehe VERIFICATION.md's Prinzip: nicht Bestätigung suchen, sondern
Gegenevidenz):

### 1. Erst billige diskrete Hypothesenprüfung, nicht sofort kontinuierliches `argmin`

Ein Dach mit drei Neigungshypothesen vorwärts zu simulieren und das Residuum zu vergleichen ist
etwas fundamental anderes als kontinuierliches `argmin_x` über einen hochdimensionalen Zustand —
Letzteres braucht **differenzierbare Operatoren** (Gradienten von `F` nach `x`), und das ist ein
eigener, aufwendiger Forschungszweig ([Path-space differentiable
rendering](https://consensus.app/papers/details/6c74c2f914e35bde8ab759965c0f27cf/), Zhang et al.
2020, 178 Zitationen; [A differential theory of radiative
transfer](https://consensus.app/papers/details/1d2bc141a627544abdcf63aca3566dac/), Zhang et al.
2019, 151 Zitationen) — Sichtbarkeits-Diskontinuitäten, teure Monte-Carlo-Schätzer. SHADEDs
heutige Operatoren (WGSL-Shader, JS-Weltgesetze) sind nicht automatisch differenzierbar. **Deshalb:
diskrete/endliche Hypothesenmengen zuerst** (passt zu WORLD_ARCHITECTURE.md's „kausal
ausreichend, nicht vollständig"), Differenzierbarkeit erst als expliziter, separat geprüfter
späterer Schritt — nicht stillschweigend vorausgesetzt.

### 2. Regularisierung ist eine scharfe Waffe, kein Kompromiss

[Large steps in inverse rendering of
geometry](https://consensus.app/papers/details/69f9ae24367255bf806b232d7c13e3e4/) (Nicolet et al.,
2021, 211 Zitationen): *„regularization introduces its own set of problems: solutions must now
compromise between solving the problem and being smooth."* Weltgesetze als Regularisierer
einzusetzen heißt, die Lösung absichtlich vom reinen Datenfit wegzuschieben — das ist der Punkt
(sonst bringt Kausalität nichts als Prior), aber es zieht eine harte Grenze:

**Regularisierung wirkt ausschließlich auf RECONSTRUCTED/INFERRED/GENERATED, niemals auf
MEASURED oder OBSERVED.**

Das ist keine neue Regel — es ist die bestehende, tatsächlich im Code verankerte Provenienz-
Taxonomie `MEASURED / OBSERVED / RECONSTRUCTED / INFERRED / GENERATED / USER_APPROVED`
(`.claude/skills/shaded-reconstruction/SKILL.md`, `docs/reconstruction-provider-und-
world-surface-graph.md` §8.1, real validiert in `contracts/shaded-spatial-provider.schema.json`s
`provenance.class`), nur auf einen neuen Mechanismus angewendet. Sie ist präziser als die ältere
`OBSERVED/DERIVED/INFERRED/INVENTED/UNKNOWN`-Fassung aus `docs/SHADED_BEUTELTIER_ARCHITEKTUR_
REFERENZ...`, weil sie MEASURED (aus Pixeln getracte 2D-Evidenz: Kanten, Ecken, Konturen) explizit
von OBSERVED (rohe Pixelwerte selbst) trennt — genau die Unterscheidung, die ein
Reconstruction-Operator wie `rectify_plane_v1` unten braucht. Ein Weltgesetz darf zwischen
mehreren Hypothesen wählen helfen; es darf nie MEASURED oder OBSERVED selbst überschreiben.

### 3. Unsicherheit muss verdient werden, nicht behauptet

[Differentiable Inverse Rendering with Interpretable Basis
BRDFs](https://consensus.app/papers/details/6f7b09df6e6d53e2ac4f7cf2020f831b/) (Chung et al.,
2024) und [Differentiable Point-Based Inverse
Rendering](https://consensus.app/papers/details/914d604742dd5f93852d13485da32b60/) (Chung et al.,
2023) behandeln beide explizit, dass Material/Beleuchtung/Form sich in RGB-Beobachtungen
gegenseitig konfundieren — exakt das Nässe-aus-Pixel-Beispiel unten. Ein bloßer
Least-Squares-Rest ergibt **keine** kalibrierte `±`-Unsicherheit von selbst. `wetness = 0.63 ±
0.18` ist nur ehrlich, wenn ein Ensemble/eine Sensitivitätsanalyse/eine Laplace-Näherung dahinter
steckt — sonst ist die Zahl hinter dem `±` erfunden, obwohl sie seriös aussieht. MATERIALS.md's
`confidence`-Feld ist der richtige Ort dafür, aber ein Zahlenwert dort muss dieselbe Sorgfalt
durchlaufen wie jede andere LAW/OPERATOR-Behauptung.

## Beispiel (illustrativ, kein geprüfter Operator)

Zeigt die Form, nicht eine fertige Prüfung — Status wäre `CONSENSUS: OPEN`,
`MATH_VERIFICATION: OPEN` bis tatsächlich durchgeführt, genau wie VERIFICATION.md es für ehrliche
`OPEN`-Felder vorsieht:

```
OPERATOR: infiltration_v1

INPUT:
  surface_water [m], soil_porosity [-], saturation [-], pressure [Pa]

OUTPUT:
  soil_water [m], groundwater [m]

FORWARD:
  Regen/Oberflächenwasser → Boden (Versickerung), siehe HYDROLOGY.md's Wasser-Ledger
  (surface → soil → ground, Erhaltungsregel: Transfers verschieben Bestand, erzeugen ihn nicht).

INVERSE:
  PARTIAL — aus beobachteter Bodenfeuchte (Farbe/Textur-Indiz) und Zeit seit letztem
  Niederschlagsereignis lässt sich eine plausible surface_water-Historie eingrenzen, nicht
  eindeutig rekonstruieren (klassisches inverses Problem, mehrere Niederschlagsverläufe können
  zur selben Endfeuchte führen).

CONSTRAINTS:
  Massenerhaltung (HYDROLOGY.md); soil_water ≤ pore capacity.

CONSENSUS / MATH_VERIFICATION / CONTEXT7 / SHADED TESTS:
  OPEN — noch nicht durchgeführt, dies ist ein Formatbeispiel.
```

## WORLD_LANGUAGE-Audit (2026-09-05): nicht einfach zusammenlegen

Vor jedem Umbenennen erst geprüft, ob zwei unterschiedlich benannte Größen überhaupt dieselbe
Größe meinen — sie tun es hier nicht in jedem Fall:

| Wo | Name | Was es tatsächlich ist | Beleg |
|---|---|---|---|
| Snowflow-Kernel | `FIELD.WETNESS` | **Bodenwassergehalt** — treibt Biomasse (`biomass = seedPatch * wetness * …`), wird in `world-sandbox-growth.mjs` bereits selbst als `moisture` gelesen | `src/sandbox/world-sandbox-reference.mjs:223-226`, `world-sandbox-growth.mjs:119` |
| Snowflow-Kernel | `FIELD.WATER` | **Oberflächen-Standwasser**, separat berechnet und gespeichert | `world-sandbox-reference.mjs:222` |
| Geparkte Engine | `wet` (`PARAM_META`) | globaler Szenen-Look-Regler ("Nässe", 0..1) — **keine** Zelle, kein World-State-Feld, reine Rendering-Stimmung | `runtime/shaded-engine.mjs` |
| Geparkte Engine | `puddle` (`PARAM_META`) | globaler Pfützenstand-Regler — ebenfalls Rendering-Stimmung, kein Feld | `runtime/shaded-engine.mjs` |
| World Surface Graph (nur Doku, kein Code) | `fields.moisture` | **undefiniert** — nie festgelegt, ob Boden- oder Oberflächenwasser gemeint ist | `docs/reconstruction-provider-und-world-surface-graph.md` |

**Befund:** Innerhalb von Snowflow ist `WETNESS`/`WATER` bereits sauber getrennt (Boden vs.
Oberfläche, deckungsgleich mit HYDROLOGY.md's `soil → WETNESS`, `surface → WATER`) — kein Bug.
Die geparkte Engines `wet`/`puddle` sind globale Stimmungsregler, keine Per-Zelle-Felder mit
Provenienz — lassen sich nicht 1:1 mit Snowflows Zellfeldern verschmelzen, ohne Granularität zu
verlieren, und bleiben deshalb vorerst unangetastet.

Der einzige tatsächlich offene Punkt ist `fields.moisture` im World Surface Graph — nirgends
implementiert (bestätigt: kein Treffer für `WorldSurfaceNode`/`worldSurfaceGraph` im gesamten
Code), also reparierbar, bevor irgendein Code davon abhängt:

```
canonical_name: moisture        = Bodenwassergehalt, deckungsgleich mit Snowflows WETNESS
canonical_name: surface_water   = Oberflächen-Standwasser, deckungsgleich mit Snowflows WATER
```

`fields.moisture` im World Surface Graph bekommt bei Implementierung diese Bedeutung; ein
separates `fields.surface_water` wird ergänzt, statt beides unter `moisture` zu verstecken.
`saturation` (Sättigungsgrad relativ zur Porenkapazität, HYDROLOGY.md's "Schlamm"-Übergang) bleibt
eine abgeleitete Größe (`moisture / pore_capacity`), kein eigenes gespeichertes Feld — passt zum
Prinzip, dass Operatoren abgeleitete Größen berechnen, statt jede Ableitung zusätzlich zu
speichern.

## Nicht jetzt

- **Eine gemeinsame State-Repräsentation zwischen Snowflow (Grid/CA, `FIELD.*`) und der
  geparkten Reconstruction-Engine (Pixel-/Bildklassifikation).** Damit ein Operator wortwörtlich
  derselbe Code in beiden Richtungen ist statt zweimal derselben Idee, braucht es eine
  gemeinsame Zustandsschicht, über die beide Seiten sprechen können — ein eigenes
  Architekturprojekt, kein Dokumentationsschritt, und hier nicht angefangen. Der
  WORLD_LANGUAGE-Audit oben legt nur die Namen fest, die diese künftige Schicht verwenden würde.
- **Kontinuierliches, differenzierbares `argmin_x`.** Siehe Einschränkung 1 — kommt erst, wenn
  diskrete Hypothesenprüfung an ihre Grenze stößt, und dann mit eigener Prüfung (welcher Operator
  wird differenzierbar gebraucht, welche Kosten sind das).
- **Automatisierte Unsicherheitsquantifizierung als Standardausgabe jedes Operators.** Siehe
  Einschränkung 3 — ein `±`-Wert ist Mehraufwand pro Operator, kein Gratis-Nebenprodukt von
  `argmin`, und wird erst eingeführt, wo ein konkreter Anwendungsfall ihn wirklich braucht.
- **Eine Operator Registry als Softwareartefakt** (durchsuchbar, versioniert, von Tooling
  konsumiert). Dieses Dokument beschreibt das Format; ein tatsächliches Registry-Tool ist ein
  eigener Schritt, sobald mehr als eine Handvoll Operatoren das Format tatsächlich benutzen.

## Reihenfolge

1. ~~WORLD_LANGUAGE-Audit~~ — erledigt (siehe oben): nur die Begriffe geprüft, die heute bereits
   doppelt/anders heißen; `fields.moisture`/`surface_water` für den noch unimplementierten World
   Surface Graph festgelegt, bevor Code davon abhängt.
2. Bereits bestehende Bausteine (siehe „bestehende SHADED-Strukturen" oben: `single_view_room.py`s
   `vermessen`/`ransac_fluchtpunkt`, `window.SHADED.intrinsic`) als `OPERATOR`-Einträge
   formalisieren — nichts Neues erfinden, nur Input/Output/Units/Provenance/Validity/
   Forward/Inverse/Tests nachtragen.
3. Ein echter 2D↔3D-Roundtrip: ein Zustand verlässt die 2D-Seite, wird in 3D repräsentiert/
   angefasst, kommt semantisch identisch zurück (`forward(inverse(observed)) ≈ observed`, wie im
   `rectify_plane_v1`-Beispiel oben skizziert) — als konkreter Beweis, nicht nur als Diagramm.
4. Erst danach über eine gemeinsame State-Schicht oder Differenzierbarkeit nachdenken.
