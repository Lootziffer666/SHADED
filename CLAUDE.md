# CLAUDE.md – Projektregeln SHADED

SHADED macht aus EINEM 2D-Bild per WebGL-Shader eine lebendige, atmende Szene
(Environmental Storytelling). Kernversprechen: **Bild laden → „✨ Erstellen” → die Szene lebt.**

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

## Unverhandelbare Invarianten

1. **Single-File, kein Build-Step — für `index.html`.** `index.html` bleibt die komplette
   Runtime-App und muss weiterhin per Doppelklick bzw. `python3 -m http.server` laufen.
   Keine Bundler, keine npm-Dependencies zur Laufzeit, kein Framework in `index.html`.
   **Update:** Diese Regel wurde vom Maintainer als für Autoren-Werkzeuge zu eng erkannt
   und ausdrücklich aufgehoben ("obsoletes Relikt") — sie gilt jetzt NUR noch für die
   ausgelieferte Runtime `index.html`. `editor/` (Gate: Capybara-inspirierter Editor,
   siehe unten) ist ein separates Autoren-Werkzeug, darf Mehrdatei-/ESM-Struktur nutzen
   und `index.html` unverändert per `<iframe>` einbetten. Es steuert die Engine
   ausschließlich über das bestehende `window.SHADED`-API (Invariante 5) — es forkt oder
   dupliziert nie Shader-/Analyse-Code (Invariante 2 bleibt für den Editor genauso hart).
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
   Fels-Komponenten sind für Zonen tabu). Trail-Decay wirkt IMMER direkt
   auf den Pixeldaten – nie über Canvas-Composite-Tricks.

## SHADED Editor (`editor/`)

SHADED hatte nie einen echten Editor — nur die eingefrorene Referenz
`gaime_shader_editor_pro_v2_6_bio_physics_edition.html` (Invariante 4, nicht anfassen)
und die rohe `window.SHADED`-API. `editor/` ist der erste echte, funktionierende Editor,
konzeptionell an [Capybara 2D Engine](https://github.com/d-liya/capybara_2d_engine)
angelehnt: **eine große Engine hinter einer kleinen, stabilen, agentenfreundlichen
Fassade**, statt einer zweiten Implementierung der Engine-Interna.

- **`editor/facade.js` — `SceneEditorFacade`.** Die einzige Klasse, die
  `../index.html` anfasst — per `<iframe>` eingebettet, unverändert. Ruft
  ausschließlich das bestehende `window.SHADED`-API auf (`loadImageFile`, `erstellen`,
  `getParams`/`setParams`, `applyAct`, `isReady`, `getMaterialTypeAt`). Kein
  Shader-/Analyse-Code wird hier dupliziert oder geforkt — Invariante 2 gilt für den
  Editor genauso hart wie für `index.html` selbst.
- **`editor/markerPainter.js` — `MarkerPainter`.** Zweite kleine Fassade: ein
  Pinsel-Werkzeug für das in Invariante 3 beschriebene Marker-Overlay. Malt direkt auf
  eine Canvas-Kopie des Szenenbilds; unveränderte Pixel bleiben exakt erhalten (SHADEDs
  eigene Marker-Erkennung ist diff-basiert). `MARKER_BRUSH`/`CANONICAL_PALETTE` sind von
  Hand mit `index.html`s `PALETTE`-Objekt synchron gehalten — `index.html` bleibt die
  Wahrheit, der Editor kopiert nur die Farbwerte.
- **`editor/actorPlacer.js` — `ActorPlacer`.** Dritte kleine Fassade: platziert
  SWIFT-Sprite-Sheet-Akteure ausschließlich über `window.SHADED.addActor()`. Übergibt
  `image`/`depthImage`/`emissiveImage` immer als `blob:`-URL-Strings und `manifest`
  immer als JSON-String — niemals als Parent-Fenster-`Image()`/-Objekt, weil
  `addActor`s interne `instanceof HTMLImageElement`-Prüfung sonst am Iframe-Realm
  scheitert. `scale` ist laut echtem `addActor`-Handle nur beim Erstellen setzbar
  (kein `setScale`) — Änderung entfernt den Actor und legt ihn mit denselben
  gecachten Dateien neu an, statt eine nicht existierende API zu erfinden.
- **`editor/storyboardTimeline.js` — `StoryboardTimeline`.** Vierte kleine Fassade:
  bearbeitet `window.SHADED.story.board()` — das ist dieselbe Live-Referenz, die
  `playStory()`/`tickStory()` intern abspielen, keine zweite Storyboard-Wahrheit.
- **`editor/app.js`** verdrahtet nur UI-Events auf die vier Fassaden — enthält selbst
  keine Engine- oder Klassifikationslogik.
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

## Git & Cross-Repo Coordination

- **Branches**: SHADED und SWIFT arbeiten pro Aufgabe auf gleichnamigen Branches
  (aktuell `claude/pipeline-repos-review-qft48j`; Push mit `git push -u origin <branch>`)
- Beide Repos arbeiten **unabhängig**, werden aber über das Manifest-Format + Actor-API verknüpft
- SWIFT generiert Output → wird manuell oder per Build-System in SHADED geladen
- Nie committen: `node_modules/`, `tools/verify-out/`, `package*.json` aus Testläufen
- Die PNG/JPG-Referenzbilder (Verify-Targets) niemals löschen, umbenennen oder neu komprimieren
- Actor-Manifeste (von SWIFT) sind externe Assets – werden NICHT in SHADED committed
