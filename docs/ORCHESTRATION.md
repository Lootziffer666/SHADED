# SHADED Headless Orchestration Contract

Dieses Dokument beschreibt den echten, shellbaren CLI-Vertrag, über den externe
Systeme (allen voran ANVILs `ShadedCliAdapter`, `core:externaladapters`) SHADEDs
Editor **headless** ansteuern können — analog zu SWIFTs `python main.py render
--json`-Vertrag (siehe SWIFT `docs/ORCHESTRATION.md`, umgesetzt von
`SwiftCliAdapter.kt`).

Es gibt hier **keine zweite Engine und kein zweites Analyse-/Klassifikations-
system**: `tools/orchestrate.js` startet einen echten lokalen Static-Server +
echtes headless Chromium, lädt die echte `editor/index.html` und ruft
ausschließlich `window.SHADED_ORCHESTRATOR` auf — dasselbe Objekt, das
`editor/app.js` aus der echten `SceneEditorFacade` (`editor/facade.js`)
zusammensetzt. Der reale `window.SHADED`-Vertrag (im Engine-Iframe) bleibt
unverändert und unangetastet (CLAUDE.md Invariante 5).

## Aufruf

```bash
node tools/orchestrate.js --project <path-to-request.json> --json
```

Optional: `--port <n>` (Default `8934`) für den lokalen Server, falls der
Default-Port belegt ist.

## Request-Datei (CLI-Eingabe, NICHT identisch mit dem Projekt-Schema)

`contracts/shaded-scene-project.schema.json` beschreibt den **strukturellen
Zustand** einer Szene (Parameter, platzierte Actors, Storyboard) — es kann
keine Bilddaten tragen. Die Request-Datei für `orchestrate.js` ist eine
CLI-facing Hülle, die zusätzlich echte Dateipfade referenziert (relativ zum
Verzeichnis der Request-Datei selbst):

```json
{
  "scene": "path/to/scene.png",
  "material": "path/to/material.png",
  "params": { "fog": 0.4, "dayNight": 0.7 },
  "actors": [
    {
      "sheet": "path/to/actor-sheet.png",
      "manifest": "path/to/actor-manifest.json",
      "x": 0.5, "y": 0.6, "scale": 1, "anim": "walk", "depthLayer": "mid",
      "label": "hero"
    }
  ],
  "storyboard": [ { "name": "Akt 1", "dur": 4, "p": { "fog": 0.4 } } ]
}
```

Nur `scene` ist Pflicht. Ein lauffähiges Beispiel liegt unter
`tools/orchestrate-example-request.json` (nutzt die echten Fixture-Dateien
`file_00000000974871f49fe71f6b456f9579.png` und
`tools/verify-test-actor.{png,json}`):

```bash
node tools/orchestrate.js --project tools/orchestrate-example-request.json --json
```

## Ausgabe

Genau **ein** JSON-Objekt auf stdout.

Erfolg (`status: "ok"`) — der reale Debug-Snapshot aus
`SceneEditorFacade.getDebugSnapshot()` nach `loadProject()`:

```json
{
  "status": "ok",
  "engineLoaded": true,
  "ready": true,
  "actorCount": 1,
  "storyboardSteps": 1,
  "params": { "dayNight": 0.7, "fog": 0.4, "...": "..." },
  "actors": [ { "id": 1, "label": "actor-sheet.png", "x": 0.5, "y": 0.6, "scale": 1, "anim": "walk", "depthLayer": "mid" } ],
  "storyboard": [ { "name": "Akt 1", "dur": 4, "p": { "fog": 0.4 } } ]
}
```

Fehler (`status: "error"`):

```json
{ "status": "error", "code": "missing_input", "message": "Szenenbild nicht gefunden: /abs/path/scene.png" }
```

## Exit-Codes (Konvention aus SwiftCliAdapter.kt übernommen)

| Code | Bedeutung |
|------|-----------|
| `0`  | Erfolg — Szene geladen, Engine `ready`, keine Konsolen-/Seitenfehler. |
| `1`  | Generischer Fehler (Engine-/Seitenfehler während der Orchestrierung, z. B. echte Konsolenfehler — siehe CLAUDE.md-Verifikationskriterium "keine Konsole-/GL-Fehler"). |
| `2`  | Fehlende Eingabe (Request-Datei fehlt/ist kein JSON, oder eine referenzierte Datei — Szene/Material/Actor-Sheet/Manifest — existiert nicht auf der Platte). |

## Was `orchestrate.js` NICHT tut

- Es forkt/dupliziert keinen Shader- oder `analyze()`-Code (Invariante 2 bleibt hart).
- Es erfindet keine Engine-API — jeder Schritt ruft nur bereits existierende,
  reale `SceneEditorFacade`-Methoden (`loadSceneFile`, `create`, `waitUntilReady`,
  `setParams`, `addActorBundle`, direkte Mutation von `window.SHADED.story.board()`)
  über `window.SHADED_ORCHESTRATOR` (`editor/app.js`) auf.
- `exportProject()`/der zurückgegebene Snapshot können die ursprünglichen
  Bild-/Manifest-BYTES nicht erneut emittieren — nur den strukturellen Zustand
  (Parameter, Actor-Positionen/Metadaten, Storyboard). Ein erneutes
  `loadProject()` braucht wieder echte Dateien.

## Verifikation

`node editor/facade.test.js` prüft `loadProject`/`exportProject`/
`addActorBundle`/`getRuntimeStatus`/`getDebugSnapshot` direkt über
`window.SHADED_ORCHESTRATOR` (gleiches Headless-Server+Chromium-Muster wie
`tools/verify-editor.js`). `node tools/orchestrate.js --project
tools/orchestrate-example-request.json --json` ist der End-to-End-Beweis für
den vollständigen CLI-Vertrag (Exit-Code + stdout-JSON).
