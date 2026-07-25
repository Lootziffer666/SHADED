---
name: shaded-reconstruction
description: Verbindliche Architektur für SHADED-Rekonstruktion aus Bildern, Depth, Height, Normals, Point Clouds, Meshes, SDFs und externen Providern. Nutzen vor Änderungen an Depth-Import, 2.5D, Point-Cloud-Ableitung, Materialkarten, Multi-View, Kontakt-Simulation oder World Surface Graph.
---

# SHADED-Rekonstruktion

Die vollständige Entscheidung steht in:

- [`docs/reconstruction-provider-und-world-surface-graph.md`](../../../docs/reconstruction-provider-und-world-surface-graph.md)
- [`docs/rendergraph-lastverteilung.md`](../../../docs/rendergraph-lastverteilung.md)

## Unverhandelbarer Scope

SHADED ist zugleich:

- Rekonstrukteur,
- Materiallabor,
- Weltgesetz- und Rendergraph-Runtime,
- Simulationsbrücke.

Fachliche Zugehörigkeit bedeutet nicht, dass alle Komponenten im selben Prozess laufen. Python-Modelle, Blender-Add-ons und native Solver werden hinter versionierten Provider- oder Worker-Verträgen angebunden.

## Begriffsebenen nicht vermischen

- **Depth:** Kameradistanz eines sichtbaren Bildpunkts.
- **Height:** Erhebung relativ zu Fläche oder Achse.
- **Heat / Death:** Weltzustandsfelder.
- **Normals:** lokale Oberflächenausrichtung.
- **Point Cloud / Mesh / SDF:** Geometrierepräsentationen.
- **Raymarching:** Render- und Abtasttechnik.

Depth Anything ersetzt keine dieser Ebenen. Es liefert bei fehlender Geometrie eine geschätzte Z-Information.

## Depth-Anything-Einordnung

Depth Anything ist ein Backend des neutralen Vertrags:

```text
MonocularDepthProvider
```

Es ist:

- Import-/Load-/Dirty-Arbeit, kein dauerhafter Runtime-Pass,
- eine räumliche Hypothese, keine gesicherte Architektur,
- ein Ausgangspunkt für Parallax, 2.5D, grobe Makronormalen und provisorische Point Clouds,
- niedriger priorisiert als gemessene, bekannte oder aus mehreren Ansichten rekonstruierte Geometrie.

Priorität:

```text
gemessen > multiview-rekonstruiert > engine-bekannt > geführt geschätzt > monokular geschätzt
```

Ein Provider darf höherwertige Daten nie unbemerkt überschreiben.

## Provider-Auswahl

```text
Echte Depth / Mesh / SDF vorhanden?
  → ExistingDepthProvider oder GeometryProvider

Verlässliche Point Cloud oder Multiview vorhanden?
  → PointCloudProvider / ReconstructionProvider

Nur RGB-Einzelbild?
  → MonocularDepthProvider

Video?
  → TemporalDepthProvider

RGB plus metrische Tiefenanker?
  → GuidedMetricDepthProvider
```

## SHADED-Bausteine

- `DepthAnything/Depth-Anything-V2` → Monocular Depth Provider
- `SUDO-AI-3D/zero123plus` → Multi-View Completion Worker
- `HugoTini/DeepBump` → Material Worker für Height, Normals und Curvature
- `Jonathan-J8/three-materials-compiled` → Material Inspector / Datenquelle
- `aiekick/Lumo` → Architektur-Donor für Graph Workspace
- `st-tech/ppf-contact-solver` → isolierter Contact/Deformation Worker

## World Surface Graph

Alle Provider schreiben in einen gemeinsamen kanonischen Graphen. Mindestens zu speichern:

```text
stable identity
source + provider + version
geometry: depth, scale, point cloud, mesh, sdf, height
surface: albedo, normals, roughness, curvature, material refs
shader: source, compiled form, defines, uniforms, passes
physics: collision, contacts, deformation, friction
fields: moisture, heat, pressure, damage, decay
uncertainty: measured, observed, reconstructed, inferred, generated, user-approved
```

Provider schreiben Eigenschaften. Der World-Law Scheduler entscheidet, welche Gesetze sie lesen. Provider dürfen keine eigenen unabhängigen Weltgesetze erfinden.

## Provenienzpflicht

Jedes erzeugte Artefakt braucht:

- Provider-ID und Version,
- Quellasset-Hash,
- Parameter und Auflösung,
- Koordinatensystem,
- relative oder metrische Skalierung,
- Konfidenz,
- Provenienzklasse,
- Nutzerkorrekturen,
- Cache-Key.

Zulässige Klassen:

```text
MEASURED
OBSERVED
RECONSTRUCTED
INFERRED
GENERATED
USER_APPROVED
```

Niedrige Konfidenz darf für sichtbare Parallax-Hypothesen genügen, aber nicht ungeprüft für harte Kollision oder persistente Architektur.

## Integrationsregeln

1. Keine zweite Materialwahrheit neben `classGrid` und kanonischen Materialmasken.
2. Geschätzte Depth überschreibt niemals echte Depth, Mesh, SDF oder hochwertige Point Cloud.
3. Relative und metrische Depth bleiben unterscheidbar.
4. Generierte Mehransichten werden nicht als beobachtet markiert.
5. GPL-, AGPL- oder unklare Komponenten werden als Worker, Referenz oder Datenquelle behandelt, bis die Lizenzentscheidung dokumentiert ist.
6. Rekonstruktion läuft nicht ungeplant im Frame-Loop.
7. Provider-Ausfall nutzt einen klaren Fallback und löscht keinen bestätigten Zustand.
8. Save/Reload erhält Provider, Version, Konfidenz, Provenienz und Nutzerentscheidung.

## Erster vertikaler Schnitt

```text
Bild importieren
→ MonocularDepthProvider
→ Depth Hypothesis mit INFERRED-Provenienz
→ bestehende Parallax-API
→ provisorische Point Cloud
→ Depth-Cluster-Debugansicht
→ Nutzer akzeptiert, korrigiert oder verwirft
→ Save/Reload
```

Noch nicht Teil dieses Schnitts:

- vollständiges Mesh,
- automatische Rückseiten,
- harte Kollision aus geschätzter Depth,
- Zero123++-Vollpipeline,
- Contact Solver,
- kompletter Lumo-artiger Node Editor.

## Vor jedem Rekonstruktions-Commit prüfen

- Welche Information ist gemessen, beobachtet, rekonstruiert oder generiert?
- Gibt es bereits eine höherwertige Quelle?
- Ist die Skalierung relativ oder metrisch?
- Welche kanonischen Graphfelder werden geschrieben?
- Welche World Laws dürfen das Ergebnis lesen?
- Ist die Arbeit gecacht und Dirty-gesteuert?
- Welche Lizenzgrenze gilt?
- Welche Test-Fixture beweist Vorrang, Fallback, Persistenz und Nicht-Überschreiben?