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
| **`sam_segmentation`** | war **MISSING**, jetzt korrigiert | `MISSING` bedeutete hier nur "nicht im 991-Repo-Starred-Scrape gefunden", nicht "keine echte Quelle" — der Maintainer hat die reale, kanonische Quelle direkt bestätigt: `https://github.com/facebookresearch/sam2` (Metas offizielles Repo, genau der "internal/baseline/paper"-Fall, den die MISSING-Kategorie selbst schon vorsieht). Zusätzlich `https://github.com/isl-org/Open3D/issues/4929` — keine Provider-Quelle, sondern eine konkrete Integrationsanleitung (RGB + Depth + 2D-Maske → gefilterte Punktwolke → Bounding Box), s. u. Beides jetzt in `tools/gpu-providers.all.json` als `source`/`integration_reference` hinterlegt, s. `tools/provenance_matrix.md` §"Post-Audit Correction". |
| **`depth_anything_v2`** | war **MISSING**, jetzt korrigiert | Gleicher Fall: `https://github.com/DepthAnything/Depth-Anything-V2` (offizielles Repo), Vorgänger `https://github.com/LiheYoung/Depth-Anything` (v1) zur Herkunft mitgegeben. Jetzt als `source`/`predecessor_source` in der Registry. |
| `depth_anything_cpp` | VERIFIED (localai-org/depth-anything.cpp) | eine Variante existiert seit dem ursprünglichen Audit-Lauf bereits geprüft |

`sam_segmentation`s `capabilities`-Feld im Registry-Eintrag lautet weiterhin
`['depth', 'confidence']` — wie fast jeder andere `perception`-Eintrag der Registry
(`semantic_mask_filter`, `photometric_stone_provider`, `pixel_extractor` ebenso), also
ein registry-weites, nicht auf diesen Eintrag beschränktes Platzhalter-Problem. Die
gesamte Registry kennt nur vier Fähigkeits-Tags (`depth`, `normals`, `points`,
`confidence`) — kein `masks`/`segmentation`-Tag existiert überhaupt. Ein neues Tag
einzuführen wäre eine Vokabular-/Schema-Erweiterung, keine Datenkorrektur — bewusst NICHT
in dieser Session gemacht, nur benannt (s. §5).

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
- **Der Integrationsschritt ist jetzt konkret belegt:** Open3D-Issue #4929 beschreibt
  exakt den Weg von SAM2-Maske + Depth-Provider-Output zu gefilterten 3D-Punkten (RGBD-
  Image → Punktwolke → Filterung nach 2D-Maske → Bounding Box) — das ist die technische
  Brücke zwischen "SAM2 liefert einen Evidenzkanal" (oben) und "daraus wird tatsächlich
  3D-Geometrie". Kein SHADED-spezifischer Code, aber ein konkretes, nachvollziehbares
  Muster statt einer vagen Absicht.

### Depth Anything V2 — jetzt tatsächlich BEWIESEN lauffähig, nicht mehr nur behauptet

**Update (2026-09-01):** `tools/scratch-test-transformersjs-depth.mjs` — `npm install
@huggingface/transformers` (Node 22, keine GPU, kein CUDA, kein Torch), echte Inferenz mit
`onnx-community/depth-anything-v2-small` auf der village-cube-Fixture:
Pipeline-Ladezeit 368 ms, Inferenz 1466 ms auf 1536×1024, CPU/WASM-Backend. Die Ausgabe ist
visuell geprüft korrekt (Tiefenkarte zeigt die 6 Häuser mit richtiger Tiefenordnung,
näher = heller, sauber abgegrenzte Würfelkanten, auch kleine Büsche/Steine korrekt erfasst)
— kein Blindflug, echtes Bild verifiziert. Das widerlegt direkt die bisherige Annahme in
`docs/shaded-faehigkeiten.md` und dieser Datei, dass Depth-Anything-Inferenz zwingend
CUDA/Torch braucht: **ein reiner CPU/WASM-Pfad über `@huggingface/transformers` (npm) läuft
in Sekunden, ganz ohne GPU.** Getrennt davon bleibt der (nie fertiggestellte)
`webgpu-depth-anything/`-Spike in diesem Repo weiterhin unfertig (kein Emscripten, keine
kompilierte `.wasm`-Datei, Modell-Lade-Code im TypeScript auskommentiert) — das ist NICHT
derselbe Pfad wie der jetzt bewiesene; `@huggingface/transformers` ist ein fertiges,
externes npm-Paket, keine hier gebaute Eigenentwicklung.

Ein browser-nativer DA2-Pfad (Transformers.js + ONNX + WebGPU, teils sogar in Echtzeit
auf Kamera-Streams) ist real und würde funktionieren — jetzt nicht mehr nur „würde", sondern
gemessen. Aber: `shaded-reconstruction`s eigene Provider-Entscheidungsbaum sagt ausdrücklich:

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

- **Erledigt seit der ersten Fassung:** `sam_segmentation` und `depth_anything_v2` haben
  jetzt reale, maintainer-bestätigte `source`-Einträge in `tools/gpu-providers.all.json`,
  dokumentiert in `tools/provenance_matrix.md`s "Post-Audit Correction". Kein
  SHADED-Ausführungscode geändert — nur Registry-Metadaten.
- **Weiterhin offen:** kein neues `masks`/`segmentation`-Fähigkeits-Tag eingeführt
  (registry-weite Vokabular-Lücke, betrifft mehrere Einträge, keine Ad-hoc-Erweiterung
  für nur diesen einen).
- **Erledigt für DA2:** ein browser-nativer/CPU-nativer DA2-Pfad ist jetzt tatsächlich
  getestet, siehe oben — `@huggingface/transformers` + `onnx-community/depth-anything-v2-small`,
  echte Inferenz in <2s ohne GPU, visuell verifiziert. Kein SHADED-Produktionscode
  geändert — reines `tools/scratch-*`-Experiment, keine Integration in `runtime/`.
  SAM2 bleibt ungetestet.
- Keine vollständige Browser-nativ-Prüfung der übrigen ~119 Provider — das wäre ein
  eigenes, großes Vorhaben nach dem `research-radar-themen.md`-Prüfraster, nicht Teil
  dieser Notiz.
