# runtime/shaded-engine.mjs — Decomposition Plan

Begleitdokument zu CLAUDE.md Invariante 1: die staged, verantwortungs­getriebene
Aufteilung von `runtime/shaded-engine.mjs` in eigene Module, ohne `analyze()`/
`classGrid`/die Shader-Quelle zu duplizieren (Invariante 2/7) und mit
`shaded-visual-verify` nach JEDEM Schritt, bevor der nächste beginnt. Kein
Big-Bang-Rewrite — jede Zeile hier ist entweder bereits extrahiert oder noch
nicht angefasst, nie "in Arbeit über mehrere Commits verteilt".

Zielarchitektur (Fernziel, nicht Zwischenzustand-Zwang):
`WorldState → Solver/Simulation → MaterialResponse → StyleProfile →
TechniqueRegistry/RenderBudget → Renderer`

## Klassifikation

- **A** — extrahieren: eigenständige Verantwortung, klare/kleine externe
  Kopplung, sicher als eigenes Modul auslagerbar ohne die Engine-Interna zu
  verzweigen.
- **B** — nur extrahieren/ersetzen, wenn `runtime/style/` (oder ein anderes
  neueres System) nachweislich mindestens gleichwertig ist. Sonst bleibt der
  Code stehen — niemals parallel zur neuen Architektur existieren.
- **C** — nicht migrieren, solange `runtime/style/` keinen echten, verifizierten
  Ersatz liefert. Bleibt als "legacy, Migration aussteht" markiert stehen,
  wird nicht gelöscht nur weil es alt ist.

Zeilenangaben beziehen sich auf den Stand vor Beginn dieser Arbeit
(4169 Zeilen, commit `096dccc`). Nach jeder Extraktion verschieben sich
nachfolgende Zeilennummern — dieses Dokument wird nach jedem Schritt auf den
aktuellen Stand nachgezogen, nicht im Voraus für alle Stufen fixiert.

## Verantwortungscluster

| # | Bereich | Ehem. Zeilen | Klasse | Status |
|---|---------|--------------|--------|--------|
| 0 | Modul-Setup: `ENGINE_STUB_IDS`, `createEngineDOM`, Palette/Klassen, `PARAMS`/`ACTS` | 1–73 | (Substrat) | Bleibt zentral — das IST der geteilte Weltzustand, den jede andere Stufe liest/schreibt. Kein Extraktionsziel für sich, sondern das, wovon Stufen ihre Schnittstelle ableiten. |
| 1 | **Dialog-Engine** (Runde 10) | 3967–4013 (alt) | A | ✅ **Extrahiert** → `runtime/dialogue-engine.mjs`. Kopplung war klein (nur `lens`/`sound` über `window.SHADED`, ein Tastatur-Konflikt mit `dash()`). Eigene RAF-Schleife statt Tick-Aufruf aus `frame()`. `tools/verify-dialogue.js` (8 Tests, inkl. Tasten-Konflikt) bestanden, `tools/verify.js` grün. |
| 2 | WebGL-Kern: Shader-Quellen, `compile()`, `mkTex()`, Programm-/Uniform-Setup, Textur-Units 0–8 | ~75–927 | A (aber höchstes Risiko) | Nicht angefasst. Das ist Invariante 7 selbst — EINE Shader-Quelle. Extraktion erst NACH mehreren erfolgreichen kleineren Stufen (Vertrauen aufbauen), mit Pixel-Diff-Vergleich vor/nach, nicht nur Klassenzählung. |
| 3 | Trail-/Sound-Textur-Upload (`trailStamp/Tick/Upload/Clear`, `soundStamp/Tick/Upload/Clear`) | 974–1099 | A | Nicht angefasst. Klein, aber koppelt an Texture-Units 5/8 (Cluster 2) — sinnvoll erst nach oder zusammen mit dem WebGL-Kern. |
| 4 | **Analyse-Pipeline** (`analyze()`, `classifyScenePixel/MapPixel`, `majorityFilter`, `boxBlur`, `chamfer`, `dykstraProject`, `decomposeIntrinsicBaseline`, `uploadMaterialTexture`, `applyPendingShading`, `resampleShading`) | 1100–2083 | A, höchster Einsatz | Nicht angefasst. Das ist `classGrid`/die Material-Wahrheit (Invariante 2) — von `tools/verify.js`s gesamter Klassenzählungs-Regression abgedeckt. Falls extrahiert: reine Funktionen mit expliziten Bild-/Dimensions-Parametern statt Closures, damit CPU-Analyse nicht heimlich divergiert. Letzte Stufe, nicht erste. |
| 5+8 | **Parameter-Blending: Storyboard + Akte** (`defaultStoryboard…showcaseStoryboard`, `renderStory`, `playStory`, `stopStory`, `tickStory`, `tickLightning`, `applyAct`, `tickActBlend`) | 2084–2241, 3430–3562 (alt) | A, aber vertagt | **Untersucht und zurückgestellt** (Stand vor Stufe 2): `playing`/`stepIdx`/`stepT`/`blendFrom` (Storyboard) und `actBlend` (Akte) sind KEINE zwei Zustände, sondern EINE gemeinsame Blend-Zustandsmaschine, die außerdem `CUR` — die tatsächlich gerenderten Werte — aus drei verschiedenen Clustern heraus schreibt (Storyboard, Akt-Anwendung, UND `tickWorld()` im Render-Loop, das bei `!playing&&!actBlend` selbst gegen `PARAMS` drifted). Ein sauberer Schnitt hier bräuchte zuerst eine bewusst entworfene interne Bridge für diese eine Zustandsmaschine — kein Stage-1-artiger Nebenbei-Schritt. Bleibt vorerst zentral; wird erst angegangen, wenn eine solche Bridge separat entworfen ist. |
| 6 | Spieler/Feuer/Ökosystem (Runde 4): `spawnPlayer`, `dash`, `playerTick`, `igniteFire`, `fireTick`, `fireUniforms`, `initEco`, `spawnElementParticles`, `ecoTick`, `snowDepthAt/Tick`, `rainTick`, `hailTick`, `drawOverlay`, `drawPlayer` | 2242–2890 | A, groß | Nicht angefasst. Sehr breite Kopplung an gemeinsamen mutablen Zustand (`player`, `fires`, `elementBurst`, `PARAMS`, `CUR`) und an das Overlay-Canvas. Größte Einzelstufe — in Unter-Schritte teilen (z. B. erst Ökosystem-Partikel, dann Spieler/Feuer), nicht in einem Zug. |
| 7 | SWIFT-Actor-Bridge (`actorDepthBrightness`, `parseActorManifest`, `drawActors`, `addActor`, `loadActorPair`) + `ensureElementScene`/`elementPreset` | 2891–3429 | A | ✅ **Extrahiert (Stufe 2)** → `runtime/actor-bridge.mjs`. Kopplung war real, aber flach: `ov`/`ovx` (DOM-ableitbar), `getMaterialTypeAt` (bereits öffentlich), `PARAMS.fog`/`.dayNight` (Lesezugriff) und `trailStamp` (bis dahin rein intern). Gelöst durch (a) `trailStamp` als `window.SHADED.trail.stamp` öffentlich gemacht (reine Erweiterung, Invariante 5) und (b) ein neues, ausdrücklich NICHT-öffentliches `window.SHADED_ENGINE_INTERNAL`-Bridge-Objekt für Cross-Modul-Zugriffe, die (noch) keinen Platz im dokumentierten API-Vertrag haben (`PARAMS`-Referenz, `drawActorsHook`-Registrierung für `drawOverlay()`). `elementPreset()`s interne Actor-Erzeugung ruft jetzt (wie externe Aufrufer und `f-actor-sheet`) `window.SHADED.addActor(...)` statt einer lokalen Funktion — keine zweite Erzeugungs-Route. `tools/verify-actors.js` grün, `tools/verify.js` grün. |
| 8 | UI/Akt-Bindings (`syncSliders`, `applyAct`, `tickActBlend`, `setShowcaseCaption`, `stopShowcase`, `waitForReady`, `tickShowcase`) | 3430–3562 | B | Teilweise bereits durch `editor/app.js`s Slider-Entfernung (Part B) konsolidiert — die verbleibende Logik hier IST die kanonische Implementierung, nicht dupliziert. Nur verschieben, wenn ein Editor-UI-Modul sie braucht; sonst bleibt sie hier, da sie bereits Engine-intern und nicht dupliziert ist. |
| 9 | Szene-/Asset-Ladepfad (`loadImageFile`, Tiefenkarte: `getDepthAt`, `buildSpatialPointCloud`, `downloadSpatialPointCloud`, `setDepth`, `clearDepth`, `erstellen()`, `toggleCinema`) | 3563–3801 | A, kritischer Pfad | Nicht angefasst. `erstellen()` ist DER Einstiegspunkt ("Bild laden → Erstellen → Szene lebt") und wird von praktisch jedem Verify-Skript direkt aufgerufen. Hohe Sichtbarkeit, mittleres technisches Risiko — guter Kandidat für eine mittlere Stufe, nachdem Stufen 2/3 Vertrauen in den Workflow geschaffen haben. |
| 10 | Render-Loop (`tickWorld`, `frame`) | 3802–3965 | (Dirigent) | Bleibt zentral. Ruft praktisch jedes andere Cluster auf; eine "Extraktion" wäre nur eine Verschiebung der Orchestrierung, kein Gewinn an Trennung. Wird kleiner, je mehr andere Cluster ihre eigene Tick-Verantwortung übernehmen (wie die Dialog-Engine es jetzt tut). |
| 11 | `window.SHADED`-Aggregation | Rest | (Vertrag) | Bleibt zentral als Objekt, aber schrumpft mit jeder Stufe, die (wie die Dialog-Engine) ihren Teil nach der Modul-Ladereihenfolge selbst anhängt statt ihn hier zu definieren. Invariante 5: nur erweitern, nie umbenennen. |

## Bereits erledigt

- **Stufe 1 — Dialog-Engine** → `runtime/dialogue-engine.mjs`. Siehe Zeile-1-Eintrag oben.
- **Stufe 2 — SWIFT-Actor-Bridge** → `runtime/actor-bridge.mjs`. Führte zwei wiederverwendbare
  Bausteine für künftige Stufen ein: `window.SHADED.trail.stamp` (echte, dokumentierte
  API-Erweiterung) und `window.SHADED_ENGINE_INTERNAL` (ausdrücklich NICHT-öffentliche
  Cross-Modul-Bridge für Zustand/Hooks ohne Platz im Invariante-5-Vertrag — aktuell nur
  `PARAMS`-Referenz und `drawActors`-Hook, wächst mit jeder weiteren Stufe, die sie braucht).
- **Räumlicher Viewer** (`runtime/spatial-viewer.js`) und **Editor-UI-Bindings**
  (`editor/*.js`) waren laut Aufgabenstellung bereits vor dieser Planungsrunde
  extrahiert (Präzedenzfall für das hier verwendete Idiom: eigene RAF-Schleife,
  direkter `document`-Zugriff, Anbindung an `window.SHADED` nach dessen Aufbau).

## Nicht im Scope dieser Extraktionsrunde

- Jede Umbenennung oder Entfernung von `window.SHADED`-Methoden (Invariante 5).
- Jede zweite Klassifikation/Segmentierung neben `analyze()` (Invariante 2).
- Löschen alter Effekte/Presets, solange `runtime/style/` keinen verifizierten
  Ersatz liefert (Kategorie C) — auch wenn sie nach der Umstrukturierung wie
  "totes Gewicht" aussehen.
