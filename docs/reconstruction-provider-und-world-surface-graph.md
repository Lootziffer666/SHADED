# SHADED – Reconstruction Provider und World Surface Graph

**Status:** verbindliche Ergänzung zu [`rendergraph-lastverteilung.md`](./rendergraph-lastverteilung.md)  
**Stand:** 2026-07-26  
**Folgt auf:** PR #36 – Rendergraph und Lastverteilung

> SHADED ist nicht nur Shader-Laufzeit.  
> SHADED rekonstruiert aus unvollständigen visuellen Informationen eine belastbare, veränderbare Welt und verwaltet, welche sichtbaren Regeln darin gelten.

---

## 1. Scope-Korrektur

SHADED besitzt künftig vier zusammengehörige Verantwortungsbereiche:

1. **Rekonstruktion**  
   Aus Bild, Textur, Video, Punktwolke oder vorhandenem Modell räumliche Hypothesen ableiten.

2. **Materiallabor**  
   Oberflächen in Albedo, Tiefe, Höhe, Normalen, Krümmung, Rauheit und Materialklassen zerlegen.

3. **Weltgesetz- und Rendergraph-Runtime**  
   Sichtbare und mechanisch relevante Zustände als dynamische Pass- und Feldkette ausführen.

4. **Simulationsbrücke**  
   Kontakt, Verformung, Partikel, SDFs und andere schwere Verfahren über isolierte Worker oder Backends anbinden.

Diese Bereiche sind fachlich Teil desselben Systems. Sie müssen jedoch nicht im selben Prozess und nicht im selben Technologie-Stack laufen.

```text
SHADED
├─ Reconstruction Providers
├─ Material Providers
├─ World Surface Graph
├─ World-Law Scheduler
├─ Rendergraph
├─ Simulation Workers
└─ Runtime / Editor / Export
```

**Systemzugehörigkeit ist nicht Prozesszugehörigkeit.** Ein Python-Modell, Blender-Add-on oder nativer Solver kann SHADED gehören, obwohl es als separater Worker ausgeführt wird.

---

## 2. Messgröße, Repräsentation und Rendertechnik nicht vermischen

Mehrere heute vorhandene oder geplante Begriffe liegen auf unterschiedlichen Ebenen.

| Begriff | Kategorie | Aussage |
|---|---|---|
| **Depth** | Messgröße / räumliches Signal | Abstand eines sichtbaren Bildpunkts von der Kamera |
| **Height** | Messgröße / Oberflächensignal | Erhebung relativ zu einer Grundfläche oder entlang einer Referenzachse |
| **Heat** | Weltzustandsfeld | Temperatur oder thermischer Zustand |
| **Death** | Weltzustandsfeld | Tod, Verfall, Kontamination oder biologischer Zerfall |
| **Normals** | Oberflächenrepräsentation | lokale Ausrichtung einer Oberfläche |
| **Point Cloud** | Geometrierepräsentation | Menge räumlicher Punkte, optional mit Farbe und Attributen |
| **Mesh** | Geometrierepräsentation | Punkte plus Kanten und Flächen |
| **SDF** | implizite Geometrierepräsentation | signierter Abstand zu einer Oberfläche |
| **Raymarching** | Render-/Abtasttechnik | tastet ein vorhandenes Feld oder SDF entlang eines Strahls ab |

Daraus folgt:

- Depth Anything konkurriert nicht direkt mit Height, Heat, Death, Normals, Point Clouds oder Raymarching.
- Es liefert ein Eingangssignal, aus dem einige Repräsentationen näherungsweise abgeleitet werden können.
- Weltzustandsfelder wie Heat oder Death beschreiben, **was mit der Welt geschieht**.
- Depth beschreibt, **wie die sichtbare Szene räumlich gestaffelt sein könnte**.
- Raymarching beschreibt, **wie vorhandene räumliche Information abgefragt oder gerendert wird**.

---

## 3. Was Depth Anything wirklich liefert

Depth Anything V2 ist ein **Monocular Depth Provider**.

Eingabe:

```text
gewöhnliches RGB-Einzelbild
```

Ausgabe:

```text
pro Bildpixel ein geschätzter Tiefenwert
```

Die Standardausgabe ist hauptsächlich **relative Tiefe**:

```text
Vordergrundfigur liegt vor Tisch
Tisch liegt vor Wand
Wand liegt vor Landschaft
```

Sie ist nicht automatisch eine korrekte metrische Vermessung in Metern und nicht automatisch echte Geometrie.

### 3.1 Das Alleinstellungsmerkmal

Depth Anything erzeugt den ersten brauchbaren Z-Hinweis, obwohl keinerlei Geometrie, Sensor-Depth, Stereoaufnahme oder Engine-Depth vorhanden ist.

> Sein Wert ist nicht „beste fertige 3D-Welt“, sondern „räumliche Arbeitsfähigkeit aus einem einzelnen flachen Bild“.

### 3.2 Depth gegenüber Height

**Depth fragt:**

```text
Wie weit liegt dieser sichtbare Punkt von der Kamera entfernt?
```

**Height fragt:**

```text
Wie hoch oder tief liegt dieser Punkt relativ zu einer Referenzfläche oder Achse?
```

Eine Heightmap eignet sich für:

- Gelände,
- Relief,
- Fugen,
- Poren,
- Stoffstruktur,
- Displacement einer bekannten Oberfläche.

Eine Depthmap kann eine ganze Szene staffeln:

- Ast im Vordergrund,
- Figur,
- Gebäude,
- Berg,
- Himmel.

**Depth ist Szenenstaffelung. Height ist Oberflächenrelief.**

### 3.3 Depth gegenüber Normals

Normals sagen, wohin eine Oberfläche zeigt. Sie sagen nicht zuverlässig, wie weit sie von der Kamera entfernt ist.

Aus einer Depthmap lassen sich durch lokale Gradienten grobe Makronormalen ableiten:

```text
Depth
  └─ Tiefengradient
       └─ geschätzte Makronormalen
```

Für feine Oberflächendetails bleiben Materialverfahren wie DeepBump geeigneter.

```text
Depth Anything → Makroform / Szenenstaffelung
DeepBump       → Mikroform / Oberflächenrelief
```

### 3.4 Depth gegenüber Point Cloud

Eine Point Cloud ist ein Ergebnisformat. Depth Anything ist ein Informationsgewinner.

Mit Kameraintrinsics kann ein Tiefenbild zurückprojiziert werden:

```text
RGB
+ Depth
+ Kameraannahmen
────────────────
= provisorische farbige Point Cloud
```

Grenzen dieser Point Cloud:

- nur sichtbare Flächen,
- keine Rückseiten,
- keine belastbare Topologie,
- unsichere absolute Skalierung,
- Fehler an Objektgrenzen,
- schwierige Spiegelungen, Transparenz und stilisierte Darstellungen,
- mögliche „Pappkulissen“-Geometrie.

Gemessene oder aus mehreren Ansichten rekonstruierte Punktwolken haben Vorrang.

### 3.5 Depth gegenüber Raymarching

Depth Anything fragt:

```text
Wie könnte die Tiefe dieses Bildes aussehen, obwohl kein räumliches Feld existiert?
```

Raymarching fragt:

```text
Wo trifft ein Strahl auf ein bereits vorhandenes räumliches Feld oder SDF?
```

Mögliche Reihenfolge:

```text
Bild
  ↓
Monocular Depth Provider
  ↓
Depth Hypothesis
  ↓
Point Cloud / Mesh / SDF
  ↓
Raymarching oder klassisches Rendering
```

Depth Anything sitzt vor dem Raymarcher. Es raymarcht nicht selbst.

---

## 4. Der korrekte Platz von Depth Anything

Depth Anything ist:

- kein Weltgesetz,
- kein dauerhafter Runtime-Pass,
- kein Ersatz für vorhandene Geometrie,
- kein verlässlicher Architektur-Generator,
- kein universelles Depth-Backend für jedes Medium.

Es ist ein austauschbares Backend unter einem neutralen Provider-Vertrag:

```text
Reconstruction Providers
├─ ExistingDepthProvider
│  └─ Engine-Depth, EXR, Sensor, Renderpass
├─ MonocularDepthProvider
│  └─ Depth Anything V2 oder Nachfolger
├─ GuidedMetricDepthProvider
│  └─ RGB + grobe metrische Tiefenanker
├─ TemporalDepthProvider
│  └─ zeitlich konsistente Video-Depth
├─ PointCloudProvider
│  └─ LiDAR, Photogrammetrie, Gaussian-Splat-Quelle
└─ GeometryProvider
   └─ vorhandenes Mesh, SDF oder Engine-Szene
```

### 4.1 Auswahlregel

```text
Echte Geometrie oder gemessene Depth vorhanden?
    └─ verwenden

Verlässliche Point Cloud oder Multiview-Rekonstruktion vorhanden?
    └─ verwenden

Nur Einzelbild vorhanden?
    └─ MonocularDepthProvider

Video vorhanden?
    └─ TemporalDepthProvider statt unabhängiger Einzelbildschätzung

RGB plus wenige metrische Tiefenanker vorhanden?
    └─ GuidedMetricDepthProvider
```

Priorität:

```text
gemessen > multiview-rekonstruiert > engine-bekannt > geführt geschätzt > monokular geschätzt
```

Ein niedriger priorisierter Provider darf höherwertige Daten niemals unbemerkt überschreiben.

---

## 5. Was Depth Anything SHADED konkret ermöglicht

### 5.1 Automatische Ebenenstaffelung

Aus einem einzelnen Bild kann SHADED vorläufige Tiefenschichten bilden:

```text
Ebene 0: Vordergrund
Ebene 1: interaktive Figuren und Objekte
Ebene 2: Architektur
Ebene 3: Landschaft
Ebene 4: Ferne / Himmel
```

Dadurch werden ohne manuelles Ausschneiden möglich:

- Parallax,
- Depth of Field,
- Tiefennebel,
- tiefenabhängige Partikel,
- Vorder-/Hintergrundmaskierung,
- räumliche Audiozonen,
- einfache Occlusion-Heuristiken.

### 5.2 Erste 2,5D-Oberfläche

```text
Pixel X/Y
+ geschätztes Z
= provisorische sichtbare Oberfläche
```

Geeignet für:

- Concept Art,
- matte Paintings,
- Point-and-click-Hintergründe,
- alte Spielgrafiken,
- Fotos,
- einzelne Renderings,
- schnelle begehbare Bildräume.

### 5.3 Räumliche Masken

Tiefenwerte können geclustert und anschließend mit Segmentierung kombiniert werden:

```text
Depth Cluster
+ Materialklasse
+ Objektsegmentierung
+ Kanten
────────────────────
= vorläufige räumliche Region
```

Depth allein darf nicht zur Materialklassifikation werden. Die bestehende Regel **keine zweite Materialwahrheit** bleibt bestehen.

### 5.4 Architektonische Indizien

Depth Anything kann Hinweise liefern auf:

- Boden-Wand-Übergänge,
- nach hinten laufende Flächen,
- Vorder-/Hintereinander,
- mögliche Öffnungen,
- grobe Raumstaffelung.

Es erzeugt nicht zuverlässig:

- Räume hinter Türen,
- Grundrisse,
- Wandstärken,
- Rückseiten,
- verborgene Treppen,
- Geschosse,
- statisch korrekte Architektur.

> Depth Anything liefert architektonische Indizien, keine fertige Architektur.

Fehlende Architektur muss durch weitere Provider, Regeln, generative Vervollständigung oder Nutzerfreigaben geschlossen werden.

---

## 6. Der fehlende SHADED-Architekturblock

Die folgenden Repositories sind gemeinsam als SHADED-Bausteine einzuordnen:

| Repository | SHADED-Rolle | Technische Form |
|---|---|---|
| `DepthAnything/Depth-Anything-V2` | räumliche Szenenstaffelung aus Einzelbild | Reconstruction Provider |
| `SUDO-AI-3D/zero123plus` | plausible Mehransichten und Seitenflächen | Reconstruction Worker |
| `HugoTini/DeepBump` | Normal-, Height- und Curvature-Ableitung | Material Worker |
| `Jonathan-J8/three-materials-compiled` | kompilierte Three.js-Materialien und Uniformstruktur untersuchen | Material Inspector / Datenquelle |
| `aiekick/Lumo` | Node-Graph-, Viewport-, Shader-, SDF- und Simulationsarbeitsraum | Architektur-Donor, nicht Fundament |
| `st-tech/ppf-contact-solver` | Kontakt, Kollision und Verformung | isolierter Simulation Worker |

Quellen:

- https://github.com/DepthAnything/Depth-Anything-V2
- https://github.com/SUDO-AI-3D/zero123plus
- https://github.com/HugoTini/DeepBump
- https://github.com/Jonathan-J8/three-materials-compiled
- https://github.com/aiekick/Lumo
- https://github.com/st-tech/ppf-contact-solver

### 6.1 Gemeinsame Kette

```text
Einzelbild / Textur / grobes Modell
                │
                ▼
      Monocular Depth Provider
      räumliche Staffelung
                │
                ▼
      Multi-View Completion
      plausible Seitenansichten
                │
                ▼
        Material Worker
  Height · Normals · Curvature
                │
                ▼
       Material Inspector
 Shaderquellen · Uniforms · Varianten
                │
                ▼
        Graph Workspace
  Node Graph · Viewports · SDF · Pässe
                │
                ▼
       Simulation Worker
 Kontakt · Druck · Verformung · Kollision
                │
                ▼
         World Surface Graph
                │
                ▼
 World-Law Scheduler und Rendergraph
```

---

## 7. Aufgaben der einzelnen Provider

### 7.1 Depth Anything – räumliche Hypothese

Erzeugt:

- relative oder modellabhängig metrische Tiefe,
- grobe Vorder-/Hintergrundstaffelung,
- Ausgangspunkt für 2,5D, Point Cloud und Occlusion,
- Konfidenz und Provider-Metadaten.

Erzeugt nicht automatisch:

- korrekte Topologie,
- Rückseiten,
- vollständige Räume,
- verlässliche metrische Architektur.

### 7.2 Zero123++ – Perspektivlücken

Erzeugt plausible Ansichten aus anderen Blickwinkeln. Diese Ansichten sind generierte Hypothesen, keine Beobachtungen.

Anwendungen:

- Seitenflächen für 2,5D-Extrusion,
- bessere Multi-View-Rekonstruktion,
- View-Dependent Textures,
- grobe Volumenvorschläge,
- Unterstützung bei verdeckten Oberflächen.

Jede generierte Ansicht muss mit Provenienz und Konfidenz gespeichert werden.

### 7.3 DeepBump – Mikrooberfläche

Erzeugt oder unterstützt:

- Height,
- Normalen,
- Curvature,
- Oberflächendetails,
- materialbezogene Mikrostruktur.

Es schließt die Lücke zwischen Farbe und licht-/weltgesetzfähiger Oberfläche.

DeepBump darf als GPL-Komponente nicht unbedacht in den Kern kopiert werden. Die bevorzugte Form ist ein separater Prozess oder austauschbarer Worker mit klar definierten Ein- und Ausgaben.

### 7.4 Three Materials Compiled – Materialanatomie

Nutzen:

- tatsächlich kompilierte Shader untersuchen,
- Uniforms und Defines extrahieren,
- Materialvarianten vergleichen,
- abstrakte Three.js-Materialien in konkrete Passbestandteile zerlegen,
- zukünftigen Material-Inspector speisen.

Solange keine eindeutige Lizenzübernahme geklärt ist, bleibt das Repository Daten- und Architekturquelle, nicht blind kopierter Donor-Code.

### 7.5 Lumo – Graph Workspace

Lumo zeigt, wie Shader, SDFs, Partikel, Simulation, Beleuchtung, Post-Processing und verschiedene Viewports in einem räumlichen Node-Arbeitsplatz zusammenkommen können.

Da das Projekt archiviert ist:

- Architektur und Interaktionsmuster untersuchen,
- keine langfristige Kernabhängigkeit daraus machen,
- keine neue SHADED-Basis auf dem archivierten Projekt aufbauen.

Lumo ist Blaupause für den fehlenden **SHADED Graph Workspace**.

### 7.6 PPF Contact Solver – körperliche Wahrheit

Der Contact Solver ergänzt die visuelle Welt um Kontakt und Materialantwort:

```text
Körper berührt Schnee
→ Kontaktkraft
→ Verdichtung / Verformung
→ Height- und Druckfeld ändern sich
→ Nässe, Kälte und Spuren werden aktualisiert
→ Material- und Lichtpässe lesen den neuen Zustand
```

Er gehört fachlich zu SHADED, sollte aber als schwerer Simulation Worker hinter einem versionierten Vertrag laufen.

---

## 8. World Surface Graph

Alle Provider müssen in ein kanonisches Zwischenformat schreiben. Ohne dieses Format entsteht nur eine Sammlung inkompatibler Karten, Modelle und Worker.

```text
WorldSurfaceNode
├─ identity
│  ├─ stableId
│  ├─ sceneId
│  ├─ semanticRegionId
│  └─ version
│
├─ source
│  ├─ originalAsset
│  ├─ provider
│  ├─ providerVersion
│  ├─ timestamp
│  └─ provenance
│
├─ geometry
│  ├─ depth
│  ├─ metricScale
│  ├─ pointCloud
│  ├─ mesh
│  ├─ sdf
│  ├─ height
│  └─ confidence
│
├─ surface
│  ├─ albedo
│  ├─ normals
│  ├─ roughness
│  ├─ curvature
│  ├─ emissive
│  ├─ porosity
│  └─ materialClassRefs
│
├─ shader
│  ├─ source
│  ├─ compiledForm
│  ├─ defines
│  ├─ uniforms
│  ├─ activePasses
│  └─ backend
│
├─ physics
│  ├─ collisionRepresentation
│  ├─ contactConstraints
│  ├─ deformation
│  ├─ mass
│  ├─ friction
│  └─ materialResponse
│
├─ fields
│  ├─ moisture
│  ├─ temperature
│  ├─ pressure
│  ├─ damage
│  ├─ contamination
│  ├─ decay
│  └─ customWorldFields
│
└─ uncertainty
   ├─ observed
   ├─ measured
   ├─ reconstructed
   ├─ generated
   ├─ inferred
   ├─ userApproved
   └─ confidence
```

### 8.1 Beobachtung und Hypothese müssen getrennt bleiben

Jede räumliche oder materielle Aussage erhält eine Provenienzklasse:

| Klasse | Bedeutung |
|---|---|
| **MEASURED** | Sensor, Engine, EXR oder bekannte Szene |
| **OBSERVED** | direkt aus dem Quellbild oder Quellmodell ablesbar |
| **RECONSTRUCTED** | aus mehreren Ansichten oder geometrischen Regeln abgeleitet |
| **INFERRED** | durch ein Modell oder eine Heuristik geschätzt |
| **GENERATED** | fehlender Inhalt synthetisch ergänzt |
| **USER_APPROVED** | Nutzer hat eine Hypothese als kanonisch bestätigt |

World Laws dürfen diese Klassen unterschiedlich behandeln.

Beispiel:

- Sichtbarer Parallax-Effekt darf `INFERRED` Depth nutzen.
- Harte Kollision sollte nicht ungeprüft auf niedriger Konfidenz basieren.
- Ein Grundriss darf nicht aus einem monokularen Tiefenbild als gesicherte Wahrheit gespeichert werden.

### 8.2 Provider dürfen nicht direkt Weltgesetze erfinden

Provider schreiben räumliche oder materielle Eigenschaften in den World Surface Graph.

Der World-Law Scheduler entscheidet danach, welche Gesetze diese Eigenschaften lesen.

```text
Depth Provider
  └─ schreibt Depth Hypothesis

Snow Law
  └─ liest Geometrie, Height, Temperatur und Kontakt

Nicht:
Depth Provider
  └─ entscheidet selbst über Schnee, Kollisionsregeln oder Gameplay
```

---

## 9. Provider-Vertrag

Jeder Reconstruction- oder Material-Provider deklariert mindestens:

```text
Provider-ID:
Version:
Input-Medien:
Output-Artefakte:
Koordinatensystem:
Skalierung: relative | metrisch | unbekannt
Provenienzklasse:
Konfidenzbereich:
Unterstützte Auflösung:
Ausführungsort: browser | node | python | native | external
Persistenz:
Caching-Key:
Lizenz-/Redistributionshinweis:
Fallback:
Timeout / Abbruch:
Test-Fixtures:
```

Beispiel:

```json
{
  "id": "reconstruction.depth.monocular.depth-anything-v2",
  "inputs": ["rgb-image"],
  "outputs": ["relative-depth", "confidence"],
  "scale": "relative",
  "provenance": "INFERRED",
  "execution": "python-worker",
  "cadence": "onImportOrDirty",
  "fallback": "flat-depth",
  "mustNotOverride": ["MEASURED", "OBSERVED_METRIC", "RECONSTRUCTED_MULTIVIEW"]
}
```

---

## 10. Scheduling und Lastverteilung

Reconstruction Provider gehören überwiegend nicht in den Frame-Loop.

| Aufgabe | Typische Cadence |
|---|---|
| Einzelbild-Depth | Import, Load oder Dirty |
| Multi-View Completion | explizit oder nach Nutzerfreigabe |
| DeepBump-Materialkarten | Import oder Materialänderung |
| Material-Kompilierungsinspektion | bei Shader-/Materialänderung |
| Contact Solver | fixedHz oder ereignis-/sichtbarkeitsgesteuert |
| Point-Cloud-/Mesh-Ableitung | Import, Dirty oder Qualitätswechsel |

### 10.1 Caching

Der Cache-Key muss mindestens enthalten:

- Hash des Quellassets,
- Provider und Version,
- Modell-ID,
- Parameter,
- Auflösung,
- Koordinatensystem,
- relevante Nutzerkorrekturen.

### 10.2 Degradation

Unter Last oder fehlendem Backend:

1. vorhandene gecachte Daten nutzen,
2. niedrigere Auflösung verwenden,
3. vereinfachten Provider einsetzen,
4. flache oder neutrale Repräsentation verwenden,
5. visuelle Funktion deaktivieren, ohne bestätigten Weltzustand zu löschen.

Ein fehlgeschlagener Rekonstruktionslauf darf keine höherwertigen vorhandenen Daten entfernen.

---

## 11. Architekturgrenzen

### 11.1 Keine automatische Wahrheit aus generativen Modellen

Zero123++, Depth Anything und ähnliche Modelle liefern Vorschläge. Sie dürfen nicht stillschweigend:

- Kollisionen verbindlich machen,
- Räume erfinden,
- Materialklassen überschreiben,
- World Laws aktivieren,
- persistente Architektur als beobachtet markieren.

### 11.2 Keine direkte Lizenzvermischung

Provider mit GPL, AGPL, eigener Lizenz oder unklarer Lizenz werden als externe Worker, Referenz oder Datenquelle behandelt, bis eine bewusste Lizenzentscheidung getroffen wurde.

### 11.3 Keine Architekturverdopplung

- Materialklassen bleiben kanonisch.
- Rekonstruktionsdaten werden versioniert in den World Surface Graph geschrieben.
- Der Rendergraph liest diese Daten.
- Externe Worker führen keine unabhängige zweite Szenenwahrheit.

---

## 12. Erster vertikaler Schnitt

Der erste Schnitt soll nicht sofort vollständige 3D-Rekonstruktion beweisen. Er soll den Provider-Vertrag und den Übergang in die vorhandene Runtime beweisen.

### Eingabe

- ein Einzelbild ohne Depth,
- optional ein zweites Bild mit vorhandener Depth als Vergleich.

### Ablauf

```text
1. Bild importieren
2. MonocularDepthProvider ausführen
3. Depth mit Provenienz INFERRED speichern
4. Depth in bestehende Parallax-API einspeisen
5. provisorische Point Cloud erzeugen
6. Depth Cluster als Debugansicht zeigen
7. Nutzer kann Depth akzeptieren, verwerfen oder korrigieren
8. Save/Reload erhält Provider, Version, Konfidenz und Nutzerentscheidung
```

### Noch ausdrücklich nicht Teil des ersten Schnitts

- vollständiges Mesh,
- automatische Rückseiten,
- verbindliche Kollision aus geschätzter Depth,
- Kontakt-Solver-Integration,
- Zero123++-Vollpipeline,
- kompletter Lumo-artiger Node Editor.

---

## 13. Abnahmekriterien

Der Architekturbaustein gilt erst als bewiesen, wenn:

- [ ] echte vorhandene Depth Vorrang vor geschätzter Depth hat,
- [ ] Depth Anything als austauschbarer Provider und nicht hart verdrahteter Produktname implementiert ist,
- [ ] relative und metrische Tiefe unterscheidbar gespeichert werden,
- [ ] Provider-Version und Parameter persistieren,
- [ ] World Surface Graph Beobachtung, Rekonstruktion und Generierung trennt,
- [ ] geschätzte Depth eine bestehende Point Cloud oder Mesh nicht überschreibt,
- [ ] Parallax und Debugansicht aus demselben kanonischen Depth-Artefakt lesen,
- [ ] Nutzerkorrekturen nach Save/Reload erhalten bleiben,
- [ ] Provider-Ausfall auf einen klaren Fallback fällt,
- [ ] keine zusätzliche Materialklassifikation außerhalb der kanonischen SHADED-Analyse entsteht,
- [ ] Reconstruction Work nicht ungeplant im Frame-Loop läuft,
- [ ] Lizenzstatus jedes externen Providers dokumentiert ist.

---

## 14. Klare Entscheidung

Depth Anything wird in SHADED als **Monocular Depth Provider** eingeordnet.

Es ist der Notstromgenerator für fehlende Z-Information:

```text
RGB
 ↓
Monocular Depth Provider
 ↓
Depth Hypothesis
 ├─ Ebenen und Occlusion
 ├─ grobe Makronormalen
 ├─ provisorische Point Cloud
 ├─ 2,5D-Oberfläche
 ├─ Parallax und Depth Effects
 └─ Ausgangspunkt für weitere Rekonstruktion
```

Sobald höherwertige Geometrie gemessen, rekonstruiert oder vom Nutzer bestätigt wurde, verliert die monokulare Schätzung ihre führende Rolle.

Die Architektur bindet deshalb nicht an `Depth Anything`, sondern an den neutralen Vertrag `MonocularDepthProvider`. Depth Anything V2 ist das erste Backend, nicht die dauerhafte Systemgrenze.