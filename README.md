# SHADED

**Ein Bild. Erstellen. Lebendig.**

SHADED verwandelt ein einzelnes 2D-Bild per Shader in eine atmende Szene – Environmental Storytelling ohne 3D, ohne Assets, ohne Build-Step. Ein Bild laden, **✨ Erstellen** drücken, und das Dorf durchlebt einen filmischen Bogen: goldener Tag → aufziehender Sturm → nächtliches Unwetter mit Regen, Wasserflussnetz, Blitzen und warm erleuchteten Fenstern, die sich in Pfützen spiegeln → nebliges Morgengrauen → der glitzernd nasse Tag danach.

## Quickstart

```bash
# Variante A: direkt (Demo-Button braucht Variante B)
#   index.html im Browser öffnen, eigenes Bild laden, „Erstellen“ drücken.

# Variante B: mit lokalem Server (empfohlen)
python3 -m http.server 8000
# -> http://localhost:8000/index.html
# -> „🖼️ Demo-Dorf laden“ -> „✨ Erstellen“
```

Steuerung: `K` = Kino-Modus (UI aus), Akt-Buttons springen zu Stimmungen, „Experten-Regler" für Feintuning, 📸 PNG-Snapshot, 🔴 WebM-Aufnahme, Storyboard-Editor für eigene Abläufe.
Interaktion (Runde 4): `WASD` weckt die Spielfigur (Fußspuren, Trampelpfade, Schneedellen), `Leertaste` Sprint (Laub stiebt, Früchte fallen), `F` bzw. 🔥 Feuer-Tool entzündet Lagerfeuer (Warmlicht, Rauch, Brandspuren; Regen löscht). Ohne Eingabe bleibt SHADED ein reines Ambient-Stück.

**Wally-Monokel (Runde 8):** Tasten `1`–`5` schalten Inspektions-Linsen um (erneutes Drücken = aus): 1 Schmutz/Abnutzung, 2 Belastung, 3 Klang (`SHADED.sound.emit(u,v,strength)` stempelt eine abklingende Welle), 4 Materialtreue (= unverändertes Bild), 5 Kanten. API: `SHADED.lens.set(n)`/`.get()`.

**Ökosystem-Verwaltung (Runde 7):** 4 neue Buttons in der Tools-Leiste laden jeweils einen Charaktergruppen-Satz:
- 🐱 **Katzen-Schwarm** (4 animierte Sprite-Actor): bunt gemischte Animationen (laufen, fressen, faulenzen)
- 👿 **Feinde** (3 statische Charaktere): GAIME-Monster mit räumlich korrektem Depth-Layer
- 🧑 **NPCs** (4 Stadtbewohner): Marktszenen-Figuren mit Tiefenordnung
- ⚔️ **Helden** (3 spielbare Charaktere): Nib, Brugg, Vellum mit individueller Tiefenschicht

Actors sind rein optisch (beeinflussen nicht `classGrid` oder `getMaterialTypeAt`) und reagieren auf Nebel/Nacht-Parameter (globalAlpha-Kopplung für natürliche Sichtbarkeit).


## Deployment

SHADED bleibt eine statische Single-File-Web-App ohne Runtime-Build. Für den Webserver ist die robuste Standard-Variante der mitgelieferte Nginx-Container:

```bash
docker build -t shaded .
docker run --rm -p 8080:80 shaded
# -> http://localhost:8080/
# Healthcheck: http://localhost:8080/healthz
```

Der Container kopiert `index.html`, die Design-Bilder, Tiefenkarten, Test-Assets und Dokumentation unverändert in `/usr/share/nginx/html`. `nginx.conf` liefert `/healthz` für Deploy-Plattformen (z. B. Coolify) und lässt die App über `/` sowie `/index.html` laufen.

## Assets im Repo

| Datei | Rolle |
|---|---|
| `file_00000000974871f49fe71f6b456f9579.png` | **Ausgangsbild** (Dorf mit echten Fenstern) – Demo-Button lädt es |
| `file_00000000c84071f4bcd6ff9afdba7246.png` | **Fenster-Marker-Overlay** zum Ausgangsbild (Fenster pink übermalt) – Demo lädt es automatisch mit |
| `ResizedImage_2026-06-30_10-29-19_2317[41].png` | Legacy-Ausgangsbild (Dorf OHNE echte Fenster – Testfall für Palette-Map & Heuristik) |
| `file_0000000029f871f4bc597d92064d2e97.png` | **Frühlings-Zielbild** (Dorf in voller Blüte – Referenz für den `fruehling`-Akt) |
| `ResizedImage_2026-06-30_23-14-34_6442[1].jpg` | Taverne, bunt & sonnig (zweite Testszene: anderer Stil, andere Auflösung) |
| `ResizedImage_2026-06-30_23-13-00_0185[1].png` | **Taverne-Zielbild** (Regen, Matsch, Warmlicht) – Vergleich für `shot_taverne_regen.png` |
| `file_00000000b27471f4a8aeb27484b46720.png` | **Zielbild Sturmnacht** – Referenz für Nässe-Abdunklung, Warmlicht, Nebel |
| `file_00000000fbc472438dcc92aff24bed6e.png` | **Zielbild Tag danach** – glitzernd nass, Pfützen, Restfeuchte |
| `1782823262240.png` | Physik-Referenz Tag: Puddle Collection, Water Bleed-out |
| `1782823374309.png` | Physik-Referenz Nacht: Wasserflussnetz, Warmlichtreflexionen, Nebelschleier |
| `1782824829119.png` | Selbstgemalte Material-Map (kanonische Palette, siehe unten) |
| `1782826101420.png` | Verfalls-Referenz („Jahre später“, Akt-Preset `verfall`) |
| `file_00000000c40471f4859a10d6bf3ac39b.png` | **Kanon-Dorf top-down** – Beleg für den Bildkanon (Fachwerk, Holzrahmen-Blauglas, Schiefer- & Terracotta-Dächer) |
| `file_00000000723471f48a11eaa8371edfb7.png` | **Kanon-Dorf perspektivisch MIT Himmel** – Testfall für die Himmel-Regel (K7) |
| `file_000000002b2871f4891c9f18768440ca.png` | **Marker-Overlay zum Kanon-Dorf top-down** (Fenster pink) – Ground Truth für den Rahmen-Fenster-Detektor |
| `file_00000000d34071f49ef2a68356e1ac7d.png` | **Marker-Overlay zum Kanon-Dorf perspektivisch** (Fenster pink) – Ground Truth |
| `Hitem3d-1783102077836-v1.glb` | **3D-Modell des Dorfes** (nicht perfekt) – Geometrie-Referenz für Runde 5+ |
| `file_00000000cb1c71f48dac6183a809fab7.png` | Graustufen-Render des Demo-Dorfs (Referenz zur Tiefenkarte) |
| `file_0000000098bc71f49c057d54182386e6.png` | **Handgemachte Tiefenkarte** zum Demo-Dorf (Weiß = nah) – Quelle für die 2.5D-Demo |
| `file_00000000974871f49fe71f6b456f9579_depth.png` | Demo-Tiefenkarte (aus obiger Karte auf Demo-Auflösung gebracht) – wird vom Demo-Button automatisch geladen |
| `gaime_shader_editor_pro_v2_6_bio_physics_edition.html` | **Eingefrorener Prototyp** – nur Referenz, nicht anfassen |
| `index.html` | Die App (Runde 1: Wasser, Sturm, Atmosphäre) |
| `tools/verify.js` | Headless-Verifikation (Playwright): Screenshots aller Akte |
| `tools/register.js` | **Registrierung**: findet die Kameraprojektion eines Referenzbilds gegen ein GLB – Pflicht-Schritt VOR jeder Depth-/Normal-Ableitung, siehe [`docs/registrierung.md`](docs/registrierung.md) |

## Kanonische Material-Palette

Für selbstgemalte Material-Maps (zweiter Datei-Input). **Achtung, historischer Zahlendreher:** `#F972E9` (Pink) war ein Tippfehler von `#F97316` (Orange) – SHADED akzeptiert beide, male neu bitte mit den kanonischen Werten:

| Klasse | Kanonisch | Bedeutung |
|---|---|---|
| grass | `#16A34A` | Rasen – absorbiert, wird matschig |
| foliage | `#AA0EB7` | Baumkronen – schwanken im Wind |
| roof | `#F97316` | Dächer – dunkeln stark bei Nässe, Tropfkanten |
| path | `#DC2626` | Pfad/Stein – Pfützen, Flussnetz, Glanz |
| wood | `#854D0E` | Holz – dunkelt stark bei Nässe |
| window | `#0F766E` | Fenster/Türen – Warmlicht bei Nacht |
| water | `#06B6D4` | Wasserflächen – immer spiegelnd |
| rock | `#475569` | Fels/Steine |

Ohne Map segmentiert SHADED das Bild selbst: HSL-Heuristik + Majority-Filter + **Kanon-Detektoren** nach dem verbindlichen [Bildkanon](docs/bildkanon.md) – Rahmen-Fenster (Glas nur im geschlossenen Holzrahmen, K3/K4), Himmel-Regel (blau-dominante helle Oberkanten-Region wird inert, K7) und Struktur-Pass (Dach-/Bodenanker: begehbare Flächen müssen am Boden verankert sein).

**Der Korrektur-Workflow – das Marker-Overlay:** Statt einer vollen Material-Map kannst Du als Zweitbild eine **Kopie der Szene** hochladen, in der Du nur dort übermalst, wo die Automatik danebenliegt. SHADED erkennt das Format automatisch (geringe Paletten-Abdeckung = Overlay) und wertet **ausschließlich die Pixel aus, die sich vom Original unterscheiden**:

- **Pink** (`#F972E9`-artig, jeder Ton von Rosé bis Magenta) = **Fenster**. Tagsüber dunkles Glas, nachts warmes Licht. Hat das Overlay Pink-Marker, gelten NUR diese als Fenster – die Heuristik hat kein Veto.
- **Jede andere kanonische Palettenfarbe** = **lokale Klassen-Korrektur**: z. B. Dach-Orange über eine Terrasse malen, die fälschlich als Pfad erkannt wurde, oder Holz-Braun über eine falsch erkannte Fläche. Der Rest des Bildes bleibt vollautomatisch.

So liefert der Workflow deterministisch Dorf-Qualität für jedes Bild – ohne KI, mit zwei Minuten Malaufwand nur an den Fehlstellen. Pink direkt im Szenenbild selbst funktioniert ebenfalls.

**2.5D-Parallaxe (optional, dritter Datei-Input):** Eine Graustufen-**Tiefenkarte** (Weiß = nah, Schwarz = fern) macht die Szene räumlich – die Maus über der Bühne schwenkt die Kamera minimal (max. 3,5 %), Nahes verschiebt sich stärker als Fernes. Liegt neben `bild.png` eine `bild_depth.png` auf dem Server, wird sie automatisch geladen – das Demo-Dorf bringt eine handgemachte Tiefenkarte mit und ist damit ab dem ersten Klick räumlich. Ohne Tiefenkarte bleibt alles exakt wie bisher (flach, deterministisch). Der UV-Versatz passiert VOR allen Textur-Lookups, damit Szene, Masken, Physik und Trails dieselbe verschobene Welt sehen. Test-API: `SHADED.parallax.set(x,y)` / `.hasDepth()`.

## SWIFT → SHADED Integration

SHADED ist das **Rendering-Ziel für prozedural generierte Charaktere** aus dem SWIFT-Repository (separates Python/Blender-CLI). SWIFT produziert Sprite-Sheets (PNG) + Manifeste (JSON) mit Frame-Rects und Animationen; diese werden via `window.SHADED.addActor()` als rein optische Overlay-Ebene geladen.

**Invariante 2 bleibt unberührt:** Actors beeinflussen NICHT `classGrid` oder `getMaterialTypeAt()`. Die Szenen-Analyse stammt allein vom Hintergrund; Actors sind Rendering-Dekoration ohne Physik-Rückwirkung.

**Manifest-Schema (v1.4.0):**
```json
{
  “mappingVersion”: “1.4.0”,
  “sourceImage”: { “w”: 256, “h”: 64 },
  “frameRects”: { “F01”: [0, 0, 64, 64], ... },
  “frames”: [{ “id”: “F01”, “key”: “walk_01” }, ...],
  “animations”: { “walk”: { “frames”: [“F01”, “F02”, ...], “fps”: 12, “loop”: true } },
  “depthImage”: “sprite_depth.png”,
  “depthSourceImage”: { “w”: 256, “h”: 64 },
  “depthFrameRects”: { “F01”: [0, 0, 64, 64], ... }
}
```

Depth-Map (optional, Phase B2): 8-bit Grayscale PNG (gleiche Größe wie RGB-Sheet). Dunklere Pixel = näher Betrachter (warm), hellere = ferner (cool). Ermöglicht räumliche Fake-3D-Tiefenordnung auf dem Canvas.

## Architektur (Kurzfassung)

Single-File-App (`index.html`), WebGL 1, kein Build-Step.

1. **Analyse (CPU, einmalig bei „Erstellen”):** Segmentierung in 8 Klassen → weiche Masken-Texturen; Chamfer-Distanz im Pfad → Pfützen-Tiefe („Wasser sammelt sich in Senken”); Blur-Gradient → Flussfeld; Fenster → Emissiv-Glow (energie-normalisiert). CPU-Wahrheit `classGrid` bleibt für Gameplay-Abfragen (`SHADED.getMaterialTypeAt`) erhalten – **identisch** zu dem, was die GPU sieht.
2. **Shader (GLSL, 1 Fragment-Pass):** gesteuert von 13 High-Level-Parametern (`dayNight, storm, rain, wet, puddle, fog, wind, glow, decay, temperature, bloom, autumn, snow`). Zusätzlich 19 simulierte Weltgesetze-Uniforms (Phase C). Effekte: Nässe-Abdunklung + Sättigung, Pfützen-Spiegelung (Szene + Himmel + Fenster-Warmlicht), Rinnsal-Netz entlang des Flussfelds, Regenschlieren + Aufprallringe + Tropfkanten, fbm-Nebel, Blitz-Doppelschläge, Wolkenschatten, Fensterflackern, Moos/Überwucherung, Glitzern am Tag danach, permanentes „Atmen” (Wind-Sway, Mikro-Exposure), plus 20 Weltgesetze-Effekte (Trocknung, Hitzeverzug, Rost, Rauchschichtung, Temperaturgradienten, etc.).
3. **Storyboard-Engine:** Schritte = Parameter-Keyframes mit Dauer, smoothstep-Blending, Loop. Standard-Arc wird bei „Erstellen” geladen und gestartet.
4. **Actor-System (Runde 7+):** Overlay-Canvas-basierte animierte Charaktere mit Tiefenschicht-Ordnung (front/mid/back) und atmosphärischer Kopplung (fog/dayNight).

Details: [`.claude/skills/shaded-pipeline/SKILL.md`](.claude/skills/shaded-pipeline/SKILL.md)

## Fahrplan

- **Runde 1 – Wasser, Sturm & Atmosphäre** ✅
- **Runde 2 – Jahreszeiten & Klima** ✅: Schnee (Bedeckung/Fall/Schmelze), Temperatur (Eis-Pfützen, Frost, Eiszapfen), Herbstfärbung/-fall, Frühlingswachstum, Sonnenbleiche → Spec: [`.kiro/specs/round-2-seasons-climate/`](.kiro/specs/round-2-seasons-climate/requirements.md)
- **Runde 3 – Material Fatigue & Verfall** ✅: Alterung als kontinuierlicher, materialabhängiger Zeitprozess: Moos, Überwucherung, Rost, Risse, morsches vs. feuchtes Holz → Spec: [`.kiro/specs/round-3-material-fatigue/`](.kiro/specs/round-3-material-fatigue/requirements.md)
- **Runde 4 – Interaktion & Ökosystem** ✅: Spieler (WASD/Dash, Trampelpfade mit echtem Decay), Lagerfeuer + Brandausbreitung, Laub-/Frucht-Partikel, Bio-Charakter (Atmung, Frostatem, Nässe) → Spec: [`.kiro/specs/round-4-interaction-ecosystem/`](.kiro/specs/round-4-interaction-ecosystem/requirements.md)

Der verbindliche Fahrplan (Runde 1–4) ist komplett umgesetzt. Darauf aufbauend:

- **Runde 5 – Strukturelle Segmentierung** (in Arbeit): Geometrie- und Nachbarschaftslogik, damit jedes Bild automatisch korrekt analysiert wird. Grundlage ist der **verbindliche [Bildkanon](docs/bildkanon.md)** (Häuser sind Fachwerk, Fenster sind IMMER holzgerahmt, Glas ohne Rahmen = kein Fenster, Himmel ist oben & inert). Umgesetzt: Bodenanker + Dach-Anker (Adjazenz-Ringe) ✅, Rahmen-Fenster-Detektor (K3/K4) ✅, Himmel-Regel (K7) ✅, Fachwerk-Signatur (K1) → Gebäudezonen ✅ (Pfützen/Flussnetz/Überwucherung sind jetzt strukturell vom Gebäude ausgesperrt, Fenster-Validierung läuft über den Zonen-Beleg) → Spec: [`.kiro/specs/round-5-structural-segmentation/`](.kiro/specs/round-5-structural-segmentation/requirements.md)

**Phase C – Weltgesetze-Erweiterung** ✅: Implementierung von **20 neuen Weltgesetzen** (31/60 = 52% Gesamtabdeckung). Alle Effekte sind deterministische Shader-Simulationen mit CPU-seitiger Phasen-Akkumulation. Umfasst 5 Implementierungs-Sprints: Trocknung, Hitzeverzug, Rauchschichtung, Temperaturgradienten, Rost, Atemwolken, Druck, Lichtverschmutzung, Mondlicht, Biom-Zonen, Vegetation-Reaktion, Stimmungs-Tint, Weltmüdigkeit, Besitz-Grenzen, Oberflächen-Runen, Schatten-Besitzverhältnis, Geruch-Diffusion, Berührungsspuren, Reparaturmarken, Segen/Fluch. → Dokumentation: [`docs/phase-c-weltgesetze.md`](docs/phase-c-weltgesetze.md)

**Runde 7 – Ökosystem-Integration** ✅: **13 lebende Charaktere** als animierte oder statische Sprite-Akteure auf dem Overlay-Canvas. 4 Ökosystem-Typen:
  - **Cats** (4 Tiere): SWIFT-generierte animierte Pixel-Art-Sprites mit Frame-Manifest
  - **GAIME Enemies** (3 Monster): Blob, Rat, Wolf aus dem GAIME-Repository
  - **GAIME NPCs** (4 Stadtbewohner): Bürger, Gastwirt, Händler
  - **GAIME Heroes** (3 Charaktere): Nib, Brugg, Vellum
  - Tiefenschicht-System (front/mid/back) für räumlich korrekte Überlagerung
  - Atmosphärische Kopplung: globalAlpha reagiert auf fog & dayNight
  → Dokumentation: [`docs/round-7-ecosystem.md`](docs/round-7-ecosystem.md)

**Phase B2 – Depth-Rendering für Actors** ✅: Tiefenkarten-basierte räumliche Integration von Characteren. Manifest v1.4.0 unterstützt optionale Depth-Maps (8-bit Grayscale PNG) mit korrespondierenden Frame-Rects. SHADED-seitige Depth-Composite-Logik: durchschnittliche Pixel-Tiefe pro Frame → Normalisierung → Wärmefärbung (warm = nah, kühl = fern). Test-Fixture mit 4-frame Tiefenprogression (0→255). → Dokumentation: [`docs/phase-b2-depth-rendering.md`](docs/phase-b2-depth-rendering.md)

**Langfrist-Vision:** [`docs/vision-weltgesetze.md`](docs/vision-weltgesetze.md) – der „Sichtbare Weltgesetze”-Katalog (aktuell 60 Systeme + Systemachsen) („Shader zeigen nicht an, dass etwas passiert. Shader SIND das Passieren.”). Design-Referenz für alles nach Runde 4.

## Instruktionen für LLMs / Agenten

**Lies zuerst [`CLAUDE.md`](CLAUDE.md)** (Invarianten & Regeln). Kiro-Nutzer: Steering liegt in [`.kiro/steering/`](.kiro/steering/), die Folge-Runden sind als Build-by-specs-Specs in [`.kiro/specs/`](.kiro/specs/) formuliert (requirements → design → tasks).

Exakter Arbeits-Workflow:

```bash
# 1. App headless verifizieren (Pflicht nach jeder Shader-/Analyse-Änderung):
npm i playwright            # einmalig; Chromium ggf. via env CHROMIUM=/pfad
node tools/verify.js        # schreibt tools/verify-out/shot_<akt>.png
# 2. Screenshots ANSCHAUEN (Bild-Tool) und gegen die Zielbilder vergleichen:
#    shot_sturmnacht.png  vs. file_00000000b27471f4a8aeb27484b46720.png
#    shot_danach.png      vs. file_00000000fbc472438dcc92aff24bed6e.png
# 3. Konsole-Fehler in der verify-Ausgabe müssen leer sein. Ausnahme: 404er
#    vom favicon und von den automatischen `<bild>_depth.png`-Proben (2.5D)
#    sind harmlos – jede Szene ohne Tiefenkarte erzeugt genau einen davon.
```

Programmatischer Zugriff im Browser (Test-API, nicht entfernen):

```js
// Szenen-Verwaltung
window.SHADED.erstellen()                                  // Analyse + Standard-Storyboard starten
window.SHADED.applyAct('sturmnacht')                       // tag|aufzug|sturmnacht|morgen|danach|verfall
window.SHADED.setParams({rain:1,wet:1})                   // Parameter-Übersteuerung, alle 0..1
window.SHADED.setTime(21.7, true)                          // Zeit; true = einfrieren (deterministisch)
window.SHADED.isReady()                                    // Analyse fertig?
window.SHADED.getMaterialTypeAt(u,v)                       // 'grass'|'roof'|... an UV-Position

// Ökosystem-Management (Runde 7+)
window.SHADED.addActor({                                   // Charakter laden
  image: <HTMLImageElement|string>,                        // RGB Sprite-Sheet
  manifest: <Object>,                                      // Manifest JSON (v1.4.0+)
  depthImage: <HTMLImageElement|string>,                   // Optional: 8-bit Grayscale Tiefenkarte
  x: 0.5, y: 0.5,                                          // Position (0–1)
  scale: 1.0,                                              // Skalierung
  anim: 'walk',                                            // Animation (aus Manifest)
  depthLayer: 'mid'                                        // front|mid|back für Tiefenordnung
})
→ actor = { setAnim(name), setPosition(x,y), setVisible(v), setDepthLayer(layer), remove() }

window.SHADED.ecosystem                                    // Aktuelle Ökosystem-Instanz
```

**Definition of Done** für visuelle Arbeit: Die Akte müssen den Zielbildern in Stimmung und Physik entsprechen (Nässe dunkelt Holz/Ziegel stark ab; Wasser sammelt sich in Pfadsenken und blutet in Grasränder aus; Fenster spiegeln warm in nassen Flächen; Nebel diffus an den Rändern) – und die Szene darf **nie** statisch wirken.
