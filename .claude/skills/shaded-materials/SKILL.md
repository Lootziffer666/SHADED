---
name: shaded-materials
description: Verbindliche Architektur für SHADED-Materialien – Albedo, Intrinsic Decomposition, SVBRDF, Rauheit, Metallizität, Normalen, Materialzuweisung, Relighting und OpenPBR-Vokabular. Vor jeder Änderung an Materialkanälen, Materialprovidern, Beleuchtungstrennung oder dem surface-Zweig des World Surface Graph nutzen.
---

# SHADED-Materialien

Die vollständige Entscheidung steht in:

- [`docs/neuronale-materialien-svbrdf-pbr.md`](../../../docs/neuronale-materialien-svbrdf-pbr.md)
- [`docs/reconstruction-provider-und-world-surface-graph.md`](../../../docs/reconstruction-provider-und-world-surface-graph.md)

## Ausgangsbefund

- Die Runtime besitzt **keine** Materialkanäle: kein Albedo, keine Rauheit, keine Metallizität, keine Normalen, keine BRDF-Auswertung.
- Das Quellbild enthält **eingebackenes Licht**. Jedes Weltgesetz multipliziert heute auf diese Beleuchtung → Doppelbeschattung.
- `index.html` läuft auf **WebGL 1** mit **8 von 8** garantierten Texture Units belegt (0 scene, 1 maskA, 2 maskB, 3 phys, 4 emis, 5 trail, 6 depth, 7 zone). Kein freier Sampler, keine MRT.
- DeepBump ist als **einziger** Material Worker herabgestuft auf `MesoSurfaceProvider`.

## Ebenen nicht vermischen

- **Beobachtete Farbe:** was im Bild steht, inklusive Licht.
- **Albedo:** Oberflächenfarbe ohne Beleuchtung.
- **Shading:** die im Bild enthaltene Beleuchtung.
- **BRDF-Parameter:** Rauheit, Metallizität, Specular/IOR, Transmission.
- **Meso-Geometrie:** Normalen, Height, Curvature, AO.
- **Materialklasse:** SHADEDs `classGrid` – Semantik, kein Reflexionsmodell.
- **Weltzustand:** `wet`, `decay`, `temperature` – moduliert Kanäle, ist selbst keiner.

## Providerfamilie

```text
MaterialProviderRegistry
├─ IntrinsicDecompositionProvider   Albedo · Shading · Lichtschätzung
├─ DelightProvider                  eingebackenes Licht entfernen
├─ MesoSurfaceProvider              Normalen · Height · Curvature · AO
├─ ChainedSVBRDFProvider            konsistenter Kanalsatz in Renderreihenfolge
├─ MaterialAssignmentProvider       Region → Materialkonzept → Kanalsatz
├─ MaterialSynthesisProvider        generierte kachelbare Materialien
└─ MaterialInspector                kompilierte Shader, Uniforms, Varianten
```

Anwendbar auf SHADED sind vor allem **Intrinsic Decomposition** (arbeitet auf Szenen) und **Materialzuweisung/-synthese**. Klassisches SVBRDF-Capture (flache Materialprobe, blitzbeleuchtet), inverse Rendering mit vielen Ansichten und relightable Gaussians lösen ein anderes Problem und sind keine veraltete SHADED-Entscheidung.

## Kanalvertrag

Ein Kanal ohne Farbraum, Wertebereich und Provenienz ist ungültig.

```text
observedColor  sRGB    Pflicht
albedo         linear  Fallback = observedColor
shading        linear  Fallback = 1.0
roughness      linear  Fallback = Klassen-Default
metallic       linear  Fallback = 0.0
normal         tangent Fallback = (0,0,1)
height + scaleMeters · ao · curvature · emissive · transmission · sheen · anisotropy
```

Pflichtmetadaten je Kanal: `provider`, `providerVersion`, `channelSetId`, `provenance`, `confidence`, `resolution`, `colorSpace`.

Gemeinsam erzeugte Kanäle teilen eine `channelSetId`. Gemischte Sätze werden als `mixed = true` mit Herkunft je Kanal markiert – SHADED löst Modellkonflikte nicht automatisch, verschweigt sie aber nie.

## Harte Regeln (Invariante 2)

1. Provider erzeugen **Parameter**, niemals Klassen.
2. `classGrid` und `getMaterialTypeAt()` stammen weiterhin nur aus `analyze()`.
3. Richtung ist einseitig: Klasse darf Priors für Kanäle liefern, nie umgekehrt.
4. Marker-Overlays korrigieren Klassen, nicht BRDF-Parameter.
5. Weltzustände werden nicht in gespeicherte Kanäle eingebrannt.
6. Providerausfall → `identity-albedo` (heutiger Zustand), niemals Datenverlust.
7. Materialarbeit läuft bei Import/Dirty, nie im Frame-Loop.

## Rendermodell

- **OpenPBR/MaterialX = Vokabular und Exportsprache.** Kanalnamen, Bereiche, Semantik übernehmen.
- **Keine MaterialX-Laufzeit-Codegen.** Das würde eine zweite Shader-Erzeugung neben den SHADED-Pässen etablieren und Invariante 1 gegen eine Toolchain stellen.
- MaterialX kann seit 1.39.4 (2025-09-15) WGSL erzeugen; relevant erst nach einer WebGPU-Entscheidung.

## Kontextentscheidung

```text
A  Kanalpackung in WebGL 1   → Notlösung, reicht für den ersten Schnitt
B  WebGL 2                   → empfohlener Zielkontext (MRT, Sampler, Float-Targets)
C  WebGPU/WGSL               → erst nach B, eigener Beweisritt
```

Kein neuer Materialkanal ohne dokumentierte Texture-Unit-Belegung.

## Erster vertikaler Schnitt

```text
Import → IntrinsicDecompositionProvider (Worker)
→ albedo + shading, Provenienz INFERRED
→ Quellbild und Unit 0 unangetastet
→ albedo in freien RGBA-Kanal packen
→ GENAU EIN Weltgesetz umstellen: Nässe liest albedo statt Quellfarbe
→ A/B-Schalter im Editor
→ Verify beider Zustände, Klassenzählung identisch
→ Nutzer akzeptiert / verwirft / bestätigt (USER_APPROVED)
```

Nicht Teil davon: Rauheit, Metallizität, Materialbibliothek, MaterialX-Runtime, WebGL-2-Portierung, Relighting, Normal-Map-Rendering (es gibt keinen Licht-Pass).

## Vor jedem Material-Commit prüfen

- Ist die Größe beobachtete Farbe oder Albedo?
- Welcher Farbraum, welcher Wertebereich?
- Welche `channelSetId`, gemischt oder aus einem Lauf?
- Wird eine Klasse geschrieben? (Dann abbrechen.)
- Wird ein Weltzustand eingebrannt? (Dann abbrechen.)
- Welche Texture Unit, und was wurde dafür verdrängt?
- Läuft die Arbeit gecacht und Dirty-gesteuert?
- Lizenz von Code **und** Checkpoint dokumentiert?
- Welche Verify-Fixture beweist Fallback, Persistenz und unveränderte Klassenzählung?
