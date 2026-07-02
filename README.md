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
| `gaime_shader_editor_pro_v2_6_bio_physics_edition.html` | **Eingefrorener Prototyp** – nur Referenz, nicht anfassen |
| `index.html` | Die App (Runde 1: Wasser, Sturm, Atmosphäre) |
| `tools/verify.js` | Headless-Verifikation (Playwright): Screenshots aller Akte |

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

Ohne Map segmentiert SHADED das Bild selbst (HSL-Heuristik + Majority-Filter + morphologische Fenster-Erkennung).

**Der Korrektur-Workflow – das Marker-Overlay:** Statt einer vollen Material-Map kannst Du als Zweitbild eine **Kopie der Szene** hochladen, in der Du nur dort übermalst, wo die Automatik danebenliegt. SHADED erkennt das Format automatisch (geringe Paletten-Abdeckung = Overlay) und wertet **ausschließlich die Pixel aus, die sich vom Original unterscheiden**:

- **Pink** (`#F972E9`-artig, jeder Ton von Rosé bis Magenta) = **Fenster**. Tagsüber dunkles Glas, nachts warmes Licht. Hat das Overlay Pink-Marker, gelten NUR diese als Fenster – die Heuristik hat kein Veto.
- **Jede andere kanonische Palettenfarbe** = **lokale Klassen-Korrektur**: z. B. Dach-Orange über eine Terrasse malen, die fälschlich als Pfad erkannt wurde, oder Holz-Braun über eine falsch erkannte Fläche. Der Rest des Bildes bleibt vollautomatisch.

So liefert der Workflow deterministisch Dorf-Qualität für jedes Bild – ohne KI, mit zwei Minuten Malaufwand nur an den Fehlstellen. Pink direkt im Szenenbild selbst funktioniert ebenfalls.

## Architektur (Kurzfassung)

Single-File-App (`index.html`), WebGL 1, kein Build-Step.

1. **Analyse (CPU, einmalig bei „Erstellen“):** Segmentierung in 8 Klassen → weiche Masken-Texturen; Chamfer-Distanz im Pfad → Pfützen-Tiefe („Wasser sammelt sich in Senken“); Blur-Gradient → Flussfeld; Fenster → Emissiv-Glow (energie-normalisiert). CPU-Wahrheit `classGrid` bleibt für Gameplay-Abfragen (`SHADED.getMaterialTypeAt`) erhalten – **identisch** zu dem, was die GPU sieht.
2. **Shader (GLSL, 1 Fragment-Pass):** gesteuert von 9 High-Level-Parametern (`dayNight, storm, rain, wet, puddle, fog, wind, glow, decay`). Effekte: Nässe-Abdunklung + Sättigung, Pfützen-Spiegelung (Szene + Himmel + Fenster-Warmlicht), Rinnsal-Netz entlang des Flussfelds, Regenschlieren + Aufprallringe + Tropfkanten, fbm-Nebel, Blitz-Doppelschläge, Wolkenschatten, Fensterflackern, Moos/Überwucherung, Glitzern am Tag danach, permanentes „Atmen“ (Wind-Sway, Mikro-Exposure).
3. **Storyboard-Engine:** Schritte = Parameter-Keyframes mit Dauer, smoothstep-Blending, Loop. Standard-Arc wird bei „Erstellen“ geladen und gestartet.

Details: [`.claude/skills/shaded-pipeline/SKILL.md`](.claude/skills/shaded-pipeline/SKILL.md)

## Fahrplan

- **Runde 1 – Wasser, Sturm & Atmosphäre** ✅
- **Runde 2 – Jahreszeiten & Klima** ✅: Schnee (Bedeckung/Fall/Schmelze), Temperatur (Eis-Pfützen, Frost, Eiszapfen), Herbstfärbung/-fall, Frühlingswachstum, Sonnenbleiche → Spec: [`.kiro/specs/round-2-seasons-climate/`](.kiro/specs/round-2-seasons-climate/requirements.md)
- **Runde 3 – Material Fatigue & Verfall** ✅: Alterung als kontinuierlicher, materialabhängiger Zeitprozess: Moos, Überwucherung, Rost, Risse, morsches vs. feuchtes Holz → Spec: [`.kiro/specs/round-3-material-fatigue/`](.kiro/specs/round-3-material-fatigue/requirements.md)
- **Runde 4 – Interaktion & Ökosystem** ✅: Spieler (WASD/Dash, Trampelpfade mit echtem Decay), Lagerfeuer + Brandausbreitung, Laub-/Frucht-Partikel, Bio-Charakter (Atmung, Frostatem, Nässe) → Spec: [`.kiro/specs/round-4-interaction-ecosystem/`](.kiro/specs/round-4-interaction-ecosystem/requirements.md)

Der verbindliche Fahrplan (Runde 1–4) ist damit komplett umgesetzt.

**Langfrist-Vision:** [`docs/vision-weltgesetze.md`](docs/vision-weltgesetze.md) – der „Sichtbare Weltgesetze“-Katalog (aktuell 60 Systeme + Systemachsen) („Shader zeigen nicht an, dass etwas passiert. Shader SIND das Passieren.“). Design-Referenz für alles nach Runde 4.

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
# 3. Konsole-Fehler in der verify-Ausgabe müssen leer sein (ein favicon-404 ist ok).
```

Programmatischer Zugriff im Browser (Test-API, nicht entfernen):

```js
window.SHADED.erstellen()               // Analyse + Standard-Storyboard starten
window.SHADED.applyAct('sturmnacht')    // tag|aufzug|sturmnacht|morgen|danach|verfall
window.SHADED.setParams({rain:1,wet:1}) // 9 Parameter, alle 0..1
window.SHADED.setTime(21.7, true)       // Zeit setzen; true = einfrieren (deterministische Frames)
window.SHADED.isReady()                 // Analyse fertig?
window.SHADED.getMaterialTypeAt(u,v)    // 'grass'|'roof'|... an UV-Position
```

**Definition of Done** für visuelle Arbeit: Die Akte müssen den Zielbildern in Stimmung und Physik entsprechen (Nässe dunkelt Holz/Ziegel stark ab; Wasser sammelt sich in Pfadsenken und blutet in Grasränder aus; Fenster spiegeln warm in nassen Flächen; Nebel diffus an den Rändern) – und die Szene darf **nie** statisch wirken.
