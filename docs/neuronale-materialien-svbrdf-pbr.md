# SHADED – Neuronale Materialien, SVBRDF und PBR-Rekonstruktion: Stand 2026

**Status:** verbindliche Ergänzung zu [`reconstruction-provider-und-world-surface-graph.md`](./reconstruction-provider-und-world-surface-graph.md)
**Stand:** 2026-07-26
**Gilt für:** Materialkanäle, Albedo, Rauheit, Metallizität, Normalen, Intrinsic Decomposition, Relighting, Materialzuweisung und Rendermodell-Vokabular

> Die Materialschicht ist der Teil von SHADED, der am weitesten hinter dem aktuellen Stand liegt.
> Der Rückstand besteht aber nicht darin, dass ein paar PBR-Karten fehlen.
> Er besteht darin, dass SHADED Licht und Material bis heute nicht trennt.

---

## 1. Befund am eigenen Code, nicht am Trendbericht

Vor jeder Modellauswahl steht die Bestandsaufnahme. Alle folgenden Punkte sind an `index.html` und den bestehenden Architekturdokumenten geprüft, nicht aus einer Literaturliste abgeleitet.

### 1.1 Die Runtime kennt keine Materialkanäle

Der Fragment-Shader arbeitet mit Klassenmasken und handgeschriebenen Termen. Es existieren:

- kein Albedo,
- keine Rauheit,
- keine Metallizität,
- keine Normalen,
- kein Höhenfeld,
- keine BRDF-Auswertung.

Was heute wie Material aussieht – Specular-Sheen auf nassen Kanten, Rost auf Metall und Holz, Moos, Frost – sind direkte Farboperationen auf dem Quellbild, gesteuert von Materialklasse und Weltparametern.

> SHADEDs „Materialwahrheit“ ist eine **Semantik** (`classGrid`), kein Reflexionsmodell.

Das ist keine Schwäche der Invariante 2. Es bedeutet nur, dass SHADED bisher gar keine Ebene besitzt, in die SVBRDF-Kanäle überhaupt geschrieben werden könnten.

### 1.2 Das Licht ist im Quellbild eingebacken

Das ist der eigentliche Befund.

SHADED bekommt **ein fertig beleuchtetes 2D-Bild**. Darin stecken bereits:

- Tageszeit,
- Sonnenstand und Schattenwurf,
- Umgebungslicht,
- Spiegelungen,
- künstlerisch gesetzte Lichtstimmung.

Jedes Weltgesetz multipliziert heute **auf diese eingebackene Beleuchtung**:

```text
Quellfarbe (Albedo × ursprüngliches Licht)
        × Nässe-Abdunklung
        × Nacht-Abdunklung
        × Nebel
        = doppelt beschattetes Ergebnis
```

Daraus folgt eine ganze Fehlerklasse, die kein zusätzlicher Parameter behebt:

- ein bereits dunkler Schattenbereich wird bei Nässe zu Schwarzbrei,
- ein sonnenbeschienener Bereich bleibt nachts zu hell,
- Warmlicht aus Fenstern kann eine bereits warme Tagesfläche nicht sinnvoll aufhellen,
- Trocknung, Rost und Verfall wirken auf Schatten statt auf Oberfläche.

Das ist der Punkt, an dem der aktuelle Forschungsstand SHADED tatsächlich betrifft:

```text
nicht: „mehr Karten“
sondern: Beobachtete Farbe ≠ Albedo
```

### 1.3 Der veraltete Donor ist DeepBump, nicht der Ansatz

[`reconstruction-provider-und-world-surface-graph.md`](./reconstruction-provider-und-world-surface-graph.md) §7.3 führt `HugoTini/DeepBump` als **den** Material Worker. DeepBump leitet aus Farbe Normalen, Height und Curvature ab.

Grenzen dieser Wahl:

- ein einzelnes Kanalpaar statt eines konsistenten Kanalsatzes,
- keine Trennung von Licht und Material – eingebackene Schatten werden zu Geometrie,
- GPL, deshalb ohnehin nur als externer Worker zulässig,
- Stand einer Modellgeneration, die vor konsistenter Mehrkanalvorhersage und vor diffusionsbasierten Materialpriors liegt.

DeepBump bleibt als **Meso-Surface-Backend** brauchbar. Es darf aber nicht länger die gesamte Materialschicht repräsentieren.

### 1.4 Der `surface`-Zweig des World Surface Graph ist zu flach

Aktuell:

```text
surface
├─ albedo
├─ normals
├─ roughness
├─ curvature
├─ emissive
├─ porosity
└─ materialClassRefs
```

Es fehlen:

- Metallizität, Specular/IOR, Transmission, Sheen, Anisotropie,
- Height und Ambient Occlusion als eigene Kanäle,
- **Farbraum je Kanal** (linear gegen sRGB),
- **Konfidenz je Kanal**,
- die Unterscheidung `beobachtete Farbe` gegen `Albedo`,
- die Bindung an ein benanntes Reflexionsmodell,
- die Information, welcher Provider **welche Kanäle gemeinsam** erzeugt hat.

Vor allem: `albedo` steht hier bereits als Feld, obwohl niemand es erzeugt und niemand definiert hat, ob es Licht enthält.

### 1.5 Der harte Deckel: WebGL 1 mit acht belegten Texture Units

`index.html` erzeugt den Kontext mit:

```js
getContext('webgl')
```

Das ist WebGL 1. Die garantierte Untergrenze für `MAX_TEXTURE_IMAGE_UNITS` beträgt dort **8**. Belegt sind laut Invariante 7 und Shader-Quelltext:

```text
0 u_scene   1 u_maskA   2 u_maskB   3 u_phys
4 u_emis    5 u_trail   6 u_depth   7 u_zone
```

**Acht von acht.** Es ist kein einziger garantierter Sampler-Slot frei.

Zusätzlich fehlen in WebGL 1:

- Multiple Render Targets, also kein echter G-Buffer und keine getrennten Materialpässe,
- Float-/Half-Float-Rendertargets ohne Extension,
- Texture Arrays und 3D-Texturen,
- Compute.

Damit ist die Lage eindeutig: **Nicht das Modellangebot blockiert PBR in SHADED, sondern der Grafik-Kontext.** Jede Diskussion über WGSL, MaterialX oder OpenPBR-Auswertung ist bis zu dieser Entscheidung gegenstandslos.

---

## 2. Was in der Recherche NICHT auf SHADED zutrifft

Der Radar verlangt, echte Ablösung von bloßer Ergänzung zu trennen. Ein großer Teil des aktuellen Materialstands zielt auf ein Szenario, das SHADED gar nicht hat.

| Verfahrensklasse | Annahme | SHADED-Realität | Folge |
|---|---|---|---|
| SVBRDF-Capture (Deschaintre-Linie, MaterIA, SurfaceNet) | flach ausgelegte Materialprobe, blitzbeleuchtet, bekannte Geometrie | weite, stilisierte Szene mit Häusern, Wegen, Vegetation | **nicht direkt anwendbar** – kein Materialsample, keine Blitzannahme |
| NVDiffRecMC / nvdiffrec, inverse Rendering | viele Ansichten mit Kameras | ein Einzelbild | später, über Multi-View-Provider |
| Relightable 3D Gaussians, RNG, GANG, TranSplat | optimierte 3D-Gaussian-Szene | 2D-Runtime ohne Gaussian-Pfad | parken, gehört zum SDF-/Gaussian-Dokument |
| Open-Vocabulary-3D-Segmentierung, HOV-SG, Open3DSG, PGOV3D | Punktwolken, Roboternavigation | `classGrid` auf einem Bild | keine Ablösung der Invariante 2 |
| Metric3D v2, UniDepthV2, Fisheye/360° | Geometrie, nicht Material | bereits entschieden | steht in [`einzelbild-raeumlichkeit-providerlandschaft.md`](./einzelbild-raeumlichkeit-providerlandschaft.md) |
| Meshtron, InstaLOD, NeCGS, Displacement-Kompression | Mesh-Assets und LOD | SHADED exportiert keine Meshes | irrelevant bis Mesh-Export existiert |
| DiffCloth, DiffAvatar, differenzierbare Solver | Simulation mit Gradienten | Kontakt läuft über den geplanten PPF-Worker | eigenes Thema, nicht Material |

Das ist kein Abwerten der Quellen. Es ist die Anwendung von Radar-Regel 3: **Was ein anderes Problem löst, ist keine veraltete Entscheidung von SHADED.**

Die für SHADED wirklich relevanten Familien sind genau zwei:

1. **Intrinsic Decomposition** – trennt Albedo von Beleuchtung auf ganzen Szenen.
2. **Materialzuweisung und Materialsynthese** – gibt Regionen einen konsistenten, kachelbaren Materialkanalsatz, statt ihn aus dem Bild zu messen.

---

## 3. Die Ebenen sauber trennen

Wie bei Depth gegen Height gegen Raymarching liegen die Begriffe auf verschiedenen Ebenen.

| Begriff | Kategorie | Aussage |
|---|---|---|
| **Beobachtete Farbe** | Messgröße | was im Quellbild steht, inklusive Licht |
| **Albedo / Reflectance** | Materialgröße | Farbe der Oberfläche ohne Beleuchtung |
| **Shading / Irradiance** | Lichtgröße | die im Bild enthaltene Beleuchtung |
| **BRDF-Parameter** | Reflexionsmodell | Rauheit, Metallizität, Specular, IOR, Transmission |
| **Meso-/Mikrogeometrie** | Oberflächenrepräsentation | Normalen, Height, Curvature, AO |
| **Materialklasse** | Semantik | Gras, Dach, Holz, Wasser, Fels – SHADEDs `classGrid` |
| **Weltzustandsfeld** | Zustand | Nässe, Hitze, Verfall, Druck |
| **Rendermodell** | Auswertungsvorschrift | OpenPBR, Standard Surface, SHADEDs eigene Pässe |

Daraus folgen drei Regeln:

```text
Albedo konkurriert nicht mit Materialklasse.
Rauheit ist kein Weltzustand.
Nässe ist kein Materialkanal, sondern ein Feld, das Materialkanäle moduliert.
```

Konkret: `wet` bleibt ein Weltparameter. Er senkt zur Laufzeit die effektive Rauheit und hebt den Specular-Anteil – er wird **nicht** in die Rauheitskarte hineingeschrieben. Sonst entsteht ein persistenter Zustand, der nie wieder trocknet.

---

## 4. Was die Modellklassen tatsächlich liefern

### 4.1 Intrinsic Decomposition – die Familie, die SHADED zuerst braucht

Ziel: aus einem gewöhnlichen Bild Albedo und Shading trennen, optional zusätzlich Normalen, Rauheit, Metallizität und eine Lichtschätzung.

Relevante Vertreter:

- **RGB↔X** – Diffusionsmodell für Innenraumszenen, das RGB in intrinsische Kanäle zerlegt (`RGB→X`) und aus intrinsischen Kanälen wieder Bilder synthetisiert (`X→RGB`).
  https://dl.acm.org/doi/fullHtml/10.1145/3641519.3657445
- **IntrinsicAnything** – Diffusionspriors für inverse Rendering unter unbekannter Beleuchtung, trainiert auf Objaverse.
- **IntrinsicReal** – schließt die Synthetik-Realität-Lücke von IntrinsicAnything per zweistufigem Pseudo-Labeling; berichtet State of the Art für Albedo auf synthetischen **und** realen Daten.
  https://arxiv.org/abs/2509.00777
- **IDArb** – intrinsische Zerlegung für beliebig viele Ansichten und Beleuchtungen; für SHADED zunächst im Einzelbildmodus interessant.
  https://arxiv.org/html/2412.12083v3
- **Colorful Diffuse Intrinsic Decomposition** – Zerlegung „in the wild“ statt nur auf kuratierten Innenräumen.

SHADED-Rolle:

```text
IntrinsicDecompositionProvider
```

Ausgabe:

```text
albedo            (linear, ohne Beleuchtung)
shading           (ein- oder dreikanalig)
specularResidual  (optional)
lightEstimate     (optional, grob)
confidence        (pro Kanal)
```

Grenzen, die dokumentiert bleiben müssen:

- die Zerlegung ist **unterbestimmt** – ein dunkler Fleck kann Schatten oder dunkle Farbe sein,
- auf stilisierten, gemalten und Pixel-Art-Bildern gilt keine Trainingsverteilung,
- harte Schlagschatten bleiben oft teilweise im Albedo,
- Provenienz ist immer `INFERRED`, nie `OBSERVED`.

### 4.2 Verkettete SVBRDF-Vorhersage – die Kernidee, nicht das Produkt

**Chord** (SIGGRAPH Asia 2025, arXiv:2509.09952) sagt SVBRDF-Kanäle nicht unabhängig vorher, sondern verkettet entlang der Renderinggleichung:

```text
Basecolor
   ↓ konditioniert
Normalen + Height
   ↓ konditioniert
Rauheit + Metallizität
```

Jeder Schritt sieht die bereits extrahierten Kanäle als Kontext. Das reduziert genau die Inkonsistenzen, die entstehen, wenn vier Netze vier Karten unabhängig raten.

Dieselbe Beobachtung von der anderen Seite: **ARM** trennt Albedo (`InstantAlbedo`) und Rauheit/Metallizität (`GlossyRM`) bewusst in zwei Netze, weil ein einzelnes Netz für alle Kanäle zu ungenauer Zerlegung führt.
https://arxiv.org/pdf/2411.10825

Für SHADED zählt daraus **nicht** das konkrete Modell – Chord arbeitet auf generierten, kachelbaren Texturbildern, nicht auf Szenenfotos, und die Verfügbarkeit von Code und Gewichten ist zu prüfen. Für SHADED zählt die Architekturkonsequenz:

> Kanäle eines Materials sind ein **Satz**, kein Beutel unabhängiger Karten. Wer sie aus verschiedenen Quellen mischt, muss das explizit festhalten.

Das führt direkt zum `channelSetId` in §6.

### 4.3 Materialzuweisung statt Materialmessung

**Material Palette** (CVPR 2024) extrahiert aus einem realen Einzelbild eine Materialpalette: Region → Materialkonzept → generierte Textur → Zerlegung in Albedo, Normalen, Rauheit.
https://github.com/astra-vision/MaterialPalette

Das passt strukturell exakt zu SHADED, weil SHADED die Regionen **bereits hat** – die kanonischen Materialklassen aus `analyze()`.

```text
classGrid-Region „Dach“
   → Materialkonzept
   → kachelbare Textur
   → konsistenter SVBRDF-Kanalsatz
   → als Materialbibliothekseintrag speichern
```

Lizenzlage, exakt so zu dokumentieren:

- Repository: **MIT**,
- der verwendete Diffusions-Checkpoint: **CreativeML Open RAIL-M**,
- der referenzierte `runwayml/stable-diffusion-v1-5`-Checkpoint ist auf Hugging Face nicht mehr verfügbar; ein Ersatz muss bewusst gewählt werden.

Verwandt: **Make-it-Real** weist Materialien über ein multimodales Modell zu, statt sie zu rekonstruieren.

SHADED-Rolle:

```text
MaterialAssignmentProvider
```

### 4.4 Generative Materialsynthese

**StableMaterials** (CVPR 2026, arXiv:2406.09293) erzeugt kachelbare PBR-Materialien per Latent Diffusion mit semi-supervised Training; eine destillierte Latent-Consistency-Variante erzeugt in **vier Schritten**, plus eine Kachelbarkeitstechnik gegen Artefakte bei wenigen Schritten.
https://gvecchio.com/stablematerials/ · https://huggingface.co/gvecchio/StableMaterials

**MatForger** liefert Basecolor, Normalen, Rauheit, Metallizität und Height, trainiert auf **MatSynth** (>4000 PBR-Materialien mit Renders und Tags).

Wichtig für die Hardwarefrage: die berichteten 24 GB beziehen sich auf **Training**. Der Inferenzbedarf der 4-Schritt-Variante ist lokal zu messen, nicht zu schätzen.

SHADED-Rolle:

```text
MaterialSynthesisProvider
```

Provenienz zwingend `GENERATED` – ein synthetisiertes Dachmaterial ist keine Beobachtung des hochgeladenen Bildes.

### 4.5 De-Lighting – die stabile ältere Baseline

Radar-Regel 2 verlangt, die stabile ältere Technik zu benennen. Sie existiert hier und ist erprobt:

- Unity Labs De-Lighting Tool (offen verfügbar, arbeitet mit AO- und Normal-Hinweisen),
- Agisoft De-Lighter (kostenlos, Photogrammetrie-Workflow),
- Substance Sampler „Delight“.

Diese Werkzeuge lösen ein engeres Problem – eingebackenes Licht aus einer Textur entfernen – tun das aber seit Jahren robust und ohne Modell-Checkpoint-Risiko. Für einen ersten Vergleichslauf gegen einen Intrinsic-Provider sind sie der ehrliche Referenzpunkt.

### 4.6 Zusammenfassende Zuordnung

| Quelle | SHADED-Rolle | Status |
|---|---|---|
| RGB↔X | `IntrinsicDecompositionProvider` | erster Benchmark-Kandidat (Innenraum-Bias prüfen) |
| IntrinsicReal / IntrinsicAnything | `IntrinsicDecompositionProvider` | Albedo-Referenz, Objektfokus prüfen |
| IDArb | `IntrinsicDecompositionProvider` | Mehransicht später, Einzelbild jetzt |
| Chord | `ChainedSVBRDFProvider` | Architekturvorbild; Verfügbarkeit prüfen |
| ARM | Belegquelle für getrennte Kanalköpfe | Referenz |
| Material Palette | `MaterialAssignmentProvider` | passt zur Maskenarchitektur; Checkpoint-Lizenz klären |
| StableMaterials / MatForger / MatSynth | `MaterialSynthesisProvider` | lokaler Kandidat, VRAM messen |
| DeepBump | `MesoSurfaceProvider` | herabgestuft, GPL-Worker |
| Deschaintre-Linie, MaterIA, SurfaceNet | Referenz für Kanaldefinition | nicht anwendbar auf Szenenbilder |
| Unity/Agisoft De-Lighter | `DelightProvider` (klassisch) | Baseline für den Vergleich |

---

## 5. Neue Providerfamilie

```text
MaterialProviderRegistry
├─ IntrinsicDecompositionProvider   Albedo · Shading · Lichtschätzung
├─ DelightProvider                  eingebackenes Licht entfernen (klassisch oder gelernt)
├─ MesoSurfaceProvider              Normalen · Height · Curvature · AO
├─ ChainedSVBRDFProvider            konsistenter Kanalsatz in Renderreihenfolge
├─ MaterialAssignmentProvider       Region → Materialkonzept → Kanalsatz
├─ MaterialSynthesisProvider        generierte kachelbare Materialien
└─ MaterialInspector                kompilierte Shader, Uniforms, Varianten
```

Jeder dieser Provider erfüllt den bestehenden Provider-Vertrag aus
[`reconstruction-provider-und-world-surface-graph.md`](./reconstruction-provider-und-world-surface-graph.md) §9 und ergänzt drei Materialfelder:

```text
Erzeugte Kanäle:
Kanalsatz-ID (channelSetId):
Farbraum je Kanal:
Reflexionsmodell:
```

Beispiel:

```json
{
  "id": "material.intrinsic.rgbx",
  "inputs": ["rgb-image"],
  "outputs": ["albedo", "shading", "confidence"],
  "channelSet": "intrinsic.v1",
  "colorSpace": { "albedo": "linear", "shading": "linear" },
  "brdfModel": "none",
  "provenance": "INFERRED",
  "execution": "python-worker",
  "cadence": "onImportOrDirty",
  "fallback": "identity-albedo",
  "mustNotOverride": ["MEASURED", "USER_APPROVED", "classGrid"]
}
```

`"fallback": "identity-albedo"` bedeutet: fällt der Provider aus, ist Albedo gleich der Quellfarbe und Shading gleich 1. Das ist exakt das heutige Verhalten – SHADED degradiert also auf den Ist-Zustand statt auf einen Fehler.

---

## 6. Kanalvertrag

Ein Materialkanal ohne Farbraum, Wertebereich und Provenienz ist ungültig.

| Kanal | Raum | Bereich | Pflicht | Fallback |
|---|---|---|---|---|
| `observedColor` | sRGB | 0..1 | ja | Quellbild |
| `albedo` | linear | 0..1 | nein | `observedColor` |
| `shading` | linear | 0..n | nein | 1.0 |
| `roughness` | linear, skalar | 0..1 | nein | Klassen-Default |
| `metallic` | linear, skalar | 0..1 | nein | 0.0 |
| `specular` / `ior` | linear | 0..1 / 1..3 | nein | dielektrisch |
| `normal` | Tangentenraum | −1..1 | nein | (0,0,1) |
| `height` | linear, skalar | 0..1 + `scaleMeters` | nein | flach |
| `ao` | linear, skalar | 0..1 | nein | 1.0 |
| `curvature` | signiert | −1..1 | nein | 0.0 |
| `emissive` | linear | 0..n | nein | 0.0 |
| `transmission` / `sheen` / `anisotropy` | linear | 0..1 | nein | 0.0 |

Zusätzlich pro Kanal verpflichtend:

```text
provider, providerVersion, channelSetId, provenance, confidence, resolution
```

### 6.1 channelSetId

Kanäle, die **gemeinsam** aus einem Lauf stammen, teilen eine `channelSetId`. Werden Kanäle gemischt, entsteht ein neuer Satz mit dokumentierter Herkunft:

```text
albedo    ← intrinsic.v1     (RGB→X)
normal    ← meso.v3          (DeepBump)
roughness ← assignment.v2    (Material Palette)
────────────────────────────────────────
composed.v7  mixed = true
```

Das ist die minimale, ehrliche Antwort auf das im Forschungsstand offene Problem der Konfliktauflösung zwischen Modellen: SHADED löst den Konflikt nicht automatisch, aber es **verschweigt ihn nicht**.

### 6.2 Farbraum ist kein Detail

Albedo linear, `observedColor` sRGB. Wird das vermischt, wirken Nässe- und Nacht-Abdunklung systematisch falsch, und zwar in einer Weise, die beim Screenshot-Vergleich wie ein Shaderfehler aussieht. Der Farbraum steht deshalb **am Kanal**, nicht in einer Konvention.

---

## 7. Erweiterung des World Surface Graph

Der `surface`-Zweig ersetzt die flache Liste:

```text
surface
├─ observed
│  ├─ sourceColor
│  ├─ colorSpace
│  └─ sourceAssetHash
│
├─ intrinsic
│  ├─ albedo
│  ├─ shading
│  ├─ specularResidual
│  ├─ lightEstimate
│  ├─ decompositionModel
│  └─ confidence
│
├─ brdf
│  ├─ model: openpbr | standard-surface | shaded-adhoc
│  ├─ baseColor
│  ├─ roughness
│  ├─ metallic
│  ├─ specular / ior
│  ├─ transmission / sheen / anisotropy
│  └─ channelSetId
│
├─ meso
│  ├─ normals
│  ├─ height + scaleMeters
│  ├─ curvature
│  ├─ ao
│  └─ tangentFrame
│
├─ mapping
│  ├─ space: screen | uv | triplanar
│  ├─ tileable
│  └─ tiling
│
├─ semantics
│  └─ materialClassRefs        (nur Referenz auf die kanonische Analyse)
│
└─ uncertainty
   ├─ perChannelConfidence
   ├─ provenance
   └─ mixed
```

`semantics` enthält bewusst **nur Referenzen**. Der Graph speichert hier keine eigene Klassifikation.

---

## 8. Invariante 2 im PBR-Zeitalter

Die Materialschicht ist die gefährlichste Stelle für eine zweite Materialwahrheit – genau daran ist der Prototyp gestorben. Deshalb gelten diese Regeln ohne Ausnahme:

1. **Provider erzeugen Parameter, niemals Klassen.**
   Eine Rauheitskarte darf nicht mitentscheiden, ob eine Fläche Wasser ist.

2. **`getMaterialTypeAt()` und `classGrid` stammen weiterhin ausschließlich aus `analyze()`.**
   Kein Materialprovider schreibt dort hinein.

3. **Die Richtung ist einseitig.**
   Die Klasse darf Priors für Provider liefern – „Dach“ schränkt den plausiblen Rauheitsbereich ein. Der umgekehrte Weg ist verboten.

4. **Marker-Overlays (Invariante 3) korrigieren Klassen, nicht BRDF-Parameter.**
   Eine Nutzeransage bleibt eine Ansage über Semantik.

5. **Weltzustände werden nicht in Materialkanäle eingebrannt.**
   `wet`, `decay`, `temperature` modulieren zur Laufzeit; sie verändern die gespeicherten Kanäle nicht.

6. **Ein fehlgeschlagener Materialprovider löscht nichts.**
   Fallback ist `identity-albedo`, also der heutige Zustand.

---

## 9. Rendermodell: OpenPBR als Vokabular, nicht als Runtime

**OpenPBR Surface** ist ein ASWF-Standard und Subprojekt von MaterialX; es ist als Nachfolger von Autodesk Standard Surface und Adobe Standard Material angelegt.
https://github.com/AcademySoftwareFoundation/OpenPBR

**MaterialX** hat in **1.39.4 (2025-09-15)** Shader-Generierung für **WGSL** ergänzt; der Stand dieser Datei ist **1.39.5 (2026-05-22)**.
https://github.com/AcademySoftwareFoundation/MaterialX/blob/main/CHANGELOG.md

Damit existiert erstmals ein durchgehender Pfad `MaterialX → WGSL → WebGPU`. Die Entscheidung für SHADED lautet trotzdem zweigeteilt:

**Jetzt übernehmen: die Benennung.**
Kanalnamen, Wertebereiche und Semantik folgen OpenPBR. Das kostet nichts, keine Abhängigkeit, keinen Build-Schritt – und macht einen späteren Export anschlussfähig.

**Jetzt nicht übernehmen: die Auswertung.**
Ein MaterialX-Runtime-Pfad würde:

- eine zweite Shader-Erzeugung neben SHADEDs Pässen etablieren,
- Invariante 1 (`index.html` ohne Build-Schritt) gegen eine Codegen-Toolchain stellen,
- den Rendergraph aus [`rendergraph-lastverteilung.md`](./rendergraph-lastverteilung.md) umgehen.

> MaterialX/OpenPBR wird SHADEDs **Exportsprache und Vokabular**, nicht seine Laufzeit.

---

## 10. Die Kontextfrage: WebGL 1, WebGL 2 oder WebGPU

Ohne freie Texture Units ist keine Materialschicht lauffähig. Drei Wege:

| Weg | Gewinn | Kosten | Bewertung |
|---|---|---|---|
| **A – Kanalpackung in WebGL 1** | keine Kontextänderung, sofort machbar | jeder freie RGBA-Kanal wird belegt; Debugging wird zäh; kein G-Buffer | Notlösung für den ersten Schnitt |
| **B – WebGL 2** | MRT, mehr Sampler, Texture Arrays, Float-Targets, GLSL ES 3.00 | Shader-Portierung; Fallback-Frage; alle Verify-Baselines neu prüfen | **empfohlener Zielkontext** |
| **C – WebGPU/WGSL** | Compute, moderne Toolchain, MaterialX-WGSL-Anschluss | größter Umbau; Toolchain gegen Invariante 1; breite Verfügbarkeit prüfen | erst nach B, mit eigenem Beweisritt |

Empfehlung: **B**, und zwar als eigene Runde mit vollständigem visuellem Verify-Durchlauf, bevor der erste Materialkanal überhaupt gerendert wird. Grund: WebGL 2 ist die kleinste Änderung, die die Blockade tatsächlich löst, und sie kollidiert nicht mit dem Single-File-Gebot.

Der erste vertikale Schnitt in §11 ist bewusst so geschnitten, dass er **ohne** Kontextwechsel beweisbar ist – über Weg A, mit genau einem zusätzlichen Kanal.

---

## 11. Praktische Priorisierung für RTX 3060 12 GB

**Zuerst lokal benchmarken**

1. **RGB→X** auf den vorhandenen Verify-Zielbildern – die Szenen sind Außenraum und stilisiert, der Innenraum-Bias muss sichtbar gemacht werden.
2. **IntrinsicReal / IntrinsicAnything** als Albedo-Gegenkandidat.
3. **Unity oder Agisoft De-Lighter** als klassische Baseline – ohne diesen Vergleich ist „das Modell ist besser“ eine Behauptung.
4. **StableMaterials (4-Schritt-LCM)** für Materialsynthese, VRAM real messen.

**Später**

- IDArb, sobald Mehransichten existieren,
- Material Palette, sobald die Checkpoint-Lizenzfrage entschieden ist,
- ChainedSVBRDF-Backends, sobald Gewichte verfügbar sind.

**Messgrößen pro Provider**

Laufzeit, Peak-VRAM, erzeugte Kanäle, Verhalten an harten Schlagschatten, Verhalten auf gemalten und Pixel-Art-Bildern, Kantentreue an Fachwerk und Fenstern, Lizenz, Kachelbarkeit, Reproduzierbarkeit bei gleichem Seed.

---

## 12. Erster vertikaler Schnitt

Ziel ist **nicht** PBR. Ziel ist der Beweis, dass SHADED Licht und Material trennen kann, ohne die Materialwahrheit anzutasten.

### Eingabe

- ein vorhandenes Verify-Zielbild,
- die bestehende Analyse mit `classGrid`.

### Ablauf

```text
1. Bild importieren
2. IntrinsicDecompositionProvider im Worker ausführen
3. albedo + shading mit Provenienz INFERRED und Konfidenz speichern
4. Quellbild bleibt unverändert (Unit 0 unangetastet)
5. albedo in einen freien RGBA-Kanal einer bestehenden Maskentextur packen (Weg A)
6. GENAU EIN Weltgesetz umstellen: Nässe-Abdunklung liest albedo statt Quellfarbe
7. A/B-Schalter im Editor: Zerlegung an / aus
8. Verify-Durchlauf beider Zustände, Klassenzählung muss identisch bleiben
9. Nutzer kann die Zerlegung annehmen, verwerfen oder als USER_APPROVED bestätigen
10. Save/Reload erhält Provider, Version, Konfidenz und Nutzerentscheidung
```

### Warum ausgerechnet Nässe

Nässe ist der Effekt, bei dem der Doppelbeschattungsfehler am deutlichsten sichtbar ist: poröse Materialien sollen dunkler werden, aber ein bereits schwarzer Schattenbereich darf nicht noch einmal abgedunkelt werden. Der Unterschied ist im Screenshot-Vergleich unmittelbar erkennbar – das ist die Voraussetzung dafür, dass der Schnitt überhaupt beweisbar ist.

### Ausdrücklich nicht Teil des ersten Schnitts

- Rauheit, Metallizität, vollständige SVBRDF-Sätze,
- Materialbibliothek und Kachelmaterialien,
- MaterialX-/OpenPBR-Auswertung zur Laufzeit,
- WebGL-2- oder WebGPU-Portierung,
- Relighting mit neuer Lichtquelle,
- Normal-Map-Rendering (SHADED hat weiterhin keinen Licht-Pass).

---

## 13. Abnahmekriterien

- [ ] `observedColor` und `albedo` sind getrennte, unterscheidbare Felder.
- [ ] Jeder Materialkanal trägt Farbraum, Wertebereich, Provenienz und Konfidenz.
- [ ] Gemischte Kanalsätze sind als `mixed` mit Herkunft je Kanal markiert.
- [ ] Kein Materialprovider schreibt in `classGrid` oder `getMaterialTypeAt()`.
- [ ] Weltzustände werden nicht in gespeicherte Kanäle eingebrannt.
- [ ] Providerausfall fällt auf `identity-albedo` und löscht keinen bestätigten Zustand.
- [ ] Materialarbeit läuft bei Import/Dirty, nicht im Frame-Loop.
- [ ] Kanalnamen und -bereiche folgen OpenPBR-Vokabular.
- [ ] MaterialX bleibt Export-/Vokabularschicht ohne Runtime-Codegen.
- [ ] Lizenz von Code **und** Checkpoint ist je Provider dokumentiert.
- [ ] Der visuelle Verify-Durchlauf zeigt A/B mit unveränderter Klassenzählung.
- [ ] Die Texture-Unit-Belegung ist nach der Änderung dokumentiert und begründet.

---

## 14. Klare Entscheidung

Ja, der Materialteil des Stacks ist veraltet – aber anders, als der Trendbericht nahelegt.

**Veraltet ist:**

- ein einzelner Karten-Generator (DeepBump) als gesamte Materialschicht,
- ein `surface`-Zweig ohne Farbraum, Konfidenz und Kanalsatz,
- die stillschweigende Gleichsetzung von Bildfarbe und Albedo,
- WebGL 1 mit acht von acht belegten Texture Units als Fundament einer Materialpipeline.

**Nicht veraltet ist:**

- die klassenbasierte Materialsemantik – kein SVBRDF-Modell liefert „Fachwerk“, „Pfad“ oder „Dach“,
- die Weltgesetz-Architektur – Rauheit ersetzt kein Verhalten,
- die Entscheidung, schwere Modelle als Worker hinter Verträgen zu führen.

**Die Zielarchitektur lautet nicht:**

```text
Alles wird PBR.
```

**Sondern:**

```text
beobachtete Farbe
→ Licht und Material trennen
→ Kanäle mit Farbraum, Provenienz und Kanalsatz führen
→ Weltgesetze auf Material statt auf eingebackenes Licht anwenden
→ fehlende Kanäle bewusst zuweisen oder synthetisieren
→ OpenPBR als Exportsprache, SHADEDs Pässe als Laufzeit
```

Der erste Beweis ist ein einziger Kanal: **Albedo**. Alles Weitere hängt daran.
