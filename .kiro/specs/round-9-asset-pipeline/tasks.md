# Runde 9 – Asset-Pipeline: Tasks

- [x] 1. `tools/cost-format.mjs`: LECF/LFLF/COST-Chunk-Walk (wiederverwendet
      die Runde-8/DECOMPILE-geprüfte Logik), Costume-Header (numAnim,
      Format, Palette), experimenteller Cel-RLE-Decoder mit
      Sicherheitsgrenzen (Dimensionsplausibilität, Iterations-Guard).
- [x] 2. `tools/test-cost-format.mjs`: Encoder/Decoder-Round-Trip auf
      synthetischem Cel (48 Pixel, gemischte Repeat-/Literal-Runs),
      synthetischer LECF/LFLF/COST-Container, synthetische
      RNAM-Raumnamen-Tabelle. 10/10 grün.
- [x] 3. `tools/costume-browser.html`: eigenständiges Offline-Werkzeug
      (Dateiauswahl, Kostüm-Navigation, Animations-Vorschau,
      Label-Eingabe, JSON-Export). Deutlich sichtbarer Hinweis auf
      Offline-Charakter und experimentellen Pixel-Decoder.
- [x] 4. `tools/verify-costume-browser.js`: Playwright-Test gegen ein
      rein synthetisches Fixture (kein reales Spielmaterial) – Kostüm
      gefunden, Vorschau dekodiert, Label übernommen, Export
      pixel-frei. 5/5 grün.
- [x] 5. `tools/build-scene-project.mjs`: Kostüm-Browser-Export +
      Platzierungsliste → gültiges `shaded.scene-project/v1`, bereit
      für das bestehende `SceneEditorFacade.loadProject()`.
- [x] 6. `docs/round-9-asset-boundary.md`: dokumentiert Recherchestand
      (DREAMM-Architektur, ScummVM-Quellcode-Prüfung: keine
      Kostüm-Namenstabelle vorhanden) und warum der Pixel-Decoder als
      experimentell gilt.
- [x] 7. `package.json`/CI: neue Dateien in `check` und
      `.github/workflows/test.yml` aufgenommen. Commit + push.
