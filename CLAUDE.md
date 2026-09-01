# CLAUDE.md – Projektregeln SHADED

SHADED macht aus EINEM 2D-Bild per WebGL-Shader eine lebendige, atmende Szene
(Environmental Storytelling). Kernversprechen: **Bild laden → „✨ Erstellen” → die Szene lebt.**

## Referenzdokument: `docs/SHADED_BEUTELTIER_ARCHITEKTUR_REFERENZ_ERWEITERT_CHAT_INTEGRIERT.md`

Dieses Dokument ist die ausführliche Architektur- und Denkmodell-Referenz für SHADED
(Kernprinzipien: „One image. One small world.", Reconstruct in dependency order,
OBSERVED/DERIVED/INFERRED/INVENTED/UNKNOWN, Provider als Werkzeuge statt Autorität,
Falsifizierbarkeit) und für BEUTELTIER, die davon abgeleitete, separate Erweiterung
für große raumübergreifende Rekonstruktion aus chaotischem Foto-/Videomaterial (z. B.
Messehallen) mit vielen Providern. BEUTELTIER ist ein eigenständiges, größeres Problem
auf derselben epistemischen Grundlage – keine Neudefinition von SHADEDs Kernziel.
**Das Dokument bestätigt und schärft explizit Entscheidungen, die in diesem Repo
bereits umgesetzt sind:** Single-SHADED-UI (`index.html` ist der Editor, kein
Engine-plus-Editor-Zwilling), „eine Wahrheit heißt eine Semantik, nicht eine Datei",
Legacy-Code als klassifizierter Capability-Donor (A: extrahieren, B: nur bei
nachweisbarer Überlegenheit, C: nicht migrieren ohne verifizierten Ersatz), inkrementelle
Extraktion mit Verifikations-Checkpoints statt Big-Bang-Rewrite, und die
WorldState→Solver→MaterialResponse→StyleProfile→TechniqueRegistry→RenderBudget-Kette
aus `runtime/style/`. Es hält außerdem ausdrücklich fest: **Projektregeln wie dieses
Dokument sind abgeleitete Verfassung, keine höherwertige Wahrheit als eine explizite
neue Architekturentscheidung des Maintainers** – bei Widerspruch wird CLAUDE.md
korrigiert, nicht die neue Architektur zurückgebogen. Nicht verhandelbar bleiben davon
unberührt: Kernziel, Provenance-Trennung, Material-Wahrheit, Observability.

## SWIFT→SHADED Integration

SHADED ist nun das **Rendering-Ziel für procedural generierte Charaktere** aus SWIFT
(separates Repo `lootziffer666/swift`). SWIFT produziert:
- **Sprite-Sheets** (PNG): animierte Charaktere in Pixel-Art
- **Manifeste** (JSON): Frame-Rects, Animationen, optional Tiefenkarten
- **Depth-Maps** (8-bit Grayscale): Z-Buffer für räumliche Ordnung

Diese werden via `window.SHADED.addActor()` als rein optische Overlay-Ebene geladen.
**Invariante 2 (Eine Material-Wahrheit) bleibt absolut unberührt**: Actors beeinflussen
NICHT `classGrid` oder `getMaterialTypeAt()`. Die Scene-Analyse wird nur vom Hintergrund
bestimmt. Actors sind Rendering-Dekoration, keine Physik-Änderung.

## Ziel statt Format

SHADED arbeitet auf ein **Ziel** hin, nicht auf ein **Format**. Das Ziel ist die lebendige,
atmende Szene und die Weltgesetze, die sie tragen. Grafik-APIs, Shader-Sprachen und
Austauschformate — GLSL, WGSL, TSL, MaterialX, ReShade-FX, glTF, USD — sind die **letzte
Meile**: austauschbare Ausgabe- und Ausführungsformen, nie der Zweck.

Historie, damit sie nicht wieder verloren geht: SHADED ist aus einem **KorGE**-Projekt
entstanden; Three.js/TSL lag deshalb als **Entwicklungswerkzeug** am nächsten. Das war
eine Werkzeugwahl für die Entwicklung, nie eine Festlegung der ausgelieferten Runtime.

Daraus folgt:

1. **Kein Format wird zur Invariante erklärt.** Invariant ist, dass es EINE Shader-Quelle,
   EINE Material-Wahrheit und EINEN API-Vertrag gibt — nicht, in welcher Sprache oder
   gegen welche API sie ausgedrückt sind. Wer ein Backend dokumentiert, dokumentiert den
   *aktuellen Stand der letzten Meile* (siehe Invariante 7), nicht ein Gesetz.
2. **Entwicklungswerkzeug ≠ Laufzeit-Abhängigkeit.** Three.js/TSL, Node-Editoren,
   Python-Worker und Build-Schritte dürfen beim Autorenwerkzeug und in der Entwicklung
   stehen — dieselbe Trennung, die `editor/` gegenüber `index.html` schon hat.
3. **Ein Formatwechsel ersetzt, er ergänzt nicht.** Ein neues Backend löst das alte
   vollständig ab (sonst zwei Wahrheiten) und wird an den **Zielkriterien** gemessen —
   Verify-Screenshots gegen die Zielbilder, unveränderte Klassenzählung, keine
   Konsolenfehler — nicht an seiner Modernität.
4. **Formatunabhängig bleiben die Verträge an den Grenzen:** `window.SHADED`,
   Provider-Verträge, Kanalvertrag, Scene-Project-Schema, CLI-Vertrag. Sie sind die
   Bridge; sie überleben jeden Backendwechsel und werden zuerst geschrieben.

**Das ausgearbeitete Bridge-Muster steht in `docs/ORCHESTRATION.md`** und gilt für jede
weitere Brücke: eine echte Engine statt einer zweiten, ausschließlich real existierende
API-Methoden statt erfundener, eine ausdrückliche Aussage darüber, was der Vertrag NICHT
tragen kann, Konventionen aus dem Nachbar-Repo gespiegelt statt neu erfunden, und ein
End-to-End-Beweis (Exit-Code + Snapshot) statt einer Zusicherung. Die Übersetzung
passiert an dieser Grenze — nicht vorher im Kern.

Architekturschicht dazu: `docs/rendergraph-lastverteilung.md` §3 (Ausführungs-Backends)
und §10 Phase 5 (Backend-Erweiterungen, ohne Big-Bang-Rewrite).

## Unverhandelbare Invarianten

1. **SHADED ist EIN Editor — modulare, statisch auslieferbare Runtime, kein
   Single-File-Zwang, kein Zwei-Seiten-Zwang.** Die frühere Single-File-Regel wurde
   vom Maintainer ausdrücklich aufgehoben; danach existierte für eine Weile eine
   Zwei-Seiten-Architektur (`index.html` als per-iframe eingebettetes Rendering-Ziel,
   `editor/index.html` als separates Autorenwerkzeug) — auch DIESE Trennung ist
   aufgehoben. **`index.html` ist der einzige Einstiegspunkt und die einzige
   sichtbare Oberfläche.** Es lädt die Engine direkt im selben Dokument (kein
   `<iframe>`), trägt die moderne Editor-Shell (Topbar/Rail/Inspector) und bleibt
   trotzdem statisch über HTTP(S) auslieferbar, ohne Build-Schritt oder Framework.
   PWA-Funktionen benötigen dabei einen sicheren Kontext (`localhost` oder HTTPS);
   der nackte Doppelklick bleibt nur ein nicht-installierbarer Fallback. `editor/`
   ist kein zweites UI-Dokument mehr, sondern der Ort für die CSS-/JS-Module der
   Editor-Shell (Fassaden, Panels, Weltwerkzeuge) — sie binden sich in `index.html`
   ein, statt eine eigene Seite zu sein.
   **„Eine Material-/Shader-Wahrheit" heißt EIN kanonischer Vertrag/eine
   Implementierung, NICHT eine einzige Datei.** `runtime/shaded-engine.mjs` darf
   nach Verantwortlichkeit in eigene Module aufgeteilt werden (Renderer/WebGL-
   Lifecycle, Szenen-/Asset-Ladepfad, Weltzustand/Simulation, Material, Actors/
   Animation, räumlicher Viewer, Eingabe/Kamera, Persistenz/Presets, Editor-
   Bindings) — solange `analyze()`/`classGrid`/die Shader-Quelle selbst dabei
   NICHT dupliziert werden (Invariante 2/7 gelten unverändert für den Inhalt,
   nicht für die Dateigrenze) und jeder Extraktionsschritt mit dem
   `shaded-visual-verify`-Workflow gegen die Zielbilder geprüft wird, bevor der
   nächste beginnt. Ein neuer Runtime-Modul-Schnitt ersetzt den alten
   Verantwortungsbereich vollständig (keine zwei Implementierungen derselben
   Zuständigkeit nebeneinander); UI-Module dürfen Runtime-APIs aufrufen, Runtime-
   Module dürfen NICHT von Editor-DOM-Struktur abhängen.
   Alte Effekte/Presets aus `runtime/shaded-engine.mjs` sind nicht automatisch
   geschützt, nur weil sie alt sind — aber sie werden auch nicht gelöscht, nur
   weil es sie schon lange gibt: Ersetzt wird eine Fähigkeit erst, wenn die
   `runtime/style/`-Architektur (WorldState → Solver/Simulation →
   MaterialResponse → StyleProfile → TechniqueRegistry/RenderBudget → Renderer,
   siehe „Style Discovery Sandbox" unten) einen echten, verifizierten Ersatz
   dafür liefert — nicht weil `runtime/style/` insgesamt „die Zukunft" ist. Ohne
   verifizierten Ersatz bleibt die alte Implementierung stehen und wird als
   „legacy, Migration aussteht" markiert statt stillschweigend für immobil
   erklärt zu werden.
2. **Eine Material-Wahrheit.** Die CPU-Analyse (`classGrid`, `getMaterialTypeAt`) und die
   GPU-Masken-Texturen entstehen aus DERSELBEN Segmentierung in `analyze()`.
   Niemals eine zweite, unabhängige Klassifikation einführen – genau daran ist der
   Prototyp gestorben (CPU sagte „Gras“, GPU sagte „Stein“).
3. **Kanonische Palette** (Map-Uploads): grass `#16A34A`, foliage `#AA0EB7`, roof `#F97316`,
   path `#DC2626`, wood `#854D0E`, window `#0F766E`, water `#06B6D4`, rock `#475569`.
   **`#F972E9` ist ein historischer Zahlendreher von `#F97316`** und wird nur als
   Legacy-Alias toleriert. Neue Farben werden in `PALETTE` ergänzt, nirgendwo hart codiert.
   Zusätzlich versteht das Zweitbild ein **Marker-Overlay**: eine Szenen-Kopie, in der
   nur die Korrekturstellen übermalt sind (auto-erkannt via Paletten-Abdeckung; nur
   Pixel zählen, die sich vom Original unterscheiden). Pink = Fenster; jede andere
   kanonische Palettenfarbe = lokale Klassen-Korrektur. Marker sind eine Nutzer-Ansage –
   sie haben IMMER Vorrang vor Heuristik-Validierung. Heuristik-Fensterdetektoren sind
   bewusst KONSERVATIV kalibriert: lieber ein fehlendes Fenster (per Overlay nachrüstbar)
   als falsche Glasflecken auf Gebäuden.
   **Der Bildkanon (`docs/bildkanon.md`) ist verbindlich** (K1–K8: Häuser sind Fachwerk,
   Fenster IMMER holzgerahmt, Glas ohne Rahmen = kein Fenster, Himmel oben & inert …).
   Die Kanon-Detektoren in `analyze()` (Rahmen-Fenster mit Blauglas-/Warmlicht-Farbtor,
   Himmel-Regel, Dach-/Bodenanker mit Adjazenz-Ringen) setzen ihn um. Es gibt bewusst
   KEIN „einfach dunkel = Fenster“-Tor – das griff jede Schattenritze ab. Alle
   Umfeld-Prüfungen müssen mit Analyseauflösung UND Blobgröße skalieren
   (nichts an feste Rastergrößen binden; Zielbilder sind ~1440p, `AW` = 768).
4. **Der Prototyp ist eingefroren.** `gaime_shader_editor_pro_v2_6_bio_physics_edition.html`
   dient nur als Ideen-Referenz. Nicht editieren, nicht fixen, nichts blind kopieren –
   seine dokumentierten Bugs (Paletten-Mismatch, `gl.TEXTURE2D+2`, `s-fol-*`-IDs,
   wirkungsloses Trail-Decay) dürfen nicht zurückkehren.
5. **`window.SHADED` ist API-Vertrag** für Tests und Agenten (erstellen, applyAct,
   setParams, setTime, isReady, getMaterialTypeAt, story). Nie entfernen oder umbenennen,
   nur erweitern.
   **v1.3.0+:** `addActor({image, manifest, x, y, scale, anim, depthImage, depthLayer})`
   lädt animierte, transparente Sprite-Sheets als rein optische Akteure auf dem
   Overlay-Canvas `#ov`. Manifest-JSON-Schema (`sourceImage`, `frameRects`/`grid`,
   `frames`, `animations`, optional `depthImage`) ist identisch zu SWIFTs
   `core.sprite_sheet.SpriteSheetManifest`. Ein `python main.py render ... --format
   sprite_sheet`-Lauf im SWIFT-Repo erzeugt Sheet + Manifest direkt passend.
   **v1.4.0+:** Optional `depthImage` (8-bit Grayscale PNG, gleiche Dims wie RGB-Sheet)
   + `depthLayer` ('front'/'mid'/'back') für räumliche Ordnung. Actors rendern in
   Tiefenschicht-Ordnung; globalAlpha folgt fog+dayNight-Parametern (Nebel dunkelt,
   Nacht dunkelt). Akteure sind reine Optik ohne Rückwirkung auf `classGrid`/
   `getMaterialTypeAt` – Invariante 2 bleibt unberührt.
   Handle-Methoden: `setAnim(name)`, `setPosition(x,y)`, `setVisible(v)`,
   `setDepthLayer(layer)`, `remove()`.
   **v1.5.0+ (SWIFT-Parität):** `addActor` versteht zusätzlich `emissiveImage`
   (RGB-Sheet aus SWIFTs `--emissive-pass`, wird additiv als Eigenlicht gerendert:
   nachts voll, tags schwach, Nebel dämpft – KEIN Tint der Basistextur) und
   `worldStateImages: {name: url|HTMLImage}` (Varianten-Sheets aus `--world-states`,
   Frame-Layout laut Orchestration-Vertrag identisch). Neue Handle-Methoden:
   `setWorldState(name|null)`, `getWorldStates()`, `getWorldState()`.
   `normalImage`/`worldStates` werden aus dem Manifest geparst; Normal-Maps werden
   derzeit nicht gerendert (Canvas-2D hat keinen Licht-Pass) – Feld ist reserviert.
   **v1.6.0+ (Materialschicht):** `window.SHADED.intrinsic` trennt Licht und Material
   (`state, setStrength, getStrength, set, accept, reset, clear, sample`). Das
   Quellbild enthält eingebackenes Licht; ohne Trennung multipliziert jedes
   Weltgesetz darauf. `setStrength(0)` ist der Fallback **identity-albedo** und
   rendert exakt wie zuvor – das ist auch der Default und der Zustand nach
   Providerausfall. `set()` nimmt das Shading-Feld eines externen Backends
   (RGB→X, IntrinsicReal, De-Lighter …) entgegen; das eingebaute Backend ist die
   klassische deterministische Baseline. Provider erzeugen **Parameter, nie
   Klassen** – `classGrid`/`getMaterialTypeAt` bleiben unberührt (Invariante 2).
   **Companion-Konvention:** liegt neben `bild.png` eine `bild_shading.png`
   (8 Bit, 128 = neutral), wird sie automatisch geladen, ersetzt das eingebaute
   Backend und aktiviert die Trennung — dieselbe Konvention wie `bild_depth.png`.
   Ein Autor mit GPU backt das Feld einmal, alle anderen laden es mit. Hardware
   entscheidet damit über die Qualität, nie über die Benutzbarkeit. Eine neue Szene
   erbt das Feld NICHT. Werkzeuge dürfen den 404 einer fehlenden Companion-Datei
   nicht als Fehler werten (`isCompanionProbe` in den Verify-Skripten).
   **Constraint-Projektion:** das eingebaute Shading-Feld wird per **Dykstra** auf den
   Schnitt zweier konvexer Mengen projiziert — Wertebereich samt Albedo-Gamut
   (`s ≥ max(col)`, sonst wäre Reflektanz > 1) und Energieneutralität
   (`mean(s) = target`). Sequenzielles Clampen-dann-Normalisieren erfüllt nur die
   LETZTE Bedingung; genau daran hatte die erste Fassung 7 % Helligkeitsversatz und
   1,84 % unmögliche Reflektanz. Fremde Felder (Provider, Companion) werden **gemessen,
   nicht nachprojiziert** — die Hypothese gehört dem Provider (`state().gamut`).
   Architektur: `docs/neuronale-materialien-svbrdf-pbr.md`,
   `docs/raeumliche-algorithmen-arsenal.md`.
6. **High-Level-Parameter statt Effekt-Schalter.** Neue Stimmungen entstehen aus den
   13 Parametern (`dayNight, storm, rain, wet, puddle, fog, wind, glow, decay, temperature, bloom, autumn, snow`, alle 0..1).
   Neue Systeme (z. B. Schnee) bekommen eigene Parameter im selben Stil und werden in
   Akte/Storyboard integriert – keine Spezial-Codepfade an der Engine vorbei.
   **Phase C (Runde 5+):** Weltgesetze-Erweiterung mit 5 neuen simulierten Effekten:
   - **#42 Trocknung (Drying):** Nassglänzende Oberflächen verlieren Glanz und bekommen
     Trocknungsränder (damp rings), dann mattkörnige Textur beim Austrocknen.
   - **#41 Hitzeverzug (Heat Distortion):** Luft flimmert über Feuer/heißen Quellen,
     visuelle Verzerrung durch Domain-Warp (u_heatWarp = temperature × fireCount).
   - **#9 Rost (Rust):** Metallische und holzerne Oberflächen oxidieren unter Nässe,
     orange-braune Verfärbung entlang Struktur (u_rustAccum akkumuliert bei wet>0.3).
   - **#43 Rauchschichtung (Smoke Layering):** Nebel und Rauch bilden Schichten,
     verstärken Silhouetten und diffundieren (u_smokeAmount = fog × (storm + fireCount×0.5)).
   - **#20 Temperaturgradienten (Temperature Gradients):** Seiten zur Wärmequelle leuchtend
     warm, Schattenseiten leicht blau gekühlt; simuliert lokale Wärmestrahlung.
7. **Texture-Units:** 0 Szene, 1 maskA, 2 maskB, 3 phys, 4 emis,
   5 Trail-/Störungstextur (Runde 4: R Delle 1.5 s Halbwertszeit, G Impuls 0.4 s,
   B Trampelpfad permanent, A Hitze/Brand ~25 s), 6 Tiefenkarte (2.5D-Parallaxe;
   ohne Upload 1×1 schwarz = flach; `u_parallax` ist ohne Mausbewegung (0,0) –
   verify-Frames bleiben deterministisch), 7 Gebäudezonen (K1: R-Kanal 1 =
   Fachwerk-Gebäude; maskiert puddle/riv/creep/mud; bodenverankerte Pfad-/
   Fels-Komponenten sind für Zonen tabu), 8 Materialschicht (R = Shading /
   eingebackene Beleuchtung des Quellbilds, 0.5 = neutral; G = Konfidenz der
   Zerlegung; B/A reserviert für kommende Kanäle wie Rauheit und AO).
   Trail-Decay wirkt IMMER direkt auf den Pixeldaten – nie über
   Canvas-Composite-Tricks.
   **Es gibt genau EINE Shader-Quelle.** Das ist die Invariante – nicht die Sprache,
   in der sie ausgedrückt ist, UND NICHT die Datei, in der sie steht (siehe
   Invariante 1: `runtime/shaded-engine.mjs` darf nach Verantwortlichkeit modularisiert
   werden, solange der Shader-/Analyse-Inhalt dabei nicht dupliziert wird). Zwei
   parallele Shader-Quellen wären zwei Wahrheiten;
   ein neues Ausführungs-Backend ersetzt die bestehende Quelle vollständig, es tritt
   nie neben sie.
   **Aktuelles Ausführungs-Backend:** WebGL 2 mit GLSL ES 3.00 (`#version 300 es`,
   `in`/`out`, `texture()`, `fragColor`); fehlt WebGL 2, bricht `index.html` mit
   klarer Meldung ab. Es ist die unterste Schicht laut
   `docs/rendergraph-lastverteilung.md` §3 („Ausführungs-Backends: WebGL 1 · WebGL 2 ·
   später WebGPU") und ausdrücklich austauschbar – eine spätere Autorensprache
   (TSL, eigene Node-IR, MaterialX) darf sie ablösen.
   WebGL 2 garantiert ≥ 16 Fragment-Sampler (real 32 im Verify-Chromium), von denen
   9 belegt sind. Neue Kanäle bekommen eine eigene Unit statt Huckepack-Packung;
   `tools/verify.js` prüft Kontext und Belegung.
   Begründung: `docs/neuronale-materialien-svbrdf-pbr.md` §10.

## SHADED Editor — jetzt `index.html` selbst (`editor/` liefert nur noch Module)

SHADED hatte nie einen echten Editor — nur die eingefrorene Referenz
`gaime_shader_editor_pro_v2_6_bio_physics_edition.html` (Invariante 4, nicht anfassen)
und die rohe `window.SHADED`-API. `editor/` war der erste echte, funktionierende Editor,
konzeptionell an [Capybara 2D Engine](https://github.com/d-liya/capybara_2d_engine)
angelehnt: **eine große Engine hinter einer kleinen, stabilen, agentenfreundlichen
Fassade**, statt einer zweiten Implementierung der Engine-Interna — zunächst als
separates `editor/index.html`, das die Engine per `<iframe>` einbettete. Diese
Zwei-Seiten-Architektur ist aufgehoben (siehe Invariante 1): **`index.html` ist jetzt
das eine Dokument**, das sowohl die Engine (`runtime/shaded-engine.mjs`, `runtime/
spatial-viewer.js`) als auch die Editor-Shell (Topbar/Rail/Inspector) trägt. `editor/`
enthält nur noch CSS/JS-Module, kein eigenes HTML-Dokument mehr.

- **`editor/facade.js` — `SceneEditorFacade`.** Ruft ausschließlich das bestehende
  `window.SHADED`-API auf (`loadImageFile`, `erstellen`, `getParams`/`setParams`,
  `applyAct`, `isReady`, `getMaterialTypeAt`). Kein Shader-/Analyse-Code wird hier
  dupliziert oder geforkt — Invariante 2 gilt genauso hart wie für die Engine selbst.
  Ein optionales `iframeEl`-Argument existiert weiterhin (`win`/`doc` fallen sonst auf
  `window`/`document` zurück) — für isolierte Tests, nicht für den Normalbetrieb, der
  seit der Konsolidierung ohne `<iframe>` läuft.
- **`editor/markerPainter.js` — `MarkerPainter`.** Zweite kleine Fassade: ein
  Pinsel-Werkzeug für das in Invariante 3 beschriebene Marker-Overlay. Malt direkt auf
  eine Canvas-Kopie des Szenenbilds; unveränderte Pixel bleiben exakt erhalten (SHADEDs
  eigene Marker-Erkennung ist diff-basiert). `MARKER_BRUSH`/`CANONICAL_PALETTE` sind von
  Hand mit der Engine-`PALETTE` synchron gehalten — die Engine bleibt die Wahrheit, der
  Editor kopiert nur die Farbwerte.
- **`editor/actorPlacer.js` — `ActorPlacer`.** Dritte kleine Fassade: platziert
  SWIFT-Sprite-Sheet-Akteure ausschließlich über `window.SHADED.addActor()`, über die
  eigenen `#f-actor-sheet-editor`/`#f-actor-manifest-editor`-Eingaben (nicht die
  gleichnamigen Legacy-IDs `f-actor-sheet`/`f-actor-manifest`, die die Engine intern
  für einen einfachen Auto-Add-Pfad ohne Drag-Positionierung stubbt — keine doppelten
  Steuerelemente auf derselben ID). `scale` ist laut echtem `addActor`-Handle nur beim
  Erstellen setzbar (kein `setScale`) — Änderung entfernt den Actor und legt ihn mit
  denselben gecachten Dateien neu an, statt eine nicht existierende API zu erfinden.
- **Storyboard-Editor:** existiert real, aber (noch) nicht als eigene Fassaden-Klasse —
  `#story-list`/`#btn-play`/`#btn-add`/`#cb-loop` in `index.html`s Inspector-Panel
  „Story" sind dieselben IDs, gegen die `runtime/shaded-engine.mjs` seine eigene
  Timeline-Logik (`renderStory()`/`playStory()`/`tickStory()`, arbeitet direkt auf
  `window.SHADED.story.board()`) verdrahtet. Eine künftige `StoryboardTimeline`-Fassade
  müsste diese Engine-Logik ablösen (Kategorie B/C-Prüfung: erst migrieren, wenn der
  Ersatz nachweislich mindestens gleichwertig ist), nicht neben ihr existieren.
- **`editor/app.js`** verdrahtet UI-Events auf die Fassaden — enthält selbst keine
  Engine- oder Klassifikationslogik. Verdoppelt NICHT, was die Engine bereits selbst
  gegen ihre eigenen Legacy-IDs (`f-scene`/`f-mat`/`f-depth`/`btn-demo`/`#sliders`)
  verdrahtet — das war früher eine zweite, veraltete Implementierung mit
  unvollständiger Parameterliste und ist entfernt.
- **Funktionsumfang:**
  1. Live-Parameter-Tuning (alle Slider aus `PARAM_META`, direkt gegen die laufende
     Engine, Preset speichern/laden).
  2. Marker-/Palette-Overlay-Malen (Pinsel in den 8 kanonischen Palettenfarben +
     Fenster-Marker-Pink, Export als PNG oder direkte Live-Anwendung als Zweitbild).
  3. Actor-Platzierung (SWIFT-Sprites): Sprite-Sheet + Manifest hochladen, Marker in
     der eingebetteten Vorschau per Drag positionieren, Anim/Depth-Layer/Scale je
     Actor einstellen, entfernen.
  4. Story/Akt-Timeline: Schritte aus dem aktuellen Zustand erzeugen, Name/Dauer
     bearbeiten, Zustand in einen Schritt übernehmen, Vorschau, Umsortieren, Play/Stop.
- **Verifikation:** `node tools/verify-editor.js` (gleiches Muster wie `tools/verify.js`
  — lokaler Server + headless Chromium; prüft echten Engine-Ready-Zustand, echte
  Parameter-Übertragung, echtes Pinsel-Pixel-Ergebnis, Actor-Hinzufügen inkl.
  Drag-Positionierung, Timeline-Schreibzugriff auf `window.SHADED.story.board()` und
  Konsolenfehler-Freiheit). **Wichtig für neue Interaktionstests:** das Vorschau-Panel
  ist wegen Iframe + 15 Slidern sehr hoch — vor jeder mausbasierten Interaktion mit
  weiter oben liegenden Elementen (Marker, Canvas) `scrollIntoViewIfNeeded()` bzw.
  `window.scrollTo(0,0)` nutzen, sonst zielen die Koordinaten ins Leere.
- **Headless-Orchestrierung (`window.SHADED_ORCHESTRATOR`, Real Golden Run R-07–R-11).**
  Fünfte Erweiterung von `facade.js` selbst (nicht der interaktiven UI): `loadProject`/
  `exportProject`/`addActorBundle`/`getRuntimeStatus`/`getDebugSnapshot`, konform zu
  `contracts/shaded-scene-project.schema.json` (Parameter/Actors/Storyboard — trägt
  bewusst keine Bild-Bytes, JSON kann das nicht). `editor/app.js` exponiert diese fünf
  Methoden gebündelt als `window.SHADED_ORCHESTRATOR` auf der EDITOR-Seite (nicht im
  Engine-Iframe — mit `window.SHADED` selbst nicht zu verwechseln), damit ein externes
  Headless-Skript sie ohne ESM-Import erreichen kann. `tools/orchestrate.js` ist der
  reale, shellbare CLI-Vertrag darüber (Beweis-Ziel für ANVILs künftigen
  `ShadedCliAdapter`, analog zu SWIFTs `python main.py render --json`) — siehe
  `docs/ORCHESTRATION.md` für Aufruf, Request-Format und Exit-Codes.
  Verifikation: `node editor/facade.test.js` (fünf Methoden direkt), `node
  tools/orchestrate.js --project tools/orchestrate-example-request.json --json`
  (End-to-End-CLI-Beweis).

## Style Discovery Sandbox (`runtime/style/` + `sandbox/`)

Vertikale Scheibe der Zielarchitektur `WorldState → Solver → MaterialResponse
→ StyleProfile → RenderBudget → Final Render`, als Beweisfeld für eine
künftige Trennung von Weltzustand und Stil — **keine dauerhafte
Parallelarchitektur** und **`runtime/shaded-engine.mjs` bleibt in dieser
Schicht unberührt**. Zwei strikt getrennte Teile:

- **`runtime/style/`** ist der renderer-unabhängige Kern: reines ESM, kein
  DOM/WebGL, in Node importierbar und per `node tools/test-style-discovery.mjs`
  deterministisch getestet (WorldState, MaterialResponse, StyleProfile,
  TechniqueDescriptor-Registry, Preference-Model, Candidate-Serialisierung,
  RenderBudget).
- **`sandbox/`** ist die dünne, austauschbare WebGL2/SDF-Schicht + UI
  (Blindvergleich, Voting, Isolationsmodus, Custom-Profil-Komposition,
  FULL/MOBILE) — analog zu `runtime/spatial-viewer.js` als Präzedenzfall
  für einen zweiten, unabhängigen WebGL2-Renderer, der KEINE zweite
  Material-Wahrheit ist.

Nur FULL und MOBILE sind nutzersichtbare Budget-Stufen; MaterialResponse
reicht mehr als `{baseColor, roughness, reflectance, emission, damage}` über
die Style-Grenze (Nässe/Ruß/Risse/Frost/Schnee/Rost bleiben als eigene
Kanäle erhalten). Details, Bedienung und der volle Verifikations-Workflow:
`docs/STYLE_DISCOVERY.md`.

**Produktionsintegration (`runtime/style/production-adapter.js`,
`window.SHADED.style`, siehe `docs/STYLE_DISCOVERY.md` §Produktionsintegration):**
der dort skizzierte Adapter existiert jetzt real, aktuell für GENAU EINEN
migrierten Legacy-Effekt (Specular-Sheen, Migration 1 von vielen — nicht Big
Bang). `window.SHADED.style.set(profile)`/`.setBudget(tier)` wenden ein in
der Sandbox gefundenes StyleProfile auf eine echte geladene Szene an; die
übrigen 18 StyleProfile-Dimensionen hängen noch an keinem Produktionseffekt
und die Nässe-Abdunklung selbst (SHADEDs am stärksten zielbildabhängige
Kernwirkung) ist bewusst noch NICHT migriert — beides folgt als eigene,
einzeln verifizierte Schritte, kein Nebenprodukt dieser Migration.

## Verifikations-Workflow (Pflicht nach Shader-/Analyse-Änderungen)

```bash
npm i playwright                 # einmalig (node_modules NICHT committen)
node tools/verify.js             # -> tools/verify-out/shot_<akt>.png
```

Danach die Screenshots mit dem Bild-Tool ANSEHEN und vergleichen:
- `shot_sturmnacht.png` gegen Zielbild `file_00000000b27471f4a8aeb27484b46720.png`
- `shot_danach.png` gegen Zielbild `file_00000000fbc472438dcc92aff24bed6e.png`
- Physik-Referenzen: `1782823262240.png` (Tag), `1782823374309.png` (Nacht)
- `shot_kanon_sturmnacht.png` / `shot_himmel_sturmnacht.png`: Fensterlicht sitzt
  IN den Rahmen (keine Glühflecken auf Dächern/Bäumen), Himmel bleibt Himmel.

Kriterien: keine Konsole-/GL-Fehler; Nässe dunkelt poröse Materialien deutlich ab;
Pfützen in Pfad-Senken mit Warmlicht-Spiegelung bei Nacht; Flussnetz auf Pfaden bei Regen;
Nebel diffus zu den Rändern; Szene wirkt in Bewegung nie statisch. Beide Modi testen:
ohne Map (Heuristik) UND mit gemalter Map (`1782824829119.png`).
verify.js vergleicht außerdem die Klassenzählung aller fünf Szenen gegen
`tools/expected-classes.json` (±10 %) – bei GEWOLLTEN Verschiebungen die Baseline
bewusst aktualisieren (nach visueller Prüfung!), nie blind.

**Material-Tests:** Bei Änderungen an der Materialschicht (`u_intrinsic`, Shading-Kanal,
`window.SHADED.intrinsic`, Weltgesetze die auf Albedo rechnen) `node tools/verify-intrinsic.js`
laufen lassen. Der Test beweist Fallback (identity-albedo), Wirkung, unveränderte
Klassenzählung, externen Provider, Nutzerbestätigung und Providerausfall; Exit ≠ 0 bei
FAIL oder Konsolenfehlern. Für stabile Frame-Vergleiche `setTime(t, true)` (freeze) nutzen.

**Actor-Tests:** Bei Änderungen an `addActor()` oder `drawActors()` zuerst
`node tools/verify-actors.js` laufen lassen (deckt API, Depth-Kopplung und die
SWIFT-v1.4-Erweiterungen emissive/worldStates mit Pixel-Assertions ab; Exit ≠ 0
bei FAIL oder Konsolenfehlern), zusätzlich manuell im Browser überprüfen:
- Actor erscheint an korrekter Position (x, y)
- Animation spielt korrekt ab (fps, loop)
- Depth-Layer sortiert Actors korrekt (front/mid/back)
- globalAlpha folgt fog+dayNight (Charakter wird im Nebel/bei Nacht dunkler)
- Keine GL-Fehler in der Console (Depth-Textur korrekt gebunden?)
- Sprite-Transparenz ist erhalten (RGBA PNG mit Alpha-Channel)

## Actor-System & Depth-Integration

Actors (SWIFT-generierte Charaktere) werden auf dem gleichen Overlay-Canvas `#ov`
wie `drawPlayer()` gerendert. Sie sind **rein optisch** – keine Auswirkung auf Physik,
Material-Klassifikation oder `getMaterialTypeAt()`.

**Depth-Layer-Ordnung:**
- `'front'`: Vor allen Scene-Elementen (z. B. fliegende Vögel)
- `'mid'` (default): Zwischen Scene-Hintergrund und Vordergrund (Charaktere)
- `'back'`: Hinter Scene-Elementen (z. B. Silhouetten dahinter)

Actors in jeder Schicht werden von hinten nach vorne (nach Sprite-Y oder Animation-Frame)
sortiert. Scene-Tiefenkarte (Unit 6) wird bei Actors ignoriert – ihre räumliche Ordnung
kommt nur aus `depthLayer` und interner Frame-Ordnung.

**Lighting & Atmosphere:**
- Actor-globalAlpha wird an `fog`- und `dayNight`-Parameter gekoppelt:
  ```
  alpha = baseAlpha * (1 - fog * 0.5) * (1 - dayNight * 0.3)
  ```
- So wirken Charaktere im Nebel/bei Nacht natürlich dunkler, ohne ihre Textur zu ändern
- Keine Farbverschiebung (keine Tint-Shader auf Actors) – nur Transparenz

**Manifest-Schema (SWIFT-generiert, v1.4.0+):**
```json
{
  "mappingVersion": "1.4.0",
  "sourceImage": { "w": 256, "h": 64 },
  "frameRects": { "F01": {"x": 0, "y": 0, "w": 64, "h": 64}, ... },
  "frames": [{ "id": "F01", "key": "walk_01" }, ...],
  "animations": {
    "walk": { "frames": ["F01", "F02", ...], "fps": 12, "loop": true }
  },
  "depthImage": "sprite_depth.png",           // optional (Phase B2)
  "depthSourceImage": { "w": 256, "h": 64 }, // optional, gleiche Größe wie sourceImage
  "depthFrameRects": { "F01": {"x": 0, "y": 0, "w": 64, "h": 64}, ... },  // optional, parallel zu frameRects
  "emissiveImage": "sprite_emissive.png",     // optional (SWIFT --emissive-pass)
  "emissiveSourceImage": { "w": 256, "h": 64 },
  "emissiveFrameRects": { "F01": {"x": 0, "y": 0, "w": 64, "h": 64}, ... },
  "normalImage": "sprite_normal.png",         // optional, geparst aber (noch) ungenutzt
  "worldStates": {                             // optional (SWIFT --world-states)
    "dust": { "name": "dust", "transform": "dust", "intensity": 0.5, "variant_path": "sprite_dust.png" }
  }
}
```
Wie `depthImage` werden auch `emissiveImage` und die `worldStates`-Varianten-PNGs
NICHT automatisch aus Manifest-Pfaden geladen – der Aufrufer übergibt sie explizit
(`addActor({..., emissiveImage, worldStateImages})`).

**Wichtig:** `frameRects`/`depthFrameRects` sind **Objekte** `{x,y,w,h}`, KEINE Arrays –
genau so liest sie `parseActorManifest` (`r.x/r.y/r.w/r.h`) und genau so emittiert sie
SWIFTs `core/exporter.export_manifest`. Das Manifest-Feld `depthImage` ist ein Pfad
relativ zum Manifest und wird von `addActor` NICHT automatisch geladen – die Depth-Map
wird als eigene Option `addActor({..., depthImage})` übergeben.

**Phase B2 (Depth-Rendering):**
- `depthImage`: Pfad zu 8-bit Grayscale PNG (gleiche Größe wie RGB-Sheet)
- `depthFrameRects`: Frame-Koordinaten in der Depth-Map (identisch zu `frameRects`)
- Depth-Composite in SHADED (`actorDepthBrightness`):
  - Helle Depth-Pixel = nah am Betrachter → bis +30 % Helligkeit
  - Dunkle Depth-Pixel = fern → bis −15 % Abdunklung
  - avgDepth wird EINMAL pro Frame-ID berechnet und am Actor gecacht
    (`actor._depthAvg`) – nie `getImageData` im Render-Pfad
  - Bewusst KEIN Farbtint (Regel „keine Farbverschiebung auf Actors" gilt auch hier);
    angewendet wird nur `ctx.filter = brightness(…)` beim Zeichnen

## Fahrplan (verbindlich, siehe .kiro/specs/)

- Runde 2: Jahreszeiten & Klima (`round-2-seasons-climate`) ✅
- Runde 3: Material Fatigue & Verfall (`round-3-material-fatigue`) ✅
- Runde 4: Interaktion & Ökosystem (`round-4-interaction-ecosystem`) ✅
- Runde 5: Strukturelle Segmentierung / Bildkanon (`round-5-structural-segmentation`) ✅
  (alle 9 Tasks abgeschlossen, inkl. Fachwerk-Signatur K1 → Gebäudezonen, Unit 7)
- Runde 7: Ökosystem-Integration (`docs/round-7-ecosystem.md`, `window.SHADED.ecosystem`)
  – ohne .kiro-Spec umgesetzt; bei Erweiterungen zuerst Spec nachziehen

Jede Runde arbeitet ihre Spec ab: `requirements.md` → `design.md` → `tasks.md`.

## Weltgesetze-Katalog – Implementierungsstatus

Von 60 definierten Weltgesetzen (siehe `docs/vision-weltgesetze.md`):

**Runde 1–4 (vollständig implementiert, 11 Systeme):**
- 2. Fußspuren (Footprints)
- 3. Material-Ermüdung (Material Fatigue)
- 5. Wind
- 17. Blut als Information (Blood)
- 19. Tageszeit als Materialverhalten (Day/Night)
- 21. Kälte/Frost (Cold/Frost, mit Schnee & Eiskristallen)
- 22. Wasserströmung (Water Flow & Puddles)
- 27. Jahreszeiten-Migration (Seasons: Spring bloom, Autumn, Snow)
- 36. Feuer-Nachwirkungen (Fire Aftermath, Trail-Textur)
- 37. Nebel als Informationsfilter (Fog)
- 1. Schmutz/Staub/Ruß (partial, via mossBoost & decay)

**Phase C (Runde 5+, neu implementiert):**
- 41. Hitzeverzug (Heat Distortion)
- 42. Trocknung als Zeitmesser (Drying)
- 43. Rauchschichtung (Smoke Layering)
- 9. Rost (Rust)
- 20. Temperaturgradienten (Temperature Gradients)
- 44. Atemwolken (Breath Clouds)
- 4. Druck/Gewicht/Belastung (Pressure)
- 26. Lichtverschmutzung (Light Pollution)
- 38. Mondlicht (Moonlight)
- 34. Biom-Zonen (Biome Shelves)
- 15. Vegetation-Reaktion (Vegetation Fade)
- 24. NPC-Stimmung (Mood Tint)
- 50. Weltmüdigkeit (World Tiredness)
- 25. Besitz-Grenzen (Forbidden Boundaries)
- 32. Oberflächen-Runen (Surface Runes)
- 11. Schatten als Besitz (Shadows as Ownership)
- 6. Geruch als Diffusion (Smell/Diffusion)
- 45. Berührungsspuren (Touch Traces)
- 30. Sichtbare Reparatur (Repair Marks)
- 49. Segen/Fluch (Blessing/Curse)

**Gesamt: 31 von 60 Weltgesetzen aktiv implementiert (52 %)**

Weitere Kandidaten für zukünftige Runden:
- 4. Druck/Gewicht/Belastung (Pressure)
- 6. Geruch als Shader-Wolke (Smell/Diffusion)
- 11. Schatten als Besitzverhältnis (Shadows as ownership)
- 14. Krankheit/Gift (Poison Filter, teilweise da)
- 44–60: Advanced world laws (siehe vision-weltgesetze.md)

## TRIVIUM-Anbindung (Cross-Repo-Vertrag)

SHADED ist der erste fließend rhetorische Zieladapter des universellen Game
Translation Compilers **TRIVIUM** (`lootziffer666/TRIVIUM`,
`adapters/shaded/`). TRIVIUM formuliert Weltbedeutung engine-agnostisch
(WIR: Grammatik/Rhetorik/Logik) und übersetzt sie u. a. in SHADED-Artefakte:
abspielbare Storyboards (`{name, dur, p}` via `story.board()`), Parameter-Sets,
`addActor`-Slots und Marker-Briefs in der kanonischen Palette.

Vertragsregeln (spiegelbildlich zu TRIVIUMs CLAUDE.md):
- Der TRIVIUM-Driver spricht AUSSCHLIESSLICH das `window.SHADED`-API
  (setParams, getParams, story.board/play/stop, addActor, getMaterialTypeAt).
  Invariante 2 (Eine Material-Wahrheit) bleibt unberührt — der Driver liest
  höchstens `getMaterialTypeAt`, schreibt nie Klassifikation.
- Bei Änderungen am `window.SHADED`-API (Invariante 5: nur erweitern):
  TRIVIUMs SHADED-Adapter nachziehen und dort `node tools/verify-live.js`
  laufen lassen — der Beweisritt führt den generierten Driver headless im
  echten `index.html` aus. SHADED selbst richtet sich NIE nach TRIVIUM;
  die Abhängigkeit zeigt in eine Richtung (wie bei SWIFT).
- TRIVIUM-generierte Driver/WIR-Dateien sind externe Artefakte — werden
  NICHT in SHADED committet (gleiches Gesetz wie für SWIFT-Manifeste).

## Git & Cross-Repo Coordination

- **Branches**: SHADED und SWIFT arbeiten pro Aufgabe auf gleichnamigen Branches
  (aktuell `claude/pipeline-repos-review-qft48j`; Push mit `git push -u origin <branch>`)
- Beide Repos arbeiten **unabhängig**, werden aber über das Manifest-Format + Actor-API verknüpft
- SWIFT generiert Output → wird manuell oder per Build-System in SHADED geladen
- Nie committen: `node_modules/`, `tools/verify-out/`, `package*.json` aus Testläufen
- Die PNG/JPG-Referenzbilder (Verify-Targets) niemals löschen, umbenennen oder neu komprimieren
- Actor-Manifeste (von SWIFT) sind externe Assets – werden NICHT in SHADED committed
