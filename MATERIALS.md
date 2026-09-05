# Materials — Geometry-agnostic Material Contracts

Companion to [`WORLD_ARCHITECTURE.md`](./WORLD_ARCHITECTURE.md), [`SHADER_IR.md`](./SHADER_IR.md), [`STATE.md`](./STATE.md), [`WORLD_KERNEL.md`](./WORLD_KERNEL.md).

## These

Du brauchst kein „SnowFlow-kompatibles Mesh". Du brauchst überhaupt kein kompatibles Mesh.

```
BELIEBIGES MODELL (ultrasimpel / CAD / Scan / Game Asset / Rekonstruktion / Donor-Mesh)
        ↓
räumlich erfassen
        ↓
Material / Stoff erkennen
        ↓
SHADED-Vertrag zuweisen
        ↓
Weltgesetze wirken
```

Das SnowFlow-Bodenmesh war bereits der Beweis: Mesh mit Voxeln erfassen → eigene Oberfläche ableiten → Original wegwerfen. **SHADED muss die Repräsentation eines Donors nicht respektieren. Es muss dessen Bedeutung erfassen.** SnowFlow sagte „das hier ist Boden" — SHADED braucht danach nicht SnowFlows Dreiecke, sondern: hier befindet sich Materie, diese Materie ist Boden, sie besitzt diese räumliche Ausdehnung.

## Komplexität ändert keine Weltregeln

Ein primitives Haus (12.000 Polygone) und ein photogrammetrisches Haus (14 Millionen Polygone) enthalten semantisch dasselbe: `roof.tile`, `wall.brick`, `frame.wood`, `window.glass`, `gutter.metal`, `soil`. Jedes relevante Oberflächenelement bekommt denselben Vertrag:

```
MATERIAL: WOOD
  density · porosity · thermalConductivity · heatCapacity
  ignitionTemperature · moistureCapacity · permeability
  structuralStrength · friction · roughness
STATE:
  temperature · moisture · char · damage · biologicalGrowth · stress
```

Ein Holzpolygon mit drei Vertices und ein Holzbereich aus 800.000 Dreiecken sind für die Welt: Holz.

## Referenz statt Wiederholung

Nicht das Polygon besitzt den Vertrag — das Polygon trägt nur eine Referenz:

```
POLYGON / VOXEL / SURFEL / POINT → material_instance_id → SHADED MATERIAL CONTRACT
```

Millionen geometrische Elemente benutzen dieselben Materialgesetze, während lokale Zustände räumlich variieren: derselbe Holzbalken kann gleichzeitig oben trocken, unten feucht, links brennend und rechts intakt sein.

## Geometrieagnostisch

```
LANGUAGE AGNOSTIC   GLSL/HLSL/WGSL/… → Bedeutung        (SHADER_IR.md)
GEOMETRY AGNOSTIC   Mesh/Voxel/Point Cloud/… → räumliche Bedeutung
RENDERER AGNOSTIC   Darstellung → nur Repräsentation
                         ↓
                 MATERIAL SEMANTICS → WORLD KERNEL
```

SHADED interessiert sich nicht dafür, wie etwas beschrieben wurde — Shader-Syntax egal, Polygonanzahl egal, Donor-Engine egal, Originalrenderer egal. Entscheidend: **Wo ist Materie? Was ist es für Materie? In welchem Zustand befindet sie sich?**

## Materialerkennung als kritisches Gate

Wenn SHADED Holz mit Stein verwechselt, ist praktisch alles danach korrekt gerechnet und trotzdem falsch: Feuer greift nicht richtig, Wasser wird falsch aufgenommen, Wärmeleitung stimmt nicht, Bruchverhalten stimmt nicht, Bewuchs stimmt nicht. Material Classification ist einer der wichtigsten Teile des Ingest-Pfads — mit Confidence:

```
material:
  class: wood
  subtype: oak-ish
  confidence: 0.82
known:     combustible: true, porous: true
uncertain: exact density, exact moisture capacity
```

Dann kann SHADED konservativ reagieren, wo es nichts weiß — OBSERVED / GENERATED / UNKNOWN, diesmal auf Materialebene.

## Mehrere Evidenzen, eine Hypothese

Sobald Materialdaten nicht nur Rendering-Metadaten sind, sondern an Weltlogik gekoppelt werden, wird die Erkennung massiv besser:

```
VISUAL    albedo / roughness / normal / height   (z. B. Poly Haven, CC0)
    +
SEMANTIC  wood / stone / metal / soil / fabric …
    +
WORLD BEHAVIOR  porosity · thermal response · water absorption
                combustibility · density-ish · weathering · biological affinity
    ↓
MATERIAL HYPOTHESIS
```

Ein braunes Material ist visuell Holz, rostiges Metall, Erde, Leder oder Stein — Maps plus Weltreaktionen schrumpfen den Suchraum drastisch. Und die Welt kann die Erkennung später selbst überprüfen: Vermutet SHADED `wood 0.62 / stone 0.28` und das Material nimmt kaum Wasser auf, leitet Wärme sehr schnell, verkohlt nicht und bricht anders, arbeitet der Zustand gegen die Hypothese:

> erkennen → Weltvertrag anwenden → Evidenz sammeln → Klassifikation nachschärfen

## Der Satz

> **Geometry is evidence. Material is meaning. State is reality.**

Original geometry → evidence. Material contract → meaning. World state → current reality.

Persistenz schließt sich an (siehe STATE.md): Das Original bleibt unangetastet; SHADED extrahiert räumliche Repräsentation + Materialzuordnung + Weltzustands-Overlays. Wird dasselbe Haus morgen durch eine zehnmal detailliertere Version ersetzt, gelten bei stimmen­der räumlich-materieller Zuordnung dieselben Weltregeln.
