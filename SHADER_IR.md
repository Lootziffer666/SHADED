# Shader IR — Donor Translation Layer

Companion to [`WORLD_ARCHITECTURE.md`](./WORLD_ARCHITECTURE.md), [`DONORS.md`](./DONORS.md).

## These

SHADED wird nicht von einer Shader-Toolchain umgeben. **SHADED ist der Übersetzer.**

Nicht:

```
GLSL-Donor → extern portieren → WGSL → in SHADED benutzen
```

Sondern:

```
DONOR (GLSL / HLSL / WGSL / MSL / CUDA-ish / whatever)
        ↓
  SHADED INGEST
        ↓
 semantische Übersetzung
        ↓
  interne Darstellung
        ↓
 Zielbackend / Runtime
```

Das ist die frühere Idee konsequent zu Ende gedacht: nicht Syntax portieren, sondern visuelle und physikalische Logik verstehen und neu ausdrücken.

## Die Pipeline

```
SOURCE LANGUAGE
     ↓
parse / normalize
     ↓
SHADED IR — meaning:
  sampling · spaces · math · lighting · texture access
  compute topology · buffers · barriers · workgroups
  derivatives · material intent
     ↓
backend emitter
     ↓
WGSL / GLSL / HLSL / MSL / SPIR-V-ish target
```

## Konsequenz fürs Donor-Mining

Der Donor muss nicht mehr „kompatibel" sein. Er muss nur verständlich genug sein, dass SHADED seine Bedeutung extrahieren kann. Die Frage „Ist das GLSL oder HLSL?" verliert massiv an Bedeutung. Wichtiger wird: „Welche Semantik steckt drin, und kann SHADED sie auf sein Zielmodell abbilden?"

Erlaubte Donor-Sprachen damit: Unity-Shader, Unreal/HLSL, GLSL-Demos, WebGL, Vulkan Compute, CUDA-Referenzen, MSL, Godot Shading Language, akademischer Pseudocode.

Vier Fragen pro Donor:

1. Ist die Logik wertvoll?
2. Können wir ihre Semantik rekonstruieren?
3. Haben wir die nötigen Runtime-Primitiven?
4. Ist die Lizenz sauber genug für unsere Art der Übernahme?

Ohne diese Schicht würden irgendwann ausgerechnet die besten Donors weggeworfen, nur weil jemand 2019 die „falsche" Shader-Sprache gewählt hat.

## Transpiler übersetzen Repräsentationen. SHADED übersetzt Verhalten.

Das ist der Unterschied zu klassischen Transpilern. SDL_shadercross übersetzt primär Shaderrepräsentationen (SPIRV/HLSL → DXBC, DXIL, …). SHADED soll idealerweise Verhalten übersetzen.

Beispiel (verifiziert an bgolus' World-Normal-from-Depth-Gist):

Donor: Unity Depth Texture + Kamera-Matrizen + ddx/ddy-artige Annahmen + HLSL-Syntax.

SHADED erkennt daraus:

```
INPUT:     depth buffer
OPERATION: neighbor depth sampling
SPACE:     view/world reconstruction
OUTPUT:    surface normal
```

Dann formuliert SHADED diese Bedeutung für das aktuelle Backend neu, statt Zeile für Zeile nach WGSL zu prügeln. Die Kommentar-Thread unter dem Gist zeigt, warum das der richtige Schnitt ist: Das eigentlich Schwierige sind die Spaces und die Handedness (Unitys -Z-View-Space, geflippte Projektion) — exakt eine IR-Achse. Ein Syntax-Transpiler übersetzt das fehlerfrei und falsch; ein semantischer Übersetzer versteht es.

## Die drei Beweisstücke

- **bgolus-Gist** (`a07ed656`) → Donor-Inhalt. Egal, dass Unity/HLSL-artig.
- **SDL_shadercross** → Beweisstück für Multi-Target-Übersetzung, aber nicht unser Fundament.
- **Kompute `convert_shaders.py`** → Beweisstück für automatisierte Shader-Ingestion, aber ebenfalls nicht das Ziel.

## fragcoor.xyz

Heute die Brücke (siehe DONORS.md). Zielzustand: ein Fähigkeitsbenchmark —

> „Kann SHADED das selbst?"

Wenn ja, wird Donor-Integration von Handwerk zu Infrastruktur.
