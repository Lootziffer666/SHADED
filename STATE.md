# State — Immutable Source, Persistent State, History

Companion to [`WORLD_ARCHITECTURE.md`](./WORLD_ARCHITECTURE.md), [`WORLD_KERNEL.md`](./WORLD_KERNEL.md), [`MATERIALS.md`](./MATERIALS.md).

## Die Antwort auf das alte Paradox

Nicht: „SHADED verändert das Objekt, ohne es zu verändern."

Sondern:

> **Das Original ist unveränderlich. Die Welt verändert den Zustand, in dem dieses Original existiert.**

```
ORIGINAL ASSET (house.glb, hash: 8f3…, IMMUTABLE)
        │
        ▼
SHADED WORLD STATE
  object: 8f3…
  ├─ wetness: 0.74
  ├─ scorch: 0.18
  ├─ structuralDamage: …
  ├─ mossCoverage: …
  ├─ sediment: …
  ├─ displacedParts: …
  ├─ temperature: …
  └─ history: […]
        │
        ▼
CURRENT WORLD REPRESENTATION
```

`house.glb` bleibt byteidentisch. Trotzdem kann das Haus zehn Jahre später teilweise abgebrannt, überwuchert, nass, gerissen, verschlammt, eingestürzt, repariert oder unterspült sein. „Der gegenwärtige Zustand des Hauses" war nie dasselbe wie „die Quelldatei des Hauses".

## SOURCE + WORLD HISTORY = CURRENT STATE

Das Original wird zur unveränderlichen Referenzwahrheit. SHADED führt darüber eine zweite Wahrheit: *Was ist diesem Ding seit seinem Eintritt in diese Welt passiert?*

- Wasser verändert nicht die Texturdatei. Es schreibt `surface.moisture += …`
- Feuer ersetzt nicht das Mesh. Es schreibt `material.char += …`, `structuralIntegrity -= …`
- Wurzeln editieren nicht das Terrain-Original. Sie verändern `soil.porosity`, `soil.cohesion`, `soil.displacement`
- Muss sich Geometrie dauerhaft ändern, entsteht eine **persistente geometrische Abweichung**, keine Mutation: `original geometry + geometry delta = current geometry`

## Drei getrennte Dinge

1. **Immutable Source** — was ursprünglich geliefert wurde: `assetHash`, `sourceGeometry`, `sourceMaterials`, `sourceProperties`
2. **Persistent World State** — was heute gilt: `objectState`, `materialState`, `environmentState`, `geometryDelta`, `relationships`
3. **History** — wie es dazu kam: `rain`, `impact`, `fire`, `growth`, `erosion`, `repair`, …

History wird nicht ewig vollständig aufgehoben: regelmäßig Snapshots erzeugen, alte Events verdichten. Logisch gilt immer: **ORIGINAL NEVER CHANGES.**

Persistenz wird nie im Original gespeichert. Das Original ist nicht die Welt — es ist nur einer ihrer Inputs.

## Von der Forderung zur Folgerung

Das ist keine Sonderlösung mehr, es ergibt sich zwangsläufig aus der Architektur:

- Reconstruction braucht Provenienz
- World Rules brauchen persistenten Zustand
- Record braucht Geschichte (siehe WORLD_KERNEL.md)
- Donor-Systeme dürfen keine Quelldateien zerstören
- Editor und Runtime brauchen getrennten Zustand (siehe STUDIO.md)
- Objekte müssen durch Zeit hindurch dieselbe Identität behalten

Alle Wege führen zu *immutable source + persistent state + history*. Damals war es eine Designanforderung. Heute ist es eine Folgerung.
