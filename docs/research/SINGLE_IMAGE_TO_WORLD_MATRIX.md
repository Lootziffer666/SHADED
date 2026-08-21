# Einzelbild-zu-Welt Generierung: Generative Splat-Verfahren

> Analyse aller Verfahren, die aus Einzelbildern explorierbare 3D-Welten mit
> Gaussian Splats erzeugen — relevant für Kinderbilder, Urlaubsfotos, generierte Welten.

## Kategorie 1: Single-Image zu explorierbarer Welt

| Verfahren | Input | Output | Skalierung | Reife | Ressourcen |
|---|---|---|---|---|---|
| **WonderJourney** | Image/Text | Punktwolken-Sequenz | relativ | aufstrebend | mittel-hoch |
| **WonderWorld** | Single Image | 3DGS-Szenen-Set | relativ | aufstrebend | mittel |
| **LucidDreamer** | Text/RGB/RGBD | 3DGS + Mesh | relativ | etabliert | mittel |
| **Marble (World Labs)** | 1-4 Images | explorierbare 3DGS-Welt | relativ | etabliert | mittel |
| **Text2Room** | Text | texturiertes Mesh | relativ | etabliert | mittel |

## Kategorie 2: Feed-forward Einzelbild-Gaussian-Splats

Diese Verfahren sagen Gaussian-Parameter direkt aus einem Bild vorher — **ohne
Multi-View-Capture oder Per-Szene-Optimierung**. Ideal für "schwache Hardware".

| Verfahren | Geschwindigkeit | Qualität | Skalierung | Hardware-Tier |
|---|---|---|---|---|
| **Splatter Image** | Ultra-schnell (1 Forward-Pass) | niedrig | relativ | Bottom (schwach) |
| **DreamGaussian** | 2 Min/Bild (GPU) | mittel | relativ | Middle |
| **TripoSplat** | schnell | mittel | relativ | Middle (MIT) |
| **InfiniSplat** | mittel | hoch | relativ | Top (große Blickwinkel) |
| **DiffSplat** | 1-2 Sekunden | mittel-hoch | relativ | Middle-Top |
| **DiffusionGS** | 1-2 Minuten | hoch | relativ | Top |
| **Complete Gaussian Splats** | 1-2 Minuten | hoch (verdeckt) | relativ | Top |

## Kategorie 3: Video-zu-Raum

| Verfahren | Input | Besonderheit | Hardware |
|---|---|---|---|
| **Lyra** | Video (monokular) | Self-Distillation aus Video-Diffusion | High-End (4090+) |

## Portabilität: Top-down/Bottom-up Prinzip

> "exakt derselbe Code läuft auf jedem System im Rahmen seiner Möglichkeiten"

### Chunk-LOD-Hierarchie (Cesium 3D Tiles Prinzip)

Jedes System definiert dieselbe hierarchische Datenstruktur (grobe Schicht oben,
feine Details unten) und steuert nur die Abstiefrungs-Tiefe in den Baum ab:

- **Bottom-Tier** (4GB RAM, CPU-only): Splatter Image (1 Forward-Pass), 1 Chunk-Ebene
- **Middle-Tier** (16GB RAM, RTX 3060): DreamGaussian + DiffusionGS, 2 Chunk-Ebenen
- **Top-Tier** (48GB RAM, RTX 6090): Complete Gaussian Splats + Lyra, 3-4 Chunk-Ebenen

Alle erzeugen dasselbe Zielformat (3DGS-Datei) — nur mit unterschiedlicher Detailtiefe.

## Ablationsplan: Qualitäts-vs-Ressourcen-Messung

**Experiment:** `exp-WORLDGEN-001 — Splatter Image vs DiffusionGS/Complete Gaussian Splats`

Messgröße: Identische Testbilder → Qualität der erzeugten 3DGS-Datei
- Splatter Image: minimal, 1 Forward-Pass
- DiffusionGS: iterativ, Diffusion
- Complete Gaussian Splats: Diffusion + Verdeckungs-Rekonstruktion

Ergebnis: Direkter Qualitätsgewinn der Diffusion gegenüber dem Forward-Pass-Ansatz
messen — sofort entscheidbar, ob sich Diffusion für schwache Hardware lohnt.
