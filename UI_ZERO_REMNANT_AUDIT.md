# UI-Zero Remnant Audit

Zentrales Protokoll des `architecture/ui-zero-contracts`-Audits: jeder Fund aus der
alten Editor-Ära, jede Entscheidung dazu, und ob das Ergebnis **gelöscht**, **ersetzt**
oder **absichtlich historisch belassen** wurde. Format pro Eintrag: **Fund → Entscheidung
→ Ergebnis**.

Kanonischer Hintergrund: `CLAUDE.md` (UI-zero architecture) und `docs/UI_ZERO.md`. Diese
Datei dokumentiert nur den Audit-Verlauf, sie ersetzt keine der beiden.

Status dieser Datei: **laufend fortgeschrieben**, nicht der letzte Stand des gesamten
Audits — Abschnitte 5 und 6 werden nachgetragen, sobald die dafür laufenden Analysen
zurückkommen (siehe dortige Markierung).

---

## 1. WebGPU-Syntaxfehler

**Fund:** `runtime/world-sandbox-webgpu.mjs` warf bei Zeile ~2163 `Illegal return
statement`. Ursache: die komplette zweite Hälfte der Datei (Zeilen 2160–4228) war ein
exaktes Byte-für-Byte-Duplikat der ersten Hälfte — alle sechs WGSL-Konstanten
(`PARTICLE_COMPUTE_WGSL`, `QUERY_COMPUTE_WGSL`, `WORLD_RENDER_WGSL`,
`PARTICLE_RENDER_WGSL`, `WORLD_SPATIAL_RENDER_WGSL`, `PARTICLE_SPATIAL_RENDER_WGSL`) und
die gesamte `WebGpuWorldSandbox`-Klasse, per `diff` auf Null-Differenz verifiziert.

**Entscheidung:** Datei auf den echten Inhalt (Zeilen 1–2159 + eine schließende Klammer)
kürzen; keine inhaltliche Änderung, reine Duplikat-Entfernung.

**Ergebnis:** **Ersetzt** (Datei auf 2160 Zeilen gekürzt). `node --check` und
`node tools/check-ui-zero.mjs` bestätigen den Fix.

---

## 2. `runtime/shaded-engine.mjs` als "Legacy-UI-als-versteckte-Runtime-ABI" — Hauptbefund

**Fund:** `shaded-engine.mjs` (und mit demselben Muster: `dialogue-engine.mjs`,
`actor-bridge.mjs`, `player-fire.mjs`) fertigten beim Laden ~100 unsichtbare
DOM-Stellvertreter (`ENGINE_STUB_IDS`, `createEngineDOM()`, `HI`-Datei-Inputs) für exakt
die IDs an, die die gelöschte Editor-Oberfläche einst besaß — nur damit ungeschützte
`document.getElementById(...)`-Zugriffe im Engine-Code nicht sofort beim Modul-Laden
werfen. Ein einziges fehlendes Element (z. B. `sliders`, `status`) hätte an dieser Stelle
die gesamte weitere Modul-Auswertung abgebrochen — inklusive der `window.SHADED = {...}`-
Zuweisung selbst, was kaskadierend jedes andere Modul bricht, das `window.SHADED` zur
Ladezeit voraussetzt (`dialogue-engine.mjs`, `actor-bridge.mjs`, `player-fire.mjs`).
Damit war die gelöschte UI keine tote Altlast mehr, sondern eine **lebende, unsichtbare
Abhängigkeit der Engine von genau der Oberfläche, die laut `CLAUDE.md` nicht mehr
existieren soll**.

**Entscheidung (Methodik des Nutzers):** *Nicht* die Engine neu schreiben. Stattdessen
UI-Nerven einzeln durchtrennen: jeden ungeschützten DOM-Zugriff so absichern, dass ein
fehlendes Element zu einem stillen No-op wird statt zu werfen — ohne die zugrundeliegende
fachliche Fähigkeit zu verlieren. Wo ein Button-Handler echte, bisher nur per Klick
erreichbare Logik trug, wird diese Logik in eine benannte Funktion extrahiert und zusätzlich
auf `window.SHADED` exportiert; nur die reine `.onclick=`-Verdrahtung wird bedingt gemacht
oder entfernt. Reines Renderziel (Canvas/Overlay) ist davon ausdrücklich ausgenommen — das
ist Kategorie 3 (siehe Abschnitt 4), keine Präsentations-Absicherung.

**Ergebnis:** **Ersetzt/gehärtet** (kein Löschen der Stub-Maschinerie selbst — das folgt
erst, wenn nichts mehr auf sie angewiesen ist). Betroffene Stellen:

| Datei | Gehärtet | Neu exportiert (falls vorher nur Button) |
|---|---|---|
| `runtime/shaded-engine.mjs` | `spatialActive`-Check, `setStatus`, Sliders-Aufbau + `syncSliders()`, `cb-loop`, `renderStory()`, `playStory()`/`stopStory()`, `setShowcaseCaption()`/`stopShowcase()`, `drop-hint`, `f-scene`/`f-mat`/`f-depth`, alle `btn-*`-Bindungen (`btn-demo`, `btn-create`, `btn-eco-*`, `btn-cinema`/`exit-cinema`, `btn-png`, `btn-rec`+`rec`, `btn-json`, `btn-pointcloud`, `btn-play`, `btn-year`, `btn-timelapse`, `btn-drama`, `btn-showcase`, `btn-add`, `btn-clear-world`, `btn-elements-clear`) | `window.SHADED.world.clearTraces`, `.elements.clear` (vorher Rückweg über `btn-elements-clear.click()` — jetzt direkter Aufruf der Logik), `.view.toggleCinema`, `.capture.png`/`.toggleRecording`/`.exportParamsJson`, `.story.add`/`.year`/`.timelapse`/`.drama` |
| `runtime/dialogue-engine.mjs` | `dialogueShowCurrent()`, `dialogueGoto()`, `dialogueSkip()`, `dialogue-box`-Click-Listener | — (Fähigkeit war bereits vollständig über `window.SHADED.dialogue` erreichbar) |
| `runtime/actor-bridge.mjs` | `setStatus`, `f-actor-sheet`/`f-actor-manifest` | — (`window.SHADED.addActor` bereits vollständig) |
| `runtime/player-fire.mjs` | `setStatus`, `btn-fire` | — (`window.SHADED.fire.ignite` bereits vollständig; Button schaltet nur den optionalen Klick-Modus) |

`node tools/check-ui-zero.mjs` bestand nach jedem einzelnen Schritt, keine Regression.

**Bekannter Nebenfund (nicht behoben, außerhalb des Audit-Scopes):** In
`shaded-engine.mjs`s `window.SHADED`-Exportobjekt existiert der Schlüssel `sound` zweimal
(`sound:{...}` taucht zweimal auf, identischer Wert, zweite Zuweisung gewinnt) — harmlos,
aber es ist eine Altlast, kein UI-Zero-Fund; separat zu bereinigen.

---

## 3. Wirklich tote IDs vs. lebende Gefahrenstellen

Aus der Konsumenten-Kartierung (`ENGINE_STUB_IDS`, 100+ Einträge):

**Fund — bestätigt tote IDs (kein Konsument mehr im Code):** `showcase-kicker`,
`spatial-pipeline`, `spatial-pipeline-buttons`, `spatial-laws`, `spatial-help`.

**Entscheidung:** aus `ENGINE_STUB_IDS` entfernen — sie wurden nur noch für sich selbst
manufaktiert, ohne dass irgendein Codepfad sie las oder schrieb.

**Ergebnis:** **Gelöscht** (5 Einträge aus dem Array entfernt).

**Fund — lebende Gefahrenstelle:** `spatialActive` in `shaded-engine.mjs` las
`document.getElementById('spatial-viewer').hidden` **pro Frame**, ungeschützt.
`runtime/spatial-viewer.js` ist über keinen aktuellen Entry Point erreichbar/geladen.

**Entscheidung:** Optional-Chaining + expliziter `===false`-Vergleich — verhält sich
identisch, solange der Stub existiert (Default `hidden===false`), degradiert aber sicher
auf `false`, sobald der Stub verschwindet, statt zu werfen.

**Ergebnis:** **Ersetzt.**

---

## 4. Zurückgestellt: Render-Ziel-Erwerb (`gl`/`ov`/`stage`/`createEngineDOM()`)

**Fund:** `canvas`(`#gl`)/`ov`(`#ov`)/`stage` werden von `createEngineDOM()` erzeugt, aber
— anders als die reinen Präsentations-Stubs oben — **innerhalb eines echten, in
`index.html` tatsächlich vorhandenen Host-Elements** (`#render-container`). Das ist
funktional kein Phantom-DOM für nicht-existente Editor-Panels, sondern der Aufbau der
eigentlichen Render-Fläche innerhalb eines dafür vorgesehenen Mount-Points. Dennoch: die
Engine greift dafür selbst in den DOM statt die Fläche explizit vom Host übergeben zu
bekommen (`CLAUDE.md`: "Rendering adapters may accept explicit canvas/render targets as
arguments").

**Entscheidung (Nutzer-Methodik, Kategorie 3, bewusst zuletzt):** kein Null-Guard wie bei
den Präsentations-Fundstellen — ein fehlendes Canvas ist kein "no-op"-Fall, sondern bedeutet
"Engine kann nicht rendern". Braucht einen echten Host→Adapter→Engine-Übergabe-Entwurf,
keine mechanische Absicherung. `stage`s Maus-Events (`mousemove`/`mouseleave`) laufen
aktuell effektiv ins Leere, wenn `stage` nur der unsichtbare `display:none`-Stub aus
`ENGINE_STUB_IDS` ist (kein echtes Host-Element für `stage` existiert in `index.html`,
anders als `#render-container`) — das ist ein bereits heute stiller, aber realer
Funktionsverlust (2.5D-Maus-Parallaxe reagiert nicht auf echte Mausbewegung im
Produktivbetrieb), separat vom UI-Zero-Audit selbst zu beheben.

**Ergebnis:** **Absichtlich zurückgestellt** — noch nicht ausgeführt. Braucht vor der
Umsetzung eine bewusste Entwurfsentscheidung (Signatur des Adapters), keine automatische
Fortsetzung dieses Audits.

---

## 5. `.kiro/specs/**`-Inventar

**Fund:** 7 Spec-Verzeichnisse (`round-2-seasons-climate`, `round-3-material-fatigue`,
`round-4-interaction-ecosystem`, `round-5-structural-segmentation`,
`round-8-inspection-lenses`, `round-9-asset-pipeline`,
`round-10-sprite-export-dialogue`), je `requirements.md`/`design.md`/`tasks.md`
(21 Dateien). Keine verwaisten Einzeldateien. Es existiert daneben ein
`.kiro/steering/`-Verzeichnis, das außerhalb dieses Auftrags liegt und nicht geprüft
wurde.

**Entscheidung:** jede Spec einzeln gegen ihren tatsächlichen Inhalt geprüft (nicht nur
den Titel) — spezifiziert sie die gelöschte Editor-Oberfläche selbst, oder fachliche
Engine-/Algorithmus-/Vertrags-Logik, die unabhängig von jeder UI besteht?

**Ergebnis:** **Keine der 7 Specs ist obsolet.** Alle beschreiben UI-unabhängige Engine-
Logik (Schader-Parameter, Materialklassifikation, Spur-/Spieler-/Feuersimulation,
Linsen-/Klang-Primitive, Szene-Projekt-Schema-Tooling, Dialog-Inhaltsformat), die
entweder bereits in `runtime/`/`contracts/` lebt oder von Anfang an UI-unabhängig
entworfen wurde — **absichtlich historisch belassen** mit zwei Nachträgen:

- **`round-9-asset-pipeline`**: `design.md` verweist noch auf das inzwischen gelöschte
  `editor/facade.js` (`SceneEditorFacade.loadProject`) als Konsumenten. Die fachliche
  Fähigkeit ist erhalten (`integrations/scene-runtime-facade.js` übernimmt die Rolle) —
  nur der Doku-Verweis ist veraltet. Keine Code-Änderung nötig, nur eine spätere
  Anmerkung im Spec-Dokument selbst wert.
- **`round-10-sprite-export-dialogue`**: `design.md`/`tasks.md` spezifizieren explizit
  authored DOM (`#dialogue-box`) in `index.html` — das heutige 38-zeilige `index.html`
  hat dieses Element nicht mehr. Das ist derselbe Fund wie in Abschnitt 2
  (`dialogue-engine.mjs`s `dialogue-box`-Zugriffe) und dort bereits behoben (Optional-
  Chaining statt hartem Zugriff); die Spec selbst bleibt als Beschreibung des
  Dialog-**Inhaltsformats** (`content/*.js`-Beat-Arrays) weiterhin gültig und relevant.

---

## 6. `docs/**`-Audit auf aktive Altarchitektur

**Fund:** 60 Markdown-Dateien unter `docs/**` per `grep` gegen ein Muster aus
gelöschten Editor-Signalen (`editor/`, alte DOM-Ids wie `#f-scene`/`#f-mat`,
`.topbar`, `#world-studio`, `#btn-world-sandbox`, sowie "Button"/"Klick"-Sprache)
vorgefiltert; 16 Treffer einzeln gegen den tatsächlichen Inhalt geprüft (nicht nur
den Match selbst).

**Entscheidung/Ergebnis je Datei:**

- **Absichtlich unverändert (bereits korrekt oder falsches Positiv):**
  `docs/ENTRYPOINTS_AND_CONTRACTS.md`, `docs/UI_ZERO.md` — beide sind der kanonische
  UI-Zero-Vertrag selbst, ihre `editor/`-Erwähnungen sind korrekte
  Ist-Zustandsaussagen ("editor/ tree does not exist", "editor/world-sandbox.js is
  gone"). `docs/ORCHESTRATION.md` — Regeltext, der genau das verbietet, was hier
  gefunden wurde ("may not click a hidden button"). `docs/village-box-cultivation-
  experimente.md` — falsches Positiv, beschreibt einen unabhängigen, isoliert
  veröffentlichten Three.js-Viewer (Regel 7), keine Editor-Oberfläche.
- **Absichtlich historisch belassen (Banner ergänzt, Inhalt unangetastet):**
  `docs/research/GOLD_FREEZE.md` (commit-gepinnter Reproduzierbarkeits-Freeze —
  Datei-Hashes für `editor/facade.js` bewusst unverändert, das ist der Zweck des
  Dokuments), `docs/SHADED_BEUTELTIER_ARCHITEKTUR_REFERENZ_ERWEITERT_CHAT_INTEGRIERT.md`
  (datiert vor dem Pivot, warnt sogar selbst explizit davor, Regeln an "historische
  Dateinamen" zu binden — Banner verweist auf `CLAUDE.md` als aktuellen Vertrag bei
  Widerspruch).
- **Ersetzt (Banner +/oder gezielte Korrektur):** `docs/sandbox-sand-water-sources.md`,
  `docs/research/CURRENT_STATE_AUDIT.md`, `docs/research/HALL_TEXTURE_PIPELINE.md`,
  `docs/round-7-ecosystem.md`, `docs/phase-b2-depth-rendering.md` — historischer
  Hinweisblock ergänzt, der die genannten `editor/*`-Dateien/Buttons als entfernt
  markiert und auf die heute gültige `window.SHADED`-API verweist, ohne den
  restlichen (weiterhin gültigen) Inhalt anzutasten. `docs/research/
  spatial-kernel-donor-map.md`, `docs/engine-decomposition-plan.md`,
  `docs/raumrekonstruktion-dykstra-dijkstra.md`, `docs/research/DONOR_LICENSES.md` —
  präzise Einzelkorrektur (falscher Pfad/veraltete Datei durch den heutigen echten
  Pfad ersetzt: `runtime/actor-bridge.mjs`/`dialogue-engine.mjs` statt `editor/`,
  `runtime/shaded-engine.mjs` statt `index.html` für `dykstraProject()`, `editor/`
  aus der Liste der aktiven "deliverable paths" für GPL-Lizenzprüfung entfernt).

**Tally:** 60 Dateien geprüft, 16 mit einem Altarchitektur-Signal, davon 4 falsches-
Positiv/bereits-korrekt, 2 absichtlich-historisch (Banner, kein Inhaltseingriff), 9
ersetzt/korrigiert. `node tools/check-ui-zero.mjs` bleibt nach allen Änderungen grün
(der bestehende `docs.includes('editor/world-sandbox.js')`-Guard-Check in
`tools/verify-no-legacy-ui.mjs` bezieht sich auf `ENTRYPOINTS_AND_CONTRACTS.md`, das
unangetastet blieb).

---

## 7. `.claude/skills/**`-Einzelprüfung

Alle 7 Skills einzeln geprüft (per Hintergrund-Agent kartiert, Funde direkt verifiziert
und angewendet):

- **`shaded-materials/SKILL.md`** — **Ersetzt**: Zeile zu `window.SHADED.intrinsic.setStrength`
  verwies noch auf einen "Regler im Editor"; jetzt als reiner API-Aufruf beschrieben, mit
  Hinweis auf die entfernte Editor-Oberfläche.
- **`shaded-pipeline/SKILL.md`** — **Ersetzt**: einleitende Beschreibung nannte noch die
  alte `index.html`-Struktur (CSS → Sidebar-DOM → JS-Kette); jetzt korrekt auf
  `runtime/shaded-engine.mjs` verweisend, mit Verweis auf die verbleibende, hier
  dokumentierte Engine-DOM-Kopplung.
- **`shaded-visual-verify/SKILL.md`** — **Ersetzt**: expliziter Warnblock ergänzt, dass
  `tools/verify.js` über gelöschte DOM-Elemente fährt (`#f-scene`/`#f-mat`, `.topbar`,
  `#world-studio`) und auf diesem Branch aktuell nicht lauffähig ist (siehe Abschnitt 9).
- **Vier weitere Skills** — **Absichtlich unverändert** (keine Referenz auf die gelöschte
  Editor-Oberfläche gefunden).

---

## 8. Starter/Local-Bridge/Install-Reste

- **`SHADED_WINDOWS.cmd`** — **Ersetzt**: öffnete `.../editor/`; zeigt jetzt auf die
  Repo-Wurzel.
- **`tools/shaded-local-bridge.mjs`** — **Ersetzt**: Root-Pfad-Rewrite auf `/editor/`
  entfernt; Start-Logmeldung entsprechend korrigiert.
- **`WINDOWS.md`** — **Ersetzt**: "Normal benutzen"-Abschnitt beschrieb noch den
  Klickpfad durch die gelöschte Oberfläche; jetzt `window.SHADED`-API-Aufrufe
  (`loadDemo()`, `loadImageFile(file)`, `erstellen()`) mit Verweis auf
  `docs/ENTRYPOINTS_AND_CONTRACTS.md`.
- **`runtime/install.js`** — **Gelöscht**: hing an einem nicht mehr existenten
  `#btn-install`, war repo-weit von nichts mehr referenziert, und sein eigener Kommentar
  verwies explizit auf `/editor/`. Dupliziert zudem die Service-Worker-Registrierung, die
  `index.html` bereits selbst inline erledigt.

---

## 9. GitHub Workflows

Alle vier Workflows einzeln gelesen:

- **`.github/workflows/no-legacy-ui.yml`** — **Ersetzt**: `pull_request`-Trigger entfernt
  (Redundanz — `test.yml` läuft exakt denselben `npm run check` bereits auf jedem PR);
  verbleibender `push`-Trigger liefert weiterhin schnelles Feedback auf einen reinen Push
  vor Existenz eines PRs.
- **`.github/workflows/vercel.yml`**, **`rtx-spatial.yml`** — **Absichtlich unverändert**,
  keine Redundanz/Altlast gefunden.
- **`.github/workflows/test.yml`** — **Ersetzt** (Nachtrag, per Live-CI-Check auf PR #90
  gefunden, nicht Teil der ursprünglichen vier-Workflows-Durchsicht): `npm run check`
  scheiterte auf jedem Push/PR an `tools/test-webgpu-shader-compile.mjs`
  ("browserType.launch: Executable doesn't exist") — die Playwright-Chromium-Binary war
  nie installiert. Der Fix existierte bereits auf dem Geschwister-Branch
  `claude/village-cube-reconstruction-review` (dort divergierten beide Branches, bevor
  er landete); hier nachgezogen: `npx playwright install chromium` vor `npm run check`,
  identischer Schritt/Kommentar wie dort. **`no-legacy-ui.yml`** hatte denselben Bruch
  (fehlte hier ebenfalls) — gleicher Fix ergänzt.

---

## 10. Bekannte offene Brüche (nicht in diesem Audit behoben)

- **`tools/verify.js`** und die übrigen `tools/verify-*.js`-Skripte fahren die Szene über
  gelöschte DOM-Elemente (`#f-scene`/`#f-mat`-File-Inputs, `.topbar`-Clipping,
  `#world-studio`-Panel). Auf diesem Branch aktuell nicht lauffähig, bis auf
  `window.SHADED.loadImageFile(file, isMat)` statt `page.setInputFiles(...)` umgebaut.
  Bewusst niedrige Priorität (blockiert `npm run check`/CI nicht, da nicht Teil von
  `tools/check-ui-zero.mjs`s Testliste).
- **Kategorie 3** (Abschnitt 4) — Render-Ziel-Erwerb, bewusst zurückgestellt.
- Die vom Nutzer vorgeschlagene neue Invariante (kein `document.getElementById`/
  `.onclick`/etc. in Runtime-Kern-Dateien außer einer namentlich erlaubten
  Adapter-Schicht) ist noch nicht als automatisierte Regel umgesetzt — der aktuelle
  Guard (Abschnitt 11) prüft konkrete Rückfälle (gelöschte Dateien/Pfade), nicht das
  allgemeine Muster.

## 11. Guard-Erweiterung auf Meta-Dateien

**Fund:** Der bestehende `tools/verify-no-legacy-ui.mjs` deckte nur `index.html`,
`service-worker.js` und `docs/ENTRYPOINTS_AND_CONTRACTS.md` ab — keine der in diesem
Audit gefundenen und gefixten Starter-/Bridge-/Skill-Dateien (Abschnitt 7, 8) war gegen
einen Rückfall abgesichert.

**Entscheidung:** neues, schlankes `tools/verify-no-legacy-ui-meta.mjs` ergänzt, das
`npm run check` (`tools/check-ui-zero.mjs`) mitausführt: `runtime/install.js` darf nicht
wieder auftauchen; `SHADED_WINDOWS.cmd`/`WINDOWS.md`/`tools/shaded-local-bridge.mjs`
dürfen keinen `/editor/`-Pfad mehr referenzieren; jede `.claude/skills/*/SKILL.md`
ebenso, außer auf einer expliziten Allowlist (aktuell nur
`shaded-visual-verify/SKILL.md`, das den offenen `tools/verify.js`-Bruch bewusst als
bekannte Historie benennt, nicht als aktuelle Anleitung).

**Ergebnis:** **Ersetzt/ergänzt.** `node tools/check-ui-zero.mjs` bleibt grün.
