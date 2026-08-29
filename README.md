# SHADED

**Ein Bild, ein WebGL-Effekt und ein ausdrücklich generierter Raum-Prototyp.**

SHADED ist eine statische WebGL-2-Anwendung. Die Hauptansicht verändert ein einzelnes
2D-Bild mit heuristischen Shader-Effekten. Die getrennte Raumansicht baut daraus eine
relative Point Cloud, Fit-Hypothesen, eine absichtlich einfache Spiegelhülle und ein
Oberflächenraster. Das Ergebnis ist begehbar, aber weder eine gemessene Rekonstruktion
noch ein physikalisch verlässliches Weltmodell.

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

### Als App installieren

SHADED enthält Manifest, Service Worker und Installations-UI für eine Progressive Web
App. Über `localhost` oder eine HTTPS-Bereitstellung kann im Seitenmenü
**⬇️ SHADED installieren** erscheinen, wenn der konkrete Browser die Installation
anbietet. Runtime und Autoren-Editor werden als App-Shell
offline vorgehalten; das kanonische Demo-Paar ist ebenfalls vorab gecacht. Selbst
geladene Szenen bleiben lokale Benutzerdaten und werden nicht ungefragt in den
Service-Worker-Cache kopiert. `npm run verify:pwa-browser` prüft Service-Worker-
Aktivierung, Offline-Navigation, Demo-Cache und Raumansicht in Chromium; den nativen
Installationsdialog einer konkreten Browser-/OS-Kombination kann dieser Test nicht
erzwingen.

Die frühere Single-File-Grenze ist aufgehoben: `index.html` ist der eine, einzige
Einstiegspunkt und trägt sowohl die Engine als auch die Editor-Shell (Topbar/Rail/
Inspector) im selben Dokument — kein `<iframe>` mehr. Installation, Offline-Lifecycle,
Editor-Panels und weitere Runtime-Module leben in eigenen Dateien unter `runtime/` und
`editor/`. Dadurch können räumliche Systeme und die Engine selbst schrittweise nach
Verantwortlichkeit modularisiert werden, ohne eine zweite Shader- oder
Materialwahrheit einzuführen.
Interaktion (Runde 4): `WASD` weckt die Spielfigur (Fußspuren, Trampelpfade, Schneedellen), `Leertaste` Sprint (Laub stiebt, Früchte fallen), `F` bzw. 🔥 Feuer-Tool entzündet Lagerfeuer (Warmlicht, Rauch, Brandspuren; Regen löscht). Ohne Eingabe bleibt SHADED ein reines Ambient-Stück.

**Spatial Export:** Der Button **🌌 PointCloud** exportiert aus Szenenfarbe + geladener Tiefenkarte ein lokales JSON-Point-Cloud-Format (`SHADED.spatial-point-cloud.v1`) mit Position, Farbe, Punktgröße, Alpha und Confidence. Programmatic API: `SHADED.spatial.pointCloud({step,fovDegrees})` und `SHADED.spatial.downloadPointCloud()`. Das übernimmt aus dem Zip nur die funktional nützliche Depth→Point-Cloud-Idee – ohne Android-/Three.js-Runtime und ohne verdeckte Rückseiten vorzutäuschen.

**Freie Raumansicht:** **🧭 Raum frei ansehen** rendert dieselbe Depth→Point-Cloud in
einem eigenen WebGL-Viewer. Ziehen dreht die Kamera, `Shift`+Ziehen verschiebt sie und
das Mausrad fährt hinein oder heraus. Der Laufmodus ergänzt WASD und eine anklickbare
Übersichtskarte. Dijkstra berücksichtigt neben Blockaden auch die laufenden Kosten von
Wasser, Eis, Matsch, Feuer, Rauch und Wachstum. Bewegungen prüfen alle durchquerten
Rasterzellen; Dykstra projiziert den Schritt auf Raumgrenze und Schrittradius.

Das dauerhaft sichtbare Feld **So entsteht der Raum** schaltet zwölf Diagnoseansichten
einzeln: Ausgangspunkte, relativer Tiefenhinweis, lokale Richtungen, zusammenhängende
Gruppen, Grobformen, Spiegelhülle, Raumzellen, Weltfelder, Begehbarkeit, Baumgrenze,
Himmel und die Zusammensetzung. Die Texte erklären die Rolle jeder Stufe, nennen aber
keine internen Schwellenwerte. Beobachtete und erzeugte Punkte bleiben farblich und in
der Provenienz getrennt.

Die Rekonstruktion schätzt lokale Normalen, bildet zusammenhängende Oberflächen und
fittet Ebenen, Boxen und Zylinder. Angezeigt werden gemessene Abdeckung und RMSE.
Generierte Flächen werden aus den Fits neu abgetastet. Für die verlangte Umrundung des
Hauses kommt zusätzlich eine absichtlich grobe, dunkel gerenderte Spiegelhülle mit
Randwänden hinzu. Beides trägt `GENERATED`: Es ist keine gemessene Rückseite und keine
prozentuale Qualitätszusage. Farben stammen aus den tatsächlich protokollierten nächsten
Quell-Patches.

Die Point Cloud wird in ein Sparse-Voxel-Feld überführt: unbekannter Raum bleibt
implizit, Kamerastrahlen markieren freien Raum und Treffer Oberflächen. Voxel speichern
Material, Confidence, Provenienz und Zustandsfelder. Der Stiftmodus verarbeitet Pointer
Pressure, Tilt und Eraser, verändert echte Voxel und unterstützt Undo/Redo sowie
Projekt-Import/-Export. Die Oberfläche kann als indiziertes Block-Mesh extrahiert
werden. Ein mit `gpu-spatial.mjs bundle` erzeugtes Provider-Bundle lässt sich direkt in
dasselbe Feld importieren.

Wasser, Eis, Schnee, Brennstoff, Feuer, Rauch, Matsch und Kontamination liegen auf dem
aus den Voxeln abgeleiteten Oberflächenraster. Interner Wassertransport ist
massenerhaltend und folgt Höhenpotentialen; Verbrennung verbraucht Brennstoff und kann
auf benachbarte, windabhängig gewichtete Zellen übergreifen. Windrichtung ist ein
Eingabeparameter. Geometrieänderungen übertragen den Rasterzustand auf das neue Raster.
Blut und Urin bleiben skalare Oberflächenfelder mit visueller Färbung, keine
dreidimensionale Stoff- oder Flüssigkeitsphysik. Der richtungsabhängige Sky-Shader ist
ein günstiger Hintergrund für Wolken und Bergsilhouette, kein Raymarcher durch die
Weltgeometrie.

**Räumlicher Jahreszeiten-Showcase:** Im freien Raum startet **🌸 Jahreszeiten-Showcase**
einen schnellen, geloopten Jahresbogen mit beschleunigtem Tag-/Nachtwechsel: Tau,
Blumen- und Fruchtwerte auf Rasterzellen beziehungsweise Kronen-Samples, sengende Hitze,
Sturm mit Regen/Hagel/Nebel, trockenes Herbstlaub und Zerfall, Schnee/Eis im Winter,
Tauwetter mit Pfützen und Matsch sowie abschließendes Zuwachsen. Während der nassen
Phasen entsteht demonstrativ ein Trampelpfad; in der letzten Phase schließen Gras und
Kriechgewächse ihn wieder. Der Showcase setzt keine Sonderbilder, sondern treibt
dieselben gekoppelten räumlichen Felder wie die manuellen Regler.

**Räumliche Regie und Aufnahme:** Saison, ein Ereignis und Dauer werden als geordnete
Zeilen verwaltet und auf Wunsch abgespielt oder per Canvas-`MediaRecorder` aufgenommen.
Der Seed macht die räumlichen Zufallsereignisse reproduzierbar. Das Diagnosefenster
protokolliert UI-Events, Ereignisse und alle 250 ms gerundete Stichproben ausgewählter
Mittelwerte; es ist ausdrücklich kein lückenloses Zelländerungsprotokoll.

**Showcase-Modus:** Der Button **🎪 Showcase (90s)** lädt bei Bedarf das Demo-Dorf, schaltet in den Kino-Modus und spielt eine feste 90-Sekunden-Parameterfolge ab: 2.5D-Parallaxe, Wind/Nebel, Regenvisualisierung, Fensterreflexionen, Blitz-/Feuereffekte, Figuren-Spuren, Verfall, Schnee und Frühling. `SHADED.showcase.start()` startet denselben Ablauf programmatisch, `SHADED.showcase.board()` legt die Schritte in den Storyboard-Editor.

**Elemente-Spielplatz:** Die UI hat direkte Presets für 💧 Flüssigkeit, ♨️ Dampf, 🫧 Druck, 🔥 Hitze, 🟤 Matsch, 🧊 Eis, ❄️ Schnee, 🔥 Feuer, 🌫️ Rauch, 🪵 Glut, 🌋 Lava, 🌧️ Regen, 🧊 Hagel, 🍂 Blätter und ⚡ Blitze. Diese Buttons treiben Parameter, Trail-Textur, Partikel und Shader-Uniforms. In der Hauptansicht sind das gekoppelte visuelle Regeln, keine Stoffphysik.
Die “kleckernd klotzen”-Schicht läuft im Fragment-Shader selbst: transiente Element-Uniforms verstärken kleckernde Nass-Splatter, Druckwellen im Sound-Feld, Hagel-Einschläge, Glut-/Lava-Blackbody-Glow und Hitze-Chromatik, statt alles nur als Canvas-Overlay über das Bild zu legen.
Darüber liegt ein zusätzlicher Shader-Stack für Godrays, abgeleitetes Bump-/Normal-Mapping, Ambient Occlusion, mehrstufige Lichtquantisierung, volumetrische Wolken/Lichtschächte, Bloom-Halos, Spatial Distortion, Chromatic Aberration und depth-aware Point-Cloud-Motes – alles aus dem Einzelbild, der optionalen Tiefenkarte und den bestehenden World-Law-Kanälen.

**Wally-Monokel (Runde 8):** Tasten `1`–`5` schalten Inspektions-Linsen um (erneutes Drücken = aus): 1 Schmutz/Abnutzung, 2 Belastung, 3 Klang (`SHADED.sound.emit(u,v,strength)` stempelt eine abklingende Welle), 4 Materialtreue (= unverändertes Bild), 5 Kanten. API: `SHADED.lens.set(n)`/`.get()`.

**Dialog-Engine (Runde 10):** `SHADED.dialogue.play(beats)` spielt eine Liste von Text-/Trigger-Beats mit Schreibmaschinen-Effekt ab (Leertaste/Enter/Klick = weiter). Die Engine kennt keinen Inhalt – echte Erzähltexte liegen separat in `content/*.js` (z. B. `content/prolog-act1.js`, optional per `<script>` einbinden) und werden nie automatisch geladen.

**Asset-Werkzeuge (Runde 9–10, alle offline, lokal, kein Netzwerkzugriff):** `tools/costume-browser.html` benennt SCUMM-Kostümressourcen aus einer selbst bereitgestellten Ressourcendatei; `tools/sprite-exporter.html` macht daraus echte Sprite-Sheet-PNGs + Manifeste (ZIP-Download). Keines der beiden lädt oder sendet Dateien über das Netzwerk – siehe `docs/round-9-asset-boundary.md`.

**Ökosystem-Verwaltung (Runde 7):** 4 neue Buttons in der Tools-Leiste laden jeweils einen Charaktergruppen-Satz:
- 🐱 **Katzen-Schwarm** (4 animierte Sprite-Actor): bunt gemischte Animationen (laufen, fressen, faulenzen)
- 👿 **Feinde** (3 statische Charaktere): GAIME-Monster mit räumlich korrektem Depth-Layer
- 🧑 **NPCs** (4 Stadtbewohner): Marktszenen-Figuren mit Tiefenordnung
- ⚔️ **Helden** (3 spielbare Charaktere): Nib, Brugg, Vellum mit individueller Tiefenschicht

Actors sind rein optisch (beeinflussen nicht `classGrid` oder `getMaterialTypeAt`) und reagieren auf Nebel/Nacht-Parameter (globalAlpha-Kopplung für natürliche Sichtbarkeit).


## Deployment

### Vercel über GitHub Actions

Die App hat keinen Build-Schritt. `vercel.json` setzt Header für Service Worker,
Manifest und ES-Module; `.vercelignore` beschränkt den Upload auf die ausführbare App
und die drei kanonischen Demo-Bilder. Der Workflow
`.github/workflows/vercel.yml` prüft die räumliche Prozessansicht und den Weg hinter das
Haus, erzeugt danach mit der fest gesetzten Vercel-CLI ein Preview-Artefakt für Pull
Requests und ein Produktionsartefakt für `main`.

Im GitHub-Repository müssen drei Actions-Secrets gesetzt werden:
`VERCEL_TOKEN`, `VERCEL_ORG_ID` und `VERCEL_PROJECT_ID`. Solange sie fehlen, läuft die
Verifikation weiter und der Deploy-Schritt wird mit einer sichtbaren Erklärung
übersprungen. In Vercel lautet das Framework-Preset **Other**, das Root Directory ist
`.`; Build Command und Output Directory bleiben leer.

Der manuell startbare Workflow `.github/workflows/rtx-spatial.yml` läuft nur auf einem
eigenen Linux-Runner mit den Labels `gpu` und `rtx-3060`. Er prüft das reale CUDA-Gerät,
installiert die gewählten offiziellen Provider in eine isolierte Python-Umgebung, führt
DA3 und/oder DA2 nacheinander mit CUDA/FP16 aus und lädt validierte, direkt importierbare
Provider-Bundles als Workflow-Artefakt hoch. Modell-Lade- und Inferenzzeit werden aus
dem echten Lauf ins Job-Summary geschrieben; sie werden nicht lokal emuliert.

### Nginx-Container

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

**Materialschicht / Licht-Material-Trennung (optional, Companion-Datei):** Das Quellbild enthält eingebackenes Licht – ohne Trennung multipliziert jedes Weltgesetz darauf, wodurch Schatten doppelt beschattet werden. SHADED zerlegt deshalb Beleuchtung und Reflektanz. Das **eingebaute Backend läuft im Browser** (deterministische Tiefpasstrennung der log-Luminanz, einmal beim Import) – **keine GPU, kein Python, kein Modell-Download**. Wer ein stärkeres Backend hat (RGB→X, IntrinsicReal, De-Lighter), backt das Beleuchtungsfeld **einmal** und legt es als `bild_shading.png` neben das Szenenbild: 8-Bit-Graustufen, **128 = neutral**, dunkler = Schatten. Es wird dann automatisch geladen und aktiviert – jeder ohne entsprechende Hardware bekommt die bessere Qualität geschenkt, ohne selbst ein Modell auszuführen. Ohne Datei bleibt das eingebaute Backend aktiv; fällt ein Provider aus, rendert SHADED exakt wie ohne Materialschicht (`identity-albedo`). Steuerung: `SHADED.intrinsic.setStrength(0..1)`, Regler im Editor. Details: [`docs/neuronale-materialien-svbrdf-pbr.md`](docs/neuronale-materialien-svbrdf-pbr.md).

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

## Fähigkeiten und Einordnung

Die aktuelle Fähigkeitsmatrix und die überprüfbare Produkt-Einordnung stehen in
[`docs/shaded-faehigkeiten.md`](docs/shaded-faehigkeiten.md). Sie trennt die
2D-Shaderregeln, den räumlichen Prototyp, externe Provider und nicht implementierte
Fähigkeiten.

## Architektur (Kurzfassung)

Single-File-App (`index.html`), WebGL 2 / GLSL ES 3.00, kein Build-Step.

1. **Analyse (CPU, einmalig bei „Erstellen”):** Segmentierung in 8 Klassen → weiche Masken-Texturen; Chamfer-Distanz und Blur-Gradient → visuelle Pfützen-/Rinnsalmasken; Fenster → Emissiv-Glow. `classGrid` bleibt für Abfragen (`SHADED.getMaterialTypeAt`) erhalten und speist dieselbe Materialtextur wie der Shader.
2. **Shader (GLSL, 1 Fragment-Pass):** gesteuert von 13 High-Level-Parametern (`dayNight, storm, rain, wet, puddle, fog, wind, glow, decay, temperature, bloom, autumn, snow`) sowie zusätzlichen Effekt-Uniforms. Nässe, Pfützen, Rinnsale, Regen, Nebel, Blitze, Wolkenschatten, Fensterlicht, Moos, Schnee und weitere Zustände sind Bildregeln ohne kalibrierte physikalische Einheiten.
3. **Storyboard-Engine:** Schritte = Parameter-Keyframes mit Dauer, smoothstep-Blending, Loop. Standard-Arc wird bei „Erstellen” geladen und gestartet.
4. **Actor-System (Runde 7+):** Overlay-Canvas-basierte animierte Charaktere mit Tiefenschicht-Ordnung (front/mid/back) und atmosphärischer Kopplung (fog/dayNight).

Details: [`.claude/skills/shaded-pipeline/SKILL.md`](.claude/skills/shaded-pipeline/SKILL.md)

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

**Definition of Done** für visuelle Arbeit: Die Akte werden im Browser gegen die
Zielbilder geprüft. Das ist ein visueller Vergleich; er beweist keine physikalische
Richtigkeit oder Rekonstruktionsqualität.

## RTX-/GPU-Provider ohne Renderer-Lock-in

`tools/providers/depth_anything_v2.py` verwendet die offizielle Transformers-API für
Depth Anything V2. `tools/providers/depth_anything_3.py` verwendet die offizielle
`DepthAnything3`-API. Beide Adapter prüfen CUDA über Torch, aktivieren FP16 nur auf CUDA,
wenden die tatsächlich konfigurierte Bildkante und das Punktbudget an und schreiben
Depth, Normalen, Punkte sowie – falls vom Modell geliefert – Confidence. Modellgewichte
werden nicht im Repository mitgeführt; Installation und Lizenzen der gewählten Modelle
bleiben beim Betreiber.

```bash
node tools/gpu-spatial.mjs probe
node tools/gpu-spatial.mjs doctor --config tools/gpu-providers.example.json
node tools/gpu-spatial.mjs run --config tools/gpu-providers.example.json --provider depth-anything-3 --input bild.png --out tools/gpu-out/da3
node tools/gpu-spatial.mjs run --config tools/gpu-providers.example.json --provider depth-anything-v2 --input bild.png --out tools/gpu-out/da2
node tools/gpu-spatial.mjs compare --a tools/gpu-out/da3/result.json --b tools/gpu-out/da2/result.json --out tools/gpu-out/vergleich.json
node tools/gpu-spatial.mjs bundle --manifest tools/gpu-out/da3/result.json --out tools/gpu-out/da3.shaded-provider.json
```

Abhängigkeiten stehen getrennt in
`tools/providers/requirements-depth-v2.txt` und
`tools/providers/requirements-depth-v3.txt`. `doctor` beendet sich mit Status 2, wenn
ein Adapter nicht lauffähig ist. In einer Umgebung ohne `nvidia-smi` wird CPU/FP32
gewählt; das ist ein Diagnoseergebnis und kein GPU-Test.

**Zusätzliche Provider:**
- `vggt` (`tools/providers/shaded_vggt.py`): VGGT (CVPR 2025) — ein Feed-Forward-Transformer
  liefert in einem Durchlauf Tiefe + Kamera-Intrinsics/Extrinsics + Punktwolken. Nutzt das
  `SHADED.spatial-provider-result.v1` Schema via `shaded_provider_common.write_result`.
  Abhängigkeit: `pip install torch vggt`.
- `mapanything` (`tools/providers/shaded_mapanything.py`): MapAnything (Salesforce Maps)
  REST-API für Distanzmatrix und VRP/TSP-Routing. Rasterisiert Routen-Gehzeiten als
  Tiefe-Feld, leitet Normale aus Route-Richtungen ab und extrahiert Wegpunkte als
  3D-Anker. Keine GPU/Torch-Abhängigkeit; offline-testbar via `--use-fixture`.

Jedes der obigen Provider ist in `tools/gpu-providers.example.json` registriert und kann
über `python3 tools/providers/<name>.py --doctor` auf Existenz geprüft werden.

Jedes `result.json` wird mit Ajv tatsächlich gegen
`contracts/shaded-spatial-provider.schema.json` validiert. Für alle Binärkanäle werden
Pfadgrenzen, Shape, Bytezahl und endliche Floatwerte geprüft. `compare` misst bei
relativen Modellen nur standardisierte Strukturübereinstimmung und bezeichnet sie nicht
als Rekonstruktionsqualität. Das Bundle enthält validierte Kanäle mit SHA-256 und kann
vom räumlichen Browser-Editor importiert werden.

Der Voxel-Pinsel verarbeitet Pointer Events einschließlich `pressure`, `tiltX`,
`tiltY` und Eraser. Radius und Deckkraft reagieren auf den Druck; Material und Farbe
werden in den kanonischen Sparse-Voxel-Zustand geschrieben. Undo, Redo, JSON-Projekt,
Provider-Import und Block-Mesh-Export sind über die UI beziehungsweise
`SHADED.spatial.voxel` erreichbar. Eine SDF, TSDF oder herstellerspezifische
XP-Pen-Treiberintegration wird nicht behauptet.
