# Runde 10 – Sprite-Export & Dialog-Engine: Tasks

- [x] 1. `tools/minizip.mjs` + `tools/test-minizip.mjs`: STORE-ZIP-Writer,
      CRC32 gegen Standard-Testvektor, Round-Trip über Pythons
      `zipfile` als unabhängigem Reader validiert.
- [x] 2. `tools/sprite-exporter.html`: Ressourcendatei + Kostüm-Labels
      laden, pro Label ein Sprite-Sheet (Raster-Packung) + Manifest
      (`mappingVersion:1.4.0`, `frameRects`, eine Animation je Label)
      erzeugen, als ZIP exportieren. Deutlicher Hinweis: Platzhalter-
      Graustufen, kein Netzwerkzugriff.
- [x] 3. `tools/verify-sprite-exporter.js`: Playwright-Test gegen
      synthetisches Fixture, ZIP-Inhalt über Python `zipfile`
      unabhängig geprüft (Namen, Manifest-Schema, PNG-Magic-Bytes).
      5/5 grün.
- [x] 4. Dialog-Engine in `index.html`: `#dialogue-box` DOM+CSS,
      `dialoguePlay/Advance/Skip/Tick/Goto/ShowCurrent`, Trigger-Beats
      (`lens`, `sound-emit`) koppeln an Runde 8 ohne Code-Duplikation,
      `window.SHADED.dialogue`-API. Leertaste-Konflikt mit Runde-4-Dash
      per Bedingung gelöst (nicht per zweitem Listener).
- [x] 5. `dialogueTick` aus der `tickWorld`-Substep-Schleife gelöst,
      stattdessen ein geclamptes Tick pro `frame()` — verhindert
      Sofort-Enthüllung nach realer Pause (von verify-dialogue.js
      gefunden und gefixt, nicht nur behauptet).
- [x] 6. `tools/verify-dialogue.js`: 8 Szenarien (Sichtbarkeit,
      Schreibmaschine, Advance-Semantik, Trigger-Beats, Tastatur ohne
      Dash-Konflikt, sauberes Ende, skip()). 12/12 grün.
- [x] 7. `content/prolog-act1.js`: transkribierter Originaltext
      (SCHWARZBILD bis Ende PFLICHTDIALOG MIT STAN), 64 Beats, NICHT
      automatisch in `index.html` geladen.
- [x] 8. `tools/test-content-lint.mjs`: strukturelle Validierung aller
      `content/*.js`-Dateien (Typen, Pflichtfelder). Grün.
- [x] 9. `package.json`/CI aktualisiert, Commit + Push.
