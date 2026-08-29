# SHADED-Dokumentation

## Architektur

- [`rendergraph-lastverteilung.md`](./rendergraph-lastverteilung.md) – Rendergraph, Scheduler und Lastverteilung
- [`reconstruction-provider-und-world-surface-graph.md`](./reconstruction-provider-und-world-surface-graph.md) – Reconstruction Provider und kanonischer World Surface Graph
- [`einzelbild-raeumlichkeit-providerlandschaft.md`](./einzelbild-raeumlichkeit-providerlandschaft.md) – aktuelle Modellfamilien für Räumlichkeit aus Einzelbildern
- [`sdf-geometrie-stand-2026.md`](./sdf-geometrie-stand-2026.md) – SDF, UDF, TSDF, differenzierbare Meshes und Gaussian-Hybride
- [`neuronale-materialien-svbrdf-pbr.md`](./neuronale-materialien-svbrdf-pbr.md) – Albedo, Intrinsic Decomposition, SVBRDF-Kanäle und OpenPBR-Vokabular
- [`raeumliche-algorithmen-arsenal.md`](./raeumliche-algorithmen-arsenal.md) – Einordnung klassischer räumlicher Algorithmen, Dykstra-Constraint-Projektion auf Felder
- [`raumrekonstruktion-dykstra-dijkstra.md`](./raumrekonstruktion-dykstra-dijkstra.md) – Ebenenkandidaten, Raumhülle per Constraint-Projektion, Begehbarkeit und Raumgraph
- [`research-radar-themen.md`](./research-radar-themen.md) – Prüfraster für größere Forschungs- und Technologieklassen

## Style-Schicht (Vertical Slice, Beweisfeld)

- [`STYLE_DISCOVERY.md`](./STYLE_DISCOVERY.md) – Style-Discovery-Sandbox
  (`runtime/style/` + `sandbox/`): `WorldState → Solver → MaterialResponse →
  StyleProfile → RenderBudget → Final Render`. Renderer-unabhängiger Kern in
  reinem ESM, dünne austauschbare WebGL2/SDF-Schicht. **`runtime/shaded-engine.mjs`
  bleibt unberührt** — die Sandbox ist Beweisfeld, keine dauerhafte
  Parallelarchitektur.
- [`research/STYLE_TECHNIQUE_REGISTRY.md`](./research/STYLE_TECHNIQUE_REGISTRY.md)
  – Donor-/Provenance-Tabelle für die Style-Primitiven (Lizenzklassen A–D).

## Produkt-Einordnung

- [`shaded-faehigkeiten.md`](./shaded-faehigkeiten.md) – Produkt-Einordnung: SHADED als materialbewusste 2D-Weltsimulation statt reine Shader-Effektliste

## Bestehende Fachgrundlagen

- [`shader-referenzmatrix.md`](./shader-referenzmatrix.md)
- [`bildkanon.md`](./bildkanon.md)
