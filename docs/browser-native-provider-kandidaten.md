# Browser-native Provider-Kandidaten für die Cultivation-Arbeit

> **Status:** Forschungsnotiz / Referenz, keine verbindliche Architektur, kein Skill.
> **Scope:** NICHT ein Audit aller 123 Provider aus `tools/gpu-providers.all.json` — nur
> die Frage, welche browser-nativen Provider `docs/material-geometrie-ohne-farbe.md`s
> Cultivation-Generalisierung direkt helfen. `docs/research-radar-themen.md` führt
> "WebGPU/WGSL-Kontextwechsel" und "Open-Vocabulary-Segmentierung" bereits als **offene**
> Themen — dies ist ein erster, eng begrenzter Zugriff darauf, keine Auflösung.

## 1. Warum das zuerst gegen die eigene Registry geprüft werden musste

Externes Recherchematerial nannte konkrete Provider-Namen (`sam_segmentation`,
`depth_anything_v2`, `triposr`, `stable_fast_3d`, plus eine lange Liste render-/
simulationsseitiger Namen wie `webgpu_water`, `tidewright`, `snowflow`). Alle existieren
tatsächlich in `tools/gpu-providers.all.json` (123 Einträge, exakt wie behauptet) — das
Material war nicht erfunden. Aber `tools/provenance_matrix.md` (ein bereits existierendes
Audit-Tool, 991 durchsuchte Repos, 123 Provider geprüft) zeigt ein wichtiges,
differenzierteres Bild:

| Provider | Klassifikation | Bedeutung |
|---|---|---|
| `triposr` | VERIFIED (VAST-AI-Research/TripoSR) | echte, geprüfte Quelle |
| `stable_fast_3d` | VERIFIED (Stability-AI/stable-fast-3d) | echte, geprüfte Quelle |
| `webgpu_water`, `tidewright`, `snowflow`, `neural_planetoid`, `isosurface`, `supersplat`, `wonder3d`, `zero123plus`, `lato2`, `procedural_terrains` | VERIFIED | echte, geprüfte Quellen (aber s. §3 — nicht relevant für dieses Vorhaben) |
| **`sam_segmentation`** | **MISSING** | kein Quell-Repo hinterlegt — interner Platzhalter, keine geprüfte Implementierung |
| **`depth_anything_v2`** | **MISSING** | dito |
| `depth_anything_cpp` | VERIFIED (localai-org/depth-anything.cpp) | eine Variante existiert geprüft — nur nicht `depth_anything_v2` selbst |

Zusätzlich: `sam_segmentation`s `capabilities`-Feld im Registry-Eintrag lautet
`['depth', 'confidence']` — identisch mit fast jedem anderen Eintrag, unabhängig vom
tatsächlichen Modelltyp. Das ist erkennbar ein generisches Platzhalter-Feld, keine
kuratierte Fähigkeitsangabe. **Konsequenz:** die zwei Provider, die für dieses Vorhaben am
interessantesten wären, sind in der eigenen Registry unbelegt — jede Aussage darüber, was
sie können, kommt aktuell nur aus externer Recherche, nicht aus SHADEDs eigener,
verifizierter Quelle.

## 2. Direkt relevant für die Cultivation-Generalisierung

### SAM2 (Segment Anything) — die interessanteste, aber am wenigsten fertige Option

Ein klassenagnostischer, promptbarer Segmentierer ist konzeptionell nah an dem, was
`material-geometrie-ohne-farbe.md` §3 von Hand bauen will: eine Grenzfindung, die nicht
an einem einzigen Evidenzkanal hängt. Browser-native SAM2/SAM2.1-Ports über ONNX Runtime
Web + WebGPU existieren laut externer Recherche real.

**Wie es reinpasst, wie nicht:**

- **Richtig eingesetzt:** als EIN zusätzlicher Evidenzkanal (Appearance-/Perceptual-
  Boundary-Konfidenz) im kompetitiven Cultivation-Mechanismus — genau das, was §15 der
  Cultivation-Referenz explizit verlangt ("No single evidence channel owns
  cultivation"). SAM2s Maskengrenzen würden in die `compatibility`/`boundaryEvidence`-
  Terme einfließen, nicht die Klassifikation selbst ersetzen.
- **Falsch eingesetzt:** als Ersatz für den klassischen Multi-Evidenzkanal-Cultivator.
  SAM2 segmentiert nach Erscheinungs-/Instanzgrenzen, nicht nach geometrischer
  Kontinuität — es prüft nicht "könnten das dieselbe physische Fläche sein". Das lässt
  eine konkrete Vorhersage zu: **SAM2 allein würde vermutlich Benchmark-Stufe H
  scheitern** (gleiches Material über eine 90°-Faltung muss zwei Flächen ergeben, trotz
  identischer Erscheinung — SAM2 hat keinen Grund, dort zu trennen). Das ist keine
  Ablehnung von SAM2, sondern der Beleg, warum es ein Kanal unter mehreren bleiben muss,
  nicht der Mechanismus selbst.
- **Vor jeder Nutzung:** `sam_segmentation`s Registry-Eintrag braucht zuerst eine echte,
  geprüfte `source`-Angabe (nach demselben Protokoll wie `provenance_matrix.md` es für
  die anderen 122 Einträge schon durchgeführt hat) — sonst wird unbelegt vertraut, was
  im ganzen Projekt sonst nirgends passiert.

### Depth Anything V2 — technisch verfügbar, aber gegen die eigene Priorisierung

Ein browser-nativer DA2-Pfad (Transformers.js + ONNX + WebGPU, teils sogar in Echtzeit
auf Kamera-Streams) ist real und würde funktionieren. Aber: `shaded-reconstruction`s
eigene Provider-Entscheidungsbaum sagt ausdrücklich:

> gemessen > multiview-rekonstruiert > engine-bekannt > geführt geschätzt > **monokular
> geschätzt**

und reiht Einzelbild-Strukturmessung (Konturen, Fluchtpunkte, gemessene Kantenvektoren —
genau das, was die gesamte village-Cube- und Cultivation-Arbeit dieser Session macht)
ausdrücklich VOR `MonocularDepthProvider`. Ein funktionierender Browser-DA2-Pfad ändert
diese Priorität nicht — er macht nur die am wenigsten bevorzugte Option bequemer
verfügbar. Sinnvoll als Fallback für Bereiche, die die Cultivation nicht messen kann
(mit INFERRED-Provenienz, klar markiert), nicht als Abkürzung an der Cultivation-Arbeit
vorbei.

### TripoSR / Stable Fast 3D — verifiziert, aber am weitesten von "gemessen" entfernt

Beide sind echte, geprüfte (VERIFIED) Repos für Bild-zu-Mesh-Generierung. Das ist die
gleiche Kategorie wie `zero123plus` (bereits in `shaded-reconstruction`s eigener
Bausteinliste als "Multi-View Completion Worker" geführt, niedrig priorisiert). Passt zur
selben Rolle: GENERATED-Provenienz, ausschließlich zur Vervollständigung von UNKNOWN-
Bereichen, niemals zur Überschreibung gemessener Cultivation-Ergebnisse — deckt sich mit
jedem "Verbotene erfundene Information"-Absatz in `fixture-taxonomie.md`.

## 3. Nicht relevant für dieses Vorhaben — unabhängig vom Browser-Status

Der zweite Teil der externen Recherche (`webgpu_water`, `tidewright`, `snowflow`,
`procedural_terrains`, `neural_planetoid`, `isosurface`, `supersplat`,
`shader_web_background`, `liquid_glass_studio`, `feather_engine`, `jungle_trail`, u. a.)
sind laut `provenance_matrix.md` überwiegend echte, verifizierte Repos — aber sie
gehören zu Rendering-/Weltsimulation-Subsystemen (Wasser, Sand, Schnee, Terrain, Splat-
Editing), die diese Session nie bearbeitet hat. Browser-nativ zu sein macht sie nicht
relevant für Cultivation/Rekonstruktion — das ist eine andere Achse. Wert für eine
künftige Sandbox-/Rendering-Session, aber außerhalb dieses Themas.

## 4. Was die externe Kritik an der "Tier-Einteilung" übersieht

Die externe Empfehlung, die komplette Providerliste unter "browser-nativ vs.
Server-Pflicht" neu zu taxonomieren, weil "die aktuelle Tier-Einteilung dafür schlicht
die falsche Taxonomie" sei, übersieht, dass die Tier-Einteilung (`numpy`/`torch`/`api`)
und `provenance_matrix.md`s VERIFIED/PARTIAL/QUESTIONABLE/MISSING bereits zwei
unterschiedliche, bereits beantwortete Fragen sind (welcher Sprachstack; ist die
behauptete Quelle echt) — Browser-nativ/Server-Pflicht wäre eine dritte, zusätzliche
Achse, kein Ersatz für die anderen zwei.

## 5. Ausdrücklich offen

- Kein Code geändert, kein Provider registriert oder umbenannt.
- `sam_segmentation` und `depth_anything_v2` haben weiterhin keine verifizierte Quelle in
  `tools/gpu-providers.all.json` — das wäre der eigentliche nächste Schritt, nach
  demselben Protokoll wie `provenance_matrix.md`, nicht das Vertrauen auf externe
  Behauptungen.
- Keine vollständige Browser-nativ-Prüfung der übrigen ~119 Provider — das wäre ein
  eigenes, großes Vorhaben nach dem `research-radar-themen.md`-Prüfraster, nicht Teil
  dieser Notiz.
