# Physics

Companion to [`WORLD_ARCHITECTURE.md`](./WORLD_ARCHITECTURE.md), [`WORLD_KERNEL.md`](./WORLD_KERNEL.md), [`HYDROLOGY.md`](./HYDROLOGY.md), [`DONORS.md`](./DONORS.md).

## These

„Havok macht Bewegung, SHADED macht Welt" war zu grob. Wenn SHADED die Weltgesetze kontrollieren soll, kann die mechanische Realität nicht als fremde Blackbox danebenstehen. SHADED braucht einen eigenen Physics Layer:

```
SHADED
├─ PHYSICS        rigid bodies · collision/contacts · constraints/joints
│                 friction/restitution · raycasts/shape queries
│                 character/object movement · sleeping/broadphase/spatial
├─ MATTER         water · soil · snow/ice · particles · material states
├─ WORLD PROCESSES weather · heat/light · erosion · hydrology · fire
└─ LIFE           vegetation · roots · habitats · fauna
```

Der wichtige Punkt: Diese Schichten dürfen nicht nebeneinander existieren.

## Der Fels-Test

Ein umfallender Fels ist Rigid-Body-Physik. Aber danach verdrängt er Wasser, staut einen Bach, verdichtet Boden, beschädigt Wurzeln, erzeugt Schatten, verändert Feuchte, wird eventuell mit Sediment umspült und schafft einen neuen Fischstand. Wenn die Rigid-Body-Engine davon nichts weiß und SHADED nur anschließend ein paar Events bekommt, entsteht wieder genau die Trennung, die überall sonst beseitigt wurde.

Also:

```
CONTACT → SHADED WORLD STATE → mechanische + materielle + ökologische Konsequenzen
```

Ein Kontakt ist bei SHADED nicht `bodyA / bodyB / normal / penetration / impulse` und Schluss, sondern geht direkt in die Welt über:

```
CONTACT → mechanical impulse → material stress → soil compaction
        → vegetation damage → particle displacement → heat / fracture / erosion
```

Das ist der Teil, den kein fertiges Physics-SDK schenkt.

## Selbst bauen ≠ jede Kollisionsroutine neu erfinden

Der SHADED-Wert liegt nicht darin, stolz einen eigenen GJK/EPA geschrieben zu haben. Er liegt darin, dass **Kollision, Wasser, Boden, Vegetation und Habitat dieselbe Wahrheit verändern**. Vorhandene offene Physics-Donors sind Lehrmaterial und gegebenenfalls Komponenten. Particles4All passt dadurch sogar noch besser:

```
Rigid Body ↕ Particles4All ↕ Water / granular matter ↕ World Fields
```

Der Stein fällt nicht in einen Wasser-Shader. Er trifft Materie.

## Neue Donor-Kategorie: Literature-derived Core

Physik ist der angenehmste Teil von SHADED, weil dort nicht auf „jemand hat zufällig das perfekte Repo gebaut" angewiesen sind. Die Verfahren sind formal beschrieben, jahrzehntelang untersucht und vergleichbar:

```
Lehrbuch / Paper → mathematisches Verfahren → SHADED-eigene Implementierung → gemeinsamer World State
```

Damit gibt es zwei Donor-Kategorien:

- **Implementation-derived Donors** — für Weltverhalten (Vegetation, Habitate, Wasser-Optik), wo enorme Mengen Designwissen und überraschende Kopplungen in Repos stecken.
- **Literature-derived Core** — für etablierte Mechanik, wo der direkte Weg zur Quelle führt.

Ein Repo vererbt Architekturentscheidungen, Datenstrukturen, API-Design und Sprache des Autors. Ein Paper vererbt im Wesentlichen nur die Idee und ihre Gleichungen — fast der ideale Donor, und sprachagnostisch:

```
Algorithmus → SHADED IR / Core Semantics → CPU / WASM / GPU Compute / native
```

Lizenztechnisch angenehm: veröffentlichte Verfahren studieren, eigene Implementierung schreiben; Besonderheiten (Patente, Lizenzen) werden je Paper geprüft.

## Der Literaturkern

| Baustein | Linie |
|---|---|
| Collision | Christer Ericson, *Real-Time Collision Detection* |
| Rigid-body dynamics & constraints | Baraff/Witkin + moderne iterative Constraint-Solver-Literatur |
| Game-orientierte Contact Solver | Erin Catto, *Sequential Impulses* |
| Verformbares/partikelbasiertes Material | Müller et al., *Position Based Dynamics* |
| Stabilere Constraints | Macklin et al., *XPBD* |
| Fluid-/Unified-Particle-Interaction | die PBF/PBD-Linie — an die Particles4All ohnehin anschließt |

Nach Bedarf später: granular matter, fracture, soil mechanics, snow, cloth, vegetation mechanics, multiphase coupling. **Nicht vorher.**

## Umfang

Kein gigantischer „Physics Engine Rewrite"-Epic. Für den Anfang reicht, was die Welt wirklich benötigt:

**Rigid Bodies + Contacts + Constraints + Queries + Terrain Collision + Material Response.**

Der Rest kommt nur, wenn SHADED ihn braucht: Für den nächsten Weltprozess genau diese physikalische Fähigkeit, sauber implementiert. Havok, PhysX & Co. sind ab jetzt keine „Nachbarn" von SHADED, sondern die Donor-/Benchmark-Klasse für einen unteren Teil von SHADED.
